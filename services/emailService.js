// services/emailService.js - VOXTRAAPP Email System (Stable Production Version)

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

// verify Gmail connection on startup (important)
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
body { font-family: Arial; background:#f5f5f5; margin:0; padding:0; }
.container { max-width:520px; margin:auto; background:#fff; padding:20px; border-radius:10px; }
.header { text-align:center; padding:20px; border-bottom:2px solid #22c55e; }
.header h1 { color:#22c55e; margin:0; }
.content { padding:20px; }
.button { background:#22c55e; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block; }
.footer { text-align:center; font-size:12px; color:#888; padding:20px; }
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
        <p>© ${new Date().getFullYear()} ${APP_NAME}</p>
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

        // FINAL FALLBACK (important)
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
   TEMPLATES
========================================================= */

async function sendWelcomeEmail(email, name) {
    return sendEmail(email, `Welcome to ${APP_NAME}`, `
        <h2>Welcome ${name || ''} 👋</h2>
        <p>Your account is ready.</p>
        <a href="${APP_URL}/login" class="button">Login</a>
    `);
}

async function sendVerificationEmail(email, token) {
    const url = `${APP_URL}/verify-email?token=${token}`;
    return sendEmail(email, 'Verify Your Email', `
        <h2>Verify Email</h2>
        <a href="${url}" class="button">Verify Account</a>
    `);
}

async function sendPasswordResetEmail(email, token) {
    const url = `${APP_URL}/reset-password?token=${token}`;
    return sendEmail(email, 'Reset Password', `
        <h2>Password Reset</h2>
        <a href="${url}" class="button">Reset Password</a>
    `);
}

async function sendTestEmail(email) {
    return sendEmail(email, 'Test Email', `<h2>Email System Working</h2>`);
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
