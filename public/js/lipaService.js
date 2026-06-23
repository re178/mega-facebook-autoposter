// frontend/js/lipaService.js – IntaSend integration
console.log('✅ lipaService.js loaded (IntaSend)');

// =====================================================
// GLOBALS
// =====================================================
let currentTransactionId = null;
let statusPollInterval = null;
let selectedPlan = null;

// =====================================================
// LOAD SUBSCRIPTION DATA (replaces wallet data)
// =====================================================
async function loadWalletData() {
    try {
        const res = await fetch('/api/lipa/subscription', { credentials: 'include' });
        if (!res.ok) {
            if (res.status === 401) return;
            throw new Error('Failed to load subscription');
        }
        const data = await res.json();

        // Update plan badge
        const badge = document.getElementById('planBadge');
        if (badge && data.subscription) {
            const plan = data.subscription.plan || 'free';
            badge.className = `badge-${plan}`;
            badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
        }

        // Update wallet balance display (if you still want to show it)
        const balanceEl = document.getElementById('walletBalanceDisplay');
        if (balanceEl) {
            balanceEl.textContent = (data.walletBalance || 0).toFixed(2);
        }

        // Update expiry display (if you have an element)
        const expiryEl = document.getElementById('subscriptionExpiryDisplay');
        if (expiryEl && data.subscription?.expiryDate) {
            const expiry = new Date(data.subscription.expiryDate);
            const days = data.subscription.daysRemaining || 0;
            expiryEl.textContent = `Expires: ${expiry.toLocaleDateString()} (${days} days)`;
        } else if (expiryEl) {
            expiryEl.textContent = 'No active subscription';
        }

        // Store user ID and phone
        const userIdEl = document.getElementById('userId');
        if (userIdEl) userIdEl.value = data.userId || '';

        const userPhoneEl = document.getElementById('userPhone');
        if (userPhoneEl && data.paymentPhone) {
            userPhoneEl.value = data.paymentPhone;
        }

        // Update registered phone display
        const phoneDisplay = document.getElementById('registeredPhoneDisplay');
        if (phoneDisplay && data.paymentPhone) {
            phoneDisplay.textContent = `(${data.paymentPhone})`;
        } else if (phoneDisplay) {
            phoneDisplay.textContent = '⚠️ Update phone';
        }

        return data;
    } catch (e) {
        console.error('Load subscription error:', e);
    }
    return null;
}

// =====================================================
// INITIATE PAYMENT (POST /api/lipa/stk-push)
// =====================================================
async function initiatePayment(plan, phoneNumber) {
    const payBtn = document.getElementById('payButton');
    const statusEl = document.getElementById('paymentStatus');

    if (!plan) {
        showToast('Please select a plan', 'warning');
        return;
    }
    if (!phoneNumber || phoneNumber.length < 10) {
        showToast('Valid phone number required (e.g., 0712345678)', 'warning');
        return;
    }

    // Disable button
    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '⏳ Sending...';
        payBtn.style.opacity = '0.7';
    }

    if (statusEl) {
        statusEl.textContent = 'Initiating payment...';
        statusEl.className = 'status-info';
        statusEl.style.display = 'block';
    }

    try {
        const res = await fetch('/api/lipa/stk-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ plan, phoneNumber })
        });

        const data = await res.json();

        if (data.success) {
            currentTransactionId = data.transactionId;
            if (statusEl) {
                statusEl.textContent = '✅ STK Push sent! Check your phone and enter PIN.';
                statusEl.className = 'status-success';
            }
            showToast('📱 STK Push sent! Check your phone.', 'success');
            startStatusPolling(currentTransactionId);
        } else {
            if (statusEl) {
                statusEl.textContent = '❌ ' + (data.error || 'Payment initiation failed');
                statusEl.className = 'status-error';
            }
            showToast('❌ ' + (data.error || 'Payment failed'), 'error');
        }
    } catch (err) {
        console.error('Payment error:', err);
        if (statusEl) {
            statusEl.textContent = '❌ Network error. Try again.';
            statusEl.className = 'status-error';
        }
        showToast('Network error', 'error');
    } finally {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '💳 Pay Now';
            payBtn.style.opacity = '1';
        }
    }
}

