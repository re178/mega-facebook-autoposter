const OpenAI = require('openai');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// ===================== CLOUDINARY CONFIG =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// ===================== UPLOAD HELPER =====================
async function uploadToCloudinary(imageUrlOrBase64) {
  try {
    if (!imageUrlOrBase64) return null;

    // If URL
    if (imageUrlOrBase64.startsWith('http')) {
      const result = await cloudinary.uploader.upload(imageUrlOrBase64, {
        folder: "ai-images"
      });
      return result.secure_url;
    }

    // Clean base64 if it contains header
    const cleanBase64 = imageUrlOrBase64.replace(/^data:image\/\w+;base64,/, '');

    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${cleanBase64}`,
      { folder: "ai-images" }
    );

    return result.secure_url;

  } catch (err) {
    console.error("Cloudinary Upload Error:", err.message);
    return null;
  }
}

// ===================== SMART KEYWORD EXTRACTION =====================
function extractSmartKeywords(text) {
  if (!text) return "business";

  // 1️⃣ Use hashtags first
  const hashtags = text.match(/#\w+/g);
  if (hashtags && hashtags.length > 0) {
    return hashtags.map(tag => tag.replace("#", "")).join(" ");
  }

  // 2️⃣ Clean punctuation
  const cleaned = text
    .replace(/[^\w\s]/gi, '')
    .toLowerCase();

  const stopWords = [
    "the","and","is","in","at","of","a","to","for",
    "on","with","this","that","it","as","an","be",
    "are","was","were","by","from","about","into",
    "after","before","over","under","again"
  ];

  const words = cleaned
    .split(" ")
    .filter(w => w.length > 3 && !stopWords.includes(w));

  return words.slice(0, 6).join(" ") || "business";
}

// ===================== PROVIDERS =====================

// 1️⃣ OpenAI DALL·E
class DALLEImage {
  static name = 'DALLE';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.OPENAI_API_KEY) return null;

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const res = await client.images.generate({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024'
      });

      const base64 = res.data?.[0]?.b64_json;
      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("DALLE Error:", err.message);
      return null;
    }
  }
}

// 2️⃣ Stability AI
class StabilityImage {
  static name = 'StabilityAI';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.STABILITY_API_KEY) return null;

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
          },
          timeout: 20000
        }
      );

      const base64 = res.data?.artifacts?.[0]?.base64;
      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("Stability Error:", err.response?.data || err.message);
      return null;
    }
  }
}

// 3️⃣ Leonardo AI
class LeonardoImage {
  static name = 'Leonardo';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.LEONARDO_API_KEY) return null;

      const res = await axios.post(
        'https://cloud.leonardo.ai/api/rest/v1/generations',
        {
          prompt,
          width: 1024,
          height: 1024
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.LEONARDO_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 20000
        }
      );

      const imageUrl = res.data?.generations_by_pk?.generated_images?.[0]?.url;
      if (!imageUrl) return null;

      return await uploadToCloudinary(imageUrl);

    } catch (err) {
      console.error("Leonardo Error:", err.response?.data || err.message);
      return null;
    }
  }
}

// 4️⃣ Cloudflare AI
class CloudflareImage {
  static name = 'Cloudflare';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
        return null;

      const res = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        { prompt },
        {
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          timeout: 20000
        }
      );

      const base64 =
  res.data?.result?.image ||
  res.data?.result?.images?.[0] ||
  null;
      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("Cloudflare Error:", err.response?.data || err.message);
      return null;
    }
  }
}

// 5️⃣ Smart Pexels (Vertical + Hashtag Intelligent)
class SmartPexelsImage {
  static name = 'SmartPexels';
  static dailyLimit = 1000;

  static async generate(prompt) {
    try {
      if (!process.env.PEXELS_API_KEY) return null;

      const searchQuery = extractSmartKeywords(prompt);

      const res = await axios.get(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=15&orientation=portrait`,
        {
          headers: {
            Authorization: process.env.PEXELS_API_KEY
          },
          timeout: 15000
        }
      );

      const photos = res.data?.photos;
      if (!photos || photos.length === 0) return null;

      // Pick most vertical image
      const bestPhoto = photos.sort((a, b) => b.height - a.height)[0];

      const imageUrl = bestPhoto?.src?.large2x || bestPhoto?.src?.large;
      if (!imageUrl) return null;

      return await uploadToCloudinary(imageUrl);

    } catch (err) {
      console.error("SmartPexels Error:", err.response?.data || err.message);
      return null;
    }
  }
}

// ===================== EXPORT =====================
module.exports = {
  DALLEImage,
  StabilityImage,
  LeonardoImage,
  CloudflareImage,
  SmartPexelsImage
};
