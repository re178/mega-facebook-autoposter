// Services/lipaService.js
const axios = require('axios');

const getBaseURL = () => {
  return process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
};

const getAccessToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const response = await axios.get(
    `${getBaseURL()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
};

const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '254' + cleaned.slice(1);
  if (!cleaned.startsWith('254')) cleaned = '254' + cleaned;
  return cleaned;
};

const stkPush = async (phoneNumber, amount, accountReference = 'Payment') => {
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const response = await axios.post(
    `${getBaseURL()}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formatPhoneNumber(phoneNumber),
      PartyB: shortcode,
      PhoneNumber: formatPhoneNumber(phoneNumber),
      CallBackURL: process.env.CALLBACK_URL,
      AccountReference: accountReference.substring(0, 12),
      TransactionDesc: 'Wallet Top-Up',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

module.exports = { stkPush };
