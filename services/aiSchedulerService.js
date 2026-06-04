// services/aiSchedulerService.js
// Fully integrated with pageIntelligence (pi: blocks) and qualityAssurance (qa: blocks)

const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Models
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');
const AutoTopicMeta = mongoose.model('AutoTopicMeta', new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTopic', required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
}));

// Services
const { renderPost } = require('./renderPost');
const { generateCinematicReel } = require('./media/cinematicEngine');
const qualityAssurance = require('./qualityAssurance');
const pageIntelligence = require('./pageIntelligence');

// AI Providers
const {
  CloudflareText,
  GroqText,
  GeminiText,
  OpenAIText,
  generateSmart
} = require('./textProviders');

const {
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage
} = require('./imageProviders');

// Provider arrays
const TextProviders = [GeminiText, CloudflareText, GroqText, OpenAIText];
const ImageProviders = [CloudflareImage, StabilityImage, LeonardoImage, DALLEImage, SmartPexelsImage];

// Global settings
const TIMEZONE = 'Africa/Nairobi';
const MAX_POSTS_PER_TOPIC = 5;
const MAX_SCHEDULED_POSTS = 10;
const MIN_ACTIVE_TOPICS = 3;
const MAX_ACTIVE_TOPICS = 6;
const TOPIC_LIFETIME_DAYS = 5;
const POSTS_PER_DAY_AUTO = 1;
const INCLUDE_MEDIA_AUTO = false;
const AVOID_SIMILAR_DAYS = 7;
const MAX_START_DATE_DAYS = 21;
const MAX_SAME_START_DAY = 2;
let GLOBAL_AUTO_TOPIC_CREATION_ENABLED = true;

const DEFAULT_ANGLES = ['insight', 'example', 'warning', 'opinion', 'takeaway'];
const GLOBAL_ANGLES = ['memory', 'observation', 'curiosity', 'experience', 'reflection', 'surprise', 'casual'];

// Provider state
const providerState = {};
function initProviderState() {
  [...TextProviders, ...ImageProviders].forEach(p => {
    providerState[p.name] = { failures: 0, cooldownUntil: null, callsToday: 0, quota: p.dailyLimit || 99999 };
  });
}
initProviderState();

// Logger
async function monitor(topicId, pageId, postId, action, message) {
  try {
    if (!pageId) pageId = 'SYSTEM';
    await AiLog.create({ topicId, pageId, postId, action, message });
  } catch (err) { console.error('LOG ERROR:', err.message); }
}

// Cleanup
async function cleanupLogs() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  await AiLog.deleteMany({ createdAt: { $lt: cutoff }, action: { $not: /^AUTO_/ } });
}
setInterval(cleanupLogs, 15 * 60 * 1000);

