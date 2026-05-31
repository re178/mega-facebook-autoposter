const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Post content to Facebook page
 * @param {string} pageId - Facebook page ID
 * @param {string} pageToken - Facebook page access token
 * @param {string} text - Post message/caption
 * @param {string|null} mediaUrl - Optional image/video URL
 * @returns {object} Facebook API response data
 */
async function postToFacebook(pageId, pageToken, text, mediaUrl = null) {
  try {
    // TEXT-ONLY POST (no media)
    if (!mediaUrl) {
      const res = await axios.post(
        `${GRAPH_BASE}/${pageId}/feed`,
        { message: text },
        {
          params: { access_token: pageToken },
          timeout: 15000 // 15 seconds timeout
        }
      );
      return res.data;
    }

    // MEDIA POST (with image/video URL)
    // Facebook photos endpoint works for both images and videos
    const res = await axios.post(
      `${GRAPH_BASE}/${pageId}/photos`,
      {
        url: mediaUrl,
        caption: text
      },
      {
        params: { access_token: pageToken },
        timeout: 20000 // 20 seconds for media uploads
      }
    );

    return res.data;

  } catch (err) {
    throw normalizeFacebookError(err);
  }
}

/**
 * Reply to a comment on a Facebook post
 * @param {string} commentId - Facebook comment ID
 * @param {string} pageToken - Facebook page access token
 * @param {string} replyText - Reply message text
 * @returns {object} Facebook API response data
 */
async function replyToComment(commentId, pageToken, replyText) {
  try {
    const res = await axios.post(
      `${GRAPH_BASE}/${commentId}/comments`,
      { message: replyText },
      {
        params: { access_token: pageToken },
        timeout: 15000
      }
    );
    return res.data;
  } catch (err) {
    throw normalizeFacebookError(err);
  }
}

/**
 * Send a reply to a Facebook Messenger message
 * @param {string} psid - Page-scoped user ID (recipient)
 * @param {string} pageToken - Facebook page access token
 * @param {string} replyText - Reply message text
 * @returns {object} Facebook API response data
 */
async function sendMessengerReply(psid, pageToken, replyText) {
  try {
    const res = await axios.post(
      `${GRAPH_BASE}/me/messages`,
      {
        recipient: { id: psid },
        messaging_type: 'RESPONSE',
        message: { text: replyText }
      },
      {
        params: { access_token: pageToken },
        timeout: 15000
      }
    );
    return res.data;
  } catch (err) {
    throw normalizeFacebookError(err);
  }
}

/**
 * Normalize Facebook API errors into consistent format
 * @param {Error} err - Original error from axios
 * @returns {Error} Normalized error with Facebook-specific properties
 */
function normalizeFacebookError(err) {
  // Facebook API returned an error response
  if (err.response?.data?.error) {
    const fbErr = err.response.data.error;
    const error = new Error(fbErr.message);
    error.code = fbErr.code;
    error.subcode = fbErr.error_subcode;
    error.type = fbErr.type;
    error.isFacebook = true;
    error.fbtraceId = fbErr.fbtrace_id;
    return error;
  }

  // Timeout error (connection aborted)
  if (err.code === 'ECONNABORTED') {
    const timeoutError = new Error('Facebook request timeout');
    timeoutError.isTimeout = true;
    timeoutError.isFacebook = true;
    return timeoutError;
  }

  // Network error (no response)
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    const networkError = new Error('Network error connecting to Facebook');
    networkError.isNetwork = true;
    networkError.isFacebook = true;
    return networkError;
  }

  // Return original error if unknown
  return err;
}

module.exports = {
  postToFacebook,
  replyToComment,
  sendMessengerReply
};
