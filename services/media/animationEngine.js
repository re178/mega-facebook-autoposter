function applyMotion(ctx, camera, progress, width, height) {
  if (camera.movement === 'shake') {
    ctx.translate(Math.sin(progress*50)*6, Math.cos(progress*47)*6);
  } else if (camera.movement === 'zoom_in') {
    const z = 1 + progress * (camera.zoom_level-1);
    ctx.translate(width/2, height/2);
    ctx.scale(z, z);
    ctx.translate(-width/2, -height/2);
  }
}
module.exports = { applyMotion };
