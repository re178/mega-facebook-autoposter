const mongoose = require('mongoose');

const PageProfileSchema = new mongoose.Schema({
  pageId: { type: String, required: true, unique: true },
  name: { type: String },
  tone: { type: String, default: 'friendly' },
  writingStyle: { type: String, default: 'conversational' },
  voice: { type: String, default: 'first-person plural' },
  audienceTone: { type: String, default: 'casual' },
  audienceAge: { type: String, default: 'all ages' },
  audienceInterest: { type: [String], default: [] },
  extraNotes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PageProfile', PageProfileSchema);
