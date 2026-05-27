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

async function getMasterSummary() { return apiFetch(`${API_BASE}/master/summary`); }
async function getPageInfo(pageId) { return apiFetch(`${API_BASE}/page/${pageId}`); }
async function getPagePosts(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/posts`); }
async function createPost(pageId, text, mediaUrl, scheduledTime) {
    return apiFetch(`${API_BASE}/page/${pageId}/post`, { method: 'POST', body: JSON.stringify({ text, mediaUrl, scheduledTime }) });
}
async function editPost(postId, data) { return apiFetch(`${API_BASE}/post/${postId}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deletePost(postId) { return apiFetch(`${API_BASE}/post/${postId}`, { method: 'DELETE' }); }
async function getPageLogs(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/logs`); }
async function getPageMessages(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/messages`); }
async function sendMessage(pageId, messageId, replyText) {
    return apiFetch(`${API_BASE}/page/${pageId}/message`, { method: 'POST', body: JSON.stringify({ messageId, replyText }) });
}
async function getTemplates(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/templates`); }
async function saveTemplate(pageId, data) { return apiFetch(`${API_BASE}/page/${pageId}/templates`, { method: 'POST', body: JSON.stringify(data) }); }
async function editTemplate(tid, data) { return apiFetch(`${API_BASE}/template/${tid}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function deleteTemplate(tid) { return apiFetch(`${API_BASE}/template/${tid}`, { method: 'DELETE' }); }
async function getPageInsights(pageId, range) { return apiFetch(`${API_BASE}/page/${pageId}/insights?range=${range||'daily'}`); }
async function getPageAlerts(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/alerts`); }
async function downloadReport(pageId, format) {
    const blob = await apiFetch(`${API_BASE}/page/${pageId}/report?format=${format||'pdf'}`, { headers: { 'Accept': 'application/octet-stream' } });
    return blob;
}
async function getPageAds(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/ads`); }
async function createAd(pageId, adData) { return apiFetch(`${API_BASE}/page/${pageId}/ad`, { method: 'POST', body: JSON.stringify(adData) }); }
async function editAd(adId, adData) { return apiFetch(`${API_BASE}/ad/${adId}`, { method: 'PUT', body: JSON.stringify(adData) }); }
async function deleteAd(adId) { return apiFetch(`${API_BASE}/ad/${adId}`, { method: 'DELETE' }); }
async function getPageComments(pageId) { return apiFetch(`${API_BASE}/page/${pageId}/comments`); }
async function hideComment(commentId) { return apiFetch(`${API_BASE}/comment/${commentId}`, { method: 'PUT', body: JSON.stringify({ status: 'HIDDEN' }) }); }
async function showComment(commentId) { return apiFetch(`${API_BASE}/comment/${commentId}`, { method: 'PUT', body: JSON.stringify({ status: 'VISIBLE' }) }); }
async function replyComment(commentId, replyText) {
    return apiFetch(`${API_BASE}/comment/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) });
}
