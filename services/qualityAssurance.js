// services/qualityAssurance.js
// Enhanced with detailed feedback and suggestions for AI regeneration

// ---------- 1. In-Memory Page Memory ----------
const pageMemory = new Map();

function updatePageMemory(pageId, topic, post, qualityScore) {
  if (!pageMemory.has(pageId)) {
    pageMemory.set(pageId, {
      lastTopics: [],
      lastPosts: [],
      toneDrift: 0,
      lastQualityScore: 85
    });
  }
  const mem = pageMemory.get(pageId);
  mem.lastTopics.unshift(topic);
  mem.lastTopics = mem.lastTopics.slice(0, 10);
  mem.lastPosts.unshift(post);
  mem.lastPosts = mem.lastPosts.slice(0, 10);
  mem.lastQualityScore = qualityScore;
  if (qualityScore < mem.lastQualityScore - 10) {
    mem.toneDrift += 5;
  } else if (qualityScore > mem.lastQualityScore + 10) {
    mem.toneDrift = Math.max(0, mem.toneDrift - 2);
  }
}

function getPageMemory(pageId) {
  return pageMemory.get(pageId) || null;
}

// ---------- 2. Keyword Families ----------
const INTEREST_MAP = {
  cybersecurity: ['hacker', 'malware', 'ransomware', 'breach', 'security', 'phishing', 'cyberattack', 'vulnerability', 'patch', 'exploit'],
  football: ['premier league', 'arsenal', 'chelsea', 'man utd', 'goal', 'match', 'fifa', 'world cup', 'champions league', 'football'],
  finance: ['money', 'stocks', 'investing', 'inflation', 'bank', 'savings', 'crypto', 'bitcoin', 'trading', 'budget'],
  technology: ['ai', 'artificial intelligence', 'software', 'update', 'windows', 'mac', 'ios', 'android', 'cloud', 'startup'],
  health: ['wellness', 'fitness', 'diet', 'nutrition', 'exercise', 'mental health', 'covid', 'vaccine', 'sleep'],
  marketing: ['social media', 'facebook ads', 'instagram', 'seo', 'content', 'email', 'conversion', 'traffic', 'audience']
};

