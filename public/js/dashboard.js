// ========================
// DEBUG PRIVATE MESSAGES
// ========================
async function loadPrivateMessages() {
  console.log('=== loadPrivateMessages STARTED ===');
  
  try {
    console.log('Making fetch request to: /api/user/messages/private');
    const res = await fetch('/api/user/messages/private', {
      credentials: 'include'
    });
    
    console.log('Response status:', res.status);
    console.log('Response ok?', res.ok);
    console.log('Response headers:', [...res.headers.entries()]);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Error response body:', errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    const messages = await res.json();
    console.log('Messages received:', messages);
    console.log('Number of messages:', messages.length);
    
    const listEl = document.getElementById('msgList');
    console.log('List element found?', listEl);
    
    if (!listEl) {
      console.error('Element with id "msgList" not found!');
      return;
    }
    
    if (messages.length === 0) {
      console.log('No messages, showing empty state');
      listEl.innerHTML = '<li style="color: #888;">No messages</li>';
      return;
    }
    
    console.log('Rendering messages to DOM');
    listEl.innerHTML = messages.map(msg => `
      <li class="private-msg ${msg.read ? 'read' : 'unread'}">
        <small>${new Date(msg.createdAt).toLocaleString()}</small>
        <div>${escapeHtml(msg.message)}</div>
      </li>
    `).join('');
    
    console.log('Messages rendered successfully');
    
    // Mark unread messages as read
    const unreadMsgs = messages.filter(m => !m.read);
    console.log(`Found ${unreadMsgs.length} unread messages`);
    
    for (let msg of unreadMsgs) {
      console.log(`Marking message ${msg._id} as read...`);
      try {
        const markRes = await fetch(`/api/user/messages/private/${msg._id}/read`, {
          method: 'PATCH',
          credentials: 'include'
        });
        console.log(`Mark as read response status: ${markRes.status}`);
      } catch (markErr) {
        console.error(`Failed to mark message ${msg._id}:`, markErr);
      }
    }
    
  } catch (err) {
    console.error('!!! PRIVATE MESSAGES ERROR !!!', err);
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Show error on page
    const listEl = document.getElementById('msgList');
    if (listEl) {
      listEl.innerHTML = `<li style="color: red;">Error loading messages: ${err.message}</li>`;
    }
  }
  
  console.log('=== loadPrivateMessages ENDED ===');
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
// DEBUG BROADCAST
// ========================
let lastBroadcastId = null;

async function checkNewBroadcasts() {
  console.log('Checking broadcasts...');
  try {
    const res = await fetch('/api/user/messages/broadcast', {
      credentials: 'include'
    });
    console.log('Broadcast response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Broadcast error:', errorText);
      throw new Error('Failed to fetch broadcasts');
    }
    
    const broadcasts = await res.json();
    console.log('Broadcasts received:', broadcasts);
    
    if (broadcasts.length === 0) return;
    const latest = broadcasts[0];
    console.log('Latest broadcast ID:', latest._id);
    console.log('Last broadcast ID:', lastBroadcastId);
    
    if (lastBroadcastId !== latest._id) {
      console.log('Showing toast for new broadcast');
      showToast(`📢 ${latest.message}`);
      lastBroadcastId = latest._id;
    }
  } catch (err) {
    console.error('Broadcast check error:', err);
  }
}

function showToast(message) {
  console.log('Toast message:', message);
  const container = document.getElementById('toastContainer');
  console.log('Toast container found?', container);
  
  if (!container) {
    console.warn('No toastContainer element found');
    return;
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-header">📢 System Broadcast</div>
    <div class="toast-body">${escapeHtml(message)}</div>
    <button class="toast-close">✖</button>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 5000);
  
  toast.querySelector('.toast-close').onclick = () => toast.remove();
}

// ========================
// INITIALIZATION
// ========================
console.log('Script loaded, waiting for DOMContentLoaded');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');
  console.log('Current URL:', window.location.href);
  console.log('Check if user is logged in?', document.cookie);
  
  loadPrivateMessages();
  checkNewBroadcasts();
  
  console.log('Setting up intervals');
  // Refresh private messages every 30 seconds
  setInterval(loadPrivateMessages, 30000);
  // Check for new broadcasts every 60 seconds
  setInterval(checkNewBroadcasts, 60000);
});
               
