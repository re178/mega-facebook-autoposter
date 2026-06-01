// services/qualityAssurance.js
// Production-ready with page memory, realism penalty, structure detection, adaptive regeneration

// ---------- 1. In-Memory Page Memory (no DB, survives restarts, fine for Render) ----------
const pageMemory = new Map(); // { pageId: { lastTopics, lastPosts, toneDrift, lastQualityScore } }

function updatePageMemory(pageId, topic, post, qualityScore) {
  if (!pageMemory.has(pageId)) {
    pageMemory.set(pageId, {
      lastTopics: [],
      lastPosts: [],
      toneDrift: 0,
      lastQualityScore: 85 // default
    });
  }
  const mem = pageMemory.get(pageId);
  mem.lastTopics.unshift(topic);
  mem.lastTopics = mem.lastTopics.slice(0, 10);
  mem.lastPosts.unshift(post);
  mem.lastPosts = mem.lastPosts.slice(0, 10);
  mem.lastQualityScore = qualityScore;
  // Simple tone drift: if quality drops consistently, drift increases
  if (qualityScore < mem.lastQualityScore - 10) {
    mem.toneDrift += 5;
  } else if (qualityScore > mem.lastQualityScore + 10) {
    mem.toneDrift = Math.max(0, mem.toneDrift - 2);
  }
}

function getPageMemory(pageId) {
  return pageMemory.get(pageId) || null;
}

// ---------- 2. Keyword Families (unchanged, but now used in scoring) ----------
const INTEREST_MAP = {
  cybersecurity: ['hacker', 'malware', 'ransomware', 'breach', 'security', 'phishing', 'cyberattack', 'vulnerability', 'patch', 'exploit'],
  football: ['premier league', 'arsenal', 'chelsea', 'man utd', 'goal', 'match', 'fifa', 'world cup', 'champions league', 'football'],
  finance: ['money', 'stocks', 'investing', 'inflation', 'bank', 'savings', 'crypto', 'bitcoin', 'trading', 'budget'],
  technology: ['ai', 'artificial intelligence', 'software', 'update', 'windows', 'mac', 'ios', 'android', 'cloud', 'startup'],
  health: ['wellness', 'fitness', 'diet', 'nutrition', 'exercise', 'mental health', 'covid', 'vaccine', 'sleep'],
  marketing: ['social media', 'facebook ads', 'instagram', 'seo', 'content', 'email', 'conversion', 'traffic', 'audience']
};

// Page Fit Score (0-100, not boolean)
function pageFitScore(topic, pageProfile) {
  if (!pageProfile?.audienceInterest?.length) return 70; // neutral if no interests
  const topicLower = topic.toLowerCase();
  let maxScore = 0;
  for (const interest of pageProfile.audienceInterest) {
    const interestKey = interest.toLowerCase();
    const keywords = INTEREST_MAP[interestKey] || [interestKey];
    for (const kw of keywords) {
      if (topicLower.includes(kw)) {
        maxScore = Math.max(maxScore, 30);
        // Bonus for exact interest match
        if (topicLower.includes(interestKey)) maxScore = Math.min(100, maxScore + 40);
      }
    }
  }
  // If no keyword matches but topic is still relevant? We'll use a simple fallback:
  // Check if any interest word appears as a whole word
  const anyInterestMatch = pageProfile.audienceInterest.some(i => 
    new RegExp(`\\b${i.toLowerCase()}\\b`).test(topicLower)
  );
  if (anyInterestMatch) maxScore = Math.max(maxScore, 60);
  return Math.min(100, maxScore || 20); // 20 if totally off-topic
}

// ---------- 3. Realism Penalty (makes posts feel human) ----------
function realismPenalty(post) {
  let penalty = 0;
  const text = post.toLowerCase();

  // unnatural symmetry – AI often writes perfectly balanced short phrases
  if (/^\w+\s+\w+\s+\w+\s+\w+\s+\w+$/.test(text)) penalty += 10;

  // over-balanced sentence structure (all sentences too short and equal length)
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a,b) => a+b,0) / lengths.length;
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < 3 && avg < 8) penalty += 15;
  }

  // too perfect grammar – missing contractions and slang
  const hasContraction = /\b(don't|can't|won't|i'm|you're|it's|that's)\b/i.test(text);
  const hasSlang = /\b(guy|stuff|thing|yeah|nah|lol|kinda|gonna|wanna)\b/i.test(text);
  if (!hasContraction && !hasSlang) penalty += 10;

  // no sentence fragments (humans use them)
  const hasFragment = /[.?!]\s+[a-z]/i.test(text) === false; // no lowercase start after period? Not perfect, but simple
  if (!hasFragment) penalty += 5;

  return Math.min(30, penalty);
}

