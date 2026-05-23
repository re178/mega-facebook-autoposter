// storyboardEngine.js
function parseBlocks(extraNotes = '') {
  const blocks = {};
  const regex = /\[(.*?)\]([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(extraNotes))) {
    const blockName = match[1].trim().toUpperCase();
    const content = match[2].trim();
    const lines = content.split('\n');
    const parsed = {};
    for (const line of lines) {
      if (!line.includes('=')) continue;
      const [key, value] = line.split('=');
      parsed[key.trim()] = value.trim();
    }
    blocks[blockName] = parsed;
  }
  return blocks;
}

function buildPageDNA(pageProfile = {}) {
  const directives = parseBlocks(pageProfile.extraNotes || '');
  const design = directives.DESIGN || {};
  const cartoon = directives.CARTOON || {};
  return {
    pageName: pageProfile.pageName || 'My Page',
    brand: design.brand || 'modern',
    mood: design.mood || 'neutral',
    characterStyle: cartoon.style || 'teacher',
    voiceTone: cartoon.voice || 'professional',
    humorLevel: parseFloat(cartoon.humor) || 0.2,
    simulation: cartoon.simulation === 'true'
  };
}

function analyzePost(title, text) {
  const combined = `${title} ${text}`.toLowerCase();
  const urgency = combined.includes('breaking') || combined.includes('urgent') ? 9 :
                  combined.includes('update') ? 5 : 3;
  let mood = 'neutral';
  if (combined.includes('inspiring')) mood = 'inspirational';
  else if (combined.includes('cinematic')) mood = 'cinematic';
  else if (combined.includes('funny')) mood = 'humorous';
  else if (urgency > 7) mood = 'urgent';
  const emotion = combined.includes('crypto') ? 'futuristic' :
                  combined.includes('politics') ? 'serious' :
                  combined.includes('sports') ? 'energetic' : 'neutral';
  return { urgency, mood, emotion };
}

function generateScenePlan(post, pageProfile) {
  const pageDNA = buildPageDNA(pageProfile);
  const analysis = analyzePost(post.title, post.text);
  const sentences = `${post.title}. ${post.text}`.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const emotionalCurve = analysis.urgency > 7 ? ['high','high','climax'] : ['neutral','build','climax','explain'];
  const scenes = [];
  let sentenceIdx = 0;
  for (let i = 0; i < emotionalCurve.length && sentenceIdx < sentences.length; i++) {
    const emotion = emotionalCurve[i];
    let sceneText = sentences[sentenceIdx++];
    if (emotion === 'climax' && sentenceIdx < sentences.length) sceneText += ' ' + sentences[sentenceIdx++];
    scenes.push({
      id: i, emotion, duration: emotion === 'climax' ? 4 : 2.5,
      text: sceneText,
      camera: emotion === 'high' ? { movement: 'shake', intensity: 0.3 } : { movement: 'static' },
      characterAction: emotion === 'climax' ? 'excited' : 'explain'
    });
  }
  return { scenes, analysis, pageDNA, visualStyle: { colorPalette: pageDNA.brand } };
}

module.exports = { generateScenePlan, buildPageDNA, analyzePost };
