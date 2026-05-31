const Post = require('../models/Post');
const Log = require('../models/Log');
const { postToFacebook } = require('./facebookService');

const SCHEDULE_INTERVAL = 30000; // Base interval: 30 seconds
const MAX_RETRIES = 3;

// Track if scheduler is already running
let isRunning = false;

/**
 * Calculate exponential backoff time in milliseconds
 * @param {number} retryCount - Current retry attempt number (1-based)
 * @returns {number} - Milliseconds to wait before next retry
 * 
 * Examples:
 * - Retry 1: 30,000ms (30 seconds)
 * - Retry 2: 60,000ms (1 minute)
 * - Retry 3: 120,000ms (2 minutes)
 */
function getBackoffTime(retryCount) {
    return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

/**
 * Process a single post: publish to Facebook, handle success/failure, log results
 * @param {Object} post - Mongoose post document with populated pageId
 */
async function processPost(post) {
    try {
        // Attempt to post to Facebook
        await postToFacebook(
            post.pageId.pageId,      // Facebook page ID
            post.pageId.pageToken,   // Facebook page access token
            post.text,               // Post content
            post.mediaUrl            // Optional media URL (image/video)
        );

        // SUCCESS: Update post status
        post.status = 'POSTED';
        post.retryCount = 0;
        await post.save();

        // Create success log
        await Log.create({
            pageId: post.pageId._id,
            action: 'POSTED',
            message: 'Post successfully posted to Facebook'
        });

        console.log(`✅ Post ${post._id} posted successfully`);

    } catch (err) {
        // FAILURE: Increment retry count
        post.retryCount = (post.retryCount || 0) + 1;

        // Check if max retries exceeded
        if (post.retryCount >= MAX_RETRIES) {
            // Permanent failure - mark as FAILED
            post.status = 'FAILED';
            await post.save();

            await Log.create({
                pageId: post.pageId._id,
                action: 'FAILED',
                message: `Post failed permanently after ${MAX_RETRIES} retries: ${err.message}`
            });

            console.error(`❌ Post ${post._id} failed permanently: ${err.message}`);

        } else {
            // Temporary failure - keep PENDING status, will retry later
            await post.save();

            const backoffSeconds = getBackoffTime(post.retryCount) / 1000;
            
            await Log.create({
                pageId: post.pageId._id,
                action: 'RETRY',
                message: `Retry ${post.retryCount} scheduled in ${backoffSeconds}s: ${err.message}`
            });

            console.warn(`⚠️ Post ${post._id} retry ${post.retryCount}/${MAX_RETRIES} in ${backoffSeconds}s: ${err.message}`);
        }
    }
}

/**
 * Start the post scheduler
 * - Runs continuously with exponential backoff for retries
 * - Checks for pending posts every 30 seconds
 * - Prevents overlapping runs
 */
function startScheduler() {
    console.log('🕒 Scheduler started with exponential backoff (30s interval, max 3 retries)');

    /**
     * Main scheduler loop - runs recursively
     */
    const runScheduler = async () => {
        // Prevent overlapping executions
        if (isRunning) {
            console.log('⏳ Scheduler already running, skipping this cycle');
            return;
        }

        isRunning = true;

        try {
            const now = new Date();

            // Find all pending posts that are due for publishing
            const posts = await Post.find({
                status: 'PENDING',
                scheduledTime: { $lte: now }
            }).populate('pageId');

            if (posts.length > 0) {
                console.log(`📋 Found ${posts.length} pending post(s) to process`);
            }

            // Process each post individually
            for (const post of posts) {
                // Skip if page reference is missing (shouldn't happen, but safety check)
                if (!post.pageId) {
                    console.error(`❌ Post ${post._id} has no page reference, marking as FAILED`);
                    post.status = 'FAILED';
                    await post.save();
                    continue;
                }

                // If this is a retry, check if backoff time has passed
                if (post.retryCount > 0) {
                    const backoffTimeMs = getBackoffTime(post.retryCount);
                    const lastAttemptTime = post.updatedAt || post.createdAt;
                    const timeSinceLastAttempt = now - lastAttemptTime;
                    
                    if (timeSinceLastAttempt < backoffTimeMs) {
                        // Not enough time has passed - skip this cycle
                        const remainingSeconds = Math.ceil((backoffTimeMs - timeSinceLastAttempt) / 1000);
                        console.log(`⏰ Post ${post._id} retry ${post.retryCount} waiting ${remainingSeconds}s more (backoff)`);
                        continue;
                    }
                }

                // Process the post (publish to Facebook)
                await processPost(post);
            }

        } catch (err) {
            console.error('❌ Scheduler error:', err.message);
            
            // Log the error but don't crash the scheduler
            await Log.create({
                pageId: null,
                action: 'SCHEDULER_ERROR',
                message: `Scheduler encountered error: ${err.message}`
            }).catch(e => console.error('Failed to log scheduler error:', e.message));

        } finally {
            // Mark as not running and schedule next iteration
            isRunning = false;
            setTimeout(runScheduler, SCHEDULE_INTERVAL);
        }
    };

    // Start the first iteration
    runScheduler();
}

/**
 * Stop the scheduler (useful for graceful shutdown)
 * Note: This doesn't stop the current running cycle, but prevents future cycles
 */
function stopScheduler() {
    console.log('🛑 Scheduler stopping...');
    // The scheduler uses setTimeout recursively, so we can't easily cancel
    // without refactoring. This flag helps but doesn't stop an active run.
    // For a more robust solution, you'd need to store the timeout ID.
    isRunning = true; // This will prevent the next cycle from starting
}

module.exports = { 
    startScheduler,
    stopScheduler,
    getBackoffTime,  // Exported for testing purposes
    MAX_RETRIES,
    SCHEDULE_INTERVAL
};
