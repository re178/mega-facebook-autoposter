const { PageProfile, monitor, DEFAULT_ANGLES } = require('./models');
const { renderPost } = require('../renderPost');
const { generateCinematicReel } = require('../media/cinematicEngine');
const qualityAssurance = require('../qualityAssurance');
const pageIntelligence = require('../pageIntelligence');

// ---------- AI Providers ----------
const {
  CloudflareText,
  GroqText,
  GeminiText,
  OpenAIText,
  generateSmart,
} = require('../textProviders');

const {
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage,
} = require('../imageProviders');

// ---------- Provider Arrays ----------
const TextProviders = [GeminiText, CloudflareText, GroqText, OpenAIText];
const ImageProviders = [CloudflareImage, StabilityImage, LeonardoImage, DALLEImage, SmartPexelsImage];

// ---------- Provider State (throttling/failures) ----------
const providerState = {};
function initProviderState() {
  [...TextProviders, ...ImageProviders].forEach((p) => {
    providerState[p.name] = {
      failures: 0,
      cooldownUntil: null,
      callsToday: 0,
      quota: p.dailyLimit || 99999,
    };
  });
}
initProviderState();

// ---------- Helpers ----------
function cleanText(text = '') {
  return text.replace(/[•#*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function extractCriticalRules(extraNotes) {
  if (!extraNotes || typeof extraNotes !== 'string') return '';
  let cleaned = extraNotes.replace(/pi:\s*\{[\s\S]*?\}/gi, '');
  cleaned = cleaned.replace(/qa:\s*\{[\s\S]*?\}/gi, '');
  const match = cleaned.match(/CRITICAL RULES:\s*\n([\s\S]*?)(?=\n\s*\n|\n\[|$)/i);
  if (!match) return '';
  let rules = match[1].trim();
  rules = rules.replace(/\[.*?\]/g, '').trim();
  return rules;
}

// ---------- Prompt Builder ----------
async function buildPrompt({
  topic,
  angle,
  pageId,
  textSeed,
  qualityFix = null,
  dna = null,
  topHeadline = null,
  contentType = null,
}) {
  const profile = await PageProfile.findOne({ pageId });
  let extraNotes = profile?.extraNotes || '';

  let piOverrides = {},
    qaOverrides = {};
  try {
    piOverrides = pageIntelligence.parsePageIntelligenceOverrides(extraNotes);
    qaOverrides = qualityAssurance.parsePageOverrides(extraNotes);
  } catch (e) {
    console.warn('Override parsing failed, using defaults', e.message);
  }

  let criticalRules = extractCriticalRules(extraNotes);
  if (!criticalRules) {
    criticalRules = `- Maximum 2 sentences total.
- Never start with a question ("Have you ever...", "Are you ready...").
- Never use "we'll", "let's", "I'll explain", "in this post".
- No advice, no teaching, no "how to" language.
- First sentence must be a bold fact, alert, or strong opinion.
- Keep language punchy and conversational.`;
  }

  const avoidPhrases = Array.isArray(qaOverrides.avoidPhrases)
    ? qaOverrides.avoidPhrases
    : [
        'Did you know',
        'Have you ever',
        'Are you ready',
        "I've been thinking",
        'Sometimes I',
        'Here is the rewritten post',
        'I was thinking',
        'Today I felt',
        "In today's world",
        "Let's explore",
        "It's important to",
      ];

  const primaryTopics = piOverrides.primaryTopics || profile?.audienceInterest || [];
  const voiceStyle = piOverrides.voiceStyle || profile?.voice || 'conversational';
  const authority = piOverrides.authority || 50;
  const humor = piOverrides.humor || 20;
  const emotionality = piOverrides.emotionality || 50;

  const seedText = textSeed ? ` Reference previous text: "${textSeed}"` : '';
  const qualityFixText = qualityFix
    ? `\n\nIMPORTANT FIXES NEEDED: ${qualityFix}\nRewrite the post fixing these issues while keeping the same core message.`
    : '';

  let piGuidance = '';
  if (dna) {
    piGuidance = `\nPage Personality:
- Authority: ${dna.authority}/100
- Humor: ${dna.humor}/100
- Seriousness: ${dna.seriousness}/100
- Optimism: ${dna.optimism}/100
- Emotionality: ${dna.emotionality}/100
- Voice style: ${dna.voiceStyle}
- Primary topics: ${dna.primaryTopics.join(', ')}
`;
  } else {
    piGuidance = `\nPage Personality:
- Authority: ${authority}/100
- Humor: ${humor}/100
- Emotionality: ${emotionality}/100
- Voice style: ${voiceStyle}
- Primary topics: ${primaryTopics.join(', ')}
`;
  }
  if (topHeadline) {
    piGuidance += `\nRelevant recent news: "${topHeadline}". You may optionally react to it if it fits the angle.\n`;
  }
  if (contentType) {
    piGuidance += `\nSuggested content type: ${contentType} (e.g., warning, analysis, myth‑busting). Write accordingly.\n`;
  }

  return `
YOU ARE A SOCIAL MEDIA POST WRITER. FOLLOW THESE RULES EXACTLY – THEY OVERRIDE ALL OTHER INSTRUCTIONS.

CRITICAL RULES:
${criticalRules}

ADDITIONAL HARD CONSTRAINTS (MUST FOLLOW):
- Write ONLY about the topic: "${topic}". Do NOT mention unrelated topics (e.g., general stress, weather, politics).
- NEVER start the post with any of these phrases: ${avoidPhrases.join(', ')}.
- Maximum sentences: 2 (unless CRITICAL RULES specify otherwise).
- Do NOT include meta‑commentary like "Here is a post", "I've rewritten", "Here is the rewritten post".
- Stay within the page's primary topics: ${primaryTopics.join(', ')}.

TOPIC: "${topic}"
ANGLE: ${angle}
Tone: ${profile?.tone || 'friendly'}
Writing Style: ${profile?.writingStyle || 'conversational'}
Voice: ${voiceStyle}
Audience interests: ${primaryTopics.join(', ')}

${piGuidance}
${seedText}
${qualityFixText}

Return ONLY the post text, with no extra quotes, explanations, or markdown.
`;
}

// ---------- Text Generation ----------
async function generateText(
  topic,
  angle,
  pageId,
  textSeed = null,
  qualityFix = null,
  dna = null,
  topHeadline = null,
  contentType = null
) {
  try {
    const prompt = await buildPrompt({
      topic,
      angle,
      pageId,
      textSeed,
      qualityFix,
      dna,
      topHeadline,
      contentType,
    });
    const text = await generateSmart(prompt);
    if (!text) {
      await monitor(null, pageId, null, 'TEXT_FAILED', 'Empty response');
      return null;
    }
    return cleanText(text);
  } catch (err) {
    await monitor(null, pageId, null, 'TEXT_FAILED', err.message);
    return null;
  }
}

// ---------- QA‑Enhanced Post Generation ----------
async function generateAndValidatePost(
  topic,
  angle,
  pageId,
  pageProfile,
  recentPosts = [],
  dna = null,
  topHeadline = null,
  contentType = null,
  attempt = 0
) {
  const maxAttempts = 3;
  const rawText = await generateText(
    topic,
    angle,
    pageId,
    null,
    null,
    dna,
    topHeadline,
    contentType
  );
  if (!rawText) return null;

  const qaResult = await qualityAssurance.processContent({
    topic: topic,
    post: rawText,
    pageProfile: pageProfile,
    pageId: pageId,
    recentPosts: recentPosts,
    generateFn: async (prompt) => await generateSmart(prompt),
    maxRegenerations: 2,
    dna: dna,
  });

  if (qaResult.pass) {
    await monitor(null, pageId, null, 'QA_PASSED', `Score: ${qaResult.score}`);
    return {
      text: qaResult.finalPost,
      score: qaResult.score,
      breakdown: qaResult.breakdown,
    };
  }

  if (attempt < maxAttempts) {
    await monitor(
      null,
      pageId,
      null,
      'QA_FAILED_RETRY',
      `Attempt ${attempt + 1}: ${qaResult.reason}`
    );
    const modifiedAngle = `${angle} (different perspective)`;
    return await generateAndValidatePost(
      topic,
      modifiedAngle,
      pageId,
      pageProfile,
      recentPosts,
      dna,
      topHeadline,
      contentType,
      attempt + 1
    );
  }

  await monitor(null, pageId, null, 'QA_FAILED_FINAL', qaResult.reason);
  return null;
}

// ---------- Image Generation ----------
async function generateImage(topic, pageId, textSeed = null) {
  const seedText = textSeed ? ` with context: "${textSeed}"` : '';
  for (const provider of ImageProviders) {
    try {
      const url = await provider.generate(`Realistic photo about ${topic}${seedText}`);
      if (url) return url;
    } catch {}
  }
  await monitor(null, pageId, null, 'IMAGE_FAILED', 'All image providers failed');
  return null;
}

// ---------- Branded Image / Video ----------
async function createBrandedImage(topicId, pageId, rawMediaUrl, postText) {
  const { AiTopic, Page, PageProfile } = require('./models'); // local require to avoid circular
  try {
    const [topic, pageProfile, page] = await Promise.all([
      AiTopic.findById(topicId).lean(),
      PageProfile.findOne({ pageId }).lean(),
      Page.findOne({ pageId }).select('name').lean(),
    ]);
    if (!topic) return rawMediaUrl;

    if (topic.includeVideo === true) {
      const cinematicProfile = {
        pageName: page?.name || 'Page',
        brand: pageProfile?.extraNotes?.match(/brand=(\w+)/)?.[1] || 'modern',
        mood: pageProfile?.extraNotes?.match(/mood=(\w+)/)?.[1] || 'neutral',
        audienceInterest: pageProfile?.audienceInterest || [],
      };
      const videoUrl = await generateCinematicReel({
        title: topic.topicName,
        text: postText,
        pageProfile: cinematicProfile,
        pageName: page?.name || 'Page',
        format: 'short',
      });
      return videoUrl || null;
    }

    if (topic.includeMedia === true) {
      const finalImage = await renderPost({
        title: topic.topicName,
        text: postText,
        rawImage: rawMediaUrl,
        pageProfile: pageProfile || {},
        pageName: page?.name || 'Page',
        logoUrl: null,
      });
      return finalImage || rawMediaUrl;
    }

    return null;
  } catch (err) {
    console.error('createBrandedImage failed:', err.message);
    await monitor(topicId, pageId, null, 'BRANDED_MEDIA_FAILED', err.message);
    return null;
  }
}

// ---------- Exports ----------
module.exports = {
  TextProviders,
  ImageProviders,
  providerState,
  initProviderState,
  cleanText,
  buildPrompt,
  generateText,
  generateAndValidatePost,
  generateImage,
  createBrandedImage,
  // individual providers (for re‑export)
  CloudflareText,
  GroqText,
  GeminiText,
  OpenAIText,
  CloudflareImage,
  StabilityImage,
  LeonardoImage,
  DALLEImage,
  SmartPexelsImage,
};
