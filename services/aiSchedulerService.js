const mongoose = require('mongoose');

// ===================== MODELS =====================
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

// ===================== AI PROVIDERS =====================
const {
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AI21Text,
  CloudflareText
} = require('../services/textProviders');

const {
  StabilityImage,
  DALLEImage,
  LeonardoImage,
  CloudflareImage
} = require('../services/imageProviders');

// ===================== CONSTANTS =====================
const SYSTEM_PAGE_ID = 'SYSTEM';

// ===================== PROVIDER LISTS =====================
const TextProviders = [
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AI21Text
];

const ImageProviders = [
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage
];

// ===================== PROVIDER STATE =====================
const providerState = {};
let lastQuotaReset = new Date().toDateString();

function initProviderState() {
  [...TextProviders, ...ImageProviders].forEach(p => {
    const name = p.name || 'UNKNOWN_PROVIDER';
    providerState[name] = {
      name,
      failures: 0,
      lastFailure: null,
      cooldownUntil: null,
      disabled: false,
      callsToday: 0,
      quota: p.dailyLimit || 99999
    };
  });
}
initProviderState();

// ===================== DAILY RESET =====================
function resetDailyQuotasIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastQuotaReset) {
    Object.values(providerState).forEach(p => {
      p.callsToday = 0;
      p.failures = 0;
      p.cooldownUntil = null;
      p.disabled = false;
    });
    lastQuotaReset = today;
    monitor(null, SYSTEM_PAGE_ID, null, 'QUOTA_RESET', 'Daily provider quotas reset');
  }
}

// ===================== SAFE LOGGER =====================
async function monitor(topicId, pageId, postId, action, message) {
  try {
    await AiLog.create({
      topicId: topicId || null,
      pageId: pageId || SYSTEM_PAGE_ID,
      postId: postId || null,
      action,
      message
    });
    console.log(`🧾 ${action}: ${message}`);
  } catch (err) {
    console.error('❌ LOG ERROR:', err.message);
  }
}

// ===================== LOG CLEANUP =====================
async function cleanupLogs() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  await AiLog.deleteMany({ createdAt: { $lt: cutoff } });
}
setInterval(cleanupLogs, 15 * 60 * 1000);

// ===================== CONTENT ANGLES =====================
const ANGLES = [
  'memory',
  'observation',
  'curiosity',
  'experience',
  'reflection',
  'surprise',
  'casual'
];

