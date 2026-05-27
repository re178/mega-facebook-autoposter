const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');

// Helper: check if user can access a page (by Facebook pageId)
async function canAccessPage(facebookPageId, req) {
  const page = await Page.findOne({ pageId: facebookPageId });
  if (!page) return false;
  const isAdmin = req.session.userRole === 'admin';
  return isAdmin || page.userId.toString() === req.session.userId;
}

// Helper: get page MongoDB _id from postId and check ownership indirectly
async function canAccessPost(postId, req) {
  const post = await Post.findById(postId);
  if (!post) return false;
  const page = await Page.findById(post.pageId);
  if (!page) return false;
  const isAdmin = req.session.userRole === 'admin';
  return isAdmin || page.userId.toString() === req.session.userId;
}

// =======================
// MASTER DASHBOARD SUMMARY
// =======================
router.get('/master/summary', async (req, res) => {
  try {
    const totalPages = await Page.countDocuments();
    const totalPosts = await Post.countDocuments();
    const posted = await Post.countDocuments({ status: 'POSTED' });
    const failed = await Post.countDocuments({ status: 'FAILED' });

    const recentLogs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('pageId');

    res.json({ totalPages, totalPosts, posted, failed, recentLogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET ALL PAGES (for master dashboard navigation)
// =======================
router.get('/pages', async (req, res) => {
  try {
    let pages;
    if (req.session.userRole === 'admin') {
      pages = await Page.find().sort({ name: 1 });
    } else {
      pages = await Page.find({ userId: req.session.userId }).sort({ name: 1 });
    }
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PAGE DASHBOARD ROUTES (using Facebook pageId from frontend)
// =======================

// Get page info
router.get('/page/:fbId', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.fbId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const page = await Page.findOne({ pageId: req.params.fbId });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get posts for page
router.get('/page/:fbId/posts', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.fbId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const page = await Page.findOne({ pageId: req.params.fbId });
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const posts = await Post.find({ pageId: page._id })
      .sort({ scheduledTime: -1 })
      .limit(100);

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a post for page
router.post('/page/:fbId/post', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.fbId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const page = await Page.findOne({ pageId: req.params.fbId });
    if (!page) return res.status(404).json({ error: 'Page not found' });

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

// Edit post (must belong to a page owned by user)
router.put('/post/:postId', async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.postId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const post = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.postId, req)))
      return res.status(403).json({ error: 'Access denied' });

    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get page logs
router.get('/page/:fbId/logs', async (req, res) => {
  try {
    if (!(await canAccessPage(req.params.fbId, req)))
      return res.status(403).json({ error: 'Access denied' });

    const page = await Page.findOne({ pageId: req.params.fbId });
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const logs = await Log.find({ pageId: page._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
