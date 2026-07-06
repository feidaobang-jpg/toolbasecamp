document.addEventListener('DOMContentLoaded', function () {
    renderSiteTitle();
    renderMenu();
    initMenuEvents();
    initCopyButtons();
});

function getToolRootPrefix() {
    const path = window.location.pathname || '';
    return path.includes('/html/') ? '../../' : '';
}

function resolveToolUrl(relativePath) {
    const base = getToolRootPrefix();
    const path = (relativePath || '').replace(/^\//, '');
    return base + path;
}

function getCurrentToolContext() {
    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase().split('?')[0];
    let groupTitle = null;
    let toolTitle = null;

    if (typeof toolsConfig !== 'undefined' && toolsConfig.groups) {
        for (const group of toolsConfig.groups) {
            if (!group.items) continue;
            for (const item of group.items) {
                const itemFile = item.url.toLowerCase().split('/').pop();
                if (currentPath.endsWith(item.url.toLowerCase()) || currentPage === itemFile) {
                    groupTitle = group.title;
                    toolTitle = item.title;
                    break;
                }
            }
            if (toolTitle) break;
        }
    }

    return { groupTitle, toolTitle, currentPage };
}

function renderSiteTitle() {
    const { groupTitle, toolTitle } = getCurrentToolContext();
    let moduleTitle = (typeof siteConfig !== 'undefined' && siteConfig.siteName) ? siteConfig.siteName : 'Tool Basecamp';

    if (groupTitle) {
        moduleTitle = groupTitle;
    }

    if (toolTitle) {
        document.title = toolTitle + ' - Tool Basecamp';
    } else if (groupTitle) {
        document.title = groupTitle + ' - Tool Basecamp';
    } else {
        document.title = moduleTitle;
    }

    const logoTitleEl = document.querySelector('.logo h2');
    if (logoTitleEl) logoTitleEl.textContent = moduleTitle;
}

function renderMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isInSubDir = currentPath.includes('/html/');
    const { groupTitle: detectedGroupTitle } = getCurrentToolContext();

    const hubHref = resolveToolUrl((siteConfig && siteConfig.toolsHubUrl) || 'index.html');
    const siteName = (siteConfig && siteConfig.siteName) || 'Tool Basecamp';
    const logoText = (siteConfig && siteConfig.logoText) || 'TB';

    let moduleTitle = detectedGroupTitle || siteName;

    let menuItemsHTML = '';
    if (typeof toolsConfig !== 'undefined' && toolsConfig.groups && detectedGroupTitle) {
        toolsConfig.groups.forEach(group => {
            if (group.title !== detectedGroupTitle) return;
            if (group.title) {
                menuItemsHTML += '<li class="menu-group-title">' + group.title + '</li>';
            }
            if (Array.isArray(group.items)) {
                group.items.forEach(item => {
                    let linkUrl = item.url;
                    if (isInSubDir) linkUrl = '../../' + item.url;
                    const itemUrlLower = item.url.toLowerCase();
                    const isActive = currentPath.endsWith(itemUrlLower) || currentPage === itemUrlLower.split('/').pop();
                    menuItemsHTML += '<li' + (isActive ? ' class="active"' : '') + '><a href="' + linkUrl + '">' + item.title + '</a></li>';
                });
            }
        });
    }

    sidebar.innerHTML =
        '<div class="logo">' +
            '<a class="logo-header logo-header-link" href="' + hubHref + '">' +
                '<div class="logo-badge">' + logoText + '</div>' +
                '<h2>' + moduleTitle + '</h2>' +
            '</a>' +
            '<div id="sidebar-user-meta" class="user-meta"></div>' +
        '</div>' +
        '<nav class="menu"><ul>' + menuItemsHTML + '</ul></nav>' +
        '<div class="sidebar-footer-nav">' +
            '<a href="' + hubHref + '">All tools</a>' +
        '</div>' +
        '<div class="sidebar-footer-copy">' +
            '<p>&copy; 2026 ' + siteName + '</p>' +
        '</div>';

    bindToolSidebarMobile(sidebar);
}

function bindToolSidebarMobile(sidebar) {
    const content = document.querySelector('.container .content');
    if (!content || !sidebar) return;

    const hubHref = resolveToolUrl((siteConfig && siteConfig.toolsHubUrl) || 'index.html');

    let bar = content.querySelector('.tool-mobile-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'tool-mobile-bar';
        bar.innerHTML =
            '<button type="button" class="tool-menu-toggle" aria-label="Open menu">&#9776;</button>' +
            '<span class="tool-mobile-title"></span>' +
            '<div class="tool-mobile-nav-links">' +
                '<a class="tool-mobile-tools" href="#">All tools</a>' +
            '</div>';
        content.insertBefore(bar, content.firstChild);
    }

    const titleEl = bar.querySelector('.tool-mobile-title');
    const h2 = sidebar.querySelector('.logo h2');
    if (titleEl && h2) titleEl.textContent = h2.textContent;

    const toolsLink = bar.querySelector('.tool-mobile-tools');
    if (toolsLink) toolsLink.href = hubHref;

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
