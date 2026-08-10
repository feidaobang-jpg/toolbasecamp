/**
 * Public music hub — list / play / pause / download with Cache API reuse.
 */
(function () {
  'use strict';

  var CACHE_NAME = 'tbc-public-music-v1';
  var currentAudio = null;
  var currentId = '';
  var objectUrls = {};

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return String(siteConfig.apiBase).replace(/\/$/, '');
    return '/api';
  }

  function fileUrl(id, download) {
    return apiBase() + '/music/public/' + encodeURIComponent(id) + (download ? '?download=1' : '');
  }

  function cacheAvailable() {
    return typeof caches !== 'undefined' && caches.open;
  }

  function getCachedBlob(id) {
    if (!cacheAvailable()) return Promise.resolve(null);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(fileUrl(id)).then(function (res) {
        return res ? res.blob() : null;
      });
    }).catch(function () { return null; });
  }

  function putCachedBlob(id, blob, contentType) {
    if (!cacheAvailable() || !blob) return Promise.resolve();
    return caches.open(CACHE_NAME).then(function (cache) {
      var res = new Response(blob.slice(), {
        headers: { 'Content-Type': contentType || 'audio/mpeg' }
      });
      return cache.put(fileUrl(id), res);
    }).catch(function () {});
  }

  function loadBlob(id, contentType) {
    return getCachedBlob(id).then(function (cached) {
      if (cached) return { blob: cached, fromCache: true };
      return fetch(fileUrl(id)).then(function (res) {
        if (!res.ok) throw new Error(tr('hub.musicPage.loadFailed'));
        return res.blob().then(function (blob) {
          return putCachedBlob(id, blob, contentType || blob.type).then(function () {
            return { blob: blob, fromCache: false };
          });
        });
      });
    });
  }

  function revokeUrl(id) {
    if (objectUrls[id]) {
      try { URL.revokeObjectURL(objectUrls[id]); } catch (e) {}
      delete objectUrls[id];
    }
  }

  function stopCurrent() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) {}
      currentAudio = null;
    }
    currentId = '';
    document.querySelectorAll('[data-music-play]').forEach(function (btn) {
      btn.textContent = tr('hub.musicPage.play');
      btn.setAttribute('data-playing', '0');
    });
  }

  function setPlayingUi(id, playing) {
    document.querySelectorAll('[data-music-play]').forEach(function (btn) {
      var bid = btn.getAttribute('data-music-play');
      if (bid === id && playing) {
        btn.textContent = tr('hub.musicPage.pause');
        btn.setAttribute('data-playing', '1');
      } else {
        btn.textContent = tr('hub.musicPage.play');
        btn.setAttribute('data-playing', '0');
      }
    });
  }

  function playTrack(item) {
    var id = item.id;
    var btn = document.querySelector('[data-music-play="' + id + '"]');
    if (currentId === id && currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      setPlayingUi(id, false);
      return;
    }
    if (currentId === id && currentAudio && currentAudio.paused) {
      currentAudio.play().catch(function () {});
      setPlayingUi(id, true);
      return;
    }
    stopCurrent();
    if (btn) btn.textContent = tr('hub.musicPage.loading');
    loadBlob(id, item.contentType).then(function (pack) {
      revokeUrl(id);
      var url = URL.createObjectURL(pack.blob);
      objectUrls[id] = url;
      var audio = new Audio(url);
      currentAudio = audio;
      currentId = id;
      audio.addEventListener('ended', function () {
        setPlayingUi(id, false);
      });
      return audio.play().then(function () {
        setPlayingUi(id, true);
      });
    }).catch(function (err) {
      if (btn) btn.textContent = tr('hub.musicPage.play');
      var box = document.getElementById('music-error');
      if (box) {
        box.hidden = false;
        box.textContent = (err && err.message) || tr('hub.musicPage.playFailed');
      }
    });
  }

  function downloadTrack(item) {
    var id = item.id;
    var name = String(item.title || 'ai-music').replace(/[\\/:*?"<>|]+/g, '').trim() || 'ai-music';
    name += '.mp3';
    loadBlob(id, item.contentType).then(function (pack) {
      if (typeof tbTriggerDownload === 'function') {
        tbTriggerDownload(pack.blob, name);
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(pack.blob);
      a.download = name;
      a.click();
    }).catch(function (err) {
      var box = document.getElementById('music-error');
      if (box) {
        box.hidden = false;
        box.textContent = (err && err.message) || tr('hub.musicPage.loadFailed');
      }
    });
  }

  function formatDuration(sec) {
    sec = Math.max(0, parseInt(sec, 10) || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderList(items) {
    var list = document.getElementById('music-list');
    var empty = document.getElementById('music-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'music-track-card';
      card.innerHTML =
        '<div class="music-track-main">' +
          '<div class="music-track-title"></div>' +
          '<div class="music-track-meta"></div>' +
        '</div>' +
        '<div class="music-track-actions action-row">' +
          '<button type="button" class="tb-btn" data-music-play=""></button>' +
          '<button type="button" class="tb-btn" data-music-dl=""></button>' +
        '</div>';
      card.querySelector('.music-track-title').textContent = item.title || tr('hub.musicPage.untitled');
      card.querySelector('.music-track-meta').textContent =
        (item.model || '') + ' · ' + formatDuration(item.duration) +
        (item.createdAt ? (' · ' + item.createdAt) : '');
      var playBtn = card.querySelector('[data-music-play]');
      var dlBtn = card.querySelector('[data-music-dl]');
      playBtn.setAttribute('data-music-play', item.id);
      dlBtn.setAttribute('data-music-dl', item.id);
      playBtn.textContent = tr('hub.musicPage.play');
      dlBtn.textContent = tr('hub.musicPage.download');
      playBtn.addEventListener('click', function () { playTrack(item); });
      dlBtn.addEventListener('click', function () { downloadTrack(item); });
      list.appendChild(card);
    });
  }

  function loadList() {
    var box = document.getElementById('music-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('music-busy');
    if (busy) busy.hidden = false;
    fetch(apiBase() + '/music/public/list?limit=50')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        renderList((data && data.items) || []);
      })
      .catch(function (err) {
        if (box) {
          box.hidden = false;
          box.textContent = (err && err.message) || tr('hub.musicPage.loadFailed');
        }
        renderList([]);
      })
      .then(function () {
        if (busy) busy.hidden = true;
      });
  }

  window.renderMusicHub = function () {
    var main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML =
      '<div class="music-hub">' +
        '<div class="music-hub-head">' +
          '<h2 class="music-hub-title">' + escapeHtml(tr('hub.musicPage.title')) + '</h2>' +
          '<p class="music-hub-sub">' + escapeHtml(tr('hub.musicPage.sub')) + '</p>' +
          '<div class="action-row" style="margin:12px 0 8px">' +
            '<a class="tb-btn" href="html/media/ai-music.html">' + escapeHtml(tr('hub.musicPage.create')) + '</a>' +
            '<button type="button" class="tb-btn" id="music-refresh">' + escapeHtml(tr('hub.musicPage.refresh')) + '</button>' +
          '</div>' +
        '</div>' +
        '<p class="music-hub-tip">' + escapeHtml(tr('hub.musicPage.cacheTip')) + '</p>' +
        '<div id="music-busy" class="music-hub-busy" hidden>' + escapeHtml(tr('hub.musicPage.loading')) + '</div>' +
        '<div id="music-error" class="error-box" role="alert" hidden></div>' +
        '<p id="music-empty" class="music-hub-empty" hidden>' + escapeHtml(tr('hub.musicPage.empty')) + '</p>' +
        '<div id="music-list" class="music-track-list"></div>' +
      '</div>';
    var refresh = document.getElementById('music-refresh');
    if (refresh) refresh.addEventListener('click', loadList);
    loadList();
  };
})();
