document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL!');

  // Elements
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
  const deleteAllTopicPostsBtn = document.getElementById('ai-delete-all-topic-posts');
  const clearLogsBtn = document.getElementById('ai-clear-logs');

  const upcomingPostsTable = document.getElementById('ai-upcoming-posts');
  const logsTable = document.getElementById('ai-logs');
  const monitorLog = document.getElementById('ai-monitor-log');

  // Monitor logger
  function logMonitor(message, type='info') {
    const now = new Date().toLocaleTimeString();
    const color = type==='error'?'#ff4c4c': type==='warn'?'#ffa500':'#00ff99';
    const line = document.createElement('div');
    line.innerHTML = `<span style="color:${color}">[${now}]</span> ${message}`;
    monitorLog.appendChild(line);
    monitorLog.scrollTop = monitorLog.scrollHeight;
    console.log(`[${now}] ${type.toUpperCase()}: ${message}`);
  }

  function addTimeInput(value='') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    timesContainer.appendChild(input);
  }

  addTimeBtn.addEventListener('click', () => { addTimeInput(); logMonitor('🕒 Added a new post time input'); });

  // Load upcoming posts
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      let posts = await res.json();
      if (!Array.isArray(posts)) posts = [];
      upcomingPostsTable.innerHTML = '';
      posts.forEach(p => {
        const tr = document.createElement('tr');
        const retryBtn = p.status==='FAILED'?`<button onclick="retryAiPost('${p._id}')">Retry</button>`:'';
        tr.innerHTML = `
          <td>${p.topicId?.topicName||''}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text||''}</td>
          <td>${p.mediaUrl||''}</td>
          <td>${p.status}</td>
          <td>
            <button onclick="editAiPost('${p._id}')">Edit</button>
            <button onclick="deleteAiPost('${p._id}')">Delete</button>
            <button onclick="postNowAi('${p._id}')">Post Now</button>
            ${retryBtn}
          </td>
          <td>
            <button onclick="markContent('${p._id}','normal')">Normal</button>
            <button onclick="markContent('${p._id}','trending')">Trending</button>
            <button onclick="markContent('${p._id}','critical')">Critical</button>
          </td>
        `;
        upcomingPostsTable.appendChild(tr);
      });
      logMonitor('📋 Upcoming posts loaded');
    } catch(e) { logMonitor(`❌ Failed to load upcoming posts: ${e.message}`, 'error'); }
  }

  // Load logs
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      let logs = await res.json();
      if (!Array.isArray(logs)) logs = [];
      logsTable.innerHTML = '';
      logs.slice(0,5).forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.postId?.text||''}</td>
          <td>${l.action}</td>
          <td>${l.message}</td>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
          <td><button onclick="deleteLog('${l._id}')">Delete</button></td>
          <td>${l.action==='FAILED' && l.postId ? `<button onclick="retryAiPost('${l.postId._id}')">Retry</button>`:''}</td>
        `;
        logsTable.appendChild(tr);
      });
      if (logs.length>=20) logMonitor('⚠️ Logs exceeding 20 entries. Consider clearing','warn');
      logMonitor('📝 Logs loaded');
    } catch(e) { logMonitor(`❌ Failed to load logs: ${e.message}`, 'error'); }
  }

  // Save topic
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) return logMonitor('❌ Topic name cannot be empty','error');

      const resTopics = await fetch(`/api/ai/page/${pageId}/topics`);
      let topics = await resTopics.json();
      if (!Array.isArray(topics)) topics = [];

      if (topics.some(t => t.topicName.trim().toLowerCase()===topicName.toLowerCase())) {
        return logMonitor(`⚠️ Topic "${topicName}" already exists`,'warn');
      }

      const times = Array.from(timesContainer.querySelectorAll('input[type=time]')).map(i=>i.value);
      const data = {
        topicName,
        postsPerDay: parseInt(postsPerDaySelect.value),
        times,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };

      const res = await fetch(`/api/ai/page/${pageId}/topic`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      const topic = await res.json();
      logMonitor(`💾 Topic '${topic.topicName}' saved`);
      loadUpcomingPosts();
    } catch(e) { logMonitor(`❌ Failed to save topic: ${e.message}`,'error'); }
  });

  // Generate post now
  generatePostNowBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) return logMonitor('❌ Enter topic name to generate posts','error');

      let resTopics = await fetch(`/api/ai/page/${pageId}/topics`);
      let topics = await resTopics.json();
      if (!Array.isArray(topics)) topics = [];
      const topic = topics.find(t => t.topicName===topicName);
      if (!topic) return logMonitor(`❌ Topic "${topicName}" not found`,'error');

      await fetch(`/api/ai/topic/${topic._id}/generate-now`, { method:'POST' });
      logMonitor(`🚀 Generated posts for topic '${topicName}'`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) { logMonitor(`❌ Failed to generate post: ${e.message}`,'error'); }
  });

  // Clear logs
  clearLogsBtn.addEventListener('click', async () => {
    try { await fetch(`/api/ai/page/${pageId}/logs`, { method:'DELETE' }); logMonitor('🧹 Logs cleared'); loadLogs(); } 
    catch(e) { logMonitor(`❌ Failed to clear logs: ${e.message}`,'error'); }
  });

  // Live polling
  setInterval(loadLogs,5000);

  // Initial load
  loadUpcomingPosts();
  loadLogs();
  logMonitor('✅ AI Scheduler interface loaded');
});
