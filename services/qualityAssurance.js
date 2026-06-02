// services/qualityAssurance.js
// Enhanced Quality Assurance – now uses pageIntelligence memory & identity scoring
// Passing threshold = 70 (can be overridden per page via extraNotes)

const { identityScore, updatePageMemory: updateIntelligenceMemory, getPageMemory: getIntelligenceMemory } = require('./pageIntelligence');

// ---------- Helper: Parse per‑page overrides from extraNotes ----------
function parsePageOverrides(extraNotes = '') {
  // Look for a block like: qa:{ threshold:80, avoid_phrases:["click here"], tone_keywords:["awesome","cool"], custom_hook_words:["secret","warning"] }
  const match = extraNotes.match(/qa:\s*\{([^}]+)\}/i);
  if (!match) return {};
  try {
    // Safely evaluate the object literal (since it's from trusted input / admin)
    const obj = eval('({' + match[1] + '})');
    return {
      threshold: obj.threshold,
      avoidPhrases: obj.avoid_phrases || [],
      toneKeywords: obj.tone_keywords || [],
      customHookWords: obj.custom_hook_words || [],
      forbiddenJargon: obj.forbidden_jargon || [],
      maxHashtags: obj.max_hashtags,
      requireSource: obj.require_source || false
    };
  } catch (e) {
    console.warn('Failed to parse qa overrides from extraNotes:', e);
    return {};
  }
}

// ---------- 1. In-Memory Page Memory (delegated to pageIntelligence) ----------
// We no longer maintain a separate pageMemory Map here.
// Instead we call getIntelligenceMemory(pageId) and updateIntelligenceMemory(pageId, ...)

function updatePageMemory(pageId, topic, post, qualityScore) {
  // Forward to the shared memory from pageIntelligence
  updateIntelligenceMemory(pageId, topic, post, qualityScore, null); // last param is hook, we don't have here
}

function getPageMemory(pageId) {
  return getIntelligenceMemory(pageId);
}

// ---------- 2. Keyword Families (same as before, but can be extended via extraNotes) ----------
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

