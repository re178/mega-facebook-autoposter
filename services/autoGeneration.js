const cron = require('node-cron');
const Page = require('../models/Page');
const AiTopic = require('../models/AiTopic');
const { ensureActiveTopicsForPage } = require('../services/aiSchedulerService');

// ----- Configuration -----
const COOLDOWN_MINUTES = 5;          // How often to actually process a page
const MIN_ACTIVE_TOPICS = 3;         // Must match your aiSchedulerService.js
const MAX_ACTIVE_TOPICS = 6;         // Must match your aiSchedulerService.js

// ----- Per‑page cooldown tracker -----
const lastRun = new Map();

// ----- Helper to check if enough time has passed -----
function shouldRun(pageId) {
  const now = Date.now();
  const last = lastRun.get(pageId) || 0;
  const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
  return (now - last) >= cooldownMs;
}

// ----- Cron job (every 60 seconds) -----
cron.schedule('* * * * *', async () => {
  console.log('[AUTO-GEN] Checking pages with auto-generation enabled...');

  try {
    const pages = await Page.find({ autoGenerationEnabled: true });

    console.log(`[AUTO-GEN] Found ${pages.length} pages with auto-generation ON`);

    for (const page of pages) {
      const pageId = page.pageId;

      // 1. Cooldown check
      if (!shouldRun(pageId)) {
        console.log(`[AUTO-GEN] Skipping page ${pageId} (cooldown active)`);
        continue;
      }

      // 2. Count active topics for this page
      const now = new Date();
      const activeCount = await AiTopic.countDocuments({
        pageId,
        startDate: { $lte: now },
        endDate: { $gte: now }
      });

      // 3. If we already have enough active topics, skip
      if (activeCount >= MAX_ACTIVE_TOPICS) {
        console.log(`[AUTO-GEN] Page ${pageId} already has ${activeCount} active topics (max ${MAX_ACTIVE_TOPICS}) – skipping`);
        lastRun.set(pageId, Date.now()); // still update cooldown to avoid repeated skips
        continue;
      }

      // 4. If we have fewer than MIN_ACTIVE_TOPICS, let the service create more
      //    (the service will also check its own limits, but this is an extra guard)
      console.log(`[AUTO-GEN] Processing page ${pageId} (active: ${activeCount})`);
      lastRun.set(pageId, Date.now());

      try {
        await ensureActiveTopicsForPage(pageId);
      } catch (err) {
        console.error(`[AUTO-GEN] Error processing page ${pageId}:`, err.message);
      }
    }

    console.log('[AUTO-GEN] Check completed');
  } catch (err) {
    console.error('[AUTO-GEN] Fatal error:', err.message);
  }
});

console.log(`[AUTO-GEN] Scheduler started – will run every 60 seconds, per‑page cooldown: ${COOLDOWN_MINUTES} min`);
