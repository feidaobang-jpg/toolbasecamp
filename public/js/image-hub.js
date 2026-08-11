/**
 * Public images hub — grid of user-published AI images (text-to-image / instruct-edit).
 */
(function () {
  'use strict';

  var canAdmin = false;
  var listCache = null;

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

  function sourceLabel(source) {
    if (source === 'text_to_image') return tr('hub.imagesPage.sourceT2i');
    if (source === 'instruct_edit') return tr('hub.imagesPage.sourceInstruct');
    return source || '';
  }

  function downloadItem(item) {
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
        var box = document.getElementById('img-hub-error');
        if (box) {
          box.hidden = false;
          box.textContent = (err && err.message) || tr('hub.imagesPage.loadFailed');
        }
      });
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
        loadList();
      })
      .catch(function () {
        var box = document.getElementById('img-hub-error');
        if (box) {
          box.hidden = false;
          box.textContent = tr('hub.imagesPage.deleteFailed');
        }
      });
  }

  function renderGrid(items) {
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
      var src = fullImageUrl(item.imageUrl);
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
      // Runtime hardening: enforce cover behavior even if stale CSS is cached.
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
      dl.addEventListener('click', function () { downloadItem(item); });
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

  function loadList() {
    var box = document.getElementById('img-hub-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('img-hub-busy');
    if (busy) busy.hidden = false;
    fetch(apiBase() + '/image/public/list?limit=60', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        canAdmin = !!(data && data.canAdmin);
        listCache = (data && data.items) || [];
        renderGrid(listCache);
      })
      .catch(function (err) {
        if (box) {
          box.hidden = false;
          box.textContent = (err && err.message) || tr('hub.imagesPage.loadFailed');
        }
        if (!listCache) renderGrid([]);
      })
      .then(function () {
        if (busy) busy.hidden = true;
      });
  }

  window.renderImageHub = function () {
    var main = document.getElementById('main-content');
    if (!main) return;
    listCache = null;
    canAdmin = false;
    main.innerHTML =
      '<div class="img-hub">' +
        '<div class="img-hub-head">' +
          '<h2 class="img-hub-title">' + escapeHtml(tr('hub.imagesPage.title')) + '</h2>' +
          '<p class="img-hub-sub">' + escapeHtml(tr('hub.imagesPage.sub')) + '</p>' +
          '<div class="action-row" style="margin:12px 0 8px">' +
            '<a class="tb-btn" href="html/media/text-to-image.html">' + escapeHtml(tr('hub.imagesPage.createT2i')) + '</a>' +
            '<a class="tb-btn" href="html/media/instruct-edit.html">' + escapeHtml(tr('hub.imagesPage.createInstruct')) + '</a>' +
            '<button type="button" class="tb-btn" id="img-hub-refresh">' + escapeHtml(tr('hub.imagesPage.refresh')) + '</button>' +
          '</div>' +
        '</div>' +
        '<p class="img-hub-tip">' + escapeHtml(tr('hub.imagesPage.tip')) + '</p>' +
        '<div class="error-box" id="img-hub-error" hidden></div>' +
        '<p class="img-hub-busy" id="img-hub-busy">' + escapeHtml(tr('hub.imagesPage.loading')) + '</p>' +
        '<p class="img-hub-empty" id="img-hub-empty" hidden></p>' +
        '<div class="img-hub-grid" id="img-hub-grid"></div>' +
      '</div>';
    var refresh = document.getElementById('img-hub-refresh');
    if (refresh) refresh.addEventListener('click', function () { loadList(); });
    loadList();
  };
})();
