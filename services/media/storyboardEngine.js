// services/media/storyboardEngine.js
const config = require('./config/mediaConfig');

// Dynamically require providers – handle if file missing
let Providers = {};
try {
  Providers = require('../../textProviders');
} catch (err) {
  console.warn('textProviders not found, AI will fallback to heuristics');
}

const TEXT_PROVIDERS = [
  Providers.OpenAIText,
  Providers.CloudflareText,
  Providers.GrokText,
  Providers.CohereText,
  Providers.ClaudeText,
  Providers.AIHordeText,
  Providers.AI21Text
].filter(p => p && typeof p.generate === 'function'); // filter out missing

const providerStats = {};
for (const p of TEXT_PROVIDERS) {
  providerStats[p.name] = { success: 0, fail: 0 };
}

async function callAIProvidersWithScoring(prompt) {
  if (TEXT_PROVIDERS.length === 0) return null;
  const sorted = [...TEXT_PROVIDERS].sort((a,b) => {
    const rateA = (providerStats[a.name].success / (providerStats[a.name].success + providerStats[a.name].fail + 1));
    const rateB = (providerStats[b.name].success / (providerStats[b.name].success + providerStats[b.name].fail + 1));
    return rateB - rateA;
  });
  for (const Provider of sorted) {
    try {
      const response = await Provider.generate(prompt);
      if (response && response.trim()) {
        providerStats[Provider.name].success++;
        return response.trim();
      }
    } catch (err) {
      providerStats[Provider.name].fail++;
    }
  }
  return null;
}

// ---------- JSON REPAIR (enhanced) ----------
function repairJSON(str) {
  str = str.replace(/```json\s*|\s*```/g, '');
  const match = str.match(/\{[\s\S]*\}/);
  if (match) str = match[0];
  str = str.replace(/\}\s*\{/g, '},{');
  str = str.replace(/"\s+"/g, '", "');
  str = str.replace(/,\s*}/g, '}');
  str = str.replace(/,\s*]/g, ']');
  str = str.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  // Handle incomplete JSON (truncated)
  let braceCount = 0;
  let lastValidIndex = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') braceCount++;
    if (str[i] === '}') braceCount--;
    if (braceCount === 0 && (str[i] === '}' || str[i] === ']')) {
      lastValidIndex = i + 1;
    }
  }
  if (lastValidIndex > 0 && lastValidIndex < str.length) {
    str = str.substring(0, lastValidIndex);
  }
  const openBraces = (str.match(/{/g) || []).length;
  const closeBraces = (str.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    str += '}'.repeat(openBraces - closeBraces);
  }
  return str;
}

// ---------- FALLBACK PLAN ----------
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

// ---------- MAIN GENERATOR ----------
async function generateScenePlan(post, pageProfile) {
  const pageDNA = { pageName: pageProfile.pageName || 'Page', brand: pageProfile.brand || 'modern', mood: pageProfile.mood || 'neutral' };
  console.log(`[storyboard] Generating plan for "${post.title}"`);

  const prompt = `You are a JSON generator. Output ONLY valid JSON. No markdown, no extra text. Create a scene plan for a short reel.

Title: "${post.title}"
Text: "${post.text}"

Return JSON in this exact format:
{
  "scenes": [
    {
      "emotion": "hook",
      "duration_seconds": 2.5,
      "camera": {"movement": "static", "intensity": 0, "zoom_level": 1},
      "character_action": "neutral",
      "subtitle_text": "phrase from text"
    }
  ],
  "global_pacing": "medium",
  "music_mood": "upbeat",
  "characterSpec": {"name": "Host", "primaryColor": "#3a6ea5", "secondaryColor": "#ffccaa"}
}

Use 2-5 scenes. Output only the JSON object.`;

  const aiResponse = await callAIProvidersWithScoring(prompt);
  if (aiResponse) {
    try {
      const repaired = repairJSON(aiResponse);
      const parsed = JSON.parse(repaired);
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
    } catch(e) { console.warn('AI JSON parse error', e.message); }
  }

  console.warn('[storyboard] AI failed, using fallback plan');
  return generateFallbackPlan(post, pageDNA);
}

module.exports = { generateScenePlan };
