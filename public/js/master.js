document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');

  if (!summaryContainer || !logsContainer) {
    console.error('Dashboard containers missing');
    return;
  }

  // === Load pages for navigation ===
  let pages = [];
  try {
    const res = await fetch('/api/dashboard/pages');
    pages = await res.json();
  } catch (err) {
    console.error('Failed to load pages', err);
  }

  // === Fetch master summary ===
  let summary;
  try {
    summary = await getMasterSummary();
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

  // === Sidebar navigation (Pages Dropdown instead of auto-redirect) ===
  const pageNavLink = document.querySelector('.nav a[data-page="page"]');

  if (pageNavLink) {
    pageNavLink.addEventListener('click', e => {
      e.preventDefault();

      if (!pages.length) {
        alert('No pages available');
        return;
      }

      // Build a simple selection prompt for pages
      const pageNames = pages.map((p, idx) => `${idx + 1}: ${p.name}`).join('\n');
      const choice = prompt(`Select a page:\n${pageNames}`, '1');
      const index = parseInt(choice) - 1;

      if (isNaN(index) || index < 0 || index >= pages.length) {
        alert('Invalid selection');
        return;
      }

      const selectedPageId = pages[index].pageId;
      window.location.href = `${window.location.origin}/pages?pageId=${selectedPageId}`;
    });
  }
});
