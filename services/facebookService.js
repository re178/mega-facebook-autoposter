const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';


async function postToFacebook(pageId, pageToken, text, mediaUrl = null) {
  try {
    // TEXT-ONLY POST
    if (!mediaUrl) {
      const res = await axios.post(
        `${GRAPH_BASE}/${pageId}/feed`,
        { message: text },
        {
          params: { access_token: pageToken },
          timeout: 15000
        }
      );
      return res.data;
    }

    // MEDIA POST (URL-based)
    const res = await axios.post(
      `${GRAPH_BASE}/${pageId}/photos`,
      {
        url: mediaUrl,
        caption: text
      },
      {
        params: { access_token: pageToken },
        timeout: 20000
      }
    );

    return res.data;

  } catch (err) {
    throw normalizeFacebookError(err);
  }
}


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


function normalizeFacebookError(err) {
  if (err.response?.data?.error) {
    const fbErr = err.response.data.error;
    const error = new Error(fbErr.message);
    error.code = fbErr.code;
    error.subcode = fbErr.error_subcode;
    error.type = fbErr.type;
    error.isFacebook = true;
    return error;
  }

  if (err.code === 'ECONNABORTED') {
    return new Error('Facebook request timeout');
  }

  return err;
}


module.exports = {
  postToFacebook,
  replyToComment,
  sendMessengerReply
};


