const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({

    maintenanceMode: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
