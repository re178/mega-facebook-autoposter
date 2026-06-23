const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        enum: ['free', 'pro', 'premium', 'enterprise']
    },
    label: {
        type: String,
        required: true
    },
    priceUSD: {
        type: Number,
        default: 0
    },
    priceKES: {
        type: Number,
        default: 0
    },
    durationDays: {
        type: Number,
        default: 30
    },
    features: {
        aiTopics: { type: Number, default: 0 },
        aiPostsPerMonth: { type: Number, default: 0 },
        manualPostsPerMonth: { type: Number, default: 0 },
        pagesAllowed: { type: Number, default: 0 },
        templates: { type: Number, default: 0 },
        ads: { type: Boolean, default: false },
        comments: { type: Boolean, default: false },
        analyticsAdvanced: { type: Boolean, default: false },
        pageProfile: { type: Boolean, default: false },
        reports: { type: Boolean, default: false },
        broadcastsSend: { type: Boolean, default: false },
        teamMembers: { type: Number, default: 0 }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    order: {
        type: Number,
        default: 0 // for UI ordering
    }
}, { timestamps: true });

// Ensure at least one default plan (free)
PlanSchema.statics.ensureDefaults = async function() {
    const count = await this.countDocuments();
    if (count === 0) {
        const defaultPlans = [
            {
                name: 'free',
                label: 'Free',
                priceUSD: 0,
                priceKES: 0,
                durationDays: 30,
                features: {
                    aiTopics: 1,
                    aiPostsPerMonth: 5,
                    manualPostsPerMonth: 10,
                    pagesAllowed: 1,
                    templates: 0,
                    ads: false,
                    comments: false,
                    analyticsAdvanced: false,
                    pageProfile: false,
                    reports: false,
                    broadcastsSend: false,
                    teamMembers: 0
                },
                isActive: true,
                isDefault: true,
                order: 0
            },
            {
                name: 'pro',
                label: 'Pro',
                priceUSD: 29,
                priceKES: 3500,
                durationDays: 30,
                features: {
                    aiTopics: -1, // -1 means unlimited
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: 10,
                    templates: 20,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: false,
                    teamMembers: 0
                },
                isActive: true,
                isDefault: false,
                order: 1
            },
            {
                name: 'premium',
                label: 'Premium',
                priceUSD: 59,
                priceKES: 7000,
                durationDays: 30,
                features: {
                    aiTopics: -1,
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: 50,
                    templates: 50,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: true,
                    teamMembers: 3
                },
                isActive: true,
                isDefault: false,
                order: 2
            },
            {
                name: 'enterprise',
                label: 'Enterprise',
                priceUSD: 99,
                priceKES: 12000,
                durationDays: 30,
                features: {
                    aiTopics: -1,
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: -1,
                    templates: -1,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: true,
                    teamMembers: 5
                },
                isActive: true,
                isDefault: false,
                order: 3
            }
        ];
        await this.insertMany(defaultPlans);
        console.log('✅ Default plans seeded.');
    }
};

module.exports = mongoose.model('Plan', PlanSchema);