function cleanText(text = '') {
  return text.replace(/[•#*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function shuffleTimes(times) {
  return [...times].sort(() => Math.random() - 0.5);
}

function ensureFiveAngles(angles) {
  if (!angles || angles.length === 0) return [...DEFAULT_ANGLES];
  const result = [...angles];
  while (result.length < 5) result.push(DEFAULT_ANGLES[result.length % DEFAULT_ANGLES.length]);
  return result.slice(0, 5);
}

// Extract critical rules from extraNotes
function extractCriticalRules(extraNotes) {
  if (!extraNotes) return '';
  const match = extraNotes.match(/Critical rules:\s*\n([\s\S]*?)(?=\n\s*\n|\n\[|$)/i);
  if (!match) return '';
  let rules = match[1].trim();
  rules = rules.replace(/^\[.*$/gm, '').trim();
  return rules;
}

// ========== ENHANCED PROMPT BUILDER with PI integration ==========
async function buildPrompt({ topic, angle, pageId, textSeed, qualityFix = null, dna = null, topHeadline = null, contentType = null }) {
  const profile = await PageProfile.findOne({ pageId });
  let extraNotes = profile?.extraNotes || '';
  let criticalRules = extractCriticalRules(extraNotes);
  if (!criticalRules) {
    criticalRules = `CRITICAL RULES (DEFAULT):
- Maximum 3 sentences total.
- Never start with a question ("Have you ever...", "Are you ready...").
- Never use "we'll", "let's", "I'll explain", "in this post".
- No advice, no teaching, no "how to" language.
- First sentence must be a bold fact, alert, or strong opinion.
- Keep language punchy and conversational.`;
  }

  const seedText = textSeed ? ` Reference previous text: "${textSeed}"` : '';
  const qualityFixText = qualityFix ? `\n\nIMPORTANT FIXES NEEDED: ${qualityFix}\nRewrite the post fixing these issues while keeping the same core message.` : '';

  // Incorporate PI data
  let piGuidance = '';
  if (dna) {
    piGuidance = `\nPage Personality:
- Authority: ${dna.authority}/100 (higher = more expert)
- Humor: ${dna.humor}/100 (higher = funnier)
- Seriousness: ${dna.seriousness}/100
- Optimism: ${dna.optimism}/100
- Emotionality: ${dna.emotionality}/100
- Voice style: ${dna.voiceStyle}
- Primary topics: ${dna.primaryTopics.join(', ')}
`;
  }
  if (topHeadline) {
    piGuidance += `\nRelevant recent news: "${topHeadline}". You may optionally react to it if it fits the angle.\n`;
  }
  if (contentType) {
    piGuidance += `\nSuggested content type: ${contentType} (e.g., warning, analysis, myth‑busting). Write accordingly.\n`;
  }

  return `
Write a natural, relatable Facebook post about "${topic}".
Angle: ${angle}
Tone: ${profile?.tone || 'friendly'}
Style: ${profile?.writingStyle || 'conversational'}
Voice: ${profile?.voice || 'first-person plural'}
Audience: ${profile?.audienceTone || 'casual'}, interests: ${profile?.audienceInterest?.join(', ') || 'general audience'}

${piGuidance}
${criticalRules}
${seedText}
${qualityFixText}

The rules above are MANDATORY and override any other instructions. Follow them exactly.
`;
}

// ========== TEXT GENERATION with PI context ==========
async function generateText(topic, angle, pageId, textSeed = null, qualityFix = null, dna = null, topHeadline = null, contentType = null) {
  try {
    const prompt = await buildPrompt({ topic, angle, pageId, textSeed, qualityFix, dna, topHeadline, contentType });
    const text = await generateSmart(prompt);
    if (!text) {
      await monitor(null, pageId, null, 'TEXT_FAILED', 'Empty response');
      return null;
    }
    return cleanText(text);
  } catch (err) {
    await monitor(null, pageId, null, 'TEXT_FAILED', err.message);
    return null;
  }
}

// ========== QA‑ENHANCED POST GENERATION with PI ==========
async function generateAndValidatePost(topic, angle, pageId, pageProfile, recentPosts = [], dna = null, topHeadline = null, contentType = null, attempt = 0) {
  const maxAttempts = 3;
  const rawText = await generateText(topic, angle, pageId, null, null, dna, topHeadline, contentType);
  if (!rawText) return null;

  const qaResult = await qualityAssurance.processContent({
    topic: topic,
    post: rawText,
    pageProfile: pageProfile,
    pageId: pageId,
    recentPosts: recentPosts,
    generateFn: async (prompt) => await generateSmart(prompt),
    maxRegenerations: 2,
    dna: dna
  });

  if (qaResult.pass) {
    await monitor(null, pageId, null, 'QA_PASSED', `Score: ${qaResult.score}`);
    return {
      text: qaResult.finalPost,
      score: qaResult.score,
      breakdown: qaResult.breakdown
    };
  }

  if (attempt < maxAttempts) {
    await monitor(null, pageId, null, 'QA_FAILED_RETRY', `Attempt ${attempt + 1}: ${qaResult.reason}`);
    const modifiedAngle = `${angle} (different perspective)`;
    return await generateAndValidatePost(topic, modifiedAngle, pageId, pageProfile, recentPosts, dna, topHeadline, contentType, attempt + 1);
  }

  await monitor(null, pageId, null, 'QA_FAILED_FINAL', qaResult.reason);
  return null;
}

// ========== IMAGE GENERATION ==========
async function generateImage(topic, pageId, textSeed = null) {
  const seedText = textSeed ? ` with context: "${textSeed}"` : '';
  for (const provider of ImageProviders) {
    try {
      const url = await provider.generate(`Realistic photo about ${topic}${seedText}`);
      if (url) return url;
    } catch {}
  }
  await monitor(null, pageId, null, 'IMAGE_FAILED', 'All image providers failed');
  return null;
}

// ========== CUSTOM ANGLES ==========
async function generateCustomAngles(topicName, pageId) {
  const profile = await PageProfile.findOne({ pageId });
  const audienceInterest = profile?.audienceInterest?.join(', ') || 'general audience';
  const prompt = `Generate exactly 5 unique "angles" for Facebook posts about the topic: "${topicName}". The audience is interested in ${audienceInterest}.
Each angle should be a very short phrase (1-3 words) that suggests a different perspective or hook. 
Examples for a tech topic: "Threat alert", "Defense win", "Attacker tactic", "Tool update", "Takeaway".
For a finance topic: "Shocking stat", "Savings hack", "Expert view", "My mistake", "Daily win".
Return only the 5 angles as a comma-separated list, no extra text.`;
  for (const provider of TextProviders) {
    try {
      const response = await provider.generate(prompt);
      if (response) {
        let angles = response.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        angles = angles.slice(0, 5);
        if (angles.length === 5) return angles;
        if (angles.length > 0) return ensureFiveAngles(angles);
      }
    } catch (err) { console.error(`Custom angle generation failed for ${provider.name}:`, err.message); }
  }
  return [...DEFAULT_ANGLES];
}

// ========== TOPIC NAME GENERATION ==========
async function generateShortTopicName(audienceInterest, rawHeadline = null) {
  let prompt;
  if (rawHeadline) {
    prompt = `Convert this news headline into a very short Facebook post topic (5-10 words maximum) about ${audienceInterest}. Return only the topic phrase, no extra text. Headline: "${rawHeadline}"`;
  } else {
    prompt = `Generate a very short Facebook post topic (5-10 words maximum) about ${audienceInterest}. Return only the topic phrase, no extra text. The topic should be timely and interesting.`;
  }
  for (const provider of TextProviders) {
    try {
      const topicName = await provider.generate(prompt);
      if (topicName) {
        const cleaned = cleanText(topicName);
        const words = cleaned.split(/\s+/);
        if (words.length <= 10) return cleaned;
        return words.slice(0, 10).join(' ');
      }
    } catch (err) { console.error(`Topic name generation failed for ${provider.name}:`, err.message); }
  }
  return null;
}

// ========== TRENDING HEADLINE ==========
async function fetchTrendingHeadline(keyword) {
  const gnewsKey = process.env.GNEWS_API_KEY;
  if (gnewsKey) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=ke&max=1&token=${gnewsKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) return data.articles[0].title;
    } catch (err) { console.error('GNews fetch failed:', err.message); }
  }
  const newsApiKey = process.env.NEWS_API_KEY;
  if (newsApiKey) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&sortBy=popularity&pageSize=1&apiKey=${newsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) return data.articles[0].title;
    } catch (err) { console.error('NewsAPI fetch failed:', err.message); }
  }
  return null;
}

