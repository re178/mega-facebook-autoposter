document.addEventListener('DOMContentLoaded', async () => {
  const pageId = new URLSearchParams(window.location.search).get('pageId');
  if (!pageId) return alert('Page ID missing');

  // -------------------------------
  // TAB SWITCHING
  document.querySelectorAll('#page-nav a').forEach(a => {
    a.addEventListener('click', () => {
      const page = a.dataset.page;
      document.querySelectorAll('main .card').forEach(sec => sec.style.display = 'none');
      const target = document.getElementById(`${page}-section`);
      if (target) target.style.display = 'block';
      document.querySelectorAll('#page-nav a').forEach(nav => nav.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // -------------------------------
  // ===== MESSAGING =====
  async function loadInbox() {
    // Placeholder: Fetch messages from API
    const messages = await fetch(`/api/dashboard/page/${pageId}/messages`).then(r => r.json());
    const tbody = document.getElementById('inbox-table-body');
    tbody.innerHTML = '';
    messages.forEach(msg => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${msg.sender}</td>
        <td>${msg.content}</td>
        <td>${new Date(msg.receivedAt).toLocaleString()}</td>
        <td>${msg.status}</td>
        <td><button data-id="${msg._id}" class="reply-btn">Reply</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadTemplates() {
    const templates = await fetch(`/api/dashboard/page/${pageId}/templates`).then(r => r.json());
    const tbody = document.getElementById('templates-table-body');
    tbody.innerHTML = '';
    templates.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.name}</td>
        <td>${t.type}</td>
        <td>${t.keywords.join(', ')}</td>
        <td>${t.reply}</td>
        <td>
          <button data-id="${t._id}" class="edit-template">Edit</button>
          <button data-id="${t._id}" class="delete-template">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Initial load
  await loadInbox();
  await loadTemplates();

  // -------------------------------
  // ===== ANALYTICS =====
  const reachCtx = document.getElementById('reach-chart').getContext('2d');
  const engagementCtx = document.getElementById('engagement-chart').getContext('2d');
  const followersCtx = document.getElementById('followers-chart').getContext('2d');
  let reachChart, engagementChart, followersChart;

  async function loadAnalytics() {
    const data = await fetch(`/api/dashboard/page/${pageId}/insights`).then(r => r.json());
    // Example: Chart.js setup (data mapping placeholders)
    if(reachChart) reachChart.destroy();
    reachChart = new Chart(reachCtx, { type:'line', data: data.reach });
    if(engagementChart) engagementChart.destroy();
    engagementChart = new Chart(engagementCtx, { type:'bar', data: data.engagement });
    if(followersChart) followersChart.destroy();
    followersChart = new Chart(followersCtx, { type:'line', data: data.followers });
  }

  document.getElementById('refresh-analytics').addEventListener('click', loadAnalytics);
  document.getElementById('export-analytics').addEventListener('click', () => {
    // Placeholder: export logic
    alert('Export report feature placeholder');
  });
  await loadAnalytics();

  // -------------------------------
  // ===== ADS =====
  async function loadAds() {
    const ads = await fetch(`/api/dashboard/page/${pageId}/ads`).then(r => r.json());
    const tbody = document.getElementById('ads-table-body');
    tbody.innerHTML = '';
    ads.forEach(ad => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ad.name}</td>
        <td>${ad.status}</td>
        <td>${ad.budget}</td>
        <td>${ad.reach}</td>
        <td>${ad.ctr}</td>
        <td>
          <button data-id="${ad._id}" class="edit-ad">Edit</button>
          <button data-id="${ad._id}" class="pause-ad">Pause/Resume</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  await loadAds();

  document.getElementById('create-ad-btn').addEventListener('click', () => {
    alert('Create Campaign modal placeholder');
  });

  // -------------------------------
  // ===== MANAGE / COMMENTS =====
  async function loadComments() {
    const comments = await fetch(`/api/dashboard/page/${pageId}/comments`).then(r => r.json());
    const tbody = document.getElementById('comments-table-body');
    tbody.innerHTML = '';
    comments.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.user}</td>
        <td>${c.content}</td>
        <td>${c.postTitle}</td>
        <td>${new Date(c.createdAt).toLocaleString()}</td>
        <td>
          <button data-id="${c._id}" class="hide-comment">Hide</button>
          <button data-id="${c._id}" class="reply-comment">Reply</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  await loadComments();
});
