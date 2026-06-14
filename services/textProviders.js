const axios = require('axios');
const OpenAI = require('openai');

/* =========================================================
   PROVIDER STATE & CONCURRENCY CONTROL
========================================================= */

const providerConfig = {
  Groq:        { maxConcurrent: 5, cooldownMs: 60000, failureThreshold: 5, circuitBreakerMs: 300000 },
  Gemini:      { maxConcurrent: 3, cooldownMs: 60000, failureThreshold: 5, circuitBreakerMs: 300000 },
  OpenRouter:  { maxConcurrent: 2, cooldownMs: 60000, failureThreshold: 5, circuitBreakerMs: 300000 },
  Cloudflare:  { maxConcurrent: 2, cooldownMs: 60000, failureThreshold: 5, circuitBreakerMs: 300000 },
  OpenAI:      { maxConcurrent: 1, cooldownMs: 60000, failureThreshold: 5, circuitBreakerMs: 300000 }
};

const providerState = {};
for (const name of Object.keys(providerConfig)) {
  providerState[name] = {
    activeRequests: 0,
    failures: 0,
    cooldownUntil: 0
  };
}

const GLOBAL_MAX_CONCURRENT = 20;
const MAX_QUEUE_SIZE = 500;
let globalActive = 0;
const requestQueue = [];             // each item: { resolve, reject, prompt }

// Helper to run a queued request (after being taken from queue)
async function runQueuedRequest(item) {
  const start = Date.now();
  console.log(`[QUEUE] Starting request (queue length left: ${requestQueue.length}, active: ${globalActive})`);
  try {
    const result = await runGenerateSmart(item.prompt);
    console.log(`[QUEUE] Request succeeded in ${Date.now() - start}ms`);
    item.resolve(result);
  } catch (err) {
    console.error(`[QUEUE] Request failed after ${Date.now() - start}ms:`, err.message);
    item.reject(err);
  } finally {
    globalActive--;
    console.log(`[QUEUE] Request finished, active now: ${globalActive}`);
    processQueue();  // trigger next request
  }
}

// Safe queue processor – only one call active at a time via the event loop
function processQueue() {
  if (globalActive >= GLOBAL_MAX_CONCURRENT) {
    console.log(`[QUEUE] Skip processing, active ${globalActive} >= max ${GLOBAL_MAX_CONCURRENT}`);
    return;
  }
  if (requestQueue.length === 0) {
    console.log(`[QUEUE] No pending requests`);
    return;
  }

  const next = requestQueue.shift();
  globalActive++;
  console.log(`[QUEUE] Dequeued request, active now: ${globalActive}, queue left: ${requestQueue.length}`);
  // Fire and forget – runQueuedRequest handles finally and recursion
  runQueuedRequest(next);
}

// Always queue – no direct execution (fixes race condition)
async function runWithQueue(prompt) {
  if (requestQueue.length >= MAX_QUEUE_SIZE) {
    console.error(`[QUEUE] Rejected: queue full (${MAX_QUEUE_SIZE})`);
    throw new Error(`Request queue full (${MAX_QUEUE_SIZE}). Try again later.`);
  }

  console.log(`[QUEUE] Enqueuing new request, current queue size: ${requestQueue.length}`);
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, prompt });
    processQueue();  // try to start immediately if possible
  });
}

// Enhanced rate‑limit detection (fixes Bug 7)
function isRateLimitError(err) {
  if (!err) return false;
  const status = err.response?.status;
  if (status === 429) return true;
  const msg = (err.message || '').toLowerCase();
  const dataMsg = (err.response?.data?.error?.message || '').toLowerCase();
  const combined = msg + dataMsg;
  return combined.includes('rate limit') ||
         combined.includes('too many requests') ||
         combined.includes('quota exceeded') ||
         combined.includes('resource exhausted') ||
         combined.includes('insufficient_quota') ||
         combined.includes('resource_exhausted') ||
         combined.includes('model_rate_limit_exceeded');
}

