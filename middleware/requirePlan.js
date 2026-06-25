// middleware/requirePlan.js
const User = require('../models/User');

const PLAN_LEVEL = { free: 0, pro: 1, premium: 2, enterprise: 3 };

module.exports = function requirePlan(minPlan) {
    return async (req, res, next) => {
        try {
            const userId = req.session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.role === 'admin') return next();

            const userPlan = user.subscription?.plan || 'free';
            const userLevel = PLAN_LEVEL[userPlan] || 0;
            const requiredLevel = PLAN_LEVEL[minPlan] || 0;

            if (userLevel < requiredLevel) {
                return res.status(403).json({
                    error: `This feature requires "${minPlan}" plan or higher.`
                });
            }
            next();
        } catch (err) {
            console.error('requirePlan error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    };
};
