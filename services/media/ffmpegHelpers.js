// ffmpegHelpers.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { framesToGif } = require('./gifHelpers');

const MAX_FFMPEG_TIME = 120000; // 2 minutes

async function framesToVideo(framesDir, outputPath, fps, audioPath = null) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(path.join(framesDir, 'frame_%04d.png')).inputFPS(fps);
    if (audioPath && fs.existsSync(audioPath)) {
      cmd.input(audioPath).audioCodec('aac');
    }
    cmd.outputOptions('-pix_fmt yuv420p')
      .output(outputPath)
      .on('start', (cmdLine) => console.log('FFmpeg command:', cmdLine))
      .on('end', () => resolve(outputPath))
      .on('error', async (err) => {
        console.error('FFmpeg error:', err.message);
        // Fallback to GIF
        const gifPath = outputPath.replace('.mp4', '.gif');
        try {
          await framesToGif(framesDir, gifPath, fps, 1080, 1920);
          resolve(gifPath);
        } catch (gifErr) {
          reject(gifErr);
        }
      })
      .run();

    // Timeout guard
    const timeout = setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('FFmpeg timeout exceeded'));
    }, MAX_FFMPEG_TIME);
    cmd.on('end', () => clearTimeout(timeout));
  });
}

module.exports = { framesToVideo };
