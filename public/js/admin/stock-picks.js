/* One versioned strategy; GET previews never create simulated fills. */
(function () {
  'use strict';
  var page = 1, pageSize = 20, recordsRequest = 0, signedIn = false, lastSessionMessage = '';
  function el(id) { return document.getElementById(id); }
  function tr(key) { return window.t('privateHub.stock.' + key); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmt(n, digits) { return n == null ? '—' : Number(n).toFixed(digits == null ? 2 : digits); }
  function apiBase() { return (window.siteConfig && siteConfig.apiBase) || window.location.origin + '/api'; }
  function notify(id, message, error) { el(id).textContent = message; el(id).classList.toggle('is-error', !!error); }
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
  function renderStats(s) {
    var eq = s.equity;
    var parts = [chip('已平仓', s.settled || 0), chip('持仓中', s.open_count || 0),
      chip('待复核', s.review_count || 0), chip('扣费胜率', s.win_rate == null ? '样本不足' : fmt(s.win_rate,1) + '%'),
      chip('平均净收益', fmt(s.avg_return) + (s.avg_return == null ? '' : '%')),
      chip('平均盈亏比', fmt(s.payoff_ratio)), chip('已实现净利润', fmt(s.net_pnl) + '元'),
      chip('模拟权益', eq ? fmt(eq.equity) + '元' : '尚未观察'),
      chip('观察点最大回撤', s.max_drawdown == null ? '—' : fmt(s.max_drawdown) + '%')];
    var note = '仅统计当前规则版本；胜率以已平仓扣费盈利计算。';
    if ((s.settled || 0) < 30) note += ' 已平仓样本不足30笔，暂不能判断稳定性。';
    if (eq) note += ' 权益观察时间：' + eq.observed_at + '。';
    if (eq && eq.stale_positions) note += ' 有' + eq.stale_positions + '个持仓估值过期。';
    el('recordsStats').innerHTML = '<div class="records-stats-row">' + parts.join('') + '</div><p class="stock-explanation">' + esc(note) + '</p>';
  }
  function renderScreen(screen, label) {
    var target = el('screenResults'); target.innerHTML = '';
    if (!screen) return;
    var lead = document.createElement('p'); lead.className = 'stock-explanation';
    lead.textContent = label + ' · ' + (screen.generated_at || '') + ' · ' + (screen.message || '');
    if (screen.market) lead.textContent += ' · 全市场上涨占比' + screen.market.up_ratio + '%';
    target.appendChild(lead);
    (screen.items || []).forEach(function(item) {
      var card = document.createElement('article'); card.className = 'stock-card';
      var m = item.metrics || {};
      card.innerHTML = '<div class="stock-header"><div><div class="stock-title">' + esc(item.name) + '（' + esc(item.symbol) +
        '）</div><div class="stock-sub">' + esc(item.sector) + '</div></div><span class="stock-badge">匹配分 ' +
        esc(item.match_score) + '，非胜率</span></div><div class="metrics">' +
        metric('最新价', fmt(m.last_price)) + metric('当日涨幅', fmt(m.pct_change) + '%') +
        metric('回调', m.pullback_days + '日 / ' + fmt(m.pullback_pct) + '%') +
        metric('回调量 / 基准量', fmt(m.pullback_volume_ratio)) + '</div><p class="text-block">' + esc(item.reason) + '</p>';
      target.appendChild(card);
    });
  }
  function metric(label, value) { return '<div class="metric"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></div>'; }
  async function loadStatus() {
    var data = await api('/stocks/status'), r = data.rules, last = data.last_run, result = last && last.result;
    renderStats(data.stats);
    var text = '北京时间 · ' + r.version + ' · 交易日14:50确认信号、14:55模拟买入，盘中每5分钟检查，15:10保存估值。';
    text += last ? ' 最近执行：' + last.finished_at + '（' + (last.status === 'ok' ? '完成' : '待核验') + '）。' : ' 尚无自动运行记录。';
    if (data.last_success_at) text += ' 最近成功：' + data.last_success_at + '。';
    if (!data.calendar_ok) text += ' 交易日历未核验，已暂停执行。';
    if (result && result.errors && result.errors.length) text += ' ' + result.errors.join('；');
    el('schedulerStatus').textContent = text;
    el('schedulerStatus').classList.toggle('is-error', !data.calendar_ok || !!(result && result.errors && result.errors.length));
    lastSessionMessage = data.session_message || '';
    notify('marketSessionStatus', lastSessionMessage, !data.calendar_ok);
    el('rulesText').innerHTML = '<p>主板普通股；20/60日趋势向上，回调2～5日且缩量，重新转强；市场和行业偏弱时空仓，最多扫描100只、推荐3只。</p>' +
      '<p>模型本金' + fmt(r.capital,0) + '元，每仓预算' + fmt(r.position_budget,0) + '元，最多' + r.max_positions +
      '仓。正常持有3～10个交易日；止损' + r.stop_loss_pct + '%、止盈' + r.take_profit_pct +
      '%，盈利达到' + r.trailing_start_pct + '%后观察到的峰值回撤' + r.trailing_drawdown_pct + '%退出。T+1，退出受阻则继续持有。</p>' +
      '<p>模拟单边滑点' + fmt(r.slippage_rate * 100,2) + '%；佣金万' + fmt(r.commission_rate * 10000,1) +
      '、最低' + r.minimum_commission + '元；卖出印花税' + fmt(r.stamp_tax_rate * 100,2) +
      '%、双边过户费' + fmt(r.transfer_fee_rate * 100,3) + '%。按实际买卖盘参考价模拟，无法保证实际成交。</p>' +
      '<p>除权除息收益待复核。预览、未成交、旧策略不纳入新胜率。5分钟观察可能遗漏盘中波动。交易日历已核验至' +
      esc(r.calendar_verified_through) + '；新年份未核验时暂停。</p>';
    // A watch run need not contain a screen; load the latest signal separately below.
    renderScreen(data.latest_screen || (result && result.screen), '最近自动筛选');
  }
  async function loadRecords() {
    var seq = ++recordsRequest, state = el('recordsState').value, archive = state === 'archive';
    notify('recordsStatus', tr('loading'));
    try {
      var data = await api((archive ? '/stocks/legacy-records' : '/stocks/records') +
        '?limit=' + pageSize + '&offset=' + ((page-1)*pageSize) + (!archive && state ? '&state=' + encodeURIComponent(state) : ''));
      if (seq !== recordsRequest) return;
      el('recordsBody').innerHTML = '';
      (data.items || []).forEach(function(r) {
        var row = document.createElement('tr'), ret = archive ? r.pct_return : (r.net_return == null ? r.unrealized_return : r.net_return);
        var name = archive ? ({strong_momentum:'旧强势弹性',monster_stock:'旧妖股追高'}[r.strategy] || '旧策略') : r.sector;
        var stateLabel = archive ? r.status : tr(r.status);
        if (!archive && r.status === 'review') ret = null;
        var netLabel = fmt(ret) + (ret == null ? '' : '%') + (archive ? '（旧毛收益）' : r.status === 'open' ? '（浮动）' : '');
        row.innerHTML = '<td>' + esc(archive ? r.buy_date : r.signal_at) + '</td><td>' + esc(r.name) +
          '（' + esc(r.symbol) + '）<small>' + esc(name) + '</small></td><td>' + esc(fmt(archive ? r.buy_price : r.entry_price)) +
          '<small>' + esc(archive ? '' : (r.entry_at || '') + (r.quantity ? ' / ' + r.quantity + '股' : '')) +
          '</small></td><td>' + esc(fmt(archive ? r.sell_price : r.exit_price || r.last_price)) +
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
    el('btnPreview').addEventListener('click',function() { action(this,async function() { var data=await api('/stocks/recommend-pullback');
      if (data.preview && data.message && data.message===lastSessionMessage) { notify('actionStatus','休市期间未执行新筛选；安排见上方休市提示'); return; }
      renderScreen(data,'仅预览，不记成交'); notify('actionStatus',data.message); }); });
    el('btnCheck').addEventListener('click',function() { action(this,async function() { var data=await api('/stocks/run','POST'); await loadStatus(); await loadRecords(); notify('actionStatus',data.message + (data.errors && data.errors.length ? '：' + data.errors.join('；') : ''),!data.success); }); });
    el('btnExport').addEventListener('click',function() { action(this,async function() {
      var data=await api('/stocks/review-export?days=90'), blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
      var url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download='股票复盘-' + data.generated_at.slice(0,10) + '.json';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(function(){URL.revokeObjectURL(url);},1000);
      notify('actionStatus','已导出网站记录，可供AI复盘');
    }); });
    el('recordsState').addEventListener('change',function() { page=1; loadRecords(); });
  }
  async function boot() {
    if (!localStorage.getItem('auth_token')) { window.tbAdminShowGate('请先登录管理员账号'); return; }
    try {
      var data=await api('/auth/me'), user=data.user || data;
      var admin = typeof window.tbIsAdminUser === 'function' ? window.tbIsAdminUser(user) : user.role === 'admin';
      if (!admin) { window.tbAdminShowGate('需要管理员登录后查看'); return; }
      window.tbAdminShowApp(user); signedIn=true; bind(); await loadStatus(); await loadRecords();
      setInterval(function() { if (signedIn && !document.hidden) loadStatus().catch(function(err) { notify('actionStatus',err.message,true); }); },60000);
    } catch(err) { if (!signedIn) window.tbAdminShowGate(err.message); else notify('actionStatus',err.message,true); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
