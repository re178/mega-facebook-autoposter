// sceneBuilder.js
const { createCanvas } = require('canvas');
const { getStyle, getFontFamily } = require('./colorEngine');
const { getOrGenerateCharacter, getCharacterEmotion, drawCharacter } = require('./characterEngine');
const { applyMotion } = require('./animationEngine');
const { drawSubtitles } = require('./subtitleEngine');

async function renderSceneFrame(scene, frameIdx, totalFrames, width, height, pageDNA, globalPlan) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const progress = frameIdx / totalFrames;
  const style = getStyle(pageDNA.brand || 'modern');
  
  // Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, style.background);
  grad.addColorStop(1, style.secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  
  // Camera motion
  ctx.save();
  applyMotion(ctx, scene.camera, progress, width, height);
  
  // Character (dynamic)
  const characterSpec = await getOrGenerateCharacter(pageDNA, globalPlan.fullText);
  const charEmotion = await getCharacterEmotion(scene.subtitle_text, scene.emotion, characterSpec);
  const mouthOpen = Math.sin(progress * Math.PI * 8) * 0.5 + 0.5;
  drawCharacter(ctx, characterSpec, width/2, height - 80, 120, 160, mouthOpen, charEmotion);
  
  // Subtitles
  const fontSize = 48;
  const fontFamily = getFontFamily(style, 'title');
  await drawSubtitles(ctx, scene.subtitle_text, scene.emphasis_word || '', width/2, height - 120,
                      width - 100, fontFamily, fontSize, style.primary, style.accent, progress, scene.emotion);
  
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
