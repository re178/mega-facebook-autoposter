// characterEngine.js
function drawCharacter(ctx, character, x, y, width, height, mouthOpen) {
  ctx.save();
  ctx.translate(x, y - height * 0.8);
  // Body
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(-width/2, -height/2, width, height);
  // Head
  ctx.fillStyle = '#ffccaa';
  ctx.beginPath();
  ctx.arc(0, -height/2 - 20, height*0.35, 0, 2*Math.PI);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-15, -height/2 - 30, 5, 0, 2*Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(15, -height/2 - 30, 5, 0, 2*Math.PI);
  ctx.fill();
  // Mouth (lip sync)
  ctx.beginPath();
  if (mouthOpen > 0.5) ctx.arc(0, -height/2 - 15, 10, 0.1, Math.PI - 0.1);
  else ctx.arc(0, -height/2 - 15, 8, 0, Math.PI);
  ctx.fillStyle = '#8b0000';
  ctx.fill();
  // Glasses
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(-22, -height/2 - 38, 18, 14);
  ctx.strokeRect(4, -height/2 - 38, 18, 14);
  ctx.restore();
}
module.exports = { drawCharacter };
