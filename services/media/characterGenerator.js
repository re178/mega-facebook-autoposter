// characterGenerator.js
const { callAIProviders } = require('./storyboardEngine');

async function generateCharacter(pageDNA, topicText) {
  const prompt = `You are a character designer for short video reels. Create a unique character for this context:

Page name: ${pageDNA.pageName}
Audience interests: ${(pageDNA.audienceInterest || []).join(', ') || 'general'}
Topic text: "${topicText.substring(0, 300)}"

Return a JSON object with:
{
  "name": "short name",
  "visualStyle": "human_cartoon|robot|animal|abstract|futuristic|fantasy",
  "primaryColor": "#hex",
  "secondaryColor": "#hex",
  "eyeStyle": "circle|oval|glowing|dots",
  "headShape": "round|square|triangle|organic",
  "accessories": ["glasses","hat","tie","headphones","none"],
  "personality": "energetic|calm|sarcastic|authoritative|funny",
  "voiceTone": "string"
}
Only valid JSON.`;

  const aiResponse = await callAIProviders(prompt);
  if (!aiResponse) return getFallbackCharacter(pageDNA);

  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return getFallbackCharacter(pageDNA);

  try {
    const spec = JSON.parse(jsonMatch[0]);
    // defaults
    if (!spec.visualStyle) spec.visualStyle = 'human_cartoon';
    if (!spec.primaryColor) spec.primaryColor = '#3a6ea5';
    if (!spec.secondaryColor) spec.secondaryColor = '#ffccaa';
    if (!spec.eyeStyle) spec.eyeStyle = 'circle';
    if (!spec.headShape) spec.headShape = 'round';
    if (!spec.accessories) spec.accessories = [];
    if (!spec.personality) spec.personality = 'neutral';
    return spec;
  } catch (err) {
    console.warn('Character generation error:', err.message);
    return getFallbackCharacter(pageDNA);
  }
}

function getFallbackCharacter(pageDNA) {
  const interests = (pageDNA.audienceInterest || []).join(' ').toLowerCase();
  if (interests.includes('crypto')) return {
    name: 'Crypto Bot', visualStyle: 'robot', primaryColor: '#00d4ff', secondaryColor: '#0a0f1a',
    eyeStyle: 'glowing', headShape: 'square', accessories: ['headphones'], personality: 'energetic', voiceTone: 'digital'
  };
  if (interests.includes('finance')) return {
    name: 'Money Expert', visualStyle: 'human_cartoon', primaryColor: '#2c3e50', secondaryColor: '#e0ac69',
    eyeStyle: 'circle', headShape: 'round', accessories: ['glasses','tie'], personality: 'authoritative', voiceTone: 'calm'
  };
  return {
    name: 'Host', visualStyle: 'human_cartoon', primaryColor: '#3a6ea5', secondaryColor: '#ffccaa',
    eyeStyle: 'circle', headShape: 'round', accessories: [], personality: 'neutral', voiceTone: 'neutral'
  };
}

function drawCharacterFromSpec(ctx, spec, x, y, width, height, mouthOpen, emotion) {
  ctx.save();
  ctx.translate(x, y - height * 0.8);
  // Body
  ctx.fillStyle = spec.primaryColor;
  ctx.fillRect(-width/2, -height/2, width, height);
  // Head
  ctx.fillStyle = spec.secondaryColor;
  const hr = height * 0.35;
  if (spec.headShape === 'round') {
    ctx.beginPath(); ctx.arc(0, -height/2 - hr, hr, 0, 2*Math.PI); ctx.fill();
  } else if (spec.headShape === 'square') {
    ctx.fillRect(-hr, -height/2 - hr*2, hr*2, hr*2);
  } else if (spec.headShape === 'triangle') {
    ctx.beginPath(); ctx.moveTo(0, -height/2 - hr*2); ctx.lineTo(-hr, -height/2 - hr); ctx.lineTo(hr, -height/2 - hr); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(0, -height/2 - hr, hr, hr*1.2, 0, 0, 2*Math.PI); ctx.fill();
  }
  // Eyes
  ctx.fillStyle = '#000';
  const eyeY = -height/2 - hr - (spec.headShape === 'square' ? 5 : 0);
  if (spec.eyeStyle === 'glowing') { ctx.shadowBlur = 8; ctx.shadowColor = spec.primaryColor; }
  ctx.beginPath(); ctx.arc(-12, eyeY, 5, 0, 2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(12, eyeY, 5, 0, 2*Math.PI); ctx.fill();
  ctx.shadowBlur = 0;
  // Mouth (emotion + lip sync)
  const mouthY = -height/2 - hr + 15;
  ctx.beginPath();
  if (emotion === 'happy' || emotion === 'excited') ctx.arc(0, mouthY, 10, 0.1, Math.PI - 0.1);
  else if (emotion === 'sad') ctx.arc(0, mouthY, 10, Math.PI + 0.1, 2*Math.PI - 0.1);
  else if (mouthOpen > 0.5) ctx.arc(0, mouthY, 10, 0.1, Math.PI - 0.1);
  else ctx.arc(0, mouthY, 8, 0, Math.PI);
  ctx.fillStyle = '#8b0000';
  ctx.fill();
  // Accessories
  if (spec.accessories.includes('glasses')) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(-22, eyeY-8, 18, 16); ctx.strokeRect(4, eyeY-8, 18, 16);
  }
  if (spec.accessories.includes('hat')) {
    ctx.fillStyle = spec.primaryColor;
    ctx.fillRect(-25, eyeY-25, 50, 12); ctx.fillRect(-10, eyeY-35, 20, 12);
  }
  if (spec.accessories.includes('tie')) {
    ctx.fillStyle = '#8b0000';
    ctx.beginPath(); ctx.moveTo(-8, -height/2 + 20); ctx.lineTo(0, -height/2 + 40); ctx.lineTo(8, -height/2 + 20); ctx.fill();
  }
  ctx.restore();
}

module.exports = { generateCharacter, drawCharacterFromSpec };
