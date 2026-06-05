// services/pageIntelligence.js
// Full Page Intelligence with per‑page pi: blocks – now fully overridable

const moment = require('moment-timezone');
const { generateSmart } = require('./textProviders');

// Global caches
const globalNewsCache = {
  education: [], cybersecurity: [], technology: [], finance: [], health: [], business: [], sports: [],
  lastUpdated: null
};
const pageDNA = new Map();
const pageMemory = new Map();
const audienceState = new Map();
const eventCache = new Map();
const pageContentTypeIndex = new Map();

// ---------- SAFE Parse pi: overrides (returns full set of overrides) ----------
function parsePageIntelligenceOverrides(extraNotes = '') {
  const startMatch = extraNotes.match(/pi:\s*\{/i);
  if (!startMatch) return {};

  const startIndex = startMatch.index + startMatch[0].length - 1;
  let braceCount = 0;
  let endIndex = -1;
  for (let i = startIndex; i < extraNotes.length; i++) {
    if (extraNotes[i] === '{') braceCount++;
    else if (extraNotes[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }
  if (endIndex === -1) {
    console.warn('pi: block has unmatched braces – ignoring');
    return {};
  }

  const content = extraNotes.substring(startIndex + 1, endIndex);
  if (!content.trim()) return {};

  const tryEval = (str) => {
    try {
      const evaluated = eval('(' + str + ')');
      if (evaluated && typeof evaluated === 'object') return evaluated;
    } catch (e) { return null; }
    return null;
  };

  let obj = tryEval('{' + content + '}');
  if (!obj) {
    let fixed = content.replace(/,\s*}/g, '}').replace(/,\s*,/g, ',');
    obj = tryEval('{' + fixed + '}');
  }
  if (!obj) {
    let fixed = content.replace(/[()]/g, '');
    obj = tryEval('{' + fixed + '}');
  }
  if (!obj) {
    try {
      let jsonStr = '{' + content + '}';
      jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      jsonStr = jsonStr.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)(?=[,}])/g, ':"$1"');
      jsonStr = jsonStr.replace(/:\s*'([^']*)'/g, ':"$1"');
      obj = JSON.parse(jsonStr);
    } catch (e) {}
  }

  if (!obj) {
    console.warn('Failed to parse pi overrides – content:', content);
    return {};
  }

  return {
    // DNA direct overrides
    authority: typeof obj.authority === 'number' ? obj.authority : undefined,
    curiosity: typeof obj.curiosity === 'number' ? obj.curiosity : undefined,
    seriousness: typeof obj.seriousness === 'number' ? obj.seriousness : undefined,
    optimism: typeof obj.optimism === 'number' ? obj.optimism : undefined,
    emotionality: typeof obj.emotionality === 'number' ? obj.emotionality : undefined,
    humor: typeof obj.humor === 'number' ? obj.humor : undefined,
    voiceStyle: typeof obj.voiceStyle === 'string' ? obj.voiceStyle : undefined,
    primaryTopics: Array.isArray(obj.primaryTopics) ? obj.primaryTopics : undefined,
    secondaryTopics: Array.isArray(obj.secondaryTopics) ? obj.secondaryTopics : undefined,
    
    // Content types
    contentTypes: Array.isArray(obj.contentTypes) ? obj.contentTypes : undefined,
    
    // News configuration
    newsRefreshMinutes: typeof obj.newsRefreshMinutes === 'number' ? obj.newsRefreshMinutes : undefined,
    disableNews: typeof obj.disableNews === 'boolean' ? obj.disableNews : undefined,
    newsCategories: Array.isArray(obj.newsCategories) ? obj.newsCategories : undefined,
    newsPerCategory: typeof obj.newsPerCategory === 'number' ? obj.newsPerCategory : undefined,
    maxNewsArticles: typeof obj.maxNewsArticles === 'number' ? obj.maxNewsArticles : undefined,
    
    // Category mapping
    categoryOverrides: typeof obj.categoryOverrides === 'object' ? obj.categoryOverrides : undefined,
    defaultCategory: typeof obj.defaultCategory === 'string' ? obj.defaultCategory : undefined,
    
    // Topic keywords (for scoring & matching)
    topicTrendWords: Array.isArray(obj.topicTrendWords) ? obj.topicTrendWords : undefined,
    topicCuriosityWords: Array.isArray(obj.topicCuriosityWords) ? obj.topicCuriosityWords : undefined,
    topicGenericPenaltyWords: Array.isArray(obj.topicGenericPenaltyWords) ? obj.topicGenericPenaltyWords : undefined,
    
    // Audience state generation
    audienceStatePromptTemplate: typeof obj.audienceStatePromptTemplate === 'string' ? obj.audienceStatePromptTemplate : undefined,
    audienceStateMaxItems: typeof obj.audienceStateMaxItems === 'number' ? obj.audienceStateMaxItems : undefined,
    
    // Event interpretation
    eventInterpretationPrompt: typeof obj.eventInterpretationPrompt === 'string' ? obj.eventInterpretationPrompt : undefined,
    defaultEventSignificance: typeof obj.defaultEventSignificance === 'string' ? obj.defaultEventSignificance : undefined,
    defaultEventUrgency: typeof obj.defaultEventUrgency === 'string' ? obj.defaultEventUrgency : undefined,
    defaultEventLifespan: typeof obj.defaultEventLifespan === 'string' ? obj.defaultEventLifespan : undefined,
    defaultEventAffectedAudience: typeof obj.defaultEventAffectedAudience === 'string' ? obj.defaultEventAffectedAudience : undefined,
    
    // Identity scoring
    identityScorePromptTemplate: typeof obj.identityScorePromptTemplate === 'string' ? obj.identityScorePromptTemplate : undefined,
    
    // DNA auto‑inference (disable or customize)
    disableAutoDNA: typeof obj.disableAutoDNA === 'boolean' ? obj.disableAutoDNA : false,
    interestDNAMapping: typeof obj.interestDNAMapping === 'object' ? obj.interestDNAMapping : undefined,
    
    // Memory limits
    maxMemoryTopics: typeof obj.maxMemoryTopics === 'number' ? obj.maxMemoryTopics : undefined,
    maxMemoryPosts: typeof obj.maxMemoryPosts === 'number' ? obj.maxMemoryPosts : undefined
  };
}

