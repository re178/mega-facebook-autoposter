// cinematicEngine.js
const fs = require('fs');
const path = require('path');
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

async function generateCinematicReel({ title, text, pageProfile = {}, pageName = 'My Page', format = 'reel' }) {
  try {
    const dims = VIDEO_FORMATS[format] || VIDEO_FORMATS.reel;
    const WIDTH = dims.width, HEIGHT = dims.height, FPS = dims.fps;
    
    // AI scene plan
    const plan = await generateScenePlan({ title: cleanText(title), text: cleanText(text) }, { ...pageProfile, pageName });
    if (!plan || !plan.scenes) throw new Error('AI scene plan failed');
    
    const scenes = plan.scenes;
    const tempDir = createTempDir();
    let globalFrame = 0;
    
    // Render each scene frame by frame
    for (const scene of scenes) {
      const totalFrames = Math.floor(scene.duration * FPS);
      for (let f = 0; f < totalFrames; f++) {
        const buffer = await renderSceneFrame(scene, f, totalFrames, WIDTH, HEIGHT, plan.pageDNA, plan);
        const framePath = path.join(tempDir, `frame_${String(globalFrame).padStart(4, '0')}.png`);
        fs.writeFileSync(framePath, buffer);
        globalFrame++;
      }
    }
    
    // Compose video
    const videoPath = path.join(tempDir, 'output.mp4');
    await framesToVideo(tempDir, videoPath, FPS);
    
    // Upload
    const finalUrl = await uploadVideo(videoPath);
    
    // Cleanup
    cleanupTempDir(tempDir);
    return finalUrl;
  } catch (err) {
    console.error('Cinematic engine error:', err);
    return null;
  }
}

module.exports = { generateCinematicReel };
