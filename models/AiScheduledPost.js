const mongoose = require('mongoose');

const AiScheduledPostSchema = new mongoose.Schema({
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiTopic',
    required: true
  },
  pageId: {
    type: String, 
    required: true
  },
  text: {
    type: String,
    required: true
  },
  mediaUrl: {
    type: String,
    default: null
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'POSTED', 'FAILED'],
    default: 'PENDING'
  },
  retryCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true }); 

module.exports = mongoose.model('AiScheduledPost', AiScheduledPostSchema);
