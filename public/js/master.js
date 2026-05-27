// master.js – Fixed pages modal and per‑page stats
document.addEventListener('DOMContentLoaded', async () => {
    const summaryContainer = document.getElementById('summary-cards');
    const logsContainer = document.getElementById('recent-logs');
    const pageStatsContainer = document.getElementById('page-stats-container');

    if (!summaryContainer || !logsContainer || !pageStatsContainer) {
        console.error('Dashboard containers missing');
        return;
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

    async function apiFetch(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (res.status === 401) window.location.href = '/login';
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // Load pages list
    let pages = [];
    try {
        pages = await apiFetch('/api/dashboard/pages');
        if (!Array.isArray(pages)) pages = [];
    } catch (err) {
        console.error('Failed to load pages:', err);
        pageStatsContainer.innerHTML = '<div class="error">Could not load pages</div>';
    }

    // Aggregate stats per page
    let totalPosts = 0, posted = 0, failed = 0, totalTopics = 0;
    const pageStats = [];

    for (const page of pages) {
        const facebookPageId = page.pageId; // important: Facebook page ID, not Mongo _id
        if (!facebookPageId) continue;

        try {
            const [manualPosts, aiPosts, topics] = await Promise.all([
                apiFetch(`/api/dashboard/page/${facebookPageId}/posts`).catch(() => []),
                apiFetch(`/api/ai/page/${facebookPageId}/upcoming-posts`).catch(() => []),
                apiFetch(`/api/ai/page/${facebookPageId}/topics`).catch(() => [])
            ]);

            const manualCount = Array.isArray(manualPosts) ? manualPosts.length : 0;
            const aiCount = Array.isArray(aiPosts) ? aiPosts.length : 0;
            const postedCount = (manualPosts?.filter(p => p.status === 'POSTED').length || 0) +
                                (aiPosts?.filter(p => p.status === 'POSTED').length || 0);
            const failedCount = (manualPosts?.filter(p => p.status === 'FAILED').length || 0) +
                                (aiPosts?.filter(p => p.status === 'FAILED').length || 0);
            const topicsCount = Array.isArray(topics) ? topics.length : 0;

            totalPosts += manualCount + aiCount;
            posted += postedCount;
            failed += failedCount;
            totalTopics += topicsCount;

            pageStats.push({
                name: page.name,
                totalPosts: manualCount + aiCount,
                posted: postedCount,
                failed: failedCount,
                totalTopics: topicsCount
            });
        } catch (err) {
            console.warn(`Failed to load data for page ${facebookPageId}`, err);
        }
    }

    // Render summary cards
    summaryContainer.innerHTML = '';
    const cards = [
        { title: 'Total Pages', value: pages.length },
        { title: 'Total Posts', value: totalPosts },
        { title: 'Posted', value: posted },
        { title: 'Failed', value: failed },
        { title: 'Total Topics', value: totalTopics }
    ];
    cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<h3>${escapeHtml(card.title)}</h3><div class="value">${card.value}</div>`;
        summaryContainer.appendChild(div);
    });

    // Render per-page statistics table
    pageStatsContainer.innerHTML = `
        <h3>Per-Page Statistics</h3>
        <div class="table-wrapper">
            <table class="page-stats-table" style="width:100%; border-collapse:collapse;">
                <thead><tr><th>Page Name</th><th>Total Posts</th><th>Posted</th><th>Failed</th><th>Total Topics</th></tr></thead>
                <tbody id="page-stats-body"></tbody>
            </table>
        </div>
    `;
    const statsBody = document.getElementById('page-stats-body');
    if (statsBody) {
        statsBody.innerHTML = pageStats.map(p => `
            <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${p.totalPosts}</td>
                <td>${p.posted}</td>
                <td>${p.failed}</td>
                <td>${p.totalTopics}</td>
            </tr>
        `).join('');
        if (pageStats.length === 0) statsBody.innerHTML = '<tr><td colspan="5">No page data available</td></tr>';
    }

    // Load recent logs (same as before, simplified)
    async function loadRecentLogs() {
        try {
            const summary = await apiFetch('/api/dashboard/master/summary');
            const logs = summary.recentLogs || [];
            logsContainer.innerHTML = '';
            if (logs.length === 0) {
                logsContainer.innerHTML = '<div class="log">No recent logs</div>';
                return;
            }
            logs.forEach(log => {
                const div = document.createElement('div');
                div.className = 'log';
                div.innerHTML = `<span>${escapeHtml(log.action)} - ${escapeHtml(log.message)}</span><span>${new Date(log.createdAt).toLocaleTimeString()}</span>`;
                logsContainer.appendChild(div);
            });
        } catch (err) {
            logsContainer.innerHTML = '<div class="log">Error loading logs</div>';
        }
    }
    await loadRecentLogs();

    // ========== Pages modal (fixes "no page id provided") ==========
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
                opt.value = p.pageId;   // ✅ Facebook page ID
                opt.textContent = p.name;
                select.appendChild(opt);
            });
            pageModal.style.display = 'flex';
        });

        pageModal.querySelector('#page-cancel').onclick = () => pageModal.style.display = 'none';
        pageModal.querySelector('#page-go').onclick = () => {
            const selectedPageId = pageModal.querySelector('#page-select').value;
            if (!selectedPageId) {
                alert('Please select a page');
                return;
            }
            pageModal.style.display = 'none';
            window.location.href = `/pages?pageId=${encodeURIComponent(selectedPageId)}`;
        };
    }

    // ========== Auto-refresh every 60 seconds ==========
    let refreshInterval = setInterval(async () => {
        if (!document.hidden) location.reload();
    }, 60000);
    window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(refreshInterval);
        else refreshInterval = setInterval(() => location.reload(), 60000);
    });
});
