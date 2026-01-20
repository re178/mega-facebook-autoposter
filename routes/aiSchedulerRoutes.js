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

// SCHEDULER
const { startAiScheduler } = require('../services/aiPostScheduler');

/*
|--------------------------------------------------------------------------
| START AI SCHEDULER (RUNS ONCE)
|--------------------------------------------------------------------------
*/
startAiScheduler();

/*
|--------------------------------------------------------------------------
| TOPICS (PAGE SCOPED)
|--------------------------------------------------------------------------
*/

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
      `AI topic "${topic.name}" was created`
    );

    res.json(topic);
  } catch (err) {
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

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await createAiLog(
      topic.pageId,
      null,
      'TOPIC_UPDATED',
      `AI topic "${topic.name}" was updated`
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
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await deleteTopicPosts(topic._id);
    await AiTopic.findByIdAndDelete(topic._id);

    await createAiLog(
      topic.pageId,
      null,
      'TOPIC_DELETED',
      `AI topic "${topic.name}" and its posts were deleted`
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
|--------------------------------------------------------------------------
| AI POST GENERATION
|--------------------------------------------------------------------------
*/

// Generate posts immediately (manual trigger)
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
      `${posts.length} AI posts generated for "${topic.name}"`
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all scheduled posts for topic
router.delete('/topic/:topicId/posts', async (req, res) => {
  try {
    await deleteTopicPosts(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
|--------------------------------------------------------------------------
| SCHEDULED POSTS (PAGE SCOPED)
|--------------------------------------------------------------------------
*/

// Get upcoming scheduled AI posts
router.get('/page/:pageId/upcoming-posts', async (req, res) => {
  try {
    const posts = await AiScheduledPost.find({
      pageId: req.params.pageId
    })
      .sort({ scheduledTime: 1 })
      .limit(100)
      .populate('topicId');

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry failed AI post manually
router.post('/post/:postId/retry', async (req, res) => {
  try {
    const post = await AiScheduledPost.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

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

/*
|--------------------------------------------------------------------------
| AI LOGS (MONITOR / CCTV)
|--------------------------------------------------------------------------
*/

// Get latest AI activity logs (monitor feed)
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

// Clear AI logs
router.delete('/page/:pageId/logs', async (req, res) => {
  try {
    await AiLog.deleteMany({ pageId: req.params.pageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
