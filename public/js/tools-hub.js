(function () {
    let searchQuery = '';

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
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

    function renderMobileSearch(toolbarEl) {
        if (!toolbarEl) return;
        toolbarEl.setAttribute('aria-hidden', 'false');
        toolbarEl.innerHTML =
            '<div class="hub-search-wrap">' +
                '<i class="fas fa-search"></i>' +
                '<input type="text" id="hub-search-input" class="hub-search-input" role="searchbox" autocomplete="off" ' +
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
                // 站外子站：新窗口打开并带 ↗ 标记
                if (item.external) {
                    card.target = '_blank';
                    card.rel = 'noopener noreferrer';
                }
                const titleHtml =
                    '<h3>' + escapeHtml(label) +
                    (item.external
                        ? ' <i class="fas fa-arrow-up-right-from-square hub-tool-external" aria-hidden="true"></i>'
                        : '') +
                    '</h3>';
                if (item.paid) {
                    card.innerHTML =
                        titleHtml +
                        '<span class="hub-tool-badge hub-tool-badge-paid">' + escapeHtml(tr('hub.paidRequired')) + '</span>';
                } else if (item.dailyLimit) {
                    card.innerHTML =
                        titleHtml +
                        '<span class="hub-tool-badge hub-tool-badge-limit">' + escapeHtml(tr('hub.dailyLimitRequired')) + '</span>';
                } else if (item.authRequired) {
                    card.innerHTML =
                        titleHtml +
                        '<span class="hub-tool-badge">' + escapeHtml(tr('hub.loginRequired')) + '</span>';
                } else {
                    card.innerHTML = titleHtml;
                }
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

    function renderHowtoBanner(containerEl) {
        if (!containerEl) return;
        const box = document.createElement('div');
        box.className = 'hub-howto';
        box.innerHTML =
            '<div class="hub-howto-title">' + escapeHtml(tr('hub.howtoTitle')) + '</div>' +
            '<p class="hub-howto-body">' + escapeHtml(tr('hub.howtoBody')) + '</p>' +
            '<div class="hub-howto-actions">' +
                '<a class="tb-btn" href="top-up.html">' + escapeHtml(tr('hub.howtoAboutPay')) + '</a>' +
                '<a class="tb-btn" href="html/auth/profile.html">' + escapeHtml(tr('hub.howtoRedeem')) + '</a>' +
                '<a class="tb-btn" href="html/media/instruct-edit.html">' + escapeHtml(tr('hub.howtoInstruct')) + '</a>' +
                '<a class="tb-btn" href="html/media/text-to-image.html">' + escapeHtml(tr('hub.howtoTextToImage')) + '</a>' +
                '<a class="tb-btn" href="html/media/ai-music.html">' + escapeHtml(tr('hub.howtoAiMusic')) + '</a>' +
            '</div>';
        containerEl.appendChild(box);
    }

    function renderToolsHub() {
        const centerEl = document.getElementById('main-content');
        const mobileToolbar = document.getElementById('hub-mobile-toolbar');

        if (!centerEl) return;

        const groups = getGroups();
        centerEl.innerHTML = '';

        if (!groups.length) {
            centerEl.innerHTML = '<div class="text-center text-gray-500 py-12">' + tr('hub.noTools') + '</div>';
            if (mobileToolbar) mobileToolbar.innerHTML = '';
            return;
        }

        renderMobileSearch(mobileToolbar);
        renderHowtoBanner(centerEl);
        renderToolGroups(centerEl, groups);

        if (searchQuery) applySearchFilter(searchQuery);
    }

    window.renderToolsHub = renderToolsHub;

    document.addEventListener('tb:locale', function () {
        if (typeof window.renderToolsHub === 'function') renderToolsHub();
    });
})();
