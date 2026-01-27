document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL');

  /* ===================== GLOBAL STATE ===================== */
  let currentTopicId = null;
  let lastBackendLogTime = 0;
  let lastSeenLogId = null;
  const MAX_LOGS = 50;

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

  const progressContainer = document.getElementById('ai-progress-container') || (() => {
    const c = document.createElement('div');
    c.id = 'ai-progress-container';
    monitorLog.parentNode.insertBefore(c, monitorLog.nextSibling);
    return c;
  })();

  /* ===================== HELPER FUNCTIONS ===================== */
  function typeLine(text, source = 'UI', speed = 15) {
    const line = document.createElement('div');
    monitorLog.appendChild(line);
    let i = 0;
    const interval = setInterval(() => {
      line.textContent = `[${source} ${new Date().toLocaleTimeString()}] ` + text.slice(0, i + 1);
      i++;
      monitorLog.scrollTop = monitorLog.scrollHeight;
      if (i >= text.length) clearInterval(interval);
    }, speed);
  }

  function logMonitor(message, type = 'info', source = 'UI') {
    typeLine(message, source);
  }

  function safeArray(obj) {
    return Array.isArray(obj) ? obj : [];
  }

  function truncateLogs() {
    const lines = [...monitorLog.children];
    while (lines.length > MAX_LOGS) monitorLog.removeChild(lines[0]);
  }

  function updateProgress(topicId, done, total) {
    let bar = document.getElementById(`progress-${topicId}`);
    if (!bar) {
      bar = document.createElement('progress');
      bar.id = `progress-${topicId}`;
      bar.max = total;
      bar.value = done;
      progressContainer.appendChild(bar);
      const label = document.createElement('span');
      label.id = `progress-label-${topicId}`;
      label.textContent = ` ${done}/${total}`;
      progressContainer.appendChild(label);
      progressContainer.appendChild(document.createElement('br'));
    } else {
      bar.max = total;
      bar.value = done;
      const label = document.getElementById(`progress-label-${topicId}`);
      if (label) label.textContent = ` ${done}/${total}`;
    }
  }

  function mirrorBackendLogs(logs) {
    const arr = safeArray(logs);
    arr
      .filter(l => !lastSeenLogId || l._id > lastSeenLogId)
      .forEach(l => {
        typeLine(l.message, 'AI');
        if (l.meta?.donePosts && l.meta?.totalPosts) {
          updateProgress(l.topicId?._id, l.meta.donePosts, l.meta.totalPosts);
        }
        lastSeenLogId = l._id;
      });
    truncateLogs();
  }

  function addTimeInput(value = '') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    timesContainer.appendChild(input);
  }

  /* ===================== EVENT LISTENERS ===================== */
  addTimeBtn.addEventListener('click', () => {
    addTimeInput();
    logMonitor('🕒 Time added');
  });

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

  generatePostNowBtn.addEventListener('click', async () => {
    if (!currentTopicId) return logMonitor('Save topic first', 'error');
    logMonitor('🚀 AI generation started…');

    try {
      await fetch(`/api/ai/topic/${currentTopicId}/generate-now`, { method: 'POST' });

      const POLL_INTERVAL = 1500;
      let intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/ai/page/${pageId}/logs`);
          const logs = await res.json();
          mirrorBackendLogs(logs);

          // Stop polling if generation done
          const topicLogs = safeArray(logs).filter(l => l.topicId?._id === currentTopicId && l.meta?.donePosts && l.meta?.totalPosts);
          if (topicLogs.length > 0) {
            const lastLog = topicLogs[topicLogs.length - 1];
            if (lastLog.meta.donePosts >= lastLog.meta.totalPosts) {
              typeLine(`✅ Topic "${lastLog.topicId.topicName}" generation complete`, 'AI');
              updateProgress(currentTopicId, lastLog.meta.totalPosts, lastLog.meta.totalPosts);
              loadUpcomingPosts();
              clearInterval(intervalId);
            }
          }
        } catch (err) {
          logMonitor(`❌ Polling error: ${err.message}`, 'error');
        }
      }, POLL_INTERVAL);
    } catch (err) {
      logMonitor(`❌ Generate failed: ${err.message}`, 'error');
    }
  });

  clearLogsBtn.addEventListener('click', async () => {
    await fetch(`/api/ai/page/${pageId}/logs`, { method: 'DELETE' });
    logsTable.innerHTML = '';
    monitorLog.innerHTML = '';
    lastSeenLogId = null;
    logMonitor('🧹 Logs cleared');
  });

  /* ===================== LOAD TOPICS / POSTS / LOGS ===================== */
  async function loadTopics() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = safeArray(await res.json());
      topicSelect.innerHTML = '<option value="">-- Select a topic --</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.topicName;
        opt.dataset.topicObj = JSON.stringify(t);
        topicSelect.appendChild(opt);
      });
    } catch (err) { logMonitor(`Failed loading topics: ${err.message}`, 'error'); }
  }

  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = safeArray(await res.json());
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
    } catch (err) { logMonitor(`Failed loading upcoming posts: ${err.message}`, 'error'); }
  }

  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = safeArray(await res.json());

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

      mirrorBackendLogs(logs);
    } catch (err) { logMonitor(`Failed loading logs: ${err.message}`, 'error'); }
  }

  /* ===================== INIT ===================== */
  loadTopics();
  loadUpcomingPosts();
  loadLogs();
  setInterval(loadLogs, 3000);
  logMonitor('✅ AI Scheduler ready');
});

