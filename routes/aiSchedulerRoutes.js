const express = require('express');
const router = express.Router();

// Models
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');

const generatingTopics = new Set();
// Services (updated with new exports)
const {
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog,
  createManualTopicWithQA,
  generatePostsForManualTopic
} = require('../services/aiSchedulerService');

// Helper: Check if user can access page (by Facebook pageId)
async function canAccessPage(facebookPageId, req) {
  const page = await Page.findOne({ pageId: facebookPageId });
  if (!page) return false;
  const isAdmin = req.session.userRole === 'admin';
  return isAdmin || page.userId.toString() === req.session.userId;
}

// Helper: Get Facebook pageId from topicId
async function getFacebookPageIdFromTopic(topicId) {
  const topic = await AiTopic.findById(topicId);
  return topic ? topic.pageId : null;
}

// Unified response helpers
const safeJson = (res, data) => res.json(data || []);
const handleError = (res, err, status = 500) => {
  console.error(err);
  return res.status(status).json({ error: err.message || 'Server error' });
};

// Logging wrapper
const logAction = async ({ pageId, topicId = null, postId = null, action, message }) => {
  try { await createAiLog(pageId, postId, action, message); } 
  catch (err) { console.error('Failed to log action:', err.message); }
};

/* =========================================================
   AI TOPICS
========================================================= */

// Get topics for a page
router.get('/page/:pageId/topics', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });
    const topics = await AiTopic.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    safeJson(res, topics);
  } catch (err) { handleError(res, err); }
});

// Create topic (UPDATED to use createManualTopicWithQA)
router.post('/page/:pageId/topic', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    let { topicName, postsPerDay, times, startDate, endDate, repeatType, includeMedia, includeVideo } = req.body;
    if (!topicName?.trim()) return handleError(res, new Error('Topic name is required'), 400);

    if (!startDate || !endDate) return handleError(res, new Error('Start and end dates are required'), 400);
    if (new Date(endDate) < new Date(startDate))
      return handleError(res, new Error('End date cannot be before start date'), 400);

    if (!Array.isArray(times) || times.length === 0 || times.some(t => !t))
      return handleError(res, new Error('At least one valid time is required'), 400);

    if (includeVideo === true) includeMedia = false;
    else if (includeMedia === true) includeVideo = false;

    // Use the enhanced manual topic creation (generates custom angles automatically)
    const result = await createManualTopicWithQA(
      req.params.pageId,
      topicName.trim(),
      startDate,
      endDate,
      times,
      postsPerDay,
      includeMedia || false,
      includeVideo || false
    );

    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    const topic = result.topic;

    await logAction({ pageId: req.params.pageId, topicId: topic._id, action: 'TOPIC_CREATED', message: `Topic "${topic.topicName}" created with angles: ${result.customAngles?.join(', ')}` });
    res.status(201).json(topic);
  } catch (err) { handleError(res, err); }
});

