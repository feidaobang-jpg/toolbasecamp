/**
 * Public images hub — AI generated images + admin-uploaded stickers.
 */
(function () {
  'use strict';

  var canAdmin = false;
  var activeTab = 'stickers';
  var listCache = { ai: null, stickers: null };
  var stickerCategory = '';
  var mediaKind = 'all'; // all | still | gif
  var PAGE_SIZE = 20;
  var pageState = { ai: 1, stickers: 1 };
  var totalState = { ai: 0, stickers: 0 };

  function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function apiBase() {
    var base = (typeof siteConfig !== 'undefined' && siteConfig.apiBase)
      ? String(siteConfig.apiBase)
      : '/api';
    return base.replace(/\/$/, '');
  }

  function authHeaders() {
    var h = {};
    try {
      var tok = localStorage.getItem('auth_token') || '';
      if (tok) h.Authorization = 'Bearer ' + tok;
    } catch (e) {}
    return h;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isWeChat() {
    return typeof tbIsWeChat === 'function' ? tbIsWeChat() : /MicroMessenger/i.test(navigator.userAgent || '');
  }

  function fullImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function gridImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('/pubimg/') === 0) return path;
    if (path.indexOf('/pubsticker/') === 0) return path;
    return fullImageUrl(path);
  }

  function sourceLabel(source) {
    if (source === 'text_to_image') return tr('hub.imagesPage.sourceT2i');
    if (source === 'instruct_edit') return tr('hub.imagesPage.sourceInstruct');
    return source || '';
  }

  function isAnimated(item) {
    if (!item) return false;
    if (item.animated === true) return true;
    var ctype = String(item.contentType || '').toLowerCase();
    if (ctype.indexOf('gif') >= 0) return true;
    var u = String(item.staticUrl || item.imageUrl || item.thumbnailUrl || '');
    return /\.gif(\?|$)/i.test(u);
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
    // Fallback if shared helper missing.
    if (playSrc) img.src = playSrc;
    else if (thumbSrc) img.src = thumbSrc;
  }

  function playSrcFor(item) {
    if (!item) return '';
    if (item.staticUrl) return gridImageUrl(item.staticUrl);
    return fullImageUrl(item.imageUrl);
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n <= 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function downloadAiItem(item) {
    var id = item.id;
    var name = 'ai-image-' + id + '.png';
    var ctype = item.contentType || 'image/png';
    if (ctype.indexOf('gif') >= 0 || isAnimated(item)) name = 'ai-image-' + id + '.gif';
    else if (ctype.indexOf('jpeg') >= 0 || ctype.indexOf('jpg') >= 0) name = 'ai-image-' + id + '.jpg';
    else if (ctype.indexOf('webp') >= 0) name = 'ai-image-' + id + '.webp';

    if (isWeChat()) {
      if (typeof tbNotify === 'function') {
        tbNotify(tr('common.wechatDownloadTip') || tr('hub.imagesPage.wechatSaveTip'));
      }
      return;
    }

    var url = fullImageUrl(item.downloadUrl || item.imageUrl);
    fetch(url, { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error(res.statusText || 'download failed');
        return res.blob();
      })
      .then(function (blob) {
        if (typeof tbTriggerDownload === 'function') {
          tbTriggerDownload(blob, name);
          return;
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      })
      .catch(function (err) {
        showError((err && err.message) || tr('hub.imagesPage.loadFailed'));
      });
  }

  function downloadStickerItem(item) {
    var id = item.id;
    var ext = '.png';
    var ctype = item.contentType || 'image/png';
    if (ctype.indexOf('jpeg') >= 0 || ctype.indexOf('jpg') >= 0) ext = '.jpg';
    else if (ctype.indexOf('gif') >= 0) ext = '.gif';
    else if (ctype.indexOf('webp') >= 0) ext = '.webp';
    var name = 'sticker-' + id + ext;

    if (isWeChat()) {
      if (typeof tbNotify === 'function') {
        tbNotify(tr('hub.imagesPage.stickersWechatTip') || tr('common.wechatDownloadTip'));
      }
      return;
    }

    var url = fullImageUrl(item.downloadUrl || item.imageUrl);
    fetch(url, { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error(res.statusText || 'download failed');
        return res.blob();
      })
      .then(function (blob) {
        if (typeof tbTriggerDownload === 'function') {
          tbTriggerDownload(blob, name);
          return;
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      })
      .catch(function (err) {
        showError((err && err.message) || tr('hub.imagesPage.loadFailed'));
      });
  }

  function showError(msg) {
    var box = document.getElementById('img-hub-error');
    if (box) {
      box.hidden = false;
      box.textContent = msg || '';
    }
  }

  function deleteItem(item) {
    if (!canAdmin || !item || !item.id) return;
    if (!window.confirm(tr('hub.imagesPage.deleteConfirm'))) return;
    fetch(apiBase() + '/image/public/' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: authHeaders()
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function () {
        loadAiList();
      })
      .catch(function () {
        showError(tr('hub.imagesPage.deleteFailed'));
      });
  }

  function renderAiGrid(items) {
    var grid = document.getElementById('img-hub-grid');
    var empty = document.getElementById('img-hub-empty');
    if (!grid) return;
    disconnectGifObserver();
    grid.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = tr('hub.imagesPage.empty');
      }
      renderPagerFor('ai');
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'img-hub-card';
      var animated = isAnimated(item);
      var thumbSrc = gridImageUrl(item.thumbnailUrl || item.imageUrl);
      var playSrc = playSrcFor(item);
      card.innerHTML =
        '<div class="img-hub-thumb-wrap">' +
          '<img class="img-hub-thumb" alt="" loading="lazy" decoding="async" />' +
          (animated ? '<span class="img-hub-gif-badge" aria-hidden="true">GIF</span>' : '') +
        '</div>' +
        '<div class="img-hub-body">' +
          '<div class="img-hub-prompt"></div>' +
          '<div class="img-hub-creator"></div>' +
          '<div class="img-hub-meta"></div>' +
          '<div class="action-row"></div>' +
        '</div>';
      var img = card.querySelector('.img-hub-thumb');
      img.style.position = 'absolute';
      img.style.inset = '0';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.objectPosition = 'center center';
      img.style.display = 'block';
      img.src = thumbSrc;
      img.alt = (item.prompt || tr('hub.imagesPage.untitled')).slice(0, 80);
      if (animated) bindGifViewport(img, thumbSrc, playSrc);
      var promptEl = card.querySelector('.img-hub-prompt');
      promptEl.textContent = (item.prompt || '').trim() || tr('hub.imagesPage.untitled');
      var nick = (item.creatorNickname || '').trim();
      var phone = (item.creatorPhone || '').trim();
      card.querySelector('.img-hub-creator').textContent =
        tr('hub.imagesPage.creatorLabel') + ': ' +
        (nick || '—') +
        (phone && phone !== '—' ? (' · ' + phone) : '');
      var metaParts = [];
      var srcLab = sourceLabel(item.source);
      if (srcLab) metaParts.push(srcLab);
      if (item.model) metaParts.push(item.model);
      var sizeLab = fmtBytes(item.bytes);
      if (sizeLab) metaParts.push(sizeLab);
      if (item.createdAt) metaParts.push(item.createdAt);
      card.querySelector('.img-hub-meta').textContent = metaParts.join(' · ');
      var actions = card.querySelector('.action-row');
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () {
        openHubPreview(item, {
          alt: (item.prompt || '').trim() || tr('hub.imagesPage.untitled'),
          onDownload: function () { downloadAiItem(item); }
        });
      });
      var dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'tb-btn';
      dl.textContent = tr('hub.imagesPage.download');
      dl.addEventListener('click', function () { downloadAiItem(item); });
      actions.appendChild(dl);
      if (canAdmin) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb-btn';
        del.textContent = tr('hub.imagesPage.delete');
        del.addEventListener('click', function () { deleteItem(item); });
        actions.appendChild(del);
      }
      grid.appendChild(card);
    });
    renderPagerFor('ai');
  }

  function renderPagerFor(tab) {
    var el = document.getElementById('img-hub-pager');
    if (!el || typeof tbRenderPager !== 'function') return;
    tbRenderPager(el, {
      page: pageState[tab] || 1,
      pageSize: PAGE_SIZE,
      total: totalState[tab] || 0,
      onChange: function (p) {
        pageState[tab] = p;
        if (tab === 'ai') loadAiList();
        else loadStickerList();
      }
    });
  }

  function renderStickerCategories(categories) {
    var wrap = document.getElementById('img-hub-sticker-cats');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!categories || !categories.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'img-hub-cat-chip' + (stickerCategory ? '' : ' active');
    allBtn.textContent = tr('hub.imagesPage.stickersAll');
    allBtn.addEventListener('click', function () {
      stickerCategory = '';
      pageState.stickers = 1;
      loadStickerList();
      document.querySelectorAll('.img-hub-cat-chip').forEach(function (btn) {
        btn.classList.toggle('active', btn === allBtn);
      });
    });
    wrap.appendChild(allBtn);
    categories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-hub-cat-chip' + (stickerCategory === cat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        stickerCategory = cat;
        pageState.stickers = 1;
        loadStickerList();
        document.querySelectorAll('.img-hub-cat-chip').forEach(function (el) {
          el.classList.toggle('active', el === btn);
        });
      });
      wrap.appendChild(btn);
    });
  }

  function renderStickerGrid(items, categories) {
    var grid = document.getElementById('img-hub-grid');
    var empty = document.getElementById('img-hub-empty');
    if (!grid) return;
    disconnectGifObserver();
    renderStickerCategories(categories);
    syncKindChips();
    grid.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = mediaKind === 'all'
          ? tr('hub.imagesPage.stickersEmpty')
          : tr('hub.imagesPage.filterEmpty');
      }
      renderPagerFor('stickers');
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'img-hub-card img-hub-card--sticker';
      var animated = isAnimated(item);
      var thumbSrc = gridImageUrl(item.thumbnailUrl || item.imageUrl);
      var playSrc = playSrcFor(item);
      var title = displayStickerTitle(item);
      card.innerHTML =
        '<div class="img-hub-thumb-wrap img-hub-thumb-wrap--sticker">' +
          '<img class="img-hub-thumb img-hub-sticker-img" alt="" loading="lazy" decoding="async" />' +
          (animated ? '<span class="img-hub-gif-badge" aria-hidden="true">GIF</span>' : '') +
        '</div>' +
        '<div class="img-hub-body">' +
          '<div class="img-hub-prompt img-hub-sticker-title"></div>' +
          '<div class="img-hub-meta img-hub-sticker-cat" hidden></div>' +
          '<div class="action-row"></div>' +
        '</div>';
      var img = card.querySelector('.img-hub-sticker-img');
      img.src = thumbSrc || playSrc;
      img.alt = title.slice(0, 80);
      if (animated) bindGifViewport(img, thumbSrc || playSrc, playSrc);
      var titleEl = card.querySelector('.img-hub-sticker-title');
      if (title) {
        titleEl.textContent = title;
      } else {
        titleEl.hidden = true;
        titleEl.style.display = 'none';
      }
      var catEl = card.querySelector('.img-hub-sticker-cat');
      var metaParts = [];
      if (item.category) metaParts.push(item.category);
      var sizeLab = fmtBytes(item.bytes);
      if (sizeLab) metaParts.push(sizeLab);
      if (metaParts.length) {
        catEl.hidden = false;
        catEl.textContent = metaParts.join(' · ');
      }
      var openPreview = function () {
        openHubPreview(item, {
          alt: displayStickerTitle(item) || tr('hub.imagesPage.stickersUntitled'),
          onDownload: function () { downloadStickerItem(item); }
        });
      };
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', openPreview);
      var actions = card.querySelector('.action-row');
      var dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'tb-btn';
      dl.textContent = tr('hub.imagesPage.download');
      dl.addEventListener('click', function () { downloadStickerItem(item); });
      actions.appendChild(dl);
      grid.appendChild(card);
    });
    renderPagerFor('stickers');
  }

  function displayStickerTitle(item) {
    var title = String((item && item.title) || '').trim();
    if (!title) return '';
    // Hash / CDN / Weibo-style file ids — not useful as a display name
    if (/^[a-f0-9]{28,64}$/i.test(title)) return '';
    if (/^[a-z0-9_-]{20,}$/i.test(title) && !/[\u4e00-\u9fff]/.test(title)) return '';
    return title;
  }

  function openHubPreview(item, opts) {
    if (!item) return;
    opts = opts || {};
    var fullSrc = playSrcFor(item) || fullImageUrl(item.imageUrl);
    var existing = document.getElementById('img-hub-preview');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'img-hub-preview';
    overlay.className = 'img-hub-preview';
    overlay.innerHTML =
      '<div class="img-hub-preview-panel">' +
        '<p class="img-hub-preview-tip"></p>' +
        '<img class="img-hub-preview-img" alt="" />' +
        '<div class="action-row img-hub-preview-actions">' +
          '<button type="button" class="tb-btn" data-preview-dl></button>' +
          '<button type="button" class="tb-btn" data-preview-close></button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.img-hub-preview-tip').textContent = tr('hub.imagesPage.stickersLongPress');
    var img = overlay.querySelector('.img-hub-preview-img');
    img.src = fullSrc;
    img.alt = opts.alt || tr('hub.imagesPage.untitled');
    var dlBtn = overlay.querySelector('[data-preview-dl]');
    dlBtn.textContent = tr('hub.imagesPage.download');
    dlBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof opts.onDownload === 'function') opts.onDownload();
    });
    var closeBtn = overlay.querySelector('[data-preview-close]');
    closeBtn.textContent = tr('hub.imagesPage.closePreview');
    function close() { overlay.remove(); }
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      close();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
  }

  function syncKindChips() {
    var row = document.getElementById('img-hub-kind');
    if (!row) return;
    row.hidden = activeTab !== 'stickers';
    row.querySelectorAll('[data-img-kind]').forEach(function (btn) {
      var on = btn.getAttribute('data-img-kind') === mediaKind;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function setMediaKind(kind) {
    if (kind !== 'all' && kind !== 'still' && kind !== 'gif') kind = 'all';
    if (kind === mediaKind) return;
    mediaKind = kind;
    pageState.stickers = 1;
    listCache.stickers = null;
    syncKindChips();
    loadStickerList();
  }

  function updateTabUi() {
    document.querySelectorAll('[data-img-tab]').forEach(function (btn) {
      var tab = btn.getAttribute('data-img-tab');
      btn.classList.toggle('active', tab === activeTab);
      btn.setAttribute('aria-selected', tab === activeTab ? 'true' : 'false');
    });
    var sub = document.getElementById('img-hub-sub');
    if (sub) {
      sub.textContent = activeTab === 'stickers'
        ? tr('hub.imagesPage.stickersSub')
        : tr('hub.imagesPage.aiSub');
    }
    var tip = document.getElementById('img-hub-tip');
    if (tip) {
      tip.textContent = activeTab === 'stickers'
        ? tr('hub.imagesPage.stickersTip')
        : tr('hub.imagesPage.tip');
    }
    var aiActions = document.getElementById('img-hub-ai-actions');
    if (aiActions) aiActions.hidden = activeTab !== 'ai';
    var cats = document.getElementById('img-hub-sticker-cats');
    if (cats && activeTab !== 'stickers') cats.hidden = true;
    syncKindChips();
  }

  function showActiveList() {
    if (activeTab === 'stickers') {
      var data = listCache.stickers || { items: [], categories: [] };
      renderStickerGrid(data.items, data.categories);
    } else {
      renderAiGrid(listCache.ai || []);
    }
  }

  function switchTab(tab) {
    if (tab !== 'ai' && tab !== 'stickers') return;
    if (tab === activeTab) return;
    activeTab = tab;
    updateTabUi();
    if (activeTab === 'ai' && listCache.ai) {
      showActiveList();
      var busy = document.getElementById('img-hub-busy');
      if (busy) busy.hidden = true;
    } else if (activeTab === 'stickers' && listCache.stickers) {
      showActiveList();
      var busy2 = document.getElementById('img-hub-busy');
      if (busy2) busy2.hidden = true;
    }
    if (activeTab === 'ai') loadAiList({ background: !!listCache.ai });
    else loadStickerList({ background: !!listCache.stickers });
  }

  function loadAiList(opts) {
    opts = opts || {};
    var box = document.getElementById('img-hub-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('img-hub-busy');
    if (busy && activeTab === 'ai' && !opts.background) busy.hidden = false;
    var page = pageState.ai || 1;
    var offset = (page - 1) * PAGE_SIZE;
    fetch(apiBase() + '/image/public/list?limit=' + PAGE_SIZE + '&offset=' + offset, { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        canAdmin = !!(data && data.canAdmin);
        listCache.ai = (data && data.items) || [];
        totalState.ai = Number(data && data.total) || listCache.ai.length;
        if (typeof tbNormalizePage === 'function') {
          pageState.ai = tbNormalizePage(pageState.ai, totalState.ai, PAGE_SIZE);
        }
        if (activeTab === 'ai') renderAiGrid(listCache.ai);
      })
      .catch(function (err) {
        if (activeTab === 'ai') {
          showError((err && err.message) || tr('hub.imagesPage.loadFailed'));
          if (!listCache.ai) renderAiGrid([]);
        }
      })
      .then(function () {
        if (busy && activeTab === 'ai') busy.hidden = true;
      });
  }

  function loadStickerList(opts) {
    opts = opts || {};
    var box = document.getElementById('img-hub-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('img-hub-busy');
    if (busy && activeTab === 'stickers' && !opts.background) busy.hidden = false;
    var page = pageState.stickers || 1;
    var offset = (page - 1) * PAGE_SIZE;
    var url = apiBase() + '/image/stickers/list?limit=' + PAGE_SIZE + '&offset=' + offset;
    if (stickerCategory) url += '&category=' + encodeURIComponent(stickerCategory);
    if (mediaKind === 'gif' || mediaKind === 'still') url += '&kind=' + encodeURIComponent(mediaKind);
    fetch(url, { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        listCache.stickers = {
          items: (data && data.items) || [],
          categories: (data && data.categories) || []
        };
        totalState.stickers = Number(data && data.total) || listCache.stickers.items.length;
        if (typeof tbNormalizePage === 'function') {
          pageState.stickers = tbNormalizePage(pageState.stickers, totalState.stickers, PAGE_SIZE);
        }
        if (activeTab === 'stickers') {
          renderStickerGrid(listCache.stickers.items, listCache.stickers.categories);
        }
      })
      .catch(function (err) {
        if (activeTab === 'stickers') {
          showError((err && err.message) || tr('hub.imagesPage.loadFailed'));
          if (!listCache.stickers) renderStickerGrid([], []);
        }
      })
      .then(function () {
        if (busy && activeTab === 'stickers') busy.hidden = true;
      });
  }

  window.renderImageHub = function () {
    var main = document.getElementById('main-content');
    if (!main) return;
    activeTab = 'stickers';
    stickerCategory = '';
    mediaKind = 'all';
    listCache = { ai: null, stickers: null };
    pageState = { ai: 1, stickers: 1 };
    totalState = { ai: 0, stickers: 0 };
    canAdmin = false;
    disconnectGifObserver();
    main.innerHTML =
      '<div class="img-hub">' +
        '<div class="img-hub-head">' +
          '<h2 class="img-hub-title">' + escapeHtml(tr('hub.imagesPage.title')) + '</h2>' +
          '<p class="img-hub-sub" id="img-hub-sub"></p>' +
          '<div class="tb-tabs tb-tabs--underline img-hub-tabs" role="tablist">' +
            '<button type="button" class="tb-tab active" data-img-tab="stickers" role="tab" aria-selected="true">' +
              escapeHtml(tr('hub.imagesPage.tabStickers')) +
            '</button>' +
            '<button type="button" class="tb-tab" data-img-tab="ai" role="tab" aria-selected="false">' +
              escapeHtml(tr('hub.imagesPage.tabAi')) +
            '</button>' +
          '</div>' +
          '<div class="action-row" id="img-hub-ai-actions" style="margin:12px 0 8px" hidden>' +
            '<a class="tb-btn" href="html/media/text-to-image.html">' + escapeHtml(tr('hub.imagesPage.createT2i')) + '</a>' +
            '<a class="tb-btn" href="html/media/instruct-edit.html">' + escapeHtml(tr('hub.imagesPage.createInstruct')) + '</a>' +
          '</div>' +
          '<div class="action-row" style="margin:0 0 8px">' +
            '<button type="button" class="tb-btn" id="img-hub-refresh">' + escapeHtml(tr('hub.imagesPage.refresh')) + '</button>' +
          '</div>' +
        '</div>' +
        '<p class="img-hub-tip" id="img-hub-tip"></p>' +
        '<div class="img-hub-kind" id="img-hub-kind" role="tablist">' +
          '<button type="button" class="img-hub-chip is-active" data-img-kind="all" role="tab" aria-selected="true">' +
            escapeHtml(tr('hub.imagesPage.filterAll')) +
          '</button>' +
          '<button type="button" class="img-hub-chip" data-img-kind="still" role="tab" aria-selected="false">' +
            escapeHtml(tr('hub.imagesPage.filterStill')) +
          '</button>' +
          '<button type="button" class="img-hub-chip" data-img-kind="gif" role="tab" aria-selected="false">' +
            escapeHtml(tr('hub.imagesPage.filterGif')) +
          '</button>' +
        '</div>' +
        '<div class="img-hub-cats" id="img-hub-sticker-cats" hidden></div>' +
        '<div class="error-box" id="img-hub-error" hidden></div>' +
        '<p class="img-hub-busy" id="img-hub-busy">' + escapeHtml(tr('hub.imagesPage.loading')) + '</p>' +
        '<p class="img-hub-empty" id="img-hub-empty" hidden></p>' +
        '<div class="img-hub-grid" id="img-hub-grid"></div>' +
        '<div class="tb-pager" id="img-hub-pager" hidden></div>' +
      '</div>';
    document.querySelectorAll('[data-img-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-img-tab'));
      });
    });
    var kindRow = document.getElementById('img-hub-kind');
    if (kindRow) {
      kindRow.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-img-kind]') : null;
        if (!btn) return;
        setMediaKind(btn.getAttribute('data-img-kind'));
      });
    }
    var refresh = document.getElementById('img-hub-refresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        if (activeTab === 'ai') {
          listCache.ai = null;
          pageState.ai = 1;
          loadAiList();
        } else {
          listCache.stickers = null;
          pageState.stickers = 1;
          loadStickerList();
        }
      });
    }
    updateTabUi();
    loadStickerList();
    loadAiList({ background: true });
  };
})();
