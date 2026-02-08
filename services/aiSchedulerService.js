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
  // Only delete MANUAL logs (non-auto)
  await AiLog.deleteMany({
    createdAt: { $lt: cutoff },
    action: { $not: /^AUTO_/ } // preserve AUTO logs
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

      // --- Check if post already exists (scheduled or logged) ---
      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      const existsLogged = await AiLog.findOne({ topicId, action: /POST_CREATED|AUTO_POST_CREATED/, message: new RegExp(time) });
      if (existsScheduled || existsLogged) continue;

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
//===================== AUTO GENERATION CORE =====================//
async function autoGenerate() {
  if (!AUTO_GENERATION_ENABLED) return;

  const now = moment.tz(TIMEZONE);
  const topics = await AiTopic.find();

  for (const topic of topics) {
    try {
      /* ---------------- 1. AUTO DELETE — TOPIC EXPIRED ---------------- */
      if (moment(topic.endDate).isBefore(now)) {
        await AiLog.deleteMany({ topicId: topic._id });
        await AiTopic.deleteOne({ _id: topic._id });
        await monitor(topic._id, topic.pageId, null, 'TOPIC_EXPIRED', 'Topic expired and deleted');
        continue;
      }

      /* ---------------- 2. AUTO DELETE — MAX POSTS REACHED -------------- */
      const logCount = await AiLog.countDocuments({
        topicId: topic._id,
        action: 'AUTO_POST_CREATED'
      });

      const scheduledCount = await AiScheduledPost.countDocuments({
        topicId: topic._id,
        'meta.auto': true
      });

      if ((logCount + scheduledCount) >= MAX_POSTS_PER_TOPIC) {
        await AiLog.deleteMany({ topicId: topic._id });
        await AiTopic.deleteOne({ _id: topic._id });
        await monitor(topic._id, topic.pageId, null, 'TOPIC_MAX_POSTS', 'Topic max posts reached');
        continue;
      }

      /* ---------------- 3. ENFORCE ONE PENDING POST PER TOPIC ----------- */
      const pending = await AiScheduledPost.findOne({
        topicId: topic._id,
        status: 'PENDING'
      });
      if (pending) continue;

      /* ---------------- 4. ANGLE SELECTION ----------------------------- */
      const usedAngles = await AiLog.distinct('message', {
        topicId: topic._id,
        action: 'AUTO_POST_CREATED'
      });

      const angle = ANGLES.find(a => !usedAngles.includes(a));
      if (!angle) {
        await AiLog.deleteMany({ topicId: topic._id });
        await AiTopic.deleteOne({ _id: topic._id });
        await monitor(topic._id, topic.pageId, null, 'TOPIC_ANGLES_EXHAUSTED', 'All angles used');
        continue;
      }

      /* ---------------- 5. SLOT DISCOVERY ------------------------------ */
      const startDate = moment.tz(topic.startDate, TIMEZONE);
      const endDate = moment.tz(topic.endDate, TIMEZONE);

      let scheduledTime = null;
      let day = moment.max(now.clone().startOf('day'), startDate.clone().startOf('day'));

      while (day.isSameOrBefore(endDate)) {
        const times = shuffleTimes(topic.times);

        for (const t of times) {
          const slot = moment.tz(`${day.format('YYYY-MM-DD')} ${t}`, TIMEZONE);

          if (slot.isSameOrBefore(now)) continue;
          if (slot.isBefore(startDate) || slot.isAfter(endDate)) continue;

          const collision = await AiScheduledPost.findOne({
            pageId: topic.pageId,
            scheduledTime: slot.toDate()
          });

          if (!collision) {
            scheduledTime = slot.toDate();
            break;
          }
        }

        if (scheduledTime) break;
        day.add(1, 'day');
      }

      if (!scheduledTime) continue;

      /* ---------------- 6. GENERATE CONTENT ---------------------------- */
      const text = await generateText(topic.topicName, angle, topic.pageId);
      if (!text) continue;

      const mediaUrl = topic.includeMedia
        ? await generateImage(topic.topicName, topic.pageId)
        : null;

      /* ---------------- 7. CREATE SCHEDULED POST ----------------------- */
      const post = await AiScheduledPost.create({
        topicId: topic._id,
        pageId: topic.pageId,
        text,
        mediaUrl,
        scheduledTime,
        status: 'PENDING',
        meta: { angle, auto: true }
      });

      await monitor(topic._id, topic.pageId, post._id, 'AUTO_POST_CREATED', angle);

      // One post per scheduler run
      break;

    } catch (err) {
      console.error(`Auto-generation failed for topic ${topic._id}:`, err.message);
      await monitor(topic._id, topic.pageId, null, 'AUTO_GEN_ERROR', err.message);
    }
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
 
