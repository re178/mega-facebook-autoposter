// routes/lipaRoutes.js
const express = require('express');
const router = express.Router();
const { stkPush } = require('../Services/lipaService');
const User = require('../models/User');

// Endpoint for frontend
router.post('/stk-push', async (req, res) => {
  try {
    const { phone, amount, userId } = req.body;

    if (!phone || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid phone and amount required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.phone) {
      user.phone = phone.replace(/\D/g, '');
      await user.save();
    }

    const response = await stkPush(phone, amount, `TopUp-${user._id}`);

    user.transactions.push({
      type: 'deposit',
      amount: Math.round(amount),
      checkoutRequestID: response.CheckoutRequestID,
      status: 'pending',
      description: 'Wallet top-up'
    });
    await user.save();

    res.status(200).json({
      success: true,
      message: 'STK Push sent.',
      checkoutRequestID: response.CheckoutRequestID,
    });

  } catch (error) {
    console.error('STK Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Safaricom Callback
router.post('/callback', async (req, res) => {
  console.log('📞 Callback received');

  try {
    const { Body } = req.body;
    const stkCallback = Body?.stkCallback;
    if (!stkCallback) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });

    const resultCode = stkCallback.ResultCode;
    const checkoutRequestID = stkCallback.CheckoutRequestID;

    const user = await User.findOne({ 'transactions.checkoutRequestID': checkoutRequestID });
    if (!user) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    const transaction = user.transactions.find(t => t.checkoutRequestID === checkoutRequestID);

    if (resultCode === 0) {
      const metadata = stkCallback.CallbackMetadata.Item;
      const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const amount = metadata.find(item => item.Name === 'Amount')?.Value;

      transaction.status = 'completed';
      transaction.mpesaReceipt = mpesaReceipt;
      user.walletBalance = (user.walletBalance || 0) + amount;

      console.log(`✅ Receipt: ${mpesaReceipt} | +${amount} KES`);
    } else {
      transaction.status = 'failed';
      console.log(`❌ Failed: ${stkCallback.ResultDesc}`);
    }

    await user.save();
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    console.error('Callback error:', error);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
  }
});

module.exports = router;
