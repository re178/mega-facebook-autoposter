const SystemSettings = require('../models/SystemSettings');

module.exports = async function maintenanceMode(req, res, next) {
    try {
        const settings = await SystemSettings.findOne();

        if (settings && settings.maintenanceMode === true) {
            return res.status(503).json({
                error: 'System is currently under maintenance'
            });
        }

        next();

    } catch (err) {
        console.error(err);
        next();
    }
};
