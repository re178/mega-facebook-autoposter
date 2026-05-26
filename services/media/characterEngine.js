function drawCharacter(ctx, spec, x, y, width, height, mouthOpen, emotion) {
  ctx.save();
  ctx.translate(x, y - height * 0.8);
  ctx.fillStyle = spec.primaryColor || '#3a6ea5';
  ctx.fillRect(-width/2, -height/2, width, height);
  ctx.fillStyle = spec.secondaryColor || '#ffccaa';
  ctx.beginPath();
  ctx.arc(0, -height/2 - height*0.35, height*0.35, 0, 2*Math.PI);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(-12, -height/2 - height*0.35 - 5, 5, 0, 2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -height/2 - height*0.35 - 5, 5, 0, 2*Math.PI); ctx.fill();
  ctx.fillStyle = '#8b0000';
  ctx.beginPath();
  if (mouthOpen > 0.5) ctx.arc(0, -height/2 - height*0.35 + 5, 8, 0.1, Math.PI - 0.1);
  else ctx.arc(0, -height/2 - height*0.35 + 5, 6, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}
module.exports = { drawCharacter };
