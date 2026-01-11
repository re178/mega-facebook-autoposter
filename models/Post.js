const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  pageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Page',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  mediaUrl: {
    type: String,
    default: ''
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', PostSchema);

