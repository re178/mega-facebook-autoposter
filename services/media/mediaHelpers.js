const axios = require('axios');
function cleanText(t) { return String(t||'').replace(/\s+/g,' ').trim(); }
function isSafeUrl(url) {
  const blocked = ['localhost','127.','169.254.','10.','192.168.','0.0.0.0','::1'];
  return !blocked.some(b => url.toLowerCase().includes(b));
}
async function downloadImageBuffer(url, maxMB=5) {
  if (!isSafeUrl(url)) throw new Error('Unsafe URL');
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  const buf = Buffer.from(resp.data);
  if (buf.length > maxMB*1024*1024) throw new Error('File too large');
  return buf;
}
function randomId() { return Date.now()+'-'+Math.random().toString(36).substr(2,6); }
module.exports = { cleanText, isSafeUrl, downloadImageBuffer, randomId };
