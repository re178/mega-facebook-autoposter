const Post = require('../models/Post');
const Log = require('../models/Log');
const { postToFacebook } = require('./facebookService');

const SCHEDULE_INTERVAL = 30000; // Base interval: 30s
const MAX_RETRIES = 3;

// Track if scheduler is already running
let isRunning = false;

// Calculate exponential backoff in milliseconds
function getBackoffTime(retryCount) {
  return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

async function processPost(post) {
  try {
    await postToFacebook(post.pageId.pageId, post.pageId.pageToken, post.text, post.mediaUrl);

    post.status = 'POSTED';
    post.retryCount = 0;
    await post.save();

    await Log.create({
      pageId: post.pageId._id,
      action: 'POSTED',
      message: 'Post successfully posted to Facebook'
    });

    console.log(`✅ Post ${post._id} posted successfully`);
  } catch (err) {
    post.retryCount = (post.retryCount || 0) + 1;

    if (post.retryCount >= MAX_RETRIES) {
      post.status = 'FAILED';
      await Log.create({
        pageId: post.pageId._id,
        action: 'FAILED',
        message: `Post failed permanently after ${MAX_RETRIES} retries: ${err.message}`
      });
      console.error(`❌ Post ${post._id} failed permanently: ${err.message}`);
    } else {
      // Keep status PENDING for retry
      await Log.create({
        pageId: post.pageId._id,
        action: 'RETRY',
        message: `Retry ${post.retryCount} scheduled in ${getBackoffTime(post.retryCount)/1000}s: ${err.message}`
      });
      console.warn(`⚠️ Post ${post._id} retry ${post.retryCount}: ${err.message}`);
    }

    await post.save();
  }
}

async function startScheduler() {
  console.log('🕒 Scheduler started with exponential backoff');

  const runScheduler = async () => {
    if (isRunning) return; // prevent overlapping runs
    isRunning = true;

    try {
      const now = new Date();

      // Fetch all pending posts
      const posts = await Post.find({
        status: 'PENDING',
        scheduledTime: { $lte: now }
      }).populate('pageId');

      for (const post of posts) {
        if (!post.pageId) continue;

        // If retryCount > 0, check backoff
        if (post.retryCount > 0) {
          const backoff = getBackoffTime(post.retryCount);
          const lastAttempt = post.updatedAt || post.createdAt;
          if (now - lastAttempt < backoff) {
            continue; // Skip until backoff passes
          }
        }

        await processPost(post);
      }
    } catch (err) {
      console.error('❌ Scheduler error:', err.message);
    } finally {
      isRunning = false;
      setTimeout(runScheduler, SCHEDULE_INTERVAL); // schedule next run
    }
  };

  runScheduler();
}

module.exports = { startScheduler };
