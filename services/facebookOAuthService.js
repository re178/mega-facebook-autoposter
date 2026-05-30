// services/facebookOAuthService.js
const axios = require('axios');

const FACEBOOK_APP_ID = process.env.FB_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = process.env.FB_REDIRECT_URI || `${process.env.APP_URL}/api/facebook/callback`;

// Generate Facebook OAuth URL
function getFacebookAuthUrl() {
    const scope = 'pages_manage_posts,pages_read_engagement,pages_manage_metadata,pages_messaging';
    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scope}&response_type=code`;
}

// Exchange code for access token
async function getAccessTokenFromCode(code) {
    try {
        const response = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
            params: {
                client_id: FACEBOOK_APP_ID,
                redirect_uri: REDIRECT_URI,
                client_secret: FACEBOOK_APP_SECRET,
                code: code
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error.message);
        throw new Error('Failed to get access token');
    }
}

// Get long-lived access token (60 days)
async function getLongLivedToken(shortLivedToken) {
    try {
        const response = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Long-lived token error:', error.response?.data || error.message);
        return shortLivedToken; // Fallback to short-lived
    }
}

// Get user's Facebook pages
async function getUserPages(accessToken) {
    try {
        const response = await axios.get('https://graph.facebook.com/v20.0/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,category'
            }
        });
        return response.data.data || [];
    } catch (error) {
        console.error('Get pages error:', error.response?.data || error.message);
        throw new Error('Failed to fetch pages');
    }
}

// Refresh page token (if needed)
async function refreshPageToken(pageId, userToken) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v20.0/${pageId}`, {
            params: {
                fields: 'access_token',
                access_token: userToken
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Refresh token error:', error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    getFacebookAuthUrl,
    getAccessTokenFromCode,
    getLongLivedToken,
    getUserPages,
    refreshPageToken
};
