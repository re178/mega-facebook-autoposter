// services/topicEngine/engine.js
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { KEYS, SOURCES, SCORING, RSS_FEEDS } = require('./config');

// ==================== LOGGER ====================
function engineLog(action, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ENGINE:${action}] ${message}`);
  if (data) console.log('  └─', JSON.stringify(data, null, 2).slice(0, 500));
}

// ==================== UTILITY HELPERS ====================
function cleanText(text = '') {
  return text.replace(/\s+/g, ' ').replace(/[•#*_`]/g, '').trim();
}

function getWords(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
}

// Jaccard Similarity for deduplication (0 = totally different, 1 = identical)
function jaccardSimilarity(a, b) {
  const wordsA = new Set(getWords(a));
  const wordsB = new Set(getWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

// ================================================================
// ==================== 1. DISCOVERY LAYER ========================
// ================================================================
// Every fetcher returns: null | [ { title, description, source, url, publishedAt, category, confidence } ]

// ---------- NEWS ----------
async function fetchGNews(interest) {
  if (!KEYS.GNEWS) { engineLog('FETCH', 'GNews: Skipped (no API key)'); return null; }
  try {
    engineLog('FETCH', `GNews: Searching for "${interest}"`);
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(interest)}&lang=en&max=3&token=${KEYS.GNEWS}`;
    const res = await axios.get(url, { timeout: 5000 });
    if (!res.data?.articles?.length) { engineLog('FETCH', 'GNews: No articles found'); return null; }
    engineLog('FETCH', `GNews: Found ${res.data.articles.length} articles`);
    return res.data.articles.map(a => ({
      title: cleanText(a.title),
      description: cleanText(a.description || a.title),
      source: 'GNews',
      url: a.url,
      publishedAt: new Date(a.publishedAt),
      category: 'news',
      confidence: 0.9,
    }));
  } catch (e) {
    engineLog('FETCH', `GNews: Failed - ${e.message}`);
    return null;
  }
}

async function fetchNewsAPI(interest) {
  if (!KEYS.NEWSAPI) { engineLog('FETCH', 'NewsAPI: Skipped (no API key)'); return null; }
  try {
    engineLog('FETCH', `NewsAPI: Searching for "${interest}"`);
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(interest)}&sortBy=relevancy&pageSize=3&apiKey=${KEYS.NEWSAPI}`;
    const res = await axios.get(url, { timeout: 5000 });
    if (!res.data?.articles?.length) { engineLog('FETCH', 'NewsAPI: No articles found'); return null; }
    engineLog('FETCH', `NewsAPI: Found ${res.data.articles.length} articles`);
    return res.data.articles.map(a => ({
      title: cleanText(a.title),
      description: cleanText(a.description || a.title),
      source: 'NewsAPI',
      url: a.url,
      publishedAt: new Date(a.publishedAt || Date.now()),
      category: 'news',
      confidence: 0.85,
    }));
  } catch (e) {
    engineLog('FETCH', `NewsAPI: Failed - ${e.message}`);
    return null;
  }
}

async function fetchRSS(rssKey) {
  const url = RSS_FEEDS[rssKey];
  if (!url) return null;
  try {
    engineLog('FETCH', `RSS: Fetching ${rssKey}`);
    const res = await axios.get(url, { timeout: 5000 });
    const parsed = await parseStringPromise(res.data, { explicitArray: false });
    const items = parsed?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    const limited = list.slice(0, 3);
    engineLog('FETCH', `RSS ${rssKey}: Found ${limited.length} items`);
    return limited.map(item => ({
      title: cleanText(item.title),
      description: cleanText(item.description || item.title),
      source: rssKey,
      url: item.link,
      publishedAt: new Date(item.pubDate || Date.now()),
      category: 'news',
      confidence: 0.7,
    }));
  } catch (e) {
    engineLog('FETCH', `RSS ${rssKey}: Failed - ${e.message}`);
    return null;
  }
}

// ---------- SPACE ----------
async function fetchNASA(interest) {
  if (!KEYS.NASA) { engineLog('FETCH', 'NASA: Skipped (no API key)'); return null; }
  const spaceKeywords = ['space', 'mars', 'moon', 'astron', 'solar', 'galaxy', 'nasa'];
  const isSpace = spaceKeywords.some(k => interest.toLowerCase().includes(k));
  if (!isSpace) { engineLog('FETCH', 'NASA: Skipped (not space-related)'); return null; }
  try {
    engineLog('FETCH', `NASA: Fetching APOD for "${interest}"`);
    const apod = await axios.get(`https://api.nasa.gov/planetary/apod?api_key=${KEYS.NASA}`, { timeout: 5000 });
    if (apod.data?.title) {
      engineLog('FETCH', `NASA: Found APOD - "${apod.data.title}"`);
      return [{
        title: cleanText(apod.data.title),
        description: cleanText(apod.data.explanation || apod.data.title).slice(0, 300),
        source: 'NASA APOD',
        url: apod.data.hdurl || apod.data.url,
        publishedAt: new Date(apod.data.date || Date.now()),
        category: 'space',
        confidence: 1.0,
      }];
    }
  } catch (e) {
    engineLog('FETCH', `NASA: Failed - ${e.message}`);
  }
  return null;
}

// ---------- ENCYCLOPEDIA ----------
async function fetchWikipedia(interest) {
  try {
    engineLog('FETCH', `Wikipedia: Searching for "${interest}"`);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(interest)}`;
    const res = await axios.get(url, { timeout: 5000 });
    if (res.data?.title && res.data?.extract) {
      engineLog('FETCH', `Wikipedia: Found - "${res.data.title}"`);
      return [{
        title: cleanText(res.data.title),
        description: cleanText(res.data.extract).slice(0, 300),
        source: 'Wikipedia',
        url: res.data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(interest)}`,
        publishedAt: new Date(),
        category: 'encyclopedia',
        confidence: 0.95,
      }];
    }
  } catch (e) {
    engineLog('FETCH', `Wikipedia: Failed - ${e.message}`);
  }
  return null;
}

