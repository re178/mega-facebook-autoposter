// =========================
// MASTER DASHBOARD CONTROLLER (FULL REWRITE SAFE)
// =========================

document.addEventListener('DOMContentLoaded', async () => {
  const summaryContainer = document.getElementById('summary-cards');
  const logsContainer = document.getElementById('recent-logs');

  if (!summaryContainer || !logsContainer) {
    console.error('Dashboard containers missing');
    return;
  }

  /* =====================================================
     HELPERS
  ===================================================== */

  async function safeFetch(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Request failed');
      return await res.json();
    } catch (err) {
      console.error('Fetch failed:', url);
      return [];
    }
  }

  /* =====================================================
     LOAD ALL PAGES
  ===================================================== */

  let pages = await safeFetch(`${API_BASE}/pages`);

  if (!Array.isArray(pages)) pages = [];

  /* =====================================================
     AGGREGATE POSTS ACROSS ALL PAGES
  ===================================================== */

  let totalPosts = 0;
  let posted = 0;
  let failed = 0;

  for (const page of pages) {
    const pageId = page.pageId || page._id;

    if (!pageId) continue;

    // ---- Manual Posts ----
    const manualPosts = await safeFetch(`/api/pages/${pageId}/posts`);

    if (Array.isArray(manualPosts)) {
      totalPosts += manualPosts.length;
      posted += manualPosts.filter(p => p.status === 'posted').length;
      failed += manualPosts.filter(p => p.status === 'failed').length;
    }

    // ---- AI Posts ----
    const aiPosts = await safeFetch(`/api/ai/page/${pageId}/upcoming-posts`);

    if (Array.isArray(aiPosts)) {
      totalPosts += aiPosts.length;
      posted += aiPosts.filter(p => p.status === 'posted').length;
      failed += aiPosts.filter(p => p.status === 'failed').length;
    }
  }

  /* =====================================================
     LOAD RECENT LOGS (FROM ALL PAGES)
  ===================================================== */

  let recentLogs = [];

  for (const page of pages) {
    const pageId = page.pageId || page._id;
    if (!pageId) continue;

    const logs = await safeFetch(`/api/pages/${pageId}/logs`);

    if (Array.isArray(logs)) {
      recentLogs.push(...logs);
    }
  }

  // Sort logs by newest
  recentLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  recentLogs = recentLogs.slice(0, 10);

  /* =====================================================
     RENDER SUMMARY CARDS
  ===================================================== */

  summaryContainer.innerHTML = '';

  const cards = [
    { title: 'Total Pages', value: pages.length },
    { title: 'Total Posts', value: totalPosts },
    { title: 'Posted', value: posted },
    { title: 'Failed', value: failed }
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

  /* =====================================================
     RENDER RECENT LOGS
  ===================================================== */

  logsContainer.innerHTML = '';

  recentLogs.forEach(log => {
    const logDiv = document.createElement('div');
    logDiv.className = 'log';
    logDiv.innerHTML = `
      <span>${log.action} - ${log.message}</span>
      <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
    `;
    logsContainer.appendChild(logDiv);
  });

  /* =====================================================
     PAGE SELECTION MODAL (UNCHANGED LOGIC)
  ===================================================== */

  const pageNavLink = document.querySelector('.nav a[data-page="page"]');

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
        opt.value = p.pageId || p._id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });

      pageModal.style.display = 'flex';

      pageModal.querySelector('#page-cancel').onclick = () => {
        pageModal.style.display = 'none';
      };

      pageModal.querySelector('#page-go').onclick = () => {
        const selectedPageId = select.value;
        pageModal.style.display = 'none';

        const url = new URL('/pages', window.location.origin);
        url.searchParams.set('pageId', selectedPageId);
        window.location.href = url.toString();
      };
    });
  }

});

