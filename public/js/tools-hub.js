function renderPortals(container) {
    if (typeof portalsConfig === 'undefined' || !Array.isArray(portalsConfig) || portalsConfig.length === 0) {
        return;
    }

    const sectionEl = document.createElement('section');
    sectionEl.className = 'mb-10';

    const headerEl = document.createElement('div');
    headerEl.className = 'mb-6';
    headerEl.innerHTML = '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Portals</h2><p class="text-sm text-gray-500 mt-1">Extended tool collections hosted under Tool Basecamp.</p>';
    sectionEl.appendChild(headerEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6';

    portalsConfig.forEach(portal => {
        const isPdf = portal.theme === 'pdf';
        const card = document.createElement('a');
        card.href = portal.url || '#';
        if (isPdf) {
            card.className = 'group block bg-gradient-to-br from-rose-900 to-red-950 rounded-2xl p-6 sm:p-8 border border-rose-800 hover:border-rose-400 hover:shadow-xl transition-all duration-300 text-white';
            card.innerHTML =
                '<div class="flex items-start justify-between gap-4">' +
                    '<div class="min-w-0">' +
                        '<p class="text-xs uppercase tracking-wider text-rose-300 font-semibold mb-2">' + (portal.meta || '') + '</p>' +
                        '<h3 class="text-xl sm:text-2xl font-bold mb-3">' + (portal.title || '') + '</h3>' +
                        '<p class="text-sm text-slate-300 leading-relaxed">' + (portal.description || '') + '</p>' +
                    '</div>' +
                    '<div class="flex-shrink-0 w-12 h-12 rounded-xl bg-rose-600/20 flex items-center justify-center text-rose-300 group-hover:bg-rose-600 group-hover:text-white transition-colors">' +
                        '<i class="fas fa-file-pdf text-lg"></i>' +
                    '</div>' +
                '</div>' +
                '<span class="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-rose-300 group-hover:text-white transition-colors">' +
                    (portal.cta || 'Open') + ' <i class="fas fa-arrow-right text-xs"></i>' +
                '</span>';
        } else {
            card.className = 'group block bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 sm:p-8 border border-slate-700 hover:border-blue-400 hover:shadow-xl transition-all duration-300 text-white';
            card.innerHTML =
                '<div class="flex items-start justify-between gap-4">' +
                    '<div class="min-w-0">' +
                        '<p class="text-xs uppercase tracking-wider text-blue-300 font-semibold mb-2">' + (portal.meta || '') + '</p>' +
                        '<h3 class="text-xl sm:text-2xl font-bold mb-3">' + (portal.title || '') + '</h3>' +
                        '<p class="text-sm text-slate-300 leading-relaxed">' + (portal.description || '') + '</p>' +
                    '</div>' +
                    '<div class="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">' +
                        '<i class="fas fa-code text-lg"></i>' +
                    '</div>' +
                '</div>' +
                '<span class="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-blue-300 group-hover:text-white transition-colors">' +
                    (portal.cta || 'Open') + ' <i class="fas fa-arrow-right text-xs"></i>' +
                '</span>';
        }
        gridEl.appendChild(card);
    });

    sectionEl.appendChild(gridEl);
    container.appendChild(sectionEl);
}

function renderToolGroups(container) {
    if (typeof toolsConfig === 'undefined' || !Array.isArray(toolsConfig.groups) || toolsConfig.groups.length === 0) {
        return;
    }

    if (toolsConfig.sectionTitle) {
        const titleWrap = document.createElement('div');
        titleWrap.className = 'mb-6 pt-2 border-t border-gray-200';
        titleWrap.innerHTML = '<h2 class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mt-8">' + toolsConfig.sectionTitle + '</h2>';
        container.appendChild(titleWrap);
    }

    toolsConfig.groups.forEach((group, index) => {
        if (!group || !group.title || !Array.isArray(group.items) || group.items.length === 0) return;

        const sectionEl = document.createElement('section');
        sectionEl.id = 'section-' + index;
        sectionEl.className = index === 0 ? '' : 'mt-10';

        const headerEl = document.createElement('div');
        headerEl.className = 'flex items-center gap-4';
        headerEl.innerHTML = '<h3 class="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">' + group.title + '</h3>';

        const gridEl = document.createElement('div');
        gridEl.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6';

        group.items.forEach(item => {
            const card = document.createElement('a');
            card.href = item.url || '#';
            card.className = 'group bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300 flex items-center h-full';
            card.innerHTML = '<h3 class="font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">' + (item.title || '') + '</h3>';
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
        mainContent.innerHTML = '<div class="text-center text-gray-500 py-12">No tools configured.</div>';
        return;
    }

    mainContent.appendChild(containerEl);
}

window.renderToolsHub = renderToolsHub;
