const User = require('../models/User');

module.exports = async function requireAdmin(req, res, next) {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await User.findById(req.session.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
