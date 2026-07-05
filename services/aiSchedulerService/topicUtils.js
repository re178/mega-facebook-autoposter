const moment = require('moment-timezone');
const {
  AiTopic,
  AiScheduledPost,
  AiLog,
  PageProfile,
  monitor,
  DEFAULT_ANGLES,
  AVOID_SIMILAR_DAYS,
  MAX_START_DATE_DAYS,
  MAX_SAME_START_DAY,
  TIMEZONE,
  TOPIC_LIFETIME_DAYS,
} = require('./models');
const { TextProviders, cleanText, generateSmart } = require('./providers');
const qualityAssurance = require('../qualityAssurance');

// ========== Generate custom angles ==========
async function generateCustomAngles(topicName, pageId, singleInterest = null) {
  const profile = await PageProfile.findOne({ pageId });
  const audienceInterest = profile?.audienceInterest || [];
  const primaryTopics = singleInterest ? [singleInterest] : audienceInterest;

  const recentTopics = await AiTopic.find({ pageId, manualTopic: true })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
  const recentAngles = recentTopics.flatMap((t) => t.customAngles || []).slice(0, 9);

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
        let cleaned = response
          .replace(/^[\d\s\.\-\*]+/gm, '')
          .replace(/["']/g, '')
          .replace(/\n/g, ',')
          .trim();

        let angles = cleaned
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0);
        angles = angles.filter((s) => s.split(/\s+/).length <= 4);

        if (angles.length >= 5) return angles.slice(0, 5);
        if (angles.length >= 3) {
          const padded = [...angles];
          while (padded.length < 5) {
            padded.push(DEFAULT_ANGLES[padded.length % DEFAULT_ANGLES.length]);
          }
          return padded;
        }
        console.warn(`Invalid angle format from ${provider.name}: "${response}"`);
        await monitor(null, pageId, null, 'ANGLE_FORMAT_FAILED', `Provider ${provider.name} returned: ${response}`);
      }
    } catch (err) {
      console.error(`Custom angle generation failed for ${provider.name}:`, err.message);
    }
  }
  return [...DEFAULT_ANGLES];
}

// ========== Short topic name ==========
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
    } catch (err) {
      console.error(`Topic name generation failed for ${provider.name}:`, err.message);
    }
  }
  return `Latest update on ${singleInterest}`;
}

// ========== Fetch trending headline ==========
async function fetchTrendingHeadline(pageId, specificInterest = null) {
  const profile = await PageProfile.findOne({ pageId });
  const interests = profile?.audienceInterest || [];
  if (interests.length === 0) return null;

  const keyword = specificInterest || interests[Math.floor(Math.random() * interests.length)];

  const gnewsKey = process.env.GNEWS_API_KEY;
  if (gnewsKey) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=ke&max=1&token=${gnewsKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        const title = data.articles[0].title;
        if (title.toLowerCase().includes(keyword.toLowerCase())) return title;
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
        const title = data.articles[0].title;
        if (title.toLowerCase().includes(keyword.toLowerCase())) return title;
      }
    } catch (err) {
      console.error('NewsAPI fetch failed:', err.message);
    }
  }
  return null;
}

// ========== Similarity check ==========
async function isTopicTooSimilar(newTopicName, pageId) {
  const cutoff = moment().subtract(AVOID_SIMILAR_DAYS, 'days').toDate();
  const existingTopics = await AiTopic.find({
    pageId,
    $or: [{ endDate: { $gte: new Date() } }, { endDate: { $gte: cutoff } }],
  }).lean();
  const newWords = new Set(newTopicName.toLowerCase().split(/\s+/));
  for (const topic of existingTopics) {
    const oldWords = new Set(topic.topicName.toLowerCase().split(/\s+/));
    const intersection = [...newWords].filter((w) => oldWords.has(w)).length;
    const similarity = intersection / Math.min(newWords.size, oldWords.size);
    if (similarity > 0.5) return true;
  }
  return false;
}

// ========== Intelligent start date ==========
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
    if (count < minCount) {
      minCount = count;
      bestDate = d.toDate();
    }
  }
  return bestDate;
}

// ========== Non‑colliding time ==========
async function getNonCollidingTime(pageId, targetDate) {
  const targetMoment = moment.tz(targetDate, TIMEZONE).startOf('day');
  for (let attempt = 0; attempt < 20; attempt++) {
    const hour = Math.floor(Math.random() * (23 - 6 + 1)) + 6;
    const minute = Math.floor(Math.random() * 60);
    const slot = targetMoment.clone().set({ hour, minute, second: 0 });
    if (slot.isBefore(moment().tz(TIMEZONE))) continue;
    const existing = await AiScheduledPost.findOne({ pageId, scheduledTime: slot.toDate() });
    if (!existing) return slot.format('HH:mm');
  }
  return '12:00';
}

// ========== Topic quality ==========
async function evaluateTopicQuality(topicName, pageId) {
  const profile = await PageProfile.findOne({ pageId });
  const topicScore = qualityAssurance.scoreTopic(topicName, pageId);
  const pageFit = qualityAssurance.pageFitScore(topicName, profile, null, {});
  return { topicScore, pageFit, combined: (topicScore + pageFit) / 2 };
}

// ========== Count used angles ==========
async function getUsedAnglesCount(topicId) {
  return await AiLog.countDocuments({
    topicId: topicId,
    action: { $in: ['AUTO_POST_GENERATED', 'MANUAL_POST_CREATED'] },
  });
}

// ========== Expire topic if all angles used ==========
async function expireTopicIfComplete(topic) {
  const usedCount = await getUsedAnglesCount(topic._id);
  const totalAngles = topic.customAngles && topic.customAngles.length ? topic.customAngles.length : 5;
  if (usedCount < totalAngles) return;

  await AiTopic.findByIdAndUpdate(topic._id, { endDate: new Date() });
  const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
  if (pendingCount === 0) {
    await AiTopic.findByIdAndDelete(topic._id);
    await AiLog.deleteMany({ topicId: topic._id });
    await monitor(null, topic.pageId, null, 'TOPIC_EXPIRED_DELETED', `Topic "${topic.topicName}" – all angles used, no pending posts. Deleted.`);
  } else {
    await monitor(topic._id, topic.pageId, null, 'TOPIC_EXPIRED_PENDING', `Topic "${topic.topicName}" – all angles used, but ${pendingCount} pending posts remain.`);
  }
}

module.exports = {
  generateCustomAngles,
  generateShortTopicName,
  fetchTrendingHeadline,
  isTopicTooSimilar,
  getIntelligentStartDate,
  getNonCollidingTime,
  evaluateTopicQuality,
  getUsedAnglesCount,
  expireTopicIfComplete,
};
