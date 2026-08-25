/**
 * Admin — image library bulk upload (classic / curated images)
 */
(function () {
  'use strict';

  var existingSources = new Set();
  var selectedPreset = '';
  var filterCategory = '';
  var filterSearch = '';
  var filterSearchTimer = null;
  var mediaKind = 'all'; // all | still | gif
  var pageItems = [];
  var listTotal = 0;
  var catalogTotal = 0;
  var categoryCounts = {};
  var kindCounts = { all: 0, gif: 0, still: 0 };
  var selectedIds = new Set();
  var listPage = 1;
  var PAGE_SIZE = 20;
  var listRequestSeq = 0;

  var PRESET_CATS = [
    { value: '表情包', key: 'privateHub.ops.stickersCatSticker' },
    { value: '壁纸', key: 'privateHub.ops.stickersCatWallpaper' },
    { value: '漫画', key: 'privateHub.ops.stickersCatComic' },
    { value: '风景', key: 'privateHub.ops.stickersCatScenery' },
    { value: '人物', key: 'privateHub.ops.stickersCatPeople' },
    { value: '萌宠', key: 'privateHub.ops.stickersCatPet' },
    { value: '其他', key: 'privateHub.ops.stickersCatOther' }
  ];

  function normFileName(name) {
    var s = String(name || '').trim();
    var i = s.lastIndexOf('\\');
    if (i >= 0) s = s.slice(i + 1);
    i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s.toLowerCase();
  }

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return String(siteConfig.apiBase).replace(/\/$/, '');
    return '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function authHeaders(extra) {
    var h = Object.assign({ Accept: 'application/json' }, extra || {});
    var tok = token();
    if (tok) h.Authorization = 'Bearer ' + tok;
    return h;
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
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function isGenericStickerTitle(title) {
    var s = String(title || '').trim();
    if (!s) return true;
    if (/^\(\d+\)$/.test(s)) return true;
    if (/^\d{1,6}$/.test(s)) return true;
    if (/^img[_-]?\d+$/i.test(s)) return true;
    if (/^image[_-]?\d+$/i.test(s)) return true;
    if (/^sticker\d*$/i.test(s)) return true;
    if (/^[\d()_\s.\-]+$/.test(s)) return true;
    if (s.length <= 3 && !/[\u4e00-\u9fff]/.test(s)) return true;
    if (!/[\u4e00-\u9fff]/.test(s) && (/^.+\(\d+\)$/.test(s) || /^[a-z][a-z0-9_-]*[\s._-]*\d{1,4}$/i.test(s))) {
      return true;
    }
    return false;
  }

  function displayTitle(item) {
    var title = String((item && item.title) || '').trim();
    // Uploads always store OCR text as title — show it as the display name.
    if (title && !isGenericStickerTitle(title)) return title;
    if (title && /[\u4e00-\u9fff]/.test(title)) return title;
    return item.category || tr('hub.imagesPage.stickersUntitled') || item.id || '';
  }

  function thumbUrl(item) {
    if (!item) return '';
    if (item.thumbnailUrl) {
      if (item.thumbnailUrl.indexOf('/pubsticker/') === 0) return item.thumbnailUrl;
      return apiBase() + (item.thumbnailUrl.charAt(0) === '/' ? item.thumbnailUrl : '/' + item.thumbnailUrl);
    }
    if (item.imageUrl) {
      return apiBase() + (item.imageUrl.charAt(0) === '/' ? item.imageUrl : '/' + item.imageUrl);
    }
    return '';
  }

  function isAnimated(item) {
    if (!item) return false;
    if (typeof item.animated === 'boolean') return item.animated;
    var ctype = String(item.contentType || '').toLowerCase();
    if (ctype.indexOf('gif') >= 0) return true;
    var u = String(item.staticUrl || item.source || item.imageUrl || '');
    return /\.gif(\?|$)/i.test(u);
  }

  function playUrl(item) {
    if (!item) return '';
    var u = item.staticUrl || item.previewUrl || '';
    if (u) {
      if (u.indexOf('/pubsticker/') === 0) return u;
      return apiBase() + (u.charAt(0) === '/' ? u : '/' + u);
    }
    if (item.imageUrl) {
      return apiBase() + (item.imageUrl.charAt(0) === '/' ? item.imageUrl : '/' + item.imageUrl);
    }
    return '';
  }

  function disconnectGifObserver() {
    if (window.TBGifViewport && typeof window.TBGifViewport.disconnectAll === 'function') {
      window.TBGifViewport.disconnectAll();
    }
  }

  function bindGifViewport(img, thumbSrc, playSrc) {
    if (window.TBGifViewport && typeof window.TBGifViewport.bind === 'function') {
      window.TBGifViewport.bind(img, thumbSrc, playSrc);
      return;
    }
    if (playSrc) img.src = playSrc;
    else if (thumbSrc) img.src = thumbSrc;
  }

  function rememberSources(items) {
    (items || []).forEach(function (item) {
      if (item && item.source) existingSources.add(normFileName(item.source));
    });
  }

  function syncUploadChips() {
    document.querySelectorAll('#upload-cat-chips [data-cat-value]').forEach(function (btn) {
      var on = selectedPreset === (btn.getAttribute('data-cat-value') || '');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderUploadChips() {
    var wrap = document.getElementById('upload-cat-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    PRESET_CATS.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ladder-cat-chip';
      btn.setAttribute('data-cat-value', cat.value);
      btn.textContent = tr(cat.key);
      btn.addEventListener('click', function () {
        selectedPreset = selectedPreset === cat.value ? '' : cat.value;
        syncUploadChips();
      });
      wrap.appendChild(btn);
    });
    syncUploadChips();
  }

  function renderFilterChips() {
    var wrap = document.getElementById('filter-cat-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    var counts = categoryCounts || {};
    var gifN = Number(kindCounts.gif) || 0;
    var stillN = Number(kindCounts.still) || 0;
    var allN = Number(kindCounts.all) || catalogTotal || 0;

    function addKindBtn(kind, label, count) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ladder-cat-chip' + (mediaKind === kind ? ' active' : '');
      btn.textContent = label + ' (' + count + ')';
      btn.addEventListener('click', function () {
        if (mediaKind === kind) return;
        mediaKind = kind;
        listPage = 1;
        selectedIds = new Set();
        loadList();
      });
      wrap.appendChild(btn);
    }
    addKindBtn('all', tr('hub.imagesPage.filterAll'), allN);
    addKindBtn('gif', tr('hub.imagesPage.filterGif'), gifN);
    addKindBtn('still', tr('hub.imagesPage.filterStill'), stillN);

    // Category chips only (no second「全部」— clear by clicking the active category again).
    PRESET_CATS.forEach(function (cat) {
      var n = counts[cat.value] || 0;
      if (!n && filterCategory !== cat.value) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ladder-cat-chip' + (filterCategory === cat.value ? ' active' : '');
      btn.textContent = tr(cat.key) + ' (' + n + ')';
      btn.addEventListener('click', function () {
        filterCategory = filterCategory === cat.value ? '' : cat.value;
        listPage = 1;
        selectedIds = new Set();
        loadList();
      });
      wrap.appendChild(btn);
    });
    Object.keys(counts).forEach(function (cat) {
      var known = PRESET_CATS.some(function (p) { return p.value === cat; });
      if (known) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ladder-cat-chip' + (filterCategory === cat ? ' active' : '');
      btn.textContent = cat + ' (' + counts[cat] + ')';
      btn.addEventListener('click', function () {
        filterCategory = filterCategory === cat ? '' : cat;
        listPage = 1;
        selectedIds = new Set();
        loadList();
      });
      wrap.appendChild(btn);
    });
  }

  function updateSelectMeta() {
    var el = document.getElementById('select-meta');
    if (!el) return;
    el.textContent = selectedIds.size
      ? tr('privateHub.ops.stickersSelected', { n: selectedIds.size })
      : '';
  }

  function renderGrid() {
    var meta = document.getElementById('list-meta');
    var list = document.getElementById('sticker-list');
    var pager = document.getElementById('list-pager');
    if (!list) return;
    disconnectGifObserver();
    if (typeof tbNormalizePage === 'function') {
      listPage = tbNormalizePage(listPage, listTotal, PAGE_SIZE);
    }
    list.innerHTML = '';
    if (filterCategory || mediaKind !== 'all' || filterSearch.trim()) {
      setStatus(meta, tr('privateHub.ops.stickersListMetaFiltered', {
        filtered: listTotal,
        total: catalogTotal
      }));
    } else {
      setStatus(meta, tr('privateHub.ops.stickersListMeta', { total: listTotal }));
    }
    updateSelectMeta();
    if (typeof tbRenderPager === 'function') {
      tbRenderPager(pager, {
        page: listPage,
        pageSize: PAGE_SIZE,
        total: listTotal,
        onChange: function (p) {
          listPage = p;
          loadList();
        }
      });
    }
    if (!pageItems.length) {
      var emptyMsg = catalogTotal
        ? (filterSearch.trim()
          ? tr('hub.imagesPage.stickersSearchEmpty')
          : tr('privateHub.ops.stickersEmptyFilter'))
        : tr('privateHub.ops.stickersEmpty');
      list.innerHTML = '<p class="ladder-row-empty">' + escapeHtml(emptyMsg) + '</p>';
      return;
    }
    pageItems.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'ladder-media-card' + (selectedIds.has(item.id) ? ' is-selected' : '');
      var src = thumbUrl(item);
      var animated = isAnimated(item);
      var play = playUrl(item);
      card.innerHTML =
        '<label class="ladder-media-check">' +
          '<input type="checkbox" data-id="' + escapeHtml(item.id) + '"' + (selectedIds.has(item.id) ? ' checked' : '') + ' />' +
        '</label>' +
        '<div class="ladder-media-thumb-wrap">' +
          (src
            ? '<img class="ladder-media-thumb" alt="" loading="lazy" decoding="async" src="' + escapeHtml(src) + '" />'
            : '<div class="ladder-media-thumb ladder-media-thumb--empty"></div>') +
          (animated ? '<span class="ladder-media-gif-badge" aria-hidden="true">GIF</span>' : '') +
        '</div>' +
        '<div class="ladder-media-body">' +
          '<div class="ladder-media-title"></div>' +
          '<div class="ladder-media-sub"></div>' +
          '<div class="action-row">' +
            '<button type="button" class="tb-btn" data-del>' + escapeHtml(tr('privateHub.ops.stickersDelete')) + '</button>' +
          '</div>' +
        '</div>';
      var titleText = displayTitle(item);
      var titleEl = card.querySelector('.ladder-media-title');
      if (titleText) {
        titleEl.textContent = titleText;
      } else {
        titleEl.hidden = true;
        titleEl.style.display = 'none';
      }
      var metaParts = [];
      var cat = String(item.category || '').trim();
      if (cat) metaParts.push(cat);
      var sizeLab = fmtBytes(item.bytes);
      if (sizeLab) metaParts.push(sizeLab);
      var subEl = card.querySelector('.ladder-media-sub');
      if (metaParts.length) {
        subEl.textContent = metaParts.join(' · ');
      } else {
        subEl.hidden = true;
        subEl.style.display = 'none';
      }
      var cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', function () {
        if (cb.checked) selectedIds.add(item.id);
        else selectedIds.delete(item.id);
        card.classList.toggle('is-selected', cb.checked);
        updateSelectMeta();
      });
      card.querySelector('[data-del]').addEventListener('click', function () {
        deleteItem(item);
      });
      var thumbImg = card.querySelector('.ladder-media-thumb');
      if (thumbImg && animated && play) {
        bindGifViewport(thumbImg, src, play);
      }
      if (thumbImg && item.imageUrl) {
        thumbImg.addEventListener('error', function () {
          if (thumbImg.dataset.fallback) return;
          // Only recover missing JPEG thumb — do not override GIF playback.
          if (thumbImg.dataset.playing === '1') return;
          var cur = thumbImg.getAttribute('src') || '';
          if (thumbImg.dataset.playSrc && cur && cur !== thumbImg.dataset.thumbSrc) return;
          thumbImg.dataset.fallback = '1';
          thumbImg.src = apiBase() + (item.imageUrl.charAt(0) === '/' ? item.imageUrl : '/' + item.imageUrl);
        });
      }
      list.appendChild(card);
    });
  }

  function loadList() {
    var meta = document.getElementById('list-meta');
    var list = document.getElementById('sticker-list');
    if (!list) return Promise.resolve();
    setStatus(meta, tr('privateHub.ops.stickersLoading'));
    if (typeof tbNormalizePage === 'function') {
      listPage = tbNormalizePage(listPage, listTotal || listPage * PAGE_SIZE, PAGE_SIZE);
    }
    var offset = (listPage - 1) * PAGE_SIZE;
    var url = apiBase() + '/image/stickers/admin/list?limit=' + PAGE_SIZE + '&offset=' + offset;
    if (filterCategory) url += '&category=' + encodeURIComponent(filterCategory);
    if (mediaKind === 'gif' || mediaKind === 'still') url += '&kind=' + encodeURIComponent(mediaKind);
    if (filterSearch.trim()) url += '&q=' + encodeURIComponent(filterSearch.trim());
    var seq = ++listRequestSeq;
    return fetch(url, { headers: authHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        if (seq !== listRequestSeq) return;
        pageItems = (data && data.items) || [];
        listTotal = Number(data && data.total) || pageItems.length;
        catalogTotal = Number(data && data.catalogTotal);
        if (!(catalogTotal > 0)) catalogTotal = listTotal;
        categoryCounts = (data && data.categoryCounts) || {};
        kindCounts = (data && data.kindCounts) || { all: catalogTotal, gif: 0, still: 0 };
        rememberSources(pageItems);
        renderFilterChips();
        renderGrid();
      })
      .catch(function (err) {
        if (seq !== listRequestSeq) return;
        setStatus(meta, (err && err.message) || tr('privateHub.ops.stickersLoadFailed'), true);
      });
  }

  function deleteItem(item) {
    if (!item || !item.id) return;
    if (!window.confirm(tr('privateHub.ops.stickersDeleteConfirm', { title: displayTitle(item) }))) return;
    fetch(apiBase() + '/image/stickers/admin/' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: authHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    }).then(function () {
      selectedIds.delete(item.id);
      loadList();
    }).catch(function (err) {
      alert((err && err.message) || tr('privateHub.ops.stickersDeleteFailed'));
    });
  }

  function batchDelete() {
    var ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(tr('privateHub.ops.stickersBatchDeleteConfirm', { n: ids.length }))) return;
    fetch(apiBase() + '/image/stickers/admin/batch-delete', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids: ids })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    }).then(function (data) {
      selectedIds = new Set();
      var status = document.getElementById('upload-status');
      setStatus(status, tr('privateHub.ops.stickersBatchDeleteDone', { n: (data && data.count) || ids.length }));
      loadList();
    }).catch(function (err) {
      alert((err && err.message) || tr('privateHub.ops.stickersDeleteFailed'));
    });
  }

  function isGenericSourceName(name) {
    var stem = String(normFileName(name) || '').replace(/\.[^.]+$/, '');
    if (!stem) return true;
    if (/^\(\d+\)$/.test(stem)) return true;
    if (/^\d{1,6}$/.test(stem)) return true;
    if (/^img[_-]?\d+$/i.test(stem)) return true;
    if (/^image[_-]?\d+$/i.test(stem)) return true;
    if (/^sticker\d*$/i.test(stem)) return true;
    if (/^[\d()_\s.\-]+$/.test(stem)) return true;
    if (stem.length <= 3 && !/[\u4e00-\u9fff]/.test(stem)) return true;
    if (!/[\u4e00-\u9fff]/.test(stem) && (/^.+\(\d+\)$/.test(stem) || /^[a-z][a-z0-9_-]*[\s._-]*\d{1,4}$/i.test(stem))) {
      return true;
    }
    return false;
  }

  function uploadFiles(files) {
    var status = document.getElementById('upload-status');
    var progress = document.getElementById('upload-progress');
    var category = selectedPreset;
    if (!category) {
      setStatus(status, tr('privateHub.ops.stickersNeedCategory'), true);
      return;
    }
    if (!files || !files.length) return;
    var picked = Array.prototype.slice.call(files);
    var skipped = 0;
    var skippedNames = [];
    var batchSeen = new Set();
    var queue = [];
    picked.forEach(function (file) {
      var key = normFileName(file.name);
      // Same pick can still have duplicate paths; skip within-batch name repeats.
      if (batchSeen.has(key)) {
        skipped += 1;
        skippedNames.push(file.name);
        return;
      }
      batchSeen.add(key);
      // Meaningful filenames: skip if already in library. Numbered packs like (1).gif
      // are allowed — server dedupes by file content hash instead.
      if (!isGenericSourceName(file.name) && existingSources.has(key)) {
        skipped += 1;
        skippedNames.push(file.name);
        return;
      }
      queue.push(file);
    });
    if (!queue.length) {
      setStatus(status, tr('privateHub.ops.stickersUploadSkipAll', { skip: skipped }));
      if (progress) progress.hidden = true;
      return;
    }

    var pickedTotal = skipped + queue.length;
    var uploadTotal = queue.length;
    var done = 0;
    var ok = 0;
    var fail = 0;
    var serverSkip = 0;
    var ocrSkip = 0;

    function next() {
      if (!queue.length) {
        setStatus(
          status,
          tr('privateHub.ops.stickersUploadDone', {
            ok: ok,
            dup: skipped + serverSkip,
            ocr: ocrSkip,
            fail: fail,
            total: pickedTotal
          })
        );
        if (progress) progress.hidden = true;
        loadList();
        return;
      }
      var file = queue.shift();
      done += 1;
      if (progress) {
        progress.hidden = false;
        progress.textContent = tr('privateHub.ops.stickersUploading', {
          current: done,
          total: uploadTotal,
          name: file.name
        });
      }
      var fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('category', category);
      fetch(apiBase() + '/image/stickers/admin/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 409) {
            serverSkip += 1;
            existingSources.add(normFileName(file.name));
            return;
          }
          if (res.status === 422) {
            ocrSkip += 1;
            return;
          }
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          ok += 1;
          existingSources.add(normFileName(file.name));
        });
      }).catch(function () {
        fail += 1;
      }).then(next);
    }

    if (skipped && skippedNames.length) {
      setStatus(
        status,
        tr('privateHub.ops.stickersUploadSkippedPreflight', {
          skip: skipped,
          names: skippedNames.slice(0, 5).join(', ') + (skippedNames.length > 5 ? '…' : '')
        })
      );
    } else {
      setStatus(status, tr('privateHub.ops.stickersUploadStart', { total: uploadTotal }));
    }
    next();
  }

  function bindUi() {
    renderUploadChips();
    var uploadInput = document.getElementById('upload-input');
    if (uploadInput) {
      uploadInput.addEventListener('change', function () {
        if (uploadInput.files && uploadInput.files.length) {
          uploadFiles(uploadInput.files);
          uploadInput.value = '';
        }
      });
    }
    var refresh = document.getElementById('btn-refresh');
    if (refresh) refresh.addEventListener('click', loadList);
    var selectAll = document.getElementById('btn-select-all');
    if (selectAll) {
      selectAll.addEventListener('click', function () {
        pageItems.forEach(function (it) {
          if (it && it.id) selectedIds.add(it.id);
        });
        renderGrid();
      });
    }
    var clearSelect = document.getElementById('btn-clear-select');
    if (clearSelect) {
      clearSelect.addEventListener('click', function () {
        selectedIds = new Set();
        renderGrid();
      });
    }
    var batchBtn = document.getElementById('btn-batch-delete');
    if (batchBtn) batchBtn.addEventListener('click', batchDelete);
    var listSearch = document.getElementById('list-search');
    if (listSearch) {
      listSearch.placeholder = tr('hub.imagesPage.stickersSearchPlaceholder');
      listSearch.addEventListener('input', function () {
        var val = listSearch.value || '';
        if (val === filterSearch) return;
        filterSearch = val;
        listPage = 1;
        selectedIds = new Set();
        clearTimeout(filterSearchTimer);
        filterSearchTimer = setTimeout(function () { loadList(); }, 280);
      });
      listSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(filterSearchTimer);
          loadList();
        }
      });
    }
    loadList();
  }

  if (typeof window.initPrivateAdminPage === 'function') {
    window.initPrivateAdminPage(bindUi);
  } else {
    document.addEventListener('DOMContentLoaded', bindUi);
  }
})();
