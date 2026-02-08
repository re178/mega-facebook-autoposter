document.addEventListener('DOMContentLoaded', () => {
  const qs = new URLSearchParams(window.location.search);
  const pageId = qs.get('pageId');

  if (!pageId) {
    alert('❌ Page ID missing');
    return;
  }

  /* =====================================================
     STATE
  ===================================================== */
  let currentTopicId = null;
  let pollTimer = null;

  /* =====================================================
     ELEMENTS
  ===================================================== */
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

    saveBtn: document.getElementById('ai-save-topic'),
    generateBtn: document.getElementById('ai-generate-post-now'),
    clearLogsBtn: document.getElementById('ai-clear-logs'),

    postsTable: document.getElementById('ai-upcoming-posts'),
    logsTable: document.getElementById('ai-logs'),
    monitor: document.getElementById('ai-monitor-log')
  };
// AUTO-GENERATION TOGGLE
els.autoGenToggle = document.getElementById('autoGenToggle');

// Load current state from backend
async function loadAutoGenState() {
  try {
    const res = await fetch('/api/ai/auto-generation/state');
    const data = await res.json();
    els.autoGenToggle.dataset.enabled = data.enabled;
    els.autoGenToggle.textContent = data.enabled ? 'Auto-Generation: ON' : 'Auto-Generation: OFF';
  } catch (err) {
    log('❌ Failed to load auto-generation state', 'error');
  }
}

// Toggle button click
els.autoGenToggle.addEventListener('click', async () => {
  const currentlyEnabled = els.autoGenToggle.dataset.enabled === 'true';
  try {
    const res = await fetch('/api/ai/auto-generation/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !currentlyEnabled })
    });
    const data = await res.json();
    els.autoGenToggle.dataset.enabled = data.enabled;
    els.autoGenToggle.textContent = data.enabled ? 'Auto-Generation: ON' : 'Auto-Generation: OFF';
    log(`🔄 Auto-Generation ${data.enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    log('❌ Failed to toggle auto-generation', 'error');
  }
});

// Initialize button state on page load
loadAutoGenState();

  /* =====================================================
     LOGGER
  ===================================================== */
  function log(msg, type = 'info') {
    const color =
      type === 'error' ? '#ff4c4c' :
      type === 'warn' ? '#ffaa00' :
      '#00ff99';

    const line = document.createElement('div');
    line.innerHTML = `<span style="color:${color}">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    els.monitor.appendChild(line);
    els.monitor.scrollTop = els.monitor.scrollHeight;
  }

  /* =====================================================
     TIME INPUTS
  ===================================================== */
  function addTime(value = '') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    els.timesContainer.appendChild(input);
  }

  els.addTimeBtn.onclick = () => {
    addTime();
    log('🕒 Time added');
  };

  /* =====================================================
     LOAD TOPICS
  ===================================================== */
  async function loadTopics() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = await res.json();

      els.topicSelect.innerHTML = `<option value="">-- Select Topic --</option>`;

      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.topicName;
        opt.dataset.topic = JSON.stringify(t);
        els.topicSelect.appendChild(opt);
      });

      log('📂 Topics loaded');
    } catch (err) {
      log(`❌ Failed loading topics`, 'error');
    }
  }

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
    els.includeMedia.checked = t.includeMedia;
  };

  /* =====================================================
     SAVE TOPIC
  ===================================================== */
  els.saveBtn.onclick = async () => {
    try {
      const payload = {
        topicName: els.topicName.value.trim(),
        postsPerDay: Number(els.postsPerDay.value),
        times: [...els.timesContainer.querySelectorAll('input')].map(i => i.value),
        startDate: els.startDate.value,
        endDate: els.endDate.value,
        repeatType: els.repeatType.value,
        includeMedia: els.includeMedia.checked
      };

      if (!payload.topicName) return log('❌ Topic name required', 'error');

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data._id) throw new Error('Invalid response');

      currentTopicId = data._id;
      log(`💾 Topic saved: ${data.topicName}`);

      loadTopics();
      loadUpcomingPosts();
      loadLogs();
    } catch (err) {
      log(`❌ Save failed`, 'error');
    }
  };

  /* =====================================================
     GENERATE POSTS
  ===================================================== */
  els.generateBtn.onclick = async () => {
    if (!currentTopicId) return log('❌ Select a topic first', 'error');

    log('⏳ Generating posts...');

    await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, { method: 'POST' });

    let attempts = 0;

    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      attempts++;

      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = await res.json();
      const count = posts.filter(p => p.topicId?._id === currentTopicId).length;

      if (count >= Number(els.postsPerDay.value)) {
        clearInterval(pollTimer);
        log(`🚀 Posts generated`);
        loadUpcomingPosts();
        loadLogs();
      }

      if (attempts > 20) {
        clearInterval(pollTimer);
        log('⚠️ Generation timeout', 'warn');
      }
    }, 2000);
  };

  /* =====================================================
     POSTS
  ===================================================== */
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = await res.json();

      els.postsTable.innerHTML = '';

      posts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.topicId?.topicName || ''}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text || ''}</td>
          <td>${p.mediaUrl ? `<a href="${p.mediaUrl}" target="_blank">Media</a>` : ''}</td>
          <td>${p.status}</td>
          <td>
            <button onclick="postNow('${p._id}')">Post</button>
            <button onclick="editPost('${p._id}')">Edit</button>
            <button onclick="deletePost('${p._id}')">Delete</button>
          </td>
        `;
        els.postsTable.appendChild(tr);
      });
    } catch {
      log('❌ Failed loading posts', 'error');
    }
  }

  /* =====================================================
     LOGS
  ===================================================== */
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = await res.json();

      els.logsTable.innerHTML = logs.length
        ? logs.map(l => `
          <tr>
            <td>${l.action}</td>
            <td>${l.message}</td>
            <td>${new Date(l.createdAt).toLocaleString()}</td>
          </tr>
        `).join('')
        : `<tr><td colspan="3">No logs</td></tr>`;
    } catch {
      log('❌ Failed loading logs', 'error');
    }
  }

  /* =====================================================
     GLOBAL HELPERS
  ===================================================== */
  window.postNow = async id => {
    await fetch(`/api/ai/post/${id}/post-now`, { method: 'POST' });
    log('📤 Posted');
    loadUpcomingPosts();
  };

  window.deletePost = async id => {
    await fetch(`/api/ai/post/${id}`, { method: 'DELETE' });
    log('🗑 Post deleted');
    loadUpcomingPosts();
  };

  window.editPost = async id => {
    const text = prompt('Edit post text');
    if (!text) return;
    await fetch(`/api/ai/post/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    log('✏️ Post updated');
    loadUpcomingPosts();
  };

  /* =====================================================
     INIT
  ===================================================== */
  loadTopics();
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 5000);
  log('✅ AI Scheduler ready');
});
