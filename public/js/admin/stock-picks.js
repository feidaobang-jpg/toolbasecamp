/**
 * Admin-only stock pick strategies (monthly recovery + tail buy).
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
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var gateMsg = document.getElementById('gate-msg');
    var loginLink = document.getElementById('login-link');
    var gateLogin = document.getElementById('gate-login');
    var next = encodeURIComponent('/html/admin/private/stock-picks.html');
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

  function fmt(v, digits) {
    digits = digits == null ? 2 : digits;
    if (v === null || v === undefined || v === '') return '-';
    var n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toFixed(digits);
  }

  function setStatus(el, text, opts) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-weak', !!(opts && opts.weak));
    el.classList.toggle('is-error', !!(opts && opts.error));
  }

  function detailText(data) {
    if (!data) return '';
    var d = data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length) {
      return d.map(function (x) {
        if (typeof x === 'string') return x;
        if (x && x.msg) return String(x.msg);
        return '';
      }).filter(Boolean).join('；');
    }
    return '';
  }

  function pickEmptyStatus(data) {
    var market = (data && (data.market_regime || data.market)) || null;
    var marketNote = (market && market.message) ? String(market.message).trim() : '';
    var msg = (data && data.message) ? String(data.message).trim() : '';
    var reason = (data && data.reason) ? String(data.reason).trim() : '';
    var hint = (data && data.hint) ? String(data.hint).trim() : '';
    var regime = market && market.regime ? String(market.regime) : '';
    // Prefer explicit market-gate copy when regime is weak (may already be in message).
    var text = msg || marketNote || reason || hint || '暂无推荐结果';
    var weak = regime === 'weak' || /大盘偏弱|暂不推荐新建仓/.test(text);
    return { text: text, weak: weak };
  }

  function pctClass(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return '';
    if (n > 0) return 'up';
    if (n < 0) return 'dn';
    return '';
  }

  function createMetric(k, v, cls) {
    var div = document.createElement('div');
    div.className = 'metric';
    div.innerHTML = '<div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div>';
    return div;
  }

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      if (!tab) return;
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
    });
  });

  var onlyBasicEl = document.getElementById('onlyBasic');
  var ONLY_BASIC_KEY = 'tb_stocks_only_basic_v1';
  function getOnlyBasic() {
    if (!onlyBasicEl) return true;
    return !!onlyBasicEl.checked;
  }
  if (onlyBasicEl) {
    var saved = localStorage.getItem(ONLY_BASIC_KEY);
    if (saved === '0') onlyBasicEl.checked = false;
    onlyBasicEl.addEventListener('change', function () {
      localStorage.setItem(ONLY_BASIC_KEY, onlyBasicEl.checked ? '1' : '0');
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderBaseHeader(item, idx, badgeText, metricsPrefix) {
    var market = item.market || '';
    var exchange = item.exchange || '';
    var marketCls = exchange === 'SH' ? 'badge-sh' : (exchange === 'SZ' ? 'badge-sz' : 'badge-other');
    var marketBadge = market
      ? '<span class="stock-badge ' + marketCls + '">' + escapeHtml(market) + '</span>'
      : '';
    var limitBadge = item.account_restricted
      ? '<span class="stock-badge badge-warn" title="' + escapeHtml(item.account_limit || '') + '">账号受限</span>'
      : '';
    var limitNote = item.account_limit
      ? '<div class="limit-note">' + escapeHtml(item.account_limit) + '</div>'
      : '';
    var metricsId = metricsPrefix + '-' + idx;
    return {
      html:
        '<div class="stock-header">' +
          '<div>' +
            '<div class="stock-title">' + (idx + 1) + '. ' + escapeHtml(item.name || '') +
              '（' + escapeHtml(item.symbol || '-') + '）</div>' +
            '<div class="stock-sub">生成时间：' + escapeHtml(item.generated_at || '') +
              (item.match_score != null ? ' · 匹配度 ' + escapeHtml(item.match_score) : '') + '</div>' +
          '</div>' +
          '<div class="badge-row">' + marketBadge + limitBadge +
            '<div class="stock-badge">' + escapeHtml(badgeText) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="metrics" id="' + metricsId + '"></div>' +
        limitNote,
      metricsId: metricsId
    };
  }

  function renderMonthlyCard(item, idx) {
    var card = document.createElement('div');
    card.className = 'stock-card';
    if (item.account_restricted) card.classList.add('stock-card-restricted');
    var metrics = item.metrics || {};
    var head = renderBaseHeader(item, idx, '月K启动', 'metrics-mr');
    card.innerHTML = head.html;
    var metricsEl = card.querySelector('#' + head.metricsId);
    metricsEl.appendChild(createMetric('最新价', fmt(metrics.last_price)));
    metricsEl.appendChild(createMetric('涨跌幅(%)', fmt(metrics.pct_change), pctClass(metrics.pct_change)));
    metricsEl.appendChild(createMetric('换手率(%)', fmt(metrics.turnover_rate)));
    metricsEl.appendChild(createMetric('近5日(%)', fmt(metrics.ret_5d), pctClass(metrics.ret_5d)));
    if (metrics.drawdown_18m != null) {
      metricsEl.appendChild(createMetric('距高点回撤(%)', fmt(metrics.drawdown_18m)));
    }
    if (metrics.ret_1m != null) {
      metricsEl.appendChild(createMetric('近1月(%)', fmt(metrics.ret_1m), pctClass(metrics.ret_1m)));
    }
    if (metrics.ret_3m != null) {
      metricsEl.appendChild(createMetric('近3月(%)', fmt(metrics.ret_3m), pctClass(metrics.ret_3m)));
    }
    if (item.hold_days_suggest) {
      var tip = document.createElement('div');
      tip.className = 'limit-note';
      tip.textContent = item.hold_days_suggest;
      card.appendChild(tip);
    }
    return card;
  }

  function renderTailCard(item, idx) {
    var card = document.createElement('div');
    card.className = 'stock-card';
    if (item.account_restricted) card.classList.add('stock-card-restricted');
    var metrics = item.metrics || {};
    var head = renderBaseHeader(item, idx, '尾盘低吸', 'metrics-tb');
    card.innerHTML = head.html;
    var metricsEl = card.querySelector('#' + head.metricsId);
    metricsEl.appendChild(createMetric('最新价', fmt(metrics.last_price)));
    metricsEl.appendChild(createMetric('涨跌幅(%)', fmt(metrics.pct_change), pctClass(metrics.pct_change)));
    metricsEl.appendChild(createMetric('量比', fmt(metrics.volume_ratio)));
    metricsEl.appendChild(createMetric('近5日(%)', fmt(metrics.ret_5d), pctClass(metrics.ret_5d)));
    if (metrics.near_high_60d_pct != null) {
      metricsEl.appendChild(createMetric('距60日高(%)', fmt(metrics.near_high_60d_pct)));
    }
    var tips = [];
    if (item.buy_time_suggest) tips.push('买：' + item.buy_time_suggest);
    if (item.sell_time_suggest) tips.push('卖：' + item.sell_time_suggest);
    if (tips.length) {
      var tip = document.createElement('div');
      tip.className = 'limit-note';
      tip.textContent = tips.join(' · ');
      card.appendChild(tip);
    }
    return card;
  }

  function fetchRecommend(opts) {
    var btnEl = opts.btnEl;
    var statusEl = opts.statusEl;
    var resultsEl = opts.resultsEl;
    var pickListEl = opts.pickListEl;
    var renderFn = opts.renderFn;
    var url = opts.url;
    if (!btnEl || !resultsEl) return;
    var btnLabel = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '生成中...';
    if (statusEl) {
      statusEl.textContent = '生成中，请稍候（约 30~90 秒，无结果时将自动重试）...';
      statusEl.classList.add('loading');
    }
    var qs = new URLSearchParams();
    qs.set('only_basic', getOnlyBasic() ? '1' : '0');
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    fetch(apiBase() + url + sep + qs.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token()
      },
      cache: 'no-store'
    })
      .then(function (resp) {
        return resp.json().then(function (data) {
          return { resp: resp, data: data };
        }).catch(function () {
          return resp.text().then(function (raw) {
            return { resp: resp, data: null, raw: raw };
          });
        });
      })
      .then(function (pack) {
        var resp = pack.resp;
        var data = pack.data;
        resultsEl.innerHTML = '';
        if (resp.status === 401 || resp.status === 403) {
          showGate('需要管理员登录后查看');
          setStatus(statusEl, '无权限', { error: true });
          return;
        }
        if (!data) {
          var timeoutHint = (resp.status === 504 || resp.status === 502 || resp.status === 524)
            ? '（网关超时：计算超过约 2 分钟被中断；已优化重试，请再试一次）'
            : '';
          setStatus(statusEl, '接口返回失败：HTTP ' + resp.status + timeoutHint, { error: true });
          return;
        }
        // Non-OK must be handled before empty-items fallback (404 `{detail}` used to look like「暂无推荐结果」).
        if (!resp.ok) {
          var errMsg = data.message || detailText(data) || ('接口返回失败 HTTP ' + resp.status);
          setStatus(statusEl, errMsg, { error: true });
          return;
        }
        var items = data.items || [];
        var market = data.market_regime || null;
        var marketNote = (market && market.message) ? String(market.message).trim() : '';
        if (!items.length) {
          if (pickListEl) pickListEl.innerHTML = '';
          var empty = pickEmptyStatus(data);
          setStatus(statusEl, empty.text, { weak: empty.weak });
          return;
        }
        var baseMsg = '生成完成，共 ' + items.length + ' 只';
        var doneMsg = data.message || (marketNote ? baseMsg + ' · ' + marketNote : baseMsg);
        var weakDone = market && market.regime === 'weak';
        setStatus(statusEl, doneMsg, { weak: !!weakDone });

        if (pickListEl) {
          var chips = items.map(function (it) {
            var name = it && it.name ? escapeHtml(it.name) : '';
            var sym = it && it.symbol ? escapeHtml(it.symbol) : '';
            if (!name && !sym) return '';
            return '<span class="picked-chip">' + name + '（' + sym + '）</span>';
          }).filter(Boolean).join('');
          pickListEl.innerHTML =
            '<div class="picked-title">已选股票（' + items.length + '）</div>' +
            '<div class="picked-chips">' + chips + '</div>';
        }

        items.forEach(function (it, idx) {
          var merged = Object.assign({}, it, { generated_at: data.generated_at });
          resultsEl.appendChild(renderFn(merged, idx));
        });
      })
      .catch(function (e) {
        setStatus(statusEl, '请求失败：' + (e && e.message ? e.message : String(e)), { error: true });
      })
      .finally(function () {
        btnEl.disabled = false;
        btnEl.textContent = btnLabel;
        if (statusEl) statusEl.classList.remove('loading');
      });
  }

  function bindButtons() {
    var btnMonthlyRecovery = document.getElementById('btnMonthlyRecovery');
    if (btnMonthlyRecovery) {
      btnMonthlyRecovery.addEventListener('click', function () {
        fetchRecommend({
          url: '/stocks/recommend-monthly-recovery',
          btnEl: btnMonthlyRecovery,
          statusEl: document.getElementById('statusMonthlyRecovery'),
          pickListEl: document.getElementById('pickedListMonthlyRecovery'),
          resultsEl: document.getElementById('resultsMonthlyRecovery'),
          renderFn: renderMonthlyCard
        });
      });
    }
    var btnTailBuy = document.getElementById('btnTailBuy');
    if (btnTailBuy) {
      btnTailBuy.addEventListener('click', function () {
        fetchRecommend({
          url: '/stocks/recommend-tail-buy',
          btnEl: btnTailBuy,
          statusEl: document.getElementById('statusTailBuy'),
          pickListEl: document.getElementById('pickedListTailBuy'),
          resultsEl: document.getElementById('resultsTailBuy'),
          renderFn: renderTailCard
        });
      });
    }
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
        bindButtons();
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
