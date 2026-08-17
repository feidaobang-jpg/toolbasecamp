/**
 * Public music hub — AI + traditional tabs, shared player, Cache API.
 * Non-WeChat: play from cache blob after first fetch; WeChat streams direct URL.
 */
(function () {
  'use strict';

  var CACHE_NAME = 'tbc-music-hub-v6';
  var objectUrls = {};
  var player = null;
  var currentId = '';
  var currentKind = 'traditional';
  var currentItem = null;
  var currentCardEl = null;
  var activeTab = 'traditional';
  var listCache = { ai: null, traditional: null };
  var tradSearchQuery = '';
  var CONT_PLAY_KEY = 'tbc_music_cont_play_v1';
  var continuousPlay = false;

  function loadContinuousPref() {
    try {
      return localStorage.getItem(CONT_PLAY_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveContinuousPref(on) {
    try {
      localStorage.setItem(CONT_PLAY_KEY, on ? '1' : '0');
    } catch (e) {}
  }

  function getQueueItems(kind) {
    kind = kind || activeTab;
    var items = listCache[kind] || [];
    if (kind === 'traditional') return filterTraditionalItems(items);
    return items.slice();
  }

  function normalizeSearch(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[《》【】\[\]()（）·・.\-_]/g, '');
  }

  function filterTraditionalItems(items) {
    var q = normalizeSearch(tradSearchQuery);
    if (!q) return items || [];
    return (items || []).filter(function (item) {
      var hay = normalizeSearch(
        [item.title, item.artist, item.source, item.lyricsPreview].filter(Boolean).join(' ')
      );
      return hay.indexOf(q) >= 0;
    });
  }

  function showActiveList(kind) {
    kind = kind || activeTab;
    var items = listCache[kind] || [];
    if (kind === 'traditional') {
      var filtered = filterTraditionalItems(items);
      renderList(kind, filtered, {
        isFilterEmpty: !!(normalizeSearch(tradSearchQuery) && items.length && !filtered.length)
      });
      return;
    }
    renderList(kind, items);
  }

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

  function warmCache(kind, id, contentType, audioEl, isNetworkStream) {
    // 传统音乐只缓存试听(preview)；全曲仅下载时拉取。微信首播不抢带宽。
    if (!cacheAvailable() || isWeChat()) return;
    var wantFull = kind !== 'traditional';
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
        setTimeout(run, 0);
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

  function findTrackCard(kind, id) {
    var want = String(id || '');
    var nodes = document.querySelectorAll('[data-music-play][data-music-kind]');
    for (var i = 0; i < nodes.length; i++) {
      var btn = nodes[i];
      if ((btn.getAttribute('data-music-kind') || 'ai') !== kind) continue;
      if (String(btn.getAttribute('data-music-play') || '') !== want) continue;
      return btn.closest('.music-track-card');
    }
    return null;
  }

  function ensurePlayerHost(card) {
    var playerHost = card.querySelector('.music-track-player');
    if (!playerHost) {
      playerHost = document.createElement('div');
      playerHost.className = 'music-track-player';
      card.appendChild(playerHost);
    }
    return playerHost;
  }

  function playNextInQueue() {
    if (!continuousPlay || !currentId || !currentKind) return;
    var kind = currentKind;
    var curId = currentId;
    var items = getQueueItems(kind);
    if (!items.length) return;
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(curId)) {
        idx = i;
        break;
      }
    }
    if (idx < 0 || idx >= items.length - 1) return;
    var next = items[idx + 1];
    if (!next || !next.id) return;
    // Defer so the ended handler finishes; reuse the same <audio> to keep autoplay permission.
    setTimeout(function () {
      advanceToTrack(kind, next);
    }, 80);
  }

  function advanceToTrack(kind, item) {
    if (!item || !item.id) return;
    if (!player || !player.audio || typeof player.update !== 'function') {
      playTrack(kind, item);
      return;
    }
    var card = findTrackCard(kind, item.id);
    if (!card) {
      playTrack(kind, item);
      return;
    }
    var playerHost = ensurePlayerHost(card);
    var root = player.audio.closest('.tb-mp');
    if (root && root.parentNode !== playerHost) {
      playerHost.appendChild(root);
    }
    document.querySelectorAll('.music-track-card').forEach(function (el) {
      el.classList.remove('is-player-open', 'is-buffering');
    });
    document.querySelectorAll('.music-track-player').forEach(function (el) {
      if (el !== playerHost) el.innerHTML = '';
    });
    card.classList.add('is-player-open');
    currentCardEl = card;
    currentKind = kind;
    currentId = item.id;
    currentItem = item;

    var streamSrc = kind === 'traditional'
      ? fileUrl(kind, item.id, { full: false })
      : fileUrl(kind, item.id, { download: false });
    var fallback = kind === 'traditional' ? 'traditional-music' : 'ai-music';
    var audioName = String(item.title || fallback).replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;

    player.update({
      src: streamSrc,
      title: item.title || tr('hub.musicPage.untitled'),
      lyrics: item.lyrics || '',
      durationHint: Number(item.duration) || 0,
      audioName: audioName
    });

    if (typeof player.setBuffering === 'function') player.setBuffering(true);
    setPlayingUi(kind, item.id, 'buffering');
    var playChain = typeof player.playWhenReady === 'function'
      ? player.playWhenReady()
      : player.play();
    playChain.then(function () {
      if (typeof player.setBuffering === 'function') player.setBuffering(false);
      setPlayingUi(kind, item.id, true);
    }).catch(function () {
      // Fallback: full remount (may still be blocked without gesture)
      if (typeof player.setBuffering === 'function') player.setBuffering(false);
      playTrack(kind, item);
    });
    warmCache(kind, item.id, item.contentType, player.audio, true);
    if (kind === 'traditional') hydrateTraditionalLyrics(kind, item, player);
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
    var isStream = !isBlob;
    player = window.TBMusicPlayer.mount(mountEl, {
      src: src,
      preload: isBlob || (isWeChat() && isStream) ? 'auto' : 'metadata',
      title: item.title || tr('hub.musicPage.untitled'),
      lyrics: item.lyrics || '',
      hideTitle: true,
      hideDownloadActions: true,
      durationHint: Number(item.duration) || 0,
      audioName: audioName,
      onDownloadAudio: function () {
        if (currentItem) downloadTrack(currentKind, currentItem);
      },
      onPlayState: function (playing) {
        setPlayingUi(currentKind, currentId, !!playing);
      },
      onBuffering: function (loading) {
        if (loading) setPlayingUi(currentKind, currentId, 'buffering');
        else if (player && player.audio && !player.audio.paused) setPlayingUi(currentKind, currentId, true);
      },
      onEnded: function () {
        playNextInQueue();
      },
      onError: function () {
        setPlayingUi(currentKind, currentId, false);
        var box = document.getElementById('music-error');
        if (box) {
          box.hidden = false;
          box.textContent = tr('hub.musicPage.playFailed');
        }
      }
    });
    warmCache(kind, item.id, item.contentType, player && player.audio, isStream);
    if (autoplay && player && player.audio) {
      if (typeof player.setBuffering === 'function') player.setBuffering(true);
      setPlayingUi(kind, item.id, 'buffering');
      var audioEl = player.audio;
      var startPlay = function () {
        var chain = typeof player.playWhenReady === 'function'
          ? player.playWhenReady()
          : audioEl.play();
        return chain.then(function () {
          if (typeof player.setBuffering === 'function') player.setBuffering(false);
          setPlayingUi(kind, item.id, true);
        }).catch(function () {
          if (typeof player.setBuffering === 'function') player.setBuffering(false);
          setPlayingUi(kind, item.id, false);
        });
      };
      var direct = audioEl.play();
      if (direct && typeof direct.then === 'function') {
        direct.then(function () {
          if (typeof player.setBuffering === 'function') player.setBuffering(false);
          setPlayingUi(kind, item.id, true);
        }).catch(function () {
          startPlay();
        });
      } else {
        startPlay();
      }
    }
  }

  function fetchTraditionalMeta(item) {
    if (!item || !item.id) return Promise.resolve(item);
    if ((item.lyrics || '').trim()) return Promise.resolve(item);
    return fetch(apiBase() + '/music/traditional/' + encodeURIComponent(item.id) + '/meta', {
      headers: authHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return (data && data.item) || item;
      });
    }).catch(function () { return item; });
  }

  function hydrateTraditionalLyrics(kind, item, playerInst) {
    if (kind !== 'traditional' || !playerInst) return;
    fetchTraditionalMeta(item).then(function (full) {
      if (!full || !full.lyrics || !playerInst || currentId !== item.id) return;
      currentItem = Object.assign({}, item, full);
      if (typeof playerInst.update === 'function') {
        playerInst.update({ lyrics: full.lyrics });
      }
    });
  }

  function playTrack(kind, item) {
    var id = item.id;
    var card = findTrackCard(kind, id);
    if (!card) return;
    var playerHost = ensurePlayerHost(card);

    if (currentKind === kind && currentId === id && player && player.audio) {
      if (!player.audio.paused) {
        player.pause();
        setPlayingUi(kind, id, false);
      } else {
        var resume = typeof player.playWhenReady === 'function'
          ? player.playWhenReady()
          : player.play();
        resume.then(function () {
          setPlayingUi(kind, id, true);
        }).catch(function () {
          setPlayingUi(kind, id, false);
        });
      }
      return;
    }

    setPlayingUi(kind, id, 'buffering');

    function go(src) {
      document.querySelectorAll('.music-track-card').forEach(function (el) {
        el.classList.remove('is-player-open', 'is-buffering');
      });
      document.querySelectorAll('.music-track-player').forEach(function (el) {
        if (el !== playerHost) el.innerHTML = '';
      });
      card.classList.add('is-player-open');
      currentCardEl = card;
      mountPlayer(kind, item, src, true, playerHost);
      if (kind === 'traditional') hydrateTraditionalLyrics(kind, item, player);
    }

    // 传统音乐播放固定试听(preview)；全曲仅下载
    var streamSrc = kind === 'traditional'
      ? fileUrl(kind, id, { full: false })
      : fileUrl(kind, id, { download: false });
    go(streamSrc);

    if (!isWeChat() && cacheAvailable() && kind === 'traditional') {
      getCachedBlob(kind, id, false).then(function (cached) {
        if (!cached || currentId !== id || !player || !player.audio) return;
        var audioEl = player.audio;
        if (String(audioEl.src || '').indexOf('blob:') === 0) return;
        var wasPlaying = !audioEl.paused;
        var t = audioEl.currentTime || 0;
        revokeUrl(kind, id, false);
        var blobUrl = URL.createObjectURL(cached);
        objectUrls[objectUrlKey(kind, id, false)] = blobUrl;
        audioEl.src = blobUrl;
        try { audioEl.currentTime = t; } catch (e) {}
        if (wasPlaying) {
          (typeof player.playWhenReady === 'function' ? player.playWhenReady() : player.play()).catch(function () {});
        }
      }).catch(function () {});
    } else if (!isWeChat() && cacheAvailable() && kind !== 'traditional') {
      getCachedBlob(kind, id, true).then(function (cached) {
        if (!cached || currentId !== id || !player || !player.audio) return;
        var audioEl = player.audio;
        if (String(audioEl.src || '').indexOf('blob:') === 0) return;
        var wasPlaying = !audioEl.paused;
        var t = audioEl.currentTime || 0;
        revokeUrl(kind, id, true);
        var blobUrl = URL.createObjectURL(cached);
        objectUrls[objectUrlKey(kind, id, true)] = blobUrl;
        audioEl.src = blobUrl;
        try { audioEl.currentTime = t; } catch (e) {}
        if (wasPlaying) {
          (typeof player.playWhenReady === 'function' ? player.playWhenReady() : player.play()).catch(function () {});
        }
      }).catch(function () {});
    }
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

  function renderList(kind, items, opts) {
    opts = opts || {};
    var list = document.getElementById('music-list');
    var empty = document.getElementById('music-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) {
        empty.hidden = false;
        if (opts.isFilterEmpty) {
          empty.textContent = tr('hub.musicPage.searchEmpty');
        } else {
          empty.textContent = kind === 'traditional'
            ? tr('hub.musicPage.traditionalEmpty')
            : tr('hub.musicPage.empty');
        }
      }
      if (activeTab === kind && !opts.isFilterEmpty) {
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
        var lyPreview = (item.lyricsPreview || '').trim();
        if (lyFull || lyPreview) {
          var lyricsPreview = card.querySelector('.music-track-lyrics');
          lyricsPreview.hidden = false;
          var preview = lyFull
            ? lyricsPreviewSnippet(lyFull, 100)
            : lyPreview;
          lyricsPreview.textContent = tr('hub.musicPage.lyricsLabel') + ': ' + preview;
        }
        card.querySelector('.music-track-meta').textContent =
          tr('hub.musicPage.traditionalLabel') + ' · ' + formatDuration(item.duration) +
          ((lyFull || lyPreview || item.hasLyrics) ? (' · ' + tr('hub.musicPage.hasLyrics')) : '');
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
    var searchWrap = document.getElementById('music-trad-search');
    if (searchWrap) searchWrap.hidden = activeTab !== 'traditional';
  }

  function switchTab(tab) {
    if (tab !== 'ai' && tab !== 'traditional') return;
    if (tab === activeTab) return;
    activeTab = tab;
    destroyPlayer();
    document.querySelectorAll('.music-track-player').forEach(function (el) { el.innerHTML = ''; });
    updateTabUi();
    if (listCache[tab]) {
      showActiveList(tab);
      var busy = document.getElementById('music-busy');
      if (busy) busy.hidden = true;
    }
    loadList(tab, { background: !!listCache[tab] });
  }

  function loadList(kind, opts) {
    opts = opts || {};
    kind = kind || activeTab;
    var box = document.getElementById('music-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
    var busy = document.getElementById('music-busy');
    var showBusy = !opts.background && !listCache[kind];
    if (busy) busy.hidden = !showBusy;
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
        var items = (data && data.items) || [];
        listCache[kind] = items;
        if (activeTab === kind) showActiveList(kind);
      })
      .catch(function (err) {
        if (activeTab === kind && !listCache[kind]) {
          if (box) {
            box.hidden = false;
            box.textContent = (err && err.message) || tr('hub.musicPage.loadFailed');
          }
          showActiveList(kind);
        }
      })
      .then(function () {
        if (busy && activeTab === kind) busy.hidden = true;
      });
  }

  window.renderMusicHub = function () {
    var main = document.getElementById('main-content');
    if (!main) return;
    activeTab = 'traditional';
    listCache = { ai: null, traditional: null };
    tradSearchQuery = '';
    destroyPlayer();
    main.innerHTML =
      '<div class="music-hub">' +
        '<div class="music-hub-head">' +
          '<h2 class="music-hub-title">' + escapeHtml(tr('hub.musicPage.title')) + '</h2>' +
          '<p class="music-hub-sub" id="music-hub-sub"></p>' +
          '<div class="tb-tabs tb-tabs--underline music-hub-tabs" role="tablist">' +
            '<button type="button" class="tb-tab active" data-music-tab="traditional" role="tab" aria-selected="true">' +
              escapeHtml(tr('hub.musicPage.traditionalTab')) +
            '</button>' +
            '<button type="button" class="tb-tab" data-music-tab="ai" role="tab" aria-selected="false">' +
              escapeHtml(tr('hub.musicPage.aiTab')) +
            '</button>' +
          '</div>' +
          '<div class="action-row" id="music-create-row" style="margin:12px 0 8px">' +
            '<a class="tb-btn" href="html/media/ai-music.html">' + escapeHtml(tr('hub.musicPage.create')) + '</a>' +
            '<button type="button" class="tb-btn" id="music-refresh">' + escapeHtml(tr('hub.musicPage.refresh')) + '</button>' +
          '</div>' +
        '</div>' +
        '<p class="music-hub-tip">' + escapeHtml(tr('hub.musicPage.cacheTip')) + '</p>' +
        '<div id="music-trad-search" class="music-hub-search" hidden>' +
          '<input type="search" class="tb-input" id="music-search-input" autocomplete="off" ' +
            'placeholder="' + escapeHtml(tr('hub.musicPage.searchPlaceholder')) + '" ' +
            'aria-label="' + escapeHtml(tr('hub.musicPage.searchPlaceholder')) + '">' +
        '</div>' +
        '<label class="music-hub-cont" for="music-cont-play">' +
          '<input type="checkbox" id="music-cont-play">' +
          '<span class="music-hub-cont-text">' +
            '<span>' + escapeHtml(tr('hub.musicPage.continuousPlay')) + '</span>' +
            '<span class="music-hub-cont-tip">' + escapeHtml(tr('hub.musicPage.continuousPlayTip')) + '</span>' +
          '</span>' +
        '</label>' +
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
    continuousPlay = loadContinuousPref();
    var contInput = document.getElementById('music-cont-play');
    if (contInput) {
      contInput.checked = continuousPlay;
      contInput.addEventListener('change', function () {
        continuousPlay = !!contInput.checked;
        saveContinuousPref(continuousPlay);
      });
    }
    var searchInput = document.getElementById('music-search-input');
    if (searchInput) {
      var applySearch = function () {
        tradSearchQuery = searchInput.value || '';
        if (activeTab === 'traditional') showActiveList('traditional');
      };
      searchInput.addEventListener('input', applySearch);
      searchInput.addEventListener('compositionend', applySearch);
      searchInput.addEventListener('search', applySearch);
    }
    var refresh = document.getElementById('music-refresh');
    if (refresh) refresh.addEventListener('click', function () {
      listCache[activeTab] = null;
      loadList(activeTab);
    });
    updateTabUi();
    loadList('traditional');
    loadList('ai', { background: true });
  };
})();
