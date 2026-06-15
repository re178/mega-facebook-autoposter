// services/pageIntelligence.js
// Full Page Intelligence with per‑page pi: blocks – now fully overridable, secure, and production‑ready

const moment = require('moment-timezone');
const { generateSmart } = require('./textProviders');

// ------------------------------
//  Configurable caches with TTL & size limits
// ------------------------------
class TTLCache {
  constructor(ttlSeconds = 300, maxSize = 100) {
    this.ttl = ttlSeconds * 1000;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expires: Date.now() + this.ttl });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  clear() {
    this.cache.clear();
  }
}

// Global caches – now with defaults (can be overridden via pi:)
const globalNewsCache = new TTLCache(30 * 60, 50);        // 30 min TTL, 50 entries
const pageDNA = new TTLCache(3600, 500);                  // 1 hour TTL
const pageMemory = new TTLCache(86400, 500);              // 24 hours TTL
const audienceState = new TTLCache(3600, 200);            // 1 hour
const pageContentTypeIndex = new Map();                   // simple counter, reset on restart

// ------------------------------
//  Safe JSON‑like parsing for pi: blocks (no eval)
// ------------------------------
function safeParsePiBlock(content) {
  // Remove trailing commas, comments, and ensure property names are quoted
  let cleaned = content
    .replace(/\/\/.*$/gm, '')                     // remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')             // remove block comments
    .replace(/,\s*}/g, '}')                       // trailing comma in objects
    .replace(/,\s*]/g, ']');                      // trailing comma in arrays

  // Convert unquoted property names to quoted
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  // Convert unquoted string values (e.g., foo: bar) to quoted
  cleaned = cleaned.replace(/:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?=[,\}])/g, ':"$1"');

  // Convert single quotes to double quotes
  cleaned = cleaned.replace(/'/g, '"');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('Failed to parse pi: block – falling back to empty overrides', err.message);
    return {};
  }
}

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

  const obj = safeParsePiBlock(content);
  if (!obj || typeof obj !== 'object') return {};

  // Return only allowed keys (sanitization)
  const allowedKeys = [
    // DNA direct overrides
    'authority', 'curiosity', 'seriousness', 'optimism', 'emotionality', 'humor',
    'voiceStyle', 'primaryTopics', 'secondaryTopics',
    // Content types
    'contentTypes',
    // News configuration
    'newsRefreshMinutes', 'disableNews', 'newsCategories', 'newsPerCategory', 'maxNewsArticles',
    'newsApiUrl', 'newsApiKey', 'newsApiHeaders',
    // Category mapping
    'categoryOverrides', 'defaultCategory',
    // Topic keywords
    'topicTrendWords', 'topicCuriosityWords', 'topicGenericPenaltyWords',
    // Audience state generation
    'audienceStatePromptTemplate', 'audienceStateMaxItems',
    // Event interpretation
    'eventInterpretationPrompt', 'defaultEventSignificance', 'defaultEventUrgency',
    'defaultEventLifespan', 'defaultEventAffectedAudience',
    // Identity scoring
    'identityScorePromptTemplate',
    // DNA auto‑inference
    'disableAutoDNA', 'interestDNAMapping',
    // Memory limits
    'maxMemoryTopics', 'maxMemoryPosts'
  ];

  const filtered = {};
  for (const key of allowedKeys) {
    if (obj[key] !== undefined) filtered[key] = obj[key];
  }
  return filtered;
}

function getParam(overrides, key, defaultValue) {
  return overrides && overrides[key] !== undefined ? overrides[key] : defaultValue;
}

