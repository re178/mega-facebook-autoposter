/**
 * Entry point – re‑exports all public APIs from the four sub‑modules.
 * This preserves backward compatibility with the original monolithic file.
 */

// ---------- Re‑export from external modules (direct passthrough) ----------
const { renderPost } = require('../renderPost');
const { generateCinematicReel } = require('../media/cinematicEngine');
const qualityAssurance = require('../qualityAssurance');
const pageIntelligence = require('../pageIntelligence');

// ---------- Import from our internal modules ----------
const models = require('./models');
const providers = require('./providers');
const topicUtils = require('./topicUtils');
const scheduler = require('./scheduler');

// ---------- Build the public API object ----------
module.exports = {
  // External dependencies (passthrough)
  renderPost,
  generateCinematicReel,
  qualityAssurance,
  pageIntelligence,

  // From providers
  CloudflareText: providers.CloudflareText,
  GroqText: providers.GroqText,
  GeminiText: providers.GeminiText,
  OpenAIText: providers.OpenAIText,
  generateSmart: providers.generateSmart,
  CloudflareImage: providers.CloudflareImage,
  StabilityImage: providers.StabilityImage,
  LeonardoImage: providers.LeonardoImage,
  DALLEImage: providers.DALLEImage,
  SmartPexelsImage: providers.SmartPexelsImage,
  TextProviders: providers.TextProviders,
  ImageProviders: providers.ImageProviders,
  generateText: providers.generateText,
  generateAndValidatePost: providers.generateAndValidatePost,
  generateImage: providers.generateImage,
  createBrandedImage: providers.createBrandedImage,

  // From topicUtils
  generateCustomAngles: topicUtils.generateCustomAngles,
  generateShortTopicName: topicUtils.generateShortTopicName,
  fetchTrendingHeadline: topicUtils.fetchTrendingHeadline,
  isTopicTooSimilar: topicUtils.isTopicTooSimilar,
  getIntelligentStartDate: topicUtils.getIntelligentStartDate,
  getNonCollidingTime: topicUtils.getNonCollidingTime,
  evaluateTopicQuality: topicUtils.evaluateTopicQuality,
  getUsedAnglesCount: topicUtils.getUsedAnglesCount,
  expireTopicIfComplete: topicUtils.expireTopicIfComplete,

  // From scheduler
  createManualTopicWithQA: scheduler.createManualTopicWithQA,
  generatePostsForManualTopic: scheduler.generatePostsForManualTopic,
  generatePostsForTopic: scheduler.generatePostsForTopic,
  deleteTopicPosts: scheduler.deleteTopicPosts,
  createAiLog: scheduler.createAiLog,
  ensureActiveTopicsForPage: scheduler.ensureActiveTopicsForPage,
  generateNextPostForTopic: scheduler.generateNextPostForTopic,

  // From models (global settings)
  getGlobalSettings: models.getGlobalSettings,
  updateGlobalSettings: models.updateGlobalSettings,

  // Also expose cleanupLogs if needed (though not originally exported, but available)
  // Uncomment if you need it externally:
  // cleanupLogs: models.cleanupLogs,
};
