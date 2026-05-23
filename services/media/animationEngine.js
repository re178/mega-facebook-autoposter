// animationEngine.js
function applyMotion(ctx, motion, progress, width, height) {
  switch (motion) {
    case 'shake':
      ctx.translate(Math.sin(progress * 50) * 8, Math.cos(progress * 47) * 6);
      break;
    case 'zoom':
      const scale = 1 + progress * 0.2;
      ctx.translate(width/2, height/2);
      ctx.scale(scale, scale);
      ctx.translate(-width/2, -height/2);
      break;
    default: break;
  }
}
module.exports = { applyMotion };
