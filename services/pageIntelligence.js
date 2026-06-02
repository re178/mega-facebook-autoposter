// services/pageIntelligence.js
// Runtime Page Intelligence Engine – no database, pure memory
// Now supports per‑page overrides via extraNotes: pi:{ ... }

const moment = require('moment-timezone');
const { generateSmart } = require('./textProviders');

// ========== GLOBAL CACHES (shared across all pages) ==========
const globalNewsCache = {
  education: [], cybersecurity: [], technology: [], finance: [], health: [], business: [], sports: [],
  lastUpdated: null
};
const pageDNA = new Map();            // pageId -> DNA object
const pageMemory = new Map();         // pageId -> memory (themes, hooks, events)
const audienceState = new Map();      // pageId -> audience goals/fears/aspirations
const eventCache = new Map();         // eventId -> interpreted event

// ========== Helper: Parse per‑page overrides from extraNotes ==========
function parsePageIntelligenceOverrides(extraNotes = '') {
  // Look for a block like: pi:{ authority:80, seriousness:90, humor:5, contentTypes:["rant","story"], categoryOverrides:{"cyber":"technology"} }
  const match = extraNotes.match(/pi:\s*\{([^}]+)\}/i);
  if (!match) return {};
  try {
    const obj = eval('({' + match[1] + '})');
    return {
      // DNA overrides
      authority: obj.authority,
      curiosity: obj.curiosity,
      seriousness: obj.seriousness,
      optimism: obj.optimism,
      emotionality: obj.emotionality,
      humor: obj.humor,
      voiceStyle: obj.voiceStyle,
      primaryTopics: obj.primaryTopics,        // override the list
      secondaryTopics: obj.secondaryTopics,
      // Content strategy
      contentTypes: obj.contentTypes,           // custom rotation list
      // Category mapping overrides (interest -> news category)
      categoryOverrides: obj.categoryOverrides,
      // News refresh interval (minutes)
      newsRefreshMinutes: obj.newsRefreshMinutes,
      // Disable automatic news fetching
      disableNews: obj.disableNews,
      // Custom topic scoring weights, etc. (optional)
      topicTrendWords: obj.topicTrendWords,
      topicCuriosityWords: obj.topicCuriosityWords,
      topicGenericPenaltyWords: obj.topicGenericPenaltyWords
    };
  } catch (e) {
    console.warn('Failed to parse pi overrides from extraNotes:', e);
    return {};
  }
}

// ========== 1. Page DNA Builder (with overrides) ==========
async function buildPageDNA(pageProfile, recentPosts = []) {
  const interests = pageProfile?.audienceInterest || [];
  const extraNotes = pageProfile?.extraNotes || '';
  const overrides = parsePageIntelligenceOverrides(extraNotes);
  
  // Default DNA values (global hardcoded defaults)
  let authority = 50, curiosity = 50, seriousness = 50, optimism = 50, emotionality = 50, humor = 20;
  
  // Apply interest-based rules only if not overridden
  if (overrides.authority === undefined) {
    if (interests.some(i => /cyber|security|tech|it/i.test(i))) {
      authority = 80; seriousness = 75; curiosity = 70; humor = 10;
    } else if (interests.some(i => /education|student|university|school/i.test(i))) {
      authority = 70; seriousness = 65; optimism = 60; emotionality = 55;
    } else if (interests.some(i => /finance|money|invest/i.test(i))) {
      authority = 85; seriousness = 80; curiosity = 65; humor = 5;
    } else if (interests.some(i => /entertain|funny|meme/i.test(i))) {
      humor = 80; emotionality = 70; seriousness = 20;
    }
  }
  
  // Override from extraNotes (both old style and new pi block)
  if (extraNotes.includes('professional')) seriousness += 15;
  if (extraNotes.includes('casual')) humor += 20;
  
  // Apply explicit overrides from pi block (highest priority)
  if (overrides.authority !== undefined) authority = overrides.authority;
  if (overrides.curiosity !== undefined) curiosity = overrides.curiosity;
  if (overrides.seriousness !== undefined) seriousness = overrides.seriousness;
  if (overrides.optimism !== undefined) optimism = overrides.optimism;
  if (overrides.emotionality !== undefined) emotionality = overrides.emotionality;
  if (overrides.humor !== undefined) humor = overrides.humor;
  
  // Primary / secondary topics: use overrides if provided, else interests
  let primaryTopics = interests.slice(0, 3);
  let secondaryTopics = interests.slice(3);
  if (overrides.primaryTopics) primaryTopics = overrides.primaryTopics;
  if (overrides.secondaryTopics) secondaryTopics = overrides.secondaryTopics;
  
  return {
    authority: Math.min(100, authority),
    curiosity: Math.min(100, curiosity),
    seriousness: Math.min(100, seriousness),
    optimism: Math.min(100, optimism),
    emotionality: Math.min(100, emotionality),
    humor: Math.min(100, humor),
    primaryTopics,
    secondaryTopics,
    voiceStyle: overrides.voiceStyle || pageProfile?.voice || 'neutral',
    audienceState: {}
  };
}