// ========== SIMILAR TOPIC AVOIDANCE ==========
async function isTopicTooSimilar(newTopicName, pageId) {
  const cutoff = moment().subtract(AVOID_SIMILAR_DAYS, 'days').toDate();
  const existingTopics = await AiTopic.find({ pageId, $or: [{ endDate: { $gte: new Date() } }, { endDate: { $gte: cutoff } }] }).lean();
  const newWords = new Set(newTopicName.toLowerCase().split(/\s+/));
  for (const topic of existingTopics) {
    const oldWords = new Set(topic.topicName.toLowerCase().split(/\s+/));
    const intersection = [...newWords].filter(w => oldWords.has(w)).length;
    const similarity = intersection / Math.min(newWords.size, oldWords.size);
    if (similarity > 0.5) return true;
  }
  return false;
}

// ========== START DATE & TIME HELPERS ==========
async function getIntelligentStartDate(pageId) {
  const today = moment().tz(TIMEZONE).startOf('day');
  const maxDate = moment().tz(TIMEZONE).add(MAX_START_DATE_DAYS, 'days').startOf('day');
  const existingTopics = await AiTopic.find({ pageId }).lean();
  const startCounts = {};
  for (const topic of existingTopics) {
    const dayKey = moment(topic.startDate).tz(TIMEZONE).format('YYYY-MM-DD');
    startCounts[dayKey] = (startCounts[dayKey] || 0) + 1;
  }
  for (let d = today.clone().add(1, 'day'); d.isSameOrBefore(maxDate); d.add(1, 'day')) {
    const dayKey = d.format('YYYY-MM-DD');
    if ((startCounts[dayKey] || 0) < MAX_SAME_START_DAY) return d.toDate();
  }
  let minCount = Infinity;
  let bestDate = null;
  for (let d = today.clone().add(1, 'day'); d.isSameOrBefore(maxDate); d.add(1, 'day')) {
    const dayKey = d.format('YYYY-MM-DD');
    const count = startCounts[dayKey] || 0;
    if (count < minCount) { minCount = count; bestDate = d.toDate(); }
  }
  return bestDate;
}

