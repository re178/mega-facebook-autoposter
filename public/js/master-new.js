// master-new.js 
document.addEventListener('DOMContentLoaded', function() {
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

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

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

    function updateProgress(pct, label) {
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressText) progressText.textContent = label;
    }

    function renderStats(summary) {
        // Render summary cards
        summaryContainer.innerHTML = '';
        var cards = [
            { title: 'Total Pages', value: summary.pages ? summary.pages.length : 0 },
            { title: 'Total Posts', value: summary.totalStats ? summary.totalStats.totalPosts : 0 },
            { title: 'Posted', value: summary.totalStats ? summary.totalStats.posted : 0 },
            { title: 'Failed', value: summary.totalStats ? summary.totalStats.failed : 0 }
        ];
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = '<h3>' + escapeHtml(card.title) + '</h3><div class="value">' + card.value + '</div>';
            summaryContainer.appendChild(div);
        }

        // Render per‑page stats
        var stats = summary.perPageStats || [];
        pageStatsBody.innerHTML = '';
        if (stats.length === 0) {
            pageStatsBody.innerHTML = '<tr><td colspan="5">No page data available</td></tr>';
        } else {
            for (var j = 0; j < stats.length; j++) {
                var p = stats[j];
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + escapeHtml(p.pageName) + '</td><td>' + p.totalPosts + '</td><td>' + p.posted + '</td><td>' + p.failed + '</td><td>' + p.topics + '</td>';
                pageStatsBody.appendChild(tr);
            }
        }

        // Render activity feed
        var activity = summary.recentActivity || [];
        logsContainer.innerHTML = '';
        if (activity.length === 0) {
            logsContainer.innerHTML = '<div class="log">No recent activity</div>';
        } else {
            for (var k = 0; k < activity.length; k++) {
                var item = activity[k];
                var div = document.createElement('div');
                div.className = 'log';
                div.innerHTML = '<span>' + escapeHtml(item.message) + '</span><span>' + new Date(item.time).toLocaleTimeString() + '</span>';
                logsContainer.appendChild(div);
            }
        }

        // Store pages for the modal
        window.pages = summary.pages || [];
    }

    // ===== LOAD DASHBOARD DATA (no page reload) =====
    async function loadDashboard() {
        try {
            showSkeletons();
            updateProgress(10, 'Loading dashboard...');

            const res = await fetch('/api/dashboard/master-summary', { credentials: 'include' });
            if (!res.ok) {
                throw new Error('Server returned ' + res.status);
            }
            const summary = await res.json();

            updateProgress(70, 'Rendering dashboard...');
            renderStats(summary);
            updateProgress(100, 'Done!');
            setTimeout(function() {
                if (progressBar) progressBar.style.opacity = '0';
            }, 500);
        } catch (err) {
            console.error('Dashboard load error:', err);
            summaryContainer.innerHTML = '<div class="error">Failed to load dashboard. Please refresh.</div>';
            logsContainer.innerHTML = '<div class="log">Error loading activity</div>';
            updateProgress(100, 'Error loading');
        }
    }

    // ===== LOAD USER PROFILE =====
    async function loadUserProfile() {
        try {
            const res = await fetch('/api/auth/profile', { credentials: 'include' });
            if (!res.ok) return;
            const user = await res.json();

            const nameEl = document.getElementById('userNameDisplay');
            if (nameEl) {
                nameEl.textContent = user.name || user.email || 'User';
            }

            const emailEl = document.getElementById('userEmailDisplay');
            if (emailEl) {
                emailEl.textContent = user.email || 'Account';
            }

            if (planBadge) {
                var plan = user.subscription ? user.subscription.plan : 'free';
                planBadge.className = 'badge-' + plan;
                planBadge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
            }

            const balanceEl = document.getElementById('walletBalanceDisplay');
            if (balanceEl) {
                balanceEl.textContent = (user.walletBalance || 0).toFixed(2);
            }

            const phoneDisplay = document.getElementById('registeredPhoneDisplay');
            if (phoneDisplay) {
                phoneDisplay.textContent = user.phone ? '(' + user.phone + ')' : '⚠️ Update phone';
            }

            const userIdEl = document.getElementById('userId');
            if (userIdEl) userIdEl.value = user._id || '';

            const userPhoneEl = document.getElementById('userPhone');
            if (userPhoneEl) userPhoneEl.value = user.phone || '';
        } catch (err) {
            console.warn('Could not load user profile:', err);
        }
    }

    // ===== PAGE SELECTOR MODAL =====
    function setupPageModal() {
        var pageNavLink = document.querySelector('.nav a[data-page="page"]');
        if (!pageNavLink) return;

        var pageModal = document.getElementById('page-select-modal');
        if (!pageModal) {
            pageModal = document.createElement('div');
            pageModal.id = 'page-select-modal';
            pageModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.3); justify-content:center; align-items:center; z-index:1000;';
            pageModal.innerHTML =
                '<div style="background:white; padding:24px; border-radius:12px; max-width:400px; width:90%;">' +
                '<h3 style="margin-top:0; color:#0f172a;">Select a Page</h3>' +
                '<select id="page-select" style="width:100%; padding:8px; border-radius:6px; margin-bottom:12px; border:1px solid #e2e8f0;"></select>' +
                '<div style="text-align:right;">' +
                '<button id="page-cancel" class="btn btn-secondary" style="margin-right:6px;">Cancel</button>' +
                '<button id="page-go" class="btn btn-primary">Go</button>' +
                '</div></div>';
            document.body.appendChild(pageModal);
        }

        pageNavLink.addEventListener('click', function(e) {
            e.preventDefault();
            var pages = window.pages || [];
            if (pages.length === 0) {
                alert('No pages available');
                return;
            }
            var select = pageModal.querySelector('#page-select');
            select.innerHTML = '';
            for (var i = 0; i < pages.length; i++) {
                var opt = document.createElement('option');
                opt.value = pages[i].pageId;
                opt.textContent = pages[i].name;
                select.appendChild(opt);
            }
            pageModal.style.display = 'flex';
        });

        pageModal.querySelector('#page-cancel').onclick = function() {
            pageModal.style.display = 'none';
        };
        pageModal.querySelector('#page-go').onclick = function() {
            var selected = pageModal.querySelector('#page-select').value;
            if (!selected) {
                alert('Please select a page');
                return;
            }
            pageModal.style.display = 'none';
            window.location.href = '/pages?pageId=' + encodeURIComponent(selected);
        };
    }

    // ===== EXPOSE REFRESH FUNCTION FOR OTHER COMPONENTS =====
    window.refreshDashboard = function() {
        loadDashboard();
        loadUserProfile();
    };

    // ===== AUTO‑REFRESH (data reload, NOT page reload) =====
    let refreshInterval = setInterval(function() {
        if (!document.hidden) {
            console.log('🔄 Auto‑refresh: reloading dashboard data...');
            loadDashboard();
            loadUserProfile();
        }
    }, 60000);

    window.addEventListener('beforeunload', function() {
        clearInterval(refreshInterval);
    });

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            clearInterval(refreshInterval);
        } else {
            refreshInterval = setInterval(function() {
                console.log('🔄 Auto‑refresh: reloading dashboard data...');
                loadDashboard();
                loadUserProfile();
            }, 60000);
        }
    });

    // ===== INIT =====
    loadDashboard();
    loadUserProfile();
    setupPageModal();
    console.log('✅ Master dashboard loaded (no page reload on auto‑refresh)');
});
