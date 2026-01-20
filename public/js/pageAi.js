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

  const MAX_POSTS_PER_TOPIC = 5; // configurable limit

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
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const posts = await res.json();
      upcomingPostsTable.innerHTML = '';

      // Auto-cleanup: delete SUCCESS posts older than 2 hours
      const now = new Date();
      for (const p of posts) {
        if (p.status === 'SUCCESS' && new Date(p.scheduledTime) < new Date(now - 2*60*60*1000)) {
          if (confirm(`Delete SUCCESS post "${p.text}" older than 2 hours?`)) {
            await deleteAiPost(p._id, false); // false = no confirmation prompt
            logMonitor(`🧹 Auto-cleaned SUCCESS post "${p.text}"`);
          }
        }
      }

      // Enforce max posts per topic
      const topicsMap = {};
      posts.forEach(p => {
        const key = p.topicId?.topicName || 'unknown';
        if (!topicsMap[key]) topicsMap[key] = [];
        topicsMap[key].push(p);
      });

      for (const topic in topicsMap) {
        const arr = topicsMap[topic];
        if (arr.length > MAX_POSTS_PER_TOPIC) {
          // Delete oldest to enforce limit
          const excess = arr.length - MAX_POSTS_PER_TOPIC;
          const sorted = arr.sort((a,b)=>new Date(a.scheduledTime) - new Date(b.scheduledTime));
          for (let i=0; i<excess; i++) {
            await deleteAiPost(sorted[i]._id, false);
            logMonitor(`🗑 Deleted oldest post of topic "${topic}" to enforce limit`);
          }
        }
      }

      // Reload posts after cleanup
      const updatedRes = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      const updatedPosts = await updatedRes.json();

      updatedPosts.forEach(p => {
        const retryBtn = p.status === 'FAILED' ? `<button onclick="retryAiPost('${p._id}')">Retry</button>` : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.topicId?.topicName || ''}</td>
          <td>${new Date(p.scheduledTime).toLocaleString()}</td>
          <td>${p.text}</td>
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

      logMonitor('📋 Upcoming posts loaded and cleaned');
    } catch(e) {
      logMonitor(`❌ Failed to load upcoming posts: ${e.message}`, 'error');
    }
  }

  // ----- Delete AI post (strong delete) -----
  window.deleteAiPost = async (id, confirmPrompt=true) => {
    try {
      if (confirmPrompt && !confirm('Delete this AI post?')) return;
      await fetch(`/api/ai/post/${id}/retry`, { method:'DELETE' });
      logMonitor(`🗑 Deleted AI post ${id}`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete AI post ${id}: ${e.message}`, 'error');
    }
  };

  // ----- Other post actions (retry, post now, mark content) -----
  window.postNowAi = async (id) => { await fetchAction('POST', id, 'Posted immediately'); };
  window.retryAiPost = async (id) => { await fetchAction('POST', id, 'Retry triggered'); };
  window.markContent = async (id,type) => {
    try {
      await fetch(`/api/ai/ai-post/${id}/mark`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type})
      });
      logMonitor(`🔖 Marked AI post ${id} as ${type.toUpperCase()}`);
      loadUpcomingPosts();
    } catch(e) { logMonitor(`❌ Failed to mark content ${id}: ${e.message}`, 'error'); }
  };

  async function fetchAction(method, id, actionMsg) {
    try {
      await fetch(`/api/ai/post/${id}/retry`, { method });
      logMonitor(`⚡ ${actionMsg} for AI post ${id}`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed action for AI post ${id}: ${e.message}`, 'error');
    }
  }

  // ----- Logs -----
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
      logMonitor('📝 Logs loaded');
    } catch(e) {
      logMonitor(`❌ Failed to load logs: ${e.message}`, 'error');
    }
  }

  window.deleteLog = async (id) => {
    if (!confirm('Delete this log entry?')) return;
    try {
      await fetch(`/api/ai/page/${pageId}/logs`, { method:'DELETE' });
      logMonitor(`🧹 Log ${id} deleted`);
      loadLogs();
    } catch(e) { logMonitor(`❌ Failed to delete log ${id}: ${e.message}`, 'error'); }
  };

  // ----- Topic actions -----
  saveTopicBtn.addEventListener('click', async () => {
    try {
      const times = Array.from(timesContainer.querySelectorAll('input[type=time]')).map(i=>i.value);
      if (!topicNameInput.value) return logMonitor('❌ Topic name cannot be empty', 'error');

      const data = {
        topicName: topicNameInput.value,
        postsPerDay: parseInt(postsPerDaySelect.value),
        times,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        repeatType: repeatTypeSelect.value,
        includeMedia: includeMediaCheckbox.checked
      };

      const res = await fetch(`/api/ai/page/${pageId}/topic`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
      });
      const topic = await res.json();
      logMonitor(`💾 Topic '${topic.topicName}' saved`);
      loadUpcomingPosts();
    } catch(e) {
      logMonitor(`❌ Failed to save topic: ${e.message}`, 'error');
    }
  });

  deleteAllTopicPostsBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value;
      if (!topicName) return logMonitor('❌ Enter topic name to delete posts', 'error');

      const resTopics = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = await resTopics.json();
      const topic = topics.find(t=>t.topicName===topicName);
      if (!topic) return logMonitor(`❌ Topic '${topicName}' not found`, 'error');

      if (!confirm(`Delete ALL posts for topic "${topicName}"? This cannot be undone!`)) return;

      await fetch(`/api/ai/topic/${topic._id}/posts`, { method:'DELETE' });
      logMonitor(`🗑 All posts for topic '${topicName}' deleted`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to delete topic posts: ${e.message}`, 'error');
    }
  });

  generatePostNowBtn.addEventListener('click', async () => {
    try {
      const topicName = topicNameInput.value;
      const resTopics = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = await resTopics.json();
      const topic = topics.find(t=>t.topicName===topicName);
      if(!topic) return logMonitor(`❌ Topic '${topicName}' not found`, 'error');

      await fetch(`/api/ai/topic/${topic._id}/generate-now`, { method:'POST' });
      logMonitor(`🚀 Generated and posted now for topic '${topicName}'`);
      loadUpcomingPosts();
      loadLogs();
    } catch(e) {
      logMonitor(`❌ Failed to generate post: ${e.message}`, 'error');
    }
  });

  // ----- Live polling -----
  setInterval(loadLogs, 5000); // refresh logs every 5s
  setInterval(loadUpcomingPosts, 2*60*1000); // refresh posts every 2 minutes

  // ----- Initial load -----
  loadUpcomingPosts();
  loadLogs();
  logMonitor('✅ AI Scheduler interface loaded');

});

// ----- Sidebar navigation -----
const sections = ['create-post','posts-list','page-logs','messaging-section','analytics-section','ads-section','manage-section','ai-scheduler-section'];
document.querySelectorAll('#page-nav a').forEach(link => {
  link.addEventListener('click', () => {
    const page = link.dataset.page;
    sections.forEach(sec => {
      const el = document.getElementById(sec);
      if (el) el.style.display = (sec === page || sec+'-section' === page+'-section') ? 'block' : 'none';
    });
  });
});

      
