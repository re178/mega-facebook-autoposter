const express = require('express');
const router = express.Router();
const requireLogin = require('../middleware/requireLogin');
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

// Mark a private message as read (with ownership check)
router.patch('/private/:msgId/read', requireLogin, async (req, res) => {
  try {
    const message = await AdminMessage.findOne({
      _id: req.params.msgId,
      userId: req.user._id
    });
    if (!message) return res.status(404).json({ error: 'Message not found or not yours' });
    message.read = true;
    await message.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all broadcast messages (no time limit, frontend handles last seen via localStorage)
router.get('/broadcast', requireLogin, async (req, res) => {
  try {
    const broadcasts = await BroadcastMessage.find()
      .sort({ createdAt: -1 })
      .limit(100); // reasonable limit
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
