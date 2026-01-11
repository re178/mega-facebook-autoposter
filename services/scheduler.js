const Post = require('../models/Post');
const Page = require('../models/Page');
const Log = require('../models/Log');
const { postToFacebook } = require('./facebookService');

const SCHEDULE_INTERVAL = 30000; // 30 seconds

function startScheduler() {
  console.log('🕒 Scheduler started');
  setInterval(async () => {
    try {
      const now = new Date();
      const posts = await Post.find({
        status: 'PENDING',
        scheduledTime: { $lte: now }
      }).populate('pageId');

      for (const post of posts) {
        if (!post.pageId) continue;

        try {
          await postToFacebook(post.pageId.pageId, post.pageId.pageToken, post.text, post.mediaUrl);
          post.status = 'POSTED';
          await post.save();

          await Log.create({
            pageId: post.pageId._id,
            action: 'POSTED',
            message: 'Post successfully posted to Facebook'
          });

          console.log(`✅ Post ${post._id} posted`);
        } catch (err) {
          post.status = 'FAILED';
          await post.save();

          await Log.create({
            pageId: post.pageId._id,
            action: 'FAILED',
            message: err.message
          });

          console.error(`❌ Post ${post._id} failed: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('❌ Scheduler error:', err.message);
    }
  }, SCHEDULE_INTERVAL);
}

module.exports = { startScheduler };

