// page.js – Page dashboard with plan-aware features
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId');

  if (!pageId) {
    alert('Page ID not provided in URL');
    return;
  }

  // DOM elements
  const pageTitle = document.getElementById('page-title');
  const postsTableBody = document.getElementById('posts-table-body');
  const logsContainer = document.getElementById('logs-container');
  const postText = document.getElementById('post-text');
  const mediaUrl = document.getElementById('media-url');
  const scheduledTime = document.getElementById('scheduled-time');
  const postNowBtn = document.getElementById('post-now');
  const savePostBtn = document.getElementById('save-post');
  const deletePostBtn = document.getElementById('delete-post');

  let currentEditingPostId = null;

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function showLoading(container, isLoading = true) {
    if (!container) return;
    if (isLoading) {
      container.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    }
  }

  // Fetch page info
  try {
    const page = await getPageInfo(pageId);
    pageTitle.textContent = escapeHtml(page.name);
    document.getElementById('pageNameDisplay').textContent = escapeHtml(page.name);
    document.getElementById('pageIdDisplay').textContent = pageId;
  } catch (err) {
    console.error('Failed to load page info:', err);
    pageTitle.textContent = 'Error loading page';
  }

  // Load posts
  async function loadPosts() {
    if (!postsTableBody) return;
    showLoading(postsTableBody, true);
    try {
      const posts = await getPagePosts(pageId);
      postsTableBody.innerHTML = '';
      if (!posts.length) {
        postsTableBody.innerHTML = '<tr><td colspan="5">No posts found</td></tr>';
        return;
      }
      posts.forEach(post => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(post.text || '')}</td>
          <td>${escapeHtml(post.mediaUrl || '-')}</td>
          <td>${new Date(post.scheduledTime).toLocaleString()}</td>
          <td>${escapeHtml(post.status || 'scheduled')}</td>
          <td>
            <button class="edit-post btn btn-secondary btn-sm" data-id="${post._id}">Edit</button>
            <button class="delete-post btn btn-danger btn-sm" data-id="${post._id}">Delete</button>
          </td>
        `;
        postsTableBody.appendChild(tr);
      });
      document.querySelectorAll('.delete-post').forEach(btn => {
        btn.removeEventListener('click', handleDeletePost);
        btn.addEventListener('click', handleDeletePost);
      });
      document.querySelectorAll('.edit-post').forEach(btn => {
        btn.removeEventListener('click', handleEditPost);
        btn.addEventListener('click', handleEditPost);
      });
    } catch (err) {
      console.error('Failed to load posts:', err);
      postsTableBody.innerHTML = '<tr><td colspan="5">Error loading posts. Please refresh.</td></tr>';
    }
  }

  async function handleDeletePost(e) {
    const postId = e.currentTarget.dataset.id;
    if (!confirm('Delete this post?')) return;
    try {
      await deletePost(postId);
      await loadPosts();
      if (currentEditingPostId === postId) resetForm();
      showToast('Post deleted', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  async function handleEditPost(e) {
    const postId = e.currentTarget.dataset.id;
    try {
      const posts = await getPagePosts(pageId);
      const post = posts.find(p => p._id === postId);
      if (!post) throw new Error('Post not found');
      postText.value = post.text || '';
      mediaUrl.value = post.mediaUrl || '';
      if (post.scheduledTime) {
        const dt = new Date(post.scheduledTime);
        scheduledTime.value = dt.toISOString().slice(0, 16);
      } else {
        scheduledTime.value = '';
      }
      currentEditingPostId = postId;
      savePostBtn.textContent = 'Update Post';
      if (deletePostBtn) deletePostBtn.style.display = 'inline-block';
    } catch (err) {
      showToast('Failed to load post for editing: ' + err.message, 'error');
    }
  }

  function resetForm() {
    postText.value = '';
    mediaUrl.value = '';
    scheduledTime.value = '';
    currentEditingPostId = null;
    savePostBtn.textContent = 'Save Post';
    if (deletePostBtn) deletePostBtn.style.display = 'none';
  }

  async function saveOrUpdatePost(scheduledTimestamp) {
    if (!postText.value.trim()) {
      showToast('Please enter post text', 'warning');
      return;
    }
    try {
      if (currentEditingPostId) {
        await editPost(currentEditingPostId, {
          text: postText.value,
          mediaUrl: mediaUrl.value,
          scheduledTime: scheduledTimestamp
        });
        resetForm();
        showToast('Post updated', 'success');
      } else {
        await createPost(pageId, postText.value, mediaUrl.value, scheduledTimestamp);
        resetForm();
        showToast('Post saved', 'success');
      }
      await loadPosts();
    } catch (err) {
      showToast('Operation failed: ' + err.message, 'error');
    }
  }

  postNowBtn.addEventListener('click', async () => {
    const now = new Date().toISOString();
    await saveOrUpdatePost(now);
  });

  savePostBtn.addEventListener('click', async () => {
    const schedule = scheduledTime.value ? new Date(scheduledTime.value).toISOString() : new Date().toISOString();
    await saveOrUpdatePost(schedule);
  });

  if (deletePostBtn) {
    deletePostBtn.style.display = 'none';
    deletePostBtn.addEventListener('click', async () => {
      if (!currentEditingPostId) return;
      if (!confirm('Delete this post?')) return;
      try {
        await deletePost(currentEditingPostId);
        resetForm();
        await loadPosts();
        showToast('Post deleted', 'success');
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  }

  // Load logs (activity feed)
  async function loadLogs() {
    if (!logsContainer) return;
    logsContainer.innerHTML = '<div class="log">Loading activity...</div>';
    try {
      const logs = await getPageLogs(pageId);
      logsContainer.innerHTML = '';
      if (!logs.length) {
        logsContainer.innerHTML = '<div class="log">No recent activity</div>';
        return;
      }
      logs.forEach(log => {
        const div = document.createElement('div');
        div.classList.add('log');
        div.innerHTML = `<span>${escapeHtml(log.action)} - ${escapeHtml(log.message)}</span>
                         <span>${new Date(log.createdAt).toLocaleString()}</span>`;
        logsContainer.appendChild(div);
      });
    } catch (err) {
      console.error('Failed to load logs:', err);
      logsContainer.innerHTML = '<div class="log">Error loading activity</div>';
    }
  }

  await loadPosts();
  await loadLogs();

  // Auto-refresh
  let refreshInterval = null;
  function startRefreshInterval() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
      if (!document.hidden) {
        await loadPosts();
        await loadLogs();
      }
    }, 30000);
  }
  function stopRefreshInterval() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
  startRefreshInterval();
  window.addEventListener('beforeunload', () => stopRefreshInterval());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRefreshInterval();
    } else {
      startRefreshInterval();
      loadPosts();
      loadLogs();
    }
  });

  // Sidebar toggle
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("overlay");
  const layout = document.querySelector(".layout");

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle("active");
        overlay.classList.toggle("active");
      } else {
        layout.classList.toggle("collapsed");
      }
    });
  }
  if (overlay) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    });
  }
});
