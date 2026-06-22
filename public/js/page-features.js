// page-features.js – Messaging, Analytics, Ads, Comments with plan gating
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');

  if (!pageId) {
    console.warn('No pageId provided');
    return;
  }

  // Check user plan from global
  const userPlan = window.userPlan || 'free';
  function canAccess(feature) {
    // Use the same FEATURES matrix from session.js if available, else simple
    const planLevel = { free: 0, pro: 1, enterprise: 2 };
    const required = {
      'messaging': { free: true, pro: true, enterprise: true },
      'analytics': { free: true, pro: true, enterprise: true },
      'ads': { free: false, pro: true, enterprise: true },
      'comments': { free: false, pro: true, enterprise: true },
    };
    return required[feature] && required[feature][userPlan] === true;
  }

  function showUpgradePrompt(container, featureName) {
    if (!container) return;
    container.innerHTML = `
      <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:16px; border-radius:6px;">
        <p style="margin:0; color:#78350f;"><strong>🔒 ${featureName} requires Pro plan</strong></p>
        <p style="margin:4px 0 0; font-size:14px; color:#92400e;">Upgrade to unlock this feature.</p>
        <button class="btn btn-warning" onclick="showUpgradeModal()" style="margin-top:8px;">Upgrade Now</button>
      </div>
    `;
  }

  function showLoading(container, text = 'Loading...') {
    if (!container) return;
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">${text}</div>`;
  }

  function showFriendlyMessage(container, type, title, message, retryCallback = null) {
    if (!container) return;
    const icons = { info: '📭', warning: '⚠️', error: '🔌', success: '✅' };
    container.innerHTML = `
      <div style="background:${type === 'error' ? '#fef2f2' : '#f0fdf4'}; border-left:4px solid ${type === 'error' ? '#f97316' : '#10b981'}; padding:12px; border-radius:6px;">
        <strong>${title}</strong>
        <p style="margin:4px 0 0; font-size:14px;">${message}</p>
        ${retryCallback ? `<button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="(${retryCallback.toString()})()">Try Again</button>` : ''}
      </div>
    `;
  }

  // ---- MESSAGING ----
  const messagesTableBody = document.getElementById('messages-table-body');
  const templatesTableBody = document.getElementById('templates-table-body');
  const refreshMessagesBtn = document.getElementById('refresh-messages');
  const addTemplateBtn = document.getElementById('add-template');

  if (messagesTableBody) {
    if (canAccess('messaging')) {
      await loadMessages();
      await loadTemplates();
      refreshMessagesBtn?.addEventListener('click', loadMessages);
      addTemplateBtn?.addEventListener('click', () => alert('Add template flow here'));
    } else {
      showUpgradePrompt(messagesTableBody.closest('.card'), 'Messaging');
    }
  }

  async function loadMessages() {
    if (!messagesTableBody) return;
    showLoading(messagesTableBody, 'Loading messages...');
    try {
      const messages = await getPageMessages(pageId);
      if (!Array.isArray(messages)) throw new Error('Invalid data');
      if (messages.length === 0) {
        showFriendlyMessage(messagesTableBody, 'info', 'No messages', 'Inbox is empty.');
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
          <td><button class="reply-msg-btn btn btn-secondary btn-sm" data-msg-id="${msgId}">Reply</button></td>
        `;
        messagesTableBody.appendChild(tr);
      });
      messagesTableBody.querySelectorAll('.reply-msg-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const msgId = btn.dataset.msgId;
          await handleReplyMessage(msgId);
        });
      });
    } catch (error) {
      showFriendlyMessage(messagesTableBody, 'error', 'Error', error.message, loadMessages);
    }
  }

  async function handleReplyMessage(messageId) {
    const replyText = prompt('Enter reply:');
    if (!replyText) return;
    try {
      await sendMessage(pageId, messageId, replyText);
      await loadMessages();
      showToast('Reply sent', 'success');
    } catch (err) {
      showToast('Failed to send reply: ' + err.message, 'error');
    }
  }

  async function loadTemplates() {
    if (!templatesTableBody) return;
    showLoading(templatesTableBody, 'Loading templates...');
    try {
      const templates = await getTemplates(pageId);
      if (!Array.isArray(templates)) throw new Error('Invalid data');
      if (templates.length === 0) {
        showFriendlyMessage(templatesTableBody, 'info', 'No templates', 'Create auto‑reply templates.');
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
            <button class="edit-template-btn btn btn-secondary btn-sm" data-id="${templateId}">Edit</button>
            <button class="delete-template-btn btn btn-danger btn-sm" data-id="${templateId}">Delete</button>
          </td>
        `;
        templatesTableBody.appendChild(tr);
      });
      templatesTableBody.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', () => handleEditTemplate(btn.dataset.id));
      });
      templatesTableBody.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteTemplate(btn.dataset.id));
      });
    } catch (error) {
      showFriendlyMessage(templatesTableBody, 'error', 'Error', error.message, loadTemplates);
    }
  }

  async function handleEditTemplate(templateId) {
    const newName = prompt('Enter new template name');
    if (!newName) return;
    // Implement full edit if needed
    showToast('Template edit not fully implemented', 'info');
  }

  async function handleDeleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate(templateId);
      await loadTemplates();
      showToast('Template deleted', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  // ---- ANALYTICS ----
  const chartsContainer = document.getElementById('charts-container');
  const refreshAnalyticsBtn = document.getElementById('refresh-analytics');
  const downloadReportBtn = document.getElementById('download-report');

  if (chartsContainer) {
    if (canAccess('analytics')) {
      await loadAnalytics();
      refreshAnalyticsBtn?.addEventListener('click', loadAnalytics);
      downloadReportBtn?.addEventListener('click', downloadReportHandler);
    } else {
      showUpgradePrompt(chartsContainer.closest('.card'), 'Analytics');
    }
  }

  async function loadAnalytics() {
    if (!chartsContainer) return;
    showLoading(chartsContainer, 'Loading analytics...');
    try {
      const data = await getPageInsights(pageId);
      if (!data) throw new Error('No data');
      chartsContainer.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px,1fr)); gap:16px;">
          <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#10b981;">${data.likes || 0}</div>
            <div style="font-size:14px; color:#64748b;">Likes</div>
          </div>
          <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#10b981;">${data.comments || 0}</div>
            <div style="font-size:14px; color:#64748b;">Comments</div>
          </div>
          <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#10b981;">${data.shares || 0}</div>
            <div style="font-size:14px; color:#64748b;">Shares</div>
          </div>
        </div>
      `;
    } catch (error) {
      showFriendlyMessage(chartsContainer, 'error', 'Error', error.message, loadAnalytics);
    }
  }

  async function downloadReportHandler() {
    try {
      const blob = await downloadReport(pageId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `page-${pageId}-report.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
    } catch (err) {
      showToast('Could not download report: ' + err.message, 'error');
    }
  }

  // ---- ADS ----
  const adsTableBody = document.getElementById('ads-table-body');
  const refreshAdsBtn = document.getElementById('refresh-ads');
  const createAdBtn = document.getElementById('create-ad');

  if (adsTableBody) {
    if (canAccess('ads')) {
      await loadAds();
      refreshAdsBtn?.addEventListener('click', loadAds);
      createAdBtn?.addEventListener('click', () => alert('Create ad flow here'));
    } else {
      showUpgradePrompt(adsTableBody.closest('.card'), 'Ads');
    }
  }

  async function loadAds() {
    if (!adsTableBody) return;
    showLoading(adsTableBody, 'Loading ads...');
    try {
      const ads = await getPageAds(pageId);
      if (!Array.isArray(ads)) throw new Error('Invalid data');
      if (ads.length === 0) {
        showFriendlyMessage(adsTableBody, 'info', 'No campaigns', 'Create your first ad.');
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
            <button class="edit-ad-btn btn btn-secondary btn-sm" data-id="${adId}">Edit</button>
            <button class="delete-ad-btn btn btn-danger btn-sm" data-id="${adId}">Delete</button>
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
      showFriendlyMessage(adsTableBody, 'error', 'Error', error.message, loadAds);
    }
  }

  async function handleEditAd(adId) {
    const newBudget = prompt('Enter new budget (USD)');
    if (newBudget === null) return;
    try {
      await editAd(adId, { budget: parseFloat(newBudget) });
      await loadAds();
      showToast('Ad updated', 'success');
    } catch (err) {
      showToast('Edit failed: ' + err.message, 'error');
    }
  }

  async function handleDeleteAd(adId) {
    if (!confirm('Delete this ad campaign?')) return;
    try {
      await deleteAd(adId);
      await loadAds();
      showToast('Ad deleted', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  // ---- COMMENTS ----
  const commentsTableBody = document.getElementById('comments-table-body');
  const refreshCommentsBtn = document.getElementById('refresh-comments');

  if (commentsTableBody) {
    if (canAccess('comments')) {
      await loadComments();
      refreshCommentsBtn?.addEventListener('click', loadComments);
    } else {
      showUpgradePrompt(commentsTableBody.closest('.card'), 'Comments & Moderation');
    }
  }

  async function loadComments() {
    if (!commentsTableBody) return;
    showLoading(commentsTableBody, 'Loading comments...');
    try {
      const comments = await getPageComments(pageId);
      if (!Array.isArray(comments)) throw new Error('Invalid data');
      if (comments.length === 0) {
        showFriendlyMessage(commentsTableBody, 'info', 'No comments', 'No comments yet.');
        return;
      }
      commentsTableBody.innerHTML = '';
      comments.forEach(c => {
        const commentId = c.id || c._id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(c.user || c.senderName || 'Unknown')}</td>
          <td>${escapeHtml(c.comment || c.message || '')}</td>
          <td>${escapeHtml(c.post || '')}</td>
          <td>${new Date(c.time || c.createdAt).toLocaleString()}</td>
          <td>
            <button class="reply-comment-btn btn btn-secondary btn-sm" data-id="${commentId}">Reply</button>
            <button class="hide-comment-btn btn btn-secondary btn-sm" data-id="${commentId}">Hide</button>
            <button class="show-comment-btn btn btn-secondary btn-sm" data-id="${commentId}">Show</button>
          </td>
        `;
        commentsTableBody.appendChild(tr);
      });
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
      showFriendlyMessage(commentsTableBody, 'error', 'Error', error.message, loadComments);
    }
  }

  async function handleReplyComment(commentId) {
    const text = prompt('Reply to comment:');
    if (!text) return;
    try {
      await replyComment(commentId, text);
      await loadComments();
      showToast('Reply sent', 'success');
    } catch (err) {
      showToast('Reply failed: ' + err.message, 'error');
    }
  }

  async function handleHideComment(commentId) {
    try {
      await hideComment(commentId);
      await loadComments();
      showToast('Comment hidden', 'success');
    } catch (err) {
      showToast('Hide failed: ' + err.message, 'error');
    }
  }

  async function handleShowComment(commentId) {
    try {
      await showComment(commentId);
      await loadComments();
      showToast('Comment shown', 'success');
    } catch (err) {
      showToast('Show failed: ' + err.message, 'error');
    }
  }

  // ---- Sidebar Navigation ----
  const sections = ['overview', 'create-post', 'posts-list', 'page-logs', 'messaging-section', 'analytics-section', 'ads-section', 'manage-section', 'ai-scheduler-section', 'page-profile-section', 'admin-section'];
  document.querySelectorAll('#page-nav a').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) {
          el.style.display = (sec === page || sec + '-section' === page) ? 'block' : 'none';
        }
      });
      // Highlight active
      document.querySelectorAll('#page-nav a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Helper escape
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
})();
