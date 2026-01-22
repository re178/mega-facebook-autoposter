document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');
  if (!pageId) return alert('❌ Page ID missing from URL!');

  // Elements
  const topicNameInput = document.getElementById('ai-topic-name');
  const topicSelect = document.getElementById('ai-topic-select');
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

  const topicsTable = document.getElementById('ai-topics-table');
  const upcomingPostsContainer = document.getElementById('ai-upcoming-posts-container');
  const logsTable = document.getElementById('ai-logs');
  const monitorLog = document.getElementById('ai-monitor-log');
  const aiStatusDiv = document.getElementById('ai-live-status');

  let currentStatus = 'Idle';

  /** ------------------ MONITOR LOGGER ------------------ **/
  function logMonitor(message, type='info') {
    const now = new Date().toLocaleTimeString();
    const color = type==='error'?'#ff4c4c': type==='warn'?'#ffa500':'#00ff99';
    const line = document.createElement('div');
    line.className = 'monitor-line';
    line.innerHTML = `<span style="color:${color}">[${now}]</span> ${message}`;
    monitorLog.appendChild(line);
    monitorLog.scrollTop = monitorLog.scrollHeight;
    console.log(`[${now}] ${type.toUpperCase()}: ${message}`);
  }

  /** ------------------ AI STATUS ------------------ **/
  function setAIStatus(status) {
    currentStatus = status;
    const color = status==='Generating'?'#ffa500': status==='Posting'?'#00ff99':'#ccc';
    aiStatusDiv.textContent = `Status: ${status}`;
    aiStatusDiv.style.color = color;
    toggleDeleteButtons(status !== 'Idle');
  }

  function toggleDeleteButtons(disable=false) {
    document.querySelectorAll('#ai-topics-table button[data-delete]').forEach(btn => btn.disabled = disable);
    document.querySelectorAll('#ai-upcoming-posts-container button').forEach(btn => {
      if(btn.textContent.includes('Delete')) btn.disabled = disable;
    });
  }

  /** ------------------ TIME INPUT ------------------ **/
  function addTimeInput(value='') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    timesContainer.appendChild(input);
  }

  addTimeBtn.addEventListener('click', () => { addTimeInput(); logMonitor('🕒 Added a new post time input'); });

  /** ------------------ POPULATE TOPIC DROPDOWN ------------------ **/
  async function populateTopicDropdown() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/topics`);
      const topics = await res.json();
      topicSelect.innerHTML = '<option value="">-- Select Topic --</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.topicName;
        topicSelect.appendChild(opt);
      });
      renderTopicsTable(topics);
    } catch(e) { logMonitor(`❌ Failed to populate topic dropdown: ${e.message}`,'error'); }
  }

  topicSelect.addEventListener('change', async () => {
    const selectedId = topicSelect.value;
    if (!selectedId) return;

    const res = await fetch(`/api/ai/page/${pageId}/topics`);
    const topics = await res.json();
    const topic = topics.find(t => t._id === selectedId);
    if (!topic) return;

    // Fill form
    topicNameInput.value = topic.topicName;
    postsPerDaySelect.value = topic.postsPerDay || 1;
    startDateInput.value = topic.startDate || '';
    endDateInput.value = topic.endDate || '';
    repeatTypeSelect.value = topic.repeatType || 'daily';
    includeMediaCheckbox.checked = !!topic.includeMedia;

    timesContainer.innerHTML = '';
    (topic.times || []).forEach(t => addTimeInput(t));

    saveTopicBtn.dataset.editing = topic._id;
    logMonitor(`✏️ Editing topic "${topic.topicName}"`);
  });

  /** ------------------ RENDER TOPICS TABLE ------------------ **/
  function renderTopicsTable(topics) {
    topicsTable.innerHTML = '';
    topics.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.topicName}</td>
        <td>${t.postsPerDay}</td>
        <td>${t.startDate || '-'} → ${t.endDate || '-'}</td>
        <td>
          <button onclick="topicSelect.value='${t._id}'; topicSelect.dispatchEvent(new Event('change'));">Edit</button>
          <button data-delete onclick="deleteTopic('${t._id}')">Delete</button>
        </td>
      `;
      topicsTable.appendChild(tr);
    });
  }

  /** ------------------ DELETE TOPIC ------------------ **/
  window.deleteTopic = async (topicId) => {
    if(currentStatus !== 'Idle') return logMonitor('⚠️ Cannot delete while AI is busy','warn');
    if(!confirm('Are you sure you want to delete this topic and all its posts?')) return;
    try {
      await fetch(`/api/ai/topic/${topicId}`, { method:'DELETE' });
      logMonitor(`🗑️ Topic deleted`);
      populateTopicDropdown();
      loadUpcomingPostsGrouped();
    } catch(e){ logMonitor(`❌ Failed to delete topic: ${e.message}`,'error'); }
  };

  /** ------------------ SAVE TOPIC ------------------ **/
  saveTopicBtn.addEventListener('click', async () => {
    const topicName = topicNameInput.value.trim();
    if (!topicName) return logMonitor('❌ Topic name cannot be empty','error');

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

    try {
      setAIStatus('Generating');
      let url = `/api/ai/page/${pageId}/topic`;
      let method = 'POST';
      if(saveTopicBtn.dataset.editing){
        url = `/api/ai/topic/${saveTopicBtn.dataset.editing}`;
        method = 'PUT';
      }
      const res = await fetch(url, {
        method,
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const topic = await res.json();
      logMonitor(`💾 Topic '${topic.topicName}' saved`);
      delete saveTopicBtn.dataset.editing;
      populateTopicDropdown();
      setAIStatus('Idle');
    } catch(e){ logMonitor(`❌ Failed to save topic: ${e.message}`,'error'); setAIStatus('Idle'); }
  });

  /** ------------------ GENERATE POSTS NOW ------------------ **/
  generatePostNowBtn.addEventListener('click', async () => {
    const selectedId = topicSelect.value;
    if(!selectedId) return logMonitor('❌ Select topic first','error');
    if(currentStatus !== 'Idle') return logMonitor('⚠️ AI busy, wait...','warn');

    try {
      setAIStatus('Generating');
      await fetch(`/api/ai/topic/${selectedId}/generate-now`, { method:'POST' });
      logMonitor(`🚀 Posts generated for selected topic`);
      loadUpcomingPostsGrouped();
      loadLogs();
    } catch(e){ logMonitor(`❌ Failed to generate posts: ${e.message}`,'error'); }
    finally { setAIStatus('Idle'); }
  });

  /** ------------------ GROUPED UPCOMING POSTS ------------------ **/
  async function loadUpcomingPostsGrouped() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/upcoming-posts`);
      let posts = await res.json();
      if(!Array.isArray(posts)) posts = [];

      upcomingPostsContainer.innerHTML = '';

      const grouped = posts.reduce((acc, post)=>{
        const topic = post.topicId?.topicName || 'No Topic';
        acc[topic] = acc[topic] || [];
        acc[topic].push(post);
        return acc;
      },{});

      for(const [topic, topicPosts] of Object.entries(grouped)){
        const groupDiv = document.createElement('div');
        groupDiv.className = 'topic-group';
        groupDiv.innerHTML = `<h4>${topic} (${topicPosts.length} posts)</h4>`;

        const table = document.createElement('table');
        table.innerHTML = `
          <thead>
            <tr>
              <th>Scheduled Time</th>
              <th>Text</th>
              <th>Media</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Content Type</th>
            </tr>
          </thead>
        `;
        const tbody = document.createElement('tbody');

        topicPosts.forEach(p=>{
          const tr = document.createElement('tr');
          const retryBtn = p.status==='FAILED'?`<button onclick="retryAiPost('${p._id}')">Retry</button>`:'';
          tr.innerHTML = `
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
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        groupDiv.appendChild(table);
        upcomingPostsContainer.appendChild(groupDiv);
      }

      logMonitor('📋 Upcoming posts grouped by topic loaded');
    } catch(e){ logMonitor(`❌ Failed to load grouped posts: ${e.message}`,'error'); }
  }

  /** ------------------ LOGS ------------------ **/
  async function loadLogs() {
    try {
      const res = await fetch(`/api/ai/page/${pageId}/logs`);
      let logs = await res.json();
      if(!Array.isArray(logs)) logs = [];

      logsTable.innerHTML = '';
      logs.slice(0,5).forEach(l=>{
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
      if(logs.length>=20) logMonitor('⚠️ Logs exceeding 20 entries. Consider clearing','warn');
      logMonitor('📝 Logs loaded');
    } catch(e){ logMonitor(`❌ Failed to load logs: ${e.message}`,'error'); }
  }

  clearLogsBtn.addEventListener('click', async () => {
    try { await fetch(`/api/ai/page/${pageId}/logs`, { method:'DELETE' }); logMonitor('🧹 Logs cleared'); loadLogs(); } 
    catch(e){ logMonitor(`❌ Failed to clear logs: ${e.message}`,'error'); }
  });

  /** ------------------ INITIAL LOAD ------------------ **/
  populateTopicDropdown();
  loadUpcomingPostsGrouped();
  loadLogs();
  logMonitor('✅ AI Scheduler interface loaded');

  // Live polling logs
  setInterval(loadLogs,5000);
});
