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
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiScheduledPost',
    default: null
  },
  action: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AiLog', AiLogSchema);
