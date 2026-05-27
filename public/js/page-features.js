// ==========================
// PAGE FEATURES JS (FIXED)
// Handles Messaging, Analytics, Ads, Comments
// with user‑friendly messages
// ==========================

(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId'); // expects ?pageId=xxx

  if (!pageId) {
    console.warn('No pageId provided');
    return;
  }

  // Helper to show friendly messages inside a container
  function showFriendlyMessage(container, type, title, message, retryCallback = null) {
    if (!container) return;
    const icons = { info: '📭', warning: '⚠️', error: '🔌', success: '✅' };
    container.innerHTML = `
      <div class="friendly-message ${type}">
        <div class="icon">${icons[type] || 'ℹ️'}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        ${retryCallback ? `<button class="retry-btn" data-retry="${retryCallback.name || 'retry'}">Try Again</button>` : ''}
      </div>
    `;
    if (retryCallback) {
      const btn = container.querySelector('.retry-btn');
      if (btn) btn.addEventListener('click', () => retryCallback());
    }
  }

  function showLoading(container, text = 'Loading...') {
    if (!container) return;
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${escapeHtml(text)}</p>
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
      if (!Array.isArray(messages)) {
        console.warn('Messages is not array:', messages);
        showFriendlyMessage(messagesTableBody, 'warning', 'Unexpected data', 'Could not load messages. Please refresh.', loadMessages);
        return;
      }

      if (messages.length === 0) {
        showFriendlyMessage(messagesTableBody, 'info', 'No new messages', 'Your inbox is empty. When someone sends a message, it will appear here.', loadMessages);
        return;
      }

      messagesTableBody.innerHTML = '';
      messages.forEach(m => {
        const tr = document.createElement('tr');
        const msgId = m.id || m._id;
        tr.innerHTML = `
          <td>${escapeHtml(m.sender || m.senderName || 'Unknown')}</td>
          <td>${escapeHtml(m.message || m.content || '')}</td>
          <td>${new Date(m.receivedAt).toLocaleString()}</td>
          <td>${escapeHtml(m.status || 'UNREAD')}</td>
          <td><button class="reply-msg-btn" data-msg-id="${msgId}">Reply</button></td>
        `;
        messagesTableBody.appendChild(tr);
      });
      // Attach reply handlers via event delegation
      messagesTableBody.querySelectorAll('.reply-msg-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const msgId = btn.dataset.msgId;
          await handleReplyMessage(msgId);
        });
      });
    } catch (error) {
      console.error('loadMessages error:', error);
      showFriendlyMessage(messagesTableBody, 'error', 'Failed to load messages', error.message || 'Please check your connection.', loadMessages);
    }
  }

  async function handleReplyMessage(messageId) {
    const replyText = prompt('Enter reply:');
    if (!replyText) return;
    try {
      // ✅ FIXED: use sendMessage, NOT replyComment
      await sendMessage(pageId, messageId, replyText);
      await loadMessages(); // refresh list after reply
    } catch (err) {
      alert('Failed to send reply: ' + err.message);
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
        const templateId = t.id || t._id;
        tr.innerHTML = `
          <td>${escapeHtml(t.name)}</td>
          <td>${escapeHtml(t.type)}</td>
          <td>${escapeHtml((t.keywords || []).join(', '))}</td>
          <td>${escapeHtml(t.reply)}</td>
          <td>
            <button class="edit-template-btn" data-id="${templateId}">Edit</button>
            <button class="delete-template-btn" data-id="${templateId}">Delete</button>
          </td>
        `;
        templatesTableBody.appendChild(tr);
      });
      // Attach handlers
      templatesTableBody.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', () => handleEditTemplate(btn.dataset.id));
      });
      templatesTableBody.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteTemplate(btn.dataset.id));
      });
    } catch (error) {
      showFriendlyMessage(templatesTableBody, 'error', 'Error loading templates', error.message, loadTemplates);
    }
  }

  async function handleEditTemplate(templateId) {
    // Simple prompt-based edit; you can expand to modal
    const newName = prompt('Enter new template name');
    if (!newName) return;
    // For full edit, you'd need more fields. This is a placeholder.
    alert(`Edit template ${templateId} - implement full UI as needed`);
  }

  async function handleDeleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate(templateId);
      await loadTemplates();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  refreshMessagesBtn?.addEventListener('click', loadMessages);
  addTemplateBtn?.addEventListener('click', () => alert('Add template flow here'));

  await loadMessages();
  await loadTemplates();

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
      showFriendlyMessage(chartsContainer, 'error', 'Analytics unavailable', error.message, loadAnalytics);
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
        const adId = ad.id || ad._id;
        tr.innerHTML = `
          <td>${escapeHtml(ad.campaign)}</td>
          <td>${escapeHtml(ad.status)}</td>
          <td>$${ad.budget || 0}</td>
          <td>${ad.reach || 0}</td>
          <td>${ad.ctr || 0}%</td>
          <td>
            <button class="edit-ad-btn" data-id="${adId}">Edit</button>
            <button class="delete-ad-btn" data-id="${adId}">Delete</button>
           </td>
        `;
        adsTableBody.appendChild(tr);
      });
      adsTableBody.querySelectorAll('.edit-ad-btn').forEach(btn => {
        btn.addEventListener('click', () => handleEditAd(btn.dataset.id));
      });
      adsTableBody.querySelectorAll('.delete-ad-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteAd(btn.dataset.id));
      });
    } catch (error) {
      showFriendlyMessage(adsTableBody, 'error', 'Failed to load ads', error.message, loadAds);
    }
  }

  async function handleEditAd(adId) {
    // Placeholder – you can implement a modal form
    const newBudget = prompt('Enter new budget (USD)');
    if (newBudget === null) return;
    try {
      await editAd(adId, { budget: parseFloat(newBudget) });
      await loadAds();
      alert('Ad updated');
    } catch (err) {
      alert('Edit failed: ' + err.message);
    }
  }

  async function handleDeleteAd(adId) {
    if (!confirm('Delete this ad campaign?')) return;
    try {
      await deleteAd(adId);
      await loadAds();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  refreshAdsBtn?.addEventListener('click', loadAds);
  createAdBtn?.addEventListener('click', () => alert('Create ad flow here'));

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
        const commentId = c.id || c._id;
        tr.innerHTML = `
          <td>${escapeHtml(c.user || c.senderName || 'Unknown')}</td>
          <td>${escapeHtml(c.comment || c.message || '')}</td>
          <td>${escapeHtml(c.post || '')}</td>
          <td>${new Date(c.time || c.createdAt).toLocaleString()}</td>
          <td>
            <button class="reply-comment-btn" data-id="${commentId}">Reply</button>
            <button class="hide-comment-btn" data-id="${commentId}">Hide</button>
            <button class="show-comment-btn" data-id="${commentId}">Show</button>
          </td>
        `;
        commentsTableBody.appendChild(tr);
      });
      // Attach handlers
      commentsTableBody.querySelectorAll('.reply-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => handleReplyComment(btn.dataset.id));
      });
      commentsTableBody.querySelectorAll('.hide-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => handleHideComment(btn.dataset.id));
      });
      commentsTableBody.querySelectorAll('.show-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => handleShowComment(btn.dataset.id));
      });
    } catch (error) {
      showFriendlyMessage(commentsTableBody, 'error', 'Failed to load comments', error.message, loadComments);
    }
  }

  async function handleReplyComment(commentId) {
    const text = prompt('Reply to comment:');
    if (!text) return;
    try {
      await replyComment(commentId, text);
      await loadComments();
    } catch (err) {
      alert('Reply failed: ' + err.message);
    }
  }

  async function handleHideComment(commentId) {
    try {
      await hideComment(commentId);
      await loadComments();
    } catch (err) {
      alert('Hide failed: ' + err.message);
    }
  }

  async function handleShowComment(commentId) {
    try {
      await showComment(commentId);
      await loadComments();
    } catch (err) {
      alert('Show failed: ' + err.message);
    }
  }

  refreshCommentsBtn?.addEventListener('click', loadComments);

  await loadComments();

  // ---- Sidebar navigation (show/hide sections) ----
  const sections = ['create-post', 'posts-list', 'page-logs', 'messaging-section', 'analytics-section', 'ads-section', 'manage-section', 'ai-scheduler-section', 'page-profile-section', 'admin-section'];
  document.querySelectorAll('#page-nav a').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) {
          el.style.display = (sec === page || sec + '-section' === page + '-section') ? 'block' : 'none';
        }
      });
    });
  });

  // Helper to escape HTML (consistent with other files)
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
