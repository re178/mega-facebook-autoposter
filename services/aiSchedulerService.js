const mongoose = require('mongoose');
const moment = require('moment-timezone');

// ===================== MODELS =====================
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');
const { renderPost } = require('../services/renderPost');
const { generateCinematicReel } = require('../services/media/cinematicEngine');
const qualityAssurance = require('./qualityAssurance');

// New lightweight model to track auto-created topics (no changes to existing schemas)
const AutoTopicMeta = mongoose.model('AutoTopicMeta', new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTopic', required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
}));

// ===================== AI PROVIDERS =====================
const {
  CloudflareText,
  GroqText,
  GeminiText,
  OpenAIText,
  generateSmart
} = require('../services/textProviders');

const {
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage
} = require('../services/imageProviders');

// ===================== PROVIDER ARRAYS =====================
const TextProviders = [
  GeminiText,
  CloudflareText,
  GroqText,
  OpenAIText
];

const ImageProviders = [
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage
];

// ===================== GLOBAL SETTINGS =====================
const TIMEZONE = 'Africa/Nairobi';
const MAX_POSTS_PER_TOPIC = 5;
const MAX_SCHEDULED_POSTS = 10;

// ===================== AUTO TOPIC CREATION SETTINGS =====================
const MIN_ACTIVE_TOPICS = 3;
const MAX_ACTIVE_TOPICS = 6;
const TOPIC_LIFETIME_DAYS = 5;
const POSTS_PER_DAY_AUTO = 1;
const INCLUDE_MEDIA_AUTO = false;
const AVOID_SIMILAR_DAYS = 7;
const MAX_START_DATE_DAYS = 21;
const MAX_SAME_START_DAY = 2;

// Global master switch
let GLOBAL_AUTO_TOPIC_CREATION_ENABLED = true;

// Default angles
const DEFAULT_ANGLES = ['insight', 'example', 'warning', 'opinion', 'takeaway'];
const GLOBAL_ANGLES = ['memory', 'observation', 'curiosity', 'experience', 'reflection', 'surprise', 'casual'];

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

