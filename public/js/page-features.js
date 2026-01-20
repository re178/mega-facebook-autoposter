// ==========================
// PAGE FEATURES JS
// Handles Messaging, Analytics, Ads, Comments
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId'); // expects ?pageId=xxx

  if (!pageId) return;

  // ---- MESSAGING ----
  const messagesTableBody = document.getElementById('messages-table-body');
  const templatesTableBody = document.getElementById('templates-table-body');
  const refreshMessagesBtn = document.getElementById('refresh-messages');
  const addTemplateBtn = document.getElementById('add-template');

  async function loadMessages() {
    const messages = await getPageMessages(pageId);
    messagesTableBody.innerHTML = '';
    messages.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.sender}</td>
        <td>${m.content}</td>
        <td>${new Date(m.receivedAt).toLocaleString()}</td>
        <td>${m.status}</td>
        <td><button onclick="replyMessage('${m.id}')">Reply</button></td>
      `;
      messagesTableBody.appendChild(tr);
    });
  }

  async function loadTemplates() {
    const templates = await getTemplates(pageId);
    templatesTableBody.innerHTML = '';
    templates.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.name}</td>
        <td>${t.type}</td>
        <td>${t.keywords.join(', ')}</td>
        <td>${t.reply}</td>
        <td>
          <button onclick="editTemplate('${t.id}')">Edit</button>
          <button onclick="deleteTemplate('${t.id}')">Delete</button>
        </td>
      `;
      templatesTableBody.appendChild(tr);
    });
  }

  refreshMessagesBtn.addEventListener('click', loadMessages);
  addTemplateBtn.addEventListener('click', () => alert('Add template flow here'));

  await loadMessages();
  await loadTemplates();

  window.replyMessage = (id) => {
    const replyText = prompt('Enter reply:');
    if (!replyText) return;
    replyComment(id, replyText).then(() => loadMessages());
  };

  window.editTemplate = (id) => alert('Edit template flow for ID: ' + id);
  window.deleteTemplate = (id) => {
    if (confirm('Delete this template?')) {
      deleteTemplate(id).then(() => loadTemplates());
    }
  };

  // ---- ANALYTICS ----
  const chartsContainer = document.getElementById('charts-container');
  const refreshAnalyticsBtn = document.getElementById('refresh-analytics');
  const downloadReportBtn = document.getElementById('download-report');

  async function loadAnalytics() {
    const data = await getPageInsights(pageId);
    chartsContainer.innerHTML = `
      <p>Total Likes: ${data.likes}</p>
      <p>Total Comments: ${data.comments}</p>
      <p>Total Shares: ${data.shares}</p>
    `;
  }

  refreshAnalyticsBtn.addEventListener('click', loadAnalytics);
  downloadReportBtn.addEventListener('click', async () => {
    const blob = await downloadReport(pageId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-${pageId}-report.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  });

  await loadAnalytics();

  // ---- ADS ----
  const adsTableBody = document.getElementById('ads-table-body');
  const refreshAdsBtn = document.getElementById('refresh-ads');
  const createAdBtn = document.getElementById('create-ad');

  async function loadAds() {
    const ads = await getPageAds(pageId);
    adsTableBody.innerHTML = '';
    ads.forEach(ad => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ad.campaign}</td>
        <td>${ad.status}</td>
        <td>${ad.budget}</td>
        <td>${ad.reach}</td>
        <td>${ad.ctr}</td>
        <td>
          <button onclick="editAd('${ad.id}')">Edit</button>
          <button onclick="deleteAd('${ad.id}')">Delete</button>
        </td>
      `;
      adsTableBody.appendChild(tr);
    });
  }

  refreshAdsBtn.addEventListener('click', loadAds);
  createAdBtn.addEventListener('click', () => alert('Create ad flow here'));

  window.editAd = (id) => alert('Edit ad flow for ID: ' + id);
  window.deleteAd = (id) => {
    if (confirm('Delete this ad?')) {
      deleteAd(id).then(() => loadAds());
    }
  };

  await loadAds();

  // ---- COMMENTS ----
  const commentsTableBody = document.getElementById('comments-table-body');
  const refreshCommentsBtn = document.getElementById('refresh-comments');

  async function loadComments() {
    const comments = await getPageComments(pageId);
    commentsTableBody.innerHTML = '';
    comments.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.user}</td>
        <td>${c.comment}</td>
        <td>${c.post}</td>
        <td>${new Date(c.time).toLocaleString()}</td>
        <td>
          <button onclick="replyCommentUI('${c.id}')">Reply</button>
          <button onclick="hideCommentUI('${c.id}')">Hide</button>
          <button onclick="showCommentUI('${c.id}')">Show</button>
        </td>
      `;
      commentsTableBody.appendChild(tr);
    });
  }

  refreshCommentsBtn.addEventListener('click', loadComments);

  window.replyCommentUI = (id) => {
    const text = prompt('Reply to comment:');
    if (text) replyComment(id, text).then(() => loadComments());
  };
  window.hideCommentUI = (id) => hideComment(id).then(() => loadComments());
  window.showCommentUI = (id) => showComment(id).then(() => loadComments());

  await loadComments();

  // ---- Sidebar navigation ----
  const sections = ['create-post','posts-list','page-logs','messaging-section','analytics-section','ads-section','manage-section', 'ai-scheduler-section'];
  document.querySelectorAll('#page-nav a').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) el.style.display = (sec === page || sec+'-section' === page+'-section') ? 'block' : 'none';
      });
    });
  });

});

  
