const mongoose = require('mongoose');
const CommentSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  userName: String,
  comment: String,
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum:['VISIBLE','HIDDEN'], default:'VISIBLE' }
});
module.exports = mongoose.model('Comment', CommentSchema);
