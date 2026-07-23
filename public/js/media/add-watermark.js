document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  var MARGIN = 24;
  var HANDLE = 14;
  var TILE_ANGLE = -28 * Math.PI / 180;

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var canvasWrap = document.getElementById('canvas-wrap');
  var canvas = document.getElementById('wm-canvas');
  var ctx = canvas.getContext('2d');
  var modeRow = document.getElementById('mode-row');
  var wmFields = document.getElementById('wm-fields');
  var gapField = document.getElementById('gap-field');
  var textInput = document.getElementById('text-input');
  var fontSizeInput = document.getElementById('font-size-input');
  var opacityInput = document.getElementById('opacity-input');
  var colorInput = document.getElementById('color-input');
  var gapInput = document.getElementById('gap-input');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');

  var state = {
    image: null,
    scale: 1,
    mode: 'single',
    x: 0.5,
    y: 0.5,
    dragging: false,
    resizing: false,
    dragOffX: 0,
    dragOffY: 0,
    resizeTlX: 0,
    resizeTlY: 0,
    resizeStartW: 1,
    resizeStartSize: 48,
    name: 'watermarked.png',
    metrics: null
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function updateButtons() {
    downloadBtn.disabled = !state.image || !watermarkText();
  }

  function syncModeUi() {
    var chips = modeRow.querySelectorAll('[data-mode]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-mode') === state.mode);
    }
    var tile = state.mode === 'tile';
    gapField.hidden = !tile;
    canvas.style.cursor = tile ? 'default' : 'grab';
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

  function tileGap() {
    var v = parseFloat(gapInput.value);
    if (isNaN(v)) v = 1.4;
    return Math.max(0.5, Math.min(3, v));
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

  function drawSingle(wctx, iw, ih, text, size, color, alpha) {
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

  function drawTile(wctx, iw, ih, text, size, color, alpha) {
    var rgb = hexToRgb(color);
    var metrics = measureText(wctx, text, size);
    var gap = tileGap();
    var stepX = Math.max(metrics.w + 24, metrics.w * gap);
    var stepY = Math.max(metrics.h * 2.2, metrics.h * gap * 2.4);
    var diag = Math.sqrt(iw * iw + ih * ih);

    wctx.save();
    wctx.translate(iw / 2, ih / 2);
    wctx.rotate(TILE_ANGLE);
    wctx.font = 'bold ' + size + 'px sans-serif';
    wctx.textAlign = 'center';
    wctx.textBaseline = 'middle';
    wctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';

    var startX = -diag;
    var startY = -diag;
    for (var y = startY; y < diag; y += stepY) {
      var row = Math.round((y - startY) / stepY);
      var ox = (row % 2) * (stepX / 2);
      for (var x = startX + ox; x < diag; x += stepX) {
        wctx.fillText(text, x, y);
      }
    }
    wctx.restore();
    return { metrics: metrics, anchor: null };
  }

  function drawWatermarkOn(wctx, iw, ih, text, size, color, alpha) {
    if (state.mode === 'tile') {
      return drawTile(wctx, iw, ih, text, size, color, alpha);
    }
    return drawSingle(wctx, iw, ih, text, size, color, alpha);
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

    if (state.mode === 'single' && placed.anchor) {
      var sx = placed.anchor.x * state.scale;
      var sy = placed.anchor.y * state.scale;
      var sw = placed.metrics.w * state.scale;
      var sh = placed.metrics.h * state.scale;
      var boxX = sx - 4;
      var boxY = sy - 4;
      var boxW = sw + 8;
      var boxH = sh + 8;
      ctx.save();
      ctx.strokeStyle = 'rgba(37,99,235,0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.setLineDash([]);
      var hx = boxX + boxW;
      var hy = boxY + boxH;
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
      ctx.restore();
    }

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
      state.name = (file.name || 'image').replace(/\.[^.]+$/, '') + '_watermark.png';
      state.x = 0.5;
      state.y = 0.5;
      dropZone.hidden = true;
      canvasWrap.hidden = false;
      modeRow.hidden = false;
      wmFields.hidden = false;
      setError('');
      syncModeUi();
      renderPreview();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setError(tr('tools.addWatermark.loadFailed'));
    };
    img.src = url;
  }

  function clearAll() {
    state.image = null;
    state.dragging = false;
    state.resizing = false;
    state.metrics = null;
    state.mode = 'single';
    fileInput.value = '';
    textInput.value = '';
    canvasWrap.hidden = true;
    modeRow.hidden = true;
    wmFields.hidden = true;
    gapField.hidden = true;
    dropZone.hidden = false;
    setError('');
    syncModeUi();
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

  function boxRectDisplay() {
    if (!state.image || !state.metrics || state.mode !== 'single') return null;
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    var anchor = textAnchor(iw, ih, state.metrics);
    var sx = anchor.x * state.scale - 4;
    var sy = anchor.y * state.scale - 4;
    var sw = state.metrics.w * state.scale + 8;
    var sh = state.metrics.h * state.scale + 8;
    return { x: sx, y: sy, w: sw, h: sh, tlX: anchor.x, tlY: anchor.y };
  }

  function hitResizeHandle(cx, cy) {
    var box = boxRectDisplay();
    if (!box) return false;
    var hx = box.x + box.w;
    var hy = box.y + box.h;
    var tol = Math.max(HANDLE, 18) / 2 + 4;
    return Math.abs(cx - hx) <= tol && Math.abs(cy - hy) <= tol;
  }

  function hitText(cx, cy) {
    var box = boxRectDisplay();
    if (!box) return false;
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  }

  function updateHoverCursor(p) {
    if (!state.image || state.mode !== 'single' || state.dragging || state.resizing) return;
    if (hitResizeHandle(p.x, p.y)) canvas.style.cursor = 'nwse-resize';
    else if (hitText(p.x, p.y)) canvas.style.cursor = 'grab';
    else canvas.style.cursor = 'crosshair';
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

  modeRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mode]');
    if (!btn || !state.image) return;
    state.mode = btn.getAttribute('data-mode') === 'tile' ? 'tile' : 'single';
    state.dragging = false;
    state.resizing = false;
    setError('');
    syncModeUi();
    renderPreview();
  });

  function onPointerDown(e) {
    if (!state.image || state.mode !== 'single' || !watermarkText()) return;
    if (e.cancelable) e.preventDefault();
    var p = canvasPoint(e);
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;

    if (hitResizeHandle(p.x, p.y) && state.metrics) {
      var anchor = textAnchor(iw, ih, state.metrics);
      state.resizing = true;
      state.dragging = false;
      state.resizeTlX = anchor.x;
      state.resizeTlY = anchor.y;
      state.resizeStartW = Math.max(1, state.metrics.w);
      state.resizeStartSize = fontSize();
      canvas.style.cursor = 'nwse-resize';
      return;
    }

    if (!hitText(p.x, p.y)) {
      state.x = p.x / (canvas.width || 1);
      state.y = p.y / (canvas.height || 1);
      renderPreview();
      return;
    }
    var anchorMove = textAnchor(iw, ih, state.metrics);
    state.dragging = true;
    state.resizing = false;
    canvas.style.cursor = 'grabbing';
    state.dragOffX = p.x / state.scale - (anchorMove.x + state.metrics.w / 2);
    state.dragOffY = p.y / state.scale - (anchorMove.y + state.metrics.h / 2);
  }

  function onPointerMove(e) {
    if (!state.image || state.mode !== 'single') return;
    var p = canvasPoint(e);

    if (state.resizing) {
      if (e.cancelable) e.preventDefault();
      var iw = state.image.naturalWidth;
      var ih = state.image.naturalHeight;
      var px = p.x / state.scale;
      var targetW = Math.max(16, px - state.resizeTlX);
      var ratio = targetW / state.resizeStartW;
      var newSize = Math.round(state.resizeStartSize * ratio);
      newSize = Math.max(12, Math.min(400, newSize));
      fontSizeInput.value = String(newSize);
      var metrics = measureText(ctx, watermarkText(), newSize);
      state.x = Math.max(0, Math.min(1, (state.resizeTlX + metrics.w / 2) / iw));
      state.y = Math.max(0, Math.min(1, (state.resizeTlY + metrics.h / 2) / ih));
      renderPreview();
      return;
    }

    if (state.dragging) {
      if (e.cancelable) e.preventDefault();
      var iw2 = state.image.naturalWidth;
      var ih2 = state.image.naturalHeight;
      var ax = p.x / state.scale - state.dragOffX;
      var ay = p.y / state.scale - state.dragOffY;
      state.x = Math.max(0, Math.min(1, ax / iw2));
      state.y = Math.max(0, Math.min(1, ay / ih2));
      renderPreview();
      return;
    }

    updateHoverCursor(p);
  }

  function onPointerUp() {
    if (state.dragging || state.resizing) {
      state.dragging = false;
      state.resizing = false;
      if (state.mode === 'single') canvas.style.cursor = 'grab';
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);

  downloadBtn.addEventListener('click', function () {
    var out = buildOutputCanvas();
    if (!out) {
      setError(tr('tools.addWatermark.needText'));
      return;
    }
    setError('');
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

  function schedulePreview() {
    if (state.image) renderPreview();
    else updateButtons();
  }

  ['input', 'change'].forEach(function (ev) {
    textInput.addEventListener(ev, schedulePreview);
    fontSizeInput.addEventListener(ev, schedulePreview);
    opacityInput.addEventListener(ev, schedulePreview);
    colorInput.addEventListener(ev, schedulePreview);
    gapInput.addEventListener(ev, schedulePreview);
  });

  window.addEventListener('resize', function () {
    if (state.image) renderPreview();
  });

  document.addEventListener('tb:locale', function () {
    if (state.image) renderPreview();
  });

  updateButtons();
});
