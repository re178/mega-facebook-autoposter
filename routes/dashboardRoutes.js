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

// -------------------- MASTER DASHBOARD SUMMARY --------------------
// Normal users see only their pages/posts; admins see everything
router.get('/master/summary', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin' ? {} : { userId: req.session.userId };

    const totalPages = await Page.countDocuments(filter);
    const pages = await Page.find(filter).select('_id'); // for post filtering

    const pageIds = pages.map(p => p._id);
    const totalPosts = await Post.countDocuments({ pageId: { $in: pageIds } });
    const posted = await Post.countDocuments({ pageId: { $in: pageIds }, status: 'POSTED' });
    const failed = await Post.countDocuments({ pageId: { $in: pageIds }, status: 'FAILED' });

    const recentLogs = await Log.find({ pageId: { $in: pageIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('pageId');

    res.json({ totalPages, totalPosts, posted, failed, recentLogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- GET ALL PAGES --------------------
router.get('/pages', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin' ? {} : { userId: req.session.userId };
    const pages = await Page.find(filter).sort({ name: 1 });
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- PAGE DASHBOARD ROUTES --------------------

// Get page info
router.get('/page/:fbId', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin'
      ? { pageId: req.params.fbId }
      : { pageId: req.params.fbId, userId: req.session.userId };

    const page = await Page.findOne(filter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get posts for page
router.get('/page/:fbId/posts', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin'
      ? { pageId: req.params.fbId }
      : { pageId: req.params.fbId, userId: req.session.userId };

    const page = await Page.findOne(filter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });

    const posts = await Post.find({ pageId: page._id })
      .sort({ scheduledTime: -1 })
      .limit(100);

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a post for page
router.post('/page/:fbId/post', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin'
      ? { pageId: req.params.fbId }
      : { pageId: req.params.fbId, userId: req.session.userId };

    const page = await Page.findOne(filter);
    if (!page) return res.status(404).json({ error: 'Page not found or not yours' });

    const { text, mediaUrl, scheduledTime } = req.body;

    const post = await Post.create({
      pageId: page._id,
      text,
      mediaUrl,
      scheduledTime: scheduledTime || new Date(),
      status: 'PENDING'
    });

    await Log.create({
      pageId: page._id,
      action: 'CREATE_POST',
      message: 'Post created'
    });

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit post
router.put('/post/:postId', requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId).populate('pageId');
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Ownership check
    if (req.session.userRole !== 'admin' && String(post.pageId.userId) !== String(req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const updated = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
router.delete('/post/:postId', requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId).populate('pageId');
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Ownership check
    if (req.session.userRole !== 'admin' && String(post.pageId.userId) !== String(req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get page logs
router.get('/page/:fbId/logs', requireLogin, async (req, res) => {
  try {
    const filter = req.session.userRole === 'admin'
      ? { pageId: req.params.fbId }
      : { pageId: req.params.fbId, userId: req.session.userId };

    const page = await Page.findOne(filter);
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
