// session.js – handles session, private messages, broadcasts, and plan management
let currentUser = null;
let isLoggedIn = false;
let userPlan = 'free';
let intervals = [];

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Feature matrix
const FEATURES = {
    aiTopics: { free: 1, pro: Infinity, enterprise: Infinity },
    aiPostsPerMonth: { free: 5, pro: Infinity, enterprise: Infinity },
    manualPostsPerMonth: { free: 10, pro: Infinity, enterprise: Infinity },
    pagesAllowed: { free: 1, pro: 10, enterprise: Infinity },
    templates: { free: 0, pro: 20, enterprise: Infinity },
    ads: { free: false, pro: true, enterprise: true },
    comments: { free: false, pro: true, enterprise: true },
    analyticsAdvanced: { free: false, pro: true, enterprise: true },
    pageProfile: { free: false, pro: true, enterprise: true },
    reports: { free: false, pro: true, enterprise: true },
    broadcastsSend: { free: false, pro: false, enterprise: true },
    teamMembers: { free: 0, pro: 0, enterprise: 5 }
};

function canAccess(feature, plan = userPlan) {
    if (typeof FEATURES[feature] === 'boolean') {
        return FEATURES[feature] === true || (FEATURES[feature] === true && plan !== 'free');
    }
    if (typeof FEATURES[feature] === 'number') {
        return FEATURES[feature][plan] !== undefined && FEATURES[feature][plan] > 0;
    }
    return false;
}

function getFeatureLimit(feature, plan = userPlan) {
    if (typeof FEATURES[feature] === 'number') {
        return FEATURES[feature][plan] || 0;
    }
    return FEATURES[feature] ? Infinity : 0;
}

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
            // Update plan badge if present
            const badge = document.getElementById('planBadge');
            if (badge) {
                badge.className = `badge-${userPlan}`;
                badge.textContent = userPlan.charAt(0).toUpperCase() + userPlan.slice(1);
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

function setupIntervals() {
    intervals.forEach(i => clearInterval(i));
    intervals = [];
    intervals.push(setInterval(() => { if (isLoggedIn) loadPrivateMessages(); }, 30000));
    intervals.push(setInterval(() => { if (isLoggedIn) checkNewBroadcasts(); }, 60000));
}

// Upgrade modal functions (will be used globally)
async function showUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;
    modal.style.display = 'flex';
    // Load pricing and balance
    try {
        const pricing = await (await fetch('/api/pricing')).json();
        const user = await (await fetch('/api/auth/profile', { credentials: 'include' })).json();
        document.getElementById('upgradeWalletBalance').textContent = (user.walletBalance || 0).toFixed(2);
        const plansContainer = document.getElementById('pricingPlans');
        plansContainer.innerHTML = '';
        const planData = [
            { id: 'pro', label: 'Pro', price: pricing.pro.priceKES, desc: 'Everything you need' },
            { id: 'enterprise', label: 'Enterprise', price: pricing.enterprise.priceKES, desc: 'Full power + support' }
        ];
        planData.forEach(p => {
            const div = document.createElement('div');
            div.className = `plan-card ${userPlan === p.id ? 'selected' : ''}`;
            div.style.cssText = `
                border: 2px solid ${userPlan === p.id ? '#10b981' : '#e2e8f0'};
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s;
                background: ${userPlan === p.id ? '#f0fdf4' : 'white'};
            `;
            div.innerHTML = `
                <h4 style="margin:0; color:#0f172a;">${p.label}</h4>
                <p style="font-size:20px; font-weight:700; color:#10b981;">KES ${p.price}</p>
                <p style="font-size:13px; color:#64748b;">${p.desc}</p>
                ${userPlan === p.id ? '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Current</span>' : ''}
            `;
            div.dataset.plan = p.id;
            div.addEventListener('click', () => {
                document.querySelectorAll('.plan-card').forEach(c => {
                    c.style.borderColor = '#e2e8f0';
                    c.style.background = 'white';
                });
                div.style.borderColor = '#10b981';
                div.style.background = '#f0fdf4';
                document.getElementById('upgradePriceDisplay').textContent = `KES ${p.price}`;
                document.getElementById('confirmUpgradeBtn').disabled = false;
                document.getElementById('confirmUpgradeBtn').dataset.plan = p.id;
            });
            plansContainer.appendChild(div);
        });
        document.getElementById('confirmUpgradeBtn').disabled = true;
        document.getElementById('confirmUpgradeBtn').dataset.plan = '';
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
            if (!confirm(`Upgrade to ${plan}? This will deduct KES from your wallet.`)) return;
            try {
                const res = await fetch('/api/user/upgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ plan })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`🎉 Upgraded to ${plan}!`, 'success');
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

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setInterval(() => { if (!isLoggedIn) checkSession(); }, 300000);
});
