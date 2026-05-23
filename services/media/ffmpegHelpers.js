// ffmpegHelpers.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

async function framesToVideo(framesDir, outputPath, fps, audioPath = null) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(path.join(framesDir, 'frame_%04d.png')).inputFPS(fps);
    if (audioPath && require('fs').existsSync(audioPath)) cmd.input(audioPath).audioCodec('aac');
    cmd.outputOptions('-pix_fmt yuv420p').output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
module.exports = { framesToVideo };
