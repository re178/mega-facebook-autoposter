// services/emailService.js - Gmail SMTP Email Service
const nodemailer = require('nodemailer');

// Create transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,  // Your Gmail address
        pass: process.env.EMAIL_PASS   // Gmail App Password (16 chars)
    }
});

const FROM_EMAIL = process.env.EMAIL_USER;
const APP_NAME = 'VIRALOOP';
const APP_URL = process.env.APP_URL || 'https://viraloop.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@viraloop.com';

// Email template wrapper (consistent branding)
function getEmailWrapper(content, title) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} - ${APP_NAME}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
                .container { max-width: 520px; margin: 0 auto; padding: 20px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
                .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #22c55e; }
                .header h1 { margin: 0; color: #22c55e; font-size: 24px; }
                .content { padding: 30px 20px; }
                .button { display: inline-block; background: #22c55e; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
                .button:hover { background: #1a9e4a; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
                .footer a { color: #22c55e; text-decoration: none; margin: 0 8px; }
                .warning { color: #ff4c4c; font-size: 12px; margin-top: 16px; }
                .code { background: #f0f0f0; padding: 12px; font-family: monospace; font-size: 18px; text-align: center; letter-spacing: 2px; border-radius: 6px; margin: 16px 0; }
            </style>
        </head>
        <body style="margin:0;padding:20px;background:#f5f5f5;">
            <div class="container">
                <div class="header">
                    <h1>${APP_NAME}</h1>
                </div>
                <div class="content">
                    ${content}
                </div>
                <div class="footer">
                    <a href="${APP_URL}/privacy">Privacy Policy</a> | 
                    <a href="${APP_URL}/terms">Terms of Service</a> | 
                    <a href="mailto:${SUPPORT_EMAIL}">Support</a>
                    <p style="margin-top:16px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Send generic email
async function sendEmail(to, subject, htmlContent) {
    try {
        const info = await transporter.sendMail({
            from: `"${APP_NAME}" <${FROM_EMAIL}>`,
            to: to,
            subject: subject,
            html: getEmailWrapper(htmlContent, subject)
        });
        console.log(`✅ Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send failed:', error);
        return { success: false, error: error.message };
    }
}

// Send welcome email (after signup)
async function sendWelcomeEmail(email, name) {
    const content = `
        <h2>Welcome to ${APP_NAME}, ${name || 'there'}! 🎉</h2>
        <p>Thank you for joining us. You're now ready to automate your social media presence.</p>
        <p>With ${APP_NAME}, you can:</p>
        <ul>
            <li>🤖 Generate AI-powered posts</li>
            <li>📅 Schedule content across multiple pages</li>
            <li>💬 Manage messages and comments</li>
            <li>📊 Track analytics and performance</li>
        </ul>
        <p style="text-align: center;">
            <a href="${APP_URL}/login" class="button">Get Started</a>
        </p>
        <p>Need help? Check out our documentation or contact support.</p>
    `;
    return sendEmail(email, `Welcome to ${APP_NAME}!`, content);
}

// Send verification email
async function sendVerificationEmail(email, token) {
    const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
    const content = `
        <h2>Verify Your Email Address</h2>
        <p>Please verify your email to complete your registration and secure your account.</p>
        <p style="text-align: center;">
            <a href="${verifyUrl}" class="button">Verify Email</a>
        </p>
        <p>Or copy and paste this link:</p>
        <p><code style="background:#f0f0f0;padding:8px;display:block;word-break:break-all;">${verifyUrl}</code></p>
        <p class="warning">⚠️ This link expires in 24 hours. If you didn't create an account, please ignore this email.</p>
    `;
    return sendEmail(email, 'Verify Your Email', content);
}

// Send password reset email
async function sendPasswordResetEmail(email, token) {
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const content = `
        <h2>Reset Your Password</h2>
        <p>We received a request to reset your password. Click the button below to create a new password.</p>
        <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
        </p>
        <p>Or copy and paste this link:</p>
        <p><code style="background:#f0f0f0;padding:8px;display:block;word-break:break-all;">${resetUrl}</code></p>
        <p class="warning">⚠️ This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
    `;
    return sendEmail(email, 'Reset Your Password', content);
}

// Send security alert email
async function sendSecurityAlertEmail(email, alertType, details) {
    let title = '';
    let content = '';
    
    switch(alertType) {
        case 'LOGIN_FROM_NEW_DEVICE':
            title = 'New Login Detected';
            content = `
                <h2>New Login to Your Account</h2>
                <p>We detected a login to your ${APP_NAME} account from a new device or location.</p>
                <ul>
                    <li>📍 Location: ${details.location || 'Unknown'}</li>
                    <li>💻 Device: ${details.device || 'Unknown'}</li>
                    <li>🕐 Time: ${new Date().toLocaleString()}</li>
                </ul>
                <p>If this was you, you can ignore this message. If not, please reset your password immediately.</p>
                <p style="text-align: center;">
                    <a href="${APP_URL}/forgot-password" class="button">Secure Your Account</a>
                </p>
            `;
            break;
        case 'PASSWORD_CHANGED':
            title = 'Password Changed';
            content = `
                <h2>Your Password Was Changed</h2>
                <p>Your ${APP_NAME} account password was changed on ${new Date().toLocaleString()}.</p>
                <p>If you made this change, no further action is needed.</p>
                <p class="warning">⚠️ If you did NOT change your password, please reset it immediately by clicking the button below.</p>
                <p style="text-align: center;">
                    <a href="${APP_URL}/forgot-password" class="button">Reset Password</a>
                </p>
            `;
            break;
        default:
            title = 'Security Alert';
            content = `<p>${details.message || 'A security event occurred on your account.'}</p>`;
    }
    
    return sendEmail(email, `Security Alert: ${title}`, content);
}

// Send test email (for debugging)
async function sendTestEmail(email) {
    const content = `
        <h2>Email System Test</h2>
        <p>This is a test email from ${APP_NAME} to confirm your email system is configured correctly.</p>
        <p>✅ If you received this, your Gmail SMTP is working!</p>
        <p>Time sent: ${new Date().toLocaleString()}</p>
    `;
    return sendEmail(email, `${APP_NAME} - Email Test`, content);
}

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendSecurityAlertEmail,
    sendTestEmail
};
