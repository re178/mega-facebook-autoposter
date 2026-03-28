const mongoose = require('mongoose');

const PageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  pageId: {
    type: String,
    required: true,
    unique: true
  },
  pageToken: {
    type: String,
    required: true
  },

  // 🧑‍💻 Page ownership: linked to a user
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  autoGenerationEnabled: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 🔍 INDEXES
PageSchema.index({ pageId: 1 });
PageSchema.index({ userId: 1 });

module.exports = mongoose.model('Page', PageSchema);

