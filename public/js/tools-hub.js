function renderPortals(container) {
    if (typeof portalsConfig === 'undefined' || !Array.isArray(portalsConfig) || portalsConfig.length === 0) {
        return;
    }

    const tr = (k) => (typeof window.t === 'function' ? window.t(k) : k);
    const lbl = (item) => (typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.title || ''));

    const portalThemes = {
        pdf: {
            card: 'group block bg-gradient-to-br from-rose-900 to-red-950 rounded-2xl p-6 sm:p-8 border border-rose-800 hover:border-rose-400 hover:shadow-xl transition-all duration-300 text-white',
            label: 'text-rose-300',
            iconWrap: 'bg-rose-600/20 text-rose-300 group-hover:bg-rose-600 group-hover:text-white',
            cta: 'text-rose-300 group-hover:text-white',
            icon: 'fa-file-pdf'
        },
        dev: {
            card: 'group block bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 sm:p-8 border border-slate-700 hover:border-blue-400 hover:shadow-xl transition-all duration-300 text-white',
            label: 'text-blue-300',
            iconWrap: 'bg-blue-600/20 text-blue-300 group-hover:bg-blue-600 group-hover:text-white',
            cta: 'text-blue-300 group-hover:text-white',
            icon: 'fa-code'
        },
        chef: {
            card: 'group block bg-gradient-to-br from-amber-900 to-orange-950 rounded-2xl p-6 sm:p-8 border border-amber-800 hover:border-amber-400 hover:shadow-xl transition-all duration-300 text-white',
            label: 'text-amber-300',
            iconWrap: 'bg-amber-600/20 text-amber-300 group-hover:bg-amber-600 group-hover:text-white',
            cta: 'text-amber-300 group-hover:text-white',
            icon: 'fa-shield-halved'
        },
        hoppscotch: {
            card: 'group block bg-gradient-to-br from-emerald-900 to-teal-950 rounded-2xl p-6 sm:p-8 border border-emerald-800 hover:border-emerald-400 hover:shadow-xl transition-all duration-300 text-white',
            label: 'text-emerald-300',
            iconWrap: 'bg-emerald-600/20 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white',
            cta: 'text-emerald-300 group-hover:text-white',
            icon: 'fa-paper-plane'
        },
        translate: {
            card: 'group block bg-gradient-to-br from-sky-900 to-blue-950 rounded-2xl p-6 sm:p-8 border border-sky-800 hover:border-sky-400 hover:shadow-xl transition-all duration-300 text-white',
            label: 'text-sky-300',
            iconWrap: 'bg-sky-600/20 text-sky-300 group-hover:bg-sky-600 group-hover:text-white',
            cta: 'text-sky-300 group-hover:text-white',
            icon: 'fa-language'
        }
    };

    const sectionEl = document.createElement('section');
    sectionEl.className = 'mb-10';

    const headerEl = document.createElement('div');
    headerEl.className = 'mb-6';
    headerEl.innerHTML =
        '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">' + tr('hub.portalsTitle') + '</h2>' +
        '<p class="text-sm text-gray-500 mt-1">' + tr('hub.portalsSubtitle') + '</p>';
    sectionEl.appendChild(headerEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';

    portalsConfig.forEach(portal => {
        const theme = portalThemes[portal.theme] || portalThemes.dev;
        const card = document.createElement('a');
        card.href = portal.url || '#';
        const title = lbl(portal);
        const desc = portal.descriptionKey ? tr(portal.descriptionKey) : (portal.description || '');
        const cta = portal.ctaKey ? tr(portal.ctaKey) : (portal.cta || tr('hub.open'));
        card.className = theme.card;
        card.innerHTML =
            '<div class="flex items-start justify-between gap-4">' +
                '<div class="min-w-0">' +
                    '<p class="text-xs uppercase tracking-wider ' + theme.label + ' font-semibold mb-2">' + (portal.meta || '') + '</p>' +
                    '<h3 class="text-xl sm:text-2xl font-bold mb-3">' + title + '</h3>' +
                    '<p class="text-sm text-slate-300 leading-relaxed">' + desc + '</p>' +
                '</div>' +
                '<div class="flex-shrink-0 w-12 h-12 rounded-xl ' + theme.iconWrap + ' flex items-center justify-center transition-colors">' +
                    '<i class="fas ' + theme.icon + ' text-lg"></i>' +
                '</div>' +
            '</div>' +
            '<span class="inline-flex items-center gap-2 mt-6 text-sm font-semibold ' + theme.cta + ' transition-colors">' +
                cta + ' <i class="fas fa-arrow-right text-xs"></i>' +
            '</span>';
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
        titleWrap.className = 'mb-6 pt-2 border-t border-gray-200';
        titleWrap.innerHTML = '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mt-8">' + tr(toolsConfig.sectionTitleKey) + '</h2>';
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
        gridEl.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6';

        group.items.forEach(item => {
            const card = document.createElement('a');
            card.href = item.url || '#';
            const label = item.titleKey ? tr(item.titleKey) : (item.title || '');
            card.className = 'group bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300 flex items-center h-full';
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

    renderPortals(containerEl);
    renderToolGroups(containerEl);

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
