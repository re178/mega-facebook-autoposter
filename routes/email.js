// routes/email.js – Separate email templates and triggers
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../services/emailService');
const User = require('../models/User');
const Plan = require('../models/Plan');
const requireLogin = require('../middleware/requireLogin');
const requireAdmin = require('../middleware/requireAdmin');

// Helper to wrap HTML emails
function getEmailWrapper(content, title) {
    const APP_NAME = 'VIRALOOP';
    const APP_URL = process.env.APP_URL || 'https://voxtraapp.com';
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${title}</title>
<style>
body { font-family: Arial, sans-serif; background:#f5f5f5; margin:0; padding:0; }
.container { max-width:520px; margin:auto; background:#fff; padding:20px; border-radius:10px; }
.header { text-align:center; padding:20px; border-bottom:2px solid #22c55e; }
.header h1 { color:#22c55e; margin:0; }
.content { padding:20px; line-height:1.6; }
.button { background:#22c55e; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block; }
.footer { text-align:center; font-size:12px; color:#888; padding:20px; border-top:1px solid #eee; margin-top:20px; }
.footer a { color:#22c55e; text-decoration:none; }
</style>
</head>
<body>
<div class="container">
    <div class="header"><h1>${APP_NAME}</h1></div>
    <div class="content">${content}</div>
    <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p></div>
</div>
</body>
</html>`;
}

// ========== TEMPLATES ==========

function subscriptionActivatedTemplate(planLabel, expiryDate, userName) {
    const expiry = new Date(expiryDate).toLocaleDateString();
    return `
        <h2>Welcome to ${planLabel} Plan! 🎉</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Your subscription to the <strong>${planLabel}</strong> plan has been activated successfully.</p>
        <p>Your plan will remain active until <strong>${expiry}</strong>.</p>
        <p>You can now access all the features included in your plan.</p>
        <p><a href="${process.env.APP_URL}/dashboard" class="button">Go to Dashboard</a></p>
    `;
}

function subscriptionExpiredTemplate(planLabel, userName) {
    return `
        <h2>Your Subscription Has Expired</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Your <strong>${planLabel}</strong> plan has expired.</p>
        <p>You have been downgraded to the Free plan. You can upgrade at any time to regain access to premium features.</p>
        <p><a href="${process.env.APP_URL}/upgrade" class="button">Upgrade Now</a></p>
    `;
}

function adminBroadcastTemplate(message) {
    return `
        <h2>📢 Announcement from VIRALOOP</h2>
        <p>${message}</p>
    `;
}

// ========== TRIGGERS ==========

// Trigger: Send subscription activated email (called from webhook/reconciliation)
router.post('/trigger/subscription-activated', requireLogin, async (req, res) => {
    try {
        const { userId, plan } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const planData = await Plan.findOne({ name: plan });
        const label = planData?.label || plan;
        const expiry = user.subscription?.expiryDate;
        const html = getEmailWrapper(
            subscriptionActivatedTemplate(label, expiry, user.fullName),
            'Subscription Activated - VIRALOOP'
        );
        await sendEmail(user.email, `Your ${label} Plan is Active!`, html);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trigger: Send subscription expired email (called from expiry downgrade job)
router.post('/trigger/subscription-expired', requireLogin, async (req, res) => {
    try {
        const { userId, plan } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const planData = await Plan.findOne({ name: plan });
        const label = planData?.label || plan;
        const html = getEmailWrapper(
            subscriptionExpiredTemplate(label, user.fullName),
            'Subscription Expired - VIRALOOP'
        );
        await sendEmail(user.email, `Your ${label} Plan Has Expired`, html);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Send broadcast (also available in adminRoutes, but we keep a separate endpoint)
router.post('/broadcast', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { subject, message, recipientEmails } = req.body;
        let emails = [];
        if (recipientEmails === 'all') {
            const users = await User.find({}).select('email');
            emails = users.map(u => u.email);
        } else if (Array.isArray(recipientEmails)) {
            emails = recipientEmails;
        } else {
            return res.status(400).json({ error: 'Invalid recipients' });
        }

        if (!emails.length) return res.status(400).json({ error: 'No recipients' });

        const html = getEmailWrapper(adminBroadcastTemplate(message), subject);
        for (const email of emails) {
            await sendEmail(email, subject, html);
        }
        res.json({ success: true, sent: emails.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
