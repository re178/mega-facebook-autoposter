const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const { postToFacebook } = require('../services/facebookService');

const SCHEDULE_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;

let isRunning = false;

/* =========================================================
   MONITOR LOGGER (PLAIN LANGUAGE CCTV)
========================================================= */
async function monitor(pageId, postId, action, message) {
  try {
    await AiLog.create({
      pageId,
      postId,
      action,
      message
    });
  } catch (err) {
    console.error('⚠️ Scheduler monitor failed:', err.message);
  }
}

/* =========================================================
   EXPONENTIAL BACKOFF
========================================================= */
function getBackoffTime(retryCount) {
  return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

/* =========================================================
   PROCESS SINGLE POST
========================================================= */
async function processAiPost(post) {
  const page = post.pageId;

  await monitor(page._id, post._id, 'POST_ATTEMPT',
    `Scheduler is attempting to post AI content scheduled for ${post.scheduledTime.toLocaleString()}.`);

  try {
    await postToFacebook(
      page.pageId,
      page.pageToken,
      post.text,
      post.mediaUrl
    );

    post.status = 'POSTED';
    post.retryCount = 0;
    await post.save();

    await monitor(page._id, post._id, 'POST_SUCCESS',
      'AI post was successfully published to Facebook.');

    console.log(`✅ AI POSTED → ${post._id}`);

  } catch (err) {
    post.retryCount = (post.retryCount || 0) + 1;

    if (post.retryCount >= MAX_RETRIES) {
      post.status = 'FAILED';
      await post.save();

      await monitor(page._id, post._id, 'POST_FAILED',
        `AI post permanently failed after ${MAX_RETRIES} attempts. Reason: ${err.message}`);

      console.error(`❌ AI FAILED → ${post._id}`);

    } else {
      await post.save();

      const delay = getBackoffTime(post.retryCount) / 1000;

      await monitor(page._id, post._id, 'POST_RETRY_SCHEDULED',
        `Post failed. Retry ${post.retryCount} will occur after ${delay} seconds. Reason: ${err.message}`);

      console.warn(`⚠️ AI RETRY ${post.retryCount} → ${post._id}`);
    }
  }
}

/* =========================================================
   MAIN SCHEDULER LOOP
========================================================= */
async function startAiPostScheduler() {
  console.log('🕒 AI Scheduler started and watching scheduled posts');

  const runScheduler = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const now = new Date();

      await monitor(null, null, 'SCHEDULER_TICK',
        'Scheduler is scanning database for pending AI posts.');

      const posts = await AiScheduledPost.find({
        status: 'PENDING',
        scheduledTime: { $lte: now }
      }).populate('pageId');

      if (posts.length === 0) {
        await monitor(null, null, 'NO_PENDING_POSTS',
          'No AI posts are ready to be published at this time.');
      }

      for (const post of posts) {
        if (!post.pageId) {
          await monitor(null, post._id, 'SKIPPED_POST',
            'Post skipped because linked page record was missing.');
          continue;
        }

        if (post.retryCount > 0) {
          const backoff = getBackoffTime(post.retryCount);
          const lastAttempt = post.updatedAt || post.createdAt;

          if (now - lastAttempt < backoff) {
            await monitor(post.pageId._id, post._id, 'BACKOFF_WAIT',
              `Post is waiting for retry backoff period to finish.`);
            continue;
          }
        }

        await processAiPost(post);
      }

    } catch (err) {
      console.error('❌ Scheduler crashed:', err.message);

      await monitor(null, null, 'SCHEDULER_ERROR',
        `Scheduler encountered an error: ${err.message}`);

    } finally {
      isRunning = false;
      setTimeout(runScheduler, SCHEDULE_INTERVAL);
    }
  };

  runScheduler();
}

module.exports = { startAiScheduler};

