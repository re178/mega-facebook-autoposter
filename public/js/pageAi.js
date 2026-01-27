document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL');

  /* ===================== GLOBAL STATE ===================== */
  let currentTopicId = null;
  let lastBackendLogId = null;
  const MAX_LOGS = 50; // truncate monitor logs
  const progressBars = {}; // topicId => progress bar element

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

  /* ===================== AI MONITOR LOGGER ===================== */
  function logMonitor(message, type = 'info', source = 'UI') {
    const now = new Date().toLocaleTimeString();
    const color =
      type === 'error' ? '#ff4c4c' :
      type === 'warn'  ? '#ffa500' : '#00ff99';

    const line = document.createElement('div');
    line.innerHTML = `<span style="color:${color}">[${source} ${now}]</span> ${message}`;
    monitorLog.appendChild(line);

    // truncate monitor logs
    while (monitorLog.childNodes.length > MAX_LOGS) monitorLog.removeChild(monitorLog.firstChild);

    monitorLog.scrollTop = monitorLog.scrollHeight;
  }

  /* ===================== TYPEWRITER EFFECT ===================== */
  function typeLine(text, source = 'AI', speed = 15) {
    const line = document.createElement('div');
    monitorLog.appendChild(line);
    let i = 0;
    const type = () => {
      if (i < text.length) {
        line.innerHTML = `<span style="color:#00ff99">[${source}]</span> ${text.slice(0, i + 1)}`;
        i++;
        monitorLog.scrollTop = monitorLog.scrollHeight;
        requestAnimationFrame(type);
      }
    };
    type();
    // truncate old logs
    while (monitorLog.childNodes.length > MAX_LOGS) monitorLog.removeChild(monitorLog.firstChild);
  }

  /* ===================== PROGRESS BAR ===================== */
  function updateProgress(topicId, total, done) {
    let bar = progressBars[topicId];
    if (!bar) {
      const container = document.createElement('div');
      container.style.margin = '5px 0';
      const label = document.createElement('span');
      label.textContent = `Topic ${topicId}: `;
      const progress = document.createElement('progress');
      progress.max = total;
      progress.value = done;
      container.appendChild(label);
      container.appendChild(progress);
      monitorLog.appendChild(container);
      progressBars[topicId] = progress;
      bar = progress;
    }
    bar.value = done;
  }

  /* ===================== BACKEND LOG MIRROR ===================== */
  function mirrorBackendLogs(logs) {
    if (!Array.isArray(logs)) return;

    const newLogs = lastBackendLogId
      ? logs.filter(l => l._id && l._id > lastBackendLogId)
      : logs;

    newLogs.forEach(l => {
      const msg = l.message || '(no message)';
      typeLine(msg, 'AI');

      if (l.meta?.totalPosts && l.meta?.donePosts) {
        const topicId = l.topicId?._id || 'unknown';
        updateProgress(topicId, l.meta.totalPosts, l.meta.donePosts);
      }

      if (l._id) lastBackendLogId = l._id;
    });
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
    } catch (err) {
      logMonitor(`Failed loading topics: ${err.message}`, 'error');
    }
  }

  topicSelect.addEventListener('change', () => {
    if (!topicSelect.value) return;

    currentTopicId = topicSelect.value;
    const topic = JSON.parse(topicSelect.selectedOptions[0].dataset.topicObj);

    topicNameInput.value = topic.topicName;
    postsPerDaySelect.value = topic.postsPerDay;
    timesContainer.innerHTML = '';
    topic.times.forEach(addTimeInput);
    startDateInput.value = topic.startDate.slice(0, 10);
    endDateInput.value = topic.endDate.slice(0, 10);
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
        times: [...timesContainer.querySelectorAll('input')].map(i => i.value),
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };

      if (!data.topicName) return logMonitor('Topic name required', 'error');

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const topic = await res.json();
      currentTopicId = topic._id;

      logMonitor(`💾 Topic saved: ${topic.topicName}`);
      loadTopics();
      loadUpcomingPosts();
      loadLogs();
    } catch (err) {
      logMonitor(`Save failed: ${err.message}`, 'error');
    }
  });

  /* ===================== GENERATE POSTS NOW ===================== */
  generatePostNowBtn.addEventListener('click', async () => {
    if (!currentTopicId) return logMonitor('Save topic first', 'error');

    logMonitor('🚀 AI generation started…');

    await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, { method: 'POST' });
  });

  /* ===================== LOAD UPCOMING POSTS ===================== */
  async function loadUpcomingPosts() {
    try {
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
    } catch (err) {
      logMonitor(`Failed loading posts: ${err.message}`, 'error');
    }
  }

  /* ===================== LOAD LOGS ===================== */
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = await res.json();

      // TABLE
      logsTable.innerHTML = '';
      logs
        .slice(-MAX_LOGS)
        .forEach(l => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${l.topicId?.topicName || 'N/A'}</td>
            <td>${l.action || '-'}</td>
            <td>${l.message || '-'}</td>
            <td>${l.createdAt ? new Date(l.createdAt).toLocaleString() : '-'}</td>
          `;
          logsTable.appendChild(tr);
        });

      // MONITOR
      mirrorBackendLogs(logs);
    } catch (err) {
      logMonitor(`❌ Failed loading logs: ${err.message}`, 'error');
    }
  }

  /* ===================== CLEAR LOGS ===================== */
  clearLogsBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' });
      logsTable.innerHTML = '';
      monitorLog.innerHTML = '';
      lastBackendLogId = null;
      logMonitor('🧹 Logs cleared');
    } catch (err) {
      logMonitor(`❌ Clear logs failed: ${err.message}`, 'error');
    }
  });

  /* ===================== INIT ===================== */
  loadTopics();
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 3000);
  logMonitor('✅ AI Scheduler ready');
});
