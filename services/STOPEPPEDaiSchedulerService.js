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

// ========== NEW: Topic Engine for discovery ==========
const { discoverAndRank } = require('./topicEngine');

// Provider arrays
const TextProviders = [GeminiText, CloudflareText, GroqText, OpenAIText];
const ImageProviders = [CloudflareImage, StabilityImage, LeonardoImage, DALLEImage, SmartPexelsImage];

// Global settings (overridden by DB)
const TIMEZONE = 'Africa/Nairobi';
const MAX_SCHEDULED_POSTS = 10;
const MIN_ACTIVE_TOPICS = 3;
const TOPIC_LIFETIME_DAYS = 5;
const POSTS_PER_DAY_AUTO = 1;
const INCLUDE_MEDIA_AUTO = false;
const AVOID_SIMILAR_DAYS = 7;
const MAX_START_DATE_DAYS = 21;
const MAX_SAME_START_DAY = 2;

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

// ================================================================
// ========== NEW: GLOBAL SETTINGS (persistent) ===================
// ================================================================
const GlobalSettings = mongoose.model('GlobalSettings', new mongoose.Schema({
  maxActiveTopics: { type: Number, default: 6 },
  autoTopicCreationEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}));

let globalSettingsCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getGlobalSettings() {
  if (globalSettingsCache && (Date.now() - cacheTime < CACHE_TTL)) {
    return globalSettingsCache;
  }
  let settings = await GlobalSettings.findOne();
  if (!settings) {
    settings = await GlobalSettings.create({});
  }
  globalSettingsCache = settings;
  cacheTime = Date.now();
  return settings;
}

async function updateGlobalSettings(updates) {
  const settings = await GlobalSettings.findOneAndUpdate(
    {},
    { $set: updates, updatedAt: new Date() },
    { new: true, upsert: true }
  );
  globalSettingsCache = settings;
  cacheTime = Date.now();
  return settings;
}

// Logger
async function monitor(topicId, pageId, postId, action, message) {
  try {
    if (!pageId) pageId = 'SYSTEM';
    await AiLog.create({ topicId, pageId, postId, action, message });
  } catch (err) { console.error('LOG ERROR:', err.message); }
}

// Cleanup old logs (keeps AUTO_ logs for longer)
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
  if (!extraNotes || typeof extraNotes !== 'string') return '';
  let cleaned = extraNotes.replace(/pi:\s*\{[\s\S]*?\}/gi, '');
  cleaned = cleaned.replace(/qa:\s*\{[\s\S]*?\}/gi, '');
  const match = cleaned.match(/CRITICAL RULES:\s*\n([\s\S]*?)(?=\n\s*\n|\n\[|$)/i);
  if (!match) return '';
  let rules = match[1].trim();
  rules = rules.replace(/\[.*?\]/g, '').trim();
  return rules;
}

