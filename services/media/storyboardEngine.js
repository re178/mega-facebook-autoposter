// services/media/storyboardEngine.js
const config = require('./config/mediaConfig');

// Your existing AI providers (adjust path if needed)
const {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
} = require('../textProviders');

const TEXT_PROVIDERS = [
  OpenAIText,
  CloudflareText,
  GrokText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
];

// Provider scoring state (in‑memory)
const providerStats = {};
for (const p of TEXT_PROVIDERS) {
  providerStats[p.name] = { success: 0, fail: 0, lastSuccess: 0, lastFail: 0 };
}

// SINGLE definition – no duplicate
async function callAIProvidersWithScoring(prompt) {
  // Sort providers by success rate (descending)
  const sorted = [...TEXT_PROVIDERS].sort((a,b) => {
    const rateA = (providerStats[a.name].success / (providerStats[a.name].success + providerStats[a.name].fail + 1));
    const rateB = (providerStats[b.name].success / (providerStats[b.name].success + providerStats[b.name].fail + 1));
    return rateB - rateA;
  });
  for (const Provider of sorted) {
    try {
      const start = Date.now();
      const response = await Provider.generate(prompt);
      const latency = Date.now() - start;
      if (response && response.trim()) {
        providerStats[Provider.name].success++;
        providerStats[Provider.name].lastSuccess = Date.now();
        console.log(`[AI] ${Provider.name} succeeded in ${latency}ms`);
        return response.trim();
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      providerStats[Provider.name].fail++;
      providerStats[Provider.name].lastFail = Date.now();
      console.warn(`[AI] ${Provider.name} failed:`, err.message);
    }
  }
  return null;
}

// ---------- Fallback deterministic plan ----------
function generateFallbackPlan(post, pageDNA) {
  const fullText = `${post.title}. ${post.text}`;
  const sentences = fullText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const scenes = [];
  const maxScenes = Math.min(5, Math.max(2, sentences.length));
  for (let i = 0; i < maxScenes; i++) {
    let text = sentences[i] || (i === 0 ? post.title : post.text);
    let emotion = 'explain';
    if (i === 0) emotion = 'hook';
    if (i === maxScenes-1) emotion = 'outro';
    const camera = emotion === 'climax' ? { movement: 'zoom_in', intensity: 0.3, zoom_level: 1.2 } : { movement: 'static', intensity: 0, zoom_level: 1 };
    const characterAction = emotion === 'climax' ? 'excited' : (emotion === 'hook' ? 'surprised' : 'neutral');
    scenes.push({
      id: i,
      emotion,
      duration: emotion === 'climax' ? 3 : 2.5,
      camera,
      character_action: characterAction,
      subtitle_text: text,
      transition_next: i === maxScenes-1 ? 'fade' : 'cut',
      emphasisWord: text.split(' ').find(w => w.length > 5 && w[0] === w[0].toUpperCase()) || text.split(' ')[0]
    });
  }
  const characterSpec = {
    name: 'Default Host',
    visualStyle: 'human_cartoon',
    primaryColor: '#3a6ea5',
    secondaryColor: '#ffccaa',
    eyeStyle: 'circle',
    headShape: 'round',
    accessories: [],
    personality: 'neutral',
    voiceTone: 'neutral'
  };
  return { scenes, global_pacing: 'medium', music_mood: 'upbeat', characterSpec, pageDNA, fullText };
}

// ---------- Main scene plan generator ----------
async function generateScenePlan(post, pageProfile) {
  const pageDNA = { pageName: pageProfile.pageName || 'Page', brand: pageProfile.brand || 'modern', mood: pageProfile.mood || 'neutral' };
  console.log(`[storyboard] Generating plan for "${post.title}"`);

  const prompt = `Create a JSON scene plan for a short reel. Title: "${post.title}", Text: "${post.text}". Return only JSON: { "scenes": [ { "emotion": "hook|explain|climax|outro", "duration_seconds": 2.5, "camera": { "movement": "static|shake|zoom_in", "intensity": 0.3, "zoom_level": 1 }, "character_action": "neutral|excited|worried", "subtitle_text": "phrase" } ], "global_pacing": "medium", "music_mood": "upbeat", "characterSpec": { "name": "...", "primaryColor": "#hex", "secondaryColor": "#hex" } }`;

  const aiResponse = await callAIProvidersWithScoring(prompt);
  if (aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.scenes && parsed.scenes.length >= 2) {
          for (let i=0;i<parsed.scenes.length;i++) {
            parsed.scenes[i].id = i;
            parsed.scenes[i].duration = parsed.scenes[i].duration_seconds || 2.5;
            if (!parsed.scenes[i].camera) parsed.scenes[i].camera = { movement: 'static', intensity: 0, zoom_level: 1 };
            if (!parsed.scenes[i].character_action) parsed.scenes[i].character_action = 'neutral';
            if (!parsed.scenes[i].transition_next) parsed.scenes[i].transition_next = i===parsed.scenes.length-1 ? 'fade' : 'cut';
            parsed.scenes[i].emphasisWord = parsed.scenes[i].subtitle_text.split(' ')[0];
          }
          if (!parsed.characterSpec) parsed.characterSpec = { name: 'AI Host', primaryColor: '#3a6ea5', secondaryColor: '#ffccaa' };
          console.log(`[storyboard] AI plan generated with ${parsed.scenes.length} scenes`);
          return { scenes: parsed.scenes, global_pacing: parsed.global_pacing, music_mood: parsed.music_mood, characterSpec: parsed.characterSpec, pageDNA, fullText: `${post.title}. ${post.text}` };
        }
      }
    } catch(e) { console.warn('AI JSON parse error', e.message); }
  }

  console.warn('[storyboard] AI failed, using fallback plan');
  return generateFallbackPlan(post, pageDNA);
}

module.exports = { generateScenePlan };
