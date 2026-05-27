// ========== Page selection modal (when clicking "Pages" nav) ==========
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
        // Fetch fresh pages list (in case it changed)
        fetch('/api/dashboard/pages', { credentials: 'include' })
            .then(r => r.json())
            .then(pages => {
                if (!pages.length) {
                    alert('No pages available');
                    return;
                }
                const select = pageModal.querySelector('#page-select');
                select.innerHTML = '';
                pages.forEach(p => {
                    const opt = document.createElement('option');
                    // ✅ IMPORTANT: Use the Facebook page ID (p.pageId), not MongoDB _id
                    opt.value = p.pageId;
                    opt.textContent = p.name;
                    select.appendChild(opt);
                });
                pageModal.style.display = 'flex';
            })
            .catch(err => alert('Could not load pages'));
    });

    const cancelBtn = pageModal.querySelector('#page-cancel');
    const goBtn = pageModal.querySelector('#page-go');
    cancelBtn.onclick = () => pageModal.style.display = 'none';
    goBtn.onclick = () => {
        const selectedPageId = pageModal.querySelector('#page-select').value;
        if (!selectedPageId) {
            alert('Please select a page');
            return;
        }
        pageModal.style.display = 'none';
        const url = new URL('/pages', window.location.origin);
        url.searchParams.set('pageId', selectedPageId);
        console.log('Redirecting to:', url.toString());
        window.location.href = url.toString();
    };
          }
