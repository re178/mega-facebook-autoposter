// characterEngine.js
const { generateCharacter, drawCharacterFromSpec } = require('./characterGenerator');
const { callAIProviders } = require('./storyboardEngine');

let currentCharacterSpec = null;

async function getOrGenerateCharacter(pageDNA, topicText) {
  if (!currentCharacterSpec) {
    currentCharacterSpec = await generateCharacter(pageDNA, topicText);
  }
  return currentCharacterSpec;
}

async function getCharacterEmotion(sceneText, sceneEmotion, characterSpec) {
  const prompt = `You are an animation director. Character personality: "${characterSpec.personality}". Choose ONE emotion from: neutral, excited, worried, surprised, celebrating, thinking, angry, sad, laughing, confident, funny.
Scene text: "${sceneText}"
Scene emotion: ${sceneEmotion}
Return only the emotion word.`;

  const aiResponse = await callAIProviders(prompt);
  const valid = ['neutral','excited','worried','surprised','celebrating','thinking','angry','sad','laughing','confident','funny'];
  if (aiResponse && valid.includes(aiResponse.toLowerCase())) return aiResponse.toLowerCase();
  // fallback
  if (sceneEmotion === 'climax') return 'excited';
  if (sceneEmotion === 'hook') return 'surprised';
  return characterSpec.personality === 'energetic' ? 'excited' : 'neutral';
}

function drawCharacter(ctx, characterSpec, x, y, width, height, mouthOpen, emotion) {
  drawCharacterFromSpec(ctx, characterSpec, x, y, width, height, mouthOpen, emotion);
}

module.exports = { getOrGenerateCharacter, getCharacterEmotion, drawCharacter };
