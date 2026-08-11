/**
 * Admin-only private tools hub.
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
    return typeof window.tbLabel === 'function' ? window.tbLabel(item) : (item.title || item.titleKey || '');
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function isAdminUser(user) {
    if (!user) return false;
    var adminEmail = (window.siteConfig && siteConfig.adminEmail) || '';
    var adminPhone = (window.siteConfig && siteConfig.adminPhone) || '';
    if (user.role === 'admin') return true;
    if (adminEmail && (user.email || '').toLowerCase() === adminEmail.toLowerCase()) return true;
    if (adminPhone && String(user.phone || '').trim() === String(adminPhone).trim()) return true;
    return false;
  }

  function showGate(msg) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var gateMsg = document.getElementById('gate-msg');
    var loginLink = document.getElementById('login-link');
    var gateLogin = document.getElementById('gate-login');
    var next = encodeURIComponent('/html/admin/private.html');
    var loginHref = '../auth/login.html?next=' + next;
    if (gateMsg && msg) gateMsg.textContent = msg;
    if (gate) gate.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (loginLink) {
      loginLink.href = loginHref;
      loginLink.classList.remove('hidden');
    }
    if (gateLogin) gateLogin.href = loginHref;
  }

  function showApp(user) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var authLabel = document.getElementById('auth-label');
    var loginLink = document.getElementById('login-link');
    if (gate) gate.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    if (loginLink) loginLink.classList.add('hidden');
    if (authLabel) {
      authLabel.textContent = user.display || 'Admin';
    }
    renderGroups();
  }

  function toolHref(url) {
    var u = String(url || '');
    if (!u) return '#';
    if (/^https?:\/\//i.test(u)) return u;
    // Pages under html/admin/private/... → relative from html/admin/
    if (u.indexOf('html/admin/') === 0) return u.replace(/^html\/admin\//, '');
    if (u.indexOf('html/') === 0) return '../../' + u;
    return u;
  }

  function renderGroups() {
    var root = document.getElementById('groups');
    if (!root) return;
    root.innerHTML = '';
    var cfg = window.privateToolsConfig || {};
    var groups = cfg.groups || [];
    var anyItem = false;

    groups.forEach(function (group) {
      var items = group.items || [];
      var section = document.createElement('section');
      section.className = 'private-group';
      var title = document.createElement('h3');
      title.textContent = tr(group.titleKey, group.title || '');
      section.appendChild(title);

      if (!items.length) {
        var empty = document.createElement('p');
        empty.className = 'private-empty';
        empty.textContent = tr('privateHub.emptyGroup', '暂无工具，迁入后显示在此');
        section.appendChild(empty);
      } else {
        anyItem = true;
        var grid = document.createElement('div');
        grid.className = 'private-grid';
        items.forEach(function (item) {
          var a = document.createElement('a');
          a.className = 'private-card';
          a.href = toolHref(item.url);
          var descKey = item.descriptionKey
            || (item.titleKey || '').replace(/\.title$/i, '.desc').replace(/Title$/, 'Desc');
          a.innerHTML =
            '<h4 class="private-card-title"></h4><p class="private-card-desc"></p>';
          a.querySelector('.private-card-title').textContent = lbl(item);
          a.querySelector('.private-card-desc').textContent = tr(descKey, '');
          grid.appendChild(a);
        });
        section.appendChild(grid);
      }
      root.appendChild(section);
    });

    if (!groups.length && !anyItem) {
      root.innerHTML = '<p class="private-empty">' + tr('privateHub.empty', '暂无自用工具') + '</p>';
    }
  }

  function boot() {
    var tok = token();
    if (!tok) {
      showGate(tr('privateHub.needLogin', '请先登录管理员账号'));
      return;
    }
    fetch(apiBase() + '/auth/me', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok },
      cache: 'no-store'
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error('forbidden');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var user = data.user || data;
        if (!isAdminUser(user)) {
          showGate(tr('privateHub.needAdmin', '需要管理员登录后查看'));
          return;
        }
        showApp(user);
      })
      .catch(function () {
        showGate(tr('privateHub.needAdmin', '需要管理员登录后查看'));
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
