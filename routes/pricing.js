const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');

// Public pricing endpoint – no authentication required
router.get('/', async (req, res) => {
    try {
        const settings = await SystemSettings.findOne();
        const pricing = settings?.pricing || {
            pro: { priceUSD: 29, priceKES: 3500 },
            enterprise: { priceUSD: 99, priceKES: 12000 }
        };
        res.json(pricing);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
