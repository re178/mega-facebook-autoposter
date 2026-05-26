// services/media/storyboardEngine.js

const config = require('./config/mediaConfig');

// Your existing AI providers
const {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
} = require('../textProviders');

// -----------------------------
// Provider List
// -----------------------------
const TEXT_PROVIDERS = [
  OpenAIText,
  CloudflareText,
  GrokText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
];

// -----------------------------
// Provider Scoring State
// -----------------------------
const providerStats = {};

for (const p of TEXT_PROVIDERS) {
  providerStats[p.name] = {
    success: 0,
    fail: 0,
    lastSuccess: 0,
    lastFail: 0
  };
}

// -----------------------------
// Safe JSON Parser
// -----------------------------
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    try {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) return null;

      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// -----------------------------
// AI Provider Scoring Engine
// -----------------------------
async function callAIProvidersWithScoring(prompt) {

  // Sort providers by success rate
  const sorted = [...TEXT_PROVIDERS].sort((a, b) => {

    const rateA =
      providerStats[a.name].success /
      (
        providerStats[a.name].success +
        providerStats[a.name].fail +
        1
      );

    const rateB =
      providerStats[b.name].success /
      (
        providerStats[b.name].success +
        providerStats[b.name].fail +
        1
      );

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

        console.log(
          `[AI] ${Provider.name} succeeded in ${latency}ms`
        );

        return response.trim();

      } else {

        throw new Error('Empty response');
      }

    } catch (err) {

      providerStats[Provider.name].fail++;
      providerStats[Provider.name].lastFail = Date.now();

      console.warn(
        `[AI] ${Provider.name} failed:`,
        err.message
      );
    }
  }

  return null;
}

