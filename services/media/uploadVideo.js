// uploadVideo.js
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

async function uploadVideo(filePath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(filePath,
          { resource_type: 'auto', folder: 'cinematic-reels' },
          (err, res) => err ? reject(err) : resolve(res)
        );
      });
      return result.secure_url;
    } catch (err) {
      console.error(`Upload attempt ${i+1} failed:`, err.message);
      if (i === retries-1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i+1)));
    }
  }
}

module.exports = { uploadVideo };