async function fetchWikimedia(interest) {
  try {
    engineLog('FETCH', `Wikimedia: Fetching random featured content for "${interest}"`);
    // Try to get a page related to the interest via the search API
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(interest)}&format=json&srlimit=1`;
    const searchRes = await axios.get(searchUrl, { timeout: 5000 });
    const pageId = searchRes.data?.query?.search?.[0]?.pageid;
    if (!pageId) { engineLog('FETCH', 'Wikimedia: No search results'); return null; }
    
    const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts&exintro=true&explaintext=true&format=json`;
    const contentRes = await axios.get(contentUrl, { timeout: 5000 });
    const extract = contentRes.data?.query?.pages?.[pageId]?.extract;
    if (extract) {
      engineLog('FETCH', `Wikimedia: Found content for page ${pageId}`);
      return [{
        title: cleanText(contentRes.data.query.pages[pageId].title),
        description: cleanText(extract).slice(0, 300),
        source: 'Wikimedia',
        url: `https://en.wikipedia.org/?curid=${pageId}`,
        publishedAt: new Date(),
        category: 'encyclopedia',
        confidence: 0.85,
      }];
    }
  } catch (e) {
    engineLog('FETCH', `Wikimedia: Failed - ${e.message}`);
  }
  return null;
}

// ---------- ACADEMIC / RESEARCH ----------
async function fetcharXiv(interest) {
  try {
    engineLog('FETCH', `arXiv: Searching for "${interest}"`);
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(interest)}&max_results=2`;
    const res = await axios.get(url, { timeout: 5000 });
    const parsed = await parseStringPromise(res.data, { explicitArray: false });
    const entries = parsed?.feed?.entry || [];
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0 || !list[0].title) { engineLog('FETCH', 'arXiv: No results'); return null; }
    engineLog('FETCH', `arXiv: Found ${list.length} papers`);
    return list.map(entry => ({
      title: cleanText(entry.title),
      description: cleanText(entry.summary || entry.title).slice(0, 300),
      source: 'arXiv',
      url: entry.id,
      publishedAt: new Date(entry.published || Date.now()),
      category: 'academic',
      confidence: 0.9,
    }));
  } catch (e) {
    engineLog('FETCH', `arXiv: Failed - ${e.message}`);
    return null;
  }
}

async function fetchCrossref(interest) {
  try {
    engineLog('FETCH', `Crossref: Searching for "${interest}"`);
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(interest)}&rows=2&sort=relevance`;
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': KEYS.CROSSREF_USER_AGENT }
    });
    const items = res.data?.message?.items || [];
    if (items.length === 0) { engineLog('FETCH', 'Crossref: No results'); return null; }
    engineLog('FETCH', `Crossref: Found ${items.length} works`);
    return items.map(item => ({
      title: cleanText(item.title?.[0] || 'Untitled'),
      description: cleanText(item.abstract || item.title?.[0] || '').slice(0, 300),
      source: 'Crossref',
      url: item.url || `https://doi.org/${item.DOI}`,
      publishedAt: new Date(item.created?.dateTime || Date.now()),
      category: 'academic',
      confidence: 0.85,
    }));
  } catch (e) {
    engineLog('FETCH', `Crossref: Failed - ${e.message}`);
    return null;
  }
}

