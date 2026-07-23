document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key, params) {
    return typeof t === 'function' ? t(key, params) : key;
  }

  var MAX_FILES = 36;
  var MAX_DIM = 8192;

  var imgList = document.getElementById('img-list');
  var imgAddBtn = document.getElementById('img-add-btn');
  var fileInput = document.getElementById('file-input');
  var countMeta = document.getElementById('count-meta');
  var presetRow = document.getElementById('preset-row');
  var colsInput = document.getElementById('cols-input');
  var rowsInput = document.getElementById('rows-input');
  var gapInput = document.getElementById('gap-input');
  var bgInput = document.getElementById('bg-input');
  var fitSelect = document.getElementById('fit-select');
  var sizeMode = document.getElementById('size-mode');
  var widthInput = document.getElementById('width-input');
  var heightInput = document.getElementById('height-input');
  var cellMaxInput = document.getElementById('cell-max-input');
  var canvasWField = document.getElementById('canvas-w-field');
  var canvasHField = document.getElementById('canvas-h-field');
  var cellMaxField = document.getElementById('cell-max-field');
  var generateBtn = document.getElementById('generate-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');
  var previewWrap = document.getElementById('preview-wrap');
  var resultImg = document.getElementById('result-img');
  var resultMeta = document.getElementById('result-meta');

  var images = [];
  var dragSrcIdx = null;
  var resultBlob = null;
  var resultUrl = '';

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function revokeResult() {
    if (resultUrl) {
      try { URL.revokeObjectURL(resultUrl); } catch (e) { /* ignore */ }
      resultUrl = '';
    }
    resultBlob = null;
    resultImg.removeAttribute('src');
    previewWrap.hidden = true;
    downloadBtn.disabled = true;
    resultMeta.textContent = '';
  }

  function clampInt(el, min, max, fallback) {
    var n = parseInt(el.value, 10);
    if (!isFinite(n)) n = fallback;
    n = Math.max(min, Math.min(max, n));
    el.value = String(n);
    return n;
  }

  function gridSlots() {
    return clampInt(colsInput, 1, 6, 3) * clampInt(rowsInput, 1, 6, 3);
  }

  function updateMeta() {
    var slots = gridSlots();
    countMeta.textContent = tr('tools.imageCollage.countMeta', {
      count: images.length,
      slots: slots
    });
    generateBtn.disabled = images.length === 0;
  }

  function syncSizeFields() {
    var cell = sizeMode.value === 'cell';
    canvasWField.hidden = cell;
    canvasHField.hidden = cell;
    cellMaxField.hidden = !cell;
  }

  function syncPresetChips() {
    var cols = clampInt(colsInput, 1, 6, 3);
    var rows = clampInt(rowsInput, 1, 6, 3);
    var chips = presetRow.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      var c = parseInt(chips[i].getAttribute('data-cols'), 10);
      var r = parseInt(chips[i].getAttribute('data-rows'), 10);
      chips[i].classList.toggle('is-active', c === cols && r === rows);
    }
  }

  function renderList() {
    imgList.innerHTML = '';
    images.forEach(function (item, idx) {
      var el = document.createElement('div');
      el.className = 'img-item';
      el.draggable = true;
      el.dataset.idx = String(idx);

      var thumb = document.createElement('img');
      thumb.src = item.url;
      thumb.alt = item.name;
      el.appendChild(thumb);

      var caption = document.createElement('div');
      caption.className = 'img-caption';
      caption.textContent = (idx + 1) + '. ' + item.name;
      el.appendChild(caption);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'img-remove';
      rm.textContent = '✕';
      rm.title = tr('tools.imageCollage.remove');
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        try { URL.revokeObjectURL(item.url); } catch (err) { /* ignore */ }
        images.splice(idx, 1);
        revokeResult();
        renderList();
        updateMeta();
      });
      el.appendChild(rm);

      el.addEventListener('dragstart', function (e) {
        dragSrcIdx = idx;
        el.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', function () {
        el.classList.remove('dragging');
        dragSrcIdx = null;
      });
      el.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        var to = idx;
        if (dragSrcIdx == null || dragSrcIdx === to) return;
        var moved = images.splice(dragSrcIdx, 1)[0];
        images.splice(to, 0, moved);
        revokeResult();
        renderList();
        updateMeta();
      });

      imgList.appendChild(el);
    });
    imgList.appendChild(imgAddBtn);
  }

  function loadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && String(f.type || '').startsWith('image/');
    });
    if (!files.length) {
      setError(tr('tools.imageCollage.invalidFile'));
      return;
    }
    setError('');
    var room = MAX_FILES - images.length;
    if (room <= 0) {
      setError(tr('tools.imageCollage.tooMany', { max: MAX_FILES }));
      return;
    }
    if (files.length > room) {
      files = files.slice(0, room);
      setError(tr('tools.imageCollage.tooMany', { max: MAX_FILES }));
    }

    var pending = files.length;
    files.forEach(function (file) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        images.push({
          url: url,
          name: file.name || 'image',
          img: img,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        pending--;
        if (pending === 0) {
          revokeResult();
          renderList();
          updateMeta();
        }
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        pending--;
        setError(tr('tools.imageCollage.loadFailed'));
        if (pending === 0) {
          renderList();
          updateMeta();
        }
      };
      img.src = url;
    });
  }

  function drawFitted(ctx, img, x, y, w, h, fit) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih || w <= 0 || h <= 0) return;

    if (fit === 'contain') {
      var sc = Math.min(w / iw, h / ih);
      var dw = iw * sc;
      var dh = ih * sc;
      var dx = x + (w - dw) / 2;
      var dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      return;
    }

    var scale = Math.max(w / iw, h / ih);
    var sw = w / scale;
    var sh = h / scale;
    var sx = (iw - sw) / 2;
    var sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function generate() {
    if (!images.length) {
      setError(tr('tools.imageCollage.needImages'));
      return;
    }

    var cols = clampInt(colsInput, 1, 6, 3);
    var rows = clampInt(rowsInput, 1, 6, 3);
    var gap = clampInt(gapInput, 0, 40, 8);
    var fit = fitSelect.value === 'contain' ? 'contain' : 'cover';
    var bg = bgInput.value || '#ffffff';

    var canvasW;
    var canvasH;
    var cellW;
    var cellH;

    if (sizeMode.value === 'cell') {
      var cellMax = clampInt(cellMaxInput, 32, 4096, 400);
      cellW = cellMax;
      cellH = cellMax;
      canvasW = cols * cellW + (cols + 1) * gap;
      canvasH = rows * cellH + (rows + 1) * gap;
    } else {
      canvasW = clampInt(widthInput, 64, MAX_DIM, 1080);
      canvasH = clampInt(heightInput, 64, MAX_DIM, 1080);
      cellW = (canvasW - (cols + 1) * gap) / cols;
      cellH = (canvasH - (rows + 1) * gap) / rows;
      if (cellW < 1 || cellH < 1) {
        setError(tr('tools.imageCollage.invalidSize'));
        return;
      }
    }

    if (canvasW > MAX_DIM || canvasH > MAX_DIM || canvasW * canvasH > 40e6) {
      setError(tr('tools.imageCollage.invalidSize'));
      return;
    }

    var slots = cols * rows;
    if (images.length > slots) {
      setError(tr('tools.imageCollage.extraIgnored', { used: slots, total: images.length }));
    } else {
      setError('');
    }

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(canvasW);
    canvas.height = Math.round(canvasH);
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      setError(tr('tools.imageCollage.generateFail'));
      return;
    }

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var used = Math.min(images.length, slots);
    for (var i = 0; i < used; i++) {
      var c = i % cols;
      var r = Math.floor(i / cols);
      var x = gap + c * (cellW + gap);
      var y = gap + r * (cellH + gap);
      drawFitted(ctx, images[i].img, x, y, cellW, cellH, fit);
    }

    canvas.toBlob(function (blob) {
      if (!blob) {
        setError(tr('tools.imageCollage.generateFail'));
        return;
      }
      revokeResult();
      resultBlob = blob;
      resultUrl = URL.createObjectURL(blob);
      resultImg.src = resultUrl;
      previewWrap.hidden = false;
      downloadBtn.disabled = false;
      resultMeta.textContent = tr('tools.imageCollage.resultMeta', {
        width: canvas.width,
        height: canvas.height
      });
    }, 'image/png');
  }

  function download() {
    if (!resultBlob || !resultUrl) return;
    var a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'collage.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearAll() {
    images.forEach(function (item) {
      try { URL.revokeObjectURL(item.url); } catch (e) { /* ignore */ }
    });
    images = [];
    revokeResult();
    setError('');
    renderList();
    updateMeta();
  }

  imgAddBtn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    loadFiles(fileInput.files);
    fileInput.value = '';
  });

  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    loadFiles(e.dataTransfer.files);
  });

  presetRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cols]');
    if (!btn) return;
    colsInput.value = btn.getAttribute('data-cols');
    rowsInput.value = btn.getAttribute('data-rows');
    syncPresetChips();
    updateMeta();
    revokeResult();
  });

  colsInput.addEventListener('change', function () {
    clampInt(colsInput, 1, 6, 3);
    syncPresetChips();
    updateMeta();
    revokeResult();
  });
  rowsInput.addEventListener('change', function () {
    clampInt(rowsInput, 1, 6, 3);
    syncPresetChips();
    updateMeta();
    revokeResult();
  });
  sizeMode.addEventListener('change', function () {
    syncSizeFields();
    revokeResult();
  });

  generateBtn.addEventListener('click', generate);
  downloadBtn.addEventListener('click', download);
  clearBtn.addEventListener('click', clearAll);

  document.addEventListener('tb:locale', function () {
    renderList();
    updateMeta();
    if (resultBlob && resultImg.src) {
      resultMeta.textContent = tr('tools.imageCollage.resultMeta', {
        width: resultImg.naturalWidth || 0,
        height: resultImg.naturalHeight || 0
      });
    }
  });

  syncSizeFields();
  syncPresetChips();
  renderList();
  updateMeta();
});
