const API_BASE = '/api/dashboard';

// =========================
// MASTER DASHBOARD API
// =========================
async function getMasterSummary() {
  const res = await fetch(`${API_BASE}/master/summary`);
  return res.json();
}

// =========================
// PAGE DASHBOARD API
// =========================
async function getPageInfo(pageId) {
  const res = await fetch(`${API_BASE}/page/${pageId}`);
  return res.json();
}

async function getPagePosts(pageId) {
  const res = await fetch(`${API_BASE}/page/${pageId}/posts`);
  return res.json();
}

async function createPost(pageId, text, mediaUrl = '', scheduledTime = null) {
  const res = await fetch(`${API_BASE}/page/${pageId}/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mediaUrl, scheduledTime })
  });
  return res.json();
}

async function editPost(postId, data) {
  const res = await fetch(`${API_BASE}/post/${postId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function deletePost(postId) {
  const res = await fetch(`${API_BASE}/post/${postId}`, { method: 'DELETE' });
  return res.json();
}

async function getPageLogs(pageId) {
  const res = await fetch(`${API_BASE}/page/${pageId}/logs`);
  return res.json();
}
