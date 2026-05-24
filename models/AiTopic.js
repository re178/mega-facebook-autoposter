const mongoose = require('mongoose');

const AiTopicSchema = new mongoose.Schema({
  pageId: { type: String, required: true },
  topicName: { type: String, required: true },
  postsPerDay: Number,
  times: [String], // ["11:00", "14:21", "19:47"]
  startDate: Date,
  endDate: Date,
  repeatType: String, // daily, weekly, monthly
  includeMedia: Boolean,
  // Add to AiTopic schema (e.g., models/AiTopic.js)
includeVideo: { type: Boolean, default: false },
  customAngles: { type: [String], default: null }, // <-- NEW FIELD
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AiTopic', AiTopicSchema);
