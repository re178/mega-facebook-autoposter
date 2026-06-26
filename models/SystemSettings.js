const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({

    maintenanceMode: {
        type: Boolean,
        default: false
    },

    // Pricing configuration (kept as is)
    pricing: {
        pro: {
            priceUSD: { type: Number, default: 29 },
            priceKES: { type: Number, default: 3500 }
        },
        enterprise: {
            priceUSD: { type: Number, default: 99 },
            priceKES: { type: Number, default: 12000 }
        }
    },

    // ✅ NEW: Global auto-generation toggle
    autoGeneration: {
        globalEnabled: {
            type: Boolean,
            default: true
        }
    },

    // Timestamps (kept as is)
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }

});

// Auto-update `updatedAt` on save
SystemSettingsSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
