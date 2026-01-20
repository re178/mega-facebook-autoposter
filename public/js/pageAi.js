document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) {
    alert('❌ Page ID missing from URL!');
    return;
  }

  // ----- Elements -----
  const topicNameInput = document.getElementById('ai-topic-name');
  const postsPerDaySelect = document.getElementById('ai-posts-per-day');
  const timesContainer = document.getElementById('ai-times-container');
  const addTimeBtn = document.getElementById('ai-add-time');
  const startDateInput = document.getElementById('ai-start-date');
  const endDateInput = document.getElementById('ai-end-date');
  const repeatTypeSelect = document.getElementById('ai-repeat-type');
  const includeMediaCheckbox = document.getElementById('ai-include-media');
  const savedTopicsContainer = document.getElementById('ai-saved-topics');

  const saveTopicBtn = document.getElementById('ai-save-topic');
  const generatePostNowBtn = document.getElementById('ai-generate-post-now');
  const deleteAllTopicPostsBtn = document.getElementById('ai-delete-all-topic-posts');
  const clearLogsBtn = document.getElementById('ai-clear-logs');

  const upcomingPostsTable = document.getElementById('ai-upcoming-posts');
  const logsTable = document.getElementById('ai-logs');
  const monitorLog = document.getElementById('ai-monitor-log');

  // ----- Utilities -----
  function logMonitor(message, type='info') {
    const now = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff4c4c' : type === 'warn' ? '#ffa500' : '#00ff99';
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

  addTimeBtn.addEventListener('click', () => {
    addTimeInput();
    logMonitor('🕒 Added a new post time input');
  });

  // ----- Load Topics and populate saved topics section -----
  async function loadTopics() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = await res.json();

      // clear container
      savedTopicsContainer.innerHTML = '';

      topics.forEach(topic => {
        const btn = document.createElement('button');
        btn.textContent = topic.topicName;
        btn.className = 'saved-topic-btn';
        btn.addEventListener('click', () => {
          topicNameInput.value = topic.topicName;
          logMonitor(`📝 Topic "${topic.topicName}" selected`);
        });
        savedTopicsContainer.appendChild(btn);
      });

      return topics;
    } catch (e) {
      logMonitor(`❌ Failed to load topics: ${e.message}`, 'error');
      return [];
    }
  }

  // ----- Load upcoming posts -----
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = await res.json();
      upcomingPostsTable.innerHTML = '';
      posts.forEach(p => {
        const tr = document.createElement('tr');
        const retryBtn = p.status === 'FAILED' ? `<button onclick="retryAiPost('${p._id}')">Retry</button>` : '';
        tr.innerHTML = `
          <td>${p.topicId?.topicName || ''}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text || ''}</td>
          <td>${p.mediaUrl || ''}</td>
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
    } catch(e) {
      logMonitor(`❌ Failed to load upcoming posts: ${e.message}`, 'error');
    }
  }

  // ----- Load logs -----
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      const logs = await res.json();
      logsTable.innerHTML = '';
      logs.slice(0,5).forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.postId?.text || ''}</td>
          <td>${l.action}</td>
          <td>${l.message}</td>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
          <td><button onclick="deleteLog('${l._id}')">Delete</button></td>
          <td>${l.action==='FAILED' && l.postId ? `<button onclick="retryAiPost('${l.postId._id}')">Retry</button>`:''}</td>
        `;
        logsTable.appendChild(tr);
      });

      if (logs.length >= 20) logMonitor('⚠️ Logs exceeding 20 entries. Consider clearing', 'warn');
      logMonitor('📝 Logs loaded');
    } catch(e) {
      logMonitor(`❌ Failed to load logs: ${e.message}`, 'error');
    }
  }

  // ----- Save Topic -----
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) return logMonitor('❌ Topic name cannot be empty', 'error');

      const topics = await loadTopics();
      if (topics.some(t => t.topicName.trim().toLowerCase() === topicName.toLowerCase())) {
        return logMonitor(`⚠️ Topic "${topicName}" already exists`, 'warn');
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

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const topic = await res.json();
      logMonitor(`💾 Topic '${topic.topicName}' saved`);
      await loadTopics();
      await loadUpcomingPosts();
    } catch(e) {
      logMonitor(`❌ Failed to save topic: ${e.message}`, 'error');
    }
  });

  // ----- Generate Post Now (fixed) -----
  generatePostNowBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) return logMonitor('❌ Enter topic name to generate posts', 'error');

      const topics = await loadTopics();
      const topic = topics.find(t => t.topicName.trim().toLowerCase() === topicName.toLowerCase());
      if (!topic) return logMonitor(`❌ Topic "${topicName}" not found`, 'error');

      const resPosts = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = await resPosts.json();
      const topicPosts = posts.filter(p => p.topicId?._id === topic._id);
      if (topicPosts.length >= 10) return logMonitor(`⚠️ Maximum posts reached for topic "${topicName}"`, 'warn');

      if (!topic.times || topic.times.length === 0) topic.times = ['09:00'];

      const res = await fetch(`/api/ai/topic/${topic._id}/generate-now`, { method:'POST' });
      if (!res.ok) {
        const err = await res.json();
        return logMonitor(`❌ Failed to generate posts: ${err.error || res.statusText}`, 'error');
      }

      logMonitor(`🚀 Generated posts for topic '${topicName}'`);
      await loadUpcomingPosts();
      await loadLogs();

    } catch(e) {
      logMonitor(`❌ Failed to generate post: ${e.message}`, 'error');
    }
  });

  // ----- Delete All Posts for Topic -----
  deleteAllTopicPostsBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value.trim();
      if (!topicName) return logMonitor('❌ Enter topic name to delete posts', 'error');

      const topics = await loadTopics();
      const topic = topics.find(t => t.topicName.trim().toLowerCase() === topicName.toLowerCase());
      if (!topic) return logMonitor(`❌ Topic "${topicName}" not found`, 'error');

      const res = await fetch(`/api/ai/topic/${topic._id}/posts`, { method:'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        return logMonitor(`❌ Failed to delete posts: ${err.error || res.statusText}`, 'error');
      }

      logMonitor(`🗑 All posts for topic '${topicName}' deleted`);
      await loadUpcomingPosts();
      await loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete topic posts: ${e.message}`, 'error');
    }
  });

  // ----- Clear Logs -----
  clearLogsBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/ai/page/${pageId}/logs`, { method:'DELETE' });
      logMonitor('🧹 Logs cleared');
      await loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to clear logs: ${e.message}`, 'error');
    }
  });

  // ----- Table Actions -----
  window.editAiPost = (id) => { alert('✏️ Edit flow for post ' + id); logMonitor(`✏️ Edit clicked for post ${id}`); };
  window.deleteAiPost = async (id) => { await fetch(`/api/ai/post/${id}/retry`, { method:'DELETE' }); logMonitor(`🗑 Deleted AI post ${id}`); await loadUpcomingPosts(); await loadLogs(); };
  window.postNowAi = async (id) => { await fetch(`/api/ai/post/${id}/retry`, { method:'POST' }); logMonitor(`🚀 Posted AI post ${id}`); await loadUpcomingPosts(); await loadLogs(); };
  window.retryAiPost = async (id) => { await fetch(`/api/ai/post/${id}/retry`, { method:'POST' }); logMonitor(`⚡ Retrying AI post ${id}`); await loadUpcomingPosts(); await loadLogs(); };
  window.markContent = async (id, type) => { await fetch(`/api/ai/ai-post/${id}/mark`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type }) }); logMonitor(`🔖 Marked AI post ${id} as ${type.toUpperCase()}`); await loadUpcomingPosts(); };

  // ----- Live Polling -----
  setInterval(loadLogs, 5000);

  // ----- Initial Load -----
  await loadTopics();
  await loadUpcomingPosts();
  await loadLogs();
  logMonitor('✅ AI Scheduler interface loaded');
});
