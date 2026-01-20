const express = require('express');
const router = express.Router();

// MODELS
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');

// SERVICES
const {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog
} = require('../services/aiSchedulerService');

/* =========================================================
   TOPIC ROUTES
========================================================= */

// Get all AI topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 });

    // ALWAYS return array
    res.json(Array.isArray(topics) ? topics : []);
  } catch (err) {
    console.error('❌ Failed to get topics:', err.message);
    res.status(500).json([]);
  }
});

// Create AI topic
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    const topic = await AiTopic.create({
      pageId: req.params.pageId,
      ...req.body
    });

    await createAiLog(
      req.params.pageId,
      null,
      'TOPIC_CREATED',
      `AI topic "${topic.topicName || topic.name}" was created`
    );

    res.json(topic);
  } catch (err) {
    console.error('❌ Failed to create topic:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update AI topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findByIdAndUpdate(
      req.params.topicId,
      req.body,
      { new: true }
    );

    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await createAiLog(
      topic.pageId,
      null,
      'TOPIC_UPDATED',
      `AI topic "${topic.topicName}" was updated`
    );

    res.json(topic);
  } catch (err) {
    console.error('❌ Failed to update topic:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete AI topic + its posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await createAiLog(
      topic.pageId,
      null,
      'TOPIC_DELETED',
      `AI topic "${topic.topicName}" and its posts were deleted`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete topic:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   POST GENERATION
========================================================= */

// Generate posts immediately (manual trigger)
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(
      req.params.topicId,
      { immediate: true }
    );
    res.json(Array.isArray(posts) ? posts : []);
  } catch (err) {
    console.error('❌ Failed to generate posts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete all scheduled posts for topic
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete posts for topic:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   UPCOMING POSTS (PAGE SCOPED)
========================================================= */

router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    const posts = await AiScheduledPost.find({ pageId: req.params.pageId })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');

    res.json(Array.isArray(posts) ? posts : []);
  } catch (err) {
    console.error('❌ Failed to load upcoming posts:', err.message);
    res.status(500).json([]);
  }
});

// Retry failed AI post manually
router.post('/post/:postId/retry', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = 'PENDING';
    post.retryCount = 0;
    await post.save();

    await createAiLog(
      post.pageId,
      post._id,
      'RETRY_TRIGGERED',
      'Manual retry triggered from dashboard'
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to retry post:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   AI LOGS (MONITOR / CCTV)
========================================================= */

// Get latest AI activity logs (monitor feed)
router.get('/page/:pageId/logs', async (req, res) => {
  try {
    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');

    res.json(Array.isArray(logs) ? logs : []);
  } catch (err) {
    console.error('❌ Failed to load logs:', err.message);
    res.status(500).json([]);
  }
});

// Clear AI logs
router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to clear logs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
