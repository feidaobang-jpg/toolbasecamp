(function () {
  'use strict';
  var C = window.TBImageCloud;
  var Hist = window.TBImageGenHistory;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var modelRow = document.getElementById('model-row');
  var selectAllBtn = document.getElementById('select-all-models');
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
  var resultUrls = [];
  var priceMarkup = 2;
  var histPanel = null;

  function tr(key, params) {
    return C.tr(key, params);
  }

  function downloadName(item) {
    return 'text-to-image-' + String((item && item.model) || 'out').replace(/[^\w.-]+/g, '-') + '.png';
  }

  function doDownload(blobOrUrl, item) {
    C.downloadBlob(blobOrUrl, downloadName(item || {}), {
      tipEl: wechatTip,
      errorEl: errorBox
    });
  }

  function resultSrc(b64, ctype) {
    if (C.isWeChat && C.isWeChat()) return C.b64ToDataUrl(b64, ctype);
    return b64ToBlobUrl(b64, ctype);
  }

  function modelInputs() {
    return modelRow ? modelRow.querySelectorAll('input[name="t2i-model"]') : [];
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

  function selectedSize() {
    var el = document.querySelector('input[name="t2i-size"]:checked');
    return (el && el.value) || 'square';
  }

  function canRun() {
    return !!(promptEl && promptEl.value.trim()) && selectedModels().length > 0;
  }

  function updateCostHint() {
    if (!costHint) return;
    var models = selectedModels();
    if (!models.length) {
      costHint.textContent = tr('tools.textToImage.costHintEmpty');
      return;
    }
    var total = 0;
    for (var i = 0; i < models.length; i++) total += models[i].price;
    total = Math.round(total * priceMarkup * 100) / 100;
    costHint.textContent = tr('tools.textToImage.costHint', {
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


  function syncSelectAllLabel() {
    if (!selectAllBtn) return;
    var inputs = modelInputs();
    var all = inputs.length > 0;
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checked) { all = false; break; }
    }
    selectAllBtn.textContent = all
      ? tr('tools.textToImage.deselectAllModels')
      : tr('tools.textToImage.selectAllModels');
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
    if (selectAllBtn) selectAllBtn.disabled = !!on;
    var inputs = modelInputs();
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !!on;
    var sizes = document.querySelectorAll('input[name="t2i-size"]');
    for (var s = 0; s < sizes.length; s++) sizes[s].disabled = !!on;
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
    if (mid === 'wan2.7-image-pro') return tr('tools.textToImage.modelWan27pro');
    if (mid === 'wan2.7-image') return tr('tools.textToImage.modelWan27');
    if (mid === 'qwen-image-2.0') return tr('tools.textToImage.model20');
    return tr('tools.textToImage.modelZTurbo');
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
        img.src = resultSrc(item.imageBase64, item.contentType);
        C.bindImagePreview(img);
        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'tb-btn';
        dl.textContent = tr('tools.textToImage.download');
        dl.addEventListener('click', function () {
          doDownload(img.src, item);
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
      note.textContent = tr('tools.textToImage.partialFail') + ' ' + partialErrors.join('; ');
      resultsWrap.appendChild(note);
    }
    resultsWrap.hidden = false;
  }

  function loadStatus() {
    return C.apiJson('/image/status').then(function (s) {
      applyWallet(s.aiWallet);
      if (s.textToImageConfigured === false) {
        C.setError(errorBox, tr('tools.textToImage.dashscopeMissing'));
      }
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
    applyLocaleBits();
    if (Hist && !histPanel) {
      histPanel = Hist.bindPanel({
        tool: 'text_to_image',
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
    setBusy(false);
    loadStatus();
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

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var models = selectedModels();
      var prompt = (promptEl && promptEl.value || '').trim();
      if (!prompt) {
        C.setError(errorBox, tr('tools.textToImage.needPrompt'));
        return;
      }
      if (!models.length) {
        C.setError(errorBox, tr('tools.textToImage.needModel'));
        return;
      }
      C.setError(errorBox, '');
      setBusy(true);
      var fd = new FormData();
      fd.append('prompt', prompt);
      fd.append('size', selectedSize());
      for (var m = 0; m < models.length; m++) fd.append('models', models[m].id);
      C.apiJson('/image/text-to-image', { method: 'POST', body: fd }).then(function (data) {
        if (data.aiWallet) applyWallet(data.aiWallet);
        var images = data.images;
        if ((!images || !images.length) && data.imageBase64) {
          images = [{
            model: data.model || models[0].id,
            imageBase64: data.imageBase64,
            contentType: data.contentType || 'image/png'
          }];
        }
        if (!images || !images.length) throw new Error(tr('tools.textToImage.failed'));
        renderResults(images, data.partialErrors);
        if (histPanel) histPanel.save(images, { prompt: prompt });
      }).catch(function (err) {
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
      var inputs = modelInputs();
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].checked = inputs[i].value === 'z-image-turbo';
      }
      var sq = document.querySelector('input[name="t2i-size"][value="square"]');
      if (sq) sq.checked = true;
      syncSelectAllLabel();
      updateCostHint();
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  document.addEventListener('tb:locale', function () {
    applyLocaleBits();
    syncSelectAllLabel();
    updateCostHint();
    if (histPanel) histPanel.refresh();
  });

  boot();
})();
