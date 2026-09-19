/*! 同学专区门禁：需登录且 isMarkSix */
(function () {
  'use strict';

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function showGate(msg) {
    var boot = document.getElementById('boot-loading');
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var gateMsg = document.getElementById('gate-msg');
    if (boot) boot.classList.add('hidden');
    if (gateMsg && msg) gateMsg.textContent = msg;
    if (gate) {
      gate.classList.remove('hidden');
      gate.hidden = false;
    }
    if (app) {
      app.classList.add('hidden');
      app.hidden = true;
    }
  }

  function showApp() {
    var boot = document.getElementById('boot-loading');
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    if (boot) boot.classList.add('hidden');
    if (gate) {
      gate.classList.add('hidden');
      gate.hidden = true;
    }
    if (app) {
      app.classList.remove('hidden');
      app.hidden = false;
    }
  }

  function boot() {
    var tok = token();
    var login = document.getElementById('gate-login');
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    if (login) {
      var base = '';
      try {
        if (typeof siteConfig !== 'undefined' && siteConfig.getSiteRootPrefix) {
          /* no-op */
        }
      } catch (e) { /* ignore */ }
      login.href = '../auth/login.html?next=' + next;
    }
    if (!tok) {
      showGate(tr('classmates.needLogin', '请先登录'));
      return;
    }
    fetch(apiBase() + '/auth/me', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) {
        return r.json().then(function (b) {
          return { res: r, body: b };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success || !pack.body.user) {
          showGate(tr('classmates.needLogin', '请先登录'));
          return;
        }
        var u = pack.body.user;
        var ok = !!u.isMarkSix;
        if (!ok && typeof window.tbIsAdminUser === 'function' && window.tbIsAdminUser(u)) ok = true;
        if (!ok) {
          showGate(tr('classmates.needMember', '当前账号不在同学名单中'));
          return;
        }
        window.__markSixUser = u;
        showApp();
        document.dispatchEvent(new CustomEvent('tb:mark-six-ready', { detail: { user: u } }));
      })
      .catch(function () {
        showGate(tr('classmates.needLogin', '请先登录'));
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.MarkSixGuard = { apiBase: apiBase, token: token, tr: tr };
})();
