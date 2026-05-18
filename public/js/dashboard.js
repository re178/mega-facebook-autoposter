// ========================
// SESSION CHECK & AUTH
// ========================
let currentUser = null;
let isLoggedIn = false;

async function checkSession() {
  try {
    const sessionRes = await fetch('/api/session', {
      credentials: 'include'
    });
    const session = await sessionRes.json();
    
    console.log("SESSION:", session);
    
    // Check if user is logged in
    if (session && (session.userId || session.user || session._id)) {
      isLoggedIn = true;
      currentUser = session;
      const role = session.role || session.user?.role;
      const isAdmin = role === 'admin';
      
      console.log("User is logged in");
      console.log("ROLE:", role);
      console.log("IS ADMIN:", isAdmin);
      
      // User is logged in, load messages
      loadPrivateMessages();
      checkNewBroadcasts();
      
      // Setup intervals only if logged in
      setupIntervals();
      
      return true;
    } else {
      console.log("User is NOT logged in");
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
  // Don't try to load if not logged in
  if (!isLoggedIn) {
    console.log('Skipping private messages - user not logged in');
    return;
  }
  
  console.log('Loading private messages...');
  
  try {
    const res = await fetch('/api/user/messages/private', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Private messages response status:', res.status);
    
    if (res.status === 401) {
      console.log('Session expired or not authenticated');
      isLoggedIn = false;
      showNotLoggedInMessage();
      return;
    }
    
    if (!res.ok) {
      throw new Error(`Failed to fetch messages: ${res.status}`);
    }
    
    const messages = await res.json();
    console.log('Private messages received:', messages.length);
    
    const listEl = document.getElementById('msgList');
    if (!listEl) return;
    
    if (messages.length === 0) {
      listEl.innerHTML = '<li style="color: #888;">No private messages</li>';
      return;
    }
    
    // Display messages
    listEl.innerHTML = messages.map(msg => `
      <li class="private-msg ${msg.read ? 'read' : 'unread'}" data-msg-id="${msg._id}">
        <small>${new Date(msg.createdAt).toLocaleString()}</small>
        <div>${escapeHtml(msg.message)}</div>
        ${!msg.read ? '<span class="unread-badge">New</span>' : ''}
      </li>
    `).join('');
    
    // Mark unread messages as read (optional - only mark if user clicks or after viewing)
    // I'll mark them as read after 2 seconds of viewing
    setTimeout(() => {
      markUnreadMessagesAsRead(messages);
    }, 2000);
    
  } catch (err) {
    console.error('Private messages error:', err);
    const listEl = document.getElementById('msgList');
    if (listEl) {
      listEl.innerHTML = '<li style="color: red;">Error loading messages</li>';
    }
  }
}

async function markUnreadMessagesAsRead(messages) {
  const unreadMsgs = messages.filter(m => !m.read);
  
  for (let msg of unreadMsgs) {
    try {
      await fetch(`/api/user/messages/private/${msg._id}/read`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      console.log(`Marked message ${msg._id} as read`);
      
      // Update UI
      const msgElement = document.querySelector(`li[data-msg-id="${msg._id}"]`);
      if (msgElement) {
        msgElement.classList.remove('unread');
        msgElement.classList.add('read');
        const badge = msgElement.querySelector('.unread-badge');
        if (badge) badge.remove();
      }
    } catch (err) {
      console.error(`Failed to mark message ${msg._id} as read:`, err);
    }
  }
}

// ========================
// BROADCAST MESSAGES
// ========================
let lastBroadcastId = null;

async function checkNewBroadcasts() {
  // Don't try to load if not logged in
  if (!isLoggedIn) {
    console.log('Skipping broadcasts - user not logged in');
    return;
  }
  
  console.log('Checking for new broadcasts...');
  
  try {
    const res = await fetch('/api/user/messages/broadcast', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (res.status === 401) {
      console.log('Session expired');
      isLoggedIn = false;
      return;
    }
    
    if (!res.ok) {
      throw new Error(`Failed to fetch broadcasts: ${res.status}`);
    }
    
    const broadcasts = await res.json();
    console.log('Broadcasts received:', broadcasts.length);
    
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

// ========================
// TOAST NOTIFICATIONS
// ========================
function showToast(message) {
  console.log('Showing toast:', message);
  
  // Create toast container if it doesn't exist
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
  
  // Add close button functionality
  const closeBtn = toast.querySelector('button');
  closeBtn.onclick = () => toast.remove();
  
  // Auto remove after 5 seconds
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
let intervals = [];

function setupIntervals() {
  // Clear existing intervals
  intervals.forEach(interval => clearInterval(interval));
  intervals = [];
  
  // Refresh private messages every 30 seconds
  const interval1 = setInterval(() => {
    if (isLoggedIn) loadPrivateMessages();
  }, 30000);
  
  // Check for new broadcasts every 60 seconds
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
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .private-msg {
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      position: relative;
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
  
  // Optional: Check session periodically (every 5 minutes)
  setInterval(() => {
    if (!isLoggedIn) {
      checkSession();
    }
  }, 300000);
});
 
               
