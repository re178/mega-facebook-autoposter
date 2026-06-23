const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');

// GET all active plans (ordered by order field)
router.get('/', async (req, res) => {
    try {
        const plans = await Plan.find({ isActive: true }).sort({ order: 1 }).lean();
        res.json(plans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET a single plan by name
router.get('/:name', async (req, res) => {
    try {
        const plan = await Plan.findOne({ name: req.params.name, isActive: true }).lean();
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        res.json(plan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
