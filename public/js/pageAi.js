document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL');

  /* ===================== GLOBAL STATE ===================== */
  let currentTopicId = null;
  let lastBackendLogId = null;
  const MAX_LOGS = 50; // keep only latest 50 logs
  const topicProgress = {}; // store progress per topic

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

  /* ===================== UTILS ===================== */
  function truncateLogs(container) {
    while(container.children.length > MAX_LOGS) {
      container.removeChild(container.firstChild);
    }
  }

  function typeLine(message, source = 'AI', speed = 15) {
    const now = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    const color = source === 'UI' ? '#00ff99' : '#00aaff';
    line.innerHTML = `<span style="color:${color}">[${source} ${now}]</span> `;
    monitorLog.appendChild(line);

    let i = 0;
    const interval = setInterval(() => {
      line.innerHTML = `<span style="color:${color}">[${source} ${now}]</span> ${message.slice(0, i+1)}`;
      i++;
      monitorLog.scrollTop = monitorLog.scrollHeight;
      if(i >= message.length) clearInterval(interval);
    }, speed);

    truncateLogs(monitorLog);
  }

  function updateProgress(topicId, total, done) {
    if(!topicProgress[topicId]) {
      // create progress bar
      const container = document.createElement('div');
      container.classList.add('progress-container');
      container.innerHTML = `
        <span>Topic ${topicId} Progress:</span>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:0%"></div>
        </div>
      `;
      monitorLog.appendChild(container);
      topicProgress[topicId] = container.querySelector('.progress-bar-fill');
      monitorLog.scrollTop = monitorLog.scrollHeight;
    }

    const percentage = Math.min(100, (done/total)*100);
    topicProgress[topicId].style.width = percentage + '%';
  }

  /* ===================== AI MONITOR LOGGER ===================== */
  function logMonitor(message, type='info', source='UI') {
    typeLine(message, source);
  }

  /* ===================== BACKEND LOG MIRROR ===================== */
  function mirrorBackendLogs(logs) {
    const newLogs = lastBackendLogId
      ? logs.filter(l => l._id > lastBackendLogId)
      : logs;

    newLogs.forEach(l => {
      typeLine(l.message, 'AI');
      if(l.meta?.totalPosts && l.meta?.donePosts) {
        updateProgress(l.topicId?._id || 'unknown', l.meta.totalPosts, l.meta.donePosts);
      }
      lastBackendLogId = l._id;
    });
  }

  /* ===================== TIME INPUT ===================== */
  function addTimeInput(value='') {
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
      const topics = await res.json();

      topicSelect.innerHTML = '<option value="">-- Select a topic --</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.topicName;
        opt.dataset.topicObj = JSON.stringify(t);
        topicSelect.appendChild(opt);
      });

      logMonitor('📂 Topics loaded');
    } catch(err) {
      logMonitor(`Failed loading topics: ${err.message}`, 'error');
    }
  }

  topicSelect.addEventListener('change', () => {
    if(!topicSelect.value) return;

    currentTopicId = topicSelect.value;
    const topic = JSON.parse(topicSelect.selectedOptions[0].dataset.topicObj);

    topicNameInput.value = topic.topicName;
    postsPerDaySelect.value = topic.postsPerDay;
    timesContainer.innerHTML = '';
    topic.times.forEach(addTimeInput);
    startDateInput.value = topic.startDate.slice(0,10);
    endDateInput.value = topic.endDate.slice(0,10);
    repeatTypeSelect.value = topic.repeatType;
    includeMediaCheckbox.checked = topic.includeMedia;

    logMonitor(`📌 Topic selected: ${topic.topicName}`);
  });

  /* ===================== SAVE TOPIC ===================== */
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const data = {
        topicName: topicNameInput.value.trim(),
        postsPerDay: Number(postsPerDaySelect.value),
        times: [...timesContainer.querySelectorAll('input')].map(i=>i.value),
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };
      if(!data.topicName) return logMonitor('Topic name required', 'error');

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const topic = await res.json();
      currentTopicId = topic._id;

      logMonitor(`💾 Topic saved: ${topic.topicName}`);
      loadTopics();
      loadUpcomingPosts();
      loadLogs();
    } catch(err) {
      logMonitor(`Save failed: ${err.message}`, 'error');
    }
  });

  /* ===================== GENERATE POSTS NOW ===================== */
  generatePostNowBtn.addEventListener('click', async () => {
    if(!currentTopicId) return logMonitor('Save topic first', 'error');

    logMonitor('🚀 AI generation started…');

    await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, {method:'POST'});
  });

  /* ===================== LOAD UPCOMING POSTS ===================== */
  async function loadUpcomingPosts() {
    const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
    const posts = await res.json();

    upcomingPostsTable.innerHTML = '';
    posts.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.topicId?.topicName || ''}</td>
        <td>${new Date(p.scheduledTime).toLocaleString()}</td>
        <td>${p.text || ''}</td>
        <td>${p.status}</td>
      `;
      upcomingPostsTable.appendChild(tr);
    });
  }

  /* ===================== LOAD LOGS ===================== */
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = await res.json();

      // TABLE
      logsTable.innerHTML = '';
      logs.slice(-MAX_LOGS).forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.topicId?.topicName || ''}</td>
          <td>${l.action}</td>
          <td>${l.message}</td>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
        `;
        logsTable.appendChild(tr);
      });

      // MONITOR
      mirrorBackendLogs(logs);
    } catch(err) {
      logMonitor(`Load logs failed: ${err.message}`, 'error');
    }
  }

  /* ===================== CLEAR LOGS ===================== */
  clearLogsBtn.addEventListener('click', async () => {
    await fetch(`/api/ai/page/${pageId}/logs`, {method:'DELETE'});
    logsTable.innerHTML = '';
    monitorLog.innerHTML = '';
    lastBackendLogId = null;
    Object.keys(topicProgress).forEach(tid => topicProgress[tid].style.width = '0%');
    logMonitor('🧹 Logs cleared');
  });

  /* ===================== INIT ===================== */
  loadTopics();
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 3000);
  logMonitor('✅ AI Scheduler ready');
});

