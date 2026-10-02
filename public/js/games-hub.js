(function () {
    let searchQuery = '';
    let kindFilter = 'all';

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
    }

    function getGroups() {
        if (typeof gamesConfig === 'undefined' || !Array.isArray(gamesConfig.groups)) return [];
        return gamesConfig.groups.filter(function (g) {
            return g && g.titleKey && Array.isArray(g.items) && g.items.length > 0;
        });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function gameThumbSrc(item) {
        if (!item) return '';
        if (item.thumb) return item.thumb;
        var url = item.url || '';
        var m = url.match(/html\/game\/([^/?]+)\.html/i);
        if (!m) return '';
        return 'assets/game/thumbs/' + m[1] + '.jpg?v=17';
    }

    function isExternalGame(item) {
        if (!item) return false;
        if (item.external) return true;
        return /^https?:\/\//i.test(item.url || '');
    }

    function gameCardLabel(item) {
        if (!item) return '';
        if (item.titleKey) return tr(item.titleKey);
        return item.title || '';
    }

    /** 一组游戏按「全部是外链」判定归属：自研原创 / 精选外链两个大区。 */
    function groupKind(group) {
        var items = (group && group.items) || [];
        if (!items.length) return 'original';
        return items.every(isExternalGame) ? 'external' : 'original';
    }

    function kindLabel(kind) {
        return kind === 'external' ? tr('games.kindExternal') : tr('games.kindOriginal');
    }

    function bindSearch(toolbarEl) {
        var input = toolbarEl.querySelector('#hub-search-input');
        var clearBtn = toolbarEl.querySelector('#hub-search-clear');
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

    function renderMobileSearch(toolbarEl) {
        if (!toolbarEl) return;
        toolbarEl.setAttribute('aria-hidden', 'false');
        toolbarEl.innerHTML =
            '<div class="hub-search-wrap">' +
                '<i class="fas fa-search"></i>' +
                '<input type="text" id="hub-search-input" class="hub-search-input" role="searchbox" autocomplete="off" ' +
                    'placeholder="' + escapeAttr(tr('hub.searchGamesPlaceholder')) + '" value="' + escapeAttr(searchQuery) + '">' +
                '<button type="button" id="hub-search-clear" class="hub-search-clear' +
                    (searchQuery ? ' is-visible' : '') + '" aria-label="Clear">' +
                    '<i class="fas fa-times"></i></button>' +
            '</div>';
        bindSearch(toolbarEl);
    }

    function applyKindFilter() {
        var centerEl = document.getElementById('main-content');
        if (!centerEl) return;
        centerEl.querySelectorAll('.hub-kind-block').forEach(function (blockEl) {
            blockEl.classList.toggle('is-hidden', kindFilter !== 'all' && blockEl.dataset.kind !== kindFilter);
        });
        centerEl.querySelectorAll('.hub-kind-chip').forEach(function (chip) {
            chip.classList.toggle('is-active', chip.dataset.kind === kindFilter);
        });
    }

    function renderKindChips(containerEl) {
        var wrap = document.createElement('div');
        wrap.className = 'hub-kind-chips';
        [
            { kind: 'all', label: tr('games.groups.all') },
            { kind: 'original', label: tr('games.kindOriginal') },
            { kind: 'external', label: tr('games.kindExternal') }
        ].forEach(function (opt) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'hub-kind-chip' + (kindFilter === opt.kind ? ' is-active' : '');
            chip.dataset.kind = opt.kind;
            chip.textContent = opt.label;
            chip.addEventListener('click', function () {
                kindFilter = opt.kind;
                applyKindFilter();
                applySearchFilter(searchQuery);
            });
            wrap.appendChild(chip);
        });
        containerEl.insertBefore(wrap, containerEl.firstChild);
    }

    function applySearchFilter(query) {
        var centerEl = document.getElementById('main-content');
        var emptyEl = document.getElementById('hub-empty-search');
        if (!centerEl) return;

        var normalized = query.toLowerCase();
        var visibleCount = 0;

        centerEl.querySelectorAll('.hub-group').forEach(function (groupEl) {
            var groupVisible = 0;
            groupEl.querySelectorAll('.hub-tool-card').forEach(function (card) {
                var text = (card.dataset.search || '').toLowerCase();
                var kindOk = kindFilter === 'all' || card.dataset.kind === kindFilter;
                var match = kindOk && (!normalized || text.indexOf(normalized) !== -1);
                card.classList.toggle('is-hidden', !match);
                if (match) {
                    groupVisible += 1;
                    visibleCount += 1;
                }
            });
            groupEl.classList.toggle('is-hidden', groupVisible === 0);
        });

        centerEl.querySelectorAll('.hub-kind-block').forEach(function (blockEl) {
            var anyVisible = blockEl.querySelectorAll('.hub-group:not(.is-hidden)').length > 0;
            blockEl.classList.toggle('is-hidden', !anyVisible);
        });

        if (emptyEl) {
            emptyEl.classList.toggle('is-visible', normalized.length > 0 && visibleCount === 0);
        }
    }

    function renderGameCard(item, kind) {
        var label = gameCardLabel(item);
        var thumb = gameThumbSrc(item);
        var external = kind === 'external';
        var card = document.createElement(external ? 'a' : 'article');
        card.className = 'hub-tool-card hub-game-card' + (external ? ' hub-game-card--external' : '');
        if (external) {
            card.href = item.url || '#';
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.title = label + ' · ' + tr('games.externalOpenTip');
        }
        card.dataset.search = label + ' ' + kindLabel(kind);
        card.dataset.kind = kind;
        card.innerHTML =
            (thumb
                ? '<span class="hub-game-card-thumb">' +
                    '<img src="' + escapeAttr(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
                  '</span>'
                : '') +
            '<span class="hub-game-card-body"><h3>' + escapeHtml(label) + '</h3>' +
                '<span class="hub-game-kind hub-game-kind--' + kind + '">' + escapeHtml(kindLabel(kind)) + '</span>' +
            '</span>';
        if (!external) {
            var mainLink = document.createElement('a');
            mainLink.className = 'hub-game-main';
            mainLink.href = item.url;
            while (card.firstChild) mainLink.appendChild(card.firstChild);
            card.appendChild(mainLink);

            var actions = document.createElement('div');
            actions.className = 'hub-game-actions';
            [{ url: item.toyUrl, label: tr('games.playToy'), external: true },
                { url: item.url, label: tr('games.playHere'), external: false }].forEach(function (entry) {
                if (!entry.url) return;
                var link = document.createElement('a');
                link.className = 'tb-btn' + (!entry.external && item.toyUrl ? ' hub-game-play-secondary' : '');
                link.href = entry.url;
                link.textContent = entry.label;
                link.setAttribute('aria-label', label + ' · ' + entry.label);
                if (entry.external) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
                actions.appendChild(link);
            });
            card.appendChild(actions);
        }
        return card;
    }

    function renderGameGroups(containerEl, groups) {
        if (!containerEl) return;

        var buckets = { original: [], external: [] };
        groups.forEach(function (group) {
            buckets[groupKind(group)].push(group);
        });

        ['original', 'external'].forEach(function (kind) {
            var kindGroups = buckets[kind];
            if (!kindGroups.length) return;

            var blockEl = document.createElement('div');
            blockEl.className = 'hub-kind-block hub-kind-block--' + kind;
            blockEl.dataset.kind = kind;

            var count = kindGroups.reduce(function (sum, g) { return sum + g.items.length; }, 0);
            var title = kind === 'external' ? tr('games.sectionExternal') : tr('games.sectionOriginal');
            var desc = kind === 'external'
                ? tr('games.sectionExternalDesc')
                : tr('games.sectionOriginalDesc');
            blockEl.innerHTML =
                '<div class="hub-kind-head">' +
                    '<h2 class="hub-kind-title">' + escapeHtml(title) +
                        '<span class="hub-kind-count">' + count + '</span>' +
                    '</h2>' +
                    '<p class="hub-kind-desc">' + escapeHtml(desc) + '</p>' +
                '</div>';

            kindGroups.forEach(function (group, index) {
                var sectionEl = document.createElement('section');
                sectionEl.id = 'section-' + kind + '-' + index;
                sectionEl.className = 'hub-group';

                var headerEl = document.createElement('h3');
                headerEl.className = 'hub-group-head';
                var groupLabel = group.titleKey ? tr(group.titleKey) : (group.title || '');
                if (kindGroups.length > 1) {
                    headerEl.textContent = groupLabel;
                    sectionEl.appendChild(headerEl);
                }

                var gridEl = document.createElement('div');
                gridEl.className = 'hub-games-grid';
                var kind0 = groupKind(group);
                group.items.forEach(function (item) {
                    gridEl.appendChild(renderGameCard(item, kind0));
                });
                sectionEl.appendChild(gridEl);
                blockEl.appendChild(sectionEl);
            });

            containerEl.appendChild(blockEl);
        });

        var emptyEl = document.createElement('div');
        emptyEl.id = 'hub-empty-search';
        emptyEl.className = 'hub-empty-search';
        emptyEl.textContent = tr('hub.noGameSearchResults');
        containerEl.appendChild(emptyEl);
    }

    function renderGamesHub() {
        var centerEl = document.getElementById('main-content');
        var mobileToolbar = document.getElementById('hub-mobile-toolbar');
        if (!centerEl) return;

        var groups = getGroups();
        centerEl.innerHTML = '';

        if (!groups.length) {
            centerEl.innerHTML = '<div class="text-center text-gray-500 py-12">' + tr('hub.noGames') + '</div>';
            if (mobileToolbar) mobileToolbar.innerHTML = '';
            return;
        }

        renderMobileSearch(mobileToolbar);
        renderGameGroups(centerEl, groups);
        renderKindChips(centerEl);
        if (kindFilter !== 'all') applyKindFilter();
        if (searchQuery) applySearchFilter(searchQuery);
    }

    window.renderGamesHub = renderGamesHub;

    document.addEventListener('tb:locale', function () {
        if (typeof window.renderGamesHub === 'function') renderGamesHub();
    });
})();
