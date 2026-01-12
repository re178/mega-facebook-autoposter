const API_BASE = '/api/dashboard';

document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');
  const nav = document.querySelector('.nav');

  if (!summaryContainer || !logsContainer || !nav) {
    console.error('Dashboard containers missing');
    return;
  }

  // === Fetch all pages for sidebar navigation ===
  let pages = [];
  try {
    const res = await fetch(`${API_BASE}/pages`);
    pages = await res.json();
  } catch (err) {
    console.error('Failed to load pages', err);
  }

  // === Fetch master summary ===
  let summary;
  try {
    summary = await fetch(`${API_BASE}/master/summary`).then(r => r.json());
  } catch (err) {
    console.error('Failed to load summary', err);
    return;
  }

  // === Clear containers ===
  summaryContainer.innerHTML = '';
  logsContainer.innerHTML = '';

  // === Display Stats Cards ===
  const cards = [
    { title: 'Total Pages', value: summary.totalPages ?? 0 },
    { title: 'Total Posts', value: summary.totalPosts ?? 0 },
    { title: 'Posted', value: summary.posted ?? 0 },
    { title: 'Failed', value: summary.failed ?? 0 }
  ];

  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <h3>${card.title}</h3>
      <div class="value">${card.value}</div>
    `;
    summaryContainer.appendChild(div);
  });

  // === Display Recent Logs ===
  if (Array.isArray(summary.recentLogs)) {
    summary.recentLogs.forEach(log => {
      const logDiv = document.createElement('div');
      logDiv.className = 'log';
      logDiv.innerHTML = `
        <span>${log.pageId?.name ? log.pageId.name + ': ' : ''}${log.action} - ${log.message}</span>
        <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
      `;
      logsContainer.appendChild(logDiv);
    });
  }

  // === Sidebar Navigation: Pages ===
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', e => {
      const target = link.dataset.page;

      if (target === 'page' || target === 'pages') {
        e.preventDefault();

        if (!pages.length) {
          alert('No pages available');
          return;
        }

        // If multiple pages, you could show a selection prompt here
        // For now, redirect to first page
        const firstPageId = pages[0].pageId;
        window.location.href = `/page?pageId=${firstPageId}`;
      }
    });
  });
});
