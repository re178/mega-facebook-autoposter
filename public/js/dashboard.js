// dashboard.js – Full replacement with dynamic plan management

let currentUser = null;
let isLoggedIn = false;
let userPlan = 'free';
let intervals = [];
let plansMap = {}; // plan name -> plan data
let planFeatures = {}; // plan name -> feature object

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== DYNAMIC PLAN LOADING ====================

async function loadPlans() {
    try {
        const res = await fetch('/api/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch plans');
        const plans = await res.json();
        // Build maps
        plansMap = {};
        planFeatures = {};
        plans.forEach(p => {
            plansMap[p.name] = p;
            planFeatures[p.name] = p.features || {};
        });
        window.plans = plans;
        window.planFeatures = planFeatures;
        return plans;
    } catch (err) {
        console.error('Failed to load plans:', err);
        // Fallback to hardcoded defaults? Not needed if we have defaults seeded.
        return null;
    }
}

// ==================== FEATURE CHECKS (DYNAMIC) ====================

function canAccess(feature, plan = userPlan) {
    const features = planFeatures[plan];
    if (!features) return false;
    const val = features[feature];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0 || val === -1; // -1 means unlimited
    return false;
}

function getFeatureLimit(feature, plan = userPlan) {
    const features = planFeatures[plan];
    if (!features) return 0;
    const val = features[feature];
    if (typeof val === 'number') {
        if (val === -1) return Infinity;
        return val;
    }
    if (typeof val === 'boolean') return val ? Infinity : 0;
    return 0;
}

function getPlanPrice(plan, currency = 'KES') {
    const planData = plansMap[plan];
    if (!planData) return 0;
    return currency === 'KES' ? planData.priceKES : planData.priceUSD;
}

function getPlanDuration(plan) {
    const planData = plansMap[plan];
    if (!planData) return 30;
    return planData.durationDays || 30;
}

function getPlanLabel(plan) {
    const planData = plansMap[plan];
    if (!planData) return plan.charAt(0).toUpperCase() + plan.slice(1);
    return planData.label;
}

// ==================== SESSION ====================

async function checkSession() {
    try {
        const res = await fetch('/api/session', { credentials: 'include' });
        const session = await res.json();
        console.log('SESSION:', session);
        if (session.loggedIn) {
            isLoggedIn = true;
            currentUser = session;
            userPlan = session.subscription?.plan || 'free';
            window.userPlan = userPlan;

            // Load plans from server
            await loadPlans();

            // Update plan badge if present
            const badge = document.getElementById('planBadge');
            if (badge) {
                const label = getPlanLabel(userPlan);
                badge.className = `badge-${userPlan}`;
                badge.textContent = label;
            }

            await loadPrivateMessages();
            await checkNewBroadcasts();
            setupIntervals();
            return true;
        } else {
            isLoggedIn = false;
            return false;
        }
    } catch(err) {
        console.error(err);
        return false;
    }
}

// ==================== PRIVATE MESSAGES ====================

async function loadPrivateMessages() {
    if (!isLoggedIn) return;
    const listEl = document.getElementById('msgList');
    if (!listEl) return;
    try {
        const res = await fetch('/api/user/messages/private', { credentials: 'include' });
        const messages = await res.json();
        listEl.innerHTML = messages.length ? messages.map(msg => `
            <li class="private-msg ${msg.read ? 'read' : 'unread'}" data-id="${msg._id}">
                <small>${new Date(msg.createdAt).toLocaleString()}</small>
                <div>${escapeHtml(msg.message)}</div>
                ${!msg.read ? '<span class="unread-badge" style="background:#10b981; color:white; padding:0 6px; border-radius:10px; font-size:10px;">New</span>' : ''}
            </li>
        `).join('') : '<li>No private messages</li>';
        document.querySelectorAll('.private-msg.unread').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.dataset.id;
                await fetch(`/api/user/messages/private/${id}/read`, { method: 'PATCH', credentials: 'include' });
                el.classList.remove('unread');
                el.classList.add('read');
                el.querySelector('.unread-badge')?.remove();
            });
        });
    } catch(err) { console.error(err); }
}

// ==================== BROADCASTS ====================

const BROADCAST_STORAGE_KEY = 'lastBroadcastId';
async function checkNewBroadcasts() {
    if (!isLoggedIn) return;
    try {
        const res = await fetch('/api/user/messages/broadcast', { credentials: 'include' });
        const broadcasts = await res.json();
        if (broadcasts.length === 0) return;
        const latest = broadcasts[0];
        const last = localStorage.getItem(BROADCAST_STORAGE_KEY);
        if (last !== latest._id) {
            showToast(`📢 ${latest.message}`, 'info');
            localStorage.setItem(BROADCAST_STORAGE_KEY, latest._id);
        }
    } catch(err) { console.error(err); }
}