function updateProviderState(providerName, success, isRateLimit = false) {
  const state = providerState[providerName];
  if (!state) return;
  if (success) {
    if (state.failures > 0) console.log(`[STATE] ${providerName} reset failure count (was ${state.failures})`);
    state.failures = 0;
    if (state.cooldownUntil > Date.now()) {
      console.log(`[STATE] ${providerName} cooldown ended early`);
      state.cooldownUntil = 0;
    }
  } else {
    state.failures++;
    console.log(`[STATE] ${providerName} failure #${state.failures} (rate-limit=${isRateLimit})`);
    if (isRateLimit && providerConfig[providerName].cooldownMs) {
      state.cooldownUntil = Date.now() + providerConfig[providerName].cooldownMs;
      console.log(`[STATE] ${providerName} rate‑limited, cooldown until ${new Date(state.cooldownUntil).toISOString()}`);
    } else if (state.failures >= providerConfig[providerName].failureThreshold) {
      state.cooldownUntil = Date.now() + providerConfig[providerName].circuitBreakerMs;
      console.log(`[STATE] ${providerName} circuit breaker open until ${new Date(state.cooldownUntil).toISOString()}`);
    }
  }
}

function isProviderAvailable(providerName) {
  const state = providerState[providerName];
  const config = providerConfig[providerName];
  if (!state || !config) return false;
  if (state.cooldownUntil > Date.now()) {
    console.log(`[STATE] ${providerName} unavailable (cooldown until ${new Date(state.cooldownUntil).toISOString()})`);
    return false;
  }
  if (state.activeRequests >= config.maxConcurrent) {
    console.log(`[STATE] ${providerName} saturated (${state.activeRequests}/${config.maxConcurrent})`);
    return false;
  }
  return true;
}

async function callProviderWithConcurrency(Provider, prompt) {
  const name = Provider.name;
  const state = providerState[name];
  if (!isProviderAvailable(name)) {
    throw new Error(`Provider ${name} unavailable (cooldown or saturated)`);
  }
  state.activeRequests++;
  console.log(`[CONCURRENCY] ${name} active requests: ${state.activeRequests}`);
  const start = Date.now();
  try {
    const result = await Provider.generate(prompt);
    const duration = Date.now() - start;
    console.log(`[PROVIDER] ${name} succeeded in ${duration}ms, response length: ${result?.length || 0}`);
    updateProviderState(name, true);
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    const isRateLimit = isRateLimitError(err);
    console.error(`[PROVIDER] ${name} failed after ${duration}ms:`, err.message);
    updateProviderState(name, false, isRateLimit);
    throw err;
  } finally {
    state.activeRequests--;
    console.log(`[CONCURRENCY] ${name} active requests now: ${state.activeRequests}`);
  }
}

/* =========================================================
   ORIGINAL HELPERS (UNCHANGED)
========================================================= */

function safeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim();
}

function isScenePlanPrompt(prompt) {
  return prompt.includes('JSON scene plan') ||
    prompt.includes('scene plan') ||
    prompt.includes('Return only JSON') ||
    prompt.includes('"scenes":');
}

function log(provider, status, extra = '') {
  console.log(`[AI ROUTER] ${provider} -> ${status} ${extra}`);
}

function analyzePrompt(prompt) {
  const lower = prompt.toLowerCase();
  return {
    isJson: isScenePlanPrompt(prompt),
    isLong: prompt.length > 800,
    isCreative: lower.includes('story') || lower.includes('post'),
    isFastNeeded: lower.includes('quick') || lower.includes('fast'),
  };
}

/* =========================================================
   PROVIDER CLASSES (UPDATED INTERNALLY)
========================================================= */

class OpenAIText {
  static get name() { return 'OpenAI'; }
  static async generate(prompt) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: isScenePlanPrompt(prompt) ? 'Output ONLY valid JSON.' : 'You write human-like Facebook posts.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
    });
    // FIX BUG 1: correct OpenAI response extraction
    const text = res.output_text || res.output?.[0]?.content?.[0]?.text || '';
    if (!text) {
      console.warn('[OpenAI] Empty response – falling back to safeText');
    }
    return safeText(text);
  }
}