function pageFitScore(topic, pageProfile, postText = null) {
  if (!pageProfile?.audienceInterest?.length) return 70;
  const topicLower = topic.toLowerCase();
  let maxScore = 0;
  for (const interest of pageProfile.audienceInterest) {
    const interestKey = interest.toLowerCase();
    const keywords = INTEREST_MAP[interestKey] || [interestKey];
    for (const kw of keywords) {
      if (topicLower.includes(kw)) {
        maxScore = Math.max(maxScore, 30);
        if (topicLower.includes(interestKey)) maxScore = Math.min(100, maxScore + 40);
      }
    }
    const regex = new RegExp(`\\b${interestKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(topicLower)) maxScore = Math.max(maxScore, 60);
  }
  if (maxScore < 40 && postText) {
    const postLower = postText.toLowerCase();
    for (const interest of pageProfile.audienceInterest) {
      const interestKey = interest.toLowerCase();
      if (postLower.includes(interestKey)) {
        maxScore = Math.max(maxScore, 50);
        break;
      }
      const keywords = INTEREST_MAP[interestKey] || [];
      for (const kw of keywords) {
        if (postLower.includes(kw)) {
          maxScore = Math.max(maxScore, 40);
          break;
        }
      }
    }
  }
  return Math.min(100, Math.max(40, maxScore || 40));
}

// ---------- 3. Realism Penalty ----------
function realismPenalty(post) {
  let penalty = 0;
  const text = post.toLowerCase();
  if (/^\w+\s+\w+\s+\w+\s+\w+\s+\w+$/.test(text)) penalty += 10;
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a,b) => a+b,0) / lengths.length;
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < 3 && avg < 8) penalty += 15;
  }
  const hasContraction = /\b(don't|can't|won't|i'm|you're|it's|that's)\b/i.test(text);
  const hasSlang = /\b(guy|stuff|thing|yeah|nah|lol|kinda|gonna|wanna)\b/i.test(text);
  if (!hasContraction && !hasSlang) penalty += 10;
  return Math.min(30, penalty);
}

// ---------- 4. AI Structure Detector ----------
function aiStructureScore(post) {
  let score = 0;
  const text = post.trim();
  if (/^(in|this|the|a|an|when|if|as|for|with)/i.test(text)) score += 10;
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 2) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < 3) score += 20;
    else if (variance < 5) score += 10;
  }
  const hasVariety = /[—;…\-–]/.test(post);
  if (!hasVariety) score += 5;
  const endsWithPeriod = /\.$/.test(post.trim());
  if (endsWithPeriod) score += 5;
  return Math.min(40, score);
}

// ---------- 5. Topic Scoring ----------
function scoreTopic(topic, pageId = null) {
  let score = 50;
  const lower = topic.toLowerCase();
  if (/\d{4}/.test(topic)) score += 10;
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(topic)) score += 15;
  if (topic.split(/\s+/).length > 5) score += 10;
  const trendWords = ['new', 'breaking', 'alert', 'update', '2025', 'latest', 'today', 'now'];
  for (const w of trendWords) if (lower.includes(w)) score += 8;
  const curiosity = ['why', 'how', 'what', 'inside', 'behind', 'truth', 'secret', 'mistake'];
  for (const w of curiosity) if (lower.includes(w)) score += 8;
  const generic = ['benefits', 'ways to', 'how to', 'tips', 'guide', 'overview', 'introduction'];
  for (const g of generic) if (lower.includes(g)) score -= 20;
  if (pageId) {
    const mem = getPageMemory(pageId);
    if (mem && mem.lastTopics.length) {
      const isRepeat = mem.lastTopics.some(t => stringSimilarity(topic, t) > 0.6);
      if (isRepeat) score -= 40;
    }
  }
  return Math.min(100, Math.max(0, score));
}

function stringSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

// ---------- 6. Duplicate Detection ----------
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

// ---------- 7. Validation Functions with Enhanced Feedback ----------
function validatePost(post) {
  const text = post?.trim();
  if (!text) return { valid: false, reason: 'Empty', suggestion: 'Write a post with at least 20 characters.' };
  if (text.length < 20) return { valid: false, reason: 'Too short', suggestion: 'Expand your post to at least 20 characters (about 4-5 words).' };
  if (text.length > 2200) return { valid: false, reason: 'Too long', suggestion: 'Shorten your post to under 2200 characters (Facebook limit).' };
  
  const aiPhrases = [
    { regex: /\bhave you ever\b/i, phrase: '"Have you ever..."' },
    { regex: /\blet's explore\b/i, phrase: '"Let\'s explore..."' },
    { regex: /\bin today's world\b/i, phrase: '"In today\'s world..."' },
    { regex: /\bit's important to\b/i, phrase: '"It\'s important to..."' },
    { regex: /\bin conclusion\b/i, phrase: '"In conclusion..."' },
    { regex: /\bhere are\b/i, phrase: '"Here are..."' },
    { regex: /\bone thing people don't realize\b/i, phrase: '"One thing people don\'t realize..."' },
    { regex: /\bit's worth noting\b/i, phrase: '"It\'s worth noting..."' },
    { regex: /\bthe reality is\b/i, phrase: '"The reality is..."' },
    { regex: /\bwhat many people fail to understand\b/i, phrase: '"What many people fail to understand..."' },
    { regex: /\bin a rapidly evolving\b/i, phrase: '"In a rapidly evolving..."' },
    { regex: /\bthe key takeaway\b/i, phrase: '"The key takeaway..."' }
  ];
  for (const p of aiPhrases) {
    if (p.regex.test(text)) {
      return { valid: false, reason: `AI phrase: ${p.phrase}`, suggestion: `Remove "${p.phrase}" and start directly with your point. Be conversational.` };
    }
  }
  
  const corporate = [
    { regex: /\bleverage\b/i, word: 'leverage' },
    { regex: /\bsynergy\b/i, word: 'synergy' },
    { regex: /\btransformative\b/i, word: 'transformative' }
  ];
  for (const c of corporate) {
    if (c.regex.test(text)) {
      return { valid: false, reason: `Jargon: "${c.word}"`, suggestion: `Replace "${c.word}" with simpler, everyday language.` };
    }
  }
  
  const hashtagCount = (text.match(/#\w+/g) || []).length;
  if (hashtagCount > 3) {
    return { valid: false, reason: 'Too many hashtags', suggestion: 'Use at most 3 hashtags on Facebook. Better yet, use none.' };
  }
  return { valid: true, reason: '', suggestion: '' };
}

function facebookCompliance(post) {
  const text = post.toLowerCase();
  if (/\blike if\b|\bshare if\b|\bcomment "?yes"?\b/i.test(text)) {
    return { compliant: false, reason: 'Engagement bait', suggestion: 'Do not ask people to like, share, or comment in a manipulative way. Post valuable content instead.' };
  }
  if (/\bguaranteed (money|success)\b|100% cure/i.test(text)) {
    return { compliant: false, reason: 'Fake claim', suggestion: 'Avoid absolute guarantees or miracle cures. Be honest about what your post offers.' };
  }
  return { compliant: true, reason: '', suggestion: '' };
}

function hasUnsupportedClaim(post) {
  const text = post.toLowerCase();
  if (/\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim', suggestion: 'Either remove the claim or add a source (e.g., "According to [source]").' };
  }
  return { hasClaim: false, reason: '', suggestion: '' };
}

function validateTone(post, pageProfile) {
  if (!pageProfile?.tone) return { matches: true, reason: '', suggestion: '' };
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
  if (keywords.length === 0) return { matches: true, reason: '', suggestion: '' };
  const match = keywords.some(kw => text.includes(kw));
  if (!match && tone !== 'professional') {
    return { matches: false, reason: `Tone mismatch (expected ${tone})`, suggestion: `Add words that match ${tone} tone, e.g., ${keywords.slice(0,3).join(', ')}.` };
  }
  return { matches: true, reason: '', suggestion: '' };
}

// ---------- 8. Scoring Functions ----------
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

function finalPostScore(post, topic, pageProfile, pageId = null) {
  const base = {
    human: humanScore(post),
    virality: viralityScore(post),
    hook: hookScore(post),
    readability: readabilityScore(post),
    originality: originalityScore(post)
  };
  const rawScore = (base.human * 0.3 + base.virality * 0.25 + base.hook * 0.2 + base.readability * 0.15 + base.originality * 0.1);
  const pageFit = pageFitScore(topic, pageProfile, post);
  const aiStruct = aiStructureScore(post);
  const realism = realismPenalty(post);
  let finalScore = (rawScore * 0.7) + (pageFit * 0.15) + (base.virality * 0.15) - realism - aiStruct;
  finalScore = Math.min(100, Math.max(0, finalScore));
  return { total: Math.round(finalScore), breakdown: { ...base, pageFit, aiStructure: aiStruct, realismPenalty: realism } };
}

// ---------- 9. Enhanced Adaptive Regeneration with detailed feedback ----------
async function adaptiveRegenerate(originalPost, failureReason, suggestion, generateFn) {
  const prompt = `The following Facebook post was rejected because: ${failureReason}

Suggested fix: ${suggestion}

Rewrite the post to address these issues. Keep the core message, but make it natural, punchy, and max 3 sentences. Return only the rewritten post.

Original: "${originalPost}"`;
  return await generateFn(prompt);
}

// ---------- 10. Main Pipeline with detailed feedback collection ----------
async function processContent({
  topic,
  post,
  pageProfile,
  pageId,
  recentPosts = [],
  generateFn,
  maxRegenerations = 2  // increased default to allow more chances
}) {
  // 1. Topic scoring
  const tScore = scoreTopic(topic, pageId);
  if (tScore < 25) {
    return { pass: false, reason: `Topic score too low (${tScore})`, suggestion: 'Choose a more specific, trending, or curiosity-driven topic.' };
  }

  // 2. Page fit
  const pFit = pageFitScore(topic, pageProfile, post);
  if (pFit < 20) {
    return { pass: false, reason: `Page fit too low (${pFit})`, suggestion: `Make the post more relevant to your audience interests: ${pageProfile?.audienceInterest?.join(', ') || 'unknown'}.` };
  }

  let currentPost = post;
  let failures = [];

  for (let attempt = 0; attempt <= maxRegenerations; attempt++) {
    // Run all validations and collect failures
    const pv = validatePost(currentPost);
    if (!pv.valid) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: pv.reason, suggestion: pv.suggestion, failures };
      }
      failures.push({ type: 'validation', reason: pv.reason, suggestion: pv.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, pv.reason, pv.suggestion, generateFn);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const comp = facebookCompliance(currentPost);
    if (!comp.compliant) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: comp.reason, suggestion: comp.suggestion, failures };
      }
      failures.push({ type: 'compliance', reason: comp.reason, suggestion: comp.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, comp.reason, comp.suggestion, generateFn);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const hal = hasUnsupportedClaim(currentPost);
    if (hal.hasClaim) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: hal.reason, suggestion: hal.suggestion, failures };
      }
      failures.push({ type: 'claim', reason: hal.reason, suggestion: hal.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, hal.reason, hal.suggestion, generateFn);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const tone = validateTone(currentPost, pageProfile);
    if (!tone.matches) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: tone.reason, suggestion: tone.suggestion, failures };
      }
      failures.push({ type: 'tone', reason: tone.reason, suggestion: tone.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, tone.reason, tone.suggestion, generateFn);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    if (recentPosts.length && isDuplicate(currentPost, recentPosts)) {
      const dupReason = 'Duplicate post content';
      const dupSuggestion = 'Completely rephrase the post. Use different words, sentence structure, and examples.';
      if (attempt === maxRegenerations) {
        return { pass: false, reason: dupReason, suggestion: dupSuggestion, failures };
      }
      failures.push({ type: 'duplicate', reason: dupReason, suggestion: dupSuggestion });
      currentPost = await adaptiveRegenerate(currentPost, dupReason, dupSuggestion, generateFn);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    // Final scoring
    const scoring = finalPostScore(currentPost, topic, pageProfile, pageId);
    if (scoring.total >= 65) {  // threshold lowered slightly
      updatePageMemory(pageId, topic, currentPost, scoring.total);
      return {
        pass: true,
        finalPost: currentPost,
        score: scoring.total,
        topicScore: tScore,
        pageFit: pFit,
        breakdown: scoring.breakdown,
        regenerationAttempts: attempt
      };
    }

    // Score too low – provide detailed feedback
    const scoreReason = `Score ${scoring.total} below threshold (need ≥65)`;
    let scoreSuggestion = 'Improve the post by:\n';
    if (scoring.breakdown.human < 70) scoreSuggestion += '- Remove AI phrases and make it sound like a real person.\n';
    if (scoring.breakdown.virality < 50) scoreSuggestion += '- Add a surprising twist, question, or statistic.\n';
    if (scoring.breakdown.hook < 50) scoreSuggestion += '- Start with a strong hook (warning, mistake, unexpected fact).\n';
    if (scoring.breakdown.readability < 70) scoreSuggestion += '- Keep sentences between 8-20 words.\n';
    if (scoring.breakdown.originality < 70) scoreSuggestion += '- Avoid clichés like "at the end of the day".\n';
    if (scoring.breakdown.pageFit < 50) scoreSuggestion += `- Make it more relevant to ${pageProfile?.audienceInterest?.join(', ') || 'your audience'}.\n`;
    if (scoring.breakdown.aiStructure > 20) scoreSuggestion += '- Avoid starting with generic words like "In", "This", "The".\n';
    if (scoring.breakdown.realismPenalty > 10) scoreSuggestion += '- Use contractions (don\'t, can\'t) and occasional slang.\n';
    
    if (attempt === maxRegenerations) {
      return { pass: false, reason: scoreReason, suggestion: scoreSuggestion, lastScore: scoring.total, failures };
    }
    
    failures.push({ type: 'score', reason: scoreReason, suggestion: scoreSuggestion });
    currentPost = await adaptiveRegenerate(currentPost, scoreReason, scoreSuggestion, generateFn);
    if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
  }
}

module.exports = {
  processContent,
  updatePageMemory,
  getPageMemory,
  pageFitScore,
  realismPenalty,
  aiStructureScore,
  finalPostScore,
  scoreTopic
};
