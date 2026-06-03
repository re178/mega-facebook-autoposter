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
const MAX_QUEUE_SIZE = 500;         // prevent memory overflow
let globalActive = 0;
const requestQueue = [];             // each item: { resolve, reject, prompt }

// Helper to run the next queued request, safely decrementing globalActive
async function runQueuedRequest(item) {
  try {
    const result = await runGenerateSmart(item.prompt);
    item.resolve(result);
  } catch (err) {
    item.reject(err);
  } finally {
    globalActive--;
    processQueue();                  // after finishing, try to start next
  }
}

function processQueue() {
  if (globalActive >= GLOBAL_MAX_CONCURRENT) return;
  if (requestQueue.length === 0) return;

  const next = requestQueue.shift();
  globalActive++;
  runQueuedRequest(next);            // don't await – fire and let finally handle
}

async function runWithQueue(prompt) {
  if (globalActive < GLOBAL_MAX_CONCURRENT) {
    globalActive++;
    try {
      return await runGenerateSmart(prompt);
    } finally {
      globalActive--;
      processQueue();
    }
  } else {
    if (requestQueue.length >= MAX_QUEUE_SIZE) {
      throw new Error(`Request queue full (${MAX_QUEUE_SIZE}). Try again later.`);
    }
    return new Promise((resolve, reject) => {
      requestQueue.push({ resolve, reject, prompt });
    });
  }
}

// Helper to determine if an error is rate‑limit related
function isRateLimitError(err) {
  if (!err) return false;
  const status = err.response?.status;
  if (status === 429) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('rate limit') ||
         msg.includes('too many requests') ||
         msg.includes('quota exceeded') ||
         msg.includes('resource exhausted');
}

function updateProviderState(providerName, success, isRateLimit = false) {
  const state = providerState[providerName];
  if (!state) return;
  if (success) {
    state.failures = 0;
    if (state.cooldownUntil > Date.now()) state.cooldownUntil = 0;
  } else {
    state.failures++;
    if (isRateLimit && providerConfig[providerName].cooldownMs) {
      state.cooldownUntil = Date.now() + providerConfig[providerName].cooldownMs;
    } else if (state.failures >= providerConfig[providerName].failureThreshold) {
      state.cooldownUntil = Date.now() + providerConfig[providerName].circuitBreakerMs;
    }
  }
}

function isProviderAvailable(providerName) {
  const state = providerState[providerName];
  const config = providerConfig[providerName];
  if (!state || !config) return false;
  if (state.cooldownUntil > Date.now()) return false;
  if (state.activeRequests >= config.maxConcurrent) return false;
  return true;
}

async function callProviderWithConcurrency(Provider, prompt) {
  const name = Provider.name;
  const state = providerState[name];
  if (!isProviderAvailable(name)) {
    throw new Error(`Provider ${name} unavailable (cooldown or saturated)`);
  }
  state.activeRequests++;
  try {
    const result = await Provider.generate(prompt);
    updateProviderState(name, true);
    return result;
  } catch (err) {
    const isRateLimit = isRateLimitError(err);
    updateProviderState(name, false, isRateLimit);
    throw err;
  } finally {
    state.activeRequests--;
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
   PROVIDER CLASSES (IDENTICAL TO ORIGINAL)
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
    return safeText(res.output?.[0]?.content?.[0]?.text);
  }
}

class GroqText {
  static get name() { return 'Groq'; }
  static async generate(prompt) {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 20000 }
    );
    return safeText(res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
  }
}

class CloudflareText {
  static get name() { return 'Cloudflare'; }
  static async generate(prompt) {
    const isPlan = isScenePlanPrompt(prompt);
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
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
   ROUTER (ORDERING LOGIC UNCHANGED)
========================================================= */

const providers = [
  GroqText,
  GeminiText,
  OpenRouterText,
  CloudflareText,
  OpenAIText
];

function getOrderedProviders(prompt) {
  const analysis = analyzePrompt(prompt);
  let ordered = [...providers];
  if (analysis.isFastNeeded) ordered.unshift(GroqText);
  if (analysis.isJson) ordered.unshift(CloudflareText);
  return [...new Map(ordered.map(p => [p.name, p])).values()];
}

async function runGenerateSmart(prompt) {
  const orderedProviders = getOrderedProviders(prompt);
  for (const Provider of orderedProviders) {
    try {
      const result = await callProviderWithConcurrency(Provider, prompt);
      if (result && result.length > 0) {
        log(Provider.name, 'SUCCESS');
        return result;
      }
      log(Provider.name, 'EMPTY RESPONSE');
    } catch (err) {
      log(Provider.name, 'FAILED', err.message);
    }
  }
  throw new Error('All AI providers failed');
}

/* =========================================================
   PUBLIC API (IDENTICAL SIGNATURE)
========================================================= */

async function generateSmart(prompt) {
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
