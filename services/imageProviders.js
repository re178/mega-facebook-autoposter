require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===================== STABILITY AI ===================== */
const StabilityImage = {
  name: 'StabilityAI',
  generate: async (prompt) => {
    const res = await axios.post('https://api.stability.ai/v1/generate', {
      prompt,
      width: 1024,
      height: 1024
    }, { headers: { Authorization: `Bearer ${process.env.STABILITY_API_KEY}` } });
    return res.data?.artifacts?.[0]?.url || null;
  }
};

/* ===================== DALLE ===================== */
const DALLEImage = {
  name: 'DALLE',
  generate: async (prompt) => {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024'
    });
    return response.data?.[0]?.url || null;
  }
};

/* ===================== LEONARDO ===================== */
const LeonardoImage = {
  name: 'Leonardo',
  generate: async (prompt) => {
    const res = await axios.post('https://api.leonardo.ai/generate', {
      prompt,
      width: 1024,
      height: 1024
    }, { headers: { Authorization: `Bearer ${process.env.LEONARDO_API_KEY}` } });
    return res.data?.images?.[0]?.url || null;
  }
};

module.exports = { StabilityImage, DALLEImage, LeonardoImage };
