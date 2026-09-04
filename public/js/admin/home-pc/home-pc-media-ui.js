/**
 * 家里电脑：缩略图卡操作、大图左右切换、日志工具栏。
 * 全局：window.HomePcMediaUi
 */
(function (global) {
  'use strict';

  function tr(key, fallback) {
    if (typeof global.t === 'function') {
      var v = global.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function assetUrl(url) {
    if (global.HomePcApi && typeof global.HomePcApi.assetUrl === 'function') {
      return global.HomePcApi.assetUrl(url);
    }
    return url || '';
  }

  function triggerDownload(blobOrUrl, filename) {
    var name = filename || 'image.png';
    function saveBlob(blob) {
      if (typeof global.tbTriggerDownload === 'function') {
        global.tbTriggerDownload(blob, name);
        return;
      }
      var a = document.createElement('a');
      var href = URL.createObjectURL(blob);
      a.href = href;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        try {
          URL.revokeObjectURL(href);
        } catch (e) {}
      }, 2000);
    }
    if (blobOrUrl instanceof Blob) {
      saveBlob(blobOrUrl);
      return Promise.resolve();
    }
    var src = String(blobOrUrl || '');
    if (!src) return Promise.reject(new Error('empty'));
    if (src.indexOf('data:') === 0) {
      return fetch(src)
        .then(function (r) {
          return r.blob();
        })
        .then(saveBlob);
    }
    return fetch(assetUrl(src))
      .then(function (r) {
        if (!r.ok) throw new Error('download failed');
        return r.blob();
      })
      .then(saveBlob);
  }

  /** dataURL / blob → JPEG thumb dataURL（网格用） */
  function makeThumbDataUrl(src, maxSide, quality) {
    maxSide = maxSide || 480;
    quality = quality == null ? 0.82 : quality;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject(new Error('thumb load failed'));
      };
      if (src instanceof Blob) {
        img.src = URL.createObjectURL(src);
      } else {
        img.crossOrigin = 'anonymous';
        img.src = src;
      }
    });
  }

  /**
   * 绑定 / 创建带左右切换的 lightbox。
   * opts: { root, getItems, getHdUrl, getCaption, onBoundary }
   * getItems() -> [{ url, thumb_url?, ... }]
   */
  function createLightbox(opts) {
    opts = opts || {};
    var root = opts.root || document.getElementById('lightbox');
    if (!root) return null;
    var img = root.querySelector('img') || document.getElementById('lightbox-img');
    var backdrop =
      root.querySelector('.trailer-lightbox-backdrop') ||
      document.getElementById('lightbox-backdrop');
    var prevBtn =
      root.querySelector('[data-lb-prev]') || document.getElementById('lightbox-prev');
    var nextBtn =
      root.querySelector('[data-lb-next]') || document.getElementById('lightbox-next');
    var caption =
      root.querySelector('[data-lb-caption]') || document.getElementById('lightbox-caption');
    var index = -1;
    var bound = false;

    function items() {
      return (typeof opts.getItems === 'function' ? opts.getItems() : []) || [];
    }

    function hdUrl(it) {
      if (typeof opts.getHdUrl === 'function') return opts.getHdUrl(it);
      return it && (it.url || it.src || it.full_url || '');
    }

    function close() {
      root.style.display = 'none';
      root.setAttribute('hidden', '');
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      index = -1;
      if (img) img.removeAttribute('src');
      if (caption) caption.textContent = '';
    }

    function updateNav() {
      var list = items();
      var n = list.length;
      var atStart = index <= 0;
      var atEnd = index < 0 || index >= n - 1;
      if (prevBtn) {
        prevBtn.disabled = atStart;
        prevBtn.classList.toggle('is-disabled', atStart);
        prevBtn.setAttribute('aria-disabled', atStart ? 'true' : 'false');
      }
      if (nextBtn) {
        nextBtn.disabled = atEnd;
        nextBtn.classList.toggle('is-disabled', atEnd);
        nextBtn.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
      }
    }

    function showAt(i) {
      var list = items();
      if (!img || !list.length) return;
      if (i < 0 || i >= list.length) return;
      index = i;
      var it = list[i];
      var src = assetUrl(hdUrl(it));
      img.src = src;
      if (caption) {
        if (typeof opts.getCaption === 'function') {
          caption.textContent = opts.getCaption(it, i, list.length) || '';
        } else {
          caption.textContent = '#' + (i + 1) + ' / ' + list.length;
        }
      }
      root.style.display = '';
      root.removeAttribute('hidden');
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
      updateNav();
    }

    function step(delta) {
      var list = items();
      if (!list.length || index < 0) return;
      var next = index + delta;
      if (next < 0 || next >= list.length) {
        if (typeof opts.onBoundary === 'function') {
          opts.onBoundary(next < 0 ? 'first' : 'last');
        }
        return;
      }
      showAt(next);
    }

    function bind() {
      if (bound) return;
      bound = true;
      if (backdrop) backdrop.addEventListener('click', close);
      if (prevBtn) {
        prevBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          step(-1);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          step(1);
        });
      }
      if (img) {
        img.addEventListener('click', function (e) {
          e.stopPropagation();
        });
      }
      if (caption) {
        caption.addEventListener('click', function (e) {
          e.stopPropagation();
        });
      }
      document.addEventListener('keydown', function (e) {
        if (root.hidden || root.getAttribute('hidden') != null || root.style.display === 'none') {
          return;
        }
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          step(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          step(1);
        }
      });
    }

    bind();
    return {
      openAt: showAt,
      close: close,
      step: step,
      updateNav: updateNav,
      getIndex: function () {
        return index;
      }
    };
  }

  /**
   * 在日志盒上方确保「复制日志」「打开日志目录」。
   * opts: { getText, onOpenDir, copyBtnId?, openBtnId? }
   */
  function ensureLogToolbar(logBox, opts) {
    opts = opts || {};
    if (!logBox) return null;
    var existing = logBox.querySelector('.home-pc-log-toolbar');
    if (existing) return existing;

    var head = logBox.querySelector('.home-pc-log-head') || logBox.querySelector('.series-log-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'home-pc-log-head';
      var title = logBox.querySelector('.home-pc-result-title, h3, h4');
      if (title && title.parentNode === logBox) {
        logBox.insertBefore(head, title);
        head.appendChild(title);
      } else {
        logBox.insertBefore(head, logBox.firstChild);
      }
    }

    var row = document.createElement('div');
    row.className = 'action-row home-pc-log-toolbar';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'tb-btn';
    if (opts.copyBtnId) copyBtn.id = opts.copyBtnId;
    copyBtn.textContent = tr('privateHub.homePc.copyLog', '复制日志');

    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'tb-btn';
    if (opts.openBtnId) openBtn.id = opts.openBtnId;
    openBtn.textContent = tr('privateHub.homePc.openLogDir', '打开日志目录');

    copyBtn.addEventListener('click', function () {
      var text =
        typeof opts.getText === 'function'
          ? opts.getText()
          : ((logBox.querySelector('pre') || {}).textContent || '');
      if (!String(text).trim()) {
        if (global.HomePcApi && global.HomePcApi.flash) {
          /* no-op */
        }
        alert(tr('privateHub.homePc.logEmpty', '暂无日志可复制'));
        return;
      }
      var label = copyBtn.textContent;
      var p =
        global.HomePcApi && global.HomePcApi.copyText
          ? global.HomePcApi.copyText(text)
          : navigator.clipboard.writeText(text);
      Promise.resolve(p)
        .then(function () {
          copyBtn.textContent = tr('privateHub.homePc.logCopied', '已复制');
          setTimeout(function () {
            copyBtn.textContent = label;
          }, 1500);
        })
        .catch(function () {
          alert(tr('privateHub.homePc.logCopyFail', '复制失败，请手动选择复制'));
        });
    });

    openBtn.addEventListener('click', function () {
      if (typeof opts.onOpenDir === 'function') opts.onOpenDir();
    });

    row.appendChild(copyBtn);
    row.appendChild(openBtn);
    head.appendChild(row);
    return row;
  }

  /**
   * 在图片卡下挂下载/删除按钮行。
   * opts: { onDownload, onDelete, downloadLabel?, deleteLabel? }
   */
  function appendCardActions(card, opts) {
    opts = opts || {};
    if (!card) return null;
    var row = document.createElement('div');
    row.className = 'action-row home-pc-img-card-actions';
    var dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'tb-btn';
    dl.textContent = opts.downloadLabel || tr('privateHub.homePc.download', '下载');
    dl.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof opts.onDownload === 'function') opts.onDownload(e);
    });
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'tb-btn';
    del.textContent = opts.deleteLabel || tr('privateHub.homePc.deleteImage', '删除');
    del.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof opts.onDelete === 'function') opts.onDelete(e);
    });
    row.appendChild(dl);
    row.appendChild(del);
    card.appendChild(row);
    return row;
  }

  /** 标准 lightbox DOM（若页面未放） */
  function ensureLightboxDom(parent) {
    var existing = document.getElementById('lightbox');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'lightbox';
    wrap.className = 'trailer-lightbox image-pipe-lightbox';
    wrap.hidden = true;
    wrap.setAttribute('hidden', '');
    wrap.innerHTML =
      '<button type="button" class="trailer-lightbox-backdrop" id="lightbox-backdrop" aria-label="关闭"></button>' +
      '<div class="trailer-lightbox-panel image-pipe-lightbox-panel">' +
      '<button type="button" id="lightbox-prev" class="image-pipe-lb-nav image-pipe-lb-prev" data-lb-prev aria-label="上一张">‹</button>' +
      '<img id="lightbox-img" alt="" />' +
      '<button type="button" id="lightbox-next" class="image-pipe-lb-nav image-pipe-lb-next" data-lb-next aria-label="下一张">›</button>' +
      '<div id="lightbox-caption" class="image-pipe-lb-caption" data-lb-caption></div>' +
      '</div>';
    (parent || document.body).appendChild(wrap);
    return wrap;
  }

  global.HomePcMediaUi = {
    tr: tr,
    assetUrl: assetUrl,
    triggerDownload: triggerDownload,
    makeThumbDataUrl: makeThumbDataUrl,
    createLightbox: createLightbox,
    ensureLogToolbar: ensureLogToolbar,
    appendCardActions: appendCardActions,
    ensureLightboxDom: ensureLightboxDom
  };
})(typeof window !== 'undefined' ? window : this);
