// services/media/precomputeEngine.js
const { createCanvas } = require('canvas');
const { getFontFamily } = require('./colorEngine');

function precomputeSubtitles(scene, width, style) {
  const canvas = createCanvas(width, 100);
  const ctx = canvas.getContext('2d');
  const fontSize = 48;
  const fontFamily = getFontFamily(style, 'title');
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  const words = scene.subtitle_text.split(' ');
  let lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > width - 100) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  // Find emphasis word position (simplified)
  let emphasisIndex = -1;
  for (let i=0;i<lines.length;i++) {
    if (lines[i].includes(scene.emphasisWord)) { emphasisIndex = i; break; }
  }
  return { lines, emphasisIndex, fontSize, fontFamily };
}

function precomputeAllScenes(scenes, width, style) {
  return scenes.map(scene => ({
    ...scene,
    subtitleLayout: precomputeSubtitles(scene, width, style)
  }));
}

module.exports = { precomputeAllScenes };
