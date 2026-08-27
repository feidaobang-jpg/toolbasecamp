(function () {
  'use strict';
  var C = window.TBImageCloud;
  var Hist = window.TBImageGenHistory;
  if (!C) return;

  var MAX_BATCH = 4;
  var refMode = 'single';
  var outputSize = '2K';
  var modelCatalog = {};
  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var dropZone = document.getElementById('drop-zone');
  var dropHint = document.getElementById('drop-hint');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var promptWrap = document.getElementById('prompt-wrap');
  var presetWrap = document.getElementById('preset-wrap');
  var presetRow = document.getElementById('preset-row');
  var refModeRow = document.getElementById('ref-mode-row');
  var refModeHint = document.getElementById('ref-mode-hint');
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
  var busyTextEl = document.getElementById('busy-text');
  var wechatTip = document.getElementById('wechat-tip');
  var historyHint = document.getElementById('history-hint');
  var publicToggle = document.getElementById('public-toggle');
  var bgTimeRow = document.getElementById('bg-time-row');
  var bgPanelEl = document.getElementById('bg-toggle-panel');
  var bgToggleBtn = document.getElementById('bg-toggle-btn');
  var bgGroupsEl = document.getElementById('bg-groups');
  var bgSelectWrap = document.getElementById('bg-select-wrap');
  var bgRegionSelect = document.getElementById('bg-region-select');
  var bgPlaceSelect = document.getElementById('bg-place-select');
  var bgGroupsData = [];
  var bgUi = null;
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

  function resultSrc(item) {
    // WeChat: MUST use data: URL (not blob:) so long-press save/forward works.
    // Prefer displayImageSrc whenever base64 is present.
    if (item && item.imageBase64) {
      if (C.displayImageSrc) {
        var src = C.displayImageSrc(item.imageBase64, item.contentType);
        if (String(src).indexOf('blob:') === 0) resultUrls.push(src);
        if (String(src).indexOf('data:') === 0) item._wechatDataUrl = src;
        return src;
      }
      if (C.isWeChat && C.isWeChat() && C.b64ToDataUrl) {
        item._wechatDataUrl = C.b64ToDataUrl(item.imageBase64, item.contentType);
        return item._wechatDataUrl;
      }
      return b64ToBlobUrl(item.imageBase64, item.contentType);
    }
    if (item && item.imageUrl) return item.imageUrl;
    return '';
  }

  function isMobileUA() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  function shouldCompressBeforeUpload(file) {
    if (!file) return false;
    if (!(C.isWeChat && C.isWeChat()) && !isMobileUA()) return false;
    var type = String(file.type || '').toLowerCase();
    if (
      type !== 'image/jpeg'
      && type !== 'image/jpg'
      && type !== 'image/webp'
      && type !== 'image/png'
    ) return false;
    return file.size >= MOBILE_COMPRESS_MIN_BYTES || type === 'image/png';
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

  function isSeedreamModel(modelId) {
    var s = String(modelId || '').toLowerCase();
    return s.indexOf('seedream') >= 0 || s.indexOf('doubao-seedream') >= 0;
  }

  function modelListPrice(modelId) {
    var m = modelCatalog[modelId];
    if (m) return parseFloat(m.priceCny2K) || 0;
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value !== modelId) continue;
      return parseFloat(inputs[i].getAttribute('data-price-2k') || '0') || 0;
    }
    return 0;
  }

  function maxRefsForSelectedModels() {
    var models = selectedModels();
    if (!models.length) return MAX_BATCH;
    var min = MAX_BATCH;
    for (var i = 0; i < models.length; i++) {
      var n = models[i].maxRefs;
      if (n > 0 && n < min) min = n;
    }
    return min;
  }

  function uploadLimit() {
    return refMode === 'multi' ? maxRefsForSelectedModels() : MAX_BATCH;
  }

  function selectedModels() {
    var out = [];
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].checked) {
        var id = inputs[i].value;
        var cat = modelCatalog[id];
        out.push({
          id: id,
          price: modelListPrice(id),
          maxRefs: cat
            ? (parseInt(cat.maxRefs, 10) || parseInt(inputs[i].getAttribute('data-max-refs') || '3', 10))
            : (parseInt(inputs[i].getAttribute('data-max-refs') || '3', 10) || 3)
        });
      }
    }
    return out;
  }

  function canRun() {
    if (!files.length) return false;
    if (refMode === 'multi' && files.length < 2) return false;
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
    if (refMode === 'multi' && nImg < 2) {
      costHint.textContent = tr('tools.instructEdit.needMultiRefs');
      return;
    }
    var sizeNote = '';
    var unit = 0;
    for (var i = 0; i < models.length; i++) unit += models[i].price;
    if (refMode === 'multi') {
      var totalM = Math.round(unit * priceMarkup * 100) / 100;
      costHint.textContent = tr('tools.instructEdit.costHintMulti', {
        refs: nImg,
        models: nMod,
        runs: nMod,
        price: totalM
      }) + sizeNote;
      return;
    }
    var total = Math.round(unit * priceMarkup * nImg * 100) / 100;
    var runs = nImg * nMod;
    costHint.textContent = tr('tools.instructEdit.costHint', {
      images: nImg,
      models: nMod,
      runs: runs,
      price: total
    }) + sizeNote;
  }

  function syncDropHints() {
    if (!dropHint) return;
    var max = uploadLimit();
    if (refMode === 'multi') {
      dropHint.setAttribute('data-i18n', 'tools.instructEdit.dropHintMulti');
      dropHint.textContent = tr('tools.instructEdit.dropHintMulti', { max: max });
    } else {
      dropHint.setAttribute('data-i18n', 'tools.instructEdit.dropHint');
      dropHint.textContent = tr('tools.instructEdit.dropHint', { max: max });
    }
  }

  function syncRefModeUi() {
    if (refModeRow) {
      var chips = refModeRow.querySelectorAll('.rec-chip');
      for (var i = 0; i < chips.length; i++) {
        var m = chips[i].getAttribute('data-ref-mode') || 'single';
        chips[i].classList.toggle('is-active', m === refMode);
      }
    }
    if (refModeHint) {
      var maxR = maxRefsForSelectedModels();
      refModeHint.setAttribute(
        'data-i18n',
        refMode === 'multi'
          ? 'tools.instructEdit.refModeMultiHint'
          : 'tools.instructEdit.refModeSingleHint'
      );
      refModeHint.textContent = tr(
        refMode === 'multi'
          ? 'tools.instructEdit.refModeMultiHint'
          : 'tools.instructEdit.refModeSingleHint',
        refMode === 'multi' ? { max: maxR } : undefined
      );
    }
    if (dropHint) syncDropHints();
    if (promptEl) {
      var phKey = refMode === 'multi'
        ? 'tools.instructEdit.promptPhMulti'
        : 'tools.instructEdit.promptPh';
      promptEl.setAttribute('data-i18n-placeholder', phKey);
      promptEl.setAttribute('placeholder', tr(phKey));
    }
    updateCostHint();
  }

  function setRefMode(mode) {
    var next = mode === 'multi' ? 'multi' : 'single';
    if (next === refMode) return;
    refMode = next;
    if (trimFilesToLimit()) renderSources();
    syncRefModeUi();
    renderSources();
    syncControlsVisible();
    setBusy(false);
  }

  function getBgGroupsData() {
    var G = window.InstructEditBgGroups;
    if (!G || !G.groups) return [];
    return G.groups.map(function (g) {
      return {
        label: g.title,
        items: g.places.map(function (p) {
          return { value: p.value, label: p.label };
        })
      };
    });
  }

  function renderBgPlaceOptions(regionIdx) {
    if (!bgPlaceSelect) return;
    bgPlaceSelect.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = tr('tools.instructEdit.bgPlacePlaceholder');
    bgPlaceSelect.appendChild(ph);
    var group = bgGroupsData[regionIdx] || null;
    if (!group) {
      bgPlaceSelect.disabled = true;
      return;
    }
    for (var i = 0; i < group.items.length; i++) {
      var opt = document.createElement('option');
      opt.value = group.items[i].value;
      opt.textContent = group.items[i].label;
      bgPlaceSelect.appendChild(opt);
    }
    bgPlaceSelect.disabled = false;
  }

  function renderBgRegionOptions() {
    if (!bgRegionSelect) return;
    bgGroupsData = getBgGroupsData();
    bgRegionSelect.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = tr('tools.instructEdit.bgRegionPlaceholder');
    bgRegionSelect.appendChild(ph);
    for (var i = 0; i < bgGroupsData.length; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = bgGroupsData[i].label;
      bgRegionSelect.appendChild(opt);
    }
    bgRegionSelect.value = '';
    renderBgPlaceOptions(-1);
  }

  function applyModelCatalog(models) {
    modelCatalog = {};
    if (!models || !models.length) return;
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (!m || !m.id) continue;
      modelCatalog[m.id] = m;
      var inputs = modelInputs();
      for (var j = 0; j < inputs.length; j++) {
        if (inputs[j].value !== m.id) continue;
        if (m.priceCny1K != null) inputs[j].setAttribute('data-price-1k', String(m.priceCny1K));
        if (m.priceCny2K != null) inputs[j].setAttribute('data-price-2k', String(m.priceCny2K));
        if (m.maxRefs != null) inputs[j].setAttribute('data-max-refs', String(m.maxRefs));
      }
    }
  }

  function trimFilesToLimit() {
    var limit = uploadLimit();
    if (files.length <= limit) return false;
    while (files.length > limit) files.pop();
    return true;
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

  function setBusy(on, msg) {
    if (busyEl) busyEl.hidden = !on;
    if (busyTextEl) {
      busyTextEl.textContent = on && msg
        ? msg
        : tr('tools.imageCloud.processing');
    }
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

  function oneModelTimeoutMs(modelId) {
    var id = String(modelId || '').toLowerCase();
    var seedream = id.indexOf('seedream') >= 0;
    var isPro = id.indexOf('-pro') >= 0 || id.indexOf('pro-') >= 0 || /pro$/.test(id);
    var ms;
    if (refMode === 'multi') {
      ms = seedream ? 240000 : (isPro ? 600000 : 420000);
    } else {
      ms = seedream ? 240000 : (isPro ? 540000 : 300000);
    }
    if (C.isWeChat && C.isWeChat()) ms = Math.max(ms, 300000);
    return Math.min(900000, ms);
  }

  function buildEditFormData(modelList, fileList) {
    var list = fileList && fileList.length ? fileList : files;
    var fd = new FormData();
    for (var i = 0; i < list.length; i++) {
      fd.append('files', list[i], list[i].name || ('image-' + (i + 1) + '.jpg'));
    }
    fd.append('prompt', (promptEl && promptEl.value) || '');
    fd.append('ref_mode', refMode);
    fd.append('output_size', outputSize);
    fd.append('public', (publicToggle && publicToggle.checked) ? '1' : '0');
    if (activePreset) fd.append('preset', activePreset);
    for (var m = 0; m < modelList.length; m++) {
      fd.append('models', modelList[m].id);
    }
    return fd;
  }

  function normalizeResultImages(data, fallbackModelId) {
    var images = data && data.images;
    if ((!images || !images.length) && data && (data.imageBase64 || data.imageUrl)) {
      images = [{
        index: 0,
        model: data.model || fallbackModelId,
        imageBase64: data.imageBase64,
        imageUrl: data.imageUrl,
        contentType: data.contentType || 'image/png'
      }];
    }
    return images || [];
  }

  function historyPromptText() {
    var promptText = (promptEl && promptEl.value) || '';
    var presetLabelKeys = {
      manga_to_real: 'tools.instructEdit.presetMangaToReal',
      real_to_manga: 'tools.instructEdit.presetRealToManga',
      restore_old_photo: 'tools.instructEdit.presetRestoreOldPhoto',
      id_photo_white: 'tools.instructEdit.presetIdPhotoWhite',
      remove_watermark: 'tools.instructEdit.presetRemoveWatermark',
      beauty_light: 'tools.instructEdit.presetBeautyLight',
      slim_body: 'tools.instructEdit.presetSlimBody',
      colorize_bw: 'tools.instructEdit.presetColorizeBw',
      product_white_bg: 'tools.instructEdit.presetProductWhiteBg',
      lineart_colorize: 'tools.instructEdit.presetLineartColorize',
      expand_edges: 'tools.instructEdit.presetExpandEdges'
    };
    if (activePreset && presetLabelKeys[activePreset]) {
      promptText = tr(presetLabelKeys[activePreset]);
    }
    return promptText;
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

  function b64ToBlob(b64, ctype) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: ctype || 'image/png' });
  }

  function blobToFile(blob, name) {
    var n = name || 'edit-again.png';
    var type = (blob && blob.type) || 'image/png';
    try {
      return new File([blob], n, { type: type });
    } catch (e) {
      try {
        blob.name = n;
      } catch (e2) {}
      return blob;
    }
  }

  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl || '').split(',');
      if (parts.length < 2) return null;
      var meta = parts[0] || '';
      var b64 = parts[1] || '';
      var m = /data:([^;]+)/i.exec(meta);
      return b64ToBlob(b64, (m && m[1]) || 'image/png');
    } catch (e) {
      return null;
    }
  }

  function resolveImageBlob(item, imgSrc) {
    if (item && item.imageBase64) {
      return Promise.resolve(b64ToBlob(item.imageBase64, item.contentType || 'image/png'));
    }
    if (item && item._wechatDataUrl) {
      var fromWx = dataUrlToBlob(item._wechatDataUrl);
      if (fromWx) return Promise.resolve(fromWx);
    }
    var src = imgSrc || (item && item.imageUrl) || '';
    if (!src) return Promise.reject(new Error('no image'));
    if (String(src).indexOf('data:') === 0) {
      var fromData = dataUrlToBlob(src);
      if (fromData) return Promise.resolve(fromData);
      return Promise.reject(new Error('bad data url'));
    }
    return fetch(src).then(function (res) {
      if (!res.ok) throw new Error('fetch failed');
      return res.blob();
    });
  }

  function useAsInput(item, imgSrc, blobDirect) {
    C.setError(errorBox, '');
    setBusy(true);
    var ready = blobDirect
      ? Promise.resolve(blobDirect)
      : resolveImageBlob(item, imgSrc);
    return ready.then(function (blob) {
      if (!blob || !blob.size) throw new Error('empty');
      if (blob.size > 8 * 1024 * 1024) {
        C.setError(errorBox, tr('tools.instructEdit.tooLarge'));
        setBusy(false);
        return;
      }
      files = [];
      revokePreviews();
      refMode = 'single';
      syncRefModeUi();
      files.push(blobToFile(blob, 'edit-again.png'));
      renderSources();
      syncControlsVisible();
      setBusy(false);
      if (promptEl) {
        try { promptEl.focus(); } catch (e) {}
      }
    }).catch(function () {
      C.setError(errorBox, tr('tools.instructEdit.editAgainFailed'));
      setBusy(false);
    });
  }

  function b64ToBlobUrl(b64, ctype) {
    var blob = b64ToBlob(b64, ctype);
    var url = URL.createObjectURL(blob);
    resultUrls.push(url);
    return url;
  }

  function modelTitle(mid) {
    if (mid === 'image-01-live') return tr('tools.instructEdit.modelMinimax01live');
    if (mid === 'image-01') return tr('tools.instructEdit.modelMinimax01');
    if (mid === 'doubao-seedream-5-0-260128' || String(mid || '').indexOf('seedream') >= 0) {
      return tr('tools.instructEdit.modelSeedream50lite');
    }
    if (mid === 'qwen-image-3.0-pro') return tr('tools.instructEdit.modelQwen30pro');
    if (mid === 'qwen-image-3.0' || String(mid || '').indexOf('qwen-image-3') >= 0) {
      return tr('tools.instructEdit.modelQwen30');
    }
    if (mid === 'wan2.7-image-pro') return tr('tools.instructEdit.modelWan27pro');
    if (mid === 'wan2.7-image') return tr('tools.instructEdit.modelWan27');
    if (mid === 'gpt-image-2' || mid === 'tt-image-2') return tr('tools.instructEdit.modelGptImage2');
    if (mid === 'banana-2' || mid === 'gemini-3.1-flash-image-preview') {
      return tr('tools.instructEdit.modelBanana2');
    }
    if (mid === 'banana-pro' || mid === 'gemini-3-pro-image-preview' || mid === 'gemini-1-pro-image-preview') {
      return tr('tools.instructEdit.modelBananaPro');
    }
    if (mid === 'wan2.6-image') return tr('tools.instructEdit.modelWan26');
    return mid || tr('tools.instructEdit.modelWan26');
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
        if (refMode === 'multi') {
          var badge = document.createElement('span');
          badge.className = 'instruct-source-badge';
          badge.textContent = idx === 0
            ? tr('tools.instructEdit.sourceMain')
            : tr('tools.instructEdit.sourceRef', { n: idx });
          card.appendChild(badge);
        }
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
    if (dropZone) dropZone.hidden = has && files.length >= uploadLimit();
    // Prompt + background presets are useful before uploading; keep visible.
    if (promptWrap) promptWrap.hidden = false;
    if (presetWrap) presetWrap.hidden = false;
    if (modelWrap) modelWrap.hidden = !has;
    if (!has && dropZone) dropZone.hidden = false;
    updateCostHint();
  }

  function blobFromResultSrc(src) {
    if (!src) return Promise.reject(new Error('empty'));
    if (String(src).indexOf('data:') === 0) {
      try {
        var parts = String(src).split(',');
        var meta = parts[0] || '';
        var b64 = parts[1] || '';
        var m = /data:([^;]+)/i.exec(meta);
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return Promise.resolve(new Blob([arr], { type: (m && m[1]) || 'image/png' }));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch(src).then(function (res) {
      if (!res.ok) throw new Error('fetch failed');
      return res.blob();
    });
  }

  function publishResult(item, imgSrc, btn) {
    if (!item || !C.publishPublicImage) return;
    if (item.publicId) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = tr('tools.imageCloud.published');
      }
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = tr('tools.imageCloud.publishing');
    }
    var blobP;
    if (item.imageBase64) {
      try {
        var bin = atob(item.imageBase64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blobP = Promise.resolve(new Blob([arr], { type: item.contentType || 'image/png' }));
      } catch (e) {
        blobP = blobFromResultSrc(imgSrc);
      }
    } else {
      blobP = blobFromResultSrc(imgSrc);
    }
    blobP.then(function (blob) {
      return C.publishPublicImage(blob, {
        prompt: historyPromptText(),
        model: item.model || '',
        source: 'instruct_edit'
      });
    }).then(function (res) {
      if (res && res.publicId) item.publicId = res.publicId;
      if (btn) {
        btn.disabled = true;
        btn.textContent = tr('tools.imageCloud.published');
      }
      if (typeof tbNotify === 'function') tbNotify(tr('tools.imageCloud.publishOk'));
    }).catch(function (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = tr('tools.imageCloud.publish');
      }
      C.setError(errorBox, (err && err.message) || tr('tools.imageCloud.publishFailed'));
    });
  }

  function appendResultCard(grid, item) {
    var card = document.createElement('div');
    card.className = 'instruct-result-card';
    var title = document.createElement('div');
    title.className = 'instruct-result-title';
    title.textContent = modelTitle(item.model);
    var imgWrap = document.createElement('div');
    imgWrap.className = 'instruct-result-img-wrap';
    var img = document.createElement('img');
    img.alt = '';
    imgWrap.appendChild(img);
    var displaySrc = resultSrc(item);
    // WeChat + remote URL only (no base64): convert URL → data: asynchronously.
    // When base64 exists, resultSrc already returns data: via displayImageSrc.
    if (C.isWeChat && C.isWeChat() && item.imageUrl && !item.imageBase64 && C.applyWeChatResultImage) {
      C.applyWeChatResultImage(img, item, displaySrc);
    } else {
      img.src = displaySrc;
    }
    var actions = document.createElement('div');
    actions.className = 'img-hist-actions';
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'tb-btn';
    again.textContent = tr('tools.instructEdit.editAgain');
    again.addEventListener('click', function () {
      useAsInput(item, img.src);
    });
    var dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'tb-btn';
    dl.textContent = tr('tools.instructEdit.download');
    dl.addEventListener('click', function () {
      doDownload(img.src, item);
    });
    var pub = document.createElement('button');
    pub.type = 'button';
    pub.className = 'tb-btn';
    if (item.publicId) {
      pub.disabled = true;
      pub.textContent = tr('tools.imageCloud.published');
    } else {
      pub.textContent = tr('tools.imageCloud.publish');
      pub.addEventListener('click', function () {
        publishResult(item, img.src, pub);
      });
    }
    actions.appendChild(again);
    actions.appendChild(dl);
    actions.appendChild(pub);
    card.appendChild(title);
    card.appendChild(imgWrap);
    if (C.isWeChat && C.isWeChat()) {
      var tip = document.createElement('p');
      tip.className = 'instruct-result-save-tip';
      tip.textContent = tr('tools.imageCloud.longPressSave');
      card.appendChild(tip);
    }
    card.appendChild(actions);
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
      var parts = [];
      for (var pe = 0; pe < partialErrors.length; pe++) {
        var raw = String(partialErrors[pe] || '').trim();
        if (!raw) continue;
        var modelTag = '';
        var m = raw.match(/^([A-Za-z0-9._-]+)#\d+:\s*/);
        if (m) {
          modelTag = modelTitle(m[1]) + '：';
          raw = raw.slice(m[0].length);
        }
        var friendly = C.translateDetail ? C.translateDetail(raw, 502) : raw;
        parts.push(modelTag + friendly);
      }
      note.textContent = tr('tools.instructEdit.partialFail') + ' ' + parts.join('；');
      resultsWrap.appendChild(note);
    }
    resultsWrap.hidden = false;
  }

  function loadStatus() {
    return C.apiJson('/image/status').then(function (s) {
      applyWallet(s.aiWallet);
      if (s.instructEditMaxBatch) MAX_BATCH = s.instructEditMaxBatch;
      applyModelCatalog(s.instructEditModels);
      if (s.instructEditConfigured === false) {
        C.setError(errorBox, tr('tools.instructEdit.dashscopeMissing'));
      }
      syncDropHints();
      updateCostHint();
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
      if (files.length >= uploadLimit()) {
        C.setError(errorBox, tr('tools.instructEdit.tooMany', { max: uploadLimit() }));
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
    renderBgRegionOptions();
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
    // UI choice: keep the direct chip buttons (bg-groups) and hide the dropdown wrapper.
    if (bgSelectWrap) bgSelectWrap.hidden = true;
    if (Hist && !histPanel) {
      histPanel = Hist.bindPanel({
        tool: 'instruct_edit',
        gridEl: document.getElementById('history-grid'),
        emptyEl: document.getElementById('history-empty'),
        clearBtn: document.getElementById('history-clear'),
        tr: tr,
        modelTitle: modelTitle,
        onEditAgain: function (blob) {
          useAsInput(null, null, blob);
        },
        onDownload: function (blob, row) {
          doDownload(blob, row);
        },
        onPublish: function (blob, row) {
          return C.publishPublicImage(blob, {
            prompt: (row && row.prompt) || historyPromptText(),
            model: (row && row.model) || '',
            source: 'instruct_edit'
          }).then(function () {
            if (typeof tbNotify === 'function') tbNotify(tr('tools.imageCloud.publishOk'));
          }).catch(function (err) {
            C.setError(errorBox, (err && err.message) || tr('tools.imageCloud.publishFailed'));
            throw err;
          });
        }
      });
      histPanel.refresh();
    } else if (histPanel) {
      histPanel.refresh();
    }
    syncSelectAllLabel();
    syncRefModeUi();
    syncDropHints();
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
      if (trimFilesToLimit()) renderSources();
      syncSelectAllLabel();
      syncDropHints();
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
      if (trimFilesToLimit()) renderSources();
      syncSelectAllLabel();
      syncDropHints();
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

  if (refModeRow) {
    refModeRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn || btn.disabled) return;
      setRefMode(btn.getAttribute('data-ref-mode') || 'single');
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var models = selectedModels();
      if (!files.length) return;
      if (refMode === 'multi' && files.length < 2) {
        C.setError(errorBox, tr('tools.instructEdit.needMultiRefs'));
        return;
      }
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
      if (C.isWeChat && C.isWeChat() && typeof window.tbNotify === 'function') {
        window.tbNotify(tr('tools.instructEdit.stayOnPageTip'));
      }
      // One HTTP call per model. In single mode with multiple images, also one
      // call per image — WeChat often drops a large multi-image JSON body even
      // when the API already finished (server 200, client shows「改图失败」).
      setBusy(true, models.length > 1
        ? tr('tools.instructEdit.progressModel', {
          current: 1,
          total: models.length,
          model: modelTitle(models[0].id)
        })
        : (files.length > 1 && refMode === 'single'
          ? tr('tools.instructEdit.progressImage', {
            current: 1,
            total: files.length,
            model: modelTitle(models[0].id)
          })
          : tr('tools.imageCloud.processing')));
      runStartedAt = Date.now();
      var headers = {};
      if ((C.isWeChat && C.isWeChat()) || isMobileUA()) headers['X-TB-Light-Response'] = '1';

      var allImages = [];
      var partialErrors = [];
      var lastErrMsg = '';
      var splitImages = refMode === 'single' && files.length > 1;

      function finishElapsed() {
        if (resultMeta && runStartedAt) {
          var seconds = Math.max(1, Math.round((Date.now() - runStartedAt) / 1000));
          resultMeta.textContent = tr('tools.instructEdit.elapsed', { seconds: seconds });
        }
      }

      function pushNormalized(images, mid, indexOffset) {
        for (var ii = 0; ii < images.length; ii++) {
          var img = images[ii];
          if (indexOffset != null && (img.index == null || img.index === 0)) {
            img = Object.assign({}, img, { index: indexOffset });
          }
          allImages.push(img);
        }
      }

      (async function () {
        for (var mi = 0; mi < models.length; mi++) {
          var mid = models[mi].id;
          if (splitImages) {
            for (var fi = 0; fi < files.length; fi++) {
              setBusy(true, tr('tools.instructEdit.progressImage', {
                current: fi + 1,
                total: files.length,
                model: modelTitle(mid)
              }));
              try {
                var dataOne = await C.apiJson('/image/instruct-edit', {
                  method: 'POST',
                  body: buildEditFormData([models[mi]], [files[fi]]),
                  headers: headers,
                  timeoutMs: oneModelTimeoutMs(mid)
                });
                if (dataOne.aiWallet) applyWallet(dataOne.aiWallet);
                var imagesOne = normalizeResultImages(dataOne, mid);
                if (!imagesOne.length) {
                  throw new Error(tr('tools.instructEdit.failed'));
                }
                pushNormalized(imagesOne, mid, fi);
                if (dataOne.partialErrors && dataOne.partialErrors.length) {
                  for (var pe0 = 0; pe0 < dataOne.partialErrors.length; pe0++) {
                    partialErrors.push(dataOne.partialErrors[pe0]);
                  }
                }
                renderResults(allImages, partialErrors);
              } catch (errOne) {
                lastErrMsg = (errOne && errOne.message) || tr('tools.instructEdit.failed');
                partialErrors.push(mid + '#' + (fi + 1) + ': ' + lastErrMsg);
                if (allImages.length) renderResults(allImages, partialErrors);
              }
            }
          } else {
            setBusy(true, tr('tools.instructEdit.progressModel', {
              current: mi + 1,
              total: models.length,
              model: modelTitle(mid)
            }));
            try {
              var data = await C.apiJson('/image/instruct-edit', {
                method: 'POST',
                body: buildEditFormData([models[mi]]),
                headers: headers,
                timeoutMs: oneModelTimeoutMs(mid)
              });
              if (data.aiWallet) applyWallet(data.aiWallet);
              var images = normalizeResultImages(data, mid);
              if (!images.length) {
                throw new Error(tr('tools.instructEdit.failed'));
              }
              pushNormalized(images, mid, null);
              if (data.partialErrors && data.partialErrors.length) {
                for (var pe = 0; pe < data.partialErrors.length; pe++) {
                  partialErrors.push(data.partialErrors[pe]);
                }
              }
              renderResults(allImages, partialErrors);
            } catch (err) {
              lastErrMsg = (err && err.message) || tr('tools.instructEdit.failed');
              partialErrors.push(mid + '#1: ' + lastErrMsg);
              if (allImages.length) renderResults(allImages, partialErrors);
            }
          }
        }

        if (!allImages.length) {
          throw new Error(lastErrMsg || tr('tools.instructEdit.failed'));
        }
        C.setError(errorBox, '');
        finishElapsed();
        if (histPanel) {
          histPanel.save(allImages, { prompt: historyPromptText() });
        }
      })().catch(function (err) {
        C.setError(errorBox, (err && err.message) || tr('tools.instructEdit.failed'));
        finishElapsed();
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
      if (bgUi) bgUi.reset();
      syncControlsVisible();
      syncSelectAllLabel();
      updateCostHint();
      C.setError(errorBox, '');
      if (resultMeta) resultMeta.textContent = '';
      setBusy(false);
    });
  }

  if (window.InstructEditBgUi) {
    bgUi = window.InstructEditBgUi.bind({
      promptEl: promptEl,
      toggleBtn: bgToggleBtn,
      panelEl: bgPanelEl,
      timeRowEl: bgTimeRow,
      groupsEl: bgGroupsEl,
      tr: tr,
      onPromptChange: function () {
        setBusy(false);
        updateCostHint();
      }
    });
  }

  if (bgRegionSelect) {
    bgRegionSelect.addEventListener('change', function () {
      renderBgPlaceOptions(parseInt(bgRegionSelect.value || '-1', 10));
    });
  }
  if (bgPlaceSelect) {
    bgPlaceSelect.addEventListener('change', function () {
      var place = (bgPlaceSelect.value || '').trim();
      if (!place) return;
      if (bgUi) bgUi.applyPlace(place);
    });
  }

  document.addEventListener('tb:locale', function () {
    applyLocaleBits();
    if (bgUi) bgUi.setExpanded(bgUi.getExpanded());
    syncSelectAllLabel();
    syncRefModeUi();
    syncDropHints();
    renderSources();
    updateCostHint();
    if (histPanel) histPanel.refresh();
  });

  boot();
})();
