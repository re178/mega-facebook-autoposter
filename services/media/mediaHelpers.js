// mediaHelpers.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function cleanText(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

function isSafeUrl(url) {
  if (!url) return false;
  const blocked = ['localhost', '127.', '169.254.', '10.', '192.168.', '0.0.0.0', '::1', '[::1]'];
  const lowerUrl = url.toLowerCase();
  return !blocked.some(b => lowerUrl.includes(b));
}

async function downloadImageBuffer(url, maxSizeMB = 5) {
  if (!isSafeUrl(url)) throw new Error('Unsafe URL blocked');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  const buffer = Buffer.from(response.data);
  if (buffer.length > maxSizeMB * 1024 * 1024) {
    throw new Error(`Image exceeds ${maxSizeMB}MB`);
  }
  return buffer;
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function randomId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 6); }

module.exports = { cleanText, isSafeUrl, downloadImageBuffer, ensureDir, randomId };
