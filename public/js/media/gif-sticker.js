document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key, params) {
    return typeof t === 'function' ? t(key, params) : key;
  }

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var workspace = document.getElementById('workspace');
  var previewCanvas = document.getElementById('preview-canvas');
  var sourceMeta = document.getElementById('source-meta');
  var sizeSelect = document.getElementById('size-select');
  var focusX = document.getElementById('focus-x');
  var focusY = document.getElementById('focus-y');
  var captionInput = document.getElementById('caption-input');
  var formatSelect = document.getElementById('format-select');
  var qualityRange = document.getElementById('quality-range');
  var qualityVal = document.getElementById('quality-val');
  var exportBtn = document.getElementById('export-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var resultWrap = document.getElementById('result-wrap');
  var resultImg = document.getElementById('result-img');
  var saveTip = document.getElementById('save-tip');
  var wechatTip = document.getElementById('wechat-tip');

  var state = {
    file: null,
    isGif: false,
    naturalW: 0,
    naturalH: 0,
    gifFrames: null,
    staticImage: null,
    objectUrl: ''
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function setBusy(on, msg) {
    if (busyEl) busyEl.hidden = !on;
    if (busyText && msg) busyText.textContent = msg;
    exportBtn.disabled = on || !state.file;
    clearBtn.disabled = on;
  }

  function showWeChatBanner() {
    if (!wechatTip || typeof tbIsWeChat !== 'function' || !tbIsWeChat()) return;
    wechatTip.hidden = false;
    wechatTip.textContent = tr('tools.gifSticker.wechatBanner');
  }

  function cropRect(imgW, imgH, fx, fy) {
    var side = Math.min(imgW, imgH);
    var sx = Math.round((imgW - side) * (fx / 100));
    var sy = Math.round((imgH - side) * (fy / 100));
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + side > imgW) sx = imgW - side;
    if (sy + side > imgH) sy = imgH - side;
    return { sx: sx, sy: sy, sw: side, sh: side };
  }

  function drawMemeCaption(ctx, w, h, text) {
    var caption = (text || '').trim();
    if (!caption) return;
    var fontSize = Math.max(14, Math.round(w * 0.11));
    ctx.font = 'bold ' + fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    var x = w / 2;
    var y = h - Math.round(fontSize * 0.35);
    var maxW = w * 0.9;
    var lines = wrapText(ctx, caption, maxW);
    var lineH = fontSize * 1.15;
    var startY = y - (lines.length - 1) * lineH;
    for (var i = 0; i < lines.length; i++) {
      var ly = startY + i * lineH;
      ctx.lineWidth = Math.max(2, fontSize * 0.12);
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      ctx.strokeText(lines[i], x, ly);
      ctx.fillText(lines[i], x, ly);
    }
  }

  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    var current = '';
    for (var i = 0; i < text.length; i++) {
      var test = current + text[i];
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = text[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function renderFrame(source, outSize, fx, fy, caption) {
    var canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    var ctx = canvas.getContext('2d');
    var iw = source.width || source.naturalWidth || state.naturalW;
    var ih = source.height || source.naturalHeight || state.naturalH;
    var crop = cropRect(iw, ih, fx, fy);
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outSize, outSize);
    drawMemeCaption(ctx, outSize, outSize, caption);
    return canvas;
  }

  function updatePreview() {
    if (!state.file) return;
    var outSize = parseInt(sizeSelect.value, 10) || 512;
    var fx = parseInt(focusX.value, 10) || 50;
    var fy = parseInt(focusY.value, 10) || 50;
    var caption = captionInput.value || '';
    var previewSize = Math.min(outSize, 320);
    var source = state.staticImage;
    if (!source) return;
    var frame = renderFrame(source, previewSize, fx, fy, caption);
    var pctx = previewCanvas.getContext('2d');
    previewCanvas.width = previewSize;
    previewCanvas.height = previewSize;
    pctx.drawImage(frame, 0, 0);
    sourceMeta.textContent = tr('tools.gifSticker.meta', {
      width: state.naturalW,
      height: state.naturalH,
      out: outSize
    });
  }

  async function decodeGifFrames(buffer) {
    if (typeof ImageDecoder === 'undefined') return null;
    try {
      var decoder = new ImageDecoder({ data: buffer, type: 'image/gif' });
      await decoder.decode();
      var track = decoder.tracks.selectedTrack;
      if (!track || track.frameCount <= 1) {
        decoder.close();
        return null;
      }
      var frames = [];
      for (var i = 0; i < track.frameCount; i++) {
        var result = await decoder.decode({ frameIndex: i });
        var bmp = result.image;
        var canvas = document.createElement('canvas');
        canvas.width = bmp.displayWidth;
        canvas.height = bmp.displayHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        var delay = 100;
        if (track.frameTimings && track.frameTimings[i] && track.frameTimings[i].duration) {
          delay = Math.max(20, Math.round(track.frameTimings[i].duration / 1000));
        }
        frames.push({ canvas: canvas, delay: delay });
      }
      decoder.close();
      return frames;
    } catch (e) {
      return null;
    }
  }

  function loadStaticImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('load failed')); };
      img.src = url;
    });
  }

  async function loadFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      setError(tr('tools.gifSticker.invalidFile'));
      return;
    }
    setError('');
    resetState(false);
    state.file = file;
    state.isGif = file.type === 'image/gif';
    state.objectUrl = URL.createObjectURL(file);

    try {
      if (state.isGif) {
        var buf = await file.arrayBuffer();
        state.gifFrames = await decodeGifFrames(buf);
        state.staticImage = await loadStaticImage(state.objectUrl);
      } else {
        state.staticImage = await loadStaticImage(state.objectUrl);
        state.gifFrames = null;
      }
      state.naturalW = state.staticImage.naturalWidth;
      state.naturalH = state.staticImage.naturalHeight;
      dropZone.hidden = true;
      workspace.hidden = false;
      exportBtn.disabled = false;
      if (state.isGif && state.gifFrames && state.gifFrames.length > 1) {
        formatSelect.value = 'gif';
      } else if (state.isGif) {
        formatSelect.value = 'png';
      }
      updatePreview();
      updateResultPreview();
    } catch (e) {
      setError(tr('tools.gifSticker.loadFailed'));
      resetState(true);
    }
  }

  function resetState(clearFileInput) {
    state.file = null;
    state.isGif = false;
    state.naturalW = 0;
    state.naturalH = 0;
    state.gifFrames = null;
    state.staticImage = null;
    if (state.objectUrl) {
      try { URL.revokeObjectURL(state.objectUrl); } catch (e) {}
      state.objectUrl = '';
    }
    dropZone.hidden = false;
    workspace.hidden = true;
    exportBtn.disabled = true;
    if (resultWrap) resultWrap.hidden = true;
    if (resultImg) resultImg.src = '';
    if (clearFileInput && fileInput) fileInput.value = '';
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('encode failed'));
        else resolve(blob);
      }, type, quality);
    });
  }

  async function exportGif(frames, outSize, fx, fy, caption) {
    if (typeof GIF === 'undefined') throw new Error(tr('tools.gifSticker.gifUnavailable'));
    return new Promise(function (resolve, reject) {
      var gif = new GIF({
        workers: 2,
        quality: 12,
        width: outSize,
        height: outSize,
        workerScript: '../../vendor/gif.worker.js'
      });
      for (var i = 0; i < frames.length; i++) {
        var rendered = renderFrame(frames[i].canvas, outSize, fx, fy, caption);
        gif.addFrame(rendered, { delay: frames[i].delay, copy: true });
      }
      gif.on('finished', function (blob) { resolve(blob); });
      gif.on('abort', function () { reject(new Error(tr('tools.gifSticker.gifUnavailable'))); });
      gif.render();
    });
  }

  async function updateResultPreview() {
    if (!state.staticImage || !resultWrap || !resultImg) return;
    var outSize = parseInt(sizeSelect.value, 10) || 512;
    var fx = parseInt(focusX.value, 10) || 50;
    var fy = parseInt(focusY.value, 10) || 50;
    var caption = captionInput.value || '';
    var canvas = renderFrame(state.staticImage, Math.min(outSize, 320), fx, fy, caption);
    var dataUrl = canvas.toDataURL('image/png');
    resultImg.src = dataUrl;
    resultWrap.hidden = false;
    if (saveTip) saveTip.hidden = !(typeof tbIsWeChat === 'function' && tbIsWeChat());
  }

  async function doExport() {
    if (!state.staticImage) return;
    setError('');
    setBusy(true, tr('tools.gifSticker.encoding'));
    var outSize = parseInt(sizeSelect.value, 10) || 512;
    var fx = parseInt(focusX.value, 10) || 50;
    var fy = parseInt(focusY.value, 10) || 50;
    var caption = captionInput.value || '';
    var fmt = formatSelect.value || 'png';
    var quality = (parseInt(qualityRange.value, 10) || 82) / 100;
    var filename = 'sticker-' + outSize + 'x' + outSize;

    try {
      if (fmt === 'gif' && state.gifFrames && state.gifFrames.length > 1) {
        var gifBlob = await exportGif(state.gifFrames, outSize, fx, fy, caption);
        if (typeof tbTriggerDownload === 'function') {
          var gifUrl = URL.createObjectURL(gifBlob);
          tbTriggerDownload(gifUrl, filename + '.gif');
          setTimeout(function () { URL.revokeObjectURL(gifUrl); }, 3000);
        }
      } else {
        var outCanvas = renderFrame(state.staticImage, outSize, fx, fy, caption);
        var mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
        var blob = await canvasToBlob(outCanvas, mime, quality);
        if (typeof tbTriggerDownload === 'function') {
          var url = URL.createObjectURL(blob);
          tbTriggerDownload(url, filename + (fmt === 'jpeg' ? '.jpg' : '.png'));
          setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        }
      }
      await updateResultPreview();
    } catch (e) {
      setError((e && e.message) || tr('tools.gifSticker.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  [sizeSelect, focusX, focusY, captionInput, formatSelect].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      updatePreview();
      updateResultPreview();
    });
    el.addEventListener('change', function () {
      updatePreview();
      updateResultPreview();
    });
  });

  if (qualityRange) {
    qualityRange.addEventListener('input', function () {
      if (qualityVal) qualityVal.textContent = qualityRange.value;
    });
  }

  exportBtn.addEventListener('click', doExport);
  clearBtn.addEventListener('click', function () {
    resetState(true);
    setError('');
    if (captionInput) captionInput.value = '';
    if (focusX) focusX.value = '50';
    if (focusY) focusY.value = '50';
    if (sizeSelect) sizeSelect.value = '512';
    if (formatSelect) formatSelect.value = 'png';
  });

  document.addEventListener('tb:locale', function () {
    showWeChatBanner();
    updatePreview();
  });

  showWeChatBanner();
});
