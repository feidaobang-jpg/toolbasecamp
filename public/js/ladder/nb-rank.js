/**
 * Notebookcheck ranking list renderer (list-id aware via window.NB_RANK_CONFIG).
 *
 * Page config example:
 *   window.NB_RANK_CONFIG = {
 *     listId: 'nb_gpu',
 *     i18nPrefix: 'tools.ladderNbGpuRank',
 *     filters: ['nvidia', 'amd', 'intel']
 *   };
 */
(function () {
  function cfg() {
    return window.NB_RANK_CONFIG || { listId: 'nb_gpu', i18nPrefix: 'tools.ladderNbGpuRank' };
  }

  function apiBase() {
    if (window.siteConfig && window.siteConfig.apiBase) return window.siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function i18nKey(suffix) {
    return (cfg().i18nPrefix || 'tools.ladderNbGpuRank') + '.' + suffix;
  }

  function brandClass(brand) {
    var b = String(brand || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (b === 'nvidia') return 'is-nvidia';
    if (b === 'amd') return 'is-amd';
    if (b === 'intel') return 'is-intel';
    if (b === 'apple') return 'is-apple';
    if (b === 'qualcomm') return 'is-qualcomm';
    if (b === 'mediatek') return 'is-mediatek';
    if (b === 'samsung') return 'is-samsung';
    if (b === 'google') return 'is-google';
    if (b === 'hisilicon') return 'is-hisilicon';
    if (b === 'xiaomi') return 'is-xiaomi';
    if (b === 'unisoc') return 'is-unisoc';
    return '';
  }

  var state = {
    items: [],
    brand: 'all',
    sourceUrl: '',
    updatedAt: '',
    scoreLabel: ''
  };

  function setMeta() {
    var meta = document.getElementById('nb-rank-meta');
    if (!meta) return;
    var parts = [];
    if (state.updatedAt) {
      parts.push(
        tr(i18nKey('updated'), '更新') +
          '：' +
          state.updatedAt.replace('T', ' ').replace('Z', ' UTC')
      );
    }
    parts.push(tr(i18nKey('count'), '条目') + '：' + state.items.length);
    if (state.scoreLabel) {
      parts.push(tr(i18nKey('scoreLabel'), '分数') + '：' + state.scoreLabel);
    }
    meta.textContent = parts.join(' · ');
  }

  function filtered() {
    if (state.brand === 'all') return state.items.slice();
    return state.items.filter(function (it) {
      return String(it.brand || '').toLowerCase() === state.brand;
    });
  }

  function formatScore(it) {
    var n = Number(it.perf_rating);
    if (!isFinite(n)) return '-';
    if (n >= 1000) return String(Math.round(n));
    return n.toFixed(1);
  }

  function render() {
    var root = document.getElementById('nb-rank-list');
    if (!root) return;
    var list = filtered();
    if (!list.length) {
      root.innerHTML = '<div class="nb-rank-empty">' + tr(i18nKey('empty'), '暂无数据') + '</div>';
      return;
    }
    var top = list[0] && list[0].perf_rating ? Number(list[0].perf_rating) : 1;
    root.innerHTML = '';
    list.forEach(function (it, idx) {
      var pct = top > 0 ? Math.max(2, Math.round((1000 * Number(it.perf_rating || 0)) / top) / 10) : 0;
      var row = document.createElement('div');
      row.className = 'nb-rank-row';
      var sub = [];
      if (it.architecture) sub.push(it.architecture);
      if (it.tdp || it.tdp_turbo) {
        var base = it.tdp ? Math.round(Number(it.tdp)) : null;
        var turbo = it.tdp_turbo ? Math.round(Number(it.tdp_turbo)) : null;
        if (base != null && turbo != null && turbo !== base) {
          sub.push('TDP ' + base + '–' + turbo + ' W');
        } else if (turbo != null) {
          sub.push('TDP ' + turbo + ' W');
        } else if (base != null) {
          sub.push('TDP ' + base + ' W');
        }
      }
      if (it.time_spy) sub.push('Time Spy ' + Math.round(Number(it.time_spy)));
      if (it.cb_r23) sub.push('CB R23 ' + Math.round(Number(it.cb_r23)));
      row.innerHTML =
        '<div class="nb-rank-pos">' +
        (idx + 1) +
        '</div>' +
        '<div class="nb-rank-main">' +
        '<div class="nb-rank-name"></div>' +
        '<div class="nb-rank-sub"></div>' +
        '<div class="nb-rank-bar-wrap"><div class="nb-rank-bar ' +
        brandClass(it.brand) +
        '" style="width:' +
        pct +
        '%"></div></div>' +
        '</div>' +
        '<div class="nb-rank-score">' +
        formatScore(it) +
        '</div>';
      row.querySelector('.nb-rank-name').textContent = it.model || '';
      row.querySelector('.nb-rank-sub').textContent = sub.join(' · ');
      root.appendChild(row);
    });
  }

  function ensureFilters() {
    var box = document.getElementById('nb-rank-filters');
    if (!box) return;
    var brands = cfg().filters;
    if (!brands || !brands.length) return;
    // If page already has buttons, keep them; else build from config.
    if (box.querySelector('button[data-brand]')) return;
    var html =
      '<button type="button" class="is-active" data-brand="all">' +
      tr(i18nKey('filterAll'), '全部') +
      '</button>';
    brands.forEach(function (b) {
      var label = b.charAt(0).toUpperCase() + b.slice(1);
      if (b === 'hisilicon') label = 'HiSilicon';
      if (b === 'mediatek') label = 'MediaTek';
      html += '<button type="button" data-brand="' + b + '">' + label + '</button>';
    });
    box.innerHTML = html;
  }

  function bindFilters() {
    var box = document.getElementById('nb-rank-filters');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-brand]');
      if (!btn) return;
      state.brand = btn.getAttribute('data-brand') || 'all';
      Array.prototype.forEach.call(box.querySelectorAll('button[data-brand]'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      render();
    });
  }

  function applyData(data) {
    state.items = data.items || [];
    state.sourceUrl = data.source_url || '';
    state.updatedAt = data.updated_at || '';
    state.scoreLabel = data.score_label || cfg().scoreLabel || '';
    setMeta();
    render();
  }

  function staticUrl() {
    var listId = cfg().listId || 'nb_gpu';
    var path = window.location.pathname || '';
    var parts = path.replace(/^\//, '').split('/').filter(Boolean);
    var last = parts[parts.length - 1] || '';
    var dirs = last.indexOf('.') >= 0 ? parts.slice(0, -1) : parts;
    var prefix = dirs.length ? '../'.repeat(dirs.length) : '';
    return prefix + 'data/nbcheck/' + listId + '.json';
  }

  function loadStatic() {
    return fetch(staticUrl() + '?t=' + Date.now(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function loadApi() {
    var listId = cfg().listId || 'nb_gpu';
    return fetch(apiBase() + '/nbcheck/' + encodeURIComponent(listId), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function apiReady() {
    return fetch(apiBase() + '/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json();
      })
      .then(function (h) {
        return !!(h && h.nbcheck_api);
      })
      .catch(function () {
        return false;
      });
  }

  function load() {
    var root = document.getElementById('nb-rank-list');
    if (root) {
      root.innerHTML =
        '<div class="nb-rank-empty">' + tr(i18nKey('loading'), '加载中…') + '</div>';
    }
    apiReady()
      .then(function (ready) {
        return ready ? loadApi() : loadStatic();
      })
      .then(applyData)
      .catch(function () {
        return loadStatic().then(applyData);
      })
      .catch(function (err) {
        if (root) {
          root.innerHTML =
            '<div class="nb-rank-error">' +
            tr(i18nKey('loadFail'), '加载失败') +
            '：' +
            (err && err.message ? err.message : String(err)) +
            '</div>';
        }
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureFilters();
    bindFilters();
    load();
  });
})();