// Update topic
router.put('/topic/:topicId', async (req, res) => {
  try {
    const facebookPageId = await getFacebookPageIdFromTopic(req.params.topicId);
    if (!facebookPageId || !(await canAccessPage(facebookPageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    let { includeMedia, includeVideo, startDate, endDate, times, ...otherFields } = req.body;

    if (startDate && endDate && new Date(endDate) < new Date(startDate))
      return handleError(res, new Error('End date cannot be before start date'), 400);
    if (times && (!Array.isArray(times) || times.length === 0 || times.some(t => !t)))
      return handleError(res, new Error('At least one valid time is required'), 400);
    if (includeVideo === true) includeMedia = false;
    else if (includeMedia === true) includeVideo = false;

    const updateData = { ...otherFields, includeMedia, includeVideo, startDate, endDate, times };
    const topic = await AiTopic.findByIdAndUpdate(req.params.topicId, updateData, { new: true });
    if (!topic) return handleError(res, new Error('Topic not found'), 404);

    await logAction({ pageId: topic.pageId, topicId: topic._id, action: 'TOPIC_UPDATED', message: `Topic "${topic.topicName}" updated` });
    res.json(topic);
  } catch (err) { handleError(res, err); }
});

// Delete topic + posts
router.delete('/topic/:topicId', async (req, res) => {
  try {
    const facebookPageId = await getFacebookPageIdFromTopic(req.params.topicId);
    if (!facebookPageId || !(await canAccessPage(facebookPageId, req)))
      return res.status(403).json({ error: 'Access denied' });

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
router.post('/topic/:topicId/generate-now', async (req, res) => {
  console.log(`[DEBUG] Generate request for topic ${req.params.topicId}`);
  try {
    const facebookPageId = await getFacebookPageIdFromTopic(req.params.topicId);
    if (!facebookPageId || !(await canAccessPage(facebookPageId, req))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (generatingTopics.has(req.params.topicId)) {
      return res.status(429).json({ error: 'Generation already in progress' });
    }

    generatingTopics.add(req.params.topicId);
    console.log(`[DEBUG] Calling generatePostsForTopic...`);
    
    const posts = await generatePostsForTopic(req.params.topicId, { immediate: true });
    
    generatingTopics.delete(req.params.topicId);
    console.log(`[DEBUG] Generation successful, ${posts.length} posts created`);
    
    const topic = await AiTopic.findById(req.params.topicId);
    await logAction({ pageId: topic.pageId, action: 'POSTS_GENERATED', message: `${posts.length} posts generated` });
    res.json(posts);
  } catch (err) {
    generatingTopics.delete(req.params.topicId);
    // FULL ERROR DETAILS
    console.error('🔥🔥🔥 GENERATION FAILED 🔥🔥🔥');
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('Full error object:', err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});
// Delete all topic posts
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    const facebookPageId = await getFacebookPageIdFromTopic(req.params.topicId);
    if (!facebookPageId || !(await canAccessPage(facebookPageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   SCHEDULED POSTS
========================================================= */

router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const posts = await AiScheduledPost.find({ pageId: req.params.pageId })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');
    safeJson(res, posts);
  } catch (err) { handleError(res, err); }
});

router.post('/post/:postId/retry', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);
    if (!(await canAccessPage(post.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

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
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const logs = await AiLog.find({ pageId: req.params.pageId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('postId');
    safeJson(res, logs);
  } catch (err) { handleError(res, err); }
});

router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   INDIVIDUAL POSTS
========================================================= */

router.post('/post/:postId/post-now', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);
    if (!(await canAccessPage(post.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    post.status = 'POSTED';
    post.postedAt = new Date();
    await post.save();

    await logAction({ pageId: post.pageId, postId: post._id, action: 'POSTED_NOW', message: 'Post manually published' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);
    if (!(await canAccessPage(post.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    await post.deleteOne();
    await logAction({ pageId: post.pageId, postId: post._id, action: 'POST_DELETED', message: 'Post deleted manually' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

router.put('/post/:postId', async (req, res) => {
  try {
    const { text, mediaUrl } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);
    if (!(await canAccessPage(post.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const updated = await AiScheduledPost.findByIdAndUpdate(req.params.postId, { text, mediaUrl }, { new: true });
    await logAction({ pageId: post.pageId, postId: post._id, action: 'POST_EDITED', message: 'Post edited manually' });
    res.json(updated);
  } catch (err) { handleError(res, err); }
});

router.patch('/post/:postId/content-type', async (req, res) => {
  try {
    const { contentType } = req.body;
    const post = await AiScheduledPost.findById(req.params.postId);
    if (!post) return handleError(res, new Error('Post not found'), 404);
    if (!(await canAccessPage(post.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    post.contentType = contentType;
    await post.save();

    await logAction({ pageId: post.pageId, postId: post._id, action: 'CONTENT_TYPE_UPDATED', message: `Content type set to ${contentType}` });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   AUTO-GENERATION TOGGLE
========================================================= */

router.get('/page/:pageId/auto-generation', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const page = await Page.findOne({ pageId: req.params.pageId });
    if (!page) return handleError(res, new Error('Page not found'), 404);
    res.json({ enabled: page.autoGenerationEnabled });
  } catch (err) { handleError(res, err); }
});

router.post('/page/:pageId/auto-generation', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const { enabled } = req.body;
    const page = await Page.findOneAndUpdate(
      { pageId: req.params.pageId },
      { autoGenerationEnabled: !!enabled },
      { new: true }
    );
    if (!page) return handleError(res, new Error('Page not found'), 404);
    res.json({ enabled: page.autoGenerationEnabled });
  } catch (err) { handleError(res, err); }
});

/* =========================================================
   PAGE PROFILE CRUD
========================================================= */

router.get('/page/:pageId/profile', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const profile = await PageProfile.findOne({ pageId: req.params.pageId });
    safeJson(res, profile);
  } catch (err) { handleError(res, err); }
});

router.post('/page/:pageId/profile', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

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

router.delete('/page/:pageId/profile', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.pageId, req)))
      return res.status(403).json({ error: 'Access denied' });

    await PageProfile.deleteOne({ pageId: req.params.pageId });
    await logAction({ pageId: req.params.pageId, action: 'PROFILE_DELETED', message: 'Page profile deleted' });
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
