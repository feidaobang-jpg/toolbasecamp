(function () {
  'use strict';
  var C = window.TBImageCloud;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var sourceImg = document.getElementById('source-img');
  var promptWrap = document.getElementById('prompt-wrap');
  var promptEl = document.getElementById('prompt');
  var runBtn = document.getElementById('run-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var quotaLine = document.getElementById('quota-line');
  var errorBox = document.getElementById('error-box');
  var previewWrap = document.getElementById('preview-wrap');
  var previewImg = document.getElementById('preview-img');
  var busyEl = document.getElementById('busy');
  var file = null;
  var previewUrl = '';
  var resultUrl = '';

  function tr(key, params) {
    return C.tr(key, params);
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !file || !(promptEl && promptEl.value.trim());
    if (clearBtn) clearBtn.disabled = !!on;
  }

  function formatQuota(item) {
    if (!item) return '';
    if (item.unlimited) return tr('tools.imageCloud.quotaUnlimited');
    return tr('tools.imageCloud.quotaLine', {
      used: item.used,
      limit: item.limit,
      remaining: item.remaining
    });
  }

  function pickQuota(status) {
    var list = (status && status.quotas) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].action === 'instruct_edit') return list[i];
    }
    return null;
  }

  function loadStatus() {
    return C.apiJson('/image/status').then(function (s) {
      if (quotaLine) quotaLine.textContent = formatQuota(pickQuota(s));
      if (s.instructEditConfigured === false) {
        C.setError(errorBox, tr('tools.instructEdit.dashscopeMissing'));
      }
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  function setFile(f) {
    C.setError(errorBox, '');
    if (!f || !String(f.type || '').startsWith('image/')) {
      C.setError(errorBox, tr('tools.imageCloud.invalidFile'));
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      C.setError(errorBox, tr('tools.instructEdit.tooLarge'));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = '';
    file = f;
    previewUrl = URL.createObjectURL(f);
    if (sourceImg) sourceImg.src = previewUrl;
    if (sourceWrap) sourceWrap.hidden = false;
    if (dropZone) dropZone.hidden = true;
    if (promptWrap) promptWrap.hidden = false;
    if (previewWrap) previewWrap.hidden = true;
    if (downloadBtn) downloadBtn.disabled = true;
    setBusy(false);
  }

  function boot() {
    if (!C.getToken()) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      if (loginLink) loginLink.href = C.loginUrl();
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    loadStatus();
  }

  if (dropZone) {
    dropZone.addEventListener('click', function () { fileInput && fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setFile(f);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
      fileInput.value = '';
    });
  }
  if (promptEl) {
    promptEl.addEventListener('input', function () { setBusy(false); });
  }

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      if (!file) return;
      var prompt = (promptEl && promptEl.value || '').trim();
      if (!prompt) {
        C.setError(errorBox, tr('tools.instructEdit.needPrompt'));
        return;
      }
      C.setError(errorBox, '');
      setBusy(true);
      var fd = new FormData();
      fd.append('file', file, file.name || 'image.jpg');
      fd.append('prompt', prompt);
      C.apiJson('/image/instruct-edit', { method: 'POST', body: fd }).then(function (data) {
        if (data.quota && quotaLine) quotaLine.textContent = formatQuota(data.quota);
        var b64 = data.imageBase64;
        var ctype = data.contentType || 'image/png';
        if (!b64) throw new Error(tr('tools.instructEdit.failed'));
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var blob = new Blob([arr], { type: ctype });
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(blob);
        if (previewImg) previewImg.src = resultUrl;
        if (previewWrap) previewWrap.hidden = false;
        if (downloadBtn) downloadBtn.disabled = false;
      }).catch(function (err) {
        C.setError(errorBox, err.message);
      }).finally(function () {
        setBusy(false);
      });
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      if (!resultUrl) return;
      var a = document.createElement('a');
      a.href = resultUrl;
      a.download = 'instruct-edit.png';
      a.click();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      file = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      previewUrl = '';
      resultUrl = '';
      if (sourceWrap) sourceWrap.hidden = true;
      if (dropZone) dropZone.hidden = false;
      if (promptWrap) promptWrap.hidden = true;
      if (promptEl) promptEl.value = '';
      if (previewWrap) previewWrap.hidden = true;
      if (downloadBtn) downloadBtn.disabled = true;
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  boot();
})();
