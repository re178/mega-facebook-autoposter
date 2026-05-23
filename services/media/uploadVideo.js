
// uploadVideo.js
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

async function uploadVideo(filePath) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath,
      { resource_type: 'video', folder: 'cinematic-reels' },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
  });
}

module.exports = { uploadVideo };
