const mongoose = require('mongoose');

const AiLogSchema = new mongoose.Schema({
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiTopic',
    required: true
  },
  pageId: {
    type: String,
    required: true
  },
  action: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AiLog', AiLogSchema);
