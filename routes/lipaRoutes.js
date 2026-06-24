// routes/lipaRoutes.js – Complete with challenge, idempotency, webhook handling
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Plan = require('../models/Plan');
const intasendService = require('../services/lipaService');

function requireLogin(req, res, next) {
    if (req.session?.userId) return next();
    return res.status(401).json({ error: 'Not authenticated' });
}

// ========== WEBHOOK CHALLENGE (GET) ==========
router.get('/callback', (req, res) => {
    const challenge = req.query['hub.challenge'] || req.query.challenge;
    if (challenge) {
        console.log(`✅ Webhook challenge received: ${challenge}`);
        return res.status(200).send(challenge);
    }
    res.status(400).send('Challenge not provided');
});

// ========== WEBHOOK EVENT (POST) ==========
router.post('/callback', async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'] || req.headers['x-intasend-signature'];
        if (!intasendService.verifyWebhookSignature(signature, req.body)) {
            console.warn('Webhook: Invalid signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const invoiceId = req.body.invoice?.id || req.body.invoice_id;
        const state = req.body.invoice?.state || req.body.state;

        if (!invoiceId) {
            console.warn('Webhook: No invoice ID');
            return res.status(200).json({ received: true });
        }

        const user = await User.findOne({ 'transactions.invoiceId': invoiceId });
        if (!user) {
            console.warn(`Webhook: Transaction not found for invoice ${invoiceId}`);
            return res.status(200).json({ received: true });
        }

        const tx = user.transactions.find(t => t.invoiceId === invoiceId);
        if (!tx) return res.status(200).json({ received: true });

        tx.webhookReceived = true;
        tx.webhookData = req.body;

        if (state === 'COMPLETE' && tx.status !== 'completed') {
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
            console.log(`✅ Subscription activated for ${user.email}: ${tx.plan} until ${expiry.toISOString()}`);
        } else if (state === 'FAILED' || state === 'CANCELLED') {
            tx.status = 'failed';
        } else if (state === 'PROCESSING') {
            tx.status = 'processing';
        }

        await user.save();
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(200).json({ received: true });
    }
});

// ========== INITIATE PAYMENT ==========
router.post('/stk-push', requireLogin, async (req, res) => {
    try {
        const { plan, phoneNumber, idempotencyKey } = req.body;
        const userId = req.session.userId;

        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        if (!plan) return res.status(400).json({ success: false, error: 'Plan required' });
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ success: false, error: 'Valid phone number required' });
        }
        if (!idempotencyKey) {
            return res.status(400).json({ success: false, error: 'Idempotency key required' });
        }

        // Check for duplicate request
        const existingUser = await User.findOne({ 'transactions.idempotencyKey': idempotencyKey });
        if (existingUser) {
            const tx = existingUser.transactions.find(t => t.idempotencyKey === idempotencyKey);
            return res.json({
                success: true,
                message: 'Payment already initiated',
                transactionId: tx._id,
                invoiceId: tx.invoiceId
            });
        }

        const planData = await Plan.findOne({ name: plan, isActive: true });
        if (!planData) return res.status(400).json({ success: false, error: 'Invalid plan' });

        const amount = planData.priceKES || 0;
        if (amount <= 0) return res.status(400).json({ success: false, error: 'Plan price not set' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const formattedPhone = intasendService.formatPhoneNumber(phoneNumber);
        const apiRef = `SUB_${userId}_${Date.now()}`;

        const transaction = {
            type: 'subscription',
            amount,
            status: 'pending',
            description: `${planData.label} Subscription`,
            plan: planData.name,
            phoneNumber: formattedPhone,
            trackingId: apiRef,
            idempotencyKey: idempotencyKey,
            createdAt: new Date()
        };
        user.transactions.push(transaction);
        await user.save();

        const txId = user.transactions[user.transactions.length - 1]._id;

        const result = await intasendService.initiateSTKPush({
            phoneNumber: formattedPhone,
            email: user.email,
            amount,
            narrative: `Subscription: ${planData.label}`,
            apiRef
        });

        if (!result.success) {
            const lastTx = user.transactions.id(txId);
            if (lastTx) lastTx.status = 'failed';
            await user.save();
            return res.status(400).json({ success: false, error: result.error });
        }

        const lastTx = user.transactions.id(txId);
        if (lastTx) {
            lastTx.invoiceId = result.invoiceId;
            lastTx.trackingId = result.trackingId;
            lastTx.status = 'processing';
            lastTx.intasendResponse = result.data;
        }
        await user.save();

        res.json({
            success: true,
            message: 'STK Push sent',
            transactionId: txId,
            invoiceId: result.invoiceId
        });

    } catch (error) {
        console.error('STK Push error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ========== STATUS CHECK ==========
router.get('/status/:transactionId', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { transactionId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const tx = user.transactions.id(transactionId);
        if (!tx) return res.status(404).json({ success: false, error: 'Transaction not found' });

        if (tx.status === 'processing' && tx.invoiceId) {
            const statusResult = await intasendService.checkPaymentStatus(tx.invoiceId);
            if (statusResult.success) {
                const state = statusResult.data.invoice?.state || statusResult.data.state;
                if (state === 'COMPLETE' && !tx.subscriptionActivated) {
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
                } else if (state === 'FAILED' || state === 'CANCELLED') {
                    tx.status = 'failed';
                    await user.save();
                }
            }
        }

        res.json({
            success: true,
            transaction: {
                id: tx._id,
                plan: tx.plan,
                amount: tx.amount,
                status: tx.status,
                invoiceId: tx.invoiceId,
                subscriptionActivated: tx.subscriptionActivated || false,
                subscriptionExpiry: tx.subscriptionExpiry || null,
                createdAt: tx.createdAt
            }
        });

    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ========== SUBSCRIPTION INFO ==========
router.get('/subscription', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId).select('subscription walletBalance paymentPhone email transactions');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const now = new Date();
        const isActive = user.subscription?.expiryDate && new Date(user.subscription.expiryDate) > now;
        const daysRemaining = isActive ? Math.ceil((new Date(user.subscription.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0;

        const recentTx = user.transactions.slice(-10).reverse();

        res.json({
            success: true,
            userId: user._id,
            paymentPhone: user.paymentPhone,
            walletBalance: user.walletBalance || 0,
            subscription: {
                plan: user.subscription?.plan || 'free',
                startDate: user.subscription?.startDate || null,
                expiryDate: user.subscription?.expiryDate || null,
                isActive,
                daysRemaining
            },
            transactions: recentTx.map(tx => ({
                id: tx._id,
                plan: tx.plan,
                amount: tx.amount,
                status: tx.status,
                createdAt: tx.createdAt
            }))
        });

    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
