// services/topicEngine/config.js
require('dotenv').config();

// ==================== API KEYS ====================
const KEYS = {
  // News
  GNEWS: process.env.GNEWS_API_KEY,
  NEWSAPI: process.env.NEWS_API_KEY,
  
  // Space
  NASA: process.env.NASA_API_KEY,
  
  // Social / Community
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
  REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT || 'TopicEngine/1.0',
  YOUTUBE: process.env.YOUTUBE_API_KEY,
  GITHUB: process.env.GITHUB_TOKEN,
  
  // Research (free, just good manners)
  CROSSREF_USER_AGENT: process.env.CROSSREF_USER_AGENT || 'TopicEngine/1.0 (contact@example.com)',
  OPENALEX_EMAIL: process.env.OPENALEX_EMAIL || 'contact@example.com',
};

// ==================== SOURCE REGISTRY ====================
// Each source: { name, category, authority (1-10), enabled }
// The `enabled` flag checks if the API key exists (or is always true for free ones)
const SOURCES = [
  // --- NEWS (Current Events) ---
  { name: 'GNews', category: 'news', authority: 8, enabled: !!KEYS.GNEWS },
  { name: 'NewsAPI', category: 'news', authority: 7, enabled: !!KEYS.NEWSAPI },
  { name: 'RSS_ScienceDaily', category: 'news', authority: 8, enabled: true },
  { name: 'RSS_PhysOrg', category: 'news', authority: 7, enabled: true },
  { name: 'RSS_SpaceCom', category: 'news', authority: 7, enabled: true },
  { name: 'RSS_Nature', category: 'news', authority: 9, enabled: true },
  
  // --- SPACE (Specialized) ---
  { name: 'NASA_APOD', category: 'space', authority: 10, enabled: !!KEYS.NASA },
  
  // --- ACADEMIC / RESEARCH ---
  { name: 'arXiv', category: 'academic', authority: 9, enabled: true },
  { name: 'Crossref', category: 'academic', authority: 8, enabled: !!KEYS.CROSSREF_USER_AGENT },
  { name: 'OpenAlex', category: 'academic', authority: 8, enabled: !!KEYS.OPENALEX_EMAIL },
  
  // --- ENCYCLOPEDIA (Evergreen) ---
  { name: 'Wikipedia', category: 'encyclopedia', authority: 9, enabled: true },
  { name: 'Wikimedia', category: 'encyclopedia', authority: 8, enabled: true },
  
  // --- SOCIAL / TRENDING ---
  { name: 'Reddit', category: 'social', authority: 6, enabled: !!(KEYS.REDDIT_CLIENT_ID && KEYS.REDDIT_CLIENT_SECRET) },
  { name: 'YouTube', category: 'social', authority: 6, enabled: !!KEYS.YOUTUBE },
  { name: 'GitHub', category: 'social', authority: 7, enabled: !!KEYS.GITHUB },
];

// ==================== SCORING WEIGHTS ====================
const SCORING = {
  RELEVANCE_WEIGHT: 0.35,      // How well does it match the interest?
  FRESHNESS_WEIGHT: 0.25,      // How recent is it?
  AUTHORITY_WEIGHT: 0.25,      // Source reliability
  NOVELTY_WEIGHT: 0.10,        // Not a duplicate in the batch
  EDUCATIONAL_WEIGHT: 0.05,    // Academic/encyclopedia bonus
};

// ==================== RSS FEED MAP ====================
const RSS_FEEDS = {
  'RSS_ScienceDaily': 'https://www.sciencedaily.com/rss/all.xml',
  'RSS_PhysOrg': 'https://phys.org/rss-feed/',
  'RSS_SpaceCom': 'https://www.space.com/feeds/all',
  'RSS_Nature': 'https://www.nature.com/nature.rss',
};

module.exports = { KEYS, SOURCES, SCORING, RSS_FEEDS };