// ---------- 3. Realism Penalty (can be adjusted via extraNotes) ----------
function realismPenalty(post, overrides = {}) {
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

// ---------- 5. Topic Scoring (uses shared memory) ----------
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
    if (mem && mem.lastTopics && mem.lastTopics.length) {
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

// ---------- 6. Duplicate Detection (uses shared memory recent posts) ----------
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

// ---------- 7. Validation Functions with per‑page overrides ----------
function validatePost(post, overrides = {}) {
  const text = post?.trim();
  if (!text) return { valid: false, reason: 'Empty', suggestion: 'Write a post with at least 20 characters.' };
  if (text.length < 20) return { valid: false, reason: 'Too short', suggestion: 'Expand your post to at least 20 characters (about 4-5 words).' };
  if (text.length > 2200) return { valid: false, reason: 'Too long', suggestion: 'Shorten your post to under 2200 characters (Facebook limit).' };
  
  // Base AI phrases (can be extended with overrides)
  let aiPhrases = [
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
  // Add custom avoid phrases from extraNotes
  if (overrides.avoidPhrases) {
    overrides.avoidPhrases.forEach(phrase => {
      const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      aiPhrases.push({ regex, phrase: `"${phrase}"` });
    });
  }
  for (const p of aiPhrases) {
    if (p.regex.test(text)) {
      return { valid: false, reason: `AI phrase: ${p.phrase}`, suggestion: `Remove "${p.phrase}" and start directly with your point. Be conversational.` };
    }
  }
  
  // Default jargon
  let corporate = [
    { regex: /\bleverage\b/i, word: 'leverage' },
    { regex: /\bsynergy\b/i, word: 'synergy' },
    { regex: /\btransformative\b/i, word: 'transformative' }
  ];
  // Add custom forbidden jargon
  if (overrides.forbiddenJargon) {
    overrides.forbiddenJargon.forEach(word => {
      corporate.push({ regex: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), word });
    });
  }
  for (const c of corporate) {
    if (c.regex.test(text)) {
      return { valid: false, reason: `Jargon: "${c.word}"`, suggestion: `Replace "${c.word}" with simpler, everyday language.` };
    }
  }
  
  const maxHashtags = overrides.maxHashtags !== undefined ? overrides.maxHashtags : 3;
  const hashtagCount = (text.match(/#\w+/g) || []).length;
  if (hashtagCount > maxHashtags) {
    return { valid: false, reason: `Too many hashtags (${hashtagCount} > ${maxHashtags})`, suggestion: `Use at most ${maxHashtags} hashtags on Facebook. Better yet, use none.` };
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

function hasUnsupportedClaim(post, overrides = {}) {
  const text = post.toLowerCase();
  const requireSource = overrides.requireSource || false;
  if (requireSource && /\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim (source required)', suggestion: 'Either remove the claim or add a source (e.g., "According to [source]").' };
  }
  // Default behaviour (without requireSource) – only flag if claim appears without source but we still suggest
  if (/\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim', suggestion: 'Either remove the claim or add a source (e.g., "According to [source]").' };
  }
  return { hasClaim: false, reason: '', suggestion: '' };
}

function validateTone(post, pageProfile, overrides = {}) {
  if (!pageProfile?.tone) return { matches: true, reason: '', suggestion: '' };
  const tone = pageProfile.tone.toLowerCase();
  const text = post.toLowerCase();
  const baseToneMap = {
    funny: ['lol', 'hilarious', 'crazy', '😂', '🤣', 'silly', 'oops'],
    serious: ['critical', 'warning', 'danger', 'urgent', 'must'],
    professional: ['according to', 'analysis', 'report', 'data'],
    casual: ['hey', 'guys', 'y\'all', 'so', 'well', 'basically'],
    motivational: ['believe', 'achieve', 'dream', 'success', 'inspire']
  };
  // Merge custom tone keywords from extraNotes
  let keywords = baseToneMap[tone] || [];
  if (overrides.toneKeywords && overrides.toneKeywords.length) {
    keywords = [...keywords, ...overrides.toneKeywords];
  }
  if (keywords.length === 0) return { matches: true, reason: '', suggestion: '' };
  const match = keywords.some(kw => text.includes(kw));
  if (!match && tone !== 'professional') {
    return { matches: false, reason: `Tone mismatch (expected ${tone})`, suggestion: `Add words that match ${tone} tone, e.g., ${keywords.slice(0,3).join(', ')}.` };
  }
  return { matches: true, reason: '', suggestion: '' };
}

// ---------- 8. Scoring Functions (with custom hook words from extraNotes) ----------
function viralityScore(post, overrides = {}) {
  let score = 0;
  const text = post.toLowerCase();
  if (/but|however|yet|actually|surprisingly|unexpectedly/.test(text)) score += 25;
  if (/why|how|what|reason|because|inside|secret/.test(text)) score += 20;
  if (/\?/.test(text) && !/like|share|comment/i.test(text)) score += 15;
  if (/\d+%|\d+ million|\d+ thousand/.test(text)) score += 20;
  // Custom hook words from extraNotes
  if (overrides.customHookWords) {
    for (const word of overrides.customHookWords) {
      if (text.includes(word.toLowerCase())) score += 15;
    }
  }
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

function hookScore(post, overrides = {}) {
  const hookWords = ['unexpected', 'warning', 'mistake', 'secret', 'surprising', 'caught', 'exposed', 'revealed'];
  // Add custom hook words from extraNotes
  if (overrides.customHookWords) hookWords.push(...overrides.customHookWords);
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

function finalPostScore(post, topic, pageProfile, pageId = null, overrides = {}) {
  const base = {
    human: humanScore(post),
    virality: viralityScore(post, overrides),
    hook: hookScore(post, overrides),
    readability: readabilityScore(post),
    originality: originalityScore(post)
  };
  const rawScore = (base.human * 0.3 + base.virality * 0.25 + base.hook * 0.2 + base.readability * 0.15 + base.originality * 0.1);
  const pageFit = pageFitScore(topic, pageProfile, post);
  const aiStruct = aiStructureScore(post);
  const realism = realismPenalty(post, overrides);
  let finalScore = (rawScore * 0.7) + (pageFit * 0.15) + (base.virality * 0.15) - realism - aiStruct;
  finalScore = Math.min(100, Math.max(0, finalScore));
  return { total: Math.round(finalScore), breakdown: { ...base, pageFit, aiStructure: aiStruct, realismPenalty: realism } };
}

// ---------- 9. Enhanced Adaptive Regeneration (now also checks identityScore) ----------
async function adaptiveRegenerate(originalPost, failureReason, suggestion, generateFn, breakdown = null, pageProfile = null, pageId = null) {
  let detailedFeedback = `The following Facebook post was rejected because: ${failureReason}\n\nSuggested fix: ${suggestion}\n`;
  
  if (breakdown) {
    detailedFeedback += `\nDetailed scores (0-100, higher is better):
- Human tone: ${breakdown.human} (needs ≥70)
- Virality: ${breakdown.virality} (needs ≥50)
- Hook strength: ${breakdown.hook} (needs ≥50)
- Readability: ${breakdown.readability} (needs ≥70)
- Originality: ${breakdown.originality} (needs ≥70)
- Page relevance: ${breakdown.pageFit} (needs ≥50)\n`;
    
    const improvements = [];
    if (breakdown.human < 70) improvements.push('- Remove all AI phrases, use contractions (don\'t, can\'t), add personality');
    if (breakdown.virality < 50) improvements.push('- Add a surprising fact, a question, or a statistic (e.g., "83% of users...")');
    if (breakdown.hook < 50) improvements.push('- Start with a strong hook: "Warning:", "Mistake:", "Unexpected:", or a bold claim');
    if (breakdown.readability < 70) improvements.push('- Keep sentences between 8-20 words. Break long sentences.');
    if (breakdown.originality < 70) improvements.push('- Avoid clichés like "at the end of the day", "think outside the box"');
    if (breakdown.pageFit < 50) improvements.push(`- Make the post more relevant to ${pageProfile?.audienceInterest?.join(', ') || 'the audience'}`);
    if (breakdown.aiStructure > 20) improvements.push('- Do not start with "In", "This", "The", "When", "If". Start with a strong statement.');
    if (breakdown.realismPenalty > 10) improvements.push('- Use everyday language, slang, or an exclamation mark (!).');
    
    if (improvements.length > 0) {
      detailedFeedback += `\nSpecific improvements needed:\n${improvements.join('\n')}\n`;
    }
  }
  
  detailedFeedback += `\nRewrite the post to fix these issues. Keep the core message but make it punchy, natural, and max 3 sentences. Return only the rewritten post.\n\nOriginal: "${originalPost}"`;
  
  let newPost = await generateFn(detailedFeedback);
  // After regeneration, optionally check identity score (if pageProfile and pageId exist)
 // if (pageProfile && pageId && newPost) {
 //   const idScore = await identityScore(newPost, pageProfile, pageProfile); // second arg expects DNA, but we can pass pageProfile as stub - adjust as needed
 //   if (idScore < 50) {
      // Append a note to regenerate again with identity focus
//      detailedFeedback += `\n\nAlso, this post doesn't sound like the page's authentic voice (identity score ${idScore}/100). Make it sound more like: authority ${pageProfile.authority || 50}, seriousness ${pageProfile.seriousness || 50}, humor ${pageProfile.humor || 20}.`;
  //    newPost = await generateFn(detailedFeedback);
    }
  
  return newPost;


// ---------- 10. Main Pipeline with per‑page overrides from extraNotes ----------
async function processContent({
  topic,
  post,
  pageProfile,
  pageId,
  recentPosts = [],
  generateFn,
  maxRegenerations = 2
}) {
  // Extract per‑page overrides from extraNotes
  const overrides = parsePageOverrides(pageProfile?.extraNotes || '');
  const THRESHOLD = overrides.threshold !== undefined ? overrides.threshold : 70;
  
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
    // Run all validations (with overrides)
    const pv = validatePost(currentPost, overrides);
    if (!pv.valid) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: pv.reason, suggestion: pv.suggestion, failures };
      }
      failures.push({ type: 'validation', reason: pv.reason, suggestion: pv.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, pv.reason, pv.suggestion, generateFn, null, pageProfile, pageId);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const comp = facebookCompliance(currentPost);
    if (!comp.compliant) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: comp.reason, suggestion: comp.suggestion, failures };
      }
      failures.push({ type: 'compliance', reason: comp.reason, suggestion: comp.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, comp.reason, comp.suggestion, generateFn, null, pageProfile, pageId);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const hal = hasUnsupportedClaim(currentPost, overrides);
    if (hal.hasClaim) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: hal.reason, suggestion: hal.suggestion, failures };
      }
      failures.push({ type: 'claim', reason: hal.reason, suggestion: hal.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, hal.reason, hal.suggestion, generateFn, null, pageProfile, pageId);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const tone = validateTone(currentPost, pageProfile, overrides);
    if (!tone.matches) {
      if (attempt === maxRegenerations) {
        return { pass: false, reason: tone.reason, suggestion: tone.suggestion, failures };
      }
      failures.push({ type: 'tone', reason: tone.reason, suggestion: tone.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, tone.reason, tone.suggestion, generateFn, null, pageProfile, pageId);
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
      currentPost = await adaptiveRegenerate(currentPost, dupReason, dupSuggestion, generateFn, null, pageProfile, pageId);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    // Final scoring using the per‑page threshold
    const scoring = finalPostScore(currentPost, topic, pageProfile, pageId, overrides);
    if (scoring.total >= THRESHOLD) {
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

    // Score too low – provide detailed feedback including breakdown
    const scoreReason = `Score ${scoring.total} below threshold (need ≥${THRESHOLD})`;
    let scoreSuggestion = '';
    if (scoring.total >= THRESHOLD - 10) {
      scoreSuggestion = 'The post is close! Fine‑tune these areas:\n';
    } else if (scoring.total >= THRESHOLD - 20) {
      scoreSuggestion = 'Needs moderate improvement:\n';
    } else {
      scoreSuggestion = 'Needs major rewrite:\n';
    }
    if (scoring.breakdown.human < 70) scoreSuggestion += '- Remove AI phrases, use contractions, add personality.\n';
    if (scoring.breakdown.virality < 50) scoreSuggestion += '- Add a surprising fact, question, or statistic.\n';
    if (scoring.breakdown.hook < 50) scoreSuggestion += '- Start with a strong hook (warning, mistake, unexpected fact).\n';
    if (scoring.breakdown.readability < 70) scoreSuggestion += '- Keep sentences between 8-20 words.\n';
    if (scoring.breakdown.originality < 70) scoreSuggestion += '- Avoid clichés like "at the end of the day".\n';
    if (scoring.breakdown.pageFit < 50) scoreSuggestion += `- Make it more relevant to ${pageProfile?.audienceInterest?.join(', ') || 'your audience'}.\n`;
    if (scoring.breakdown.aiStructure > 20) scoreSuggestion += '- Avoid starting with generic words like "In", "This", "The".\n';
    if (scoring.breakdown.realismPenalty > 10) scoreSuggestion += '- Use contractions (don\'t, can\'t) and occasional slang.\n';
    
    if (attempt === maxRegenerations) {
      return { pass: false, reason: scoreReason, suggestion: scoreSuggestion, lastScore: scoring.total, failures, breakdown: scoring.breakdown };
    }
    
    failures.push({ type: 'score', reason: scoreReason, suggestion: scoreSuggestion });
    currentPost = await adaptiveRegenerate(currentPost, scoreReason, scoreSuggestion, generateFn, scoring.breakdown, pageProfile, pageId);
    if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
  }
}

module.exports = {
  processContent,
  updatePageMemory,   // now calls the shared intelligence memory
  getPageMemory,      // from intelligence
  pageFitScore,
  realismPenalty,
  aiStructureScore,
  finalPostScore,
  scoreTopic,
  parsePageOverrides  // exported for testing
};
