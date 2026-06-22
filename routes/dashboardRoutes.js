const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiTopic = require('../models/AiTopic');

// -------------------- AUTH MIDDLEWARE --------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// =======================
// MASTER DASHBOARD SUMMARY (EXISTING – KEPT)
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// NEW: UNIFIED MASTER SUMMARY (PER‑USER)
// =======================
router.get('/master-summary', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const isAdmin = req.session.userRole === 'admin';

    let pages;
    if (isAdmin) {
      pages = await Page.find().select('pageId name _id');
    } else {
      pages = await Page.find({ userId }).select('pageId name _id');
    }

    let totalPosts = 0, posted = 0, failed = 0;
    const perPageStats = [];

    for (const page of pages) {
      const manualPosts = await Post.find({ pageId: page._id });
      const aiPosts = await AiScheduledPost.find({ pageId: page.pageId });
      const allPosts = [...manualPosts, ...aiPosts];
      const postedCount = allPosts.filter(p => p.status === 'POSTED').length;
      const failedCount = allPosts.filter(p => p.status === 'FAILED').length;
      const topics = await AiTopic.find({ pageId: page.pageId });
      totalPosts += allPosts.length;
      posted += postedCount;
      failed += failedCount;
      perPageStats.push({
        pageName: page.name,
        totalPosts: allPosts.length,
        posted: postedCount,
        failed: failedCount,
        topics: topics.length
      });
    }

    const logs = await Log.find({ userId: isAdmin ? undefined : userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('pageId', 'name');
    const recentActivity = logs.map(l => ({
      message: `${l.action} – ${l.message}`,
      time: l.createdAt
    }));

    res.json({
      pages: pages.map(p => ({ pageId: p.pageId, name: p.name })),
      totalStats: { totalPosts, posted, failed },
      perPageStats,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET ALL PAGES (EXISTING)
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
// PAGE DASHBOARD ROUTES (EXISTING)
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
    if (!text?.trim()) return res.status(400).json({ error: 'Post text is required' });

    const post = await Post.create({
      pageId: page._id,
      text,
      mediaUrl,
      scheduledTime: scheduledTime || new Date(),
      status: 'PENDING'
    });

    await Log.create({ pageId: page._id, action: 'CREATE_POST', message: 'Post created' });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit post (by MongoDB _id)
router.put('/post/:postId', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const page = await Page.findById(post.pageId);
    const isOwner = (req.session.userRole === 'admin') || (page.userId.toString() === req.session.userId);
    if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

    const updated = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
router.delete('/post/:postId', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const page = await Page.findById(post.pageId);
    const isOwner = (req.session.userRole === 'admin') || (page.userId.toString() === req.session.userId);
    if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

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

// =======================
// HELPER: canAccessPage (EXISTING)
// =======================
async function canAccessPage(facebookPageId, req) {
  const page = await Page.findOne({ pageId: facebookPageId });
  if (!page) return false;
  if (req.session.userRole === 'admin') return true;
  return page.userId.toString() === req.session.userId;
}

module.exports = router;
