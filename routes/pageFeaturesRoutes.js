// routes/pageFeaturesRoutes.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const Page = require('../models/Page');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Template = require('../models/Template');
const Ad = require('../models/Ad');

const { postToFacebook, sendMessengerReply, replyToComment } = require('../services/facebookService');

// ✅ Add requireFeature middleware
const requireFeature = require('../middleware/requireFeature');

// ---------------------------
// LOGS
// ---------------------------
router.get('/page/:pageId/logs', async (req, res) => {
  try {
    const posts = []; // No posts handled here anymore
    const messages = await Message.find({ pageId: req.params.pageId });
    const comments = await Comment.find({ pageId: req.params.pageId });

    const logs = [
      ...messages.map(m => ({ action: 'Message', message: m.message, createdAt: m.receivedAt })),
      ...comments.map(c => ({ action: 'Comment', message: c.comment, createdAt: c.createdAt }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// MESSAGES / INBOX (Free for all)
// ---------------------------
router.get('/page/:pageId/messages', async (req, res) => {
  try {
    const messages = await Message.find({ pageId: req.params.pageId }).sort({ receivedAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/message', async (req, res) => {
  try {
    const { messageId, replyText } = req.body;
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (!message.psid) return res.status(400).json({ error: 'Message PSID missing' });

    const page = await Page.findOne({ pageId: req.params.pageId });
    await sendMessengerReply(message.psid, page.pageToken, replyText);

    message.status = 'REPLIED';
    await message.save();
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// TEMPLATES / AUTO-REPLIES (PRO+)
// ---------------------------
router.get('/page/:pageId/templates', requireFeature('templates'), async (req, res) => {
  try {
    const templates = await Template.find({ pageId: req.params.pageId });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/templates', requireFeature('templates'), async (req, res) => {
  try {
    const template = await Template.create({ pageId: req.params.pageId, ...req.body });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/template/:templateId', requireFeature('templates'), async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.templateId, req.body, { new: true });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/template/:templateId', requireFeature('templates'), async (req, res) => {
  try {
    await Template.findByIdAndDelete(req.params.templateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// ADS / CAMPAIGNS (PRO+)
// ---------------------------
router.get('/page/:pageId/ads', requireFeature('ads'), async (req, res) => {
  try {
    const ads = await Ad.find({ pageId: req.params.pageId });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:pageId/ad', requireFeature('ads'), async (req, res) => {
  try {
    const ad = await Ad.create({ pageId: req.params.pageId, ...req.body });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/page/:adId/ad', requireFeature('ads'), async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.adId, req.body, { new: true });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/page/:adId/ad', requireFeature('ads'), async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.adId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// COMMENTS / MODERATION (PRO+)
// ---------------------------
router.get('/page/:pageId/comments', requireFeature('comments'), async (req, res) => {
  try {
    const comments = await Comment.find({ pageId: req.params.pageId }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/page/:commentId/comment', requireFeature('comments'), async (req, res) => {
  try {
    const comment = await Comment.findByIdAndUpdate(req.params.commentId, req.body, { new: true });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/page/:commentId/comment/reply', requireFeature('comments'), async (req, res) => {
  try {
    const { replyText } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (!comment.facebookCommentId) return res.status(400).json({ error: 'Comment ID missing' });

    const page = await Page.findOne({ pageId: comment.pageId });
    await replyToComment(comment.facebookCommentId, page.pageToken, replyText);

    comment.status = 'REPLIED';
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// ANALYTICS / REPORTS (PRO+ for reports)
// ---------------------------
router.get('/page/:pageId/insights', async (req, res) => {
  try {
    const page = await Page.findOne({ pageId: req.params.pageId });
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const insights = {
      likes: Math.floor(Math.random() * 1000),
      comments: Math.floor(Math.random() * 500),
      shares: Math.floor(Math.random() * 300)
    };

    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/page/:pageId/report', requireFeature('reports'), async (req, res) => {
  try {
    const pageId = req.params.pageId;
    const format = req.query.format || 'pdf';

    const fileName = `page-${pageId}-report.${format}`;
    const filePath = path.join(__dirname, '..', 'tmp', fileName);

    fs.mkdirSync(path.join(__dirname, '..', 'tmp'), { recursive: true });
    fs.writeFileSync(filePath, `Report for Page ${pageId} in ${format.toUpperCase()}`);

    res.download(filePath, fileName, err => {
      if (err) res.status(500).json({ error: err.message });
      else fs.unlinkSync(filePath);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
