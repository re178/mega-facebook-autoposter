// storyboardEngine.js
const {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
} = requirerequire('../textProviders')

// ---------------------- AI PROVIDER LIST ----------------------
const TEXT_PROVIDERS = [
  OpenAIText,
  CloudflareText,
  GrokText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
];

async function callAIProviders(prompt) {
  for (const Provider of TEXT_PROVIDERS) {
    try {
      const response = await Provider.generate(prompt);
      if (response && response.trim()) return response.trim();
    } catch (err) {
      console.warn(`${Provider.name} failed:`, err.message);
    }
  }
  return null;
}

// ---------------------- PAGE DNA (simplified) ----------------------
function buildPageDNA(pageProfile = {}) {
  return {
    pageName: pageProfile.pageName || 'My Page',
    brand: pageProfile.brand || 'modern',
    mood: pageProfile.mood || 'neutral',
    characterStyle: pageProfile.characterStyle || 'auto',
    voiceTone: pageProfile.voiceTone || 'professional',
    audienceInterest: pageProfile.audienceInterest || []
  };
}

// ---------------------- AI SCENE PLAN (complete cinematic direction) ----------------------
async function generateScenePlan(post, pageProfile) {
  const pageDNA = buildPageDNA(pageProfile);
  const fullText = `${post.title}. ${post.text}`;
  const prompt = `You are a world‑class film director for short social media reels (15‑30 seconds). Analyze the text below and create a full cinematic scene plan.

Title: "${post.title}"
Text: "${post.text}"
Brand style: ${pageDNA.brand}
Desired mood: ${pageDNA.mood}
Page audience: ${(pageDNA.audienceInterest || []).join(', ') || 'general'}

Return ONLY valid JSON in this exact structure (no extra text):
{
  "scenes": [
    {
      "emotion": "hook|explain|climax|outro|twist|example",
      "duration_seconds": 2.5,
      "camera": {
        "movement": "static|shake|zoom_in|zoom_out|pan_left|pan_right|dolly|orbit",
        "intensity": 0.0,
        "zoom_level": 1.0
      },
      "character_action": "neutral|excited|worried|surprised|celebrating|thinking|pointing",
      "subtitle_text": "The exact phrase for this scene (from original text)",
      "transition_next": "cut|fade|crossfade|zoom_burst|slide_left|slide_right|wipe"
    }
  ],
  "global_pacing": "slow|medium|fast",
  "music_mood": "epic|tense|calm|upbeat|dramatic",
  "color_emphasis": "warm|cool|neon|dark|vibrant"
}

Rules:
- Exactly 3 to 6 scenes.
- Each scene's subtitle_text must be a direct quote or close paraphrase from the original title/text.
- Duration between 2 and 5 seconds.
- Choose camera movements and character actions that match the emotion.
- Output JSON only.`;

  const aiResponse = await callAIProviders(prompt);
  if (!aiResponse) return null;

  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.scenes && Array.isArray(parsed.scenes) && parsed.scenes.length >= 2) {
      for (let i = 0; i < parsed.scenes.length; i++) {
        const s = parsed.scenes[i];
        s.id = i;
        s.duration = s.duration_seconds || 2.5;
        if (!s.camera) s.camera = { movement: 'static', intensity: 0, zoom_level: 1 };
        if (!s.character_action) s.character_action = 'neutral';
        if (!s.transition_next) s.transition_next = i === parsed.scenes.length-1 ? 'fade' : 'cut';
        if (!s.subtitle_text) s.subtitle_text = i === 0 ? post.title : post.text.split('.')[i] || post.text;
      }
      return {
        scenes: parsed.scenes,
        global_pacing: parsed.global_pacing || 'medium',
        music_mood: parsed.music_mood || 'upbeat',
        color_emphasis: parsed.color_emphasis || 'vibrant',
        pageDNA,
        fullText
      };
    }
  } catch (err) {
    console.warn('AI scene plan JSON parse error:', err.message);
  }
  return null;
}

module.exports = { generateScenePlan, buildPageDNA, callAIProviders };