// ===================== TEXT CLEANER =====================
function cleanText(text = '') {
  return text
    .replace(/[•#*_`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ===================== PROMPT BUILDER =====================
function buildPrompt({ topic, angle, isTrending, isCritical }) {
  if (isCritical) {
    return `Write a calm, factual Facebook post about a very recent event related to ${topic}. No opinions. No emotion.`;
  }

  if (isTrending) {
    return `Write a natural Facebook post reacting to something people are currently talking about related to ${topic}.`;
  }

  const map = {
    memory: `Write a Facebook post recalling a memory related to ${topic}.`,
    observation: `Write a Facebook post sharing a simple observation about ${topic}.`,
    curiosity: `Write a Facebook post expressing curiosity about ${topic}.`,
    experience: `Write a Facebook post describing a personal experience related to ${topic}.`,
    reflection: `Write a quiet reflection about ${topic}.`,
    surprise: `Write a Facebook post reacting with mild surprise about ${topic}.`,
    casual: `Write a casual Facebook post about ${topic}.`
  };

  return `${map[angle] || map.casual}

Rules:
- Write like a real human
- No advice
- No teaching
- No lists
- No emojis
- No hashtags
`;
}

// ===================== PROVIDER SELECTION =====================
function selectProvider(providers, excluded = new Set()) {
  resetDailyQuotasIfNeeded();

  for (const p of providers) {
    const state = providerState[p.name];
    if (!state || excluded.has(p.name)) continue;

    const now = new Date();
    if (state.disabled) continue;
    if (state.cooldownUntil && now < state.cooldownUntil) continue;
    if (state.callsToday >= state.quota) {
      state.disabled = true;
      monitor(null, SYSTEM_PAGE_ID, null, 'PROVIDER_DISABLED', `${p.name} quota exhausted`);
      continue;
    }
    return p;
  }
  return null;
}

// ===================== GENERATE TEXT =====================
async function generateText(topic, angle, options = {}) {
  const tried = new Set();
  let lastError = null;

  while (tried.size < TextProviders.length) {
    const provider = selectProvider(TextProviders, tried);
    if (!provider) break;

    tried.add(provider.name);
    const state = providerState[provider.name];

    await monitor(null, SYSTEM_PAGE_ID, null, 'TEXT_REQUEST', `Using ${provider.name}`);

    try {
      const text = await provider.generate(
        buildPrompt({ topic, angle, ...options })
      );

      state.callsToday++;
      state.failures = 0;

      if (!text) throw new Error('Empty response');
      return cleanText(text);

    } catch (err) {
      lastError = err;
      state.failures++;
      state.lastFailure = new Date();
      state.cooldownUntil = new Date(
        Date.now() + Math.min(state.failures * 60000, 10 * 60000)
      );

      await monitor(
        null,
        SYSTEM_PAGE_ID,
        null,
        'TEXT_FAILED',
        `${provider.name} failed: ${err.message}`
      );
    }
  }

  await monitor(
    null,
    SYSTEM_PAGE_ID,
    null,
    'GENERATION_ABORTED',
    `All text providers failed: ${lastError?.message}`
  );
  return null;
}

// ===================== GENERATE IMAGE =====================
async function generateImage(topic) {
  const tried = new Set();
  let lastError = null;

  while (tried.size < ImageProviders.length) {
    const provider = selectProvider(ImageProviders, tried);
    if (!provider) break;

    tried.add(provider.name);
    const state = providerState[provider.name];

    await monitor(null, SYSTEM_PAGE_ID, null, 'IMAGE_REQUEST', `Using ${provider.name}`);

    try {
      const url = await provider.generate(
        `A realistic everyday photo related to ${topic}. No text.`
      );

      state.callsToday++;
      state.failures = 0;

      if (!url) throw new Error('Empty response');
      return url;

    } catch (err) {
      lastError = err;
      state.failures++;
      state.lastFailure = new Date();
      state.cooldownUntil = new Date(
        Date.now() + Math.min(state.failures * 60000, 10 * 60000)
      );

      await monitor(
        null,
        SYSTEM_PAGE_ID,
        null,
        'IMAGE_FAILED',
        `${provider.name} failed: ${err.message}`
      );
    }
  }

  await monitor(
    null,
    SYSTEM_PAGE_ID,
    null,
    'GENERATION_ABORTED',
    `All image providers failed: ${lastError?.message}`
  );
  return null;
}

// ===================== CORE GENERATOR =====================
async function generatePostsForTopic(topicId, options = {}) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');

  const page = await Page.findOne({ pageId: topic.pageId });
  if (!page) throw new Error('Page not found');

  if (!Array.isArray(topic.times) || !topic.times.length) {
    throw new Error('Invalid posting times');
  }

  if (!topic.postsPerDay || topic.postsPerDay < 1) {
    throw new Error('postsPerDay must be > 0');
  }

  const {
    postsPerDay,
    times,
    startDate,
    endDate,
    repeatType,
    includeMedia
  } = topic;

  const { isTrending = false, isCritical = false, immediate = false } = options;

  const start = immediate ? new Date() : new Date(startDate);
  const end = immediate ? new Date() : new Date(endDate);

  let angleIndex = 0;
  let createdPosts = [];
  let safety = 0;

  await monitor(topic._id, topic.pageId, null, 'GENERATION_START', `Generating "${topic.topicName}"`);

  for (let day = new Date(start); day <= end; ) {
    if (++safety > 500) break;

    for (let i = 0; i < postsPerDay; i++) {
      const angle = ANGLES[angleIndex++ % ANGLES.length];

      const text = await generateText(topic.topicName, angle, { isTrending, isCritical });
      if (!text) continue;

      let mediaUrl = null;
      if (!isCritical && includeMedia && Math.random() > 0.4) {
        mediaUrl = await generateImage(topic.topicName);
      }

      const [h, m] = (times[i % times.length] || '09:00').split(':');
      const scheduledTime = new Date(day);
      scheduledTime.setHours(+h, +m, 0, 0);

      const post = await AiScheduledPost.create({
        topicId: topic._id,
        pageId: topic.pageId,
        text,
        mediaUrl,
        scheduledTime,
        status: 'PENDING',
        retryCount: 0,
        meta: { angle, trending: isTrending, critical: isCritical }
      });

      createdPosts.push(post);
      await monitor(topic._id, topic.pageId, post._id, 'POST_CREATED', scheduledTime.toISOString());
      await new Promise(r => setTimeout(r, 200));
    }

    if (repeatType === 'weekly') day.setDate(day.getDate() + 7);
    else if (repeatType === 'monthly') day.setMonth(day.getMonth() + 1);
    else day.setDate(day.getDate() + 1);
  }

  await monitor(topic._id, topic.pageId, null, 'GENERATION_COMPLETE', `Generated ${createdPosts.length} posts`);
  return createdPosts;
}

// ===================== DELETE POSTS =====================
async function deleteTopicPosts(topicId) {
  const posts = await AiScheduledPost.find({ topicId });
  for (const post of posts) {
    await monitor(topicId, post.pageId, post._id, 'POST_DELETED', 'Post removed');
  }
  await AiScheduledPost.deleteMany({ topicId });
}

// ===================== EXPORTS =====================
module.exports = {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog: monitor
};
