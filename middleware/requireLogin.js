const User = require('../models/User');

module.exports = async function requireLogin(req, res, next) {
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            if (user) {
                req.user = user;
                return next();
            }
        } catch (err) {
            console.error('Error fetching user:', err);
        }
    }
    return res.status(401).json({
        error: 'Unauthorized'
    });
};
