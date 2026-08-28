/**
 * Home PC admin — sidebar matches public tool pages (base.css .sidebar / .menu).
 */
(function () {
  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function lbl(item) {
    return typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.title || '');
  }

  function currentFile() {
    var p = window.location.pathname || '';
    var parts = p.split('/');
    return (parts[parts.length - 1] || '').split('?')[0].toLowerCase();
  }

  function itemHref(item) {
    var u = String((item && item.url) || '');
    if (!u) return '#';
    if (/^https?:\/\//i.test(u)) return u;
    return u.split('/').pop() || u;
  }

  function homePcItems() {
    var cfg = window.privateToolsConfig;
    if (!cfg || !Array.isArray(cfg.groups)) return [];
    var out = [];
    cfg.groups.forEach(function (group) {
      if (group.titleKey !== 'privateHub.groups.homePc') return;
      (group.items || []).forEach(function (item) {
        out.push(item);
      });
    });
    return out;
  }

  function logoBadge() {
    var logoText = (window.siteConfig && siteConfig.logoText) || 'TB';
    var key = tr('site.logoBadge', '');
    return key && key !== 'site.logoBadge' ? key : logoText;
  }

  function renderSidebar() {
    var sidebar = document.getElementById('home-pc-sidebar');
    if (!sidebar) return;
    var items = homePcItems();
    if (!items.length) {
      sidebar.innerHTML = '';
      return;
    }
    var here = currentFile();
    var groupLabel = tr('privateHub.groups.homePc', '家里电脑');
    var hubLabel = tr('privateHub.title', '后台');
    var menuHtml = '<li class="menu-group-title">' + groupLabel + '</li>';
    items.forEach(function (item) {
      var href = itemHref(item);
      var active = href.toLowerCase() === here;
      menuHtml +=
        '<li' + (active ? ' class="active"' : '') + '>' +
          '<a href="' + href + '">' + lbl(item) + '</a>' +
        '</li>';
    });
    sidebar.innerHTML =
      '<div class="logo">' +
        '<a class="logo-home-btn" href="../../private.html">' +
          '<span class="logo-badge">' + logoBadge() + '</span>' +
          '<span class="logo-home-label">' + hubLabel + '</span>' +
        '</a>' +
      '</div>' +
      '<nav class="menu"><ul>' + menuHtml + '</ul></nav>';
  }

  function bindMobileNav() {
    var sidebar = document.getElementById('home-pc-sidebar');
    var main = document.querySelector('.home-pc-main');
    if (!sidebar || !main) return;

    var here = currentFile();
    var title = '';
    homePcItems().forEach(function (item) {
      if (itemHref(item).toLowerCase() === here) title = lbl(item);
    });

    var bar = main.querySelector('.tool-mobile-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tool-mobile-bar';
      bar.innerHTML =
        '<button type="button" class="tool-menu-toggle" aria-label="Open menu">&#9776;</button>' +
        '<span class="tool-mobile-title"></span>';
      main.insertBefore(bar, main.firstChild);
    }
    var titleEl = bar.querySelector('.tool-mobile-title');
    if (titleEl) titleEl.textContent = title;

    var overlay = document.getElementById('tool-sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tool-sidebar-overlay';
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    function close() {
      sidebar.classList.remove('is-open');
      overlay.classList.remove('is-visible');
      document.body.style.overflow = '';
    }

    function open() {
      sidebar.classList.add('is-open');
      overlay.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }

    var toggleBtn = bar.querySelector('.tool-menu-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = function () {
        if (sidebar.classList.contains('is-open')) close();
        else open();
      };
    }
    overlay.onclick = close;

    if (!sidebar.dataset.mobileNavCloseBound) {
      sidebar.dataset.mobileNavCloseBound = '1';
      sidebar.addEventListener('click', function (e) {
        if (e.target.closest('a')) close();
      });
    }
  }

  function boot() {
    renderSidebar();
    bindMobileNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('tb:locale', boot);
})();
