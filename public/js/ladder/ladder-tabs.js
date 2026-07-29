/**
 * Render category chips for the performance ladder group.
 */
(function () {
    'use strict';

    var GROUP_KEY = 'tools.groups.ladder';

    function label(item) {
        if (typeof window.tbLabel === 'function') return window.tbLabel(item);
        if (!item) return '';
        if (item.titleKey && typeof window.t === 'function') return window.t(item.titleKey);
        return item.title || '';
    }

    function render() {
        var tabsEl = document.getElementById('ladder-tabs');
        if (!tabsEl || typeof toolsConfig === 'undefined' || !Array.isArray(toolsConfig.groups)) {
            return;
        }

        var group = toolsConfig.groups.find(function (g) {
            return g && g.titleKey === GROUP_KEY;
        });
        if (!group || !Array.isArray(group.items)) return;

        var currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase();
        tabsEl.innerHTML = '';

        group.items.forEach(function (item) {
            var url = (item && item.url) ? item.url : '';
            var href = url.split('/').pop() || '';
            var isActive = currentPage === href.toLowerCase();

            var a = document.createElement('a');
            a.href = href;
            a.className = isActive ? 'is-active' : '';
            a.textContent = label(item);
            if (item.titleKey) a.setAttribute('data-i18n', item.titleKey);
            tabsEl.appendChild(a);
        });
    }

    render();
    document.addEventListener('tb:locale', render);
})();
