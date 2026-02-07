const mongoose = require('mongoose');
const moment = require('moment-timezone');

// ===================== MODELS =====================
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

// ===================== AI PROVIDERS =====================
const {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text,
  // DeepSeekText // ← ADD API KEY & UNCOMMENT WHEN READY
} = require('../services/textProviders');

const {
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage
} = require('../services/imageProviders');

// ===================== PROVIDER ARRAYS =====================
const TextProviders = [
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
  // DeepSeekText
];

const ImageProviders = [
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage
];

// ===================== GLOBAL SETTINGS =====================
const TIMEZONE = 'Africa/Nairobi';
const MAX_POSTS_PER_TOPIC = 4;
const MAX_SCHEDULED_POSTS = 10;
let AUTO_GENERATION_ENABLED = true;

// ===================== PROVIDER STATE =====================
const providerState = {};

function initProviderState() {
  [...TextProviders, ...ImageProviders].forEach(p => {
    providerState[p.name] = {
      failures: 0,
      cooldownUntil: null,
      callsToday: 0,
      quota: p.dailyLimit || 99999
    };
  });
}
initProviderState();

// ===================== SAFE LOGGER =====================
async function monitor(topicId, pageId, postId, action, message) {
  try {
    if (!pageId) pageId = 'SYSTEM';
    await AiLog.create({ topicId, pageId, postId, action, message });
  } catch (err) {
    console.error('LOG ERROR:', err.message);
  }
}

// ===================== LOG CLEANUP =====================
async function cleanupLogs() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  await AiLog.deleteMany({
    createdAt: { $lt: cutoff },
    action: { $not: /^AUTO_/ }
  });
}
setInterval(cleanupLogs, 15 * 60 * 1000);

// ===================== ANGLES =====================
const ANGLES = ['memory','observation','curiosity','experience','reflection','surprise','casual'];

// ===================== UTILS =====================
function cleanText(text = '') {
  return text.replace(/[•#*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function shuffleTimes(times) {
  return [...times].sort(() => Math.random() - 0.5);
}

function shiftTime(base, minutes) {
  return moment(base).add(minutes, 'minutes').toDate();
}

// ===================== PROMPT BUILDER =====================
function buildPrompt({ topic, angle }) {
  return `
Write a natural, relatable Facebook post about "${topic}".
Angle: ${angle}

Rules:
- Human tone
- 2–5 sentences
- No advice
- No teaching
- No emojis
- No hashtags
- No lists
`;
}

// ===================== PROVIDER SELECT =====================
function selectProvider(providers) {
  const now = Date.now();
  return providers.find(p => {
    const s = providerState[p.name];
    return !s.cooldownUntil || now > s.cooldownUntil;
  }) || null;
}

// ===================== TEXT GENERATION =====================
async function generateText(topic, angle, pageId) {
  for (const provider of TextProviders) {
    try {
      const text = await provider.generate(buildPrompt({ topic, angle }));
      providerState[provider.name].callsToday++;
      if (text) return cleanText(text);
    } catch {
      providerState[provider.name].failures++;
      providerState[provider.name].cooldownUntil =
        Date.now() + providerState[provider.name].failures * 60000;
    }
  }
  await monitor(null, pageId, null, 'TEXT_FAILED', 'All providers failed');
  return null;
}

// ===================== IMAGE GENERATION =====================
async function generateImage(topic, pageId) {
  for (const provider of ImageProviders) {
    try {
      const url = await provider.generate(`Realistic photo about ${topic}`);
      if (url) return url;
    } catch {}
  }
  await monitor(null, pageId, null, 'IMAGE_FAILED', 'All image providers failed');
  return null;
}

// ===================== MANUAL GENERATOR =====================
async function generatePostsForTopic(topicId) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return [];

  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);

  let created = [];
  let angleIndex = 0;

  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      const angle = ANGLES[angleIndex++ % ANGLES.length];
      const time = topic.times[i % topic.times.length];
      const scheduled = moment.tz(
        `${day.format('YYYY-MM-DD')} ${time}`,
        TIMEZONE
      ).toDate();

      const exists = await AiScheduledPost.findOne({
        topicId,
        scheduledTime: scheduled
      });
      if (exists) continue;

      const text = await generateText(topic.topicName, angle, topic.pageId);
      if (!text) continue;

      const mediaUrl = topic.includeMedia ? await generateImage(topic.topicName, topic.pageId) : null;

      const post = await AiScheduledPost.create({
        topicId,
        pageId: topic.pageId,
        text,
        mediaUrl,
        scheduledTime: scheduled,
        status: 'PENDING',
        meta: { angle }
      });

      created.push(post);
      await monitor(topicId, topic.pageId, post._id, 'POST_CREATED', 'Manual post created');
    }
  }
  return created;
}

