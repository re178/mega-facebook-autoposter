const express = require('express');
const router = express.Router();
const Page = require('../models/Page');

/*
|--------------------------------------------------------------------------
| 
|--------------------------------------------------------------------------
*/
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

/*
|--------------------------------------------------------------------------
|
|--------------------------------------------------------------------------
*/

// Get all pages
router.get('/pages', requireLogin, async (req, res) => {
    try {
        const pages = await Page.find().sort({ name: 1 });
        res.json(pages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load pages' });
    }
});

// Add page manually
router.post('/pages', requireLogin, async (req, res) => {
    const { name, pageId, pageToken } = req.body;

    if (!name || !pageId || !pageToken) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const exists = await Page.findOne({ pageId });
        if (exists) {
            return res.status(409).json({ error: 'Page already exists' });
        }

        const page = await Page.create({ name, pageId, pageToken });
        res.json(page);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save page' });
    }
});

// Delete page
router.delete('/pages/:id', requireLogin, async (req, res) => {
    try {
        await Page.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete page' });
    }
});

/*
|--------------------------------------------------------------------------
| P
|--------------------------------------------------------------------------
*/

// Messaging
router.get('/messaging', requireLogin, (req, res) => {
    res.json({ status: 'Messaging ready' });
});

// Analytics
router.get('/analytics', requireLogin, (req, res) => {
    res.json({ status: 'Analytics ready' });
});

// Ads
router.get('/ads', requireLogin, (req, res) => {
    res.json({ status: 'Ads ready' });
});

// Comments
router.get('/comments', requireLogin, (req, res) => {
    res.json({ status: 'Comments ready' });
});

module.exports = router;