// ---------- 4. AI Structure Detector (catches modern AI even without phrase matches) ----------
function aiStructureScore(post) {
  let score = 0;
  const text = post.trim();

  // intro-hook-body-clean structure – AI often starts with generic intro words
  if (/^(in|this|the|a|an|when|if|as|for|with)/i.test(text)) score += 10;

  // equal sentence length pattern (very common in GPT)
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 2) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < 3) score += 20;
    else if (variance < 5) score += 10;
  }

  // lack of punctuation variety (no em-dash, semicolon, or ellipsis)
  const hasVariety = /[—;…\-–]/.test(post);
  if (!hasVariety) score += 5;

  // predictable positivity ratio (AI tends to end on positive/neutral tone)
  const endsWithPeriod = /\.$/.test(post.trim());
  if (endsWithPeriod) score += 5;

  return Math.min(40, score);
}

// ---------- 5. Topic Scoring (already good, but add decay from page memory) ----------
function scoreTopic(topic, pageId = null) {
  let score = 50; // base
  const lower = topic.toLowerCase();

  // Specificity
  if (/\d{4}/.test(topic)) score += 10;
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(topic)) score += 15;
  if (topic.split(/\s+/).length > 5) score += 10;

  // Trend potential
  const trendWords = ['new', 'breaking', 'alert', 'update', '2025', 'latest', 'today', 'now'];
  for (const w of trendWords) if (lower.includes(w)) score += 8;

  // Curiosity
  const curiosity = ['why', 'how', 'what', 'inside', 'behind', 'truth', 'secret', 'mistake'];
  for (const w of curiosity) if (lower.includes(w)) score += 8;

  // Penalise generic
  const generic = ['benefits', 'ways to', 'how to', 'tips', 'guide', 'overview', 'introduction'];
  for (const g of generic) if (lower.includes(g)) score -= 20;

  // Page memory: avoid repeating recent topics
  if (pageId) {
    const mem = getPageMemory(pageId);
    if (mem && mem.lastTopics.length) {
      const isRepeat = mem.lastTopics.some(t => stringSimilarity(topic, t) > 0.6);
      if (isRepeat) score -= 40;
    }
  }

  return Math.min(100, Math.max(0, score));
}

// Helper similarity (simple Jaccard on words)
function stringSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

// ---------- 6. Duplicate Detection (fingerprint, as before) ----------
function fingerprint(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 15).join(' ');
}
function isDuplicate(newPost, recentPosts, threshold = 0.85) {
  const newFp = fingerprint(newPost);
  for (const old of recentPosts) {
    const oldFp = fingerprint(old);
    if (newFp === oldFp) return true;
    const longer = newFp.length > oldFp.length ? newFp : oldFp;
    const shorter = newFp.length > oldFp.length ? oldFp : newFp;
    if (longer.length === 0) continue;
    const sim = (longer.length - Math.abs(longer.length - shorter.length)) / longer.length;
    if (sim >= threshold) return true;
  }
  return false;
}

