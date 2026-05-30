const mongoose = require('mongoose');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error("❌ TOKEN_ENCRYPTION_KEY must be 64 hex characters");
}

const IV_LENGTH = 16;

/* =====================================================
   ENCRYPT / DECRYPT
===================================================== */
function encryptToken(token) {
    if (!token || !ENCRYPTION_KEY) return token;

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;

    } catch (err) {
        console.error("Encrypt error:", err.message);
        return token;
    }
}

function decryptToken(encryptedToken) {
    if (!encryptedToken || !ENCRYPTION_KEY) return encryptedToken;
    if (!encryptedToken.includes(':')) return encryptedToken;

    try {
        const [ivHex, data] = encryptedToken.split(':');

        const iv = Buffer.from(ivHex, 'hex');
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (err) {
        console.error("Decrypt error:", err.message);
        return encryptedToken;
    }
}

/* =====================================================
   PAGE SCHEMA (CLEAN PRODUCTION VERSION)
===================================================== */
const PageSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    pageId: {
        type: String,
        required: true
        // ❌ NO UNIQUE HERE (FIXED FOR MULTI USERS)
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // store encrypted only (NO setter, NO pre-save conflict)
    encryptedToken: {
        type: String,
        required: true,
        select: false
    },

    isConnected: {
        type: Boolean,
        default: true
    },

    category: String,

    tokenExpiresAt: Date,

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

/* =====================================================
   IMPORTANT FIX: prevent duplicate per user
===================================================== */
PageSchema.index({ userId: 1, pageId: 1 }, { unique: true });

/* =====================================================
   PRE-SAVE (ONLY TIMESTAMP)
===================================================== */
PageSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

/* =====================================================
   METHODS
===================================================== */
PageSchema.methods.getDecryptedToken = function () {
    return decryptToken(this.encryptedToken);
};

/* =====================================================
   SAFE UPSERT (USED BY ROUTES)
===================================================== */
PageSchema.statics.savePage = async function (userId, page) {
    return await this.findOneAndUpdate(
        { userId, pageId: page.id },
        {
            $set: {
                name: page.name,
                encryptedToken: encryptToken(page.access_token),
                isConnected: true,
                category: page.category || null,
                updatedAt: new Date()
            }
        },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('Page', PageSchema);
