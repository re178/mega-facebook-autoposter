const express = require('express');
const router = express.Router();

const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');

const { generatePostsForTopic, deleteTopicPosts, createAiLog } = require('../services/aiSchedulerService');
const { startAiPostScheduler } = require('../schedulers/aiPostScheduler');

// ---------------------------
// START SCHEDULER (once server starts)
// ---------------------------
startAiPostScheduler();

// ---------------------------
// TOPIC ROUTES
// ---------------------------

// Get all topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new topic
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    const topic = await AiTopic.create({ pageId: req.params.pageId, ...req.body });
    await createAiLog(req.params.pageId, null, 'TOPIC_CREATED', `Topic '${topic.name}' created`);
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findByIdAndUpdate(req.params.topicId, req.body, { new: true });
    await createAiLog(topic.pageId, null, 'TOPIC_UPDATED', `Topic '${topic.name}' updated`);
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a topic and its scheduled posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await deleteTopicPosts(topic._id); // deletes scheduled posts and logs
    await AiTopic.findByIdAndDelete(topic._id);
    await createAiLog(topic.pageId, null, 'TOPIC_DELETED', `Topic '${topic.name}' deleted`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// SCHEDULED POSTS ROUTES
// ---------------------------

// Get upcoming posts for a page
router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    const posts = await AiScheduledPost.find({ pageId: req.params.pageId })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate posts immediately for a topic
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(req.params.topicId, { immediate: true });
    const topic = await AiTopic.findById(req.params.topicId);
    await createAiLog(topic.pageId, null, 'POST_GENERATED_NOW', `Generated ${posts.length} posts for topic '${topic.name}'`);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all scheduled posts for a topic
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// LOGS ROUTES
// ---------------------------

// Get latest 5 logs for a page
router.get('/page/:pageId/logs', async (req, res) => {
  try {
    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('postId');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all logs for a page
router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
