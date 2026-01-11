const axios = require('axios');

/**
 * postToFacebook
 * @param {string} pageId - Facebook Page ID
 * @param {string} pageToken - Facebook Page Access Token
 * @param {string} message - Text to post
 * @param {string} mediaUrl - Optional media URL (image/video)
 */
async function postToFacebook(pageId, pageToken, message, mediaUrl = '') {
  try {
    let endpoint;
    let params;

    if (mediaUrl) {
      // Image post
      endpoint = `https://graph.facebook.com/${pageId}/photos`;
      params = {
        url: mediaUrl,
        caption: message,
        access_token: pageToken
      };
    } else {
      // Text-only post
      endpoint = `https://graph.facebook.com/${pageId}/feed`;
      params = {
        message,
        access_token: pageToken
      };
    }

    const response = await axios.post(endpoint, params);

    if (!response.data || response.data.error) {
      throw new Error(response.data.error?.message || 'Unknown Facebook API error');
    }

    return response.data; // returns post ID or photo ID
  } catch (err) {
    throw new Error(`Facebook API error: ${err.message}`);
  }
}

module.exports = { postToFacebook };
