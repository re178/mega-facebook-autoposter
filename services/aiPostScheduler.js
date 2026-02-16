const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const Page = require('../models/Page'); // optional, in case pageId is a string
const { postToFacebook } = require('../services/facebookService');

const SCHEDULE_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
let isRunning = false;
let lastTickLog = 0;
const LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LOG_SOURCE = 'AI_SCHEDULER'; // <--- tag for logs created by this scheduler

/* =========================
   MONITOR LOGGING
========================= */
async function monitor(pageId, postId, action, message) {
  try {
    await AiLog.create({ pageId, postId, action, message, source: LOG_SOURCE });
  } catch (err) {
    console.error('⚠️ Scheduler monitor failed:', err.message);
  }
}

/* =========================
   CLEAR OLD AI LOGS
========================= */
async function clearOldLogs(minutes = 30) {
  try {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const result = await AiLog.deleteMany({ source: LOG_SOURCE, createdAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleared ${result.deletedCount} old AI scheduler logs`);
    }
  } catch (err) {
    console.error('❌ Failed clearing old AI scheduler logs:', err.message);
  }
}

/* =========================
   DELETE POSTS AFTER TIME
========================= */
async function deleteOldPosts() {
  try {
    const now = new Date();

    // Successful posts older than 10 minutes
    const deletedSuccess = await AiScheduledPost.deleteMany({
      status: 'POSTED',
      updatedAt: { $lt: new Date(now - 10 * 60 * 1000) }
    });

    // Failed posts older than 30 minutes
    const deletedFailed = await AiScheduledPost.deleteMany({
      status: 'FAILED',
      updatedAt: { $lt: new Date(now - 30 * 60 * 1000) }
    });

    if (deletedSuccess.deletedCount > 0 || deletedFailed.deletedCount > 0) {
      console.log(`🗑️ Deleted AI posts → Success: ${deletedSuccess.deletedCount}, Failed: ${deletedFailed.deletedCount}`);
    }
  } catch (err) {
    console.error('❌ Failed deleting old AI posts:', err.message);
  }
}

/* =========================
   BACKOFF CALCULATION
========================= */
function getBackoffTime(retryCount) {
  return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

/* =========================
   PROCESS SINGLE POST
========================= */
async function processAiPost(post) {
  let page = post.pageId;

  // Handle string pageId (current schema) → fetch Page document
  if (typeof page === 'string') {
    page = await Page.findOne({ pageId: page }).exec();
    if (!page) {
      await monitor(null, post._id, 'SKIPPED_POST', 'AI post skipped because linked Page was not found.');
      return;
    }
  }

  await monitor(page._id, post._id, 'POST_ATTEMPT',
    `Attempting AI post scheduled for ${post.scheduledTime.toLocaleString()}`);

  try {
    await postToFacebook(page.pageId, page.pageToken, post.text, post.mediaUrl);

    post.status = 'POSTED';
    post.retryCount = 0;
    await post.save();

    await monitor(page._id, post._id, 'POST_SUCCESS', 'AI post published successfully');
    console.log(`✅ AI POSTED → ${post._id}`);

  } catch (err) {
    post.retryCount = (post.retryCount || 0) + 1;

    if (post.retryCount >= MAX_RETRIES) {
      post.status = 'FAILED';
      await post.save();
      await monitor(page._id, post._id, 'POST_FAILED',
        `AI post permanently failed after ${MAX_RETRIES} retries. Reason: ${err.message}`);
      console.error(`❌ AI FAILED → ${post._id}`);
    } else {
      await post.save();
      const delay = getBackoffTime(post.retryCount) / 1000;
      await monitor(page._id, post._id, 'POST_RETRY_SCHEDULED',
        `Retry ${post.retryCount} scheduled after ${delay} seconds. Reason: ${err.message}`);
      console.warn(`⚠️ AI RETRY ${post.retryCount} → ${post._id}`);
    }
  }
}

/* =========================
   MAIN SCHEDULER LOOP
========================= */
async function startAiPostScheduler() {
  console.log('🕒 AI Scheduler started');

  const runScheduler = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const now = new Date();

      // Scheduler tick logging every 5 minutes
      if (Date.now() - lastTickLog > LOG_INTERVAL) {
        monitor(null, null, 'SCHEDULER_TICK', 'Scanning database for pending AI posts').catch(console.error);
        lastTickLog = Date.now();
      }

      // Clear old AI scheduler logs
      clearOldLogs(30).catch(console.error);

      // Delete old posts (posted 10m ago, failed 30m ago)
      deleteOldPosts().catch(console.error);

      // Fetch pending AI posts
      const posts = await AiScheduledPost.find({
        status: 'PENDING',
        scheduledTime: { $lte: now }
      });

      for (const post of posts) {
        // If retry > 0, check backoff
        if (post.retryCount > 0) {
          const lastAttempt = post.updatedAt || post.createdAt;
          const backoff = getBackoffTime(post.retryCount);
          if (now - lastAttempt < backoff) {
            await monitor(null, post._id, 'BACKOFF_WAIT', `Waiting for retry backoff`);
            continue;
          }
        }

        await processAiPost(post);
      }

    } catch (err) {
      console.error('❌ AI Scheduler crashed:', err.message);
      await monitor(null, null, 'SCHEDULER_ERROR', `Scheduler error: ${err.message}`);
    } finally {
      isRunning = false;
      setTimeout(runScheduler, SCHEDULE_INTERVAL);
    }
  };

  runScheduler();
}

module.exports = { startAiPostScheduler };
