// services/monthlyReset.js – Reset monthly usage counters on the 1st of every month
const cron = require('node-cron');
const User = require('../models/User');

// Run on the 1st of every month at 00:00 (midnight)
cron.schedule('0 0 1 * *', async () => {
    console.log('🔄 Monthly usage reset started...');
    try {
        const result = await User.updateMany(
            {},
            {
                $set: {
                    'usage.manualPostsThisMonth': 0,
                    'usage.aiPostsThisMonth': 0,
                    'usage.imagesThisMonth': 0,
                    'usage.videosThisMonth': 0,
                    'usage.lastResetDate': new Date()
                }
            }
        );
        console.log(`✅ Monthly reset completed. ${result.modifiedCount} users updated.`);
    } catch (err) {
        console.error('❌ Monthly reset error:', err);
    }
});

// Also run once on startup to catch any missed resets
setTimeout(async () => {
    console.log('🔄 Running initial monthly reset check...');
    try {
        // Check if we need to reset (if lastResetDate is not in current month)
        const now = new Date();
        const users = await User.find({});
        let resetCount = 0;
        for (const user of users) {
            const lastReset = user.usage?.lastResetDate || new Date(0);
            if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
                user.usage.manualPostsThisMonth = 0;
                user.usage.aiPostsThisMonth = 0;
                user.usage.imagesThisMonth = 0;
                user.usage.videosThisMonth = 0;
                user.usage.lastResetDate = now;
                await user.save();
                resetCount++;
            }
        }
        console.log(`✅ Initial monthly reset check completed. ${resetCount} users reset.`);
    } catch (err) {
        console.error('❌ Initial monthly reset check error:', err);
    }
}, 10000); // run 10 seconds after startup

console.log('🕒 Monthly reset scheduled for the 1st of each month at midnight.');
