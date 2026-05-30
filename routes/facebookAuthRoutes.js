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
   CONNECT
===================================================== */
router.get('/connect', requireLogin, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.fb_oauth_state = state;

  console.log("🔗 FB CONNECT STARTED");

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=pages_manage_posts,pages_read_engagement,pages_manage_metadata,pages_messaging,email,public_profile` +
    `&response_type=code`;

  res.redirect(url);
});

/* =====================================================
   CALLBACK
===================================================== */
router.get('/callback', async (req, res) => {
  try {
    console.log("🔥 CALLBACK HIT");

    const { code, state } = req.query;

    if (!code) return res.redirect('/connect-facebook?error=no_code');
    if (state !== req.session.fb_oauth_state)
      return res.redirect('/connect-facebook?error=bad_state');

    delete req.session.fb_oauth_state;

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

    console.log("📄 Pages fetched:", pages.length);

    req.session.fb_pages = pages;
    req.session.fb_token = accessToken;

    res.redirect('/connect-facebook?success=true');

  } catch (err) {
    console.error("❌ CALLBACK ERROR:", err.response?.data || err.message);
    res.redirect('/connect-facebook?error=server_error');
  }
});

/* =====================================================
   TEMP PAGES
===================================================== */
router.get('/temp-pages', requireLogin, (req, res) => {
  console.log("📦 TEMP REQUEST");

  res.json({
    pages: req.session.fb_pages || [],
    token: req.session.fb_token || null
  });
});

/* =====================================================
   SAVE PAGES (FIXED + SAFE UPSERT)
===================================================== */
router.post('/save-pages', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const sessionPages = req.session.fb_pages;

    if (!sessionPages || !sessionPages.length) {
      return res.status(400).json({ error: "Session expired or empty" });
    }

    const selected = req.body.pages || [];

    console.log("💾 Saving pages:", selected.length);

    let saved = 0;

    for (const page of sessionPages) {
      const isSelected = selected.find(p => p.id === page.id);
      if (!isSelected) continue;

      await Page.findOneAndUpdate(
        { userId, pageId: page.id },
        {
          userId,
          pageId: page.id,
          name: page.name,
          pageToken: page.access_token,
          category: page.category || null,
          isConnected: true,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      saved++;

      console.log("✅ SAVED:", page.name);
    }

    res.json({
      success: true,
      saved
    });

  } catch (err) {
    console.error("❌ SAVE ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* =====================================================
   GET USER PAGES
===================================================== */
router.get('/pages', requireLogin, async (req, res) => {
  try {
    const pages = await Page.find({
      userId: req.session.userId
    });

    res.json(pages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

/* =====================================================
   DISCONNECT
===================================================== */
router.delete('/pages/:id', requireLogin, async (req, res) => {
  try {
    await Page.findOneAndUpdate(
      { userId: req.session.userId, pageId: req.params.id },
      { isConnected: false }
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

module.exports = router;