// ========== IMPROVED PROMPT BUILDER with PI/QA integration ==========
async function buildPrompt({ topic, angle, pageId, textSeed, qualityFix = null, dna = null, topHeadline = null, contentType = null }) {
  const profile = await PageProfile.findOne({ pageId });
  let extraNotes = profile?.extraNotes || '';

  let piOverrides = {}, qaOverrides = {};
  try {
    piOverrides = pageIntelligence.parsePageIntelligenceOverrides(extraNotes);
    qaOverrides = qualityAssurance.parsePageOverrides(extraNotes);
  } catch (e) {
    console.warn('Override parsing failed, using defaults', e.message);
  }

  let criticalRules = extractCriticalRules(extraNotes);
  if (!criticalRules) {
    criticalRules = `- Maximum 2 sentences total.
- Never start with a question ("Have you ever...", "Are you ready...").
- Never use "we'll", "let's", "I'll explain", "in this post".
- No advice, no teaching, no "how to" language.
- First sentence must be a bold fact, alert, or strong opinion.
- Keep language punchy and conversational.`;
  }

  const avoidPhrases = Array.isArray(qaOverrides.avoidPhrases) ? qaOverrides.avoidPhrases : [
    "Did you know", "Have you ever", "Are you ready", "I've been thinking",
    "Sometimes I", "Here is the rewritten post", "I was thinking", "Today I felt",
    "In today's world", "Let's explore", "It's important to"
  ];

  const primaryTopics = piOverrides.primaryTopics || profile?.audienceInterest || [];
  const voiceStyle = piOverrides.voiceStyle || profile?.voice || 'conversational';
  const authority = piOverrides.authority || 50;
  const humor = piOverrides.humor || 20;
  const emotionality = piOverrides.emotionality || 50;

  const seedText = textSeed ? ` Reference previous text: "${textSeed}"` : '';
  const qualityFixText = qualityFix ? `\n\nIMPORTANT FIXES NEEDED: ${qualityFix}\nRewrite the post fixing these issues while keeping the same core message.` : '';

  let piGuidance = '';
  if (dna) {
    piGuidance = `\nPage Personality:
- Authority: ${dna.authority}/100
- Humor: ${dna.humor}/100
- Seriousness: ${dna.seriousness}/100
- Optimism: ${dna.optimism}/100
- Emotionality: ${dna.emotionality}/100
- Voice style: ${dna.voiceStyle}
- Primary topics: ${dna.primaryTopics.join(', ')}
`;
  } else {
    piGuidance = `\nPage Personality:
- Authority: ${authority}/100
- Humor: ${humor}/100
- Emotionality: ${emotionality}/100
- Voice style: ${voiceStyle}
- Primary topics: ${primaryTopics.join(', ')}
`;
  }
  if (topHeadline) {
    piGuidance += `\nRelevant recent news: "${topHeadline}". You may optionally react to it if it fits the angle.\n`;
  }
  if (contentType) {
    piGuidance += `\nSuggested content type: ${contentType} (e.g., warning, analysis, myth‑busting). Write accordingly.\n`;
  }

  return `
YOU ARE A SOCIAL MEDIA POST WRITER. FOLLOW THESE RULES EXACTLY – THEY OVERRIDE ALL OTHER INSTRUCTIONS.

CRITICAL RULES:
${criticalRules}

ADDITIONAL HARD CONSTRAINTS (MUST FOLLOW):
- Write ONLY about the topic: "${topic}". Do NOT mention unrelated topics (e.g., general stress, weather, politics).
- NEVER start the post with any of these phrases: ${avoidPhrases.join(', ')}.
- Maximum sentences: 2 (unless CRITICAL RULES specify otherwise).
- Do NOT include meta‑commentary like "Here is a post", "I've rewritten", "Here is the rewritten post".
- Stay within the page's primary topics: ${primaryTopics.join(', ')}.

TOPIC: "${topic}"
ANGLE: ${angle}
Tone: ${profile?.tone || 'friendly'}
Writing Style: ${profile?.writingStyle || 'conversational'}
Voice: ${voiceStyle}
Audience interests: ${primaryTopics.join(', ')}

${piGuidance}
${seedText}
${qualityFixText}

Return ONLY the post text, with no extra quotes, explanations, or markdown.
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

// ================================================================
// ========== FIXED: STRICT CUSTOM ANGLES (HARD SANITIZATION) ======
// ================================================================
async function generateCustomAngles(topicName, pageId, singleInterest = null) {
  const profile = await PageProfile.findOne({ pageId });
  const audienceInterest = profile?.audienceInterest || [];
  // Force strict focus on the single interest if provided
  const primaryTopics = singleInterest ? [singleInterest] : audienceInterest;

  const recentTopics = await AiTopic.find({ pageId, manualTopic: true })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
  const recentAngles = recentTopics.flatMap(t => t.customAngles || []).slice(0, 9);

  // ULTRA-STRICT PROMPT with explicit formatting rules
  const prompt = `Generate exactly 5 unique "angles" for Facebook posts about the topic: "${topicName}".
Strict focus only on: ${primaryTopics.join(', ')}.
Avoid these recently used angles if possible: ${recentAngles.join(', ') || 'none'}.

CRITICAL OUTPUT FORMATTING RULES (DO NOT BREAK):
- Return ONLY a plain comma-separated list.
- NO numbers (1., 2.), NO bullet points (* or -), NO extra sentences.
- Each angle must be exactly 1 to 3 words long.
- Example of correct output: "Record breaker, Transfer shock, Derby fire, Legend's last dance, Youth revolution"

Your response:`;

  for (const provider of TextProviders) {
    try {
      const response = await provider.generate(prompt);
      if (response) {
        // HARD SANITIZATION: Remove numbers, bullets, quotes, and extra whitespace
        let cleaned = response
          .replace(/^[\d\s\.\-\*]+/gm, '') // Remove leading numbers/bullets per line
          .replace(/["']/g, '')            // Remove quotes
          .replace(/\n/g, ',')             // Turn newlines into commas
          .trim();

        let angles = cleaned.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        
        // STRICT VALIDATION: Ensure each angle is max 4 words (to allow 1-3 words)
        angles = angles.filter(s => s.split(/\s+/).length <= 4);
        
        // Take first 5, or pad with defaults
        if (angles.length >= 5) {
          return angles.slice(0, 5);
        }
        if (angles.length >= 3) {
          // If we got 3 or 4, pad the rest with defaults to make 5
          const padded = [...angles];
          while (padded.length < 5) {
            padded.push(DEFAULT_ANGLES[padded.length % DEFAULT_ANGLES.length]);
          }
          return padded;
        }
        // If fewer than 3, log and try next provider
        console.warn(`Invalid angle format from ${provider.name}: "${response}"`);
        await monitor(null, pageId, null, 'ANGLE_FORMAT_FAILED', `Provider ${provider.name} returned: ${response}`);
      }
    } catch (err) { 
      console.error(`Custom angle generation failed for ${provider.name}:`, err.message); 
    }
  }
  // ULTIMATE FALLBACK: If all providers fail to format correctly, return hardcoded defaults
  return [...DEFAULT_ANGLES];
}

// ================================================================
// ========== FIXED: STRICT TOPIC NAME (1 INTEREST FOCUS) =========
// ================================================================
async function generateShortTopicName(singleInterest, rawHeadline = null, pageId = null) {
  let prompt;
  if (rawHeadline) {
    prompt = `Convert this news headline into a very short Facebook post topic (5-10 words). The topic MUST be strictly about "${singleInterest}". Ignore any other subjects. Return only the topic phrase. Headline: "${rawHeadline}"`;
  } else {
    prompt = `Generate a very short, timely Facebook post topic (5-10 words) strictly about "${singleInterest}". Do NOT mention other topics. Return only the topic phrase.`;
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
  // Hard fallback: manually construct a topic from the single interest
  return `Latest update on ${singleInterest}`;
}

// ================================================================
// ========== FIXED: NEWS FETCH WITH SPECIFIC INTEREST ============
// ================================================================
async function fetchTrendingHeadline(pageId, specificInterest = null) {
  const profile = await PageProfile.findOne({ pageId });
  const interests = profile?.audienceInterest || [];
  if (interests.length === 0) return null;

  // Use the passed interest, otherwise pick random
  const keyword = specificInterest || interests[Math.floor(Math.random() * interests.length)];

  const gnewsKey = process.env.GNEWS_API_KEY;
  if (gnewsKey) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=ke&max=1&token=${gnewsKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        const title = data.articles[0].title;
        const lowerTitle = title.toLowerCase();
        // Strictly check if this specific interest is in the title
        if (lowerTitle.includes(keyword.toLowerCase())) return title;
      }
    } catch (err) { console.error('GNews fetch failed:', err.message); }
  }

  const newsApiKey = process.env.NEWS_API_KEY;
  if (newsApiKey) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&sortBy=popularity&pageSize=1&apiKey=${newsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        const title = data.articles[0].title;
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes(keyword.toLowerCase())) return title;
      }
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

// ========== HELPER: EVALUATE TOPIC QUALITY ==========
async function evaluateTopicQuality(topicName, pageId) {
  const profile = await PageProfile.findOne({ pageId });
  const topicScore = qualityAssurance.scoreTopic(topicName, pageId);
  const pageFit = qualityAssurance.pageFitScore(topicName, profile, null, {});
  return { topicScore, pageFit, combined: (topicScore + pageFit) / 2 };
}

// ================================================================
// ========== NEW: Count used angles via logs ====================
// ================================================================
async function getUsedAnglesCount(topicId) {
  return await AiLog.countDocuments({
    topicId: topicId,
    action: { $in: ['AUTO_POST_GENERATED', 'MANUAL_POST_CREATED'] }
  });
}

// ================================================================
// ========== NEW: Expire & delete topic if complete =============
// ================================================================
async function expireTopicIfComplete(topic) {
  const usedCount = await getUsedAnglesCount(topic._id);
  const totalAngles = (topic.customAngles && topic.customAngles.length) ? topic.customAngles.length : 5;
  if (usedCount < totalAngles) return; // not complete

  // Set endDate to now (expire)
  await AiTopic.findByIdAndUpdate(topic._id, { endDate: new Date() });

  // Check for pending posts
  const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
  if (pendingCount === 0) {
    // Safe to delete topic and logs
    await AiTopic.findByIdAndDelete(topic._id);
    await AiLog.deleteMany({ topicId: topic._id });
    await monitor(null, topic.pageId, null, 'TOPIC_EXPIRED_DELETED',
      `Topic "${topic.topicName}" – all angles used, no pending posts. Deleted.`);
  } else {
    await monitor(topic._id, topic.pageId, null, 'TOPIC_EXPIRED_PENDING',
      `Topic "${topic.topicName}" – all angles used, but ${pendingCount} pending posts remain. Will delete after they are gone.`);
  }
}

// ========== ENHANCED MANUAL TOPIC CREATION ==========
async function createManualTopicWithQA(pageId, topicName, startDate, endDate, times, postsPerDay, includeMedia, includeVideo) {
  // --- ENFORCE MAX ACTIVE TOPICS (GLOBAL SETTING) ---
  const settings = await getGlobalSettings();
  const maxActive = settings.maxActiveTopics;
  const activeTopicsCount = await AiTopic.countDocuments({
    pageId,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  });
  if (activeTopicsCount >= maxActive) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED_MAX_ACTIVE', 
      `Already have ${activeTopicsCount} active topics (max ${maxActive})`);
    return { success: false, reason: `Maximum active topics (${maxActive}) reached. Please end some topics first.` };
  }

  const profile = await PageProfile.findOne({ pageId });
  const { topicScore, pageFit } = await evaluateTopicQuality(topicName, pageId);
  const minTopicScore = 20;
  const minPageFit = 30;

  if (topicScore < minTopicScore) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic score too low (${topicScore})`);
    return { success: false, reason: `Topic score too low (${topicScore}). Choose a more specific or trending topic.` };
  }
  if (pageFit < minPageFit) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic relevance low (${pageFit})`);
    return { success: false, reason: `Topic not relevant enough to page interests (${pageFit}/100).` };
  }

  if (await isTopicTooSimilar(topicName, pageId)) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Similar topic exists: ${topicName}`);
    return { success: false, reason: `Similar topic already exists. Choose a different topic.` };
  }

  const customAngles = await generateCustomAngles(topicName, pageId); // Manual uses full interest list
  const newTopic = await AiTopic.create({
    topicName, pageId, startDate: new Date(startDate), endDate: new Date(endDate),
    times: Array.isArray(times) ? times : [times], postsPerDay: postsPerDay || 1,
    includeMedia: includeMedia || false, includeVideo: includeVideo || false,
    customAngles: customAngles || null, manualTopic: true
  });
  await monitor(newTopic._id, pageId, null, 'MANUAL_TOPIC_CREATED',
    `Topic: "${topicName}", Angles: ${customAngles?.join(', ') || 'defaults'}, Scores: topic=${topicScore}, fit=${pageFit}`);
  return { success: true, topic: newTopic, topicScore, pageFit, customAngles };
}