// =====================================================
// POLL PAYMENT STATUS
// =====================================================
function startStatusPolling(transactionId) {
    if (statusPollInterval) clearInterval(statusPollInterval);
    let attempts = 0;
    const maxAttempts = 30;

    statusPollInterval = setInterval(async () => {
        attempts++;
        try {
            const res = await fetch(`/api/lipa/status/${transactionId}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Status check failed');
            const data = await res.json();
            if (!data.success) return;

            const tx = data.transaction;
            const statusEl = document.getElementById('paymentStatus');

            if (tx.status === 'completed' || tx.subscriptionActivated) {
                clearInterval(statusPollInterval);
                statusPollInterval = null;
                if (statusEl) {
                    statusEl.textContent = '🎉 Payment successful! Subscription activated.';
                    statusEl.className = 'status-success';
                }
                showToast('🎉 Subscription activated!', 'success');
                await loadWalletData();
                setTimeout(() => location.reload(), 2000);
            } else if (tx.status === 'failed') {
                clearInterval(statusPollInterval);
                statusPollInterval = null;
                if (statusEl) {
                    statusEl.textContent = '❌ Payment failed. Please try again.';
                    statusEl.className = 'status-error';
                }
                showToast('❌ Payment failed', 'error');
            } else if (tx.status === 'processing') {
                if (statusEl) {
                    statusEl.textContent = `⏳ Processing... (${attempts}/${maxAttempts})`;
                    statusEl.className = 'status-info';
                }
            }
        } catch (err) {
            console.error('Poll error:', err);
        }

        if (attempts >= maxAttempts) {
            clearInterval(statusPollInterval);
            statusPollInterval = null;
            const statusEl = document.getElementById('paymentStatus');
            if (statusEl) {
                statusEl.textContent = '⏳ Payment is still processing. You will be notified.';
                statusEl.className = 'status-warning';
            }
            showToast('Payment still processing', 'warning');
        }
    }, 3000);
}

// =====================================================
// UPGRADE MODAL HANDLERS
// =====================================================
async function showUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadWalletData();

    const plansContainer = document.getElementById('pricingPlans');
    if (!plansContainer) return;

    // Fetch plan prices from meta tags or environment
    const prices = {
        pro: parseInt(document.querySelector('meta[name="plan-price-pro"]')?.content) || 3500,
        enterprise: parseInt(document.querySelector('meta[name="plan-price-enterprise"]')?.content) || 12000,
        premium: parseInt(document.querySelector('meta[name="plan-price-premium"]')?.content) || 7000
    };

    const currentPlan = window.userPlan || 'free';
    plansContainer.innerHTML = Object.entries(prices).map(([plan, price]) => `
        <div class="plan-card ${currentPlan === plan ? 'selected' : ''}" 
             data-plan="${plan}" 
             onclick="selectPlan('${plan}')"
             style="border:2px solid ${currentPlan === plan ? '#10b981' : '#e2e8f0'}; border-radius:8px; padding:12px; cursor:pointer; background:${currentPlan === plan ? '#f0fdf4' : 'white'};">
            <h4 style="margin:0; text-transform:uppercase;">${plan}</h4>
            <p style="font-size:20px; font-weight:bold; color:#10b981;">KES ${price}</p>
            <p style="font-size:12px; color:#64748b;">${plan === 'pro' ? '10 pages, unlimited posts' : plan === 'premium' ? '50 pages, unlimited posts' : 'Unlimited pages, full features'}</p>
            ${currentPlan === plan ? '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:10px;">Current</span>' : ''}
        </div>
    `).join('');

    // Reset selection
    selectedPlan = null;
    document.getElementById('selectedPlanDisplay').textContent = 'Select a plan';
    document.getElementById('confirmUpgradeBtn').disabled = true;
}

function closeUpgradeModal() {
    document.getElementById('upgradeModal').style.display = 'none';
}

function selectPlan(plan) {
    selectedPlan = plan;
    document.querySelectorAll('.plan-card').forEach(el => {
        const isSelected = el.dataset.plan === plan;
        el.style.borderColor = isSelected ? '#10b981' : '#e2e8f0';
        el.style.background = isSelected ? '#f0fdf4' : 'white';
    });
    const display = document.getElementById('selectedPlanDisplay');
    if (display) {
        const prices = {
            pro: parseInt(document.querySelector('meta[name="plan-price-pro"]')?.content) || 3500,
            enterprise: parseInt(document.querySelector('meta[name="plan-price-enterprise"]')?.content) || 12000,
            premium: parseInt(document.querySelector('meta[name="plan-price-premium"]')?.content) || 7000
        };
        display.textContent = `${plan.toUpperCase()} – KES ${prices[plan]}`;
    }
    document.getElementById('confirmUpgradeBtn').disabled = false;
}

async function confirmUpgrade() {
    if (!selectedPlan) {
        showToast('Please select a plan', 'warning');
        return;
    }
    const phoneInput = document.getElementById('paymentPhoneInput');
    const phone = phoneInput?.value || '';
    if (!phone || phone.length < 10) {
        showToast('Valid phone number required', 'warning');
        return;
    }
    closeUpgradeModal();
    await initiatePayment(selectedPlan, phone);
}

// =====================================================
// GLOBAL EXPOSURES
// =====================================================
window.loadWalletData = loadWalletData;
window.initiatePayment = initiatePayment;
window.showUpgradeModal = showUpgradeModal;
window.closeUpgradeModal = closeUpgradeModal;
window.selectPlan = selectPlan;
window.confirmUpgrade = confirmUpgrade;

// =====================================================
// AUTO-LOAD
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    loadWalletData();
    // Attach pay button if present (for legacy)
    const payBtn = document.getElementById('payButton');
    if (payBtn) {
        payBtn.addEventListener('click', function(e) {
            const plan = document.querySelector('input[name="plan"]:checked')?.value || 'pro';
            const phone = document.getElementById('paymentPhoneInput')?.value || '';
            initiatePayment(plan, phone);
        });
    }
});
