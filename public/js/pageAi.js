// pageAi.js – Fixed syntax error, uses global apiFetch
(function() {
    // Helper: escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // Get pageId from URL
    const qs = new URLSearchParams(window.location.search);
    const pageId = qs.get('pageId');
    if (!pageId) {
        alert('❌ Page ID missing');
        return;
    }

    // DOM elements
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

    // Use global apiFetch if available
    const apiFetch = window.apiFetch || (async (url, opts) => {
        const res = await fetch(url, { ...opts, credentials: 'include' });
        if (res.status === 401) window.location.href = '/login';
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    });

    let currentTopicId = null;
    let pollTimer = null;

    function log(msg, type = 'info') {
        const color = type === 'error' ? '#ff4c4c' : type === 'warn' ? '#ffaa00' : '#00ff99';
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:${color}">[${new Date().toLocaleTimeString()}]</span> ${escapeHtml(msg)}`;
        els.monitor.appendChild(line);
        els.monitor.scrollTop = els.monitor.scrollHeight;
    }

    // Mutual exclusivity for media/video
    if (els.includeMedia) {
        els.includeMedia.addEventListener('change', () => {
            if (els.includeMedia.checked) els.includeVideo.checked = false;
        });
        els.includeVideo.addEventListener('change', () => {
            if (els.includeVideo.checked) els.includeMedia.checked = false;
        });
    }

    // Auto-generation toggle
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

    // Time inputs
    function addTime(value = '') {
        const input = document.createElement('input');
        input.type = 'time';
        input.value = value;
        els.timesContainer.appendChild(input);
    }
    if (els.addTimeBtn) {
        els.addTimeBtn.onclick = () => addTime();
    }

    // Topics
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

    // Save topic
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
                if (payload.postsPerDay <= 0) return log('❌ Posts per day > 0', 'error');
                if (!payload.times.length || payload.times.some(t => !t)) return log('❌ Valid time required', 'error');
                if (!payload.startDate || !payload.endDate) return log('❌ Date range required', 'error');
                if (new Date(payload.endDate) < new Date(payload.startDate)) return log('❌ End date before start', 'error');
                const data = await apiFetch(`/api/ai/page/${pageId}/topic`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
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

    // Edit topic
    if (els.editBtn) {
        els.editBtn.onclick = async () => {
            if (!currentTopicId) return log('❌ Select topic first', 'error');
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

    // Generate posts
    if (els.generateBtn) {
        els.generateBtn.onclick = async () => {
            if (!currentTopicId) return log('❌ Select topic first', 'error');
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
                        log('🚀 Posts generated');
                        loadUpcomingPosts();
                        loadLogs();
                        els.generateBtn.disabled = false;
                    }
                    if (attempts > 20) {
                        clearInterval(pollTimer);
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

    // Load upcoming posts
    async function loadUpcomingPosts() {
        if (!els.postsTable) return;
        try {
            const posts = await apiFetch(`/api/ai/page/${pageId}/upcoming-posts`);
            els.postsTable.innerHTML = '';
            posts.forEach(p => {
                let mediaHtml = '—';
                if (p.mediaUrl) {
                    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(p.mediaUrl) || p.mediaUrl.includes('/video/upload/');
                    mediaHtml = isVideo ?
                        `<video width="120" controls><source src="${escapeHtml(p.mediaUrl)}" type="video/mp4"></video>` :
                        `<a href="${escapeHtml(p.mediaUrl)}" target="_blank"><img src="${escapeHtml(p.mediaUrl)}" width="80"></a>`;
                }
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(p.topicId?.topicName || '')}</td>
                    <td>${new Date(p.scheduledTime).toLocaleString()}</td>
                    <td>${escapeHtml(p.text || '')}</td>
                    <td>${mediaHtml}</td>
                    <td>${escapeHtml(p.status)}</td>
                    <td>
                        <button class="post-now" data-id="${p._id}">Post</button>
                        <button class="edit-post" data-id="${p._id}">Edit</button>
                        <button class="delete-post" data-id="${p._id}">Delete</button>
                    </td>
                `;
                els.postsTable.appendChild(tr);
            });
            // Event delegation for buttons
            els.postsTable.querySelectorAll('.post-now').forEach(btn => {
                btn.onclick = async () => {
                    await apiFetch(`/api/ai/post/${btn.dataset.id}/post-now`, { method: 'POST' });
                    loadUpcomingPosts();
                };
            });
            els.postsTable.querySelectorAll('.edit-post').forEach(btn => {
                btn.onclick = async () => {
                    const text = prompt('Edit post text');
                    if (text) {
                        await apiFetch(`/api/ai/post/${btn.dataset.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ text })
                        });
                        loadUpcomingPosts();
                    }
                };
            });
            els.postsTable.querySelectorAll('.delete-post').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm('Delete this post?')) {
                        await apiFetch(`/api/ai/post/${btn.dataset.id}`, { method: 'DELETE' });
                        loadUpcomingPosts();
                    }
                };
            });
        } catch (err) {
            log('❌ Failed loading posts', 'error');
        }
    }

    // Load logs
    async function loadLogs() {
        if (!els.logsTable) return;
        try {
            const logs = await apiFetch(`/api/ai/page/${pageId}/logs`);
            els.logsTable.innerHTML = logs.length ? logs.map(l => `
                <tr>
                    <td>${escapeHtml(l.action)}</td>
                    <td>${escapeHtml(l.message)}</td>
                    <td>${new Date(l.createdAt).toLocaleString()}</td>
                </tr>
            `).join('') : '<tr><td colspan="3">No logs</td></tr>';
        } catch (err) {
            log('❌ Failed loading logs', 'error');
        }
    }

    // Initial load
    loadTopics();
    loadUpcomingPosts();
    loadLogs();
    setInterval(loadLogs, 30000);
    log('✅ AI Scheduler ready');
})();
