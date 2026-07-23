document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return location.origin + '/api';
  }

  var MIN_W = 6;
  var MIN_H = 4;
  var HANDLE = 22;
  var BOX_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
  var MAX_HISTORY = 12;

  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var canvasWrap = document.getElementById('canvas-wrap');
  var canvas = document.getElementById('wm-canvas');
  var ctx = canvas.getContext('2d');
  var modeRow = document.getElementById('mode-row');
  var tipErase = document.getElementById('tip-erase');
  var tipMosaic = document.getElementById('tip-mosaic');
  var mosaicFields = document.getElementById('mosaic-fields');
  var eraseActions = document.getElementById('erase-actions');
  var mosaicActions = document.getElementById('mosaic-actions');
  var brushInput = document.getElementById('brush-input');
  var blockInput = document.getElementById('block-input');
  var processBtn = document.getElementById('process-btn');
  var addBoxBtn = document.getElementById('add-box-btn');
  var delBoxBtn = document.getElementById('del-box-btn');
  var downloadBtn = document.getElementById('download-btn');
  var downloadBtn2 = document.getElementById('download-btn-2');
  var clearBtn = document.getElementById('clear-btn');
  var clearBtn2 = document.getElementById('clear-btn-2');
  var undoMosaicBtn = document.getElementById('undo-mosaic-btn');
  var errorBox = document.getElementById('error-box');

  var state = {
    mode: 'erase',
    blob: null,
    image: null,
    work: null,
    scale: 1,
    regions: [],
    active: 0,
    drag: null,
    painting: false,
    history: [],
    name: 'image.png'
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function clampRegion(r, iw, ih) {
    var w = Math.max(MIN_W, Math.min(r.w, iw));
    var h = Math.max(MIN_H, Math.min(r.h, ih));
    var x = Math.max(0, Math.min(r.x, iw - w));
    var y = Math.max(0, Math.min(r.y, ih - h));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function centerRegion(iw, ih) {
    var rw = Math.max(MIN_W, Math.floor(iw * 0.22));
    var rh = Math.max(MIN_H, Math.floor(ih * 0.06));
    return clampRegion({
      x: Math.floor((iw - rw) / 2),
      y: Math.floor((ih - rh) / 2),
      w: rw,
      h: rh
    }, iw, ih);
  }

  function syncModeUi() {
    var erase = state.mode === 'erase';
    tipErase.hidden = !erase;
    tipMosaic.hidden = erase;
    mosaicFields.hidden = erase;
    eraseActions.hidden = !erase;
    mosaicActions.hidden = erase;
    var chips = modeRow.querySelectorAll('[data-mode]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-mode') === state.mode);
    }
    canvas.style.cursor = erase ? 'crosshair' : 'none';
    updateButtons();
    draw();
  }

  function updateButtons() {
    var has = !!state.image;
    processBtn.disabled = !has || !state.regions.length;
    addBoxBtn.disabled = !has;
    delBoxBtn.disabled = !has || state.regions.length <= 1;
    downloadBtn.disabled = !has;
    downloadBtn2.disabled = !has;
    undoMosaicBtn.disabled = !has || state.history.length === 0;
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

  function setWorkingFromDataUrl(dataUrl, filename) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        state.image = img;
        state.work = null;
        ensureWork();
        state.regions = [centerRegion(img.naturalWidth, img.naturalHeight)];
        state.active = 0;
        state.history = [];
        if (filename) state.name = filename;
        fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
          state.blob = blob;
          draw();
          resolve();
        }).catch(function () {
          state.blob = null;
          draw();
          resolve();
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function drawBrushCursor(cx, cy) {
    if (state.mode !== 'mosaic' || !state.image) return;
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
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(work, 0, 0, cw, ch);

    if (state.mode === 'erase') {
      state.regions.forEach(function (region, idx) {
        var isActive = idx === state.active;
        var color = BOX_COLORS[idx % BOX_COLORS.length];
        var sx = region.x * state.scale;
        var sy = region.y * state.scale;
        var sw = region.w * state.scale;
        var sh = region.h * state.scale;
        ctx.fillStyle = isActive ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.15)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = isActive ? '#ef4444' : color;
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.setLineDash(isActive ? [6, 4] : [4, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
        ctx.fillStyle = isActive ? '#ef4444' : color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(String(idx + 1), sx + 4, sy + 14);
        if (isActive) {
          [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh],
            [sx + sw / 2, sy], [sx + sw / 2, sy + sh], [sx, sy + sh / 2], [sx + sw, sy + sh / 2]
          ].forEach(function (p) {
            ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
          });
        }
      });
    }
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

  function near(px, py, tx, ty, tol) {
    return Math.abs(px - tx) <= tol && Math.abs(py - ty) <= tol;
  }

  function hitTest(cx, cy) {
    for (var idx = state.regions.length - 1; idx >= 0; idx--) {
      var r = state.regions[idx];
      var sx = r.x * state.scale;
      var sy = r.y * state.scale;
      var sw = r.w * state.scale;
      var sh = r.h * state.scale;
      if (idx === state.active) {
        var tol = Math.max(10, Math.min(HANDLE, sw * 0.4, sh * 0.4));
        if (near(cx, cy, sx, sy, tol)) return { idx: idx, mode: 'nw' };
        if (near(cx, cy, sx + sw, sy, tol)) return { idx: idx, mode: 'ne' };
        if (near(cx, cy, sx, sy + sh, tol)) return { idx: idx, mode: 'sw' };
        if (near(cx, cy, sx + sw, sy + sh, tol)) return { idx: idx, mode: 'se' };
        if (Math.abs(cy - sy) <= tol && cx >= sx && cx <= sx + sw) return { idx: idx, mode: 'n' };
        if (Math.abs(cy - (sy + sh)) <= tol && cx >= sx && cx <= sx + sw) return { idx: idx, mode: 's' };
        if (Math.abs(cx - sx) <= tol && cy >= sy && cy <= sy + sh) return { idx: idx, mode: 'w' };
        if (Math.abs(cx - (sx + sw)) <= tol && cy >= sy && cy <= sy + sh) return { idx: idx, mode: 'e' };
      }
      if (cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh) {
        return { idx: idx, mode: 'move' };
      }
    }
    return null;
  }

  function applyDrag(mode, r0, dx, dy, iw, ih) {
    var r = { x: r0.x, y: r0.y, w: r0.w, h: r0.h };
    if (mode === 'move') {
      r.x = r0.x + dx;
      r.y = r0.y + dy;
    } else {
      if (mode.indexOf('n') !== -1) { r.y = r0.y + dy; r.h = r0.h - dy; }
      if (mode.indexOf('s') !== -1) { r.h = r0.h + dy; }
      if (mode.indexOf('w') !== -1) { r.x = r0.x + dx; r.w = r0.w - dx; }
      if (mode.indexOf('e') !== -1) { r.w = r0.w + dx; }
    }
    return clampRegion(r, iw, ih);
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

  function syncBlobFromWork(done) {
    var work = ensureWork();
    if (!work) {
      if (done) done();
      return;
    }
    work.toBlob(function (blob) {
      if (blob) state.blob = blob;
      if (done) done();
    }, 'image/png');
  }

  function loadFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setError(tr('tools.smartErase.invalidFile'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      state.blob = file;
      state.image = img;
      state.work = null;
      ensureWork();
      state.regions = [centerRegion(img.naturalWidth, img.naturalHeight)];
      state.active = 0;
      state.history = [];
      state.name = (file.name || 'image').replace(/\.[^.]+$/, '') + '_edited.png';
      dropZone.hidden = true;
      canvasWrap.hidden = false;
      modeRow.hidden = false;
      setError('');
      syncModeUi();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setError(tr('tools.smartErase.loadFailed'));
    };
    img.src = url;
  }

  function clearAll() {
    state.blob = null;
    state.image = null;
    state.work = null;
    state.regions = [];
    state.active = 0;
    state.history = [];
    state.drag = null;
    state.painting = false;
    fileInput.value = '';
    canvasWrap.hidden = true;
    modeRow.hidden = true;
    dropZone.hidden = false;
    setError('');
    updateButtons();
  }

  function processErase() {
    if (!state.blob || !state.regions.length) return;
    setError('');
    processBtn.disabled = true;
    syncBlobFromWork(function () {
      var form = new FormData();
      form.append('image', state.blob, state.name || 'image.png');
      form.append('regions', JSON.stringify(state.regions));
      fetch(apiBase() + '/watermark/image/process', { method: 'POST', body: form })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = {};
            try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
            if (!res.ok) {
              var detail = data.detail;
              if (Array.isArray(detail)) {
                detail = detail.map(function (x) { return x.msg || JSON.stringify(x); }).join('; ');
              }
              throw new Error(detail || res.statusText || tr('tools.smartErase.processFail'));
            }
            if (!data.success || !data.image_data) {
              throw new Error(tr('tools.smartErase.processFail'));
            }
            return setWorkingFromDataUrl(data.image_data, data.filename || state.name);
          });
        })
        .catch(function (err) {
          var msg = err && err.message ? err.message : tr('tools.smartErase.processFail');
          if (String(msg).indexOf('Failed to fetch') !== -1) {
            msg = tr('tools.smartErase.networkError');
          } else if (/not found/i.test(msg) || msg === 'Not Found') {
            msg = tr('tools.smartErase.notReady');
          }
          setError(msg);
        })
        .finally(function () {
          updateButtons();
        });
    });
  }

  function download() {
    var work = ensureWork();
    if (!work) return;
    work.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = state.name || 'smart-erase.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  modeRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mode]');
    if (!btn) return;
    state.mode = btn.getAttribute('data-mode') === 'mosaic' ? 'mosaic' : 'erase';
    state.drag = null;
    state.painting = false;
    setError('');
    syncModeUi();
  });

  function onPointerDown(e) {
    if (!state.image) return;
    if (e.cancelable) e.preventDefault();
    var p = canvasPoint(e);
    if (state.mode === 'mosaic') {
      pushHistory();
      state.painting = true;
      paintMosaic(p.x / state.scale, p.y / state.scale);
      draw();
      drawBrushCursor(p.x, p.y);
      return;
    }
    var hit = hitTest(p.x, p.y);
    var iw = state.image.naturalWidth;
    var ih = state.image.naturalHeight;
    if (hit) {
      state.active = hit.idx;
      state.drag = {
        mode: hit.mode,
        startX: p.x,
        startY: p.y,
        origin: Object.assign({}, state.regions[hit.idx])
      };
    } else {
      var x = Math.round(p.x / state.scale);
      var y = Math.round(p.y / state.scale);
      state.regions.push(clampRegion({ x: x, y: y, w: MIN_W, h: MIN_H }, iw, ih));
      state.active = state.regions.length - 1;
      state.drag = {
        mode: 'se',
        startX: p.x,
        startY: p.y,
        origin: Object.assign({}, state.regions[state.active])
      };
    }
    draw();
  }

  function onPointerMove(e) {
    if (!state.image) return;
    var p = canvasPoint(e);
    if (state.mode === 'mosaic') {
      if (state.painting) {
        if (e.cancelable) e.preventDefault();
        paintMosaic(p.x / state.scale, p.y / state.scale);
      }
      draw();
      drawBrushCursor(p.x, p.y);
      return;
    }
    if (!state.drag) return;
    if (e.cancelable) e.preventDefault();
    var dx = (p.x - state.drag.startX) / state.scale;
    var dy = (p.y - state.drag.startY) / state.scale;
    state.regions[state.active] = applyDrag(
      state.drag.mode,
      state.drag.origin,
      dx,
      dy,
      state.image.naturalWidth,
      state.image.naturalHeight
    );
    draw();
  }

  function onPointerUp() {
    if (state.painting) {
      state.painting = false;
      syncBlobFromWork();
      updateButtons();
    }
    state.drag = null;
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);

  addBoxBtn.addEventListener('click', function () {
    if (!state.image) return;
    state.regions.push(centerRegion(state.image.naturalWidth, state.image.naturalHeight));
    state.active = state.regions.length - 1;
    draw();
  });
  delBoxBtn.addEventListener('click', function () {
    if (state.regions.length <= 1) return;
    state.regions.splice(state.active, 1);
    state.active = Math.min(state.active, state.regions.length - 1);
    draw();
  });
  processBtn.addEventListener('click', processErase);
  downloadBtn.addEventListener('click', download);
  downloadBtn2.addEventListener('click', download);
  clearBtn.addEventListener('click', clearAll);
  clearBtn2.addEventListener('click', clearAll);
  undoMosaicBtn.addEventListener('click', function () {
    if (!state.history.length) return;
    var snap = state.history.pop();
    state.work = snap;
    var img = new Image();
    img.onload = function () {
      state.image = img;
      syncBlobFromWork(function () { draw(); });
    };
    img.src = snap.toDataURL('image/png');
  });

  window.addEventListener('resize', function () {
    if (state.image) draw();
  });

  document.addEventListener('tb:locale', function () {
    if (state.image) syncModeUi();
  });

  updateButtons();
});
