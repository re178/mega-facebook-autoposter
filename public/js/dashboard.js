// session.js – handles session, private messages, broadcasts
let currentUser = null;
let isLoggedIn = false;
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

async function checkSession() {
    try {
        const res = await fetch('/api/session', { credentials: 'include' });
        const session = await res.json();
        console.log('SESSION:', session);
        if (session.loggedIn) {
            isLoggedIn = true;
            currentUser = session;
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
                ${!msg.read ? '<span class="unread-badge">New</span>' : ''}
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
            showToast(`📢 ${latest.message}`);
            localStorage.setItem(BROADCAST_STORAGE_KEY, latest._id);
        }
    } catch(err) { console.error(err); }
}

function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'background:white;border-left:4px solid #ff9800;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.1);margin-bottom:10px;padding:12px;min-width:250px;animation:slideIn 0.3s ease;';
    toast.innerHTML = `<div><strong>📢 System Broadcast</strong><button style="float:right;background:none;border:none;cursor:pointer;">✖</button></div><div>${escapeHtml(message)}</div>`;
    container.appendChild(toast);
    toast.querySelector('button').onclick = () => toast.remove();
    setTimeout(() => toast.remove(), 5000);
}

function setupIntervals() {
    intervals.forEach(i => clearInterval(i));
    intervals = [];
    intervals.push(setInterval(() => { if (isLoggedIn) loadPrivateMessages(); }, 30000));
    intervals.push(setInterval(() => { if (isLoggedIn) checkNewBroadcasts(); }, 60000));
}

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setInterval(() => { if (!isLoggedIn) checkSession(); }, 300000);
});
