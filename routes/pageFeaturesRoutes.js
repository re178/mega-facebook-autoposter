// routes/pageFeaturesRoutes.js
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/auth'); // We'll use your existing login middleware
const Page = require('../models/Page');
const Post = require('../models/Post');
const Message = require('../models/Message');
const Template = require('../models/Template');
const Ad = require('../models/Ad');
const Comment = require('../models/Comment');
const { postToFacebook } = require('../services/FacebookService');

// =========================
// POSTS
// =========================
router.get('/page/:pageId/posts', requireLogin, async (req, res) => {
  try {
    const posts = await Post.find({ pageId: req.params.pageId }).sort({ scheduledTime: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/post', requireLogin, async (req, res) => {
  try {
    const { text, mediaUrl, scheduledTime } = req.body;
    const page = await Page.findOne({ pageId: req.params.pageId });
    if (!page) return res.status(404).json({ error: 'Page not found' });

    // Post to Facebook immediately if scheduledTime is in the past or now
    let status = 'SCHEDULED';
    const postTime = scheduledTime ? new Date(scheduledTime) : new Date();
    if (postTime <= new Date()) {
      await postToFacebook(page.pageId, page.pageToken, text, mediaUrl);
      status = 'POSTED';
    }

    const post = await Post.create({
      pageId: req.params.pageId,
      text,
      mediaUrl,
      scheduledTime: postTime,
      status
    });

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/post/:postId', requireLogin, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.postId, req.body, { new: true });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/post/:postId', requireLogin, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// MESSAGES / INBOX
// =========================
router.get('/page/:pageId/messages', requireLogin, async (req, res) => {
  try {
    const messages = await Message.find({ pageId: req.params.pageId }).sort({ receivedAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/message', requireLogin, async (req, res) => {
  try {
    const { messageId, replyText } = req.body;
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const page = await Page.findOne({ pageId: req.params.pageId });
    await postToFacebook(page.pageId, page.pageToken, replyText);

    message.status = 'REPLIED';
    await message.save();

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// TEMPLATES / AUTO-REPLIES
// =========================
router.get('/page/:pageId/templates', requireLogin, async (req, res) => {
  try {
    const templates = await Template.find({ pageId: req.params.pageId });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/templates', requireLogin, async (req, res) => {
  try {
    const template = await Template.create({ pageId: req.params.pageId, ...req.body });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/template/:templateId', requireLogin, async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.templateId, req.body, { new: true });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/template/:templateId', requireLogin, async (req, res) => {
  try {
    await Template.findByIdAndDelete(req.params.templateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// ADS / CAMPAIGNS
// =========================
router.get('/page/:pageId/ads', requireLogin, async (req, res) => {
  try {
    const ads = await Ad.find({ pageId: req.params.pageId });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/ad', requireLogin, async (req, res) => {
  try {
    const ad = await Ad.create({ pageId: req.params.pageId, ...req.body });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/page/:adId/ad', requireLogin, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.adId, req.body, { new: true });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/page/:adId/ad', requireLogin, async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.adId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// COMMENTS / MODERATION
// =========================
router.get('/page/:pageId/comments', requireLogin, async (req, res) => {
  try {
    const comments = await Comment.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/page/:commentId/comment', requireLogin, async (req, res) => {
  try {
    const comment = await Comment.findByIdAndUpdate(req.params.commentId, req.body, { new: true });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:commentId/comment/reply', requireLogin, async (req, res) => {
  try {
    const { replyText } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const page = await Page.findOne({ pageId: comment.pageId });
    await postToFacebook(page.pageId, page.pageToken, replyText);

    comment.status = 'REPLIED';
    await comment.save();

    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
