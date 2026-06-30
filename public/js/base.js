document.addEventListener('DOMContentLoaded', function () {
    renderSiteTitle();
    renderMenu();
    initMenuEvents();
    initCopyButtons();
});

function renderSiteTitle() {
    const currentPath = window.location.pathname.toLowerCase();
    let moduleTitle = (typeof siteConfig !== 'undefined' && siteConfig.siteName) ? siteConfig.siteName : 'Tool Basecamp';

    if (typeof toolsConfig !== 'undefined' && toolsConfig.groups) {
        const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase().split('?')[0];
        for (const group of toolsConfig.groups) {
            if (group.items && group.items.some(item => item.url.toLowerCase().endsWith(currentFile))) {
                moduleTitle = group.title;
                break;
            }
        }
    }

    document.title = moduleTitle;
    const logoTitleEl = document.querySelector('.logo h2');
    if (logoTitleEl) logoTitleEl.textContent = moduleTitle;
}

function renderMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isInSubDir = currentPath.includes('/html/');

    let detectedGroupTitle = null;
    if (typeof toolsConfig !== 'undefined') {
        const currentFileName = currentPage.split('?')[0];
        for (const group of toolsConfig.groups) {
            if (group.items && group.items.some(item => item.url.toLowerCase().endsWith(currentFileName))) {
                detectedGroupTitle = group.title;
                break;
            }
        }
    }

    let moduleTitle = detectedGroupTitle || ((typeof siteConfig !== 'undefined' && siteConfig.siteName) ? siteConfig.siteName : 'Tool Basecamp');

    let menuItemsHTML = '';
    if (typeof toolsConfig !== 'undefined' && toolsConfig.groups && detectedGroupTitle) {
        toolsConfig.groups.forEach(group => {
            if (group.title !== detectedGroupTitle) return;
            if (group.title) {
                menuItemsHTML += `<li class="menu-group-title">${group.title}</li>`;
            }
            if (Array.isArray(group.items)) {
                group.items.forEach(item => {
                    let linkUrl = item.url;
                    if (isInSubDir) linkUrl = '../../' + item.url;
                    const itemUrlLower = item.url.toLowerCase();
                    const isActive = currentPath.endsWith(itemUrlLower) || currentPage === itemUrlLower.split('/').pop();
                    menuItemsHTML += `<li${isActive ? ' class="active"' : ''}><a href="${linkUrl}">${item.title}</a></li>`;
                });
            }
        });
    }

    sidebar.innerHTML = `
        <div class="logo">
            <div class="logo-header">
                <div class="logo-badge">${(typeof siteConfig !== 'undefined' && siteConfig.logoText) || 'TB'}</div>
                <h2>${moduleTitle}</h2>
            </div>
            <div id="sidebar-user-meta" class="user-meta"></div>
        </div>
        <nav class="menu">
            <ul>${menuItemsHTML}</ul>
        </nav>
        <div style="padding:20px 10px;border-top:1px solid #f3f4f6;text-align:center;font-size:12px;color:#9ca3af;margin-top:auto;">
            <p>&copy; 2026 ${(typeof siteConfig !== 'undefined' && siteConfig.siteName) || 'Tool Basecamp'}</p>
        </div>
    `;

    bindToolSidebarMobile(sidebar);
}

function bindToolSidebarMobile(sidebar) {
    const content = document.querySelector('.container .content');
    if (!content || !sidebar) return;

    const path = window.location.pathname || '';
    const isInSubDir = path.includes('/html/');
    const homeHref = isInSubDir ? '../../tool.html' : 'tool.html';

    let bar = content.querySelector('.tool-mobile-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'tool-mobile-bar';
        bar.innerHTML =
            '<button type="button" class="tool-menu-toggle" aria-label="Open menu">&#9776;</button>' +
            '<span class="tool-mobile-title"></span>' +
            '<a class="tool-mobile-home" href="#">Tools</a>';
        content.insertBefore(bar, content.firstChild);
    }

    const titleEl = bar.querySelector('.tool-mobile-title');
    const h2 = sidebar.querySelector('.logo h2');
    if (titleEl && h2) titleEl.textContent = h2.textContent;

    const homeLink = bar.querySelector('.tool-mobile-home');
    if (homeLink) homeLink.href = homeHref;

    let overlay = document.getElementById('tool-sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tool-sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    const close = () => {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-visible');
        document.body.style.overflow = '';
    };

    const open = () => {
        sidebar.classList.add('is-open');
        overlay.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
    };

    const toggleBtn = bar.querySelector('.tool-menu-toggle');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            if (sidebar.classList.contains('is-open')) close();
            else open();
        };
    }

    overlay.onclick = close;

    if (!window.__toolMobileSidebarGlobalBound) {
        window.__toolMobileSidebarGlobalBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.sidebar.is-open').forEach(s => s.classList.remove('is-open'));
            const o = document.getElementById('tool-sidebar-overlay');
            if (o) o.classList.remove('is-visible');
            document.body.style.overflow = '';
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 768) return;
            document.querySelectorAll('.sidebar.is-open').forEach(s => s.classList.remove('is-open'));
            const o = document.getElementById('tool-sidebar-overlay');
            if (o) o.classList.remove('is-visible');
            document.body.style.overflow = '';
        });
    }

    if (!sidebar.dataset.mobileNavCloseBound) {
        sidebar.dataset.mobileNavCloseBound = '1';
        sidebar.addEventListener('click', (e) => {
            const a = e.target.closest('a');
            if (a && a.getAttribute('href') && a.getAttribute('href') !== '#') close();
        });
    }
}

function initMenuEvents() {
    const menuItems = document.querySelectorAll('.menu li:not(.menu-group-title)');
    menuItems.forEach(item => {
        const link = item.querySelector('a');
        if (link) {
            link.addEventListener('click', function () {
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        }
    });
}

function initCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            copyCodeToClipboard(this.getAttribute('data-target'), this);
        });
    });
}

function copyCodeToClipboard(elementId, button) {
    const codeElement = document.getElementById(elementId);
    if (!codeElement) return;
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = codeElement.textContent;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');
    document.body.removeChild(tempTextArea);
    const originalText = button.innerText;
    button.innerText = 'Copied!';
    setTimeout(() => { button.innerText = originalText; }, 1500);
}

function setCodeContent(elementId, code) {
    const codeElement = document.getElementById(elementId);
    if (codeElement) codeElement.textContent = code;
}

function clearCodeContent(elementIds) {
    elementIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '';
    });
}

window.setCodeContent = setCodeContent;
window.clearCodeContent = clearCodeContent;
