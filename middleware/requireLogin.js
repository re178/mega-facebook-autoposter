module.exports = function requireLogin(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }

    return res.status(401).json({
        error: 'Unauthorized'
    });
};