// ===================== AUTO GENERATION CORE =====================
async function autoGenerate() {
  if (!AUTO_GENERATION_ENABLED) return;

  const topics = await AiTopic.find();
  for (const topic of topics) {

    // --- Respect max scheduled posts per page ---
    const totalPending = await AiScheduledPost.countDocuments({ 
      status: 'PENDING', 
      pageId: topic.pageId 
    });
    if (totalPending >= MAX_SCHEDULED_POSTS) continue;

    // --- Check max posts per topic ---
    const generated = await AiScheduledPost.countDocuments({
      topicId: topic._id,
      'meta.auto': true
    });
    if (generated >= MAX_POSTS_PER_TOPIC) {
      await AiTopic.deleteOne({ _id: topic._id }); // optional: mark completed instead
      await AiLog.deleteMany({ topicId: topic._id });
      continue;
    }

    // --- Skip if topic already has a pending post ---
    const pending = await AiScheduledPost.findOne({
      topicId: topic._id,
      status: 'PENDING'
    });
    if (pending) continue;

    // --- Pick an unused angle ---
    const usedAngles = await AiScheduledPost.find({
      topicId: topic._id,
      'meta.auto': true
    }).distinct('meta.angle');

    const angle = ANGLES.find(a => !usedAngles.includes(a));
    if (!angle) continue;

    // --- Pick a time avoiding collisions ---
    const times = shuffleTimes(topic.times);
    let scheduled = null;

    for (const t of times) {
      const base = moment.tz(
        `${moment().format('YYYY-MM-DD')} ${t}`,
        TIMEZONE
      ).toDate();

      let attempts = 0;
      let slot = base;
      while (attempts < 5) {
        const collision = await AiScheduledPost.findOne({
          pageId: topic.pageId,
          scheduledTime: slot
        });
        if (!collision) break;
        slot = shiftTime(base, (Math.random() > 0.5 ? 10 : -10) * (attempts + 1));
        attempts++;
      }
      if (attempts < 5) {
        scheduled = slot;
        break;
      }
    }
    if (!scheduled) continue;

    // --- Generate text & media ---
    const text = await generateText(topic.topicName, angle, topic.pageId);
    if (!text) continue;
    const mediaUrl = topic.includeMedia ? await generateImage(topic.topicName, topic.pageId) : null;

    const post = await AiScheduledPost.create({
      topicId: topic._id,
      pageId: topic.pageId,
      text,
      mediaUrl,
      scheduledTime: scheduled,
      status: 'PENDING',
      meta: { angle, auto: true }
    });

    await monitor(topic._id, topic.pageId, post._id, 'AUTO_POST_CREATED', angle);

    // Only generate one post per run
    break;
  }
}

// ===================== AUTO GENERATION CRON =====================
setInterval(autoGenerate, 60 * 1000);

// ===================== ENABLE / DISABLE =====================
function enableAutoGeneration() { AUTO_GENERATION_ENABLED = true; }
function disableAutoGeneration() { AUTO_GENERATION_ENABLED = false; }

// ===================== EXPORTS =====================
module.exports = {
  generatePostsForTopic,
  enableAutoGeneration,
  disableAutoGeneration,
  createAiLog: monitor
};
