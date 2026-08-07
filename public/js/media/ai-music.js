(function () {
  'use strict';
  var C = window.TBImageCloud;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var balanceLine = document.getElementById('balance-line');
  var costNote = document.getElementById('cost-note');
  var estimateLine = document.getElementById('estimate-line');
  var modeRow = document.getElementById('mode-row');
  var promptWrap = document.getElementById('prompt-wrap');
  var lyricsWrap = document.getElementById('lyrics-wrap');
  var genderWrap = document.getElementById('gender-wrap');
  var promptEl = document.getElementById('prompt');
  var lyricsEl = document.getElementById('lyrics');
  var styleRow = document.getElementById('style-row');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var downloadBtn = document.getElementById('download-btn');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var errorBox = document.getElementById('error-box');
  var resultWrap = document.getElementById('result-wrap');
  var resultAudio = document.getElementById('result-audio');
  var resultLyrics = document.getElementById('result-lyrics');
  var resultMeta = document.getElementById('result-meta');
  var wechatTip = document.getElementById('wechat-file-download-tip');

  var mode = 'prompt';
  var priceMarkup = 2;
  var listRate = 0.002;
  var estSeconds = 120;
  var audioBlobUrl = '';
  var audioBlob = null;
  var lastExt = '.mp3';

  var STYLE_SNIPPETS = {
    folk: '清新民谣，木吉他与轻人声，节奏舒缓，适合旅行与午后',
    pop: '流行歌曲，副歌抓耳，现代编曲，情绪递进',
    lofi: 'Lo-fi 轻松节奏，柔和采样与轻微颗粒感，适合学习放松',
    edm: '电子舞曲，强鼓点与合成器，充满能量',
    cinematic: '电影感配乐，弦乐铺底，气势与情绪层次丰富'
  };

  function tr(key, params) {
    return C.tr(key, params);
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
  }

  function applyWallet(wallet) {
    if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
    if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
    updateEstimate();
  }

  function updateEstimate() {
    var userRate = Math.round(listRate * priceMarkup * 10000) / 10000;
    var est = Math.round(listRate * estSeconds * priceMarkup * 100) / 100;
    if (costNote) {
      costNote.textContent = tr('tools.aiMusic.costNote', {
        rate: userRate,
        est: est,
        seconds: estSeconds
      });
    }
    if (estimateLine) {
      estimateLine.textContent = tr('tools.aiMusic.estimateLine', {
        price: est,
        seconds: estSeconds
      });
    }
  }

  function syncModeUi() {
    if (modeRow) {
      var chips = modeRow.querySelectorAll('.rec-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-mode') || '') === mode);
      }
    }
    if (promptWrap) promptWrap.hidden = mode === 'lyrics';
    if (lyricsWrap) lyricsWrap.hidden = mode !== 'lyrics';
    if (genderWrap) genderWrap.hidden = mode === 'instrumental';
    setBusy(false);
  }

  function canRun() {
    if (mode === 'lyrics') return !!(lyricsEl && (lyricsEl.value || '').trim());
    return !!(promptEl && (promptEl.value || '').trim());
  }

  function selectedGender() {
    var el = document.querySelector('input[name="music-gender"]:checked');
    return (el && el.value) || 'female';
  }

  function revokeAudio() {
    if (audioBlobUrl) {
      try { URL.revokeObjectURL(audioBlobUrl); } catch (e) {}
    }
    audioBlobUrl = '';
    audioBlob = null;
    if (resultAudio) {
      resultAudio.removeAttribute('src');
      try { resultAudio.load(); } catch (e2) {}
    }
  }

  function clearResult() {
    revokeAudio();
    if (resultWrap) resultWrap.hidden = true;
    if (resultLyrics) {
      resultLyrics.textContent = '';
      resultLyrics.hidden = true;
    }
    if (resultMeta) resultMeta.textContent = '';
  }

  function showWeChatTip() {
    if (!wechatTip) return;
    if (typeof C.isWeChat === 'function' && C.isWeChat()) {
      wechatTip.hidden = false;
    } else {
      wechatTip.hidden = true;
    }
  }

  function loadStatus() {
    return C.apiJson('/music/status').then(function (s) {
      applyWallet(s.wallet || s.aiWallet);
      if (s.pricing) {
        if (s.pricing.listRatePerSecCny != null) listRate = Number(s.pricing.listRatePerSecCny) || listRate;
        if (s.pricing.estSeconds != null) estSeconds = Number(s.pricing.estSeconds) || estSeconds;
        if (s.pricing.markup != null) priceMarkup = Number(s.pricing.markup) || priceMarkup;
      }
      updateEstimate();
      if (s.configured === false) {
        C.setError(errorBox, tr('tools.aiMusic.notConfigured'));
      }
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  function runGenerate() {
    C.setError(errorBox, '');
    if (!canRun()) {
      C.setError(errorBox, tr(mode === 'lyrics' ? 'tools.aiMusic.needLyrics' : 'tools.aiMusic.needPrompt'));
      return;
    }
    var fd = new FormData();
    if (mode === 'lyrics') {
      fd.append('lyrics', (lyricsEl.value || '').trim());
      fd.append('instrumental', '0');
    } else if (mode === 'instrumental') {
      fd.append('prompt', (promptEl.value || '').trim());
      fd.append('instrumental', '1');
    } else {
      fd.append('prompt', (promptEl.value || '').trim());
      fd.append('instrumental', '0');
    }
    fd.append('gender', selectedGender());
    fd.append('format', 'mp3');

    clearResult();
    setBusy(true);
    if (busyText) busyText.textContent = tr('tools.aiMusic.generating');

    C.apiJson('/music/generate', { method: 'POST', body: fd, timeoutMs: 400000 })
      .then(function (res) {
        applyWallet(res.wallet || res.aiWallet);
        var proxy = res.proxyUrl || '';
        if (!proxy) throw new Error(tr('tools.aiMusic.failed'));
        lastExt = (String(res.contentType || '').indexOf('wav') >= 0) ? '.wav' : '.mp3';
        return C.apiBlob(proxy).then(function (pack) {
          revokeAudio();
          audioBlob = pack.blob;
          audioBlobUrl = URL.createObjectURL(pack.blob);
          if (resultAudio) {
            resultAudio.src = audioBlobUrl;
          }
          if (resultLyrics) {
            var ly = (res.lyrics || '').trim();
            resultLyrics.textContent = ly;
            resultLyrics.hidden = !ly;
          }
          if (resultMeta) {
            resultMeta.textContent = tr('tools.aiMusic.resultMeta', {
              duration: res.duration || '—',
              price: res.chargedCny != null ? res.chargedCny : (res.userPriceCny || '—')
            });
          }
          if (resultWrap) resultWrap.hidden = false;
        });
      })
      .catch(function (err) {
        C.setError(errorBox, (err && err.message) || tr('tools.aiMusic.failed'));
      })
      .then(function () {
        setBusy(false);
      });
  }

  function doDownload() {
    if (!audioBlobUrl) return;
    if (typeof tbTriggerDownload === 'function') {
      tbTriggerDownload(audioBlobUrl, 'fun-music' + lastExt);
      return;
    }
    var a = document.createElement('a');
    a.href = audioBlobUrl;
    a.download = 'fun-music' + lastExt;
    a.click();
  }

  function boot() {
    if (!C.getToken()) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      if (loginLink) loginLink.href = C.loginUrl();
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    showWeChatTip();
    syncModeUi();
    updateEstimate();
    setBusy(false);
    loadStatus();
  }

  if (modeRow) {
    modeRow.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mode]');
      if (!btn) return;
      mode = btn.getAttribute('data-mode') || 'prompt';
      syncModeUi();
    });
  }
  if (styleRow) {
    styleRow.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-style]');
      if (!btn || !promptEl) return;
      var key = btn.getAttribute('data-style') || '';
      var snip = STYLE_SNIPPETS[key];
      if (!snip) return;
      var cur = (promptEl.value || '').trim();
      promptEl.value = cur ? (cur + '，' + snip) : snip;
      setBusy(false);
    });
  }
  if (promptEl) promptEl.addEventListener('input', function () { setBusy(false); });
  if (lyricsEl) lyricsEl.addEventListener('input', function () { setBusy(false); });
  if (runBtn) runBtn.addEventListener('click', runGenerate);
  if (downloadBtn) downloadBtn.addEventListener('click', doDownload);
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (promptEl) promptEl.value = '';
      if (lyricsEl) lyricsEl.value = '';
      clearResult();
      C.setError(errorBox, '');
      setBusy(false);
    });
  }

  document.addEventListener('tb:locale', function () {
    showWeChatTip();
    updateEstimate();
    syncModeUi();
  });

  boot();
})();
