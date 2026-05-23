// subtitleEngine.js
function drawSubtitles(ctx, text, emphasis, x, y, maxWidth, fontFamily, fontSize, color, accentColor, progress) {
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'black';
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillStyle = color;
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += fontSize * 1.2;
    } else {
      line = testLine;
    }
  }
  if (line) {
    if (line.includes(emphasis)) {
      const parts = line.split(emphasis);
      let xOffset = ctx.measureText(parts[0]).width;
      ctx.fillStyle = color;
      ctx.fillText(parts[0], x - ctx.measureText(line).width/2, currentY);
      ctx.fillStyle = accentColor;
      // Bounce effect on emphasis word
      const bounce = Math.sin(progress * Math.PI * 8) * 5;
      ctx.fillText(emphasis, x - ctx.measureText(line).width/2 + xOffset, currentY + bounce);
      if (parts[1]) {
        ctx.fillStyle = color;
        ctx.fillText(parts[1], x - ctx.measureText(line).width/2 + xOffset + ctx.measureText(emphasis).width, currentY);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(line, x, currentY);
    }
  }
}
module.exports = { drawSubtitles };
