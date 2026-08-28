/**
 * 图生图上传前统一压缩（前台指令改图 / 家里电脑图生图共用）
 * - 长边超过 maxEdge，或体积超过 minBytes → 缩边 + JPEG
 * - 桌面/手机都生效（大图易超时）
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    maxEdge: 1600,
    minBytes: 1200 * 1024,
    quality: 0.86
  };

  function optsWith(opts) {
    var o = opts || {};
    return {
      maxEdge: Number(o.maxEdge) > 0 ? Number(o.maxEdge) : DEFAULTS.maxEdge,
      minBytes: Number(o.minBytes) > 0 ? Number(o.minBytes) : DEFAULTS.minBytes,
      quality: Number(o.quality) > 0 && Number(o.quality) <= 1 ? Number(o.quality) : DEFAULTS.quality
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

  /**
   * @param {File|Blob} file
   * @param {{maxEdge?:number,minBytes?:number,quality?:number}} [opts]
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
      // 压缩后几乎没变小则保留原图（除非是超大边必须缩）
      if (!overEdge && blob.size >= file.size * 0.95) return file;
      return toFile(blob, file);
    } catch (e) {
      return file;
    }
  }

  /**
   * @param {Array<File|Blob>} files
   * @param {{maxEdge?:number,minBytes?:number,quality?:number}} [opts]
   * @returns {Promise<Array<File|Blob>>}
   */
  async function compressMany(files, opts) {
    var list = Array.isArray(files) ? files : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push(await compressIfNeeded(list[i], opts));
    }
    return out;
  }

  global.TBImageUploadCompress = {
    defaults: DEFAULTS,
    compressIfNeeded: compressIfNeeded,
    compressMany: compressMany
  };
})(typeof window !== 'undefined' ? window : this);
