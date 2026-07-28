(function () {
  'use strict';

  var TOKEN_KEY = 'auth_token';
  var gate = document.getElementById('gate');
  var gateMsg = document.getElementById('gate-msg');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var authLabel = document.getElementById('auth-label');
  var rangeSelect = document.getElementById('range-days');
  var refreshBtn = document.getElementById('refresh-btn');
  var errorBox = document.getElementById('error-box');

  function apiBase() {
    if (window.siteConfig && window.siteConfig.apiBase) return window.siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function showError(msg) {
    if (!errorBox) return;
    if (!msg) {
      errorBox.hidden = true;
      errorBox.textContent = '';
      return;
    }
    errorBox.hidden = false;
    errorBox.textContent = msg;
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

  function fmt(n) {
    return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderBars(container, items, maxCount) {
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<p class="text-sm text-gray-400">暂无</p>';
      return;
    }
    items.forEach(function (item) {
      var pct = maxCount > 0 ? Math.max(2, Math.round((item.count / maxCount) * 100)) : 0;
      var row = document.createElement('div');
      row.className = 'module-row';
      row.innerHTML =
        '<div class="text-sm text-gray-800 truncate">' + escapeHtml(item.name) + '</div>' +
        '<div class="text-sm font-semibold tabular-nums">' + fmt(item.count) + '</div>' +
        '<div class="stats-bar"><span style="width:' + pct + '%"></span></div>';
      container.appendChild(row);
    });
  }

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  function renderTop(items) {
    var body = document.getElementById('top-body');
    var empty = document.getElementById('top-empty');
    body.innerHTML = '';
    if (!items.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    var max = items[0].count || 1;
    items.forEach(function (item, idx) {
      var pct = max > 0 ? Math.max(2, Math.round((item.count / max) * 100)) : 0;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="text-gray-400">' + (idx + 1) + '</td>' +
        '<td><code class="text-xs text-gray-800">' + escapeHtml(item.name) + '</code></td>' +
        '<td class="font-semibold tabular-nums">' + fmt(item.count) + '</td>' +
        '<td style="width:40%"><div class="stats-bar"><span style="width:' + pct + '%"></span></div></td>';
      body.appendChild(tr);
    });
  }

  function loadOverview() {
    showError('');
    var days = parseInt(rangeSelect.value, 10) || 7;
    return fetch(apiBase() + '/stats/overview?days=' + days, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token()
      },
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('forbidden');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      document.getElementById('site-pv').textContent = fmt(data.site_pv);
      document.getElementById('site-uv').textContent = fmt(data.site_uv);
      var top = data.events_top || [];
      var sum = top.reduce(function (a, b) { return a + (b.count || 0); }, 0);
      document.getElementById('event-sum').textContent = fmt(sum);
      document.getElementById('event-kinds').textContent = fmt(top.length);
      document.getElementById('range-label').textContent =
        (data.from || '') + ' → ' + (data.to || '') + ' · 共 ' + (data.days || days) + ' 天';
      var modules = data.modules || [];
      var maxMod = modules.length ? modules[0].count : 0;
      renderBars(document.getElementById('module-list'), modules, maxMod);
      renderTop(top);
    }).catch(function (err) {
      if (err && err.message === 'forbidden') {
        showGate('需要管理员账号登录');
        return;
      }
      showError('加载失败：' + (err && err.message ? err.message : 'unknown'));
    });
  }

  function showGate(msg) {
    app.classList.add('hidden');
    gate.classList.remove('hidden');
    if (gateMsg) gateMsg.textContent = msg || '需要管理员登录后查看';
    if (loginLink) loginLink.classList.remove('hidden');
  }

  function showApp(user) {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    if (loginLink) loginLink.classList.add('hidden');
    var label = user.phone || user.email || 'admin';
    if (authLabel) authLabel.textContent = label;
  }

  function boot() {
    var t = token();
    if (!t) {
      showGate('请先登录管理员账号');
      return;
    }
    fetch(apiBase() + '/auth/me', {
      headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('auth');
      return res.json();
    }).then(function (data) {
      var user = data.user || data;
      if (!isAdminUser(user)) {
        showGate('当前账号不是管理员');
        return;
      }
      showApp(user);
      loadOverview();
    }).catch(function () {
      showGate('登录已失效，请重新登录');
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', loadOverview);
  if (rangeSelect) rangeSelect.addEventListener('change', loadOverview);
  boot();
})();