async function generatePostsForManualTopic(topicId, generateImmediately = false) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return { success: false, reason: 'Topic not found' };

  // Determine how many posts already generated (via logs)
  const usedCount = await getUsedAnglesCount(topic._id);
  let anglesToUse = (topic.customAngles && topic.customAngles.length) ? topic.customAngles : await generateCustomAngles(topic.topicName, topic.pageId);
  if (!anglesToUse) anglesToUse = [...DEFAULT_ANGLES];
  while (anglesToUse.length < 5) anglesToUse.push(DEFAULT_ANGLES[anglesToUse.length % DEFAULT_ANGLES.length]);
  const totalAngles = anglesToUse.length;
  if (usedCount >= totalAngles) {
    await expireTopicIfComplete(topic);
    return { success: false, reason: 'All angles already used. Topic expired.' };
  }

  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' }).sort({ scheduledTime: -1 }).limit(10).select('text').lean();
  const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);

  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  let created = [];
  let angleIndex = usedCount; // start from the next unused angle

  // Loop through days and times, generating posts only until angleIndex reaches totalAngles
  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      if (angleIndex >= totalAngles) break;
      const angle = anglesToUse[angleIndex];
      const time = topic.times[i % topic.times.length];
      const scheduled = moment.tz(`${day.format('YYYY-MM-DD')} ${time}`, TIMEZONE).toDate();
      // Skip if already scheduled (should not happen for manual generation, but guard)
      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      if (existsScheduled) continue;

      const context = await pageIntelligence.enrichContext(topic.pageId, pageProfile, topic.topicName, recentPostTexts);
      const validatedPost = await generateAndValidatePost(
        topic.topicName, angle, topic.pageId, pageProfile, recentPostTexts,
        context.dna, context.topHeadline, context.contentType
      );
      if (!validatedPost) {
        await monitor(topicId, topic.pageId, null, 'MANUAL_POST_FAILED', `Angle: ${angle} - Failed QA`);
        continue; // skip this angle, but we might want to retry? We'll move on.
      }

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
    if (angleIndex >= totalAngles) break;
  }

  // After generation, expire topic if all angles used
  await expireTopicIfComplete(topic);

  return { success: true, created };
}

