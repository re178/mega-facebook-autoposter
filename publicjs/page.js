document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('pageId'); // expects ?pageId=xxx

  if (!pageId) {
    alert('Page ID not provided in URL');
    return;
  }

  const pageTitle = document.getElementById('page-title');
  const postsTableBody = document.getElementById('posts-table-body');
  const logsContainer = document.getElementById('logs-container');

  const postText = document.getElementById('post-text');
  const mediaUrl = document.getElementById('media-url');
  const scheduledTime = document.getElementById('scheduled-time');

  const postNowBtn = document.getElementById('post-now');
  const savePostBtn = document.getElementById('save-post');

  // === Fetch page info ===
  const page = await getPageInfo(pageId);
  pageTitle.textContent = page.name;

  // === Load posts ===
  async function loadPosts() {
    const posts = await getPagePosts(pageId);
    postsTableBody.innerHTML = '';

    posts.forEach(post => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${post.text}</td>
        <td>${post.mediaUrl || '-'}</td>
        <td>${new Date(post.scheduledTime).toLocaleString()}</td>
        <td>${post.status}</td>
        <td>
          <button class="edit-post" data-id="${post._id}">Edit</button>
          <button class="delete-post" data-id="${post._id}">Delete</button>
        </td>
      `;
      postsTableBody.appendChild(tr);
    });

    // Attach delete/edit handlers
    document.querySelectorAll('.delete-post').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deletePost(btn.dataset.id);
        await loadPosts();
      });
    });

    document.querySelectorAll('.edit-post').forEach(btn => {
      btn.addEventListener('click', async () => {
        const post = (await getPagePosts(pageId)).find(p => p._id === btn.dataset.id);
        postText.value = post.text;
        mediaUrl.value = post.mediaUrl;
        scheduledTime.value = new Date(post.scheduledTime).toISOString().slice(0,16);

        savePostBtn.onclick = async () => {
          await editPost(post._id, {
            text: postText.value,
            mediaUrl: mediaUrl.value,
            scheduledTime: scheduledTime.value
          });
          await loadPosts();
          postText.value = '';
          mediaUrl.value = '';
          scheduledTime.value = '';
        };
      });
    });
  }

  await loadPosts();

  // === Create / Post Now ===
  postNowBtn.addEventListener('click', async () => {
    const now = new Date().toISOString();
    await createPost(pageId, postText.value, mediaUrl.value, now);
    postText.value = '';
    mediaUrl.value = '';
    scheduledTime.value = '';
    await loadPosts();
  });

  savePostBtn.addEventListener('click', async () => {
    const schedule = scheduledTime.value ? new Date(scheduledTime.value).toISOString() : new Date().toISOString();
    await createPost(pageId, postText.value, mediaUrl.value, schedule);
    postText.value = '';
    mediaUrl.value = '';
    scheduledTime.value = '';
    await loadPosts();
  });

  // === Load logs ===
  async function loadLogs() {
    const logs = await getPageLogs(pageId);
    logsContainer.innerHTML = '';
    logs.forEach(log => {
      const div = document.createElement('div');
      div.classList.add('log');
      div.innerHTML = `<span>${log.action} - ${log.message}</span>
                       <span>${new Date(log.createdAt).toLocaleString()}</span>`;
      logsContainer.appendChild(div);
    });
  }

  await loadLogs();

  // Refresh posts/logs every 30 sec
  setInterval(async () => {
    await loadPosts();
    await loadLogs();
  }, 30000);
});