// ------------------------------
//  Build Page DNA (auto‑inference + overrides)
// ------------------------------
async function buildPageDNA(pageProfile, recentPosts = [], overrides = {}) {
  const interests = pageProfile?.audienceInterest || [];
  const extraNotes = pageProfile?.extraNotes || '';
  const piOverrides = overrides;

  let authority = 50, curiosity = 50, seriousness = 50, optimism = 50, emotionality = 50, humor = 20;

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

// ------------------------------
//  News with full overrides (including custom API URL/Key)
// ------------------------------
async function refreshGlobalNewsCache(overrides = {}) {
  const refreshMinutes = getParam(overrides, 'newsRefreshMinutes', 30);
  const cacheKey = `news_${refreshMinutes}_${JSON.stringify(overrides.newsCategories)}`;
  const cached = globalNewsCache.get(cacheKey);
  if (cached && moment().diff(cached.lastUpdated, 'minutes') < refreshMinutes) {
    return cached.data;
  }

  const categories = getParam(overrides, 'newsCategories', ['education', 'cybersecurity', 'technology', 'finance', 'health', 'business', 'sports']);
  const perCategory = getParam(overrides, 'newsPerCategory', 10);
  
  // Allow custom news API configuration
  let apiUrl = getParam(overrides, 'newsApiUrl', 'https://gnews.io/api/v4/top-headlines');
  let apiKey = getParam(overrides, 'newsApiKey', process.env.GNEWS_API_KEY);
  let apiHeaders = getParam(overrides, 'newsApiHeaders', {});

  const newsData = {};
  for (const cat of categories) {
    try {
      let url = `${apiUrl}?category=${cat}&lang=en&token=${apiKey}`;
      if (!apiKey && apiUrl.includes('gnews.io')) {
        console.warn(`No GNEWS_API_KEY provided – skipping news category ${cat}`);
        continue;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { headers: apiHeaders, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      newsData[cat] = data.articles?.slice(0, perCategory) || [];
    } catch (err) {
      console.error(`Failed to fetch ${cat} news:`, err.message);
      newsData[cat] = [];
    }
  }
  const result = { data: newsData, lastUpdated: new Date() };
  globalNewsCache.set(cacheKey, result);
  return newsData;
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
  const newsData = await refreshGlobalNewsCache(overrides);
  const interests = pageProfile?.audienceInterest || [];
  let relevant = [];
  for (const interest of interests) {
    const cat = mapInterestToCategory(interest, overrides);
    if (newsData[cat]) relevant.push(...newsData[cat]);
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

// ------------------------------
//  Content type rotation (overridable)
// ------------------------------
const DEFAULT_CONTENT_TYPES = ['observation', 'analysis', 'reaction', 'warning', 'reflection', 'community', 'opportunity', 'myth_busting'];

function getNextContentType(pageId, pageProfile, overrides = {}) {
  const contentTypes = getParam(overrides, 'contentTypes', DEFAULT_CONTENT_TYPES);
  let idx = pageContentTypeIndex.get(pageId) || 0;
  const type = contentTypes[idx % contentTypes.length];
  pageContentTypeIndex.set(pageId, idx + 1);
  return type;
}

// ------------------------------
//  Interpret event (LLM + overrides)
// ------------------------------
async function interpretEvent(headline, pageProfile, overrides = {}) {
  const defaultPrompt = `Analyze this news headline for a ${pageProfile?.audienceInterest?.join(', ') || 'general'} page.
Headline: "${headline}"
Return JSON: { significance: "short phrase", urgency: "low/medium/high", lifespan: "X days", affectedAudience: "who" }`;
  const prompt = getParam(overrides, 'eventInterpretationPrompt', defaultPrompt);
  try {
    const response = await generateSmart(prompt);
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

// ------------------------------
//  Audience state (LLM + caching)
// ------------------------------
async function buildAudienceState(pageProfile, overrides = {}) {
  const interests = pageProfile?.audienceInterest || [];
  if (!interests.length) return { goals: [], fears: [], frustrations: [], aspirations: [] };
  const cacheKey = interests.join(',') + JSON.stringify(overrides.audienceStatePromptTemplate || '');
  const cached = audienceState.get(cacheKey);
  if (cached) return cached;

  const maxItems = getParam(overrides, 'audienceStateMaxItems', 3);
  const defaultPrompt = `For a Facebook audience interested in: ${interests.join(', ')}. 
List ${maxItems} goals, ${maxItems} fears, ${maxItems} frustrations, ${maxItems} aspirations. Return as JSON: {"goals":[],"fears":[],"frustrations":[],"aspirations":[]}`;
  const prompt = getParam(overrides, 'audienceStatePromptTemplate', defaultPrompt);
  let state = { goals: [], fears: [], frustrations: [], aspirations: [] };
  try {
    const response = await generateSmart(prompt);
    state = JSON.parse(response);
    for (const key of ['goals','fears','frustrations','aspirations']) {
      if (state[key] && state[key].length > maxItems) state[key] = state[key].slice(0, maxItems);
    }
  } catch(e) {}
  audienceState.set(cacheKey, state);
  return state;
}

// ------------------------------
//  Page memory (respects limits)
// ------------------------------
function updatePageMemory(pageId, topic, post, score, hook = null, eventId = null, overrides = {}) {
  let mem = pageMemory.get(pageId);
  if (!mem) {
    mem = {
      recurringThemes: new Map(),
      recurringHooks: new Map(),
      recurringEvents: new Map(),
      lastTopics: [],
      lastPosts: [],
      lastQualityScore: score
    };
    pageMemory.set(pageId, mem);
  }

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

// ------------------------------
//  Identity score (LLM + overrides)
// ------------------------------
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
  try {
    const response = await generateSmart(prompt);
    const score = parseInt(response) || 50;
    return Math.min(100, Math.max(0, score));
  } catch(e) {
    return 50;
  }
}

// ------------------------------
//  Main orchestrator
// ------------------------------
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

// ------------------------------
//  Exports
// ------------------------------
module.exports = {
  enrichContext,
  updatePageMemory,
  getPageMemory,
  identityScore,
  interpretEvent,
  refreshGlobalNewsCache,
  parsePageIntelligenceOverrides,
  buildPageDNA,
  // Expose cache controls for advanced use
  clearAllCaches: () => {
    globalNewsCache.clear();
    pageDNA.clear();
    pageMemory.clear();
    audienceState.clear();
    pageContentTypeIndex.clear();
  }
};
