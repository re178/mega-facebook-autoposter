// storyboardEngine.js
const {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
} = require('../../textProviders'); // adjust path

const TEXT_PROVIDERS = [
  OpenAIText,
  CloudflareText,
  GrokText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
];

const AI_TIMEOUT = 15000;
const MAX_RETRIES = 2;
const MIN_SCENES = 3;
const MAX_SCENES = 6;

async function callAIProviders(prompt, retries = 0) {
  for (const Provider of TEXT_PROVIDERS) {
    try {
      const response = await Provider.generate(prompt);
      if (response && response.trim()) return response.trim();
    } catch (err) {
      console.warn(`${Provider.name} failed:`, err.message);
    }
  }
  if (retries < MAX_RETRIES) {
    await new Promise(r => setTimeout(r, 1000));
    return callAIProviders(prompt, retries + 1);
  }
  return null;
}

function buildPageDNA(pageProfile = {}) {
  // simplified – can be extended
  return {
    pageName: pageProfile.pageName || 'My Page',
    brand: pageProfile.brand || 'modern',
    mood: pageProfile.mood || 'neutral',
    characterStyle: pageProfile.characterStyle || 'teacher',
    voiceTone: pageProfile.voiceTone || 'professional',
    audienceInterest: pageProfile.audienceInterest || []
  };
}

function validateScenePlan(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (!Array.isArray(plan.scenes)) return false;
  if (plan.scenes.length < MIN_SCENES || plan.scenes.length > MAX_SCENES) return false;
  for (const scene of plan.scenes) {
    if (!scene.emotion || !scene.duration || !scene.camera || !scene.character_action || !scene.subtitle_text) return false;
    if (typeof scene.duration !== 'number' || scene.duration < 1 || scene.duration > 8) return false;
  }
  return true;
}

async function generateScenePlan(post, pageProfile) {
  const pageDNA = buildPageDNA(pageProfile);
  const fullText = `${post.title}. ${post.text}`;
  const prompt = `You are a film director. Create a scene plan for a short reel.

Title: "${post.title}"
Text: "${post.text}"
Brand: ${pageDNA.brand}
Mood: ${pageDNA.mood}
Character style: ${pageDNA.characterStyle}

Return a JSON object exactly like:
{
  "scenes": [
    {
      "emotion": "hook|explain|climax|outro|twist|example",
      "duration_seconds": 2.5,
      "camera": { "movement": "static|shake|zoom_in|zoom_out|pan_left|pan_right", "intensity": 0.3, "zoom_level": 1.0 },
      "character_action": "neutral|excited|worried|surprised|celebrating|thinking|pointing",
      "subtitle_text": "a short phrase from the text"
    }
  ],
  "global_pacing": "slow|medium|fast",
  "music_mood": "epic|tense|calm|upbeat",
  "characterSpec": { "name": "...", "visualStyle": "...", "primaryColor": "#hex", "secondaryColor": "#hex" }
}
Rules:
- 3 to 6 scenes.
- Each subtitle_text must be from original text.
- Output only JSON, no extra text.`;

  const aiResponse = await callAIProviders(prompt);
  if (!aiResponse) return null;

  let parsed;
  try {
    // Extract JSON (in case AI adds markdown)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('AI response JSON parse error:', err.message);
    return null;
  }

  if (!validateScenePlan(parsed)) {
    console.warn('AI scene plan validation failed');
    return null;
  }

  // Add missing defaults
  for (let i = 0; i < parsed.scenes.length; i++) {
    const s = parsed.scenes[i];
    s.id = i;
    s.duration = s.duration_seconds || 2.5;
    if (!s.camera) s.camera = { movement: 'static', intensity: 0, zoom_level: 1 };
    if (!s.character_action) s.character_action = 'neutral';
    if (!s.transition_next) s.transition_next = 'cut';
  }

  return {
    scenes: parsed.scenes,
    global_pacing: parsed.global_pacing || 'medium',
    music_mood: parsed.music_mood || 'upbeat',
    characterSpec: parsed.characterSpec || {
      name: 'Host',
      visualStyle: 'human_cartoon',
      primaryColor: '#3a6ea5',
      secondaryColor: '#ffccaa'
    },
    pageDNA,
    fullText
  };
}

module.exports = { generateScenePlan, buildPageDNA };
