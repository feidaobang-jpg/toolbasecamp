/**
 * Notebookcheck mobile GPU ranking list renderer.
 */
(function () {
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

  function brandClass(brand) {
    var b = String(brand || '').toLowerCase();
    if (b === 'nvidia') return 'is-nvidia';
    if (b === 'amd') return 'is-amd';
    if (b === 'intel') return 'is-intel';
    return '';
  }

  var state = {
    items: [],
    brand: 'all',
    sourceUrl: '',
    updatedAt: ''
  };

  function setMeta() {
    var meta = document.getElementById('nb-rank-meta');
    if (!meta) return;
    var parts = [];
    if (state.updatedAt) {
      parts.push(
        tr('tools.ladderNbGpuRank.updated', '更新') +
          '：' +
          state.updatedAt.replace('T', ' ').replace('Z', ' UTC')
      );
    }
    parts.push(tr('tools.ladderNbGpuRank.count', '条目') + '：' + state.items.length);
    meta.textContent = parts.join(' · ');
  }

  function filtered() {
    if (state.brand === 'all') return state.items.slice();
    return state.items.filter(function (it) {
      return String(it.brand || '').toLowerCase() === state.brand;
    });
  }

  function render() {
    var root = document.getElementById('nb-rank-list');
    if (!root) return;
    var list = filtered();
    if (!list.length) {
      root.innerHTML = '<div class="nb-rank-empty">' + tr('tools.ladderNbGpuRank.empty', '暂无数据') + '</div>';
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
      if (it.time_spy) sub.push('Time Spy ' + Math.round(Number(it.time_spy)));
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
        (it.perf_rating != null ? Number(it.perf_rating).toFixed(1) : '-') +
        '</div>';
      row.querySelector('.nb-rank-name').textContent = it.model || '';
      row.querySelector('.nb-rank-sub').textContent = sub.join(' · ');
      root.appendChild(row);
    });
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
    setMeta();
    render();
  }

  function staticUrl() {
    var path = window.location.pathname || '';
    var parts = path.replace(/^\//, '').split('/').filter(Boolean);
    var last = parts[parts.length - 1] || '';
    var dirs = last.indexOf('.') >= 0 ? parts.slice(0, -1) : parts;
    var prefix = dirs.length ? '../'.repeat(dirs.length) : '';
    return prefix + 'data/nbcheck/nb_gpu.json';
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
    return fetch(apiBase() + '/nbcheck/nb_gpu', {
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
        '<div class="nb-rank-empty">' + tr('tools.ladderNbGpuRank.loading', '加载中…') + '</div>';
    }
    // Only hit /nbcheck when health says the route exists — avoids noisy console 404.
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
            tr('tools.ladderNbGpuRank.loadFail', '加载失败') +
            '：' +
            (err && err.message ? err.message : String(err)) +
            '</div>';
        }
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindFilters();
    load();
  });
})();