// -----------------------------
// Fallback Deterministic Plan
// -----------------------------
function generateFallbackPlan(post, pageDNA) {

  const fullText = `${post.title}. ${post.text}`;

  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  const scenes = [];

  const maxScenes = Math.min(
    5,
    Math.max(3, sentences.length)
  );

  for (let i = 0; i < maxScenes; i++) {

    let text =
      sentences[i] ||
      (i === 0 ? post.title : post.text);

    let emotion = 'explain';

    if (i === 0) emotion = 'hook';
    if (i === maxScenes - 2) emotion = 'climax';
    if (i === maxScenes - 1) emotion = 'outro';

    const camera =
      emotion === 'climax'
        ? {
            movement: 'zoom_in',
            intensity: 0.3,
            zoom_level: 1.2
          }
        : {
            movement: 'static',
            intensity: 0,
            zoom_level: 1
          };

    const characterAction =
      emotion === 'climax'
        ? 'excited'
        : emotion === 'hook'
        ? 'surprised'
        : 'neutral';

    scenes.push({
      id: i,
      emotion,
      duration: emotion === 'climax' ? 3 : 2.5,
      camera,
      character_action: characterAction,
      subtitle_text: text,
      transition_next:
        i === maxScenes - 1 ? 'fade' : 'cut',
      emphasisWord:
        text.split(' ').find(
          w =>
            w.length > 5 &&
            w[0] === w[0].toUpperCase()
        ) || text.split(' ')[0]
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

  return {
    scenes,
    global_pacing: 'medium',
    music_mood: 'upbeat',
    characterSpec,
    pageDNA,
    fullText
  };
}

// -----------------------------
// Main Scene Generator
// -----------------------------
async function generateScenePlan(post, pageProfile) {

  const pageDNA = {
    pageName: pageProfile.pageName || 'Page',
    brand: pageProfile.brand || 'modern',
    mood: pageProfile.mood || 'neutral'
  };

  console.log(
    `[storyboard] Generating plan for "${post.title}"`
  );

  // -----------------------------
  // STRICT PROMPT
  // -----------------------------
  const prompt = `
You are a professional cinematic storyboard AI engine.

TASK:
Generate a highly engaging short-video storyboard.

STRICT RULES:
1. Return ONLY valid JSON.
2. No markdown.
3. No explanations.
4. No comments.
5. No extra text.
6. Output must begin with { and end with }.
7. All fields are required.
8. Generate between 3 and 6 scenes.
9. Scene subtitles must be emotional and concise.
10. Each scene should feel visually different.
11. JSON must be syntactically valid.
12. Use double quotes only.
13. No trailing commas.

STRUCTURE RULES:
- First scene emotion = "hook"
- Last scene emotion = "outro"
- At least one middle scene emotion = "climax"

ALLOWED VALUES:

emotion:
["hook","explain","climax","outro"]

camera.movement:
[
"static",
"shake",
"zoom_in",
"zoom_out",
"pan_left",
"pan_right"
]

character_action:
[
"neutral",
"excited",
"worried",
"surprised",
"talking",
"pointing"
]

global_pacing:
[
"slow",
"medium",
"fast"
]

music_mood:
[
"upbeat",
"emotional",
"dramatic",
"inspirational",
"suspense"
]

SCENE GUIDELINES:
- HOOK scenes must grab attention instantly.
- EXPLAIN scenes should clearly progress the story.
- CLIMAX scenes should feel emotionally intense.
- OUTRO scenes should feel resolved or memorable.

REQUIRED JSON FORMAT:

{
  "scenes": [
    {
      "emotion": "hook",
      "duration_seconds": 2.5,
      "camera": {
        "movement": "zoom_in",
        "intensity": 0.3,
        "zoom_level": 1.2
      },
      "character_action": "surprised",
      "subtitle_text": "Did you know this?"
    }
  ],
  "global_pacing": "medium",
  "music_mood": "upbeat",
  "characterSpec": {
    "name": "AI Host",
    "visualStyle": "human_cartoon",
    "primaryColor": "#3a6ea5",
    "secondaryColor": "#ffccaa",
    "eyeStyle": "circle",
    "headShape": "round",
    "accessories": [],
    "personality": "friendly",
    "voiceTone": "energetic"
  }
}

VIDEO TITLE:
"${post.title}"

VIDEO CONTENT:
"${post.text}"

Generate the storyboard now.
`;

  // -----------------------------
  // AI Generation
  // -----------------------------
  const aiResponse =
    await callAIProvidersWithScoring(prompt);

  if (aiResponse) {

    try {

      const parsed = safeJsonParse(aiResponse);

      if (
        parsed &&
        parsed.scenes &&
        Array.isArray(parsed.scenes) &&
        parsed.scenes.length >= 2
      ) {

        for (let i = 0; i < parsed.scenes.length; i++) {

          const scene = parsed.scenes[i];

          scene.id = i;

          scene.duration =
            scene.duration_seconds || 2.5;

          if (!scene.camera) {
            scene.camera = {
              movement: 'static',
              intensity: 0,
              zoom_level: 1
            };
          }

          if (!scene.character_action) {
            scene.character_action = 'neutral';
          }

          if (!scene.transition_next) {
            scene.transition_next =
              i === parsed.scenes.length - 1
                ? 'fade'
                : 'cut';
          }

          if (!scene.subtitle_text) {
            scene.subtitle_text = 'Continue...';
          }

          scene.emphasisWord =
            scene.subtitle_text
              .split(' ')
              .find(w => w.length > 5) ||
            scene.subtitle_text.split(' ')[0];
        }

        if (!parsed.characterSpec) {

          parsed.characterSpec = {
            name: 'AI Host',
            visualStyle: 'human_cartoon',
            primaryColor: '#3a6ea5',
            secondaryColor: '#ffccaa',
            eyeStyle: 'circle',
            headShape: 'round',
            accessories: [],
            personality: 'friendly',
            voiceTone: 'energetic'
          };
        }

        console.log(
          `[storyboard] AI plan generated with ${parsed.scenes.length} scenes`
        );

        return {
          scenes: parsed.scenes,
          global_pacing:
            parsed.global_pacing || 'medium',
          music_mood:
            parsed.music_mood || 'upbeat',
          characterSpec: parsed.characterSpec,
          pageDNA,
          fullText: `${post.title}. ${post.text}`
        };
      }

    } catch (e) {

      console.warn(
        '[storyboard] AI JSON parse error:',
        e.message
      );
    }
  }

  // -----------------------------
  // Fallback
  // -----------------------------
  console.warn(
    '[storyboard] AI failed, using fallback plan'
  );

  return generateFallbackPlan(
    post,
    pageDNA
  );
}

// -----------------------------
// Export
// -----------------------------
module.exports = {
  generateScenePlan
};
