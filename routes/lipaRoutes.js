// routes/lipaRoutes.js
const express = require('express');
const router = express.Router();
const { stkPush } = require('../Services/lipaService');
const User = require('../models/User');

// --- Endpoint 1: Initiate Payment (Frontend calls this) ---
router.post('/stk-push', async (req, res) => {
  console.log('\n========================================');
  console.log(`📥 /stk-push request received at ${new Date().toISOString()}`);
  
  try {
    const { phone, amount, userId } = req.body;
    
    console.log(`📋 Request payload: userId=${userId}, phone=${phone}, amount=${amount}`);

    // --- Validation ---
    if (!phone || !amount || amount <= 0) {
      console.log('❌ Validation failed: Missing phone or invalid amount');
      return res.status(400).json({ 
        success: false, 
        message: 'Valid phone and amount required' 
      });
    }

    if (!userId) {
      console.log('❌ Validation failed: Missing userId');
      return res.status(400).json({ 
        success: false, 
        message: 'User ID required' 
      });
    }

    // --- Find User ---
    console.log(`🔍 Looking up user: ${userId}`);
    const user = await User.findById(userId);
    
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    console.log(`✅ User found: ${user.email}`);

    // --- Save phone if missing ---
    if (!user.phone) {
      console.log(`📝 Updating user's phone from ${user.phone} to ${phone}`);
      user.phone = phone.replace(/\D/g, '');
      await user.save();
      console.log(`✅ Phone updated successfully`);
    } else {
      console.log(`✅ User phone already set: ${user.phone}`);
    }

    // --- Initiate STK Push ---
    console.log(`📤 Calling stkPush service...`);
    const response = await stkPush(phone, amount, `TopUp-${user._id}`);
    
    console.log(`✅ STK Push initiated. CheckoutRequestID: ${response.CheckoutRequestID}`);
    
    // --- Save pending transaction ---
    user.transactions.push({
      type: 'deposit',
      amount: Math.round(amount),
      checkoutRequestID: response.CheckoutRequestID,
      status: 'pending',
      description: 'Wallet top-up'
    });
    await user.save();
    console.log(`✅ Pending transaction saved to database`);

    // --- Send success response ---
    res.status(200).json({
      success: true,
      message: 'STK Push sent. Check your phone.',
      checkoutRequestID: response.CheckoutRequestID,
    });
    
    console.log('✅ Request completed successfully');

  } catch (error) {
    console.error('\n❌ /stk-push ERROR:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    
    // Check if it's an Axios error with a response from Safaricom
    if (error.response) {
      console.error(`   Safaricom Status: ${error.response.status}`);
      console.error(`   Safaricom Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error'
    });
  }
  
  console.log('========================================\n');
});

// --- Endpoint 2: Safaricom Callback (Hit by Safaricom) ---
router.post('/callback', async (req, res) => {
  console.log('\n========================================');
  console.log(`📞 /callback received at ${new Date().toISOString()}`);
  console.log(`📋 Raw Body: ${JSON.stringify(req.body, null, 2)}`);

  try {
    const { Body } = req.body;
    const stkCallback = Body?.stkCallback;

    if (!stkCallback) {
      console.log('⚠️ No stkCallback found in payload');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    const resultCode = stkCallback.ResultCode;
    const checkoutRequestID = stkCallback.CheckoutRequestID;
    
    console.log(`🔍 Checking result: ResultCode=${resultCode}, CheckoutRequestID=${checkoutRequestID}`);

    // Find user
    const user = await User.findOne({ 'transactions.checkoutRequestID': checkoutRequestID });
    
    if (!user) {
      console.log(`⚠️ User not found for CheckoutRequestID: ${checkoutRequestID}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }
    
    console.log(`✅ User found: ${user.email}`);

    const transaction = user.transactions.find(t => t.checkoutRequestID === checkoutRequestID);
    
    if (!transaction) {
      console.log(`⚠️ Transaction not found for CheckoutRequestID: ${checkoutRequestID}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    if (resultCode === 0) {
      // --- SUCCESS ---
      const metadata = stkCallback.CallbackMetadata.Item;
      const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const amount = metadata.find(item => item.Name === 'Amount')?.Value;

      transaction.status = 'completed';
      transaction.mpesaReceipt = mpesaReceipt;
      user.walletBalance = (user.walletBalance || 0) + amount;

      console.log(`✅ SUCCESS: Receipt ${mpesaReceipt}, +${amount} KES`);
      console.log(`💰 New balance: ${user.walletBalance} KES`);
      
    } else {
      // --- FAILED ---
      transaction.status = 'failed';
      console.log(`❌ FAILED: ${stkCallback.ResultDesc}`);
    }

    await user.save();
    console.log('✅ Database updated successfully');
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    console.error('❌ Callback error:', error.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
  }
  
  console.log('========================================\n');
});

module.exports = router;
