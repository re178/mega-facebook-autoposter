const mongoose = require('mongoose');
const TemplateSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  name: String,
  type: { type: String, enum:['FAQ','GREETING','AWAY','KEYWORD'] },
  keywords: [String],
  reply: String
});
module.exports = mongoose.model('Template', TemplateSchema);
