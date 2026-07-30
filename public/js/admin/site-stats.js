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
  var labelMaps = null;

  var PAGE_LABELS = {
    'page.home': { zh: '首页', en: 'Home' },
    'page.life': { zh: '内容中心', en: 'Content hub' },
    'page.games': { zh: '游戏中心', en: 'Games hub' },
    'page.guestbook': { zh: '留言板', en: 'Guestbook' },
    'page.cool-sites': { zh: '导航', en: 'Directory' },
    'page.about': { zh: '关于', en: 'About' }
  };

  var MODULE_LABELS = {
    page: { zh: '站点页面', en: 'Site pages' },
    portal: { zh: '子站门户', en: 'Portals' },
    action: { zh: '关键操作', en: 'Key actions' },
    'tool.calc': { zh: '计算', en: 'Calc' },
    'tool.convert': { zh: '转换', en: 'Convert' },
    'tool.life': { zh: '生活计划', en: 'Life plans' },
    'tool.record': { zh: '记录', en: 'Records' },
    'tool.media': { zh: '媒体', en: 'Media' },
    'tool.docs': { zh: '文档', en: 'Docs' },
    'tool.dev': { zh: '开发', en: 'Dev' },
    'tool.diagram': { zh: '图表', en: 'Diagram' },
    'tool.game': { zh: '游戏', en: 'Games' },
    'tool.auth': { zh: '账户', en: 'Auth' },
    'tool.ladder': { zh: '硬件跑分', en: 'Benchmarks' },
    'tool.admin': { zh: '后台', en: 'Admin' }
  };

  var PORTAL_LABELS = {
    'portal.news': { zh: '科技资讯 · 列表', en: 'News · List' },
    'portal.news.article': { zh: '科技资讯 · 文章', en: 'News · Article' },
    'portal.news.list': { zh: '科技资讯 · 分页', en: 'News · Page' },
    'portal.pdf': { zh: 'PDF 工具站', en: 'PDF portal' },
    'portal.dev': { zh: '开发工具站', en: 'Dev portal' },
    'portal.chef': { zh: 'CyberChef', en: 'CyberChef' },
    'portal.hoppscotch': { zh: 'API 调试站', en: 'Hoppscotch' },
    'portal.translate': { zh: '翻译站', en: 'Translate' }
  };

  var ACTION_LABELS = {
    'action.record.card-score.new': { zh: '单机计分 · 新开一局', en: 'Card score · New game' },
    'action.record.card-score.continue': { zh: '单机计分 · 继续', en: 'Card score · Continue' },
    'action.record.online-card-score.create': { zh: '联机计分 · 创建房间', en: 'Online score · Create' },
    'action.record.online-card-score.join': { zh: '联机计分 · 加入房间', en: 'Online score · Join' }
  };

  function apiBase() {
    if (window.siteConfig && window.siteConfig.apiBase) return window.siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function langIsZh() {
    try {
      if (typeof window.tbGetLocale === 'function') return window.tbGetLocale() === 'zh-CN';
    } catch (e) { /* ignore */ }
    return (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0;
  }

  function trKey(key) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return '';
  }

  function buildLabelMaps() {
    var toolByFile = {};
    var groupByFolder = {};
    function addTools(groups) {
      if (!Array.isArray(groups)) return;
      groups.forEach(function (group) {
        var folder = '';
        (group.items || []).forEach(function (item) {
          var url = (item.url || '').split('?')[0];
          var parts = url.replace(/^\/+/, '').split('/');
          if (parts.length < 3) return;
          folder = parts[1];
          var file = (parts[2] || '').replace(/\.html$/i, '');
          if (!file) return;
          toolByFile[folder + '/' + file] = item.titleKey || '';
          if (group.titleKey && !groupByFolder[folder]) {
            groupByFolder[folder] = group.titleKey;
          }
        });
      });
    }
    if (window.toolsConfig) addTools(toolsConfig.groups);
    if (window.gamesConfig) addTools(gamesConfig.groups);
    return { toolByFile: toolByFile, groupByFolder: groupByFolder };
  }

  function maps() {
    if (!labelMaps) labelMaps = buildLabelMaps();
    return labelMaps;
  }

  function pickLocale(obj) {
    if (!obj) return '';
    return langIsZh() ? (obj.zh || obj.en || '') : (obj.en || obj.zh || '');
  }

  function labelForEvent(name) {
    if (PAGE_LABELS[name]) return pickLocale(PAGE_LABELS[name]);
    if (PORTAL_LABELS[name]) return pickLocale(PORTAL_LABELS[name]);
    if (ACTION_LABELS[name]) return pickLocale(ACTION_LABELS[name]);
    if (MODULE_LABELS[name]) return pickLocale(MODULE_LABELS[name]);

    if ((name || '').indexOf('portal.') === 0) {
      var portalKey = 'portal.' + (name.split('.')[1] || '');
      if (PORTAL_LABELS[name]) return pickLocale(PORTAL_LABELS[name]);
      if (PORTAL_LABELS[portalKey]) return pickLocale(PORTAL_LABELS[portalKey]);
      return langIsZh() ? '子站 · ' + (name.split('.').slice(1).join(' · ') || name) : name;
    }

    var m = /^tool\.([a-z0-9_-]+)\.([a-z0-9_-]+)$/i.exec(name || '');
    if (m) {
      var key = m[1] + '/' + m[2];
      var titleKey = maps().toolByFile[key];
      var title = titleKey ? trKey(titleKey) : '';
      if (title) return title;
      return m[2].replace(/-/g, ' ');
    }

    if ((name || '').indexOf('tool.') === 0) {
      var folder = name.split('.')[1] || '';
      var gKey = maps().groupByFolder[folder];
      var gTitle = gKey ? trKey(gKey) : '';
      if (gTitle) return gTitle;
      var mod = MODULE_LABELS['tool.' + folder];
      if (mod) return pickLocale(mod);
    }

    return name || '';
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

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  function nameCellHtml(name) {
    var label = labelForEvent(name);
    var showKey = label && label !== name;
    return (
      '<div class="event-name">' +
        '<div class="event-label">' + escapeHtml(label || name) + '</div>' +
        (showKey ? '<div class="event-key">' + escapeHtml(name) + '</div>' : '') +
      '</div>'
    );
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
        nameCellHtml(item.name) +
        '<div class="text-sm font-semibold tabular-nums">' + fmt(item.count) + '</div>' +
        '<div class="stats-bar"><span style="width:' + pct + '%"></span></div>';
      container.appendChild(row);
    });
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
        '<td>' + nameCellHtml(item.name) + '</td>' +
        '<td class="font-semibold tabular-nums">' + fmt(item.count) + '</td>' +
        '<td style="width:40%"><div class="stats-bar"><span style="width:' + pct + '%"></span></div></td>';
      body.appendChild(tr);
    });
  }

  function renderGeo(geo, sitePv, geoRev) {
    var pvBars = document.getElementById('geo-pv-bars');
    var uvBars = document.getElementById('geo-uv-bars');
    var pvSum = document.getElementById('geo-pv-summary');
    var uvSum = document.getElementById('geo-uv-summary');
    var emptyNote = document.getElementById('geo-empty-note');
    if (!pvBars || !uvBars) return;

    var labels = {
      cn: '国内',
      overseas: '海外',
      unknown: '未知'
    };
    var order = ['cn', 'overseas', 'unknown'];
    geo = geo || {};
    var pv = geo.pv || {};
    var uv = geo.uv || {};
    var pvShare = geo.pv_share || {};
    var uvShare = geo.uv_share || {};
    var pvTotal = geo.pv_total || 0;

    function fill(container, counts, shares) {
      container.innerHTML = '';
      order.forEach(function (key) {
        var count = counts[key] || 0;
        var share = shares[key] || 0;
        var pct = Math.round(share * 1000) / 10;
        var barPct = Math.max(count > 0 ? 2 : 0, Math.round(share * 100));
        var row = document.createElement('div');
        row.className = 'geo-row';
        row.innerHTML =
          '<div class="geo-row-head">' +
            '<span>' + labels[key] + '</span>' +
            '<span class="tabular-nums">' + fmt(count) + ' · ' + pct + '%</span>' +
          '</div>' +
          '<div class="stats-bar geo-bar geo-bar-' + key + '"><span style="width:' + barPct + '%"></span></div>';
        container.appendChild(row);
      });
    }

    fill(pvBars, pv, pvShare);
    fill(uvBars, uv, uvShare);
    if (pvSum) {
      pvSum.textContent = '区间浏览合计 ' + fmt(pvTotal);
    }
    if (uvSum) {
      uvSum.textContent = '区间访客合计 ' + fmt(geo.uv_total || 0) + '（按首次访客地区）';
    }
    if (emptyNote) {
      if (pvTotal <= 0 && (sitePv || 0) > 0) {
        emptyNote.classList.remove('hidden');
        if (geoRev == null) {
          emptyNote.textContent =
            '当前 API 未返回地区字段（可能进程仍是旧版 site_stats）。请重新部署/重启 toolbasecamp-api；历史累计浏览也无法按 IP 回填。';
        } else {
          emptyNote.textContent =
            '当前区间尚无地区数据：上线地区统计之前的累计浏览无法按 IP 回填，之后的新站点浏览命中会出现在这里。';
        }
      } else {
        emptyNote.classList.add('hidden');
        emptyNote.textContent = '';
      }
    }
  }

  function loadOverview() {
    showError('');
    labelMaps = null;
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
      var tip = (data.from || '') + ' → ' + (data.to || '') + ' · 共 ' + (data.days || days) + ' 天';
      var ips = data.exclude_ips_configured || [];
      if (ips.length) tip += ' · 已排除 IP ' + ips.length + ' 个';
      tip += ' · 管理员访问不计入';
      document.getElementById('range-label').textContent = tip;
      renderGeo(data.geo, data.site_pv, data.geo_rev);
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
    try {
      localStorage.setItem('tb-stats-exclude', '1');
    } catch (e) { /* ignore */ }
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
  document.addEventListener('tb:locale', function () {
    if (!app.classList.contains('hidden')) loadOverview();
  });
  boot();
})();
