// mediaHelpers.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function cleanText(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

async function downloadImageBuffer(url) {
  if (!url) return null;
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
  } catch (e) { return null; }
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function randomId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 6); }

module.exports = { cleanText, downloadImageBuffer, ensureDir, randomId };
