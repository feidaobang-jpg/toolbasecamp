/**
 * Admin private tool: manually refresh performance ladder tables.
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

  function authHeaders() {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token()
    };
  }

  function showGate(msg) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var gateMsg = document.getElementById('gate-msg');
    var loginLink = document.getElementById('login-link');
    var gateLogin = document.getElementById('gate-login');
    var next = encodeURIComponent('/html/admin/private/ladder-update.html');
    var href = '../../auth/login.html?next=' + next;
    if (gateMsg && msg) gateMsg.textContent = msg;
    if (gate) gate.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (loginLink) {
      loginLink.href = href;
      loginLink.classList.remove('hidden');
    }
    if (gateLogin) gateLogin.href = href;
  }

  function showApp(user) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var authLabel = document.getElementById('auth-label');
    var loginLink = document.getElementById('login-link');
    if (gate) gate.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    if (loginLink) loginLink.classList.add('hidden');
    if (authLabel) authLabel.textContent = user.email || user.phone || user.display || 'admin';
  }

  function setStatus(text, isErr) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function renderList(data) {
    var root = document.getElementById('ladder-list');
    var metaEl = document.getElementById('meta-line');
    if (!root) return;
    root.innerHTML = '';
    (data.items || []).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'ladder-row' + (item.ok === false ? ' is-bad' : item.ok ? ' is-ok' : '');
      var state = item.has_cache
        ? (item.ok === false ? '失败' : '已缓存')
        : '尚未更新';
      row.innerHTML =
        '<div class="ladder-row-main">' +
        '<div class="ladder-row-title"></div>' +
        '<div class="ladder-row-meta"></div>' +
        '</div>' +
        '<button type="button" class="tb-btn ladder-row-btn">更新</button>';
      row.querySelector('.ladder-row-title').textContent = item.name + ' (' + item.id + ')';
      var meta =
        state +
        ' · ' +
        fmtTime(item.updated_at) +
        (item.error ? ' · ' + item.error : '') +
        (item.bytes ? ' · ' + item.bytes + ' B' : '');
      row.querySelector('.ladder-row-meta').textContent = meta;
      row.querySelector('button').addEventListener('click', function () {
        runRefresh([item.id]);
      });
      root.appendChild(row);
    });
    if (metaEl) {
      metaEl.textContent =
        '上次全量刷新：' +
        fmtTime(data.last_refresh) +
        (data.running ? ' · 正在刷新…' : '') +
        (data.web_root ? ' · 站点目录：' + data.web_root : '');
    }
  }

  function renderNbcheck(data) {
    var root = document.getElementById('nbcheck-list');
    if (!root) return;
    root.innerHTML = '';
    (data.lists || []).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'ladder-row' + (item.has_data ? ' is-ok' : '');
      row.innerHTML =
        '<div class="ladder-row-main">' +
        '<div class="ladder-row-title"></div>' +
        '<div class="ladder-row-meta"></div>' +
        '</div>' +
        '<button type="button" class="tb-btn ladder-row-btn">更新</button>';
      row.querySelector('.ladder-row-title').textContent = item.title + ' (' + item.id + ')';
      row.querySelector('.ladder-row-meta').textContent =
        (item.has_data ? '已缓存 ' + (item.kept || 0) + ' 条' : '尚未更新') +
        ' · ' +
        fmtTime(item.updated_at) +
        (data.last_error ? ' · ' + data.last_error : '');
      row.querySelector('button').addEventListener('click', runNbcheckRefresh);
      root.appendChild(row);
    });
  }

  function loadNbcheckStatus() {
    return fetch(apiBase() + '/nbcheck/status', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        renderNbcheck(data);
        return data;
      });
  }

  function runNbcheckRefresh() {
    var btn = document.getElementById('btn-refresh-nbcheck');
    if (btn) btn.disabled = true;
    setStatus('正在抓取 Notebookcheck 笔记本显卡榜…');
    fetch(apiBase() + '/nbcheck/refresh', {
      method: 'POST',
      headers: authHeaders(),
      body: '{}',
      cache: 'no-store'
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error((body && body.detail) || 'HTTP ' + res.status);
          return body;
        });
      })
      .then(function (body) {
        setStatus('Notebookcheck 更新完成：' + (body.kept || body.count || 0) + ' 条');
        return loadNbcheckStatus();
      })
      .catch(function (err) {
        setStatus('Notebookcheck 更新失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function loadStatus() {
    return fetch(apiBase() + '/ladder/status', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        renderList(data);
        return data;
      });
  }

  function runRefresh(ids) {
    var btnAll = document.getElementById('btn-refresh-all');
    if (btnAll) btnAll.disabled = true;
    setStatus(ids && ids.length ? '正在更新 ' + ids.join(', ') + '…' : '正在抓取全部天梯…');
    fetch(apiBase() + '/ladder/refresh', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(ids && ids.length ? { ids: ids } : {}),
      cache: 'no-store'
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error((body && body.detail) || 'HTTP ' + res.status);
          return body;
        });
      })
      .then(function (body) {
        var okCount = (body.results || []).filter(function (r) {
          return r.ok;
        }).length;
        var fail = (body.results || []).filter(function (r) {
          return !r.ok;
        });
        var msg = '完成：成功 ' + okCount + '/' + (body.results || []).length;
        if (fail.length) {
          msg +=
            '；失败：' +
            fail
              .map(function (f) {
                return f.id + ' (' + (f.error || '?') + ')';
              })
              .join('；');
        }
        setStatus(msg, fail.length > 0);
        return loadStatus();
      })
      .catch(function (err) {
        setStatus('更新失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btnAll) btnAll.disabled = false;
      });
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
        document.getElementById('btn-refresh-all').addEventListener('click', function () {
          runRefresh(null);
        });
        var btnNb = document.getElementById('btn-refresh-nbcheck');
        if (btnNb) btnNb.addEventListener('click', runNbcheckRefresh);
        return Promise.all([
          loadStatus().catch(function (err) {
            setStatus('加载天梯状态失败：' + (err && err.message ? err.message : err), true);
          }),
          loadNbcheckStatus().catch(function (err) {
            setStatus('加载 Notebookcheck 状态失败：' + (err && err.message ? err.message : err), true);
          })
        ]);
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
