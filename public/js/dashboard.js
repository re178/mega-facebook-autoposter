// ========================
// PRIVATE MESSAGES
// ========================
async function loadPrivateMessages() {
  try {
    const res = await fetch('/api/user/messages/private', {
      credentials: 'include'
    });
    
    if (res.status === 401) {
      console.warn('User not authenticated');
      return;
    }
    
    if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
    const messages = await res.json();
    const listEl = document.getElementById('msgList');
    if (!listEl) return;
    
    if (messages.length === 0) {
      listEl.innerHTML = '<li style="color: #888;">No messages</li>';
      return;
    }
    
    listEl.innerHTML = '';
    messages.forEach(msg => {
      const li = document.createElement('li');
      li.className = `private-msg ${msg.read ? 'read' : 'unread'}`;
      li.innerHTML = `
        <small>${new Date(msg.createdAt).toLocaleString()}</small>
        <div>${escapeHtml(msg.message)}</div>
      `;
      
      if (!msg.read) {
        li.style.cursor = 'pointer';
        li.onclick = () => markAsRead(msg._id, li);
      }
      
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error('Private messages error:', err);
  }
}

async function markAsRead(msgId, element) {
  try {
    const res = await fetch(`/api/user/messages/private/${msgId}/read`, {
      method: 'PATCH',
      credentials: 'include'
    });
    
    if (res.ok) {
      element.classList.remove('unread');
      element.classList.add('read');
      element.style.cursor = 'default';
      element.onclick = null;
    }
  } catch (err) {
    console.error('Error marking as read:', err);
  }
}

// BROADCAST TOASTS with credentials
async function checkNewBroadcasts() {
  try {
    const res = await fetch('/api/user/messages/broadcast', {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to fetch broadcasts: ${res.status}`);
    const broadcasts = await res.json();
    if (broadcasts.length === 0) return;
    const latest = broadcasts[0];
    if (lastBroadcastId !== latest._id) {
      showToast(`📢 ${latest.message}`);
      lastBroadcastId = latest._id;
    }
  } catch (err) {
    console.error('Broadcast check error:', err);
  }
}
               
