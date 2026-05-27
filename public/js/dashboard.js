// session.js – Fixed with CSRF, localStorage for broadcasts, proper 401 redirect
let currentUser = null;
let isLoggedIn = false;
let intervals = [];

// Helper: get CSRF token from meta tag
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// Central fetch wrapper for session-related calls (without full api.js dependency)
async function sessionFetch(url, options = {}) {
    const csrfToken = getCsrfToken();
    const method = options.method || 'GET';
    const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (isStateChanging && csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers
    });
    if (res.status === 401) {
        console.log('Session expired, redirecting to login');
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }
    return res;
}

async function checkSession() {
    try {
        const res = await sessionFetch('/api/session');
        const session = await res.json();
        console.log("SESSION:", session);
        
        if (session && (session.userId || session.user || session._id)) {
            isLoggedIn = true;
            currentUser = session;
            const role = session.role || session.user?.role;
            const isAdmin = role === 'admin';
            console.log("User logged in, admin:", isAdmin);
            
            await loadPrivateMessages();
            await checkNewBroadcasts(); // use localStorage to avoid repeat toasts
            setupIntervals();
            return true;
        } else {
            isLoggedIn = false;
            currentUser = null;
            showNotLoggedInMessage();
            return false;
        }
    } catch (err) {
        console.error('Session check error:', err);
        isLoggedIn = false;
        showNotLoggedInMessage();
        return false;
    }
}

function showNotLoggedInMessage() {
    const listEl = document.getElementById('msgList');
    if (listEl) {
        listEl.innerHTML = '<li style="color: #888;">Please log in to view messages</li>';
    }
}

// ========================
// PRIVATE MESSAGES
// ========================
async function loadPrivateMessages() {
    if (!isLoggedIn) {
        console.log('Skipping private messages - not logged in');
        return;
    }
    console.log('Loading private messages...');
    
    const listEl = document.getElementById('msgList');
    if (listEl) {
        listEl.innerHTML = '<li style="color: #888;">Loading messages...</li>';
    }
    
    try {
        const res = await sessionFetch('/api/user/messages/private');
        const messages = await res.json();
        console.log('Private messages received:', messages.length);
        
        if (!listEl) return;
        
        if (messages.length === 0) {
            listEl.innerHTML = '<li style="color: #888;">No private messages</li>';
            return;
        }
        
        // Display messages with click-to-mark-read
        listEl.innerHTML = messages.map(msg => `
            <li class="private-msg ${msg.read ? 'read' : 'unread'}" data-msg-id="${msg._id}" data-read="${msg.read}">
                <small>${new Date(msg.createdAt).toLocaleString()}</small>
                <div>${escapeHtml(msg.message)}</div>
                ${!msg.read ? '<span class="unread-badge">New</span>' : ''}
            </li>
        `).join('');
        
        // Attach click handlers to mark as read when clicked
        document.querySelectorAll('.private-msg[data-read="false"]').forEach(el => {
            el.addEventListener('click', async (e) => {
                // Prevent marking if clicking on a link or button inside
                if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
                const msgId = el.dataset.msgId;
                if (!msgId) return;
                await markMessageAsRead(msgId);
                el.classList.remove('unread');
                el.classList.add('read');
                el.dataset.read = 'true';
                const badge = el.querySelector('.unread-badge');
                if (badge) badge.remove();
            });
        });
    } catch (err) {
        console.error('Private messages error:', err);
        if (listEl) {
            listEl.innerHTML = '<li style="color: red;">Error loading messages</li>';
        }
    }
}

async function markMessageAsRead(messageId) {
    try {
        await sessionFetch(`/api/user/messages/private/${messageId}/read`, {
            method: 'PATCH'
        });
        console.log(`Marked message ${messageId} as read`);
    } catch (err) {
        console.error(`Failed to mark message ${messageId} as read:`, err);
    }
}

// ========================
// BROADCAST MESSAGES with localStorage
// ========================
const BROADCAST_STORAGE_KEY = 'lastBroadcastId';

async function checkNewBroadcasts() {
    if (!isLoggedIn) {
        console.log('Skipping broadcasts - not logged in');
        return;
    }
    console.log('Checking for new broadcasts...');
    
    try {
        const res = await sessionFetch('/api/user/messages/broadcast');
        const broadcasts = await res.json();
        console.log('Broadcasts received:', broadcasts.length);
        
        if (broadcasts.length === 0) return;
        
        const latest = broadcasts[0]; // newest first
        const lastSeenId = localStorage.getItem(BROADCAST_STORAGE_KEY);
        
        if (lastSeenId !== latest._id) {
            showToast(`📢 ${latest.message}`);
            localStorage.setItem(BROADCAST_STORAGE_KEY, latest._id);
        }
    } catch (err) {
        console.error('Broadcast check error:', err);
    }
}

// ========================
// TOAST NOTIFICATIONS
// ========================
function showToast(message) {
    console.log('Showing toast:', message);
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
        background: white;
        border-left: 4px solid #ff9800;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        margin-bottom: 10px;
        padding: 12px;
        min-width: 250px;
        animation: slideIn 0.3s ease;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <strong style="color: #ff9800;">📢 System Broadcast</strong>
            <button style="background: none; border: none; cursor: pointer; font-size: 16px;">✖</button>
        </div>
        <div style="color: #333;">${escapeHtml(message)}</div>
    `;
    
    container.appendChild(toast);
    const closeBtn = toast.querySelector('button');
    closeBtn.onclick = () => toast.remove();
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 5000);
}

// ========================
// UTILITIES
// ========================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========================
// INTERVALS MANAGEMENT
// ========================
function setupIntervals() {
    intervals.forEach(interval => clearInterval(interval));
    intervals = [];
    
    const interval1 = setInterval(() => {
        if (isLoggedIn) loadPrivateMessages();
    }, 30000);
    
    const interval2 = setInterval(() => {
        if (isLoggedIn) checkNewBroadcasts();
    }, 60000);
    
    intervals.push(interval1, interval2);
    console.log('Intervals set up');
}

// ========================
// ADD CSS ANIMATIONS
// ========================
function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .private-msg {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            position: relative;
            cursor: pointer;
            transition: background 0.2s;
        }
        .private-msg.unread {
            background-color: #fff3cd;
            border-left: 3px solid #ffc107;
        }
        .private-msg.read {
            background-color: #f8f9fa;
            border-left: 3px solid #6c757d;
            opacity: 0.8;
        }
        .private-msg:hover {
            background-color: #e9ecef;
        }
        .unread-badge {
            background: #ffc107;
            color: #000;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 10px;
            position: absolute;
            top: 5px;
            right: 10px;
        }
        .private-msg small {
            display: block;
            color: #666;
            font-size: 11px;
            margin-bottom: 5px;
        }
    `;
    document.head.appendChild(style);
}

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking session...');
    addStyles();
    checkSession();
    
    // Re-check session every 5 minutes (but avoid double redirects)
    setInterval(() => {
        if (!isLoggedIn) {
            checkSession();
        }
    }, 300000);
});
