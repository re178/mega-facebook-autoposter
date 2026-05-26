// gifHelpers.js
const GIFEncoder = require('gifencoder');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function framesToGif(framesDir, outputPath, fps, width, height) {
  return new Promise((resolve, reject) => {
    const encoder = new GIFEncoder(width, height);
    const stream = fs.createWriteStream(outputPath);
    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(1000 / fps);
    encoder.setQuality(10);
    const frames = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_') && f.endsWith('.png')).sort();
    let idx = 0;
    function processNext() {
      if (idx >= frames.length) {
        encoder.finish();
        stream.on('finish', () => resolve(outputPath));
        return;
      }
      const framePath = path.join(framesDir, frames[idx]);
      loadImage(framePath).then(img => {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        encoder.addFrame(ctx);
        idx++;
        processNext();
      }).catch(reject);
    }
    processNext();
  });
}
module.exports = { framesToGif };
