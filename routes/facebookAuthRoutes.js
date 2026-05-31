const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Page = require('../models/Page');

const router = express.Router();

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;

const REDIRECT_URI =
  process.env.FB_REDIRECT_URI ||
  `${process.env.APP_URL}/api/facebook/callback`;

/* =====================================================
   LOGIN CHECK
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

  console.log("🔗 FACEBOOK CONNECT INITIATED");

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

  res.redirect(url);
});

/* =====================================================
   CALLBACK (GET PAGES + TOKENS)
===================================================== */
router.get('/callback', async (req, res) => {
  try {
    console.log("🔥 FACEBOOK CALLBACK HIT");

    const { code, state } = req.query;

    if (!code) {
      return res.redirect('/connect-facebook?error=no_code');
    }

    if (!state || state !== req.session.fb_oauth_state) {
      return res.redirect('/connect-facebook?error=bad_state');
    }

    delete req.session.fb_oauth_state;

    // 1. Exchange CODE FOR USER TOKEN
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

    const userAccessToken = tokenRes.data.access_token;

    console.log("🔑 USER TOKEN RECEIVED");

    // 2. GET PAGES WITH PAGE TOKENS
    const pagesRes = await axios.get(
      'https://graph.facebook.com/v20.0/me/accounts',
      {
        params: {
          access_token: userAccessToken,
          fields: 'id,name,access_token'
        }
      }
    );

    const pages = pagesRes.data.data || [];

    console.log(`📄 PAGES FOUND: ${pages.length}`);

    if (!pages.length) {
      return res.redirect('/connect-facebook?error=no_pages');
    }

    // 3. STORE IN SESSION ONLY
    req.session.fb_pages = pages;
    req.session.fb_token = userAccessToken;

    console.log("💾 SESSION STORED SUCCESSFULLY");

    return res.redirect('/connect-facebook?success=true');

  } catch (err) {
    console.error("❌ CALLBACK ERROR:", err.response?.data || err.message);
    return res.redirect('/connect-facebook?error=server_error');
  }
});

/* =====================================================
   TEMP PAGES (FRONTEND FETCHES THIS)
===================================================== */
router.get('/temp-pages', requireLogin, (req, res) => {
  console.log("📦 TEMP PAGES FETCHED");

  res.json({
    pages: req.session.fb_pages || [],
    token: req.session.fb_token || null
  });
});

/* =====================================================
   SAVE PAGES (FIXED - USE SESSION ONLY)
===================================================== */
router.post('/save-pages', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const sessionPages = req.session.fb_pages;

    if (!sessionPages || sessionPages.length === 0) {
      return res.status(400).json({ error: "Session expired or no pages found" });
    }

    const selectedIds = req.body.pages || [];

    if (!selectedIds.length) {
      return res.status(400).json({ error: "No pages selected" });
    }

    console.log("💾 SAVE REQUEST RECEIVED");
    console.log("👤 USER:", userId);
    console.log("📌 SELECTED IDS:", selectedIds);

    let saved = 0;

    for (const page of sessionPages) {

      if (!selectedIds.includes(page.id)) continue;

      console.log("🔐 SAVING PAGE:", page.name);

      await Page.findOneAndUpdate(
        { userId, pageId: page.id },
        {
          userId,
          pageId: page.id,
          name: page.name,

          // 🔥 THIS FIX SOLVES YOUR ISSUE
          pageToken: page.access_token,

          isConnected: true,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      saved++;
    }

    console.log(`✅ TOTAL SAVED: ${saved}`);

    return res.json({
      success: true,
      saved
    });

  } catch (err) {
    console.error("❌ SAVE ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   GET USER PAGES (FROM DB)
===================================================== */
router.get('/pages', requireLogin, async (req, res) => {
  try {
    const pages = await Page.find({
      userId: req.session.userId,
      isConnected: true
    });

    res.json(pages);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

/* =====================================================
   DISCONNECT PAGE
===================================================== */
router.delete('/pages/:id', requireLogin, async (req, res) => {
  try {
    await Page.findOneAndUpdate(
      {
        userId: req.session.userId,
        pageId: req.params.id
      },
      {
        isConnected: false
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

module.exports = router;
