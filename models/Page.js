const mongoose = require('mongoose');
const crypto = require('crypto');

// ============================================
// TOKEN ENCRYPTION (Security)
// ============================================
// Get encryption key from environment variables (must be 32 hex characters)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES, this is always 16

// Function to encrypt a token before storing in database
function encryptToken(token) {
    if (!token || !ENCRYPTION_KEY) return token;
    
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(
            'aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY, 'hex'), 
            iv
        );
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        // Return iv + encrypted token so we can decrypt later
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        return token; // Fallback to plain text (but log error)
    }
}

// Function to decrypt a token when needed
function decryptToken(encryptedToken) {
    if (!encryptedToken || !ENCRYPTION_KEY) return encryptedToken;
    if (!encryptedToken.includes(':')) return encryptedToken; // Already plain text
    
    try {
        const parts = encryptedToken.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY, 'hex'), 
            iv
        );
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return encryptedToken; // Return as-is if decryption fails
    }
}

// ============================================
// PAGE SCHEMA
// ============================================
const PageSchema = new mongoose.Schema({
    // Basic page information
    name: {
        type: String,
        required: true
    },
    
    pageId: {
        type: String,
        required: true,
        unique: true
    },
    
    // Original plain token (will be encrypted before saving)
    pageToken: {
        type: String,
        required: true,
        set: function(token) {
            // When setting pageToken, automatically encrypt it
            if (token && token !== this._originalToken) {
                this._encryptedToken = encryptToken(token);
                return token; // Store plain temporarily, will be cleared in pre-save
            }
            return token;
        }
    },
    
    // Encrypted token storage (actual stored field)
    encryptedToken: {
        type: String,
        select: false // Don't return by default
    },
    
    // Page ownership (which user owns this page)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Connection status
    isConnected: {
        type: Boolean,
        default: true
    },
    
    // Token expiry (Facebook tokens expire after ~60 days)
    tokenExpiresAt: {
        type: Date,
        default: null
    },
    
    // Auto-generation settings
    autoGenerationEnabled: {
        type: Boolean,
        default: false
    },
    
    // When we last synced page data
    lastSyncedAt: {
        type: Date,
        default: Date.now
    },
    
    // Facebook page category (e.g., 'Business', 'Artist')
    category: {
        type: String,
        default: null
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

// ============================================
// PRE-SAVE MIDDLEWARE (Encrypt token before saving)
// ============================================
PageSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // If pageToken was modified and we have an encryption key
    if (this.isModified('pageToken') && this.pageToken && ENCRYPTION_KEY) {
        // Encrypt the token
        this.encryptedToken = encryptToken(this.pageToken);
        // Remove plain token from memory (optional - clears after save)
        // this.pageToken = undefined;
    }
    
    next();
});

// ============================================
// INSTANCE METHODS
// ============================================

// Get decrypted token for API calls
PageSchema.methods.getDecryptedToken = function() {
    // First try to get from encrypted storage
    if (this.encryptedToken) {
        return decryptToken(this.encryptedToken);
    }
    // Fallback to plain token (for backward compatibility)
    return this.pageToken;
};

// Check if token is expired or about to expire (within 7 days)
PageSchema.methods.isTokenExpiringSoon = function() {
    if (!this.tokenExpiresAt) return false;
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return this.tokenExpiresAt < sevenDaysFromNow;
};

// Refresh token (call Facebook API to get new token)
PageSchema.methods.needsRefresh = function() {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt < new Date();
};

// ============================================
// STATIC METHODS
// ============================================

// Find all connected pages for a user
PageSchema.statics.findConnectedPages = function(userId) {
    return this.find({ userId, isConnected: true });
};

// Find a page by Facebook page ID and decrypt its token
PageSchema.statics.findPageWithToken = async function(pageId, userId) {
    const page = await this.findOne({ pageId, userId, isConnected: true });
    if (!page) return null;
    
    // Return page with decrypted token
    return {
        ...page.toObject(),
        pageToken: page.getDecryptedToken()
    };
};

// ============================================
// INDEXES (for faster queries)
// ============================================
PageSchema.index({ pageId: 1 });
PageSchema.index({ userId: 1 });
PageSchema.index({ userId: 1, isConnected: 1 });
PageSchema.index({ tokenExpiresAt: 1 }); // For finding expired tokens

// ============================================
// EXPORT
// ============================================
module.exports = mongoose.model('Page', PageSchema);
