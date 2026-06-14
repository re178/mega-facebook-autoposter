// services/qualityAssurance.js - Intelligent artifact removal + safe overrides
const { identityScore, updatePageMemory: updateIntelligenceMemory, getPageMemory: getIntelligenceMemory } = require('./pageIntelligence');

// ========== INTELLIGENT POST CLEANING ==========
function cleanPostResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') return '';
  let cleaned = rawResponse.trim();

  // 1. Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Remove common AI prefixes (extended list)
  const prefixes = [
    /^here('s| is) (the )?rewritten (post|version)(:)?\s*/i,
    /^rewritten post(:)?\s*/i,
    /^the (rewritten )?post(:)?\s*/i,
    /^here('s| is) your post(:)?\s*/i,
    /^response(:)?\s*/i,
    /^output(:)?\s*/i,
    /^result(:)?\s*/i,
    /^as requested(:)?\s*/i,
    /^below is(:)?\s*/i,
    /^i have rewritten(:)?\s*/i,
    /^here is(:)?\s*/i,
    /^this is the (rewritten )?post(:)?\s*/i,
  ];
  for (const re of prefixes) {
    cleaned = cleaned.replace(re, '');
  }

  // 3. If the string starts with a quote, extract what's inside the first pair of quotes
  const quoteMatch = cleaned.match(/^["'](.*)["']/s);
  if (quoteMatch) {
    cleaned = quoteMatch[1];
  } else {
    // If no outer quotes but contains quoted text, take the first quoted block
    const innerQuoteMatch = cleaned.match(/["']([^"']+)["']/);
    if (innerQuoteMatch) {
      cleaned = innerQuoteMatch[1];
    }
  }

  // 4. Remove any remaining leading/trailing quotes or backticks
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');

  // 5. If the cleaned text starts with a lowercase letter after a period? No – just trim
  //    But also remove common instructional leftovers
  const instructional = /^(the post |the rewritten post |the response |the text |the content |the message )/i;
  cleaned = cleaned.replace(instructional, '');

  // 6. If the result is still suspiciously long with instruction words at start, try to extract first complete sentence
  if (cleaned.length > 50 && /^(here|this|below|above|as|i have|the following)/i.test(cleaned)) {
    const firstSentence = cleaned.match(/^[^.!?]+[.!?]/);
    if (firstSentence && firstSentence[0].length < cleaned.length / 2) {
      // The first sentence might be instruction; take everything after it
      const afterFirst = cleaned.slice(firstSentence[0].length).trim();
      if (afterFirst.length > 20) cleaned = afterFirst;
    }
  }

  // 7. Final trim and remove any stray quotes at edges again
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '');

  // 8. If the result is empty, return a fallback message (though this shouldn't happen)
  if (!cleaned) return rawResponse.substring(0, 200); // fallback

  return cleaned;
}

// ========== SAFE PARSING OF extraNotes ==========
function parsePageOverrides(extraNotes = '') {
  try {
    const startIdx = extraNotes.search(/qa:\s*\{/i);
    if (startIdx === -1) return {};

    let braceCount = 0;
    let objStart = extraNotes.indexOf('{', startIdx);
    if (objStart === -1) return {};

    let objEnd = objStart;
    for (let i = objStart; i < extraNotes.length; i++) {
      if (extraNotes[i] === '{') braceCount++;
      else if (extraNotes[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          objEnd = i;
          break;
        }
      }
    }
    if (braceCount !== 0) return {};

    const objStr = extraNotes.substring(objStart, objEnd + 1);
    const parser = new Function('return (' + objStr + ')');
    const obj = parser();

    return {
      threshold: obj.threshold,
      topicScoreMin: obj.topic_score_min,
      pageFitMin: obj.page_fit_min,
      identityScoreMin: obj.identity_score_min,
      maxRegenerations: obj.max_regenerations,
      duplicateThreshold: obj.duplicate_threshold,
      minLength: obj.min_length,
      maxLength: obj.max_length,
      avoidPhrases: obj.avoid_phrases || [],
      forbiddenJargon: obj.forbidden_jargon || [],
      maxHashtags: obj.max_hashtags,
      requireSource: obj.require_source || false,
      toneKeywords: obj.tone_keywords || {},
      customHookWords: obj.custom_hook_words || [],
      viralityContrastWords: obj.virality_contrast_words,
      viralityCuriosityWords: obj.virality_curiosity_words,
      viralityQuestionBonus: obj.virality_question_bonus,
      viralityStatBonus: obj.virality_stat_bonus,
      humanAIPhrases: obj.human_ai_phrases,
      humanFirstPersonBonus: obj.human_first_person_bonus,
      humanExclamationBonus: obj.human_exclamation_bonus,
      hookDefaultWords: obj.hook_default_words,
      hookCapitalBonus: obj.hook_capital_bonus,
      readabilityIdealMin: obj.readability_ideal_min,
      readabilityIdealMax: obj.readability_ideal_max,
      readabilityAcceptableMin: obj.readability_acceptable_min,
      readabilityAcceptableMax: obj.readability_acceptable_max,
      readabilityPerfectScore: obj.readability_perfect_score,
      readabilityAcceptableScore: obj.readability_acceptable_score,
      readabilityLowScore: obj.readability_low_score,
      originalityCliches: obj.originality_cliches,
      originalityPenaltyPerCliché: obj.originality_penalty_per_cliche,
      realismUniformSentencePenalty: obj.realism_uniform_sentence_penalty,
      realismContractionSlangBonus: obj.realism_contraction_slang_bonus,
      realismMaxPenalty: obj.realism_max_penalty,
      aiStructureStartingWords: obj.ai_structure_starting_words,
      aiStructureUniformVarianceThreshold: obj.ai_structure_uniform_variance_threshold,
      aiStructureUniformPenalty: obj.ai_structure_uniform_penalty,
      aiStructureSlightVariancePenalty: obj.ai_structure_slight_variance_penalty,
      aiStructureNoVarietyPenalty: obj.ai_structure_no_variety_penalty,
      aiStructureEndsWithPeriodPenalty: obj.ai_structure_ends_with_period_penalty,
      aiStructureMaxScore: obj.ai_structure_max_score,
      weights: obj.weights,
      topicSpecificityBonus: obj.topic_specificity_bonus,
      topicTrendBonus: obj.topic_trend_bonus,
      topicCuriosityBonus: obj.topic_curiosity_bonus,
      topicGenericPenalty: obj.topic_generic_penalty,
      topicRepeatPenalty: obj.topic_repeat_penalty,
      topicTrendWords: obj.topic_trend_words,
      topicCuriosityWords: obj.topic_curiosity_words,
      topicGenericWords: obj.topic_generic_words,
      pageFitKeywordMap: obj.page_fit_keyword_map,
      pageFitExactMatchBonus: obj.page_fit_exact_match_bonus,
      pageFitPartialMatchBase: obj.page_fit_partial_match_base,
      pageFitPostFallbackScore: obj.page_fit_post_fallback_score,
      identityScoreWeights: obj.identity_score_weights,
      fingerprintWordCount: obj.fingerprint_word_count
    };
  } catch (e) {
    console.warn('Failed to parse qa overrides:', e.message, '\nSnippet:', extraNotes?.substring(0, 200));
    return {};
  }
}

// SAFE getParam
function getParam(overrides, key, defaultValue) {
  if (overrides == null) return defaultValue;
  return overrides[key] !== undefined ? overrides[key] : defaultValue;
}

function updatePageMemory(pageId, topic, post, qualityScore) {
  updateIntelligenceMemory(pageId, topic, post, qualityScore, null);
}

function getPageMemory(pageId) {
  return getIntelligenceMemory(pageId);
}

const DEFAULT_INTEREST_MAP = {
  cybersecurity: ['hacker', 'malware', 'ransomware', 'breach', 'security', 'phishing', 'cyberattack', 'vulnerability', 'patch', 'exploit'],
  football: ['premier league', 'arsenal', 'chelsea', 'man utd', 'goal', 'match', 'fifa', 'world cup', 'champions league', 'football'],
  finance: ['money', 'stocks', 'investing', 'inflation', 'bank', 'savings', 'crypto', 'bitcoin', 'trading', 'budget'],
  technology: ['ai', 'artificial intelligence', 'software', 'update', 'windows', 'mac', 'ios', 'android', 'cloud', 'startup'],
  health: ['wellness', 'fitness', 'diet', 'nutrition', 'exercise', 'mental health', 'covid', 'vaccine', 'sleep'],
  marketing: ['social media', 'facebook ads', 'instagram', 'seo', 'content', 'email', 'conversion', 'traffic', 'audience']
};

function pageFitScore(topic, pageProfile, postText = null, overrides = {}) {
  if (!pageProfile?.audienceInterest?.length) return 70;
  const topicLower = topic.toLowerCase();
  let maxScore = 0;
  const interestMap = overrides.pageFitKeywordMap || DEFAULT_INTEREST_MAP;
  const exactMatchBonus = getParam(overrides, 'pageFitExactMatchBonus', 40);
  const partialMatchBase = getParam(overrides, 'pageFitPartialMatchBase', 30);
  const postFallbackScore = getParam(overrides, 'pageFitPostFallbackScore', 50);
  for (const interest of pageProfile.audienceInterest) {
    const interestKey = interest.toLowerCase();
    const keywords = interestMap[interestKey] || [interestKey];
    for (const kw of keywords) {
      if (topicLower.includes(kw)) {
        maxScore = Math.max(maxScore, partialMatchBase);
        if (topicLower.includes(interestKey)) maxScore = Math.min(100, maxScore + exactMatchBonus);
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
        maxScore = Math.max(maxScore, postFallbackScore);
        break;
      }
      const keywords = interestMap[interestKey] || [];
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

function realismPenalty(post, overrides = {}) {
  let penalty = 0;
  const text = post.toLowerCase();
  const uniformSentencePenalty = getParam(overrides, 'realismUniformSentencePenalty', 15);
  const contractionSlangBonus = getParam(overrides, 'realismContractionSlangBonus', 10);
  const maxPenalty = getParam(overrides, 'realismMaxPenalty', 30);
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a,b) => a+b,0) / lengths.length;
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < 3 && avg < 8) penalty += uniformSentencePenalty;
  }
  const hasContraction = /\b(don't|can't|won't|i'm|you're|it's|that's)\b/i.test(text);
  const hasSlang = /\b(guy|stuff|thing|yeah|nah|lol|kinda|gonna|wanna)\b/i.test(text);
  if (!hasContraction && !hasSlang) penalty += contractionSlangBonus;
  return Math.min(maxPenalty, penalty);
}

function aiStructureScore(post, overrides = {}) {
  let score = 0;
  const text = post.trim();
  const startingWords = overrides.aiStructureStartingWords || ['in', 'this', 'the', 'a', 'an', 'when', 'if', 'as', 'for', 'with'];
  if (startingWords.some(word => new RegExp(`^${word}\\b`, 'i').test(text))) score += 10;
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const uniformVarianceThreshold = getParam(overrides, 'aiStructureUniformVarianceThreshold', 3);
  const uniformPenalty = getParam(overrides, 'aiStructureUniformPenalty', 20);
  const slightVariancePenalty = getParam(overrides, 'aiStructureSlightVariancePenalty', 10);
  const noVarietyPenalty = getParam(overrides, 'aiStructureNoVarietyPenalty', 5);
  const endsWithPeriodPenalty = getParam(overrides, 'aiStructureEndsWithPeriodPenalty', 5);
  const maxScore = getParam(overrides, 'aiStructureMaxScore', 40);
  if (sentences.length >= 2) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const variance = Math.max(...lengths) - Math.min(...lengths);
    if (variance < uniformVarianceThreshold) score += uniformPenalty;
    else if (variance < 5) score += slightVariancePenalty;
  }
  const hasVariety = /[—;…\-–]/.test(post);
  if (!hasVariety) score += noVarietyPenalty;
  const endsWithPeriod = /\.$/.test(post.trim());
  if (endsWithPeriod) score += endsWithPeriodPenalty;
  return Math.min(maxScore, score);
}

function scoreTopic(topic, pageId = null, overrides = {}) {
  let score = 50;
  const lower = topic.toLowerCase();
  const specificityBonus = getParam(overrides, 'topicSpecificityBonus', 10);
  const trendBonus = getParam(overrides, 'topicTrendBonus', 8);
  const curiosityBonus = getParam(overrides, 'topicCuriosityBonus', 8);
  const genericPenalty = getParam(overrides, 'topicGenericPenalty', 20);
  const repeatPenalty = getParam(overrides, 'topicRepeatPenalty', 40);
  const trendWords = overrides.topicTrendWords || ['new', 'breaking', 'alert', 'update', '2025', 'latest', 'today', 'now'];
  const curiosityWords = overrides.topicCuriosityWords || ['why', 'how', 'what', 'inside', 'behind', 'truth', 'secret', 'mistake'];
  const genericWords = overrides.topicGenericWords || ['benefits', 'ways to', 'how to', 'tips', 'guide', 'overview', 'introduction'];
  if (/\d{4}/.test(topic)) score += specificityBonus;
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(topic)) score += specificityBonus + 5;
  if (topic.split(/\s+/).length > 5) score += specificityBonus;
  for (const w of trendWords) if (lower.includes(w)) score += trendBonus;
  for (const w of curiosityWords) if (lower.includes(w)) score += curiosityBonus;
  for (const g of genericWords) if (lower.includes(g)) score -= genericPenalty;
  if (pageId) {
    const mem = getPageMemory(pageId);
    if (mem && mem.lastTopics && mem.lastTopics.length) {
      const isRepeat = mem.lastTopics.some(t => stringSimilarity(topic, t) > 0.6);
      if (isRepeat) score -= repeatPenalty;
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

function fingerprint(text, wordCount = 15) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).slice(0, wordCount).join(' ');
}

function isDuplicate(newPost, recentPosts, threshold = 0.85, fingerprintWordCount = 15) {
  const newWords = new Set(newPost.toLowerCase().match(/\b\w+\b/g) || []);
  for (const old of recentPosts) {
    const oldWords = new Set(old.toLowerCase().match(/\b\w+\b/g) || []);
    const intersection = new Set([...newWords].filter(w => oldWords.has(w)));
    const union = new Set([...newWords, ...oldWords]);
    const similarity = intersection.size / union.size;
    if (similarity >= threshold) return true;
  }
  return false;
}

function validatePost(post, overrides = {}) {
  const text = post?.trim();
  const minLen = getParam(overrides, 'minLength', 20);
  const maxLen = getParam(overrides, 'maxLength', 2200);
  const maxHashtags = getParam(overrides, 'maxHashtags', 3);
  if (!text) return { valid: false, reason: 'Empty', suggestion: `Write a post with at least ${minLen} characters.` };
  if (text.length < minLen) return { valid: false, reason: 'Too short', suggestion: `Expand your post to at least ${minLen} characters.` };
  if (text.length > maxLen) return { valid: false, reason: 'Too long', suggestion: `Shorten your post to under ${maxLen} characters.` };
  let aiPhrases = overrides.humanAIPhrases || [
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
  if (overrides.avoidPhrases) {
    overrides.avoidPhrases.forEach(phrase => {
      const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      aiPhrases.push({ regex, phrase: `"${phrase}"` });
    });
  }
  for (const p of aiPhrases) {
    if (p.regex.test(text)) {
      return { valid: false, reason: `AI phrase: ${p.phrase}`, suggestion: `Remove "${p.phrase}" and start directly with your point.` };
    }
  }
  let jargon = overrides.forbiddenJargon || [
    { regex: /\bleverage\b/i, word: 'leverage' },
    { regex: /\bsynergy\b/i, word: 'synergy' },
    { regex: /\btransformative\b/i, word: 'transformative' }
  ];
  for (const c of jargon) {
    if (c.regex.test(text)) {
      return { valid: false, reason: `Jargon: "${c.word}"`, suggestion: `Replace "${c.word}" with simpler language.` };
    }
  }
  const hashtagCount = (text.match(/#\w+/g) || []).length;
  if (hashtagCount > maxHashtags) {
    return { valid: false, reason: `Too many hashtags (${hashtagCount} > ${maxHashtags})`, suggestion: `Use at most ${maxHashtags} hashtags.` };
  }
  return { valid: true, reason: '', suggestion: '' };
}

function facebookCompliance(post) {
  const text = post.toLowerCase();
  if (/\blike if\b|\bshare if\b|\bcomment "?yes"?\b/i.test(text)) {
    return { compliant: false, reason: 'Engagement bait', suggestion: 'Do not ask people to like, share, or comment manipulatively.' };
  }
  if (/\bguaranteed (money|success)\b|100% cure/i.test(text)) {
    return { compliant: false, reason: 'Fake claim', suggestion: 'Avoid absolute guarantees or miracle cures.' };
  }
  return { compliant: true, reason: '', suggestion: '' };
}

function hasUnsupportedClaim(post, overrides = {}) {
  const text = post.toLowerCase();
  const requireSource = overrides.requireSource || false;
  if (requireSource && /\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim (source required)', suggestion: 'Add a source or remove the claim.' };
  }
  if (/\b(studies show|experts agree|research shows)\b/i.test(text) && !/according to|source:/i.test(text)) {
    return { hasClaim: true, reason: 'Unsupported claim', suggestion: 'Add a source or remove the claim.' };
  }
  return { hasClaim: false, reason: '', suggestion: '' };
}

function validateTone(post, pageProfile, overrides = {}) {
  if (!pageProfile?.tone) return { matches: true, reason: '', suggestion: '' };
  const tone = pageProfile.tone.toLowerCase();
  const text = post.toLowerCase();
  const defaultToneMap = {
    funny: ['lol', 'hilarious', 'crazy', '😂', '🤣', 'silly', 'oops'],
    serious: ['critical', 'warning', 'danger', 'urgent', 'must'],
    professional: ['according to', 'analysis', 'report', 'data'],
    casual: ['hey', 'guys', 'y\'all', 'so', 'well', 'basically'],
    motivational: ['believe', 'achieve', 'dream', 'success', 'inspire']
  };
  let keywords = (overrides.toneKeywords && overrides.toneKeywords[tone]) ? overrides.toneKeywords[tone] : (defaultToneMap[tone] || []);
  if (keywords.length === 0) return { matches: true, reason: '', suggestion: '' };
  const match = keywords.some(kw => text.includes(kw));
  if (!match && tone !== 'professional') {
    return { matches: false, reason: `Tone mismatch (expected ${tone})`, suggestion: `Add words like ${keywords.slice(0,3).join(', ')}.` };
  }
  return { matches: true, reason: '', suggestion: '' };
}

function viralityScore(post, overrides = {}) {
  let score = 0;
  const text = post.toLowerCase();
  const contrastWords = overrides.viralityContrastWords || ['but', 'however', 'yet', 'actually', 'surprisingly', 'unexpectedly'];
  const curiosityWords = overrides.viralityCuriosityWords || ['why', 'how', 'what', 'reason', 'because', 'inside', 'secret'];
  const questionBonus = getParam(overrides, 'viralityQuestionBonus', 15);
  const statBonus = getParam(overrides, 'viralityStatBonus', 20);
  for (const w of contrastWords) if (text.includes(w)) { score += 25; break; }
  for (const w of curiosityWords) if (text.includes(w)) { score += 20; break; }
  if (/\?/.test(text) && !/like|share|comment/i.test(text)) score += questionBonus;
  if (/\d+%|\d+ million|\d+ thousand/.test(text)) score += statBonus;
  if (overrides.customHookWords) {
    for (const word of overrides.customHookWords) {
      if (text.includes(word.toLowerCase())) score += 15;
    }
  }
  return Math.min(100, score);
}

function humanScore(post, overrides = {}) {
  let score = 100;
  const aiMarkers = overrides.humanAIPhrases ? overrides.humanAIPhrases.map(p => p.regex) : [
    /\bhave you ever\b/i, /\blet's explore\b/i, /\bin today's world\b/i, /\bit's important to\b/i,
    /\bin conclusion\b/i, /\bhere are\b/i, /\bone thing people don't realize\b/i
  ];
  for (const m of aiMarkers) if (m.test(post)) score -= 15;
  const firstPersonBonus = getParam(overrides, 'humanFirstPersonBonus', 10);
  const exclamationBonus = getParam(overrides, 'humanExclamationBonus', 5);
  if (/\b(i|we) (think|believe|feel)\b/i.test(post)) score += firstPersonBonus;
  if (/!/.test(post)) score += exclamationBonus;
  return Math.min(100, Math.max(0, score));
}

function hookScore(post, overrides = {}) {
  const defaultHookWords = ['unexpected', 'warning', 'mistake', 'secret', 'surprising', 'caught', 'exposed', 'revealed'];
  const hookWords = overrides.hookDefaultWords || defaultHookWords;
  if (overrides.customHookWords) hookWords.push(...overrides.customHookWords);
  let score = 0;
  for (const w of hookWords) if (post.toLowerCase().includes(w)) score += 15;
  const capitalBonus = getParam(overrides, 'hookCapitalBonus', 10);
  if (/^[A-Z]/.test(post.trim())) score += capitalBonus;
  return Math.min(100, score);
}

function readabilityScore(post, overrides = {}) {
  const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 50;
  const avgWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
  const idealMin = getParam(overrides, 'readabilityIdealMin', 8);
  const idealMax = getParam(overrides, 'readabilityIdealMax', 20);
  const acceptableMin = getParam(overrides, 'readabilityAcceptableMin', 5);
  const acceptableMax = getParam(overrides, 'readabilityAcceptableMax', 25);
  const perfectScore = getParam(overrides, 'readabilityPerfectScore', 100);
  const acceptableScore = getParam(overrides, 'readabilityAcceptableScore', 70);
  const lowScore = getParam(overrides, 'readabilityLowScore', 40);
  if (avgWords >= idealMin && avgWords <= idealMax) return perfectScore;
  if (avgWords >= acceptableMin && avgWords <= acceptableMax) return acceptableScore;
  return lowScore;
}

function originalityScore(post, overrides = {}) {
  const defaultCliches = [/\bin the end\b/i, /\bat the end of the day\b/i, /\bthink outside the box\b/i];
  const cliches = overrides.originalityCliches || defaultCliches;
  const penaltyPerCliché = getParam(overrides, 'originalityPenaltyPerCliché', 20);
  let penalty = cliches.filter(c => c.test(post.toLowerCase())).length * penaltyPerCliché;
  return Math.max(0, 100 - penalty);
}

function finalPostScore(post, topic, pageProfile, pageId = null, overrides = {}) {
  const human = humanScore(post, overrides);
  const virality = viralityScore(post, overrides);
  const hook = hookScore(post, overrides);
  const readability = readabilityScore(post, overrides);
  const originality = originalityScore(post, overrides);
  const pageFit = pageFitScore(topic, pageProfile, post, overrides);
  const aiStruct = aiStructureScore(post, overrides);
  const realism = realismPenalty(post, overrides);

  const weightsObj = overrides.weights || {};
  const weights = {
    human: getParam(weightsObj, 'human', 0.3),
    virality: getParam(weightsObj, 'virality', 0.25),
    hook: getParam(weightsObj, 'hook', 0.2),
    readability: getParam(weightsObj, 'readability', 0.15),
    originality: getParam(weightsObj, 'originality', 0.1),
    pageFit: getParam(weightsObj, 'pageFit', 0.15),
    viralityExtra: getParam(weightsObj, 'viralityExtra', 0.15),
    realism: getParam(weightsObj, 'realism', 1),
    aiStructure: getParam(weightsObj, 'aiStructure', 1)
  };

  const rawScore = (human * weights.human +
                    virality * weights.virality +
                    hook * weights.hook +
                    readability * weights.readability +
                    originality * weights.originality);
  let finalScore = (rawScore * 0.7) + (pageFit * weights.pageFit) + (virality * weights.viralityExtra) - (realism * weights.realism) - (aiStruct * weights.aiStructure);
  finalScore = Math.min(100, Math.max(0, finalScore));
  return { total: Math.round(finalScore), breakdown: { human, virality, hook, readability, originality, pageFit, aiStructure: aiStruct, realismPenalty: realism } };
}

async function adaptiveRegenerate(originalPost, failureReason, suggestion, generateFn, breakdown = null, pageProfile = null, pageId = null, dna = null, overrides = {}) {
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
    if (breakdown.human < 70) improvements.push('- Remove AI phrases, use contractions, add personality');
    if (breakdown.virality < 50) improvements.push('- Add a surprising fact, question, or statistic');
    if (breakdown.hook < 50) improvements.push('- Start with a strong hook: "Warning:", "Mistake:", etc.');
    if (breakdown.readability < 70) improvements.push('- Keep sentences between 8-20 words');
    if (breakdown.originality < 70) improvements.push('- Avoid clichés');
    if (breakdown.pageFit < 50) improvements.push(`- Make relevant to ${pageProfile?.audienceInterest?.join(', ') || 'audience'}`);
    if (breakdown.aiStructure > 20) improvements.push('- Do not start with "In", "This", "The"');
    if (breakdown.realismPenalty > 10) improvements.push('- Use contractions and occasional slang');
    if (improvements.length > 0) detailedFeedback += `\nSpecific improvements needed:\n${improvements.join('\n')}\n`;
  }
  detailedFeedback += `\nRewrite the post to fix these issues. Keep the core message but make it punchy, natural, and max 3 sentences. Return ONLY the rewritten post, no extra text or quotes around it.\n\nOriginal: "${originalPost}"`;
  
  let newPost = await generateFn(detailedFeedback);
  // Intelligent cleaning of any artifact
  newPost = cleanPostResponse(newPost);
  
  const identityMin = getParam(overrides, 'identityScoreMin', 50);
  if (dna && pageId && newPost && identityMin > 0) {
    try {
      const idScore = await identityScore(newPost, dna, pageProfile);
      if (idScore < identityMin) {
        detailedFeedback += `\n\nThis post doesn't sound like the page's identity (score ${idScore}/100). Make it more like: authority ${dna.authority}, humor ${dna.humor}, seriousness ${dna.seriousness}. Return ONLY the post, no extra text.`;
        newPost = await generateFn(detailedFeedback);
        newPost = cleanPostResponse(newPost);
      }
    } catch (err) {
      console.warn('Identity scoring failed:', err.message);
    }
  }
  return newPost;
}

async function processContent({
  topic,
  post,
  pageProfile,
  pageId,
  recentPosts = [],
  generateFn,
  maxRegenerations = 2,
  dna = null
}) {
  const overrides = parsePageOverrides(pageProfile?.extraNotes || '');
  const THRESHOLD = getParam(overrides, 'threshold', 70);
  const MAX_REGENS = getParam(overrides, 'maxRegenerations', maxRegenerations);
  const TOPIC_MIN = getParam(overrides, 'topicScoreMin', 25);
  const PAGE_FIT_MIN = getParam(overrides, 'pageFitMin', 20);
  const DUPLICATE_THRESHOLD = getParam(overrides, 'duplicateThreshold', 0.85);
  const FINGERPRINT_WORD_COUNT = getParam(overrides, 'fingerprintWordCount', 15);

  // Clean initial post
  let currentPost = cleanPostResponse(post);

  let tScore = scoreTopic(topic, pageId, overrides);
  if (tScore < TOPIC_MIN) {
    return { pass: false, reason: `Topic score too low (${tScore})`, suggestion: 'Choose a more specific, trending topic.' };
  }

  let pFit = pageFitScore(topic, pageProfile, currentPost, overrides);
  if (pFit < PAGE_FIT_MIN) {
    return { pass: false, reason: `Page fit too low (${pFit})`, suggestion: `Make post relevant to: ${pageProfile?.audienceInterest?.join(', ') || 'unknown'}.` };
  }

  let failures = [];

  for (let attempt = 0; attempt <= MAX_REGENS; attempt++) {
    const pv = validatePost(currentPost, overrides);
    if (!pv.valid) {
      if (attempt === MAX_REGENS) return { pass: false, reason: pv.reason, suggestion: pv.suggestion, failures };
      failures.push({ type: 'validation', reason: pv.reason, suggestion: pv.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, pv.reason, pv.suggestion, generateFn, null, pageProfile, pageId, dna, overrides);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const comp = facebookCompliance(currentPost);
    if (!comp.compliant) {
      if (attempt === MAX_REGENS) return { pass: false, reason: comp.reason, suggestion: comp.suggestion, failures };
      failures.push({ type: 'compliance', reason: comp.reason, suggestion: comp.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, comp.reason, comp.suggestion, generateFn, null, pageProfile, pageId, dna, overrides);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const hal = hasUnsupportedClaim(currentPost, overrides);
    if (hal.hasClaim) {
      if (attempt === MAX_REGENS) return { pass: false, reason: hal.reason, suggestion: hal.suggestion, failures };
      failures.push({ type: 'claim', reason: hal.reason, suggestion: hal.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, hal.reason, hal.suggestion, generateFn, null, pageProfile, pageId, dna, overrides);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const tone = validateTone(currentPost, pageProfile, overrides);
    if (!tone.matches) {
      if (attempt === MAX_REGENS) return { pass: false, reason: tone.reason, suggestion: tone.suggestion, failures };
      failures.push({ type: 'tone', reason: tone.reason, suggestion: tone.suggestion });
      currentPost = await adaptiveRegenerate(currentPost, tone.reason, tone.suggestion, generateFn, null, pageProfile, pageId, dna, overrides);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    if (recentPosts.length && isDuplicate(currentPost, recentPosts, DUPLICATE_THRESHOLD, FINGERPRINT_WORD_COUNT)) {
      const dupReason = 'Duplicate post content';
      const dupSuggestion = 'Completely rephrase the post. Use different words and structure.';
      if (attempt === MAX_REGENS) return { pass: false, reason: dupReason, suggestion: dupSuggestion, failures };
      failures.push({ type: 'duplicate', reason: dupReason, suggestion: dupSuggestion });
      currentPost = await adaptiveRegenerate(currentPost, dupReason, dupSuggestion, generateFn, null, pageProfile, pageId, dna, overrides);
      if (!currentPost) return { pass: false, reason: 'Regeneration failed', suggestion: 'AI provider issue.' };
      continue;
    }

    const scoring = finalPostScore(currentPost, topic, pageProfile, pageId, overrides);
    if (scoring.total >= THRESHOLD) {
      // Final cleaning before saving
      currentPost = cleanPostResponse(currentPost);
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

    const scoreReason = `Score ${scoring.total} below threshold (need ≥${THRESHOLD})`;
    let scoreSuggestion = '';
    if (scoring.total >= THRESHOLD - 10) scoreSuggestion = 'The post is close! Fine‑tune these areas:\n';
    else if (scoring.total >= THRESHOLD - 20) scoreSuggestion = 'Needs moderate improvement:\n';
    else scoreSuggestion = 'Needs major rewrite:\n';
    if (scoring.breakdown.human < 70) scoreSuggestion += '- Remove AI phrases, use contractions, add personality.\n';
    if (scoring.breakdown.virality < 50) scoreSuggestion += '- Add a surprising fact, question, or statistic.\n';
    if (scoring.breakdown.hook < 50) scoreSuggestion += '- Start with a strong hook (warning, mistake, unexpected fact).\n';
    if (scoring.breakdown.readability < 70) scoreSuggestion += '- Keep sentences between 8-20 words.\n';
    if (scoring.breakdown.originality < 70) scoreSuggestion += '- Avoid clichés like "at the end of the day".\n';
    if (scoring.breakdown.pageFit < 50) scoreSuggestion += `- Make it more relevant to ${pageProfile?.audienceInterest?.join(', ') || 'your audience'}.\n`;
    if (scoring.breakdown.aiStructure > 20) scoreSuggestion += '- Avoid starting with generic words like "In", "This", "The".\n';
    if (scoring.breakdown.realismPenalty > 10) scoreSuggestion += '- Use contractions (don\'t, can\'t) and occasional slang.\n';

    if (attempt === MAX_REGENS) {
      return { pass: false, reason: scoreReason, suggestion: scoreSuggestion, lastScore: scoring.total, failures, breakdown: scoring.breakdown };
    }
    failures.push({ type: 'score', reason: scoreReason, suggestion: scoreSuggestion });
    currentPost = await adaptiveRegenerate(currentPost, scoreReason, scoreSuggestion, generateFn, scoring.breakdown, pageProfile, pageId, dna, overrides);
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
  scoreTopic,
  parsePageOverrides,
  cleanPostResponse
};
