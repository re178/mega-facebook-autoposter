document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL');

  /* ===================== GLOBAL STATE ===================== */
  let currentTopicId = null;

  /* ===================== ELEMENTS ===================== */
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

  /* ===================== LOAD UPCOMING POSTS ===================== */
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = Array.isArray(await res.json()) ? await res.json() : [];

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
        `;
        upcomingPostsTable.appendChild(tr);
      });

      logMonitor('📋 Upcoming posts loaded');
    } catch (err) {
      logMonitor(`❌ Failed loading posts: ${err.message}`, 'error');
    }
  }

  /* ===================== LOAD LOGS ===================== */
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = Array.isArray(await res.json()) ? await res.json() : [];

      logsTable.innerHTML = '';

      logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.topicId?.topicName || ''}</td>
          <td>${l.action}</td>
          <td>${l.message}</td>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
        `;
        logsTable.appendChild(tr);
      });

      logMonitor('📝 Logs loaded');
    } catch (err) {
      logMonitor(`❌ Failed loading logs: ${err.message}`, 'error');
    }
  }

  /* ===================== SAVE TOPIC ===================== */
  saveTopicBtn.addEventListener('click', async () => {
  try {
    const topicName = topicNameInput.value.trim();
    if (!topicName) {
      logMonitor('❌ Topic name cannot be empty', 'error');
      return;
    }

    const times = Array.from(timesContainer.querySelectorAll('input[type=time]'))
                        .map(i => i.value);

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

    // ⚡ INNOVATIVE FIX: Check if _id exists before storing
    if (!topic || !topic._id) {
      logMonitor('❌ Topic saved but ID missing from response', 'error');
      console.error('Bad response from backend:', topic);
      return;
    }

    // Store topic ID safely
    topicNameInput.dataset.topicId = topic._id;

    logMonitor(`💾 Topic "${topic.topicName}" saved (ID: ${topic._id})`);

    // Reload tables
    loadUpcomingPosts();
    loadLogs();

  } catch (err) {
    logMonitor(`❌ Failed to save topic: ${err.message}`, 'error');
  }
});


  /* ===================== GENERATE POSTS NOW ===================== */
  generatePostNowBtn.addEventListener('click', async () => {
    if (!currentTopicId) {
      logMonitor('❌ Save topic first', 'error');
      return;
    }

    try {
      await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, {
        method: 'POST'
      });

      logMonitor(`🚀 Posts generated for topic ${currentTopicId}`);
      loadUpcomingPosts();
      loadLogs();
    } catch (err) {
      logMonitor(`❌ Generate failed: ${err.message}`, 'error');
    }
  });

  /* ===================== CLEAR LOGS ===================== */
  clearLogsBtn.addEventListener('click', async () => {
    await fetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' });
    logMonitor('🧹 Logs cleared');
    loadLogs();
  });

  /* ===================== ACTION HELPERS ===================== */
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
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 5000);
  logMonitor('✅ AI Scheduler ready');
});
