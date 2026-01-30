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

/* =========================================================
   HELPERS
========================================================= */

const safeJson = (res, data) => res.json(data || []);

const handleError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: err.message || 'Server error' });
};

/* =========================================================
   AI TOPICS
========================================================= */

// Get topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 });

    safeJson(res, topics);
  } catch (err) {
    handleError(res, err);
  }
});

// Create topic
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    const {
      topicName,
      postsPerDay,
      times,
      startDate,
      endDate,
      repeatType,
      includeMedia
    } = req.body;

    if (!topicName?.trim())
      return res.status(400).json({ error: 'Topic name is required' });

    const topic = await AiTopic.create({
      pageId: req.params.pageId,
      topicName: topicName.trim(),
      postsPerDay,
      times,
      startDate,
      endDate,
      repeatType,
      includeMedia
    });

    await createAiLog(
      req.params.pageId,
      topic._id,
      'TOPIC_CREATED',
      `Topic "${topic.topicName}" created`
    );

    res.status(201).json(topic);
  } catch (err) {
    handleError(res, err);
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

    if (!topic)
      return res.status(404).json({ error: 'Topic not found' });

    await createAiLog(
      topic.pageId,
      topic._id,
      'TOPIC_UPDATED',
      `Topic "${topic.topicName}" updated`
    );

    res.json(topic);
  } catch (err) {
    handleError(res, err);
  }
});

// Delete topic + posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await createAiLog(
      topic.pageId,
      topic._id,
      'TOPIC_DELETED',
      `Topic "${topic.topicName}" deleted`
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* =========================================================
   POST GENERATION
========================================================= */

// Generate immediately
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(
      req.params.topicId,
      { immediate: true }
    );

    const topic = await AiTopic.findById(req.params.topicId);

    await createAiLog(
      topic.pageId,
      null,
      'POSTS_GENERATED',
      `${posts.length} posts generated`
    );

    res.json(posts);
  } catch (err) {
    handleError(res, err);
  }
});

// Delete all topic posts
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* =========================================================
   SCHEDULED POSTS
========================================================= */

// Get upcoming posts
router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    const posts = await AiScheduledPost.find({
      pageId: req.params.pageId
    })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');

    safeJson(res, posts);
  } catch (err) {
    handleError(res, err);
  }
});

// Retry post
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
      'Manual retry'
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* =========================================================
   LOGS
========================================================= */

router.get('/page/:pageId/logs', async (req, res) => {
  try {
    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');

    safeJson(res, logs);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* =========================================================
   INDIVIDUAL POSTS
========================================================= */

// Post now
router.post('/post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = 'POSTED';
    post.postedAt = new Date();
    await post.save();

    await createAiLog(
      post.pageId,
      post._id,
      'POSTED_NOW',
      'Post manually published'
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await post.deleteOne();

    await createAiLog(
      post.pageId,
      post._id,
      'POST_DELETED',
      'Post deleted manually'
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Edit post
router.put('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findByIdAndUpdate(
      req.params.postId,
      {
        text: req.body.text,
        mediaUrl: req.body.mediaUrl
      },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });

    await createAiLog(
      post.pageId,
      post._id,
      'POST_EDITED',
      'Post edited manually'
    );

    res.json(post);
  } catch (err) {
    handleError(res, err);
  }
});

// Set content type
router.patch('/post/:postId/content-type', async (req, res) => {
  try {
    const { contentType } = req.body;

    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.contentType = contentType;
    await post.save();

    await createAiLog(
      post.pageId,
      post._id,
      'CONTENT_TYPE_UPDATED',
      `Content type set to ${contentType}`
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
