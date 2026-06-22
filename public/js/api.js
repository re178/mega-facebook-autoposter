// dashboard-api.js – Full API wrapper with new endpoints
const API_BASE = '/api/dashboard';
let csrfToken = null;

async function fetchCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    csrfToken = meta ? meta.getAttribute('content') : '';
}
fetchCsrfToken();

async function apiFetch(url, options = {}) {
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
        window.location.href = '/login';
        throw new Error('Session expired');
    }
    if (!res.ok) {
        let errorMsg;
        try { const err = await res.json(); errorMsg = err.error || err.message; } catch(e) { errorMsg = `HTTP ${res.status}`; }
        throw new Error(errorMsg);
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) return res.json();
    return res;
}

window.apiFetch = apiFetch;

// ---- Master Dashboard ----
async function getMasterSummary() {
    return apiFetch('/api/dashboard/master-summary');
}

// ---- Pages ----
async function getPageInfo(pageId) { return apiFetch(`${API_BASE}/page/${pageId}`); }
async function getPagePosts(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/posts`); }
async function createPost(pageId, text, mediaUrl, scheduledTime) {
    return apiFetch(`${API_BASE}/page/${pageId}/post`, { method: 'POST', body: JSON.stringify({ text, mediaUrl, scheduledTime }) });
}
async function editPost(postId, data) { return apiFetch(`${API_BASE}/post/${postId}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deletePost(postId) { return apiFetch(`${API_BASE}/post/${postId}`, { method: 'DELETE' }); }
async function getPageLogs(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/logs`); }

// ---- Messaging ----
async function getPageMessages(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/messages`); }
async function sendMessage(pageId, messageId, replyText) {
    return apiFetch(`${API_BASE}/page/${pageId}/message`, { method: 'POST', body: JSON.stringify({ messageId, replyText }) });
}
async function getTemplates(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/templates`); }
async function saveTemplate(pageId, data) { return apiFetch(`${API_BASE}/page/${pageId}/templates`, { method: 'POST', body: JSON.stringify(data) }); }
async function editTemplate(tid, data) { return apiFetch(`${API_BASE}/template/${tid}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deleteTemplate(tid) { return apiFetch(`${API_BASE}/template/${tid}`, { method: 'DELETE' }); }

// ---- Analytics ----
async function getPageInsights(pageId, range) { return apiFetch(`${API_BASE}/page/${pageId}/insights?range=${range||'daily'}`); }
async function downloadReport(pageId, format) {
    const blob = await apiFetch(`${API_BASE}/page/${pageId}/report?format=${format||'pdf'}`, { headers: { 'Accept': 'application/octet-stream' } });
    return blob;
}

// ---- Ads ----
async function getPageAds(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/ads`); }
async function createAd(pageId, adData) { return apiFetch(`${API_BASE}/page/${pageId}/ad`, { method: 'POST', body: JSON.stringify(adData) }); }
async function editAd(adId, adData) { return apiFetch(`${API_BASE}/ad/${adId}`, { method: 'PUT', body: JSON.stringify(adData) }); }
async function deleteAd(adId) { return apiFetch(`${API_BASE}/ad/${adId}`, { method: 'DELETE' }); }

// ---- Comments ----
async function getPageComments(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/comments`); }
async function hideComment(commentId) { return apiFetch(`${API_BASE}/comment/${commentId}`, { method: 'PUT', body: JSON.stringify({ status: 'HIDDEN' }) }); }
async function showComment(commentId) { return apiFetch(`${API_BASE}/comment/${commentId}`, { method: 'PUT', body: JSON.stringify({ status: 'VISIBLE' }) }); }
async function replyComment(commentId, replyText) {
    return apiFetch(`${API_BASE}/comment/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) });
}

// ---- AI Scheduler ----
async function getAITopics(pageId) { return apiFetch(`/api/ai/page/${pageId}/topics`); }
async function saveAITopic(pageId, data) { return apiFetch(`/api/ai/page/${pageId}/topic`, { method: 'POST', body: JSON.stringify(data) }); }
async function updateAITopic(topicId, data) { return apiFetch(`/api/ai/topic/${topicId}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deleteAITopic(topicId) { return apiFetch(`/api/ai/topic/${topicId}`, { method: 'DELETE' }); }
async function generateAIPosts(topicId) { return apiFetch(`/api/ai/topic/${topicId}/generate-now`, { method: 'POST' }); }
async function getAIUpcomingPosts(pageId) { return apiFetch(`/api/ai/page/${pageId}/upcoming-posts`); }
async function getAILogs(pageId) { return apiFetch(`/api/ai/page/${pageId}/logs`); }
async function clearAILogs(pageId) { return apiFetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' }); }
async function getAIPageProfile(pageId) { return apiFetch(`/api/ai/page/${pageId}/profile`); }
async function saveAIPageProfile(pageId, data) { return apiFetch(`/api/ai/page/${pageId}/profile`, { method: 'POST', body: JSON.stringify(data) }); }
async function deleteAIPageProfile(pageId) { return apiFetch(`/api/ai/page/${pageId}/profile`, { method: 'DELETE' }); }
async function toggleAutoGeneration(pageId, enabled) { return apiFetch(`/api/ai/page/${pageId}/auto-generation`, { method: 'POST', body: JSON.stringify({ enabled }) }); }
async function getAutoGenerationState(pageId) { return apiFetch(`/api/ai/page/${pageId}/auto-generation`); }
async function postNowAI(postId) { return apiFetch(`/api/ai/post/${postId}/post-now`, { method: 'POST' }); }
async function deleteAIPost(postId) { return apiFetch(`/api/ai/post/${postId}`, { method: 'DELETE' }); }
async function editAIPost(postId, data) { return apiFetch(`/api/ai/post/${postId}`, { method: 'PUT', body: JSON.stringify(data) }); }

// ---- Upgrade & Pricing ----
async function getPricing() { return apiFetch('/api/pricing'); }
async function upgradeUser(plan) { return apiFetch('/api/user/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }); }

// ---- Admin ----
async function getAdminStats() { return apiFetch('/api/admin/stats'); }
async function getAdminUsers() { return apiFetch('/api/admin/users'); }
async function createAdminUser(data) { return apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }); }
async function updateAdminUser(userId, data) { return apiFetch(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function suspendUser(userId) { return apiFetch(`/api/admin/users/${userId}/suspend`, { method: 'PATCH' }); }
async function reactivateUser(userId) { return apiFetch(`/api/admin/users/${userId}/reactivate`, { method: 'PATCH' }); }
async function lockAI(userId) { return apiFetch(`/api/admin/users/${userId}/lock-ai`, { method: 'PATCH' }); }
async function unlockAI(userId) { return apiFetch(`/api/admin/users/${userId}/unlock-ai`, { method: 'PATCH' }); }
async function resetUserPassword(userId, newPassword) { return apiFetch(`/api/admin/users/${userId}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }); }
async function deleteUser(userId) { return apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' }); }
async function getAdminPages() { return apiFetch('/api/admin/pages'); }
async function getAdminPage(pageId) { return apiFetch(`/api/admin/pages/${pageId}`); }
async function updateAdminPage(pageId, data) { return apiFetch(`/api/admin/pages/${pageId}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deleteAdminPage(pageId) { return apiFetch(`/api/admin/pages/${pageId}`, { method: 'DELETE' }); }
async function createAdminPage(data) { return apiFetch('/api/admin/pages', { method: 'POST', body: JSON.stringify(data) }); }
async function getAdminLogs() { return apiFetch('/api/admin/logs'); }
async function deleteAdminLog(logId) { return apiFetch(`/api/admin/logs/${logId}`, { method: 'DELETE' }); }
async function clearAllLogs() { return apiFetch('/api/admin/logs/clear-all', { method: 'DELETE' }); }
async function sendBroadcast(message) { return apiFetch('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ message }) }); }
async function getBroadcasts() { return apiFetch('/api/admin/broadcast'); }
async function updateBroadcast(broadcastId, message) { return apiFetch(`/api/admin/broadcast/${broadcastId}`, { method: 'PUT', body: JSON.stringify({ message }) }); }
async function deleteBroadcast(broadcastId) { return apiFetch(`/api/admin/broadcast/${broadcastId}`, { method: 'DELETE' }); }
async function getPrivateMessages(userId) { return apiFetch(`/api/admin/messages${userId ? '?userId='+userId : ''}`); }
async function sendPrivateMessage(userId, message) { return apiFetch(`/api/admin/message/${userId}`, { method: 'POST', body: JSON.stringify({ message }) }); }
async function updatePrivateMessage(msgId, message) { return apiFetch(`/api/admin/message/${msgId}`, { method: 'PUT', body: JSON.stringify({ message }) }); }
async function deletePrivateMessage(msgId) { return apiFetch(`/api/admin/message/${msgId}`, { method: 'DELETE' }); }
async function toggleMaintenance(mode) { return apiFetch(`/api/admin/maintenance/${mode}`, { method: 'PATCH' }); }
async function updatePricing(data) { return apiFetch('/api/admin/pricing', { method: 'PUT', body: JSON.stringify(data) }); }
