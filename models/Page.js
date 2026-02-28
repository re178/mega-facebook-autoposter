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
  
  autoGenerationEnabled: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Page', PageSchema);

