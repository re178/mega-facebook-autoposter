const express = require('express');
const router = express.Router();

// MODELS
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');

// SERVICES
const {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog
} = require('../services/aiSchedulerService');

/* =========================================================
   MIDDLEWARE
========================================================= */

// Simple auth middleware
const requireLogin = (req, res, next) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
};

// Verify ownership of page or post
const verifyPageOwnership = async (req, res, next) => {
  try {
    const pageId = req.params.pageId || (await AiScheduledPost.findById(req.params.postId))?.pageId;
    if (!pageId) return res.status(404).json({ error: 'Page not found' });

    const page = await Page.findOne({ pageId, userId: req.session.userId });
    if (!page) return res.status(403).json({ error: 'Not authorized' });

    req.page = page;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* =========================================================
   HELPERS
========================================================= */

const safeJson = (res, data) => res.json(data || []);
const handleError = (res, err, status = 500) => {
  console.error(err);
  return res.status(status).json({ error: err.message || 'Server error' });
};

const logAction = async ({ pageId, topicId = null, postId = null, action, message }) => {
  try {
    await createAiLog(topicId || pageId, postId, action, message, { userId: pageId });
  } catch (err) {
    console.error('Failed to log action:', err.message);
  }
};

/* =========================================================
   ROUTES (ALL PROTECTED)
========================================================= */

router.use(requireLogin);

/* ===============================
   AI TOPICS
=============================== */

// Get topics for a page
router.get('/page/:pageId/topics', verifyPageOwnership, async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    safeJson(res, topics);
  } catch (err) { handleError(res, err); }
});

// Create topic
router.post('/page/:pageId/topic', verifyPageOwnership, async (req, res) => {
  try {
    const { topicName, postsPerDay, times, startDate, endDate, repeatType, includeMedia } = req.body;
    if (!topicName?.trim()) return handleError(res, new Error('Topic name is required'), 400);

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

    await logAction({
      pageId: req.params.pageId,
      topicId: topic._id,
      action: 'TOPIC_CREATED',
      message: `Topic "${topic.topicName}" created`
    });

    res.status(201).json(topic);
  } catch (err) { handleError(res, err); }
});

// Update topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    const page = await Page.findOne({ pageId: topic.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    const updated = await AiTopic.findByIdAndUpdate(req.params.topicId, req.body, { new: true });

    await logAction({
      pageId: page.pageId,
      topicId: topic._id,
      action: 'TOPIC_UPDATED',
      message: `Topic "${topic.topicName}" updated`
    });

    res.json(updated);
  } catch (err) { handleError(res, err); }
});

// Delete topic + posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    const page = await Page.findOne({ pageId: topic.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await logAction({
      pageId: page.pageId,
      topicId: topic._id,
      action: 'TOPIC_DELETED',
      message: `Topic "${topic.topicName}" deleted`
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   POST GENERATION
=============================== */

// Generate immediately
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    const page = await Page.findOne({ pageId: topic.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    const posts = await generatePostsForTopic(topic._id, { immediate: true });

    await logAction({
      pageId: page.pageId,
      action: 'POSTS_GENERATED',
      message: `${posts.length} posts generated`
    });

    res.json(posts);
  } catch (err) { handleError(res, err); }
});

