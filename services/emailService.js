// services/emailService.js - VIRALOOP Email System (Production Ready)

const nodemailer = require('nodemailer');
const axios = require('axios');

/* =========================================================
   CONFIG
========================================================= */

const APP_NAME = 'VIRALOOP';
const APP_URL = process.env.APP_URL || 'https://voxtraapp.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@voxtraapp.com';

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'auto';
const BREVO_API_KEY = process.env.BREVO_API_KEY;

/* =========================================================
   GMAIL TRANSPORTER
========================================================= */

const gmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100
});

// verify Gmail connection on startup
gmailTransporter.verify()
    .then(() => console.log("📧 Gmail SMTP ready"))
    .catch(err => console.error("❌ Gmail SMTP error:", err.message));

/* =========================================================
   EMAIL WRAPPER
========================================================= */

function getEmailWrapper(content, title) {
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title} - ${APP_NAME}</title>
<style>
body { font-family: Arial, sans-serif; background:#f5f5f5; margin:0; padding:0; }
.container { max-width:520px; margin:auto; background:#fff; padding:20px; border-radius:10px; }
.header { text-align:center; padding:20px; border-bottom:2px solid #22c55e; }
.header h1 { color:#22c55e; margin:0; }
.content { padding:20px; line-height:1.6; }
.button { background:#22c55e; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block; margin:10px 0; }
.warning { background:#fef3c7; padding:10px; border-radius:6px; font-size:12px; color:#92400e; margin-top:15px; }
.footer { text-align:center; font-size:12px; color:#888; padding:20px; border-top:1px solid #eee; margin-top:20px; }
.footer a { color:#22c55e; text-decoration:none; }
</style>
</head>
<body>
<div class="container">
    <div class="header"><h1>${APP_NAME}</h1></div>
    <div class="content">${content}</div>
    <div class="footer">
        <p>
            <a href="${APP_URL}/privacy">Privacy</a> |
            <a href="${APP_URL}/terms">Terms</a> |
            <a href="mailto:${SUPPORT_EMAIL}">Support</a>
        </p>
        <p>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
    </div>
</div>
</body>
</html>
`;
}

/* =========================================================
   CORE EMAIL SENDER
========================================================= */

async function sendEmail(to, subject, htmlContent) {
    const html = getEmailWrapper(htmlContent, subject);

    try {
        // AUTO MODE
        if (EMAIL_PROVIDER === 'auto') {

            // TRY BREVO FIRST
            if (BREVO_API_KEY) {
                try {
                    await sendViaBrevo(to, subject, html);
                    console.log(`📧 Email sent via Brevo to ${to}`);
                    return { success: true, provider: 'brevo' };
                } catch (err) {
                    console.error("⚠️ Brevo failed:", err.message);
                }
            }

            // FALLBACK TO GMAIL
            const info = await gmailTransporter.sendMail({
                from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });

            console.log(`📧 Email sent via Gmail to ${to}`);
            return {
                success: true,
                provider: 'gmail',
                messageId: info.messageId
            };
        }

        // FORCED GMAIL
        if (EMAIL_PROVIDER === 'gmail') {
            const info = await gmailTransporter.sendMail({
                from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });

            return { success: true, provider: 'gmail', messageId: info.messageId };
        }

        // FORCED BREVO
        if (EMAIL_PROVIDER === 'brevo') {
            await sendViaBrevo(to, subject, html);
            return { success: true, provider: 'brevo' };
        }

        return { success: false, error: 'Invalid EMAIL_PROVIDER' };

    } catch (error) {
        console.error("❌ Email send failed:", error.message);

        // FINAL FALLBACK
        try {
            const info = await gmailTransporter.sendMail({
                from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });

            return {
                success: true,
                provider: 'gmail-fallback',
                messageId: info.messageId
            };
        } catch (finalErr) {
            return { success: false, error: finalErr.message };
        }
    }
}

/* =========================================================
   BREVO SENDER
========================================================= */

async function sendViaBrevo(to, subject, html) {
    const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
            sender: {
                name: APP_NAME,
                email: SUPPORT_EMAIL
            },
            to: [{ email: to }],
            subject,
            htmlContent: html
        },
        {
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );

    return response.data;
}

/* =========================================================
   VERIFICATION EMAIL (WITH SPAM FOLDER WARNING)
========================================================= */

async function sendVerificationEmail(email, token) {
    const url = `${APP_URL}/api/auth/verify-email?token=${token}`;
    return sendEmail(email, `Verify Your Email - ${APP_NAME}`, `
        <h2>Welcome to ${APP_NAME}! 🚀</h2>
        <p>Thank you for signing up. Please verify your email address to get started:</p>
        <p style="text-align: center;">
            <a href="${url}" class="button">✅ Verify My Account</a>
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
            Or copy and paste this link: ${url}
        </p>
        <div class="warning">
            ⚠️ <strong>Check your spam folder!</strong> If you don't see our email in your inbox, please check your spam/junk folder and mark it as "Not Spam".
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
            This link expires in 24 hours. If you didn't create this account, please ignore this email.
        </p>
    `);
}

/* =========================================================
   WELCOME EMAIL (AFTER VERIFICATION)
========================================================= */

async function sendWelcomeEmail(email, name) {
    return sendEmail(email, `Welcome to ${APP_NAME}! 🎉`, `
        <h2>Welcome ${name || 'there'}! 👋</h2>
        <p>Your email has been successfully verified. You're now ready to use ${APP_NAME}!</p>
        <p>Here's what you can do:</p>
        <ul>
            <li>📘 Connect your Facebook pages</li>
            <li>📅 Schedule posts in advance</li>
            <li>🤖 Use AI to generate engaging content</li>
            <li>📊 Track your posting performance</li>
        </ul>
        <p style="text-align: center;">
            <a href="${APP_URL}/login" class="button">Go to Dashboard</a>
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
            Need help? Contact us at ${SUPPORT_EMAIL}
        </p>
    `);
}

/* =========================================================
   PASSWORD RESET EMAIL
========================================================= */

async function sendPasswordResetEmail(email, token) {
    const url = `${APP_URL}/reset-password?token=${token}`;
    return sendEmail(email, `Reset Your Password - ${APP_NAME}`, `
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p style="text-align: center;">
            <a href="${url}" class="button">🔑 Reset Password</a>
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
            Or copy and paste this link: ${url}
        </p>
        <div class="warning">
            ⚠️ This link expires in 1 hour. If you didn't request this, please ignore this email.
        </div>
    `);
}

async function sendTestEmail(email) {
    return sendEmail(email, `Test Email - ${APP_NAME}`, `<h2>Email System Working ✅</h2><p>Your email system is configured correctly.</p>`);
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendTestEmail
};
