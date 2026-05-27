const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Page = require('../models/Page');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Log = require('../models/Log');

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const APP_SECRET = process.env.FB_APP_SECRET; // Needed for signature verification

// Helper: verify Facebook signature (prevents fake webhook calls)
function verifySignature(req, rawBody) {
  if (!APP_SECRET) return true; // Skip if not configured (not recommended)
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody)
    .digest('hex');
  return signature === `sha256=${expected}`;
}

// ===============================
// WEBHOOK VERIFICATION (GET)
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
// WEBHOOK EVENTS (POST)
// ===============================
router.post('/webhook', async (req, res) => {
  // For webhooks, we need the raw body to verify signature
  const rawBody = JSON.stringify(req.body);
  if (APP_SECRET && !verifySignature(req, rawBody)) {
    console.error('❌ Invalid webhook signature');
    return res.sendStatus(403);
  }

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
        if (!page) {
          console.warn(`Webhook: Page not found for ID ${entry.id}`);
          continue;
        }

        await Message.create({
          pageId: page._id,
          senderId: event.sender.id,
          senderName: event.sender.name || 'Facebook User',
          message: event.message.text || '[non‑text message]',
          receivedAt: new Date(),
          status: 'UNREAD',
          psid: event.sender.id
        });

        await Log.create({
          pageId: page._id,
          action: 'MESSAGE_RECEIVED',
          message: event.message.text || 'Non‑text message received'
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
            comment: change.value.message || '',
            facebookCommentId: change.value.comment_id,
            createdAt: new Date(),
            status: 'VISIBLE'
          });

          await Log.create({
            pageId: page._id,
            action: 'COMMENT_RECEIVED',
            message: change.value.message || ''
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    // Always return 200 to Facebook – do not retry
    res.sendStatus(200);
  }
});

module.exports = router;
