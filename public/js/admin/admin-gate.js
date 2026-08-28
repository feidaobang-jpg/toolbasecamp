/**
 * Shared admin gate UI (#gate / #app / header auth).
 * Gate card keeps the single login button; header login-link stays hidden.
 */
(function () {
  'use strict';

  function loginHref() {
    var next = encodeURIComponent(
      (window.location.pathname || '') + (window.location.search || '')
    );
    var path = window.location.pathname || '';
    if (path.indexOf('/private/home-pc/') !== -1 || path.indexOf('/private/android/') !== -1) {
      return '../../../auth/login.html?next=' + next;
    }
    if (path.indexOf('/admin/private/') !== -1) {
      return '../../auth/login.html?next=' + next;
    }
    if (path.indexOf('/admin/') !== -1) {
      return '../auth/login.html?next=' + next;
    }
    return '../auth/login.html?next=' + next;
  }

  function tbAdminShowGate(msg) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var gateMsg = document.getElementById('gate-msg');
    var loginLink = document.getElementById('login-link');
    var gateLogin = document.getElementById('gate-login');
    var authLabel = document.getElementById('auth-label');
    var boot = document.getElementById('boot-loading');
    var href = loginHref();

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
    if (loginLink) loginLink.classList.add('hidden');
    if (gateLogin) gateLogin.href = href;
    if (authLabel) {
      authLabel.textContent = '';
      authLabel.classList.add('hidden');
    }
  }

  function tbAdminShowApp(user, opts) {
    opts = opts || {};
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var authLabel = document.getElementById('auth-label');
    var boot = document.getElementById('boot-loading');
    var headerActions = authLabel && authLabel.parentElement;

    if (boot) boot.classList.add('hidden');
    if (gate) {
      gate.classList.add('hidden');
      gate.hidden = true;
    }
    if (app) {
      app.classList.remove('hidden');
      app.hidden = false;
    }
    if (loginLink) loginLink.classList.add('hidden');

    if (opts.hideHeaderAuth) {
      if (authLabel) {
        authLabel.textContent = '';
        authLabel.classList.add('hidden');
      }
      if (headerActions) headerActions.classList.add('hidden');
    } else if (authLabel) {
      authLabel.textContent =
        (user && (user.phone || user.email || user.display)) || '';
      authLabel.classList.remove('hidden');
      if (headerActions) headerActions.classList.remove('hidden');
    }

    document.body.classList.add('tb-admin-private');
    document.dispatchEvent(new CustomEvent('tb:private-ready', { detail: { user: user } }));
  }

  window.tbAdminLoginHref = loginHref;
  window.tbAdminShowGate = tbAdminShowGate;
  window.tbAdminShowApp = tbAdminShowApp;
})();
