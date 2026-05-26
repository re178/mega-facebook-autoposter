module.exports = {
  MAX_CONCURRENT_RENDERS: 1,
  MAX_MEMORY_MB: 600,               // Lower than Render's 512MB? Actually 600 triggers abort before 512? No – we abort at 600MB to leave headroom. But Render limit is 512MB, so abort at 480MB.
  MAX_MEMORY_MB: 480,               // Abort at 480MB to stay under 512MB limit
  MAX_FRAMES_PER_JOB: 900,          // 30 seconds at 30fps
  FRAME_BATCH_SIZE: 15,             // Smaller batches
  
  FFMPEG_TIMEOUT_MS: 120000,
  AI_PROVIDER_TIMEOUT_MS: 15000,
  SESSION_TIMEOUT_MS: 5 * 60 * 1000,
  
  VIDEO_FORMATS: {
    reel: { width: 720, height: 1280, fps: 24 },      // Lower res for free tier
    explainer: { width: 854, height: 480, fps: 24 },
    short: { width: 720, height: 1280, fps: 24 }
  },
  
  QUALITY_MODE: 'draft',   // ensures lower resolution
  AI_PROVIDER_SCORING: true
};
