/**
 * Admin private tool: manually refresh Notebookcheck rank lists.
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

  function hideBootLoading() {
    var el = document.getElementById('boot-loading');
    if (el) el.classList.add('hidden');
  }

  function showGate(msg) {
    hideBootLoading();
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
    hideBootLoading();
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var authLabel = document.getElementById('auth-label');
    var loginLink = document.getElementById('login-link');
    if (gate) gate.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    if (loginLink) loginLink.classList.add('hidden');
    if (authLabel) authLabel.textContent = user.email || user.phone || user.display || 'admin';
    document.dispatchEvent(new CustomEvent('tb:private-ready', { detail: { user: user } }));
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

  function publicRankHref(listId) {
    var map = {
      cpu: '../../ladder/cpu_rank.html',
      gpu: '../../ladder/gpu_rank.html',
      soc: '../../ladder/soc_rank.html',
      nb_cpu: '../../ladder/nb_cpu_rank.html',
      nb_gpu: '../../ladder/nb_gpu_rank.html'
    };
    return map[listId] || '../../ladder/nb_gpu_rank.html';
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
        '<a class="ladder-row-link" target="_blank" rel="noopener">查看</a>' +
        '<button type="button" class="tb-btn ladder-row-btn">更新</button>';
      row.querySelector('.ladder-row-title').textContent = item.title + ' (' + item.id + ')';
      row.querySelector('.ladder-row-meta').textContent =
        (item.has_data ? '已缓存 ' + (item.kept || 0) + ' 条' : '尚未更新') +
        ' · ' +
        fmtTime(item.updated_at) +
        (data.running && data.current_id === item.id ? ' · 抓取中…' : '') +
        (data.last_error ? ' · ' + data.last_error : '');
      var link = row.querySelector('a');
      if (link) link.href = publicRankHref(item.id);
      row.querySelector('button').addEventListener('click', function () {
        runNbcheckRefresh(item.id);
      });
      root.appendChild(row);
    });
  }

  function loadNbcheckStatus() {
    return fetch(apiBase() + '/health', { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (health) {
        if (!health || !health.nbcheck_api) {
          throw new Error('Notebookcheck API 未加载（需重新部署/重启 API）');
        }
        return fetch(apiBase() + '/nbcheck/status', {
          headers: authHeaders(),
          cache: 'no-store'
        });
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

  function runNbcheckRefresh(listId) {
    var btn = document.getElementById('btn-refresh-nbcheck');
    if (btn) btn.disabled = true;
    var target = listId || 'all';
    setStatus(
      target === 'all'
        ? '正在抓取全部 Notebookcheck 榜单…'
        : '正在抓取 Notebookcheck：' + target + '…'
    );
    fetch(apiBase() + '/nbcheck/refresh', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: target }),
      cache: 'no-store'
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error((body && body.detail) || 'HTTP ' + res.status);
          return body;
        });
      })
      .then(function (body) {
        var n = 0;
        if (body.results && body.results.length) {
          n = body.results.reduce(function (sum, r) {
            return sum + (r.kept || r.count || 0);
          }, 0);
          setStatus(
            'Notebookcheck 更新完成：' +
              (body.refreshed || []).join(', ') +
              '（共 ' +
              n +
              ' 条）'
          );
        } else {
          setStatus('Notebookcheck 更新完成：' + (body.kept || body.count || 0) + ' 条');
        }
        return loadNbcheckStatus();
      })
      .catch(function (err) {
        setStatus('Notebookcheck 更新失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function setNewsStatus(text, isErr) {
    var el = document.getElementById('news-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function loadNewsStatus() {
    return fetch(apiBase() + '/news/status', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var parts = [];
        if (data.running) parts.push('正在更新…');
        else if (data.count != null) parts.push('已缓存 ' + data.count + ' 条');
        if (data.index_updated_at) parts.push('页面 ' + fmtTime(data.index_updated_at));
        if (data.last_ok === false && data.last_error) parts.push(data.last_error);
        setNewsStatus(parts.join(' · ') || '—', data.last_ok === false);
        var link = document.getElementById('news-public-link');
        if (link && data.public_url) link.href = data.public_url;
        return data;
      });
  }

  function pollNewsUntilIdle(triesLeft) {
    var left = triesLeft == null ? 60 : triesLeft;
    return loadNewsStatus()
      .then(function (data) {
        if (data && data.running && left > 0) {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(pollNewsUntilIdle(left - 1));
            }, 5000);
          });
        }
        if (data && data.running) {
          setNewsStatus('仍在后台运行，请稍后刷新查看', false);
        } else if (data && data.last_ok) {
          setNewsStatus(
            '更新完成 · 已缓存 ' + (data.count || 0) + ' 条 · 页面 ' + fmtTime(data.index_updated_at),
            false
          );
        }
        return data;
      })
      .catch(function (err) {
        setNewsStatus('读取资讯状态失败：' + (err && err.message ? err.message : err), true);
      });
  }

  function runNewsRefresh() {
    var btn = document.getElementById('btn-refresh-news');
    var btnRegen = document.getElementById('btn-regen-news');
    if (btn) btn.disabled = true;
    if (btnRegen) btnRegen.disabled = true;
    setNewsStatus('已提交资讯更新任务…');
    fetch(apiBase() + '/news/refresh', {
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
      .then(function () {
        return pollNewsUntilIdle(60);
      })
      .catch(function (err) {
        setNewsStatus('资讯更新失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
        if (btnRegen) btnRegen.disabled = false;
      });
  }

  function runNewsRegen() {
    var btn = document.getElementById('btn-regen-news');
    var btnRefresh = document.getElementById('btn-refresh-news');
    if (btn) btn.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;
    setNewsStatus('已提交重生静态页任务…');
    fetch(apiBase() + '/news/regen', {
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
      .then(function () {
        return pollNewsUntilIdle(40);
      })
      .catch(function (err) {
        setNewsStatus('重生静态页失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
        if (btnRefresh) btnRefresh.disabled = false;
      });
  }

  function setPcBuildsStatus(text, isErr) {
    var el = document.getElementById('pcbuilds-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function loadPcBuildsStatus() {
    return fetch(apiBase() + '/pcbuilds/status', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var parts = [];
        if (data.running) parts.push('正在更新…');
        else if (data.builds != null) parts.push(data.builds + ' 套方案');
        if (data.json_mtime) parts.push('数据 ' + data.json_mtime);
        if (data.script_ok === false) parts.push('服务器脚本未安装');
        if (data.last_ok === false && data.last_error) parts.push(data.last_error);
        setPcBuildsStatus(parts.join(' · ') || '—', data.last_ok === false || data.script_ok === false);
        return data;
      });
  }

  function pollPcBuildsUntilIdle(triesLeft) {
    var left = triesLeft == null ? 60 : triesLeft;
    return loadPcBuildsStatus()
      .then(function (data) {
        if (data && data.running && left > 0) {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(pollPcBuildsUntilIdle(left - 1));
            }, 3000);
          });
        }
        if (data && data.last_ok === false) {
          setPcBuildsStatus(
            '失败：' + (data.last_error || '未知错误') + (data.last_log_tail ? ' · ' + data.last_log_tail.slice(-200) : ''),
            true
          );
        }
        return data;
      })
      .catch(function (err) {
        setPcBuildsStatus('读取装机状态失败：' + (err && err.message ? err.message : err), true);
      });
  }

  function runPcBuildsJob(path, label) {
    var btnA = document.getElementById('btn-refresh-pcbuilds');
    var btnB = document.getElementById('btn-generate-pcbuilds');
    if (btnA) btnA.disabled = true;
    if (btnB) btnB.disabled = true;
    setPcBuildsStatus('已提交' + label + '…');
    fetch(apiBase() + path, {
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
        if (body && body.started === false) {
          setPcBuildsStatus(body.message || label + '完成');
          return loadPcBuildsStatus();
        }
        return pollPcBuildsUntilIdle(80);
      })
      .catch(function (err) {
        setPcBuildsStatus(label + '失败：' + (err && err.message ? err.message : err), true);
      })
      .finally(function () {
        if (btnA) btnA.disabled = false;
        if (btnB) btnB.disabled = false;
      });
  }

  function boot() {
    var tok = token();
    if (!tok) {
      showGate('请先登录管理员账号');
      return;
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 12000);
    fetch(apiBase() + '/auth/me', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok },
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
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
        var btnNb = document.getElementById('btn-refresh-nbcheck');
        if (btnNb) {
          btnNb.addEventListener('click', function () {
            runNbcheckRefresh('all');
          });
        }
        var btnNews = document.getElementById('btn-refresh-news');
        if (btnNews) {
          btnNews.addEventListener('click', function () {
            runNewsRefresh();
          });
        }
        var btnRegen = document.getElementById('btn-regen-news');
        if (btnRegen) {
          btnRegen.addEventListener('click', function () {
            runNewsRegen();
          });
        }
        var btnPc = document.getElementById('btn-refresh-pcbuilds');
        if (btnPc) {
          btnPc.addEventListener('click', function () {
            runPcBuildsJob('/pcbuilds/refresh', '更新装机');
          });
        }
        var btnPcGen = document.getElementById('btn-generate-pcbuilds');
        if (btnPcGen) {
          btnPcGen.addEventListener('click', function () {
            runPcBuildsJob('/pcbuilds/generate', '检查数据库');
          });
        }
        loadNewsStatus().catch(function (err) {
          setNewsStatus('加载资讯状态失败：' + (err && err.message ? err.message : err), true);
        });
        loadPcBuildsStatus().catch(function (err) {
          setPcBuildsStatus('加载装机状态失败：' + (err && err.message ? err.message : err), true);
        });
        return loadNbcheckStatus().catch(function (err) {
          setStatus('加载 Notebookcheck 状态失败：' + (err && err.message ? err.message : err), true);
        });
      })
      .catch(function (err) {
        var msg = '需要管理员登录后查看';
        if (err && err.name === 'AbortError') msg = '登录校验超时，请刷新或重新登录';
        showGate(msg);
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
