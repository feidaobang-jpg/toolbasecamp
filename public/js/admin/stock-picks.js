/**
 * Admin-only stock pick strategies (monthly recovery + strong momentum overnight).
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
      window.tbAdminShowApp(user);
      return;
    }
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    if (gate) gate.classList.add('hidden');
    if (app) app.classList.remove('hidden');
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
    var gateOff = market && market.gate_applied === false;
    // Prefer explicit market-gate copy when regime is weak (may already be in message).
    var text = msg || marketNote || reason || hint || '暂无推荐结果';
    var weak = !gateOff && (regime === 'weak' || /大盘偏弱|暂不推荐新建仓/.test(text));
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
      if (tab === 'records') loadRecords();
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
    var head = renderBaseHeader(item, idx, '强势弹性', 'metrics-tb');
    card.innerHTML = head.html;
    var metricsEl = card.querySelector('#' + head.metricsId);
    metricsEl.appendChild(createMetric('最新价', fmt(metrics.last_price)));
    metricsEl.appendChild(createMetric('涨跌幅(%)', fmt(metrics.pct_change), pctClass(metrics.pct_change)));
    metricsEl.appendChild(createMetric('量比', fmt(metrics.volume_ratio)));
    metricsEl.appendChild(createMetric('近5日(%)', fmt(metrics.ret_5d), pctClass(metrics.ret_5d)));
    if (metrics.close_vs_high_pct != null) {
      metricsEl.appendChild(createMetric('收盘/日高(%)', fmt(metrics.close_vs_high_pct)));
    }
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

  function renderMonsterCard(item, idx) {
    var card = document.createElement('div');
    card.className = 'stock-card';
    if (item.account_restricted) card.classList.add('stock-card-restricted');
    var metrics = item.metrics || {};
    var head = renderBaseHeader(item, idx, '妖股追高', 'metrics-ms');
    card.innerHTML = head.html;
    var metricsEl = card.querySelector('#' + head.metricsId);
    metricsEl.appendChild(createMetric('最新价', fmt(metrics.last_price)));
    metricsEl.appendChild(createMetric('涨跌幅(%)', fmt(metrics.pct_change), pctClass(metrics.pct_change)));
    metricsEl.appendChild(createMetric('量比', fmt(metrics.volume_ratio)));
    metricsEl.appendChild(createMetric('连涨(天)', fmt(metrics.prior_up_days, 0)));
    if (metrics.limit_touch_days != null) {
      metricsEl.appendChild(createMetric('近触板(天)', fmt(metrics.limit_touch_days, 0)));
    }
    if (metrics.close_vs_high_pct != null) {
      metricsEl.appendChild(createMetric('收盘/日高(%)', fmt(metrics.close_vs_high_pct)));
    }
    if (metrics.ret_5d != null) {
      metricsEl.appendChild(createMetric('近5日(%)', fmt(metrics.ret_5d), pctClass(metrics.ret_5d)));
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

  function statusLabel(status) {
    var map = { pending: '待结算', settled: '已结算', skipped: '已跳过' };
    return map[status] || status || '-';
  }

  function renderRecordsStats(stats, byStrategy) {
    var el = document.getElementById('recordsStats');
    if (!el) return;
    if (!stats) {
      el.innerHTML = '';
      return;
    }
    var parts = [];
    parts.push('<div class="stat-chip">共 <b>' + (stats.total || 0) + '</b> 条</div>');
    parts.push('<div class="stat-chip">已结算 <b>' + (stats.settled || 0) + '</b></div>');
    parts.push('<div class="stat-chip">待结算 <b>' + (stats.pending || 0) + '</b></div>');
    if (stats.win_rate != null) {
      parts.push('<div class="stat-chip">胜率 <b>' + stats.win_rate + '%</b></div>');
    }
    if (stats.avg_return != null) {
      var cls = stats.avg_return >= 0 ? 'up' : 'dn';
      parts.push('<div class="stat-chip">均盈亏(开盘) <b class="' + cls + '">' + fmt(stats.avg_return) + '%</b></div>');
    }
    if (stats.avg_return_high != null) {
      var cls2 = stats.avg_return_high >= 0 ? 'up' : 'dn';
      parts.push('<div class="stat-chip">均盈亏(10点高) <b class="' + cls2 + '">' + fmt(stats.avg_return_high) + '%</b></div>');
    }
    var sub = '';
    if (byStrategy) {
      var keys = Object.keys(byStrategy);
      if (keys.length) {
        sub = keys.map(function (k) {
          var s = byStrategy[k];
          var label = k === 'strong_momentum' ? '强势弹性' : (k === 'monster_stock' ? '妖股追高' : k);
          var wr = s.win_rate != null ? ('胜率' + s.win_rate + '%') : '样本不足';
          var ar = s.avg_return != null ? ('均' + fmt(s.avg_return) + '%') : '';
          return '<span class="stat-sub">' + escapeHtml(label) + '：' + escapeHtml(wr + (ar ? ' / ' + ar : '')) + '</span>';
        }).join('');
      }
    }
    el.innerHTML = '<div class="records-stats-row">' + parts.join('') + '</div>' + (sub ? '<div class="records-stats-sub">' + sub + '</div>' : '');
  }

  function renderRecordsTable(items) {
    var body = document.getElementById('recordsBody');
    if (!body) return;
    body.innerHTML = '';
    if (!items || !items.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="9" class="records-empty">暂无跟单记录。请先在「强势弹性」或「妖股追高」生成推荐。</td>';
      body.appendChild(tr);
      return;
    }
    items.forEach(function (row) {
      var tr = document.createElement('tr');
      var pct = row.pct_return;
      var pctHigh = row.pct_return_high;
      var pctCls = pctClass(pct);
      var pctHighCls = pctClass(pctHigh);
      tr.innerHTML =
        '<td>' + escapeHtml(row.buy_date || '-') + '</td>' +
        '<td>' + escapeHtml(row.strategy_label || row.strategy || '-') + '</td>' +
        '<td>' + escapeHtml((row.name || '') + '（' + (row.symbol || '-') + '）') + '</td>' +
        '<td>' + escapeHtml(fmt(row.buy_price)) + '</td>' +
        '<td>' + escapeHtml(row.sell_date || '-') + '</td>' +
        '<td>' + escapeHtml(fmt(row.sell_price)) + '</td>' +
        '<td class="' + pctCls + '">' + escapeHtml(pct != null ? fmt(pct) + '%' : '-') + '</td>' +
        '<td class="' + pctHighCls + '">' + escapeHtml(pctHigh != null ? fmt(pctHigh) + '%' : '-') + '</td>' +
        '<td>' + escapeHtml(statusLabel(row.status)) + '</td>';
      body.appendChild(tr);
    });
  }

  function loadRecords(opts) {
    opts = opts || {};
    var statusEl = document.getElementById('statusRecords');
    var stratEl = document.getElementById('recordsStrategy');
    var strategy = stratEl ? stratEl.value : '';
    if (statusEl) {
      statusEl.textContent = '加载中...';
      statusEl.classList.add('loading');
    }
    var qs = new URLSearchParams();
    qs.set('limit', '80');
    qs.set('settle', opts.settle === false ? '0' : '1');
    if (strategy) qs.set('strategy', strategy);
    fetch(apiBase() + '/stocks/records?' + qs.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() },
      cache: 'no-store'
    })
      .then(function (resp) {
        return resp.json().then(function (data) { return { resp: resp, data: data }; });
      })
      .then(function (pack) {
        var resp = pack.resp;
        var data = pack.data || {};
        if (resp.status === 401 || resp.status === 403) {
          showGate('需要管理员登录后查看');
          if (statusEl) setStatus(statusEl, '无权限', { error: true });
          return;
        }
        if (!resp.ok) {
          if (statusEl) setStatus(statusEl, data.detail || data.message || ('HTTP ' + resp.status), { error: true });
          return;
        }
        renderRecordsStats(data.stats, data.stats_by_strategy);
        renderRecordsTable(data.items || []);
        if (statusEl) {
          setStatus(statusEl, '已加载 ' + (data.items ? data.items.length : 0) + ' 条' + (data.generated_at ? ' · ' + data.generated_at : ''));
        }
      })
      .catch(function (e) {
        if (statusEl) setStatus(statusEl, '加载失败：' + (e && e.message ? e.message : String(e)), { error: true });
      })
      .finally(function () {
        if (statusEl) statusEl.classList.remove('loading');
      });
  }

  function settleRecords() {
    var btn = document.getElementById('btnRecordsSettle');
    var statusEl = document.getElementById('statusRecords');
    if (btn) btn.disabled = true;
    if (statusEl) {
      statusEl.textContent = '结算中...';
      statusEl.classList.add('loading');
    }
    fetch(apiBase() + '/stocks/records/settle', {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
    })
      .then(function (resp) { return resp.json().then(function (data) { return { resp: resp, data: data }; }); })
      .then(function (pack) {
        if (!pack.resp.ok) throw new Error((pack.data && pack.data.detail) || '结算失败');
        loadRecords({ settle: false });
        if (statusEl) setStatus(statusEl, pack.data.message || '结算完成');
      })
      .catch(function (e) {
        if (statusEl) setStatus(statusEl, e.message || '结算失败', { error: true });
      })
      .finally(function () {
        if (btn) btn.disabled = false;
        if (statusEl) statusEl.classList.remove('loading');
      });
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
        var weakDone = market && market.regime === 'weak' && market.gate_applied !== false;
        setStatus(statusEl, doneMsg, { weak: !!weakDone });
        if (data.records_saved) {
          loadRecords({ settle: false });
        }

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
    var btnMonsterStock = document.getElementById('btnMonsterStock');
    if (btnMonsterStock) {
      btnMonsterStock.addEventListener('click', function () {
        fetchRecommend({
          url: '/stocks/recommend-monster-stock',
          btnEl: btnMonsterStock,
          statusEl: document.getElementById('statusMonsterStock'),
          pickListEl: document.getElementById('pickedListMonsterStock'),
          resultsEl: document.getElementById('resultsMonsterStock'),
          renderFn: renderMonsterCard
        });
      });
    }
    var btnRecordsRefresh = document.getElementById('btnRecordsRefresh');
    if (btnRecordsRefresh) btnRecordsRefresh.addEventListener('click', function () { loadRecords(); });
    var btnRecordsSettle = document.getElementById('btnRecordsSettle');
    if (btnRecordsSettle) btnRecordsSettle.addEventListener('click', settleRecords);
    var recordsStrategy = document.getElementById('recordsStrategy');
    if (recordsStrategy) recordsStrategy.addEventListener('change', function () { loadRecords(); });
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
