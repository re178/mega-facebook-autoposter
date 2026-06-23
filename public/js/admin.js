// admin.js – Full admin control with pricing management (USES GLOBAL apiFetch)
(function() {
    let refreshInterval = null;
    let charts = { usersChart: null, postsChart: null };

    // Use global apiFetch from api.js
    const apiFetch = window.apiFetch || (async function(url, options = {}) {
        console.warn('admin.js: window.apiFetch not found, using fallback');
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
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
    });

    // DOM helpers
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
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

    async function reloadAdmin() {
        await loadDashboardStats();
        await loadUsers();
        await loadPages();
        await loadCharts();
    }

    // Dashboard Stats
    async function loadDashboardStats() {
        try {
            const stats = await apiFetch('/api/admin/stats');
            setText('stat-total-users', stats.totalUsers);
            setText('stat-active-users', stats.activeUsers);
            setText('stat-suspended-users', stats.suspendedUsers);
            setText('stat-total-pages', stats.totalPages);
            setText('stat-total-posts', stats.totalPosts);
            setText('stat-total-ai-posts', stats.totalAIPosts || 0);
            window.adminStats = stats;
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    // Users Table
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
                        <button class="edit-user btn btn-secondary btn-sm" data-id="${user._id}">Edit</button>
                        <button class="reset-password btn btn-secondary btn-sm" data-id="${user._id}">Reset PW</button>
                        <button class="suspend-user btn btn-warning btn-sm" data-id="${user._id}">Suspend</button>
                        <button class="reactivate-user btn btn-primary btn-sm" data-id="${user._id}">Activate</button>
                        <button class="lock-ai btn btn-secondary btn-sm" data-id="${user._id}">Lock AI</button>
                        <button class="unlock-ai btn btn-secondary btn-sm" data-id="${user._id}">Unlock AI</button>
                        <button class="delete-user btn btn-danger btn-sm" data-id="${user._id}">Delete</button>
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
        document.querySelectorAll('.suspend-user').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Suspend this user?')) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}/suspend`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        document.querySelectorAll('.reactivate-user').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/reactivate`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        document.querySelectorAll('.lock-ai').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/lock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        document.querySelectorAll('.unlock-ai').forEach(btn => {
            btn.onclick = async () => {
                await apiFetch(`/api/admin/users/${btn.dataset.id}/unlock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });
        document.querySelectorAll('.delete-user').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Permanently delete user?')) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                await reloadAdmin();
            };
        });
        document.querySelectorAll('.reset-password').forEach(btn => {
            btn.onclick = async () => {
                const newPassword = prompt('Enter new password');
                if (!newPassword) return;
                await apiFetch(`/api/admin/users/${btn.dataset.id}/reset-password`, {
                    method: 'PATCH',
                    body: JSON.stringify({ newPassword })
                });
                showToast('Password reset successful', 'success');
            };
        });
        document.querySelectorAll('.edit-user').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.id;
                const user = await apiFetch(`/api/admin/users/${userId}`);
                const oldModal = document.getElementById('editUserModal');
                if (oldModal) oldModal.remove();
                const modal = document.createElement('div');
                modal.id = 'editUserModal';
                modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;box-shadow:0 0 10px rgba(0,0,0,0.5);border-radius:8px;';
                modal.innerHTML = `
                    <h3>Edit User</h3>
                    <label>Email: <input id="edit-email" type="email" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                    <label>Role: <select id="edit-role" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"><option>user</option><option>admin</option></select></label>
                    <label>Phone: <input id="edit-phone" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                    <label>Subscription: <select id="edit-subscription" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"><option>free</option><option>pro</option><option>enterprise</option></select></label>
                    <label>Status: <select id="edit-active" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"><option value="true">Active</option><option value="false">Suspended</option></select></label>
                    <label>AI Lock: <select id="edit-aiLock" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"><option value="false">Unlocked</option><option value="true">Locked</option></select></label>
                    <button id="save-user-edit" class="btn btn-primary" style="margin-right:8px;">Save</button>
                    <button id="close-user-modal" class="btn btn-secondary">Cancel</button>
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
                    showToast('User updated', 'success');
                };
                document.getElementById('close-user-modal').onclick = () => modal.remove();
            };
        });
    }

    // Pages Table
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
                        <button class="edit-page-btn btn btn-secondary btn-sm" data-id="${page._id}">Edit</button>
                        <button class="delete-page btn btn-danger btn-sm" data-id="${page._id}">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
            document.querySelectorAll('.delete-page').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Delete this page?')) return;
                    await apiFetch(`/api/admin/pages/${btn.dataset.id}`, { method: 'DELETE' });
                    await reloadAdmin();
                };
            });
            document.querySelectorAll('.edit-page-btn').forEach(btn => {
                btn.onclick = async () => {
                    const pageId = btn.dataset.id;
                    let fullPage;
                    try {
                        fullPage = await apiFetch(`/api/admin/pages/${pageId}`);
                    } catch (err) {
                        showToast('Could not fetch page details', 'error');
                        return;
                    }
                    const oldModal = document.getElementById('editPageModal');
                    if (oldModal) oldModal.remove();
                    const modal = document.createElement('div');
                    modal.id = 'editPageModal';
                    modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;width:400px;border-radius:8px;';
                    modal.innerHTML = `
                        <h3>Edit Page</h3>
                        <label>Name: <input id="edit-page-name" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                        <label>Page ID: <input id="edit-page-id" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                        <label>Token: <textarea id="edit-page-token" rows="2" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></textarea></label>
                        <button id="save-page-edit" class="btn btn-primary" style="margin-right:8px;">Save</button>
                        <button id="close-page-modal" class="btn btn-secondary">Cancel</button>
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
                        showToast('Page updated', 'success');
                    };
                    document.getElementById('close-page-modal').onclick = () => modal.remove();
                };
            });
        } catch (err) {
            console.error('Failed to load pages:', err);
        }
    }

    // System Logs
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
                    <button class="delete-log btn btn-danger btn-sm" data-id="${log._id}">Delete</button>
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

    // Broadcast
    function bindBroadcastMessage() {
        const btn = document.getElementById('broadcast-btn');
        if (!btn) return;
        btn.onclick = async () => {
            const message = document.getElementById('broadcast-message').value;
            if (!message) return showToast('Enter message', 'warning');
            btn.disabled = true;
            try {
                await apiFetch('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message })
                });
                showToast('Broadcast sent', 'success');
                document.getElementById('broadcast-message').value = '';
                loadBroadcasts();
            } catch (err) {
                showToast('Failed to send broadcast', 'error');
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
                div.style.border = '1px solid #e2e8f0';
                div.style.margin = '5px';
                div.style.padding = '8px';
                div.style.borderRadius = '6px';
                div.innerHTML = `
                    <strong>${escapeHtml(b.message)}</strong><br>
                    <small>${new Date(b.createdAt).toLocaleString()}</small><br>
                    <button class="edit-broadcast btn btn-secondary btn-sm" data-id="${b._id}" data-msg="${escapeHtml(b.message)}">Edit</button>
                    <button class="delete-broadcast btn btn-danger btn-sm" data-id="${b._id}">Delete</button>
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

    // Private Messages
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
                div.style.border = '1px solid #e2e8f0';
                div.style.margin = '5px';
                div.style.padding = '8px';
                div.style.borderRadius = '6px';
                const userEmail = msg.userId?.email || 'Unknown user';
                div.innerHTML = `
                    <strong>To: ${escapeHtml(userEmail)}</strong><br>
                    ${escapeHtml(msg.message)}<br>
                    <small>${new Date(msg.createdAt).toLocaleString()}</small><br>
                    <button class="edit-pm btn btn-secondary btn-sm" data-id="${msg._id}" data-text="${escapeHtml(msg.message)}">Edit</button>
                    <button class="delete-pm btn btn-danger btn-sm" data-id="${msg._id}">Delete</button>
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
        if (!userEmail || !message) return showToast('User email and message required', 'warning');
        const users = await apiFetch('/api/admin/users');
        const user = users.find(u => u.email === userEmail);
        if (!user) return showToast('User not found', 'error');
        await apiFetch(`/api/admin/message/${user._id}`, {
            method: 'POST',
            body: JSON.stringify({ message })
        });
        showToast('Message sent', 'success');
        document.getElementById('private-message-text').value = '';
        loadPrivateMessages(user._id);
    }

    // Maintenance
    function bindMaintenanceButtons() {
        const onBtn = document.getElementById('maintenance-on');
        const offBtn = document.getElementById('maintenance-off');
        if (onBtn) {
            onBtn.onclick = async () => {
                await apiFetch('/api/admin/maintenance/on', { method: 'PATCH' });
                showToast('Maintenance mode enabled', 'success');
            };
        }
        if (offBtn) {
            offBtn.onclick = async () => {
                await apiFetch('/api/admin/maintenance/off', { method: 'PATCH' });
                showToast('Maintenance mode disabled', 'success');
            };
        }
    }

    // Charts
    async function loadCharts() {
        if (!window.Chart) return;
        const stats = window.adminStats;
        if (!stats) return;
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

    // Create User
    function bindCreateUser() {
        const btn = document.getElementById('admin-create-user-btn');
        if (!btn) return;
        btn.onclick = async () => {
            const email = document.getElementById('admin-user-email').value;
            const password = document.getElementById('admin-user-password').value;
            const role = document.getElementById('admin-user-role').value;
            const phone = document.getElementById('admin-user-phone').value;
            if (!email || !password) return showToast('Email and password required', 'warning');
            btn.disabled = true;
            try {
                const data = await apiFetch('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, role, phone })
                });
                if (data.error) return showToast(data.error, 'error');
                showToast('User created', 'success');
                await reloadAdmin();
                document.getElementById('admin-user-email').value = '';
                document.getElementById('admin-user-password').value = '';
                document.getElementById('admin-user-phone').value = '';
            } catch (err) {
                showToast('Failed to create user', 'error');
            } finally {
                btn.disabled = false;
            }
        };
    }

    // Add Page to User Modal
    async function showAddPageModal() {
        let modal = document.getElementById('addPageModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'addPageModal';
        modal.style.cssText = 'position:fixed;top:20%;left:30%;background:white;padding:20px;border:1px solid #ccc;z-index:9999;width:400px;border-radius:8px;';
        modal.innerHTML = `
            <h3>Add Facebook Page to User</h3>
            <label>Search User (email): <input id="page-user-email" list="user-datalist-addpage" autocomplete="off" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
            <datalist id="user-datalist-addpage"></datalist><br>
            <label>Page Name: <input id="page-name" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
            <label>Page ID: <input id="page-id" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
            <label>Page Token: <textarea id="page-token" rows="2" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></textarea></label>
            <button id="confirm-add-page" class="btn btn-primary" style="margin-right:8px;">Add Page</button>
            <button id="close-addpage-modal" class="btn btn-secondary">Cancel</button>
        `;
        document.body.appendChild(modal);
        await populateUserDatalist('page-user-email', 'user-datalist-addpage');
        modal.style.display = 'block';
        document.getElementById('confirm-add-page').onclick = async () => {
            const userEmail = document.getElementById('page-user-email').value;
            const users = await apiFetch('/api/admin/users');
            const user = users.find(u => u.email === userEmail);
            if (!user) return showToast('User not found', 'error');
            const payload = {
                userId: user._id,
                name: document.getElementById('page-name').value,
                pageId: document.getElementById('page-id').value,
                pageToken: document.getElementById('page-token').value
            };
            if (!payload.name || !payload.pageId || !payload.pageToken) return showToast('All fields required', 'warning');
            await apiFetch('/api/admin/pages', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            modal.remove();
            await reloadAdmin();
            showToast('Page added', 'success');
        };
        document.getElementById('close-addpage-modal').onclick = () => modal.remove();
    }

    // Clear All Logs
    async function clearAllLogs() {
        if (!confirm('Delete ALL logs? Cannot undo.')) return;
        await apiFetch('/api/admin/logs/clear-all', { method: 'DELETE' });
        loadSystemLogs();
        showToast('All logs cleared', 'success');
    }

    // Pricing Management
    async function loadPricing() {
        try {
            const pricing = await apiFetch('/api/admin/pricing');
            document.getElementById('price-pro-usd').value = pricing.pro.priceUSD || 0;
            document.getElementById('price-pro-kes').value = pricing.pro.priceKES || 0;
            document.getElementById('price-enterprise-usd').value = pricing.enterprise.priceUSD || 0;
            document.getElementById('price-enterprise-kes').value = pricing.enterprise.priceKES || 0;
        } catch (err) {
            console.error('Failed to load pricing:', err);
        }
    }

    function bindPricingSave() {
        const btn = document.getElementById('save-pricing-btn');
        if (!btn) return;
        btn.onclick = async () => {
            const data = {
                pro: {
                    priceUSD: parseFloat(document.getElementById('price-pro-usd').value) || 0,
                    priceKES: parseFloat(document.getElementById('price-pro-kes').value) || 0
                },
                enterprise: {
                    priceUSD: parseFloat(document.getElementById('price-enterprise-usd').value) || 0,
                    priceKES: parseFloat(document.getElementById('price-enterprise-kes').value) || 0
                }
            };
            if (data.pro.priceKES <= 0 || data.enterprise.priceKES <= 0) {
                showToast('Prices must be greater than 0', 'warning');
                return;
            }
            btn.disabled = true;
            try {
                await apiFetch('/api/admin/pricing', {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                showToast('Pricing updated successfully', 'success');
            } catch (err) {
                showToast('Failed to update pricing', 'error');
            } finally {
                btn.disabled = false;
            }
        };
    }

    // Initialization
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
            await loadPricing();
            bindCreateUser();
            bindBroadcastMessage();
            bindMaintenanceButtons();
            bindPricingSave();
            const sendMsgBtn = document.getElementById('send-private-msg-btn');
            if (sendMsgBtn) sendMsgBtn.onclick = sendPrivateMessageFromUI;
            // Auto-refresh
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
            window.clearAllLogs = clearAllLogs;
            window.showAddPageModal = showAddPageModal;
        } catch (err) {
            console.error('Admin init failed:', err);
        }
    }

    init();
})();
