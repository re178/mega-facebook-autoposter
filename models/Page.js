const mongoose = require('mongoose');
const crypto = require('crypto');

/* =========================
   ENCRYPTION KEY
========================= */
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error("❌ TOKEN_ENCRYPTION_KEY must be 64 hex characters");
}

const IV_LENGTH = 16;

/* =========================
   ENCRYPT
========================= */
function encryptToken(token) {
    try {
        if (!token || !ENCRYPTION_KEY) return null;

        const iv = crypto.randomBytes(IV_LENGTH);
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;

    } catch (err) {
        console.error("❌ Encrypt error:", err.message);
        return null;
    }
}

/* =========================
   DECRYPT
========================= */
function decryptToken(data) {
    try {
        if (!data || !data.includes(':')) return null;

        const [ivHex, encrypted] = data.split(':');

        const iv = Buffer.from(ivHex, 'hex');
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (err) {
        console.error("❌ Decrypt error:", err.message);
        return null;
    }
}

/* =========================
   PAGE SCHEMA (CLEAN)
========================= */
const PageSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    pageId: {
        type: String,
        required: true
    },

    name: {
        type: String,
        required: true
    },

    // 🔥 SINGLE SOURCE OF TRUTH
    pageToken: {
        type: String,
        required: true
    },

    isConnected: {
        type: Boolean,
        default: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

/* =========================
   UNIQUE PER USER
========================= */
PageSchema.index({ userId: 1, pageId: 1 }, { unique: true });

/* =========================
   AUTO UPDATE TIME
========================= */
PageSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

/* =========================
   SAVE FUNCTION (FIXED)
========================= */
PageSchema.statics.saveFacebookPage = async function (userId, page) {

    if (!page.access_token) {
        console.error("❌ MISSING PAGE TOKEN:", page.name);
    }

    const encryptedToken = encryptToken(page.access_token);

    if (!encryptedToken) {
        console.error("❌ ENCRYPTION FAILED:", page.name);
    }

    return await this.findOneAndUpdate(
        { userId, pageId: page.id },
        {
            $set: {
                userId,
                pageId: page.id,
                name: page.name,
                pageToken: encryptedToken || page.access_token, // fallback
                isConnected: true,
                updatedAt: new Date()
            }
        },
        {
            upsert: true,
            new: true
        }
    );
};

/* =========================
   DECRYPT METHOD
========================= */
PageSchema.methods.getToken = function () {
    return decryptToken(this.pageToken);
};

module.exports = mongoose.model('Page', PageSchema);
