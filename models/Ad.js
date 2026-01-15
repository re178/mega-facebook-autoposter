const mongoose = require('mongoose');
const AdSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  name: String,
  status: { type: String, enum:['ACTIVE','PAUSED','COMPLETED'], default:'ACTIVE' },
  budget: Number,
  reach: Number,
  ctr: Number
});
module.exports = mongoose.model('Ad', AdSchema);
