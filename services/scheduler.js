const Post = require('../models/Post');
const Log = require('../models/Log');
const { postToFacebook } = require('./facebookService');

const SCHEDULE_INTERVAL = 30000; // Base interval: 30 seconds
const MAX_RETRIES = 3;

// ============= CLEANUP CONFIGURATION =============
const DELETE_POSTS_AFTER_HOURS = 12;   // Delete ALL posts (POSTED + FAILED) after 12 hours
const DELETE_LOGS_AFTER_HOURS = 12;    // Delete ALL logs after 12 hours

// Track if scheduler is already running
let isRunning = false;

/**
 * Calculate exponential backoff time in milliseconds
 */
function getBackoffTime(retryCount) {
    return SCHEDULE_INTERVAL * Math.pow(2, retryCount - 1);
}

/**
 * Process a single post: publish to Facebook, handle success/failure, log results
 */
async function processPost(post) {
    try {
        // Attempt to post to Facebook
        await postToFacebook(
            post.pageId.pageId,
            post.pageId.pageToken,
            post.text,
            post.mediaUrl
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
 * DELETE ALL OLD POSTS (both POSTED and FAILED) older than DELETE_POSTS_AFTER_HOURS
 */
async function cleanupOldPosts() {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - DELETE_POSTS_AFTER_HOURS);

    try {
        // Delete posts that are either POSTED or FAILED and were updated before cutoff
        const result = await Post.deleteMany({
            status: { $in: ['POSTED', 'FAILED'] },
            updatedAt: { $lt: cutoffDate }
        });

        if (result.deletedCount > 0) {
            console.log(`🧹 CLEANUP: Deleted ${result.deletedCount} old posts (${DELETE_POSTS_AFTER_HOURS}+ hours old)`);
        }
    } catch (err) {
        console.error('❌ Cleanup old posts error:', err.message);
    }
}

/**
 * DELETE ALL OLD LOGS older than DELETE_LOGS_AFTER_HOURS
 */
async function cleanupOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - DELETE_LOGS_AFTER_HOURS);

    try {
        const result = await Log.deleteMany({
            createdAt: { $lt: cutoffDate }
        });

        if (result.deletedCount > 0) {
            console.log(`🧹 CLEANUP: Deleted ${result.deletedCount} old logs (${DELETE_LOGS_AFTER_HOURS}+ hours old)`);
        }
    } catch (err) {
        console.error('❌ Cleanup logs error:', err.message);
    }
}

/**
 * Run cleanup tasks (called every hour)
 */
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

async function runCleanupIfNeeded() {
    const now = Date.now();
    if (now - lastCleanupTime >= CLEANUP_INTERVAL) {
        lastCleanupTime = now;
        await cleanupOldPosts();
        await cleanupOldLogs();
    }
}

/**
 * Start the post scheduler
 */
function startScheduler() {
    console.log(`🕒 Scheduler started with:`);
    console.log(`   - Interval: ${SCHEDULE_INTERVAL/1000}s, Max retries: ${MAX_RETRIES}`);
    console.log(`   - Delete posts after: ${DELETE_POSTS_AFTER_HOURS}h`);
    console.log(`   - Delete logs after: ${DELETE_LOGS_AFTER_HOURS}h`);

    const runScheduler = async () => {
        if (isRunning) {
            console.log('⏳ Scheduler already running, skipping this cycle');
            return;
        }

        isRunning = true;

        try {
            const now = new Date();

            // Run cleanup every hour
            await runCleanupIfNeeded();

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
                        const remainingSeconds = Math.ceil((backoffTimeMs - timeSinceLastAttempt) / 1000);
                        console.log(`⏰ Post ${post._id} retry ${post.retryCount} waiting ${remainingSeconds}s more`);
                        continue;
                    }
                }

                await processPost(post);
            }

        } catch (err) {
            console.error('❌ Scheduler error:', err.message);
            
            await Log.create({
                pageId: null,
                action: 'SCHEDULER_ERROR',
                message: `Scheduler error: ${err.message}`
            }).catch(e => console.error('Failed to log error:', e.message));

        } finally {
            isRunning = false;
            setTimeout(runScheduler, SCHEDULE_INTERVAL);
        }
    };

    runScheduler();
}

function stopScheduler() {
    console.log('🛑 Scheduler stopping...');
    isRunning = true;
}

module.exports = { 
    startScheduler,
    stopScheduler,
    getBackoffTime,
    MAX_RETRIES,
    SCHEDULE_INTERVAL
};