async function getNonCollidingTime(pageId, targetDate) {
  const targetMoment = moment.tz(targetDate, TIMEZONE).startOf('day');
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const hour = Math.floor(Math.random() * (23 - 6 + 1)) + 6;
    const minute = Math.floor(Math.random() * 60);
    const slot = targetMoment.clone().set({ hour, minute, second: 0 });
    if (slot.isBefore(moment().tz(TIMEZONE))) continue;
    const existing = await AiScheduledPost.findOne({ pageId, scheduledTime: slot.toDate() });
    if (!existing) return slot.format('HH:mm');
  }
  return '12:00';
}

// ========== BRANDED IMAGE ==========
async function createBrandedImage(topicId, pageId, rawMediaUrl, postText) {
  try {
    const [topic, pageProfile, page] = await Promise.all([
      AiTopic.findById(topicId).lean(),
      PageProfile.findOne({ pageId }).lean(),
      Page.findOne({ pageId }).select('name').lean()
    ]);
    if (!topic) return rawMediaUrl;
    if (topic.includeVideo === true) {
      const cinematicProfile = {
        pageName: page?.name || 'Page',
        brand: pageProfile?.extraNotes?.match(/brand=(\w+)/)?.[1] || 'modern',
        mood: pageProfile?.extraNotes?.match(/mood=(\w+)/)?.[1] || 'neutral',
        audienceInterest: pageProfile?.audienceInterest || [],
      };
      const videoUrl = await generateCinematicReel({ title: topic.topicName, text: postText, pageProfile: cinematicProfile, pageName: page?.name || 'Page', format: 'short' });
      return videoUrl || null;
    }
    if (topic.includeMedia === true) {
      const finalImage = await renderPost({ title: topic.topicName, text: postText, rawImage: rawMediaUrl, pageProfile: pageProfile || {}, pageName: page?.name || 'Page', logoUrl: null });
      return finalImage || rawMediaUrl;
    }
    return null;
  } catch (err) { console.error('createBrandedImage failed:', err.message); await monitor(topicId, pageId, null, 'BRANDED_MEDIA_FAILED', err.message); return null; }
}

