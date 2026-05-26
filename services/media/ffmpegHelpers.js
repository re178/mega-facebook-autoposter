// ffmpegHelpers.js
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { framesToGif } = require('./gifHelpers');
const path = require('path');
const fs = require('fs');
const config = require('./config/mediaConfig');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function framesToVideo(framesDir, outputPath, fps, audioPath = null) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(path.join(framesDir, 'frame_%04d.png')).inputFPS(fps);
    if (audioPath && fs.existsSync(audioPath)) cmd.input(audioPath).audioCodec('aac');
    cmd.outputOptions('-pix_fmt yuv420p')
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`FFmpeg: ${cmdLine}`))
      .on('end', () => resolve(outputPath))
      .on('error', async (err) => {
        console.error('FFmpeg error:', err.message);
        // Fallback to GIF
        const gifPath = outputPath.replace('.mp4', '.gif');
        try {
          console.log('Falling back to GIF');
          await framesToGif(framesDir, gifPath, fps, config.VIDEO_FORMATS.reel.width, config.VIDEO_FORMATS.reel.height);
          resolve(gifPath);
        } catch (gifErr) {
          reject(gifErr);
        }
      })
      .run();
    // Timeout
    const timeout = setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('FFmpeg timeout'));
    }, config.FFMPEG_TIMEOUT_MS);
    cmd.on('end', () => clearTimeout(timeout));
  });
}

module.exports = { framesToVideo };