// ---------- Helper to merge overrides with defaults ----------
function getParam(overrides, key, defaultValue) {
  return overrides && overrides[key] !== undefined ? overrides[key] : defaultValue;
}

// ---------- Build DNA (now fully controlled by overrides) ----------
async function buildPageDNA(pageProfile, recentPosts = [], overrides = {}) {
  const interests = pageProfile?.audienceInterest || [];
  const extraNotes = pageProfile?.extraNotes || '';
  const piOverrides = overrides;

  let authority = 50, curiosity = 50, seriousness = 50, optimism = 50, emotionality = 50, humor = 20;

  // Auto‑inference only if not disabled and not overridden directly
  const disableAuto = getParam(piOverrides, 'disableAutoDNA', false);
  if (!disableAuto && piOverrides.authority === undefined) {
    const mapping = piOverrides.interestDNAMapping || {
      cybersecurity: { authority:80, seriousness:75, curiosity:70, humor:10 },
      education: { authority:70, seriousness:65, optimism:60, emotionality:55 },
      finance: { authority:85, seriousness:80, curiosity:65, humor:5 },
      entertainment: { humor:80, emotionality:70, seriousness:20 }
    };
    for (const interest of interests) {
      const lower = interest.toLowerCase();
      for (const [key, vals] of Object.entries(mapping)) {
        if (lower.includes(key)) {
          if (vals.authority !== undefined) authority = vals.authority;
          if (vals.seriousness !== undefined) seriousness = vals.seriousness;
          if (vals.curiosity !== undefined) curiosity = vals.curiosity;
          if (vals.humor !== undefined) humor = vals.humor;
          if (vals.optimism !== undefined) optimism = vals.optimism;
          if (vals.emotionality !== undefined) emotionality = vals.emotionality;
          break;
        }
      }
    }
  }

  if (extraNotes.includes('professional')) seriousness += 15;
  if (extraNotes.includes('casual')) humor += 20;

  // Direct overrides from pi:
  authority = getParam(piOverrides, 'authority', authority);
  curiosity = getParam(piOverrides, 'curiosity', curiosity);
  seriousness = getParam(piOverrides, 'seriousness', seriousness);
  optimism = getParam(piOverrides, 'optimism', optimism);
  emotionality = getParam(piOverrides, 'emotionality', emotionality);
  humor = getParam(piOverrides, 'humor', humor);

  let primaryTopics = interests.slice(0, 3);
  let secondaryTopics = interests.slice(3);
  if (piOverrides.primaryTopics) primaryTopics = piOverrides.primaryTopics;
  if (piOverrides.secondaryTopics) secondaryTopics = piOverrides.secondaryTopics;

  return {
    authority: Math.min(100, Math.max(0, authority)),
    curiosity: Math.min(100, Math.max(0, curiosity)),
    seriousness: Math.min(100, Math.max(0, seriousness)),
    optimism: Math.min(100, Math.max(0, optimism)),
    emotionality: Math.min(100, Math.max(0, emotionality)),
    humor: Math.min(100, Math.max(0, humor)),
    primaryTopics,
    secondaryTopics,
    voiceStyle: getParam(piOverrides, 'voiceStyle', pageProfile?.voice || 'neutral'),
    audienceState: {}
  };
}

