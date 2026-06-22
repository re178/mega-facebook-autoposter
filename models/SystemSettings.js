const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({

    maintenanceMode: {
        type: Boolean,
        default: false
    },

    // ✅ NEW: Pricing configuration for Pro and Enterprise plans
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
