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

  // ----- Dynamic Time Inputs -----
  function addTimeInput(value='') {
    const input = document.createElement('input');
    input.type = 'time';
    input.value = value;
    timesContainer.appendChild(input);
  }

  addTimeBtn.addEventListener('click', () => addTimeInput());

  // ----- Load upcoming posts -----
  async function loadUpcomingPosts() {
    const res = await fetch(`/api/aiScheduler/page/${pageId}/ai-posts`);
    const posts = await res.json();
    upcomingPostsTable.innerHTML = '';
    posts.forEach(p => {
      const tr = document.createElement('tr');
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
      `;
      upcomingPostsTable.appendChild(tr);
    });
  }

  // ----- Load logs -----
  async function loadLogs() {
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
      `;
      logsTable.appendChild(tr);
    });
  }

  // ----- Button Handlers -----
  saveTopicBtn.addEventListener('click', async () => {
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
    loadUpcomingPosts();
  });

  generatePostNowBtn.addEventListener('click', async () => {
    const topicName = topicNameInput.value;
    await fetch(`/api/aiScheduler/generate/${pageId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topicName})});
    loadUpcomingPosts();
    loadLogs();
  });

  deleteAllTopicPostsBtn.addEventListener('click', async () => {
    const topicName = topicNameInput.value;
    await fetch(`/api/aiScheduler/page/${pageId}/ai-topic/${topicName}/posts`, {method:'DELETE'});
    loadUpcomingPosts();
    loadLogs();
  });

  clearLogsBtn.addEventListener('click', async () => {
    await fetch(`/api/aiScheduler/page/${pageId}/logs`, {method:'DELETE'});
    loadLogs();
  });

  // Initial load
  loadUpcomingPosts();
  loadLogs();

  // ----- Global functions for table buttons -----
  window.editAiPost = (id) => alert('Edit flow for post ' + id);
  window.deleteAiPost = async (id) => { await fetch(`/api/aiScheduler/ai-post/${id}`, {method:'DELETE'}); loadUpcomingPosts(); loadLogs(); };
  window.postNowAi = async (id) => { await fetch(`/api/aiScheduler/ai-post/${id}/post-now`, {method:'POST'}); loadUpcomingPosts(); loadLogs(); };
  window.deleteLog = async (id) => { await fetch(`/api/aiScheduler/log/${id}`, {method:'DELETE'}); loadLogs(); };

});
