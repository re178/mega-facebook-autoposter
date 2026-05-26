function drawSubtitlesPrecomputed(ctx, { lines, emphasisIndex, emphasisWord, x, y, maxWidth, fontFamily, fontSize, color, accentColor, progress }) {
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'black';
  let currentY = y;
  for (let i=0; i<lines.length; i++) {
    const line = lines[i];
    if (i === emphasisIndex && emphasisWord) {
      const parts = line.split(emphasisWord);
      let offset = ctx.measureText(parts[0]).width;
      ctx.fillStyle = color;
      ctx.fillText(parts[0], x - ctx.measureText(line).width/2, currentY);
      ctx.fillStyle = accentColor;
      ctx.fillText(emphasisWord, x - ctx.measureText(line).width/2 + offset, currentY + Math.sin(progress*Math.PI*8)*5);
      if (parts[1]) {
        ctx.fillStyle = color;
        ctx.fillText(parts[1], x - ctx.measureText(line).width/2 + offset + ctx.measureText(emphasisWord).width, currentY);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(line, x, currentY);
    }
    currentY += fontSize * 1.2;
  }
}
module.exports = { drawSubtitlesPrecomputed };
