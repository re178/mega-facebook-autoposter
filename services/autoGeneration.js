// schedulers/autoGeneration.js
const cron = require('node-cron');
const Page = require('../models/Page');
const { ensureActiveTopicsForPage } = require('../services/aiSchedulerService');

// Run every 60 seconds
cron.schedule('* * * * *', async () => {
  console.log('[AUTO-GEN] Checking pages with auto-generation enabled...');

  try {
    const pages = await Page.find({ autoGenerationEnabled: true });

    console.log(`[AUTO-GEN] Found ${pages.length} pages with auto-generation ON`);

    for (const page of pages) {
      try {
        await ensureActiveTopicsForPage(page.pageId);
      } catch (err) {
        console.error(
          `[AUTO-GEN] Error processing page ${page.pageId}:`,
          err.message
        );
      }
    }

    console.log('[AUTO-GEN] Check completed');
  } catch (err) {
    console.error('[AUTO-GEN] Fatal error:', err.message);
  }
});

console.log('[AUTO-GEN] Scheduler started – will run every 60 seconds');
