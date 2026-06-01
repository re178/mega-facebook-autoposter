const axios = require('axios');
const OpenAI = require('openai');

/* =========================================================
   HELPERS
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

/* =========================================================
   SMART PROMPT ANALYSIS
========================================================= */

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
   1️⃣ OPENAI (UNCHANGED - SAFE)
========================================================= */

class OpenAIText {
  static get name() { return 'OpenAI'; }

  static async generate(prompt) {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const res = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: isScenePlanPrompt(prompt)
            ? 'Output ONLY valid JSON.'
            : 'You write human-like Facebook posts.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
    });

    return safeText(res.output?.[0]?.content?.[0]?.text);
  }
}

/* =========================================================
   2️⃣ GROQ (FAST FREE ENGINE)
========================================================= */

class GroqText {
  static get name() { return 'Groq'; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: isScenePlanPrompt(prompt)
              ? 'Return ONLY valid JSON.'
              : 'You are a fast assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.choices?.[0]?.message?.content);
  }
}

/* =========================================================
   3️⃣ GEMINI (GENEROUS FREE TIER)
========================================================= */

class GeminiText {
  static get name() { return 'Gemini'; }

  static async generate(prompt) {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      { timeout: 20000 }
    );

    return safeText(
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text
    );
  }
}

/* =========================================================
   4️⃣ CLOUDFLARE (KEEP - YOUR WORKING BASE)
========================================================= */

class CloudflareText {
  static get name() { return 'Cloudflare'; }

  static async generate(prompt) {
    const isPlan = isScenePlanPrompt(prompt);

    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        messages: [
          { role: 'system', content: isPlan
              ? 'Return ONLY JSON.'
              : 'Write clean Facebook posts only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: isPlan ? 800 : 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return safeText(res.data?.result?.response);
  }
}

/* =========================================================
   5️⃣ OPENROUTER (FALLBACK + FUTURE IMAGE READY)
========================================================= */

class OpenRouterText {
  static get name() { return 'OpenRouter'; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          {
            role: 'system',
            content: isScenePlanPrompt(prompt)
              ? 'Return ONLY JSON.'
              : 'You are a helpful assistant.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: isScenePlanPrompt(prompt) ? 800 : 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.choices?.[0]?.message?.content);
  }
}

/* =========================================================
   🚀 INTELLIGENT ROUTER (NEW CORE ENGINE)
========================================================= */

const providers = [
  GroqText,
  GeminiText,
  OpenRouterText,
  CloudflareText,
  OpenAIText // last resort (paid/limited)
];

async function generateSmart(prompt) {
  const analysis = analyzePrompt(prompt);

  // reorder based on prompt type
  let orderedProviders = [...providers];

  if (analysis.isFastNeeded) {
    orderedProviders.unshift(GroqText);
  }

  if (analysis.isJson) {
    orderedProviders.unshift(CloudflareText);
  }

  for (const Provider of orderedProviders) {
    const start = Date.now();

    try {
      const res = await Provider.generate(prompt);
      const time = Date.now() - start;

      if (res && res.length > 0) {
        log(Provider.name, 'SUCCESS', `${time}ms`);
        return res;
      }

      log(Provider.name, 'EMPTY RESPONSE');
    } catch (err) {
      log(Provider.name, 'FAILED', err.message);
      continue;
    }
  }

  throw new Error('All AI providers failed');
}

/* =========================================================
   EXPORTS (KEEP YOUR STRUCTURE SAFE)
========================================================= */

module.exports = {
  OpenAIText,
  GroqText,
  GeminiText,
  CloudflareText,
  OpenRouterText,
  generateSmart
};
