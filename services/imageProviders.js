
const OpenAI = require('openai');
const axios = require('axios');

// ===================== PROVIDERS =====================

// 1️⃣ OpenAI DALL·E
class DALLEImage {
  static name = 'DALLE';
  static dailyLimit = 50; // Free tier limit example
  static async generate(prompt) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024'
    });
    return res.data?.[0]?.url || null;
  }
}

// 2️⃣ Stability AI
class StabilityImage {
  static name = 'StabilityAI';
  static dailyLimit = 50;
  static async generate(prompt) {
    const res = await axios.post('https://api.stability.ai/v1/generation/stable-diffusion-v1-5/text-to-image', {
      text_prompts: [{ text: prompt }],
      height: 1024,
      width: 1024,
      samples: 1
    }, { headers: { Authorization: `Bearer ${process.env.STABILITY_API_KEY}` } });
    return res.data?.artifacts?.[0]?.url || null;
  }
}

// 3️⃣ Leonardo AI
class LeonardoImage {
  static name = 'Leonardo';
  static dailyLimit = 50;
  static async generate(prompt) {
    const res = await axios.post('https://cloud.leonardo.ai/api/rest/v1/generate', {
      prompt,
      width: 1024,
      height: 1024
    }, { headers: { Authorization: `Bearer ${process.env.LEONARDO_API_KEY}` } });
    return res.data?.images?.[0]?.url || null;
  }
}

// 4️⃣ Cloudflare Images AI
class CloudflareImage {
  static name = 'Cloudflare';
  static dailyLimit = 50;
  static async generate(prompt) {
    const res = await axios.post(
      'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/workers/ai-image',
      { prompt },
      { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}` } }
    );
    return res.data?.result?.url || null;
  }
}

// ===================== EXPORT =====================
module.exports = {
  DALLEImage,
  StabilityImage,
  LeonardoImage,
  CloudflareImage
};
