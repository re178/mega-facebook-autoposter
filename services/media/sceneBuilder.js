// services/media/sceneBuilder.js
const { createCanvas } = require('canvas');
const { getStyle, getFontFamily } = require('./colorEngine');
const { drawCharacter } = require('./characterEngine');
const { applyMotion } = require('./animationEngine');
const { drawSubtitlesPrecomputed } = require('./subtitleEngine');

async function renderSceneFrame({ scene, frameIdx, totalFrames, width, height, characterSpec, globalPlan, pageProfile }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const progress = frameIdx / totalFrames;
  const style = getStyle(pageProfile.brand || 'modern');

  // Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, style.background);
  grad.addColorStop(1, style.secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Camera motion
  ctx.save();
  applyMotion(ctx, scene.camera, progress, width, height);

  // Character (precomputed spec)
  const mouthOpen = Math.sin(progress * Math.PI * 8) * 0.5 + 0.5;
  drawCharacter(ctx, characterSpec, width/2, height - 80, 120, 160, mouthOpen, scene.character_action);

  // Subtitles (using precomputed layout)
  const fontSize = scene.subtitleLayout.fontSize;
  const fontFamily = scene.subtitleLayout.fontFamily;
  drawSubtitlesPrecomputed(ctx, {
    lines: scene.subtitleLayout.lines,
    emphasisIndex: scene.subtitleLayout.emphasisIndex,
    emphasisWord: scene.emphasisWord,
    x: width/2,
    y: height - 120,
    maxWidth: width - 100,
    fontFamily,
    fontSize,
    color: style.primary,
    accentColor: style.accent,
    progress
  });

  ctx.restore();

  // Vignette
  const vignette = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/0.8);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  return canvas.toBuffer();
}

module.exports = { renderSceneFrame };
