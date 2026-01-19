const mongoose = require('mongoose');

const AiScheduledPostSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTopic', required: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
  text: String,
  mediaUrl: String,
  scheduledTime: Date,
  status: { type: String, default: 'PENDING' }, // PENDING, POSTED, FAILED
  retryCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('AiScheduledPost', AiScheduledPostSchema);
