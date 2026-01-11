const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');

// =======================
// MASTER DASHBOARD
// =======================
router.get('/master/summary', async (req, res) => {
  try {
    const totalPages = await Page.countDocuments();
    const totalPosts = await Post.countDocuments();
    const posted = await Post.countDocuments({ status: 'POSTED' });
    const failed = await Post.countDocuments({ status: 'FAILED' });

    const logs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('pageId');

    res.json({
      totalPages,
      totalPosts,
      posted,
      failed,
      recentLogs: logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PAGE DASHBOARD
// =======================

// Get page info
router.get('/page/:id', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    res.json(page);
  } catch (err) {
    res.status(404).json({ error: 'Page not found' });
  }
});

// Get posts for a page
router.get('/page/:id/posts', async (req, res) => {
  try {
    const posts = await Post.find({ pageId: req.params.id })
      .sort({ scheduledTime: -1 })
      .limit(100);

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create post (schedule or post-now)
router.post('/page/:id/post', async (req, res) => {
  try {
    const { text, mediaUrl, scheduledTime } = req.body;

    const post = await Post.create({
      pageId: req.params.id,
      text,
      mediaUrl,
      scheduledTime: scheduledTime || new Date(),
      status: 'PENDING'
    });

    await Log.create({
      pageId: req.params.id,
      action: 'CREATE_POST',
      message: 'Post created'
    });

    res.json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit post
router.put('/post/:postId', async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      req.body,
      { new: true }
    );

    res.json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Page logs
router.get('/page/:id/logs', async (req, res) => {
  try {
    const logs = await Log.find({ pageId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

