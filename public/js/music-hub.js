/**
 * Public music hub — list + shared player (scrolling lyrics) / download / Cache API.
 * Play uses direct stream URL (WeChat cannot wait for full-file blob fetch).
 */
(function () {
  'use strict';

  var CACHE_NAME = 'tbc-public-music-v1';
  var objectUrls = {};
  var player = null;
  var currentId = '';
  var currentItem = null;

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

  function isWeChat() {
    if (typeof tbIsWeChat === 'function') return tbIsWeChat();
    return /MicroMessenger/i.test(navigator.userAgent || '');
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

  function warmCache(id, contentType) {
    if (isWeChat() || !cacheAvailable()) return;
    getCachedBlob(id).then(function (cached) {
      if (cached) return;
      return fetch(fileUrl(id)).then(function (res) {
        if (!res.ok) return;
        return res.blob().then(function (blob) {
          return putCachedBlob(id, blob, contentType || blob.type);
        });
      });
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

  function destroyPlayer() {
    if (player && typeof player.destroy === 'function') {
      try { player.destroy(); } catch (e) {}
    }
    player = null;
    currentId = '';
    currentItem = null;
    setPlayingUi('', false);
  }

  function mountPlayer(item, src, autoplay) {
    var dock = document.getElementById('music-player-dock');
    if (!dock || !window.TBMusicPlayer) return;
    if (player) {
      try { player.destroy(); } catch (e) {}
      player = null;
    }
    currentId = item.id;
    currentItem = item;
    var audioName = String(item.title || 'ai-music').replace(/[\\/:*?"<>|]+/g, '').trim() || 'ai-music';
    player = window.TBMusicPlayer.mount(dock, {
      src: src,
      title: item.title || tr('hub.musicPage.untitled'),
      lyrics: item.lyrics || '',
      durationHint: Number(item.duration) || 0,
      audioName: audioName,
      onDownloadAudio: function () { downloadTrack(item); },
      onPlayState: function (playing) {
        setPlayingUi(item.id, !!playing);
      },
      onError: function () {
        setPlayingUi(item.id, false);
        var box = document.getElementById('music-error');
        if (box) {
          box.hidden = false;
          box.textContent = tr('hub.musicPage.playFailed');
        }
      }
    });
    warmCache(item.id, item.contentType);
    if (autoplay && player) {
      player.play().then(function () {
        setPlayingUi(item.id, true);
      }).catch(function () {
        setPlayingUi(item.id, false);
      });
    }
  }

  function playTrack(item) {
    var id = item.id;
    var btn = document.querySelector('[data-music-play="' + id + '"]');

    if (currentId === id && player && player.audio) {
      if (!player.audio.paused) {
        player.pause();
        setPlayingUi(id, false);
      } else {
        player.play().then(function () {
          setPlayingUi(id, true);
        }).catch(function () {
          setPlayingUi(id, false);
        });
      }
      return;
    }

    if (btn) btn.textContent = tr('hub.musicPage.loading');
    var streamUrl = fileUrl(id);

    function go(src) {
      mountPlayer(item, src, true);
    }

    if (isWeChat()) {
      go(streamUrl);
      return;
    }

    getCachedBlob(id).then(function (cached) {
      if (cached) {
        revokeUrl(id);
        var blobUrl = URL.createObjectURL(cached);
        objectUrls[id] = blobUrl;
        go(blobUrl);
        return;
      }
      go(streamUrl);
    }).catch(function () {
      go(streamUrl);
    });
  }

  function downloadTrack(item) {
    var id = item.id;
    var name = String(item.title || 'ai-music').replace(/[\\/:*?"<>|]+/g, '').trim() || 'ai-music';
    name += '.mp3';

    if (isWeChat()) {
      if (typeof tbNotify === 'function') {
        tbNotify(typeof window.t === 'function' ? window.t('common.wechatFileDownloadTip') : tr('hub.musicPage.wechatDownloadTip'));
      }
      return;
    }

    var btn = document.querySelector('[data-music-dl="' + id + '"]');
    if (btn) btn.textContent = tr('hub.musicPage.loading');
    loadBlob(id, item.contentType).then(function (pack) {
      if (btn) btn.textContent = tr('hub.musicPage.download');
      if (typeof tbTriggerDownload === 'function') {
        tbTriggerDownload(pack.blob, name);
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(pack.blob);
      a.download = name;
      a.click();
    }).catch(function (err) {
      if (btn) btn.textContent = tr('hub.musicPage.download');
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
      destroyPlayer();
      var dock = document.getElementById('music-player-dock');
      if (dock) dock.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'music-track-card';
      card.innerHTML =
        '<div class="music-track-main">' +
          '<div class="music-track-title"></div>' +
          '<div class="music-track-prompt" hidden></div>' +
          '<div class="music-track-meta"></div>' +
        '</div>' +
        '<div class="music-track-actions action-row">' +
          '<button type="button" class="tb-btn" data-music-play=""></button>' +
          '<button type="button" class="tb-btn" data-music-dl=""></button>' +
        '</div>';
      card.querySelector('.music-track-title').textContent = item.title || tr('hub.musicPage.untitled');
      var promptEl = card.querySelector('.music-track-prompt');
      var promptText = (item.prompt || '').trim();
      if (promptText) {
        promptEl.hidden = false;
        promptEl.textContent = tr('hub.musicPage.promptLabel') + ': ' + promptText;
      }
      var hasLy = !!(item.lyrics && String(item.lyrics).trim());
      card.querySelector('.music-track-meta').textContent =
        (item.model || '') + ' · ' + formatDuration(item.duration) +
        (hasLy ? (' · ' + tr('hub.musicPage.hasLyrics')) : '') +
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
    destroyPlayer();
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
        '<div id="music-player-dock"></div>' +
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
