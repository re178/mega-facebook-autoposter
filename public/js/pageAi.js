document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId'); // expects ?pageId=xxx
  if (!pageId) return;

  // ----- Elements -----
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

  // ----- Utilities -----
  function logMonitor(message, type='info') {
    const now = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff4c4c' : type === 'warn' ? '#ffa500' : '#00ff99';
    const line = document.createElement('div');
    line.innerHTML = `<span style="color:${color}">[${now}]</span> ${message}`;
    monitorLog.appendChild(line);
    monitorLog.scrollTop = monitorLog.scrollHeight;
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

  // ----- Load upcoming posts -----
  async function loadUpcomingPosts() {
    try {
      const res = await fetch(`/api/aiScheduler/page/${pageId}/ai-posts`);
      const posts = await res.json();
      upcomingPostsTable.innerHTML = '';
      posts.forEach(p => {
        const tr = document.createElement('tr');
        const statusBtn = p.status === 'FAILED' 
          ? `<button onclick="retryAiPost('${p._id}')">Retry</button>` 
          : '';
        tr.innerHTML = `
          <td>${p.topicName}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text}</td>
          <td>${p.mediaUrl || ''}</td>
          <td>${p.status}</td>
          <td>
            <button onclick="editAiPost('${p._id}')">Edit</button>
            <button onclick="deleteAiPost('${p._id}')">Delete</button>
            <button onclick="postNowAi('${p._id}')">Post Now</button>
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
      const res = await fetch(`/api/aiScheduler/page/${pageId}/logs`);
      const logs = await res.json();
      logsTable.innerHTML = '';
      logs.slice(0,5).forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.postText || ''}</td>
          <td>${l.action}</td>
          <td>${l.message}</td>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
          <td><button onclick="deleteLog('${l._id}')">Delete</button></td>
          <td>${l.action==='FAILED'?`<button onclick="retryAiPost('${l.postId}')">Retry</button>`:''}</td>
        `;
        logsTable.appendChild(tr);
      });
      logMonitor('📝 Logs loaded');
    } catch(e) {
      logMonitor(`❌ Failed to load logs: ${e.message}`, 'error');
    }
  }

  // ----- Button Handlers -----
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const times = Array.from(timesContainer.querySelectorAll('input[type=time]')).map(i=>i.value);
      const data = {
        topicName: topicNameInput.value,
        postsPerDay: parseInt(postsPerDaySelect.value),
        times,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };
      await fetch(`/api/aiScheduler/page/${pageId}/ai-topic`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
      });
      logMonitor(`💾 Topic '${topicNameInput.value}' saved`);
      loadUpcomingPosts();
    } catch(e) {
      logMonitor(`❌ Failed to save topic: ${e.message}`, 'error');
    }
  });

  generatePostNowBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value;
      await fetch(`/api/aiScheduler/generate/${pageId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topicName})});
      logMonitor(`🚀 Generated and posted now for topic '${topicName}'`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to generate post: ${e.message}`, 'error');
    }
  });

  deleteAllTopicPostsBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value;
      await fetch(`/api/aiScheduler/page/${pageId}/ai-topic/${topicName}/posts`, {method:'DELETE'});
      logMonitor(`🗑 All posts for topic '${topicName}' deleted`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete topic posts: ${e.message}`, 'error');
    }
  });

  clearLogsBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/aiScheduler/page/${pageId}/logs`, {method:'DELETE'});
      logMonitor('🧹 Logs cleared');
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to clear logs: ${e.message}`, 'error');
    }
  });

  // ----- Global Functions for Table Buttons -----
  window.editAiPost = (id) => {
    alert('Edit flow for post ' + id);
    logMonitor(`✏️ Edit button clicked for post ${id}`);
  };

  window.deleteAiPost = async (id) => {
    try {
      await fetch(`/api/aiScheduler/ai-post/${id}`, {method:'DELETE'});
      logMonitor(`🗑 Deleted AI post ${id}`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete AI post ${id}: ${e.message}`, 'error');
    }
  };

  window.postNowAi = async (id) => {
    try {
      await fetch(`/api/aiScheduler/ai-post/${id}/post-now`, {method:'POST'});
      logMonitor(`🚀 Posted AI post ${id} immediately`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to post AI post ${id}: ${e.message}`, 'error');
    }
  };

  window.deleteLog = async (id) => {
    try {
      await fetch(`/api/aiScheduler/log/${id}`, {method:'DELETE'});
      logMonitor(`🧹 Deleted log ${id}`);
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete log ${id}: ${e.message}`, 'error');
    }
  };

  window.retryAiPost = async (id) => {
    try {
      await fetch(`/api/aiScheduler/ai-post/${id}/post-now`, {method:'POST'});
      logMonitor(`⚡ Retrying AI post ${id}`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Retry failed for AI post ${id}: ${e.message}`, 'error');
    }
  };

  window.markContent = async (id,type) => {
    try {
      await fetch(`/api/aiScheduler/ai-post/${id}/mark`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type})
      });
      logMonitor(`🔖 Marked AI post ${id} as ${type.toUpperCase()}`);
      loadUpcomingPosts();
    } catch(e) {
      logMonitor(`❌ Failed to mark content for AI post ${id}: ${e.message}`, 'error');
    }
  };

  // ----- Initial load -----
  loadUpcomingPosts();
  loadLogs();
  logMonitor('✅ AI Scheduler interface loaded');
});
