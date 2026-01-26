const OpenAI = require('openai');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

// 🔴 LIVE MONITOR (SAFE ADD)
const { pushLive } = require('../routes/aiRoutes');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   LIVE MONITOR LOGGER (DB + LIVE)
========================================================= */
async function monitor(pageId, postId, action, message) {
  try {
    await AiLog.create({
      pageId,
      postId,
      action,
      message
    });

    // 🔴 PUSH LIVE
    pushLive(pageId, message);

  } catch (err) {
    console.error('⚠️ Monitor logging failed:', err.message);
  }
}

/* =========================================================
   CONTENT ANGLES
========================================================= */
const ANGLES = [
  'memory',
  'observation',
  'curiosity',
  'experience',
  'reflection',
  'surprise',
  'casual'
];

/* =========================================================
   CLEAN GENERATED TEXT
========================================================= */
function cleanText(text) {
  return text
    .replace(/[-_•:*#"`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* =========================================================
   PROMPT BUILDER
========================================================= */
function buildPrompt({ topic, angle, isTrending, isCritical }) {
  let base = '';

  if (isCritical) {
    base = `Write a calm, factual Facebook post about a very recent event related to ${topic}.`;
  } else if (isTrending) {
    base = `Write a natural Facebook post reacting to something people are currently talking about related to ${topic}.`;
  } else {
    const map = {
      memory: `Write a Facebook post recalling a memory related to ${topic}.`,
      observation: `Write a Facebook post sharing an everyday observation about ${topic}.`,
      curiosity: `Write a Facebook post expressing curiosity about ${topic}.`,
      experience: `Write a Facebook post describing a personal experience related to ${topic}.`,
      reflection: `Write a Facebook post reflecting quietly on ${topic}.`,
      surprise: `Write a Facebook post reacting with mild surprise about ${topic}.`,
      casual: `Write a casual Facebook post about ${topic}.`
    };
    base = map[angle] || map.casual;
  }

  return `
${base}

Rules:
Write like a human
No advice
No teaching
No lists
No emojis
No symbols
No promotional tone
No AI language
`;
}

/* =========================================================
   CORE GENERATOR (LIVE + DB MONITORED)
========================================================= */
async function generatePostsForTopic(topicId, options = {}) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');

  const page = await Page.findById(topic.pageId);
  if (!page) throw new Error('Page not found');

  await monitor(
    topic.pageId,
    null,
    'GENERATION_START',
    `🚀 AI started generating posts for "${topic.topicName}"`
  );

  const {
    postsPerDay,
    times,
    startDate,
    endDate,
    repeatType,
    includeMedia
  } = topic;

  const {
    isTrending = false,
    isCritical = false,
    immediate = false
  } = options;

  const start = immediate ? new Date() : new Date(startDate);
  const end = immediate ? new Date() : new Date(endDate);

  let angleIndex = 0;
  const createdPosts = [];

  for (let day = new Date(start); day <= end;) {

    await monitor(
      topic.pageId,
      null,
      'DAY_PROCESSING',
      `📅 Processing ${day.toDateString()}`
    );

    for (let i = 0; i < postsPerDay; i++) {

      const angle = ANGLES[angleIndex % ANGLES.length];
      angleIndex++;

      await monitor(
        topic.pageId,
        null,
        'TEXT_REQUEST',
        `✍️ Generating text (${angle})`
      );

      const textResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        temperature: 0.95,
        messages: [
          { role: 'system', content: 'You write Facebook posts that sound fully human.' },
          { role: 'user', content: buildPrompt({ topic: topic.topicName, angle, isTrending, isCritical }) }
        ],
        max_tokens: 180
      });

      const text = cleanText(textResponse.choices[0].message.content);

      let mediaUrl = null;

      if (!isCritical && includeMedia && Math.random() > 0.4) {
        await monitor(
          topic.pageId,
          null,
          'IMAGE_REQUEST',
          '🖼️ Generating image'
        );

        const image = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: `A realistic everyday photo related to ${topic.topicName}.`,
          size: '1024x1024'
        });

        mediaUrl = image.data[0].url;
      }

      const [h, m] = times[i].split(':');
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

      await monitor(
        topic.pageId,
        post._id,
        'POST_CREATED',
        `💾 Post scheduled at ${scheduledTime.toLocaleTimeString()}`
      );

      createdPosts.push(post);
    }

    if (repeatType === 'weekly') day.setDate(day.getDate() + 7);
    else if (repeatType === 'monthly') day.setMonth(day.getMonth() + 1);
    else day.setDate(day.getDate() + 1);
  }

  await monitor(
    topic.pageId,
    null,
    'GENERATION_COMPLETE',
    `✅ Finished generating ${createdPosts.length} posts`
  );

  return createdPosts;
}

/* =========================================================
   DELETE TOPIC POSTS
========================================================= */
async function deleteTopicPosts(topicId) {
  const posts = await AiScheduledPost.find({ topicId });

  for (const post of posts) {
    await monitor(post.pageId, post._id, 'POST_DELETED', '🗑 Scheduled post deleted');
  }

  await AiScheduledPost.deleteMany({ topicId });
}

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog: monitor
};
