// ==========================
// routes/aiSchedulerRoutes.js
// Fully integrated for pageAi.js frontend
// Supports topics, posts, post-now, retry, delete, mark content, and logs
// ==========================
const express = require('express');
const router = express.Router();

// MODELS
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');

// SERVICES
const {
  generatePostsForTopic,
  deleteTopicPosts
} = require('../services/aiSchedulerService');

// =================================================
// TOPICS
// =================================================

// Get all AI topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new AI topic
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    const topic = await AiTopic.create({
      pageId: req.params.pageId,
      ...req.body
    });

    await AiLog.create({
      pageId: req.params.pageId,
      postId: null,
      action: 'TOPIC_CREATED',
      message: `AI topic "${topic.topicName}" created`
    });

    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findByIdAndUpdate(
      req.params.topicId,
      req.body,
      { new: true }
    );
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await AiLog.create({
      pageId: topic.pageId,
      postId: null,
      action: 'TOPIC_UPDATED',
      message: `AI topic "${topic.topicName}" updated`
    });

    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete topic + all its posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await AiLog.create({
      pageId: topic.pageId,
      postId: null,
      action: 'TOPIC_DELETED',
      message: `AI topic "${topic.topicName}" and its posts deleted`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================
// POST GENERATION
// =================================================

// Generate posts now for topic (manual trigger)
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(req.params.topicId, { immediate: true });
    const topic = await AiTopic.findById(req.params.topicId);

    await AiLog.create({
      pageId: topic.pageId,
      postId: null,
      action: 'POSTS_GENERATED',
      message: `${posts.length} AI posts generated for "${topic.topicName}"`
    });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all posts for topic
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================
// SCHEDULED POSTS (PAGE SCOPED)
// =================================================

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

// Retry failed post
router.post('/post/:postId/retry', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = 'PENDING';
    post.retryCount = 0;
    await post.save();

    await AiLog.create({
      pageId: post.pageId,
      postId: post._id,
      action: 'RETRY_TRIGGERED',
      message: 'Manual retry triggered from dashboard'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a single AI post
router.delete('/ai-post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await AiLog.create({
      pageId: post.pageId,
      postId: post._id,
      action: 'POST_DELETED',
      message: 'AI post deleted manually'
    });

    await post.remove();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post now (manual trigger)
router.post('/ai-post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = 'POSTED';
    await post.save();

    await AiLog.create({
      pageId: post.pageId,
      postId: post._id,
      action: 'POST_NOW',
      message: 'AI post manually published'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark post content (normal/trending/critical)
router.post('/ai-post/:postId/mark', async (req, res) => {
  try {
    const { type } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.contentType = type.toUpperCase();
    await post.save();

    await AiLog.create({
      pageId: post.pageId,
      postId: post._id,
      action: 'CONTENT_MARKED',
      message: `Post marked as ${type.toUpperCase()}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================
// LOGS
// =================================================

// Get page logs (monitor feed)
router.get('/page/:pageId/logs', async (req, res) => {
  try {
    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear logs
router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
