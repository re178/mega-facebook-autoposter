// js/api.js – Enhanced with CSRF, 401 handling, fixed ad routes
const API_BASE = '/api/dashboard';

// Helper: get CSRF token from meta tag
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// Central fetch wrapper with authentication and CSRF
async function apiFetch(url, options = {}) {
    const csrfToken = getCsrfToken();
    const method = options.method || 'GET';
    const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (isStateChanging && csrfToken && !options.skipCsrf) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers
    });
    if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('Session expired – redirecting to login');
    }
    if (!res.ok) {
        let errorMsg;
        try {
            const errData = await res.json();
            errorMsg = errData.error || errData.message || `HTTP ${res.status}`;
        } catch (e) {
            errorMsg = `HTTP ${res.status}`;
        }
        throw new Error(errorMsg);
    }
    // Return JSON if possible, otherwise raw response
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return res.json();
    }
    return res;
}

// =========================
// MASTER DASHBOARD API
// =========================
async function getMasterSummary() {
    return apiFetch(`${API_BASE}/master/summary`);
}

// =========================
// PAGE DASHBOARD API
// =========================
async function getPageInfo(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}`);
}

async function getPagePosts(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/posts`);
}

async function createPost(pageId, text, mediaUrl = '', scheduledTime = null) {
    return apiFetch(`${API_BASE}/page/${pageId}/post`, {
        method: 'POST',
        body: JSON.stringify({ text, mediaUrl, scheduledTime })
    });
}

async function editPost(postId, data) {
    return apiFetch(`${API_BASE}/post/${postId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

async function deletePost(postId) {
    return apiFetch(`${API_BASE}/post/${postId}`, { method: 'DELETE' });
}

async function getPageLogs(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/logs`);
}

// ===== Messaging / Inbox =====
async function getPageMessages(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/messages`);
}

async function sendMessage(pageId, messageId, replyText) {
    return apiFetch(`${API_BASE}/page/${pageId}/message`, {
        method: 'POST',
        body: JSON.stringify({ messageId, replyText })
    });
}

// ===== Templates / Auto-replies =====
async function getTemplates(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/templates`);
}

async function saveTemplate(pageId, templateData) {
    return apiFetch(`${API_BASE}/page/${pageId}/templates`, {
        method: 'POST',
        body: JSON.stringify(templateData)
    });
}

async function editTemplate(templateId, templateData) {
    return apiFetch(`${API_BASE}/template/${templateId}`, {
        method: 'PUT',
        body: JSON.stringify(templateData)
    });
}

async function deleteTemplate(templateId) {
    return apiFetch(`${API_BASE}/template/${templateId}`, { method: 'DELETE' });
}

// ===== Analytics / Insights =====
async function getPageInsights(pageId, range = 'daily') {
    return apiFetch(`${API_BASE}/page/${pageId}/insights?range=${range}`);
}

async function getPageAlerts(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/alerts`);
}

async function downloadReport(pageId, format = 'pdf') {
    const res = await apiFetch(`${API_BASE}/page/${pageId}/report?format=${format}`, {
        headers: { 'Accept': 'application/octet-stream' }
    });
    return res.blob();
}

// ===== Ads / Campaigns – FIXED ROUTES =====
async function getPageAds(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/ads`);
}

async function createAd(pageId, adData) {
    return apiFetch(`${API_BASE}/page/${pageId}/ad`, {
        method: 'POST',
        body: JSON.stringify(adData)
    });
}

// ✅ FIXED: editAd uses /ad/:adId (not /page/:adId/ad)
async function editAd(adId, adData) {
    return apiFetch(`${API_BASE}/ad/${adId}`, {
        method: 'PUT',
        body: JSON.stringify(adData)
    });
}

// ✅ FIXED: deleteAd uses /ad/:adId
async function deleteAd(adId) {
    return apiFetch(`${API_BASE}/ad/${adId}`, { method: 'DELETE' });
}

// ===== Comments / Moderation =====
async function getPageComments(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/comments`);
}

async function hideComment(commentId) {
    return apiFetch(`${API_BASE}/page/${commentId}/comment`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'HIDDEN' })
    });
}

async function showComment(commentId) {
    return apiFetch(`${API_BASE}/page/${commentId}/comment`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'VISIBLE' })
    });
}

async function replyComment(commentId, replyText) {
    return apiFetch(`${API_BASE}/page/${commentId}/comment/reply`, {
        method: 'POST',
        body: JSON.stringify({ replyText })
    });
}

// ===== NEW: Secure token fetch for pages (avoids exposing token in HTML) =====
async function getPageToken(pageId) {
    return apiFetch(`${API_BASE}/page/${pageId}/token`);  // Backend must implement
}
