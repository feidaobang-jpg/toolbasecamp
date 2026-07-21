(function () {
    let searchQuery = '';

    function getGroups() {
        if (typeof lifeToHubGroups === 'function') return lifeToHubGroups();
        return [];
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
                '<input type="search" id="hub-search-input" class="hub-search-input" autocomplete="off" ' +
                    'placeholder="' + escapeAttr('搜索内容…') + '" value="' + escapeAttr(searchQuery) + '">' +
                '<button type="button" id="hub-search-clear" class="hub-search-clear' +
                    (searchQuery ? ' is-visible' : '') + '" aria-label="清除">' +
                    '<i class="fas fa-times"></i></button>' +
            '</div>';
        bindSearch(toolbarEl);
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
                var match = !normalized || text.indexOf(normalized) !== -1;
                card.classList.toggle('is-hidden', !match);
                if (match) {
                    groupVisible += 1;
                    visibleCount += 1;
                }
            });
            groupEl.classList.toggle('is-hidden', groupVisible === 0);
        });
        if (emptyEl) emptyEl.classList.toggle('is-visible', normalized.length > 0 && visibleCount === 0);
    }

    function renderGroups(containerEl, groups) {
        groups.forEach(function (group, index) {
            var sectionEl = document.createElement('section');
            sectionEl.id = 'section-' + index;
            sectionEl.className = 'hub-group';
            var headerEl = document.createElement('h3');
            headerEl.className = 'hub-group-head';
            headerEl.textContent = group.title || '';
            sectionEl.appendChild(headerEl);
            var gridEl = document.createElement('div');
            gridEl.className = 'hub-tools-grid';
            group.items.forEach(function (item) {
                var label = item.title || '';
                var card = document.createElement('a');
                card.href = item.url || '#';
                card.className = 'hub-tool-card';
                card.dataset.search = (group.title || '') + ' ' + label;
                card.innerHTML = '<h3>' + escapeHtml(label) + '</h3>';
                gridEl.appendChild(card);
            });
            sectionEl.appendChild(gridEl);
            containerEl.appendChild(sectionEl);
        });
        var emptyEl = document.createElement('div');
        emptyEl.id = 'hub-empty-search';
        emptyEl.className = 'hub-empty-search';
        emptyEl.textContent = '没有匹配的内容';
        containerEl.appendChild(emptyEl);
    }

    function renderLifeHub() {
        var centerEl = document.getElementById('main-content');
        var mobileToolbar = document.getElementById('hub-mobile-toolbar');
        if (!centerEl) return;
        var groups = getGroups();
        centerEl.innerHTML = '';
        if (!groups.length) {
            centerEl.innerHTML = '<div class="text-center text-gray-500 py-12">暂无内容</div>';
            return;
        }
        renderMobileSearch(mobileToolbar);
        renderGroups(centerEl, groups);
        if (searchQuery) applySearchFilter(searchQuery);
    }

    window.renderLifeHub = renderLifeHub;
})();
