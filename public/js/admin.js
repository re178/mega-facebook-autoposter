// admin.js – Fixed version
// Requires CSRF meta tag: <meta name="csrf-token" content="...">
// Requires global apiFetch to be defined in api.js (see below)

(function() {
    let refreshInterval = null;
    let charts = { usersChart: null, postsChart: null };

    // Helper to get CSRF token from meta
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    // Central apiFetch with CSRF and 401 handling
    async function apiFetch(url, options = {}) {
        const csrfToken = getCsrfToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...(options.headers || {})
        };
        const res = await fetch(url, {
            ...options,
            credentials: 'include',
            headers
        });
        if (res.status === 401) {
            window.location.href = '/login';
            throw new Error('Unauthorized');
        }
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || `HTTP ${res.status}`);
        }
        return res.json();
    }

    // ---------- DOM Helpers ----------
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
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

    async function reloadAdmin() {
        await loadDashboardStats();
        await loadUsers();
        await loadPages();
        await loadCharts();
    }

    // ---------- Dashboard Stats ----------
    async function loadDashboardStats() {
        try {
            const stats = await apiFetch('/api/admin/stats');
            setText('stat-total-users', stats.totalUsers);
            setText('stat-active-users', stats.activeUsers);
            setText('stat-suspended-users', stats.suspendedUsers);
            setText('stat-total-pages', stats.totalPages);
            setText('stat-total-posts', stats.totalPosts);
            window.adminStats = stats;
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    // ---------- Users Table ----------
    async function loadUsers() {
        try {
            const users = await apiFetch('/api/admin/users');
            const tbody = document.getElementById('admin-users-table');
            if (!tbody) return;
            tbody.innerHTML = '';
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(user.email)}</td>
                    <td>${escapeHtml(user.role)}</td>
                    <td>${escapeHtml(user.phone || '-')}</td>
                    <td>${escapeHtml(user.subscription?.plan || 'free')}</td>
                    <td>${user.isActive ? '✅ Active' : '❌ Suspended'}</td>
                    <td>${user.aiLocked ? '🔒 Locked' : '🟢 Open'}</td>
                    <td>
                        <button class="edit-user" data-id="${user._id}">Edit</button>
                        <button class="reset-password" data-id="${user._id}">Reset Password</button>
                        <button class="suspend-user" data-id="${user._id}">Suspend</button>
                        <button class="reactivate-user" data-id="${user._id}">Activate</button>
                        <button class="lock-ai" data-id="${user._id}">Lock AI</button>
                        <button class="unlock-ai" data-id="${user._id}">Unlock AI</button>
                        <button class="delete-user" data-id="${user._id}">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            bindUserButtons();
        } catch (err) {
            console.error('Failed to load users:', err);
        }
    }

    function bindUserButtons() {
        // Suspend
        document.querySelectorAll('.suspend-user').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Suspend this user?')) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}/suspend`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        // Activate
        document.querySelectorAll('.reactivate-user').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/reactivate`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        // Lock AI
        document.querySelectorAll('.lock-ai').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/lock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        // Unlock AI
        document.querySelectorAll('.unlock-ai').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/unlock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        // Delete user
        document.querySelectorAll('.delete-user').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Permanently delete user?')) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                await reloadAdmin();
            };
        });
        // Reset password
        document.querySelectorAll('.reset-password').forEach(btn => {
            btn.onclick = async () => {
                const newPassword = prompt('Enter new password');
                if (!newPassword) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}/reset-password`, {
                    method: 'PATCH',
                    body: JSON.stringify({ newPassword })
                });
                alert('Password reset successful');
            };
        });
        // Edit user – modal with cleanup
        document.querySelectorAll('.edit-user').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.id;
                const user = await apiFetch(`/api/admin/users/${userId}`);
                // Remove existing modal if any
                const oldModal = document.getElementById('editUserModal');
                if (oldModal) oldModal.remove();
                const modal = document.createElement('div');
                modal.id = 'editUserModal';
                modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;box-shadow:0 0 10px rgba(0,0,0,0.5);';
                modal.innerHTML = `
                    <h3>Edit User</h3>
                    <label>Email: <input id="edit-email" type="email"></label><br>
                    <label>Role: <select id="edit-role"><option>user</option><option>admin</option></select></label><br>
                    <label>Phone: <input id="edit-phone"></label><br>
                    <label>Subscription: <select id="edit-subscription"><option>free</option><option>pro</option><option>enterprise</option></select></label><br>
                    <label>Status: <select id="edit-active"><option value="true">Active</option><option value="false">Suspended</option></select></label><br>
                    <label>AI Lock: <select id="edit-aiLock"><option value="false">Unlocked</option><option value="true">Locked</option></select></label><br><br>
                    <button id="save-user-edit">Save</button>
                    <button id="close-user-modal">Cancel</button>
                `;
                document.body.appendChild(modal);
                document.getElementById('edit-email').value = user.email;
                document.getElementById('edit-role').value = user.role;
                document.getElementById('edit-phone').value = user.phone || '';
                document.getElementById('edit-subscription').value = user.subscription?.plan || 'free';
                document.getElementById('edit-active').value = user.isActive ? 'true' : 'false';
                document.getElementById('edit-aiLock').value = user.aiLocked ? 'true' : 'false';
                modal.style.display = 'block';
                document.getElementById('save-user-edit').onclick = async () => {
                    const payload = {
                        email: document.getElementById('edit-email').value,
                        role: document.getElementById('edit-role').value,
                        phone: document.getElementById('edit-phone').value,
                        subscription: { plan: document.getElementById('edit-subscription').value },
                        isActive: document.getElementById('edit-active').value === 'true',
                        aiLocked: document.getElementById('edit-aiLock').value === 'true'
                    };
                    await apiFetch(`/api/admin/users/${userId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });
                    modal.remove();
                    await reloadAdmin();
                };
                document.getElementById('close-user-modal').onclick = () => modal.remove();
            };
        });
    }

    // ---------- Pages Table (No Token Exposure) ----------
    async function loadPages() {
        try {
            const pages = await apiFetch('/api/admin/pages');
            const tbody = document.getElementById('admin-pages-table');
            if (!tbody) return;
            tbody.innerHTML = '';
            for (const page of pages) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(page.name)}</td>
                    <td>${escapeHtml(page.pageId)}</td>
                    <td>${escapeHtml(page.userId?.email || '-')}</td>
                    <td>${page.autoGenerationEnabled ? 'Enabled' : 'Disabled'}</td>
                    <td>
                        <button class="edit-page-btn" data-id="${page._id}" data-name="${escapeHtml(page.name)}" data-pageid="${escapeHtml(page.pageId)}">Edit</button>
                        <button class="delete-page" data-id="${page._id}">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
            // Delete page
            document.querySelectorAll('.delete-page').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Delete this page?')) return;
                    await apiFetch(`/api/admin/pages/${btn.dataset.id}`, { method: 'DELETE' });
                    await reloadAdmin();
                };
            });
            // Edit page – token fetched on demand (not stored in HTML)
            document.querySelectorAll('.edit-page-btn').forEach(btn => {
                btn.onclick = async () => {
                    const pageId = btn.dataset.id;
                    // Fetch full page data including token from a secure endpoint
                    // Assuming you have: GET /api/admin/pages/:id (returns token)
                    let fullPage;
                    try {
                        fullPage = await apiFetch(`/api/admin/pages/${pageId}`);
                    } catch (err) {
                        alert('Could not fetch page details');
                        return;
                    }
                    const oldModal = document.getElementById('editPageModal');
                    if (oldModal) oldModal.remove();
                    const modal = document.createElement('div');
                    modal.id = 'editPageModal';
                    modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;width:400px;';
                    modal.innerHTML = `
                        <h3>Edit Page</h3>
                        <label>Name: <input id="edit-page-name" style="width:100%"></label><br>
                        <label>Page ID: <input id="edit-page-id" style="width:100%"></label><br>
                        <label>Token: <textarea id="edit-page-token" rows="2" style="width:100%"></textarea></label><br>
                        <button id="save-page-edit">Save</button>
                        <button id="close-page-modal">Cancel</button>
                    `;
                    document.body.appendChild(modal);
                    document.getElementById('edit-page-name').value = fullPage.name;
                    document.getElementById('edit-page-id').value = fullPage.pageId;
                    document.getElementById('edit-page-token').value = fullPage.pageToken || '';
                    modal.style.display = 'block';
                    document.getElementById('save-page-edit').onclick = async () => {
                        const updated = {
                            name: document.getElementById('edit-page-name').value,
                            pageId: document.getElementById('edit-page-id').value,
                            pageToken: document.getElementById('edit-page-token').value
                        };
                        await apiFetch(`/api/admin/pages/${pageId}`, {
                            method: 'PUT',
                            body: JSON.stringify(updated)
                        });
                        modal.remove();
                        await reloadAdmin();
                    };
                    document.getElementById('close-page-modal').onclick = () => modal.remove();
                };
            });
        } catch (err) {
            console.error('Failed to load pages:', err);
        }
    }

    // ---------- System Logs ----------
    async function loadSystemLogs() {
        try {
            const data = await apiFetch('/api/admin/logs');
            const container = document.getElementById('admin-logs');
            if (!container) return;
            container.innerHTML = '';
            data.logs.forEach(log => {
                const div = document.createElement('div');
                div.classList.add('log');
                div.innerHTML = `
                    <strong>${escapeHtml(log.action)}</strong>
                    <p>${escapeHtml(log.message)}</p>
                    <small>${new Date(log.createdAt).toLocaleString()}</small>
                    <button class="delete-log" data-id="${log._id}">Delete</button>
                `;
                container.appendChild(div);
                const delBtn = div.querySelector('.delete-log');
                delBtn.onclick = async () => {
                    if (confirm('Delete this log entry?')) {
                        await apiFetch(`/api/admin/logs/${delBtn.dataset.id}`, { method: 'DELETE' });
                        loadSystemLogs();
                    }
                };
            });
        } catch (err) {
            console.error('Failed to load logs:', err);
        }
    }

    // ---------- Broadcast ----------
    function bindBroadcastMessage() {
        const btn = document.getElementById('broadcast-btn');
        if (!btn) return;
        btn.onclick = async () => {
            const message = document.getElementById('broadcast-message').value;
            if (!message) return alert('Enter message');
            btn.disabled = true;
            try {
                await apiFetch('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message })
                });
                alert('Broadcast sent');
                document.getElementById('broadcast-message').value = '';
                loadBroadcasts(); // refresh list
            } catch (err) {
                alert('Failed to send broadcast');
            } finally {
                btn.disabled = false;
            }
        };
    }

    async function loadBroadcasts() {
        try {
            const broadcasts = await apiFetch('/api/admin/broadcast');
            const container = document.getElementById('broadcast-list');
            if (!container) return;
            container.innerHTML = '';
            broadcasts.forEach(b => {
                const div = document.createElement('div');
                div.style.border = '1px solid #ccc';
                div.style.margin = '5px';
                div.style.padding = '5px';
                div.innerHTML = `
                    <strong>${escapeHtml(b.message)}</strong><br>
                    <small>${new Date(b.createdAt).toLocaleString()}</small><br>
                    <button class="edit-broadcast" data-id="${b._id}" data-msg="${escapeHtml(b.message)}">Edit</button>
                    <button class="delete-broadcast" data-id="${b._id}">Delete</button>
                `;
                container.appendChild(div);
            });
            document.querySelectorAll('.edit-broadcast').forEach(btn => {
                btn.onclick = async () => {
                    const newMsg = prompt('Edit broadcast message', btn.dataset.msg);
                    if (newMsg) {
                        await apiFetch(`/api/admin/broadcast/${btn.dataset.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ message: newMsg })
                        });
                        loadBroadcasts();
                    }
                };
            });
            document.querySelectorAll('.delete-broadcast').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm('Delete this broadcast?')) {
                        await apiFetch(`/api/admin/broadcast/${btn.dataset.id}`, { method: 'DELETE' });
                        loadBroadcasts();
                    }
                };
            });
        } catch (err) {
            console.error('Failed to load broadcasts:', err);
        }
    }

    // ---------- Private Messages ----------
    async function populateUserDatalist(inputId, datalistId) {
        try {
            const users = await apiFetch('/api/admin/users');
            const datalist = document.getElementById(datalistId);
            if (!datalist) return;
            datalist.innerHTML = '';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.email;
                option.dataset.id = user._id;
                datalist.appendChild(option);
            });
            const input = document.getElementById(inputId);
            if (input) {
                input.dataset.userId = '';
                input.addEventListener('change', (e) => {
                    const selectedEmail = e.target.value;
                    const match = users.find(u => u.email === selectedEmail);
                    input.dataset.userId = match ? match._id : '';
                });
            }
        } catch (err) {
            console.error('Failed to populate user datalist:', err);
        }
    }

    async function loadPrivateMessages(userId) {
        try {
            const url = userId ? `/api/admin/messages?userId=${userId}` : '/api/admin/messages';
            const messages = await apiFetch(url);
            const container = document.getElementById('private-messages-list');
            if (!container) return;
            container.innerHTML = '';
            for (const msg of messages) {
                const div = document.createElement('div');
                div.style.border = '1px solid #ccc';
                div.style.margin = '5px';
                div.style.padding = '5px';
                const userEmail = msg.userId?.email || 'Unknown user';
                div.innerHTML = `
                    <strong>To: ${escapeHtml(userEmail)}</strong><br>
                    ${escapeHtml(msg.message)}<br>
                    <small>${new Date(msg.createdAt).toLocaleString()}</small><br>
                    <button class="edit-pm" data-id="${msg._id}" data-text="${escapeHtml(msg.message)}">Edit</button>
                    <button class="delete-pm" data-id="${msg._id}">Delete</button>
                `;
                container.appendChild(div);
            }
            document.querySelectorAll('.edit-pm').forEach(btn => {
                btn.onclick = async () => {
                    const newText = prompt('Edit message', btn.dataset.text);
                    if (newText) {
                        await apiFetch(`/api/admin/message/${btn.dataset.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ message: newText })
                        });
                        loadPrivateMessages(userId);
                    }
                };
            });
            document.querySelectorAll('.delete-pm').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm('Delete this message?')) {
                        await apiFetch(`/api/admin/message/${btn.dataset.id}`, { method: 'DELETE' });
                        loadPrivateMessages(userId);
                    }
                };
            });
        } catch (err) {
            console.error('Failed to load private messages:', err);
        }
    }

    async function sendPrivateMessageFromUI() {
        const input = document.getElementById('private-message-user-email');
        if (!input) return;
        const userEmail = input.value;
        const message = document.getElementById('private-message-text').value;
        if (!userEmail || !message) return alert('User email and message required');
        const users = await apiFetch('/api/admin/users');
        const user = users.find(u => u.email === userEmail);
        if (!user) return alert('User not found');
        await apiFetch(`/api/admin/message/${user._id}`, {
            method: 'POST',
            body: JSON.stringify({ message })
        });
        alert('Message sent');
        document.getElementById('private-message-text').value = '';
        loadPrivateMessages(user._id);
    }

    // ---------- Maintenance ----------
    function bindMaintenanceButtons() {
        const onBtn = document.getElementById('maintenance-on');
        const offBtn = document.getElementById('maintenance-off');
        if (onBtn) {
            onBtn.onclick = async () => {
                await apiFetch('/api/admin/maintenance/on', { method: 'PATCH' });
                alert('Maintenance mode enabled');
            };
        }
        if (offBtn) {
            offBtn.onclick = async () => {
                await apiFetch('/api/admin/maintenance/off', { method: 'PATCH' });
                alert('Maintenance mode disabled');
            };
        }
    }

    // ---------- Charts with cleanup ----------
    async function loadCharts() {
        if (!window.Chart) return;
        const stats = window.adminStats;
        if (!stats) return;
        // Destroy existing charts
        if (charts.usersChart) charts.usersChart.destroy();
        if (charts.postsChart) charts.postsChart.destroy();
        const usersCtx = document.getElementById('usersChart');
        if (usersCtx) {
            charts.usersChart = new Chart(usersCtx, {
                type: 'pie',
                data: {
                    labels: ['Active', 'Suspended'],
                    datasets: [{ data: [stats.activeUsers, stats.suspendedUsers] }]
                }
            });
        }
        const postsCtx = document.getElementById('postsChart');
        if (postsCtx && stats.postsPerUser) {
            charts.postsChart = new Chart(postsCtx, {
                type: 'bar',
                data: {
                    labels: stats.postsPerUser.map(p => p.email),
                    datasets: [{ label: 'Posts', data: stats.postsPerUser.map(p => p.posts) }]
                }
            });
        }
    }

    // ---------- Create User ----------
    function bindCreateUser() {
        const btn = document.getElementById('admin-create-user-btn');
        if (!btn) return;
        btn.onclick = async () => {
            const email = document.getElementById('admin-user-email').value;
            const password = document.getElementById('admin-user-password').value;
            const role = document.getElementById('admin-user-role').value;
            const phone = document.getElementById('admin-user-phone').value;
            if (!email || !password) return alert('Email and password required');
            btn.disabled = true;
            try {
                const data = await apiFetch('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, role, phone })
                });
                if (data.error) return alert(data.error);
                alert('User created');
                await reloadAdmin();
                // Clear inputs
                document.getElementById('admin-user-email').value = '';
                document.getElementById('admin-user-password').value = '';
                document.getElementById('admin-user-phone').value = '';
            } catch (err) {
                alert('Failed to create user');
            } finally {
                btn.disabled = false;
            }
        };
    }

    // ---------- Add Page to User Modal ----------
    async function showAddPageModal() {
        let modal = document.getElementById('addPageModal');
        if (modal) modal.remove(); // remove existing to avoid duplication
        modal = document.createElement('div');
        modal.id = 'addPageModal';
        modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;width:400px;';
        modal.innerHTML = `
            <h3>Add Facebook Page to User</h3>
            <label>Search User (email): <input id="page-user-email" list="user-datalist-addpage" autocomplete="off"></label>
            <datalist id="user-datalist-addpage"></datalist><br><br>
            <label>Page Name: <input id="page-name" style="width:100%"></label><br>
            <label>Page ID: <input id="page-id" style="width:100%"></label><br>
            <label>Page Token: <textarea id="page-token" rows="2" style="width:100%"></textarea></label><br><br>
            <button id="confirm-add-page">Add Page</button>
            <button id="close-addpage-modal">Cancel</button>
        `;
        document.body.appendChild(modal);
        await populateUserDatalist('page-user-email', 'user-datalist-addpage');
        modal.style.display = 'block';
        document.getElementById('confirm-add-page').onclick = async () => {
            const userEmail = document.getElementById('page-user-email').value;
            const users = await apiFetch('/api/admin/users');
            const user = users.find(u => u.email === userEmail);
            if (!user) return alert('User not found');
            const payload = {
                userId: user._id,
                name: document.getElementById('page-name').value,
                pageId: document.getElementById('page-id').value,
                pageToken: document.getElementById('page-token').value
            };
            if (!payload.name || !payload.pageId || !payload.pageToken) return alert('All fields required');
            await apiFetch('/api/admin/pages', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            modal.remove();
            await reloadAdmin();
        };
        document.getElementById('close-addpage-modal').onclick = () => modal.remove();
    }

    // ---------- Clear All Logs ----------
    async function clearAllLogs() {
        if (!confirm('Delete ALL logs? Cannot undo.')) return;
        await apiFetch('/api/admin/logs/clear-all', { method: 'DELETE' });
        loadSystemLogs();
    }

    // ---------- Initialization ----------
    async function init() {
        try {
            const sessionRes = await fetch('/api/session', { credentials: 'include' });
            const session = await sessionRes.json();
            const role = session.role || session.user?.role;
            const isAdmin = role === 'admin';
            if (isAdmin) {
                const adminNav = document.getElementById('admin-nav-link');
                if (adminNav) adminNav.style.display = 'block';
            } else {
                // Optionally redirect non-admin users
                console.warn('Not an admin');
                return;
            }
            await loadDashboardStats();
            await loadUsers();
            await loadPages();
            await loadSystemLogs();
            await loadBroadcasts();
            await populateUserDatalist('private-message-user-email', 'user-datalist-pm');
            await loadPrivateMessages('');
            await loadCharts();
            bindCreateUser();
            bindBroadcastMessage();
            bindMaintenanceButtons();
            const sendMsgBtn = document.getElementById('send-private-msg-btn');
            if (sendMsgBtn) sendMsgBtn.onclick = sendPrivateMessageFromUI;
            // Auto-refresh every 60 seconds, but stop when page hidden
            function refresh() {
                if (!document.hidden) {
                    loadDashboardStats();
                    loadUsers();
                    loadPages();
                }
            }
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(refresh, 60000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && refreshInterval) refresh();
            });
            // Expose globals for inline buttons (if any)
            window.clearAllLogs = clearAllLogs;
            window.showAddPageModal = showAddPageModal;
        } catch (err) {
            console.error('Admin init failed:', err);
        }
    }

    init();
})();
