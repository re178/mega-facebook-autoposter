const axios = require('axios');
const OpenAI = require('openai');

/* =========================================================
   DEBUG LOGGER (Step 1)
========================================================= */
function logProviderDebug(provider, data) {
  // WARNING: Do NOT log API keys or tokens. Data is for diagnostics only.
  console.log(`
=================================================
PROVIDER DEBUG: ${provider}
=================================================
${JSON.stringify(data, null, 2)}
=================================================
`);
}

/* =========================================================
   ENVIRONMENT VERIFICATION (Step 4)
========================================================= */
function verifyEnvironment() {
  console.log('===== PROVIDER CONFIG =====');
  const envStatus = {
    OPENAI: !!process.env.OPENAI_API_KEY,
    OPENAI_LEN: process.env.OPENAI_API_KEY?.length,
    GROQ: !!process.env.GROQ_API_KEY,
    GROQ_LEN: process.env.GROQ_API_KEY?.length,
    GEMINI: !!process.env.GEMINI_API_KEY,
    GEMINI_LEN: process.env.GEMINI_API_KEY?.length,
    OPENROUTER: !!process.env.OPENROUTER_API_KEY,
    OPENROUTER_LEN: process.env.OPENROUTER_API_KEY?.length,
    CLOUDFLARE_TOKEN: !!process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT: process.env.CLOUDFLARE_ACCOUNT_ID
  };
  console.table(envStatus);
}

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

// Health tracking (Step 5)
const providerHealth = {
  Groq: {},
  Gemini: {},
  OpenRouter: {},
  Cloudflare: {},
  OpenAI: {}
};

const GLOBAL_MAX_CONCURRENT = 20;
const MAX_QUEUE_SIZE = 500;
let globalActive = 0;
const requestQueue = []; // each item: { resolve, reject, prompt }

// Helper to run a queued request (after being taken from queue)
async function runQueuedRequest(item) {
  const start = Date.now();
  console.log(`[QUEUE] Starting request (queue left: ${requestQueue.length}, active: ${globalActive})`);
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
    processQueue(); // trigger next request
  }
}

// Fixed queue processor (no race condition)
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
  console.log(`[QUEUE] Dequeued request, active: ${globalActive}, queue left: ${requestQueue.length}`);
  // Fire and forget – runQueuedRequest handles finally and recursion
  runQueuedRequest(next);
}

async function runWithQueue(prompt) {
  if (requestQueue.length >= MAX_QUEUE_SIZE) {
    console.error(`[QUEUE] Rejected: queue full (${MAX_QUEUE_SIZE})`);
    throw new Error(`Request queue full (${MAX_QUEUE_SIZE}). Try again later.`);
  }

  console.log(`[QUEUE] Enqueuing request, queue size: ${requestQueue.length}`);
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, prompt });
    processQueue();
  });
}

// Rate‑limit detection
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

  // Update health record (Step 5)
  providerHealth[providerName] = {
    lastAttempt: new Date().toISOString(),
    lastSuccess: success ? new Date().toISOString() : (providerHealth[providerName]?.lastSuccess || null),
    lastFailure: !success ? new Date().toISOString() : (providerHealth[providerName]?.lastFailure || null),
    failures: state.failures,
    activeRequests: state.activeRequests
  };
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
   ORIGINAL HELPERS
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
   PROVIDER CLASSES (with full logging, Steps 2 & 3)
========================================================= */

class OpenAIText {
  static get name() { return 'OpenAI'; }
  static async generate(prompt) {
    logProviderDebug('OpenAI Request', {
      endpoint: 'https://api.openai.com/v1/responses',
      keyExists: !!process.env.OPENAI_API_KEY,
      keyLength: process.env.OPENAI_API_KEY?.length,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: isScenePlanPrompt(prompt) ? 'Output ONLY valid JSON.' : 'You write human-like Facebook posts.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
      });
      const text = res.output_text || res.output?.[0]?.content?.[0]?.text || '';
      if (!text) {
        console.warn('[OpenAI] Empty response – falling back to safeText');
      }
      return safeText(text);
    } catch (err) {
      logProviderDebug('OpenAI Error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        headers: err.response?.headers,
        message: err.message
      });
      throw err;
    }
  }
}

