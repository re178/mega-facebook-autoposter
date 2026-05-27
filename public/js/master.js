// master.js – Main dashboard (summary cards, per‑page stats, recent logs)
// Assumes: global apiFetch is available (from fixed api.js)
//          CSRF meta tag is present in HTML

document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');
  const pageStatsContainer = document.getElementById('page-stats-container');

  if (!summaryContainer || !logsContainer || !pageStatsContainer) {
    console.error('Dashboard containers missing');
    return;
  }

  // Helper: escape HTML (prevent XSS)
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Show loading / error states
  function showLoading(container, isLoading = true) {
    if (!container) return;
    if (isLoading) {
      container.innerHTML = '<div class="loading">Loading...</div>';
    } else {
      const errorDiv = container.querySelector('.error');
      if (errorDiv) errorDiv.remove();
    }
  }

  function showError(container, message) {
    if (!container) return;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    container.appendChild(errorDiv);
  }

  // ========== Load all pages and aggregate stats ==========
  let pages = [];
  try {
    pages = await window.apiFetch ? window.apiFetch('/api/dashboard/pages') : await fetch('/api/dashboard/pages').then(r => r.json());
    if (!Array.isArray(pages)) pages = [];
  } catch (err) {
    console.error('Failed to load pages:', err);
    showError(pageStatsContainer, 'Could not load page list.');
  }

  // Aggregate stats
  let totalPosts = 0, posted = 0, failed = 0, totalTopicsAll = 0;
  const pageStats = [];

  // Process pages in parallel (much faster)
  const pagePromises = pages.map(async (page) => {
    const pageId = page.pageId || page._id;
    if (!pageId) return null;

    try {
      // Use parallel requests for each page
      const [manualPosts, aiPosts, topics] = await Promise.all([
        window.apiFetch ? window.apiFetch(`/api/dashboard/page/${pageId}/posts`) : fetch(`/api/dashboard/page/${pageId}/posts`).then(r => r.json()),
        window.apiFetch ? window.apiFetch(`/api/ai/page/${pageId}/upcoming-posts`) : fetch(`/api/ai/page/${pageId}/upcoming-posts`).then(r => r.json()),
        window.apiFetch ? window.apiFetch(`/api/ai/page/${pageId}/topics`) : fetch(`/api/ai/page/${pageId}/topics`).then(r => r.json())
      ]).catch(err => {
        console.warn(`Failed to load data for page ${pageId}`, err);
        return [[], [], []];
      });

      const manualCount = Array.isArray(manualPosts) ? manualPosts.length : 0;
      const aiCount = Array.isArray(aiPosts) ? aiPosts.length : 0;
      const postedCount = (manualPosts?.filter(p => p.status === 'posted').length || 0) +
                          (aiPosts?.filter(p => p.status === 'posted').length || 0);
      const failedCount = (manualPosts?.filter(p => p.status === 'failed').length || 0) +
                          (aiPosts?.filter(p => p.status === 'failed').length || 0);
      const topicsCount = Array.isArray(topics) ? topics.length : 0;

      return {
        name: page.name,
        totalPosts: manualCount + aiCount,
        posted: postedCount,
        failed: failedCount,
        totalTopics: topicsCount,
        manualCount,
        aiCount
      };
    } catch (err) {
      return null;
    }
  });

  const results = await Promise.all(pagePromises);
  for (const stat of results) {
    if (stat) {
      totalPosts += stat.totalPosts;
      posted += stat.posted;
      failed += stat.failed;
      totalTopicsAll += stat.totalTopics;
      pageStats.push(stat);
    }
  }

  // ========== Render summary cards ==========
  summaryContainer.innerHTML = '';
  const cards = [
    { title: 'Total Pages', value: pages.length },
    { title: 'Total Posts', value: totalPosts },
    { title: 'Posted', value: posted },
    { title: 'Failed', value: failed },
    { title: 'Total Topics', value: totalTopicsAll }
  ];

  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <h3>${escapeHtml(card.title)}</h3>
      <div class="value">${card.value}</div>
    `;
    summaryContainer.appendChild(div);
  });

  // ========== Render per‑page statistics table ==========
  pageStatsContainer.innerHTML = `
    <h3>Per-Page Statistics</h3>
    <div class="table-wrapper">
      <table class="page-stats-table" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#0b1220; color:#fff;">
            <th style="padding:8px;">Page Name</th>
            <th>Total Posts</th>
            <th>Posted</th>
            <th>Failed</th>
            <th>Total Topics</th>
          </tr>
        </thead>
        <tbody id="page-stats-body"></tbody>
      </table>
    </div>
  `;
  const statsBody = document.getElementById('page-stats-body');
  if (statsBody) {
    statsBody.innerHTML = pageStats.map(p => `
      <tr style="background:${p.totalPosts === 0 ? '#ff4c4c33' : '#0f172a'};">
        <td style="padding:6px;">${escapeHtml(p.name)}</td>
        <td>${p.totalPosts}</td>
        <td>${p.posted}</td>
        <td>${p.failed}</td>
        <td>${p.totalTopics}</td>
      </tr>
    `).join('');
    if (pageStats.length === 0) {
      statsBody.innerHTML = '<tr><td colspan="5">No page data available</td></tr>';
    }
  }

  // ========== Load recent logs (from all pages) ==========
  async function loadRecentLogs() {
    showLoading(logsContainer, true);
    let allLogs = [];
    for (const page of pages) {
      const pageId = page.pageId || page._id;
      if (!pageId) continue;
      try {
        const logs = await (window.apiFetch ? window.apiFetch(`/api/dashboard/page/${pageId}/logs`) : fetch(`/api/dashboard/page/${pageId}/logs`).then(r => r.json()));
        if (Array.isArray(logs)) allLogs.push(...logs);
      } catch (err) {
        console.warn(`Failed to load logs for page ${pageId}`);
      }
    }
    // Sort newest first and take top 10
    allLogs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recent = allLogs.slice(0, 10);
    logsContainer.innerHTML = '';
    if (recent.length === 0) {
      logsContainer.innerHTML = '<div class="log">No recent logs</div>';
      return;
    }
    recent.forEach(log => {
      const logDiv = document.createElement('div');
      logDiv.className = 'log';
      logDiv.innerHTML = `
        <span>${escapeHtml(log.action)} - ${escapeHtml(log.message)}</span>
        <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
      `;
      logsContainer.appendChild(logDiv);
    });
  }
  await loadRecentLogs();

  // ========== Page selection modal (when clicking "Pages" nav) ==========
  const pageNavLink = document.querySelector('.nav a[data-page="page"]');
  if (pageNavLink) {
    let pageModal = document.getElementById('page-select-modal');
    if (!pageModal) {
      pageModal = document.createElement('div');
      pageModal.id = 'page-select-modal';
      pageModal.style.cssText = `
        display:none; position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.6); justify-content:center; align-items:center; z-index:1000;
      `;
      pageModal.innerHTML = `
        <div style="background:#0b1220; padding:20px; border-radius:12px; max-width:400px; width:90%;">
          <h3 style="margin-top:0; color:#fff;">Select a Page</h3>
          <select id="page-select" style="width:100%; padding:8px; border-radius:6px; margin-bottom:12px;"></select>
          <div style="text-align:right;">
            <button id="page-cancel" style="padding:6px 12px; margin-right:6px;">Cancel</button>
            <button id="page-go" style="padding:6px 12px; background:#22c55e; color:#fff;">Go</button>
          </div>
        </div>
      `;
      document.body.appendChild(pageModal);
    }

    pageNavLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pages.length) {
        alert('No pages available');
        return;
      }
      const select = pageModal.querySelector('#page-select');
      select.innerHTML = '';
      pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.pageId || p._id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
      pageModal.style.display = 'flex';

      const cancelBtn = pageModal.querySelector('#page-cancel');
      const goBtn = pageModal.querySelector('#page-go');
      const closeModal = () => { pageModal.style.display = 'none'; };
      cancelBtn.onclick = closeModal;
      goBtn.onclick = () => {
        const selectedPageId = select.value;
        closeModal();
        const url = new URL('/pages', window.location.origin);
        url.searchParams.set('pageId', selectedPageId);
        window.location.href = url.toString();
      };
    });
  }

  // ========== Responsive sidebar (unchanged, but placed once) ==========
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

  // ========== Auto‑refresh every 60 seconds (only when visible) ==========
  let refreshInterval = null;
  function startRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
      if (!document.hidden) {
        // Reload only logs and stats? Reloading everything might be heavy.
        // For simplicity, reload the whole dashboard data.
        location.reload(); // or call the functions again – but reload is safest to avoid state issues.
      }
    }, 60000);
  }
  function stopRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
  }
  startRefresh();
  window.addEventListener('beforeunload', stopRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRefresh();
    else startRefresh();
  });
});
