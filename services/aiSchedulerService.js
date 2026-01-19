const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const AiTopic = require('../models/AiTopic');
const { postToFacebook } = require('./../services/facebookService'); // your existing service

// Generate posts for a topic
async function generatePostsForTopic(topicId, options = { immediate: false }) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');

  const posts = [];
  const now = new Date();
  const startDate = topic.startDate || now;
  const endDate = topic.endDate || now;

  const postsPerDay = topic.postsPerDay || 1;
  const timesPerDay = topic.times || ['12:00']; // fallback if no time defined

  // Helper: generate scheduled dates based on repeat
  function getScheduledDates() {
    const dates = [];
    let current = new Date(startDate);
    while (current <= endDate) {
      dates.push(new Date(current));
      if (topic.repeatType === 'daily') current.setDate(current.getDate() + 1);
      else if (topic.repeatType === 'weekly') current.setDate(current.getDate() + 7);
      else if (topic.repeatType === 'monthly') current.setMonth(current.getMonth() + 1);
      else current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  const scheduledDates = getScheduledDates();

  for (const date of scheduledDates) {
    for (let i = 0; i < postsPerDay; i++) {
      const time = timesPerDay[i % timesPerDay.length].split(':');
      const scheduledTime = new Date(date);
      scheduledTime.setHours(parseInt(time[0]), parseInt(time[1]), 0, 0);

      // Skip past times unless immediate is true
      if (!options.immediate && scheduledTime < now) continue;

      // Generate post text dynamically based on topic
      const text = await generateTextForTopic(topic.name);

      // Optionally generate media
      let mediaUrl = '';
      if (topic.includeMedia) {
        mediaUrl = await generateMediaForTopic(topic.name);
      }

      const post = await AiScheduledPost.create({
        pageId: topic.pageId,
        topicId: topic._id,
        text,
        mediaUrl,
        scheduledTime,
        status: 'PENDING'
      });

      posts.push(post);
      await createAiLog(topic.pageId, post._id, 'POST_SCHEDULED', `Post scheduled for ${scheduledTime.toLocaleString()}`);
    }
  }

  return posts;
}

// Delete all scheduled posts for a topic
async function deleteTopicPosts(topicId) {
  const posts = await AiScheduledPost.find({ topicId });
  for (const post of posts) {
    await createAiLog(post.pageId, post._id, 'POST_DELETED', 'Scheduled post deleted');
  }
  await AiScheduledPost.deleteMany({ topicId });
}

// Create a log
async function createAiLog(pageId, postId, action, message) {
  return AiLog.create({ pageId, postId, action, message });
}

// Dummy: Generate text dynamically
async function generateTextForTopic(topicName) {
  // Here you can integrate OpenAI or other AI service
  // For now, return placeholder text dynamically based on topic
  const variations = [
    `Latest insights about ${topicName}`,
    `Did you know? Interesting facts about ${topicName}`,
    `${topicName} updates you shouldn't miss`,
    `Breaking developments on ${topicName}`,
    `Top tips regarding ${topicName}`
  ];
  return variations[Math.floor(Math.random() * variations.length)];
}

// Dummy: Generate media dynamically
async function generateMediaForTopic(topicName) {
  // Here you can integrate your image/video generation
  // For now, return empty or placeholder URL
  return `https://dummyimage.com/600x400/000/fff&text=${encodeURIComponent(topicName)}`;
}

module.exports = {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog
};
