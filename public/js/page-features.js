// ==========================
// PAGE FEATURES JS
// Handles Messaging, Analytics, Ads, Comments
// with user‑friendly messages
// ==========================

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId'); // expects ?pageId=xxx

  if (!pageId) return;

  // Helper to show friendly messages inside a container
  function showFriendlyMessage(container, type, title, message, retryCallback = null) {
    if (!container) return;
    const icons = { info: '📭', warning: '⚠️', error: '🔌', success: '✅' };
    container.innerHTML = `
      <div class="friendly-message ${type}">
        <div class="icon">${icons[type] || 'ℹ️'}</div>
        <h3>${title}</h3>
        <p>${message}</p>
        ${retryCallback ? `<button class="retry-btn" onclick="(${retryCallback.toString()})()">Try Again</button>` : ''}
      </div>
    `;
  }

  function showLoading(container, text = 'Loading...') {
    if (!container) return;
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${text}</p>
      </div>
    `;
  }

  // ---- MESSAGING ----
  const messagesTableBody = document.getElementById('messages-table-body');
  const templatesTableBody = document.getElementById('templates-table-body');
  const refreshMessagesBtn = document.getElementById('refresh-messages');
  const addTemplateBtn = document.getElementById('add-template');

  async function loadMessages() {
    if (!messagesTableBody) return;
    showLoading(messagesTableBody, 'Loading messages...');

    try {
      const messages = await getPageMessages(pageId);

      // Check if it's an array
      if (!Array.isArray(messages)) {
        console.warn('Messages is not array:', messages);
        showFriendlyMessage(messagesTableBody, 'warning', 'Unexpected data', 'Could not load messages. Please refresh.', () => loadMessages());
        return;
      }

      if (messages.length === 0) {
        showFriendlyMessage(messagesTableBody, 'info', 'No new messages', 'Your inbox is empty. When someone sends a message, it will appear here.', () => loadMessages());
        return;
      }

      // Render messages
      messagesTableBody.innerHTML = '';
      messages.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(m.sender || m.senderName || 'Unknown')}</td>
          <td>${escapeHtml(m.message || m.content || '')}</td>
          <td>${new Date(m.receivedAt).toLocaleString()}</td>
          <td>${m.status || 'UNREAD'}</td>
          <td><button onclick="replyMessage('${m.id || m._id}')">Reply</button></td>
        `;
        messagesTableBody.appendChild(tr);
      });
    } catch (error) {
      console.error('loadMessages error:', error);
      showFriendlyMessage(messagesTableBody, 'error', 'Failed to load messages', error.message || 'Please check your connection.', () => loadMessages());
    }
  }

  async function loadTemplates() {
    if (!templatesTableBody) return;
    showLoading(templatesTableBody, 'Loading templates...');

    try {
      const templates = await getTemplates(pageId);
      if (!Array.isArray(templates)) throw new Error('Invalid data format');

      if (templates.length === 0) {
        showFriendlyMessage(templatesTableBody, 'info', 'No templates yet', 'Create auto‑reply templates to save time.', null);
        return;
      }

      templatesTableBody.innerHTML = '';
      templates.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(t.name)}</td>
          <td>${escapeHtml(t.type)}</td>
          <td>${(t.keywords || []).join(', ')}</td>
          <td>${escapeHtml(t.reply)}</td>
          <td>
            <button onclick="editTemplate('${t.id}')">Edit</button>
            <button onclick="deleteTemplate('${t.id}')">Delete</button>
          </td>
        `;
        templatesTableBody.appendChild(tr);
      });
    } catch (error) {
      showFriendlyMessage(templatesTableBody, 'error', 'Error loading templates', error.message, () => loadTemplates());
    }
  }

  refreshMessagesBtn?.addEventListener('click', loadMessages);
  addTemplateBtn?.addEventListener('click', () => alert('Add template flow here'));

  await loadMessages();
  await loadTemplates();

  window.replyMessage = async (id) => {
    const replyText = prompt('Enter reply:');
    if (!replyText) return;
    try {
      await replyComment(id, replyText);
      loadMessages();
    } catch (err) {
      alert('Failed to send reply: ' + err.message);
    }
  };

  window.editTemplate = (id) => alert('Edit template flow for ID: ' + id);
  window.deleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate(id);
      loadTemplates();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // ---- ANALYTICS ----
  const chartsContainer = document.getElementById('charts-container');
  const refreshAnalyticsBtn = document.getElementById('refresh-analytics');
  const downloadReportBtn = document.getElementById('download-report');

  async function loadAnalytics() {
    if (!chartsContainer) return;
    showLoading(chartsContainer, 'Loading analytics...');

    try {
      const data = await getPageInsights(pageId);
      if (!data || typeof data !== 'object') throw new Error('Invalid insights data');

      chartsContainer.innerHTML = `
        <div class="analytics-stats">
          <div class="stat">👍 Likes: ${data.likes || 0}</div>
          <div class="stat">💬 Comments: ${data.comments || 0}</div>
          <div class="stat">🔄 Shares: ${data.shares || 0}</div>
        </div>
      `;
    } catch (error) {
      showFriendlyMessage(chartsContainer, 'error', 'Analytics unavailable', error.message, () => loadAnalytics());
    }
  }

  refreshAnalyticsBtn?.addEventListener('click', loadAnalytics);
  downloadReportBtn?.addEventListener('click', async () => {
    try {
      const blob = await downloadReport(pageId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `page-${pageId}-report.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Could not download report: ' + err.message);
    }
  });

  await loadAnalytics();

  // ---- ADS ----
  const adsTableBody = document.getElementById('ads-table-body');
  const refreshAdsBtn = document.getElementById('refresh-ads');
  const createAdBtn = document.getElementById('create-ad');

  async function loadAds() {
    if (!adsTableBody) return;
    showLoading(adsTableBody, 'Loading ad campaigns...');

    try {
      const ads = await getPageAds(pageId);
      if (!Array.isArray(ads)) throw new Error('Invalid ads data');

      if (ads.length === 0) {
        showFriendlyMessage(adsTableBody, 'info', 'No ad campaigns', 'Create your first ad to reach more people.', null);
        return;
      }

      adsTableBody.innerHTML = '';
      ads.forEach(ad => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(ad.campaign)}</td>
          <td>${escapeHtml(ad.status)}</td>
          <td>$${ad.budget || 0}</td>
          <td>${ad.reach || 0}</td>
          <td>${ad.ctr || 0}%</td>
          <td>
            <button onclick="editAd('${ad.id}')">Edit</button>
            <button onclick="deleteAd('${ad.id}')">Delete</button>
          </td>
        `;
        adsTableBody.appendChild(tr);
      });
    } catch (error) {
      showFriendlyMessage(adsTableBody, 'error', 'Failed to load ads', error.message, () => loadAds());
    }
  }

  refreshAdsBtn?.addEventListener('click', loadAds);
  createAdBtn?.addEventListener('click', () => alert('Create ad flow here'));

  window.editAd = (id) => alert('Edit ad flow for ID: ' + id);
  window.deleteAd = async (id) => {
    if (!confirm('Delete this ad?')) return;
    try {
      await deleteAd(id);
      loadAds();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  await loadAds();

  // ---- COMMENTS ----
  const commentsTableBody = document.getElementById('comments-table-body');
  const refreshCommentsBtn = document.getElementById('refresh-comments');

  async function loadComments() {
    if (!commentsTableBody) return;
    showLoading(commentsTableBody, 'Loading comments...');

    try {
      const comments = await getPageComments(pageId);
      if (!Array.isArray(comments)) throw new Error('Invalid comments data');

      if (comments.length === 0) {
        showFriendlyMessage(commentsTableBody, 'info', 'No comments yet', 'When people comment on your posts, they will appear here.', null);
        return;
      }

      commentsTableBody.innerHTML = '';
      comments.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(c.user || c.senderName || 'Unknown')}</td>
          <td>${escapeHtml(c.comment || c.message || '')}</td>
          <td>${escapeHtml(c.post || '')}</td>
          <td>${new Date(c.time || c.createdAt).toLocaleString()}</td>
          <td>
            <button onclick="replyCommentUI('${c.id || c._id}')">Reply</button>
            <button onclick="hideCommentUI('${c.id || c._id}')">Hide</button>
            <button onclick="showCommentUI('${c.id || c._id}')">Show</button>
          </td>
        `;
        commentsTableBody.appendChild(tr);
      });
    } catch (error) {
      showFriendlyMessage(commentsTableBody, 'error', 'Failed to load comments', error.message, () => loadComments());
    }
  }

  refreshCommentsBtn?.addEventListener('click', loadComments);

  window.replyCommentUI = async (id) => {
    const text = prompt('Reply to comment:');
    if (!text) return;
    try {
      await replyComment(id, text);
      loadComments();
    } catch (err) {
      alert('Reply failed: ' + err.message);
    }
  };
  window.hideCommentUI = async (id) => {
    try {
      await hideComment(id);
      loadComments();
    } catch (err) {
      alert('Hide failed: ' + err.message);
    }
  };
  window.showCommentUI = async (id) => {
    try {
      await showComment(id);
      loadComments();
    } catch (err) {
      alert('Show failed: ' + err.message);
    }
  };

  await loadComments();

  // ---- Sidebar navigation ----
  const sections = ['create-post', 'posts-list', 'page-logs', 'messaging-section', 'analytics-section', 'ads-section', 'manage-section', 'ai-scheduler-section', 'page-profile-section', 'admin-section'];
  document.querySelectorAll('#page-nav a').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) el.style.display = (sec === page || sec + '-section' === page + '-section') ? 'block' : 'none';
      });
    });
  });

  // Helper to escape HTML (prevent XSS)
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
      return c;
    });
  }
});
