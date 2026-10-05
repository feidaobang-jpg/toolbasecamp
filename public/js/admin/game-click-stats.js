/* Game-entry analytics: one browser may use both channels and several games. */
(function () {
  'use strict';

  function el(id) { return document.getElementById('game-click-' + id); }
  var scope = el('scope'), sort = el('sort'), search = el('search'), zero = el('zero');
  var direction = el('direction'), snapshot = null, ascending = false;
  var columns = ['combined.visitors', 'combined.clicks', 'toy.visitors', 'toy.clicks', 'site.visitors', 'site.clicks'];

  function tr(key, values) { return window.t('gameClickStats.' + key, values); }
  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('zh-CN'); }
  function metric(row, key) {
    var parts = key.split('.');
    return Number((row[parts[0]] || {})[parts[1]] || 0);
  }
  function card(label, value, sub) {
    return '<div class="stat-card"><div class="stat-label">' + escape(label) +
      '</div><div class="stat-value">' + escape(value) + '</div><div class="stat-sub">' +
      escape(sub) + '</div></div>';
  }
  function cells(row) {
    return columns.map(function (key) { return '<td>' + fmt(metric(row, key)) + '</td>'; }).join('');
  }
  function rangeText(data, cumulative) {
    return data.from ? tr(cumulative ? 'cumulativeRange' : 'range', { from: data.from, to: data.to }) : tr('noHistory');
  }

  function paint() {
    var data = snapshot;
    var ready = !!(data && data.combined && data.all_time && data.all_time.combined);
    el('error').hidden = ready;
    if (!ready) {
      el('cards').innerHTML = ['selectedPeople', 'selectedClicks', 'lifetimePeople', 'lifetimeClicks'].map(function (key) {
        return card(tr(key), '—', '');
      }).join('');
      ['channels', 'body', 'footer'].forEach(function (id) { el(id).innerHTML = ''; });
      ['range', 'result'].forEach(function (id) { el(id).textContent = ''; });
      return;
    }
    el('range').textContent = rangeText(data, false) + ' ｜ ' + rangeText(data.all_time, true);
    el('cards').innerHTML = [
      card(tr('selectedPeople'), fmt(data.combined.visitors), tr('dedup')),
      card(tr('selectedClicks'), fmt(data.combined.clicks), tr('clickSum')),
      card(tr('lifetimePeople'), fmt(data.all_time.combined.visitors), tr('lifetime')),
      card(tr('lifetimeClicks'), fmt(data.all_time.combined.clicks), tr('lifetime'))
    ].join('');

    var cumulative = scope.value === 'all_time';
    var view = cumulative ? data.all_time : data;
    var scopeLabel = tr(cumulative ? 'allTime' : 'selected');
    el('channels').innerHTML = ['toy', 'site'].map(function (channel) {
      var totals = view.totals[channel];
      return '<div><span>' + escape(scopeLabel + ' · ' + tr(channel)) + '</span><strong>' +
        escape(tr('channels', { people: fmt(totals.visitors), clicks: fmt(totals.clicks) })) + '</strong></div>';
    }).join('');
    var key = columns.indexOf(sort.value) >= 0 ? sort.value : 'combined.visitors';
    var query = search.value.trim().toLowerCase();
    var rows = view.games.slice().sort(function (a, b) {
      return (metric(a, key) - metric(b, key)) * (ascending ? 1 : -1) ||
        metric(b, 'combined.clicks') - metric(a, 'combined.clicks') || a.key.localeCompare(b.key);
    }).map(function (game, i) { return { game: game, rank: i + 1 }; }).filter(function (row) {
      return (zero.checked || metric(row.game, 'combined.clicks') > 0) &&
        (!query || window.t(row.game.titleKey).toLowerCase().indexOf(query) !== -1);
    });
    el('body').innerHTML = rows.map(function (row) {
      var game = row.game;
      return '<tr' + (metric(game, 'combined.clicks') ? '' : ' class="game-click-muted"') +
        '><td>' + row.rank + '</td><th scope="row">' + escape(window.t(game.titleKey)) + '</th>' + cells(game) + '</tr>';
    }).join('') || '<tr><td colspan="8" class="stats-empty">' + escape(tr('empty')) + '</td></tr>';
    el('footer').innerHTML = '<tr><th colspan="2" scope="row">' + escape(tr('summary')) + '</th>' +
      cells({ combined: view.combined, toy: view.totals.toy, site: view.totals.site }) + '</tr>';
    el('result').textContent = rangeText(view, cumulative) + ' · ' +
      tr('rows', { shown: rows.length, total: view.games.length });
    direction.textContent = tr(ascending ? 'asc' : 'desc');
    document.querySelectorAll('[data-game-sort]').forEach(function (th) {
      th.setAttribute('aria-sort', th.getAttribute('data-game-sort') === key ? (ascending ? 'ascending' : 'descending') : 'none');
    });
  }

  [scope, sort, zero].forEach(function (control) { control.addEventListener('change', paint); });
  search.addEventListener('input', paint);
  direction.addEventListener('click', function () { ascending = !ascending; paint(); });
  document.querySelectorAll('[data-game-sort]').forEach(function (th) {
    th.querySelector('button').addEventListener('click', function () {
      var key = th.getAttribute('data-game-sort');
      ascending = sort.value === key ? !ascending : false;
      sort.value = key;
      paint();
    });
  });
  window.TBGameClickStats = { render: function (data) { snapshot = data; paint(); } };
})();
