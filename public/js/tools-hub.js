function renderPortals(container) {
    if (typeof portalsConfig === 'undefined' || !Array.isArray(portalsConfig) || portalsConfig.length === 0) {
        return;
    }

    const tr = (k) => (typeof window.t === 'function' ? window.t(k) : k);
    const lbl = (item) => (typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.title || ''));

    const portalThemes = {
        pdf: {
            card: 'group flex gap-3 items-start bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-rose-500 hover:border-rose-300 hover:shadow-md transition-all duration-200 h-full',
            iconWrap: 'bg-rose-50 text-rose-600 group-hover:bg-rose-100',
            titleHover: 'group-hover:text-rose-600',
            external: 'group-hover:text-rose-500',
            icon: 'fa-file-pdf'
        },
        dev: {
            card: 'group flex gap-3 items-start bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-slate-700 hover:border-slate-400 hover:shadow-md transition-all duration-200 h-full',
            iconWrap: 'bg-slate-100 text-slate-700 group-hover:bg-slate-200',
            titleHover: 'group-hover:text-slate-800',
            external: 'group-hover:text-slate-600',
            icon: 'fa-code'
        },
        chef: {
            card: 'group flex gap-3 items-start bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-amber-500 hover:border-amber-300 hover:shadow-md transition-all duration-200 h-full',
            iconWrap: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
            titleHover: 'group-hover:text-amber-700',
            external: 'group-hover:text-amber-500',
            icon: 'fa-shield-halved'
        },
        hoppscotch: {
            card: 'group flex gap-3 items-start bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-emerald-500 hover:border-emerald-300 hover:shadow-md transition-all duration-200 h-full',
            iconWrap: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
            titleHover: 'group-hover:text-emerald-700',
            external: 'group-hover:text-emerald-500',
            icon: 'fa-paper-plane'
        },
        translate: {
            card: 'group flex gap-3 items-start bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-sky-500 hover:border-sky-300 hover:shadow-md transition-all duration-200 h-full',
            iconWrap: 'bg-sky-50 text-sky-600 group-hover:bg-sky-100',
            titleHover: 'group-hover:text-sky-700',
            external: 'group-hover:text-sky-500',
            icon: 'fa-language'
        }
    };

    const sectionEl = document.createElement('section');
    sectionEl.className = 'mt-10 pt-8 border-t border-gray-200';

    const headerEl = document.createElement('div');
    headerEl.className = 'mb-5';
    headerEl.innerHTML =
        '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">' + tr('hub.portalsTitle') + '</h2>' +
        '<p class="text-sm text-gray-500 mt-1">' + tr('hub.portalsSubtitle') + '</p>';
    sectionEl.appendChild(headerEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4';

    portalsConfig.forEach(portal => {
        const theme = portalThemes[portal.theme] || portalThemes.dev;
        const card = document.createElement('a');
        card.href = portal.url || '#';
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        const title = lbl(portal);
        const desc = portal.descriptionKey ? tr(portal.descriptionKey) : (portal.description || '');
        card.className = theme.card;
        card.innerHTML =
            '<div class="flex-shrink-0 w-10 h-10 rounded-lg ' + theme.iconWrap + ' flex items-center justify-center transition-colors">' +
                '<i class="fas ' + theme.icon + ' text-sm"></i>' +
            '</div>' +
            '<div class="min-w-0 flex-1">' +
                '<h3 class="font-bold text-gray-900 text-sm leading-snug ' + theme.titleHover + ' transition-colors">' + title + '</h3>' +
                '<p class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">' + desc + '</p>' +
                (portal.meta ? '<p class="text-[11px] text-gray-400 mt-1.5 truncate">' + portal.meta + '</p>' : '') +
            '</div>' +
            '<i class="fas fa-arrow-up-right-from-square text-xs text-gray-300 flex-shrink-0 mt-0.5 ' + theme.external + ' transition-colors"></i>';
        gridEl.appendChild(card);
    });

    sectionEl.appendChild(gridEl);
    container.appendChild(sectionEl);
}

function renderToolGroups(container) {
    if (typeof toolsConfig === 'undefined' || !Array.isArray(toolsConfig.groups) || toolsConfig.groups.length === 0) {
        return;
    }

    const tr = (k) => (typeof window.t === 'function' ? window.t(k) : k);

    if (toolsConfig.sectionTitleKey) {
        const titleWrap = document.createElement('div');
        titleWrap.className = 'mb-6';
        titleWrap.innerHTML = '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">' + tr(toolsConfig.sectionTitleKey) + '</h2>';
        container.appendChild(titleWrap);
    }

    toolsConfig.groups.forEach((group, index) => {
        if (!group || !group.titleKey || !Array.isArray(group.items) || group.items.length === 0) return;

        const sectionEl = document.createElement('section');
        sectionEl.id = 'section-' + index;
        sectionEl.className = index === 0 ? '' : 'mt-10';

        const headerEl = document.createElement('div');
        headerEl.className = 'flex items-center gap-4';
        headerEl.innerHTML = '<h3 class="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">' + tr(group.titleKey) + '</h3>';

        const gridEl = document.createElement('div');
        gridEl.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4';

        group.items.forEach(item => {
            const card = document.createElement('a');
            card.href = item.url || '#';
            const label = item.titleKey ? tr(item.titleKey) : (item.title || '');
            card.className = 'group bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all duration-200 flex items-center h-full';
            card.innerHTML = '<h3 class="font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">' + label + '</h3>';
            gridEl.appendChild(card);
        });

        sectionEl.appendChild(headerEl);
        sectionEl.appendChild(gridEl);
        container.appendChild(sectionEl);
    });
}

function renderToolsHub() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.innerHTML = '';

    const containerEl = document.createElement('div');
    containerEl.className = 'max-w-7xl mx-auto';

    renderToolGroups(containerEl);
    renderPortals(containerEl);

    if (!containerEl.children.length) {
        const tr = (k) => (typeof window.t === 'function' ? window.t(k) : k);
        mainContent.innerHTML = '<div class="text-center text-gray-500 py-12">' + tr('hub.noTools') + '</div>';
        return;
    }

    mainContent.appendChild(containerEl);
}

window.renderToolsHub = renderToolsHub;

document.addEventListener('tb:locale', function () {
    if (typeof window.renderToolsHub === 'function') renderToolsHub();
});
