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
  var styleRow = document.getElementById('style-row');
  var resultUrls = [];
  var priceMarkup = 2;
  var histPanel = null;
  var activeStyle = '';

  var STYLE_SNIPPETS = {
    photo: '风格：写实摄影，自然光，真实细节，全彩',
    film: '风格：胶片摄影，轻微颗粒，暖色调，全彩',
    anime: '风格：日式动漫插画，全彩赛璐璐上色，禁止未上色线稿',
    product: '风格：电商产品主图，干净背景，工作室灯光，全彩',
    landscape: '风格：风景大片，广角通透，大气构图，全彩',
    portrait: '风格：人像写真，浅景深，柔和光影，全彩',
    poster: '风格：平面海报，构图清晰，视觉冲击力，全彩'
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
    return 'text-to-image-' + String((item && item.model) || 'out').replace(/[^\w.-]+/g, '-') + '.png';
  }

  function doDownload(blobOrUrl, item) {
    C.downloadBlob(blobOrUrl, downloadName(item || {}), {
      tipEl: wechatTip,
      errorEl: errorBox
    });
  }

  function resultSrc(b64, ctype) {
    // WeChat: data: URL required for long-press save/forward — never blob:.
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
    if (styleRow) {
      var chips = styleRow.querySelectorAll('.rec-chip');
      for (var c = 0; c < chips.length; c++) chips[c].disabled = !!on;
    }
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
    if (mid === 'wan2.6-image') return tr('tools.instructEdit.modelWan26');
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
        img.alt = '';
        img.src = resultSrc(item.imageBase64, item.contentType);
        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'tb-btn';
        dl.textContent = tr('tools.textToImage.download');
        dl.addEventListener('click', function () {
          doDownload(img.src, item);
        });
        card.appendChild(title);
        card.appendChild(img);
        if (C.isWeChat && C.isWeChat()) {
          var tip = document.createElement('p');
          tip.className = 'instruct-result-save-tip';
          tip.textContent = tr('tools.imageCloud.longPressSave');
          card.appendChild(tip);
        }
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
      C.apiJson('/image/text-to-image', { method: 'POST', body: fd, timeoutMs: 60000 }).then(function (data) {
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
      activeStyle = '';
      if (styleRow) {
        var chips = styleRow.querySelectorAll('.rec-chip');
        for (var c = 0; c < chips.length; c++) chips[c].classList.remove('is-active');
      }
      syncSelectAllLabel();
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
    syncSelectAllLabel();
    updateCostHint();
    if (histPanel) histPanel.refresh();
  });

  boot();
})();
