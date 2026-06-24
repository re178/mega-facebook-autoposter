// routes/lipaRoutes.js – IntaSend routes with multi‑layer confirmation
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

// ========== WEBHOOK EVENT (POST) – Multi‑Layer Verification ==========
router.post('/callback', async (req, res) => {
    try {
        // 1. Optional signature verification – log if invalid, but do not reject
        const signature = req.headers['x-webhook-signature'] || req.headers['x-intasend-signature'];
        const isSignatureValid = intasendService.verifyWebhookSignature(signature, req.body);
        if (!isSignatureValid) {
            console.warn('⚠️ Webhook: Invalid signature, but proceeding with API verification.');
        }

        // 2. Extract invoice_id from webhook payload
        const invoiceId = req.body.invoice?.id || req.body.invoice_id;
        if (!invoiceId) {
            console.warn('⚠️ Webhook: No invoice ID');
            return res.status(200).json({ received: true });
        }

        // 3. Find the pending transaction in the database
        const user = await User.findOne({ 'transactions.invoiceId': invoiceId });
        if (!user) {
            console.warn(`⚠️ Webhook: Transaction not found for invoice ${invoiceId}`);
            return res.status(200).json({ received: true });
        }

        const tx = user.transactions.find(t => t.invoiceId === invoiceId);
        if (!tx) {
            return res.status(200).json({ received: true });
        }

        // 4. Idempotency: if already completed, ignore
        if (tx.status === 'completed') {
            return res.status(200).json({ received: true });
        }

        // 5. Call IntaSend Status API – the authoritative source
        const statusResult = await intasendService.checkPaymentStatus(invoiceId);
        if (!statusResult.success) {
            console.error('❌ Status API error:', statusResult.error);
            return res.status(200).json({ received: true });
        }

        // 6. Extract invoice data from the status API response
        const invoiceData = statusResult.data.invoice || statusResult.data;
        const state = invoiceData.state || statusResult.status;

        // 7. Verify all critical fields match the pending transaction
        const isComplete = state === 'COMPLETE';
        const amountMatches = Number(invoiceData.amount) === tx.amount;
        const currencyMatches = invoiceData.currency === 'KES';
        const providerMatches = invoiceData.provider === 'MPESA'; // adjust if needed
        const apiRefMatches = invoiceData.api_ref === tx.trackingId; // stored when creating transaction

        // 8. If everything matches, activate the subscription
        if (isComplete && amountMatches && currencyMatches && providerMatches && apiRefMatches) {
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

            console.log(`✅ Subscription activated for ${user.email}: ${tx.plan} until ${expiry.toISOString()}`);
        } else {
            // Log why activation was skipped
            const reasons = [];
            if (!isComplete) reasons.push('state not COMPLETE');
            if (!amountMatches) reasons.push('amount mismatch');
            if (!currencyMatches) reasons.push('currency mismatch');
            if (!providerMatches) reasons.push('provider mismatch');
            if (!apiRefMatches) reasons.push('api_ref mismatch');
            console.warn('⚠️ Webhook activation skipped:', reasons.join(', '));
        }

        // Always acknowledge receipt
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        // Always return 200 – IntaSend will retry if we return error
        res.status(200).json({ received: true });
    }
});

// =====================================================
// 1. INITIATE PAYMENT (STK Push)
// =====================================================
router.post('/stk-push', requireLogin, async (req, res) => {
    try {
        const { plan, phoneNumber, idempotencyKey } = req.body;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        if (!plan) {
            return res.status(400).json({ success: false, error: 'Plan required' });
        }
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ success: false, error: 'Valid phone number required' });
        }
        if (!idempotencyKey) {
            return res.status(400).json({ success: false, error: 'Idempotency key required' });
        }

        // Check for duplicate request using idempotencyKey
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
        if (!planData) {
            return res.status(400).json({ success: false, error: 'Invalid plan' });
        }

        const amount = planData.priceKES || 0;
        if (amount <= 0) {
            return res.status(400).json({ success: false, error: 'Plan price not set' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const formattedPhone = intasendService.formatPhoneNumber(phoneNumber);
        const apiRef = `SUB_${userId}_${Date.now()}`;

        // Create transaction record
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

        // Call IntaSend SDK
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

        // Update transaction with invoice details
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

// =====================================================
// 2. GET TRANSACTION STATUS (Used by frontend polling)
// =====================================================
router.get('/status/:transactionId', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { transactionId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const tx = user.transactions.id(transactionId);
        if (!tx) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        // If still pending/processing, check with IntaSend
        if ((tx.status === 'pending' || tx.status === 'processing') && tx.invoiceId) {
            const statusResult = await intasendService.checkPaymentStatus(tx.invoiceId);
            if (statusResult.success) {
                const invoiceData = statusResult.data.invoice || statusResult.data;
                const state = invoiceData.state || statusResult.status;

                // If completed, activate (also verify fields)
                if (state === 'COMPLETE' && !tx.subscriptionActivated) {
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
                        console.log(`✅ Status activation for ${user.email}: ${tx.plan}`);
                    }
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

// =====================================================
// 3. GET SUBSCRIPTION & WALLET INFO
// =====================================================
router.get('/subscription', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId).select('subscription walletBalance paymentPhone email transactions');
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

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
