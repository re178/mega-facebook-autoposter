const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');
const { postToFacebook } = require('../services/facebookService');

const SCHEDULE_INTERVAL = 30000; // check every 30s
const MAX_RETRIES = 3;

let isRunning = false;

// Exponential backoff time
function getBackoffTime(retryCount) {
  return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

// Process a single AI post
async function processAiPost(post) {
  try {
    await postToFacebook(post.pageId.pageId, post.pageId.pageToken, post.text, post.mediaUrl);

    post.status = 'POSTED';
    post.retryCount = 0;
    await post.save();

    await AiLog.create({
      pageId: post.pageId,
      postId: post._id,
      action: 'POSTED',
      message: 'AI post successfully posted'
    });

    console.log(`✅ AI Post ${post._id} posted successfully`);
  } catch (err) {
    post.retryCount = (post.retryCount || 0) + 1;

    if (post.retryCount >= MAX_RETRIES) {
      post.status = 'FAILED';
      await AiLog.create({
        pageId: post.pageId,
        postId: post._id,
        action: 'FAILED',
        message: `AI post failed permanently after ${MAX_RETRIES} retries: ${err.message}`
      });
      console.error(`❌ AI Post ${post._id} failed permanently: ${err.message}`);
    } else {
      // Keep status PENDING for retry
      await AiLog.create({
        pageId: post.pageId,
        postId: post._id,
        action: 'RETRY',
        message: `Retry ${post.retryCount} scheduled in ${getBackoffTime(post.retryCount)/1000}s: ${err.message}`
      });
      console.warn(`⚠️ AI Post ${post._id} retry ${post.retryCount}: ${err.message}`);
    }

    await post.save();
  }
}

// Main scheduler loop
async function startAiScheduler() {
  console.log('🕒 AI Post Scheduler started');

  const runScheduler = async () => {
    if (isRunning) return; // prevent overlapping runs
    isRunning = true;

    try {
      const now = new Date();

      // Fetch pending posts
      const posts = await AiScheduledPost.find({
        status: 'PENDING',
        scheduledTime: { $lte: now }
      }).populate('pageId');

      for (const post of posts) {
        if (!post.pageId) continue;

        // Check backoff if retries exist
        if (post.retryCount > 0) {
          const backoff = getBackoffTime(post.retryCount);
          const lastAttempt = post.updatedAt || post.createdAt;
          if (now - lastAttempt < backoff) continue;
        }

        await processAiPost(post);
      }
    } catch (err) {
      console.error('❌ AI Scheduler error:', err.message);
    } finally {
      isRunning = false;
      setTimeout(runScheduler, SCHEDULE_INTERVAL);
    }
  };

  runScheduler();
}

module.exports = { startAiScheduler };