// ---------- 7. Validation functions (simplified, keep core) ----------
function validatePost(post) {
  const text = post?.trim();
  if (!text) return { valid: false, reason: 'Empty' };
  if (text.length < 20) return { valid: false, reason: 'Too short' };
  if (text.length > 2200) return { valid: false, reason: 'Too long' };
  const aiPhrases = [
    /\bhave you ever\b/i, /\blet's explore\b/i, /\bin today's world\b/i,
    /\bit's important to\b/i, /\bin conclusion\b/i, /\bhere are\b/i,
    /\bone thing people don't realize\b/i, /\bit's worth noting\b/i,
    /\bthe reality is\b/i, /\bwhat many people fail to understand\b/i,
    /\bin a rapidly evolving\b/i, /\bthe key takeaway\b/i
  ];
  for (const p of aiPhrases) if (p.test(text)) return { valid: false, reason: 'AI phrase' };
  const corporate = [/\bleverage\b/i, /\bsynergy\b/i, /\btransformative\b/i];
  for (const p of corporate) if (p.test(text)) return { valid: false, reason: 'Jargon' };
  if ((text.match(/#\w+/g) || []).length > 3) return { valid: false, reason: 'Hashtags' };
  return { valid: true, reason: '' };
}

function facebookCompliance(post) {
  const text = post.toLowerCase();
  if (/\blike if\b|\bshare if\b|\bcomment "?yes"?\b/i.test(text)) return { compliant: false, reason: 'Engagement bait' };
  if (/\bguaranteed (money|success)\b|100% cure/i.test(text)) return { compliant: false, reason: 'Fake claim' };
  return { compliant: true, reason: '' };
}

function hasUnsupportedClaim(post) {
  const text = post.toLowerCase();
  if (/\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim' };
  }
  return { hasClaim: false, reason: '' };
}

function validateTone(post, pageProfile) {
  if (!pageProfile?.tone) return { matches: true };
  const tone = pageProfile.tone.toLowerCase();
  const text = post.toLowerCase();
  const toneMap = {
    funny: ['lol', 'hilarious', 'crazy', '😂', '🤣', 'silly', 'oops'],
    serious: ['critical', 'warning', 'danger', 'urgent', 'must'],
    professional: ['according to', 'analysis', 'report', 'data'],
    casual: ['hey', 'guys', 'y\'all', 'so', 'well', 'basically'],
    motivational: ['believe', 'achieve', 'dream', 'success', 'inspire']
  };
  const keywords = toneMap[tone] || [];
  if (keywords.length === 0) return { matches: true };
  const match = keywords.some(kw => text.includes(kw));
  if (!match && tone !== 'professional') return { matches: false, reason: `Tone mismatch (expected ${tone})` };
  return { matches: true };
}

// ---------- 8. Virality & Human Scores (simplified) ----------
function viralityScore(post) {
  let score = 0;
  const text = post.toLowerCase();
  if (/but|however|yet|actually|surprisingly|unexpectedly/.test(text)) score += 25;
  if (/why|how|what|reason|because|inside|secret/.test(text)) score += 20;
  if (/\?/.test(text) && !/like|share|comment/i.test(text)) score += 15;
  if (/\d+%|\d+ million|\d+ thousand/.test(text)) score += 20;
  return Math.min(100, score);
}

function humanScore(post) {
  let score = 100;
  const markers = [
    /\bhave you ever\b/i, /\blet's explore\b/i, /\bin today's world\b/i, /\bit's important to\b/i,
    /\bin conclusion\b/i, /\bhere are\b/i, /\bone thing people don't realize\b/i
  ];
  for (const m of markers) if (m.test(post)) score -= 15;
  if (/\b(i|we) (think|believe|feel)\b/i.test(post)) score += 10;
  if (/!/.test(post)) score += 5;
  return Math.min(100, Math.max(0, score));
}

function hookScore(post) {
  const hookWords = ['unexpected', 'warning', 'mistake', 'secret', 'surprising', 'caught', 'exposed', 'revealed'];
  let score = 0;
  for (const w of hookWords) if (post.toLowerCase().includes(w)) score += 15;
  if (/^[A-Z]/.test(post.trim())) score += 10;
  return Math.min(100, score);
}

function readabilityScore(post) {
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 50;
  const avgWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
  if (avgWords >= 8 && avgWords <= 20) return 100;
  if (avgWords >= 5 && avgWords <= 25) return 70;
  return 40;
}

function originalityScore(post) {
  const cliches = [/\bin the end\b/i, /\bat the end of the day\b/i, /\bthink outside the box\b/i];
  let penalty = cliches.filter(c => c.test(post.toLowerCase())).length * 20;
  return Math.max(0, 100 - penalty);
}

// ---------- 9. Final Gatekeeper Score ----------
function finalPostScore(post, topic, pageProfile, pageId = null) {
  const base = {
    human: humanScore(post),
    virality: viralityScore(post),
    hook: hookScore(post),
    readability: readabilityScore(post),
    originality: originalityScore(post)
  };
  const rawScore = (base.human * 0.3 + base.virality * 0.25 + base.hook * 0.2 + base.readability * 0.15 + base.originality * 0.1);
  const pageFit = pageFitScore(topic, pageProfile);
  const aiStruct = aiStructureScore(post);
  const realism = realismPenalty(post);
  let finalScore = (rawScore * 0.7) + (pageFit * 0.15) + (base.virality * 0.15) - realism - aiStruct;
  finalScore = Math.min(100, Math.max(0, finalScore));
  return { total: Math.round(finalScore), breakdown: { ...base, pageFit, aiStructure: aiStruct, realismPenalty: realism } };
}

// ---------- 10. Adaptive Regeneration Prompt ----------
async function adaptiveRegenerate(originalPost, failureReason, generateFn) {
  let fixInstructions = '';
  if (failureReason.includes('AI phrase')) fixInstructions = 'remove all AI phrases, sound like a real person talking';
  else if (failureReason.includes('Tone mismatch')) fixInstructions = 'match the required tone exactly';
  else if (failureReason.includes('Unsupported claim')) fixInstructions = 'remove any unsupported claims or cited research';
  else if (failureReason.includes('Duplicate')) fixInstructions = 'completely change the wording, make it unique';
  else fixInstructions = 'make it more human, add personality, break perfect grammar, use contractions, add surprise';

  const prompt = `Rewrite the following Facebook post to be much better. Fix these issues: ${fixInstructions}. 
Keep the same core message but make it punchy, natural, and max 3 sentences. 
Original: "${originalPost}"
Return only the rewritten post.`;
  return await generateFn(prompt);
}

// ---------- 11. Main Pipeline (with page memory, adaptive regen, final gatekeeper) ----------
async function processContent({
  topic,
  post,
  pageProfile,
  pageId,                       // required for memory
  recentPosts = [],
  generateFn,
  maxRegenerations = 1
}) {
  // 1. Topic scoring (with memory)
  const tScore = scoreTopic(topic, pageId);
  if (tScore < 30) {
    return { pass: false, finalPost: null, reason: `Topic score too low (${tScore})`, topicScore: tScore };
  }

  // 2. Page fit (score, not boolean)
  const pFit = pageFitScore(topic, pageProfile);
  if (pFit < 30) {
    return { pass: false, finalPost: null, reason: `Page fit too low (${pFit})`, topicScore: tScore, pageFit: pFit };
  }

  let currentPost = post;
  let finalDecision = null;

  for (let attempt = 0; attempt <= maxRegenerations; attempt++) {
    // Basic validations
    const pv = validatePost(currentPost);
    if (!pv.valid) {
      if (attempt === maxRegenerations) return { pass: false, reason: pv.reason, topicScore: tScore };
      currentPost = await adaptiveRegenerate(currentPost, pv.reason, generateFn);
      continue;
    }

    const comp = facebookCompliance(currentPost);
    if (!comp.compliant) {
      if (attempt === maxRegenerations) return { pass: false, reason: comp.reason, topicScore: tScore };
      currentPost = await adaptiveRegenerate(currentPost, comp.reason, generateFn);
      continue;
    }

    const hal = hasUnsupportedClaim(currentPost);
    if (hal.hasClaim) {
      if (attempt === maxRegenerations) return { pass: false, reason: hal.reason, topicScore: tScore };
      currentPost = await adaptiveRegenerate(currentPost, hal.reason, generateFn);
      continue;
    }

    const tone = validateTone(currentPost, pageProfile);
    if (!tone.matches) {
      if (attempt === maxRegenerations) return { pass: false, reason: tone.reason, topicScore: tScore };
      currentPost = await adaptiveRegenerate(currentPost, tone.reason, generateFn);
      continue;
    }

    // Duplicate detection
    if (recentPosts.length && isDuplicate(currentPost, recentPosts)) {
      if (attempt === maxRegenerations) return { pass: false, reason: 'Duplicate post', topicScore: tScore };
      currentPost = await adaptiveRegenerate(currentPost, 'Duplicate', generateFn);
      continue;
    }

    // Final score (gatekeeper)
    const scoring = finalPostScore(currentPost, topic, pageProfile, pageId);
    if (scoring.total >= 70) {
      // Update page memory
      updatePageMemory(pageId, topic, currentPost, scoring.total);
      return {
        pass: true,
        finalPost: currentPost,
        score: scoring.total,
        topicScore: tScore,
        pageFit: pFit,
        breakdown: scoring.breakdown
      };
    }

    // Not good enough – regenerate with adaptive prompt
    if (attempt < maxRegenerations) {
      currentPost = await adaptiveRegenerate(currentPost, `Score ${scoring.total} too low`, generateFn);
    } else {
      return {
        pass: false,
        reason: `Score ${scoring.total} below threshold after regeneration`,
        topicScore: tScore,
        lastScore: scoring.total
      };
    }
  }
}

module.exports = {
  processContent,
  updatePageMemory,
  getPageMemory,
  pageFitScore,
  realismPenalty,
  aiStructureScore,
  finalPostScore
};
