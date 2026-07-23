document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function tr(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  var fgDrop = document.getElementById('fg-drop');
  var fgInput = document.getElementById('fg-input');
  var fgSource = document.getElementById('fg-source');
  var fgPreview = document.getElementById('fg-preview');
  var fgReselect = document.getElementById('fg-reselect');
  var bgModeRow = document.getElementById('bg-mode-row');
  var colorFields = document.getElementById('color-fields');
  var colorInput = document.getElementById('color-input');
  var bgImageBlock = document.getElementById('bg-image-block');
  var bgDrop = document.getElementById('bg-drop');
  var bgInput = document.getElementById('bg-input');
  var bgSource = document.getElementById('bg-source');
  var bgPreview = document.getElementById('bg-preview');
  var bgReselect = document.getElementById('bg-reselect');
  var scaleInput = document.getElementById('scale-input');
  var scaleVal = document.getElementById('scale-val');
  var generateBtn = document.getElementById('generate-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var errorBox = document.getElementById('error-box');
  var previewWrap = document.getElementById('preview-wrap');
  var resultImg = document.getElementById('result-img');
  var resultMeta = document.getElementById('result-meta');

  var state = {
    mode: 'color',
    fg: null,
    fgUrl: '',
    bg: null,
    bgUrl: '',
    resultUrl: '',
    name: 'with-background.png'
  };

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }

  function scalePct() {
    return Math.max(10, Math.min(100, parseInt(scaleInput.value, 10) || 85));
  }

  function syncScaleLabel() {
    scaleVal.textContent = scalePct() + '%';
  }

  function updateButtons() {
    var ready = !!state.fg && (state.mode === 'color' || !!state.bg);
    generateBtn.disabled = !ready;
    downloadBtn.disabled = !state.resultUrl;
  }

  function syncModeUi() {
    var chips = bgModeRow.querySelectorAll('[data-mode]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-mode') === state.mode);
    }
    colorFields.hidden = state.mode !== 'color';
    bgImageBlock.hidden = state.mode !== 'image';
    updateButtons();
  }

  function revoke(url) {
    if (url) {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    }
  }

  function loadImageFile(file, kind) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setError(tr('tools.addBackground.invalidFile'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      setError('');
      if (kind === 'fg') {
        revoke(state.fgUrl);
        state.fg = img;
        state.fgUrl = url;
        state.name = (file.name || 'image').replace(/\.[^.]+$/, '') + '_bg.png';
        fgPreview.src = url;
        fgDrop.hidden = true;
        fgSource.hidden = false;
      } else {
        revoke(state.bgUrl);
        state.bg = img;
        state.bgUrl = url;
        bgPreview.src = url;
        bgDrop.hidden = true;
        bgSource.hidden = false;
      }
      clearResult();
      updateButtons();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setError(tr('tools.addBackground.loadFailed'));
    };
    img.src = url;
  }

  function clearResult() {
    if (state.resultUrl) {
      revoke(state.resultUrl);
      state.resultUrl = '';
    }
    resultImg.removeAttribute('src');
    previewWrap.hidden = true;
    resultMeta.textContent = '';
    updateButtons();
  }

  function compose() {
    if (!state.fg) {
      setError(tr('tools.addBackground.needFg'));
      return null;
    }
    if (state.mode === 'image' && !state.bg) {
      setError(tr('tools.addBackground.needBg'));
      return null;
    }

    var pct = scalePct() / 100;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var fw = state.fg.naturalWidth;
    var fh = state.fg.naturalHeight;
    var cw;
    var ch;
    var dw;
    var dh;
    var dx;
    var dy;

    if (state.mode === 'image') {
      cw = state.bg.naturalWidth;
      ch = state.bg.naturalHeight;
      canvas.width = cw;
      canvas.height = ch;
      ctx.drawImage(state.bg, 0, 0, cw, ch);
      var fit = Math.min(cw / fw, ch / fh) * pct;
      dw = Math.max(1, fw * fit);
      dh = Math.max(1, fh * fit);
      dx = (cw - dw) / 2;
      dy = (ch - dh) / 2;
      ctx.drawImage(state.fg, dx, dy, dw, dh);
    } else {
      dw = Math.max(1, fw * pct);
      dh = Math.max(1, fh * pct);
      cw = Math.ceil(dw);
      ch = Math.ceil(dh);
      canvas.width = cw;
      canvas.height = ch;
      ctx.fillStyle = colorInput.value || '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      dx = (cw - dw) / 2;
      dy = (ch - dh) / 2;
      ctx.drawImage(state.fg, dx, dy, dw, dh);
    }

    return canvas;
  }

  function generate() {
    var canvas = compose();
    if (!canvas) return;
    setError('');
    canvas.toBlob(function (blob) {
      if (!blob) {
        setError(tr('tools.addBackground.generateFail'));
        return;
      }
      clearResult();
      state.resultUrl = URL.createObjectURL(blob);
      resultImg.src = state.resultUrl;
      previewWrap.hidden = false;
      resultMeta.textContent = tr('tools.addBackground.resultMeta')
        .replace('{width}', String(canvas.width))
        .replace('{height}', String(canvas.height));
      updateButtons();
    }, 'image/png');
  }

  function clearAll() {
    revoke(state.fgUrl);
    revoke(state.bgUrl);
    clearResult();
    state.fg = null;
    state.bg = null;
    state.fgUrl = '';
    state.bgUrl = '';
    fgInput.value = '';
    bgInput.value = '';
    fgPreview.removeAttribute('src');
    bgPreview.removeAttribute('src');
    fgDrop.hidden = false;
    fgSource.hidden = true;
    bgDrop.hidden = false;
    bgSource.hidden = true;
    state.mode = 'color';
    colorInput.value = '#ffffff';
    scaleInput.value = '85';
    syncScaleLabel();
    syncModeUi();
    setError('');
  }

  function bindDrop(zone, input, kind) {
    zone.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) loadImageFile(input.files[0], kind);
      input.value = '';
    });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', function () { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadImageFile(e.dataTransfer.files[0], kind);
      }
    });
  }

  bindDrop(fgDrop, fgInput, 'fg');
  bindDrop(bgDrop, bgInput, 'bg');

  fgReselect.addEventListener('click', function () { fgInput.click(); });
  bgReselect.addEventListener('click', function () { bgInput.click(); });

  bgModeRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mode]');
    if (!btn) return;
    state.mode = btn.getAttribute('data-mode') === 'image' ? 'image' : 'color';
    clearResult();
    syncModeUi();
  });

  scaleInput.addEventListener('input', function () {
    syncScaleLabel();
    clearResult();
  });
  colorInput.addEventListener('input', function () { clearResult(); });

  generateBtn.addEventListener('click', generate);
  downloadBtn.addEventListener('click', function () {
    if (!state.resultUrl) return;
    var a = document.createElement('a');
    a.href = state.resultUrl;
    a.download = state.name || 'with-background.png';
    a.click();
  });
  clearBtn.addEventListener('click', clearAll);

  document.addEventListener('tb:locale', function () {
    syncScaleLabel();
    if (state.resultUrl && resultImg.naturalWidth) {
      resultMeta.textContent = tr('tools.addBackground.resultMeta')
        .replace('{width}', String(resultImg.naturalWidth))
        .replace('{height}', String(resultImg.naturalHeight));
    }
  });

  syncScaleLabel();
  syncModeUi();
});
