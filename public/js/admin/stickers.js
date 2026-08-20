/**
 * Admin — sticker library bulk upload
 */
(function () {
  'use strict';

  var existingSources = new Set();

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

  function loadList() {
    var meta = document.getElementById('list-meta');
    var list = document.getElementById('sticker-list');
    if (!list) return Promise.resolve();
    list.innerHTML = '';
    setStatus(meta, tr('privateHub.ops.stickersLoading'));
    return fetch(apiBase() + '/image/stickers/admin/list?limit=500', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        existingSources = new Set();
        items.forEach(function (item) {
          if (item.source) existingSources.add(normFileName(item.source));
        });
        setStatus(meta, tr('privateHub.ops.stickersListMeta', { total: items.length }));
        if (!items.length) {
          list.innerHTML = '<p class="ladder-row-empty">' + escapeHtml(tr('privateHub.ops.stickersEmpty')) + '</p>';
          return;
        }
        items.forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'ladder-row ladder-row--media';
          var subParts = [];
          if (item.category) subParts.push(tr('privateHub.ops.stickersCategoryLabel') + ': ' + item.category);
          subParts.push(fmtBytes(item.bytes));
          if (item.createdAt) subParts.push(item.createdAt);
          var thumbSrc = '';
          if (item.thumbnailUrl) {
            thumbSrc = item.thumbnailUrl.indexOf('/pubsticker/') === 0
              ? item.thumbnailUrl
              : (apiBase() + (item.thumbnailUrl.charAt(0) === '/' ? item.thumbnailUrl : '/' + item.thumbnailUrl));
          } else if (item.imageUrl) {
            thumbSrc = apiBase() + (item.imageUrl.charAt(0) === '/' ? item.imageUrl : '/' + item.imageUrl);
          }
          row.innerHTML =
            '<div class="ladder-row-thumb-wrap">' +
              (thumbSrc
                ? '<img class="ladder-row-thumb" alt="" loading="lazy" decoding="async" src="' + escapeHtml(thumbSrc) + '" />'
                : '<div class="ladder-row-thumb ladder-row-thumb--empty"></div>') +
            '</div>' +
            '<div class="ladder-row-main">' +
              '<div class="ladder-row-title">' + escapeHtml(item.title || item.id) + '</div>' +
              subParts.map(function (line) {
                return '<div class="ladder-row-sub">' + escapeHtml(line) + '</div>';
              }).join('') +
              (item.source ? ('<div class="ladder-row-sub">' + escapeHtml(tr('privateHub.ops.stickersSource') + ': ' + item.source) + '</div>') : '') +
            '</div>' +
            '<div class="action-row ladder-row-actions">' +
              '<button type="button" class="tb-btn" data-del="' + escapeHtml(item.id) + '">' + escapeHtml(tr('privateHub.ops.stickersDelete')) + '</button>' +
            '</div>';
          var thumbImg = row.querySelector('.ladder-row-thumb');
          if (thumbImg && item.imageUrl) {
            thumbImg.addEventListener('error', function () {
              if (thumbImg.dataset.fallback) return;
              thumbImg.dataset.fallback = '1';
              thumbImg.src = apiBase() + (item.imageUrl.charAt(0) === '/' ? item.imageUrl : '/' + item.imageUrl);
            });
          }
          row.querySelector('[data-del]').addEventListener('click', function () {
            deleteItem(item);
          });
          list.appendChild(row);
        });
      })
      .catch(function (err) {
        setStatus(meta, (err && err.message) || tr('privateHub.ops.stickersLoadFailed'), true);
      });
  }

  function deleteItem(item) {
    if (!item || !item.id) return;
    if (!window.confirm(tr('privateHub.ops.stickersDeleteConfirm', { title: item.title || item.id }))) return;
    fetch(apiBase() + '/image/stickers/admin/' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: authHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    }).then(function () {
      loadList();
    }).catch(function (err) {
      alert((err && err.message) || tr('privateHub.ops.stickersDeleteFailed'));
    });
  }

  function uploadFiles(files) {
    var status = document.getElementById('upload-status');
    var progress = document.getElementById('upload-progress');
    var categoryInput = document.getElementById('upload-category');
    var category = categoryInput ? String(categoryInput.value || '').trim() : '';
    if (!files || !files.length) return;
    var picked = Array.prototype.slice.call(files);
    var skipped = 0;
    var skippedNames = [];
    var seen = new Set(existingSources);
    var queue = [];
    picked.forEach(function (file) {
      var key = normFileName(file.name);
      if (seen.has(key)) {
        skipped += 1;
        skippedNames.push(file.name);
        return;
      }
      seen.add(key);
      queue.push(file);
    });
    if (!queue.length) {
      setStatus(status, tr('privateHub.ops.stickersUploadSkipAll', { skip: skipped }));
      if (progress) progress.hidden = true;
      return;
    }
    var total = queue.length;
    var done = 0;
    var ok = 0;
    var fail = 0;
    var serverSkip = 0;

    function next() {
      if (!queue.length) {
        setStatus(
          status,
          tr('privateHub.ops.stickersUploadDone', {
            ok: ok,
            skip: skipped + serverSkip,
            fail: fail,
            total: total
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
          total: total,
          name: file.name
        });
      }
      var fd = new FormData();
      fd.append('file', file, file.name);
      if (category) fd.append('category', category);
      fetch(apiBase() + '/image/stickers/admin/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 409) {
            serverSkip += 1;
            existingSources.add(normFileName(file.name));
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
      setStatus(status, tr('privateHub.ops.stickersUploadStart', { total: total }));
    }
    next();
  }

  function bindUi() {
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
    loadList();
  }

  if (typeof window.initPrivateAdminPage === 'function') {
    window.initPrivateAdminPage(bindUi);
  } else {
    document.addEventListener('DOMContentLoaded', bindUi);
  }
})();
