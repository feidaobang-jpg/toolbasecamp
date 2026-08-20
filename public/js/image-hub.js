/**
 * Public images hub — AI generated images + admin-uploaded stickers.
 */
(function () {
  'use strict';

  var canAdmin = false;
  var activeTab = 'stickers';
  var listCache = { ai: null, stickers: null };
  var stickerCategory = '';

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

  function downloadAiItem(item) {
    var id = item.id;
    var name = 'ai-image-' + id + '.png';
    var ctype = item.contentType || 'image/png';
    if (ctype.indexOf('jpeg') >= 0 || ctype.indexOf('jpg') >= 0) name = 'ai-image-' + id + '.jpg';
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
    grid.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = tr('hub.imagesPage.empty');
      }
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'img-hub-card';
      var src = gridImageUrl(item.thumbnailUrl || item.imageUrl);
      card.innerHTML =
        '<div class="img-hub-thumb-wrap">' +
          '<img class="img-hub-thumb" alt="" loading="lazy" decoding="async" />' +
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
      img.src = src;
      img.alt = (item.prompt || tr('hub.imagesPage.untitled')).slice(0, 80);
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
      if (item.createdAt) metaParts.push(item.createdAt);
      card.querySelector('.img-hub-meta').textContent = metaParts.join(' · ');
      var actions = card.querySelector('.action-row');
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
    renderStickerCategories(categories);
    grid.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = tr('hub.imagesPage.stickersEmpty');
      }
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'img-hub-card img-hub-card--sticker';
      var thumbSrc = gridImageUrl(item.thumbnailUrl || item.imageUrl);
      var fullSrc = fullImageUrl(item.imageUrl);
      card.innerHTML =
        '<div class="img-hub-thumb-wrap img-hub-thumb-wrap--sticker">' +
          '<img class="img-hub-thumb img-hub-sticker-img" alt="" loading="lazy" decoding="async" />' +
        '</div>' +
        '<div class="img-hub-body">' +
          '<div class="img-hub-prompt img-hub-sticker-title"></div>' +
          '<div class="img-hub-meta img-hub-sticker-cat" hidden></div>' +
          '<p class="img-hub-sticker-hint"></p>' +
          '<div class="action-row"></div>' +
        '</div>';
      var img = card.querySelector('.img-hub-sticker-img');
      img.src = fullSrc;
      img.alt = (item.title || tr('hub.imagesPage.stickersUntitled')).slice(0, 80);
      img.setAttribute('data-full-src', fullSrc);
      card.querySelector('.img-hub-sticker-title').textContent =
        (item.title || '').trim() || tr('hub.imagesPage.stickersUntitled');
      var catEl = card.querySelector('.img-hub-sticker-cat');
      if (item.category) {
        catEl.hidden = false;
        catEl.textContent = item.category;
      }
      card.querySelector('.img-hub-sticker-hint').textContent = tr('hub.imagesPage.stickersLongPress');
      var actions = card.querySelector('.action-row');
      var dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'tb-btn';
      dl.textContent = tr('hub.imagesPage.download');
      dl.addEventListener('click', function () { downloadStickerItem(item); });
      actions.appendChild(dl);
      grid.appendChild(card);
    });
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
    fetch(apiBase() + '/image/public/list?limit=60', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        canAdmin = !!(data && data.canAdmin);
        listCache.ai = (data && data.items) || [];
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
    var url = apiBase() + '/image/stickers/list?limit=200';
    if (stickerCategory) url += '&category=' + encodeURIComponent(stickerCategory);
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
    listCache = { ai: null, stickers: null };
    canAdmin = false;
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
        '<div class="img-hub-cats" id="img-hub-sticker-cats" hidden></div>' +
        '<div class="error-box" id="img-hub-error" hidden></div>' +
        '<p class="img-hub-busy" id="img-hub-busy">' + escapeHtml(tr('hub.imagesPage.loading')) + '</p>' +
        '<p class="img-hub-empty" id="img-hub-empty" hidden></p>' +
        '<div class="img-hub-grid" id="img-hub-grid"></div>' +
      '</div>';
    document.querySelectorAll('[data-img-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-img-tab'));
      });
    });
    var refresh = document.getElementById('img-hub-refresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        if (activeTab === 'ai') {
          listCache.ai = null;
          loadAiList();
        } else {
          listCache.stickers = null;
          loadStickerList();
        }
      });
    }
    updateTabUi();
    loadStickerList();
    loadAiList({ background: true });
  };
})();
