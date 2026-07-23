document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  var MAX_HISTORY = 12;

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var canvasWrap = document.getElementById('canvas-wrap');
  var canvas = document.getElementById('mosaic-canvas');
  var ctx = canvas.getContext('2d');
  var mosaicFields = document.getElementById('mosaic-fields');
  var brushInput = document.getElementById('brush-input');
  var blockInput = document.getElementById('block-input');
  var undoBtn = document.getElementById('undo-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');

  var state = {
    image: null,
    work: null,
    scale: 1,
    painting: false,
    history: [],
    name: 'mosaic.png',
    cursor: null
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function updateButtons() {
    var has = !!state.image;
    downloadBtn.disabled = !has;
    undoBtn.disabled = !has || state.history.length === 0;
  }

  function ensureWork() {
    if (!state.image) return null;
    if (state.work && state.work.width === state.image.naturalWidth &&
        state.work.height === state.image.naturalHeight) {
      return state.work;
    }
    var c = document.createElement('canvas');
    c.width = state.image.naturalWidth;
    c.height = state.image.naturalHeight;
    c.getContext('2d').drawImage(state.image, 0, 0);
    state.work = c;
    return c;
  }

  function pushHistory() {
    var work = ensureWork();
    if (!work) return;
    try {
      var snap = document.createElement('canvas');
      snap.width = work.width;
      snap.height = work.height;
      snap.getContext('2d').drawImage(work, 0, 0);
      state.history.push(snap);
      if (state.history.length > MAX_HISTORY) state.history.shift();
    } catch (e) { /* ignore */ }
    updateButtons();
  }

  function drawBrushCursor(cx, cy) {
    if (!state.image) return;
    var r = (parseInt(brushInput.value, 10) || 40) * state.scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(37,99,235,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!state.image) return;
    var work = ensureWork();
    var iw = work.width;
    var ih = work.height;
    var maxW = Math.min(canvasWrap.clientWidth || 640, 900);
    state.scale = Math.min(1, maxW / iw);
    var cw = Math.round(iw * state.scale);
    var ch = Math.round(ih * state.scale);
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.cursor = 'none';
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(work, 0, 0, cw, ch);
    if (state.cursor) drawBrushCursor(state.cursor.x, state.cursor.y);
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

  function paintMosaic(ix, iy) {
    var work = ensureWork();
    if (!work) return;
    var wctx = work.getContext('2d');
    var brush = parseInt(brushInput.value, 10) || 40;
    var block = parseInt(blockInput.value, 10) || 12;
    var x0 = Math.max(0, Math.floor((ix - brush) / block) * block);
    var y0 = Math.max(0, Math.floor((iy - brush) / block) * block);
    var x1 = Math.min(work.width, Math.ceil((ix + brush) / block) * block);
    var y1 = Math.min(work.height, Math.ceil((iy + brush) / block) * block);
    var brush2 = brush * brush;

    for (var by = y0; by < y1; by += block) {
      for (var bx = x0; bx < x1; bx += block) {
        var cx = bx + block / 2;
        var cy = by + block / 2;
        var dx = cx - ix;
        var dy = cy - iy;
        if (dx * dx + dy * dy > brush2) continue;
        var bw = Math.min(block, work.width - bx);
        var bh = Math.min(block, work.height - by);
        if (bw < 1 || bh < 1) continue;
        try {
          var data = wctx.getImageData(bx, by, bw, bh).data;
          var r = 0, g = 0, b = 0, n = 0;
          for (var i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
          if (!n) continue;
          wctx.fillStyle = 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
          wctx.fillRect(bx, by, bw, bh);
        } catch (e) { /* ignore */ }
      }
    }
  }

  function loadFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setError(tr('tools.addMosaic.invalidFile'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      state.image = img;
      state.work = null;
      ensureWork();
      state.history = [];
      state.cursor = null;
      state.name = (file.name || 'image').replace(/\.[^.]+$/, '') + '_mosaic.png';
      dropZone.hidden = true;
      canvasWrap.hidden = false;
      mosaicFields.hidden = false;
      setError('');
      draw();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setError(tr('tools.addMosaic.loadFailed'));
    };
    img.src = url;
  }

  function clearAll() {
    state.image = null;
    state.work = null;
    state.history = [];
    state.painting = false;
    state.cursor = null;
    fileInput.value = '';
    canvasWrap.hidden = true;
    mosaicFields.hidden = true;
    dropZone.hidden = false;
    setError('');
    updateButtons();
  }

  function download() {
    var work = ensureWork();
    if (!work) return;
    work.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = state.name || 'mosaic.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
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

  function onPointerDown(e) {
    if (!state.image) return;
    if (e.cancelable) e.preventDefault();
    var p = canvasPoint(e);
    state.cursor = p;
    pushHistory();
    state.painting = true;
    paintMosaic(p.x / state.scale, p.y / state.scale);
    draw();
  }

  function onPointerMove(e) {
    if (!state.image) return;
    var p = canvasPoint(e);
    state.cursor = p;
    if (state.painting) {
      if (e.cancelable) e.preventDefault();
      paintMosaic(p.x / state.scale, p.y / state.scale);
    }
    draw();
  }

  function onPointerUp() {
    state.painting = false;
    updateButtons();
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);

  canvas.addEventListener('mouseleave', function () {
    state.cursor = null;
    if (state.image) draw();
  });

  undoBtn.addEventListener('click', function () {
    if (!state.history.length) return;
    var snap = state.history.pop();
    state.work = snap;
    var img = new Image();
    img.onload = function () {
      state.image = img;
      draw();
    };
    img.src = snap.toDataURL('image/png');
  });

  downloadBtn.addEventListener('click', download);
  clearBtn.addEventListener('click', clearAll);

  brushInput.addEventListener('input', function () {
    if (state.image) draw();
  });
  blockInput.addEventListener('input', function () {
    if (state.image) draw();
  });

  window.addEventListener('resize', function () {
    if (state.image) draw();
  });

  updateButtons();
});
