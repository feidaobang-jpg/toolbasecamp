/**
 * Shared AI music player: stream play + approximate scrolling lyrics + lyrics download.
 * MiniMax does not return timed LRC; lines are paced evenly across duration.
 */
(function (global) {
  'use strict';

  var STRUCTURE_RE = /^\s*\[(Intro|Verse|Pre[-\s]?Chorus|Chorus|Interlude|Bridge|Outro|Post[-\s]?Chorus|Transition|Break|Hook|Build[-\s]?Up|Inst|Solo|Drop|Instrumental|Breakdown)[^\]]*\]\s*$/i;

  function tr(key, fallback) {
    if (typeof global.t === 'function') {
      var v = global.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function trFirst(keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var v = tr(keys[i], '');
      if (v && v !== keys[i]) return v;
    }
    return fallback || keys[0];
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseLines(lyrics) {
    var raw = String(lyrics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].trim();
      if (!t) continue;
      lines.push({
        text: t,
        isTag: STRUCTURE_RE.test(t)
      });
    }
    return lines;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Map current time → line index (tags keep previous sung pace). */
  function activeIndex(lines, t, duration) {
    if (!lines.length || duration <= 0) return -1;
    var sung = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].isTag) sung.push(i);
    }
    if (!sung.length) {
      // only tags — highlight by overall progress
      var idx = Math.min(lines.length - 1, Math.floor((t / duration) * lines.length));
      return idx;
    }
    var lead = Math.min(4, duration * 0.06);
    var trail = Math.min(6, duration * 0.08);
    var usable = Math.max(0.1, duration - lead - trail);
    var p = (t - lead) / usable;
    if (p <= 0) return sung[0];
    if (p >= 1) return sung[sung.length - 1];
    var si = Math.min(sung.length - 1, Math.floor(p * sung.length));
    return sung[si];
  }

  function buildApproxLrc(lines, duration) {
    var sung = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].isTag) sung.push(lines[i]);
    }
    var source = sung.length ? sung : lines;
    if (!source.length) return '';
    var lead = Math.min(4, duration * 0.06);
    var trail = Math.min(6, duration * 0.08);
    var usable = Math.max(0.1, duration - lead - trail);
    var out = [];
    for (var j = 0; j < source.length; j++) {
      var sec = lead + (j / Math.max(1, source.length)) * usable;
      var mm = Math.floor(sec / 60);
      var ss = sec - mm * 60;
      var ts = '[' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss.toFixed(2) + ']';
      out.push(ts + source[j].text);
    }
    return out.join('\n');
  }

  function ensureStyles() {
    if (document.getElementById('tb-music-player-style')) return;
    var s = document.createElement('style');
    s.id = 'tb-music-player-style';
    s.textContent =
      '.tb-mp{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:14px 14px 12px;margin:10px 0 12px}' +
      '.tb-mp-title{font-weight:700;color:#0f172a;font-size:1rem;margin:0 0 10px;line-height:1.35}' +
      '.tb-mp-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
      '.tb-mp-time{font-size:12px;color:#64748b;min-width:84px;text-align:center;font-variant-numeric:tabular-nums}' +
      '.tb-mp-seek{flex:1;min-width:120px;accent-color:#2563eb}' +
      '.tb-mp-lyrics{margin-top:12px;max-height:260px;overflow:auto;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;padding:10px 12px;-webkit-overflow-scrolling:touch}' +
      '.tb-mp-line{padding:6px 8px;border-radius:8px;color:#64748b;font-size:14px;line-height:1.55;transition:background .2s,color .2s,transform .2s}' +
      '.tb-mp-line.is-tag{color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:.02em}' +
      '.tb-mp-line.is-active{background:#dbeafe;color:#1e3a8a;font-weight:700;transform:scale(1.02)}' +
      '.tb-mp-empty{color:#94a3b8;font-size:13px;padding:8px;margin:0}' +
      '.tb-mp-actions{margin-top:10px}' +
      '.tb-mp audio{display:none}';
    document.head.appendChild(s);
  }

  /**
   * @param {HTMLElement} mountEl
   * @param {{src:string,title?:string,lyrics?:string,durationHint?:number,audioName?:string,onDownloadAudio?:Function}} opts
   */
  function mount(mountEl, opts) {
    ensureStyles();
    opts = opts || {};
    if (!mountEl) return null;

    var lines = parseLines(opts.lyrics);
    var durationHint = Number(opts.durationHint) || 0;

    mountEl.innerHTML =
      '<div class="tb-mp">' +
        '<div class="tb-mp-title"></div>' +
        '<audio preload="metadata" playsinline webkit-playsinline></audio>' +
        '<div class="tb-mp-row">' +
          '<button type="button" class="tb-btn tb-mp-play"></button>' +
          '<span class="tb-mp-time"><span class="tb-mp-cur">0:00</span> / <span class="tb-mp-dur">0:00</span></span>' +
          '<input type="range" class="tb-mp-seek" min="0" max="1000" value="0" step="1" />' +
        '</div>' +
        '<p class="tb-mp-hint"></p>' +
        '<div class="tb-mp-lyrics" aria-live="polite"></div>' +
        '<div class="action-row tb-mp-actions">' +
          '<button type="button" class="tb-btn tb-mp-dl-audio"></button>' +
          '<button type="button" class="tb-btn tb-mp-dl-lyrics"></button>' +
        '</div>' +
      '</div>';

    var root = mountEl.querySelector('.tb-mp');
    var titleEl = root.querySelector('.tb-mp-title');
    var audio = root.querySelector('audio');
    var playBtn = root.querySelector('.tb-mp-play');
    var curEl = root.querySelector('.tb-mp-cur');
    var durEl = root.querySelector('.tb-mp-dur');
    var seek = root.querySelector('.tb-mp-seek');
    var hintEl = root.querySelector('.tb-mp-hint');
    var lyricsEl = root.querySelector('.tb-mp-lyrics');
    var dlAudioBtn = root.querySelector('.tb-mp-dl-audio');
    var dlLyricsBtn = root.querySelector('.tb-mp-dl-lyrics');

    titleEl.textContent = opts.title || trFirst(['common.musicPlayer.untitled', 'hub.musicPage.untitled'], 'Untitled');
    playBtn.textContent = trFirst(['common.musicPlayer.play', 'hub.musicPage.play'], 'Play');
    dlAudioBtn.textContent = trFirst(['tools.aiMusic.download', 'hub.musicPage.download'], 'Download');
    dlLyricsBtn.textContent = trFirst(['common.musicPlayer.downloadLyrics', 'tools.aiMusic.downloadLyrics', 'hub.musicPage.downloadLyrics'], 'Download lyrics');
    if (hintEl) {
      hintEl.textContent = trFirst(['common.musicPlayer.syncHint'], '');
      hintEl.style.cssText = 'font-size:12px;color:#94a3b8;margin:8px 0 0;line-height:1.45';
      if (!lines.length) hintEl.hidden = true;
    }

    if (lines.length) {
      lyricsEl.innerHTML = lines.map(function (ln, i) {
        return '<div class="tb-mp-line' + (ln.isTag ? ' is-tag' : '') + '" data-i="' + i + '">' + escapeHtml(ln.text) + '</div>';
      }).join('');
    } else {
      lyricsEl.innerHTML = '<p class="tb-mp-empty">' + escapeHtml(trFirst(['common.musicPlayer.noLyrics', 'hub.musicPage.noLyrics', 'tools.aiMusic.noLyrics'], 'No lyrics')) + '</p>';
      dlLyricsBtn.hidden = true;
    }

    audio.src = opts.src || '';
    var seeking = false;
    var lastActive = -1;

    function duration() {
      var d = audio.duration;
      if (d && isFinite(d) && d > 0) return d;
      return durationHint > 0 ? durationHint : 0;
    }

    function syncLyrics(t) {
      var d = duration();
      var idx = activeIndex(lines, t, d || 1);
      if (idx === lastActive) return;
      lastActive = idx;
      var nodes = lyricsEl.querySelectorAll('.tb-mp-line');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('is-active', i === idx);
      }
      var active = lyricsEl.querySelector('.tb-mp-line.is-active');
      if (active && typeof active.scrollIntoView === 'function') {
        try {
          active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) {
          active.scrollIntoView(true);
        }
      }
    }

    function tick() {
      var d = duration();
      var t = audio.currentTime || 0;
      curEl.textContent = formatTime(t);
      durEl.textContent = formatTime(d);
      if (!seeking && d > 0) seek.value = String(Math.round((t / d) * 1000));
      syncLyrics(t);
    }

    function labelPlay() {
      return trFirst(['common.musicPlayer.play', 'hub.musicPage.play'], 'Play');
    }
    function labelPause() {
      return trFirst(['common.musicPlayer.pause', 'hub.musicPage.pause'], 'Pause');
    }

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().then(function () {
          playBtn.textContent = labelPause();
        }).catch(function () {
          playBtn.textContent = labelPlay();
        });
      } else {
        audio.pause();
        playBtn.textContent = labelPlay();
      }
    });

    audio.addEventListener('play', function () {
      playBtn.textContent = labelPause();
      if (typeof opts.onPlayState === 'function') opts.onPlayState(true);
    });
    audio.addEventListener('pause', function () {
      playBtn.textContent = labelPlay();
      if (typeof opts.onPlayState === 'function') opts.onPlayState(false);
    });
    audio.addEventListener('ended', function () {
      playBtn.textContent = labelPlay();
      lastActive = -1;
      syncLyrics(duration());
      if (typeof opts.onPlayState === 'function') opts.onPlayState(false);
    });
    audio.addEventListener('error', function () {
      playBtn.textContent = labelPlay();
      if (typeof opts.onError === 'function') opts.onError();
    });
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('loadedmetadata', tick);
    audio.addEventListener('durationchange', tick);

    seek.addEventListener('input', function () {
      seeking = true;
      var d = duration();
      if (d > 0) {
        var t = (Number(seek.value) / 1000) * d;
        curEl.textContent = formatTime(t);
        syncLyrics(t);
      }
    });
    seek.addEventListener('change', function () {
      var d = duration();
      if (d > 0) audio.currentTime = (Number(seek.value) / 1000) * d;
      seeking = false;
    });

    dlAudioBtn.addEventListener('click', function () {
      if (typeof opts.onDownloadAudio === 'function') {
        opts.onDownloadAudio();
        return;
      }
      if (typeof global.tbTriggerDownload === 'function') {
        global.tbTriggerDownload(opts.src, (opts.audioName || 'ai-music') + '.mp3');
      } else {
        var a = document.createElement('a');
        a.href = opts.src;
        a.download = (opts.audioName || 'ai-music') + '.mp3';
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      }
    });

    dlLyricsBtn.addEventListener('click', function () {
      var d = duration() || durationHint || 180;
      var body = String(opts.lyrics || '').trim();
      if (!body) return;
      var approx = buildApproxLrc(lines, d);
      var text = body + '\n\n# Approximate LRC (evenly paced; not official timed lyrics)\n' + approx;
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var fname = (opts.audioName || 'ai-music-lyrics') + '.txt';
      if (typeof global.tbIsWeChat === 'function' && global.tbIsWeChat()) {
        if (typeof global.tbNotify === 'function') {
          global.tbNotify(tr('common.wechatFileDownloadTip', 'Open in browser to download.'));
        }
        return;
      }
      if (typeof global.tbTriggerDownload === 'function') {
        global.tbTriggerDownload(blob, fname);
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }
    });

    tick();

    return {
      audio: audio,
      play: function () { return audio.play(); },
      pause: function () { audio.pause(); },
      destroy: function () {
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch (e) {}
        mountEl.innerHTML = '';
      },
      update: function (next) {
        next = next || {};
        if (next.title != null) titleEl.textContent = next.title;
        if (next.src) audio.src = next.src;
        if (next.lyrics != null) {
          opts.lyrics = next.lyrics;
          lines = parseLines(next.lyrics);
          lastActive = -1;
          if (lines.length) {
            lyricsEl.innerHTML = lines.map(function (ln, i) {
              return '<div class="tb-mp-line' + (ln.isTag ? ' is-tag' : '') + '" data-i="' + i + '">' + escapeHtml(ln.text) + '</div>';
            }).join('');
            dlLyricsBtn.hidden = false;
          } else {
            lyricsEl.innerHTML = '<p class="tb-mp-empty">' + escapeHtml(tr('tools.aiMusic.noLyrics', 'No lyrics')) + '</p>';
            dlLyricsBtn.hidden = true;
          }
        }
        if (next.durationHint != null) durationHint = Number(next.durationHint) || 0;
        tick();
      }
    };
  }

  global.TBMusicPlayer = {
    mount: mount,
    parseLines: parseLines,
    buildApproxLrc: buildApproxLrc
  };
})(typeof window !== 'undefined' ? window : this);