async function fetchOpenAlex(interest) {
  try {
    engineLog('FETCH', `OpenAlex: Searching for "${interest}"`);
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(interest)}&per-page=2`;
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'email': KEYS.OPENALEX_EMAIL }
    });
    const items = res.data?.results || [];
    if (items.length === 0) { engineLog('FETCH', 'OpenAlex: No results'); return null; }
    engineLog('FETCH', `OpenAlex: Found ${items.length} works`);
    return items.map(item => ({
      title: cleanText(item.title || 'Untitled'),
      description: cleanText(item.abstract || item.title || '').slice(0, 300),
      source: 'OpenAlex',
      url: item.doi ? `https://doi.org/${item.doi}` : item.id,
      publishedAt: new Date(item.publication_date || Date.now()),
      category: 'academic',
      confidence: 0.85,
    }));
  } catch (e) {
    engineLog('FETCH', `OpenAlex: Failed - ${e.message}`);
    return null;
  }
}

// ---------- SOCIAL / COMMUNITY ----------
async function fetchReddit(interest) {
  if (!KEYS.REDDIT_CLIENT_ID || !KEYS.REDDIT_CLIENT_SECRET) {
    engineLog('FETCH', 'Reddit: Skipped (missing client credentials)');
    return null;
  }
  try {
    engineLog('FETCH', `Reddit: Fetching posts for "${interest}"`);
    // Get OAuth token
    const auth = Buffer.from(`${KEYS.REDDIT_CLIENT_ID}:${KEYS.REDDIT_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': KEYS.REDDIT_USER_AGENT,
        },
        timeout: 5000,
      }
    );
    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) { engineLog('FETCH', 'Reddit: Failed to get token'); return null; }

    const searchUrl = `https://oauth.reddit.com/r/all/search?q=${encodeURIComponent(interest)}&sort=relevance&limit=3`;
    const res = await axios.get(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': KEYS.REDDIT_USER_AGENT,
      },
      timeout: 5000,
    });
    const posts = res.data?.data?.children || [];
    if (posts.length === 0) { engineLog('FETCH', 'Reddit: No posts found'); return null; }
    engineLog('FETCH', `Reddit: Found ${posts.length} posts`);
    return posts.map(p => {
      const data = p.data;
      return {
        title: cleanText(data.title),
        description: cleanText(data.selftext || data.title).slice(0, 300),
        source: 'Reddit',
        url: `https://reddit.com${data.permalink}`,
        publishedAt: new Date(data.created_utc * 1000),
        category: 'social',
        confidence: 0.7,
      };
    });
  } catch (e) {
    engineLog('FETCH', `Reddit: Failed - ${e.message}`);
    return null;
  }
}

