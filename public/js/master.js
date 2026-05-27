// master.js – Main dashboard (summary cards, per‑page stats, recent logs)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Master dashboard initializing...');
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');
  const pageStatsContainer = document.getElementById('page-stats-container');

  async function safeFetch(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadSummary() {
    try {
      const data = await safeFetch('/api/dashboard/master/summary');
      summaryContainer.innerHTML = `
        <div class="card"><h3>Total Pages</h3><div class="value">${data.totalPages || 0}</div></div>
        <div class="card"><h3>Total Posts</h3><div class="value">${data.totalPosts || 0}</div></div>
        <div class="card"><h3>Posted</h3><div class="value">${data.posted || 0}</div></div>
        <div class="card"><h3>Failed</h3><div class="value">${data.failed || 0}</div></div>
      `;
    } catch (err) {
      summaryContainer.innerHTML = '<div class="card">Error loading summary</div>';
    }
  }

  async function loadPageStats() {
    try {
      const pages = await safeFetch('/api/dashboard/pages');
      pageStatsContainer.innerHTML = `
        <h3>Per-Page Statistics</h3>
        <table><thead><tr><th>Page Name</th><th>Total Posts</th><th>Posted</th><th>Failed</th><th>Total Topics</th></tr></thead>
        <tbody id="page-stats-body"></tbody></table>
      `;
      const tbody = document.getElementById('page-stats-body');
      if (!tbody) return;
      tbody.innerHTML = '';
      for (const page of pages) {
        // For each page, get posts count (you could aggregate more)
        const posts = await safeFetch(`/api/dashboard/page/${page.pageId}/posts`).catch(() => []);
        const total = posts.length;
        const posted = posts.filter(p => p.status === 'POSTED').length;
        const failed = posts.filter(p => p.status === 'FAILED').length;
        const row = `<tr><td>${escapeHtml(page.name)}</td><td>${total}</td><td>${posted}</td><td>${failed}</td><td>0</td></tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
      }
    } catch (err) {
      pageStatsContainer.innerHTML = '<h3>Per-Page Statistics</h3><div>Error loading page stats</div>';
    }
  }

  async function loadRecentLogs() {
    try {
      const data = await safeFetch('/api/dashboard/master/summary');
      const logs = data.recentLogs || [];
      logsContainer.innerHTML = '';
      logs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log';
        div.innerHTML = `<span>${escapeHtml(log.action)} - ${escapeHtml(log.message)}</span><span>${new Date(log.createdAt).toLocaleString()}</span>`;
        logsContainer.appendChild(div);
      });
      if (!logs.length) logsContainer.innerHTML = '<div class="log">No recent logs</div>';
    } catch (err) {
      logsContainer.innerHTML = '<div class="log">Error loading logs</div>';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  await loadSummary();
  await loadPageStats();
  await loadRecentLogs();
  console.log('Master dashboard loaded');
});