// ========== CREATE MANUAL TOPIC WITH QA ==========
async function createManualTopicWithQA(pageId, topicName, startDate, endDate, times, postsPerDay, includeMedia, includeVideo) {
  const topicScore = qualityAssurance.scoreTopic(topicName, pageId);
  if (topicScore < 20) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic score too low (${topicScore}): ${topicName}`);
    return { success: false, reason: `Topic score too low (${topicScore}). Choose a more specific or trending topic.` };
  }
  if (await isTopicTooSimilar(topicName, pageId)) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Similar topic exists: ${topicName}`);
    return { success: false, reason: `Similar topic already exists. Choose a different topic.` };
  }
  const customAngles = await generateCustomAngles(topicName, pageId);
  const newTopic = await AiTopic.create({
    topicName, pageId, startDate: new Date(startDate), endDate: new Date(endDate),
    times: Array.isArray(times) ? times : [times], postsPerDay: postsPerDay || 1,
    includeMedia: includeMedia || false, includeVideo: includeVideo || false, customAngles: customAngles || null, manualTopic: true
  });
  await monitor(newTopic._id, pageId, null, 'MANUAL_TOPIC_CREATED', `Topic: "${topicName}", Angles: ${customAngles?.join(', ') || 'defaults'}, Score: ${topicScore}`);
  return { success: true, topic: newTopic, topicScore, customAngles };
}

// ========== GENERATE POSTS FOR MANUAL TOPIC (existing) ==========
async function generatePostsForManualTopic(topicId, generateImmediately = false) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return { success: false, reason: 'Topic not found' };
  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' }).sort({ scheduledTime: -1 }).limit(10).select('text').lean();
  const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);
  let anglesToUse = (topic.customAngles && topic.customAngles.length) ? topic.customAngles : await generateCustomAngles(topic.topicName, topic.pageId);
  if (!anglesToUse) anglesToUse = [...DEFAULT_ANGLES];
  while (anglesToUse.length < 5) anglesToUse.push(DEFAULT_ANGLES[anglesToUse.length % DEFAULT_ANGLES.length]);
  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  let created = [];
  let angleIndex = 0;
  const totalPostsNeeded = Math.ceil(end.diff(start, 'days') + 1) * topic.postsPerDay;
  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      if (angleIndex >= totalPostsNeeded) break;
      const angle = anglesToUse[angleIndex % anglesToUse.length];
      const time = topic.times[i % topic.times.length];
      const scheduled = moment.tz(`${day.format('YYYY-MM-DD')} ${time}`, TIMEZONE).toDate();
      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      if (existsScheduled) continue;
      const context = await pageIntelligence.enrichContext(topic.pageId, pageProfile, topic.topicName, recentPostTexts);
      const validatedPost = await generateAndValidatePost(topic.topicName, angle, topic.pageId, pageProfile, recentPostTexts, context.dna, context.topHeadline, context.contentType);
      if (!validatedPost) { await monitor(topicId, topic.pageId, null, 'MANUAL_POST_FAILED', `Angle: ${angle} - Failed QA`); continue; }
      let rawMediaUrl = null;
      if (topic.includeMedia) rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
      let finalMediaUrl = null;
      if (rawMediaUrl || topic.includeVideo) finalMediaUrl = await createBrandedImage(topicId, topic.pageId, rawMediaUrl, validatedPost.text);
      const post = await AiScheduledPost.create({
        topicId, pageId: topic.pageId, text: validatedPost.text, mediaUrl: finalMediaUrl,
        scheduledTime: scheduled, status: generateImmediately ? 'PENDING' : 'PENDING',
        meta: { angle, qaScore: validatedPost.score, qaBreakdown: validatedPost.breakdown, generatedManually: true }
      });
      created.push(post);
      recentPostTexts.unshift(validatedPost.text);
      recentPostTexts = recentPostTexts.slice(0, 10);
      await monitor(topicId, topic.pageId, post._id, 'MANUAL_POST_CREATED', `Angle: ${angle}, QA Score: ${validatedPost.score}, Scheduled: ${scheduled}`);
      angleIndex++;
    }
  }
  return { success: true, created };
}