async function fetchYouTube(interest) {
  if (!KEYS.YOUTUBE) { engineLog('FETCH', 'YouTube: Skipped (no API key)'); return null; }
  try {
    engineLog('FETCH', `YouTube: Searching for "${interest}"`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(interest)}&type=video&maxResults=3&key=${KEYS.YOUTUBE}`;
    const res = await axios.get(url, { timeout: 5000 });
    const items = res.data?.items || [];
    if (items.length === 0) { engineLog('FETCH', 'YouTube: No videos found'); return null; }
    engineLog('FETCH', `YouTube: Found ${items.length} videos`);
    return items.map(item => ({
      title: cleanText(item.snippet.title),
      description: cleanText(item.snippet.description || item.snippet.title).slice(0, 300),
      source: 'YouTube',
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      publishedAt: new Date(item.snippet.publishedAt || Date.now()),
      category: 'social',
      confidence: 0.7,
    }));
  } catch (e) {
    engineLog('FETCH', `YouTube: Failed - ${e.message}`);
    return null;
  }
}

async function fetchGitHub(interest) {
  if (!KEYS.GITHUB) { engineLog('FETCH', 'GitHub: Skipped (no token)'); return null; }
  try {
    engineLog('FETCH', `GitHub: Searching for "${interest}"`);
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(interest)}&sort=stars&order=desc&per_page=3`;
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'Authorization': `token ${KEYS.GITHUB}` }
    });
    const items = res.data?.items || [];
    if (items.length === 0) { engineLog('FETCH', 'GitHub: No repos found'); return null; }
    engineLog('FETCH', `GitHub: Found ${items.length} repos`);
    return items.map(item => ({
      title: cleanText(`${item.name}: ${item.description || ''}`),
      description: cleanText(item.description || item.name).slice(0, 300),
      source: 'GitHub',
      url: item.html_url,
      publishedAt: new Date(item.created_at || Date.now()),
      category: 'social',
      confidence: 0.75,
    }));
  } catch (e) {
    engineLog('FETCH', `GitHub: Failed - ${e.message}`);
    return null;
  }
}

// ================================================================
// ==================== MASTER DISCOVERY ==========================
// ================================================================
async function runDiscovery(interest) {
  engineLog('DISCOVERY', `Starting full discovery for interest: "${interest}"`);
  const fetchers = [];

  // NEWS
  if (SOURCES.find(s => s.name === 'GNews')?.enabled) fetchers.push(fetchGNews(interest));
  if (SOURCES.find(s => s.name === 'NewsAPI')?.enabled) fetchers.push(fetchNewsAPI(interest));
  ['RSS_ScienceDaily', 'RSS_PhysOrg', 'RSS_SpaceCom', 'RSS_Nature'].forEach(key => {
    if (SOURCES.find(s => s.name === key)?.enabled) fetchers.push(fetchRSS(key));
  });

  // SPACE
  if (SOURCES.find(s => s.name === 'NASA_APOD')?.enabled) fetchers.push(fetchNASA(interest));

  // ENCYCLOPEDIA
  if (SOURCES.find(s => s.name === 'Wikipedia')?.enabled) fetchers.push(fetchWikipedia(interest));
  if (SOURCES.find(s => s.name === 'Wikimedia')?.enabled) fetchers.push(fetchWikimedia(interest));

  // ACADEMIC
  if (SOURCES.find(s => s.name === 'arXiv')?.enabled) fetchers.push(fetcharXiv(interest));
  if (SOURCES.find(s => s.name === 'Crossref')?.enabled) fetchers.push(fetchCrossref(interest));
  if (SOURCES.find(s => s.name === 'OpenAlex')?.enabled) fetchers.push(fetchOpenAlex(interest));

  // SOCIAL
  if (SOURCES.find(s => s.name === 'Reddit')?.enabled) fetchers.push(fetchReddit(interest));
  if (SOURCES.find(s => s.name === 'YouTube')?.enabled) fetchers.push(fetchYouTube(interest));
  if (SOURCES.find(s => s.name === 'GitHub')?.enabled) fetchers.push(fetchGitHub(interest));

  engineLog('DISCOVERY', `Launched ${fetchers.length} parallel scouts`);

  const results = await Promise.allSettled(fetchers);
  
  let allCandidates = [];
  let successCount = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const items = Array.isArray(result.value) ? result.value : [result.value];
      allCandidates = allCandidates.concat(items.filter(Boolean));
      successCount++;
    }
  }
  engineLog('DISCOVERY', `Scouts returned: ${successCount} successful, ${results.length - successCount} failed. Total raw candidates: ${allCandidates.length}`);
  return allCandidates;
}

