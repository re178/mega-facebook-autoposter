const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail
} = require('../services/emailService');

const router = express.Router();

/* =====================================================
   LOGGING HELPER (SMART DEBUG)
===================================================== */
function log(step, data) {
    console.log(`\n🟢 [AUTH:${step}]`, data || '');
}

/* =====================================================
   SIGNUP
===================================================== */
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, acceptTerms } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        if (!acceptTerms) {
            return res.status(400).json({ error: 'Accept terms required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password too short' });
        }

        const existing = await User.findOne({ email: email.toLowerCase() });

        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');

        const user = await User.create({
            email: email.toLowerCase(),
            password,
            name,
            role: 'user',
            isVerified: false,
            verificationToken,
            verificationExpires: Date.now() + 24 * 60 * 60 * 1000
        });

        log('SIGNUP', { email: user.email });

        await sendVerificationEmail(user.email, verificationToken);

        res.json({
            success: true,
            message: 'Check your email to verify account'
        });

    } catch (err) {
        console.error('SIGNUP ERROR:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* =====================================================
   VERIFY EMAIL (FIXED FOR PRODUCTION)
   Works with BOTH:
   - /api/auth/verify-email?token=xxx
   - direct email link
===================================================== */
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        log('VERIFY HIT', token);

        if (!token) {
            return res.redirect('/login?error=missing_token');
        }

        const user = await User.findOne({
            verificationToken: token,
            verificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect('/login?error=invalid_or_expired');
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationExpires = null;
        await user.save();

        log('VERIFIED', user.email);

        try {
            await sendWelcomeEmail(user.email, user.name);
        } catch (e) {
            console.log("Welcome email failed:", e.message);
        }

        // IMPORTANT: redirect user properly
        return res.redirect('/login?verified=true');

    } catch (err) {
        console.error('VERIFY ERROR:', err);
        return res.redirect('/login?error=server_error');
    }
});

/* =====================================================
   FORGOT PASSWORD
===================================================== */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.json({ success: true });
        }

        const token = crypto.randomBytes(32).toString('hex');

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        await sendPasswordResetEmail(user.email, token);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* =====================================================
   RESET PASSWORD
===================================================== */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid token' });
        }

        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;

        await user.save();

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* =====================================================
   RESEND VERIFICATION
===================================================== */
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || user.isVerified) {
            return res.status(400).json({ error: 'Not allowed' });
        }

        const token = crypto.randomBytes(32).toString('hex');

        user.verificationToken = token;
        user.verificationExpires = Date.now() + 86400000;
        await user.save();

        await sendVerificationEmail(user.email, token);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/
