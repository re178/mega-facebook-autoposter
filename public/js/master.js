document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');

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
      const page = e.target.dataset.page;
      // Placeholder: You can later redirect to page.html?pageId=xxx
      e.preventDefault();

if (!page) return;

// navigate to real backend route
window.location.href = `/${page}`;
    });
  });
});

