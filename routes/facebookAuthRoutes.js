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
   CALLBACK (DEBUG VERSION)
===================================================== */
router.get('/callback', async (req, res) => {
  try {
    console.log("🔥 CALLBACK HIT");

    const { code, state } = req.query;

    if (!code) return res.redirect('/connect-facebook?error=no_code');
    if (state !== req.session.fb_oauth_state)
        return res.redirect('/connect-facebook?error=bad_state');

    delete req.session.fb_oauth_state;

    console.log("🔑 Exchanging token...");

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

    console.log("📡 Fetching pages...");

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

    console.log("📄 Pages received:", pages.length);

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
  console.log("📦 TEMP PAGES REQUEST");
  res.json({
    pages: req.session.fb_pages || [],
    token: req.session.fb_token || null
  });
});

/* =====================================================
   SAVE PAGES (FINAL FIX)
===================================================== */
router.post('/save-pages', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const sessionPages = req.session.fb_pages;

    console.log("💾 SAVE REQUEST:", { userId });

    if (!sessionPages) {
      return res.status(400).json({ error: "Session expired" });
    }

    const selected = req.body.pages || [];

    console.log("📌 Selected pages:", selected.length);

    let saved = 0;

    for (const p of sessionPages) {
      const isSelected = selected.find(x => x.id === p.id);
      if (!isSelected) continue;

      await Page.saveFacebookPage(userId, p);
      saved++;

      console.log("✅ SAVED:", p.name, p.id);
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
  const pages = await Page.find({ userId: req.session.userId });
  res.json(pages);
});

/* =====================================================
   DISCONNECT
===================================================== */
router.delete('/pages/:id', requireLogin, async (req, res) => {
  await Page.findOneAndUpdate(
    { userId: req.session.userId, pageId: req.params.id },
    { isConnected: false }
  );

  res.json({ success: true });
});

module.exports = router;
