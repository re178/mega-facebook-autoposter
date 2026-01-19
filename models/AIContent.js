const mongoose = require('mongoose');

const aiContentSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  topic: String,
  text: String,
  mediaUrl: String,
  scheduledTime: Date,
  status: { type: String, default: 'PENDING' }, // PENDING, POSTED, FAILED
  isAI: { type: Boolean, default: true },
  retryCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AIContent', aiContentSchema);