// ========== GENERATE POSTS FOR TOPIC (public, used by route) ==========
async function generatePostsForTopic(topicId, options = {}) {
  const { immediate = false } = options;
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');
  // Use the existing manual generator (works for both manual and auto topics)
  const result = await generatePostsForManualTopic(topicId, immediate);
  return result.created || [];
}

// ========== DELETE TOPIC POSTS ==========
async function deleteTopicPosts(topicId) {
  await AiScheduledPost.deleteMany({ topicId });
  await monitor(null, null, null, 'TOPIC_POSTS_DELETED', `Topic ${topicId} posts deleted`);
}

// ========== CREATE AI LOG (public wrapper) ==========
async function createAiLog(pageId, postId, action, message) {
  await monitor(null, pageId, postId, action, message);
}

// ========== NEW AUTO-GENERATION LOGIC (1 pending post per topic) ==========

// Generate the next missing post for a given topic (used by cron)
async function generateNextPostForTopic(topic) {
  // Check total posts limit
  const totalPosts = await AiScheduledPost.countDocuments({ topicId: topic._id });
  if (totalPosts >= MAX_POSTS_PER_TOPIC) {
    await monitor(topic._id, topic.pageId, null, 'AUTO_SKIP_MAX_POSTS', `Topic has reached max ${MAX_POSTS_PER_TOPIC} posts`);
    return null;
  }

  // Get all existing scheduled times for this topic
  const existingPosts = await AiScheduledPost.find({ topicId: topic._id }).select('scheduledTime');
  const existingTimesSet = new Set(existingPosts.map(p => p.scheduledTime.getTime()));

  // Determine the next slot to generate (earliest future slot not yet used)
  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  const now = moment().tz(TIMEZONE);

  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      const timeStr = topic.times[i % topic.times.length];
      const scheduledMoment = moment.tz(`${day.format('YYYY-MM-DD')} ${timeStr}`, TIMEZONE);
      if (scheduledMoment.isBefore(now)) continue; // skip past slots
      const slotKey = scheduledMoment.toDate().getTime();
      if (!existingTimesSet.has(slotKey)) {
        // Found the next missing slot
        const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
        const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' })
          .sort({ scheduledTime: -1 }).limit(10).select('text').lean();
        const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);
        const anglesToUse = (topic.customAngles && topic.customAngles.length) ? topic.customAngles : await generateCustomAngles(topic.topicName, topic.pageId);
        const angle = anglesToUse[totalPosts % anglesToUse.length]; // cycle angles

        const context = await pageIntelligence.enrichContext(topic.pageId, pageProfile, topic.topicName, recentPostTexts);
        const validatedPost = await generateAndValidatePost(
          topic.topicName, angle, topic.pageId, pageProfile, recentPostTexts,
          context.dna, context.topHeadline, context.contentType
        );
        if (!validatedPost) {
          await monitor(topic._id, topic.pageId, null, 'AUTO_POST_FAILED', `Angle: ${angle} - QA failed`);
          return null;
        }
        let rawMediaUrl = null;
        if (topic.includeMedia) rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
        let finalMediaUrl = null;
        if (rawMediaUrl || topic.includeVideo) finalMediaUrl = await createBrandedImage(topic._id, topic.pageId, rawMediaUrl, validatedPost.text);
        const post = await AiScheduledPost.create({
          topicId: topic._id,
          pageId: topic.pageId,
          text: validatedPost.text,
          mediaUrl: finalMediaUrl,
          scheduledTime: scheduledMoment.toDate(),
          status: 'PENDING',
          meta: { angle, qaScore: validatedPost.score, qaBreakdown: validatedPost.breakdown, generatedByAutoCron: true }
        });
        await monitor(topic._id, topic.pageId, post._id, 'AUTO_POST_GENERATED', `Next post for topic "${topic.topicName}" at ${scheduledMoment.format()}`);
        return post;
      }
    }
  }
  await monitor(topic._id, topic.pageId, null, 'AUTO_NO_SLOT', 'No future slot available for this topic');
  return null;
}

