const mongoose = require('mongoose');
const moment = require('moment-timezone');

// ===================== MODELS =====================
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');
const { renderPost } = require('../services/renderPost');// ✅ Now used
const { generateCinematicReel } = require('../services/media/cinematicEngine');

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
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text,
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
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
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
const MAX_POSTS_PER_TOPIC = 5;        // must match number of custom angles
const MAX_SCHEDULED_POSTS = 10;

// ===================== AUTO TOPIC CREATION SETTINGS =====================
const MIN_ACTIVE_TOPICS = 3;           // per page
const MAX_ACTIVE_TOPICS = 6;           // per page
const TOPIC_LIFETIME_DAYS = 5;         // startDate + (TOPIC_LIFETIME_DAYS - 1) days = endDate
const POSTS_PER_DAY_AUTO = 1;           // 1 post per day
const INCLUDE_MEDIA_AUTO = false;       // no images by default
const AVOID_SIMILAR_DAYS = 7;           // don't repeat similar topics within this many days
const MAX_START_DATE_DAYS = 21;         // topic must start within 21 days of creation
const MAX_SAME_START_DAY = 2;           // no more than 2 topics start on same day per page

// Global master switch (in-memory, can be toggled via API)
let GLOBAL_AUTO_TOPIC_CREATION_ENABLED = true;

// Default angles to use as fallback if custom generation fails
const DEFAULT_ANGLES = ['insight', 'example', 'warning', 'opinion', 'takeaway'];

// Global angles for backward compatibility (used only when topic has no customAngles)
const GLOBAL_ANGLES = ['memory','observation','curiosity','experience','reflection','surprise','casual'];

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

/**
 * Ensure we always have exactly 5 angles.
 * If provided array has fewer, pad with DEFAULT_ANGLES.
 * If empty, return a copy of DEFAULT_ANGLES.
 */
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
/**
 * Extract the Critical rules section from extraNotes.
 * Looks for "Critical rules:" (case-insensitive) and captures all text
 * until an empty line or another section heading (e.g., "[DESIGN]" or "Note:").
 */
