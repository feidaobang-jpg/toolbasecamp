/**
 * Home PC admin tools — sidebar from privateToolsConfig (家里电脑 group).
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
    var name = u.split('/').pop() || '';
    return name || u;
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

  function render() {
    var aside = document.getElementById('home-pc-sidebar');
    if (!aside) return;
    var items = homePcItems();
    if (!items.length) {
      aside.setAttribute('aria-hidden', 'true');
      aside.innerHTML = '';
      return;
    }
    aside.setAttribute('aria-hidden', 'false');
    var here = currentFile();
    var html =
      '<div class="home-pc-sidebar-head">' +
        '<a href="../../private.html" class="home-pc-sidebar-home">' +
          '<i class="fas fa-th-large" aria-hidden="true"></i>' +
          '<span>' + tr('privateHub.title', '后台') + '</span>' +
        '</a>' +
      '</div>' +
      '<p class="home-pc-sidebar-label">' + tr('privateHub.groups.homePc', '家里电脑') + '</p>' +
      '<ul class="home-pc-nav-list">';
    items.forEach(function (item) {
      var href = itemHref(item);
      var active = href.toLowerCase() === here;
      html +=
        '<li class="home-pc-nav-item' + (active ? ' is-active' : '') + '">' +
          '<a href="' + href + '">' + lbl(item) + '</a>' +
        '</li>';
    });
    html += '</ul>';
    aside.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
  document.addEventListener('tb:locale', render);
})();
