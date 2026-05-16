document.addEventListener('DOMContentLoaded', async () => {

    try {

        // =========================================
        // SESSION CHECK
        // =========================================

        const sessionRes =
            await fetch('/api/session');

        const session =
            await sessionRes.json();

        const role = session.role || session.user?.role;
const isAdmin = role === 'admin';
        console.log("SESSION:", session);
console.log("ROLE:", role);
console.log("IS ADMIN:", isAdmin);

        // SHOW ADMIN NAV
        if (isAdmin) {
    const adminNav = document.getElementById('admin-nav-link');
    if (adminNav) adminNav.style.display = 'block';
    }

        // LOAD EVERYTHING
        await loadDashboardStats();
        await loadUsers();
        await loadPages();
        await loadSystemLogs();

        // CHARTS
        await loadCharts();

        // EVENTS
        bindCreateUser();
        bindBroadcastMessage();
        bindMaintenanceButtons();

        // AUTO REFRESH
        setInterval(async () => {

            await loadDashboardStats();
            await loadUsers();
            await loadPages();

        }, 60000);

    } catch (err) {

        console.error(err);
    }

});

/* ====================================================
   DASHBOARD STATS
==================================================== */

async function loadDashboardStats() {

    try {

        const res =
            await fetch('/api/admin/stats');

        const stats =
            await res.json();

        setText('stat-total-users', stats.totalUsers);
        setText('stat-active-users', stats.activeUsers);
        setText('stat-suspended-users', stats.suspendedUsers);
        setText('stat-total-pages', stats.totalPages);
        setText('stat-total-posts', stats.totalPosts);

        window.adminStats = stats;

    } catch (err) {

        console.error(err);
    }
}

/* ====================================================
   USERS
==================================================== */

async function loadUsers() {

    try {

        const res =
            await fetch('/api/admin/users');

        const users =
            await res.json();

        const tbody =
            document.getElementById(
                'admin-users-table'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        users.forEach(user => {

            const tr =
                document.createElement('tr');

            tr.innerHTML = `

                <td>${user.email}</td>

                <td>${user.role}</td>

                <td>${user.phone || '-'}</td>

                <td>
                    ${user.subscription?.plan || 'free'}
                </td>

                <td>
                    ${user.isActive
                        ? '✅ Active'
                        : '❌ Suspended'}
                </td>

                <td>
                    ${user.aiLocked
                        ? '🔒 Locked'
                        : '🟢 Open'}
                </td>

                <td>

                    <button class="edit-user"
                        data-id="${user._id}">
                        Edit
                    </button>

                    <button class="reset-password"
                        data-id="${user._id}">
                        Reset Password
                    </button>

                    <button class="suspend-user"
                        data-id="${user._id}">
                        Suspend
                    </button>

                    <button class="reactivate-user"
                        data-id="${user._id}">
                        Activate
                    </button>

                    <button class="lock-ai"
                        data-id="${user._id}">
                        Lock AI
                    </button>

                    <button class="unlock-ai"
                        data-id="${user._id}">
                        Unlock AI
                    </button>

                    <button class="delete-user"
                        data-id="${user._id}">
                        Delete
                    </button>

                </td>
            `;

            tbody.appendChild(tr);

        });

        bindUserButtons();

    } catch (err) {

        console.error(err);
    }
}

/* ====================================================
   USER BUTTONS
==================================================== */

function bindUserButtons() {

    // SUSPEND
    document.querySelectorAll('.suspend-user')
        .forEach(btn => {

            btn.onclick = async () => {

                await fetch(
                    `/api/admin/users/${btn.dataset.id}/suspend`,
                    { method: 'PATCH' }
                );

                await reloadAdmin();
            };
        });

    // ACTIVATE
    document.querySelectorAll('.reactivate-user')
        .forEach(btn => {

            btn.onclick = async () => {

                await fetch(
                    `/api/admin/users/${btn.dataset.id}/reactivate`,
                    { method: 'PATCH' }
                );

                await reloadAdmin();
            };
        });

    // LOCK AI
    document.querySelectorAll('.lock-ai')
        .forEach(btn => {

            btn.onclick = async () => {

                await fetch(
                    `/api/admin/users/${btn.dataset.id}/lock-ai`,
                    { method: 'PATCH' }
                );

                await reloadAdmin();
            };
        });

    // UNLOCK AI
    document.querySelectorAll('.unlock-ai')
        .forEach(btn => {

            btn.onclick = async () => {

                await fetch(
                    `/api/admin/users/${btn.dataset.id}/unlock-ai`,
                    { method: 'PATCH' }
                );

                await reloadAdmin();
            };
        });

    // DELETE USER
    document.querySelectorAll('.delete-user')
        .forEach(btn => {

            btn.onclick = async () => {

                const ok =
                    confirm(
                        'Delete user permanently?'
                    );

                if (!ok) return;

                await fetch(
                    `/api/admin/users/${btn.dataset.id}`,
                    { method: 'DELETE' }
                );

                await reloadAdmin();
            };
        });

    // RESET PASSWORD
    document.querySelectorAll('.reset-password')
        .forEach(btn => {

            btn.onclick = async () => {

                const newPassword =
                    prompt('Enter new password');

                if (!newPassword) return;

                await fetch(
                    `/api/admin/users/${btn.dataset.id}/reset-password`,
                    {
                        method: 'PATCH',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            newPassword
                        })
                    }
                );

                alert('Password reset successful');
            };
        });

    // EDIT USER
    document.querySelectorAll('.edit-user')
        .forEach(btn => {

            btn.onclick = async () => {

                const email =
                    prompt('New Email');

                const role =
                    prompt('Role');

                const phone =
                    prompt('Phone');

                await fetch(
                    `/api/admin/users/${btn.dataset.id}`,
                    {
                        method: 'PUT',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            email,
                            role,
                            phone
                        })
                    }
                );

                await reloadAdmin();
            };
        });
}