// Delete all topic posts
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    const page = await Page.findOne({ pageId: topic.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    await deleteTopicPosts(topic._id);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   SCHEDULED POSTS
=============================== */

// Get upcoming posts
router.get('/page/:pageId/upcoming-posts', verifyPageOwnership, async (req, res) => {
  try {
    const posts = await AiScheduledPost.find({ pageId: req.params.pageId })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');
    safeJson(res, posts);
  } catch (err) { handleError(res, err); }
});

// Retry post
router.post('/post/:postId/retry', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    const page = await Page.findOne({ pageId: post.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    post.status = 'PENDING';
    post.retryCount = 0;
    await post.save();

    await logAction({
      pageId: page.pageId,
      postId: post._id,
      action: 'RETRY_TRIGGERED',
      message: 'Manual retry'
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   LOGS
=============================== */

router.get('/page/:pageId/logs', verifyPageOwnership, async (req, res) => {
  try {
    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');
    safeJson(res, logs);
  } catch (err) { handleError(res, err); }
});

router.delete('/page/:pageId/logs', verifyPageOwnership, async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   INDIVIDUAL POSTS
=============================== */

// Post now
router.post('/post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    const page = await Page.findOne({ pageId: post.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    post.status = 'POSTED';
    post.postedAt = new Date();
    await post.save();

    await logAction({
      pageId: page.pageId,
      postId: post._id,
      action: 'POSTED_NOW',
      message: 'Post manually published'
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    const page = await Page.findOne({ pageId: post.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    await post.deleteOne();
    await logAction({
      pageId: page.pageId,
      postId: post._id,
      action: 'POST_DELETED',
      message: 'Post deleted manually'
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

// Edit post
router.put('/post/:postId', async (req, res) => {
  try {
    const { text, mediaUrl } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    const page = await Page.findOne({ pageId: post.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    post.text = text ?? post.text;
    post.mediaUrl = mediaUrl ?? post.mediaUrl;
    await post.save();

    await logAction({
      pageId: page.pageId,
      postId: post._id,
      action: 'POST_EDITED',
      message: 'Post edited manually'
    });

    res.json(post);
  } catch (err) { handleError(res, err); }
});

// Set content type
router.patch('/post/:postId/content-type', async (req, res) => {
  try {
    const { contentType } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    const page = await Page.findOne({ pageId: post.pageId, userId: req.session.userId });
    if (!page) return handleError(res, new Error('Not authorized'), 403);

    post.contentType = contentType;
    await post.save();

    await logAction({
      pageId: page.pageId,
      postId: post._id,
      action: 'CONTENT_TYPE_UPDATED',
      message: `Content type set to ${contentType}`
    });

    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   AUTO-GENERATION
=============================== */

router.get('/page/:pageId/auto-generation', verifyPageOwnership, async (req, res) => {
  try {
    res.json({ enabled: req.page.autoGenerationEnabled });
  } catch (err) { handleError(res, err); }
});

router.post('/page/:pageId/auto-generation', verifyPageOwnership, async (req, res) => {
  try {
    const { enabled } = req.body;
    req.page.autoGenerationEnabled = !!enabled;
    await req.page.save();
    res.json({ enabled: req.page.autoGenerationEnabled });
  } catch (err) { handleError(res, err); }
});

/* ===============================
   PAGE PROFILE CRUD
=============================== */

router.get('/page/:pageId/profile', verifyPageOwnership, async (req, res) => {
  try {
    const profile = await PageProfile.findOne({ pageId: req.params.pageId });
    safeJson(res, profile);
  } catch (err) { handleError(res, err); }
});

router.post('/page/:pageId/profile', verifyPageOwnership, async (req, res) => {
  try {
    const { name, tone, writingStyle, voice, audienceTone, audienceAge, audienceInterest, extraNotes } = req.body;

    const profile = await PageProfile.findOneAndUpdate(
      { pageId: req.params.pageId },
      { name, tone, writingStyle, voice, audienceTone, audienceAge, audienceInterest, extraNotes },
      { new: true, upsert: true }
    );

    await logAction({ pageId: req.params.pageId, action: 'PROFILE_UPDATED', message: 'Page profile saved/updated' });

    res.json(profile);
  } catch (err) { handleError(res, err); }
});

router.delete('/page/:pageId/profile', verifyPageOwnership, async (req, res) => {
  try {
    await PageProfile.deleteOne({ pageId: req.params.pageId });
    await logAction({ pageId: req.params.pageId, action: 'PROFILE_DELETED', message: 'Page profile deleted' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
