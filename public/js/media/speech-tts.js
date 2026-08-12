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
  var voiceList = document.getElementById('voice-list');
  var textEl = document.getElementById('text');
  var charCount = document.getElementById('char-count');
  var charMax = document.getElementById('char-max');
  var speedEl = document.getElementById('speed');
  var speedVal = document.getElementById('speed-val');
  var runBtn = document.getElementById('run-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var cloneBtn = document.getElementById('clone-btn');
  var cloneFile = document.getElementById('clone-file');
  var cloneLabel = document.getElementById('clone-label');
  var busyEl = document.getElementById('busy');
  var busyText = document.getElementById('busy-text');
  var errorBox = document.getElementById('error-box');
  var resultWrap = document.getElementById('result-wrap');
  var resultAudio = document.getElementById('result-audio');
  var resultMeta = document.getElementById('result-meta');
  var wechatTip = document.getElementById('wechat-file-download-tip');

  var modelId = 'speech-2.8-turbo';
  var voiceId = '';
  var maxChars = 5000;
  var pricing = null;
  var systemVoices = [];
  var clonedVoices = [];
  var processing = false;
  var audioUrl = '';
  var audioBlob = null;

  if (loginLink) loginLink.href = C.loginUrl();
  if (wechatTip && typeof tbIsWeChat === 'function' && tbIsWeChat()) {
    wechatTip.hidden = false;
  }

  function tr(key, params) {
    return C.tr(key, params);
  }

  function setBusy(on, msg) {
    processing = !!on;
    C.setBusy(busyEl, busyText, processing, msg || tr('tools.speechTts.generating'));
    runBtn.disabled = processing;
    cloneBtn.disabled = processing;
    clearBtn.disabled = processing;
  }

  function revokeAudio() {
    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl); } catch (e) { /* ignore */ }
      audioUrl = '';
    }
    audioBlob = null;
    if (resultAudio) {
      resultAudio.removeAttribute('src');
      resultAudio.load();
    }
    if (resultWrap) resultWrap.hidden = true;
    if (downloadBtn) downloadBtn.disabled = true;
  }

  function b64ToBlob(b64, ctype) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: ctype || 'audio/mpeg' });
  }

  function showAudio(b64, ctype, metaText) {
    revokeAudio();
    if (!b64) return;
    audioBlob = b64ToBlob(b64, ctype || 'audio/mpeg');
    audioUrl = URL.createObjectURL(audioBlob);
    resultAudio.src = audioUrl;
    resultWrap.hidden = false;
    downloadBtn.disabled = false;
    if (resultMeta) resultMeta.textContent = metaText || '';
  }

  function updateBalance(wallet) {
    if (!balanceLine) return;
    balanceLine.textContent = C.formatWallet(wallet);
  }

  function userPer10k(mid) {
    if (!pricing || !pricing.models) return mid === 'speech-2.8-hd' ? 7 : 4;
    for (var i = 0; i < pricing.models.length; i++) {
      if (pricing.models[i].id === mid) return Number(pricing.models[i].userPer10kCny) || 0;
    }
    return 0;
  }

  function cloneFeeUser() {
    return pricing && pricing.cloneFeeUserCny != null ? Number(pricing.cloneFeeUserCny) : 0;
  }

  function selectedClone() {
    for (var i = 0; i < clonedVoices.length; i++) {
      if (clonedVoices[i].voice_id === voiceId) return clonedVoices[i];
    }
    return null;
  }

  function estimateUser() {
    var text = (textEl.value || '').replace(/\s+/g, '');
    var chars = Math.max(text.length, textEl.value.trim() ? 1 : 0);
    var rate = userPer10k(modelId);
    var synth = chars > 0 ? (chars / 10000) * rate : 0;
    var fee = 0;
    var cl = selectedClone();
    if (cl && !cl.cloneFeeCharged) fee = cloneFeeUser();
    return { chars: chars, total: synth + fee, fee: fee };
  }

  function updateCostNote() {
    if (!costNote) return;
    var est = estimateUser();
    costNote.textContent = tr('tools.speechTts.costNote', {
      model: modelId,
      rate: userPer10k(modelId).toFixed(2),
      estimate: est.total.toFixed(3),
      cloneFee: cloneFeeUser().toFixed(2)
    });
    if (charCount) charCount.textContent = String((textEl.value || '').length);
  }

  function syncModelChips() {
    if (!modelRow) return;
    var chips = modelRow.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-model') || '') === modelId);
    }
  }

  function renderVoices() {
    if (!voiceList) return;
    voiceList.innerHTML = '';
    function addChip(vid, label, extraClass) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-chip' + (vid === voiceId ? ' is-active' : '') + (extraClass ? ' ' + extraClass : '');
      btn.setAttribute('data-voice', vid);
      btn.textContent = label;
      voiceList.appendChild(btn);
    }
    for (var c = 0; c < clonedVoices.length; c++) {
      var cv = clonedVoices[c];
      var lab = (cv.label || cv.voice_id) + (cv.cloneFeeCharged ? '' : ' *');
      addChip(cv.voice_id, lab, 'is-clone');
    }
    for (var s = 0; s < systemVoices.length; s++) {
      var sv = systemVoices[s];
      addChip(sv.voice_id, sv.voice_name || sv.voice_id);
    }
    if (!voiceId && systemVoices.length) {
      voiceId = systemVoices[0].voice_id;
      renderVoices();
      return;
    }
  }

  function loadStatus() {
    return C.apiJson('/tts/status').then(function (s) {
      pricing = s.pricing || null;
      maxChars = s.maxTextChars || 5000;
      if (charMax) charMax.textContent = String(maxChars);
      systemVoices = s.systemVoices || [];
      clonedVoices = s.clonedVoices || [];
      if (s.defaultVoiceId && !voiceId) voiceId = s.defaultVoiceId;
      if (s.defaultModel) modelId = s.defaultModel;
      syncModelChips();
      renderVoices();
      updateBalance(s.aiWallet);
      updateCostNote();
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  if (modelRow) {
    modelRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn) return;
      modelId = btn.getAttribute('data-model') || modelId;
      syncModelChips();
      updateCostNote();
    });
  }

  if (voiceList) {
    voiceList.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn) return;
      voiceId = btn.getAttribute('data-voice') || voiceId;
      renderVoices();
      updateCostNote();
    });
  }

  if (textEl) {
    textEl.addEventListener('input', updateCostNote);
  }
  if (speedEl) {
    speedEl.addEventListener('input', function () {
      if (speedVal) speedVal.textContent = Number(speedEl.value).toFixed(1);
    });
  }

  runBtn.addEventListener('click', function () {
    if (processing) return;
    var text = (textEl.value || '').trim();
    if (!text) {
      C.setError(errorBox, tr('tools.speechTts.needText'));
      return;
    }
    if (text.length > maxChars) {
      C.setError(errorBox, tr('tools.speechTts.tooLong', { max: maxChars }));
      return;
    }
    if (!voiceId) {
      C.setError(errorBox, tr('tools.speechTts.needVoice'));
      return;
    }
    C.setError(errorBox, '');
    setBusy(true);
    var fd = new FormData();
    fd.append('text', text);
    fd.append('model', modelId);
    fd.append('voice_id', voiceId);
    fd.append('speed', speedEl ? speedEl.value : '1');
    fd.append('language_boost', 'Chinese');
    C.apiJson('/tts/synthesize', { method: 'POST', body: fd }).then(function (data) {
      updateBalance(data.aiWallet);
      if (data.cloneFeeApplied) {
        for (var i = 0; i < clonedVoices.length; i++) {
          if (clonedVoices[i].voice_id === voiceId) clonedVoices[i].cloneFeeCharged = true;
        }
        renderVoices();
      }
      showAudio(
        data.audioBase64,
        data.contentType,
        tr('tools.speechTts.resultMeta', {
          model: data.model || modelId,
          chars: data.chars || 0,
          price: (data.chargedCny != null ? Number(data.chargedCny) : 0).toFixed(3)
        })
      );
      updateCostNote();
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    }).finally(function () {
      setBusy(false);
    });
  });

  cloneBtn.addEventListener('click', function () {
    if (processing) return;
    var f = cloneFile && cloneFile.files && cloneFile.files[0];
    if (!f) {
      C.setError(errorBox, tr('tools.speechTts.needCloneFile'));
      return;
    }
    C.setError(errorBox, '');
    setBusy(true, tr('tools.speechTts.cloning'));
    var fd = new FormData();
    fd.append('file', f, f.name || 'clone.mp3');
    fd.append('label', (cloneLabel && cloneLabel.value) || '');
    fd.append('model', modelId);
    C.apiJson('/tts/clone', { method: 'POST', body: fd }).then(function (data) {
      updateBalance(data.aiWallet);
      clonedVoices = data.clonedVoices || clonedVoices;
      if (data.voiceId) voiceId = data.voiceId;
      renderVoices();
      updateCostNote();
      if (data.audioBase64) {
        showAudio(
          data.audioBase64,
          data.contentType,
          tr('tools.speechTts.cloneOk', {
            price: (data.chargedCny != null ? Number(data.chargedCny) : 0).toFixed(3),
            fee: (data.cloneFeePendingUserCny != null ? Number(data.cloneFeePendingUserCny) : cloneFeeUser()).toFixed(2)
          })
        );
      }
      if (typeof tbNotify === 'function') {
        tbNotify(tr('tools.speechTts.cloneOkNotify', {
          fee: (data.cloneFeePendingUserCny != null ? Number(data.cloneFeePendingUserCny) : cloneFeeUser()).toFixed(2)
        }));
      }
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    }).finally(function () {
      setBusy(false);
      if (cloneFile) cloneFile.value = '';
    });
  });

  downloadBtn.addEventListener('click', function () {
    if (!audioBlob && !audioUrl) return;
    var name = 'speech-tts.mp3';
    if (typeof tbTriggerDownload === 'function') {
      tbTriggerDownload(audioBlob || audioUrl, name);
    } else {
      var a = document.createElement('a');
      a.href = audioUrl;
      a.download = name;
      a.click();
    }
  });

  clearBtn.addEventListener('click', function () {
    if (textEl) textEl.value = '';
    revokeAudio();
    C.setError(errorBox, '');
    updateCostNote();
  });

  document.addEventListener('tb:locale', function () {
    updateCostNote();
    updateBalance();
  });

  C.requireLogin(gate, app).then(function (user) {
    if (!user) return;
    loadStatus();
  });
})();
