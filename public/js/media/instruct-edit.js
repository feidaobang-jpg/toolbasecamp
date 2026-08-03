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
  var modelWrap = document.getElementById('model-wrap');
  var modelRow = document.getElementById('model-row');
  var compareBoth = document.getElementById('compare-both');
  var promptEl = document.getElementById('prompt');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var quotaLine = document.getElementById('quota-line');
  var errorBox = document.getElementById('error-box');
  var resultsWrap = document.getElementById('results-wrap');
  var busyEl = document.getElementById('busy');
  var file = null;
  var previewUrl = '';
  var resultUrls = [];

  function tr(key, params) {
    return C.tr(key, params);
  }

  function selectedModel() {
    var el = document.querySelector('input[name="instruct-model"]:checked');
    return (el && el.value) || 'qwen-image-2.0';
  }

  function isCompare() {
    return !!(compareBoth && compareBoth.checked);
  }

  function syncModelUi() {
    var off = isCompare();
    if (modelRow) {
      var inputs = modelRow.querySelectorAll('input[type="radio"]');
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].disabled = off;
      }
      modelRow.classList.toggle('is-disabled', off);
    }
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !file || !(promptEl && promptEl.value.trim());
    if (clearBtn) clearBtn.disabled = !!on;
    if (compareBoth) compareBoth.disabled = !!on;
    if (modelRow && !isCompare()) {
      var inputs = modelRow.querySelectorAll('input[type="radio"]');
      for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !!on;
    }
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

  function revokeResults() {
    for (var i = 0; i < resultUrls.length; i++) {
      try { URL.revokeObjectURL(resultUrls[i]); } catch (e) {}
    }
    resultUrls = [];
    if (resultsWrap) {
      resultsWrap.innerHTML = '';
      resultsWrap.hidden = true;
    }
  }

  function b64ToBlobUrl(b64, ctype) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var blob = new Blob([arr], { type: ctype || 'image/png' });
    var url = URL.createObjectURL(blob);
    resultUrls.push(url);
    return url;
  }

  function modelTitle(mid) {
    if (mid === 'qwen-image-2.0-pro') return tr('tools.instructEdit.model20pro');
    return tr('tools.instructEdit.model20');
  }

  function renderResults(images, partialErrors) {
    revokeResults();
    if (!resultsWrap || !images || !images.length) return;
    var grid = document.createElement('div');
    grid.className = 'instruct-results-grid';
    for (var i = 0; i < images.length; i++) {
      (function (item) {
        var card = document.createElement('div');
        card.className = 'instruct-result-card';
        var title = document.createElement('div');
        title.className = 'instruct-result-title';
        title.textContent = modelTitle(item.model);
        var img = document.createElement('img');
        img.alt = item.model || '';
        img.src = b64ToBlobUrl(item.imageBase64, item.contentType);
        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'tb-btn';
        dl.textContent = tr('tools.instructEdit.download');
        dl.addEventListener('click', function () {
          var a = document.createElement('a');
          a.href = img.src;
          a.download = 'instruct-edit-' + String(item.model || 'out').replace(/[^\w.-]+/g, '-') + '.png';
          a.click();
        });
        card.appendChild(title);
        card.appendChild(img);
        card.appendChild(dl);
        grid.appendChild(card);
      })(images[i]);
    }
    resultsWrap.appendChild(grid);
    if (partialErrors && partialErrors.length) {
      var note = document.createElement('p');
      note.className = 'instruct-partial-err';
      note.textContent = tr('tools.instructEdit.partialFail') + ' ' + partialErrors.join('; ');
      resultsWrap.appendChild(note);
    }
    resultsWrap.hidden = false;
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
    revokeResults();
    file = f;
    previewUrl = URL.createObjectURL(f);
    if (sourceImg) sourceImg.src = previewUrl;
    if (sourceWrap) sourceWrap.hidden = false;
    if (dropZone) dropZone.hidden = true;
    if (promptWrap) promptWrap.hidden = false;
    if (modelWrap) modelWrap.hidden = false;
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
    syncModelUi();
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
  if (compareBoth) {
    compareBoth.addEventListener('change', function () {
      syncModelUi();
      setBusy(false);
    });
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
      fd.append('compare', isCompare() ? '1' : '0');
      if (!isCompare()) fd.append('model', selectedModel());
      C.apiJson('/image/instruct-edit', { method: 'POST', body: fd }).then(function (data) {
        if (data.quota && quotaLine) quotaLine.textContent = formatQuota(data.quota);
        var images = data.images;
        if ((!images || !images.length) && data.imageBase64) {
          images = [{
            model: data.model || selectedModel(),
            imageBase64: data.imageBase64,
            contentType: data.contentType || 'image/png'
          }];
        }
        if (!images || !images.length) throw new Error(tr('tools.instructEdit.failed'));
        renderResults(images, data.partialErrors);
      }).catch(function (err) {
        C.setError(errorBox, err.message);
      }).finally(function () {
        setBusy(false);
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      file = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      revokeResults();
      if (sourceWrap) sourceWrap.hidden = true;
      if (dropZone) dropZone.hidden = false;
      if (promptWrap) promptWrap.hidden = true;
      if (modelWrap) modelWrap.hidden = true;
      if (promptEl) promptEl.value = '';
      if (compareBoth) compareBoth.checked = false;
      syncModelUi();
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  boot();
})();