async function generatePostsForTopic(topicId, options = {}) {
  const { immediate = false } = options;
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');
  const result = await generatePostsForManualTopic(topicId, immediate);
  return result.created || [];
}

async function deleteTopicPosts(topicId) {
  await AiScheduledPost.deleteMany({ topicId });
  await monitor(null, null, null, 'TOPIC_POSTS_DELETED', `Topic ${topicId} posts deleted`);
}

async function createAiLog(pageId, postId, action, message) {
  await monitor(null, pageId, postId, action, message);
}

// ================================================================
// ========== UPDATED: GENERATE NEXT POST (USING LOGS) ============
// ================================================================
async function generateNextPostForTopic(topic) {
  // --- PREREQUISITE CHECKS ---

  // 1. Topic must be active (not ended)
  const now = new Date();
  if (topic.endDate < now) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_EXPIRED', 'Topic has already ended.');
    return null;
  }

  // 2. Check angles used via logs
  const usedCount = await getUsedAnglesCount(topic._id);
  const totalAngles = (topic.customAngles && topic.customAngles.length) ? topic.customAngles.length : 5;
  if (usedCount >= totalAngles) {
    // All angles used – expire and clean up if possible
    await expireTopicIfComplete(topic);
    return null;
  }

  // 3. Topic must have zero pending posts
  const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
  if (pendingCount > 0) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_HAS_PENDING', `Topic has ${pendingCount} pending posts.`);
    return null;
  }

  // 4. Page must not exceed max pending posts
  const pagePending = await AiScheduledPost.countDocuments({ pageId: topic.pageId, status: 'PENDING' });
  if (pagePending >= MAX_SCHEDULED_POSTS) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_PAGE_LIMIT', `Page has ${pagePending} pending (max ${MAX_SCHEDULED_POSTS}).`);
    return null;
  }

  // 5. Find a future free time slot
  const existingPosts = await AiScheduledPost.find({ topicId: topic._id }).select('scheduledTime');
  const existingTimes = new Set(existingPosts.map(p => p.scheduledTime.getTime()));
  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  const nowMoment = moment().tz(TIMEZONE);
  let scheduledTime = null;
  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      const timeStr = topic.times[i % topic.times.length];
      const candidate = moment.tz(`${day.format('YYYY-MM-DD')} ${timeStr}`, TIMEZONE);
      if (candidate.isBefore(nowMoment)) continue;
      const key = candidate.toDate().getTime();
      if (!existingTimes.has(key)) {
        scheduledTime = candidate.toDate();
        break;
      }
    }
    if (scheduledTime) break;
  }
  if (!scheduledTime) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_NO_SLOT', 'No future time slot available.');
    return null;
  }

  // --- GENERATE POST ---

  // Determine next angle (sequential)
  const anglesToUse = (topic.customAngles && topic.customAngles.length) ? topic.customAngles : DEFAULT_ANGLES;
  const nextAngle = anglesToUse[usedCount]; // usedCount is 0-indexed, next unused

  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' })
    .sort({ scheduledTime: -1 }).limit(10).select('text').lean();
  const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);
  const context = await pageIntelligence.enrichContext(topic.pageId, pageProfile, topic.topicName, recentPostTexts);

  const validatedPost = await generateAndValidatePost(
    topic.topicName, nextAngle, topic.pageId, pageProfile, recentPostTexts,
    context.dna, context.topHeadline, context.contentType
  );
  if (!validatedPost) {
    await monitor(topic._id, topic.pageId, null, 'POST_GEN_FAILED', `Angle "${nextAngle}" failed QA.`);
    return null;
  }

  // Generate media (if enabled)
  let rawMediaUrl = null;
  if (topic.includeMedia) rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
  let finalMediaUrl = null;
  if (rawMediaUrl || topic.includeVideo) finalMediaUrl = await createBrandedImage(topic._id, topic.pageId, rawMediaUrl, validatedPost.text);

  // Save the post
  const post = await AiScheduledPost.create({
    topicId: topic._id,
    pageId: topic.pageId,
    text: validatedPost.text,
    mediaUrl: finalMediaUrl,
    scheduledTime: scheduledTime,
    status: 'PENDING',
    meta: {
      angle: nextAngle,
      qaScore: validatedPost.score,
      qaBreakdown: validatedPost.breakdown,
      generatedByAutoCron: true
    }
  });

  // Log the successful generation
  await monitor(topic._id, topic.pageId, post._id, 'AUTO_POST_GENERATED',
    `Angle: "${nextAngle}" (${usedCount + 1}/${totalAngles}), Score: ${validatedPost.score}`);

  // --- AFTER GENERATION: check if all angles are now used ---
  const newUsedCount = await getUsedAnglesCount(topic._id); // recount
  if (newUsedCount >= totalAngles) {
    // All angles used → expire topic
    await expireTopicIfComplete(topic);
  }

  return post;
}

