(function () {
    const portalThemes = {
        pdf: {
            iconWrap: 'bg-rose-50 text-rose-600',
            chip: 'border-rose-200 text-rose-800',
            icon: 'fa-file-pdf'
        },
        dev: {
            iconWrap: 'bg-slate-100 text-slate-700',
            chip: 'border-slate-300 text-slate-800',
            icon: 'fa-code'
        },
        chef: {
            iconWrap: 'bg-amber-50 text-amber-600',
            chip: 'border-amber-200 text-amber-900',
            icon: 'fa-shield-halved'
        },
        hoppscotch: {
            iconWrap: 'bg-emerald-50 text-emerald-600',
            chip: 'border-emerald-200 text-emerald-900',
            icon: 'fa-paper-plane'
        },
        translate: {
            iconWrap: 'bg-sky-50 text-sky-600',
            chip: 'border-sky-200 text-sky-900',
            icon: 'fa-language'
        }
    };

    let searchQuery = '';

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
    }

    function lbl(item) {
        return typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.title || '');
    }

    function getGroups() {
        if (typeof toolsConfig === 'undefined' || !Array.isArray(toolsConfig.groups)) return [];
        return toolsConfig.groups.filter(g => g && g.titleKey && Array.isArray(g.items) && g.items.length > 0);
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function portalDesc(portal) {
        if (portal.descriptionKey) return tr(portal.descriptionKey);
        return portal.description || '';
    }

    function renderRightPortals(sidebarEl) {
        if (!sidebarEl || typeof portalsConfig === 'undefined' || !portalsConfig.length) {
            if (sidebarEl) sidebarEl.innerHTML = '';
            return;
        }
        sidebarEl.innerHTML =
            '<div class="hub-sidebar-head">' + tr('hub.portalsTitle') + '</div>' +
            '<p class="hub-sidebar-sub">' + tr('hub.portalsSubtitle') + '</p>' +
            '<ul class="hub-portal-list"></ul>';
        const listEl = sidebarEl.querySelector('.hub-portal-list');
        portalsConfig.forEach(portal => {
            const theme = portalThemes[portal.theme] || portalThemes.dev;
            const desc = portalDesc(portal);
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = portal.url || '#';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.innerHTML =
                '<div class="hub-portal-top">' +
                    '<span class="hub-portal-icon ' + theme.iconWrap + '"><i class="fas ' + theme.icon + '"></i></span>' +
                    '<strong class="hub-portal-title">' + escapeHtml(lbl(portal)) +
                        ' <i class="fas fa-arrow-up-right-from-square hub-portal-external-inline" aria-hidden="true"></i>' +
                    '</strong>' +
                '</div>' +
                (desc ? '<p class="hub-portal-desc">' + escapeHtml(desc) + '</p>' : '') +
                (portal.meta ? '<span class="hub-portal-meta">' + escapeHtml(portal.meta) + '</span>' : '');
            li.appendChild(a);
            listEl.appendChild(li);
        });
    }

    function renderMobilePortals(containerEl) {
        if (!containerEl) return;
        if (typeof portalsConfig === 'undefined' || !portalsConfig.length) {
            containerEl.innerHTML = '';
            containerEl.setAttribute('aria-hidden', 'true');
            return;
        }
        containerEl.setAttribute('aria-hidden', 'false');
        containerEl.innerHTML =
            '<div class="hub-mobile-portals-label">' + tr('hub.portalsTitle') + '</div>' +
            '<div class="hub-mobile-portals-row"></div>';
        const rowEl = containerEl.querySelector('.hub-mobile-portals-row');
        portalsConfig.forEach(portal => {
            const theme = portalThemes[portal.theme] || portalThemes.dev;
            const a = document.createElement('a');
            a.href = portal.url || '#';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'hub-mobile-portal-chip ' + theme.chip;
            a.innerHTML = '<i class="fas ' + theme.icon + '"></i><span>' + lbl(portal) + '</span>';
            rowEl.appendChild(a);
        });
    }

    function renderMobileSearch(toolbarEl) {
        if (!toolbarEl) return;
        toolbarEl.setAttribute('aria-hidden', 'false');
        toolbarEl.innerHTML =
            '<div class="hub-search-wrap">' +
                '<i class="fas fa-search"></i>' +
                '<input type="search" id="hub-search-input" class="hub-search-input" autocomplete="off" ' +
                    'placeholder="' + tr('hub.searchPlaceholder') + '" value="' + escapeAttr(searchQuery) + '">' +
                '<button type="button" id="hub-search-clear" class="hub-search-clear' +
                    (searchQuery ? ' is-visible' : '') + '" aria-label="Clear">' +
                    '<i class="fas fa-times"></i></button>' +
            '</div>';
        bindSearch(toolbarEl);
    }

    function escapeAttr(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function bindSearch(toolbarEl) {
        const input = toolbarEl.querySelector('#hub-search-input');
        const clearBtn = toolbarEl.querySelector('#hub-search-clear');
        if (!input) return;

        input.addEventListener('input', function () {
            searchQuery = input.value.trim();
            if (clearBtn) clearBtn.classList.toggle('is-visible', searchQuery.length > 0);
            applySearchFilter(searchQuery);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                searchQuery = '';
                clearBtn.classList.remove('is-visible');
                applySearchFilter('');
                input.focus();
            });
        }
    }

    function applySearchFilter(query) {
        const centerEl = document.getElementById('main-content');
        const emptyEl = document.getElementById('hub-empty-search');
        if (!centerEl) return;

        const normalized = query.toLowerCase();
        let visibleCount = 0;

        centerEl.querySelectorAll('.hub-group').forEach(groupEl => {
            let groupVisible = 0;
            groupEl.querySelectorAll('.hub-tool-card').forEach(card => {
                const text = (card.dataset.search || '').toLowerCase();
                const match = !normalized || text.indexOf(normalized) !== -1;
                card.classList.toggle('is-hidden', !match);
                if (match) {
                    groupVisible += 1;
                    visibleCount += 1;
                }
            });
            groupEl.classList.toggle('is-hidden', groupVisible === 0);
        });

        if (emptyEl) {
            emptyEl.classList.toggle('is-visible', normalized.length > 0 && visibleCount === 0);
        }
    }

    function renderToolGroups(containerEl, groups) {
        if (!containerEl) return;

        groups.forEach((group, index) => {
            const sectionEl = document.createElement('section');
            sectionEl.id = 'section-' + index;
            sectionEl.className = 'hub-group';

            const headerEl = document.createElement('h3');
            headerEl.className = 'hub-group-head';
            headerEl.textContent = tr(group.titleKey);
            sectionEl.appendChild(headerEl);

            const gridEl = document.createElement('div');
            gridEl.className = 'hub-tools-grid';

            group.items.forEach(item => {
                const label = item.titleKey ? tr(item.titleKey) : (item.title || '');
                const groupLabel = tr(group.titleKey);
                const card = document.createElement('a');
                card.href = item.url || '#';
                card.className = 'hub-tool-card';
                card.dataset.search = groupLabel + ' ' + label;
                card.innerHTML = '<h3>' + label + '</h3>';
                gridEl.appendChild(card);
            });

            sectionEl.appendChild(gridEl);
            containerEl.appendChild(sectionEl);
        });

        const emptyEl = document.createElement('div');
        emptyEl.id = 'hub-empty-search';
        emptyEl.className = 'hub-empty-search';
        emptyEl.textContent = tr('hub.noSearchResults');
        containerEl.appendChild(emptyEl);
    }

    function renderToolsHub() {
        const centerEl = document.getElementById('main-content');
        const rightEl = document.getElementById('hub-sidebar-right');
        const mobileToolbar = document.getElementById('hub-mobile-toolbar');

        if (!centerEl) return;

        const groups = getGroups();
        centerEl.innerHTML = '';

        if (!groups.length) {
            centerEl.innerHTML = '<div class="text-center text-gray-500 py-12">' + tr('hub.noTools') + '</div>';
            if (rightEl) rightEl.innerHTML = '';
            if (mobileToolbar) mobileToolbar.innerHTML = '';
            return;
        }

        renderRightPortals(rightEl);
        renderMobileSearch(mobileToolbar);
        renderToolGroups(centerEl, groups);

        // 手机端子站入口放在工具列表最下方，不占首屏
        const mobilePortals = document.createElement('div');
        mobilePortals.id = 'hub-mobile-portals';
        mobilePortals.className = 'hub-mobile-portals';
        centerEl.appendChild(mobilePortals);
        renderMobilePortals(mobilePortals);

        if (searchQuery) applySearchFilter(searchQuery);
    }

    window.renderToolsHub = renderToolsHub;

    document.addEventListener('tb:locale', function () {
        if (typeof window.renderToolsHub === 'function') renderToolsHub();
    });
})();
