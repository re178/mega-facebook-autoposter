// services/facebookOAuthService.js - PRO OAuth System (V2 Stable)

const axios = require('axios');

const FACEBOOK_APP_ID = process.env.FB_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FB_APP_SECRET;

if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.error("❌ Missing FB_APP_ID or FB_APP_SECRET");
}

const REDIRECT_URI =
    process.env.FB_REDIRECT_URI ||
    `${process.env.APP_URL}/api/facebook/callback`;

/* =========================================================
   AXIOS INSTANCE (RETRY + TIMEOUT)
========================================================= */

const fbApi = axios.create({
    baseURL: 'https://graph.facebook.com/v20.0',
    timeout: 12000
});

// simple retry wrapper
async function safeRequest(fn, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
}

/* =========================================================
   AUTH URL
========================================================= */

function getFacebookAuthUrl() {
    const scope = [
        'pages_manage_posts',
        'pages_read_engagement',
        'pages_manage_metadata',
        'pages_messaging',
        'email',
        'public_profile'
    ].join(',');

    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
    )}&scope=${scope}&response_type=code&auth_type=rerequest`;
}

/* =========================================================
   EXCHANGE CODE → SHORT TOKEN
========================================================= */

async function getAccessTokenFromCode(code) {
    return safeRequest(async () => {
        const res = await fbApi.get('/oauth/access_token', {
            params: {
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                redirect_uri: REDIRECT_URI,
                code
            }
        });

        return res.data.access_token;
    });
}

/* =========================================================
   SHORT → LONG LIVED TOKEN (60 DAYS)
========================================================= */

async function getLongLivedToken(shortToken) {
    try {
        const res = await fbApi.get('/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                fb_exchange_token: shortToken
            }
        });

        return res.data.access_token;
    } catch (err) {
        console.error("⚠️ Long-lived token failed:", err.response?.data || err.message);
        return shortToken;
    }
}

/* =========================================================
   GET USER PAGES (CORE FIXED)
========================================================= */

async function getUserPages(accessToken) {
    return safeRequest(async () => {
        const res = await fbApi.get('/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,category,tasks'
            }
        });

        const pages = res.data?.data || [];

        console.log(`📄 Pages fetched: ${pages.length}`);

        return pages;
    });
}

/* =========================================================
   REFRESH PAGE TOKEN (SMART VERSION)
========================================================= */

async function refreshPageToken(pageId, userToken) {
    try {
        const res = await fbApi.get(`/${pageId}`, {
            params: {
                fields: 'access_token',
                access_token: userToken
            }
        });

        return res.data.access_token;
    } catch (err) {
        console.error("❌ Page token refresh failed:", err.response?.data || err.message);
        return null;
    }
}

/* =========================================================
   VALIDATE TOKEN (NEW)
========================================================= */

async function validateToken(token) {
    try {
        const res = await fbApi.get('/debug_token', {
            params: {
                input_token: token,
                access_token: `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
            }
        });

        return res.data?.data?.is_valid || false;
    } catch (err) {
        return false;
    }
}

/* =========================================================
   AUTO RECOVERY TOKEN FLOW (NEW PRO FEATURE)
========================================================= */

async function recoverPageAccess(page, userToken) {
    try {
        // 1. Try refresh
        let newToken = await refreshPageToken(page.pageId, userToken);

        // 2. If failed → fallback to user token
        if (!newToken) newToken = userToken;

        // 3. Validate
        const valid = await validateToken(newToken);

        return {
            token: valid ? newToken : null,
            valid
        };
    } catch (err) {
        console.error("❌ Recovery failed:", err.message);
        return { token: null, valid: false };
    }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    getFacebookAuthUrl,
    getAccessTokenFromCode,
    getLongLivedToken,
    getUserPages,
    refreshPageToken,
    validateToken,
    recoverPageAccess
};
