/**
 * 下载页 — 公开软件列表（/downloads.html）
 * API: GET /api/downloads；服务器文件走 apiBase + url，外链直接跳转。
 */
(function () {
  'use strict';

  var state = { items: [], category: '' };

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) {
      return String(siteConfig.apiBase).replace(/\/$/, '');
    }
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n <= 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function extOf(item) {
    var name = String(item.origName || item.url || '');
    var m = name.match(/\.([A-Za-z0-9]{1,8})(?:[?#]|$)/);
    return m ? m[1].toLowerCase() : '';
  }

  function iconClass(item) {
    var ext = extOf(item);
    if (ext === 'exe' || ext === 'msi') return 'is-win fab fa-windows';
    if (ext === 'apk') return 'is-android fab fa-android';
    if (ext === 'dmg' || ext === 'pkg') return 'is-apple fab fa-apple';
    if (ext === 'zip' || ext === '7z' || ext === 'rar') return 'is-zip fas fa-file-zipper';
    if (ext === 'pdf') return 'is-pdf fas fa-file-pdf';
    return 'fas fa-cube';
  }

  function isExternal(item) {
    return item.sourceType === 'external';
  }

  function downloadHref(item) {
    if (isExternal(item)) return item.url || '';
    return apiBase() + (item.url || '');
  }

  function categories(items) {
    var seen = {};
    var list = [];
    items.forEach(function (it) {
      var c = String(it.category || '').trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      list.push(c);
    });
    return list;
  }

  function renderChips() {
    var wrap = document.getElementById('downloads-chips');
    if (!wrap) return;
    var cats = categories(state.items);
    var html = '<button type="button" data-cat="" class="' + (state.category === '' ? 'is-active' : '') + '">' +
      escapeHtml(tr('downloads.all')) + '</button>';
    cats.forEach(function (c) {
      html += '<button type="button" data-cat="' + escapeHtml(c) + '" class="' +
        (state.category === c ? 'is-active' : '') + '">' + escapeHtml(c) + '</button>';
    });
    wrap.innerHTML = html;
  }

  function visibleItems() {
    if (!state.category) return state.items;
    return state.items.filter(function (it) {
      return String(it.category || '').trim() === state.category;
    });
  }

  function cardHtml(item) {
    var ext = isExternal(item);
    var meta = [];
    if (item.category) meta.push('<span class="dl-cat">' + escapeHtml(item.category) + '</span>');
    var size = fmtBytes(item.fileSize);
    if (size) meta.push(escapeHtml(size));
    if (item.updatedAt) meta.push(escapeHtml(String(item.updatedAt).slice(0, 10)));
    meta.push(escapeHtml(tr('downloads.times', { n: item.downloadCount || 0 })));
    var ver = item.version
      ? '<span class="dl-ver">' + escapeHtml(item.version) + '</span>'
      : '';
    var title = escapeHtml(item.title || item.origName || ('#' + item.id));
    var desc = item.description
      ? '<p class="dl-desc">' + escapeHtml(item.description) + '</p>'
      : '';
    var sourceTag = ext
      ? '<span class="dl-source"><i class="fas fa-cloud" aria-hidden="true"></i>' + escapeHtml(tr('downloads.sourceExternal')) + '</span>'
      : '<span class="dl-source"><i class="fas fa-server" aria-hidden="true"></i>' + escapeHtml(tr('downloads.sourceServer')) + '</span>';
    var btnLabel = ext ? tr('downloads.externalBtn') : tr('downloads.download');
    var btnIcon = ext ? 'fas fa-cloud-download-alt' : 'fas fa-download';
    var externalAttrs = ext ? ' target="_blank" rel="noopener noreferrer nofollow"' : '';
    return (
      '<article class="dl-card">' +
        '<div class="dl-card-top">' +
          '<span class="dl-icon"><i class="' + iconClass(item) + '" aria-hidden="true"></i></span>' +
          '<div class="dl-card-head">' +
            '<h3>' + title + ver + '</h3>' +
            '<div class="dl-meta">' + meta.join('') + '</div>' +
          '</div>' +
        '</div>' +
        desc +
        '<div class="dl-actions">' +
          '<a class="tb-dl-btn' + (ext ? ' is-external' : '') + '" href="' + escapeHtml(downloadHref(item)) + '"' + externalAttrs + '>' +
            '<i class="' + btnIcon + '" aria-hidden="true"></i>' + escapeHtml(btnLabel) +
          '</a>' +
          sourceTag +
        '</div>' +
      '</article>'
    );
  }

  function renderGrid() {
    var grid = document.getElementById('downloads-grid');
    var empty = document.getElementById('downloads-empty');
    var status = document.getElementById('downloads-status');
    if (!grid) return;
    var items = visibleItems();
    grid.innerHTML = items.map(cardHtml).join('');
    if (empty) empty.classList.toggle('hidden', state.items.length > 0);
    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
  }

  function load() {
    var status = document.getElementById('downloads-status');
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = tr('downloads.loading');
    }
    fetch(apiBase() + '/downloads', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.items = (data && data.items) || [];
        renderChips();
        renderGrid();
      })
      .catch(function () {
        state.items = [];
        renderChips();
        var grid = document.getElementById('downloads-grid');
        if (grid) grid.innerHTML = '';
        var empty = document.getElementById('downloads-empty');
        if (empty) empty.classList.add('hidden');
        if (status) {
          status.hidden = false;
          status.classList.add('is-error');
          status.textContent = tr('downloads.loadError');
        }
      });
  }

  function bindUi() {
    var chips = document.getElementById('downloads-chips');
    if (chips) {
      chips.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        state.category = btn.getAttribute('data-cat') || '';
        renderChips();
        renderGrid();
      });
    }
    if (typeof window.tbApplyI18n === 'function') window.tbApplyI18n(document);
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }
})();
