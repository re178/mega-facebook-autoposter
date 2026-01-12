document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');
  // === Load pages for navigation ===
let pages = [];
try {
  const res = await fetch('/api/pages');
  pages = await res.json();
} catch (err) {
  console.error('Failed to load pages', err);
}

  // Fetch and display master summary
  const summary = await getMasterSummary();

  // Clear containers
  summaryContainer.innerHTML = '';
  logsContainer.innerHTML = '';

  // === Display Stats Cards ===
  const cards = [
    { title: 'Total Pages', value: summary.totalPages },
    { title: 'Total Posts', value: summary.totalPosts },
    { title: 'Posted', value: summary.posted },
    { title: 'Failed', value: summary.failed }
  ];

  cards.forEach(card => {
    const div = document.createElement('div');
    div.classList.add('card');
    div.innerHTML = `
      <h3>${card.title}</h3>
      <div class="value">${card.value}</div>
    `;
    summaryContainer.appendChild(div);
  });

  // === Display Recent Logs ===
  summary.recentLogs.forEach(log => {
    const logDiv = document.createElement('div');
    logDiv.classList.add('log');
    logDiv.innerHTML = `
      <span>${log.pageId ? log.pageId.name + ': ' : ''}${log.action} - ${log.message}</span>
      <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
    `;
    logsContainer.appendChild(logDiv);
  });

  // === Sidebar navigation click handler ===
document.querySelectorAll('.nav a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();

    // only handle page dashboard navigation
    if (!pages.length) {
      alert('No pages available');
      return;
    }

    // default: open first page (can be improved later)
    const selectedPage = pages[0];

    if (!selectedPage.pageId) {
      alert('Invalid page selected');
      return;
    }

    window.location.href = `/page?pageId=${selectedPage.pageId}`;
  });
});
