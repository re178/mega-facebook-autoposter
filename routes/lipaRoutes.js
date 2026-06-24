// routes/lipaRoutes.js – Resilient webhook using api_ref (amount fix)
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

// ========== WEBHOOK EVENT (POST) – Resilient ==========
router.post('/callback', async (req, res) => {
    try {
        // 1. Optional signature verification – log but continue
        const signature = req.headers['x-webhook-signature'] || req.headers['x-intasend-signature'];
        const isSignatureValid = intasendService.verifyWebhookSignature(signature, req.body);
        if (!isSignatureValid) {
            console.warn('⚠️ Webhook: Invalid signature, but proceeding with API verification.');
        }

        // 2. Extract api_ref from webhook payload (YOUR identifier)
        const apiRef = req.body.api_ref;
        if (!apiRef) {
            console.warn('⚠️ Webhook: No api_ref');
            return res.status(200).json({ received: true });
        }

        // 3. Find transaction using apiRef (stored immediately)
        const user = await User.findOne({ 'transactions.apiRef': apiRef });
        if (!user) {
            console.warn(`⚠️ Webhook: Transaction not found for api_ref ${apiRef}`);
            return res.status(200).json({ received: true });
        }

        const tx = user.transactions.find(t => t.apiRef === apiRef);
        if (!tx) return res.status(200).json({ received: true });

        // 4. Idempotency
        if (tx.status === 'completed') {
            return res.status(200).json({ received: true });
        }

        // 5. Update invoiceId from webhook (if missing)
        const invoiceId = req.body.invoice_id || req.body.invoice?.id;
        if (invoiceId && !tx.invoiceId) {
            tx.invoiceId = invoiceId;
            await user.save();
            console.log(`✅ Updated invoiceId from webhook: ${invoiceId}`);
        }

        // 6. Call IntaSend Status API – authoritative source
        const invoiceToCheck = tx.invoiceId || invoiceId;
        if (!invoiceToCheck) {
            console.warn('⚠️ No invoiceId available to check status');
            return res.status(200).json({ received: true });
        }

        const statusResult = await intasendService.checkPaymentStatus(invoiceToCheck);
        if (!statusResult.success) {
            console.error('Status API error:', statusResult.error);
            return res.status(200).json({ received: true });
        }

        const invoiceData = statusResult.data.invoice || statusResult.data;
        const state = invoiceData.state || statusResult.status;

        // 7. Verify all critical fields – use gross amount (value) not net_amount
        const isComplete = state === 'COMPLETE';
        // Use 'value' (gross) if present, otherwise fallback to 'amount'
        const grossAmount = Number(invoiceData.value) || Number(invoiceData.amount);
        const amountMatches = grossAmount === tx.amount;
        const currencyMatches = invoiceData.currency === 'KES';
        const providerMatches = invoiceData.provider === 'M-PESA' || invoiceData.provider === 'MPESA';
        const apiRefMatches = invoiceData.api_ref === tx.apiRef;

        if (isComplete && amountMatches && currencyMatches && providerMatches && apiRefMatches) {
            // 8. Activate subscription (with expiry extension)
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

            console.log(`✅ Subscription activated for ${user.email}: ${tx.plan} until ${expiryDate.toISOString()}`);
        } else {
            const reasons = [];
            if (!isComplete) reasons.push('state not COMPLETE');
            if (!amountMatches) reasons.push(`amount mismatch: expected ${tx.amount}, got ${grossAmount}`);
            if (!currencyMatches) reasons.push('currency mismatch');
            if (!providerMatches) reasons.push('provider mismatch');
            if (!apiRefMatches) reasons.push('api_ref mismatch');
            console.warn('⚠️ Webhook activation skipped:', reasons.join(', '));
        }

        res.status(200).json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
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

        // ✅ Create transaction with apiRef immediately
        const transaction = {
            type: 'subscription',
            amount,
            status: 'pending',
            description: `${planData.label} Subscription`,
            plan: planData.name,
            phoneNumber: formattedPhone,
            apiRef: apiRef,                     // ← stored immediately
            idempotencyKey: idempotencyKey,
            createdAt: new Date()
        };
        user.transactions.push(transaction);
        await user.save();                     // ← saved before IntaSend call

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

        // Update transaction with invoiceId and tracking IDs
        const lastTx = user.transactions.id(txId);
        if (lastTx) {
            lastTx.invoiceId = result.invoiceId;
            lastTx.intasendTrackingId = result.trackingId;
            lastTx.trackingId = result.trackingId;   // for backward compatibility
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
// 2. GET TRANSACTION STATUS (frontend polling)
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

        // If pending/processing, check with IntaSend
        if ((tx.status === 'pending' || tx.status === 'processing') && tx.invoiceId) {
            const statusResult = await intasendService.checkPaymentStatus(tx.invoiceId);
            if (statusResult.success) {
                const invoiceData = statusResult.data.invoice || statusResult.data;
                const state = invoiceData.state || statusResult.status;

                if (state === 'COMPLETE' && !tx.subscriptionActivated) {
                    // Verify fields – use gross amount
                    const grossAmount = Number(invoiceData.value) || Number(invoiceData.amount);
                    const amountMatches = grossAmount === tx.amount;
                    const currencyMatches = invoiceData.currency === 'KES';
                    const providerMatches = invoiceData.provider === 'M-PESA' || invoiceData.provider === 'MPESA';
                    const apiRefMatches = invoiceData.api_ref === tx.apiRef;

                    if (amountMatches && currencyMatches && providerMatches && apiRefMatches) {
                        const planData = await Plan.findOne({ name: tx.plan });
                        const durationDays = planData?.durationDays || 30;
                        const now = new Date();
                        let startDate = now;
                        let expiryDate = new Date(now);
                        expiryDate.setDate(expiryDate.getDate() + durationDays);

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
