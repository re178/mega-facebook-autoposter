// routes/facebookAuthRoutes.js
const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const { getAccessTokenFromCode, getLongLivedToken, getUserPages, getFacebookAuthUrl } = require('../services/facebookOAuthService');

// Require login middleware
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// Start OAuth flow
router.get('/connect', requireLogin, (req, res) => {
    const authUrl = getFacebookAuthUrl();
    res.redirect(authUrl);
});

// OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const { code, error, error_description } = req.query;
        
        if (error) {
            console.error('Facebook OAuth error:', error, error_description);
            return res.redirect('/connect-facebook?error=facebook_denied');
        }
        
        if (!code) {
            return res.redirect('/connect-facebook?error=no_code');
        }
        
        // Exchange code for access token
        const shortLivedToken = await getAccessTokenFromCode(code);
        const longLivedToken = await getLongLivedToken(shortLivedToken);
        
        // Get user's pages
        const pages = await getUserPages(longLivedToken);
        
        if (!pages || pages.length === 0) {
            return res.redirect('/connect-facebook?error=no_pages');
        }
        
        // Store the session user ID (we need to get it from session)
        // The callback doesn't have session because it's a redirect from Facebook
        // We need to store state or use a different approach
        
        // For now, redirect to frontend with tokens (temporary)
        // Better approach: store in session or use state parameter
        res.redirect(`/connect-facebook?success=true&pages=${encodeURIComponent(JSON.stringify(pages))}&token=${longLivedToken}`);
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/connect-facebook?error=server_error');
    }
});

// Save connected pages (called from frontend)
router.post('/save-pages', requireLogin, async (req, res) => {
    try {
        const { pages, accessToken } = req.body;
        const userId = req.session.userId;
        
        if (!pages || !Array.isArray(pages)) {
            return res.status(400).json({ error: 'Invalid pages data' });
        }
        
        const savedPages = [];
        
        for (const page of pages) {
            // Check if page already exists
            const existingPage = await Page.findOne({ pageId: page.id });
            
            if (existingPage) {
                // Update existing page
                existingPage.name = page.name;
                existingPage.pageToken = page.access_token || accessToken;
                existingPage.userId = userId;
                existingPage.isConnected = true;
                await existingPage.save();
                savedPages.push(existingPage);
            } else {
                // Create new page
                const newPage = await Page.create({
                    userId: userId,
                    pageId: page.id,
                    name: page.name,
                    pageToken: page.access_token || accessToken,
                    isConnected: true
                });
                savedPages.push(newPage);
            }
        }
        
        res.json({ success: true, pages: savedPages });
        
    } catch (error) {
        console.error('Save pages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's connected pages
router.get('/pages', requireLogin, async (req, res) => {
    try {
        const pages = await Page.find({ userId: req.session.userId, isConnected: true });
        res.json(pages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Disconnect a page
router.delete('/pages/:pageId', requireLogin, async (req, res) => {
    try {
        const page = await Page.findOne({ pageId: req.params.pageId, userId: req.session.userId });
        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }
        
        page.isConnected = false;
        page.pageToken = null;
        page.pageTokenEncrypted = null;
        await page.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