// ---------- News with full overrides ----------
async function refreshGlobalNewsCache(overrides = {}) {
  const refreshMinutes = getParam(overrides, 'newsRefreshMinutes', 30);
  if (globalNewsCache.lastUpdated && moment().diff(globalNewsCache.lastUpdated, 'minutes') < refreshMinutes) {
    return globalNewsCache;
  }
  const categories = getParam(overrides, 'newsCategories', ['education', 'cybersecurity', 'technology', 'finance', 'health', 'business', 'sports']);
  const perCategory = getParam(overrides, 'newsPerCategory', 10);
  for (const cat of categories) {
    try {
      const url = `https://gnews.io/api/v4/top-headlines?category=${cat}&lang=en&token=${process.env.GNEWS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      globalNewsCache[cat] = data.articles?.slice(0, perCategory) || [];
    } catch (err) {
      console.error(`Failed to fetch ${cat} news:`, err.message);
    }
  }
  globalNewsCache.lastUpdated = new Date();
  return globalNewsCache;
}

function mapInterestToCategory(interest, overrides = {}) {
  const lower = interest.toLowerCase();
  const categoryOverrides = overrides.categoryOverrides || {};
  for (const [pattern, targetCat] of Object.entries(categoryOverrides)) {
    if (lower.includes(pattern.toLowerCase())) return targetCat;
  }
  const defaultCat = getParam(overrides, 'defaultCategory', 'general');
  if (/education|student|university|college|school|kuccps/i.test(lower)) return 'education';
  if (/cyber|security|hack|malware/i.test(lower)) return 'cybersecurity';
  if (/tech|software|ai|cloud|startup/i.test(lower)) return 'technology';
  if (/finance|money|invest|stock|crypto/i.test(lower)) return 'finance';
  if (/health|wellness|fitness|diet/i.test(lower)) return 'health';
  if (/business|marketing|entrepreneur/i.test(lower)) return 'business';
  if (/sports|football|soccer|basketball/i.test(lower)) return 'sports';
  return defaultCat;
}

async function getNewsForPage(pageProfile, overrides = {}) {
  if (getParam(overrides, 'disableNews', false)) return [];
  await refreshGlobalNewsCache(overrides);
  const interests = pageProfile?.audienceInterest || [];
  let relevant = [];
  const maxPerCategory = getParam(overrides, 'newsPerCategory', 10);
  for (const interest of interests) {
    const cat = mapInterestToCategory(interest, overrides);
    if (globalNewsCache[cat]) relevant.push(...globalNewsCache[cat]);
  }
  const seen = new Set();
  const unique = relevant.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
  const maxArticles = getParam(overrides, 'maxNewsArticles', 5);
  return unique.slice(0, maxArticles);
}

// ---------- Content type rotation (overridable) ----------
const DEFAULT_CONTENT_TYPES = ['observation', 'analysis', 'reaction', 'warning', 'reflection', 'community', 'opportunity', 'myth_busting'];

function getNextContentType(pageId, pageProfile, overrides = {}) {
  const contentTypes = getParam(overrides, 'contentTypes', DEFAULT_CONTENT_TYPES);
  let idx = pageContentTypeIndex.get(pageId) || 0;
  const type = contentTypes[idx % contentTypes.length];
  pageContentTypeIndex.set(pageId, idx + 1);
  return type;
}

// ---------- Interpret event (fully overridable) ----------
async function interpretEvent(headline, pageProfile, overrides = {}) {
  const defaultPrompt = `Analyze this news headline for a ${pageProfile?.audienceInterest?.join(', ') || 'general'} page.
Headline: "${headline}"
Return JSON: { significance: "short phrase", urgency: "low/medium/high", lifespan: "X days", affectedAudience: "who" }`;
  const prompt = getParam(overrides, 'eventInterpretationPrompt', defaultPrompt);
  const response = await generateSmart(prompt);
  try {
    return JSON.parse(response);
  } catch(e) {
    return {
      significance: getParam(overrides, 'defaultEventSignificance', 'update'),
      urgency: getParam(overrides, 'defaultEventUrgency', 'medium'),
      lifespan: getParam(overrides, 'defaultEventLifespan', '3 days'),
      affectedAudience: getParam(overrides, 'defaultEventAffectedAudience', 'general')
    };
  }
}

// ---------- Audience state (fully overridable) ----------
async function buildAudienceState(pageProfile, overrides = {}) {
  const interests = pageProfile?.audienceInterest || [];
  if (!interests.length) return { goals: [], fears: [], frustrations: [], aspirations: [] };
  const cacheKey = interests.join(',') + JSON.stringify(overrides.audienceStatePromptTemplate || '');
  if (audienceState.has(cacheKey)) return audienceState.get(cacheKey);
  const maxItems = getParam(overrides, 'audienceStateMaxItems', 3);
  const defaultPrompt = `For a Facebook audience interested in: ${interests.join(', ')}. 
List ${maxItems} goals, ${maxItems} fears, ${maxItems} frustrations, ${maxItems} aspirations. Return as JSON: {"goals":[],"fears":[],"frustrations":[],"aspirations":[]}`;
  const prompt = getParam(overrides, 'audienceStatePromptTemplate', defaultPrompt);
  const response = await generateSmart(prompt);
  let state = { goals: [], fears: [], frustrations: [], aspirations: [] };
  try {
    state = JSON.parse(response);
    // Trim to maxItems
    for (const key of ['goals','fears','frustrations','aspirations']) {
      if (state[key] && state[key].length > maxItems) state[key] = state[key].slice(0, maxItems);
    }
  } catch(e) {}
  audienceState.set(cacheKey, state);
  return state;
}

// ---------- Page memory (now respects overrides for limits) ----------
function updatePageMemory(pageId, topic, post, score, hook = null, eventId = null, overrides = {}) {
  if (!pageMemory.has(pageId)) {
    pageMemory.set(pageId, {
      recurringThemes: new Map(),
      recurringHooks: new Map(),
      recurringEvents: new Map(),
      lastTopics: [],
      lastPosts: [],
      lastQualityScore: score
    });
  }
  const mem = pageMemory.get(pageId);
  const words = topic.toLowerCase().split(/\s+/);
  for (const w of words) if (w.length > 3) mem.recurringThemes.set(w, (mem.recurringThemes.get(w) || 0) + 1);
  if (hook) mem.recurringHooks.set(hook, (mem.recurringHooks.get(hook) || 0) + 1);
  if (eventId) mem.recurringEvents.set(eventId, (mem.recurringEvents.get(eventId) || 0) + 1);
  const maxTopics = getParam(overrides, 'maxMemoryTopics', 10);
  const maxPosts = getParam(overrides, 'maxMemoryPosts', 10);
  mem.lastTopics.unshift(topic);
  mem.lastTopics = mem.lastTopics.slice(0, maxTopics);
  mem.lastPosts.unshift(post);
  mem.lastPosts = mem.lastPosts.slice(0, maxPosts);
  mem.lastQualityScore = score;
}

function getPageMemory(pageId) {
  return pageMemory.get(pageId) || null;
}

// ---------- Identity score (fully overridable prompt) ----------
async function identityScore(post, pageDNA, pageProfile, overrides = {}) {
  const defaultPrompt = `Does this Facebook post sound like it comes from a page with:
- Authority: ${pageDNA.authority}/100
- Seriousness: ${pageDNA.seriousness}/100
- Humor: ${pageDNA.humor}/100
- Voice: ${pageDNA.voiceStyle}
Topics: ${pageDNA.primaryTopics.join(', ')}

Post: "${post}"

Return only a number 0-100 indicating how well it matches the page identity.`;
  const prompt = getParam(overrides, 'identityScorePromptTemplate', defaultPrompt);
  const response = await generateSmart(prompt);
  const score = parseInt(response) || 50;
  return Math.min(100, Math.max(0, score));
}

// ---------- Main orchestrator (now passes overrides to all helpers) ----------
async function enrichContext(pageId, pageProfile, topic, recentPosts = []) {
  const extraNotes = pageProfile?.extraNotes || '';
  const overrides = parsePageIntelligenceOverrides(extraNotes);
  
  let dna = pageDNA.get(pageId);
  if (!dna) {
    dna = await buildPageDNA(pageProfile, recentPosts, overrides);
    pageDNA.set(pageId, dna);
  }
  const news = await getNewsForPage(pageProfile, overrides);
  const topHeadline = news[0]?.title || null;
  const audience = await buildAudienceState(pageProfile, overrides);
  const contentType = getNextContentType(pageId, pageProfile, overrides);
  return { dna, news, topHeadline, audience, contentType, timestamp: new Date() };
}

module.exports = {
  enrichContext,
  updatePageMemory,
  getPageMemory,
  identityScore,
  interpretEvent,
  refreshGlobalNewsCache,
  parsePageIntelligenceOverrides,
  buildPageDNA
};
