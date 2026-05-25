// animationEngine.js
const TRANSITION_RULES = {
  hook: 'cut',
  explain: 'crossfade',
  climax: 'zoom_burst',
  outro: 'fade',
  twist: 'slide_left',
  example: 'slide_right'
};

function getTransition(sceneEmotion) {
  return TRANSITION_RULES[sceneEmotion] || 'cut';
}

function applyMotion(ctx, camera, progress, width, height) {
  const movement = camera.movement;
  const intensity = camera.intensity || 0.3;
  const zoom = camera.zoom_level || 1;
  if (movement === 'shake') {
    ctx.translate(Math.sin(progress * 50) * 8 * intensity, Math.cos(progress * 47) * 6 * intensity);
  } else if (movement === 'zoom_in') {
    const z = 1 + progress * (zoom - 1);
    ctx.translate(width / 2, height / 2);
    ctx.scale(z, z);
    ctx.translate(-width / 2, -height / 2);
  } else if (movement === 'zoom_out') {
    const z = 1 + (1 - progress) * (zoom - 1);
    ctx.translate(width / 2, height / 2);
    ctx.scale(z, z);
    ctx.translate(-width / 2, -height / 2);
  } else if (movement === 'pan_left') {
    ctx.translate(-width * progress * intensity, 0);
  } else if (movement === 'pan_right') {
    ctx.translate(width * progress * intensity, 0);
  }
}

module.exports = { getTransition, applyMotion };
