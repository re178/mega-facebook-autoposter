// services/reconciliation.js – Payment reconciliation + Expiry downgrade (optimised)
const cron = require('node-cron');
const User = require('../models/User');
const Plan = require('../models/Plan');
const intasendService = require('./lipaService');

// =====================================================
// 1. RECONCILE PENDING PAYMENTS (every minute)
// =====================================================
async function reconcilePayments() {
    try {
        console.log('🔄 Reconciliation job started...');

        // Find all users with pending/processing transactions older than 2 minutes
        const cutoff = new Date(Date.now() - 2 * 60 * 1000);
        const users = await User.find({
            'transactions': {
                $elemMatch: {
                    status: { $in: ['pending', 'processing'] },
                    createdAt: { $lt: cutoff }
                }
            }
        });

        let activatedCount = 0;

        for (const user of users) {
            for (const tx of user.transactions) {
                // Skip if not pending/processing or already activated
                if (tx.status !== 'pending' && tx.status !== 'processing') continue;
                if (new Date(tx.createdAt) > cutoff) continue;
                if (tx.subscriptionActivated) continue;
                if (!tx.invoiceId) continue;

                // Check status with IntaSend
                const statusResult = await intasendService.checkPaymentStatus(tx.invoiceId);
                if (!statusResult.success) continue;

                const invoiceData = statusResult.data.invoice || statusResult.data;
                const state = invoiceData.state || statusResult.status;

                if (state === 'COMPLETE') {
                    // Verify fields – use gross amount (value)
                    const grossAmount = Number(invoiceData.value) || Number(invoiceData.amount);
                    const amountMatches = grossAmount === tx.amount;
                    const currencyMatches = invoiceData.currency === 'KES';
                    const providerMatches = invoiceData.provider === 'MPESA' || invoiceData.provider === 'M-PESA';
                    const apiRefMatches = invoiceData.api_ref === tx.apiRef;

                    if (amountMatches && currencyMatches && providerMatches && apiRefMatches) {
                        // Activate subscription with expiry extension
                        const planData = await Plan.findOne({ name: tx.plan });
                        const durationDays = planData?.durationDays || 30;
                        const now = new Date();
                        let startDate = now;
                        let expiryDate = new Date(now);
                        expiryDate.setDate(expiryDate.getDate() + durationDays);

                        // If user already on same plan and active, extend expiry
                        if (user.subscription?.plan === tx.plan && user.subscription?.expiryDate) {
                            const currentExpiry = new Date(user.subscription.expiryDate);
                            if (currentExpiry > now) {
                                startDate = user.subscription.startDate || now;
                                expiryDate = new Date(currentExpiry);
                                expiryDate.setDate(expiryDate.getDate() + durationDays);
                            }
                        }

                        user.subscription = {
                            plan: tx.plan,
                            startDate: startDate,
                            expiryDate: expiryDate,
                            updatedAt: now,
                            autoRenew: false
                        };
                        tx.status = 'completed';
                        tx.subscriptionActivated = true;
                        tx.subscriptionExpiry = expiryDate;
                        await user.save();
                        activatedCount++;
                        console.log(`🔄 Reconciliation activated subscription for ${user.email}: ${tx.plan} until ${expiryDate.toISOString()}`);
                    }
                } else if (state === 'FAILED' || state === 'CANCELLED') {
                    tx.status = 'failed';
                    await user.save();
                }
            }
        }

        if (activatedCount > 0) {
            console.log(`✅ Reconciliation activated ${activatedCount} subscriptions.`);
        }
        console.log('🔄 Reconciliation (payments) completed.');

    } catch (err) {
        console.error('❌ Reconciliation error:', err);
    }
}

// =====================================================
// 2. DOWNGRADE EXPIRED PLANS (daily at midnight, protects admins)
// =====================================================
async function downgradeExpired() {
    try {
        console.log('🔄 Expiry downgrade job started...');
        const now = new Date();

        // Find users with expired subscriptions (skip admins)
        const expiredUsers = await User.find({
            'subscription.plan': { $ne: 'free' },
            'subscription.expiryDate': { $lt: now },
            role: { $ne: 'admin' }
        });

        let downgradedCount = 0;
        for (const user of expiredUsers) {
            const previousPlan = user.subscription.plan;
            user.subscription.plan = 'free';
            user.subscription.expiryDate = null;
            user.subscription.startDate = null;
            user.subscription.updatedAt = now;
            user.subscription.status = 'expired';
            await user.save();
            downgradedCount++;
            console.log(`⏰ Expired: ${user.email} downgraded from ${previousPlan} to free.`);
        }

        if (downgradedCount > 0) {
            console.log(`✅ Expiry downgrade completed: ${downgradedCount} users downgraded.`);
        }
        console.log('🔄 Expiry downgrade job completed.');

    } catch (err) {
        console.error('❌ Expiry downgrade error:', err);
    }
}

// =====================================================
// 3. SCHEDULE JOBS
// =====================================================

// Run payment reconciliation every minute
cron.schedule('* * * * *', async () => {
    await reconcilePayments();
});

// Run expiry downgrade once daily at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
    await downgradeExpired();
});

// =====================================================
// 4. INITIAL RUN ON STARTUP
// =====================================================
// Run both jobs once on startup to catch any pending items

setTimeout(async () => {
    console.log('🔄 Running initial reconciliation on startup...');
    await reconcilePayments();
}, 5000);

setTimeout(async () => {
    console.log('🔄 Running initial expiry check on startup...');
    await downgradeExpired();
}, 10000);

console.log('✅ Reconciliation service started:');
console.log('   - Payment reconciliation: every minute');
console.log('   - Expiry downgrade: daily at midnight (admins are protected)');
