const mongoose = require('mongoose');
const crypto = require('crypto');

/* =========================
   ENCRYPTION KEY CHECK
========================= */
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error("❌ TOKEN_ENCRYPTION_KEY must be 64 hex characters");
}

const IV_LENGTH = 16;

/* =========================
   ENCRYPT FUNCTION
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
   DECRYPT FUNCTION
========================= */
function decryptToken(data) {
    try {
        if (!data || !data.includes(':')) return data;

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
   PAGE SCHEMA
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

    encryptedToken: {
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
   UNIQUE PER USER + PAGE
========================= */
PageSchema.index({ userId: 1, pageId: 1 }, { unique: true });

/* =========================
   AUTO TIMESTAMP
========================= */
PageSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

/* =========================
   SAVE FUNCTION (IMPORTANT)
========================= */
PageSchema.statics.saveFacebookPage = async function (userId, page) {

    if (!page.access_token) {
        console.log("❌ NO PAGE TOKEN RECEIVED:", page);
    }

    const encrypted = encryptToken(page.access_token);

    if (!encrypted) {
        console.log("❌ ENCRYPTION FAILED for:", page.name);
    }

    return await this.findOneAndUpdate(
        { userId, pageId: page.id },
        {
            $set: {
                userId,
                pageId: page.id,
                name: page.name,
                encryptedToken: encrypted,
                isConnected: true,
                updatedAt: new Date()
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};

/* =========================
   GET TOKEN
========================= */
PageSchema.methods.getToken = function () {
    return decryptToken(this.encryptedToken);
};

module.exports = mongoose.model('Page', PageSchema);
