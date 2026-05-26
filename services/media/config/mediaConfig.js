// services/media/config/mediaConfig.js
module.exports = {
  // Concurrency & resources
  MAX_CONCURRENT_RENDERS: 1,        // Only one reel at a time
  MAX_MEMORY_MB: 768,               // Safe limit for Render free tier (512MB + buffer)
  MAX_FRAMES_PER_JOB: 1800,         // e.g., 60 seconds at 30fps
  FRAME_BATCH_SIZE: 30,             // Render 30 frames then flush memory
  
  // Timeouts (ms)
  FFMPEG_TIMEOUT_MS: 120000,        // 2 minutes
  AI_PROVIDER_TIMEOUT_MS: 15000,    // 15 seconds per AI call
  SESSION_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes total per job
  
  // Video defaults
  VIDEO_FORMATS: {
    reel: { width: 1080, height: 1920, fps: 30 },
    explainer: { width: 1280, height: 720, fps: 30 },
    short: { width: 1080, height: 1920, fps: 30 }
  },
  
  // Quality tier (draft = faster, lower quality; cinematic = slower)
  QUALITY_MODE: process.env.QUALITY_MODE || 'draft',
  
  // AI provider scoring
  AI_PROVIDER_SCORING: true,        // Track success rates
};
