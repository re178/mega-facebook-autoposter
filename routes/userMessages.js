const express = require('express');
const router = express.Router();
const requireLogin = require('../middleware/requireLogin');
const User = require('./models/User');
const AdminMessage = require('../models/AdminMessage');
const BroadcastMessage = require('../models/BroadcastMessage');

// Get private messages for logged-in user
router.get('/private', requireLogin, async (req, res) => {
  try {
    const messages = await AdminMessage.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark a private message as read
router.patch('/private/:msgId/read', requireLogin, async (req, res) => {
  try {
    await AdminMessage.findByIdAndUpdate(req.params.msgId, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get broadcast messages from last 7 days
router.get('/broadcast', requireLogin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const broadcasts = await BroadcastMessage.find({
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 });
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
