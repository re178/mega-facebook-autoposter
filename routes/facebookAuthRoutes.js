// routes/facebookAuthRoutes.js (UPGRADED - PRODUCTION SAFE)

const express = require('express');
const router = express.Router();
const axios = require('axios');
const Page = require('../models/Page');

/* =========================
   AUTH MIDDLEWARE
========================= */
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

/* =========================
   FACEBOOK AUTH URL
========================= */
function getFacebookAuthUrl(state) {
    const fbAppId = process.env.FB_APP_ID;
    const redirectUri = process.env.FB_REDIRECT_URI;

    const scope =
        'pages_manage_posts,pages_read_engagement,pages_manage_metadata,pages_messaging,email,public_profile';

    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&scope=${scope}&response_type=code&state=${state}`;
}

/* =========================
   START OAUTH
========================= */
router.get('/connect', requireLogin, (req, res) => {
    // 🔐 state prevents CSRF attacks in OAuth
    const state = `${req.session.userId}-${Date.now()}`;
    req.session.fb_oauth_state = state;

    const authUrl = getFacebookAuthUrl(state);
    return res.redirect(authUrl);
});

/* =========================
   CALLBACK (SECURE)
========================= */
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    try {
        if (error) {
            return res.redirect('/connect-facebook?error=facebook_denied');
        }

        if (!code) {
            return res.redirect('/connect-facebook?error=no_code');
        }

        // 🔐 Validate state (IMPORTANT SECURITY FIX)
        if (!state || state !== req.session.fb_oauth_state) {
            return res.redirect('/connect-facebook?error=invalid_state');
        }

        delete req.session.fb_oauth_state;

        /* =========================
           GET ACCESS TOKEN
        ========================= */
        const tokenResponse = await axios.get(
            'https://graph.facebook.com/v20.0/oauth/access_token',
            {
                params: {
                    client_id: process.env.FB_APP_ID,
                    client_secret: process.env.FB_APP_SECRET,
                    redirect_uri: process.env.FB_REDIRECT_URI,
                    code
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        /* =========================
           GET PAGES
        ========================= */
        const pagesResponse = await axios.get(
            'https://graph.facebook.com/v20.0/me/accounts',
            {
                params: {
                    access_token: accessToken,
                    fields: 'id,name,access_token,category'
                }
            }
        );

        const pages = pagesResponse.data.data || [];

        if (!pages.length) {
            return res.redirect('/connect-facebook?error=no_pages');
        }

        /* =========================
           STORE IN SESSION (SAFE)
        ========================= */
        req.session.fb_access_token = accessToken;
        req.session.fb_pages = pages;

        return res.redirect('/connect-facebook?success=true');
    } catch (err) {
        console.error('OAuth callback error:', err.response?.data || err.message);
        return res.redirect('/connect-facebook?error=server_error');
    }
});

/* =========================
   GET CONNECTED PAGES
========================= */
router.get('/pages-session', requireLogin, (req, res) => {
    res.json({
        pages: req.session.fb_pages || [],
        connected: !!req.session.fb_access_token
    });
});

/* =========================
   SAVE PAGES TO DB
========================= */
router.post('/save-pages', requireLogin, async (req, res) => {
    try {
        const pages = req.session.fb_pages;
        const accessToken = req.session.fb_access_token;
        const userId = req.session.userId;

        if (!pages || !accessToken) {
            return res.status(400).json({ error: 'No Facebook session found' });
        }

        const saved = [];

        for (const page of pages) {
            const existing = await Page.findOne({ pageId: page.id });

            if (existing) {
                existing.name = page.name;
                existing.pageToken = page.access_token || accessToken;
                existing.userId = userId;
                existing.isConnected = true;
                await existing.save();
                saved.push(existing);
            } else {
                const newPage = await Page.create({
                    userId,
                    pageId: page.id,
                    name: page.name,
                    pageToken: page.access_token || accessToken,
                    isConnected: true
                });
                saved.push(newPage);
            }
        }

        res.json({ success: true, pages: saved });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   LIST USER PAGES
========================= */
router.get('/pages', requireLogin, async (req, res) => {
    try {
        const pages = await Page.find({
            userId: req.session.userId,
            isConnected: true
        });

        res.json(
            pages.map(p => ({
                _id: p._id,
                pageId: p.pageId,
                name: p.name,
                isConnected: p.isConnected,
                autoGenerationEnabled: p.autoGenerationEnabled
            }))
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   DISCONNECT PAGE
========================= */
router.delete('/pages/:pageId', requireLogin, async (req, res) => {
    try {
        const page = await Page.findOne({
            pageId: req.params.pageId,
            userId: req.session.userId
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        page.isConnected = false;
        page.pageToken = null;
        await page.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
