// services/lipaService.js – IntaSend API wrapper (FIXED URL)
const axios = require('axios');
const crypto = require('crypto');

class IntaSendService {
    constructor() {
        this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
        this.secretKey = process.env.INTASEND_SECRET_KEY;
        this.testMode = process.env.INTASEND_TEST === 'true';

        // ✅ FIXED: base URL without '/api/'
        this.baseUrl = this.testMode
            ? 'https://sandbox.intasend.com/'
            : 'https://payment.intasend.com/';

        this.authToken = Buffer.from(
            `${this.publishableKey}:${this.secretKey}`
        ).toString('base64');
    }

    /**
     * Initiate STK Push via IntaSend
     */
    async initiateSTKPush({ phoneNumber, email, amount, narrative, apiRef }) {
        // ✅ FIXED: correct API path – remove duplicate '/api/'
        const url = `${this.baseUrl}api/v1/collection/mpesa_stk_push/`;

        const payload = {
            phone_number: phoneNumber,
            email,
            amount,
            currency: 'KES',
            narrative: narrative || 'Subscription Payment',
            api_ref: apiRef || `SUB_${Date.now()}`
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Basic ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return {
                success: true,
                data: response.data,
                invoiceId: response.data.invoice?.id || response.data.invoice_id,
                trackingId: response.data.tracking_id
            };
        } catch (error) {
            console.error('IntaSend STK Push error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                details: error.response?.data
            };
        }
    }

    /**
     * Check payment status by invoice ID
     */
    async checkPaymentStatus(invoiceId) {
        const url = `${this.baseUrl}api/v1/collection/status/${invoiceId}/`;
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Basic ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return {
                success: true,
                status: response.data.invoice?.state || response.data.state,
                data: response.data
            };
        } catch (error) {
            console.error('IntaSend status error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Verify webhook signature (HMAC-SHA256)
     */
    verifyWebhookSignature(signature, body) {
        if (!signature || !body) return false;
        const webhookSecret = process.env.INTASEND_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn('Webhook secret not set – skipping verification');
            return true;
        }
        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');
        // Constant‑time comparison
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    }

    /**
     * Format phone number to IntaSend format (2547XXXXXXXX)
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
