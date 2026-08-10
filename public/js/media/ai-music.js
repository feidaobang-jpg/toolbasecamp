(function () {
  'use strict';
  var C = window.TBImageCloud;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var balanceLine = document.getElementById('balance-line');
  var costNote = document.getElementById('cost-note');
  var modelRow = document.getElementById('model-row');
  var promptEl = document.getElementById('prompt');
  var lyricsEl = document.getElementById('lyrics');
  var titleEl = document.getElementById('title');
  var styleRow = document.getElementById('style-row');
  var instrumentalToggle = document.getElementById('instrumental-toggle');
  var autoLyricsToggle = document.getElementById('auto-lyrics-toggle');
  var autoLyricsWrap = document.getElementById('auto-lyrics-wrap');
  var promptCount = document.getElementById('prompt-count');
  var lyricsCount = document.getElementById('lyrics-count');
  var runBtn = document.getElementById('run-btn');
  var clearBtn = document.getElementById('clear-btn');
  var downloadBtn = document.getElementById('download-btn');
  var shareBtn = document.getElementById('share-btn');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var errorBox = document.getElementById('error-box');
  var resultWrap = document.getElementById('result-wrap');
  var resultAudio = document.getElementById('result-audio');
  var resultLyrics = document.getElementById('result-lyrics');
  var resultMeta = document.getElementById('result-meta');
  var wechatTip = document.getElementById('wechat-file-download-tip');
  var longPressTip = document.getElementById('long-press-tip');

  var modelId = 'music-3.0-free';
  var modelPrices = {
    'music-3.0-free': 0,
    'music-3.0': 2
  };
  var audioBlobUrl = '';
  var audioBlob = null;
  var lastExt = '.mp3';
  var lastFilename = 'ai-music.mp3';

  var STYLE_SNIPPETS = {
    folk: '清新民谣, 木吉他, 轻人声, 舒缓',
    pop: '华语流行, 副歌抓耳, 现代编曲',
    lofi: 'Lo-fi, 轻松节奏, 柔和颗粒感',
    edm: '电子舞曲, 强鼓点, 合成器, 充满能量',
    cinematic: '电影感配乐, 弦乐铺底, 情绪层次'
  };

  function tr(key, params) {
    return C.tr(key, params);
  }

  function isWeChat() {
    if (typeof C.isWeChat === 'function') return C.isWeChat();
    if (typeof tbIsWeChat === 'function') return tbIsWeChat();
    return /MicroMessenger/i.test(navigator.userAgent || '');
  }

  function selectedPrice() {
    var p = modelPrices[modelId];
    return p == null ? 2 : Number(p);
  }

  function isInstrumental() {
    return !!(instrumentalToggle && instrumentalToggle.checked);
  }

  function isAutoLyrics() {
    return !!(autoLyricsToggle && autoLyricsToggle.checked) && !isInstrumental();
  }

  function setBusy(on) {
    if (busyEl) busyEl.hidden = !on;
    if (runBtn) runBtn.disabled = !!on || !canRun();
    if (clearBtn) clearBtn.disabled = !!on;
  }

  function applyWallet(wallet) {
    if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
    updateEstimate();
  }

  function updateEstimate() {
    var price = selectedPrice();
    if (costNote) {
      costNote.textContent = tr('tools.aiMusic.costNote', {
        model: modelId,
        price: price
      });
    }
    syncRunLabel();
  }

  function syncRunLabel() {
    if (!runBtn || (busyEl && !busyEl.hidden)) return;
    var price = selectedPrice();
    if (price <= 0) {
      runBtn.textContent = tr('tools.aiMusic.generateFree');
    } else {
      runBtn.textContent = tr('tools.aiMusic.generatePaid', { price: price });
    }
  }

  function syncModelUi() {
    if (modelRow) {
      var chips = modelRow.querySelectorAll('[data-model]');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-model') || '') === modelId);
      }
    }
    updateEstimate();
    setBusy(false);
  }

  function syncInstrumentalUi() {
    var inst = isInstrumental();
    if (lyricsEl) lyricsEl.disabled = inst;
    if (autoLyricsWrap) autoLyricsWrap.hidden = inst;
    if (inst && autoLyricsToggle) autoLyricsToggle.checked = false;
    updateCharCounts();
    setBusy(false);
  }

  function updateCharCounts() {
    if (promptCount) promptCount.textContent = String((promptEl && promptEl.value || '').length);
    if (lyricsCount) lyricsCount.textContent = String((lyricsEl && lyricsEl.value || '').length);
  }

  function canRun() {
    var prompt = (promptEl && promptEl.value || '').trim();
    var lyrics = (lyricsEl && lyricsEl.value || '').trim();
    if (isInstrumental()) return !!prompt;
    if (isAutoLyrics()) return !!prompt;
    return !!lyrics;
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
    var wx = isWeChat();
    if (wechatTip) wechatTip.hidden = !wx;
    if (longPressTip) longPressTip.hidden = !wx;
  }

  function loadStatus() {
    return C.apiJson('/music/status').then(function (s) {
      applyWallet(s.wallet || s.aiWallet);
      if (s.pricing && Array.isArray(s.pricing.models)) {
        s.pricing.models.forEach(function (m) {
          if (m && m.id) modelPrices[m.id] = Number(m.userPriceCny);
        });
        if (s.pricing.defaultModel && modelPrices[s.pricing.defaultModel] != null) {
          modelId = s.pricing.defaultModel;
        }
      }
      syncModelUi();
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
      if (isInstrumental() || isAutoLyrics()) {
        C.setError(errorBox, tr('tools.aiMusic.needPrompt'));
      } else {
        C.setError(errorBox, tr('tools.aiMusic.needLyrics'));
      }
      return;
    }
    var fd = new FormData();
    fd.append('model', modelId);
    fd.append('prompt', (promptEl && promptEl.value || '').trim());
    fd.append('title', (titleEl && titleEl.value || '').trim());
    fd.append('format', 'mp3');
    if (isInstrumental()) {
      fd.append('instrumental', '1');
      fd.append('lyrics', '');
      fd.append('lyrics_optimizer', '0');
    } else if (isAutoLyrics()) {
      fd.append('instrumental', '0');
      fd.append('lyrics', '');
      fd.append('lyrics_optimizer', '1');
    } else {
      fd.append('instrumental', '0');
      fd.append('lyrics', (lyricsEl && lyricsEl.value || '').trim());
      fd.append('lyrics_optimizer', '0');
    }

    clearResult();
    setBusy(true);
    if (busyText) busyText.textContent = tr('tools.aiMusic.generating');

    C.apiJson('/music/generate', { method: 'POST', body: fd, timeoutMs: 400000 })
      .then(function (res) {
        applyWallet(res.wallet || res.aiWallet);
        var proxy = res.proxyUrl || '';
        if (!proxy) throw new Error(tr('tools.aiMusic.failed'));
        lastExt = (String(res.contentType || '').indexOf('wav') >= 0) ? '.wav' : '.mp3';
        var safeTitle = String(res.title || '').replace(/[\\/:*?"<>|]+/g, '').trim();
        lastFilename = (safeTitle || 'ai-music') + lastExt;
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
              price: res.chargedCny != null ? res.chargedCny : (res.userPriceCny || 0),
              model: res.model || modelId
            });
          }
          showWeChatTip();
          if (resultWrap) resultWrap.hidden = false;
        });
      })
      .catch(function (err) {
        C.setError(errorBox, (err && err.message) || tr('tools.aiMusic.failed'));
      })
      .then(function () {
        setBusy(false);
        syncRunLabel();
      });
  }

  function doDownload() {
    if (!audioBlob && !audioBlobUrl) return;
    var src = audioBlob || audioBlobUrl;
    if (typeof tbTriggerDownload === 'function') {
      tbTriggerDownload(src, lastFilename);
      return;
    }
    var a = document.createElement('a');
    a.href = audioBlobUrl;
    a.download = lastFilename;
    a.click();
  }

  function doShare() {
    if (!audioBlob) return;
    if (isWeChat()) {
      if (typeof tbNotify === 'function') {
        tbNotify(tr('tools.aiMusic.wechatShareTip'));
      }
      return;
    }
    var file = null;
    try {
      file = new File([audioBlob], lastFilename, { type: audioBlob.type || 'audio/mpeg' });
    } catch (e) {
      file = null;
    }
    if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: lastFilename,
        text: tr('tools.aiMusic.shareText')
      }).catch(function () {});
      return;
    }
    if (navigator.share) {
      navigator.share({
        title: lastFilename,
        text: tr('tools.aiMusic.shareText')
      }).catch(function () {});
      return;
    }
    doDownload();
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
    syncInstrumentalUi();
    syncModelUi();
    updateCharCounts();
    setBusy(false);
    loadStatus();
  }

  if (modelRow) {
    modelRow.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-model]');
      if (!btn) return;
      modelId = btn.getAttribute('data-model') || 'music-3.0-free';
      syncModelUi();
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
      promptEl.value = cur ? (cur + ', ' + snip) : snip;
      updateCharCounts();
      setBusy(false);
    });
  }
  if (instrumentalToggle) {
    instrumentalToggle.addEventListener('change', syncInstrumentalUi);
  }
  if (autoLyricsToggle) {
    autoLyricsToggle.addEventListener('change', function () { setBusy(false); });
  }
  if (promptEl) {
    promptEl.addEventListener('input', function () {
      updateCharCounts();
      setBusy(false);
    });
  }
  if (lyricsEl) {
    lyricsEl.addEventListener('input', function () {
      updateCharCounts();
      setBusy(false);
    });
  }
  if (runBtn) runBtn.addEventListener('click', runGenerate);
  if (downloadBtn) downloadBtn.addEventListener('click', doDownload);
  if (shareBtn) shareBtn.addEventListener('click', doShare);
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (promptEl) promptEl.value = '';
      if (lyricsEl) lyricsEl.value = '';
      if (titleEl) titleEl.value = '';
      if (instrumentalToggle) instrumentalToggle.checked = false;
      if (autoLyricsToggle) autoLyricsToggle.checked = false;
      clearResult();
      C.setError(errorBox, '');
      syncInstrumentalUi();
      setBusy(false);
    });
  }

  document.addEventListener('tb:locale', function () {
    showWeChatTip();
    updateEstimate();
    syncModelUi();
    syncRunLabel();
  });

  boot();
})();
