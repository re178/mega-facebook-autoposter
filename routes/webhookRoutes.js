const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Page = require('../models/Page');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Log = require('../models/Log');

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const APP_SECRET = process.env.FB_APP_SECRET;

// ===============================
// HELPER: Verify Facebook signature using raw body
// ===============================
function verifySignature(signature, rawBody) {
  if (!APP_SECRET) {
    console.warn('⚠️ FB_APP_SECRET not set – skipping signature verification');
    return true; // Skip if not configured (not recommended for production)
  }
  if (!signature) {
    console.warn('⚠️ No signature header present');
    return false;
  }

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

  console.log(`🔐 Webhook verify request: mode=${mode}, token=${token}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn(`❌ Webhook verification failed: mode=${mode}, token=${token}`);
  return res.sendStatus(403);
});

// ===============================
// WEBHOOK EVENTS (POST)
// ===============================
router.post('/webhook', async (req, res) => {
  // 1. Signature verification using raw body (captured by middleware)
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const signature = req.headers['x-hub-signature-256'];

  if (APP_SECRET && !verifySignature(signature, rawBody)) {
    console.error('❌ Invalid webhook signature');
    return res.sendStatus(403);
  }

  // 2. Always return 200 quickly – Facebook expects a fast response
  // We'll process asynchronously to avoid timeout
  setImmediate(async () => {
    try {
      const entry = req.body.entry?.[0];
      if (!entry) {
        console.log('ℹ️ Webhook: No entry found');
        return;
      }

      const pageId = entry.id;
      const timestamp = entry.time || Date.now();

      // Log webhook received for debugging
      console.log(`📨 Webhook received: page=${pageId}, event=${timestamp}`);

      // Find the page in our database
      const page = await Page.findOne({ pageId: pageId });
      if (!page) {
        console.warn(`⚠️ Webhook: Page not found for ID ${pageId}`);
        return;
      }

      // ===============================
      // MESSAGES (INBOX)
      // ===============================
      if (entry.messaging && Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          // Skip echoes (messages sent by the page itself)
          if (event.message?.is_echo) continue;

          // Skip if no message
          if (!event.message) continue;

          // Generate a unique event ID to prevent duplicates
          const eventId = event.id || event.timestamp || `${event.sender?.id}_${event.timestamp}`;

          // Check if already processed (idempotency)
          const existingMessage = await Message.findOne({ facebookEventId: eventId });
          if (existingMessage) {
            console.log(`ℹ️ Duplicate message event ${eventId} – skipping`);
            continue;
          }

          const senderId = event.sender?.id;
          if (!senderId) continue;

          // Get sender name if available (Facebook may not send it)
          let senderName = event.sender?.name || 'Facebook User';

          // If we need the actual name, we could make an additional Graph API call here
          // But for now, we'll store what we have

          const messageText = event.message?.text || '[non‑text message]';

          await Message.create({
            pageId: page._id,
            senderId: senderId,
            senderName: senderName,
            message: messageText,
            receivedAt: new Date(timestamp),
            status: 'UNREAD',
            psid: senderId,
            facebookEventId: eventId, // For deduplication
            facebookTimestamp: timestamp
          });

          await Log.create({
            pageId: page._id,
            action: 'MESSAGE_RECEIVED',
            message: `From ${senderId}: ${messageText.substring(0, 100)}`,
            meta: { senderId, eventId, timestamp }
          });

          console.log(`📩 Message saved from ${senderId}`);
        }
      }

      // ===============================
      // COMMENTS
      // ===============================
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const value = change.value;
          if (!value?.comment_id) continue;

          // Generate unique event ID for deduplication
          const eventId = `${value.comment_id}_${value.created_time || Date.now()}`;

          // Check if already processed (idempotency)
          const existingComment = await Comment.findOne({ facebookEventId: eventId });
          if (existingComment) {
            console.log(`ℹ️ Duplicate comment event ${eventId} – skipping`);
            continue;
          }

          // Handle different comment types
          const item = change.value.item || 'comment';
          if (item === 'reaction') {
            // Reactions (likes, loves, etc.) – we might handle them differently
            console.log(`👍 Reaction on ${value.comment_id || value.post_id} from ${value.from?.name}`);
            continue;
          }

          const userName = value.from?.name || 'Facebook User';
          const commentText = value.message || value.comment || '';
          const commentId = value.comment_id;
          const postId = value.post_id;

          await Comment.create({
            pageId: page._id,
            userName: userName,
            comment: commentText,
            facebookCommentId: commentId,
            facebookPostId: postId,
            facebookEventId: eventId,
            createdAt: new Date(value.created_time || Date.now()),
            status: 'VISIBLE'
          });

          await Log.create({
            pageId: page._id,
            action: 'COMMENT_RECEIVED',
            message: `From ${userName}: ${commentText.substring(0, 100)}`,
            meta: { commentId, postId, eventId }
          });

          console.log(`💬 Comment saved from ${userName}`);
        }
      }

      // ===============================
      // PAGE SUBSCRIPTION (when a user connects a page)
      // ===============================
      // If you want to auto‑subscribe pages when they're connected,
      // you can add that logic in your Facebook auth route instead.

    } catch (err) {
      console.error('❌ Webhook processing error:', err);
      // We already returned 200, so Facebook won't retry
      // Log the error for debugging
    }
  });

  // Always return 200 immediately – Facebook expects quick response
  res.sendStatus(200);
});

module.exports = router;
