(function () {
  'use strict';
  var C = window.TBImageCloud;
  if (!C) return;

  var MAX_BATCH = 4;
  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var promptWrap = document.getElementById('prompt-wrap');
  var presetWrap = document.getElementById('preset-wrap');
  var presetRow = document.getElementById('preset-row');
  var modelWrap = document.getElementById('model-wrap');
  var modelRow = document.getElementById('model-row');
  var compareWrap = document.getElementById('compare-wrap');
  var compareBoth = document.getElementById('compare-both');
  var promptEl = document.getElementById('prompt');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var quotaLine = document.getElementById('quota-line');
  var errorBox = document.getElementById('error-box');
  var resultsWrap = document.getElementById('results-wrap');
  var busyEl = document.getElementById('busy');
  var files = [];
  var previewUrls = [];
  var resultUrls = [];
  var activePreset = '';

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

  function canRun() {
    if (!files.length) return false;
    if (activePreset) return true;
    return !!(promptEl && promptEl.value.trim());
  }

  function syncModelUi() {
    var multi = files.length > 1;
    if (multi && compareBoth && compareBoth.checked) {
      compareBoth.checked = false;
    }
    if (compareWrap) {
      compareWrap.classList.toggle('is-disabled', multi);
      if (compareBoth) compareBoth.disabled = multi;
    }
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
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
    if (compareBoth) compareBoth.disabled = !!on || files.length > 1;
    if (modelRow && !isCompare()) {
      var inputs = modelRow.querySelectorAll('input[type="radio"]');
      for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !!on;
    }
    if (presetRow) {
      var chips = presetRow.querySelectorAll('.rec-chip');
      for (var j = 0; j < chips.length; j++) chips[j].disabled = !!on;
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

  function revokePreviews() {
    for (var i = 0; i < previewUrls.length; i++) {
      try { URL.revokeObjectURL(previewUrls[i]); } catch (e) {}
    }
    previewUrls = [];
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
    if (mid === 'wan2.6-image') return tr('tools.instructEdit.modelWan');
    return tr('tools.instructEdit.model20');
  }

  function renderSources() {
    if (!sourceWrap) return;
    sourceWrap.innerHTML = '';
    if (!files.length) {
      sourceWrap.hidden = true;
      return;
    }
    revokePreviews();
    for (var i = 0; i < files.length; i++) {
      (function (idx, f) {
        var card = document.createElement('div');
        card.className = 'instruct-source-card';
        var img = document.createElement('img');
        var url = URL.createObjectURL(f);
        previewUrls.push(url);
        img.src = url;
        img.alt = f.name || '';
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'instruct-source-remove';
        rm.setAttribute('aria-label', 'remove');
        rm.textContent = '×';
        rm.addEventListener('click', function () {
          files.splice(idx, 1);
          renderSources();
          syncControlsVisible();
          syncModelUi();
          setBusy(false);
        });
        card.appendChild(img);
        card.appendChild(rm);
        sourceWrap.appendChild(card);
      })(i, files[i]);
    }
    sourceWrap.hidden = false;
  }

  function syncControlsVisible() {
    var has = files.length > 0;
    if (dropZone) dropZone.hidden = has && files.length >= MAX_BATCH;
    if (promptWrap) promptWrap.hidden = !has;
    if (presetWrap) presetWrap.hidden = !has;
    if (modelWrap) modelWrap.hidden = !has;
    if (!has && dropZone) dropZone.hidden = false;
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
        var parts = [modelTitle(item.model)];
        if (typeof item.index === 'number' && files.length > 1) {
          parts.unshift(tr('tools.instructEdit.imageN', { n: item.index + 1 }));
        }
        title.textContent = parts.join(' · ');
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
          var name = 'instruct-edit-' + String(item.model || 'out').replace(/[^\w.-]+/g, '-');
          if (typeof item.index === 'number') name += '-' + (item.index + 1);
          a.download = name + '.png';
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
      if (s.instructEditMaxBatch) MAX_BATCH = s.instructEditMaxBatch;
      if (s.instructEditConfigured === false) {
        C.setError(errorBox, tr('tools.instructEdit.dashscopeMissing'));
      }
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  function addFiles(list) {
    C.setError(errorBox, '');
    var arr = Array.prototype.slice.call(list || []);
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (!f || !String(f.type || '').startsWith('image/')) {
        C.setError(errorBox, tr('tools.imageCloud.invalidFile'));
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        C.setError(errorBox, tr('tools.instructEdit.tooLarge'));
        continue;
      }
      if (files.length >= MAX_BATCH) {
        C.setError(errorBox, tr('tools.instructEdit.tooMany', { max: MAX_BATCH }));
        break;
      }
      files.push(f);
    }
    revokeResults();
    renderSources();
    syncControlsVisible();
    syncModelUi();
    setBusy(false);
  }

  function setPreset(id) {
    activePreset = id || '';
    if (!presetRow) return;
    var chips = presetRow.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      var p = chips[i].getAttribute('data-preset') || '';
      chips[i].classList.toggle('is-active', p === activePreset);
    }
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
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files) addFiles(fileInput.files);
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
  if (presetRow) {
    presetRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn || btn.disabled) return;
      setPreset(btn.getAttribute('data-preset') || '');
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      if (!canRun()) {
        C.setError(errorBox, tr('tools.instructEdit.needPromptOrPreset'));
        return;
      }
      C.setError(errorBox, '');
      setBusy(true);
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) {
        fd.append('files', files[i], files[i].name || ('image-' + (i + 1) + '.jpg'));
      }
      fd.append('prompt', (promptEl && promptEl.value) || '');
      if (activePreset) fd.append('preset', activePreset);
      fd.append('compare', isCompare() ? '1' : '0');
      if (!isCompare()) fd.append('model', selectedModel());
      C.apiJson('/image/instruct-edit', { method: 'POST', body: fd }).then(function (data) {
        if (data.quota && quotaLine) quotaLine.textContent = formatQuota(data.quota);
        var images = data.images;
        if ((!images || !images.length) && data.imageBase64) {
          images = [{
            index: 0,
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
      files = [];
      revokePreviews();
      revokeResults();
      if (sourceWrap) {
        sourceWrap.innerHTML = '';
        sourceWrap.hidden = true;
      }
      if (dropZone) dropZone.hidden = false;
      if (promptWrap) promptWrap.hidden = true;
      if (presetWrap) presetWrap.hidden = true;
      if (modelWrap) modelWrap.hidden = true;
      if (promptEl) promptEl.value = '';
      if (compareBoth) compareBoth.checked = false;
      setPreset('');
      syncModelUi();
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  boot();
})();
