/**
 * Image → I2V → extract frames → dedupe → preview / ZIP / GIF.
 */
(function () {
  'use strict';
  var C = window.TBImageCloud;
  var FRAME_MS = 120;
  var MAX_FRAMES = 60;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var sourceImg = document.getElementById('source-img');
  var controls = document.getElementById('controls');
  var promptInput = document.getElementById('prompt-input');
  var durationInput = document.getElementById('duration-input');
  var resolutionSelect = document.getElementById('resolution-select');
  var modelSelect = document.getElementById('model-select');
  var durationHint = document.getElementById('duration-hint');
  var costNote = document.getElementById('cost-note');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var balanceLine = document.getElementById('balance-line');
  var estimateLine = document.getElementById('estimate-line');
  var promptPresets = document.getElementById('prompt-presets');
  var errorBox = document.getElementById('error-box');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var resultWrap = document.getElementById('result-wrap');
  var resultVideo = document.getElementById('result-video');
  var wechatFileDownloadTip = document.getElementById('wechat-file-download-tip');
  var framesSection = document.getElementById('frames-section');
  var framesContainer = document.getElementById('frames-container');
  var frameCountEl = document.getElementById('frame-count');
  var selectedCountEl = document.getElementById('selected-count');
  var thresholdInput = document.getElementById('similarity-threshold');
  var thresholdValue = document.getElementById('threshold-value');
  var dedupeBtn = document.getElementById('dedupe-btn');
  var selectAllBtn = document.getElementById('select-all-btn');
  var previewBtn = document.getElementById('preview-btn');
  var zipBtn = document.getElementById('zip-btn');
  var gifBtn = document.getElementById('gif-btn');
  var previewSection = document.getElementById('preview-section');
  var animationContainer = document.getElementById('animation-container');
  var playPauseBtn = document.getElementById('play-pause-btn');
  var speedControl = document.getElementById('speed-control');
  var speedValue = document.getElementById('speed-value');

  var file = null;
  var previewUrl = '';
  var taskId = '';
  var videoBlobUrl = '';
  var polling = false;
  var pollTimer = null;
  var priceMarkup = 2;
  var minDuration = 4;
  var maxDuration = 15;
  var apiPrefix = '/minimax';
  var providerConfigured = { wan: true, h3: true };
  var listPerSec = { '768P': 0.5, '2K': 0.8, '720P': 0.6, '1080P': 1.0 };
  var extractedFrames = [];
  var selectedSet = {};
  var animTimer = null;
  var animIndex = 0;
  var isPlaying = false;

  if (loginLink) loginLink.href = C.loginUrl();

  function trI2v(k, params) {
    return C.tr('tools.imageToAnimation.' + k, params);
  }
  function tr(k, params) {
    return C.tr('tools.imageToSprites.' + k, params);
  }

  function selectedModel() {
    return (modelSelect && modelSelect.value) || 'minimax-h3';
  }
  function isH3() {
    return selectedModel() === 'minimax-h3';
  }

  function selectedIndexes() {
    var out = [];
    Object.keys(selectedSet).forEach(function (k) {
      if (selectedSet[k]) out.push(parseInt(k, 10));
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function syncProviderUi() {
    var h3 = isH3();
    apiPrefix = h3 ? '/minimax' : '/wan';
    minDuration = h3 ? 4 : 2;
    maxDuration = 15;
    if (durationHint) durationHint.textContent = trI2v(h3 ? 'durationHintH3' : 'durationHint');
    if (costNote) costNote.textContent = trI2v(h3 ? 'costNoteH3' : 'costNoteWan');
    if (resolutionSelect) {
      var cur = resolutionSelect.value;
      resolutionSelect.innerHTML = '';
      if (h3) {
        resolutionSelect.appendChild(new Option(trI2v('res768'), '768P'));
        resolutionSelect.appendChild(new Option(trI2v('res2k'), '2K'));
        resolutionSelect.value = (cur === '2K' || cur === '1080P') ? '2K' : '768P';
      } else {
        resolutionSelect.appendChild(new Option(trI2v('res720'), '720P'));
        resolutionSelect.appendChild(new Option(trI2v('res1080'), '1080P'));
        resolutionSelect.value = (cur === '1080P' || cur === '2K') ? '1080P' : '720P';
      }
    }
    if (durationInput) {
      durationInput.min = String(minDuration);
      durationInput.max = String(maxDuration);
      durationInput.value = String(clampDuration(durationInput.value));
    }
    updateEstimate();
  }

  function clampDuration(raw) {
    var n = parseInt(String(raw || '5'), 10);
    if (!Number.isFinite(n)) n = 5;
    return Math.min(maxDuration, Math.max(minDuration, n));
  }

  function currentEstimate() {
    var dur = clampDuration(durationInput && durationInput.value);
    var res = (resolutionSelect && resolutionSelect.value) || (isH3() ? '768P' : '720P');
    var listRate = listPerSec[res] != null ? listPerSec[res] : (isH3() ? 0.5 : 0.6);
    return { duration: dur, resolution: res, price: listRate * dur * priceMarkup };
  }

  function updateEstimate() {
    if (!estimateLine) return;
    var est = currentEstimate();
    estimateLine.hidden = false;
    estimateLine.textContent = trI2v('estimateLine', {
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

  function setBusy(on, msg) {
    C.setBusy(busyEl, busyText, on, msg || trI2v('generating'));
    runBtn.disabled = on || !file || !(promptInput.value || '').trim();
    clearBtn.disabled = on;
    promptInput.disabled = on;
    if (durationInput) durationInput.disabled = on;
    if (modelSelect) modelSelect.disabled = on;
    if (resolutionSelect) resolutionSelect.disabled = on;
    if (promptPresets) {
      promptPresets.querySelectorAll('.wan-preset').forEach(function (btn) {
        btn.disabled = !!on;
      });
    }
    var frameBusy = !!on;
    if (dedupeBtn) dedupeBtn.disabled = frameBusy;
    if (selectAllBtn) selectAllBtn.disabled = frameBusy;
    if (previewBtn) previewBtn.disabled = frameBusy;
    if (zipBtn) zipBtn.disabled = frameBusy;
    if (gifBtn) gifBtn.disabled = frameBusy;
  }

  function stopAnim() {
    if (animTimer) {
      clearInterval(animTimer);
      animTimer = null;
    }
    isPlaying = false;
  }

  function resetFrames() {
    stopAnim();
    extractedFrames = [];
    selectedSet = {};
    framesContainer.innerHTML = '';
    framesSection.classList.add('hidden');
    previewSection.classList.add('hidden');
    animationContainer.innerHTML = '';
    updateCounts();
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

  function maybeShowWeChatFileDownloadTip() {
    if (!wechatFileDownloadTip) return;
    wechatFileDownloadTip.hidden = !(typeof window.tbIsWeChat === 'function' && window.tbIsWeChat());
  }

  function triggerDownload(url, name) {
    if (typeof window.tbTriggerDownload === 'function') {
      window.tbTriggerDownload(url, name);
    } else {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
    }
  }

  function loadStatus() {
    var wanP = C.apiJson('/wan/status').then(function (s) {
      providerConfigured.wan = !!s.configured;
      if (s.pricing && s.pricing.listPerSec) Object.assign(listPerSec, s.pricing.listPerSec);
      if (!isH3()) {
        if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
        if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
        syncProviderUi();
        applyWallet(s.wallet);
      } else if (s.wallet) applyWallet(s.wallet);
    }).catch(function () { providerConfigured.wan = false; });
    var h3P = C.apiJson('/minimax/status').then(function (s) {
      providerConfigured.h3 = !!s.configured;
      if (s.pricing && s.pricing.listPerSec) Object.assign(listPerSec, s.pricing.listPerSec);
      if (isH3()) {
        if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
        if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
        syncProviderUi();
        applyWallet(s.wallet);
      } else if (s.wallet) applyWallet(s.wallet);
    }).catch(function () { providerConfigured.h3 = false; });
    return Promise.all([wanP, h3P]).then(function () {
      syncProviderUi();
      if (isH3() && !providerConfigured.h3) C.setError(errorBox, trI2v('notConfiguredH3'));
      else if (!isH3() && !providerConfigured.wan) C.setError(errorBox, trI2v('notConfiguredWan'));
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  function setFile(f) {
    C.setError(errorBox, '');
    stopPoll();
    revokeVideo();
    resetFrames();
    taskId = '';
    if (!f || !String(f.type || '').startsWith('image/')) {
      C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
      return;
    }
    if (f.size > 6 * 1024 * 1024) {
      C.setError(errorBox, C.tr('tools.imageCloud.tooLarge'));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = f;
    previewUrl = URL.createObjectURL(f);
    sourceImg.src = previewUrl;
    sourceWrap.hidden = false;
    controls.hidden = false;
    dropZone.hidden = true;
    setBusy(false);
    updateEstimate();
  }

  function clearAll() {
    stopPoll();
    revokeVideo();
    resetFrames();
    file = null;
    taskId = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    sourceImg.removeAttribute('src');
    sourceWrap.hidden = true;
    controls.hidden = true;
    dropZone.hidden = false;
    fileInput.value = '';
    promptInput.value = '';
    C.setError(errorBox, '');
    setBusy(false);
    loadStatus();
  }

  function fetchVideoBlob() {
    return C.apiBlob(apiPrefix + '/i2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
      revokeVideo();
      videoBlobUrl = URL.createObjectURL(res.blob);
      resultVideo.src = videoBlobUrl;
      resultWrap.hidden = false;
    });
  }

  function pollOnce() {
    if (!polling || !taskId) return;
    C.apiJson(apiPrefix + '/i2v/task/' + encodeURIComponent(taskId))
      .then(function (data) {
        var status = String(data.status || '').toUpperCase();
        if (status === 'SUCCEEDED') {
          stopPoll();
          if (data.wallet) applyWallet(data.wallet);
          setBusy(true, trI2v('downloading'));
          return fetchVideoBlob().then(function () {
            return extractFramesFromVideo();
          }).then(function () {
            return autoDedupe();
          }).then(function () {
            setBusy(false);
            startPreview();
            loadStatus();
          });
        }
        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          stopPoll();
          setBusy(false);
          C.setError(errorBox, data.message || trI2v('failed'));
          loadStatus();
          return;
        }
        setBusy(true, status === 'RUNNING' ? trI2v('running') : trI2v('queued'));
        pollTimer = setTimeout(pollOnce, 4000);
      })
      .catch(function (err) {
        stopPoll();
        setBusy(false);
        C.setError(errorBox, err.message);
        loadStatus();
      });
  }

  function startGenerate() {
    if (!file) return;
    var prompt = (promptInput.value || '').trim();
    if (!prompt) {
      C.setError(errorBox, tr('needPrompt'));
      return;
    }
    var dur = clampDuration(durationInput && durationInput.value);
    if (durationInput) durationInput.value = String(dur);
    C.setError(errorBox, '');
    stopPoll();
    revokeVideo();
    resetFrames();
    taskId = '';
    setBusy(true, trI2v('submitting'));
    var form = new FormData();
    form.append('image', file);
    form.append('prompt', prompt);
    form.append('duration', String(dur));
    form.append('resolution', resolutionSelect.value || (isH3() ? '768P' : '720P'));
    if (!isH3()) form.append('audio', '0');
    C.apiJson(apiPrefix + '/i2v/submit', { method: 'POST', body: form })
      .then(function (data) {
        taskId = data.task_id;
        if (data.wallet) applyWallet(data.wallet);
        polling = true;
        setBusy(true, trI2v('queued'));
        pollOnce();
      })
      .catch(function (err) {
        setBusy(false);
        C.setError(errorBox, err.message);
        loadStatus();
      });
  }

  function waitVideoReady(video) {
    return new Promise(function (resolve, reject) {
      if (video.readyState >= 2 && video.duration) {
        resolve();
        return;
      }
      var onOk = function () {
        video.removeEventListener('loadeddata', onOk);
        video.removeEventListener('error', onErr);
        resolve();
      };
      var onErr = function () {
        video.removeEventListener('loadeddata', onOk);
        video.removeEventListener('error', onErr);
        reject(new Error(trI2v('framesUnavailable')));
      };
      video.addEventListener('loadeddata', onOk);
      video.addEventListener('error', onErr);
      video.load();
    });
  }

  function seekTo(video, t) {
    return new Promise(function (resolve) {
      var onSeek = function () {
        video.removeEventListener('seeked', onSeek);
        resolve();
      };
      video.addEventListener('seeked', onSeek);
      video.currentTime = t;
    });
  }

  function extractFramesFromVideo() {
    setBusy(true, trI2v('extractingFrames'));
    var video = resultVideo;
    video.pause();
    video.muted = true;
    return waitVideoReady(video).then(function () {
      var duration = Math.max(0.2, video.duration || 1);
      var step = FRAME_MS / 1000;
      var times = [];
      var t = 0;
      while (t < duration - 0.02 && times.length < MAX_FRAMES) {
        times.push(Math.min(t, duration - 0.04));
        t += step;
      }
      if (!times.length) times.push(0);
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 720;
      extractedFrames = [];
      selectedSet = {};
      framesContainer.innerHTML = '';

      function next(i) {
        if (i >= times.length) {
          renderFrameGrid();
          framesSection.classList.remove('hidden');
          updateCounts();
          return;
        }
        return seekTo(video, times[i]).then(function () {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          extractedFrames.push(canvas.toDataURL('image/jpeg', 0.88));
          return next(i + 1);
        });
      }
      return next(0);
    });
  }

  function renderFrameGrid() {
    framesContainer.innerHTML = '';
    extractedFrames.forEach(function (src, index) {
      var item = document.createElement('div');
      item.className = 'frame-item' + (selectedSet[index] ? ' is-selected' : '');
      item.setAttribute('data-index', String(index));
      var img = document.createElement('img');
      img.src = src;
      img.alt = String(index + 1);
      var num = document.createElement('div');
      num.className = 'frame-number';
      num.textContent = String(index + 1);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'frame-checkbox';
      cb.checked = !!selectedSet[index];
      cb.addEventListener('click', function (e) { e.stopPropagation(); });
      cb.addEventListener('change', function () {
        setSelected(index, cb.checked);
      });
      item.addEventListener('click', function () {
        setSelected(index, !selectedSet[index]);
      });
      item.appendChild(img);
      item.appendChild(num);
      item.appendChild(cb);
      framesContainer.appendChild(item);
    });
  }

  function setSelected(index, on) {
    selectedSet[index] = !!on;
    var item = framesContainer.querySelector('.frame-item[data-index="' + index + '"]');
    if (item) {
      item.classList.toggle('is-selected', !!on);
      var cb = item.querySelector('.frame-checkbox');
      if (cb) cb.checked = !!on;
    }
    updateCounts();
  }

  function updateCounts() {
    if (frameCountEl) frameCountEl.textContent = String(extractedFrames.length);
    if (selectedCountEl) selectedCountEl.textContent = String(selectedIndexes().length);
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function compareImages(a, b) {
    return Promise.all([loadImage(a), loadImage(b)]).then(function (pair) {
      var img1 = pair[0];
      var img2 = pair[1];
      if (!img1 || !img2) return 0;
      var w = Math.min(img1.width, img2.width, 80);
      var h = Math.min(img1.height, img2.height, 80);
      var c1 = document.createElement('canvas');
      var c2 = document.createElement('canvas');
      c1.width = c2.width = w;
      c1.height = c2.height = h;
      var x1 = c1.getContext('2d');
      var x2 = c2.getContext('2d');
      x1.drawImage(img1, 0, 0, w, h);
      x2.drawImage(img2, 0, 0, w, h);
      var d1 = x1.getImageData(0, 0, w, h).data;
      var d2 = x2.getImageData(0, 0, w, h).data;
      var skip = 2;
      var total = w * h / skip;
      var diffPx = 0;
      for (var i = 0; i < d1.length; i += 4 * skip) {
        var diff = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        if (diff > 30) diffPx += 1;
      }
      return Math.round((1 - diffPx / total) * 100);
    });
  }

  function autoDedupe() {
    var threshold = Math.max(80, Math.min(99, parseInt(thresholdInput.value, 10) || 90));
    selectedSet = {};
    if (!extractedFrames.length) {
      renderFrameGrid();
      updateCounts();
      return Promise.resolve();
    }
    var keep = [0];
    var lastKept = 0;
    function step(i) {
      if (i >= extractedFrames.length) {
        keep.forEach(function (idx) { selectedSet[idx] = true; });
        renderFrameGrid();
        updateCounts();
        return;
      }
      return compareImages(extractedFrames[lastKept], extractedFrames[i]).then(function (sim) {
        if (sim < threshold) {
          keep.push(i);
          lastKept = i;
        }
        return step(i + 1);
      });
    }
    return step(1);
  }

  function selectAll() {
    extractedFrames.forEach(function (_, i) { selectedSet[i] = true; });
    renderFrameGrid();
    updateCounts();
  }

  function fps() {
    return Math.max(2, Math.min(16, parseInt(speedControl && speedControl.value, 10) || 8));
  }

  function startPreview() {
    var idxs = selectedIndexes();
    if (!idxs.length) return;
    previewSection.classList.remove('hidden');
    animationContainer.innerHTML = '';
    var img = document.createElement('img');
    img.alt = '';
    img.src = extractedFrames[idxs[0]];
    animationContainer.appendChild(img);
    animIndex = 0;
    isPlaying = true;
    if (playPauseBtn) playPauseBtn.textContent = tr('pause');
    if (animTimer) clearInterval(animTimer);
    animTimer = setInterval(function () {
      if (!isPlaying) return;
      var list = selectedIndexes();
      if (!list.length) return;
      animIndex = (animIndex + 1) % list.length;
      img.src = extractedFrames[list[animIndex]];
    }, Math.round(1000 / fps()));
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    if (playPauseBtn) playPauseBtn.textContent = isPlaying ? tr('pause') : tr('play');
    if (isPlaying && !animTimer) startPreview();
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function downloadZip() {
    var idxs = selectedIndexes();
    if (!idxs.length) {
      C.setError(errorBox, tr('needFrames'));
      return;
    }
    if (typeof JSZip === 'undefined') {
      C.setError(errorBox, trI2v('framesUnavailable'));
      return;
    }
    C.setError(errorBox, '');
    setBusy(true, tr('packingZip'));
    var zip = new JSZip();
    idxs.forEach(function (i, n) {
      zip.file('frame-' + String(n + 1).padStart(2, '0') + '.jpg', dataUrlToBlob(extractedFrames[i]));
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      triggerDownload(url, 'sprite-frames.zip');
      setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
      setBusy(false);
    }).catch(function () {
      setBusy(false);
      C.setError(errorBox, trI2v('framesUnavailable'));
    });
  }

  function downloadGif() {
    var idxs = selectedIndexes();
    if (!idxs.length) {
      C.setError(errorBox, tr('needFrames'));
      return;
    }
    if (typeof GIF === 'undefined') {
      C.setError(errorBox, tr('gifUnavailable'));
      return;
    }
    C.setError(errorBox, '');
    setBusy(true, tr('encodingGif'));
    var delay = Math.round(1000 / fps());
    Promise.all(idxs.map(function (i) { return loadImage(extractedFrames[i]); })).then(function (imgs) {
      var w = 0;
      var h = 0;
      imgs.forEach(function (im) {
        if (!im) return;
        w = Math.max(w, im.width);
        h = Math.max(h, im.height);
      });
      w = Math.min(w || 480, 720);
      h = Math.min(h || 480, 720);
      var gif = new GIF({
        workers: 2,
        quality: 10,
        width: w,
        height: h,
        workerScript: '../../vendor/gif.worker.js'
      });
      imgs.forEach(function (im) {
        if (!im) return;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        var scale = Math.min(w / im.width, h / im.height);
        var dw = im.width * scale;
        var dh = im.height * scale;
        ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
        gif.addFrame(canvas, { delay: delay, copy: true });
      });
      gif.on('finished', function (blob) {
        var url = URL.createObjectURL(blob);
        triggerDownload(url, 'sprite.gif');
        setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
        setBusy(false);
      });
      gif.on('abort', function () {
        setBusy(false);
        C.setError(errorBox, tr('gifUnavailable'));
      });
      gif.render();
    }).catch(function () {
      setBusy(false);
      C.setError(errorBox, tr('gifUnavailable'));
    });
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
  });
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  promptInput.addEventListener('input', function () {
    if (!polling) setBusy(false);
  });
  if (durationInput) {
    durationInput.addEventListener('input', updateEstimate);
    durationInput.addEventListener('change', function () {
      durationInput.value = String(clampDuration(durationInput.value));
      updateEstimate();
    });
  }
  if (resolutionSelect) resolutionSelect.addEventListener('change', updateEstimate);
  if (modelSelect) {
    modelSelect.addEventListener('change', function () {
      C.setError(errorBox, '');
      syncProviderUi();
      if (isH3() && !providerConfigured.h3) C.setError(errorBox, trI2v('notConfiguredH3'));
      else if (!isH3() && !providerConfigured.wan) C.setError(errorBox, trI2v('notConfiguredWan'));
    });
  }
  if (promptPresets) {
    promptPresets.addEventListener('click', function (e) {
      var btn = e.target.closest('.wan-preset');
      if (!btn || btn.disabled) return;
      var key = btn.getAttribute('data-preset');
      if (!key) return;
      promptInput.value = tr('presetTexts.' + key);
      if (!polling) setBusy(false);
      promptInput.focus();
    });
  }
  if (thresholdInput) {
    thresholdInput.addEventListener('input', function () {
      thresholdValue.textContent = thresholdInput.value + '%';
    });
  }
  runBtn.addEventListener('click', startGenerate);
  clearBtn.addEventListener('click', clearAll);
  dedupeBtn.addEventListener('click', function () {
    setBusy(true, tr('comparing'));
    autoDedupe().then(function () {
      setBusy(false);
      startPreview();
    });
  });
  selectAllBtn.addEventListener('click', selectAll);
  previewBtn.addEventListener('click', startPreview);
  zipBtn.addEventListener('click', downloadZip);
  gifBtn.addEventListener('click', downloadGif);
  playPauseBtn.addEventListener('click', togglePlay);
  speedControl.addEventListener('input', function () {
    speedValue.textContent = String(fps());
    if (isPlaying) startPreview();
  });

  document.addEventListener('tb:locale', function () {
    if (modelSelect && modelSelect.options.length >= 2) {
      modelSelect.options[0].textContent = trI2v('modelH3');
      modelSelect.options[1].textContent = trI2v('modelWan27');
    }
    syncProviderUi();
    maybeShowWeChatFileDownloadTip();
    if (playPauseBtn) playPauseBtn.textContent = isPlaying ? tr('pause') : tr('play');
    if (balanceLine && balanceLine.textContent) loadStatus();
  });

  maybeShowWeChatFileDownloadTip();
  C.requireLogin(gate, app).then(function (user) {
    if (!user) return;
    loadStatus();
  });
})();
