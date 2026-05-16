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

// ============================================
// NEW ADMIN FEATURES (paste at end of admin.js)
// ============================================

// ---------- 1. ADD PAGE TO USER (prompt-based) ----------
async function showAddPageModal() {
  const users = await fetch('/api/admin/users').then(r => r.json());
  const userList = users.map(u => `${u.email} (${u._id})`).join('\n');
  const userId = prompt('Enter User ID (see list below):\n' + userList);
  if (!userId) return;
  const name = prompt('Page Name');
  if (!name) return;
  const pageId = prompt('Facebook Page ID');
  if (!pageId) return;
  const pageToken = prompt('Facebook Page Access Token');
  if (!pageToken) return;

  await fetch('/api/admin/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name, pageId, pageToken })
  });
  alert('Page added');
  location.reload(); // or call loadPages() if available
}

// ---------- 2. EDIT PAGE (already in previous code, but attach to new button if needed) ----------
// (the editPage function is already defined in previous JS)

// ---------- 3. SEND PRIVATE MESSAGE (from HTML inputs) ----------
async function sendPrivateMessageFromUI() {
  const userId = document.getElementById('private-message-user-id').value;
  const message = document.getElementById('private-message-text').value;
  if (!userId || !message) {
    alert('User ID and message are required');
    return;
  }
  await fetch(`/api/admin/message/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  alert('Private message sent');
  document.getElementById('private-message-text').value = '';
}

// ---------- 4. FETCH ALL POSTS (requires backend endpoint) ----------
// NOTE: This assumes you have a GET /api/admin/posts endpoint.
// If not, you need to create it or adjust. For now, it will show an error.
async function fetchAllPosts() {
  try {
    const res = await fetch('/api/admin/posts');
    if (!res.ok) throw new Error('Posts endpoint not available');
    return await res.json();
  } catch (err) {
    console.error(err);
    alert('Cannot fetch posts. Backend endpoint GET /api/admin/posts is missing.');
    return [];
  }
}

async function loadPostsTable() {
  const tbody = document.getElementById('admin-posts-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
  const posts = await fetchAllPosts();
  if (!posts.length) {
    tbody.innerHTML = '<tr><td colspan="4">No posts found</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  posts.forEach(post => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = post._id;
    row.insertCell(1).textContent = post.content?.substring(0, 80) || '(no text)';
    row.insertCell(2).textContent = post.status || 'pending';
    const actionsCell = row.insertCell(3);
    const forceBtn = document.createElement('button');
    forceBtn.textContent = 'Force Publish';
    forceBtn.onclick = () => forcePublishPost(post._id);
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => deleteAnyPost(post._id);
    actionsCell.appendChild(forceBtn);
    actionsCell.appendChild(deleteBtn);
  });
}

async function forcePublishPost(postId) {
  if (!confirm('Force-publish this post immediately?')) return;
  await fetch(`/api/admin/posts/${postId}/force-publish`, { method: 'PATCH' });
  alert('Post forced to publish');
  await loadPostsTable();
}

async function deleteAnyPost(postId) {
  if (!confirm('Permanently delete this post?')) return;
  await fetch(`/api/admin/posts/${postId}`, { method: 'DELETE' });
  alert('Post deleted');
  await loadPostsTable();
}

// ---------- 5. CREATE USER WITH PAGES (from HTML dynamic form) ----------
function addPageEntry() {
  const container = document.getElementById('pages-list-container');
  const entryDiv = document.createElement('div');
  entryDiv.className = 'page-entry';
  entryDiv.innerHTML = `
    <input type="text" placeholder="Page Name" class="page-name">
    <input type="text" placeholder="Facebook Page ID" class="page-id">
    <input type="text" placeholder="Page Token" class="page-token">
    <button type="button" class="remove-page-btn">Remove</button>
  `;
  container.appendChild(entryDiv);
  entryDiv.querySelector('.remove-page-btn').onclick = () => entryDiv.remove();
}

async function createUserWithPagesFromUI() {
  const email = document.getElementById('advanced-user-email').value;
  const password = document.getElementById('advanced-user-password').value;
  const role = document.getElementById('advanced-user-role').value;
  const phone = document.getElementById('advanced-user-phone').value;

  if (!email || !password) {
    alert('Email and password are required');
    return;
  }

  const pages = [];
  document.querySelectorAll('#pages-list-container .page-entry').forEach(entry => {
    const name = entry.querySelector('.page-name').value;
    const pageId = entry.querySelector('.page-id').value;
    const pageToken = entry.querySelector('.page-token').value;
    if (name && pageId && pageToken) {
      pages.push({ name, pageId, pageToken });
    }
  });

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role, phone, pages })
  });
  const data = await res.json();
  if (data.error) alert(data.error);
  else {
    alert('User created with pages');
    location.reload();
  }
}

// ---------- 6. EXTEND EXISTING USER TABLE (add "Message" button) ----------
// This runs after the original loadUsers() to inject a "Message" button in each row.
function addMessageButtonsToUsers() {
  const rows = document.querySelectorAll('#admin-users-table tr');
  rows.forEach(row => {
    const actionsCell = row.querySelector('td:last-child');
    if (!actionsCell) return;
    // find user ID from any existing button
    const editBtn = actionsCell.querySelector('.edit-user');
    if (!editBtn) return;
    const userId = editBtn.dataset.id;
    // avoid duplicate
    if (actionsCell.querySelector('.user-message-btn')) return;
    const msgBtn = document.createElement('button');
    msgBtn.textContent = 'Message';
    msgBtn.className = 'user-message-btn';
    msgBtn.onclick = () => {
      const msg = prompt('Enter private message for this user:');
      if (msg) {
        fetch(`/api/admin/message/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        }).then(() => alert('Message sent'));
      }
    };
    actionsCell.appendChild(msgBtn);
  });
}

// ---------- 7. HOOK EVERYTHING AFTER PAGE LOAD ----------
// Wait for DOM and for original admin.js to finish, then attach new listeners.
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for original loadUsers() to run, then add message buttons
  setTimeout(() => {
    addMessageButtonsToUsers();
  }, 1000);

  // New buttons
  const addPageBtn = document.getElementById('add-page-btn');
  if (addPageBtn) addPageBtn.onclick = showAddPageModal;

  const sendPrivateBtn = document.getElementById('send-private-msg-btn');
  if (sendPrivateBtn) sendPrivateBtn.onclick = sendPrivateMessageFromUI;

  const refreshPostsBtn = document.getElementById('refresh-posts-btn');
  if (refreshPostsBtn) refreshPostsBtn.onclick = loadPostsTable;

  const addPageEntryBtn = document.getElementById('add-page-entry-btn');
  if (addPageEntryBtn) addPageEntryBtn.onclick = addPageEntry;

  const advancedCreateBtn = document.getElementById('advanced-create-user-btn');
  if (advancedCreateBtn) advancedCreateBtn.onclick = createUserWithPagesFromUI;

  // Also re-run message button injection after any user table refresh (if you have reloadAdmin)
  const originalReloadAdmin = window.reloadAdmin;
  if (originalReloadAdmin) {
    window.reloadAdmin = async function() {
      await originalReloadAdmin();
      addMessageButtonsToUsers();
    };
  }
});
