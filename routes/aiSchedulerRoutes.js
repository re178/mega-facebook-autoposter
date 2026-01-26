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
  deleteTopicPosts,
  createAiLog
} = require('../services/aiSchedulerService');

// -------------------- AI TOPICS --------------------

// Get all AI topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    res.json(Array.isArray(topics) ? topics : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create AI topic (your new working version)
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    const { topicName, postsPerDay, times, startDate, endDate, repeatType, includeMedia } = req.body;

    // Validate topicName
    if (!topicName || !topicName.trim()) {
      return res.status(400).json({ error: 'Topic name is required' });
    }

    // Create the topic
    const topic = new AiTopic({
      pageId: req.params.pageId,
      topicName: topicName.trim(),
      postsPerDay,
      times,
      startDate,
      endDate,
      repeatType,
      includeMedia
    });

    // Save the topic
    await topic.save();

    // Create a log
    await createAiLog(
      req.params.pageId,
      topic._id,
      'TOPIC_CREATED',
      `AI topic "${topic.topicName}" was created`
    );

    // ✅ Return full topic including _id
    res.status(201).json({
      _id: topic._id,
      topicName: topic.topicName,
      postsPerDay: topic.postsPerDay,
      times: topic.times,
      startDate: topic.startDate,
      endDate: topic.endDate,
      repeatType: topic.repeatType,
      includeMedia: topic.includeMedia
    });

  } catch (err) {
    console.error('Error creating AI topic:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update AI topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findByIdAndUpdate(req.params.topicId, req.body, { new: true });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await createAiLog(
      topic.pageId,
      null,
      'TOPIC_UPDATED',
      `AI topic "${topic.topicName}" was updated`
    );

    res.json(topic);
  } catch (err) {
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
    res.status(500).json({ error: err.message });
  }
});

// -------------------- AI POST GENERATION --------------------

// Generate posts immediately (manual trigger)
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(req.params.topicId, { immediate: true });
    const topic = await AiTopic.findById(req.params.topicId);

    await createAiLog(
      topic.pageId,
      null,
      'POSTS_GENERATED',
      `${posts.length} AI posts generated for "${topic.topicName}"`
    );

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

// -------------------- SCHEDULED POSTS --------------------

// Get upcoming scheduled AI posts
router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    let posts = await AiScheduledPost.find({ pageId: req.params.pageId })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');

    if (!Array.isArray(posts)) posts = [];
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// -------------------- AI LOGS --------------------

// Get latest AI activity logs
router.get('/page/:pageId/logs', async (req, res) => {
  try {
    let logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');

    if (!Array.isArray(logs)) logs = [];
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear AI logs
router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- INDIVIDUAL POSTS --------------------

// Post Now
router.post('/post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = 'POSTED';
    post.postedAt = new Date();
    await post.save();

    await createAiLog(post.pageId, post._id, 'POSTED_NOW', 'Post manually published from dashboard');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete individual post
router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await AiScheduledPost.findByIdAndDelete(req.params.postId);
    await createAiLog(post.pageId, post._id, 'POST_DELETED', 'Individual post deleted from dashboard');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit post
router.put('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findByIdAndUpdate(
      req.params.postId,
      { text: req.body.text, mediaUrl: req.body.mediaUrl },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });

    await createAiLog(post.pageId, post._id, 'POST_EDITED', 'Post text/media updated from dashboard');
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark content type
router.patch('/post/:postId/content-type', async (req, res) => {
  try {
    const { contentType } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.contentType = contentType;
    await post.save();

    await createAiLog(post.pageId, post._id, 'CONTENT_TYPE_UPDATED', `Content type set to "${contentType}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
