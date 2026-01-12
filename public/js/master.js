const API_BASE = '/api/dashboard';

// =========================
// MASTER DASHBOARD API
// =========================
async function getMasterSummary() {
  const res = await fetch(`${API_BASE}/master/summary`);
  return res.json();
}

// =========================
// PAGES API
// =========================
async function getPages() {
  const res = await fetch(`${API_BASE}/pages`);
  return res.json();
}

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
    pages = await getPages();
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

  // ===============================
  // Sidebar navigation: Pages Modal
  // ===============================
  const pageNavLink = document.querySelector('.nav a[data-page="page"]');

  // create modal container
  const pageModal = document.createElement('div');
  pageModal.style = `
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

  if (pageNavLink) {
    pageNavLink.addEventListener('click', e => {
      e.preventDefault();

      if (!pages.length) {
        alert('No pages available');
        return;
      }

      const select = pageModal.querySelector('#page-select');
      select.innerHTML = '';
      pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.pageId;
        opt.textContent = p.name;
        select.appendChild(opt);
      });

      pageModal.style.display = 'flex';

      // cancel button
      pageModal.querySelector('#page-cancel').onclick = () => {
        pageModal.style.display = 'none';
      };

      // go button
      pageModal.querySelector('#page-go').onclick = () => {
        const selectedPageId = select.value;
        pageModal.style.display = 'none';
        const url = new URL('/pages', window.location.origin);
        url.searchParams.set('pageId', selectedPageId);
        window.location.href = url.toString(); // safe redirect
      };
    });
  }
});

