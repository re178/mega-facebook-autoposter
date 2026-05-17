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
                await fetch(`/api/admin/users/${btn.dataset.id}/suspend`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });

    // ACTIVATE
    document.querySelectorAll('.reactivate-user')
        .forEach(btn => {
            btn.onclick = async () => {
                await fetch(`/api/admin/users/${btn.dataset.id}/reactivate`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });

    // LOCK AI
    document.querySelectorAll('.lock-ai')
        .forEach(btn => {
            btn.onclick = async () => {
                await fetch(`/api/admin/users/${btn.dataset.id}/lock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });

    // UNLOCK AI
    document.querySelectorAll('.unlock-ai')
        .forEach(btn => {
            btn.onclick = async () => {
                await fetch(`/api/admin/users/${btn.dataset.id}/unlock-ai`, { method: 'PATCH' });
                await reloadAdmin();
            };
        });

    // DELETE USER
    document.querySelectorAll('.delete-user')
        .forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Delete user permanently?')) return;
                await fetch(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                await reloadAdmin();
            };
        });

    // RESET PASSWORD
    document.querySelectorAll('.reset-password')
        .forEach(btn => {
            btn.onclick = async () => {
                const newPassword = prompt('Enter new password');
                if (!newPassword) return;
                await fetch(`/api/admin/users/${btn.dataset.id}/reset-password`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newPassword })
                });
                alert('Password reset successful');
            };
        });

    // EDIT USER (MODAL WITH DROPDOWNS)
    document.querySelectorAll('.edit-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.id;
            const user = await fetch(`/api/admin/users/${userId}`).then(r => r.json());
            if (!user) return;
            
            let modal = document.getElementById('editUserModal');
            if (!modal) {
                modal = document.createElement('div');
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
            }
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
                await fetch(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                modal.style.display = 'none';
                await reloadAdmin();
            };
            document.getElementById('close-user-modal').onclick = () => modal.style.display = 'none';
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

     <button class="edit-page-btn" data-id="${page._id}" data-name="${escapeHtml(page.name)}" data-pageid="${page.pageId}" data-token="${page.pageToken}">Edit</button>
     <button class="delete-page" data-id="${page._id}">Delete</button>   

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
                <strong>${log.action}</strong>
                <p>${log.message}</p>
                <small>${new Date(log.createdAt).toLocaleString()}</small>
                <button class="delete-log" data-id="${log._id}" data-type="log">Delete</button>
            `;

            container.appendChild(div);
                        const delBtn = div.querySelector('.delete-log');
            delBtn.onclick = async () => {
                if (confirm('Delete this log entry?')) {
                    await fetch(`/api/admin/logs/${delBtn.dataset.id}`, { method: 'DELETE' });
                    loadSystemLogs();
                }
            };

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

window.reloadAdmin = async function() {

    await loadDashboardStats();
    await loadUsers();
    await loadPages();
    await loadCharts();
}

// ============================================
// NEW ADMIN FEATURES (FULL REPLACEMENT)
// ============================================

// ---------- USER SEARCH DATALIST HELPER ----------
async function populateUserDatalist(inputId, datalistId) {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
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
}

// ---------- LOAD BROADCASTS WITH EDIT/DELETE ----------
async function loadBroadcasts() {
  const res = await fetch('/api/admin/broadcast');
  const broadcasts = await res.json();
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
  // Edit broadcast
  document.querySelectorAll('.edit-broadcast').forEach(btn => {
    btn.onclick = () => {
      const newMsg = prompt('Edit broadcast message', btn.dataset.msg);
      if (newMsg) {
        fetch(`/api/admin/broadcast/${btn.dataset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: newMsg })
        }).then(() => loadBroadcasts());
      }
    };
  });
  // Delete broadcast
  document.querySelectorAll('.delete-broadcast').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Delete this broadcast?')) {
        await fetch(`/api/admin/broadcast/${btn.dataset.id}`, { method: 'DELETE' });
        loadBroadcasts();
      }
    };
  });
}

// ---------- LOAD PRIVATE MESSAGES WITH EDIT/DELETE ----------
async function loadPrivateMessages(userId) {
  const url = userId ? `/api/admin/messages?userId=${userId}` : '/api/admin/messages';
  const res = await fetch(url);
  const messages = await res.json();
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
      <strong>To: ${userEmail}</strong><br>
      ${escapeHtml(msg.message)}<br>
      <small>${new Date(msg.createdAt).toLocaleString()}</small><br>
      <button class="edit-pm" data-id="${msg._id}" data-text="${escapeHtml(msg.message)}">Edit</button>
      <button class="delete-pm" data-id="${msg._id}">Delete</button>
    `;
    container.appendChild(div);
  }
  // Edit PM
  document.querySelectorAll('.edit-pm').forEach(btn => {
    btn.onclick = () => {
      const newText = prompt('Edit message', btn.dataset.text);
      if (newText) {
        fetch(`/api/admin/message/${btn.dataset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: newText })
        }).then(() => loadPrivateMessages(userId));
      }
    };
  });
  // Delete PM
  document.querySelectorAll('.delete-pm').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await fetch(`/api/admin/message/${btn.dataset.id}`, { method: 'DELETE' });
        loadPrivateMessages(userId);
      }
    };
  });
}

// ---------- SEND PRIVATE MESSAGE WITH SEARCH ----------
async function sendPrivateMessageFromUI() {  // keep same name to avoid breaking existing calls
  const input = document.getElementById('private-message-user-email');
  if (!input) return;
  const userEmail = input.value;
  const message = document.getElementById('private-message-text').value;
  if (!userEmail || !message) return alert('User email and message required');
  const users = await fetch('/api/admin/users').then(r => r.json());
  const user = users.find(u => u.email === userEmail);
  if (!user) return alert('User not found');
  await fetch(`/api/admin/message/${user._id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  alert('Message sent');
  document.getElementById('private-message-text').value = '';
  loadPrivateMessages(user._id);
}

// ---------- CLEAR ALL LOGS ----------
async function clearAllLogs() {
  if (!confirm('Delete ALL logs? Cannot undo.')) return;
  await fetch('/api/admin/logs/clear-all', { method: 'DELETE' });
  loadSystemLogs(); // this will refresh
}

// ---------- ADD PAGE TO USER (SEARCH MODAL) ----------
async function showAddPageModal() {
  let modal = document.getElementById('addPageModal');
  if (!modal) {
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
  }
  modal.style.display = 'block';
  document.getElementById('confirm-add-page').onclick = async () => {
    const userEmail = document.getElementById('page-user-email').value;
    const users = await fetch('/api/admin/users').then(r => r.json());
    const user = users.find(u => u.email === userEmail);
    if (!user) return alert('User not found');
    const payload = {
      userId: user._id,
      name: document.getElementById('page-name').value,
      pageId: document.getElementById('page-id').value,
      pageToken: document.getElementById('page-token').value
    };
    if (!payload.name || !payload.pageId || !payload.pageToken) return alert('All fields required');
    await fetch('/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    modal.style.display = 'none';
    await reloadAdmin();
  };
  document.getElementById('close-addpage-modal').onclick = () => modal.style.display = 'none';
}

// ---------- ESCAPE HTML HELPER ----------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
