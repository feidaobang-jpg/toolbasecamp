(function () {
  'use strict';
  var C = window.TBImageCloud;
  var Hist = window.TBImageGenHistory;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var modeRow = document.getElementById('mode-row');
  var modeHint = document.getElementById('mode-hint');
  var photoSection = document.getElementById('photo-section');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var sourceImg = document.getElementById('source-img');
  var removePhotoBtn = document.getElementById('remove-photo');
  var modelRow = document.getElementById('model-row');
  var costHint = document.getElementById('cost-hint');
  var promptEl = document.getElementById('prompt');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var balanceLine = document.getElementById('balance-line');
  var errorBox = document.getElementById('error-box');
  var resultsWrap = document.getElementById('results-wrap');
  var busyEl = document.getElementById('busy');
  var wechatTip = document.getElementById('wechat-tip');
  var historyHint = document.getElementById('history-hint');
  var styleRow = document.getElementById('style-row');
  var publicToggle = document.getElementById('public-toggle');
  var resultUrls = [];
  var priceMarkup = 2;
  var histPanel = null;
  var activeStyle = 'sticker';
  var mode = 'text';
  var photoFile = null;
  var previewUrl = '';

  var STYLE_SNIPPETS = {
    sticker: '风格：表情包贴纸，1:1方形，透明或简洁背景，夸张表情，适合微信聊天，全彩',
    meme: '风格：中文梗图，1:1方形，夸张表情，留白便于加字，网络 meme 感，全彩',
    'q版': '风格：Q版卡通头像贴纸，1:1方形，可爱大头，适合聊天表情，全彩',
    emoji: '风格：微信表情系列感，1:1方形，统一画风，单角色多情绪，全彩',
    reaction: '风格：反应类表情，1:1方形，强烈情绪（震惊/无语/点赞），全彩'
  };

  function tr(key, params) {
    return C.tr(key, params);
  }

  function applyStylePreset(id) {
    if (!promptEl || !id || !STYLE_SNIPPETS[id]) return;
    activeStyle = id;
    if (styleRow) {
      var chips = styleRow.querySelectorAll('.rec-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-style') || '') === id);
      }
    }
    var snippet = STYLE_SNIPPETS[id];
    var v = (promptEl.value || '').trim();
    var lines = v ? v.split(/\n/) : [];
    var out = [];
    for (var j = 0; j < lines.length; j++) {
      var line = (lines[j] || '').trim();
      if (!line) continue;
      if (line.indexOf('风格：') === 0) continue;
      out.push(line);
    }
    out.push(snippet);
    promptEl.value = out.join('\n');
    setBusy(false);
  }

  function downloadName(item) {
    return 'ai-meme-' + String((item && item.model) || 'out').replace(/[^\w.-]+/g, '-') + '.png';
  }

  function doDownload(blobOrUrl, item) {
    C.downloadBlob(blobOrUrl, downloadName(item || {}), {
      tipEl: wechatTip,
      errorEl: errorBox
    });
  }

  function resultSrc(b64, ctype) {
    if (C.displayImageSrc) {
      var src = C.displayImageSrc(b64, ctype);
      if (String(src).indexOf('blob:') === 0) resultUrls.push(src);
      return src;
    }
    if (C.isWeChat && C.isWeChat() && C.b64ToDataUrl) {
      return C.b64ToDataUrl(b64, ctype);
    }
    return b64ToBlobUrl(b64, ctype);
  }

  function modelInputs() {
    return modelRow ? modelRow.querySelectorAll('input[name="aimeme-model"]') : [];
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
    var hasPrompt = !!(promptEl && promptEl.value.trim());
    if (mode === 'photo' && !photoFile) return false;
    return hasPrompt && selectedModels().length > 0;
  }

  function updateCostHint() {
    if (!costHint) return;
    var models = selectedModels();
    if (!models.length) {
      costHint.textContent = tr('tools.aiMeme.costHintEmpty');
      return;
    }
    var total = 0;
    for (var i = 0; i < models.length; i++) total += models[i].price;
    total = Math.round(total * priceMarkup * 100) / 100;
    costHint.textContent = tr('tools.aiMeme.costHint', {
      models: models.length,
      runs: models.length,
      price: total
    });
  }

  function applyWallet(wallet) {
    if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
    if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
    updateCostHint();
  }

  function setMode(next) {
    mode = next || 'text';
    if (modeRow) {
      var chips = modeRow.querySelectorAll('.rec-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-mode') || '') === mode);
      }
    }
    if (photoSection) photoSection.hidden = mode !== 'photo';
    if (modeHint) {
      modeHint.textContent = mode === 'photo'
        ? tr('tools.aiMeme.modePhotoHint')
        : tr('tools.aiMeme.modeTextHint');
    }
    setBusy(false);
  }

  function clearPhoto() {
    photoFile = null;
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      previewUrl = '';
    }
    if (sourceWrap) sourceWrap.hidden = true;
    if (dropZone) dropZone.hidden = false;
    if (sourceImg) sourceImg.src = '';
    setBusy(false);
  }

  function loadPhoto(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      C.setError(errorBox, tr('tools.aiMeme.invalidFile'));
      return;
    }
    C.setError(errorBox, '');
    clearPhoto();
    photoFile = file;
    previewUrl = URL.createObjectURL(file);
    if (sourceImg) sourceImg.src = previewUrl;
    if (sourceWrap) sourceWrap.hidden = false;
    if (dropZone) dropZone.hidden = true;
    setBusy(false);
  }

  function setBusy(on, msg) {
    if (busyEl) {
      busyEl.hidden = !on;
      var label = busyEl.querySelector('span:not(.img-cloud-spinner)');
      if (label) label.textContent = msg || tr('tools.imageCloud.processing');
    }
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !!on;
    if (styleRow) {
      var chips = styleRow.querySelectorAll('.rec-chip');
      for (var c = 0; c < chips.length; c++) chips[c].disabled = !!on;
    }
    if (modeRow) {
      var modeChips = modeRow.querySelectorAll('.rec-chip');
      for (var m = 0; m < modeChips.length; m++) modeChips[m].disabled = !!on;
    }
  }

  function oneModelTimeoutMs(modelId) {
    return 180000;
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
    if (mid === 'image-01-live') return tr('tools.aiMeme.modelLive');
    if (mid === 'image-01') return tr('tools.aiMeme.model01');
    return mid || tr('tools.aiMeme.modelLive');
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
        img.alt = '';
        img.src = resultSrc(item.imageBase64, item.contentType);
        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'tb-btn';
        dl.textContent = tr('tools.aiMeme.download');
        dl.addEventListener('click', function () {
          doDownload(img.src, item);
        });
        var actions = document.createElement('div');
        actions.className = 'img-hist-actions';
        actions.appendChild(dl);
        card.appendChild(title);
        card.appendChild(img);
        if (C.isWeChat && C.isWeChat()) {
          var tip = document.createElement('p');
          tip.className = 'instruct-result-save-tip';
          tip.textContent = tr('tools.imageCloud.longPressSave');
          card.appendChild(tip);
        }
        card.appendChild(actions);
        grid.appendChild(card);
      })(images[i]);
    }
    resultsWrap.appendChild(grid);
    if (partialErrors && partialErrors.length) {
      var note = document.createElement('p');
      note.className = 'instruct-partial-err';
      note.textContent = tr('tools.aiMeme.partialFail') + ' ' + partialErrors.join('; ');
      resultsWrap.appendChild(note);
    }
    resultsWrap.hidden = false;
  }

  function buildPhotoFormData(modelId) {
    var fd = new FormData();
    fd.append('files', photoFile, photoFile.name || 'photo.jpg');
    fd.append('prompt', (promptEl && promptEl.value) || '');
    fd.append('ref_mode', 'single');
    fd.append('output_size', '1K');
    fd.append('public', (publicToggle && publicToggle.checked) ? '1' : '0');
    fd.append('models', modelId);
    return fd;
  }

  function buildTextFormData(modelId) {
    var fd = new FormData();
    fd.append('prompt', (promptEl && promptEl.value) || '');
    fd.append('size', 'square');
    fd.append('public', (publicToggle && publicToggle.checked) ? '1' : '0');
    fd.append('models', modelId);
    return fd;
  }

  function loadStatus() {
    return C.apiJson('/image/status').then(function (s) {
      applyWallet(s.aiWallet);
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
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
    applyStylePreset('sticker');
    applyLocaleBits();
    if (Hist && !histPanel) {
      histPanel = Hist.bindPanel({
        tool: 'ai_meme',
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
    updateCostHint();
    setBusy(false);
    loadStatus();
  }

  if (promptEl) {
    promptEl.addEventListener('input', function () { setBusy(false); });
  }
  if (modelRow) {
    modelRow.addEventListener('change', function () {
      updateCostHint();
      setBusy(false);
    });
  }
  if (modeRow) {
    modeRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn || btn.disabled) return;
      setMode(btn.getAttribute('data-mode') || 'text');
    });
  }
  if (dropZone) {
    dropZone.addEventListener('click', function () { fileInput.click(); });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) loadPhoto(fileInput.files[0]);
      fileInput.value = '';
    });
  }
  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', clearPhoto);
  }
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (mode !== 'photo') return;
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadPhoto(f);
  });

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var models = selectedModels();
      var prompt = (promptEl && promptEl.value || '').trim();
      if (!prompt) {
        C.setError(errorBox, tr('tools.aiMeme.needPrompt'));
        return;
      }
      if (mode === 'photo' && !photoFile) {
        C.setError(errorBox, tr('tools.aiMeme.needPhoto'));
        return;
      }
      if (!models.length) {
        C.setError(errorBox, tr('tools.aiMeme.needModel'));
        return;
      }
      C.setError(errorBox, '');
      setBusy(true, models.length > 1
        ? tr('tools.aiMeme.progressModel', { current: 1, total: models.length, model: modelTitle(models[0].id) })
        : tr('tools.imageCloud.processing'));

      var allImages = [];
      var partialErrors = [];
      var endpoint = (mode === 'photo') ? '/image/instruct-edit' : '/image/text-to-image';

      (async function () {
        for (var mi = 0; mi < models.length; mi++) {
          var mid = models[mi].id;
          if (models.length > 1) {
            setBusy(true, tr('tools.aiMeme.progressModel', {
              current: mi + 1,
              total: models.length,
              model: modelTitle(mid)
            }));
          }
          var fd = mode === 'photo' ? buildPhotoFormData(mid) : buildTextFormData(mid);
          try {
            var data = await C.apiJson(endpoint, {
              method: 'POST',
              body: fd,
              timeoutMs: oneModelTimeoutMs(mid)
            });
            if (data.aiWallet) applyWallet(data.aiWallet);
            var images = data.images;
            if ((!images || !images.length) && data.imageBase64) {
              images = [{
                model: data.model || mid,
                imageBase64: data.imageBase64,
                contentType: data.contentType || 'image/png'
              }];
            }
            if (!images || !images.length) throw new Error(tr('tools.aiMeme.failed'));
            for (var ii = 0; ii < images.length; ii++) {
              if (!images[ii].model) images[ii].model = mid;
              allImages.push(images[ii]);
            }
            if (data.partialErrors && data.partialErrors.length) {
              for (var pe = 0; pe < data.partialErrors.length; pe++) {
                partialErrors.push(data.partialErrors[pe]);
              }
            }
            renderResults(allImages, partialErrors);
          } catch (errOne) {
            partialErrors.push(modelTitle(mid) + ': ' + ((errOne && errOne.message) || String(errOne)));
            if (allImages.length) renderResults(allImages, partialErrors);
          }
        }
        if (!allImages.length) {
          throw new Error(partialErrors.length
            ? (tr('tools.aiMeme.partialFail') + ' ' + partialErrors.join('; '))
            : tr('tools.aiMeme.failed'));
        }
        if (histPanel) histPanel.save(allImages, { prompt: prompt });
      })().catch(function (err) {
        C.setError(errorBox, err.message);
      }).finally(function () {
        setBusy(false);
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (promptEl) promptEl.value = '';
      revokeResults();
      clearPhoto();
      setMode('text');
      activeStyle = 'sticker';
      applyStylePreset('sticker');
      var inputs = modelInputs();
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].checked = inputs[i].value === 'image-01-live';
      }
      updateCostHint();
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  if (styleRow) {
    styleRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn || btn.disabled) return;
      applyStylePreset(btn.getAttribute('data-style') || '');
    });
  }

  document.addEventListener('tb:locale', function () {
    applyLocaleBits();
    updateCostHint();
    if (histPanel) histPanel.refresh();
    if (modeHint) {
      modeHint.textContent = mode === 'photo'
        ? tr('tools.aiMeme.modePhotoHint')
        : tr('tools.aiMeme.modeTextHint');
    }
  });

  boot();
})();
