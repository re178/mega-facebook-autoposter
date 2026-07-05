const mongoose = require('mongoose');
const moment = require('moment-timezone');

// ---------- Models (from ../models) ----------
const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page');
const PageProfile = require('../models/PageProfile');

// ---------- Additional models (defined here) ----------
const AutoTopicMeta = mongoose.model('AutoTopicMeta', new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTopic', required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
}));

const GlobalSettings = mongoose.model('GlobalSettings', new mongoose.Schema({
  maxActiveTopics: { type: Number, default: 6 },
  autoTopicCreationEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}));

// ---------- Constants ----------
const TIMEZONE = 'Africa/Nairobi';
const MAX_SCHEDULED_POSTS = 10;
const MIN_ACTIVE_TOPICS = 3;
const TOPIC_LIFETIME_DAYS = 5;
const POSTS_PER_DAY_AUTO = 1;
const INCLUDE_MEDIA_AUTO = false;
const AVOID_SIMILAR_DAYS = 7;
const MAX_START_DATE_DAYS = 21;
const MAX_SAME_START_DAY = 2;
const DEFAULT_ANGLES = ['insight', 'example', 'warning', 'opinion', 'takeaway'];
const GLOBAL_ANGLES = ['memory', 'observation', 'curiosity', 'experience', 'reflection', 'surprise', 'casual'];

// ---------- Logger ----------
async function monitor(topicId, pageId, postId, action, message) {
  try {
    if (!pageId) pageId = 'SYSTEM';
    await AiLog.create({ topicId, pageId, postId, action, message });
  } catch (err) {
    console.error('LOG ERROR:', err.message);
  }
}

// ---------- Log cleanup ----------
async function cleanupLogs() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  await AiLog.deleteMany({ createdAt: { $lt: cutoff }, action: { $not: /^AUTO_/ } });
}

// ---------- Global Settings (cached) ----------
let globalSettingsCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getGlobalSettings() {
  if (globalSettingsCache && (Date.now() - cacheTime < CACHE_TTL)) {
    return globalSettingsCache;
  }
  let settings = await GlobalSettings.findOne();
  if (!settings) settings = await GlobalSettings.create({});
  globalSettingsCache = settings;
  cacheTime = Date.now();
  return settings;
}

async function updateGlobalSettings(updates) {
  const settings = await GlobalSettings.findOneAndUpdate(
    {},
    { $set: updates, updatedAt: new Date() },
    { new: true, upsert: true }
  );
  globalSettingsCache = settings;
  cacheTime = Date.now();
  return settings;
}

module.exports = {
  mongoose,
  moment,
  AiTopic,
  AiScheduledPost,
  AiLog,
  Page,
  PageProfile,
  AutoTopicMeta,
  GlobalSettings,
  TIMEZONE,
  MAX_SCHEDULED_POSTS,
  MIN_ACTIVE_TOPICS,
  TOPIC_LIFETIME_DAYS,
  POSTS_PER_DAY_AUTO,
  INCLUDE_MEDIA_AUTO,
  AVOID_SIMILAR_DAYS,
  MAX_START_DATE_DAYS,
  MAX_SAME_START_DAY,
  DEFAULT_ANGLES,
  GLOBAL_ANGLES,
  monitor,
  cleanupLogs,
  getGlobalSettings,
  updateGlobalSettings,
};
