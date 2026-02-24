const axios = require('axios');
const OpenAI = require('openai');

/* =========================================================
   HELPERS
========================================================= */

function safeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim();
}

/* =========================================================
   1️⃣ OpenAI
========================================================= */

class OpenAIText {
  static get name() { return 'OpenAI'; }
  static get dailyLimit() { return 1000; }

  static async generate(prompt) {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const res = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You write human-like Facebook posts.' },
        { role: 'user', content: prompt }
      ]
    });

    return safeText(res.output?.[0]?.content?.[0]?.text);
  }
}

/* =========================================================
   2️⃣ Cohere
========================================================= */

class CohereText {
  static get name() { return 'Cohere'; }
  static get dailyLimit() { return 500; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.cohere.ai/generate',
      {
        model: 'command',
        prompt,
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.generations?.[0]?.text);
  }
}

/* =========================================================
   3️⃣ Claude 
========================================================= */

class ClaudeText {
  static get name() { return 'Claude'; }
  static get dailyLimit() { return 1000; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.anthropic.com/v1/complete',
      {
        model: 'claude-v1',
        prompt,
        max_tokens_to_sample: 200
      },
      {
        headers: {
          'X-API-Key': process.env.CLAUDE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.completion);
  }
}

/* =========================================================
   4️⃣ AI21 (will fail unless key is valid)
========================================================= */

class AI21Text {
  static get name() { return 'AI21'; }
  static get dailyLimit() { return 500; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.ai21.com/studio/v1/j1-large/complete',
      {
        prompt,
        maxTokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI21_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.completions?.[0]?.data?.text);
  }
}

/* =========================================================
   5️⃣ Grok (xAI – optional)
========================================================= */

class GrokText {
  static get name() { return 'Grok'; }
  static get dailyLimit() { return 1000; }

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.grok.ai/v1/generate',
      { prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROK_API_KEY}`
        },
        timeout: 15000
      }
    );

    return safeText(res.data?.text);
  }
}

/* =========================================================
   6️⃣ Cloudflare 
========================================================= */

class CloudflareText {
  static get name() { return 'Cloudflare'; }
  static get dailyLimit() { return 500; }

  static async generate(prompt) {
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        messages: [
          {
  role: 'system',
  content: `
You generate Facebook posts.

Strictly follow all formatting rules in the user prompt.
Never add emojis.
Never add hashtags.
Never use bullet points or lists.
Never explain anything.
Return only the final post text.
`
},
          { role: 'user', content: prompt }
        ]
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
   7️⃣ AI HORDE
================================================== */

class AIHordeText {
  static get name() { return 'AI Horde'; }
  static get dailyLimit() { return 999999; } // community-based

  static async generate(prompt) {
    // Submit job
    const submit = await axios.post(
      'https://aihorde.net/api/v2/generate/text/async',
      {
        prompt,
        params: {
          max_length: 220,
          temperature: 0.8,
          top_p: 0.95
        },
        models: ['*']
      },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.AI_HORDE_API_KEY || '0000000000'
        },
        timeout: 20000
      }
    );

    const id = submit.data?.id;
    if (!id) throw new Error('AI Horde did not return job id');

    // Poll results
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const poll = await axios.get(
        `https://aihorde.net/api/v2/generate/text/status/${id}`,
        { timeout: 15000 }
      );

      if (poll.data?.done && poll.data?.generations?.length) {
        return safeText(poll.data.generations[0].text);
      }
    }

    throw new Error('AI Horde generation timeout');
  }
}

/* =========================================================
   EXPORTS (DO NOT CHANGE)
========================================================= */

module.exports = {
  CloudflareText,
  GrokText,
  OpenAIText,
  CohereText,
  ClaudeText,
  AIHordeText,
  AI21Text
};