// Ensure a page has enough active topics and each auto topic has ≤1 pending post
async function ensureActiveTopicsForPage(pageId) {
  const now = new Date();
  // Get all active topics (both manual and auto)
  const activeTopics = await AiTopic.find({
    pageId,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  // For each active topic, enforce "at most 1 pending post"
  for (const topic of activeTopics) {
    const pendingCount = await AiScheduledPost.countDocuments({
      topicId: topic._id,
      status: 'PENDING'
    });
    if (pendingCount === 0) {
      await generateNextPostForTopic(topic);
    }
  }

  // Check if we need more auto topics (only if global flag is on)
  if (!GLOBAL_AUTO_TOPIC_CREATION_ENABLED) return;
  const autoTopics = activeTopics.filter(t => !t.manualTopic);
  if (autoTopics.length >= MIN_ACTIVE_TOPICS) return;

  // Create a new auto topic (with only one post initially)
  const profile = await PageProfile.findOne({ pageId });
  const audienceInterest = profile?.audienceInterest?.join(', ') || 'general audience';
  let trendingHeadline = null;
  try {
    trendingHeadline = await fetchTrendingHeadline(audienceInterest.split(',')[0]);
  } catch (e) {}
  let topicName = await generateShortTopicName(audienceInterest, trendingHeadline);
  if (!topicName) topicName = `Interesting update about ${audienceInterest}`;
  if (await isTopicTooSimilar(topicName, pageId)) {
    topicName = `${topicName} (fresh take)`;
  }
  const startDate = await getIntelligentStartDate(pageId);
  const endDate = moment.tz(startDate, TIMEZONE).add(TOPIC_LIFETIME_DAYS, 'days').toDate();
  const times = [];
  for (let i = 0; i < POSTS_PER_DAY_AUTO; i++) {
    const time = await getNonCollidingTime(pageId, startDate);
    times.push(time);
  }
  const customAngles = await generateCustomAngles(topicName, pageId);
  const newTopic = await AiTopic.create({
    topicName,
    pageId,
    startDate,
    endDate,
    times,
    postsPerDay: POSTS_PER_DAY_AUTO,
    includeMedia: INCLUDE_MEDIA_AUTO,
    includeVideo: false,
    customAngles,
    manualTopic: false
  });
  await monitor(newTopic._id, pageId, null, 'AUTO_TOPIC_CREATED', `Topic: "${topicName}", Angles: ${customAngles.join(', ')}`);
  // Generate first post for this new topic
  await generateNextPostForTopic(newTopic);
}

// ========== EXPORTS (preserving all original exports) ==========
module.exports = {
  // Existing exports (inferred from original)
  renderPost,
  generateCinematicReel,
  qualityAssurance,
  pageIntelligence,
  CloudflareText,
  GroqText,
  GeminiText,
  OpenAIText,
  generateSmart,
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage,
  TextProviders,
  ImageProviders,
  // Existing functions
  generateText,
  generateAndValidatePost,
  generateImage,
  generateCustomAngles,
  generateShortTopicName,
  fetchTrendingHeadline,
  isTopicTooSimilar,
  getIntelligentStartDate,
  getNonCollidingTime,
  createBrandedImage,
  createManualTopicWithQA,
  generatePostsForManualTopic,
  generatePostsForTopic,     // used by route /topic/:topicId/generate-now
  deleteTopicPosts,
  createAiLog,
  // NEW exports for auto-generation cron
  ensureActiveTopicsForPage,
  generateNextPostForTopic
};
