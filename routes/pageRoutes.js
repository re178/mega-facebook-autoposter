const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');

// -------------------- AUTH MIDDLEWARE --------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// =======================
// GET PAGE INFO
// =======================
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const pageFilter = req.session.userRole === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.session.userId };

    const page = await Page.findOne(pageFilter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET PAGE POSTS
// =======================
router.get('/:id/posts', requireLogin, async (req, res) => {
  try {
    const pageFilter = req.session.userRole === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.session.userId };

    const page = await Page.findOne(pageFilter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });

    const posts = await Post.find({ pageId: page._id })
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
router.post('/:id/post', requireLogin, async (req, res) => {
  try {
    const pageFilter = req.session.userRole === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.session.userId };

    const page = await Page.findOne(pageFilter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });

    const { text, mediaUrl, scheduledTime } = req.body;
    const post = await Post.create({
      pageId: page._id,
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
router.put('/post/:postId', requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const page = await Page.findById(post.pageId);
    if (req.session.userRole !== 'admin' && String(page.userId) !== String(req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const updated = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE POST
// =======================
router.delete('/post/:postId', requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const page = await Page.findById(post.pageId);
    if (req.session.userRole !== 'admin' && String(page.userId) !== String(req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET PAGE LOGS
// =======================
router.get('/:id/logs', requireLogin, async (req, res) => {
  try {
    const pageFilter = req.session.userRole === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.session.userId };

    const page = await Page.findOne(pageFilter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });

    const logs = await Log.find({ pageId: page._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
