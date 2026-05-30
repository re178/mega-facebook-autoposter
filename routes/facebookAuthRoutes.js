// routes/facebookAuthRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Page = require('../models/Page');

// Require login middleware
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// Facebook OAuth URL generator
function getFacebookAuthUrl() {
    const fbAppId = process.env.FB_APP_ID;
    const redirectUri = process.env.FB_REDIRECT_URI;
    const scope = 'pages_manage_posts,pages_read_engagement,pages_manage_metadata,pages_messaging,email,public_profile';
    
    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
}

// Start OAuth flow
router.get('/connect', requireLogin, (req, res) => {
    const authUrl = getFacebookAuthUrl();
    console.log('Redirecting to Facebook OAuth:', authUrl);
    res.redirect(authUrl);
});

// OAuth callback
router.get('/callback', async (req, res) => {
    const { code, error, error_description } = req.query;
    
    console.log('OAuth callback received:', { code: !!code, error });
    
    if (error) {
        console.error('Facebook OAuth error:', error, error_description);
        return res.redirect('/connect-facebook?error=facebook_denied');
    }
    
    if (!code) {
        return res.redirect('/connect-facebook?error=no_code');
    }
    
    try {
        // Exchange code for access token
        const tokenResponse = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
            params: {
                client_id: process.env.FB_APP_ID,
                client_secret: process.env.FB_APP_SECRET,
                redirect_uri: process.env.FB_REDIRECT_URI,
                code: code
            }
        });
        
        const accessToken = tokenResponse.data.access_token;
        console.log('Access token obtained successfully');
        
        // Get user's pages
        const pagesResponse = await axios.get('https://graph.facebook.com/v20.0/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,category'
            }
        });
        
        const pages = pagesResponse.data.data || [];
        console.log(`Found ${pages.length} pages for user`);
        
        if (pages.length === 0) {
            return res.redirect('/connect-facebook?error=no_pages');
        }
        
        // Redirect to frontend with page data
        const encodedPages = encodeURIComponent(JSON.stringify(pages));
        res.redirect(`/connect-facebook?success=true&pages=${encodedPages}&token=${accessToken}`);
        
    } catch (err) {
        console.error('Callback error details:', err.response?.data || err.message);
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
        const safePages = pages.map(p => ({
            _id: p._id,
            pageId: p.pageId,
            name: p.name,
            isConnected: p.isConnected,
            autoGenerationEnabled: p.autoGenerationEnabled
        }));
        res.json(safePages);
    } catch (error) {
        console.error('Get pages error:', error);
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
        await page.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Disconnect page error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
