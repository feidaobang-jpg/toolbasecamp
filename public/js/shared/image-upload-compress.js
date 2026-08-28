/**
 * 本地图片「上传到服务端」前统一压缩（全站共用）。
 * - 长边超过 maxEdge，或体积超过 minBytes → 缩边 + JPEG
 * - GIF 不压（动画会坏）；非图片原样返回
 * - 桌面/手机都生效
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
      quality: Number(o.quality) > 0 && Number(o.quality) <= 1 ? Number(o.quality) : base.quality
    };
  }

  function isCompressibleImage(file) {
    if (!file) return false;
    var type = String(file.type || '').toLowerCase();
    // 不压 GIF（动画帧会丢）
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

  /**
   * @param {File|Blob} file
   * @param {string|{maxEdge?:number,minBytes?:number,quality?:number,preset?:string}} [opts]
   * @returns {Promise<File|Blob>}
   */
  async function compressIfNeeded(file, opts) {
    if (!isCompressibleImage(file)) return file;
    var cfg = optsWith(opts);
    try {
      var img = await loadImageFromFile(file);
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (!w || !h) return file;

      var longEdge = Math.max(w, h);
      var overEdge = longEdge > cfg.maxEdge;
      var overBytes = file.size >= cfg.minBytes;
      var forceJpeg = String(file.type || '').toLowerCase() === 'image/png' && overBytes;
      if (!overEdge && !overBytes && !forceJpeg) return file;

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
    for (var i = 0; i < list.length; i++) {
      out.push(await compressIfNeeded(list[i], opts));
    }
    return out;
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
