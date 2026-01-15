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
// ===== Messaging / Inbox =====
async function getPageMessages(pageId) {
  return fetch(`${API_BASE}/page/${pageId}/messages`).then(r => r.json());
}

async function sendMessage(pageId, messageId, replyText) {
  return fetch(`${API_BASE}/page/${pageId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, replyText })
  }).then(r => r.json());
}

// ===== Templates / Auto-replies =====
async function getTemplates(pageId) {
  return fetch(`${API_BASE}/page/${pageId}/templates`).then(r => r.json());
}

async function saveTemplate(pageId, templateData) {
  return fetch(`${API_BASE}/page/${pageId}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(templateData)
  }).then(r => r.json());
}

async function editTemplate(templateId, templateData) {
  return fetch(`${API_BASE}/template/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(templateData)
  }).then(r => r.json());
}

async function deleteTemplate(templateId) {
  return fetch(`${API_BASE}/template/${templateId}`, { method: 'DELETE' }).then(r => r.json());
}
// ===== Analytics / Insights =====
async function getPageInsights(pageId, range = 'daily') {
  // range: 'daily', 'weekly', 'monthly'
  return fetch(`${API_BASE}/page/${pageId}/insights?range=${range}`).then(r => r.json());
}

async function getPageAlerts(pageId) {
  return fetch(`${API_BASE}/page/${pageId}/alerts`).then(r => r.json());
}

async function downloadReport(pageId, format = 'pdf') {
  // format: 'pdf', 'csv', 'excel'
  return fetch(`${API_BASE}/page/${pageId}/report?format=${format}`).then(r => r.blob());
}
// ===== Ads / Campaigns =====
async function getPageAds(pageId) {
  return fetch(`${API_BASE}/page/${pageId}/ads`).then(r => r.json());
}

async function createAd(pageId, adData) {
  return fetch(`${API_BASE}/page/${pageId}/ad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adData)
  }).then(r => r.json());
}

async function editAd(adId, adData) {
  return fetch(`${API_BASE}/page/${adId}/ad`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adData)
  }).then(r => r.json());
}

async function deleteAd(adId) {
  return fetch(`${API_BASE}/page/${adId}/ad`, { method: 'DELETE' }).then(r => r.json());
}
// ===== Comments / Moderation =====
async function getPageComments(pageId) {
  return fetch(`${API_BASE}/page/${pageId}/comments`).then(r => r.json());
}

async function hideComment(commentId) {
  return fetch(`${API_BASE}/page/${commentId}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'HIDDEN' })
  }).then(r => r.json());
}

async function showComment(commentId) {
  return fetch(`${API_BASE}/page/${commentId}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'VISIBLE' })
  }).then(r => r.json());
}

async function replyComment(commentId, replyText) {
  return fetch(`${API_BASE}/page/${commentId}/comment/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyText })
  }).then(r => r.json());
}
