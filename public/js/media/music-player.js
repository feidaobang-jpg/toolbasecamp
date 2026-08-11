/**
 * Shared AI music player: stream play + lyrics (LRC sync if timed, else static full text).
 * MiniMax does not return timed LRC — default is static lyrics, no fake scroll sync.
 */
(function (global) {
  'use strict';

  var STRUCTURE_RE = /^\s*\[(Intro|Verse|Pre[-\s]?Chorus|Chorus|Interlude|Bridge|Outro|Post[-\s]?Chorus|Transition|Break|Hook|Build[-\s]?Up|Inst|Solo|Drop|Instrumental|Breakdown)[^\]]*\]\s*$/i;
  var LRC_TS_RE = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;

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

  function parseSections(lyrics) {
    var sections = [];
    var tag = null;
    var lines = [];
    var raw = String(lyrics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    raw.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (STRUCTURE_RE.test(t)) {
        if (tag !== null || lines.length) {
          sections.push({ tag: tag, lines: lines.slice() });
        }
        tag = t;
        lines = [];
      } else {
        lines.push(t);
      }
    });
    if (tag !== null || lines.length) {
      sections.push({ tag: tag, lines: lines });
    }
    return sections;
  }

  function sectionFingerprint(lines) {
    var parts = [];
    (lines || []).forEach(function (ln) {
      var t = String(ln || '').trim();
      if (!t) return;
      if (/^\(.+\)$/.test(t) && t.length < 48) return;
      parts.push(t.replace(/\s+/g, ' ').toLowerCase());
    });
    return parts.join('\n');
  }

  function dedupeLyricSections(lyrics) {
    var sections = parseSections(lyrics);
    if (sections.length <= 1) return String(lyrics || '').trim();
    var seen = {};
    var out = [];
    sections.forEach(function (sec) {
      var fp = sectionFingerprint(sec.lines);
      if (fp) {
        if (seen[fp]) return;
        seen[fp] = true;
      } else if (sec.tag) {
        var ek = sec.tag.toLowerCase() + '::empty';
        if (seen[ek]) return;
        seen[ek] = true;
      }
      if (sec.tag) {
        if (out.length) out.push('');
        out.push(sec.tag);
      }
      sec.lines.forEach(function (ln) { out.push(ln); });
    });
    return out.join('\n').trim();
  }

  function sungTextLines(lyrics) {
    var out = [];
    parseLines(dedupeLyricSections(lyrics)).forEach(function (ln) {
      if (ln.isTag) return;
      var t = (ln.text || '').trim();
      if (!t) return;
      if (/^\(.+\)$/.test(t) && t.length < 48) return;
      out.push(t);
    });
    return out;
  }

  function staticLyricsPlain(lyrics) {
    return sungTextLines(lyrics).join(' ');
  }

  function parseTimedLrc(lyrics) {
    var raw = String(lyrics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var timed = [];
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i].trim();
      if (!line) continue;
      var m = line.match(LRC_TS_RE);
      if (!m) continue;
      var mm = parseInt(m[1], 10) || 0;
      var ss = parseInt(m[2], 10) || 0;
      var frac = m[3] ? parseInt(m[3], 10) : 0;
      var text = (m[4] || '').trim();
      if (STRUCTURE_RE.test(text)) continue;
      if (!text) continue;
      var sub = frac ? frac / Math.pow(10, String(frac).length) : 0;
      timed.push({ time: mm * 60 + ss + sub, text: text });
    }
    timed.sort(function (a, b) { return a.time - b.time; });
    return timed.length >= 2 ? timed : null;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function lrcActiveIndex(timed, t) {
    if (!timed.length) return -1;
    var idx = 0;
    for (var i = 0; i < timed.length; i++) {
      if (timed[i].time <= t) idx = i;
      else break;
    }
    return idx;
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
      '.tb-mp-hint{font-size:12px;color:#94a3b8;margin:8px 0 0;line-height:1.45}' +
      '.tb-mp-lyrics{margin-top:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;padding:10px 12px}' +
      '.tb-mp-lyrics.is-scroll{max-height:260px;overflow:auto;-webkit-overflow-scrolling:touch}' +
      '.tb-mp-static{margin:0;font-size:14px;line-height:1.65;color:#334155;word-break:break-word;white-space:normal}' +
      '.tb-mp-line{padding:6px 8px;border-radius:8px;color:#64748b;font-size:14px;line-height:1.55;transition:background .2s,color .2s}' +
      '.tb-mp-line.is-active{background:#dbeafe;color:#1e3a8a;font-weight:700}' +
      '.tb-mp-empty{color:#94a3b8;font-size:13px;padding:8px;margin:0}' +
      '.tb-mp-actions{margin-top:10px}' +
      '.tb-mp-status{font-size:12px;color:#2563eb;margin:8px 0 0;line-height:1.45;display:flex;align-items:center;gap:8px}' +
      '.tb-mp-status[hidden]{display:none!important}' +
      '.tb-mp-status::before{content:"";width:12px;height:12px;border:2px solid rgba(37,99,235,.35);border-top-color:#2563eb;border-radius:50%;animation:tb-mp-spin .8s linear infinite;flex-shrink:0}' +
      '@keyframes tb-mp-spin{to{transform:rotate(360deg)}}' +
      '.tb-mp-play[data-loading="1"]::after{content:" ";display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid rgba(255,255,255,.7);border-top-color:#fff;border-radius:50%;animation:tb-mp-spin .8s linear infinite;vertical-align:-2px}' +
      '.tb-mp audio{display:none}';
    document.head.appendChild(s);
  }

  function renderLyricsBox(lyricsEl, mode, payload) {
    if (mode === 'lrc') {
      lyricsEl.className = 'tb-mp-lyrics is-scroll';
      lyricsEl.innerHTML = payload.map(function (ln, i) {
        return '<div class="tb-mp-line" data-i="' + i + '">' + escapeHtml(ln.text) + '</div>';
      }).join('');
      return;
    }
    if (mode === 'static') {
      lyricsEl.className = 'tb-mp-lyrics';
      lyricsEl.innerHTML = '<p class="tb-mp-static">' + escapeHtml(payload) + '</p>';
      return;
    }
    lyricsEl.className = 'tb-mp-lyrics';
    lyricsEl.innerHTML = '<p class="tb-mp-empty">' + escapeHtml(trFirst(['common.musicPlayer.noLyrics', 'hub.musicPage.noLyrics'], 'No lyrics')) + '</p>';
  }

  /**
   * @param {HTMLElement} mountEl
   * @param {{src:string,title?:string,lyrics?:string,durationHint?:number,audioName?:string,onDownloadAudio?:Function}} opts
   */
  function mount(mountEl, opts) {
    ensureStyles();
    opts = opts || {};
    if (!mountEl) return null;

    var durationHint = Number(opts.durationHint) || 0;
    var timedLrc = parseTimedLrc(opts.lyrics);
    var lyricsMode = timedLrc ? 'lrc' : (staticLyricsPlain(opts.lyrics) ? 'static' : 'empty');
    var lrcLines = timedLrc || [];

    mountEl.innerHTML =
      '<div class="tb-mp">' +
        '<div class="tb-mp-title"></div>' +
        '<audio preload="metadata" playsinline webkit-playsinline></audio>' +
        '<div class="tb-mp-row">' +
          '<button type="button" class="tb-btn tb-mp-play"></button>' +
          '<span class="tb-mp-time"><span class="tb-mp-cur">0:00</span> / <span class="tb-mp-dur">0:00</span></span>' +
          '<input type="range" class="tb-mp-seek" min="0" max="1000" value="0" step="1" />' +
        '</div>' +
        '<p class="tb-mp-status" hidden></p>' +
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
    var statusEl = root.querySelector('.tb-mp-status');
    var lyricsEl = root.querySelector('.tb-mp-lyrics');
    var dlAudioBtn = root.querySelector('.tb-mp-dl-audio');
    var dlLyricsBtn = root.querySelector('.tb-mp-dl-lyrics');
    var actionsEl = root.querySelector('.tb-mp-actions');
    var buffering = false;

    titleEl.textContent = opts.title || trFirst(['common.musicPlayer.untitled', 'hub.musicPage.untitled'], 'Untitled');
    playBtn.textContent = trFirst(['common.musicPlayer.play', 'hub.musicPage.play'], 'Play');
    dlAudioBtn.textContent = trFirst(['tools.aiMusic.download', 'hub.musicPage.download'], 'Download');
    dlLyricsBtn.textContent = trFirst(['common.musicPlayer.downloadLyrics', 'tools.aiMusic.downloadLyrics', 'hub.musicPage.downloadLyrics'], 'Download lyrics');
    if (opts.hideTitle) titleEl.style.display = 'none';
    if (opts.hideDownloadActions && actionsEl) actionsEl.style.display = 'none';

    function labelPlay() {
      return trFirst(['common.musicPlayer.play', 'hub.musicPage.play'], 'Play');
    }
    function labelPause() {
      return trFirst(['common.musicPlayer.pause', 'hub.musicPage.pause'], 'Pause');
    }
    function labelBuffering() {
      return trFirst(['common.musicPlayer.buffering', 'hub.musicPage.buffering'], 'Buffering…');
    }
    function setBuffering(on) {
      on = !!on;
      var changed = buffering !== on;
      buffering = on;
      if (statusEl) {
        if (buffering) {
          statusEl.hidden = false;
          statusEl.textContent = labelBuffering();
        } else {
          statusEl.hidden = true;
          statusEl.textContent = '';
        }
      }
      if (buffering) {
        playBtn.textContent = labelBuffering();
        playBtn.setAttribute('data-loading', '1');
      } else {
        playBtn.removeAttribute('data-loading');
        playBtn.textContent = audio.paused ? labelPlay() : labelPause();
      }
      if (changed && typeof opts.onBuffering === 'function') opts.onBuffering(buffering);
    }

    if (hintEl) {
      if (lyricsMode === 'lrc') {
        hintEl.textContent = trFirst(['common.musicPlayer.lrcHint'], '');
        hintEl.hidden = !hintEl.textContent;
      } else if (lyricsMode === 'static') {
        hintEl.textContent = trFirst(['common.musicPlayer.staticHint'], '');
        hintEl.hidden = !hintEl.textContent;
      } else {
        hintEl.hidden = true;
      }
    }

    if (lyricsMode === 'lrc') {
      renderLyricsBox(lyricsEl, 'lrc', lrcLines);
    } else if (lyricsMode === 'static') {
      renderLyricsBox(lyricsEl, 'static', staticLyricsPlain(opts.lyrics));
    } else {
      renderLyricsBox(lyricsEl, 'empty', '');
      if (dlLyricsBtn && dlLyricsBtn.parentNode) dlLyricsBtn.remove();
    }

    audio.preload = opts.preload || 'metadata';
    audio.src = opts.src || '';
    var seeking = false;
    var lastActive = -1;

    function duration() {
      var d = audio.duration;
      if (d && isFinite(d) && d > 0) return d;
      return durationHint > 0 ? durationHint : 0;
    }

    function syncLyrics(t) {
      if (lyricsMode !== 'lrc') return;
      var idx = lrcActiveIndex(lrcLines, t);
      if (idx === lastActive) return;
      lastActive = idx;
      var nodes = lyricsEl.querySelectorAll('.tb-mp-line');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('is-active', i === idx);
      }
      var active = lyricsEl.querySelector('.tb-mp-line.is-active');
      if (active && typeof active.scrollIntoView === 'function') {
        try {
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (e) {
          active.scrollIntoView(false);
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

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        setBuffering(true);
        audio.play().then(function () {
          setBuffering(false);
          playBtn.textContent = labelPause();
        }).catch(function () {
          setBuffering(false);
          playBtn.textContent = labelPlay();
        });
      } else {
        audio.pause();
        setBuffering(false);
        playBtn.textContent = labelPlay();
      }
    });

    audio.addEventListener('play', function () {
      if (!buffering) playBtn.textContent = labelPause();
      if (typeof opts.onPlayState === 'function') opts.onPlayState(true);
    });
    audio.addEventListener('pause', function () {
      if (!buffering) playBtn.textContent = labelPlay();
      if (typeof opts.onPlayState === 'function') opts.onPlayState(false);
    });
    audio.addEventListener('ended', function () {
      setBuffering(false);
      playBtn.textContent = labelPlay();
      lastActive = -1;
      syncLyrics(duration());
      if (typeof opts.onPlayState === 'function') opts.onPlayState(false);
    });
    audio.addEventListener('error', function () {
      setBuffering(false);
      playBtn.textContent = labelPlay();
      if (typeof opts.onError === 'function') opts.onError();
    });
    audio.addEventListener('waiting', function () {
      setBuffering(true);
    });
    audio.addEventListener('stalled', function () {
      setBuffering(true);
    });
    audio.addEventListener('canplay', function () {
      if (!audio.paused) setBuffering(false);
    });
    audio.addEventListener('playing', function () {
      setBuffering(false);
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
      var body = staticLyricsPlain(opts.lyrics) || String(opts.lyrics || '').trim();
      if (!body) return;
      var blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
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

    function applyLyrics(nextLyrics) {
      opts.lyrics = nextLyrics;
      timedLrc = parseTimedLrc(nextLyrics);
      lyricsMode = timedLrc ? 'lrc' : (staticLyricsPlain(nextLyrics) ? 'static' : 'empty');
      lrcLines = timedLrc || [];
      lastActive = -1;
      if (hintEl) {
        if (lyricsMode === 'lrc') {
          hintEl.textContent = trFirst(['common.musicPlayer.lrcHint'], '');
          hintEl.hidden = !hintEl.textContent;
        } else if (lyricsMode === 'static') {
          hintEl.textContent = trFirst(['common.musicPlayer.staticHint'], '');
          hintEl.hidden = !hintEl.textContent;
        } else {
          hintEl.hidden = true;
        }
      }
      if (lyricsMode === 'lrc') {
        renderLyricsBox(lyricsEl, 'lrc', lrcLines);
        dlLyricsBtn.hidden = false;
      } else if (lyricsMode === 'static') {
        renderLyricsBox(lyricsEl, 'static', staticLyricsPlain(nextLyrics));
        dlLyricsBtn.hidden = false;
      } else {
        renderLyricsBox(lyricsEl, 'empty', '');
        dlLyricsBtn.hidden = true;
      }
    }

    return {
      audio: audio,
      play: function () { return audio.play(); },
      playWhenReady: function () {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var timer = null;
          function cleanup() {
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('loadeddata', onReady);
            audio.removeEventListener('error', onErr);
            if (timer) clearTimeout(timer);
          }
          function finish(promise) {
            if (settled) return;
            settled = true;
            cleanup();
            promise.then(resolve).catch(reject);
          }
          function onReady() {
            finish(audio.play());
          }
          function onErr() {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('audio load failed'));
          }
          setBuffering(true);
          audio.addEventListener('canplay', onReady, { once: true });
          audio.addEventListener('loadeddata', onReady, { once: true });
          audio.addEventListener('error', onErr, { once: true });
          timer = setTimeout(function () {
            finish(audio.play());
          }, 12000);
          if (audio.readyState >= 2) {
            finish(audio.play());
            return;
          }
          try { audio.load(); } catch (e) {}
          if (audio.readyState >= 2) finish(audio.play());
        }).then(function (v) {
          setBuffering(false);
          return v;
        }).catch(function (err) {
          setBuffering(false);
          throw err;
        });
      },
      pause: function () { audio.pause(); },
      setBuffering: setBuffering,
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
        if (next.lyrics != null) applyLyrics(next.lyrics);
        if (next.durationHint != null) durationHint = Number(next.durationHint) || 0;
        tick();
      }
    };
  }

  global.TBMusicPlayer = {
    mount: mount,
    parseLines: parseLines,
    dedupeLyricSections: dedupeLyricSections,
    sungTextLines: sungTextLines,
    staticLyricsPlain: staticLyricsPlain,
    buildApproxLrc: buildApproxLrc
  };
})(typeof window !== 'undefined' ? window : this);
