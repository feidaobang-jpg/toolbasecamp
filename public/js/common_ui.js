/**
 * Shared UI: navigation, auth bar, favicon
 */
(function () {
    function tr(key) {
        return (typeof window.t === 'function' ? window.t(key) : key);
    }

    function navLabel(item) {
        return (typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.name || ''));
    }

    function getAuthBaseUrl() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) {
            return siteConfig.apiBase;
        }
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        return (window.location.protocol === 'file:' || isLocal)
            ? 'http://127.0.0.1:8001'
            : `${window.location.origin}/api`;
    }

    function maskEmail(email) {
        if (!email || !email.includes('@')) return email || 'User';
        const [local, domain] = email.split('@');
        if (local.length <= 2) return `${local[0]}***@${domain}`;
        return `${local.slice(0, 2)}***@${domain}`;
    }

    function renderAuthStatus() {
        const headerContainer = document.querySelector('header .max-w-7xl');
        const mobileAuthSlot = document.getElementById('site-nav-mobile-auth');
        const tokenKey = 'auth_token';
        const token = localStorage.getItem(tokenKey) || '';
        const AUTH_BASE_URL = getAuthBaseUrl();

        let wrap = null;
        if (headerContainer) {
            const existing = document.getElementById('auth-status');
            if (existing) existing.remove();

            wrap = document.createElement('div');
            wrap.id = 'auth-status';
            wrap.className = 'hidden md:flex items-center gap-3 ml-auto';

            const mobileOnly = headerContainer.querySelector('#site-header-mobile-slot');
            if (mobileOnly && mobileOnly.parentNode === headerContainer) {
                headerContainer.insertBefore(wrap, mobileOnly);
            } else {
                headerContainer.appendChild(wrap);
            }
        }

        const createLink = (href, text) => {
            const a = document.createElement('a');
            a.href = href;
            a.textContent = text;
            a.className = 'text-sm text-gray-600 hover:text-blue-600 transition-colors';
            return a;
        };

        const createBtn = (text) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            btn.className = 'text-sm text-gray-600 hover:text-blue-600 transition-colors';
            return btn;
        };

        const resolveAuthUrl = (pageName) => {
            const base = window.location.pathname.includes('/html/') ? '../../' : '';
            return `${base}html/auth/${pageName}`;
        };

        const loginUrl = resolveAuthUrl('login.html');
        const registerUrl = resolveAuthUrl('register.html');

        function fillMobileAuthLoggedOut() {
            if (!mobileAuthSlot) return;
            mobileAuthSlot.innerHTML = '';
            const row = document.createElement('div');
            row.className = 'flex flex-col gap-2';
            const a1 = createLink(loginUrl, tr('auth.login'));
            const a2 = createLink(registerUrl, tr('auth.signup'));
            a1.className = 'block w-full rounded-lg border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50';
            a2.className = 'block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700';
            row.appendChild(a1);
            row.appendChild(a2);
            mobileAuthSlot.appendChild(row);
        }

        function fillMobileAuthLoggedInShell() {
            if (!mobileAuthSlot) return null;
            mobileAuthSlot.innerHTML = '';
            const profileUrl = resolveAuthUrl('profile.html');
            const box = document.createElement('div');
            box.className = 'flex flex-col gap-3';
            const userLink = document.createElement('a');
            userLink.href = profileUrl;
            userLink.className = 'flex items-center gap-2 text-sm font-medium text-gray-800';
            userLink.innerHTML = '<i class="fas fa-user-circle text-xl text-blue-600"></i> <span>' + tr('auth.profile') + '</span>';
            const logout = createBtn(tr('auth.logout'));
            logout.className = 'w-full rounded-lg border border-gray-200 py-2.5 text-sm text-gray-700 hover:bg-gray-50';
            logout.addEventListener('click', () => {
                localStorage.removeItem(tokenKey);
                window.location.reload();
            });
            box.appendChild(userLink);
            box.appendChild(logout);
            mobileAuthSlot.appendChild(box);
            return { userLink };
        }

        if (!token) {
            if (wrap) {
                wrap.appendChild(createLink(loginUrl, tr('auth.login')));
                wrap.appendChild(createLink(registerUrl, tr('auth.signup')));
            }
            fillMobileAuthLoggedOut();
            const sidebarMeta = document.getElementById('sidebar-user-meta');
            if (sidebarMeta) {
                sidebarMeta.innerHTML = '';
                sidebarMeta.classList.remove('is-visible');
            }
            return;
        }

        let userEl = null;
        let logoutBtn = null;
        let mobileUserSpan = null;

        if (wrap) {
            const profileUrl = resolveAuthUrl('profile.html');
            userEl = document.createElement('a');
            userEl.href = profileUrl;
            userEl.className = 'text-sm text-gray-600 hover:text-blue-600 font-medium transition-colors flex items-center gap-2';
            userEl.innerHTML = '<i class="fas fa-user-circle text-lg"></i> <span>' + tr('auth.profile') + '</span>';
            wrap.appendChild(userEl);

            logoutBtn = createBtn(tr('auth.logout'));
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(tokenKey);
                window.location.reload();
            });
            wrap.appendChild(logoutBtn);
        }

        const mobileShell = fillMobileAuthLoggedInShell();
        if (mobileShell) {
            mobileUserSpan = mobileShell.userLink.querySelector('span');
        }

        fetch(`${AUTH_BASE_URL}/auth/me`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(async (res) => {
                if (check502Error(res)) throw new Error('Backend service unavailable');
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
                return data;
            })
            .then((data) => {
                const email = data?.user?.email;
                if (email && userEl) {
                    userEl.querySelector('span').textContent = maskEmail(email);
                }
                if (email && mobileUserSpan) {
                    mobileUserSpan.textContent = maskEmail(email);
                }
                const sidebarMeta = document.getElementById('sidebar-user-meta');
                if (sidebarMeta && email) {
                    sidebarMeta.classList.add('is-visible');
                    sidebarMeta.innerHTML = `<div class="user-meta-name">${maskEmail(email)}</div>`;
                }
            })
            .catch((error) => {
                if (error.message === 'Backend service unavailable') return;
                localStorage.removeItem(tokenKey);
                if (wrap && userEl && logoutBtn) {
                    wrap.innerHTML = '';
                    wrap.appendChild(createLink(loginUrl, tr('auth.login')));
                    wrap.appendChild(createLink(registerUrl, tr('auth.signup')));
                }
                fillMobileAuthLoggedOut();
                const sidebarMeta = document.getElementById('sidebar-user-meta');
                if (sidebarMeta) {
                    sidebarMeta.innerHTML = '';
                    sidebarMeta.classList.remove('is-visible');
                }
            });
    }

    function injectFavicon() {
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

    function updatePageLogo() {
        if (typeof siteConfig === 'undefined') return;
        const badgeKey = tr('site.logoBadge');
        const badge = (badgeKey && badgeKey !== 'site.logoBadge')
            ? badgeKey
            : ((siteConfig.logoText) || 'TB');
        document.querySelectorAll('.logo-text').forEach(el => { el.textContent = badge; });
        if (siteConfig.siteNameKey) {
            document.querySelectorAll('.site-name').forEach(el => { el.textContent = tr(siteConfig.siteNameKey); });
        } else if (siteConfig.siteName) {
            document.querySelectorAll('.site-name').forEach(el => { el.textContent = siteConfig.siteName; });
        }
        if (siteConfig.keywordsKey) {
            let keywordsMeta = document.querySelector('meta[name="keywords"]');
            if (!keywordsMeta) {
                keywordsMeta = document.createElement('meta');
                keywordsMeta.name = 'keywords';
                document.head.appendChild(keywordsMeta);
            }
            keywordsMeta.content = tr(siteConfig.keywordsKey);
        } else if (siteConfig.keywords) {
            let keywordsMeta = document.querySelector('meta[name="keywords"]');
            if (!keywordsMeta) {
                keywordsMeta = document.createElement('meta');
                keywordsMeta.name = 'keywords';
                document.head.appendChild(keywordsMeta);
            }
            keywordsMeta.content = siteConfig.keywords;
        }
        if (siteConfig.descriptionKey) {
            let descMeta = document.querySelector('meta[name="description"]');
            if (!descMeta) {
                descMeta = document.createElement('meta');
                descMeta.name = 'description';
                document.head.appendChild(descMeta);
            }
            descMeta.content = tr(siteConfig.descriptionKey);
        } else if (siteConfig.description) {
            let descMeta = document.querySelector('meta[name="description"]');
            if (!descMeta) {
                descMeta = document.createElement('meta');
                descMeta.name = 'description';
                document.head.appendChild(descMeta);
            }
            descMeta.content = siteConfig.description;
        }
    }

    function getAutoNavBasePath() {
        const path = window.location.pathname || '/';
        const segments = path.split('/').filter(Boolean);
        const depth = Math.max(segments.length - 1, 0);
        return '../'.repeat(depth);
    }

    function getNavBasePathForEl(nav) {
        if (!nav) return getAutoNavBasePath();
        const set = nav.getAttribute('data-base-path');
        if (set !== null && set !== '') return set;
        return getAutoNavBasePath();
    }

    function isNavItemActive(item, currentPage, pathname) {
        const itemFile = (item.url || '').split('/').pop();
        if (currentPage === item.url || currentPage === itemFile) return true;
        const path = String(pathname || '').toLowerCase();
        if (itemFile === 'games.html' && path.includes('/html/game/')) return true;
        if (itemFile === 'life.html' && path.includes('/html/life/view.html')) return true;
        if (itemFile === 'index.html' && path.includes('/html/') &&
            !path.includes('/html/game/') &&
            !path.includes('/html/life/view.html') &&
            !path.includes('/html/auth/')) {
            // AI recipe stays under tools
            return true;
        }
        return false;
    }

    function getLocale() {
        return typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en';
    }

    /** Hide Chinese-only modules (e.g. Content) when locale is English. */
    function visibleNavItems() {
        if (typeof siteConfig === 'undefined' || !Array.isArray(siteConfig.nav)) return [];
        var locale = getLocale();
        return siteConfig.nav.filter(function (item) {
            if (locale === 'en' && item.nameKey === 'nav.life') return false;
            return true;
        });
    }

    function updateNavMenu() {
        if (typeof siteConfig === 'undefined' || !siteConfig.nav) return;
        const pathname = window.location.pathname || '';
        const currentPage = pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('nav[data-nav="main"]').forEach(nav => {
            const basePath = getNavBasePathForEl(nav);
            nav.innerHTML = '';
            visibleNavItems().forEach(item => {
                const isActive = isNavItemActive(item, currentPage, pathname);
                const link = document.createElement('a');
                link.href = basePath + item.url;
                if (isActive) link.className = 'is-active';
                link.textContent = navLabel(item);
                const underline = document.createElement('span');
                link.appendChild(underline);
                nav.appendChild(link);
            });
        });
    }

    function findHeaderMobileSlot(headerRow) {
        if (!headerRow) return null;
        return headerRow.querySelector('#site-header-mobile-slot') || null;
    }

    function refreshSiteNavMobileStripVisibility() {
        if (document.getElementById('site-mobile-nav-html')) return;
        const strip = document.getElementById('site-nav-mobile-strip');
        if (!strip) return;
        strip.style.display = window.matchMedia('(max-width: 767.98px)').matches ? 'block' : 'none';
    }

    function ensureSiteNavMobileStrip() {
        if (document.getElementById('site-mobile-nav-html')) return null;
        const header = document.querySelector('header');
        const headerRow = document.querySelector('header .max-w-7xl');
        if (!header || !headerRow) return null;

        let strip = document.getElementById('site-nav-mobile-strip');
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'site-nav-mobile-strip';
            strip.setAttribute('aria-label', 'Main navigation');
            strip.className = 'border-t border-gray-100';
            strip.style.background = 'rgba(255,255,255,0.98)';

            const inner = document.createElement('div');
            inner.id = 'site-nav-mobile-scroll';
            inner.style.cssText = 'max-width:80rem;margin:0 auto;display:flex;flex-direction:row;align-items:center;gap:0.5rem;overflow-x:auto;padding:10px 16px;-webkit-overflow-scrolling:touch;scrollbar-width:thin';
            strip.appendChild(inner);
            header.insertBefore(strip, headerRow.nextSibling);
        }
        refreshSiteNavMobileStripVisibility();
        return document.getElementById('site-nav-mobile-scroll');
    }

    function syncSiteMobileNavStrip() {
        if (document.getElementById('site-mobile-nav-html')) return;
        const scroll = ensureSiteNavMobileStrip();
        if (!scroll || typeof siteConfig === 'undefined' || !siteConfig.nav) return;

        const mainNav = document.querySelector('nav[data-nav="main"]');
        const basePath = getNavBasePathForEl(mainNav);
        const pathname = window.location.pathname || '';
        const currentPage = pathname.split('/').pop() || 'index.html';

        scroll.innerHTML = '';
        visibleNavItems().forEach(item => {
            const isActive = isNavItemActive(item, currentPage, pathname);
            const a = document.createElement('a');
            a.href = basePath + item.url;
            a.textContent = navLabel(item);
            a.style.cssText = 'flex-shrink:0;white-space:nowrap;border-radius:9999px;padding:6px 14px;font-size:0.875rem;font-weight:' + (isActive ? '600' : '500') + ';text-decoration:none;color:' + (isActive ? '#2563eb' : '#4b5563') + ';background:' + (isActive ? '#eff6ff' : 'transparent') + ';' + (isActive ? 'box-shadow:inset 0 0 0 1px #bfdbfe;' : '');
            scroll.appendChild(a);
        });
    }

    let siteNavDrawerInitialized = false;

    function closeSiteNavDrawer() {
        const backdrop = document.getElementById('site-nav-backdrop');
        const panel = document.getElementById('site-nav-panel');
        const btn = document.getElementById('site-nav-menu-btn');
        if (backdrop) {
            backdrop.classList.add('opacity-0', 'pointer-events-none');
            backdrop.classList.remove('opacity-100');
        }
        if (panel) panel.classList.add('translate-x-full');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    function openSiteNavDrawer() {
        const backdrop = document.getElementById('site-nav-backdrop');
        const panel = document.getElementById('site-nav-panel');
        const btn = document.getElementById('site-nav-menu-btn');
        if (backdrop) {
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
            backdrop.classList.add('opacity-100');
        }
        if (panel) panel.classList.remove('translate-x-full');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function initSiteMobileNav() {
        const headerRow = document.querySelector('header .max-w-7xl');
        if (!headerRow || typeof siteConfig === 'undefined' || !Array.isArray(siteConfig.nav)) return;

        let mobileRow = findHeaderMobileSlot(headerRow);
        if (!mobileRow) {
            mobileRow = document.createElement('div');
            mobileRow.id = 'site-header-mobile-slot';
            mobileRow.className = 'flex items-center gap-1 flex-shrink-0 md:hidden ml-auto';
            headerRow.appendChild(mobileRow);
        }

        if (!document.getElementById('site-nav-menu-btn')) {
            const btn = document.createElement('button');
            btn.id = 'site-nav-menu-btn';
            btn.type = 'button';
            btn.className = 'p-2 rounded-lg text-gray-600 hover:bg-gray-100 flex-shrink-0';
            btn.setAttribute('aria-label', tr('auth.openMenu'));
            btn.innerHTML = '<span aria-hidden="true" style="font-size:1.35rem;line-height:1">☰</span>';
            mobileRow.insertBefore(btn, mobileRow.firstChild);
            btn.addEventListener('click', () => {
                const panel = document.getElementById('site-nav-panel');
                if (panel && panel.classList.contains('translate-x-full')) openSiteNavDrawer();
                else closeSiteNavDrawer();
            });
        }

        if (!document.getElementById('site-nav-drawer')) {
            const root = document.createElement('div');
            root.id = 'site-nav-drawer';
            root.innerHTML = `
                <div id="site-nav-backdrop" class="fixed inset-0 z-[200] bg-black/40 opacity-0 pointer-events-none transition-opacity duration-200 md:hidden"></div>
                <div id="site-nav-panel" class="fixed inset-y-0 right-0 z-[210] flex w-[min(100vw-2rem,20rem)] max-w-full flex-col bg-white shadow-2xl transition-transform duration-200 ease-out translate-x-full md:hidden" role="dialog" aria-modal="true" aria-label="Account menu">
                    <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <span class="font-semibold text-gray-900">${tr('auth.account')}</span>
                        <button type="button" id="site-nav-close" class="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="${tr('auth.closeMenu')}">
                            <i class="fas fa-times text-lg"></i>
                        </button>
                    </div>
                    <div id="site-nav-mobile-auth" class="flex-1 overflow-y-auto p-4"></div>
                </div>
            `;
            document.body.appendChild(root);
            document.getElementById('site-nav-backdrop').addEventListener('click', closeSiteNavDrawer);
            document.getElementById('site-nav-close').addEventListener('click', closeSiteNavDrawer);
        }

        if (!siteNavDrawerInitialized) {
            siteNavDrawerInitialized = true;
            window.addEventListener('resize', () => {
                if (window.matchMedia('(min-width: 768px)').matches) closeSiteNavDrawer();
                refreshSiteNavMobileStripVisibility();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeSiteNavDrawer();
            });
        }

        syncSiteMobileNavStrip();
    }

    function updatePageTitle() {
        if (typeof siteConfig === 'undefined' || !siteConfig.nav) return;
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const currentNav = siteConfig.nav.find(item =>
            currentPage === item.url || currentPage === item.url.split('/').pop()
        );
        if (currentNav && siteConfig.siteNameKey) {
            document.title = tr(siteConfig.siteNameKey) + ' - ' + navLabel(currentNav);
        } else if (currentNav && siteConfig.siteName) {
            document.title = `${siteConfig.siteName} - ${currentNav.name}`;
        }
    }

    function showBackendServiceError() {
        if (document.getElementById('backend-service-error-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'backend-service-error-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:24px;max-width:480px;width:90%;">
                <h3 style="margin:0 0 12px;font-size:20px;font-weight:600;">${tr('common.serviceUnavailable')}</h3>
                <p style="color:#4b5563;line-height:1.6;margin-bottom:24px;">${tr('common.serviceUnavailableBody')}</p>
                <button id="backend-error-close-btn" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;">${tr('common.ok')}</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('backend-error-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function check502Error(response) {
        if (response && response.status === 502) {
            showBackendServiceError();
            return true;
        }
        return false;
    }

    window.showBackendServiceError = showBackendServiceError;
    window.check502Error = check502Error;

    function runMainUiInit() {
        injectFavicon();
        updatePageLogo();
        updateNavMenu();
        initSiteMobileNav();
        updatePageTitle();
        renderAuthStatus();
    }

    document.addEventListener('DOMContentLoaded', runMainUiInit);
    document.addEventListener('tb:locale', function () {
        updatePageLogo();
        updateNavMenu();
        updatePageTitle();
        syncSiteMobileNavStrip();
        renderAuthStatus();
        if (typeof window.tbApplyI18n === 'function') window.tbApplyI18n(document);
    });
    window.addEventListener('load', () => {
        initSiteMobileNav();
        refreshSiteNavMobileStripVisibility();
        renderAuthStatus();
        updateNavMenu();
    });
})();
