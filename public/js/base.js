function injectToolFavicon() {
    if (document.querySelector("link[rel='icon'], link[rel='shortcut icon']")) return;

    const svg = document.createElement('link');
    svg.rel = 'icon';
    svg.type = 'image/svg+xml';
    svg.href = '/favicon.svg';
    document.head.appendChild(svg);

    const ico = document.createElement('link');
    ico.rel = 'icon';
    ico.type = 'image/x-icon';
    ico.sizes = 'any';
    ico.href = '/favicon.ico';
    document.head.appendChild(ico);

    if (!document.querySelector("link[rel='apple-touch-icon']")) {
        const apple = document.createElement('link');
        apple.rel = 'apple-touch-icon';
        apple.href = '/apple-touch-icon.png';
        document.head.appendChild(apple);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    injectToolFavicon();
    renderSiteTitle();
    renderMenu();
    initMenuEvents();
    initCopyButtons();
});

document.addEventListener('tb:locale', function () {
    renderSiteTitle();
    renderMenu();
    if (typeof window.tbApplyI18n === 'function') window.tbApplyI18n(document);
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

function tr(key) {
    return (typeof window.t === 'function' ? window.t(key) : key);
}

function matchConfigItem(groups, currentPath, currentPage) {
    if (!Array.isArray(groups)) return null;
    for (const group of groups) {
        if (!group.items) continue;
        for (const item of group.items) {
            const itemFile = item.url.toLowerCase().split('/').pop();
            if (currentPath.endsWith(item.url.toLowerCase()) || currentPage === itemFile) {
                return {
                    groupTitleKey: group.titleKey || null,
                    toolTitleKey: item.titleKey || null
                };
            }
        }
    }
    return null;
}

function getLifePageContext() {
    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase().split('?')[0];
    if (currentPage !== 'view.html' || currentPath.indexOf('/life/') === -1) return null;
    if (typeof lifeFindById !== 'function') return null;
    const id = new URLSearchParams(window.location.search).get('id');
    const hit = lifeFindById(id);
    if (!hit) return null;
    return {
        groupId: hit.group.id || null,
        groupTitle: hit.group.title || null,
        toolTitle: hit.item.title || null,
        groupTitleKey: hit.group.titleKey || null,
        toolTitleKey: hit.item.titleKey || null,
        moduleKind: 'life',
        lifeId: hit.item.id
    };
}

function resolveLabel(obj) {
    if (!obj) return '';
    if (obj.title) return obj.title;
    if (obj.titleKey) return tr(obj.titleKey);
    return '';
}

function getCurrentToolContext() {
    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase().split('?')[0];
    let groupTitleKey = null;
    let toolTitleKey = null;
    let moduleKind = null;

    const lifeHit = getLifePageContext();
    if (lifeHit) return Object.assign({ currentPage: currentPage }, lifeHit);

    const toolHit = typeof toolsConfig !== 'undefined'
        ? matchConfigItem(toolsConfig.groups, currentPath, currentPage)
        : null;
    if (toolHit) {
        groupTitleKey = toolHit.groupTitleKey;
        toolTitleKey = toolHit.toolTitleKey;
        moduleKind = 'tools';
    } else {
        const gameHit = typeof gamesConfig !== 'undefined'
            ? matchConfigItem(gamesConfig.groups, currentPath, currentPage)
            : null;
        if (gameHit) {
            groupTitleKey = gameHit.groupTitleKey;
            toolTitleKey = gameHit.toolTitleKey;
            moduleKind = 'games';
        }
    }

    return { groupTitleKey, toolTitleKey, currentPage, moduleKind };
}

function hubHrefForModule(moduleKind) {
    if (moduleKind === 'games') return (siteConfig && siteConfig.gamesHubUrl) || 'games.html';
    if (moduleKind === 'life') return (siteConfig && siteConfig.lifeHubUrl) || 'life.html';
    return (siteConfig && siteConfig.toolsHubUrl) || 'index.html';
}

function backLabelForModule(moduleKind) {
    if (moduleKind === 'games') return tr('sidebar.backGames');
    if (moduleKind === 'life') return tr('sidebar.backLife');
    return tr('sidebar.backHome');
}

function menuItemIsActive(item, currentPath, currentPage) {
    const url = item.url || '';
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
        const pathPart = url.slice(0, qIndex).toLowerCase();
        const itemFile = pathPart.split('/').pop();
        if (currentPage !== itemFile && !currentPath.endsWith(pathPart)) return false;
        const want = new URLSearchParams(url.slice(qIndex + 1)).get('id');
        const have = new URLSearchParams(window.location.search).get('id');
        return !!(want && want === have);
    }
    const itemUrlLower = url.toLowerCase();
    return currentPath.endsWith(itemUrlLower) || currentPage === itemUrlLower.split('/').pop();
}

function sourceConfigForModule(moduleKind) {
    if (moduleKind === 'games') return typeof gamesConfig !== 'undefined' ? gamesConfig : null;
    if (moduleKind === 'life') return typeof lifeConfig !== 'undefined' ? lifeConfig : null;
    return typeof toolsConfig !== 'undefined' ? toolsConfig : null;
}

function renderSiteTitle() {
    const { groupTitleKey, toolTitleKey, groupTitle, toolTitle, moduleKind } = getCurrentToolContext();
    const siteName = tr((siteConfig && siteConfig.siteNameKey) || 'site.name');
    const toolLabel = toolTitle || (toolTitleKey ? tr(toolTitleKey) : '');
    const groupLabel = groupTitle || (groupTitleKey ? tr(groupTitleKey) : '');

    if (toolLabel) {
        document.title = toolLabel + ' - ' + tr('site.pageTitleSuffix');
    } else if (groupLabel) {
        document.title = groupLabel + ' - ' + tr('site.pageTitleSuffix');
    } else {
        document.title = siteName;
    }

    const logoTitleEl = document.querySelector('.logo h2');
    if (logoTitleEl) {
        if (groupLabel || toolLabel || groupTitleKey || toolTitleKey) {
            logoTitleEl.textContent = backLabelForModule(moduleKind);
        } else {
            logoTitleEl.textContent = siteName;
        }
    }
}

function renderMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const currentPath = window.location.pathname.toLowerCase();
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase().split('?')[0];
    const isInSubDir = currentPath.includes('/html/');
    const { groupTitleKey, toolTitleKey, groupTitle, toolTitle, groupId, moduleKind } = getCurrentToolContext();

    const hubHref = resolveToolUrl(hubHrefForModule(moduleKind));
    const siteName = tr((siteConfig && siteConfig.siteNameKey) || 'site.name');
    const logoText = (siteConfig && siteConfig.logoText) || 'TB';
    const logoBadgeKey = tr('site.logoBadge');
    const logoBadge = (logoBadgeKey && logoBadgeKey !== 'site.logoBadge') ? logoBadgeKey : logoText;
    const isToolSubPage = !!(groupTitleKey || toolTitleKey || groupTitle || toolTitle || groupId);
    const logoLabel = isToolSubPage ? backLabelForModule(moduleKind) : siteName;

    const sourceConfig = sourceConfigForModule(moduleKind);
    let menuItemsHTML = '';
    if (sourceConfig && sourceConfig.groups && (groupTitleKey || groupId || groupTitle)) {
        sourceConfig.groups.forEach(group => {
            if (moduleKind === 'life') {
                if (groupId && group.id !== groupId) return;
                else if (!groupId && groupTitle && group.title !== groupTitle) return;
                else if (!groupId && !groupTitle && group.titleKey !== groupTitleKey) return;
            } else if (group.titleKey !== groupTitleKey) {
                return;
            }
            const groupLabel = resolveLabel(group);
            if (groupLabel) {
                menuItemsHTML += '<li class="menu-group-title">' + groupLabel + '</li>';
            }
            if (Array.isArray(group.items)) {
                group.items.forEach(item => {
                    let linkUrl = item.url;
                    if (isInSubDir) linkUrl = '../../' + item.url;
                    const isActive = menuItemIsActive(item, currentPath, currentPage);
                    const label = resolveLabel(item);
                    menuItemsHTML += '<li' + (isActive ? ' class="active"' : '') + '><a href="' + linkUrl + '">' + label + '</a></li>';
                });
            }
        });
    }

    sidebar.innerHTML =
        '<div class="logo">' +
            '<a class="logo-home-btn" href="' + hubHref + '">' +
                '<span class="logo-badge">' + logoBadge + '</span>' +
                '<span class="logo-home-label">' + logoLabel + '</span>' +
            '</a>' +
            '<div id="sidebar-user-meta" class="user-meta"></div>' +
        '</div>' +
        '<nav class="menu"><ul>' + menuItemsHTML + '</ul></nav>';

    const mobileGroupLabel = resolveLabel({ title: groupTitle, titleKey: groupTitleKey });
    const mobileToolLabel = resolveLabel({ title: toolTitle, titleKey: toolTitleKey });
    bindToolSidebarMobile(sidebar, mobileGroupLabel, mobileToolLabel, siteName);
}

function bindToolSidebarMobile(sidebar, groupLabel, toolLabel, siteName) {
    const content = document.querySelector('.container .content');
    if (!content || !sidebar) return;

    let bar = content.querySelector('.tool-mobile-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'tool-mobile-bar';
        bar.innerHTML =
            '<button type="button" class="tool-menu-toggle" aria-label="Open menu">&#9776;</button>' +
            '<span class="tool-mobile-title"></span>';
        content.insertBefore(bar, content.firstChild);
    }

    const titleEl = bar.querySelector('.tool-mobile-title');
    const mobileTitle = toolLabel || groupLabel || siteName;
    if (titleEl) titleEl.textContent = mobileTitle;

    // Remove legacy "全部工具" link if present from older JS
    const legacyTools = bar.querySelector('.tool-mobile-nav-links');
    if (legacyTools) legacyTools.remove();

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
