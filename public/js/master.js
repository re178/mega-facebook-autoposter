// master.js – Final version: Unified API, Skeleton Loaders, Plan Badge, Activity Feed
document.addEventListener('DOMContentLoaded', async () => {
    const summaryContainer = document.getElementById('summary-cards');
    const logsContainer = document.getElementById('recent-logs');
    const pageStatsBody = document.getElementById('page-stats-body');
    const progressBar = document.getElementById('loading-progress');
    const progressText = document.getElementById('loading-text');
    const planBadge = document.getElementById('planBadge');

    if (!summaryContainer || !logsContainer || !pageStatsBody) {
        console.error('Dashboard containers missing');
        return;
    }

    // Helper: escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // Show skeletons
    function showSkeletons() {
        summaryContainer.innerHTML = Array(4).fill(`
            <div class="card skeleton">
                <div class="skeleton-title"></div>
                <div class="skeleton-value"></div>
            </div>
        `).join('');
        pageStatsBody.innerHTML = `
            <tr><td colspan="5"><div class="skeleton-table"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div></td></tr>
        `;
        logsContainer.innerHTML = `
            <div class="skeleton-log"></div>
            <div class="skeleton-log"></div>
            <div class="skeleton-log"></div>
        `;
    }

    // Update progress
    function setProgress(step, total, label) {
        const pct = Math.round((step / total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressText) progressText.textContent = label;
    }

    showSkeletons();
    setProgress(0, 4, 'Loading dashboard...');

    try {
        setProgress(1, 4, 'Fetching summary data...');
        // Use the new unified endpoint (must be implemented on backend)
        const summary = await getMasterSummary(); // from dashboard-api.js

        setProgress(2, 4, 'Rendering stats...');
        // Render summary cards
        summaryContainer.innerHTML = '';
        const cards = [
            { title: 'Total Pages', value: summary.pages?.length || 0 },
            { title: 'Total Posts', value: summary.totalStats?.totalPosts || 0 },
            { title: 'Posted', value: summary.totalStats?.posted || 0 },
            { title: 'Failed', value: summary.totalStats?.failed || 0 }
        ];
        cards.forEach(card => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3>${escapeHtml(card.title)}</h3><div class="value">${card.value}</div>`;
            summaryContainer.appendChild(div);
        });

        // Render per-page stats
        const pageStats = summary.perPageStats || [];
        pageStatsBody.innerHTML = '';
        if (pageStats.length === 0) {
            pageStatsBody.innerHTML = '<tr><td colspan="5">No page data available</td></tr>';
        } else {
            pageStats.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(p.pageName)}</td>
                    <td>${p.totalPosts}</td>
                    <td>${p.posted}</td>
                    <td>${p.failed}</td>
                    <td>${p.topics}</td>
                `;
                pageStatsBody.appendChild(tr);
            });
        }

        setProgress(3, 4, 'Loading activity feed...');
        // Activity feed (replaces logs for clients)
        const activity = summary.recentActivity || [];
        logsContainer.innerHTML = '';
        if (activity.length === 0) {
            logsContainer.innerHTML = '<div class="log">No recent activity</div>';
        } else {
            activity.forEach(item => {
                const div = document.createElement('div');
                div.className = 'log';
                div.innerHTML = `<span>${escapeHtml(item.message)}</span><span>${new Date(item.time).toLocaleTimeString()}</span>`;
                logsContainer.appendChild(div);
            });
        }

        setProgress(4, 4, 'Done!');
        setTimeout(() => {
            if (progressBar) progressBar.style.opacity = '0';
        }, 500);

        // Store pages for modal
        window.pages = summary.pages || [];

        // Update user name and plan badge
        const user = await (await fetch('/api/auth/profile', { credentials: 'include' })).json().catch(() => null);
        if (user) {
            const nameEl = document.getElementById('userNameDisplay');
            if (nameEl) nameEl.textContent = user.name || user.email || 'User';
            const emailEl = document.getElementById('userEmailDisplay');
            if (emailEl) emailEl.textContent = user.email || 'Account';
            if (planBadge) {
                const plan = user.subscription?.plan || 'free';
                planBadge.className = `badge-${plan}`;
                planBadge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
            }
            // Also update wallet balance if needed
            const balanceEl = document.getElementById('walletBalanceDisplay');
            if (balanceEl) balanceEl.textContent = (user.walletBalance || 0).toFixed(2);
            const phoneDisplay = document.getElementById('registeredPhoneDisplay');
            if (phoneDisplay) {
                phoneDisplay.textContent = user.phone ? `(${user.phone})` : '⚠️ Update phone';
            }
            document.getElementById('userId').value = user._id;
            document.getElementById('userPhone').value = user.phone || '';
        }

    } catch (err) {
        console.error('Dashboard load error:', err);
        summaryContainer.innerHTML = '<div class="error">Failed to load dashboard. Please refresh.</div>';
        logsContainer.innerHTML = '<div class="log">Error loading activity</div>';
    }

    // ========== Pages modal ==========
    const pageNavLink = document.querySelector('.nav a[data-page="page"]');
    if (pageNavLink) {
        let pageModal = document.getElementById('page-select-modal');
        if (!pageModal) {
            pageModal = document.createElement('div');
            pageModal.id = 'page-select-modal';
            pageModal.style.cssText = `
                display:none; position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(0,0,0,0.3); justify-content:center; align-items:center; z-index:1000;
            `;
            pageModal.innerHTML = `
                <div style="background:white; padding:20px; border-radius:12px; max-width:400px; width:90%;">
                    <h3 style="margin-top:0; color:#0f172a;">Select a Page</h3>
                    <select id="page-select" style="width:100%; padding:8px; border-radius:6px; margin-bottom:12px; border:1px solid #e2e8f0;"></select>
                    <div style="text-align:right;">
                        <button id="page-cancel" class="btn btn-secondary" style="margin-right:6px;">Cancel</button>
                        <button id="page-go" class="btn btn-primary">Go</button>
                    </div>
                </div>
            `;
            document.body.appendChild(pageModal);
        }

        pageNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            const pages = window.pages || [];
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
        });
    }

    // Auto-refresh
    let refreshInterval = setInterval(() => {
        if (!document.hidden) location.reload();
    }, 60000);
    window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(refreshInterval);
        else refreshInterval = setInterval(() => location.reload(), 60000);
    });
});
