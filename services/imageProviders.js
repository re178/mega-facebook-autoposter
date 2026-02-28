const OpenAI = require('openai');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// ===================== CLOUDINARY CONFIG =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// ===================== SAFE TIMEOUT AXIOS =====================
const safeAxios = axios.create({
  timeout: 45000
});

// ===================== SAFE CLOUDINARY UPLOAD =====================
async function uploadToCloudinary(imageInput) {
  try {
    if (!imageInput) return null;

    // URL upload
    if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
      const result = await cloudinary.uploader.upload(imageInput, {
        folder: "ai-images"
      });
      return result?.secure_url || null;
    }

    // Handle base64 (auto-detect format)
    let base64 = imageInput;

    if (!base64.startsWith("data:image")) {
      base64 = `data:image/png;base64,${base64}`;
    }

    const result = await cloudinary.uploader.upload(base64, {
      folder: "ai-images"
    });

    return result?.secure_url || null;

  } catch (err) {
    console.error("Cloudinary Upload Error:", err?.message || err);
    return null;
  }
}

// ===================== SMART KEYWORD EXTRACTION =====================
function extractSmartKeywords(text) {
  if (!text) return "business";

  const hashtags = text.match(/#\w+/g);
  if (hashtags?.length) {
    return hashtags.map(t => t.replace("#", "")).join(" ");
  }

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

// ================================================================
// ===================== PROVIDERS ================================
// ================================================================

// ===================== 1️⃣ OPENAI =====================
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
        model: "gpt-image-1",
        prompt,
        size: "1024x1024"
      });

      const base64 = res?.data?.[0]?.b64_json;
      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("DALLE Error:", err?.response?.data || err?.message);
      return null;
    }
  }
}

// ===================== 2️⃣ STABILITY (UPDATED API) =====================
class StabilityImage {
  static name = 'StabilityAI';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.STABILITY_API_KEY) return null;

      const res = await safeAxios.post(
        "https://api.stability.ai/v2beta/stable-image/generate/sd3",
        {
          prompt,
          aspect_ratio: "1:1",
          output_format: "png"
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        }
      );

      const base64 = res?.data?.image;
      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("Stability Error:", err?.response?.data || err?.message);
      return null;
    }
  }
}

// ===================== 3️⃣ LEONARDO (SAFE POLLING) =====================
class LeonardoImage {
  static name = 'Leonardo';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.LEONARDO_API_KEY) return null;

      const start = await safeAxios.post(
        "https://cloud.leonardo.ai/api/rest/v1/generations",
        {
          prompt,
          width: 1024,
          height: 1024
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.LEONARDO_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      const generationId = start?.data?.sdGenerationJob?.generationId;
      if (!generationId) return null;

      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const poll = await safeAxios.get(
          `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.LEONARDO_API_KEY}`
            }
          }
        );

        const imageUrl =
          poll?.data?.generations_by_pk?.generated_images?.[0]?.url;

        if (imageUrl) {
          return await uploadToCloudinary(imageUrl);
        }
      }

      return null;

    } catch (err) {
      console.error("Leonardo Error:", err?.response?.data || err?.message);
      return null;
    }
  }
}

// ===================== 4️⃣ CLOUDFLARE =====================
class CloudflareImage {
  static name = 'Cloudflare';
  static dailyLimit = 50;

  static async generate(prompt) {
    try {
      if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
        return null;

      const res = await safeAxios.post(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        { prompt },
        {
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      const base64 =
        res?.data?.result?.image ||
        res?.data?.result?.images?.[0] ||
        null;

      if (!base64) return null;

      return await uploadToCloudinary(base64);

    } catch (err) {
      console.error("Cloudflare Error:", err?.response?.data || err?.message);
      return null;
    }
  }
}

// ===================== 5️⃣ SMART PEXELS (LAST OPTION) =====================
class SmartPexelsImage {
  static name = 'SmartPexels';
  static dailyLimit = 1000;

  static async generate(prompt) {
    try {
      if (!process.env.PEXELS_API_KEY) return null;

      const searchQuery = extractSmartKeywords(prompt);

      const res = await safeAxios.get(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=15&orientation=portrait`,
        {
          headers: {
            Authorization: process.env.PEXELS_API_KEY
          }
        }
      );

      const photos = res?.data?.photos;
      if (!photos?.length) return null;

      const bestPhoto = photos.sort((a, b) => b.height - a.height)[0];
      const imageUrl = bestPhoto?.src?.large2x || bestPhoto?.src?.large;

      if (!imageUrl) return null;

      return await uploadToCloudinary(imageUrl);

    } catch (err) {
      console.error("SmartPexels Error:", err?.response?.data || err?.message);
      return null;
    }
  }
}

// ================================================================
// ===================== SMART ENGINE ==============================
// ================================================================

async function generateSmartImage(prompt) {
  const providers = [
    DALLEImage,
    StabilityImage,
    LeonardoImage,
    CloudflareImage,
    SmartPexelsImage // ALWAYS LAST
  ];

  for (const provider of providers) {
    try {
      const result = await provider.generate(prompt);
      if (result) return result;
    } catch (err) {
      console.error(`${provider.name} failed safely.`);
    }
  }

  return null;
}

// ===================== EXPORT =====================
module.exports = {
  DALLEImage,
  StabilityImage,
  LeonardoImage,
  CloudflareImage,
  SmartPexelsImage,
  generateSmartImage
};
