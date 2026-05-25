// characterEngine.js
function drawCharacter(ctx, spec, x, y, width, height, mouthOpen, emotion = 'neutral') {
  ctx.save();
  ctx.translate(x, y - height * 0.8);

  // Body
  ctx.fillStyle = spec.primaryColor || '#3a6ea5';
  ctx.fillRect(-width / 2, -height / 2, width, height);

  // Head
  ctx.fillStyle = spec.secondaryColor || '#ffccaa';
  const hr = height * 0.35;
  const headShape = spec.headShape || 'round';
  if (headShape === 'round') {
    ctx.beginPath();
    ctx.arc(0, -height / 2 - hr, hr, 0, 2 * Math.PI);
    ctx.fill();
  } else if (headShape === 'square') {
    ctx.fillRect(-hr, -height / 2 - hr * 2, hr * 2, hr * 2);
  } else {
    ctx.beginPath();
    ctx.ellipse(0, -height / 2 - hr, hr, hr * 1.2, 0, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Eyes
  ctx.fillStyle = '#000';
  const eyeY = -height / 2 - hr - (headShape === 'square' ? 5 : 0);
  ctx.beginPath();
  ctx.arc(-12, eyeY, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12, eyeY, 5, 0, 2 * Math.PI);
  ctx.fill();

  // Mouth (lip sync + emotion)
  const mouthY = -height / 2 - hr + 15;
  ctx.beginPath();
  if (emotion === 'happy' || emotion === 'excited') {
    ctx.arc(0, mouthY, 10, 0.1, Math.PI - 0.1);
  } else if (emotion === 'sad') {
    ctx.arc(0, mouthY, 10, Math.PI + 0.1, 2 * Math.PI - 0.1);
  } else if (mouthOpen > 0.5) {
    ctx.arc(0, mouthY, 10, 0.1, Math.PI - 0.1);
  } else {
    ctx.arc(0, mouthY, 8, 0, Math.PI);
  }
  ctx.fillStyle = '#8b0000';
  ctx.fill();

  // Simple accessories if defined
  if (spec.accessories && spec.accessories.includes('glasses')) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(-22, eyeY - 8, 18, 16);
    ctx.strokeRect(4, eyeY - 8, 18, 16);
  }

  ctx.restore();
}

module.exports = { drawCharacter };
