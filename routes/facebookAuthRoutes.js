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
   AUTH MIDDLEWARE
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

  return res.redirect(url);
});

/* =====================================================
   CALLBACK (ONLY SESSION STORAGE - NO DB)
===================================================== */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/connect-facebook?error=facebook_denied');
    }

    if (!code) {
      return res.redirect('/connect-facebook?error=no_code');
    }

    if (!state || state !== req.session.fb_oauth_state) {
      return res.redirect('/connect-facebook?error=invalid_state');
    }

    delete req.session.fb_oauth_state;

    // Exchange token
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

    // Get pages
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

    // 🔥 STORE ONLY IN SESSION (NO DB)
    req.session.fb_pages = pages;
    req.session.fb_token = accessToken;

    return res.redirect('/connect-facebook?success=true');
  } catch (err) {
    console.error('FB callback error:', err.response?.data || err.message);
    return res.redirect('/connect-facebook?error=server_error');
  }
});

/* =====================================================
   TEMP PAGES (FRONTEND USES THIS)
===================================================== */
router.get('/temp-pages', requireLogin, (req, res) => {
  res.json({
    pages: req.session.fb_pages || [],
    token: req.session.fb_token || null
  });
});

/* =====================================================
   SAVE PAGES (SAFE + NO FLOODING + USER-ISOLATED)
===================================================== */
router.post('/save-pages', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const sessionPages = req.session.fb_pages;

    if (!userId) {
      return res.status(401).json({ error: 'No session user' });
    }

    if (!sessionPages?.length) {
      return res.status(400).json({ error: 'Session expired, reconnect Facebook' });
    }

    const selectedIds = req.body.pages?.map(p => p.id);

    if (!selectedIds?.length) {
      return res.status(400).json({ error: 'No pages selected' });
    }

    let count = 0;

    for (const page of sessionPages) {
      if (!selectedIds.includes(page.id)) continue;

      // 🔥 CORE FIX: USER + PAGE UNIQUE MATCH
      await Page.findOneAndUpdate(
        { userId, pageId: page.id },
        {
          userId,
          pageId: page.id,
          name: page.name,
          pageToken: page.access_token,
          isConnected: true
        },
        {
          upsert: true,
          new: true
        }
      );

      count++;
    }

    return res.json({
      success: true,
      saved: count
    });
  } catch (err) {
    console.error('SAVE ERROR:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =====================================================
   GET USER PAGES
===================================================== */
router.get('/pages', requireLogin, async (req, res) => {
  try {
    const pages = await Page.find({
      userId: req.session.userId,
      isConnected: true
    });

    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   DISCONNECT PAGE
===================================================== */
router.delete('/pages/:pageId', requireLogin, async (req, res) => {
  try {
    await Page.findOneAndUpdate(
      {
        userId: req.session.userId,
        pageId: req.params.pageId
      },
      {
        isConnected: false
      }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
