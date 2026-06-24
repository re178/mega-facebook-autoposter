// services/lipaService.js – Official IntaSend SDK Implementation
const IntaSend = require('intasend-node');
const crypto = require('crypto');

class IntaSendService {
    constructor() {
        this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
        this.secretKey = process.env.INTASEND_SECRET_KEY;
        this.testMode = process.env.INTASEND_TEST === 'true';

        // ✅ Validate required environment variables
        if (!this.publishableKey || !this.secretKey) {
            throw new Error(
                'Missing INTASEND_PUBLISHABLE_KEY or INTASEND_SECRET_KEY in environment variables.'
            );
        }

        // Initialize SDK – handles sandbox/production automatically
        this.intasend = new IntaSend(
            this.publishableKey,
            this.secretKey,
            this.testMode
        );

        // Collection API client for payments
        this.collection = this.intasend.collection();
    }

    /**
     * Initiate STK Push via official SDK
     */
    async initiateSTKPush({ phoneNumber, email, amount, narrative, apiRef }) {
        // ✅ Validate amount
        if (!amount || Number(amount) <= 0) {
            return {
                success: false,
                error: 'Invalid payment amount. Amount must be greater than 0.'
            };
        }

        // ✅ Format and validate phone number
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        if (!/^2547\d{8}$/.test(formattedPhone)) {
            return {
                success: false,
                error: 'Invalid phone number format. Use e.g., 2547XXXXXXXX.'
            };
        }

        try {
            const response = await this.collection.mpesaStkPush({
                first_name: 'Customer',
                last_name: '',
                email: email,
                amount: Number(amount),
                phone_number: formattedPhone, // ✅ use validated formatted phone
                narrative: narrative || 'Subscription Payment',
                api_ref: apiRef || `SUB_${Date.now()}`
            });

            return {
                success: true,
                data: response,
                invoiceId: response.invoice?.id || response.invoice_id,
                trackingId: response.tracking_id
            };
        } catch (error) {
            console.error('❌ IntaSend SDK STK Push error:', {
                message: error.message,
                response: error.response?.data,
                stack: error.stack
            });
            return {
                success: false,
                error: error.message || 'STK Push failed',
                details: error.response?.data || error
            };
        }
    }

    /**
     * Check payment status using official SDK
     */
    async checkPaymentStatus(invoiceId) {
        try {
            const response = await this.collection.status(invoiceId);
            return {
                success: true,
                status: response.invoice?.state || response.state,
                data: response
            };
        } catch (error) {
            console.error('❌ IntaSend SDK status error:', {
                message: error.message,
                response: error.response?.data,
                stack: error.stack
            });
            return {
                success: false,
                error: error.message || 'Status check failed'
            };
        }
    }

    /**
     * Verify webhook signature – used for callback security
     * ✅ Safe against length mismatch
     */
    verifyWebhookSignature(signature, body) {
        if (!signature || !body) return false;

        const webhookSecret = process.env.INTASEND_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn('Webhook secret not set – skipping verification');
            return true; // In production, you should always have this set!
        }

        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');

        // ✅ Safer comparison – handles different lengths without throwing
        const receivedBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');

        if (receivedBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
    }

    /**
     * Format phone to 254XXXXXXXX – required by IntaSend
     */
    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.slice(1);
        } else if (cleaned.startsWith('7') && cleaned.length === 10) {
            cleaned = '254' + cleaned;
        } else if (cleaned.startsWith('254') && cleaned.length === 12) {
            return cleaned;
        }
        return cleaned;
    }
}

module.exports = new IntaSendService();
