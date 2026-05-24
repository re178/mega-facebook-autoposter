// subtitleEngine.js
const { callAIProviders } = require('./storyboardEngine');

async function getEmphasisWord(sentence, context = '') {
  if (!sentence) return sentence;
  const prompt = `From the sentence below, return the single most important word or short phrase (2-3 words) to highlight. Return only that word/phrase.
Sentence: "${sentence}"
${context ? `Context: ${context}` : ''}`;
  const aiResponse = await callAIProviders(prompt);
  if (aiResponse && aiResponse.length > 0 && aiResponse.length < 20) {
    if (sentence.toLowerCase().includes(aiResponse.toLowerCase())) return aiResponse;
  }
  // fallback: first uppercase or long word
  const words = sentence.split(/\s+/);
  return words.find(w => w[0] === w[0].toUpperCase() && w.length > 3) || words[0] || sentence;
}

async function drawSubtitles(ctx, text, emphasis, x, y, maxWidth, fontFamily, fontSize, color, accentColor, progress, sceneContext = '') {
  let finalEmphasis = emphasis;
  if (!finalEmphasis || finalEmphasis.length === 0) {
    finalEmphasis = await getEmphasisWord(text, sceneContext);
  }
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
    if (line.includes(finalEmphasis)) {
      const parts = line.split(finalEmphasis);
      let xOffset = ctx.measureText(parts[0]).width;
      ctx.fillStyle = color;
      ctx.fillText(parts[0], x - ctx.measureText(line).width/2, currentY);
      ctx.fillStyle = accentColor;
      const bounce = Math.sin(progress * Math.PI * 8) * 5;
      ctx.fillText(finalEmphasis, x - ctx.measureText(line).width/2 + xOffset, currentY + bounce);
      if (parts[1]) {
        ctx.fillStyle = color;
        ctx.fillText(parts[1], x - ctx.measureText(line).width/2 + xOffset + ctx.measureText(finalEmphasis).width, currentY);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(line, x, currentY);
    }
  }
}

module.exports = { drawSubtitles };