// ==================== TOAST ====================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span><button style="background:none;border:none;font-size:16px;cursor:pointer;margin-left:12px;" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}
window.showToast = showToast;

// ==================== INTERVALS ====================

function setupIntervals() {
    intervals.forEach(i => clearInterval(i));
    intervals = [];
    intervals.push(setInterval(() => { if (isLoggedIn) loadPrivateMessages(); }, 30000));
    intervals.push(setInterval(() => { if (isLoggedIn) checkNewBroadcasts(); }, 60000));
}

// ==================== UPGRADE MODAL ====================

async function showUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;
    modal.style.display = 'flex';

    try {
        // Ensure plans are loaded
        if (Object.keys(plansMap).length === 0) {
            await loadPlans();
        }

        // Get user profile for wallet balance
        const userRes = await fetch('/api/auth/profile', { credentials: 'include' });
        if (!userRes.ok) throw new Error('Failed to fetch user');
        const user = await userRes.json();
        document.getElementById('upgradeWalletBalance').textContent = (user.walletBalance || 0).toFixed(2);

        // Render plan cards
        const plansContainer = document.getElementById('pricingPlans');
        const activePlans = Object.values(plansMap).filter(p => p.isActive);
        if (activePlans.length === 0) {
            plansContainer.innerHTML = '<p>No plans available</p>';
            return;
        }

        // Sort by order
        activePlans.sort((a, b) => (a.order || 0) - (b.order || 0));

        plansContainer.innerHTML = '';
        const currentPlan = userPlan;
        activePlans.forEach(p => {
            const isCurrent = p.name === currentPlan;
            const div = document.createElement('div');
            div.className = `plan-card ${isCurrent ? 'selected' : ''}`;
            div.style.cssText = `
                border: 2px solid ${isCurrent ? '#10b981' : '#e2e8f0'};
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s;
                background: ${isCurrent ? '#f0fdf4' : 'white'};
            `;
            div.dataset.plan = p.name;
            const price = p.priceKES || 0;
            div.innerHTML = `
                <h4 style="margin:0; color:#0f172a;">${p.label}</h4>
                <p style="font-size:20px; font-weight:700; color:#10b981;">KES ${price}</p>
                <p style="font-size:13px; color:#64748b;">${p.features.pagesAllowed === -1 ? 'Unlimited' : p.features.pagesAllowed} pages, ${p.features.aiTopics === -1 ? 'Unlimited' : p.features.aiTopics} AI topics</p>
                ${isCurrent ? '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Current</span>' : ''}
            `;
            div.addEventListener('click', () => {
                document.querySelectorAll('.plan-card').forEach(c => {
                    c.style.borderColor = '#e2e8f0';
                    c.style.background = 'white';
                });
                div.style.borderColor = '#10b981';
                div.style.background = '#f0fdf4';
                document.getElementById('upgradePriceDisplay').textContent = `KES ${price}`;
                document.getElementById('confirmUpgradeBtn').disabled = false;
                document.getElementById('confirmUpgradeBtn').dataset.plan = p.name;
            });
            plansContainer.appendChild(div);
        });

        // Reset selection
        document.getElementById('confirmUpgradeBtn').disabled = true;
        document.getElementById('confirmUpgradeBtn').dataset.plan = '';
        document.getElementById('upgradePriceDisplay').textContent = 'Select a plan';

    } catch (err) {
        console.error('Failed to load upgrade data:', err);
        showToast('Failed to load pricing', 'error');
    }
}

function closeUpgradeModal() {
    document.getElementById('upgradeModal').style.display = 'none';
}
window.closeUpgradeModal = closeUpgradeModal;
window.showUpgradeModal = showUpgradeModal;

// Confirm upgrade
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmUpgradeBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
            const plan = this.dataset.plan;
            if (!plan) return;
            if (!confirm(`Upgrade to ${getPlanLabel(plan)}? This will deduct KES from your wallet.`)) return;
            try {
                const res = await fetch('/api/user/upgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ plan })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`🎉 Upgraded to ${getPlanLabel(plan)}!`, 'success');
                    closeUpgradeModal();
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showToast('❌ ' + data.message, 'error');
                }
            } catch (err) {
                showToast('Network error', 'error');
            }
        });
    }
});

// ==================== EXPOSE GLOBALS ====================

window.canAccess = canAccess;
window.getFeatureLimit = getFeatureLimit;
window.getPlanPrice = getPlanPrice;
window.getPlanDuration = getPlanDuration;
window.getPlanLabel = getPlanLabel;
window.loadPlans = loadPlans;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setInterval(() => { if (!isLoggedIn) checkSession(); }, 300000);
});
