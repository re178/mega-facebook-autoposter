// lipaService.js – Wallet balance, M-Pesa payments, and upgrade integration
console.log('✅ lipaService.js loaded');

// Load wallet data and set user info
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

        // Also update plan badge if not already
        const plan = user.subscription?.plan || 'free';
        window.userPlan = plan;
        const badge = document.getElementById('planBadge');
        if (badge) {
            badge.className = `badge-${plan}`;
            badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
        }
    } catch (e) {
        console.error('Wallet load error:', e);
    }
}

// Initiate M-Pesa payment (top-up)
async function initiatePayment(amount) {
    const userId = document.getElementById('userId')?.value;
    const phone = document.getElementById('userPhone')?.value;
    const payBtn = document.getElementById('payButton');

    if (!userId) {
        showToast('Please login first.', 'error');
        return;
    }
    if (!phone || phone.length < 10) {
        showToast('⚠️ Update your phone number in profile.', 'warning');
        return;
    }
    if (!amount || amount <= 0) {
        showToast('Enter a valid amount.', 'warning');
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
            showToast('✅ STK Push sent! Check your phone.', 'success');
            document.getElementById('amountInput').value = '';
            // Refresh balance after a few seconds
            setTimeout(loadWalletData, 5000);
        } else {
            showToast('❌ ' + (data.message || 'Payment failed'), 'error');
        }
    } catch (e) {
        showToast('Network error. Check console.', 'error');
        console.error(e);
    } finally {
        payBtn.disabled = false;
        payBtn.innerHTML = '📱 Pay with M-Pesa';
        payBtn.style.opacity = '1';
    }
}

// Make global
window.initiatePayment = initiatePayment;

// Auto-load when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadWalletData();

    // Attach pay button event
    const payBtn = document.getElementById('payButton');
    if (payBtn) {
        payBtn.addEventListener('click', function(e) {
            const amount = document.getElementById('amountInput').value;
            initiatePayment(amount);
        });
    }

    // Also attach upgrade button (if any) - but we already have from session.js
});
