const mongoose = require('mongoose');

// ===================== MODELS =====================
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

// ===================== AI PROVIDERS =====================
const { GrokText, OpenAIText, CohereText, ClaudeText, AI21Text } = require('../services/textProviders');
const { StabilityImage, DALLEImage, LeonardoImage } = require('../services/imageProviders');

// Unified arrays
const TextProviders = [GrokText, OpenAIText, CohereText, ClaudeText, AI21Text];
const ImageProviders = [StabilityImage, DALLEImage, LeonardoImage];

// ===================== SAFE LOGGER =====================
async function monitor(topicId, pageId, postId, action, message) {
  try {
    if (!pageId) return console.warn(`⚠️ LOG SKIPPED: Missing pageId → ${action}`);
    await AiLog.create({ topicId: topicId || null, pageId, postId: postId || null, action, message });
    console.log(`🧾 LOG SAVED → ${action}`);
  } catch (err) {
    console.error('❌ LOG ERROR:', err.message);
  }
}

// ===================== LOG CLEANUP =====================
async function cleanupLogs() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
  await AiLog.deleteMany({ createdAt: { $lt: cutoff } });
  console.log('🗑 Old logs cleaned');
}
setInterval(cleanupLogs, 15 * 60 * 1000); // every 15 min

// ===================== CONTENT ANGLES =====================
const ANGLES = ['memory','observation','curiosity','experience','reflection','surprise','casual'];

// ===================== CLEAN TEXT =====================
function cleanText(text = '') {
  return text.replace(/[•#*_`]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ===================== PROMPT BUILDER =====================
function buildPrompt({ topic, angle, isTrending, isCritical }) {
  let base = '';
  if (isCritical) base = `Write a calm, factual Facebook post about a very recent event related to ${topic}. No opinions. No emotion. No advice.`;
  else if (isTrending) base = `Write a natural Facebook post reacting to something people are currently talking about related to ${topic}.`;
  else {
    const map = {
      memory: `Write a Facebook post recalling a memory related to ${topic}.`,
      observation: `Write a Facebook post sharing a simple observation about ${topic}.`,
      curiosity: `Write a Facebook post expressing curiosity about ${topic}.`,
      experience: `Write a Facebook post describing a personal experience related to ${topic}.`,
      reflection: `Write a quiet reflection about ${topic}.`,
      surprise: `Write a Facebook post reacting with mild surprise about ${topic}.`,
      casual: `Write a casual Facebook post about ${topic}.`
    };
    base = map[angle] || map.casual;
  }

  return `${base}

Rules:
- Write like a real human
- No advice
- No teaching
- No lists
- No emojis
- No hashtags
- No AI tone
`;
}

// ===================== GENERATE TEXT =====================
async function generateText(topic, angle, options = {}) {
  for (const provider of TextProviders) {
    try {
      const text = await provider.generate(buildPrompt({ topic, angle, ...options }));
      if (text) return cleanText(text);
    } catch (err) {
      console.warn(`⚠️ ${provider.name} failed: ${err.message}`);
      continue;
    }
  }
  return null;
}

// ===================== GENERATE IMAGE =====================
async function generateImage(topic) {
  for (const provider of ImageProviders) {
    try {
      const url = await provider.generate(`A realistic everyday photo related to ${topic}. No text.`);
      if (url) return url;
    } catch (err) {
      console.warn(`⚠️ ${provider.name} failed: ${err.message}`);
      continue;
    }
  }
  return null;
}

// ===================== CORE GENERATOR =====================
async function generatePostsForTopic(topicId, options = {}) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');
  const page = await Page.findOne({ pageId: topic.pageId });
  if (!page) throw new Error('Page not found');

  if (!Array.isArray(topic.times) || topic.times.length === 0) throw new Error('Invalid posting times');
  if (!topic.postsPerDay || topic.postsPerDay < 1) throw new Error('postsPerDay must be > 0');

  const { postsPerDay, times, startDate, endDate, repeatType, includeMedia } = topic;
  const { isTrending=false, isCritical=false, immediate=false } = options;

  const start = immediate ? new Date() : new Date(startDate);
  const end = immediate ? new Date() : new Date(endDate);

  let angleIndex = 0, createdPosts = [], safety=0;

  await monitor(topic._id, topic.pageId, null, 'GENERATION_START', `Started generating posts for "${topic.topicName}"`);

  for (let day = new Date(start); day <= end; ) {
    if (++safety > 500) break;

    for (let i=0; i<postsPerDay; i++) {
      const angle = ANGLES[angleIndex % ANGLES.length];
      angleIndex++;

      await monitor(topic._id, topic.pageId, null, 'TEXT_REQUEST', `Generating post using angle "${angle}"`);
      const text = await generateText(topic.topicName, angle, { isTrending, isCritical });
      if (!text) continue;

      let mediaUrl = null;
      if (!isCritical && includeMedia && Math.random()>0.4) mediaUrl = await generateImage(topic.topicName);

      // schedule
      const time = times[i % times.length] || '09:00';
      const [h,m] = time.split(':');
      const scheduledTime = new Date(day);
      scheduledTime.setHours(Number(h), Number(m), 0, 0);

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
      await monitor(topic._id, topic.pageId, post._id, 'POST_CREATED', `Post scheduled for ${scheduledTime.toLocaleString()}`);
      await new Promise(r=>setTimeout(r, 200)); // rate limit
    }

    if (repeatType==='weekly') day.setDate(day.getDate()+7);
    else if (repeatType==='monthly') day.setMonth(day.getMonth()+1);
    else day.setDate(day.getDate()+1);
  }

  await monitor(topic._id, topic.pageId, null, 'GENERATION_COMPLETE', `Generated ${createdPosts.length} posts.`);
  return createdPosts;
}

// ===================== DELETE POSTS =====================
async function deleteTopicPosts(topicId) {
  const posts = await AiScheduledPost.find({ topicId });
  for (const post of posts) await monitor(topicId, post.pageId, post._id, 'POST_DELETED', 'Post removed');
  await AiScheduledPost.deleteMany({ topicId });
}

// ===================== EXPORTS =====================
module.exports = { generatePostsForTopic, deleteTopicPosts, createAiLog: monitor };

       
