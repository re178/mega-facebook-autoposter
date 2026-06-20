// Services/lipaService.js
const axios = require('axios');

// --- SAFE ENVIRONMENT VARIABLE CHECKER ---
function checkEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    console.log(`❌ ${name}: MISSING`);
    return false;
  }
  console.log(`✅ ${name}: Set (length: ${value.length})`);
  return true;
}

// --- CHECK ALL VARS ON LOAD (Runs once when server starts) ---
console.log('\n🔍 MPESA ENVIRONMENT VARIABLES CHECK:');
const allGood = checkEnvVar('MPESA_CONSUMER_KEY') &&
                checkEnvVar('MPESA_CONSUMER_SECRET') &&
                checkEnvVar('MPESA_PASSKEY') &&
                checkEnvVar('MPESA_SHORTCODE') &&
                checkEnvVar('MPESA_ENVIRONMENT') &&
                checkEnvVar('CALLBACK_URL');

if (!allGood) {
  console.error('❌ CRITICAL: One or more M-Pesa environment variables are missing!');
} else {
  console.log(`✅ Environment set to: ${process.env.MPESA_ENVIRONMENT}`);
}
console.log('-------------------------------------------\n');

// --- SERVICE FUNCTIONS ---
const getBaseURL = () => {
  const env = process.env.MPESA_ENVIRONMENT || 'sandbox';
  const url = env === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';
  console.log(`🌍 Using API Base URL: ${url}`);
  return url;
};

const getAccessToken = async () => {
  console.log('🔄 Getting access token...');
  
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  
  // Just making sure they exist without printing them
  if (!consumerKey || !consumerSecret) {
    throw new Error('Consumer Key or Secret is missing');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(
      `${getBaseURL()}/oauth/v1/generate?grant_type=client_credentials`,
      { 
        headers: { 
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log('✅ Access token obtained successfully');
    return response.data.access_token;
    
  } catch (error) {
    console.error('❌ Token error status:', error.response?.status);
    console.error('❌ Token error data:', JSON.stringify(error.response?.data || error.message));
    throw new Error(`Failed to get access token: ${error.response?.data?.errorMessage || error.message}`);
  }
};

const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '254' + cleaned.slice(1);
  if (!cleaned.startsWith('254')) cleaned = '254' + cleaned;
  console.log(`📱 Formatted phone: ${cleaned}`);
  return cleaned;
};

const stkPush = async (phoneNumber, amount, accountReference = 'Payment') => {
  console.log(`\n💳 Initiating STK Push for ${phoneNumber}, Amount: ${amount} KES`);
  
  try {
    const token = await getAccessToken();
    
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const requestBody = {
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
    };

    console.log(`📤 Sending request to Safaricom...`);
    console.log(`📋 AccountRef: ${requestBody.AccountReference}, Callback: ${requestBody.CallBackURL}`);

    const response = await axios.post(
      `${getBaseURL()}/mpesa/stkpush/v1/processrequest`,
      requestBody,
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 second timeout
      }
    );

    console.log(`✅ STK Push Response Code: ${response.data.ResponseCode}`);
    console.log(`✅ STK Push Response Desc: ${response.data.ResponseDescription}`);
    
    return response.data;

  } catch (error) {
    console.error('❌ STK Push Error:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error(`   No response received: ${error.message}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    throw error;
  }
};

module.exports = { stkPush };