function extractCriticalRules(extraNotes) {
  if (!extraNotes) return '';
  
  // Match "Critical rules:" followed by any lines until a blank line or another bracket/heading
  const match = extraNotes.match(/Critical rules:\s*\n([\s\S]*?)(?=\n\s*\n|\n\[|$)/i);
  if (!match) return '';
  
  let rules = match[1].trim();
  // Remove any lines that start with [ (like [DESIGN] if it was inside by mistake)
  rules = rules.replace(/^\[.*$/gm, '').trim();
  return rules;
}

async function buildPrompt({ topic, angle, pageId, textSeed }) {
  const profile = await PageProfile.findOne({ pageId });
  let extraNotes = profile?.extraNotes || '';

  // Extract only the Critical rules section
  let criticalRules = extractCriticalRules(extraNotes);

  // If no Critical rules section found, use a sensible default
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

  return `
Write a natural, relatable Facebook post about "${topic}".
Angle: ${angle}
Tone: ${profile?.tone || 'friendly'}
Style: ${profile?.writingStyle || 'conversational'}
Voice: ${profile?.voice || 'first-person plural'}
Audience: ${profile?.audienceTone || 'casual'}, interests: ${profile?.audienceInterest?.join(', ') || 'general audience'}

${criticalRules}

${seedText}

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

// ===================== TEXT GENERATION =====================
async function generateText(topic, angle, pageId, textSeed = null) {
  for (const provider of TextProviders) {
    try {
      const prompt = await buildPrompt({ topic, angle, pageId, textSeed });
      const text = await provider.generate(prompt);
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
/**
 * Generate exactly 5 custom angles for a topic.
 * Uses AI; if AI returns less, pads with DEFAULT_ANGLES.
 */
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
  // Fallback to default angles
  return [...DEFAULT_ANGLES];
}

// ===================== TOPIC NAME GENERATION (short, 5-10 words) =====================
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
        // enforce max 10 words
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

  // Generate custom angles for this topic
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
    customAngles,          // new field
  });

  await AutoTopicMeta.create({ topicId: newTopic._id });
  console.log(`Auto-created topic "${topicName}" for page ${pageId} with angles: ${customAngles.join(', ')}`);
  return newTopic;
}

// ===================== HELPER: Create branded image using renderPost =====================
async function createBrandedImage(topicId, pageId, rawMediaUrl, postText) {
  try {
    const [topic, pageProfile, page] = await Promise.all([
      AiTopic.findById(topicId).lean(),
      PageProfile.findOne({ pageId }).lean(),
      Page.findOne({ pageId }).select('name').lean()
    ]);
    if (!topic) return rawMediaUrl;

    // Priority: Video overrides image
    if (topic.includeVideo === true) {
      // Build pageProfile for cinematic engine
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

    // Otherwise, handle image if includeMedia is true
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

    // No media requested
    return null;
  } catch (err) {
    console.error('createBrandedImage failed:', err.message);
    await monitor(topicId, pageId, null, 'BRANDED_MEDIA_FAILED', err.message);
    return null;
  }
}

// ===================== MANUAL POST GENERATOR (with custom angles) =====================
async function generatePostsForTopic(topicId) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return [];

  // Determine which angles to use: custom if available, else global
  let anglesToUse;
  if (topic.customAngles && topic.customAngles.length === MAX_POSTS_PER_TOPIC) {
    anglesToUse = topic.customAngles;
  } else {
    anglesToUse = GLOBAL_ANGLES;
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

      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      const existsLogged = await AiLog.findOne({ topicId, action: /POST_CREATED|AUTO_POST_CREATED/, message: new RegExp(time) });
      if (existsScheduled || existsLogged) continue;

      const text = await generateText(topic.topicName, angle, topic.pageId);
      if (!text) continue;

      let rawMediaUrl = topic.includeMedia ? await generateImage(topic.topicName, topic.pageId, text) : null;

      // Create branded image using renderPost
      const finalMediaUrl = await createBrandedImage(topicId, topic.pageId, rawMediaUrl, text);

      const post = await AiScheduledPost.create({
        topicId,
        pageId: topic.pageId,
        text,
        mediaUrl: finalMediaUrl,
        scheduledTime: scheduled,
        status: 'PENDING',
        meta: { angle }
      });

      created.push(post);
      await monitor(topicId, topic.pageId, post._id, 'POST_CREATED', 'Manual post created');
      angleIndex++;
    }
  }
  return created;
}

// ===================== AUTO POST GENERATION (with custom angles) =====================
async function autoGenerate() {
  if (global.__AUTO_GEN_RUNNING__) return;
  global.__AUTO_GEN_RUNNING__ = true;

  try {
    if (process.memoryUsage().heapUsed > 900 * 1024 * 1024) {
      console.error("AUTO GEN SKIPPED: High memory usage");
      return;
    }

    let now;
    try {
      now = moment().tz(TIMEZONE);
      if (!now.isValid()) throw new Error("Invalid timezone");
    } catch (err) {
      console.error("TIMEZONE ERROR:", err.message);
      return;
    }

    let activePages;
    try {
      activePages = await Page.find({ autoGenerationEnabled: true }).select("pageId").lean();
    } catch (err) {
      console.error("DB ERROR FETCHING PAGES:", err.message);
      return;
    }

    if (!activePages.length) return;
    const activePageIds = activePages.map(p => p.pageId);

    let topics;
    try {
      topics = await AiTopic.find({ pageId: { $in: activePageIds } }).lean();
    } catch (err) {
      console.error("DB ERROR FETCHING TOPICS:", err.message);
      return;
    }

    if (!topics || topics.length === 0) return;

    for (const topic of topics) {
      try {
        const endMoment = moment(topic.endDate).tz(TIMEZONE);
        if (!endMoment.isValid()) {
          await monitor(topic._id, topic.pageId, null, "AUTO_INVALID_ENDDATE", "Invalid endDate");
          continue;
        }

        if (endMoment.isBefore(now)) {
          await AiLog.deleteMany({ topicId: topic._id });
          await AiTopic.deleteOne({ _id: topic._id });
          await monitor(topic._id, topic.pageId, null, "TOPIC_EXPIRED", "Topic expired and deleted");
          maintainAutoTopics().catch(err => console.error(err));
          continue;
        }

        const [logCount, scheduledCount] = await Promise.all([
          AiLog.countDocuments({
            topicId: topic._id,
            action: "AUTO_POST_CREATED"
          }),
          AiScheduledPost.countDocuments({
            topicId: topic._id,
            "meta.auto": true
          })
        ]);

        if ((logCount + scheduledCount) >= MAX_POSTS_PER_TOPIC) {
          await AiLog.deleteMany({ topicId: topic._id });
          await AiTopic.deleteOne({ _id: topic._id });
          await monitor(topic._id, topic.pageId, null, "TOPIC_MAX_POSTS", "Topic max posts reached");
          maintainAutoTopics().catch(err => console.error(err));
          continue;
        }

        const pending = await AiScheduledPost.findOne({
          topicId: topic._id,
          status: "PENDING"
        }).lean();

        if (pending) continue;

        // Determine next angle to use
        let angle;
        if (topic.customAngles && topic.customAngles.length === MAX_POSTS_PER_TOPIC) {
          const usedAngles = await AiLog.distinct("message", {
            topicId: topic._id,
            action: "AUTO_POST_CREATED"
          });
          const available = topic.customAngles.filter(a => !usedAngles.includes(a));
          if (available.length === 0) {
            await AiLog.deleteMany({ topicId: topic._id });
            await AiTopic.deleteOne({ _id: topic._id });
            await monitor(topic._id, topic.pageId, null, "TOPIC_ANGLES_EXHAUSTED", "All custom angles used");
            maintainAutoTopics().catch(err => console.error(err));
            continue;
          }
          angle = available[0];
        } else {
          const usedAngles = await AiLog.distinct("message", {
            topicId: topic._id,
            action: "AUTO_POST_CREATED"
          });
          angle = GLOBAL_ANGLES.find(a => !usedAngles.includes(a));
          if (!angle) {
            await AiLog.deleteMany({ topicId: topic._id });
            await AiTopic.deleteOne({ _id: topic._id });
            await monitor(topic._id, topic.pageId, null, "TOPIC_ANGLES_EXHAUSTED", "All global angles used");
            maintainAutoTopics().catch(err => console.error(err));
            continue;
          }
        }

        if (!Array.isArray(topic.times) || topic.times.length === 0) {
          await monitor(topic._id, topic.pageId, null, "TOPIC_NO_TIMES", "No time slots defined");
          continue;
        }

        const startDate = moment(topic.startDate).tz(TIMEZONE);
        const endDate = moment(topic.endDate).tz(TIMEZONE);

        let scheduledTime = null;
        let day = moment.max(now.clone().startOf("day"), startDate.clone().startOf("day"));
        let safetyCounter = 0;

        while (day.isSameOrBefore(endDate) && safetyCounter < 365) {
          safetyCounter++;
          const times = shuffleTimes(topic.times);
          for (const t of times) {
            const slot = moment.tz(`${day.format("YYYY-MM-DD")} ${t}`, TIMEZONE);
            if (!slot.isValid()) continue;
            if (slot.isSameOrBefore(now)) continue;
            if (slot.isBefore(startDate) || slot.isAfter(endDate)) continue;

            const collision = await AiScheduledPost.findOne({
              pageId: topic.pageId,
              scheduledTime: slot.toDate()
            }).lean();

            if (!collision) {
              scheduledTime = slot.toDate();
              break;
            }
          }
          if (scheduledTime) break;
          day.add(1, "day");
        }

        if (!scheduledTime) continue;

        let text;
        try {
          text = await generateText(topic.topicName, angle, topic.pageId);
        } catch (err) {
          console.error("TEXT GENERATION ERROR:", err.message);
          await monitor(topic._id, topic.pageId, null, "TEXT_GEN_ERROR", err.message);
          continue;
        }

        if (!text) continue;

        let rawMediaUrl = null;
        if (topic.includeMedia) {
          try {
            rawMediaUrl = await generateImage(topic.topicName, topic.pageId, text);
          } catch (err) {
            console.error("IMAGE GENERATION ERROR:", err.message);
            await monitor(topic._id, topic.pageId, null, "IMAGE_GEN_ERROR", err.message);
          }
        }

        // Create branded image using renderPost
        const finalMediaUrl = await createBrandedImage(topic._id, topic.pageId, rawMediaUrl, text);

        const post = await AiScheduledPost.create({
          topicId: topic._id,
          pageId: topic.pageId,
          text,
          mediaUrl: finalMediaUrl,
          scheduledTime,
          status: "PENDING",
          meta: { angle, auto: true }
        });

        await monitor(topic._id, topic.pageId, post._id, "AUTO_POST_CREATED", angle);

        break; // original break preserved

      } catch (topicErr) {
        console.error(`AUTO TOPIC ERROR ${topic._id}:`, topicErr.message);
        await monitor(topic._id, topic.pageId, null, "AUTO_GEN_ERROR", topicErr.message);
        continue;
      }
    }
  } catch (fatalError) {
    console.error("FATAL AUTO GENERATION ERROR:", fatalError);
  } finally {
    global.__AUTO_GEN_RUNNING__ = false;
  }
}

// ===================== ACTIVE TOPIC MAINTENANCE =====================
async function maintainAutoTopics() {
  if (!GLOBAL_AUTO_TOPIC_CREATION_ENABLED) return;
  if (process.memoryUsage().heapUsed > 900 * 1024 * 1024) {
    console.log('High memory usage, skipping auto topic creation');
    return;
  }

  const pages = await Page.find({ autoGenerationEnabled: true }).lean();
  for (const page of pages) {
    const activeCount = await AiTopic.countDocuments({
      pageId: page.pageId,
      endDate: { $gt: new Date() }
    });
    if (activeCount < MIN_ACTIVE_TOPICS) {
      const needed = MIN_ACTIVE_TOPICS - activeCount;
      for (let i = 0; i < needed; i++) {
        const currentActive = await AiTopic.countDocuments({
          pageId: page.pageId,
          endDate: { $gt: new Date() }
        });
        if (currentActive >= MAX_ACTIVE_TOPICS) break;
        await createAutoTopicForPage(page.pageId);
      }
    }
  }
}

// Run maintainAutoTopics every 30 minutes
setInterval(maintainAutoTopics, 30 * 60 * 1000);
setInterval(autoGenerate, 60 * 1000);

// ===================== EXPORTS =====================
module.exports = {
  generatePostsForTopic,
  enableAutoGeneration: () => {},
  disableAutoGeneration: () => {},
  createAiLog: monitor,
  enableAutoTopicCreation: () => { GLOBAL_AUTO_TOPIC_CREATION_ENABLED = true; },
  disableAutoTopicCreation: () => { GLOBAL_AUTO_TOPIC_CREATION_ENABLED = false; },
  maintainAutoTopics,
  createAutoTopicForPage,
  generateCustomAngles,
  generateShortTopicName,
};
