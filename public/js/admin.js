// admin.js – Full admin control with dynamic plan management, pagination, search, restrictions, overrides, global auto-gen, email broadcast

(function() {
    let refreshInterval = null;
    let charts = { usersChart: null, postsChart: null };
    let editingPlanId = null;

    // Pagination state
    let currentPage = 0;
    const pageSize = 20;
    let searchQuery = '';
    let totalUsers = 0;

    // Use global apiFetch from api.js
    const apiFetch = window.apiFetch || (async function(url, options = {}) {
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

    // ========== DASHBOARD STATS (unchanged) ==========
    async function reloadAdmin() {
        await loadDashboardStats();
        await loadUsersPaginated(currentPage, searchQuery);
        await loadPages();
        await loadCharts();
        await loadPlans();
    }

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

    // ========== USERS (with pagination and search) ==========
    async function loadUsersPaginated(page = 0, search = '') {
        try {
            const skip = page * pageSize;
            const res = await apiFetch(`/api/admin/users?skip=${skip}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
            const { users, total } = res;
            totalUsers = total;
            const tbody = document.getElementById('admin-users-table');
            if (!tbody) return;
            tbody.innerHTML = '';
            users.forEach(user => {
                const restrictions = user.restrictions || {};
                let restrictionBadges = '';
                if (restrictions.postingRestricted) restrictionBadges += '🚫 Posts ';
                if (restrictions.commentingRestricted) restrictionBadges += '🚫 Comments ';
                if (restrictions.messagingRestricted) restrictionBadges += '🚫 Messages ';
                if (restrictions.templatesLocked) restrictionBadges += '🔒 Templates ';
                if (restrictions.adsLocked) restrictionBadges += '🔒 Ads ';
                if (restrictions.autoGenerationLocked) restrictionBadges += '🤖 Auto-gen ';
                if (!restrictionBadges) restrictionBadges = '✅ Allowed';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(user.email)}</td>
                    <td>${escapeHtml(user.role)}</td>
                    <td>${escapeHtml(user.phone || '-')}</td>
                    <td>${escapeHtml(user.subscription?.plan || 'free')}</td>
                    <td>${user.isActive ? '✅ Active' : '❌ Suspended'}</td>
                    <td>${user.aiLocked ? '🔒 Locked' : '🟢 Open'}</td>
                    <td>${restrictionBadges}</td>
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
            renderPaginationControls();
        } catch (err) {
            console.error('Failed to load users:', err);
        }
    }

    function renderPaginationControls() {
        const totalPages = Math.ceil(totalUsers / pageSize);
        const container = document.getElementById('pagination-controls');
        if (!container) return;
        container.innerHTML = `
            <button ${currentPage === 0 ? 'disabled' : ''} onclick="loadUsersPaginated(${currentPage - 1}, '${searchQuery}')" class="btn btn-secondary btn-sm">Previous</button>
            <span>Page ${currentPage + 1} of ${totalPages || 1}</span>
            <button ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="loadUsersPaginated(${currentPage + 1}, '${searchQuery}')" class="btn btn-secondary btn-sm">Next</button>
            <span style="margin-left:12px;">Total: ${totalUsers} users</span>
        `;
    }

    // Search handler
    window.searchUsers = function() {
        const input = document.getElementById('user-search');
        if (input) {
            searchQuery = input.value;
            currentPage = 0;
            loadUsersPaginated(currentPage, searchQuery);
        }
    };

    // Keep old loadUsers for backward compatibility (but override it)
    async function loadUsers() {
        return loadUsersPaginated(currentPage, searchQuery);
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
                showEditUserModal(user);
            };
        });
    }

    // ========== EDIT USER MODAL (with restrictions and overrides) ==========
    function showEditUserModal(user) {
        const oldModal = document.getElementById('editUserModal');
        if (oldModal) oldModal.remove();
        const modal = document.createElement('div');
        modal.id = 'editUserModal';
        modal.style.cssText = 'position:fixed;top:10%;left:20%;width:60%;max-height:80vh;overflow-y:auto;background:white;padding:24px;border-radius:12px;z-index:9999;box-shadow:0 0 30px rgba(0,0,0,0.3);';

        const restrictions = user.restrictions || {};
        const overrides = user.featureOverrides || {};

        modal.innerHTML = `
            <h3>Edit User: ${escapeHtml(user.email)}</h3>
            <form id="editUserForm">
                <label>Email: <input type="email" id="edit-email" value="${escapeHtml(user.email)}" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                <label>Role: <select id="edit-role" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select></label>
                <label>Phone: <input type="text" id="edit-phone" value="${escapeHtml(user.phone || '')}" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;"></label>
                <label>Subscription: <select id="edit-subscription" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                    <option value="free" ${user.subscription?.plan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="pro" ${user.subscription?.plan === 'pro' ? 'selected' : ''}>Pro</option>
                    <option value="premium" ${user.subscription?.plan === 'premium' ? 'selected' : ''}>Premium</option>
                    <option value="enterprise" ${user.subscription?.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                </select></label>
                <label>Status: <select id="edit-active" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                    <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
                    <option value="false" ${!user.isActive ? 'selected' : ''}>Suspended</option>
                </select></label>
                <label>AI Lock: <select id="edit-aiLock" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                    <option value="false" ${!user.aiLocked ? 'selected' : ''}>Unlocked</option>
                    <option value="true" ${user.aiLocked ? 'selected' : ''}>Locked</option>
                </select></label>

                <hr>
                <h4>Restrictions</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <label><input type="checkbox" id="restrict-posting" ${restrictions.postingRestricted ? 'checked' : ''}> Posting</label>
                    <label><input type="checkbox" id="restrict-commenting" ${restrictions.commentingRestricted ? 'checked' : ''}> Commenting</label>
                    <label><input type="checkbox" id="restrict-messaging" ${restrictions.messagingRestricted ? 'checked' : ''}> Messaging</label>
                    <label><input type="checkbox" id="restrict-templates" ${restrictions.templatesLocked ? 'checked' : ''}> Templates</label>
                    <label><input type="checkbox" id="restrict-ads" ${restrictions.adsLocked ? 'checked' : ''}> Ads</label>
                    <label><input type="checkbox" id="restrict-autoGen" ${restrictions.autoGenerationLocked ? 'checked' : ''}> Auto-Generation</label>
                </div>

                <hr>
                <h4>Feature Overrides</h4>
                <p style="font-size:12px; color:#64748b;">Override plan limits for specific features (leave blank to use plan defaults).</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <label>AI Topics: <input type="number" id="override-aiTopics" value="${overrides.aiTopics !== undefined ? overrides.aiTopics : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label>AI Posts/Month: <input type="number" id="override-aiPostsPerMonth" value="${overrides.aiPostsPerMonth !== undefined ? overrides.aiPostsPerMonth : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label>Manual Posts/Month: <input type="number" id="override-manualPostsPerMonth" value="${overrides.manualPostsPerMonth !== undefined ? overrides.manualPostsPerMonth : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label>Pages Allowed: <input type="number" id="override-pagesAllowed" value="${overrides.pagesAllowed !== undefined ? overrides.pagesAllowed : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label>Templates: <input type="number" id="override-templates" value="${overrides.templates !== undefined ? overrides.templates : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label>Team Members: <input type="number" id="override-teamMembers" value="${overrides.teamMembers !== undefined ? overrides.teamMembers : ''}" step="1" style="width:100%; padding:4px;"></label>
                    <label style="grid-column: span 2;">
                        <input type="checkbox" id="override-ads" ${overrides.ads === true ? 'checked' : ''}> Ads (boolean)
                    </label>
                    <label style="grid-column: span 2;">
                        <input type="checkbox" id="override-comments" ${overrides.comments === true ? 'checked' : ''}> Comments (boolean)
                    </label>
                </div>

                <div style="margin-top:16px; text-align:right;">
                    <button type="button" class="btn btn-primary" id="save-user-edit">Save</button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('#editUserModal').remove()">Cancel</button>
                </div>
            </form>
        `;
        document.body.appendChild(modal);

        document.getElementById('save-user-edit').onclick = async () => {
            // Build restrictions payload
            const restrictionsPayload = {
                postingRestricted: document.getElementById('restrict-posting').checked,
                commentingRestricted: document.getElementById('restrict-commenting').checked,
                messagingRestricted: document.getElementById('restrict-messaging').checked,
                templatesLocked: document.getElementById('restrict-templates').checked,
                adsLocked: document.getElementById('restrict-ads').checked,
                autoGenerationLocked: document.getElementById('restrict-autoGen').checked
            };

            // Build overrides payload
            const overridesPayload = {};
            const overrideFields = ['aiTopics', 'aiPostsPerMonth', 'manualPostsPerMonth', 'pagesAllowed', 'templates', 'teamMembers', 'ads', 'comments'];
            for (const field of overrideFields) {
                const el = document.getElementById(`override-${field}`);
                if (el) {
                    const val = el.type === 'checkbox' ? el.checked : (el.value ? parseFloat(el.value) : undefined);
                    if (val !== undefined && val !== '') {
                        overridesPayload[field] = val;
                    }
                }
            }

            // Save main user data
            const userData = {
                email: document.getElementById('edit-email').value,
                role: document.getElementById('edit-role').value,
                phone: document.getElementById('edit-phone').value,
                subscription: { plan: document.getElementById('edit-subscription').value },
                isActive: document.getElementById('edit-active').value === 'true',
                aiLocked: document.getElementById('edit-aiLock').value === 'true'
            };

            try {
                // Update user main info
                await apiFetch(`/api/admin/users/${user._id}`, {
                    method: 'PUT',
                    body: JSON.stringify(userData)
                });

                // Update restrictions
                await apiFetch(`/api/admin/users/${user._id}/restrictions`, {
                    method: 'PATCH',
                    body: JSON.stringify(restrictionsPayload)
                });

                // Update overrides one by one (or send all at once? We'll use the PATCH /override endpoint for each)
                for (const [feature, value] of Object.entries(overridesPayload)) {
                    await apiFetch(`/api/admin/users/${user._id}/override`, {
                        method: 'PATCH',
                        body: JSON.stringify({ feature, value })
                    });
                }

                modal.remove();
                await reloadAdmin();
                showToast('User updated successfully', 'success');
            } catch (err) {
                showToast('Failed to update user: ' + err.message, 'error');
            }
        };
    }

    // ========== PAGES (unchanged) ==========
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

    // ========== LOGS (unchanged) ==========
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

    // ========== BROADCAST (unchanged) ==========
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

    // ========== PRIVATE MESSAGES (unchanged) ==========
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

    // ========== MAINTENANCE (unchanged) ==========
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

    // ========== CHARTS (unchanged) ==========
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

    // ========== CREATE USER (unchanged) ==========
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

    // ========== ADD PAGE TO USER (unchanged) ==========
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

    // ========== CLEAR ALL LOGS (unchanged) ==========
    async function clearAllLogs() {
        if (!confirm('Delete ALL logs? Cannot undo.')) return;
        await apiFetch('/api/admin/logs/clear-all', { method: 'DELETE' });
        loadSystemLogs();
        showToast('All logs cleared', 'success');
    }

    // ========== PLAN MANAGEMENT (unchanged) ==========
    async function loadPlans() {
        try {
            const plans = await apiFetch('/api/admin/plans');
            const container = document.getElementById('plans-table-body');
            if (!container) return;
            container.innerHTML = '';
            plans.forEach(plan => {
                const tr = document.createElement('tr');
                const features = plan.features || {};
                tr.innerHTML = `
                    <td><strong>${escapeHtml(plan.label)}</strong> <span style="color:#64748b;font-size:12px;">(${escapeHtml(plan.name)})</span></td>
                    <td>KES ${plan.priceKES} / USD ${plan.priceUSD}</td>
                    <td>${plan.durationDays} days</td>
                    <td>${plan.isActive ? '✅ Active' : '❌ Inactive'}</td>
                    <td>
                        <button class="edit-plan-btn btn btn-secondary btn-sm" data-id="${plan._id}">Edit</button>
                        <button class="delete-plan-btn btn btn-danger btn-sm" data-id="${plan._id}" ${plan.name === 'free' ? 'disabled' : ''}>Delete</button>
                    </td>
                `;
                container.appendChild(tr);
            });
            bindPlanButtons();
        } catch (err) {
            console.error('Failed to load plans:', err);
            showToast('Failed to load plans', 'error');
        }
    }

    function bindPlanButtons() {
        document.querySelectorAll('.edit-plan-btn').forEach(btn => {
            btn.onclick = async () => {
                const planId = btn.dataset.id;
                const plan = await apiFetch(`/api/admin/plans/${planId}`);
                showPlanModal(plan);
            };
        });
        document.querySelectorAll('.delete-plan-btn').forEach(btn => {
            btn.onclick = async () => {
                const planId = btn.dataset.id;
                if (!confirm('Delete this plan? (it will be deactivated)')) return;
                await apiFetch(`/api/admin/plans/${planId}`, { method: 'DELETE' });
                loadPlans();
                showToast('Plan deleted', 'success');
            };
        });
    }

    function showPlanModal(existingPlan = null) {
        const oldModal = document.getElementById('planModal');
        if (oldModal) oldModal.remove();

        const isEdit = !!existingPlan;
        const title = isEdit ? 'Edit Plan' : 'Create New Plan';
        const plan = existingPlan || {
            name: '',
            label: '',
            priceUSD: 0,
            priceKES: 0,
            durationDays: 30,
            isActive: true,
            isDefault: false,
            order: 0,
            features: {
                aiTopics: 0,
                aiPostsPerMonth: 0,
                manualPostsPerMonth: 0,
                pagesAllowed: 0,
                templates: 0,
                ads: false,
                comments: false,
                analyticsAdvanced: false,
                pageProfile: false,
                reports: false,
                broadcastsSend: false,
                teamMembers: 0
            }
        };

        const modal = document.createElement('div');
        modal.id = 'planModal';
        modal.style.cssText = 'position:fixed;top:10%;left:20%;width:60%;max-height:80vh;overflow-y:auto;background:white;padding:24px;border-radius:12px;z-index:9999;box-shadow:0 0 30px rgba(0,0,0,0.3);';
        modal.innerHTML = `
            <h3>${title}</h3>
            <form id="planForm">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <label>Plan Name (internal) <input type="text" id="plan-name" value="${escapeHtml(plan.name)}" ${isEdit ? 'readonly' : ''} required></label>
                    <label>Label (display) <input type="text" id="plan-label" value="${escapeHtml(plan.label)}" required></label>
                    <label>Price USD <input type="number" id="plan-priceUSD" value="${plan.priceUSD}" step="0.01"></label>
                    <label>Price KES <input type="number" id="plan-priceKES" value="${plan.priceKES}" step="1"></label>
                    <label>Duration (days) <input type="number" id="plan-duration" value="${plan.durationDays}" min="1"></label>
                    <label>Order (sort) <input type="number" id="plan-order" value="${plan.order || 0}" step="1"></label>
                    <label><input type="checkbox" id="plan-active" ${plan.isActive ? 'checked' : ''}> Active</label>
                    <label><input type="checkbox" id="plan-default" ${plan.isDefault ? 'checked' : ''}> Default (free plan)</label>
                </div>
                <h4 style="margin-top:16px;">Features</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                    <label>AI Topics <input type="number" id="feature-aiTopics" value="${plan.features.aiTopics}" step="1"> (-1 = unlimited)</label>
                    <label>AI Posts/Month <input type="number" id="feature-aiPostsPerMonth" value="${plan.features.aiPostsPerMonth}" step="1"></label>
                    <label>Manual Posts/Month <input type="number" id="feature-manualPostsPerMonth" value="${plan.features.manualPostsPerMonth}" step="1"></label>
                    <label>Pages Allowed <input type="number" id="feature-pagesAllowed" value="${plan.features.pagesAllowed}" step="1"></label>
                    <label>Templates <input type="number" id="feature-templates" value="${plan.features.templates}" step="1"></label>
                    <label><input type="checkbox" id="feature-ads" ${plan.features.ads ? 'checked' : ''}> Ads</label>
                    <label><input type="checkbox" id="feature-comments" ${plan.features.comments ? 'checked' : ''}> Comments</label>
                    <label><input type="checkbox" id="feature-analyticsAdvanced" ${plan.features.analyticsAdvanced ? 'checked' : ''}> Advanced Analytics</label>
                    <label><input type="checkbox" id="feature-pageProfile" ${plan.features.pageProfile ? 'checked' : ''}> Page Profile</label>
                    <label><input type="checkbox" id="feature-reports" ${plan.features.reports ? 'checked' : ''}> Reports</label>
                    <label><input type="checkbox" id="feature-broadcastsSend" ${plan.features.broadcastsSend ? 'checked' : ''}> Send Broadcasts</label>
                    <label>Team Members <input type="number" id="feature-teamMembers" value="${plan.features.teamMembers}" step="1"></label>
                </div>
                <div style="margin-top:16px; text-align:right;">
                    <button type="button" class="btn btn-primary" id="save-plan-btn">Save</button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('#planModal').remove()">Cancel</button>
                </div>
            </form>
        `;
        document.body.appendChild(modal);

        document.getElementById('save-plan-btn').onclick = async () => {
            const data = {
                name: document.getElementById('plan-name').value.trim(),
                label: document.getElementById('plan-label').value.trim(),
                priceUSD: parseFloat(document.getElementById('plan-priceUSD').value) || 0,
                priceKES: parseFloat(document.getElementById('plan-priceKES').value) || 0,
                durationDays: parseInt(document.getElementById('plan-duration').value) || 30,
                isActive: document.getElementById('plan-active').checked,
                isDefault: document.getElementById('plan-default').checked,
                order: parseInt(document.getElementById('plan-order').value) || 0,
                features: {
                    aiTopics: parseInt(document.getElementById('feature-aiTopics').value) || 0,
                    aiPostsPerMonth: parseInt(document.getElementById('feature-aiPostsPerMonth').value) || 0,
                    manualPostsPerMonth: parseInt(document.getElementById('feature-manualPostsPerMonth').value) || 0,
                    pagesAllowed: parseInt(document.getElementById('feature-pagesAllowed').value) || 0,
                    templates: parseInt(document.getElementById('feature-templates').value) || 0,
                    ads: document.getElementById('feature-ads').checked,
                    comments: document.getElementById('feature-comments').checked,
                    analyticsAdvanced: document.getElementById('feature-analyticsAdvanced').checked,
                    pageProfile: document.getElementById('feature-pageProfile').checked,
                    reports: document.getElementById('feature-reports').checked,
                    broadcastsSend: document.getElementById('feature-broadcastsSend').checked,
                    teamMembers: parseInt(document.getElementById('feature-teamMembers').value) || 0
                }
            };

            try {
                if (isEdit) {
                    await apiFetch(`/api/admin/plans/${plan._id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data)
                    });
                } else {
                    await apiFetch('/api/admin/plans', {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });
                }
                modal.remove();
                loadPlans();
                showToast('Plan saved successfully', 'success');
                if (window.loadPlans) window.loadPlans();
            } catch (err) {
                showToast('Failed to save plan: ' + err.message, 'error');
            }
        };
    }

    // ========== NEW: GLOBAL AUTO-GENERATION TOGGLE ==========
    async function toggleGlobalAutoGen() {
        try {
            const current = document.getElementById('global-auto-gen-toggle')?.checked;
            if (current === undefined) return;
            const enabled = current;
            await apiFetch('/api/admin/auto-generation/global', {
                method: 'PUT',
                body: JSON.stringify({ enabled })
            });
            showToast(`Global auto-generation ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (err) {
            showToast('Failed to toggle: ' + err.message, 'error');
        }
    }

    // ========== NEW: ADMIN EMAIL BROADCAST ==========
    function showEmailModal() {
        const oldModal = document.getElementById('emailModal');
        if (oldModal) oldModal.remove();
        const modal = document.createElement('div');
        modal.id = 'emailModal';
        modal.style.cssText = 'position:fixed;top:10%;left:20%;width:60%;max-height:80vh;overflow-y:auto;background:white;padding:24px;border-radius:12px;z-index:9999;box-shadow:0 0 30px rgba(0,0,0,0.3);';
        modal.innerHTML = `
            <h3>📧 Send Email to Users</h3>
            <form id="emailForm">
                <label>Recipients: 
                    <select id="email-recipients" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                        <option value="all">All Users</option>
                        <option value="selected">Selected Users (comma-separated emails)</option>
                    </select>
                </label>
                <div id="email-users-list" style="display:none;">
                    <input type="text" id="email-users-input" placeholder="user1@example.com, user2@example.com" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;">
                </div>
                <label>Subject: <input type="text" id="email-subject" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;" required></label>
                <label>Message: <textarea id="email-message" rows="5" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #e2e8f0; border-radius:4px;" required></textarea></label>
                <div style="text-align:right;">
                    <button type="button" class="btn btn-primary" id="send-email-btn">Send</button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('#emailModal').remove()">Cancel</button>
                </div>
            </form>
        `;
        document.body.appendChild(modal);

        // Toggle selected users input
        document.getElementById('email-recipients').onchange = function() {
            document.getElementById('email-users-list').style.display = this.value === 'selected' ? 'block' : 'none';
        };

        document.getElementById('send-email-btn').onclick = async () => {
            const recipients = document.getElementById('email-recipients').value;
            const subject = document.getElementById('email-subject').value;
            const message = document.getElementById('email-message').value;
            if (!subject || !message) return showToast('Subject and message required', 'warning');
            let userIds = 'all';
            if (recipients === 'selected') {
                const emails = document.getElementById('email-users-input').value.split(',').map(s => s.trim()).filter(s => s);
                if (!emails.length) return showToast('Enter at least one email', 'warning');
                // Find user IDs by email
                const users = await apiFetch('/api/admin/users');
                const found = users.filter(u => emails.includes(u.email));
                if (!found.length) return showToast('No matching users found', 'error');
                userIds = found.map(u => u._id);
            }
            try {
                await apiFetch('/api/admin/email/send', {
                    method: 'POST',
                    body: JSON.stringify({ userIds, subject, htmlContent: `<p>${message.replace(/\n/g, '<br>')}</p>` })
                });
                showToast('Email sent successfully', 'success');
                modal.remove();
            } catch (err) {
                showToast('Failed to send email: ' + err.message, 'error');
            }
        };
    }

    // ========== INIT ==========

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
            await loadUsersPaginated(0, '');
            await loadPages();
            await loadSystemLogs();
            await loadBroadcasts();
            await populateUserDatalist('private-message-user-email', 'user-datalist-pm');
            await loadPrivateMessages('');
            await loadCharts();
            await loadPlans();
            bindCreateUser();
            bindBroadcastMessage();
            bindMaintenanceButtons();
            const sendMsgBtn = document.getElementById('send-private-msg-btn');
            if (sendMsgBtn) sendMsgBtn.onclick = sendPrivateMessageFromUI;

            const addPlanBtn = document.getElementById('add-plan-btn');
            if (addPlanBtn) addPlanBtn.onclick = () => showPlanModal(null);

            // Add global auto-gen toggle
            const toggleBtn = document.getElementById('global-auto-gen-toggle');
            if (toggleBtn) {
                // Load current setting and set checked state (optional)
                toggleBtn.onchange = toggleGlobalAutoGen;
            }

            // Add email broadcast button
            const emailBtn = document.getElementById('admin-email-btn');
            if (emailBtn) emailBtn.onclick = showEmailModal;

            // Add search listener
            const searchInput = document.getElementById('user-search');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    searchQuery = this.value;
                    currentPage = 0;
                    loadUsersPaginated(currentPage, searchQuery);
                });
            }

            // Auto-refresh
            function refresh() {
                if (!document.hidden) {
                    loadDashboardStats();
                    loadUsersPaginated(currentPage, searchQuery);
                    loadPages();
                    loadPlans();
                }
            }
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(refresh, 60000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && refreshInterval) refresh();
            });
            window.clearAllLogs = clearAllLogs;
            window.showAddPageModal = showAddPageModal;
            // Expose pagination functions globally
            window.loadUsersPaginated = loadUsersPaginated;
            window.searchUsers = searchUsers;
        } catch (err) {
            console.error('Admin init failed:', err);
        }
    }

    init();
})();