// ================================================================
// ==================== 2. NORMALIZE & ENRICH =====================
// ================================================================
function normalizeAndEnrich(candidates, interest) {
  engineLog('ENRICH', `Normalizing ${candidates.length} candidates for interest: "${interest}"`);
  const lowerInterest = interest.toLowerCase();
  
  return candidates.map(c => {
    const title = cleanText(c.title);
    const desc = cleanText(c.description || title);
    
    // Relevance: count interest mentions
    const titleMatches = (title.toLowerCase().match(new RegExp(lowerInterest, 'g')) || []).length;
    const descMatches = (desc.toLowerCase().match(new RegExp(lowerInterest, 'g')) || []).length;
    const relevance = Math.min(1, (titleMatches * 0.25 + descMatches * 0.1));

    // Freshness: 1 = today, decays to 0 over 30 days
    const now = Date.now();
    const age = now - new Date(c.publishedAt).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);
    const freshness = Math.max(0, Math.min(1, 1 - (daysOld / 30)));

    // Authority: from config
    const sourceConfig = SOURCES.find(s => s.name === c.source);
    const authority = sourceConfig ? sourceConfig.authority / 10 : 0.5;

    // Evergreen boost for academic/encyclopedia
    const evergreen = (c.category === 'academic' || c.category === 'encyclopedia') ? 0.9 : 0.3;

    // Raw score (unweighted, just for logging)
    const rawScore = (relevance + freshness + authority + evergreen) / 4;

    return {
      ...c,
      title,
      description: desc,
      relevance,
      freshness,
      authority,
      evergreen,
      rawScore,
    };
  });
}

// ================================================================
// ==================== 3. DEDUPLICATION ==========================
// ================================================================
function deduplicateCandidates(candidates) {
  engineLog('DEDUPE', `Deduplicating ${candidates.length} candidates`);
  const unique = [];
  const seenTitles = new Set();

  for (const c of candidates) {
    let isDuplicate = false;
    // Exact check
    const key = c.title.toLowerCase();
    if (seenTitles.has(key)) isDuplicate = true;
    
    // Semantic check (Jaccard > 0.6)
    for (const existing of unique) {
      if (jaccardSimilarity(c.title, existing.title) > 0.6) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      unique.push(c);
      seenTitles.add(key);
    }
  }
  engineLog('DEDUPE', `After dedupe: ${unique.length} unique candidates`);
  return unique;
}

// ================================================================
// ==================== 4. SCORING & RANKING ======================
// ================================================================
function scoreAndRank(candidates, interest) {
  if (candidates.length === 0) {
    engineLog('RANK', 'No candidates to rank');
    return [];
  }

  engineLog('RANK', `Scoring ${candidates.length} candidates`);
  const lowerInterest = interest.toLowerCase();
  
  const scored = candidates.map(c => {
    // Boost relevance if the title starts with the exact interest
    const exactMatchBoost = c.title.toLowerCase().startsWith(lowerInterest) ? 0.15 : 0;
    const relevance = Math.min(1, c.relevance + exactMatchBoost);
    
    // Novelty: inverse of duplicate risk (handled by dedupe, but we add a baseline)
    const novelty = 0.8;

    // Overall weighted score
    const overall = (
      (relevance * SCORING.RELEVANCE_WEIGHT) +
      (c.freshness * SCORING.FRESHNESS_WEIGHT) +
      (c.authority * SCORING.AUTHORITY_WEIGHT) +
      (novelty * SCORING.NOVELTY_WEIGHT) +
      (c.evergreen * SCORING.EDUCATIONAL_WEIGHT)
    ) * 100;

    return {
      ...c,
      relevance,
      novelty,
      overallScore: Math.round(overall * 10) / 10,
    };
  });

  const sorted = scored.sort((a, b) => b.overallScore - a.overallScore);
  engineLog('RANK', `Top candidate: "${sorted[0].title}" (Score: ${sorted[0].overallScore})`);
  return sorted;
}

// ================================================================
// ==================== 5. MAIN ENGINE EXPORT =====================
// ================================================================
async function discoverAndRank(interest) {
  const raw = await runDiscovery(interest);
  if (raw.length === 0) {
    engineLog('ENGINE', '⚠️ Zero raw candidates returned');
    return [];
  }

  const enriched = normalizeAndEnrich(raw, interest);
  const deduped = deduplicateCandidates(enriched);
  const ranked = scoreAndRank(deduped, interest);
  
  engineLog('ENGINE', `✅ Pipeline complete. Ranked ${ranked.length} candidates.`);
  return ranked;
}

module.exports = { discoverAndRank, jaccardSimilarity };
