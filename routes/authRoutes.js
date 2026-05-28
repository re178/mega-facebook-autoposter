const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();

// Helper to get client IP
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

// ========================
// SIGNUP
// ========================
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, acceptTerms } = req.body;
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        if (!acceptTerms) {
            return res.status(400).json({ error: 'You must accept Terms and Privacy Policy' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Create user (unverified)
        const user = await User.create({
            email: email.toLowerCase(),
            password,
            name: name || '',
            role: 'user',
            isVerified: false,
            verificationToken,
            verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
        
        // Send verification email
        try {
            await sendVerificationEmail(user.email, verificationToken);
            console.log(`Verification email sent to ${user.email}`);
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError);
            // Still return success - user can request new email
        }
        
        res.status(201).json({
            success: true,
            message: 'Account created! Please check your email to verify your account.'
        });
        
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// VERIFY EMAIL
// ========================
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.redirect('/login?error=invalid_token');
        }
        
        // Find user with this token and not expired
        const user = await User.findOne({
            verificationToken: token,
            verificationExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.redirect('/login?error=invalid_or_expired');
        }
        
        // Update user
        user.isVerified = true;
        user.verificationToken = null;
        user.verificationExpires = null;
        await user.save();
        
        // Send welcome email
        try {
            await sendWelcomeEmail(user.email, user.name);
        } catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }
        
        // Redirect to login with success message
        res.redirect('/login?verified=true');
        
    } catch (err) {
        console.error('Verification error:', err);
        res.redirect('/login?error=verification_failed');
    }
});

// ========================
// FORGOT PASSWORD
// ========================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        // For security, always return success even if user not found
        if (!user) {
            return res.json({ success: true, message: 'If an account exists, you will receive a reset email.' });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
        await user.save();
        
        // Send reset email
        try {
            await sendPasswordResetEmail(user.email, resetToken);
            console.log(`Password reset email sent to ${user.email}`);
        } catch (emailError) {
            console.error('Failed to send reset email:', emailError);
        }
        
        res.json({ success: true, message: 'If an account exists, you will receive a reset email.' });
        
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// RESET PASSWORD
// ========================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }
        
        // Update password
        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await user.save();
        
        res.json({ success: true, message: 'Password has been reset. Please log in.' });
        
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// RESEND VERIFICATION EMAIL
// ========================
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.isVerified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();
        
        // Send email
        await sendVerificationEmail(user.email, verificationToken);
        
        res.json({ success: true, message: 'Verification email sent' });
        
    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================
// CHECK VERIFICATION STATUS
// ========================
router.get('/check-verification/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.json({ exists: false });
        }
        
        res.json({
            exists: true,
            isVerified: user.isVerified,
            isActive: user.isActive
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
