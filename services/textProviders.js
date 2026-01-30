require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===================== GROK ===================== */
const GrokText = {
  name: 'Grok',
  generate: async (prompt) => {
    try {
      // Example Grok API call
      const res = await axios.post('https://api.grok.ai/text', {
        prompt,
        max_tokens: 300
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });
      return res.data?.text || null;
    } catch (err) {
      throw new Error(err.response?.data?.message || err.message);
    }
  }
};

/* ===================== OPENAI ===================== */
const OpenAIText = {
  name: 'OpenAI',
  generate: async (prompt) => {
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You write Facebook posts that sound fully human.' },
        { role: 'user', content: prompt }
      ]
    });
    return response.output?.[0]?.content?.[0]?.text || null;
  }
};

/* ===================== COHERE ===================== */
const CohereText = {
  name: 'Cohere',
  generate: async (prompt) => {
    const res = await axios.post('https://api.cohere.ai/generate', {
      model: 'command-xlarge',
      prompt,
      max_tokens: 300
    }, { headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` } });
    return res.data?.generations?.[0]?.text || null;
  }
};

/* ===================== CLAUDE ===================== */
const ClaudeText = {
  name: 'Claude',
  generate: async (prompt) => {
    const res = await axios.post('https://api.anthropic.com/v1/complete', {
      model: 'claude-2',
      prompt,
      max_tokens: 300
    }, { headers: { 'x-api-key': process.env.CLAUDE_API_KEY } });
    return res.data?.completion || null;
  }
};

/* ===================== AI21 ===================== */
const AI21Text = {
  name: 'AI21',
  generate: async (prompt) => {
    const res = await axios.post('https://api.ai21.com/studio/v1/j2-large/complete', {
      prompt,
      maxTokens: 300
    }, { headers: { Authorization: `Bearer ${process.env.AI21_API_KEY}` } });
    return res.data?.completions?.[0]?.data?.text || null;
  }
};

module.exports = { GrokText, OpenAIText, CohereText, ClaudeText, AI21Text };