// ========== 2. Current Awareness Engine (with per‑page overrides) ==========
async function refreshGlobalNewsCache(overrides = {}) {
  const refreshMinutes = overrides.newsRefreshMinutes !== undefined ? overrides.newsRefreshMinutes : 30;
  // Only call APIs every refreshMinutes minutes
  if (globalNewsCache.lastUpdated && moment().diff(globalNewsCache.lastUpdated, 'minutes') < refreshMinutes) {
    return globalNewsCache;
  }
  
  // Fetch from multiple sources (simplified example)
  const categories = ['education', 'cybersecurity', 'technology', 'finance', 'health', 'business', 'sports'];
  for (const cat of categories) {
    try {
      const url = `https://gnews.io/api/v4/top-headlines?category=${cat}&lang=en&token=${process.env.GNEWS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      globalNewsCache[cat] = data.articles?.slice(0, 10) || [];
    } catch (err) {
      console.error(`Failed to fetch ${cat} news:`, err.message);
    }
  }
  globalNewsCache.lastUpdated = new Date();
  return globalNewsCache;
}

// Get news for a page's interests (with per‑page category mapping overrides)
async function getNewsForPage(pageProfile) {
  const extraNotes = pageProfile?.extraNotes || '';
  const overrides = parsePageIntelligenceOverrides(extraNotes);
  if (overrides.disableNews) return [];
  
  await refreshGlobalNewsCache(overrides);
  const interests = pageProfile?.audienceInterest || [];
  let relevant = [];
  for (const interest of interests) {
    const cat = mapInterestToCategory(interest, overrides.categoryOverrides);
    if (globalNewsCache[cat]) relevant.push(...globalNewsCache[cat]);
  }
  // Deduplicate by title
  const seen = new Set();
  return relevant.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  }).slice(0, 5);
}

function mapInterestToCategory(interest, categoryOverrides = {}) {
  const lower = interest.toLowerCase();
  // Check overrides first
  for (const [pattern, targetCat] of Object.entries(categoryOverrides)) {
    if (lower.includes(pattern.toLowerCase())) return targetCat;
  }
  // Default mapping
  if (/education|student|university|college|school|kuccps/i.test(lower)) return 'education';
  if (/cyber|security|hack|malware/i.test(lower)) return 'cybersecurity';
  if (/tech|software|ai|cloud|startup/i.test(lower)) return 'technology';
  if (/finance|money|invest|stock|crypto/i.test(lower)) return 'finance';
  if (/health|wellness|fitness|diet/i.test(lower)) return 'health';
  if (/business|marketing|entrepreneur/i.test(lower)) return 'business';
  if (/sports|football|soccer|basketball/i.test(lower)) return 'sports';
  return 'general';
}

// ========== 3. Event Interpreter (no changes needed, but can be extended) ==========
async function interpretEvent(headline, pageProfile) {
  const prompt = `Analyze this news headline for a ${pageProfile?.audienceInterest?.join(', ') || 'general'} page.
Headline: "${headline}"
Return JSON: { significance: "short phrase", urgency: "low/medium/high", lifespan: "X days", affectedAudience: "who" }`;
  const response = await generateSmart(prompt);
  try {
    return JSON.parse(response);
  } catch(e) {
    return { significance: "update", urgency: "medium", lifespan: "3 days", affectedAudience: "general" };
  }
}

// ========== 4. Audience State Engine ==========
async function buildAudienceState(pageProfile) {
  const interests = pageProfile?.audienceInterest || [];
  if (!interests.length) return { goals: [], fears: [], frustrations: [], aspirations: [] };
  
  const cacheKey = interests.join(',');
  if (audienceState.has(cacheKey)) return audienceState.get(cacheKey);
  
  const prompt = `For a Facebook audience interested in: ${interests.join(', ')}. 
List 3 goals, 3 fears, 3 frustrations, 3 aspirations. Return as JSON: {"goals":[],"fears":[],"frustrations":[],"aspirations":[]}`;
  const response = await generateSmart(prompt);
  let state = { goals: [], fears: [], frustrations: [], aspirations: [] };
  try {
    state = JSON.parse(response);
  } catch(e) {}
  audienceState.set(cacheKey, state);
  return state;
}

// ========== 5. Enhanced Page Memory Engine ==========
function updatePageMemory(pageId, topic, post, score, hook = null, eventId = null) {
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
  // Update theme counts
  const words = topic.toLowerCase().split(/\s+/);
  for (const w of words) {
    if (w.length > 3) mem.recurringThemes.set(w, (mem.recurringThemes.get(w) || 0) + 1);
  }
  if (hook) mem.recurringHooks.set(hook, (mem.recurringHooks.get(hook) || 0) + 1);
  if (eventId) mem.recurringEvents.set(eventId, (mem.recurringEvents.get(eventId) || 0) + 1);
  mem.lastTopics.unshift(topic);
  mem.lastTopics = mem.lastTopics.slice(0, 10);
  mem.lastPosts.unshift(post);
  mem.lastPosts = mem.lastPosts.slice(0, 10);
  mem.lastQualityScore = score;
}

function getPageMemory(pageId) {
  return pageMemory.get(pageId) || null;
}

// ========== 6. Content Strategy Engine (with per‑page overrides) ==========
const defaultContentTypes = ['observation', 'analysis', 'reaction', 'warning', 'reflection', 'community', 'opportunity', 'myth_busting'];
// Store per‑page index separately
const pageContentTypeIndex = new Map();

function getNextContentType(pageId, pageProfile) {
  const extraNotes = pageProfile?.extraNotes || '';
  const overrides = parsePageIntelligenceOverrides(extraNotes);
  const contentTypes = overrides.contentTypes || defaultContentTypes;
  
  let idx = pageContentTypeIndex.get(pageId) || 0;
  const type = contentTypes[idx % contentTypes.length];
  pageContentTypeIndex.set(pageId, idx + 1);
  return type;
}

// ========== 7. Identity & Authenticity Validation ==========
async function identityScore(post, pageDNA, pageProfile) {
  // If we have per‑page voice overrides, they are already in pageDNA
  const prompt = `Does this Facebook post sound like it comes from a page with:
- Authority: ${pageDNA.authority}/100
- Seriousness: ${pageDNA.seriousness}/100
- Humor: ${pageDNA.humor}/100
- Voice: ${pageDNA.voiceStyle}
Topics: ${pageDNA.primaryTopics.join(', ')}

Post: "${post}"

Return only a number 0-100 indicating how well it matches the page identity.`;
  const response = await generateSmart(prompt);
  const score = parseInt(response) || 50;
  return Math.min(100, Math.max(0, score));
}

// ========== 8. Main Orchestrator ==========
async function enrichContext(pageId, pageProfile, topic, recentPosts = []) {
  // Build or retrieve DNA (already respects overrides via buildPageDNA)
  let dna = pageDNA.get(pageId);
  if (!dna) {
    dna = await buildPageDNA(pageProfile, recentPosts);
    pageDNA.set(pageId, dna);
  }
  
  // Get news for this page (respects per‑page overrides)
  const news = await getNewsForPage(pageProfile);
  const topHeadline = news[0]?.title || null;
  
  // Get audience state
  const audience = await buildAudienceState(pageProfile);
  
  // Choose content type (now using overrides if present)
  const contentType = getNextContentType(pageId, pageProfile);
  
  return {
    dna,
    news,
    topHeadline,
    audience,
    contentType,
    timestamp: new Date()
  };
}

// ========== Exports (must include everything QA expects) ==========
module.exports = {
  enrichContext,
  updatePageMemory,
  getPageMemory,
  identityScore,
  interpretEvent,
  refreshGlobalNewsCache,
  // Also export helpers for testing/debugging
  parsePageIntelligenceOverrides,
  buildPageDNA,
  getNewsForPage
};