class GroqText {
  static get name() { return 'Groq'; }
  static async generate(prompt) {
    // FIX BUG 2: use more stable / higher quality model
    const model = 'llama-3.3-70b-versatile';
    console.log(`[Groq] Using model: ${model}`);
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: isScenePlanPrompt(prompt) ? 'Return ONLY valid JSON.' : 'You are a fast assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    return safeText(res.data?.choices?.[0]?.message?.content);
  }
}

class GeminiText {
  static get name() { return 'Gemini'; }
  static async generate(prompt) {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 20000 }
    );
    // FIX BUG 3: explicit empty response check
    if (!res.data?.candidates?.length) {
      throw new Error('Gemini returned empty response (no candidates)');
    }
    const text = res.data.candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned empty text candidate');
    }
    return safeText(text);
  }
}

class CloudflareText {
  static get name() { return 'Cloudflare'; }
  static async generate(prompt) {
    const isPlan = isScenePlanPrompt(prompt);
    // FIX BUG 4: use stable model name
    const model = '@cf/meta/llama-3.1-8b-instruct';
    console.log(`[Cloudflare] Using model: ${model}`);
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        messages: [
          { role: 'system', content: isPlan ? 'Return ONLY JSON.' : 'Write clean Facebook posts only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isPlan ? 800 : 200
      },
      {
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );
    return safeText(res.data?.result?.response);
  }
}

class OpenRouterText {
  static get name() { return 'OpenRouter'; }
  static async generate(prompt) {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: isScenePlanPrompt(prompt) ? 'Return ONLY JSON.' : 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    return safeText(res.data?.choices?.[0]?.message?.content);
  }
}

/* =========================================================
   ROUTER (ORDERING LOGIC FIXED)
========================================================= */

const allProviders = [
  GroqText,
  GeminiText,
  OpenRouterText,
  CloudflareText,
  OpenAIText
];

function getOrderedProviders(prompt) {
  const analysis = analyzePrompt(prompt);
  // FIX BUG 6: clear, duplicate-free ordering
  let ordered = [...allProviders];
  
  // Remove Groq temporarily if we want to reorder it to front
  if (analysis.isFastNeeded) {
    ordered = ordered.filter(p => p.name !== GroqText.name);
    ordered.unshift(GroqText);
  }
  if (analysis.isJson) {
    ordered = ordered.filter(p => p.name !== CloudflareText.name);
    ordered.unshift(CloudflareText);
  }
  
  // Final dedupe (safe, though our logic already avoids duplicates)
  const unique = [];
  const seen = new Set();
  for (const p of ordered) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      unique.push(p);
    }
  }
  console.log(`[ROUTER] Ordered providers: ${unique.map(p => p.name).join(' → ')}`);
  return unique;
}

async function runGenerateSmart(prompt) {
  const orderedProviders = getOrderedProviders(prompt);
  for (const Provider of orderedProviders) {
    try {
      console.log(`[ROUTER] Trying provider: ${Provider.name}`);
      const result = await callProviderWithConcurrency(Provider, prompt);
      if (result && result.length > 0) {
        log(Provider.name, 'SUCCESS', `(length ${result.length})`);
        return result;
      }
      log(Provider.name, 'EMPTY RESPONSE');
    } catch (err) {
      log(Provider.name, 'FAILED', err.message);
    }
  }
  console.error('[ROUTER] All providers exhausted');
  throw new Error('All AI providers failed');
}

/* =========================================================
   PUBLIC API (IDENTICAL SIGNATURE)
========================================================= */

async function generateSmart(prompt) {
  console.log(`[PUBLIC] generateSmart called, prompt length: ${prompt.length}`);
  return runWithQueue(prompt);
}

module.exports = {
  OpenAIText,
  GroqText,
  GeminiText,
  CloudflareText,
  OpenRouterText,
  generateSmart
};
