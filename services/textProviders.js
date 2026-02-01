
const OpenAI = require('openai');
const axios = require('axios');

// ===================== PROVIDERS =====================

// 1️⃣ OpenAI
class OpenAIText {
  static name = 'OpenAI';
  static dailyLimit = 1000; // adjust per free tier
  static async generate(prompt) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You write human-like Facebook posts.' },
        { role: 'user', content: prompt }
      ]
    });
    return response.output?.[0]?.content?.[0]?.text || '';
  }
}

// 2️⃣ Cohere
class CohereText {
  static name = 'Cohere';
  static dailyLimit = 500;
  static async generate(prompt) {
    const url = 'https://api.cohere.ai/generate';
    const res = await axios.post(url, {
      model: 'command-xlarge-nightly',
      prompt,
      max_tokens: 200
    }, { headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` } });
    return res.data?.generations?.[0]?.text || '';
  }
}

// 3️⃣ Claude
class ClaudeText {
  static name = 'Claude';
  static dailyLimit = 1000;
  static async generate(prompt) {
    const res = await axios.post('https://api.anthropic.com/v1/complete', {
      model: 'claude-v1',
      prompt,
      max_tokens_to_sample: 200
    }, { headers: { 'X-API-Key': process.env.CLAUDE_API_KEY } });
    return res.data?.completion || '';
  }
}

// 4️⃣ AI21
class AI21Text {
  static name = 'AI21';
  static dailyLimit = 500;
  static async generate(prompt) {
    const res = await axios.post('https://api.ai21.com/studio/v1/j1-large/complete', {
      prompt,
      maxTokens: 200
    }, { headers: { Authorization: `Bearer ${process.env.AI21_API_KEY}` } });
    return res.data?.completions?.[0]?.data?.text || '';
  }
}

// 5️⃣ Grok (xAI)
class GrokText {
  static name = 'Grok';
  static dailyLimit = 1000;
  static async generate(prompt) {
    const res = await axios.post('https://api.grok.ai/v1/generate', { prompt }, {
      headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}` }
    });
    return res.data?.text || '';
  }
}

// 6️⃣ Cloudflare
class CloudflareText {
  static name = 'Cloudflare';
  static dailyLimit = 500;
  static async generate(prompt) {
    const res = await axios.post('https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/workers/ai-text', {
      prompt
    }, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}` } });
    return res.data?.result?.text || '';
  }
}

// ===================== EXPORT =====================
module.exports = {
  OpenAIText,
  CohereText,
  ClaudeText,
  AI21Text,
  GrokText,
  CloudflareText
};
