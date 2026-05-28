// pageAi.js – Complete working version with Page Profile and working delete buttons
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
        deleteTopicBtn: document.getElementById('ai-delete-topic'),
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

    // Page Profile elements
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

    // Use global apiFetch if available
    const apiFetch = window.apiFetch || (async (url, opts) => {
        const res = await fetch(url, { ...opts, credentials: 'include' });
        if (res.status === 401) window.location.href = '/login';
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || `HTTP ${res.status}`);
        }
        return res.json();
    });

    let currentTopicId = null;
    let pollTimer = null;

    function log(msg, type = 'info') {
        if (!els.monitor) return;
        const color = type === 'error' ? '#ff4c4c' : type === 'warn' ? '#ffaa00' : '#00ff99';
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:${color}">[${new Date().toLocaleTimeString()}]</span> ${escapeHtml(msg)}`;
        els.monitor.appendChild(line);
        els.monitor.scrollTop = els.monitor.scrollHeight;
    }

    // ========== PAGE PROFILE ==========
    async function loadProfile() {
        try {
            const data = await apiFetch(`/api/ai/page/${pageId}/profile`);
            console.log('Profile data:', data);
            if (data && Object.keys(data).length > 0) {
                if (profileEls.name) profileEls.name.value = data.name || '';
                if (profileEls.tone) profileEls.tone.value = data.tone || 'friendly';
                if (profileEls.writingStyle) profileEls.writingStyle.value = data.writingStyle || 'conversational';
                if (profileEls.voice) profileEls.voice.value = data.voice || '';
                if (profileEls.audienceTone) profileEls.audienceTone.value = data.audienceTone || '';
                if (profileEls.audienceAge) profileEls.audienceAge.value = data.audienceAge || '';
                if (profileEls.audienceInterest) profileEls.audienceInterest.value = (data.audienceInterest || []).join(', ');
                if (profileEls.extraNotes) profileEls.extraNotes.value = data.extraNotes || '';
                log('📄 Page profile loaded');
            } else {
                // Clear form
                if (profileEls.name) profileEls.name.value = '';
                if (profileEls.tone) profileEls.tone.value = 'friendly';
                if (profileEls.writingStyle) profileEls.writingStyle.value = 'conversational';
                if (profileEls.voice) profileEls.voice.value = '';
                if (profileEls.audienceTone) profileEls.audienceTone.value = '';
                if (profileEls.audienceAge) profileEls.audienceAge.value = '';
                if (profileEls.audienceInterest) profileEls.audienceInterest.value = '';
                if (profileEls.extraNotes) profileEls.extraNotes.value = '';
                log('No existing profile', 'warn');
            }
        } catch (err) {
            console.error('Profile load error:', err);
            log('❌ Failed to load page profile', 'error');
        }
    }

    if (profileEls.saveBtn) {
        profileEls.saveBtn.onclick = async () => {
            try {
                const payload = {
                    name: profileEls.name?.value || '',
                    tone: profileEls.tone?.value || 'friendly',
                    writingStyle: profileEls.writingStyle?.value || 'conversational',
                    voice: profileEls.voice?.value || '',
                    audienceTone: profileEls.audienceTone?.value || '',
                    audienceAge: profileEls.audienceAge?.value || '',
                    audienceInterest: (profileEls.audienceInterest?.value || '').split(',').map(i => i.trim()).filter(i => i),
                    extraNotes: profileEls.extraNotes?.value || ''
                };
                await apiFetch(`/api/ai/page/${pageId}/profile`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                log('💾 Page profile saved');
                alert('Profile saved successfully!');
            } catch (err) {
                log('❌ Failed saving page profile', 'error');
                alert('Error saving profile: ' + err.message);
            }
        };
    }

    if (profileEls.deleteBtn) {
        profileEls.deleteBtn.onclick = async () => {
            if (!confirm('Are you sure you want to delete the page profile?')) return;
            try {
                await apiFetch(`/api/ai/page/${pageId}/profile`, { method: 'DELETE' });
                log('🗑 Page profile deleted');
                // Clear form
                if (profileEls.name) profileEls.name.value = '';
                if (profileEls.tone) profileEls.tone.value = 'friendly';
                if (profileEls.writingStyle) profileEls.writingStyle.value = 'conversational';
                if (profileEls.voice) profileEls.voice.value = '';
                if (profileEls.audienceTone) profileEls.audienceTone.value = '';
                if (profileEls.audienceAge) profileEls.audienceAge.value = '';
                if (profileEls.audienceInterest) profileEls.audienceInterest.value = '';
                if (profileEls.extraNotes) profileEls.extraNotes.value = '';
                alert('Profile deleted');
            } catch (err) {
                log('❌ Failed deleting profile', 'error');
            }
        };
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

    // Delete topic
    if (els.deleteTopicBtn) {
        els.deleteTopicBtn.onclick = async () => {
            if (!currentTopicId) return log('❌ Select topic first', 'error');
            if (!confirm('Delete entire topic and ALL its scheduled posts? This cannot be undone.')) return;
            try {
                await apiFetch(`/api/ai/topic/${currentTopicId}`, { method: 'DELETE' });
                log('🗑 Topic deleted');
                currentTopicId = null;
                els.topicName.value = '';
                els.postsPerDay.value = '1';
                els.timesContainer.innerHTML = '';
                els.startDate.value = '';
                els.endDate.value = '';
                els.repeatType.value = 'daily';
                els.includeMedia.checked = false;
                els.includeVideo.checked = false;
                loadTopics();
                loadUpcomingPosts();
                loadLogs();
            } catch (err) {
                log('❌ Failed deleting topic', 'error');
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
                    try {
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
                    } catch (err) {
                        console.error('Poll error:', err);
                    }
                }, 2000);
            } catch (err) {
                log('❌ Generation request failed', 'error');
                els.generateBtn.disabled = false;
            }
        };
    }

    // Load upcoming posts with WORKING delete buttons
    async function loadUpcomingPosts() {
        if (!els.postsTable) return;
        try {
            const posts = await apiFetch(`/api/ai/page/${pageId}/upcoming-posts`);
            els.postsTable.innerHTML = '';
            if (posts.length === 0) {
                els.postsTable.innerHTML = '<tr><td colspan="6">No scheduled posts</td></tr>';
                return;
            }
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
                        <button class="post-now-btn" data-id="${p._id}">▶ Post</button>
                        <button class="edit-post-btn" data-id="${p._id}">✏️ Edit</button>
                        <button class="delete-post-btn" data-id="${p._id}">🗑️ Delete</button>
                    </td>
                `;
                els.postsTable.appendChild(tr);
            });
            
            // Post Now buttons
            els.postsTable.querySelectorAll('.post-now-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    try {
                        await apiFetch(`/api/ai/post/${id}/post-now`, { method: 'POST' });
                        log('📤 Post published');
                        loadUpcomingPosts();
                        loadLogs();
                    } catch (err) {
                        log('❌ Failed to post: ' + err.message, 'error');
                    }
                };
            });
            
            // Edit buttons
            els.postsTable.querySelectorAll('.edit-post-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const newText = prompt('Edit post text:');
                    if (newText && newText.trim()) {
                        try {
                            await apiFetch(`/api/ai/post/${id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ text: newText })
                            });
                            log('✏️ Post updated');
                            loadUpcomingPosts();
                        } catch (err) {
                            log('❌ Failed to update post', 'error');
                        }
                    }
                };
            });
            
            // DELETE buttons - FIXED
            els.postsTable.querySelectorAll('.delete-post-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    if (!confirm('🗑️ Delete this scheduled post?')) return;
                    try {
                        btn.disabled = true;
                        btn.textContent = 'Deleting...';
                        await apiFetch(`/api/ai/post/${id}`, { method: 'DELETE' });
                        log('✅ Post deleted');
                        await loadUpcomingPosts();
                        await loadLogs();
                    } catch (err) {
                        log('❌ Failed to delete post: ' + err.message, 'error');
                        btn.disabled = false;
                        btn.textContent = 'Delete';
                    }
                };
            });
        } catch (err) {
            console.error('Load posts error:', err);
            log('❌ Failed loading posts: ' + err.message, 'error');
            els.postsTable.innerHTML = '<tr><td colspan="6">Error loading posts</td></tr>';
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

    // Clear logs
    if (els.clearLogsBtn) {
        els.clearLogsBtn.onclick = async () => {
            if (!confirm('Clear all AI logs?')) return;
            try {
                await apiFetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' });
                log('🗑️ All logs cleared');
                loadLogs();
            } catch (err) {
                log('❌ Failed to clear logs', 'error');
            }
        };
    }

    // Initial load
    loadProfile();
    loadTopics();
    loadUpcomingPosts();
    loadLogs();
    setInterval(loadLogs, 30000);
    log('✅ AI Scheduler ready');
})();