// ===================== UTILS =====================
function cleanText(text = '') {
  return text.replace(/[•#*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function shuffleTimes(times) {
  return [...times].sort(() => Math.random() - 0.5);
}

function ensureFiveAngles(angles) {
  if (!angles || angles.length === 0) {
    return [...DEFAULT_ANGLES];
  }
  const result = [...angles];
  while (result.length < 5) {
    result.push(DEFAULT_ANGLES[result.length % DEFAULT_ANGLES.length]);
  }
  return result.slice(0, 5);
}

// ===================== PROMPT BUILDER =====================
function extractCriticalRules(extraNotes) {
  if (!extraNotes) return '';
  
  const match = extraNotes.match(/Critical rules:\s*\n([\s\S]*?)(?=\n\s*\n|\n\[|$)/i);
  if (!match) return '';
  
  let rules = match[1].trim();
  rules = rules.replace(/^\[.*$/gm, '').trim();
  return rules;
}

async function buildPrompt({ topic, angle, pageId, textSeed, qualityFix = null }) {
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

  return `
Write a natural, relatable Facebook post about "${topic}".
Angle: ${angle}
Tone: ${profile?.tone || 'friendly'}
Style: ${profile?.writingStyle || 'conversational'}
Voice: ${profile?.voice || 'first-person plural'}
Audience: ${profile?.audienceTone || 'casual'}, interests: ${profile?.audienceInterest?.join(', ') || 'general audience'}

${criticalRules}

${seedText}
${qualityFixText}

The rules above are MANDATORY and override any other instructions. Follow them exactly.
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

// ===================== TEXT GENERATION (with QA integration) =====================
async function generateText(topic, angle, pageId, textSeed = null, qualityFix = null) {
  try {
    const prompt = await buildPrompt({ topic, angle, pageId, textSeed, qualityFix });
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

// ===================== QA-ENHANCED POST GENERATION =====================
async function generateAndValidatePost(topic, angle, pageId, pageProfile, recentPosts = [], attempt = 0) {
  const maxAttempts = 3;
  
  // Generate raw text
  let rawText = await generateText(topic, angle, pageId);
  if (!rawText) return null;
  
  // Run through quality assurance
  const qaResult = await qualityAssurance.processContent({
    topic: topic,
    post: rawText,
    pageProfile: pageProfile,
    pageId: pageId,
    recentPosts: recentPosts,
    generateFn: async (prompt) => {
      // Extract fix instructions from prompt
      const fixMatch = prompt.match(/IMPORTANT FIXES NEEDED: ([^\n]+)/);
      const qualityFix = fixMatch ? fixMatch[1] : null;
      return await generateText(topic, angle, pageId, null, qualityFix);
    },
    maxRegenerations: 2
  });
  
  if (qaResult.pass) {
    await monitor(null, pageId, null, 'QA_PASSED', `Score: ${qaResult.score}`);
    return {
      text: qaResult.finalPost,
      score: qaResult.score,
      breakdown: qaResult.breakdown
    };
  }
  
  // If QA failed and we have attempts left, try again with a different approach
  if (attempt < maxAttempts) {
    await monitor(null, pageId, null, 'QA_FAILED_RETRY', `Attempt ${attempt + 1}: ${qaResult.reason}`);
    // Slightly modify the angle for retry
    const modifiedAngle = `${angle} (different perspective)`;
    return await generateAndValidatePost(topic, modifiedAngle, pageId, pageProfile, recentPosts, attempt + 1);
  }
  
  await monitor(null, pageId, null, 'QA_FAILED_FINAL', qaResult.reason);
  return null;
}

// ===================== IMAGE GENERATION =====================
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

// ===================== CUSTOM ANGLES GENERATION =====================
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
    } catch (err) {
      console.error(`Custom angle generation failed for ${provider.name}:`, err.message);
    }
  }
  return [...DEFAULT_ANGLES];
}

// ===================== TOPIC NAME GENERATION =====================
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
    } catch (err) {
      console.error(`Topic name generation failed for ${provider.name}:`, err.message);
    }
  }
  return null;
}

// ===================== TRENDING HEADLINE FETCH =====================
async function fetchTrendingHeadline(keyword) {
  const gnewsKey = process.env.GNEWS_API_KEY;
  if (gnewsKey) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=ke&max=1&token=${gnewsKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        return data.articles[0].title;
      }
    } catch (err) {
      console.error('GNews fetch failed:', err.message);
    }
  }

  const newsApiKey = process.env.NEWS_API_KEY;
  if (newsApiKey) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&sortBy=popularity&pageSize=1&apiKey=${newsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        return data.articles[0].title;
      }
    } catch (err) {
      console.error('NewsAPI fetch failed:', err.message);
    }
  }
  return null;
}

// ===================== SIMILAR TOPIC AVOIDANCE =====================
async function isTopicTooSimilar(newTopicName, pageId) {
  const cutoff = moment().subtract(AVOID_SIMILAR_DAYS, 'days').toDate();
  const existingTopics = await AiTopic.find({
    pageId,
    $or: [
      { endDate: { $gte: new Date() } },
      { endDate: { $gte: cutoff } }
    ]
  }).lean();

  const newWords = new Set(newTopicName.toLowerCase().split(/\s+/));
  for (const topic of existingTopics) {
    const oldWords = new Set(topic.topicName.toLowerCase().split(/\s+/));
    const intersection = [...newWords].filter(w => oldWords.has(w)).length;
    const similarity = intersection / Math.min(newWords.size, oldWords.size);
    if (similarity > 0.5) return true;
  }
  return false;
}

// ===================== START DATE & TIME HELPERS =====================
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
    if ((startCounts[dayKey] || 0) < MAX_SAME_START_DAY) {
      return d.toDate();
    }
  }
  let minCount = Infinity;
  let bestDate = null;
  for (let d = today.clone().add(1, 'day'); d.isSameOrBefore(maxDate); d.add(1, 'day')) {
    const dayKey = d.format('YYYY-MM-DD');
    const count = startCounts[dayKey] || 0;
    if (count < minCount) {
      minCount = count;
      bestDate = d.toDate();
    }
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
    const existing = await AiScheduledPost.findOne({
      pageId,
      scheduledTime: slot.toDate()
    });
    if (!existing) return slot.format('HH:mm');
  }
  return '12:00';
}

// ===================== BRANDED IMAGE CREATION =====================
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
      const videoUrl = await generateCinematicReel({
        title: topic.topicName,
        text: postText,
        pageProfile: cinematicProfile,
        pageName: page?.name || 'Page',
        format: 'short'
      });
      return videoUrl || null;
    }

    if (topic.includeMedia === true) {
      const finalImage = await renderPost({
        title: topic.topicName,
        text: postText,
        rawImage: rawMediaUrl,
        pageProfile: pageProfile || {},
        pageName: page?.name || 'Page',
        logoUrl: null
      });
      return finalImage || rawMediaUrl;
    }

    return null;
  } catch (err) {
    console.error('createBrandedImage failed:', err.message);
    await monitor(topicId, pageId, null, 'BRANDED_MEDIA_FAILED', err.message);
    return null;
  }
}

// ===================== ENHANCED: Create Manual Topic with QA =====================
async function createManualTopicWithQA(pageId, topicName, startDate, endDate, times, postsPerDay, includeMedia, includeVideo) {
  // 1. Score the topic before creation
  const topicScore = qualityAssurance.scoreTopic(topicName, pageId);
  if (topicScore < 20) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic score too low (${topicScore}): ${topicName}`);
    return { success: false, reason: `Topic score too low (${topicScore}). Choose a more specific or trending topic.` };
  }

  // 2. Check for similar topics
  if (await isTopicTooSimilar(topicName, pageId)) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Similar topic exists: ${topicName}`);
    return { success: false, reason: `Similar topic already exists. Choose a different topic.` };
  }

  // 3. Generate custom angles for this topic (same as auto-topics)
  const customAngles = await generateCustomAngles(topicName, pageId);
  if (!customAngles || customAngles.length < 3) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_WARNING', `Using default angles for: ${topicName}`);
  }

  // 4. Create the topic with custom angles
  const newTopic = await AiTopic.create({
    topicName,
    pageId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    times: Array.isArray(times) ? times : [times],
    postsPerDay: postsPerDay || 1,
    includeMedia: includeMedia || false,
    includeVideo: includeVideo || false,
    customAngles: customAngles || null,
    manualTopic: true
  });

  await monitor(newTopic._id, pageId, null, 'MANUAL_TOPIC_CREATED', 
    `Topic: "${topicName}", Angles: ${customAngles?.join(', ') || 'defaults'}, Score: ${topicScore}`
  );

  return { success: true, topic: newTopic, topicScore, customAngles };
}

// ===================== ENHANCED: Generate Posts for Manual Topic =====================
async function generatePostsForManualTopic(topicId, generateImmediately = false) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return { success: false, reason: 'Topic not found' };

  // Get page profile for QA
  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  
  // Get recent posts for duplicate detection
  const recentPosts = await AiScheduledPost.find({ 
    pageId: topic.pageId,
    status: 'PENDING'
  })
    .sort({ scheduledTime: -1 })
    .limit(10)
    .select('text')
    .lean();
  const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);

  // Determine angles to use
  let anglesToUse;
  if (topic.customAngles && topic.customAngles.length > 0) {
    anglesToUse = topic.customAngles;
  } else {
    // Generate custom angles on the fly if missing
    anglesToUse = await generateCustomAngles(topic.topicName, topic.pageId);
    await AiTopic.findByIdAndUpdate(topicId, { customAngles: anglesToUse });
  }

  // Ensure we have enough angles
  while (anglesToUse.length < 5) {
    anglesToUse.push(DEFAULT_ANGLES[anglesToUse.length % DEFAULT_ANGLES.length]);
  }

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

      // Skip if already scheduled
      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      if (existsScheduled) continue;

      // Generate and validate post through QA pipeline
      const validatedPost = await generateAndValidatePost(
        topic.topicName,
        angle,
        topic.pageId,
        pageProfile,
        recentPostTexts
      );
      
      if (!validatedPost) {
        await monitor(topicId, topic.pageId, null, 'MANUAL_POST_FAILED', `Angle: ${angle} - Failed QA`);
        continue;
      }

      // Generate image if needed
      let rawMediaUrl = null;
      if (topic.includeMedia) {
        rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
      }
      
      // Create branded image/video
      let finalMediaUrl = null;
      if (rawMediaUrl || topic.includeVideo) {
        finalMediaUrl = await createBrandedImage(topicId, topic.pageId, rawMediaUrl, validatedPost.text);
      }

      // Create the scheduled post
      const post = await AiScheduledPost.create({
        topicId,
        pageId: topic.pageId,
        text: validatedPost.text,
        mediaUrl: finalMediaUrl,
        scheduledTime: scheduled,
        status: generateImmediately ? 'PUBLISHED' : 'PENDING',
        meta: { 
          angle,
          qaScore: validatedPost.score,
          qaBreakdown: validatedPost.breakdown,
          generatedManually: true
        }
      });

      created.push(post);
      recentPostTexts.unshift(validatedPost.text);
      recentPostTexts = recentPostTexts.slice(0, 10);
      
      await monitor(topicId, topic.pageId, post._id, 'MANUAL_POST_CREATED', 
        `Angle: ${angle}, QA Score: ${validatedPost.score}, Scheduled: ${scheduled}`
      );
      
      angleIndex++;
    }
  }

  return { success: true, postsCreated: created.length, totalPosts: totalPostsNeeded, posts: created };
}

// ===================== ENHANCED: Regenerate Topic Angles =====================
async function regenerateTopicAngles(topicId) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return { success: false, reason: 'Topic not found' };
  
  const newAngles = await generateCustomAngles(topic.topicName, topic.pageId);
  
  await AiTopic.findByIdAndUpdate(topicId, { customAngles: newAngles });
  
  // Delete existing posts for this topic and regenerate
  await AiScheduledPost.deleteMany({ topicId });
  const result = await generatePostsForManualTopic(topicId, false);
  
  return { success: true, angles: newAngles, postsRegenerated: result.postsCreated };
}

// ===================== UPDATED POST GENERATOR (with QA integration) =====================
async function generatePostsForTopic(topicId) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return [];

  // Determine which angles to use
  let anglesToUse;
  if (topic.customAngles && topic.customAngles.length === MAX_POSTS_PER_TOPIC) {
    anglesToUse = topic.customAngles;
  } else {
    anglesToUse = GLOBAL_ANGLES;
  }

  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  
  // Get page profile for QA
  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  
  // Get recent posts from this page for duplicate detection
  const recentPosts = await AiScheduledPost.find({ 
    pageId: topic.pageId,
    status: 'PENDING'
  })
    .sort({ scheduledTime: -1 })
    .limit(10)
    .select('text')
    .lean();
  const recentPostTexts = recentPosts.map(p => p.text).filter(Boolean);

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
      const existsLogged = await AiLog.findOne({ topicId, action: /POST_CREATED|AUTO_POST_CREATED/, message: new RegExp(time) });
      if (existsScheduled || existsLogged) continue;

      // Generate and validate post through QA pipeline
      const validatedPost = await generateAndValidatePost(
        topic.topicName,
        angle,
        topic.pageId,
        pageProfile,
        recentPostTexts
      );
      
      if (!validatedPost) {
        await monitor(topicId, topic.pageId, null, 'POST_GEN_FAILED', `Angle: ${angle} - Failed QA`);
        continue;
      }

      // Generate image (if needed)
      let rawMediaUrl = topic.includeMedia ? await generateImage(topic.topicName, topic.pageId, validatedPost.text) : null;
      
      // Create branded image/video
      const finalMediaUrl = await createBrandedImage(topicId, topic.pageId, rawMediaUrl, validatedPost.text);

      // Create the scheduled post
      const post = await AiScheduledPost.create({
        topicId,
        pageId: topic.pageId,
        text: validatedPost.text,
        mediaUrl: finalMediaUrl,
        scheduledTime: scheduled,
        status: 'PENDING',
        meta: { 
          angle,
          qaScore: validatedPost.score,
          qaBreakdown: validatedPost.breakdown
        }
      });

      created.push(post);
      recentPostTexts.unshift(validatedPost.text);
      recentPostTexts = recentPostTexts.slice(0, 10);
      
      await monitor(topicId, topic.pageId, post._id, 'POST_CREATED_QA', 
        `Angle: ${angle}, QA Score: ${validatedPost.score}, Scheduled: ${scheduled}`
      );
      
      angleIndex++;
    }
  }

  return created;
}

// ===================== AUTO TOPIC CREATION =====================
async function createAutoTopicForPage(pageId) {
  if (!GLOBAL_AUTO_TOPIC_CREATION_ENABLED) return null;

  const page = await Page.findOne({ pageId }).lean();
  if (!page || !page.autoGenerationEnabled) return null;

  const profile = await PageProfile.findOne({ pageId });
  if (!profile || !profile.audienceInterest || profile.audienceInterest.length === 0) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_FAILED', 'PageProfile missing or no audienceInterest');
    return null;
  }

  const interest = profile.audienceInterest[Math.floor(Math.random() * profile.audienceInterest.length)];
  const rawHeadline = await fetchTrendingHeadline(interest);
  let topicName = await generateShortTopicName(interest, rawHeadline);
  if (!topicName) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_FAILED', `Could not generate topic name for interest: ${interest}`);
    return null;
  }

  // Score the topic before creating
  const topicScore = qualityAssurance.scoreTopic(topicName, pageId);
  if (topicScore < 40) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_SKIPPED', `Topic score too low (${topicScore}): ${topicName}`);
    return null;
  }

  if (await isTopicTooSimilar(topicName, pageId)) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_SKIPPED', `Similar topic exists: ${topicName}`);
    return null;
  }

  const startDate = await getIntelligentStartDate(pageId);
  if (!startDate) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_FAILED', 'No suitable start date found within 21 days');
    return null;
  }

  const endDate = moment(startDate).tz(TIMEZONE).add(TOPIC_LIFETIME_DAYS - 1, 'days').toDate();

  const times = [];
  const dayIterator = moment(startDate).tz(TIMEZONE);
  while (dayIterator.isSameOrBefore(endDate)) {
    const timeStr = await getNonCollidingTime(pageId, dayIterator.toDate());
    times.push(timeStr);
    dayIterator.add(1, 'day');
  }
  if (times.length === 0) {
    await monitor(null, pageId, null, 'AUTO_TOPIC_FAILED', 'Could not generate any posting times');
    return null;
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
  });

  await AutoTopicMeta.create({ topicId: newTopic._id });
  console.log(`Auto-created topic "${topicName}" for page ${pageId} with angles: ${customAngles.join(', ')} (Topic score: ${topicScore})`);
  return newTopic;
}

// ===================== HELPER FUNCTIONS =====================
async function getPageMemory(pageId) {
  return qualityAssurance.getPageMemory(pageId);
}

async function getTopicScore(topicName, pageId) {
  return qualityAssurance.scoreTopic(topicName, pageId);
}

// ===================== EXPORTS =====================
module.exports = {
  // Core functions
  generatePostsForTopic,
  createAutoTopicForPage,
  generateAndValidatePost,
  
  // NEW: Manual topic functions with QA
  createManualTopicWithQA,
  generatePostsForManualTopic,
  regenerateTopicAngles,
  
  // Quality assurance helpers
  getPageMemory,
  getTopicScore,
  
  // Legacy exports for backward compatibility
  generateText,
  generateImage,
  generateCustomAngles,
  
  // Settings
  setAutoTopicCreationEnabled: (enabled) => { GLOBAL_AUTO_TOPIC_CREATION_ENABLED = enabled; },
  getAutoTopicCreationEnabled: () => GLOBAL_AUTO_TOPIC_CREATION_ENABLED
};
