// Inside cinematicEngine.js, Phase 3 rendering section
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
      
      // Memory check before batch
      const memUsed = process.memoryUsage().heapUsed / 1024 / 1024;
      if (memUsed > config.MAX_MEMORY_MB) {
        throw new Error(`Memory limit (${memUsed.toFixed(1)}MB) exceeded before rendering batch`);
      }
      
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
      
      // Force garbage collection after each batch
      if (global.gc) global.gc();
      await new Promise(r => setImmediate(r));
    }
  }
  session.frameCount = globalFrame;
  session.status = 'rendered';
  await updateJobStatus(jobId, 'composing', session);
          }
