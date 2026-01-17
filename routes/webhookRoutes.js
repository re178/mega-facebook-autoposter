 const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Log = require('../models/Log');

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// ===============================
// WEBHOOK VERIFICATION (REQUIRED)
// ===============================
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ===============================
// WEBHOOK EVENTS
// ===============================
router.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    if (!entry) return res.sendStatus(200);

    // ===============================
    // MESSAGES (INBOX)
    // ===============================
    if (entry.messaging) {
      for (const event of entry.messaging) {
        if (!event.message || event.message.is_echo) continue;

        const page = await Page.findOne({ pageId: entry.id });
        if (!page) continue;

        await Message.create({
          pageId: page._id,
          senderId: event.sender.id,
          senderName: 'Facebook User',
          message: event.message.text,
          receivedAt: new Date(),
          status: 'UNREAD'
        });

        await Log.create({
          pageId: page._id,
          action: 'MESSAGE_RECEIVED',
          message: event.message.text
        });
      }
    }

    // ===============================
    // COMMENTS
    // ===============================
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.value?.comment_id) {
          const page = await Page.findOne({ pageId: entry.id });
          if (!page) continue;

          await Comment.create({
            pageId: page._id,
            userName: change.value.from?.name || 'Facebook User',
            comment: change.value.message,
            createdAt: new Date(),
            status: 'VISIBLE'
          });

          await Log.create({
            pageId: page._id,
            action: 'COMMENT_RECEIVED',
            message: change.value.message
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
