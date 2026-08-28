/**
 * Admin gate for private tool pages (#gate / #app).
 */
(function () {
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
    if (typeof window.tbIsAdminUser === 'function') return window.tbIsAdminUser(user);
    if (!user) return false;
    var adminEmail = (window.siteConfig && siteConfig.adminEmail) || '';
    var adminPhone = (window.siteConfig && siteConfig.adminPhone) || '';
    if (user.role === 'admin') return true;
    if (adminEmail && (user.email || '').toLowerCase() === adminEmail.toLowerCase()) return true;
    if (adminPhone && String(user.phone || '').trim() === String(adminPhone).trim()) return true;
    return false;
  }

  function showGate(msg) {
    if (typeof window.tbAdminShowGate === 'function') {
      window.tbAdminShowGate(msg);
      return;
    }
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    if (gate) gate.classList.remove('hidden');
    if (app) app.classList.add('hidden');
  }

  function showApp(user) {
    if (typeof window.tbAdminShowApp === 'function') {
      window.tbAdminShowApp(user, { hideHeaderAuth: true });
      return;
    }
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    if (gate) gate.classList.add('hidden');
    if (app) app.classList.remove('hidden');
  }

  function boot() {
    var tok = token();
    if (!tok) {
      showGate('请先登录管理员账号');
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
          showGate('需要管理员登录后查看');
          return;
        }
        showApp(user);
      })
      .catch(function () {
        showGate('需要管理员登录后查看');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