// ================================================================
// ========== UPDATED AUTOPILOT (CLEANUP + POST GENERATION) ======
// ================================================================
async function ensureActiveTopicsForPage(pageId) {
  // --- CLEANUP PHASE: remove fully used topics with no pending posts ---
  const allTopics = await AiTopic.find({ pageId });
  for (const topic of allTopics) {
    const usedCount = await getUsedAnglesCount(topic._id);
    const totalAngles = (topic.customAngles && topic.customAngles.length) ? topic.customAngles.length : 5;
    if (usedCount >= totalAngles) {
      const pending = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
      if (pending === 0) {
        // Delete topic and logs
        await AiTopic.findByIdAndDelete(topic._id);
        await AiLog.deleteMany({ topicId: topic._id });
        await monitor(null, pageId, null, 'CLEANUP_DELETED', `Removed expired topic "${topic.topicName}" (no pending posts).`);
      }
    }
  }

  // --- ACTIVE TOPICS POST GENERATION ---
  const now = new Date();
  const activeTopics = await AiTopic.find({
    pageId,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  for (const topic of activeTopics) {
    const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
    if (pendingCount === 0) {
      try {
        await generateNextPostForTopic(topic);
      } catch (err) {
        // Hard limit hit – stop generating for this cycle to prevent spam
        console.error(`BLOCKED: ${err.message}`);
        await monitor(topic._id, topic.pageId, null, 'HARD_LIMIT_TRIGGERED', err.message);
        break; // Stop trying to generate more posts this round
      }
    }
  }

  // --- AUTO-TOPIC CREATION (UPDATED with Engine + Global Settings) ---
  const settings = await getGlobalSettings();
  if (!settings.autoTopicCreationEnabled) {
    await monitor(null, pageId, null, 'AUTO_SKIP_GLOBAL_DISABLED', 'Global auto‑topic creation is disabled.');
    return;
  }

  const autoTopics = activeTopics.filter(t => !t.manualTopic);
  if (autoTopics.length >= MIN_ACTIVE_TOPICS) {
    // Only create if fewer than minimum auto topics
    await monitor(null, pageId, null, 'AUTO_SKIP_MIN_MET', `Already have ${autoTopics.length} auto topics (min ${MIN_ACTIVE_TOPICS})`);
    return;
  }

  // Check global max limit
  if (activeTopics.length >= settings.maxActiveTopics) {
    await monitor(null, pageId, null, 'AUTO_SKIP_MAX_ACTIVE_TOPICS', 
      `Already have ${activeTopics.length} active topics (max ${settings.maxActiveTopics})`);
    return;
  }

  const profile = await PageProfile.findOne({ pageId });
  if (!profile?.audienceInterest?.length) return;

  const interests = profile.audienceInterest;
  const selectedInterest = interests[Math.floor(Math.random() * interests.length)];

  let topicName = null;
  let engineScore = null;

  // ---- USE TRENDING ENGINE OR FALLBACK based on profile setting ----
  if (profile.useTrendingTopics) {
    try {
      const candidates = await discoverAndRank(selectedInterest);
      if (candidates && candidates.length > 0) {
        const best = candidates[0];
        topicName = best.title;
        engineScore = best.overallScore;
        if (topicName.length > 80) topicName = topicName.slice(0, 77) + '…';
        await monitor(null, pageId, null, 'ENGINE_FETCH_SUCCESS', 
          `Interest: "${selectedInterest}" → Topic: "${topicName}" (Score: ${engineScore})`);
      } else {
        await monitor(null, pageId, null, 'ENGINE_FETCH_EMPTY', `No candidates for interest "${selectedInterest}"`);
      }
    } catch (err) {
      console.warn(`Engine discovery failed for interest "${selectedInterest}":`, err.message);
      await monitor(null, pageId, null, 'ENGINE_FETCH_ERROR', err.message);
    }

    // Fallback to news API if engine gave nothing
    if (!topicName) {
      let trendingHeadline = null;
      try {
        trendingHeadline = await fetchTrendingHeadline(pageId, selectedInterest);
      } catch (e) {
        console.warn('Trending headline fetch failed, proceeding without news:', e.message);
      }
      topicName = await generateShortTopicName(selectedInterest, trendingHeadline, pageId);
      if (!topicName) {
        topicName = `Latest update on ${selectedInterest}`;
      }
      await monitor(null, pageId, null, 'FALLBACK_TOPIC_GENERATED', 
        `Used fallback for interest "${selectedInterest}" → Topic: "${topicName}"`);
    }
  } else {
    // ----- TRENDING MODE OFF: generate generic topic from interest only -----
    topicName = await generateShortTopicName(selectedInterest, null, pageId);
    if (!topicName) {
      topicName = `Latest update on ${selectedInterest}`;
    }
    await monitor(null, pageId, null, 'TOPIC_GENERATED_FROM_INTEREST_ONLY', 
      `Interest: "${selectedInterest}" → Topic: "${topicName}"`);
  }

  // ---- Quality checks (combine engine score with existing) ----
  const { topicScore, pageFit } = await evaluateTopicQuality(topicName, pageId);
  let overallQuality = (topicScore + pageFit) / 2;
  if (engineScore !== null && engineScore !== undefined) {
    overallQuality = (overallQuality + engineScore) / 2; // average of three
  }
  const qualityThreshold = 35;
  if (overallQuality < qualityThreshold) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_REJECTED_QUALITY', 
      `Topic "${topicName}" overall quality ${overallQuality.toFixed(1)} (engine=${engineScore || 'N/A'}, topic=${topicScore}, fit=${pageFit})`);
    return;
  }

  // ---- Similarity check ----
  if (await isTopicTooSimilar(topicName, pageId)) {
    topicName = `${topicName} (fresh take)`;
    await monitor(null, pageId, null, 'TOPIC_SIMILAR_RENAMED', `Renamed to "${topicName}"`);
  }

  // ---- Create topic ----
  const startDate = await getIntelligentStartDate(pageId);
  const endDate = moment.tz(startDate, TIMEZONE).add(TOPIC_LIFETIME_DAYS, 'days').toDate();
  const times = [];
  for (let i = 0; i < POSTS_PER_DAY_AUTO; i++) {
    const time = await getNonCollidingTime(pageId, startDate);
    times.push(time);
  }

  const customAngles = await generateCustomAngles(topicName, pageId, selectedInterest);

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
    manualTopic: false,
    meta: {
      sourceInterest: selectedInterest,
      engineScore: engineScore,
      topicScore: topicScore,
      pageFit: pageFit,
      overallQuality: overallQuality,
      generatedBy: profile.useTrendingTopics ? 'engine_with_fallback' : 'interest_only'
    }
  });

  await monitor(newTopic._id, pageId, null, 'AUTO_TOPIC_CREATED',
    `Topic: "${topicName}", Interest: "${selectedInterest}", Angles: ${customAngles.join(', ')}, Scores: engine=${engineScore || 'N/A'}, topic=${topicScore}, fit=${pageFit}`);

  try {
    await generateNextPostForTopic(newTopic);
  } catch (err) {
    console.error(`Failed to generate first post for new topic: ${err.message}`);
    await monitor(newTopic._id, pageId, null, 'AUTO_FIRST_POST_FAILED', err.message);
  }
}

// ========== EXPORTS ==========
module.exports = {
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
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog,
  ensureActiveTopicsForPage,
  generateNextPostForTopic,
  evaluateTopicQuality,
  getUsedAnglesCount,
  expireTopicIfComplete,
  getGlobalSettings,      // <-- NEW export for admin
  updateGlobalSettings    // <-- NEW export for admin
};