/* ====================================================
   CREATE USER
==================================================== */

function bindCreateUser() {

    const btn =
        document.getElementById(
            'admin-create-user-btn'
        );

    if (!btn) return;

    btn.onclick = async () => {

        try {

            const email =
                document.getElementById(
                    'admin-user-email'
                ).value;

            const password =
                document.getElementById(
                    'admin-user-password'
                ).value;

            const role =
                document.getElementById(
                    'admin-user-role'
                ).value;

            const phone =
                document.getElementById(
                    'admin-user-phone'
                ).value;

            const res =
                await fetch(
                    '/api/admin/users',
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            email,
                            password,
                            role,
                            phone
                        })
                    }
                );

            const data =
                await res.json();

            if (data.error) {
                return alert(data.error);
            }

            alert('User created');

            await reloadAdmin();

        } catch (err) {

            console.error(err);
        }
    };
}

/* ====================================================
   LOAD PAGES
==================================================== */

async function loadPages() {

    try {

        const res =
            await fetch('/api/admin/pages');

        const pages =
            await res.json();

        const tbody =
            document.getElementById(
                'admin-pages-table'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        pages.forEach(page => {

            const tr =
                document.createElement('tr');

            tr.innerHTML = `

                <td>${page.name}</td>

                <td>${page.pageId}</td>

                <td>
                    ${page.userId?.email || '-'}
                </td>

                <td>
                    ${page.autoGenerationEnabled
                        ? 'Enabled'
                        : 'Disabled'}
                </td>

                <td>

                    <button class="delete-page"
                        data-id="${page._id}">
                        Delete
                    </button>

                </td>
            `;

            tbody.appendChild(tr);

        });

        // DELETE PAGE
        document.querySelectorAll('.delete-page')
            .forEach(btn => {

                btn.onclick = async () => {

                    const ok =
                        confirm(
                            'Delete page?'
                        );

                    if (!ok) return;

                    await fetch(
                        `/api/admin/pages/${btn.dataset.id}`,
                        {
                            method: 'DELETE'
                        }
                    );

                    await reloadAdmin();
                };
            });

    } catch (err) {

        console.error(err);
    }
}

/* ====================================================
   SYSTEM LOGS
==================================================== */

async function loadSystemLogs() {

    try {

        const res =
            await fetch('/api/admin/logs');

        const data =
            await res.json();

        const container =
            document.getElementById(
                'admin-logs'
            );

        if (!container) return;

        container.innerHTML = '';

        data.logs.forEach(log => {

            const div =
                document.createElement('div');

            div.classList.add('log');

            div.innerHTML = `

                <strong>
                    ${log.action}
                </strong>

                <p>${log.message}</p>

                <small>
                    ${new Date(
                        log.createdAt
                    ).toLocaleString()}
                </small>
            `;

            container.appendChild(div);

        });

    } catch (err) {

        console.error(err);
    }
}

/* ====================================================
   BROADCAST MESSAGE
==================================================== */

function bindBroadcastMessage() {

    const btn =
        document.getElementById(
            'broadcast-btn'
        );

    if (!btn) return;

    btn.onclick = async () => {

        const message =
            document.getElementById(
                'broadcast-message'
            ).value;

        if (!message) {
            return alert('Enter message');
        }

        await fetch(
            '/api/admin/broadcast',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify({
                    message
                })
            }
        );

        alert('Broadcast sent');
    };
}

/* ====================================================
   MAINTENANCE MODE
==================================================== */

function bindMaintenanceButtons() {

    const onBtn =
        document.getElementById(
            'maintenance-on'
        );

    const offBtn =
        document.getElementById(
            'maintenance-off'
        );

    if (onBtn) {

        onBtn.onclick = async () => {

            await fetch(
                '/api/admin/maintenance/on',
                {
                    method: 'PATCH'
                }
            );

            alert(
                'Maintenance mode enabled'
            );
        };
    }

    if (offBtn) {

        offBtn.onclick = async () => {

            await fetch(
                '/api/admin/maintenance/off',
                {
                    method: 'PATCH'
                }
            );

            alert(
                'Maintenance mode disabled'
            );
        };
    }
}

/* ====================================================
   CHARTS
==================================================== */

async function loadCharts() {

    if (!window.Chart) return;

    const stats =
        window.adminStats;

    if (!stats) return;

    // USERS PIE
    const usersCtx =
        document.getElementById(
            'usersChart'
        );

    if (usersCtx) {

        new Chart(usersCtx, {

            type: 'pie',

            data: {

                labels: [
                    'Active',
                    'Suspended'
                ],

                datasets: [{
                    data: [
                        stats.activeUsers,
                        stats.suspendedUsers
                    ]
                }]
            }
        });
    }

    // POSTS BAR
    const postsCtx =
        document.getElementById(
            'postsChart'
        );

    if (postsCtx) {

        new Chart(postsCtx, {

            type: 'bar',

            data: {

                labels:
                    stats.postsPerUser.map(
                        p => p.email
                    ),

                datasets: [{
                    label: 'Posts',

                    data:
                        stats.postsPerUser.map(
                            p => p.posts
                        )
                }]
            }
        });
    }
}

/* ====================================================
   HELPERS
==================================================== */

function setText(id, value) {

    const el =
        document.getElementById(id);

    if (el) {
        el.textContent = value;
    }
}

async function reloadAdmin() {

    await loadDashboardStats();
    await loadUsers();
    await loadPages();
    await loadCharts();
}
