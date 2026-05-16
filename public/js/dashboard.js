// ========================
// PRIVATE MESSAGES
// ========================
async function loadPrivateMessages() {
  try {
    const res = await fetch('/api/user/messages/private');
    if (!res.ok) throw new Error('Failed to fetch messages');
    const messages = await res.json();
    const listEl = document.getElementById('msgList');
    if (!listEl) return;
    if (messages.length === 0) {
      listEl.innerHTML = '<li style="color: #888;">No messages</li>';
      return;
    }
    listEl.innerHTML = messages.map(msg => `
      <li class="private-msg ${msg.read ? 'read' : 'unread'}">
        <small>${new Date(msg.createdAt).toLocaleString()}</small>
        <div>${escapeHtml(msg.message)}</div>
      </li>
    `).join('');
    // Mark unread messages as read (optional: on click or automatically)
    const unreadMsgs = messages.filter(m => !m.read);
    for (let msg of unreadMsgs) {
      fetch(`/api/user/messages/private/${msg._id}/read`, { method: 'PATCH' });
    }
  } catch (err) {
    console.error('Private messages error:', err);
  }
}

// Helper to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========================
// BROADCAST TOASTS
// ========================
let lastBroadcastId = null;

async function checkNewBroadcasts() {
  try {
    const res = await fetch('/api/user/messages/broadcast');
    if (!res.ok) throw new Error('Failed to fetch broadcasts');
    const broadcasts = await res.json();
    if (broadcasts.length === 0) return;
    const latest = broadcasts[0]; // newest first
    if (lastBroadcastId !== latest._id) {
      showToast(`📢 ${latest.message}`);
      lastBroadcastId = latest._id;
    }
  } catch (err) {
    console.error('Broadcast check error:', err);
  }
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-header">📢 System Broadcast</div>
    <div class="toast-body">${escapeHtml(message)}</div>
    <button class="toast-close">✖</button>
  `;
  container.appendChild(toast);
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 5000);
  toast.querySelector('.toast-close').onclick = () => toast.remove();
}

// Load private messages on page load
document.addEventListener('DOMContentLoaded', () => {
  loadPrivateMessages();
  checkNewBroadcasts();
  // Refresh private messages every 30 seconds
  setInterval(loadPrivateMessages, 30000);
  // Check for new broadcasts every 60 seconds
  setInterval(checkNewBroadcasts, 60000);
});
               
