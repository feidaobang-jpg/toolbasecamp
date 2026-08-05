(function () {
  'use strict';
  var C = window.TBImageCloud;
  var Hist = window.TBImageGenHistory;
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
  var selectAllBtn = document.getElementById('select-all-models');
  var costHint = document.getElementById('cost-hint');
  var promptEl = document.getElementById('prompt');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var balanceLine = document.getElementById('balance-line');
  var errorBox = document.getElementById('error-box');
  var resultMeta = document.getElementById('result-meta');
  var resultsWrap = document.getElementById('results-wrap');
  var busyEl = document.getElementById('busy');
  var wechatTip = document.getElementById('wechat-tip');
  var historyHint = document.getElementById('history-hint');
  var bgTimeRow = document.getElementById('bg-time-row');
  var bgPanelEl = document.getElementById('bg-toggle-panel');
  var bgToggleBtn = document.getElementById('bg-toggle-btn');
  var bgExpanded = false;
  var bgPresetButtons = null;
  var bgTime = 'day';
  var files = [];
  var previewUrls = [];
  var resultUrls = [];
  var activePreset = '';
  var priceMarkup = 2;
  var histPanel = null;
  var runStartedAt = 0;
  var MOBILE_COMPRESS_MIN_BYTES = 1200 * 1024;
  var MOBILE_COMPRESS_MAX_EDGE = 1600;
  var MOBILE_COMPRESS_QUALITY = 0.86;

  function tr(key, params) {
    return C.tr(key, params);
  }

  function downloadName(item) {
    var name = 'instruct-edit-' + String(item.model || 'out').replace(/[^\w.-]+/g, '-');
    if (typeof item.index === 'number') name += '-' + (item.index + 1);
    return name + '.png';
  }

  function doDownload(blobOrUrl, item) {
    C.downloadBlob(blobOrUrl, downloadName(item || {}), {
      tipEl: wechatTip,
      errorEl: errorBox
    });
  }

  function resultSrc(b64, ctype) {
    // Performance: on WeChat, converting every image to data:URL can be very slow.
    // Use object URL for in-page rendering; switch to data:URL only in preview (click).
    return b64ToBlobUrl(b64, ctype);
  }

  function isMobileUA() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  function shouldCompressBeforeUpload(file) {
    if (!file) return false;
    if (!(C.isWeChat && C.isWeChat()) && !isMobileUA()) return false;
    var type = String(file.type || '').toLowerCase();
    if (type !== 'image/jpeg' && type !== 'image/jpg' && type !== 'image/webp') return false;
    return file.size >= MOBILE_COMPRESS_MIN_BYTES;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(img);
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('blob encode failed'));
        else resolve(blob);
      }, type, quality);
    });
  }

  async function compressFileIfNeeded(file) {
    if (!shouldCompressBeforeUpload(file)) return file;
    try {
      var img = await loadImageFromFile(file);
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (!w || !h) return file;
      var scale = Math.min(1, MOBILE_COMPRESS_MAX_EDGE / Math.max(w, h));
      if (scale >= 1 && file.size < MOBILE_COMPRESS_MIN_BYTES * 1.5) return file;
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, tw, th);
      var blob = await canvasToBlob(canvas, 'image/jpeg', MOBILE_COMPRESS_QUALITY);
      if (!blob || blob.size >= file.size * 0.95) return file;
      if (typeof File !== 'undefined') {
        return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
      }
      blob.name = (file.name || 'image').replace(/\.\w+$/, '') + '.jpg';
      return blob;
    } catch (e) {
      return file;
    }
  }

  function modelInputs() {
    return modelRow ? modelRow.querySelectorAll('input[name="instruct-model"]') : [];
  }

  function selectedModels() {
    var out = [];
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].checked) {
        out.push({
          id: inputs[i].value,
          price: parseFloat(inputs[i].getAttribute('data-price') || '0') || 0
        });
      }
    }
    return out;
  }

  function canRun() {
    if (!files.length) return false;
    if (!selectedModels().length) return false;
    if (activePreset) return true;
    return !!(promptEl && promptEl.value.trim());
  }

  function updateCostHint() {
    if (!costHint) return;
    var models = selectedModels();
    var nImg = files.length || 0;
    var nMod = models.length;
    if (!nImg || !nMod) {
      costHint.textContent = tr('tools.instructEdit.costHintEmpty');
      return;
    }
    var unit = 0;
    for (var i = 0; i < models.length; i++) unit += models[i].price;
    var total = Math.round(unit * priceMarkup * nImg * 100) / 100;
    var runs = nImg * nMod;
    costHint.textContent = tr('tools.instructEdit.costHint', {
      images: nImg,
      models: nMod,
      runs: runs,
      price: total
    });
  }

  function timePhrase() {
    if (bgTime === 'dusk') return '黄昏金色光，电影感自然光';
    if (bgTime === 'night') return '夜景霓虹，低照度，电影感';
    return '白天晴朗，自然光，旅行摄影写实';
  }

  function setBgTime(time) {
    bgTime = time || 'day';
    if (!bgTimeRow) return;
    var chips = bgTimeRow.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      var t = chips[i].getAttribute('data-bg-time') || 'day';
      chips[i].classList.toggle('is-active', t === bgTime);
    }
    setBusy(false);
  }

  function setBgPanelExpanded(on) {
    bgExpanded = !!on;
    if (bgPanelEl) bgPanelEl.hidden = !bgExpanded;
    if (bgToggleBtn) {
      bgToggleBtn.textContent = tr(bgExpanded ? 'tools.instructEdit.bgCollapse' : 'tools.instructEdit.bgExpand');
    }
  }

  function applyBackgroundPreset(place) {
    if (!promptEl) return;
    if (!place) return;
    var snippet = '背景：' + place + '，写实旅游摄影，' + timePhrase();
    var v = (promptEl.value || '').trim();
    // Remove previously inserted background line(s) (we always add as a separate line).
    var lines = v ? v.split(/\n/) : [];
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = (lines[i] || '').trim();
      if (!line) continue;
      if (line.indexOf('背景：') === 0) continue;
      out.push(line);
    }
    out.push(snippet);
    promptEl.value = out.join('\n');
    setBusy(false);
    updateCostHint();
  }

  function applyWallet(wallet) {
    if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
    if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
    updateCostHint();
  }


  function syncSelectAllLabel() {
    if (!selectAllBtn) return;
    var inputs = modelInputs();
    var all = inputs.length > 0;
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checked) { all = false; break; }
    }
    selectAllBtn.textContent = all
      ? tr('tools.instructEdit.deselectAllModels')
      : tr('tools.instructEdit.selectAllModels');
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
    if (selectAllBtn) selectAllBtn.disabled = !!on;
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !!on;
    if (presetRow) {
      var chips = presetRow.querySelectorAll('.rec-chip');
      for (var j = 0; j < chips.length; j++) chips[j].disabled = !!on;
    }
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
    if (mid === 'wan2.7-image-pro') return tr('tools.instructEdit.modelWan27pro');
    if (mid === 'wan2.7-image') return tr('tools.instructEdit.modelWan27');
    if (mid === 'wan2.6-image') return tr('tools.instructEdit.modelWan26');
    if (mid === 'qwen-image-2.0-pro') return tr('tools.instructEdit.model20pro');
    return tr('tools.instructEdit.model20');
  }

  function renderSources() {
    if (!sourceWrap) return;
    sourceWrap.innerHTML = '';
    if (!files.length) {
      sourceWrap.hidden = true;
      updateCostHint();
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
          setBusy(false);
        });
        card.appendChild(img);
        card.appendChild(rm);
        sourceWrap.appendChild(card);
      })(i, files[i]);
    }
    sourceWrap.hidden = false;
    updateCostHint();
  }

  function syncControlsVisible() {
    var has = files.length > 0;
    if (dropZone) dropZone.hidden = has && files.length >= MAX_BATCH;
    // Prompt + background presets are useful before uploading; keep visible.
    if (promptWrap) promptWrap.hidden = false;
    if (presetWrap) presetWrap.hidden = false;
    if (modelWrap) modelWrap.hidden = !has;
    if (!has && dropZone) dropZone.hidden = false;
    updateCostHint();
  }

  function appendResultCard(grid, item) {
    var card = document.createElement('div');
    card.className = 'instruct-result-card';
    var title = document.createElement('div');
    title.className = 'instruct-result-title';
    title.textContent = modelTitle(item.model);
    var img = document.createElement('img');
    img.alt = item.model || '';
    img.src = resultSrc(item.imageBase64, item.contentType);
    img.addEventListener('click', function () {
      var longPressSrc = img.src;
      if (C.isWeChat && C.isWeChat()) {
        longPressSrc = C.b64ToDataUrl(item.imageBase64, item.contentType);
      }
      C.openSavePreview(longPressSrc, tr('tools.imageCloud.longPressSave'));
    });
    var dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'tb-btn';
    dl.textContent = tr('tools.instructEdit.download');
    dl.addEventListener('click', function () {
      doDownload(img.src, item);
    });
    card.appendChild(title);
    card.appendChild(img);
    card.appendChild(dl);
    grid.appendChild(card);
  }

  function renderResults(images, partialErrors) {
    revokeResults();
    if (!resultsWrap || !images || !images.length) return;

    var byIndex = {};
    var order = [];
    for (var i = 0; i < images.length; i++) {
      var item = images[i];
      var idx = typeof item.index === 'number' ? item.index : 0;
      if (!byIndex[idx]) {
        byIndex[idx] = [];
        order.push(idx);
      }
      byIndex[idx].push(item);
    }
    order.sort(function (a, b) { return a - b; });

    for (var g = 0; g < order.length; g++) {
      var gi = order[g];
      var group = document.createElement('div');
      group.className = 'instruct-result-group';
      var head = document.createElement('div');
      head.className = 'instruct-result-group-title';
      head.textContent = tr('tools.instructEdit.imageN', { n: gi + 1 });
      var grid = document.createElement('div');
      grid.className = 'instruct-results-grid';
      var list = byIndex[gi];
      for (var j = 0; j < list.length; j++) appendResultCard(grid, list[j]);
      group.appendChild(head);
      group.appendChild(grid);
      resultsWrap.appendChild(group);
    }

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
      applyWallet(s.aiWallet);
      if (s.instructEditMaxBatch) MAX_BATCH = s.instructEditMaxBatch;
      if (s.instructEditConfigured === false) {
        C.setError(errorBox, tr('tools.instructEdit.dashscopeMissing'));
      }
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  async function addFiles(list) {
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
      files.push(await compressFileIfNeeded(f));
    }
    revokeResults();
    renderSources();
    syncControlsVisible();
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

  function applyLocaleBits() {
    C.showWeChatBanner(wechatTip);
    if (historyHint) {
      historyHint.textContent = tr('tools.imageCloud.historyHint', {
        max: (Hist && Hist.MAX_PER_TOOL) || 24
      });
    }
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
    applyLocaleBits();
    if (Hist && !histPanel) {
      histPanel = Hist.bindPanel({
        tool: 'instruct_edit',
        gridEl: document.getElementById('history-grid'),
        emptyEl: document.getElementById('history-empty'),
        clearBtn: document.getElementById('history-clear'),
        tr: tr,
        modelTitle: modelTitle,
        onDownload: function (blob, row) {
          doDownload(blob, row);
        }
      });
      histPanel.refresh();
    } else if (histPanel) {
      histPanel.refresh();
    }
    syncSelectAllLabel();
    updateCostHint();
    syncControlsVisible();
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
  if (modelRow) {
    modelRow.addEventListener('change', function () {
      syncSelectAllLabel();
      updateCostHint();
      setBusy(false);
    });
  }
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function () {
      var inputs = modelInputs();
      var all = true;
      for (var i = 0; i < inputs.length; i++) {
        if (!inputs[i].checked) { all = false; break; }
      }
      for (var j = 0; j < inputs.length; j++) inputs[j].checked = !all;
      syncSelectAllLabel();
      updateCostHint();
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
      var models = selectedModels();
      if (!files.length) return;
      if (!models.length) {
        C.setError(errorBox, tr('tools.instructEdit.needModel'));
        return;
      }
      if (!canRun()) {
        C.setError(errorBox, tr('tools.instructEdit.needPromptOrPreset'));
        return;
      }
      C.setError(errorBox, '');
      if (resultMeta) resultMeta.textContent = '';
      setBusy(true);
      runStartedAt = Date.now();
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) {
        fd.append('files', files[i], files[i].name || ('image-' + (i + 1) + '.jpg'));
      }
      fd.append('prompt', (promptEl && promptEl.value) || '');
      if (activePreset) fd.append('preset', activePreset);
      for (var m = 0; m < models.length; m++) fd.append('models', models[m].id);
      var timeoutMs = (C.isWeChat && C.isWeChat()) ? 300000 : 60000;
      C.apiJson('/image/instruct-edit', { method: 'POST', body: fd, timeoutMs: timeoutMs }).then(function (data) {
        if (data.aiWallet) applyWallet(data.aiWallet);
        var images = data.images;
        if ((!images || !images.length) && data.imageBase64) {
          images = [{
            index: 0,
            model: data.model || models[0].id,
            imageBase64: data.imageBase64,
            contentType: data.contentType || 'image/png'
          }];
        }
        if (!images || !images.length) {
          var raw = '';
          try {
            raw = JSON.stringify(data || {});
          } catch (e) {}
          if (raw && raw.length > 220) raw = raw.slice(0, 220) + '...';
          throw new Error(tr('tools.instructEdit.failed') + (raw ? '：' + raw : ''));
        }
        renderResults(images, data.partialErrors);
        if (resultMeta && runStartedAt) {
          var seconds = Math.max(1, Math.round((Date.now() - runStartedAt) / 1000));
          resultMeta.textContent = tr('tools.instructEdit.elapsed', { seconds: seconds });
        }
        if (histPanel) {
          var promptText = (promptEl && promptEl.value) || '';
          if (activePreset === 'manga_to_real') promptText = tr('tools.instructEdit.presetMangaToReal');
          else if (activePreset === 'real_to_manga') promptText = tr('tools.instructEdit.presetRealToManga');
          histPanel.save(images, { prompt: promptText });
        }
      }).catch(function (err) {
        C.setError(errorBox, err.message);
        if (resultMeta && runStartedAt) {
          var failSeconds = Math.max(1, Math.round((Date.now() - runStartedAt) / 1000));
          resultMeta.textContent = tr('tools.instructEdit.elapsed', { seconds: failSeconds });
        }
      }).finally(function () {
        runStartedAt = 0;
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
      if (promptEl) promptEl.value = '';
      var inputs = modelInputs();
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].checked = inputs[i].value === 'wan2.6-image';
      }
      setPreset('');
      setBgPanelExpanded(false);
      setBgTime('day');
      syncControlsVisible();
      syncSelectAllLabel();
      updateCostHint();
      C.setError(errorBox, '');
      if (resultMeta) resultMeta.textContent = '';
      setBusy(false);
    });
  }

  // Background preset chips wiring (optional)
  if (bgToggleBtn) {
    bgToggleBtn.addEventListener('click', function () {
      setBgPanelExpanded(!bgExpanded);
    });
  }
  if (bgTimeRow) {
    var timeChips = bgTimeRow.querySelectorAll('button[data-bg-time]');
    for (var i = 0; i < timeChips.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var t = btn.getAttribute('data-bg-time') || 'day';
          setBgTime(t);
        });
      })(timeChips[i]);
    }
  }
  setBgPanelExpanded(false);
  // Location chips (everything with data-bg-place)
  bgPresetButtons = document.querySelectorAll('button[data-bg-place]');
  if (bgPresetButtons && bgPresetButtons.length) {
    for (var b = 0; b < bgPresetButtons.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var place = btn.getAttribute('data-bg-place') || btn.textContent || '';
          place = place.trim();
          applyBackgroundPreset(place);
          // prompt input listener will update busy state; still safe to force.
          setBusy(false);
        });
      })(bgPresetButtons[b]);
    }
  }

  document.addEventListener('tb:locale', function () {
    applyLocaleBits();
    setBgPanelExpanded(bgExpanded);
    syncSelectAllLabel();
    updateCostHint();
    if (histPanel) histPanel.refresh();
  });

  boot();
})();
