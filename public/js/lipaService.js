// public/js/lipaService.js
console.log('✅ lipaService.js loaded');

// Function to load wallet balance
async function loadWalletData() {
  try {
    const res = await fetch('/api/auth/profile', { credentials: 'include' });
    if (!res.ok) return;
    const user = await res.json();

    const userIdEl = document.getElementById('userId');
    const userPhoneEl = document.getElementById('userPhone');
    if (userIdEl) userIdEl.value = user._id;
    if (userPhoneEl) userPhoneEl.value = user.phone || '';

    const balanceEl = document.getElementById('walletBalanceDisplay');
    if (balanceEl) balanceEl.textContent = (user.walletBalance || 0).toFixed(2);

    const phoneDisplay = document.getElementById('registeredPhoneDisplay');
    if (phoneDisplay) {
      phoneDisplay.textContent = user.phone ? `(${user.phone})` : '⚠️ Update phone';
    }
  } catch (e) {
    console.error('Wallet load error:', e);
  }
}

// Function to initiate payment
async function initiatePayment(amount) {
  const userId = document.getElementById('userId')?.value;
  const phone = document.getElementById('userPhone')?.value;
  const payBtn = document.getElementById('payButton');

  if (!userId) {
    alert('Please login first.');
    return;
  }
  if (!phone || phone.length < 10) {
    alert('⚠️ Update your phone number in profile.');
    return;
  }
  if (!amount || amount <= 0) {
    alert('Enter a valid amount.');
    return;
  }

  payBtn.disabled = true;
  payBtn.innerHTML = '⏳ Sending...';
  payBtn.style.opacity = '0.7';

  try {
    const res = await fetch('/api/lipa/stk-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, amount: parseFloat(amount), userId }),
    });
    const data = await res.json();

    if (data.success) {
      alert('✅ STK Push sent! Check your phone.');
      document.getElementById('amountInput').value = '';
    } else {
      alert('❌ ' + data.message);
    }
  } catch (e) {
    alert('Network error. Check console.');
    console.error(e);
  } finally {
    payBtn.disabled = false;
    payBtn.innerHTML = '📱 Pay with M-Pesa';
    payBtn.style.opacity = '1';
  }
}

// Make it global so the inline onclick works (fallback)
window.initiatePayment = initiatePayment;

// Auto-load when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  loadWalletData();

  // Also attach click event to the button (if you remove inline onclick)
  const payBtn = document.getElementById('payButton');
  if (payBtn) {
    payBtn.addEventListener('click', function(e) {
      const amount = document.getElementById('amountInput').value;
      initiatePayment(amount);
    });
  }
});
