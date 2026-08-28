(function () {
  'use strict';

  var C = window.TBImageCloud;
  if (!C) return;

  var MAX_REFS = 9;
  var loginGate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var balanceLine = document.getElementById('balance-line');
  var estimateLine = document.getElementById('estimate-line');
  var costNote = document.getElementById('cost-note');
  var modelRow = document.getElementById('model-row');
  var modelLine = document.getElementById('model-line');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var thumbs = document.getElementById('thumbs');
  var promptInput = document.getElementById('prompt-input');
  var promptPresets = document.getElementById('prompt-presets');
  var durationInput = document.getElementById('duration-input');
  var durationHint = document.getElementById('duration-hint');
  var resolutionSelect = document.getElementById('resolution-select');
  var ratioSelect = document.getElementById('ratio-select');
  var runBtn = document.getElementById('run-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var errorBox = document.getElementById('error-box');
  var resultWrap = document.getElementById('result-wrap');
  var resultVideo = document.getElementById('result-video');
  var wechatFileDownloadTip = document.getElementById('wechat-file-download-tip');

  var modelId = 'happyhorse';
  var hhConfigured = false;
  var sdConfigured = false;
  var hhLimits = { min: 3, max: 15, maxRefs: 9 };
  var sdLimits = { min: 4, max: 30, maxRefs: 9 };
  var priceMarkup = 2;
  var hhListPerSec = { '480P': 0.45, '720P': 0.9, '1080P': 1.2 };
  var sdListPerSec = { '480p': 1.33, '720p': 3.0, '480P': 1.33, '720P': 3.0 };
  var refFiles = [];
  var previewUrls = [];
  var taskId = '';
  var videoBlobUrl = '';
  var polling = false;
  var pollTimer = null;

  function isSeedance() {
    return modelId === 'seedance';
  }

  function configured() {
    return isSeedance() ? sdConfigured : hhConfigured;
  }

  function limits() {
    return isSeedance() ? sdLimits : hhLimits;
  }

  function maxUploadBytes() {
    return isSeedance() ? 10 * 1024 * 1024 : 8 * 1024 * 1024;
  }

  function apiBase() {
    return isSeedance() ? '/seedance' : '/happyhorse';
  }

  function tbIsWeChatNow() {
    return typeof window.tbIsWeChat === 'function' ? window.tbIsWeChat() : false;
  }

  function maybeShowWeChatFileDownloadTip() {
    if (!wechatFileDownloadTip) return;
    wechatFileDownloadTip.hidden = !tbIsWeChatNow();
  }

  function readDuration() {
    var lim = limits();
    var n = parseInt(durationInput && durationInput.value, 10);
    if (!isFinite(n)) n = 5;
    return Math.max(lim.min, Math.min(lim.max, n));
  }

  function currentResKey() {
    var res = (resolutionSelect && resolutionSelect.value) || (isSeedance() ? '480p' : '480P');
    if (isSeedance()) {
      return String(res).toLowerCase().replace(/p$/i, '') + 'p';
    }
    return String(res).toUpperCase();
  }

  function currentEstimate() {
    var dur = readDuration();
    var res = currentResKey();
    var map = isSeedance() ? sdListPerSec : hhListPerSec;
    var listRate = map[res];
    if (listRate == null) listRate = isSeedance() ? 3.0 : 0.9;
    return { duration: dur, resolution: res, price: listRate * dur * priceMarkup };
  }

  function updateEstimate() {
    if (!estimateLine) return;
    var est = currentEstimate();
    estimateLine.hidden = false;
    estimateLine.textContent = C.tr('tools.refToVideo.estimateLine', {
      price: est.price.toFixed(2),
      duration: String(est.duration),
      resolution: est.resolution
    });
  }

  function applyWallet(wallet) {
    if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
    if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
    updateEstimate();
  }

  function syncModelUi() {
    if (modelRow) {
      modelRow.querySelectorAll('[data-model]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-model') === modelId);
      });
    }
    var lim = limits();
    if (durationInput) {
      durationInput.min = String(lim.min);
      durationInput.max = String(lim.max);
      var cur = parseInt(durationInput.value, 10) || 5;
      durationInput.value = String(Math.max(lim.min, Math.min(lim.max, cur)));
    }
    if (durationHint) {
      durationHint.textContent = C.tr(
        isSeedance() ? 'tools.refToVideo.durationHintSeedance' : 'tools.refToVideo.durationHintHappyhorse'
      );
    }
    if (costNote) {
      costNote.textContent = C.tr(
        isSeedance() ? 'tools.refToVideo.costNoteSeedance' : 'tools.refToVideo.costNoteHappyhorse'
      );
    }
    if (modelLine) {
      modelLine.textContent = C.tr(
        isSeedance() ? 'tools.refToVideo.modelLineSeedance' : 'tools.refToVideo.modelLineHappyhorse'
      );
    }
    if (resolutionSelect) {
      var opts = resolutionSelect.options;
      for (var i = 0; i < opts.length; i++) {
        var v = opts[i].value;
        if (v === '1080P') {
          opts[i].hidden = isSeedance();
          opts[i].disabled = isSeedance();
        }
        if (isSeedance()) {
          if (v === '480P') opts[i].textContent = C.tr('tools.refToVideo.res480Sd');
          if (v === '720P') opts[i].textContent = C.tr('tools.refToVideo.res720Sd');
        } else {
          if (v === '480P') opts[i].textContent = C.tr('tools.refToVideo.res480Hh');
          if (v === '720P') opts[i].textContent = C.tr('tools.refToVideo.res720Hh');
          if (v === '1080P') opts[i].textContent = C.tr('tools.refToVideo.res1080Hh');
        }
      }
      if (isSeedance() && resolutionSelect.value === '1080P') {
        resolutionSelect.value = '480P';
      }
    }
    if (ratioSelect) {
      Array.prototype.forEach.call(ratioSelect.options, function (opt) {
        var extra = opt.value === 'adaptive' || opt.value === '4:3' || opt.value === '3:4' || opt.value === '21:9';
        opt.hidden = extra && !isSeedance();
        if (extra && !isSeedance() && ratioSelect.value === opt.value) {
          ratioSelect.value = '16:9';
        }
      });
    }
    updateEstimate();
    setBusy(!!polling);
  }

  function setBusy(on, msg) {
    C.setBusy(busyEl, busyText, on, msg || C.tr('tools.refToVideo.generating'));
    var ok = refFiles.length > 0 && !!(promptInput.value || '').trim() && configured();
    runBtn.disabled = on || !ok;
    clearBtn.disabled = on;
    downloadBtn.disabled = on || !videoBlobUrl;
    promptInput.disabled = on;
    if (durationInput) durationInput.disabled = on;
    if (resolutionSelect) resolutionSelect.disabled = on;
    if (ratioSelect) ratioSelect.disabled = on;
    if (modelRow) {
      modelRow.querySelectorAll('[data-model]').forEach(function (btn) {
        btn.disabled = !!on;
      });
    }
    if (promptPresets) {
      promptPresets.querySelectorAll('.wan-preset').forEach(function (btn) {
        btn.disabled = !!on;
      });
    }
  }

  function revokePreviews() {
    previewUrls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ }
    });
    previewUrls = [];
  }

  function revokeVideo() {
    if (videoBlobUrl) {
      URL.revokeObjectURL(videoBlobUrl);
      videoBlobUrl = '';
    }
    resultVideo.removeAttribute('src');
    resultVideo.load();
    resultWrap.hidden = true;
  }

  function stopPoll() {
    polling = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function renderThumbs() {
    thumbs.innerHTML = '';
    refFiles.forEach(function (file, i) {
      var wrap = document.createElement('div');
      wrap.className = 'r2v-thumb';
      var img = document.createElement('img');
      var url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url;
      img.alt = 'Image ' + (i + 1);
      var idx = document.createElement('span');
      idx.className = 'r2v-idx';
      idx.textContent = String(i + 1);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'r2v-rm';
      rm.setAttribute('aria-label', 'Remove');
      rm.textContent = '×';
      rm.addEventListener('click', function () {
        if (polling) return;
        refFiles.splice(i, 1);
        revokePreviews();
        renderThumbs();
        setBusy(false);
      });
      wrap.appendChild(img);
      wrap.appendChild(idx);
      wrap.appendChild(rm);
      thumbs.appendChild(wrap);
    });
  }

  function addFiles(fileList) {
    C.setError(errorBox, '');
    var arr = Array.prototype.slice.call(fileList || []);
    var maxBytes = maxUploadBytes();
    var pending = [];
    arr.forEach(function (f) {
      if (!f || !String(f.type || '').startsWith('image/')) return;
      pending.push(f);
    });
    if (!pending.length) return;

    var room = Math.max(0, MAX_REFS - refFiles.length);
    var slice = pending.slice(0, room);
    if (pending.length > room) {
      C.setError(errorBox, C.tr('tools.refToVideo.tooMany', { max: String(MAX_REFS) }));
    }
    if (!slice.length) return;

    function apply(out) {
      (out || []).forEach(function (f) {
        if (!f) return;
        if (f.size > maxBytes) {
          C.setError(errorBox, C.tr('tools.refToVideo.tooLarge'));
          return;
        }
        if (refFiles.length >= MAX_REFS) {
          C.setError(errorBox, C.tr('tools.refToVideo.tooMany', { max: String(MAX_REFS) }));
          return;
        }
        refFiles.push(f);
      });
      revokePreviews();
      renderThumbs();
      setBusy(false);
      updateEstimate();
    }

    if (window.TBImageUploadCompress && TBImageUploadCompress.compressMany) {
      TBImageUploadCompress.compressMany(slice, 'video').then(apply).catch(function () {
        apply(slice);
      });
    } else {
      apply(slice);
    }
  }

  function applyHhStatus(s) {
    hhConfigured = !!s.configured;
    if (s.pricing && s.pricing.listPerSec) Object.assign(hhListPerSec, s.pricing.listPerSec);
    if (s.minDuration != null) hhLimits.min = Number(s.minDuration) || hhLimits.min;
    if (s.maxDuration != null) hhLimits.max = Number(s.maxDuration) || hhLimits.max;
    if (s.maxRefImages) hhLimits.maxRefs = Number(s.maxRefImages) || hhLimits.maxRefs;
    if (s.wallet) applyWallet(s.wallet);
  }

  function applySdStatus(s) {
    sdConfigured = !!s.configured;
    if (s.pricing && s.pricing.listPerSec) Object.assign(sdListPerSec, s.pricing.listPerSec);
    if (s.minDuration != null) sdLimits.min = Number(s.minDuration) || sdLimits.min;
    if (s.maxDuration != null) sdLimits.max = Number(s.maxDuration) || sdLimits.max;
    if (s.maxRefImages) sdLimits.maxRefs = Number(s.maxRefImages) || sdLimits.maxRefs;
    if (s.wallet) applyWallet(s.wallet);
  }

  function loadStatus() {
    return Promise.all([
      C.apiJson('/happyhorse/status').catch(function () { return { configured: false }; }),
      C.apiJson('/seedance/status').catch(function () { return { configured: false }; })
    ]).then(function (pair) {
      applyHhStatus(pair[0] || {});
      applySdStatus(pair[1] || {});
      MAX_REFS = limits().maxRefs;
      if (!hhConfigured && sdConfigured) modelId = 'seedance';
      if (!sdConfigured && hhConfigured) modelId = 'happyhorse';
      syncModelUi();
      if (!hhConfigured && !sdConfigured) {
        C.setError(errorBox, C.tr('tools.refToVideo.notConfigured'));
      } else if (!configured()) {
        C.setError(
          errorBox,
          C.tr(isSeedance() ? 'tools.refToVideo.notConfiguredSeedance' : 'tools.refToVideo.notConfiguredHappyhorse')
        );
      } else {
        C.setError(errorBox, '');
      }
      setBusy(false);
    }).catch(function (err) {
      C.setError(errorBox, err.message);
      setBusy(false);
    });
  }

  function clearAll() {
    stopPoll();
    revokeVideo();
    revokePreviews();
    refFiles = [];
    thumbs.innerHTML = '';
    taskId = '';
    promptInput.value = '';
    if (durationInput) durationInput.value = '5';
    if (resolutionSelect) resolutionSelect.value = '480P';
    if (ratioSelect) ratioSelect.value = '16:9';
    if (fileInput) fileInput.value = '';
    C.setError(errorBox, '');
    setBusy(false);
    loadStatus();
  }

  function fetchVideoBlob() {
    return C.apiBlob(apiBase() + '/r2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
      revokeVideo();
      videoBlobUrl = URL.createObjectURL(res.blob);
      resultVideo.src = videoBlobUrl;
      resultWrap.hidden = false;
      downloadBtn.disabled = false;
    });
  }

  function pollOnce() {
    if (!polling || !taskId) return;
    C.apiJson(apiBase() + '/r2v/task/' + encodeURIComponent(taskId))
      .then(function (data) {
        var status = String(data.status || '').toUpperCase();
        if (status === 'SUCCEEDED') {
          stopPoll();
          if (data.wallet) applyWallet(data.wallet);
          setBusy(true, C.tr('tools.refToVideo.downloading'));
          return fetchVideoBlob().then(function () {
            setBusy(false);
            loadStatus();
          });
        }
        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          stopPoll();
          setBusy(false);
          C.setError(errorBox, data.message || C.tr('tools.refToVideo.failed'));
          loadStatus();
          return;
        }
        setBusy(true, status === 'RUNNING'
          ? C.tr('tools.refToVideo.running')
          : C.tr('tools.refToVideo.queued'));
        pollTimer = setTimeout(pollOnce, isSeedance() ? 5000 : 4000);
      })
      .catch(function (err) {
        stopPoll();
        setBusy(false);
        C.setError(errorBox, err.message);
        loadStatus();
      });
  }

  function startGenerate() {
    if (!refFiles.length) {
      C.setError(errorBox, C.tr('tools.refToVideo.needImages'));
      return;
    }
    var prompt = (promptInput.value || '').trim();
    if (!prompt) {
      C.setError(errorBox, C.tr('tools.refToVideo.needPrompt'));
      return;
    }
    if (!configured()) {
      C.setError(
        errorBox,
        C.tr(isSeedance() ? 'tools.refToVideo.notConfiguredSeedance' : 'tools.refToVideo.notConfiguredHappyhorse')
      );
      return;
    }
    var dur = readDuration();
    if (durationInput) durationInput.value = String(dur);
    C.setError(errorBox, '');
    stopPoll();
    revokeVideo();
    taskId = '';
    setBusy(true, C.tr('tools.refToVideo.submitting'));

    var form = new FormData();
    form.append('prompt', prompt);
    form.append('duration', String(dur));
    var res = (resolutionSelect && resolutionSelect.value) || '480P';
    if (isSeedance()) {
      form.append('resolution', String(res).toLowerCase());
    } else {
      form.append('resolution', String(res).toUpperCase());
    }
    form.append('ratio', (ratioSelect && ratioSelect.value) || '16:9');
    refFiles.forEach(function (f) {
      form.append('images', f, f.name || 'ref.jpg');
    });

    C.apiJson(apiBase() + '/r2v/submit', { method: 'POST', body: form })
      .then(function (data) {
        taskId = data.task_id;
        if (data.wallet) applyWallet(data.wallet);
        polling = true;
        setBusy(true, C.tr('tools.refToVideo.queued'));
        pollOnce();
      })
      .catch(function (err) {
        setBusy(false);
        C.setError(errorBox, err.message);
        loadStatus();
      });
  }

  function downloadMp4() {
    if (!videoBlobUrl) return;
    var name = isSeedance() ? 'seedance-r2v.mp4' : 'happyhorse-r2v.mp4';
    if (typeof window.tbTriggerDownload === 'function') {
      window.tbTriggerDownload(videoBlobUrl, name);
    } else {
      var a = document.createElement('a');
      a.href = videoBlobUrl;
      a.download = name;
      a.click();
    }
  }

  if (modelRow) {
    modelRow.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-model]');
      if (!btn || polling) return;
      modelId = btn.getAttribute('data-model') || 'happyhorse';
      MAX_REFS = limits().maxRefs;
      syncModelUi();
      if (!configured()) {
        C.setError(
          errorBox,
          C.tr(isSeedance() ? 'tools.refToVideo.notConfiguredSeedance' : 'tools.refToVideo.notConfiguredHappyhorse')
        );
      } else {
        C.setError(errorBox, '');
      }
    });
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (polling) return;
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });
  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  runBtn.addEventListener('click', startGenerate);
  downloadBtn.addEventListener('click', downloadMp4);
  clearBtn.addEventListener('click', clearAll);
  promptInput.addEventListener('input', function () { setBusy(!!polling); });
  if (durationInput) {
    durationInput.addEventListener('change', updateEstimate);
    durationInput.addEventListener('input', updateEstimate);
  }
  if (resolutionSelect) resolutionSelect.addEventListener('change', updateEstimate);

  if (promptPresets) {
    promptPresets.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-preset]');
      if (!btn || polling) return;
      promptInput.value = C.tr('tools.refToVideo.presetTexts.' + btn.getAttribute('data-preset'));
      setBusy(false);
    });
  }

  window.addEventListener('tb:locale', function () {
    syncModelUi();
  });

  maybeShowWeChatFileDownloadTip();
  C.requireLogin(loginGate, app).then(function (user) {
    if (!user) return;
    loadStatus();
  });
})();
