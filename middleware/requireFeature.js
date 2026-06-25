// middleware/requireFeature.js
const User = require('../models/User');
const Plan = require('../models/Plan');

module.exports = function requireFeature(featureName, options = {}) {
    return async (req, res, next) => {
        try {
            const userId = req.session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            // Admins bypass all checks
            if (user.role === 'admin') return next();

            // Suspended users cannot access any feature
            if (user.isActive === false) {
                return res.status(403).json({ error: 'Account suspended' });
            }

            // Check per-user feature overrides (if any)
            if (user.featureOverrides && user.featureOverrides.has(featureName)) {
                const override = user.featureOverrides.get(featureName);
                if (override === false || override === 0) {
                    return res.status(403).json({ error: 'Access restricted' });
                }
                if (override === true || override === -1) {
                    return next(); // unlimited access granted
                }
                // if it's a number, it's a custom limit, but we'll handle later
            }

            // Get the user's current plan
            const planName = user.subscription?.plan || 'free';
            const plan = await Plan.findOne({ name: planName, isActive: true });
            if (!plan) {
                return res.status(403).json({ error: 'No valid plan found' });
            }

            const featureConfig = plan.features[featureName];
            if (featureConfig === undefined) {
                return res.status(403).json({ error: 'Access restricted' });
            }

            // Boolean features: true = allowed, false = denied
            if (typeof featureConfig === 'boolean') {
                if (!featureConfig) {
                    return res.status(403).json({ error: 'Access restricted' });
                }
                return next();
            }

            // Numeric features: 0 = denied, -1 = unlimited, >0 = limit
            if (typeof featureConfig === 'number') {
                if (featureConfig === 0) {
                    return res.status(403).json({ error: 'Access restricted' });
                }
                if (featureConfig === -1) {
                    return next(); // unlimited
                }

                // Check monthly usage for certain features
                const isMonthly = options.period === 'monthly' || featureName.includes('PerMonth');
                if (isMonthly) {
                    // Reset counters if month has changed
                    const now = new Date();
                    const lastReset = user.usage?.lastResetDate || new Date(0);
                    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
                        user.usage.manualPostsThisMonth = 0;
                        user.usage.aiPostsThisMonth = 0;
                        user.usage.imagesThisMonth = 0;
                        user.usage.videosThisMonth = 0;
                        user.usage.lastResetDate = now;
                        await user.save();
                    }

                    const usage = getUsage(user, featureName);
                    if (usage >= featureConfig) {
                        return res.status(429).json({
                            error: `Monthly limit reached (${usage}/${featureConfig})`
                        });
                    }

                    // Attach usage info so route can increment after success
                    req.featureUsage = { feature: featureName, usage, limit: featureConfig };
                    return next();
                }

                // For non-monthly limits (e.g., pagesAllowed, teamMembers)
                const currentCount = getUsage(user, featureName);
                if (currentCount >= featureConfig) {
                    return res.status(403).json({ error: 'Limit reached' });
                }
                return next();
            }

            // Fallback: deny
            return res.status(403).json({ error: 'Access restricted' });

        } catch (err) {
            console.error('requireFeature error:', err);
            return res.status(500).json({ error: 'Server error' });
        }
    };
};

function getUsage(user, featureName) {
    const map = {
        manualPostsPerMonth: user.usage?.manualPostsThisMonth || 0,
        aiPostsPerMonth: user.usage?.aiPostsThisMonth || 0,
        imagesPerMonth: user.usage?.imagesThisMonth || 0,
        videosPerMonth: user.usage?.videosThisMonth || 0,
        pagesAllowed: () => user.pages?.length || 0, // if you track pages array
        templates: () => user.templates?.length || 0,
        teamMembers: () => user.teamMembers?.length || 0,
    };
    const val = map[featureName];
    return typeof val === 'function' ? val() : (val || 0);
}
