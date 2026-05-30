const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Page = require('../models/Page');

const router = express.Router();

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = process.env.FB_REDIRECT_URI || `${process.env.APP_URL}/api/facebook/callback`;

/* =====================================================
   REQUIRE LOGIN (only here, not duplicated in server.js)
===================================================== */
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

/* =====================================================
   CONNECT FACEBOOK
===================================================== */
router.get('/connect', requireLogin, (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');

    req.session.fb_oauth_state = state;

    const scope = [
        'pages_manage_posts',
        'pages_read_engagement',
        'pages_manage_metadata',
        'pages_messaging',
        'email',
        'public_profile'
    ].join(',');

    const url =
        `https://www.facebook.com/v20.0/dialog/oauth` +
        `?client_id=${FB_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${state}` +
        `&scope=${scope}` +
        `&response_type=code`;

    console.log("➡️ Redirecting to Facebook OAuth");
    res.redirect(url);
});

/* =====================================================
   CALLBACK
===================================================== */
router.get('/callback', async (req, res) => {
    try {
        console.log("🔥 Facebook callback hit");

        const { code, state, error } = req.query;

        if (error) {
            return res.redirect('/connect-facebook?error=facebook_denied');
        }

        if (!code) {
            return res.redirect('/connect-facebook?error=no_code');
        }

        // 🔐 VERIFY STATE
        if (!state || state !== req.session.fb_oauth_state) {
            return res.redirect('/connect-facebook?error=invalid_state');
        }

        delete req.session.fb_oauth_state;

        // 🔑 EXCHANGE TOKEN
        const tokenRes = await axios.get(
            'https://graph.facebook.com/v20.0/oauth/access_token',
            {
                params: {
                    client_id: FB_APP_ID,
                    client_secret: FB_APP_SECRET,
                    redirect_uri: REDIRECT_URI,
                    code
                }
            }
        );

        const accessToken = tokenRes.data.access_token;

        // 📄 GET PAGES
        const pagesRes = await axios.get(
            'https://graph.facebook.com/v20.0/me/accounts',
            {
                params: {
                    access_token: accessToken,
                    fields: 'id,name,access_token,category'
                }
            }
        );

        const pages = pagesRes.data.data || [];

        if (!pages.length) {
            return res.redirect('/connect-facebook?error=no_pages');
        }

        // 💾 STORE TEMP IN SESSION (IMPORTANT FIX)
        req.session.fb_pages = pages;
        req.session.fb_token = accessToken;

        return res.redirect('/connect-facebook?success=true');

    } catch (err) {
        console.error("❌ Callback error:", err.response?.data || err.message);
        return res.redirect('/connect-facebook?error=server_error');
    }
});

/* =====================================================
   GET TEMP PAGES (SAFE)
===================================================== */
router.get('/temp-pages', requireLogin, (req, res) => {
    return res.json({
        pages: req.session.fb_pages || [],
        token: req.session.fb_token || null
    });
});

/* =====================================================
   SAVE PAGES
===================================================== */
router.post('/save-pages', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { pages } = req.body;

        if (!pages?.length) {
            return res.status(400).json({ error: 'No pages selected' });
        }

        const saved = [];

        for (const p of pages) {
            let page = await Page.findOne({ pageId: p.id });

            if (!page) {
                page = await Page.create({
                    userId,
                    pageId: p.id,
                    name: p.name,
                    pageToken: p.access_token,
                    isConnected: true
                });
            } else {
                page.name = p.name;
                page.pageToken = p.access_token;
                page.isConnected = true;
                await page.save();
            }

            saved.push(page);
        }

        return res.json({
            success: true,
            count: saved.length
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   GET USER PAGES
===================================================== */
router.get('/pages', requireLogin, async (req, res) => {
    const pages = await Page.find({
        userId: req.session.userId,
        isConnected: true
    });

    res.json(pages);
});

/* =====================================================
   DISCONNECT PAGE
===================================================== */
router.delete('/pages/:pageId', requireLogin, async (req, res) => {
    await Page.updateOne(
        { pageId: req.params.pageId, userId: req.session.userId },
        { isConnected: false }
    );

    res.json({ success: true });
});

module.exports = router;
