const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');

// =======================
// GET PAGE INFO
// =======================
router.get('/:id', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET PAGE POSTS
// =======================
router.get('/:id/posts', async (req, res) => {
  try {
    const posts = await Post.find({ pageId: req.params.id })
      .sort({ scheduledTime: -1 })
      .limit(100);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// CREATE POST
// =======================
router.post('/:id/post', async (req, res) => {
  try {
    const { text, mediaUrl, scheduledTime } = req.body;
    const post = await Post.create({
      pageId: req.params.id,
      text,
      mediaUrl,
      scheduledTime,
      status: 'PENDING'
    });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// EDIT POST
// =======================
router.put('/post/:postId', async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE POST
// =======================
router.delete('/post/:postId', async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET PAGE LOGS
// =======================
router.get('/:id/logs', async (req, res) => {
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
