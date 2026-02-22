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
  createAiLog,
  setAutoGeneration,
  getAutoGeneration
} = require('../services/aiSchedulerService');

/* =========================================================
   HELPERS
========================================================= */

// Unified response helpers
const safeJson = (res, data) => res.json(data || []);
const handleError = (res, err, status = 500) => {
  console.error(err);
  return res.status(status).json({ error: err.message || 'Server error' });
};

// Logging wrapper
const logAction = async ({ pageId, topicId = null, postId = null, action, message }) => {
  try { await createAiLog(topicId || pageId, postId, action, message); } 
  catch (err) { console.error('Failed to log action:', err.message); }
};

/* =========================================================
   AI TOPICS
========================================================= */

// Get topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    const topics = await AiTopic.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    safeJson(res, topics);
  } catch (err) {
    handleError(res, err);
  }
});

// Create topic
router.post('/page/:pageId/topic', async (req, res) => {
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

    await logAction({ pageId: req.params.pageId, topicId: topic._id, action: 'TOPIC_CREATED', message: `Topic "${topic.topicName}" created` });
    res.status(201).json(topic);
  } catch (err) { handleError(res, err); }
});

// Update topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findByIdAndUpdate(req.params.topicId, req.body, { new: true });
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    await logAction({ pageId: topic.pageId, topicId: topic._id, action: 'TOPIC_UPDATED', message: `Topic "${topic.topicName}" updated` });
    res.json(topic);
  } catch (err) { handleError(res, err); }
});

// Delete topic + posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const topic = await AiTopic.findById(req.params.topicId);
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await logAction({ pageId: topic.pageId, topicId: topic._id, action: 'TOPIC_DELETED', message: `Topic "${topic.topicName}" deleted` });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   POST GENERATION
========================================================= */

// Generate immediately
router.post('/topic/:topicId/generate-now', async (req, res) => {
  try {
    const posts = await generatePostsForTopic(req.params.topicId, { immediate: true });
    const topic = await AiTopic.findById(req.params.topicId);

    await logAction({ pageId: topic.pageId, action: 'POSTS_GENERATED', message: `${posts.length} posts generated` });
    res.json(posts);
  } catch (err) { handleError(res, err); }
});

// Delete all topic posts
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   SCHEDULED POSTS
========================================================= */

// Get upcoming posts
router.get('/page/:pageId/upcoming-posts', async (req, res) => {
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

    post.status = 'PENDING';
    post.retryCount = 0;
    await post.save();

    await logAction({ pageId: post.pageId, postId: post._id, action: 'RETRY_TRIGGERED', message: 'Manual retry' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
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
  } catch (err) { handleError(res, err); }
});

router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   INDIVIDUAL POSTS
========================================================= */

// Post now
router.post('/post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    post.status = 'POSTED';
    post.postedAt = new Date();
    await post.save();

    await logAction({ pageId: post.pageId, postId: post._id, action: 'POSTED_NOW', message: 'Post manually published' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    await post.deleteOne();
    await logAction({ pageId: post.pageId, postId: post._id, action: 'POST_DELETED', message: 'Post deleted manually' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

// Edit post
router.put('/post/:postId', async (req, res) => {
  try {
    const { text, mediaUrl } = req.body;
    const post = await AiScheduledPost.findByIdAndUpdate(req.params.postId, { text, mediaUrl }, { new: true });
    if (!post) return handleError(res, new Error('Post not found'), 404);

    await logAction({ pageId: post.pageId, postId: post._id, action: 'POST_EDITED', message: 'Post edited manually' });
    res.json(post);
  } catch (err) { handleError(res, err); }
});

// Set content type
router.patch('/post/:postId/content-type', async (req, res) => {
  try {
    const { contentType } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);

    post.contentType = contentType;
    await post.save();

    await logAction({ pageId: post.pageId, postId: post._id, action: 'CONTENT_TYPE_UPDATED', message: `Content type set to ${contentType}` });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});
/* =========================================================
   AUTO-GENERATION TOGGLE
========================================================= */

let AUTO_GENERATION_ENABLED = false;

// Get current state
router.get('/auto-generation/state', (req, res) => {
  res.json({ enabled: AUTO_GENERATION_ENABLED });
});

// Toggle state
router.post('/auto-generation/toggle', (req, res) => {
  const { enabled } = req.body;
  AUTO_GENERATION_ENABLED = !!enabled;
  res.json({ enabled: AUTO_GENERATION_ENABLED });
});

/* =========================================================
   PAGE PROFILE CRUD
========================================================= */

// Get PageProfile for a page
router.get('/page/:pageId/profile', async (req, res) => {
  try {
    const profile = await PageProfile.findOne({ pageId: req.params.pageId });
    safeJson(res, profile);
  } catch (err) { handleError(res, err); }
});

// Create or update profile
router.post('/page/:pageId/profile', async (req, res) => {
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

// Delete profile
router.delete('/page/:pageId/profile', async (req, res) => {
  try {
    await PageProfile.deleteOne({ pageId: req.params.pageId });
    await logAction({ pageId: req.params.pageId, action: 'PROFILE_DELETED', message: 'Page profile deleted' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

module.exports = router;

