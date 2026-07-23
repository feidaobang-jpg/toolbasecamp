document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  var MARGIN = 24;

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var canvasWrap = document.getElementById('canvas-wrap');
  var canvas = document.getElementById('wm-canvas');
  var ctx = canvas.getContext('2d');
  var wmFields = document.getElementById('wm-fields');
  var posRow = document.getElementById('pos-row');
  var textInput = document.getElementById('text-input');
  var fontSizeInput = document.getElementById('font-size-input');
  var opacityInput = document.getElementById('opacity-input');
  var colorInput = document.getElementById('color-input');
  var generateBtn = document.getElementById('generate-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');

  var state = {
    image: null,
    scale: 1,
    pos: 'center',
    x: 0.5,
    y: 0.5,
    dragging: false,
    dragOffX: 0,
    dragOffY: 0,
    previewReady: false,
    name: 'watermarked.png',
    metrics: null
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function updateButtons() {
    var has = !!state.image;
    generateBtn.disabled = !has;
    downloadBtn.disabled = !has || !state.previewReady;
  }

  function syncPosChips() {
    var chips = posRow.querySelectorAll('[data-pos]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-pos') === state.pos);
    }
  }

  function applyPreset(pos) {
    state.pos = pos || 'center';
    var pad = 0.08;
    if (state.pos === 'tl') { state.x = pad; state.y = pad; }
    else if (state.pos === 'tr') { state.x = 1 - pad; state.y = pad; }
    else if (state.pos === 'bl') { state.x = pad; state.y = 1 - pad; }
    else if (state.pos === 'br') { state.x = 1 - pad; state.y = 1 - pad; }
    else { state.x = 0.5; state.y = 0.5; state.pos = 'center'; }
    syncPosChips();
  }

  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function watermarkText() {
    return String(textInput.value || '').trim();
  }

  function fontSize() {
    return Math.max(12, Math.min(400, parseInt(fontSizeInput.value, 10) || 48));
  }

  function opacity() {
    var v = parseFloat(opacityInput.value);
    if (isNaN(v)) v = 0.55;
    return Math.max(0.1, Math.min(1, v));
  }

  function measureText(wctx, text, size) {
    wctx.font = 'bold ' + size + 'px sans-serif';
    var m = wctx.measureText(text);
    var w = Math.ceil(m.width);
    var h = Math.ceil(size * 1.2);
    return { w: w, h: h };
  }

  function textAnchor(iw, ih, metrics) {
    var ax = state.x * iw;
    var ay = state.y * ih;
    var x = ax - metrics.w / 2;
    var y = ay - metrics.h / 2;
    x = Math.max(MARGIN, Math.min(iw - metrics.w - MARGIN, x));
    y = Math.max(MARGIN, Math.min(ih - metrics.h - MARGIN, y));
    return { x: x, y: y, ax: x + metrics.w / 2, ay: y + metrics.h / 2 };
  }

  function drawWatermarkOn(wctx, iw, ih, text, size, color, alpha) {
    var rgb = hexToRgb(color);
    wctx.save();
    wctx.font = 'bold ' + size + 'px sans-serif';
    wctx.textBaseline = 'top';
    wctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
    var metrics = measureText(wctx, text, size);
    var anchor = textAnchor(iw, ih, metrics);
    wctx.fillText(text, anchor.x, anchor.y);
    wctx.restore();
    return { metrics: metrics, anchor: anchor };
  }

  function renderPreview() {
    if (!state.image) return;
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var maxW = Math.min(canvasWrap.clientWidth || 640, 900);
    state.scale = Math.min(1, maxW / iw);
    var cw = Math.round(iw * state.scale);
    var ch = Math.round(ih * state.scale);
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.cursor = 'grab';
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(state.image, 0, 0, cw, ch);

    var text = watermarkText();
    if (!text) {
      state.metrics = null;
      updateButtons();
      return;
    }

    var size = fontSize();
    var alpha = opacity();
    var color = colorInput.value || '#ffffff';
    var off = document.createElement('canvas');
    off.width = iw;
    off.height = ih;
    var octx = off.getContext('2d');
    octx.drawImage(state.image, 0, 0);
    var placed = drawWatermarkOn(octx, iw, ih, text, size, color, alpha);
    state.metrics = placed.metrics;
    ctx.drawImage(off, 0, 0, cw, ch);

    // drag handle outline in display space
    var sx = placed.anchor.x * state.scale;
    var sy = placed.anchor.y * state.scale;
    var sw = placed.metrics.w * state.scale;
    var sh = placed.metrics.h * state.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(37,99,235,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(sx - 4, sy - 4, sw + 8, sh + 8);
    ctx.restore();

    updateButtons();
  }

  function buildOutputCanvas() {
    if (!state.image) return null;
    var text = watermarkText();
    if (!text) return null;
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var out = document.createElement('canvas');
    out.width = iw;
    out.height = ih;
    var octx = out.getContext('2d');
    octx.drawImage(state.image, 0, 0);
    drawWatermarkOn(octx, iw, ih, text, fontSize(), colorInput.value || '#ffffff', opacity());
    return out;
  }

  function loadFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setError(tr('tools.addWatermark.invalidFile'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      state.image = img;
      state.previewReady = false;
      state.name = (file.name || 'image').replace(/\.[^.]+$/, '') + '_watermark.png';
      applyPreset('center');
      dropZone.hidden = true;
      canvasWrap.hidden = false;
      wmFields.hidden = false;
      posRow.hidden = false;
      setError('');
      renderPreview();
      updateButtons();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setError(tr('tools.addWatermark.loadFailed'));
    };
    img.src = url;
  }

  function clearAll() {
    state.image = null;
    state.previewReady = false;
    state.dragging = false;
    state.metrics = null;
    fileInput.value = '';
    textInput.value = '';
    canvasWrap.hidden = true;
    wmFields.hidden = true;
    posRow.hidden = true;
    dropZone.hidden = false;
    setError('');
    updateButtons();
  }

  function eventClientXY(evt) {
    if (evt.touches && evt.touches[0]) {
      return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
    }
    if (evt.changedTouches && evt.changedTouches[0]) {
      return { x: evt.changedTouches[0].clientX, y: evt.changedTouches[0].clientY };
    }
    return { x: evt.clientX, y: evt.clientY };
  }

  function canvasPoint(evt) {
    var rect = canvas.getBoundingClientRect();
    var pt = eventClientXY(evt);
    return {
      x: (pt.x - rect.left) * (canvas.width / Math.max(rect.width, 1)),
      y: (pt.y - rect.top) * (canvas.height / Math.max(rect.height, 1))
    };
  }

  function hitText(cx, cy) {
    if (!state.image || !state.metrics) return false;
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var anchor = textAnchor(iw, ih, state.metrics);
    var sx = anchor.x * state.scale - 8;
    var sy = anchor.y * state.scale - 8;
    var sw = state.metrics.w * state.scale + 16;
    var sh = state.metrics.h * state.scale + 16;
    return cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh;
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  posRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-pos]');
    if (!btn || !state.image) return;
    applyPreset(btn.getAttribute('data-pos'));
    state.previewReady = false;
    renderPreview();
    updateButtons();
  });

  function onPointerDown(e) {
    if (!state.image || !watermarkText()) return;
    if (e.cancelable) e.preventDefault();
    var p = canvasPoint(e);
    if (!hitText(p.x, p.y) && !state.metrics) return;
    if (!hitText(p.x, p.y)) {
      // allow placing by click anywhere: move center to point
      state.x = p.x / (canvas.width || 1);
      state.y = p.y / (canvas.height || 1);
      state.pos = 'custom';
      syncPosChips();
      renderPreview();
      return;
    }
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var anchor = textAnchor(iw, ih, state.metrics);
    state.dragging = true;
    canvas.style.cursor = 'grabbing';
    state.dragOffX = p.x / state.scale - (anchor.x + state.metrics.w / 2);
    state.dragOffY = p.y / state.scale - (anchor.y + state.metrics.h / 2);
  }

  function onPointerMove(e) {
    if (!state.dragging || !state.image) return;
    if (e.cancelable) e.preventDefault();
    var p = canvasPoint(e);
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var ax = p.x / state.scale - state.dragOffX;
    var ay = p.y / state.scale - state.dragOffY;
    state.x = Math.max(0, Math.min(1, ax / iw));
    state.y = Math.max(0, Math.min(1, ay / ih));
    state.pos = 'custom';
    syncPosChips();
    state.previewReady = false;
    renderPreview();
  }

  function onPointerUp() {
    if (state.dragging) {
      state.dragging = false;
      canvas.style.cursor = 'grab';
      updateButtons();
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);

  generateBtn.addEventListener('click', function () {
    if (!state.image) return;
    if (!watermarkText()) {
      setError(tr('tools.addWatermark.needText'));
      state.previewReady = false;
      updateButtons();
      return;
    }
    setError('');
    state.previewReady = true;
    renderPreview();
    updateButtons();
  });

  downloadBtn.addEventListener('click', function () {
    var out = buildOutputCanvas();
    if (!out) {
      setError(tr('tools.addWatermark.needText'));
      return;
    }
    out.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = state.name || 'watermarked.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  });

  clearBtn.addEventListener('click', clearAll);

  ['input', 'change'].forEach(function (ev) {
    textInput.addEventListener(ev, function () {
      state.previewReady = false;
      if (state.image) renderPreview();
      updateButtons();
    });
    fontSizeInput.addEventListener(ev, function () {
      state.previewReady = false;
      if (state.image) renderPreview();
      updateButtons();
    });
    opacityInput.addEventListener(ev, function () {
      state.previewReady = false;
      if (state.image) renderPreview();
      updateButtons();
    });
    colorInput.addEventListener(ev, function () {
      state.previewReady = false;
      if (state.image) renderPreview();
      updateButtons();
    });
  });

  window.addEventListener('resize', function () {
    if (state.image) renderPreview();
  });

  document.addEventListener('tb:locale', function () {
    if (state.image) renderPreview();
  });

  updateButtons();
});
