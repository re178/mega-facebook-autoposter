// tempManager.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomId } = require('./mediaHelpers');

const CLEANUP_MINUTES = 10;

function createTempDir() {
  const base = os.tmpdir();
  const dir = path.join(base, `cinematic_reel_${randomId()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function cleanOldTempFolders() {
  const base = os.tmpdir();
  const files = fs.readdirSync(base);
  const now = Date.now();
  for (const file of files) {
    if (file.startsWith('cinematic_reel_')) {
      const fullPath = path.join(base, file);
      try {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > CLEANUP_MINUTES * 60 * 1000) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`Cleaned old temp: ${fullPath}`);
        }
      } catch(e) {}
    }
  }
}
setInterval(cleanOldTempFolders, 60000);

module.exports = { createTempDir, cleanupTempDir };
