document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL');

  /* ===================== GLOBAL STATE ===================== */
  let currentTopicId = null;

  /* ===================== ELEMENTS ===================== */
  const topicSelect = document.getElementById('ai-topic-select');
  const editTopicBtn = document.getElementById('ai-edit-topic');
  const deleteTopicBtn = document.getElementById('ai-delete-topic');

  const topicNameInput = document.getElementById('ai-topic-name');
  const postsPerDaySelect = document.getElementById('ai-posts-per-day');
  const timesContainer = document.getElementById('ai-times-container');
  const addTimeBtn = document.getElementById('ai-add-time');
  const startDateInput = document.getElementById('ai-start-date');
  const endDateInput = document.getElementById('ai-end-date');
  const repeatTypeSelect = document.getElementById('ai-repeat-type');
  const includeMediaCheckbox = document.getElementById('ai-include-media');

  const saveTopicBtn = document.getElementById('ai-save-topic');
  const generatePostNowBtn = document.getElementById('ai-generate-post-now');
  const clearLogsBtn = document.getElementById('ai-clear-logs');

  const upcomingPostsTable = document.getElementById('ai-upcoming-posts');
  const logsTable = document.getElementById('ai-logs');
  const monitorLog = document.getElementById('ai-monitor-log');

  /* ===================== LOGGER ===================== */
  function logMonitor(message, type = 'info') {
    const now = new Date().toLocaleTimeString();
    const color =
      type === 'error' ? '#ff4c4c' :
      type === 'warn'  ? '#ffa500' : '#00ff99';
    const line = document.createElement('div');
    line.innerHTML = `<span style="color:${color}">[${now}]</span> ${message}`;
    monitorLog.appendChild(line);
    monitorLog.scrollTop = monitorLog.scrollHeight;
    console.log(`[${now}] ${type.toUpperCase()}: ${message}`);
  }

  /* ===================== TIME INPUT ===================== */
  function addTimeInput(value = '') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    timesContainer.appendChild(input);
  }

  addTimeBtn.addEventListener('click', () => {
    addTimeInput();
    logMonitor('🕒 Time added');
  });

  /* ===================== LOAD TOPICS ===================== */
  async function loadTopics() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/topics`);
      const data = await res.json();
      const topics = Array.isArray(data) ? data : [];
      topicSelect.innerHTML = '<option value="">-- Select a topic --</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.topicName;
        opt.dataset.topicObj = JSON.stringify(t);
        topicSelect.appendChild(opt);
      });
      logMonitor('📂 Topics loaded');
    } catch (err) {
      logMonitor(`❌ Failed to load topics: ${err.message}`, 'error');
    }
  }

  topicSelect.addEventListener('change', () => {
    const selectedId = topicSelect.value;
    if (!selectedId) return currentTopicId = null;

    currentTopicId = selectedId;
    const topic = JSON.parse(topicSelect.selectedOptions[0].dataset.topicObj);
    topicNameInput.value = topic.topicName;
    postsPerDaySelect.value = topic.postsPerDay;
    timesContainer.innerHTML = '';
    topic.times.forEach(t => addTimeInput(t));
    startDateInput.value = topic.startDate.slice(0,10);
    endDateInput.value = topic.endDate.slice(0,10);
    repeatTypeSelect.value = topic.repeatType;
    includeMediaCheckbox.checked = topic.includeMedia;
  });

  /* ===================== SAVE TOPIC ===================== */
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) {
        logMonitor('❌ Topic name cannot be empty', 'error');
        return;
      }

      const times = Array.from(timesContainer.querySelectorAll('input[type=time]')).map(i => i.value);
      const data = {
        topicName,
        postsPerDay: Number(postsPerDaySelect.value),
        times,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const errData = await res.json();
        logMonitor(`❌ Failed to save topic: ${errData.error}`, 'error');
        return;
      }

      const topic = await res.json();
      if (!topic || !topic._id) {
        logMonitor('❌ Topic saved but ID missing from response', 'error');
        console.error('Bad response from backend:', topic);
        return;
      }

      currentTopicId = topic._id;
      topicNameInput.dataset.topicId = topic._id;

      logMonitor(`💾 Topic "${topic.topicName}" saved (ID: ${topic._id})`);

      loadTopics();
      loadUpcomingPosts();
      loadLogs();

    } catch (err) {
      logMonitor(`❌ Failed to save topic: ${err.message}`, 'error');
    }
  });

  /* ===================== GENERATE POSTS NOW WITH PROGRESS ===================== */
  generatePostNowBtn.addEventListener('click', async () => {
    if (!currentTopicId) {
      logMonitor('❌ Save topic first', 'error');
      return;
    }

    try {
      logMonitor(`⏳ Starting post generation for topic ${currentTopicId}...`);

      await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, { method: 'POST' });

      // Polling function to monitor post generation
      const pollPosts = async (retries = 30, interval = 2000) => {
        if (retries <= 0) {
          logMonitor('❌ Post generation timed out', 'error');
          return;
        }

        try {
          const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
          const data = await res.json();
          const posts = Array.isArray(data) ? data : [];
          const topicPosts = posts.filter(p => p.topicId?._id === currentTopicId);

          // Check if generation complete
          if (topicPosts.length >= Number(postsPerDaySelect.value)) {
            logMonitor(`🚀 All posts generated for topic ${currentTopicId}`);
            loadUpcomingPosts();
            loadLogs();
          } else {
            logMonitor(`⏳ Waiting for posts... (${topicPosts.length}/${postsPerDaySelect.value})`);
            setTimeout(() => pollPosts(retries - 1, interval), interval);
          }
        } catch (err) {
          logMonitor(`❌ Polling error: ${err.message}`, 'error');
        }
      };

      pollPosts();

    } catch (err) {
      logMonitor(`❌ Generate failed: ${err.message}`, 'error');
    }
  });

  /* ===================== DELETE / EDIT TOPIC ===================== */
  deleteTopicBtn.addEventListener('click', async () => {
    if (!currentTopicId) return logMonitor('❌ Select a topic first', 'error');
    if (!confirm('Delete this topic and all its posts?')) return;

    await fetch(`/api/ai/topic/${currentTopicId}`, { method: 'DELETE' });
    logMonitor(`🗑 Topic ${currentTopicId} deleted`);
    currentTopicId = null;
    topicNameInput.value = '';
    timesContainer.innerHTML = '';
    loadTopics();
    loadUpcomingPosts();
    loadLogs();
  });

  editTopicBtn.addEventListener('click', () => {
    if (!currentTopicId) return logMonitor('❌ Select a topic first', 'error');
    logMonitor(`✏️ Editing topic ${currentTopicId}`);
    // Form already filled when selected
  });

  /* ===================== LOAD UPCOMING POSTS ===================== */
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const data = await res.json();
      const posts = Array.isArray(data) ? data : [];

      upcomingPostsTable.innerHTML = '';
      posts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.topicId?.topicName || ''}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text || ''}</td>
          <td>${p.mediaUrl ? `<a href="${p.mediaUrl}" target="_blank">Media</a>` : ''}</td>
          <td>${p.status}</td>
          <td>
            <button onclick="postNowAi('${p._id}')">Post Now</button>
            <button onclick="editAiPost('${p._id}')">Edit</button>
            <button onclick="deleteAiPost('${p._id}')">Delete</button>
          </td>
          <td>${p.contentType || ''}</td>
        `;
        upcomingPostsTable.appendChild(tr);
      });

      logMonitor('📋 Upcoming posts loaded');
    } catch (err) {
      logMonitor(`❌ Failed loading posts: ${err.message}`, 'error');
    }
  }

 async function loadLogs() {
  const logsTable = document.getElementById('ai-logs');
  if (!logsTable) return;

  try {
    // Fetch logs for the current page
    const res = await fetch(`/api/ai/page/${pageId}/logs`);
    const logs = await res.json();

    // Clear previous rows
    logsTable.innerHTML = '';

    if (!Array.isArray(logs) || logs.length === 0) {
      logsTable.innerHTML = `<tr><td colspan="6" style="text-align:center;opacity:.6">No logs yet</td></tr>`;
      return;
    }

    // Create a row for each log
    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${log.topicId?.topicName || '-'}</td>
        <td>${log.action || '-'}</td>
        <td>${log.message || '-'}</td>
        <td>${new Date(log.createdAt).toLocaleString()}</td>
        <td>-</td>
        <td>-</td>
      `;
      logsTable.appendChild(tr);
    });

  } catch (err) {
    console.error('Failed to load logs:', err);
    logsTable.innerHTML = `<tr><td colspan="6" style="color:red">Error loading logs</td></tr>`;
  }
}


  /* ===================== CLEAR LOGS ===================== */
  clearLogsBtn.addEventListener('click', async () => {
    await fetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' });
    logMonitor('🧹 Logs cleared');
    loadLogs();
  });

  /* ===================== POST / DELETE / EDIT HELPERS ===================== */
  window.postNowAi = async id => {
    await fetch(`/api/ai/post/${id}/post-now`, { method: 'POST' });
    logMonitor(`📤 Post ${id} published`);
    loadUpcomingPosts();
    loadLogs();
  };

  window.deleteAiPost = async id => {
    await fetch(`/api/ai/post/${id}`, { method: 'DELETE' });
    logMonitor(`🗑 Post ${id} deleted`);
    loadUpcomingPosts();
    loadLogs();
  };

  window.editAiPost = async id => {
    const text = prompt('Edit post text');
    if (!text) return;
    await fetch(`/api/ai/post/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    logMonitor(`✏️ Post ${id} edited`);
    loadUpcomingPosts();
  };

  /* ===================== INIT ===================== */
  loadTopics();
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 5000);
  logMonitor('✅ AI Scheduler ready');
});