class GroqText {
  static get name() { return 'Groq'; }
  static async generate(prompt) {
    const model = 'llama-3.3-70b-versatile';
    logProviderDebug('Groq Request', {
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model,
      keyExists: !!process.env.GROQ_API_KEY,
      keyLength: process.env.GROQ_API_KEY?.length,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    try {
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
    } catch (err) {
      logProviderDebug('Groq Error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        headers: err.response?.headers,
        message: err.message
      });
      throw err;
    }
  }
}

class GeminiText {
  static get name() { return 'Gemini'; }
  static async generate(prompt) {
    const model = 'gemini-2.0-flash';  // Fixed from 1.5 to 2.0 (Step 8)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    logProviderDebug('Gemini Request', {
      endpoint,
      keyExists: !!process.env.GEMINI_API_KEY,
      keyLength: process.env.GEMINI_API_KEY?.length,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    try {
      const res = await axios.post(
        endpoint,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 20000 }
      );
      if (!res.data?.candidates?.length) {
        throw new Error('Gemini returned empty response (no candidates)');
      }
      const text = res.data.candidates[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini returned empty text candidate');
      }
      return safeText(text);
    } catch (err) {
      logProviderDebug('Gemini Error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        headers: err.response?.headers,
        message: err.message
      });
      throw err;
    }
  }
}

class CloudflareText {
  static get name() { return 'Cloudflare'; }
  static async generate(prompt) {
    const isPlan = isScenePlanPrompt(prompt);
    // Updated to fp8 variant (Step 9)
    const model = '@cf/meta/llama-3.1-8b-instruct-fp8';
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
    logProviderDebug('Cloudflare Request', {
      endpoint,
      model,
      tokenExists: !!process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    try {
      const res = await axios.post(
        endpoint,
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
    } catch (err) {
      logProviderDebug('Cloudflare Error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        headers: err.response?.headers,
        message: err.message
      });
      throw err;
    }
  }
}

class OpenRouterText {
  static get name() { return 'OpenRouter'; }
  static async generate(prompt) {
    logProviderDebug('OpenRouter Request', {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      keyExists: !!process.env.OPENROUTER_API_KEY,
      keyLength: process.env.OPENROUTER_API_KEY?.length,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    try {
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
    } catch (err) {
      logProviderDebug('OpenRouter Error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        headers: err.response?.headers,
        message: err.message
      });
      throw err;
    }
  }
}

/* =========================================================
   ROUTER (ORDERING LOGIC)
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
  let ordered = [...allProviders];
  if (analysis.isFastNeeded) {
    ordered = ordered.filter(p => p.name !== GroqText.name);
    ordered.unshift(GroqText);
  }
  if (analysis.isJson) {
    ordered = ordered.filter(p => p.name !== CloudflareText.name);
    ordered.unshift(CloudflareText);
  }
  // Deduplicate
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
   PUBLIC API
========================================================= */
async function generateSmart(prompt) {
  console.log(`[PUBLIC] generateSmart called, prompt length: ${prompt.length}`);
  return runWithQueue(prompt);
}

/* =========================================================
   HEALTH MONITORING (Step 5) – with safe interval cleanup
========================================================= */
function printHealth() {
  console.log('\n--- Provider Health (last known) ---');
  console.table(providerHealth);
}

// Store interval ID to allow cleanup (avoids memory leaks on hot reload)
let healthIntervalId = null;
function startHealthMonitoring(intervalMs = 60000) {
  if (healthIntervalId) clearInterval(healthIntervalId);
  healthIntervalId = setInterval(printHealth, intervalMs);
  // Ensure interval doesn't keep process alive if nothing else is running (Node.js event loop)
  healthIntervalId.unref();
}
function stopHealthMonitoring() {
  if (healthIntervalId) {
    clearInterval(healthIntervalId);
    healthIntervalId = null;
  }
}

/* =========================================================
   PROVIDER TEST FUNCTION (Step 10 – can be used in route)
========================================================= */
async function testAllProviders() {
  const testPrompt = 'Reply with exactly "OK" and nothing else.';
  const results = {};
  const providers = [
    { name: 'OpenAI', class: OpenAIText },
    { name: 'Groq', class: GroqText },
    { name: 'Gemini', class: GeminiText },
    { name: 'OpenRouter', class: OpenRouterText },
    { name: 'Cloudflare', class: CloudflareText }
  ];
  for (const provider of providers) {
    try {
      const result = await provider.class.generate(testPrompt);
      results[provider.name] = (result === 'OK') ? 'PASS' : `FAIL (unexpected: "${result}")`;
    } catch (err) {
      results[provider.name] = `FAIL (${err.response?.status || err.message})`;
    }
  }
  console.table(results);
  return results;
}

/* =========================================================
   INITIALIZATION (Runs when module loads)
========================================================= */
verifyEnvironment();
startHealthMonitoring();  // starts logging every minute

// Optional: allow graceful shutdown (for testing environments)
process.on('SIGINT', () => {
  console.log('Stopping health monitoring...');
  stopHealthMonitoring();
  process.exit();
});

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  OpenAIText,
  GroqText,
  GeminiText,
  CloudflareText,
  OpenRouterText,
  generateSmart,
  testAllProviders,       // expose for manual/route testing
  stopHealthMonitoring,   // in case you need to stop it later
  providerHealth          // optionally inspect current health
};
