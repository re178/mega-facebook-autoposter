// cinematicEngine.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateScenePlan } = require('./storyboardEngine');
const { renderSceneFrame } = require('./sceneBuilder');
const { framesToVideo } = require('./ffmpegHelpers');
const { createTempDir, cleanupTempDir } = require('./tempManager');
const { uploadVideo } = require('./uploadVideo');
const { cleanText } = require('./mediaHelpers');

const VIDEO_FORMATS = {
  reel: { width: 1080, height: 1920, fps: 30 },
  explainer: { width: 1280, height: 720, fps: 30 },
  short: { width: 1080, height: 1920, fps: 30 }
};

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes max per job
const MAX_SCENES = 6;
const MAX_FRAMES = 1800; // e.g., 60 seconds at 30fps

/**
 * Generate a cinematic reel using a session-based approach.
 * @param {Object} session - The render session (created internally if not provided)
 * @returns {Promise<string>} URL of the generated video
 */
async function generateCinematicReel({ title, text, pageProfile, pageName, format = 'reel', session = null }) {
  const startTime = Date.now();
  let currentSession = session;

  try {
    // Create session if not provided
    if (!currentSession) {
      currentSession = {
        jobId: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: cleanText(title),
        text: cleanText(text),
        pageProfile,
        pageName,
        format,
        status: 'planning',
        createdAt: new Date(),
        tempDir: null,
        scenes: null,
        characterSpec: null,
        globalPlan: null
      };
    }

    // Check timeout
    if (Date.now() - startTime > SESSION_TIMEOUT) {
      throw new Error('Session timeout exceeded');
    }

    // 1. AI planning (ONCE)
    if (!currentSession.globalPlan) {
      console.log(`[${currentSession.jobId}] Phase 1: AI planning...`);
      const plan = await generateScenePlan(
        { title: currentSession.title, text: currentSession.text },
        currentSession.pageProfile
      );
      if (!plan || !plan.scenes || plan.scenes.length === 0) {
        throw new Error('AI scene plan generation failed');
      }
      // Validate scene count
      if (plan.scenes.length > MAX_SCENES) {
        throw new Error(`Too many scenes: ${plan.scenes.length} > ${MAX_SCENES}`);
      }
      currentSession.globalPlan = plan;
      currentSession.scenes = plan.scenes;
      currentSession.characterSpec = plan.characterSpec; // from AI plan
    }

    // 2. Precompute all rendering data (no AI)
    const dims = VIDEO_FORMATS[currentSession.format] || VIDEO_FORMATS.reel;
    const WIDTH = dims.width, HEIGHT = dims.height, FPS = dims.fps;

    // 3. Create temp directory
    if (!currentSession.tempDir) {
      currentSession.tempDir = createTempDir();
    }

    // 4. Render frames (deterministic, no AI)
    console.log(`[${currentSession.jobId}] Phase 2: Rendering frames...`);
    let globalFrame = 0;
    for (const scene of currentSession.scenes) {
      const totalFrames = Math.floor(scene.duration * FPS);
      if (globalFrame + totalFrames > MAX_FRAMES) {
        throw new Error(`Frame limit exceeded: ${MAX_FRAMES}`);
      }
      for (let f = 0; f < totalFrames; f++) {
        // Render frame using precomputed data
        const buffer = await renderSceneFrame({
          scene,
          frameIdx: f,
          totalFrames,
          width: WIDTH,
          height: HEIGHT,
          characterSpec: currentSession.characterSpec,
          globalPlan: currentSession.globalPlan,
          pageProfile: currentSession.pageProfile
        });
        const framePath = path.join(currentSession.tempDir, `frame_${String(globalFrame).padStart(4, '0')}.png`);
        fs.writeFileSync(framePath, buffer);
        globalFrame++;
      }
    }

    // 5. Compose video (FFmpeg or GIF fallback)
    console.log(`[${currentSession.jobId}] Phase 3: Compose video...`);
    const videoPath = path.join(currentSession.tempDir, 'output.mp4');
    await framesToVideo(currentSession.tempDir, videoPath, FPS, null);

    // 6. Upload
    console.log(`[${currentSession.jobId}] Phase 4: Upload...`);
    const finalUrl = await uploadVideo(videoPath);

    // 7. Cleanup
    cleanupTempDir(currentSession.tempDir);
    console.log(`[${currentSession.jobId}] ✅ Done. URL: ${finalUrl}`);
    return finalUrl;
  } catch (err) {
    console.error(`[${currentSession?.jobId}] Fatal error:`, err);
    if (currentSession?.tempDir) cleanupTempDir(currentSession.tempDir);
    throw err;
  }
}

module.exports = { generateCinematicReel };
