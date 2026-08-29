/**
 * 本地图片「上传到服务端」前统一压缩（全站共用）。
 * - 长边超过 maxEdge，或体积超过 minBytes → 缩边 + JPEG
 * - GIF 不压（动画会坏）；非图片原样返回
 * - 桌面/手机都生效
 * - 压缩过程显示全屏轻量转圈（短任务延迟出现，避免闪一下）
 *
 * 预设：
 *   default  图生图 / 抠图 / 理解 — 长边 1600
 *   ocr      OCR / 药签 — 长边 2400（保字）
 *   enhance  画质增强 — 长边 2560、更大体积才压
 *   video    图生视频 / 参考图 — 长边 1600
 */
(function (global) {
  'use strict';

  var PRESETS = {
    default: { maxEdge: 1600, minBytes: 1200 * 1024, quality: 0.86 },
    ocr: { maxEdge: 2400, minBytes: 1500 * 1024, quality: 0.88 },
    enhance: { maxEdge: 2560, minBytes: 2500 * 1024, quality: 0.9 },
    video: { maxEdge: 1600, minBytes: 1200 * 1024, quality: 0.86 }
  };

  var DEFAULTS = PRESETS.default;
  var busyDepth = 0;
  var busyShowTimer = null;
  var busyEl = null;
  var busyTextEl = null;
  var stylesReady = false;

  function tr(key, fallback, vars) {
    try {
      if (typeof global.t === 'function') {
        var s = global.t(key, vars);
        if (s && s !== key) return s;
      }
    } catch (e) { /* ignore */ }
    var out = fallback || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = String(out).split('{' + k + '}').join(String(vars[k]));
      });
    }
    return out;
  }

  function ensureStyles() {
    if (stylesReady) return;
    stylesReady = true;
    var css = document.createElement('style');
    css.id = 'tb-img-compress-styles';
    css.textContent =
      '#tb-img-compress-busy{position:fixed;inset:0;z-index:10050;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.35);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}' +
      '#tb-img-compress-busy.is-on{display:flex;}' +
      '#tb-img-compress-busy .tb-img-compress-card{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 24px;border-radius:14px;background:#fff;box-shadow:0 12px 40px rgba(15,23,42,.2);max-width:min(86vw,320px);}' +
      '#tb-img-compress-busy .tb-img-compress-spin{width:28px;height:28px;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:tb-img-compress-spin .7s linear infinite;}' +
      '#tb-img-compress-busy .tb-img-compress-text{margin:0;font-size:14px;line-height:1.4;color:#0f172a;text-align:center;}' +
      '@keyframes tb-img-compress-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(css);
  }

  function ensureBusyEl() {
    ensureStyles();
    if (busyEl && busyEl.parentNode) return busyEl;
    busyEl = document.createElement('div');
    busyEl.id = 'tb-img-compress-busy';
    busyEl.setAttribute('role', 'status');
    busyEl.setAttribute('aria-live', 'polite');
    busyEl.innerHTML =
      '<div class="tb-img-compress-card">' +
      '<div class="tb-img-compress-spin" aria-hidden="true"></div>' +
      '<p class="tb-img-compress-text"></p>' +
      '</div>';
    busyTextEl = busyEl.querySelector('.tb-img-compress-text');
    document.body.appendChild(busyEl);
    return busyEl;
  }

  function setBusyText(msg) {
    ensureBusyEl();
    if (busyTextEl) busyTextEl.textContent = msg || tr('common.compressingImages', '正在压缩图片…');
  }

  function beginBusy(msg) {
    busyDepth += 1;
    setBusyText(msg);
    if (busyDepth !== 1) return;
    if (busyShowTimer) clearTimeout(busyShowTimer);
    busyShowTimer = setTimeout(function () {
      busyShowTimer = null;
      if (busyDepth <= 0) return;
      ensureBusyEl().classList.add('is-on');
    }, 120);
  }

  function endBusy() {
    busyDepth = Math.max(0, busyDepth - 1);
    if (busyDepth > 0) return;
    if (busyShowTimer) {
      clearTimeout(busyShowTimer);
      busyShowTimer = null;
    }
    if (busyEl) busyEl.classList.remove('is-on');
  }

  function optsWith(opts) {
    var base = DEFAULTS;
    var o = opts || {};
    if (typeof opts === 'string') {
      base = PRESETS[opts] || DEFAULTS;
      o = {};
    } else if (o.preset && PRESETS[o.preset]) {
      base = PRESETS[o.preset];
    }
    return {
      maxEdge: Number(o.maxEdge) > 0 ? Number(o.maxEdge) : base.maxEdge,
      minBytes: Number(o.minBytes) > 0 ? Number(o.minBytes) : base.minBytes,
      quality: Number(o.quality) > 0 && Number(o.quality) <= 1 ? Number(o.quality) : base.quality,
      silent: !!o.silent
    };
  }

  function isCompressibleImage(file) {
    if (!file) return false;
    var type = String(file.type || '').toLowerCase();
    return (
      type === 'image/jpeg'
      || type === 'image/jpg'
      || type === 'image/webp'
      || type === 'image/png'
    );
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        resolve(img);
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('blob encode failed'));
        else resolve(blob);
      }, type, quality);
    });
  }

  function toFile(blob, srcFile) {
    var base = (srcFile && srcFile.name) || 'image';
    var name = base.replace(/\.\w+$/, '') + '.jpg';
    if (typeof File !== 'undefined') {
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    }
    blob.name = name;
    return blob;
  }

  function likelyNeedsWork(file, cfg) {
    if (!isCompressibleImage(file)) return false;
    if (file.size >= cfg.minBytes) return true;
    // 边长未知时，对较大文件也先给提示（≥800KB）
    return file.size >= 800 * 1024;
  }

  /**
   * @param {File|Blob} file
   * @param {string|{maxEdge?:number,minBytes?:number,quality?:number,preset?:string,silent?:boolean}} [opts]
   * @returns {Promise<File|Blob>}
   */
  async function compressIfNeeded(file, opts) {
    var cfg = optsWith(opts);
    var show = !cfg.silent && likelyNeedsWork(file, cfg);
    if (show) beginBusy(tr('common.compressingImages', '正在压缩图片…'));
    try {
      if (!isCompressibleImage(file)) return file;
      var img = await loadImageFromFile(file);
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (!w || !h) return file;

      var longEdge = Math.max(w, h);
      var overEdge = longEdge > cfg.maxEdge;
      var overBytes = file.size >= cfg.minBytes;
      var forceJpeg = String(file.type || '').toLowerCase() === 'image/png' && overBytes;
      if (!overEdge && !overBytes && !forceJpeg) return file;

      if (!cfg.silent && !show) {
        beginBusy(tr('common.compressingImages', '正在压缩图片…'));
        show = true;
      }

      var scale = overEdge ? (cfg.maxEdge / longEdge) : 1;
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, tw, th);

      var blob = await canvasToBlob(canvas, 'image/jpeg', cfg.quality);
      if (!blob) return file;
      if (!overEdge && blob.size >= file.size * 0.95) return file;
      return toFile(blob, file);
    } catch (e) {
      return file;
    } finally {
      if (show) endBusy();
    }
  }

  /**
   * @param {Array<File|Blob>} files
   * @param {string|{maxEdge?:number,minBytes?:number,quality?:number,preset?:string}} [opts]
   * @returns {Promise<Array<File|Blob>>}
   */
  async function compressMany(files, opts) {
    var list = Array.prototype.slice.call(files || []);
    var out = [];
    var baseOpts = typeof opts === 'string'
      ? { preset: opts, silent: true }
      : Object.assign({}, opts || {}, { silent: true });
    var anyLikely = list.some(function (f) { return likelyNeedsWork(f, optsWith(baseOpts)); });
    if (list.length > 1 || anyLikely) {
      beginBusy(tr('common.compressingImages', '正在压缩图片…'));
    }
    try {
      for (var i = 0; i < list.length; i++) {
        if (list.length > 1) {
          setBusyText(tr('common.compressingProgress', '正在压缩图片 {current}/{total}…', {
            current: i + 1,
            total: list.length
          }));
        }
        out.push(await compressIfNeeded(list[i], baseOpts));
      }
      return out;
    } finally {
      if (list.length > 1 || anyLikely) endBusy();
    }
  }

  /**
   * 选图后统一入口：压缩成功/失败都回调 apply(file)。
   * @returns {Promise<File|Blob>}
   */
  function prepareUploadFile(file, applyFn, opts) {
    var apply = typeof applyFn === 'function' ? applyFn : function () {};
    return compressIfNeeded(file, opts).then(function (out) {
      apply(out || file);
      return out || file;
    }).catch(function () {
      apply(file);
      return file;
    });
  }

  global.TBImageUploadCompress = {
    defaults: DEFAULTS,
    presets: PRESETS,
    compressIfNeeded: compressIfNeeded,
    compressMany: compressMany,
    prepareUploadFile: prepareUploadFile
  };
})(typeof window !== 'undefined' ? window : this);
