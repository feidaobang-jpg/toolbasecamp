/**
 * Admin: capture games hub thumbnails in-browser and upload to API.
 * Iframe must stay on-screen — hidden/off-screen iframes are rAF-throttled → black canvas.
 */
(function () {
  'use strict';

  var THUMB_W = 480;
  var THUMB_H = 270;
  var MIN_WAIT_MS = 5000;
  var MAX_WAIT_MS = 22000;
  var POLL_MS = 180;

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
    if (!sw || !sh) throw new Error('empty image');
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

  function avgBrightness(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = 48;
        c.height = 48;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 48, 48);
        var d = ctx.getImageData(0, 0, 48, 48).data;
        var sum = 0;
        var n = 0;
        for (var i = 0; i < d.length; i += 4) {
          sum += d[i] + d[i + 1] + d[i + 2];
          n++;
        }
        resolve(n ? sum / n / 3 : 0);
      };
      img.onerror = function () { resolve(0); };
      img.src = dataUrl;
    });
  }

  function canvasScore(canvas) {
    try {
      var w = canvas.width;
      var h = canvas.height;
      if (w < 4 || h < 4) return 0;
      var ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      var sw = Math.min(48, w);
      var sh = Math.min(48, h);
      var d = ctx.getImageData(0, 0, sw, sh).data;
      var sum = 0;
      var maxDiff = 0;
      var base = d[0] + d[1] + d[2];
      for (var i = 0; i < d.length; i += 4) {
        var px = d[i] + d[i + 1] + d[i + 2];
        sum += px;
        maxDiff = Math.max(maxDiff, Math.abs(px - base));
      }
      var avg = sum / (d.length / 4) / 3;
      return avg + maxDiff * 0.35;
    } catch (e) {
      return 0;
    }
  }

  function docReady(doc, gameplay) {
    if (!doc) return false;
    var win = doc.defaultView;
    if (gameplay) {
      if (win && win.__tbThumbReady && win.__tbThumbGameplay) return true;
      if (win && win.__tbThumbReady) {
        var canvas = doc.querySelector('canvas');
        if (canvas && canvasScore(canvas) > 20) return true;
        var board = doc.querySelector('.klotski-board .klotski-tile, .gomoku-cell, .puzzle-piece');
        if (board) return true;
      }
      if (win && typeof Game !== 'undefined' && win.Game && win.Game.state === 2) return false;
      return false;
    }
    if (win && win.__tbThumbReady) return true;
    var canvas = doc.querySelector('canvas');
    if (canvas && canvasScore(canvas) > 14) return true;
    var board = doc.querySelector('.klotski-board, .gomoku-board, .puzzle-board, #board');
    if (board && board.children && board.children.length > 0) return true;
    if (doc.body && doc.body.innerText && doc.body.innerText.length > 20) return true;
    return false;
  }

  function waitForReady(doc, gameplay) {
    var start = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        if (docReady(doc, gameplay) && Date.now() - start >= MIN_WAIT_MS) {
          resolve();
          return;
        }
        if (Date.now() - start >= MAX_WAIT_MS) {
          resolve();
          return;
        }
        setTimeout(poll, POLL_MS);
      })();
    });
  }

  function captureFromDoc(doc) {
    var canvas = doc.querySelector('canvas');
    if (canvas) {
      return Promise.resolve(cropCover(canvas, THUMB_W, THUMB_H));
    }
    var target = doc.querySelector('.game-board-wrap, .klotski-board, .puzzle-board, #board, #wrap');
    if (!target) target = doc.body;
    return loadHtml2Canvas().then(function (html2canvas) {
      return html2canvas(target, {
        backgroundColor: target.classList && target.classList.contains('klotski-board') ? '#e2e8f0' : '#111827',
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true
      }).then(function (shot) {
        return cropCover(shot, THUMB_W, THUMB_H);
      });
    });
  }

  function ensureCaptureStage(label) {
    var stage = document.getElementById('game-thumbs-capture-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'game-thumbs-capture-stage';
      stage.innerHTML =
        '<div class="game-thumbs-capture-inner">' +
          '<p id="game-thumbs-capture-label"></p>' +
          '<div id="game-thumbs-capture-frame"></div>' +
        '</div>';
      document.body.appendChild(stage);
    }
    var lab = document.getElementById('game-thumbs-capture-label');
    if (lab) lab.textContent = label || '';
    stage.style.display = 'flex';
    return stage;
  }

  function hideCaptureStage() {
    var stage = document.getElementById('game-thumbs-capture-stage');
    if (!stage) return;
    stage.style.display = 'none';
    var frame = document.getElementById('game-thumbs-capture-frame');
    if (frame) frame.innerHTML = '';
  }

  function captureOne(item, gameplay) {
    var origin = window.location.origin;
    var src = origin + '/' + item.url.replace(/^\/?/, '') + (gameplay ? '?thumb=1' : '');
    ensureCaptureStage(
      tr('privateHub.ops.gameThumbsCapturing', '正在截取：{name}').replace('{name}', item.label)
    );
    var frameHost = document.getElementById('game-thumbs-capture-frame');
    if (!frameHost) return Promise.reject(new Error('capture frame missing'));

    return new Promise(function (resolve, reject) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'width:960px;height:540px;border:0;display:block;background:#000;';
      iframe.src = src;
      var done = false;

      function finish(err, dataUrl) {
        if (done) return;
        done = true;
        hideCaptureStage();
        if (err) reject(err);
        else resolve(dataUrl);
      }

      iframe.onerror = function () { finish(new Error('iframe load error')); };
      iframe.onload = function () {
        var doc = iframe.contentDocument;
        var win = iframe.contentWindow;
        if (win) win.dispatchEvent(new Event('resize'));
        waitForReady(doc, gameplay)
          .then(function () { return captureFromDoc(doc); })
          .then(function (dataUrl) {
            return avgBrightness(dataUrl).then(function (b) {
              if (!gameplay) return dataUrl;
              var canvas = doc.querySelector('canvas');
              var score = canvas ? canvasScore(canvas) : 0;
              if (b < 6 && score < 14) {
                throw new Error('capture too dark (avg ' + Math.round(b) + ', score ' + Math.round(score) + ')');
              }
              return dataUrl;
            });
          })
          .then(function (dataUrl) { finish(null, dataUrl); })
          .catch(function (err) { finish(err); });
      };

      frameHost.appendChild(iframe);
      setTimeout(function () {
        if (!done) finish(new Error('timeout'));
      }, MAX_WAIT_MS + 8000);
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
    var fails = [];

    (function next(i) {
      if (i >= items.length) {
        hideCaptureStage();
        if (btnPlay) btnPlay.disabled = false;
        if (btnMenu) btnMenu.disabled = false;
        var msg = tr('privateHub.ops.gameThumbsDone', '完成：{ok} 成功，{fail} 失败')
          .replace('{ok}', String(ok))
          .replace('{fail}', String(fail));
        if (fails.length) msg += ' — ' + fails.join(', ');
        setStatus(msg, fail > 0);
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
          fails.push(item.slug);
          console.warn('thumb fail', item.slug, err);
          next(i + 1);
        });
    })(0);
  }

  function bind() {
    var btnPlay = document.getElementById('btn-game-thumbs-gameplay');
    var btnMenu = document.getElementById('btn-game-thumbs-menu');
    if (btnPlay) {
      btnPlay.addEventListener('click', function () { runAll(true); });
    }
    if (btnMenu) {
      btnMenu.addEventListener('click', function () { runAll(false); });
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
