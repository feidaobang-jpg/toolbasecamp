/**
 * Brush mask for local inpaint (图生图 · 局部重绘).
 * White = edit region; supports multiple disconnected strokes.
 */
(function (global) {
  'use strict';

  function createMaskPainter(opts) {
    opts = opts || {};
    var wrap = opts.wrap;
    var canvas = opts.canvas;
    var brushInput = opts.brushInput;
    var clearBtn = opts.clearBtn;
    if (!wrap || !canvas) return null;

    var ctx = canvas.getContext('2d');
    var img = new Image();
    var naturalW = 0;
    var naturalH = 0;
    var painting = false;
    var objectUrl = null;
    var hasPaint = false;
    var scale = 1;

    function brushRadius() {
      var v = brushInput ? parseInt(brushInput.value, 10) : 36;
      if (!Number.isFinite(v) || v < 8) v = 8;
      if (v > 120) v = 120;
      return v;
    }

    function syncSize() {
      if (!naturalW || !naturalH) return;
      var maxW = Math.max(280, (wrap.clientWidth || 360) - 4);
      scale = Math.min(1, maxW / naturalW);
      var dw = Math.max(1, Math.round(naturalW * scale));
      var dh = Math.max(1, Math.round(naturalH * scale));
      if (canvas.width === dw && canvas.height === dh) {
        redraw();
        return;
      }
      canvas.width = dw;
      canvas.height = dh;
      canvas.style.width = dw + 'px';
      canvas.style.height = dh + 'px';
      if (_strokeLayer) {
        ensureStrokeLayer();
      }
      redraw();
    }

    function redraw() {
      if (!naturalW) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Restore strokes from offscreen if we kept them — for v1 redraw clears strokes
      // after resize; keep simple: strokes live on overlay buffer.
      if (_strokeLayer) {
        ctx.drawImage(_strokeLayer, 0, 0);
      }
    }

    var _strokeLayer = null;
    var _strokeCtx = null;

    function ensureStrokeLayer() {
      if (_strokeLayer && _strokeLayer.width === canvas.width && _strokeLayer.height === canvas.height) {
        return;
      }
      var prev = _strokeLayer;
      _strokeLayer = document.createElement('canvas');
      _strokeLayer.width = canvas.width;
      _strokeLayer.height = canvas.height;
      _strokeCtx = _strokeLayer.getContext('2d');
      if (prev) {
        _strokeCtx.drawImage(prev, 0, 0, canvas.width, canvas.height);
      }
    }

    function paintAt(cx, cy) {
      ensureStrokeLayer();
      var br = brushRadius();
      _strokeCtx.fillStyle = 'rgba(37, 99, 235, 0.45)';
      _strokeCtx.beginPath();
      _strokeCtx.arc(cx, cy, br, 0, Math.PI * 2);
      _strokeCtx.fill();
      hasPaint = true;
      redraw();
      if (typeof opts.onChange === 'function') opts.onChange();
    }

    function pointerPos(e) {
      var rect = canvas.getBoundingClientRect();
      var clientX = e.clientX;
      var clientY = e.clientY;
      if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height
      };
    }

    function onDown(e) {
      e.preventDefault();
      painting = true;
      var p = pointerPos(e);
      paintAt(p.x, p.y);
    }

    function onMove(e) {
      if (!painting) return;
      e.preventDefault();
      var p = pointerPos(e);
      paintAt(p.x, p.y);
    }

    function onUp() {
      painting = false;
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', onUp);

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearMask();
      });
    }

    function clearMask() {
      _strokeLayer = null;
      _strokeCtx = null;
      hasPaint = false;
      redraw();
      if (typeof opts.onChange === 'function') opts.onChange();
    }

    function setFile(file) {
      clearMask();
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
        objectUrl = null;
      }
      if (!file) {
        naturalW = naturalH = 0;
        wrap.hidden = true;
        return Promise.resolve();
      }
      objectUrl = URL.createObjectURL(file);
      return new Promise(function (resolve, reject) {
        img.onload = function () {
          naturalW = img.naturalWidth || img.width;
          naturalH = img.naturalHeight || img.height;
          wrap.hidden = false;
          syncSize();
          resolve();
        };
        img.onerror = function () {
          reject(new Error('image load failed'));
        };
        img.src = objectUrl;
      });
    }

    /** Export mask at natural resolution: white = paint, black = keep. */
    function exportMaskBlob() {
      if (!hasPaint || !naturalW || !naturalH || !_strokeLayer) {
        return Promise.resolve(null);
      }
      var out = document.createElement('canvas');
      out.width = naturalW;
      out.height = naturalH;
      var octx = out.getContext('2d');
      octx.fillStyle = '#000';
      octx.fillRect(0, 0, naturalW, naturalH);

      // Convert blue overlay strokes → white mask
      var tmp = document.createElement('canvas');
      tmp.width = _strokeLayer.width;
      tmp.height = _strokeLayer.height;
      var tctx = tmp.getContext('2d');
      tctx.drawImage(_strokeLayer, 0, 0);
      var data = tctx.getImageData(0, 0, tmp.width, tmp.height);
      var px = data.data;
      for (var i = 0; i < px.length; i += 4) {
        var a = px[i + 3];
        if (a > 8) {
          px[i] = px[i + 1] = px[i + 2] = 255;
          px[i + 3] = 255;
        } else {
          px[i] = px[i + 1] = px[i + 2] = 0;
          px[i + 3] = 255;
        }
      }
      tctx.putImageData(data, 0, 0);
      octx.imageSmoothingEnabled = true;
      octx.drawImage(tmp, 0, 0, naturalW, naturalH);
      return new Promise(function (resolve) {
        out.toBlob(function (blob) {
          resolve(blob);
        }, 'image/png');
      });
    }

    function destroy() {
      clearMask();
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
        objectUrl = null;
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      try {
        new ResizeObserver(function () {
          if (naturalW) syncSize();
        }).observe(wrap);
      } catch (e) {}
    }

    return {
      setFile: setFile,
      clearMask: clearMask,
      exportMaskBlob: exportMaskBlob,
      hasPaint: function () { return hasPaint; },
      destroy: destroy,
      syncSize: syncSize
    };
  }

  global.TBInstructEditMask = { createMaskPainter: createMaskPainter };
})(typeof window !== 'undefined' ? window : this);
