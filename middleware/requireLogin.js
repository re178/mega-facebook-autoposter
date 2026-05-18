const messages = await AdminMessage.find({ userId: req.user._id }) // ✅ Works now
module.exports = function requireLogin(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }

    return res.status(401).json({
        error: 'Unauthorized'
    });
};
