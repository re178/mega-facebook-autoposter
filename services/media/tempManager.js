// tempManager.js
const fs = require('fs');
const path = require('path');
const { randomId } = require('./mediaHelpers');

function createTempDir(base = __dirname) {
  const dir = path.join(base, 'temp_' + randomId());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { createTempDir, cleanupTempDir };

