// pageAi.js – Fixed version with CSRF, XSS protection, and proper resource cleanup
(function() {
    // Helper: get CSRF token (if not using global apiFetch)
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content") : '';
    }

    // Fallback apiFetch if global not available (uses same logic as fixed api.js)
    async function safeFetch(url, options = {}) {
        const csrfToken = getCsrfToken();
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
            try {
                const errData = await res.json();
                errorMsg = errData.error || errData.message || `HTTP ${res.status}`;
            } catch (e) {
                errorMsg = `HTTP ${res.status}`;
            }
            throw new Error(errorMsg);
        }
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }
        return res;
    }

    // Use global apiFetch if defined, otherwise fallback
    const apiFetch = (typeof window.apiFetch === 'function') ? window.apiFetch : safeFetch;

    // DOM elements
    const qs = new URLSearchParams(window.location.search);
    const pageId = qs.get('pageId');
    if (!pageId) {
        alert('❌ Page ID missing');
        return;
    }

    // State
    let currentTopicId = null;
    let pollTimer = null;
    let logsInterval = null;

    // Element references
    const els = {
        topicSelect: document.getElementById('ai-topic-select'),
        editBtn: document.getElementById('ai-edit-topic'),
        deleteBtn: document.getElementById('ai-delete-topic'),
        topicName: document.getElementById('ai-topic-name'),
        postsPerDay: document.getElementById('ai-posts-per-day'),
        timesContainer: document.getElementById('ai-times-container'),
        addTimeBtn: document.getElementById('ai-add-time'),
        startDate: document.getElementById('ai-start-date'),
        endDate: document.getElementById('ai-end-date'),
        repeatType: document.getElementById('ai-repeat-type'),
        includeMedia: document.getElementById('ai-include-media'),
        includeVideo: document.getElementById('ai-include-video'),
        saveBtn: document.getElementById('ai-save-topic'),
        generateBtn: document.getElementById('ai-generate-post-now'),
        clearLogsBtn: document.getElementById('ai-clear-logs'),
        postsTable: document.getElementById('ai-upcoming-posts'),
        logsTable: document.getElementById('ai-logs'),
        monitor: document.getElementById('ai-monitor-log'),
        autoGenToggle: document.getElementById('autoGenToggle')
    };

    // Helper: escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Logger (safe)
    function log(msg, type = 'info') {
        if (!els.monitor) return;
        const color = type === 'error' ? '#ff4c4c' : type === 'warn' ? '#ffaa00' : '#00ff99';
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:${color}">[${new Date().toLocaleTimeString()}]</span> ${escapeHtml(msg)}`;
        els.monitor.appendChild(line);
        els.monitor.scrollTop = els.monitor.scrollHeight;
    }

    // ========== Mutual exclusivity for media/video ==========
    if (els.includeMedia && els.includeVideo) {
        els.includeMedia.addEventListener('change', () => {
            if (els.includeMedia.checked) els.includeVideo.checked = false;
        });
        els.includeVideo.addEventListener('change', () => {
            if (els.includeVideo.checked) els.includeMedia.checked = false;
        });
    }

    // ========== Auto-generation toggle ==========
    async function loadAutoGenState() {
        try {
            const data = await apiFetch(`/api/ai/page/${pageId}/auto-generation`);
            els.autoGenToggle.dataset.enabled = data.enabled;
            els.autoGenToggle.textContent = data.enabled ? 'Auto-Generation: ON' : 'Auto-Generation: OFF';
        } catch (err) {
            log('❌ Failed to load auto-generation state', 'error');
        }
    }

    if (els.autoGenToggle) {
        els.autoGenToggle.addEventListener('click', async () => {
            const currentlyEnabled = els.autoGenToggle.dataset.enabled === 'true';
            try {
                const data = await apiFetch(`/api/ai/page/${pageId}/auto-generation`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled: !currentlyEnabled })
                });
                els.autoGenToggle.dataset.enabled = data.enabled;
                els.autoGenToggle.textContent = data.enabled ? 'Auto-Generation: ON' : 'Auto-Generation: OFF';
                log(`🔄 Auto-Generation ${data.enabled ? 'enabled' : 'disabled'}`);
            } catch (err) {
                log('❌ Failed to toggle auto-generation', 'error');
            }
        });
        loadAutoGenState();
    }

    // ========== Page Profile ==========
    const profileEls = {
        name: document.getElementById('profile-name'),
        tone: document.getElementById('profile-tone'),
        writingStyle: document.getElementById('profile-writing-style'),
        voice: document.getElementById('profile-voice'),
        audienceTone: document.getElementById('profile-audience-tone'),
        audienceAge: document.getElementById('profile-audience-age'),
        audienceInterest: document.getElementById('profile-audience-interest'),
        extraNotes: document.getElementById('profile-extra-notes'),
        saveBtn: document.getElementById('profile-save'),
        deleteBtn: document.getElementById('profile-delete')
    };

    async function loadProfile() {
        try {
            const data = await apiFetch(`/api/ai/page/${pageId}/profile`);
            if (!data) return;
            profileEls.name.value = data.name || '';
            profileEls.tone.value = data.tone || 'friendly';
            profileEls.writingStyle.value = data.writingStyle || 'conversational';
            profileEls.voice.value = data.voice || 'first-person plural';
            profileEls.audienceTone.value = data.audienceTone || 'casual';
            profileEls.audienceAge.value = data.audienceAge || 'all ages';
            profileEls.audienceInterest.value = (data.audienceInterest || []).join(', ');
            profileEls.extraNotes.value = data.extraNotes || '';
        } catch (err) {
            log('❌ Failed to load page profile', 'error');
        }
    }

    if (profileEls.saveBtn) {
        profileEls.saveBtn.onclick = async () => {
            try {
                const payload = {
                    name: profileEls.name.value,
                    tone: profileEls.tone.value,
                    writingStyle: profileEls.writingStyle.value,
                    voice: profileEls.voice.value,
                    audienceTone: profileEls.audienceTone.value,
                    audienceAge: profileEls.audienceAge.value,
                    audienceInterest: profileEls.audienceInterest.value.split(',').map(i => i.trim()),
                    extraNotes: profileEls.extraNotes.value
                };
                await apiFetch(`/api/ai/page/${pageId}/profile`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                log('💾 Page profile saved');
            } catch (err) {
                log('❌ Failed saving page profile', 'error');
            }
        };
    }

    if (profileEls.deleteBtn) {
        profileEls.deleteBtn.onclick = async () => {
            if (!confirm('Are you sure you want to delete the page profile?')) return;
            await apiFetch(`/api/ai/page/${pageId}/profile`, { method: 'DELETE' });
            log('🗑 Page profile deleted');
            Object.values(profileEls).forEach(el => {
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = '';
            });
        };
    }
    loadProfile();

    // ========== Time inputs ==========
    function addTime(value = '') {
        const input = document.createElement('input');
        input.type = 'time';
        input.value = value;
        els.timesContainer.appendChild(input);
    }
    if (els.addTimeBtn) {
        els.addTimeBtn.onclick = () => {
            addTime();
            log('🕒 Time added');
        };
    }

    // ========== Load Topics ==========
    async function loadTopics() {
        try {
            const topics = await apiFetch(`/api/ai/page/${pageId}/topics`);
            els.topicSelect.innerHTML = '<option value="">-- Select Topic --</option>';
            topics.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t._id;
                opt.textContent = t.topicName;
                opt.dataset.topic = JSON.stringify(t);
                els.topicSelect.appendChild(opt);
            });
            log('📂 Topics loaded');
        } catch (err) {
            log('❌ Failed loading topics', 'error');
        }
    }

    if (els.topicSelect) {
        els.topicSelect.onchange = () => {
            const opt = els.topicSelect.selectedOptions[0];
            if (!opt) return;
            const t = JSON.parse(opt.dataset.topic);
            currentTopicId = t._id;
            els.topicName.value = t.topicName;
            els.postsPerDay.value = t.postsPerDay;
            els.timesContainer.innerHTML = '';
            t.times.forEach(addTime);
            els.startDate.value = t.startDate?.slice(0, 10);
            els.endDate.value = t.endDate?.slice(0, 10);
            els.repeatType.value = t.repeatType;
            els.includeMedia.checked = t.includeMedia === true;
            els.includeVideo.checked = t.includeVideo === true;
        };
    }

    // ========== Edit Topic ==========
    if (els.editBtn) {
        els.editBtn.onclick = async () => {
            if (!currentTopicId) return log('❌ Select a topic first', 'error');
            try {
                const payload = {
                    topicName: els.topicName.value.trim(),
                    postsPerDay: Number(els.postsPerDay.value),
                    times: [...els.timesContainer.querySelectorAll('input')].map(i => i.value),
                    startDate: els.startDate.value,
                    endDate: els.endDate.value,
                    repeatType: els.repeatType.value,
                    includeMedia: els.includeMedia.checked,
                    includeVideo: els.includeVideo.checked
                };
                await apiFetch(`/api/ai/topic/${currentTopicId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                log('✏️ Topic updated');
                loadTopics();
                loadUpcomingPosts();
                loadLogs();
            } catch (err) {
                log('❌ Failed updating topic', 'error');
            }
        };
    }

    // ========== Save Topic ==========
    if (els.saveBtn) {
        els.saveBtn.onclick = async () => {
            try {
                const payload = {
                    topicName: els.topicName.value.trim(),
                    postsPerDay: Number(els.postsPerDay.value),
                    times: [...els.timesContainer.querySelectorAll('input')].map(i => i.value),
                    startDate: els.startDate.value,
                    endDate: els.endDate.value,
                    repeatType: els.repeatType.value,
                    includeMedia: els.includeMedia.checked,
                    includeVideo: els.includeVideo.checked
                };
                if (!payload.topicName) return log('❌ Topic name required', 'error');
                if (!payload.postsPerDay || payload.postsPerDay <= 0) return log('❌ Posts per day must be greater than 0', 'error');
                if (!payload.times.length || payload.times.some(t => !t)) return log('❌ At least one valid time is required', 'error');
                if (!payload.startDate) return log('❌ Start date required', 'error');
                if (!payload.endDate) return log('❌ End date required', 'error');
                if (new Date(payload.endDate) < new Date(payload.startDate)) return log('❌ End date cannot be before start date', 'error');
                const data = await apiFetch(`/api/ai/page/${pageId}/topic`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (!data._id) throw new Error('Invalid response');
                currentTopicId = data._id;
                log(`💾 Topic saved: ${data.topicName}`);
                loadTopics();
                loadUpcomingPosts();
                loadLogs();
            } catch (err) {
                log('❌ Save failed', 'error');
            }
        };
    }

    // ========== Generate Posts ==========
    if (els.generateBtn) {
        els.generateBtn.onclick = async () => {
            if (!currentTopicId) return log('❌ Select a topic first', 'error');
            log('⏳ Generating posts...');
            els.generateBtn.disabled = true;
            try {
                await apiFetch(`/api/ai/topic/${currentTopicId}/generate-now`, { method: 'POST' });
                let attempts = 0;
                clearInterval(pollTimer);
                pollTimer = setInterval(async () => {
                    attempts++;
                    const posts = await apiFetch(`/api/ai/page/${pageId}/upcoming-posts`);
                    const count = posts.filter(p => p.topicId?._id === currentTopicId).length;
                    if (count >= Number(els.postsPerDay.value)) {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        log('🚀 Posts generated');
                        loadUpcomingPosts();
                        loadLogs();
                        els.generateBtn.disabled = false;
                    }
                    if (attempts > 20) {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        log('⚠️ Generation timeout', 'warn');
                        els.generateBtn.disabled = false;
                    }
                }, 2000);
            } catch (err) {
                log('❌ Generation request failed', 'error');
                els.generateBtn.disabled = false;
            }
        };
    }

    // ========== Load Upcoming Posts (with video detection and XSS protection) ==========
    async function loadUpcomingPosts() {
        if (!els.postsTable) return;
        els.postsTable.innerHTML = '<tr><td colspan="7">Loading posts...</td></tr>';
        try {
            const posts = await apiFetch(`/api/ai/page/${pageId}/upcoming-posts`);
            els.postsTable.innerHTML = '';
            if (posts.length === 0) {
                els.postsTable.innerHTML = '<tr><td colspan="7">No scheduled posts</td></tr>';
                return;
            }
            posts.forEach(p => {
                let mediaHtml = '';
                if (p.mediaUrl) {
                    const url = p.mediaUrl;
                    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('/video/upload/');
                    if (isVideo) {
                        mediaHtml = `<video width="120" controls><source src="${escapeHtml(url)}" type="video/mp4">Your browser does not support video.</video>`;
                    } else {
                        mediaHtml = `<a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(url)}" width="80" style="border-radius:4px"></a>`;
                    }
                } else {
                    mediaHtml = '—';
                }
                const tr = document.createElement('tr');
                tr.setAttribute('data-post-id', p._id);
                tr.innerHTML = `
                    <td>${escapeHtml(p.topicId?.topicName || '')}</td>
                    <td>${new Date(p.scheduledTime).toLocaleString()}</td>
                    <td>${escapeHtml(p.text || '')}</td>
                    <td>${mediaHtml}</td>
                    <td>${escapeHtml(p.status)}</td>
                    <td>
                        <button class="post-now-btn" data-id="${p._id}">Post</button>
                        <button class="edit-post-btn" data-id="${p._id}">Edit</button>
                        <button class="delete-post-btn" data-id="${p._id}">Delete</button>
                    </td>
                `;
                els.postsTable.appendChild(tr);
            });
            // Attach event listeners via delegation
            els.postsTable.querySelectorAll('.post-now-btn').forEach(btn => {
                btn.removeEventListener('click', handlePostNow);
                btn.addEventListener('click', handlePostNow);
            });
            els.postsTable.querySelectorAll('.edit-post-btn').forEach(btn => {
                btn.removeEventListener('click', handleEditPost);
                btn.addEventListener('click', handleEditPost);
            });
            els.postsTable.querySelectorAll('.delete-post-btn').forEach(btn => {
                btn.removeEventListener('click', handleDeletePost);
                btn.addEventListener('click', handleDeletePost);
            });
        } catch (err) {
            log('❌ Failed loading posts', 'error');
            els.postsTable.innerHTML = '<tr><td colspan="7">Error loading posts</td></tr>';
        }
    }

    async function handlePostNow(e) {
        const id = e.currentTarget.dataset.id;
        try {
            await apiFetch(`/api/ai/post/${id}/post-now`, { method: 'POST' });
            log('📤 Posted');
            loadUpcomingPosts();
        } catch (err) {
            log('❌ Failed to post now', 'error');
        }
    }

    async function handleEditPost(e) {
        const id = e.currentTarget.dataset.id;
        const text = prompt('Edit post text:');
        if (!text) return;
        try {
            await apiFetch(`/api/ai/post/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ text })
            });
            log('✏️ Post updated');
            loadUpcomingPosts();
        } catch (err) {
            log('❌ Failed to update post', 'error');
        }
    }

    async function handleDeletePost(e) {
        const id = e.currentTarget.dataset.id;
        if (!confirm('Delete this post?')) return;
        try {
            await apiFetch(`/api/ai/post/${id}`, { method: 'DELETE' });
            log('🗑 Post deleted');
            loadUpcomingPosts();
        } catch (err) {
            log('❌ Failed to delete post', 'error');
        }
    }

    // ========== Load Logs ==========
    async function loadLogs() {
        if (!els.logsTable) return;
        try {
            const logs = await apiFetch(`/api/ai/page/${pageId}/logs`);
            els.logsTable.innerHTML = logs.length
                ? logs.map(l => `
                    <tr>
                        <td>${escapeHtml(l.action)}</td>
                        <td>${escapeHtml(l.message)}</td>
                        <td>${new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                `).join('')
                : '<tr><td colspan="3">No logs</td></tr>';
        } catch (err) {
            log('❌ Failed loading logs', 'error');
            els.logsTable.innerHTML = '<tr><td colspan="3">Error loading logs</td></tr>';
        }
    }

    // ========== Cleanup intervals on page unload ==========
    function cleanupIntervals() {
        if (pollTimer) clearInterval(pollTimer);
        if (logsInterval) clearInterval(logsInterval);
    }
    window.addEventListener('beforeunload', cleanupIntervals);

    // ========== Start periodic logs refresh (every 30s, not 5s) ==========
    function startLogsRefresh() {
        if (logsInterval) clearInterval(logsInterval);
        logsInterval = setInterval(() => {
            if (!document.hidden) loadLogs();
        }, 30000);
    }
    startLogsRefresh();
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (logsInterval) clearInterval(logsInterval);
        } else {
            startLogsRefresh();
            loadLogs(); // refresh immediately
        }
    });

    // ========== Initial load ==========
    loadTopics();
    loadUpcomingPosts();
    loadLogs();
    log('✅ AI Scheduler ready');
})();
