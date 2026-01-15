const mongoose = require('mongoose');
const MessageSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  senderId: String,
  senderName: String,
  message: String,
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum:['UNREAD','READ','REPLIED'], default:'UNREAD' }
});
module.exports = mongoose.model('Message', MessageSchema);
