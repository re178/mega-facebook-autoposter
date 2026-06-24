// services/reconciliation.js – Safety net for missed webhooks
const cron = require('node-cron');
const User = require('../models/User');
const Plan = require('../models/Plan');
const intasendService = require('./lipaService');

// Run every minute
cron.schedule('* * * * *', async () => {
    console.log('🔄 Reconciliation job started...');
    try {
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
                    // Verify fields
                    const amountMatches = Number(invoiceData.amount) === tx.amount;
                    const currencyMatches = invoiceData.currency === 'KES';
                    const providerMatches = invoiceData.provider === 'MPESA';
                    const apiRefMatches = invoiceData.api_ref === tx.trackingId;

                    if (amountMatches && currencyMatches && providerMatches && apiRefMatches) {
                        const planData = await Plan.findOne({ name: tx.plan });
                        const durationDays = planData?.durationDays || 30;
                        const expiry = new Date();
                        expiry.setDate(expiry.getDate() + durationDays);

                        user.subscription = {
                            plan: tx.plan,
                            startDate: new Date(),
                            expiryDate: expiry,
                            updatedAt: new Date(),
                            autoRenew: false
                        };
                        tx.status = 'completed';
                        tx.subscriptionActivated = true;
                        tx.subscriptionExpiry = expiry;
                        await user.save();
                        activatedCount++;
                        console.log(`🔄 Reconciliation activated subscription for ${user.email}: ${tx.plan}`);
                    }
                } else if (state === 'FAILED' || state === 'CANCELLED') {
                    tx.status = 'failed';
                    await user.save();
                }
            }
        }

        if (activatedCount > 0) {
            console.log(`✅ Reconciliation activated ${activatedCount} subscriptions.`);
        } else {
            console.log('🔄 No pending transactions needing activation.');
        }
    } catch (err) {
        console.error('❌ Reconciliation error:', err);
    }
    console.log('🔄 Reconciliation job completed.');
});
