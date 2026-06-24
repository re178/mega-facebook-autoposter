// frontend/js/lipaService.js – Complete with button disable, spinner, idempotency
console.log('✅ lipaService.js loaded (IntaSend)');

let isProcessing = false;
let currentTransactionId = null;
let statusPollInterval = null;
let selectedPlan = null;

// ===== LOAD SUBSCRIPTION DATA =====
async function loadWalletData() {
    try {
        const res = await fetch('/api/lipa/subscription', { credentials: 'include' });
        if (!res.ok) {
            if (res.status === 401) return;
            throw new Error('Failed to load subscription');
        }
        const data = await res.json();

        const badge = document.getElementById('planBadge');
        if (badge && data.subscription) {
            const plan = data.subscription.plan || 'free';
            badge.className = `badge-${plan}`;
            badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
        }

        const balanceEl = document.getElementById('walletBalanceDisplay');
        if (balanceEl) {
            balanceEl.textContent = (data.walletBalance || 0).toFixed(2);
        }

        const expiryEl = document.getElementById('subscriptionExpiryDisplay');
        if (expiryEl && data.subscription?.expiryDate) {
            const expiry = new Date(data.subscription.expiryDate);
            const days = data.subscription.daysRemaining || 0;
            expiryEl.textContent = `Expires: ${expiry.toLocaleDateString()} (${days} days)`;
        } else if (expiryEl) {
            expiryEl.textContent = 'No active subscription';
        }

        const userIdEl = document.getElementById('userId');
        if (userIdEl) userIdEl.value = data.userId || '';

        const userPhoneEl = document.getElementById('userPhone');
        if (userPhoneEl && data.paymentPhone) {
            userPhoneEl.value = data.paymentPhone;
        }

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

// ===== INITIATE PAYMENT =====
async function initiatePayment(plan, phoneNumber) {
    const payBtn = document.getElementById('payButton');
    const statusEl = document.getElementById('paymentStatus');
    const msgEl = document.getElementById('statusMessage');

    if (isProcessing) {
        showToast('Payment already in progress', 'warning');
        return;
    }

    if (!plan) {
        showToast('Please select a plan', 'warning');
        return;
    }
    if (!phoneNumber || phoneNumber.length < 10) {
        showToast('Valid phone number required (e.g., 0712345678)', 'warning');
        return;
    }

    isProcessing = true;
    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '⏳ Sending...';
        payBtn.style.opacity = '0.7';
    }

    if (statusEl) {
        statusEl.style.display = 'block';
        msgEl.textContent = 'Initiating payment...';
        statusEl.className = 'status-info';
    }

    // Generate idempotency key
    const userId = document.getElementById('userId')?.value || 'unknown';
    const idempotencyKey = `${userId}_${plan}_${Date.now()}`;

    try {
        const res = await fetch('/api/lipa/stk-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ plan, phoneNumber, idempotencyKey })
        });

        const data = await res.json();

        if (data.success) {
            currentTransactionId = data.transactionId;
            if (statusEl) {
                msgEl.textContent = '✅ STK Push sent! Check your phone and enter PIN.';
                statusEl.className = 'status-success';
            }
            showToast('📱 STK Push sent! Check your phone.', 'success');
            startStatusPolling(currentTransactionId);
        } else {
            if (statusEl) {
                msgEl.textContent = '❌ ' + (data.error || 'Payment initiation failed');
                statusEl.className = 'status-error';
            }
            showToast('❌ ' + (data.error || 'Payment failed'), 'error');
        }
    } catch (err) {
        console.error('Payment error:', err);
        if (statusEl) {
            msgEl.textContent = '❌ Network error. Try again.';
            statusEl.className = 'status-error';
        }
        showToast('Network error', 'error');
    } finally {
        isProcessing = false;
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '💳 Pay Now';
            payBtn.style.opacity = '1';
        }
    }
}

// ===== POLL PAYMENT STATUS =====
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
            const msgEl = document.getElementById('statusMessage');

            if (tx.status === 'completed' || tx.subscriptionActivated) {
                clearInterval(statusPollInterval);
                statusPollInterval = null;
                if (statusEl) {
                    msgEl.textContent = '🎉 Payment successful! Subscription activated.';
                    statusEl.className = 'status-success';
                }
                showToast('🎉 Subscription activated!', 'success');
                await loadWalletData();
                setTimeout(() => location.reload(), 2000);
            } else if (tx.status === 'failed') {
                clearInterval(statusPollInterval);
                statusPollInterval = null;
                if (statusEl) {
                    msgEl.textContent = '❌ Payment failed. Please try again.';
                    statusEl.className = 'status-error';
                }
                showToast('❌ Payment failed', 'error');
            } else if (tx.status === 'processing') {
                if (statusEl) {
                    msgEl.textContent = `⏳ Processing... (${attempts}/${maxAttempts})`;
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
            const msgEl = document.getElementById('statusMessage');
            if (statusEl) {
                msgEl.textContent = '⏳ Payment is still processing. You will be notified.';
                statusEl.className = 'status-warning';
            }
            showToast('Payment still processing', 'warning');
        }
    }, 3000);
}

// ===== UPGRADE MODAL =====
async function showUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadWalletData();

    const plansContainer = document.getElementById('pricingPlans');
    if (!plansContainer) return;

    // Fetch plans from public endpoint
    let plans;
    try {
        const res = await fetch('/api/plans', { credentials: 'include' });
        const data = await res.json();
        plans = data.filter(p => p.isActive);
    } catch (e) {
        showToast('Failed to load plans', 'error');
        return;
    }

    const currentPlan = window.userPlan || 'free';
    plansContainer.innerHTML = plans.map(p => {
        const price = p.priceKES || 0;
        const isCurrent = p.name === currentPlan;
        return `
            <div class="plan-card ${isCurrent ? 'selected' : ''}" 
                 data-plan="${p.name}" 
                 onclick="selectPlan('${p.name}')"
                 style="border:2px solid ${isCurrent ? '#10b981' : '#e2e8f0'}; border-radius:8px; padding:12px; cursor:pointer; background:${isCurrent ? '#f0fdf4' : 'white'}; text-align:center;">
                <h4 style="margin:0; text-transform:uppercase;">${p.label}</h4>
                <p style="font-size:20px; font-weight:bold; color:#10b981;">KES ${price}</p>
                <p style="font-size:12px; color:#64748b;">${p.features.pagesAllowed === -1 ? 'Unlimited' : p.features.pagesAllowed} pages, ${p.features.aiTopics === -1 ? 'Unlimited' : p.features.aiTopics} AI topics</p>
                ${isCurrent ? '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:10px;">Current</span>' : ''}
            </div>
        `;
    }).join('');

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
        const priceEl = document.querySelector(`.plan-card[data-plan="${plan}"] .price`);
        const price = priceEl ? priceEl.textContent : '';
        display.textContent = `${plan.toUpperCase()} – ${price}`;
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

// ===== GLOBAL EXPOSURES =====
window.loadWalletData = loadWalletData;
window.initiatePayment = initiatePayment;
window.showUpgradeModal = showUpgradeModal;
window.closeUpgradeModal = closeUpgradeModal;
window.selectPlan = selectPlan;
window.confirmUpgrade = confirmUpgrade;

// ===== AUTO-LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    loadWalletData();
    const payBtn = document.getElementById('payButton');
    if (payBtn) {
        payBtn.addEventListener('click', function(e) {
            const plan = document.querySelector('input[name="plan"]:checked')?.value || 'pro';
            const phone = document.getElementById('paymentPhoneInput')?.value || '';
            initiatePayment(plan, phone);
        });
    }
});
