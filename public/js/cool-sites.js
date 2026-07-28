/**
 * Cool sites directory page (migrated from Geek Frontier).
 */
(function () {
  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function currentLocale() {
    if (typeof window.tbGetLocale === 'function') return window.tbGetLocale();
    return document.documentElement.lang || 'en';
  }

  function isEnglish() {
    var loc = String(currentLocale() || '').toLowerCase();
    return loc.indexOf('zh') !== 0;
  }

  function sectionTitle(section) {
    return tr('coolSites.sections.' + section.id, section.title);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dedupeItems(items) {
    var seen = Object.create(null);
    var out = [];
    (items || []).forEach(function (item) {
      var key = String(item.url || item.title || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function visibleGroups(section) {
    var groups = section.groups || [];
    if (!isEnglish()) return groups;
    return groups.filter(function (group) {
      return String(group.name || '') !== '国内';
    });
  }

  function faviconUrl(url) {
    try {
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(new URL(url).hostname) + '&sz=64';
    } catch (e) {
      return '';
    }
  }

  function setSidebarOpen(open) {
    var drawer = document.getElementById('cool-sites-drawer');
    var overlay = document.getElementById('cool-sites-overlay');
    if (!drawer || !overlay) return;
    if (open) {
      drawer.classList.add('is-open');
      overlay.classList.remove('hidden');
    } else {
      drawer.classList.remove('is-open');
      overlay.classList.add('hidden');
    }
  }

  function bindSidebarLink(a, sectionId) {
    a.addEventListener('click', function () {
      document.querySelectorAll('.cool-sites-aside-nav a').forEach(function (el) {
        el.classList.toggle('sidebar-active', el.getAttribute('href') === '#' + sectionId);
      });
      if (window.innerWidth < 768) setSidebarOpen(false);
    });
  }

  function render() {
    var data = window.COOL_SITES_DATA || [];
    var sidebarNav = document.getElementById('sidebar-nav');
    var mobileNav = document.getElementById('mobile-sidebar-nav');
    var mainContent = document.getElementById('main-content');
    var yearEl = document.getElementById('cool-sites-year');
    if (!sidebarNav || !mobileNav || !mainContent) return;

    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    sidebarNav.innerHTML = '';
    mobileNav.innerHTML = '';
    mainContent.innerHTML = '';

    var en = isEnglish();
    var visibleSections = [];
    data.forEach(function (section) {
      var groups = visibleGroups(section).filter(function (group) {
        return dedupeItems(group.items).length > 0;
      });
      if (!groups.length) return;
      visibleSections.push({ section: section, groups: groups });
    });

    visibleSections.forEach(function (entry, index) {
      var section = entry.section;
      var groups = entry.groups;
      var title = sectionTitle(section);

      var menuItem = document.createElement('a');
      menuItem.href = '#' + section.id;
      menuItem.innerHTML =
        '<i class="' + escapeHtml(section.icon) + '"></i><span class="font-medium">' +
        escapeHtml(title) + '</span>';
      if (index === 0) menuItem.classList.add('sidebar-active');
      bindSidebarLink(menuItem, section.id);
      sidebarNav.appendChild(menuItem);

      var mobileItem = menuItem.cloneNode(true);
      bindSidebarLink(mobileItem, section.id);
      mobileNav.appendChild(mobileItem);

      var sectionEl = document.createElement('section');
      sectionEl.id = section.id;
      sectionEl.className = 'cool-sites-section';
      sectionEl.innerHTML =
        '<h2 class="cool-sites-section-title"><i class="' + escapeHtml(section.icon) + '"></i> ' +
        escapeHtml(title) + '</h2>';

      groups.forEach(function (group) {
        // English: only overseas items — hide redundant "国外" subgroup headers.
        if (!en) {
          var groupTitle = document.createElement('h3');
          groupTitle.className = 'cool-sites-group-title';
          groupTitle.textContent = group.name;
          sectionEl.appendChild(groupTitle);
        }

        var grid = document.createElement('div');
        grid.className = 'cool-sites-grid';

        dedupeItems(group.items).forEach(function (item) {
          var card = document.createElement('a');
          card.href = item.url;
          card.target = String(item.url || '').indexOf('http') === 0 ? '_blank' : '_self';
          card.rel = card.target === '_blank' ? 'noopener noreferrer' : '';
          card.className = 'cool-sites-card';

          var iconHtml;
          if (item.isFontIcon) {
            iconHtml =
              '<div class="cool-sites-card-fa" aria-hidden="true"><i class="' +
              escapeHtml(item.icon || 'fas fa-link') + '"></i></div>';
          } else {
            var src = faviconUrl(item.url) || item.icon || '';
            iconHtml =
              '<img src="' + escapeHtml(src) + '" alt="" class="cool-sites-card-icon" loading="lazy" ' +
              'onerror="this.style.visibility=\'hidden\'">';
          }

          card.innerHTML =
            iconHtml +
            '<div class="cool-sites-card-body">' +
            '<h3 class="cool-sites-card-title">' + escapeHtml(item.title) + '</h3>' +
            '<p class="cool-sites-card-desc">' +
            escapeHtml(item.desc || tr('coolSites.defaultDesc', '优质网站推荐')) +
            '</p></div>';
          grid.appendChild(card);
        });

        sectionEl.appendChild(grid);
      });

      mainContent.appendChild(sectionEl);
    });
  }

  function syncActiveFromScroll() {
    var currentId = '';
    document.querySelectorAll('#main-content .cool-sites-section').forEach(function (el) {
      if (el.getBoundingClientRect().top <= 150) currentId = el.id;
    });
    if (!currentId) return;
    document.querySelectorAll('.cool-sites-aside-nav a').forEach(function (el) {
      el.classList.toggle('sidebar-active', el.getAttribute('href') === '#' + currentId);
    });
  }

  function init() {
    render();
    var mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.addEventListener('scroll', syncActiveFromScroll, { passive: true });
    }
    var openBtn = document.getElementById('cool-sites-open');
    var closeBtn = document.getElementById('cool-sites-close');
    var overlay = document.getElementById('cool-sites-overlay');
    if (openBtn) openBtn.addEventListener('click', function () { setSidebarOpen(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setSidebarOpen(false); });
    if (overlay) overlay.addEventListener('click', function () { setSidebarOpen(false); });
    document.addEventListener('tb:locale', function () { render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
