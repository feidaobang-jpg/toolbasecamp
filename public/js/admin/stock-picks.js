/* Versioned strategies side by side; GET previews never create simulated fills. */
(function () {
  'use strict';
  var page = 1, pageSize = 20, recordsRequest = 0, signedIn = false, lastSessionMessage = '', version = '', priceDigits = 2;
  function el(id) { return document.getElementById(id); }
  function tr(key) { return window.t('privateHub.stock.' + key); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmt(n, digits) { return n == null ? '—' : Number(n).toFixed(digits == null ? 2 : digits); }
  // Fund fills carry four decimals; drop a trailing zero so 0.9570 reads as the quoted 0.957.
  function price(n) { return n == null ? '—' : priceDigits > 2 ? Number(n).toFixed(priceDigits).replace(/0$/, '') : fmt(n); }
  function apiBase() { return (window.siteConfig && siteConfig.apiBase) || window.location.origin + '/api'; }
  function notify(id, message, error) { el(id).textContent = message; el(id).classList.toggle('is-error', !!error); }
  function remembered() { try { return localStorage.getItem('stock_strategy') || ''; } catch (e) { return ''; } }
  function remember(value) { try { localStorage.setItem('stock_strategy', value); } catch (e) { /* private mode */ } }
  function withVersion(path) { return path + (path.indexOf('?') < 0 ? '?' : '&') + 'version=' + encodeURIComponent(version); }
  async function api(path, method) {
    var res = await fetch(apiBase() + path, {method: method || 'GET', cache:'no-store',
      headers:{Accept:'application/json', Authorization:'Bearer ' + (localStorage.getItem('auth_token') || '')}});
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) { signedIn = false; window.tbAdminShowGate('请登录管理员账号'); }
      throw new Error(typeof data.detail === 'string' ? data.detail : '请求失败，请稍后重试');
    }
    return data;
  }
  function chip(label, value) { return '<span class="stat-chip">' + esc(label) + ' <b>' + esc(value) + '</b></span>'; }
  function renderTabs(list) {
    var nav = el('strategyTabs'); nav.innerHTML = '';
    (list || []).forEach(function(s) {
      var active = s.version === version, button = document.createElement('button');
      button.type = 'button'; button.className = 'tab-btn' + (active ? ' active' : '');
      button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.textContent = s.name;
      button.addEventListener('click', function() {
        if (s.version === version) return;
        version = s.version; page = 1; remember(version);
        el('screenResults').innerHTML = ''; notify('actionStatus', tr('loading'));
        loadStatus().then(loadRecords).then(function() { notify('actionStatus', ''); })
          .catch(function(err) { notify('actionStatus', err.message, true); });
      });
      nav.appendChild(button);
    });
  }
  function renderStats(s) {
    var eq = s.equity;
    var parts = [chip('已平仓', s.settled || 0), chip('持仓中', s.open_count || 0),
      chip('待复核', s.review_count || 0), chip('扣费胜率', s.win_rate == null ? '样本不足' : fmt(s.win_rate,1) + '%'),
      chip('平均净收益', fmt(s.avg_return) + (s.avg_return == null ? '' : '%')),
      chip('平均盈亏比', fmt(s.payoff_ratio)), chip('已实现净利润', fmt(s.net_pnl) + (s.net_pnl == null ? '' : '元')),
      chip('模拟权益', eq ? fmt(eq.equity) + '元' : '尚未观察'),
      chip('观察点最大回撤', s.max_drawdown == null ? '—' : fmt(s.max_drawdown) + '%')];
    var note = '以上是本策略上线后的模拟成交统计，仅统计当前规则版本；胜率以已平仓扣费盈利计算。';
    if ((s.settled || 0) < 30) note += ' 已平仓样本不足30笔，暂不能判断稳定性。';
    if (eq) note += ' 权益观察时间：' + eq.observed_at + '。';
    if (eq && eq.stale_positions) note += ' 有' + eq.stale_positions + '个持仓估值过期。';
    el('recordsStats').innerHTML = '<div class="records-stats-row">' + parts.join('') + '</div><p class="stock-explanation">' + esc(note) + '</p>';
  }
  function renderBacktest(b) {
    var box = el('backtestBox');
    box.classList.toggle('hidden', !b);
    if (!b) { box.innerHTML = ''; return; }
    var parts = [chip('回测区间', b.period), chip('笔数', b.trades), chip('扣费胜率', fmt(b.win_rate,1) + '%'),
      chip('单笔平均净收益', fmt(b.avg_net_return) + '%'), chip('总盈利 / 总亏损', fmt(b.profit_factor)),
      chip('平均盈利 / 亏损', '+' + fmt(b.avg_win) + '% / ' + fmt(b.avg_loss) + '%'),
      chip('最大单笔亏损', fmt(b.worst_trade,1) + '%'), chip('最多连亏', b.max_losing_streak + '笔'),
      chip('平均持有', fmt(b.avg_hold_days,1) + '个交易日'), chip('3万元账户年化', fmt(b.account_annualized,1) + '%')];
    box.innerHTML = '<summary>' + esc(tr('backtest')) + '</summary><div class="records-stats-row">' + parts.join('') +
      '</div><p>分段表现：前半段胜率' + fmt(b.first_half_win_rate,0) + '%，后半段' + fmt(b.second_half_win_rate,0) + '%；' + esc(b.weak_years) +
      '。压力测试：' + esc(b.stress) + '。</p><p>' + esc(b.note) + '</p>';
  }
  function renderRules(r) {
    var cost = '模拟单边滑点' + fmt(r.slippage_rate * 100,2) + '%；佣金万' + fmt(r.commission_rate * 10000,1) + '、最低' + r.minimum_commission + '元；' +
      (r.stamp_tax_rate ? '卖出印花税' + fmt(r.stamp_tax_rate * 100,2) + '%、双边过户费' + fmt(r.transfer_fee_rate * 100,3) + '%。' : 'ETF不收印花税和过户费。') +
      '按实际买卖盘参考价模拟，无法保证实际成交。';
    var capital = '模型本金' + fmt(r.capital,0) + '元，每仓预算' + fmt(r.position_budget,0) + '元，最多' + r.max_positions + '仓。';
    var tail = '预览、未成交、旧策略不纳入胜率。5分钟观察可能遗漏盘中波动。交易日历已核验至' + esc(r.calendar_verified_through) + '；新年份未核验时暂停。';
    if (r.summary) {
      el('rulesText').innerHTML = r.summary.map(function(p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        '<p>' + capital + '买入当天不卖；退出受阻则继续持有。' + cost + '</p><p>拆分、分红导致价格基础变化时收益待复核。' + tail + '</p>';
      return;
    }
    el('rulesText').innerHTML = '<p>主板普通股；20/60日趋势向上，回调2～5日且缩量，重新转强；市场和行业偏弱时空仓，最多扫描100只、推荐3只。</p>' +
      '<p>' + capital + '正常持有3～10个交易日；止损' + r.stop_loss_pct + '%、止盈' + r.take_profit_pct +
      '%，盈利达到' + r.trailing_start_pct + '%后观察到的峰值回撤' + r.trailing_drawdown_pct + '%退出。T+1，退出受阻则继续持有。</p>' +
      '<p>' + cost + '</p><p>除权除息收益待复核。' + tail + '</p>';
  }
  function note(target, text) {
    var p = document.createElement('p'); p.className = 'stock-explanation'; p.textContent = text; target.appendChild(p);
  }
  function renderScreen(screen, label) {
    var target = el('screenResults'); target.innerHTML = '';
    if (!screen) return;
    note(target, label + ' · ' + (screen.generated_at || '') + ' · ' + (screen.message || '') +
      (screen.market ? ' · 全市场上涨占比' + screen.market.up_ratio + '%' : ''));
    if (screen.watch && screen.watch.length && !(screen.items || []).length) {
      note(target, '离信号最近的ETF（2日RSI低于5才买）：' + screen.watch.map(function(w) {
        return w.name + ' ' + fmt(w.rsi,1) + '（今日' + fmt(w.pct_change) + '%）'; }).join('；'));
    }
    if (screen.premium_blocked && screen.premium_blocked.length) {
      note(target, '已急跌但溢价过高、不买：' + screen.premium_blocked.map(function(b) {
        return b.name + ' 溢价' + fmt(b.premium_pct) + '%'; }).join('；'));
    }
    (screen.items || []).forEach(function(item) {
      var card = document.createElement('article'); card.className = 'stock-card';
      var m = item.metrics || {};
      var metrics = item.display ? item.display.map(function(pair) { return metric(pair[0], pair[1]); }).join('') :
        metric('最新价', fmt(m.last_price)) + metric('当日涨幅', fmt(m.pct_change) + '%') +
        metric('回调', m.pullback_days + '日 / ' + fmt(m.pullback_pct) + '%') +
        metric('回调量 / 基准量', fmt(m.pullback_volume_ratio));
      card.innerHTML = '<div class="stock-header"><div><div class="stock-title">' + esc(item.name) + '（' + esc(item.symbol) +
        '）</div><div class="stock-sub">' + esc(item.sector) + '</div></div><span class="stock-badge">' +
        esc(item.badge || '匹配分 ' + item.match_score + '，非胜率') + '</span></div><div class="metrics">' + metrics +
        '</div><p class="text-block">' + esc(item.reason) + '</p>';
      target.appendChild(card);
    });
  }
  function metric(label, value) { return '<div class="metric"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></div>'; }
  async function loadStatus() {
    var data = await api(withVersion('/stocks/status')), r = data.rules, last = data.last_run, result = last && last.result;
    version = r.version; priceDigits = r.price_digits || 2;
    renderTabs(data.strategies);
    el('strategyName').textContent = r.name;
    el('strategySubtitle').textContent = r.subtitle || tr('subtitle');
    el('strategyBadge').textContent = r.badge || '中短线 · 模拟跟踪';
    el('strategyValidation').textContent = r.validation + '。';
    renderStats(data.stats);
    renderBacktest(r.backtest);
    var text = '北京时间 · ' + r.version + ' · 交易日14:50确认信号、14:55模拟买入，盘中每5分钟检查，15:10保存估值。';
    text += last ? ' 最近执行：' + last.finished_at + '（' + (last.status === 'ok' ? '完成' : '待核验') + '）。' : ' 尚无自动运行记录。';
    if (data.last_success_at) text += ' 最近成功：' + data.last_success_at + '。';
    if (!data.calendar_ok) text += ' 交易日历未核验，已暂停执行。';
    if (result && result.errors && result.errors.length) text += ' ' + result.errors.join('；');
    el('schedulerStatus').textContent = text;
    el('schedulerStatus').classList.toggle('is-error', !data.calendar_ok || !!(result && result.errors && result.errors.length));
    lastSessionMessage = data.session_message || '';
    notify('marketSessionStatus', lastSessionMessage, !data.calendar_ok);
    renderRules(r);
    // A watch run need not contain a screen; load the latest signal separately below.
    renderScreen(data.latest_screen || (result && result.screen), '最近自动筛选');
  }
  async function loadRecords() {
    var seq = ++recordsRequest, state = el('recordsState').value, archive = state === 'archive';
    notify('recordsStatus', tr('loading'));
    try {
      var paging = '?limit=' + pageSize + '&offset=' + ((page-1)*pageSize);
      var data = await api(archive ? '/stocks/legacy-records' + paging :
        withVersion('/stocks/records' + paging + (state ? '&state=' + encodeURIComponent(state) : '')));
      if (seq !== recordsRequest) return;
      el('recordsBody').innerHTML = '';
      (data.items || []).forEach(function(r) {
        var row = document.createElement('tr'), ret = archive ? r.pct_return : (r.net_return == null ? r.unrealized_return : r.net_return);
        var name = archive ? ({strong_momentum:'旧强势弹性',monster_stock:'旧妖股追高'}[r.strategy] || '旧策略') : r.sector;
        var stateLabel = archive ? r.status : tr(r.status);
        if (!archive && r.status === 'review') ret = null;
        var netLabel = fmt(ret) + (ret == null ? '' : '%') + (archive ? '（旧毛收益）' : r.status === 'open' ? '（浮动）' : '');
        row.innerHTML = '<td>' + esc(archive ? r.buy_date : r.signal_at) + '</td><td>' + esc(r.name) +
          '（' + esc(r.symbol) + '）<small>' + esc(name) + '</small></td><td>' + esc(archive ? fmt(r.buy_price) : price(r.entry_price)) +
          '<small>' + esc(archive ? '' : (r.entry_at || '') + (r.quantity ? ' / ' + r.quantity + '股' : '')) +
          '</small></td><td>' + esc(archive ? fmt(r.sell_price) : price(r.exit_price || r.last_price)) +
          '<small>' + esc(archive ? r.sell_date : r.exit_at || r.last_at || '') + '</small></td><td>' + esc(netLabel) +
          '</td><td>' + esc(stateLabel) + '<small>' + esc(r.exit_reason || r.note || '') + '</small></td>';
        el('recordsBody').appendChild(row);
      });
      if (!data.items.length) el('recordsBody').innerHTML = '<tr><td colspan="6" class="records-empty">' + esc(tr('empty')) + '</td></tr>';
      notify('recordsStatus', archive ? tr('archiveHint') : '共' + data.total + '条');
      window.tbRenderPager(el('recordsPager'), {page:page,pageSize:pageSize,total:data.total,
        onChange:function(next) { page = next; loadRecords(); }});
    } catch(err) { if (seq === recordsRequest) notify('recordsStatus', err.message, true); }
  }
  async function action(button, fn) {
    button.disabled = true; notify('actionStatus', tr('loading'));
    try { await fn(); } catch(err) { notify('actionStatus', err.message, true); }
    finally { button.disabled = false; }
  }
  function bind() {
    el('btnRefresh').addEventListener('click',function() { action(this,async function() { await loadStatus(); await loadRecords(); notify('actionStatus','已刷新'); }); });
    el('btnPreview').addEventListener('click',function() { action(this,async function() { var data=await api(withVersion('/stocks/preview'));
      if (data.preview && data.message && data.message===lastSessionMessage) { notify('actionStatus','休市期间未执行新筛选；安排见上方休市提示'); return; }
      renderScreen(data,'仅预览，不记成交'); notify('actionStatus',data.message); }); });
    el('btnCheck').addEventListener('click',function() { action(this,async function() { var data=await api('/stocks/run','POST'); await loadStatus(); await loadRecords(); notify('actionStatus',data.message + (data.errors && data.errors.length ? '：' + data.errors.join('；') : ''),!data.success); }); });
    el('btnExport').addEventListener('click',function() { action(this,async function() {
      var data=await api('/stocks/review-export?days=90'), blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
      var url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download='股票复盘-' + data.generated_at.slice(0,10) + '.json';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(function(){URL.revokeObjectURL(url);},1000);
      notify('actionStatus','已导出全部策略的网站记录，可供AI复盘');
    }); });
    el('recordsState').addEventListener('change',function() { page=1; loadRecords(); });
  }
  async function boot() {
    if (!localStorage.getItem('auth_token')) { window.tbAdminShowGate('请先登录管理员账号'); return; }
    try {
      var data=await api('/auth/me'), user=data.user || data;
      var admin = typeof window.tbIsAdminUser === 'function' ? window.tbIsAdminUser(user) : user.role === 'admin';
      if (!admin) { window.tbAdminShowGate('需要管理员登录后查看'); return; }
      window.tbAdminShowApp(user); signedIn=true; bind(); version = remembered();
      // A remembered version the server no longer knows must not lock the page out.
      try { await loadStatus(); } catch (err) { if (!version || !signedIn) throw err; version = ''; remember(''); await loadStatus(); }
      await loadRecords();
      setInterval(function() { if (signedIn && !document.hidden) loadStatus().catch(function(err) { notify('actionStatus',err.message,true); }); },60000);
    } catch(err) { if (!signedIn) window.tbAdminShowGate(err.message); else notify('actionStatus',err.message,true); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
