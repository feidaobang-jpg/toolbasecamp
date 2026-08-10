/**
 * Public music hub — AI + traditional tabs, shared player, Cache API.
 * Non-WeChat: play from cache blob after first fetch; WeChat streams direct URL.
 */
(function () {
  'use strict';

  var CACHE_NAME = 'tbc-music-hub-v2';
  var objectUrls = {};
  var player = null;
  var currentId = '';
  var currentKind = 'ai';
  var currentItem = null;
  var currentCardEl = null;
  var activeTab = 'ai';

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function authToken() {
    return localStorage.getItem('auth_token') || '';
  }

  function authHeaders() {
    var h = { Accept: 'application/json' };
    var tok = authToken();
    if (tok) h.Authorization = 'Bearer ' + tok;
    return h;
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

  function fileUrl(kind, id, opts) {
    opts = opts || {};
    var base = kind === 'traditional' ? '/music/traditional/' : '/music/public/';
    var url = apiBase() + base + encodeURIComponent(id);
    var q = [];
    if (opts.download) q.push('download=1');
    if (opts.full) q.push('full=1');
    return url + (q.length ? '?' + q.join('&') : '');
  }

  function cacheKey(kind, id, full) {
    if (kind !== 'traditional') return fileUrl(kind, id, { download: false });
    return fileUrl(kind, id, { full: !!full, download: false });
  }

  function isWeChat() {
    if (typeof tbIsWeChat === 'function') return tbIsWeChat();
    return /MicroMessenger/i.test(navigator.userAgent || '');
  }

  function cacheAvailable() {
    return typeof caches !== 'undefined' && caches.open;
  }

  function getCachedBlob(kind, id, full) {
    if (!cacheAvailable()) return Promise.resolve(null);
    var url = cacheKey(kind, id, full);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(url).then(function (res) {
        return res ? res.blob() : null;
      });
    }).catch(function () { return null; });
  }

  function putCachedBlob(kind, id, blob, contentType, full) {
    if (!cacheAvailable() || !blob) return Promise.resolve();
    var url = cacheKey(kind, id, full);
    return caches.open(CACHE_NAME).then(function (cache) {
      var res = new Response(blob.slice(), {
        headers: { 'Content-Type': contentType || 'audio/mpeg' }
      });
      return cache.put(url, res);
    }).catch(function () {});
  }

  function warmCache(kind, id, contentType, audioEl, isNetworkStream, fullOnly) {
    if (!cacheAvailable()) return;
    var wantFull = !!fullOnly;
    getCachedBlob(kind, id, wantFull).then(function (cached) {
      if (cached) return;
      var run = function () {
        fetch(cacheKey(kind, id, wantFull)).then(function (res) {
          if (!res.ok) return;
          return res.blob().then(function (blob) {
            return putCachedBlob(kind, id, blob, contentType || blob.type, wantFull);
          });
        }).catch(function () {});
      };
      if (!isNetworkStream || !audioEl) {
        run();
        return;
      }
      audioEl.addEventListener('canplay', function () {
        setTimeout(run, wantFull ? 4000 : 0);
      }, { once: true });
      audioEl.addEventListener('ended', run, { once: true });
    }).catch(function () {});
  }

  function loadBlob(kind, id, contentType, full) {
    return getCachedBlob(kind, id, full).then(function (cached) {
      if (cached) return { blob: cached, fromCache: true };
      return fetch(cacheKey(kind, id, full)).then(function (res) {
        if (!res.ok) throw new Error(tr('hub.musicPage.loadFailed'));
        return res.blob().then(function (blob) {
          return putCachedBlob(kind, id, blob, contentType || blob.type, full).then(function () {
            return { blob: blob, fromCache: false };
          });
        });
      });
    });
  }

  function objectUrlKey(kind, id, full) {
    return kind + ':' + id + (full ? ':full' : ':preview');
  }

  function revokeUrl(kind, id, full) {
    var key = objectUrlKey(kind, id, full);
    if (objectUrls[key]) {
      try { URL.revokeObjectURL(objectUrls[key]); } catch (e) {}
      delete objectUrls[key];
    }
  }

  function tryUpgradeTraditionalFull(kind, item, playerInst) {
    if (kind !== 'traditional' || !playerInst || !playerInst.audio || playerInst._tbcUpgradedFull) return;
    getCachedBlob(kind, item.id, true).then(function (fullBlob) {
      if (!fullBlob || !playerInst.audio || playerInst._tbcUpgradedFull) return;
      var audio = playerInst.audio;
      var t = audio.currentTime || 0;
      var wasPlaying = !audio.paused;
      revokeUrl(kind, item.id, true);
      var blobUrl = URL.createObjectURL(fullBlob);
      objectUrls[objectUrlKey(kind, item.id, true)] = blobUrl;
      playerInst._tbcUpgradedFull = true;
      audio.src = blobUrl;
      audio.currentTime = t;
      if (wasPlaying) playerInst.play().catch(function () {});
    }).catch(function () {});
  }

  function setPlayingUi(kind, id, playing) {
    document.querySelectorAll('[data-music-play]').forEach(function (btn) {
      var bid = btn.getAttribute('data-music-play');
      var bkind = btn.getAttribute('data-music-kind') || 'ai';
      if (bkind === kind && bid === id && playing === true) {
        btn.textContent = tr('hub.musicPage.pause');
        btn.setAttribute('data-playing', '1');
        btn.removeAttribute('data-loading');
      } else if (bkind === kind && bid === id && playing === 'buffering') {
        btn.textContent = tr('hub.musicPage.buffering');
        btn.setAttribute('data-playing', '0');
        btn.setAttribute('data-loading', '1');
      } else {
        btn.textContent = tr('hub.musicPage.play');
        btn.setAttribute('data-playing', '0');
        btn.removeAttribute('data-loading');
      }
      var card = btn.closest('.music-track-card');
      if (card) {
        card.classList.toggle('is-buffering', bkind === kind && bid === id && playing === 'buffering');
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
    if (currentCardEl) currentCardEl.classList.remove('is-player-open', 'is-buffering');
    currentCardEl = null;
    setPlayingUi('', '', false);
  }

  function mountPlayer(kind, item, src, autoplay, mountEl) {
    if (!mountEl || !window.TBMusicPlayer) return;
    if (player) {
      try { player.destroy(); } catch (e) {}
      player = null;
    }
    currentKind = kind;
    currentId = item.id;
    currentItem = item;
    var fallback = kind === 'traditional' ? 'traditional-music' : 'ai-music';
    var audioName = String(item.title || fallback).replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;
    var isBlob = String(src || '').indexOf('blob:') === 0;
    player = window.TBMusicPlayer.mount(mountEl, {
      src: src,
      preload: isBlob ? 'auto' : 'none',
      title: item.title || tr('hub.musicPage.untitled'),
      lyrics: item.lyrics || '',
      hideTitle: true,
      hideDownloadActions: true,
      durationHint: Number(item.duration) || 0,
      audioName: audioName,
      onDownloadAudio: function () { downloadTrack(kind, item); },
      onPlayState: function (playing) {
        setPlayingUi(kind, item.id, !!playing);
      },
      onBuffering: function (loading) {
        if (loading) setPlayingUi(kind, item.id, 'buffering');
        else if (player && player.audio && !player.audio.paused) setPlayingUi(kind, item.id, true);
      },
      onError: function () {
        setPlayingUi(kind, item.id, false);
        var box = document.getElementById('music-error');
        if (box) {
          box.hidden = false;
          box.textContent = tr('hub.musicPage.playFailed');
        }
      }
    });
    warmCache(kind, item.id, item.contentType, player && player.audio, !isBlob, false);
    if (kind === 'traditional' && player && player.audio && item.hasPreview !== false) {
      warmCache(kind, item.id, item.contentType, player.audio, !isBlob, true);
      player.audio.addEventListener('timeupdate', function onTick() {
        if ((player.audio.currentTime || 0) > 8) tryUpgradeTraditionalFull(kind, item, player);
      });
      player.audio.addEventListener('canplay', function () {
        tryUpgradeTraditionalFull(kind, item, player);
      });
    }
    if (autoplay && player) {
      player.play().then(function () {
        setPlayingUi(kind, item.id, true);
      }).catch(function () {
        setPlayingUi(kind, item.id, false);
      });
    }
  }

  function playTrack(kind, item) {
    var id = item.id;
    var btn = document.querySelector('[data-music-play="' + id + '"][data-music-kind="' + kind + '"]');
    var card = btn ? btn.closest('.music-track-card') : null;
    if (!card) return;
    var playerHost = card.querySelector('.music-track-player');
    if (!playerHost) {
      playerHost = document.createElement('div');
      playerHost.className = 'music-track-player';
      card.appendChild(playerHost);
    }

    if (currentKind === kind && currentId === id && player && player.audio) {
      if (!player.audio.paused) {
        player.pause();
        setPlayingUi(kind, id, false);
      } else {
        player.play().then(function () {
          setPlayingUi(kind, id, true);
        }).catch(function () {
          setPlayingUi(kind, id, false);
        });
      }
      return;
    }

    if (btn) btn.textContent = tr('hub.musicPage.buffering');
    var started = false;

    function go(src, isFull) {
      if (started) return;
      started = true;
      document.querySelectorAll('.music-track-card').forEach(function (el) {
        el.classList.remove('is-player-open', 'is-buffering');
      });
      document.querySelectorAll('.music-track-player').forEach(function (el) {
        if (el !== playerHost) el.innerHTML = '';
      });
      card.classList.add('is-player-open');
      currentCardEl = card;
      mountPlayer(kind, item, src, true, playerHost);
      if (kind === 'traditional' && isFull && player) player._tbcUpgradedFull = true;
    }

    if (kind === 'traditional') {
      if (isWeChat()) {
        go(fileUrl(kind, id, { full: false }), false);
        getCachedBlob(kind, id, false).then(function (preview) {
          if (!preview || started) return;
          revokeUrl(kind, id, false);
          objectUrls[objectUrlKey(kind, id, false)] = URL.createObjectURL(preview);
          go(objectUrls[objectUrlKey(kind, id, false)], false);
        }).catch(function () {});
        return;
      }
      Promise.all([
        getCachedBlob(kind, id, false),
        getCachedBlob(kind, id, true)
      ]).then(function (pack) {
        var preview = pack[0];
        var full = pack[1];
        if (full) {
          revokeUrl(kind, id, true);
          objectUrls[objectUrlKey(kind, id, true)] = URL.createObjectURL(full);
          go(objectUrls[objectUrlKey(kind, id, true)], true);
          return;
        }
        if (preview) {
          revokeUrl(kind, id, false);
          objectUrls[objectUrlKey(kind, id, false)] = URL.createObjectURL(preview);
          go(objectUrls[objectUrlKey(kind, id, false)], false);
          return;
        }
        go(fileUrl(kind, id, { full: false }), false);
      }).catch(function () {
        go(fileUrl(kind, id, { full: false }), false);
      });
      return;
    }

    var cachePromise = getCachedBlob(kind, id, true).then(function (cached) {
      if (cached) {
        revokeUrl(kind, id, true);
        objectUrls[objectUrlKey(kind, id, true)] = URL.createObjectURL(cached);
        go(objectUrls[objectUrlKey(kind, id, true)], true);
        return true;
      }
      return false;
    });

    if (isWeChat()) {
      setTimeout(function () {
        if (!started) go(fileUrl(kind, id, { download: false }), true);
      }, 60);
      cachePromise.catch(function () {
        if (!started) go(fileUrl(kind, id, { download: false }), true);
      });
      return;
    }

    cachePromise.then(function (hit) {
      if (!hit) go(fileUrl(kind, id, { download: false }), true);
    }).catch(function () {
      go(fileUrl(kind, id, { download: false }), true);
    });
  }

  function downloadTrack(kind, item) {
    var id = item.id;
    var fallback = kind === 'traditional' ? 'traditional-music' : 'ai-music';
    var name = String(item.title || fallback).replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;
    name += '.mp3';

    if (isWeChat()) {
      if (typeof tbNotify === 'function') {
        tbNotify(typeof window.t === 'function' ? window.t('common.wechatFileDownloadTip') : tr('hub.musicPage.wechatDownloadTip'));
      }
      return;
    }

    var btn = document.querySelector('[data-music-dl="' + id + '"][data-music-kind="' + kind + '"]');
    if (btn) btn.textContent = tr('hub.musicPage.loading');
    loadBlob(kind, id, item.contentType, true).then(function (pack) {
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
    if (!sec) return '—';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function lyricsPreviewSnippet(raw, maxLen) {
    maxLen = maxLen || 100;
    var plain = '';
    if (window.TBMusicPlayer && typeof TBMusicPlayer.staticLyricsPlain === 'function') {
      plain = TBMusicPlayer.staticLyricsPlain(raw);
    } else if (window.TBMusicPlayer && typeof TBMusicPlayer.dedupeLyricSections === 'function') {
      plain = TBMusicPlayer.sungTextLines(TBMusicPlayer.dedupeLyricSections(raw)).join(' ');
    } else if (window.TBMusicPlayer && typeof TBMusicPlayer.sungTextLines === 'function') {
      plain = TBMusicPlayer.sungTextLines(raw).join(' ');
    }
    if (!plain) return '';
    if (plain.length > maxLen) plain = plain.slice(0, maxLen - 1) + '…';
    return plain;
  }

  function renderList(kind, items) {
    var list = document.getElementById('music-list');
    var empty = document.getElementById('music-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = kind === 'traditional'
          ? tr('hub.musicPage.traditionalEmpty')
          : tr('hub.musicPage.empty');
      }
      if (activeTab === kind) {
        destroyPlayer();
        document.querySelectorAll('.music-track-player').forEach(function (el) { el.innerHTML = ''; });
      }
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'music-track-card';
      card.innerHTML =
        '<div class="music-track-main">' +
          '<div class="music-track-title"></div>' +
          '<div class="music-track-creator" hidden></div>' +
          '<div class="music-track-prompt" hidden></div>' +
          '<div class="music-track-lyrics" hidden></div>' +
          '<div class="music-track-meta"></div>' +
        '</div>' +
        '<div class="music-track-actions action-row">' +
          '<button type="button" class="tb-btn" data-music-play="" data-music-kind=""></button>' +
          '<button type="button" class="tb-btn" data-music-dl="" data-music-kind=""></button>' +
        '</div>';

      card.querySelector('.music-track-title').textContent = item.title || tr('hub.musicPage.untitled');

      if (kind === 'ai') {
        var creatorEl = card.querySelector('.music-track-creator');
        var nick = (item.creatorNickname || '').trim();
        var phone = (item.creatorPhone || '').trim();
        creatorEl.hidden = false;
        if (nick || phone) {
          creatorEl.textContent = tr('hub.musicPage.creatorLabel') + ': ' +
            (nick || tr('hub.musicPage.untitled')) +
            (phone && phone !== '—' ? (' · ' + phone) : '');
        } else {
          creatorEl.textContent = tr('hub.musicPage.creatorLabel') + ': —';
        }
        var promptEl = card.querySelector('.music-track-prompt');
        var promptText = (item.prompt || '').trim();
        if (promptText) {
          promptEl.hidden = false;
          promptEl.textContent = tr('hub.musicPage.promptLabel') + ': ' + promptText;
        }
        var lyricsPreview = card.querySelector('.music-track-lyrics');
        var lyFull = (item.lyrics || '').trim();
        if (lyFull) {
          lyricsPreview.hidden = false;
          var preview = lyricsPreviewSnippet(lyFull, 100);
          lyricsPreview.textContent = preview
            ? (tr('hub.musicPage.lyricsLabel') + ': ' + preview)
            : (tr('hub.musicPage.lyricsLabel') + ': ' + tr('hub.musicPage.lyricsTagsOnly'));
        }
        var hasLy = !!lyFull;
        card.querySelector('.music-track-meta').textContent =
          (item.model || '') + ' · ' + formatDuration(item.duration) +
          (hasLy ? (' · ' + tr('hub.musicPage.hasLyrics')) : (' · ' + tr('hub.musicPage.noLyrics'))) +
          (item.createdAt ? (' · ' + item.createdAt) : '');
      } else {
        var artist = (item.artist || '').trim();
        if (artist) {
          card.querySelector('.music-track-creator').hidden = false;
          card.querySelector('.music-track-creator').textContent = artist;
        }
        var lyFull = (item.lyrics || '').trim();
        if (lyFull) {
          var lyricsPreview = card.querySelector('.music-track-lyrics');
          lyricsPreview.hidden = false;
          var preview = lyricsPreviewSnippet(lyFull, 100);
          lyricsPreview.textContent = tr('hub.musicPage.lyricsLabel') + ': ' + preview;
        }
        card.querySelector('.music-track-meta').textContent =
          tr('hub.musicPage.traditionalLabel') + ' · ' + formatDuration(item.duration) +
          (lyFull ? (' · ' + tr('hub.musicPage.hasLyrics')) : '');
      }

      var playBtn = card.querySelector('[data-music-play]');
      var dlBtn = card.querySelector('[data-music-dl]');
      playBtn.setAttribute('data-music-play', item.id);
      playBtn.setAttribute('data-music-kind', kind);
      dlBtn.setAttribute('data-music-dl', item.id);
      dlBtn.setAttribute('data-music-kind', kind);
      playBtn.textContent = tr('hub.musicPage.play');
      dlBtn.textContent = tr('hub.musicPage.download');
      playBtn.addEventListener('click', function () { playTrack(kind, item); });
      dlBtn.addEventListener('click', function () { downloadTrack(kind, item); });
      list.appendChild(card);
    });
  }

  function updateTabUi() {
    document.querySelectorAll('[data-music-tab]').forEach(function (btn) {
      var tab = btn.getAttribute('data-music-tab');
      btn.classList.toggle('active', tab === activeTab);
      btn.setAttribute('aria-selected', tab === activeTab ? 'true' : 'false');
    });
    var sub = document.getElementById('music-hub-sub');
    if (sub) {
      sub.textContent = activeTab === 'traditional'
        ? tr('hub.musicPage.traditionalSub')
        : tr('hub.musicPage.aiSub');
    }
    var createRow = document.getElementById('music-create-row');
    if (createRow) createRow.hidden = activeTab !== 'ai';
  }

  function switchTab(tab) {
    if (tab !== 'ai' && tab !== 'traditional') return;
    if (tab === activeTab) return;
    activeTab = tab;
    destroyPlayer();
    document.querySelectorAll('.music-track-player').forEach(function (el) { el.innerHTML = ''; });
    updateTabUi();
    loadList(tab);
  }

  function loadList(kind) {
    kind = kind || activeTab;
    var box = document.getElementById('music-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('music-busy');
    if (busy) busy.hidden = false;
    var url = kind === 'traditional'
      ? apiBase() + '/music/traditional/list?limit=200'
      : apiBase() + '/music/public/list?limit=50';
    fetch(url, { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        if (activeTab === kind) renderList(kind, (data && data.items) || []);
      })
      .catch(function (err) {
        if (activeTab === kind) {
          if (box) {
            box.hidden = false;
            box.textContent = (err && err.message) || tr('hub.musicPage.loadFailed');
          }
          renderList(kind, []);
        }
      })
      .then(function () {
        if (busy && activeTab === kind) busy.hidden = true;
      });
  }

  window.renderMusicHub = function () {
    var main = document.getElementById('main-content');
    if (!main) return;
    activeTab = 'ai';
    destroyPlayer();
    main.innerHTML =
      '<div class="music-hub">' +
        '<div class="music-hub-head">' +
          '<h2 class="music-hub-title">' + escapeHtml(tr('hub.musicPage.title')) + '</h2>' +
          '<p class="music-hub-sub" id="music-hub-sub"></p>' +
          '<div class="tb-tabs tb-tabs--underline music-hub-tabs" role="tablist">' +
            '<button type="button" class="tb-tab active" data-music-tab="ai" role="tab" aria-selected="true">' +
              escapeHtml(tr('hub.musicPage.aiTab')) +
            '</button>' +
            '<button type="button" class="tb-tab" data-music-tab="traditional" role="tab" aria-selected="false">' +
              escapeHtml(tr('hub.musicPage.traditionalTab')) +
            '</button>' +
          '</div>' +
          '<div class="action-row" id="music-create-row" style="margin:12px 0 8px">' +
            '<a class="tb-btn" href="html/media/ai-music.html">' + escapeHtml(tr('hub.musicPage.create')) + '</a>' +
            '<button type="button" class="tb-btn" id="music-refresh">' + escapeHtml(tr('hub.musicPage.refresh')) + '</button>' +
          '</div>' +
        '</div>' +
        '<p class="music-hub-tip">' + escapeHtml(tr('hub.musicPage.cacheTip')) + '</p>' +
        '<div id="music-busy" class="music-hub-busy" hidden>' + escapeHtml(tr('hub.musicPage.loading')) + '</div>' +
        '<div id="music-error" class="error-box" role="alert" hidden></div>' +
        '<p id="music-empty" class="music-hub-empty" hidden></p>' +
        '<div id="music-list" class="music-track-list"></div>' +
      '</div>';
    document.querySelectorAll('[data-music-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-music-tab'));
      });
    });
    var refresh = document.getElementById('music-refresh');
    if (refresh) refresh.addEventListener('click', function () { loadList(activeTab); });
    updateTabUi();
    loadList('ai');
    loadList('traditional');
  };
})();
