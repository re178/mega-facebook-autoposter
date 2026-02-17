const OpenAI = require('openai');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// ===================== CLOUDINARY CONFIG =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// Upload helper
async function uploadToCloudinary(imageUrlOrBase64) {
  try {
    // If it's already a URL, upload directly
    if (imageUrlOrBase64.startsWith('http')) {
      const result = await cloudinary.uploader.upload(imageUrlOrBase64, {
        folder: "ai-images"
      });
      return result.secure_url;
    }

    // If it's base64
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${imageUrlOrBase64}`,
      { folder: "ai-images" }
    );

    return result.secure_url;

  } catch (err) {
    console.error("Cloudinary Upload Error:", err.message);
    return null;
  }
}

// ===================== PROVIDERS =====================

// 1️⃣ OpenAI DALL·E
class DALLEImage {
  static name = 'DALLE';
  static dailyLimit = 50;

  static async generate(prompt) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024'
    });

    const imageUrl = res.data?.[0]?.url;
    if (!imageUrl) return null;

    return await uploadToCloudinary(imageUrl);
  }
}

// 2️⃣ Stability AI
class StabilityImage {
  static name = 'StabilityAI';
  static dailyLimit = 50;

  static async generate(prompt) {
    const res = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-v1-5/text-to-image',
      {
        text_prompts: [{ text: prompt }],
        height: 1024,
        width: 1024,
        samples: 1
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          Accept: "application/json"
        }
      }
    );

    const base64 = res.data?.artifacts?.[0]?.base64;
    if (!base64) return null;

    return await uploadToCloudinary(base64);
  }
}

// 3️⃣ Leonardo AI
class LeonardoImage {
  static name = 'Leonardo';
  static dailyLimit = 50;

  static async generate(prompt) {
    const res = await axios.post(
      'https://cloud.leonardo.ai/api/rest/v1/generate',
      {
        prompt,
        width: 1024,
        height: 1024
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LEONARDO_API_KEY}`
        }
      }
    );

    const imageUrl = res.data?.images?.[0]?.url;
    if (!imageUrl) return null;

    return await uploadToCloudinary(imageUrl);
  }
}

// 4️⃣ Cloudflare AI
class CloudflareImage {
  static name = 'Cloudflare';
  static dailyLimit = 50;

  static async generate(prompt) {
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      { prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`
        }
      }
    );

    const base64 = res.data?.result?.image;
    if (!base64) return null;

    return await uploadToCloudinary(base64);
  }
}

// ===================== EXPORT =====================
module.exports = {
  DALLEImage,
  StabilityImage,
  LeonardoImage,
  CloudflareImage
};
