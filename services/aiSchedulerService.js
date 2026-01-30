const mongoose = require('mongoose');
const OpenAI = require('openai');

const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   SAFE LOGGER
========================================================= */
async function monitor(topicId, pageId, postId, action, message) {
  try {
    await AiLog.create({
      topicId: topicId || null,
      pageId: pageId?.toString() || null,
      postId: postId || null,
      action,
      message
    });
  } catch (err) {
    console.error('⚠️ Monitor log failed:', err.message);
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
   CLEAN TEXT
========================================================= */
function cleanText(text = '') {
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
    base = `Write a calm, factual Facebook post about a very recent event related to ${topic}.
No opinions. No emotion. No advice.`;
  } else if (isTrending) {
    base = `Write a natural Facebook post reacting to something people are currently talking about related to ${topic}.`;
  } else {
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

  return `
${base}

Rules:
Write like a real human
No advice
No teaching
No lists
No emojis
No hashtags
No AI tone
`;
}

/* =========================================================
   CORE GENERATOR
========================================================= */
async function generatePostsForTopic(topicId, options = {}) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');

  const page = await Page.findById(topic.pageId);
  if (!page) throw new Error('Page not found');

  if (!Array.isArray(topic.times) || topic.times.length === 0)
    throw new Error('Invalid or empty posting times');

  if (!topic.postsPerDay || topic.postsPerDay < 1)
    throw new Error('postsPerDay must be greater than 0');

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
  let createdPosts = [];
  let safety = 0;

  await monitor(topic._id, topic.pageId, null, 'GENERATION_START',
    `Started generating posts for "${topic.topicName}"`);

  for (let day = new Date(start); day <= end; ) {
    if (++safety > 500) break; // hard stop

    for (let i = 0; i < postsPerDay; i++) {
      const angle = ANGLES[angleIndex % ANGLES.length];
      angleIndex++;

      await monitor(topic._id, topic.pageId, null, 'TEXT_REQUEST',
        `Generating post using angle "${angle}"`);

      let text = '';

      try {
        const response = await openai.responses.create({
          model: 'gpt-4.1-mini',
          input: [
            { role: 'system', content: 'You write Facebook posts that sound fully human.' },
            { role: 'user', content: buildPrompt({ topic: topic.topicName, angle, isTrending, isCritical }) }
          ]
        });

        text = cleanText(response.output_text);
      } catch (err) {
        await monitor(topic._id, topic.pageId, null, 'TEXT_FAILED', err.message);
        continue;
      }

      let mediaUrl = null;

      if (!isCritical && includeMedia && Math.random() > 0.4) {
        try {
          const image = await openai.images.generate({
            model: 'gpt-image-1',
            prompt: `A realistic everyday photo related to ${topic.topicName}. No text.`,
            size: '1024x1024'
          });

          mediaUrl = image.data?.[0]?.url || null;
        } catch (err) {
          await monitor(topic._id, topic.pageId, null, 'IMAGE_FAILED', err.message);
        }
      }

      const time = times[i % times.length] || '09:00';
      const [h, m] = time.split(':');

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
        meta: {
          angle,
          trending: isTrending,
          critical: isCritical
        }
      });

      createdPosts.push(post);

      await monitor(topic._id, topic.pageId, post._id, 'POST_CREATED',
        `Post scheduled for ${scheduledTime.toLocaleString()}`);
    }

    if (repeatType === 'weekly') day.setDate(day.getDate() + 7);
    else if (repeatType === 'monthly') day.setMonth(day.getMonth() + 1);
    else day.setDate(day.getDate() + 1);
  }

  await monitor(topic._id, topic.pageId, null, 'GENERATION_COMPLETE',
    `Generated ${createdPosts.length} posts.`);

  return createdPosts;
}

/* =========================================================
   DELETE POSTS
========================================================= */
async function deleteTopicPosts(topicId) {
  const posts = await AiScheduledPost.find({ topicId });

  for (const post of posts) {
    await monitor(topicId, post.pageId, post._id, 'POST_DELETED', 'Post removed');
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
