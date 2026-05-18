const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  pageId: { type: String, required: true, index: true },

  senderId: String,      // keep (legacy / display)
  senderName: String,

  psid: { type: String, index: true }, // ✅ REQUIRED FOR REPLIES

  message: String,
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum:['UNREAD','READ','REPLIED'], default:'UNREAD' }
});

module.exports = mongoose.model('Message', MessageSchema);
