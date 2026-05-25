// subtitleEngine.js
function drawSubtitlesPrecomputed(ctx, { text, emphasisWord, x, y, maxWidth, fontFamily, fontSize, color, accentColor, progress }) {
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
    if (line.includes(emphasisWord)) {
      const parts = line.split(emphasisWord);
      let xOffset = ctx.measureText(parts[0]).width;
      ctx.fillStyle = color;
      ctx.fillText(parts[0], x - ctx.measureText(line).width / 2, currentY);
      ctx.fillStyle = accentColor;
      const bounce = Math.sin(progress * Math.PI * 8) * 5;
      ctx.fillText(emphasisWord, x - ctx.measureText(line).width / 2 + xOffset, currentY + bounce);
      if (parts[1]) {
        ctx.fillStyle = color;
        ctx.fillText(parts[1], x - ctx.measureText(line).width / 2 + xOffset + ctx.measureText(emphasisWord).width, currentY);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(line, x, currentY);
    }
  }
}

module.exports = { drawSubtitlesPrecomputed };
