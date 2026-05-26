// services/media/cinematicEngine.js
const fs = require('fs');
const path = require('path');
const { generateScenePlan } = require('./storyboardEngine');
const { precomputeAllScenes } = require('./precomputeEngine');
const { renderSceneFrame } = require('./sceneBuilder');
const { framesToVideo } = require('./ffmpegHelpers');
const { createTempDir, cleanupTempDir } = require('./tempManager');
const { uploadVideo } = require('./uploadVideo');
const { updateJobStatus, getJob, enqueueJob, setJobProcessor } = require('../queue');
const config = require('./config/mediaConfig');

async function processJob(job) {
  let session = job.session;
  const jobId = session.jobId;
  console.log(`[${jobId}] Starting job`);
  try {
    // Phase 1: Planning (if not already done)
    if (job.status === 'planning' || !session.globalPlan) {
      console.log(`[${jobId}] Phase 1: AI planning`);
      const plan = await generateScenePlan({ title: session.title, text: session.text }, session.pageProfile);
      if (!plan) throw new Error('Scene plan generation failed');
      session.globalPlan = plan;
      session.scenes = plan.scenes;
      session.characterSpec = plan.characterSpec;
      session.status = 'planning_complete';
      await updateJobStatus(jobId, 'precomputing', session);
    } else {
      console.log(`[${jobId}] Skipping planning (already done)`);
    }

    // Phase 2: Precomputation
    if (job.status === 'precomputing' || !session.precomputedScenes) {
      console.log(`[${jobId}] Phase 2: Precomputation`);
      const dims = config.VIDEO_FORMATS[session.format] || config.VIDEO_FORMATS.reel;
      const style = { brand: session.pageProfile.brand || 'modern' }; // simplified
      session.precomputedScenes = precomputeAllScenes(session.scenes, dims.width, style);
      session.dims = dims;
      session.status = 'precomputed';
      await updateJobStatus(jobId, 'rendering', session);
    } else {
      console.log(`[${jobId}] Skipping precomputation (already done)`);
    }

    // Phase 3: Rendering frames (with batching)
    if (job.status === 'rendering' || !session.frameCount) {
      console.log(`[${jobId}] Phase 3: Rendering frames`);
      const { width, height, fps } = session.dims;
      if (!session.tempDir) session.tempDir = createTempDir();
      let globalFrame = 0;
      for (const scene of session.precomputedScenes) {
        const totalFrames = Math.floor(scene.duration * fps);
        if (globalFrame + totalFrames > config.MAX_FRAMES_PER_JOB) throw new Error('Frame limit exceeded');
        for (let batchStart = 0; batchStart < totalFrames; batchStart += config.FRAME_BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + config.FRAME_BATCH_SIZE, totalFrames);
          for (let f = batchStart; f < batchEnd; f++) {
            const buffer = await renderSceneFrame({
              scene,
              frameIdx: f,
              totalFrames,
              width,
              height,
              characterSpec: session.characterSpec,
              globalPlan: session.globalPlan,
              pageProfile: session.pageProfile
            });
            const framePath = path.join(session.tempDir, `frame_${String(globalFrame).padStart(4, '0')}.png`);
            fs.writeFileSync(framePath, buffer);
            globalFrame++;
          }
          // Small delay to let event loop breathe
          await new Promise(r => setImmediate(r));
          // Memory check
          const mem = process.memoryUsage().heapUsed / 1024 / 1024;
          if (mem > config.MAX_MEMORY_MB) throw new Error(`Memory limit exceeded: ${mem.toFixed(1)}MB`);
        }
      }
      session.frameCount = globalFrame;
      session.status = 'rendered';
      await updateJobStatus(jobId, 'composing', session);
    } else {
      console.log(`[${jobId}] Skipping rendering (already done)`);
    }

    // Phase 4: Compose video
    if (job.status === 'composing' || !session.videoPath) {
      console.log(`[${jobId}] Phase 4: Composing video`);
      const { fps } = session.dims;
      const videoPath = path.join(session.tempDir, 'output.mp4');
      await framesToVideo(session.tempDir, videoPath, fps, null);
      session.videoPath = videoPath;
      session.status = 'composed';
      await updateJobStatus(jobId, 'uploading', session);
    } else {
      console.log(`[${jobId}] Skipping composition (already done)`);
    }

    // Phase 5: Upload
    if (job.status === 'uploading' || !session.mediaUrl) {
      console.log(`[${jobId}] Phase 5: Uploading`);
      const url = await uploadVideo(session.videoPath);
      session.mediaUrl = url;
      session.status = 'uploaded';
      await updateJobStatus(jobId, 'completed', session);
    } else {
      console.log(`[${jobId}] Skipping upload (already done)`);
    }

    console.log(`[${jobId}] Job completed successfully: ${session.mediaUrl}`);
    cleanupTempDir(session.tempDir);
  } catch (err) {
    console.error(`[${jobId}] Job failed:`, err.message);
    await updateJobStatus(jobId, 'failed', session, err.message);
    if (session.tempDir) cleanupTempDir(session.tempDir);
    throw err;
  }
}

// Register the job processor with the queue
setJobProcessor(processJob);

async function generateCinematicReel({ title, text, pageProfile, pageName, format = 'reel' }) {
  const session = {
    jobId: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    title,
    text,
    pageProfile,
    pageName,
    format,
    status: 'queued',
    createdAt: new Date(),
    tempDir: null,
    scenes: null,
    characterSpec: null,
    globalPlan: null,
    precomputedScenes: null,
    dims: null,
    frameCount: 0,
    videoPath: null,
    mediaUrl: null
  };
  await enqueueJob(session);
  // Wait for completion (polling) – in a real API you'd return jobId immediately and poll later.
  // For simplicity, we'll wait here (not ideal but works for testing).
  let job = await getJob(session.jobId);
  while (job.status !== 'completed' && job.status !== 'failed') {
    await new Promise(r => setTimeout(r, 1000));
    job = await getJob(session.jobId);
  }
  if (job.status === 'failed') throw new Error(job.error);
  return job.session.mediaUrl;
}

module.exports = { generateCinematicReel };
