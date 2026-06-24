// services/lipaService.js – Using Official IntaSend Node.js SDK
const IntaSend = require('intasend-node');

class IntaSendService {
    constructor() {
        this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
        this.secretKey = process.env.INTASEND_SECRET_KEY;
        this.testMode = process.env.INTASEND_TEST === 'true';

        // ✅ Initialize the official SDK
        this.intasend = new IntaSend(
            this.publishableKey,
            this.secretKey,
            this.testMode  // true = sandbox, false = production
        );

        // Get the collection API client
        this.collection = this.intasend.collection();
    }

    /**
     * Initiate STK Push using the official SDK
     */
    async initiateSTKPush({ phoneNumber, email, amount, narrative, apiRef }) {
        try {
            // ✅ SDK handles the correct URL, authentication, and formatting
            const response = await this.collection.mpesaStkPush({
                first_name: 'Customer',
                last_name: '',
                email: email,
                amount: amount,
                phone_number: phoneNumber, // Format: 2547XXXXXXXX
                api_ref: apiRef || `SUB_${Date.now()}`,
                // Optional: host for callback
                // host: 'https://viraloopsocials.onrender.com'
            });

            console.log('✅ STK Push SDK Response:', response);

            return {
                success: true,
                data: response,
                invoiceId: response.invoice?.id || response.invoice_id,
                trackingId: response.tracking_id
            };
        } catch (error) {
            console.error('❌ IntaSend SDK STK Push error:', error);
            return {
                success: false,
                error: error.message || 'STK Push failed',
                details: error
            };
        }
    }

    /**
     * Check payment status using the official SDK
     */
    async checkPaymentStatus(invoiceId) {
        try {
            // ✅ SDK handles the correct URL
            const response = await this.collection.status(invoiceId);
            return {
                success: true,
                status: response.invoice?.state || response.state,
                data: response
            };
        } catch (error) {
            console.error('❌ IntaSend SDK status error:', error);
            return {
                success: false,
                error: error.message || 'Status check failed'
            };
        }
    }

    /**
     * Verify webhook signature – same as before
     */
    verifyWebhookSignature(signature, body) {
        if (!signature || !body) return false;
        const webhookSecret = process.env.INTASEND_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn('Webhook secret not set – skipping verification');
            return true;
        }
        const crypto = require('crypto');
        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    }

    /**
     * Format phone number – same as before
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
