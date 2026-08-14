/**
 * Admin: capture games hub thumbnails in-browser and upload to API.
 */
(function () {
  'use strict';

  var THUMB_W = 480;
  var THUMB_H = 270;
  var WAIT_MS = 3800;

  function tr(key, fb) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fb || key;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function authHeaders() {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token()
    };
  }

  function setStatus(msg, isErr) {
    var el = document.getElementById('game-thumbs-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ladder-status' + (isErr ? ' is-error' : msg ? ' is-ok' : '');
  }

  function gameItems() {
    if (typeof gamesConfig === 'undefined' || !gamesConfig.groups) return [];
    var out = [];
    gamesConfig.groups.forEach(function (g) {
      (g.items || []).forEach(function (item) {
        var url = item.url || '';
        var m = url.match(/html\/game\/([^/?]+)\.html/i);
        if (!m) return;
        out.push({
          slug: m[1],
          label: typeof window.tbLabel === 'function' ? window.tbLabel(item) : m[1],
          url: url.replace(/\?.*$/, '')
        });
      });
    });
    return out;
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error('html2canvas load failed'));
      };
      s.onerror = function () { reject(new Error('html2canvas CDN blocked')); };
      document.head.appendChild(s);
    });
  }

  function cropCover(img, w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    var sw = img.naturalWidth || img.width;
    var sh = img.naturalHeight || img.height;
    var tr = w / h;
    var cr = sw / sh;
    var sx = 0;
    var sy = 0;
    var cw = sw;
    var ch = sh;
    if (cr > tr) {
      cw = sh * tr;
      sx = (sw - cw) / 2;
    } else {
      ch = sw / tr;
      sy = (sh - ch) / 2;
    }
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.85);
  }

  function dataUrlToB64(dataUrl) {
    var i = dataUrl.indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  }

  function captureFromIframe(iframe, gameplay) {
    var doc = iframe.contentDocument;
    if (!doc) throw new Error('iframe blocked');
    var canvas = doc.querySelector('canvas');
    if (canvas) {
      return cropCover(canvas, THUMB_W, THUMB_H);
    }
    var target = doc.querySelector('.game-board-wrap, .klotski-board, .puzzle-board, #board, #wrap');
    if (!target) target = doc.body;
    return loadHtml2Canvas().then(function (html2canvas) {
      return html2canvas(target, {
        backgroundColor: null,
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true
      }).then(function (shot) {
        return cropCover(shot, THUMB_W, THUMB_H);
      });
    });
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function captureOne(item, gameplay) {
    var origin = window.location.origin;
    var src = origin + '/' + item.url.replace(/^\/?/, '') + (gameplay ? '?thumb=1' : '');
    return new Promise(function (resolve, reject) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:960px;height:540px;border:0;opacity:0;pointer-events:none;';
      iframe.src = src;
      var done = false;
      function finish(err, dataUrl) {
        if (done) return;
        done = true;
        iframe.remove();
        if (err) reject(err);
        else resolve(dataUrl);
      }
      iframe.onerror = function () { finish(new Error('iframe load error')); };
      iframe.onload = function () {
        wait(WAIT_MS).then(function () {
          return captureFromIframe(iframe, gameplay);
        }).then(function (dataUrl) {
          finish(null, dataUrl);
        }).catch(function (err) {
          finish(err);
        });
      };
      document.body.appendChild(iframe);
      setTimeout(function () {
        if (!done) finish(new Error('timeout'));
      }, WAIT_MS + 12000);
    });
  }

  function uploadSlug(slug, dataUrl) {
    return fetch(apiBase() + '/admin/game-thumbs/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ slug: slug, image_b64: dataUrlToB64(dataUrl) })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    });
  }

  function refreshList() {
    return fetch(apiBase() + '/admin/game-thumbs/status', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          var box = document.getElementById('game-thumbs-list');
          if (!box) return;
          var map = {};
          (data.items || []).forEach(function (it) { map[it.slug] = it; });
          var lines = gameItems().map(function (g) {
            var it = map[g.slug];
            var size = it ? (Math.round(it.bytes / 1024) + ' KB') : tr('privateHub.ops.gameThumbsMissing', '未生成');
            return g.label + ' (' + g.slug + ') — ' + size;
          });
          box.textContent = lines.join('\n');
        });
      })
      .catch(function () {});
  }

  function runAll(gameplay) {
    var btnPlay = document.getElementById('btn-game-thumbs-gameplay');
    var btnMenu = document.getElementById('btn-game-thumbs-menu');
    if (btnPlay) btnPlay.disabled = true;
    if (btnMenu) btnMenu.disabled = true;
    var items = gameItems();
    var ok = 0;
    var fail = 0;

    (function next(i) {
      if (i >= items.length) {
        if (btnPlay) btnPlay.disabled = false;
        if (btnMenu) btnMenu.disabled = false;
        setStatus(
          tr('privateHub.ops.gameThumbsDone', '完成：{ok} 成功，{fail} 失败')
            .replace('{ok}', String(ok))
            .replace('{fail}', String(fail)),
          fail > 0
        );
        refreshList();
        return;
      }
      var item = items[i];
      setStatus(
        tr('privateHub.ops.gameThumbsProgress', '正在处理 {n}/{total}：{name}')
          .replace('{n}', String(i + 1))
          .replace('{total}', String(items.length))
          .replace('{name}', item.label)
      );
      captureOne(item, gameplay)
        .then(function (dataUrl) { return uploadSlug(item.slug, dataUrl); })
        .then(function () { ok += 1; next(i + 1); })
        .catch(function (err) {
          fail += 1;
          console.warn('thumb fail', item.slug, err);
          next(i + 1);
        });
    })(0);
  }

  function bind() {
    var btnPlay = document.getElementById('btn-game-thumbs-gameplay');
    var btnMenu = document.getElementById('btn-game-thumbs-menu');
    if (btnPlay) {
      btnPlay.addEventListener('click', function () {
        runAll(true);
      });
    }
    if (btnMenu) {
      btnMenu.addEventListener('click', function () {
        runAll(false);
      });
    }
    document.addEventListener('tb:private-ready', refreshList);
    refreshList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
