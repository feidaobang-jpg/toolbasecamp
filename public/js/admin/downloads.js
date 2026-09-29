/**
 * 后台 — 软件下载管理（admin/private/downloads.html）
 * 功能：新增（分片上传文件 或 网盘外链）、编辑、上架/下架、删除、下载量查看、封面图。
 */
(function () {
  'use strict';

  var CHUNK_FALLBACK = 8 * 1024 * 1024;
  var editingId = null;
  var pickedFile = null;
  var pickedCover = null;     // 待上传封面（已压缩），提交成功后再传
  var coverPreviewUrl = '';   // object URL，换图/重置时 revoke
  var removeCover = false;    // 编辑态点了「移除封面」，提交时调 DELETE
  var uploading = false;

  var CATS = ['自研软件', '办公效率', '开发工具', '媒体工具', '系统工具', '其他'];

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) {
      return String(siteConfig.apiBase).replace(/\/$/, '');
    }
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

  function jsonHeaders() {
    return authHeaders({ 'Content-Type': 'application/json' });
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

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isErr);
    el.hidden = !msg;
  }

  function $(id) {
    return document.getElementById(id);
  }

  // ----------------------------------------------------------------- cover

  function revokeCoverPreview() {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = '';
    }
  }

  function showCoverPreview(src) {
    var img = $('cover-preview');
    var btn = $('btn-cover-remove');
    if (!img) return;
    if (src) {
      img.src = src;
      img.classList.remove('hidden');
      if (btn) btn.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      if (btn) btn.classList.add('hidden');
    }
  }

  function clearCoverPick() {
    pickedCover = null;
    removeCover = false;
    revokeCoverPreview();
    var input = $('f-cover');
    if (input) input.value = '';
    var label = $('cover-label');
    if (label) label.textContent = tr('privateHub.ops.downloadsPickCover');
  }

  async function onCoverPicked(file) {
    var status = $('form-status');
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
      setStatus(status, tr('privateHub.ops.downloadsCoverErrType'), true);
      return;
    }
    var prepared = file;
    var compress = window.TBImageUploadCompress;
    if (compress && typeof compress.compressIfNeeded === 'function') {
      setStatus(status, tr('privateHub.ops.downloadsCoverCompressing'));
      try {
        prepared = await compress.compressIfNeeded(file, 'default');
      } catch (err) {
        prepared = file;  // 压缩失败不拦上传，用原图继续
      }
    }
    setStatus(status, '');
    pickedCover = prepared;
    removeCover = false;
    revokeCoverPreview();
    coverPreviewUrl = URL.createObjectURL(prepared);
    showCoverPreview(coverPreviewUrl);
    var label = $('cover-label');
    if (label) {
      label.textContent = String(prepared.name || file.name || 'cover') +
        ' · ' + fmtBytes(prepared.size);
    }
  }

  async function applyCover(itemId) {
    if (pickedCover) {
      var fd = new FormData();
      fd.append('file', pickedCover, pickedCover.name || 'cover.jpg');
      var res = await fetch(apiBase() + '/downloads/admin/' + itemId + '/cover', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
      return tr('privateHub.ops.downloadsCoverUploaded');
    }
    if (removeCover) {
      var res2 = await fetch(apiBase() + '/downloads/admin/' + itemId + '/cover', {
        method: 'DELETE',
        headers: authHeaders()
      });
      var data2 = await res2.json().catch(function () { return {}; });
      if (!res2.ok) throw new Error(data2.detail || 'HTTP ' + res2.status);
      return tr('privateHub.ops.downloadsCoverRemoved');
    }
    return '';
  }

  // ------------------------------------------------------------------ form

  function resetForm() {
    editingId = null;
    pickedFile = null;
    ['f-title', 'f-version', 'f-category', 'f-desc', 'f-url'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    var sort = $('f-sort');
    if (sort) sort.value = '0';
    var status = $('f-status');
    if (status) status.value = 'published';
    var file = $('f-file');
    if (file) file.value = '';
    var fl = $('file-label');
    if (fl) fl.textContent = tr('privateHub.ops.downloadsPickFile');
    var fm = $('file-meta');
    if (fm) setStatus(fm, '');
    clearCoverPick();
    showCoverPreview('');
    var title = $('form-title');
    if (title) title.textContent = tr('privateHub.ops.downloadsNewTitle');
    var submit = $('btn-submit');
    if (submit) submit.textContent = tr('privateHub.ops.downloadsSubmitNew');
    var cancel = $('btn-cancel-edit');
    if (cancel) cancel.classList.add('hidden');
  }

  function fillForm(item) {
    editingId = item.id;
    pickedFile = null;
    $('f-title').value = item.title || '';
    $('f-version').value = item.version || '';
    $('f-category').value = item.category || '';
    $('f-desc').value = item.description || '';
    $('f-url').value = item.sourceUrl || '';
    $('f-sort').value = String(item.sortOrder || 0);
    $('f-status').value = item.status || 'published';
    var file = $('f-file');
    if (file) file.value = '';
    var fm = $('file-meta');
    if (fm) {
      if (item.fileName) {
        setStatus(fm, tr('privateHub.ops.downloadsCurrentFile', {
          name: item.origName || item.fileName,
          size: fmtBytes(item.fileSize) || '-'
        }));
      } else {
        setStatus(fm, '');
      }
    }
    clearCoverPick();
    showCoverPreview(item.coverUrl ? apiBase() + item.coverUrl : '');
    $('form-title').textContent = tr('privateHub.ops.downloadsEditTitle', { id: item.id });
    $('btn-submit').textContent = tr('privateHub.ops.downloadsSubmitEdit');
    $('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formMeta() {
    return {
      title: ($('f-title').value || '').trim(),
      version: ($('f-version').value || '').trim(),
      category: ($('f-category').value || '').trim(),
      description: ($('f-desc').value || '').trim(),
      source_url: ($('f-url').value || '').trim(),
      sort_order: parseInt($('f-sort').value, 10) || 0,
      status: $('f-status').value || 'published'
    };
  }

  // ---------------------------------------------------------------- upload

  function progressEl() {
    return $('upload-progress');
  }

  async function chunkedUpload(file, meta) {
    var status = $('form-status');
    var progress = progressEl();
    setStatus(status, tr('privateHub.ops.downloadsUploadingInit'));

    var initRes = await fetch(apiBase() + '/downloads/admin/upload/init', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ fileName: file.name, totalSize: file.size })
    });
    var initData = await initRes.json().catch(function () { return {}; });
    if (!initRes.ok) throw new Error(initData.detail || 'HTTP ' + initRes.status);

    var uploadId = initData.uploadId;
    var chunkSize = initData.chunkSize || CHUNK_FALLBACK;
    var totalChunks = initData.totalChunks ||
      Math.max(1, Math.ceil(file.size / chunkSize));

    for (var index = 0; index < totalChunks; index++) {
      var start = index * chunkSize;
      var end = Math.min(file.size, start + chunkSize);
      var blob = file.slice(start, end);
      var fd = new FormData();
      fd.append('uploadId', uploadId);
      fd.append('index', String(index));
      fd.append('file', blob, 'chunk');
      var res = await fetch(apiBase() + '/downloads/admin/upload/chunk', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      });
      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        throw new Error(err.detail || 'HTTP ' + res.status);
      }
      var pct = Math.round(((index + 1) / totalChunks) * 100);
      setStatus(progress, tr('privateHub.ops.downloadsUploadProgress', {
        done: index + 1,
        total: totalChunks,
        pct: pct
      }));
    }

    setStatus(progress, tr('privateHub.ops.downloadsUploadFinalize'));
    var finRes = await fetch(apiBase() + '/downloads/admin/upload/finalize', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        uploadId: uploadId,
        totalSize: file.size,
        fileName: file.name,
        meta: meta
      })
    });
    var finData = await finRes.json().catch(function () { return {}; });
    if (!finRes.ok) throw new Error(finData.detail || 'HTTP ' + finRes.status);
    setStatus(progress, '');
    return finData;
  }

  async function submitForm() {
    if (uploading) return;
    var status = $('form-status');
    var meta = formMeta();
    if (!meta.title) {
      setStatus(status, tr('privateHub.ops.downloadsErrTitle'), true);
      return;
    }

    uploading = true;
    var btn = $('btn-submit');
    btn.disabled = true;
    try {
      var savedId = editingId;
      if (editingId) {
        var res = await fetch(apiBase() + '/downloads/admin/' + editingId, {
          method: 'PUT',
          headers: jsonHeaders(),
          body: JSON.stringify(meta)
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        setStatus(status, tr('privateHub.ops.downloadsSaved'));
      } else if (pickedFile) {
        var created = await chunkedUpload(pickedFile, meta);
        savedId = created && created.id;
        setStatus(status, tr('privateHub.ops.downloadsCreated'));
      } else if (meta.source_url) {
        var res2 = await fetch(apiBase() + '/downloads/admin', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify(Object.assign({ source_type: 'external' }, meta))
        });
        var data2 = await res2.json().catch(function () { return {}; });
        if (!res2.ok) throw new Error(data2.detail || 'HTTP ' + res2.status);
        savedId = data2 && data2.id;
        setStatus(status, tr('privateHub.ops.downloadsCreated'));
      } else {
        setStatus(status, tr('privateHub.ops.downloadsErrSource'), true);
        uploading = false;
        btn.disabled = false;
        return;
      }
      // 封面单独走一个接口：条目先落库拿到 id，再传图，失败只提示不丢条目
      if (savedId && (pickedCover || removeCover)) {
        setStatus(status, tr('privateHub.ops.downloadsCoverBusy'));
        var coverMsg = await applyCover(savedId);
        if (coverMsg) setStatus(status, coverMsg);
      }
      resetForm();
      await loadList();
    } catch (err) {
      setStatus(status, String(err && err.message ? err.message : err), true);
    } finally {
      uploading = false;
      if (btn) {
        btn.disabled = false;
        if (editingId) btn.textContent = tr('privateHub.ops.downloadsSubmitEdit');
      }
    }
  }

  // ------------------------------------------------------------------ list

  function rowHtml(item) {
    var hidden = item.status !== 'published';
    var bits = [];
    var size = fmtBytes(item.fileSize);
    if (item.category) bits.push('<span class="dl-cat">' + escapeHtml(item.category) + '</span>');
    if (item.version) bits.push(escapeHtml(item.version));
    if (size) bits.push(escapeHtml(size));
    if (item.sourceType === 'external') bits.push(escapeHtml(tr('privateHub.ops.downloadsTagExternal')));
    if (item.sha256) bits.push('sha256: ' + escapeHtml(String(item.sha256).slice(0, 12)) + '…');
    var sub = [];
    sub.push(escapeHtml(tr('downloads.times', { n: item.downloadCount || 0 })));
    sub.push(escapeHtml(tr('privateHub.ops.downloadsSort', { n: item.sortOrder || 0 })));
    if (item.updatedAt) sub.push(escapeHtml(item.updatedAt));
    var toggleLabel = hidden
      ? tr('privateHub.ops.downloadsPublish')
      : tr('privateHub.ops.downloadsUnpublish');
    return (
      '<div class="dl-admin-row' + (hidden ? ' is-hidden' : '') + '" data-id="' + item.id + '">' +
        '<span class="dl-badge ' + (hidden ? 'is-hidden' : 'is-pub') + '">' +
          escapeHtml(hidden ? tr('privateHub.ops.downloadsStatusHidden') : tr('privateHub.ops.downloadsStatusPub')) +
        '</span>' +
        (item.coverUrl
          ? '<img class="dl-admin-thumb" src="' + escapeHtml(apiBase() + item.coverUrl) + '" alt="" loading="lazy" />'
          : '') +
        '<div class="dl-admin-main">' +
          '<div class="dl-admin-name">' + escapeHtml(item.title) + '</div>' +
          '<div class="dl-admin-sub">' +
            bits.map(function (b) { return '<span>' + b + '</span>'; }).join('') +
          '</div>' +
          '<div class="dl-admin-sub">' + sub.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' +
        '</div>' +
        '<div class="dl-admin-actions">' +
          '<button type="button" class="tb-btn tb-btn-sm" data-act="edit">' + escapeHtml(tr('privateHub.ops.downloadsEdit')) + '</button>' +
          '<button type="button" class="tb-btn tb-btn-sm" data-act="toggle">' + escapeHtml(toggleLabel) + '</button>' +
          '<button type="button" class="tb-btn tb-btn-sm" data-act="delete">' + escapeHtml(tr('privateHub.ops.downloadsDelete')) + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  async function loadList() {
    var meta = $('list-meta');
    setStatus(meta, tr('privateHub.ops.downloadsListLoading'));
    try {
      var res = await fetch(apiBase() + '/downloads/admin/list', {
        headers: authHeaders(),
        cache: 'no-store'
      });
      if (res.status === 401 || res.status === 403) throw new Error('403');
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
      var items = data.items || [];
      var wrap = $('download-list');
      if (wrap) wrap.innerHTML = items.map(rowHtml).join('');
      setStatus(meta, tr('privateHub.ops.downloadsListMeta', { n: items.length }));
    } catch (err) {
      setStatus(meta, String(err && err.message ? err.message : err), true);
    }
  }

  async function onRowAction(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var row = btn.closest('.dl-admin-row');
    if (!row) return;
    var id = parseInt(row.getAttribute('data-id'), 10);
    var act = btn.getAttribute('data-act');

    if (act === 'edit') {
      var item = null;
      try {
        var res = await fetch(apiBase() + '/downloads/admin/list', {
          headers: authHeaders(),
          cache: 'no-store'
        });
        var data = await res.json();
        item = (data.items || []).filter(function (it) { return it.id === id; })[0];
      } catch (err) { /* handled below */ }
      if (item) fillForm(item);
      return;
    }

    if (act === 'toggle') {
      var nextStatus = row.classList.contains('is-hidden') ? 'published' : 'hidden';
      try {
        var res2 = await fetch(apiBase() + '/downloads/admin/' + id, {
          method: 'PUT',
          headers: jsonHeaders(),
          body: JSON.stringify({ status: nextStatus })
        });
        var data2 = await res2.json().catch(function () { return {}; });
        if (!res2.ok) throw new Error(data2.detail || 'HTTP ' + res2.status);
        await loadList();
      } catch (err2) {
        setStatus($('form-status'), String(err2 && err2.message ? err2.message : err2), true);
      }
      return;
    }

    if (act === 'delete') {
      if (!window.confirm(tr('privateHub.ops.downloadsDeleteConfirm'))) return;
      try {
        var res3 = await fetch(apiBase() + '/downloads/admin/' + id, {
          method: 'DELETE',
          headers: authHeaders()
        });
        var data3 = await res3.json().catch(function () { return {}; });
        if (!res3.ok) throw new Error(data3.detail || 'HTTP ' + res3.status);
        if (editingId === id) resetForm();
        await loadList();
      } catch (err3) {
        setStatus($('form-status'), String(err3 && err3.message ? err3.message : err3), true);
      }
    }
  }

  // ------------------------------------------------------------------ boot

  function bindUi() {
    var datalist = $('dl-cat-options');
    if (datalist) {
      datalist.innerHTML = CATS.map(function (c) {
        return '<option value="' + escapeHtml(c) + '"></option>';
      }).join('');
    }

    var fileInput = $('f-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) {
          pickedFile = fileInput.files[0];
          $('file-label').textContent = pickedFile.name;
          setStatus($('file-meta'), fmtBytes(pickedFile.size));
        } else {
          pickedFile = null;
        }
      });
    }

    var coverInput = $('f-cover');
    if (coverInput) {
      coverInput.addEventListener('change', function () {
        var f = coverInput.files && coverInput.files[0];
        onCoverPicked(f);
      });
    }

    var coverRemoveBtn = $('btn-cover-remove');
    if (coverRemoveBtn) {
      coverRemoveBtn.addEventListener('click', function () {
        if (pickedCover) {
          clearCoverPick();
          showCoverPreview('');
          return;
        }
        removeCover = true;
        showCoverPreview('');
        setStatus($('form-status'), tr('privateHub.ops.downloadsCoverRemovePending'));
      });
    }

    var submit = $('btn-submit');
    if (submit) submit.addEventListener('click', submitForm);
    var cancel = $('btn-cancel-edit');
    if (cancel) cancel.addEventListener('click', resetForm);
    var refresh = $('btn-refresh');
    if (refresh) refresh.addEventListener('click', loadList);

    var list = $('download-list');
    if (list) list.addEventListener('click', onRowAction);

    loadList();
  }

  if (typeof window.initPrivateAdminPage === 'function') {
    window.initPrivateAdminPage(bindUi);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindUi);
    } else {
      bindUi();
    }
  }
})();
