// services/emailService.js - VOXTRAAPP Email System (Gmail + Brevo Hybrid)

const nodemailer = require('nodemailer');
const axios = require('axios');

/* =========================================================
   CONFIG
========================================================= */

const APP_NAME = 'VIRALOOP';
const APP_URL = process.env.APP_URL || 'https://voxtraapp.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@voxtraapp.com';

// Choose provider: "gmail" | "brevo" | "auto"
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'auto';

/* =========================================================
   GMAIL TRANSPORTER (SMTP)
========================================================= */

const gmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* =========================================================
   BREVO CONFIG (API MODE)
========================================================= */

const BREVO_API_KEY = process.env.BREVO_API_KEY;

/* =========================================================
   EMAIL WRAPPER (BRANDING)
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
            <div class="header">
                <h1>${APP_NAME}</h1>
            </div>
            <div class="content">
                ${content}
            </div>
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
   CORE SENDER (AUTO SWITCH)
========================================================= */

async function sendEmail(to, subject, htmlContent) {
    const html = getEmailWrapper(htmlContent, subject);

    try {
        // =========================
        // AUTO MODE
        // =========================
        if (EMAIL_PROVIDER === 'auto') {

            // TRY BREVO FIRST (if key exists)
            if (BREVO_API_KEY) {
                try {
                    await sendViaBrevo(to, subject, html);
                    console.log(`✅ Email sent via Brevo to ${to}`);
                    return { success: true, provider: 'brevo' };
                } catch (e) {
                    console.log('⚠️ Brevo failed, falling back to Gmail');
                }
            }

            // FALLBACK TO GMAIL
            const info = await gmailTransporter.sendMail({
                from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });

            console.log(`✅ Email sent via Gmail to ${to}`);
            return { success: true, provider: 'gmail', messageId: info.messageId };
        }

        // =========================
        // FORCED GMAIL
        // =========================
        if (EMAIL_PROVIDER === 'gmail') {
            const info = await gmailTransporter.sendMail({
                from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            });

            return { success: true, provider: 'gmail', messageId: info.messageId };
        }

        // =========================
        // FORCED BREVO
        // =========================
        if (EMAIL_PROVIDER === 'brevo') {
            await sendViaBrevo(to, subject, html);
            return { success: true, provider: 'brevo' };
        }

    } catch (error) {
        console.error('❌ Email send failed:', error);
        return { success: false, error: error.message };
    }
}

/* =========================================================
   BREVO SENDER (API)
========================================================= */

async function sendViaBrevo(to, subject, html) {
    const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
            sender: {
                name: APP_NAME,
                email: process.env.EMAIL_USER
            },
            to: [{ email: to }],
            subject,
            htmlContent: html
        },
        {
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data;
}

/* =========================================================
   EMAIL TEMPLATES (UNCHANGED)
========================================================= */

async function sendWelcomeEmail(email, name) {
    const content = `
        <h2>Welcome ${name || ''} 👋</h2>
        <p>Welcome to ${APP_NAME}. Your automation system is ready.</p>
        <a href="${APP_URL}/login" class="button">Login</a>
    `;
    return sendEmail(email, `Welcome to ${APP_NAME}`, content);
}

async function sendVerificationEmail(email, token) {
    const url = `${APP_URL}/verify-email?token=${token}`;
    const content = `
        <h2>Verify Email</h2>
        <a href="${url}" class="button">Verify Account</a>
    `;
    return sendEmail(email, 'Verify Your Email', content);
}

async function sendPasswordResetEmail(email, token) {
    const url = `${APP_URL}/reset-password?token=${token}`;
    const content = `
        <h2>Password Reset</h2>
        <a href="${url}" class="button">Reset Password</a>
    `;
    return sendEmail(email, 'Reset Password', content);
}

async function sendTestEmail(email) {
    const content = `<h2>Test Email OK</h2>`;
    return sendEmail(email, 'Test Email', content);
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
