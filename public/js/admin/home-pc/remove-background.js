/**
 * 家里电脑 · 去背景（抠图）
 * ComfyUI rembg.json；可选透明 PNG 或铺实色浅底。
 */
(function () {
  'use strict';

  var LIGHT_BG = '#f3f4f6';

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var sourceWrap = document.getElementById('source-wrap');
  var sourceImg = document.getElementById('source-img');
  var runBtn = document.getElementById('run-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');
  var previewWrap = document.getElementById('preview-wrap');
  var resultImg = document.getElementById('result-img');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');

  var file = null;
  var previewUrl = '';
  var resultUrl = '';
  var resultMode = 'transparent';
  var processing = false;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function apiBase() {
    return window.HomePcApi && typeof HomePcApi.base === 'function'
      ? HomePcApi.base()
      : 'http://127.0.0.1:8189';
  }

  function getBgMode() {
    var el = document.querySelector('input[name="bg-mode"]:checked');
    return (el && el.value) || 'transparent';
  }

  function setError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg || '';
    if (msg) errorBox.classList.add('show');
    else errorBox.classList.remove('show');
  }

  function setBusy(on) {
    processing = !!on;
    if (busyEl) busyEl.hidden = !processing;
    if (busyText && processing) {
      busyText.textContent = tr('privateHub.homePc.processing', '处理中…');
    }
    if (runBtn) runBtn.disabled = processing || !file;
    if (clearBtn) clearBtn.disabled = processing;
    if (downloadBtn) downloadBtn.disabled = processing || !resultUrl;
  }

  function revokeResult() {
    if (resultUrl && resultUrl.indexOf('blob:') === 0) {
      try {
        URL.revokeObjectURL(resultUrl);
      } catch (e) { /* ignore */ }
    }
    resultUrl = '';
    resultMode = 'transparent';
    if (resultImg) resultImg.removeAttribute('src');
    if (previewWrap) {
      previewWrap.hidden = true;
      previewWrap.classList.add('cutout-preview');
      previewWrap.style.background = '';
    }
    if (downloadBtn) downloadBtn.disabled = true;
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    var mimeMatch = parts[0] && parts[0].match(/:(.*?);/);
    var mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    var bin = atob(parts[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error(tr('privateHub.homePc.removeBgFail', '抠图失败')));
      };
      img.src = src;
    });
  }

  /** Composite transparent PNG onto a light solid fill → opaque PNG data URL. */
  function compositeOnLight(dataUrl) {
    return loadImage(dataUrl).then(function (img) {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      var ctx = c.getContext('2d');
      ctx.fillStyle = LIGHT_BG;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    });
  }

  function showResult(dataUrl, mode) {
    revokeResult();
    resultMode = mode || 'transparent';
    try {
      resultUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
    } catch (e) {
      resultUrl = dataUrl;
    }
    resultImg.src = resultUrl;
    previewWrap.hidden = false;
    if (resultMode === 'light') {
      previewWrap.classList.remove('cutout-preview');
      previewWrap.style.background = LIGHT_BG;
    } else {
      previewWrap.classList.add('cutout-preview');
      previewWrap.style.background = '';
    }
    downloadBtn.disabled = false;
  }

  function serviceErrorMsg() {
    return (
      tr('privateHub.homePc.removeBgServiceDown', '无法连接家里电脑抠图服务。') +
      '\n' +
      apiBase()
    );
  }

  async function checkServerOk() {
    try {
      var res = await fetch(apiBase() + '/health', { method: 'GET' });
      var body = await res.json().catch(function () {
        return {};
      });
      if (body.comfyui === false) return false;
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function callRemoveBg(imageFile) {
    var fd = new FormData();
    fd.append('image', imageFile, imageFile.name || 'cutout.png');
    var res = await fetch(apiBase() + '/remove-bg', { method: 'POST', body: fd });
    if (!res.ok) {
      var data = await res.json().catch(function () {
        return {};
      });
      var msg =
        window.HomePcApi && HomePcApi.parseErrorResponse
          ? HomePcApi.parseErrorResponse(res, data)
          : data.error || data.detail || 'HTTP ' + res.status;
      throw new Error(msg);
    }
    var out = await res.json();
    if (!out.success || !out.image_data) {
      throw new Error(out.error || tr('privateHub.homePc.removeBgFail', '抠图失败'));
    }
    return out.image_data;
  }

  function setFile(f) {
    setError('');
    if (!f || !String(f.type || '').startsWith('image/')) {
      setError(tr('privateHub.homePc.invalidImage', '请选择图片文件'));
      return;
    }
    var apply = function (picked) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      revokeResult();
      file = picked;
      previewUrl = URL.createObjectURL(picked);
      sourceImg.src = previewUrl;
      sourceWrap.hidden = false;
      dropZone.hidden = true;
      runBtn.disabled = false;
    };
    if (window.TBImageUploadCompress && TBImageUploadCompress.prepareUploadFile) {
      TBImageUploadCompress.prepareUploadFile(f, apply, 'default');
    } else {
      apply(f);
    }
  }

  async function runCutout() {
    if (!file || processing) return;
    setError('');
    setBusy(true);
    var mode = getBgMode();
    var t0 = performance.now();
    try {
      var ok = await checkServerOk();
      if (!ok) throw new Error(serviceErrorMsg());
      var dataUrl = await callRemoveBg(file);
      if (mode === 'light') {
        dataUrl = await compositeOnLight(dataUrl);
      }
      showResult(dataUrl, mode);
      var sec = ((performance.now() - t0) / 1000).toFixed(1);
      console.log('去背景完成，mode=' + mode + '，耗时 ' + sec + 's');
    } catch (err) {
      var msg = (err && err.message) || String(err || '');
      if (/Failed to fetch|NetworkError|TypeError/i.test(msg)) {
        msg = serviceErrorMsg();
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    file = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    if (sourceImg) sourceImg.removeAttribute('src');
    if (sourceWrap) sourceWrap.hidden = true;
    if (dropZone) dropZone.hidden = false;
    if (fileInput) fileInput.value = '';
    revokeResult();
    if (runBtn) runBtn.disabled = true;
    setError('');
  }

  function downloadResult() {
    if (!resultUrl) return;
    var name =
      (resultMode === 'light' ? 'cutout_light_' : 'cutout_') + Date.now() + '.png';
    var MediaUi = window.HomePcMediaUi;
    if (MediaUi && typeof MediaUi.triggerDownload === 'function') {
      MediaUi.triggerDownload(resultUrl, name).catch(function () {
        /* ignore */
      });
      return;
    }
    if (typeof window.tbTriggerDownload === 'function') {
      window.tbTriggerDownload(resultUrl, name);
      return;
    }
    var a = document.createElement('a');
    a.href = resultUrl;
    a.download = name;
    a.click();
  }

  if (dropZone) {
    dropZone.addEventListener('click', function () {
      fileInput.click();
    });
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('drag-over');
    });
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
  if (runBtn) runBtn.addEventListener('click', runCutout);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadResult);

  setError('');
})();
