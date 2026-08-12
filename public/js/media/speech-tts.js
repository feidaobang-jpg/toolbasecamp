(function () {
  'use strict';
  var C = window.TBImageCloud;
  if (!C) return;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var loginLink = document.getElementById('login-link');
  var balanceLine = document.getElementById('balance-line');
  var costNote = document.getElementById('cost-note');
  var providerRow = document.getElementById('provider-row');
  var modelRow = document.getElementById('model-row');
  var voiceList = document.getElementById('voice-list');
  var voiceSelected = document.getElementById('voice-selected');
  var voiceFilter = document.getElementById('voice-filter');
  var textEl = document.getElementById('text');
  var charCount = document.getElementById('char-count');
  var charMax = document.getElementById('char-max');
  var speedRow = document.getElementById('speed-row');
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

  var providerId = 'qwen';
  var modelId = 'qwen3-tts-flash';
  var voiceId = '';
  var maxChars = 600;
  var pricing = null;
  var providersMeta = [];
  var systemByProvider = { qwen: [], minimax: [] };
  var clonedVoices = [];
  var processing = false;
  var audioUrl = '';
  var audioBlob = null;

  var MODEL_LABELS = {
    'qwen3-tts-flash': 'Qwen Flash',
    'qwen3-tts-vc-2026-01-22': 'Qwen VC',
    'speech-2.8-turbo': 'MiniMax Turbo',
    'speech-2.8-hd': 'MiniMax HD'
  };

  if (loginLink) loginLink.href = C.loginUrl();
  if (wechatTip && typeof tbIsWeChat === 'function' && tbIsWeChat()) {
    wechatTip.hidden = false;
  }

  function tr(key, params) {
    return C.tr(key, params);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function modelInfo(mid) {
    if (!pricing || !pricing.models) return null;
    for (var i = 0; i < pricing.models.length; i++) {
      if (pricing.models[i].id === mid) return pricing.models[i];
    }
    return null;
  }

  function userPer10k(mid) {
    var m = modelInfo(mid);
    if (m) return Number(m.userPer10kCny) || 0;
    return providerId === 'qwen' ? 1.6 : 4;
  }

  function cloneFeeUser() {
    var cf = pricing && pricing.cloneFee && pricing.cloneFee[providerId];
    return cf && cf.userCny != null ? Number(cf.userCny) : 0;
  }

  function cloneFeeWhen() {
    var cf = pricing && pricing.cloneFee && pricing.cloneFee[providerId];
    return (cf && cf.when) || (providerId === 'qwen' ? 'create' : 'first_synth');
  }

  function systemVoices() {
    return systemByProvider[providerId] || [];
  }

  function clonesForProvider() {
    return (clonedVoices || []).filter(function (c) {
      return (c.provider || 'minimax') === providerId;
    });
  }

  function selectedClone() {
    var list = clonesForProvider();
    for (var i = 0; i < list.length; i++) {
      if (list[i].voice_id === voiceId) return list[i];
    }
    return null;
  }

  function providerModels() {
    for (var i = 0; i < providersMeta.length; i++) {
      if (providersMeta[i].id === providerId) return providersMeta[i].models || [];
    }
    return providerId === 'qwen' ? ['qwen3-tts-flash'] : ['speech-2.8-turbo', 'speech-2.8-hd'];
  }

  function syncMaxChars() {
    var m = modelInfo(modelId);
    maxChars = (m && m.maxChars) || (providerId === 'qwen' ? 600 : 5000);
    if (charMax) charMax.textContent = String(maxChars);
  }

  function estimateUser() {
    var text = (textEl.value || '').replace(/\s+/g, '');
    var chars = Math.max(text.length, textEl.value.trim() ? 1 : 0);
    var rate = userPer10k(modelId);
    var synth = chars > 0 ? (chars / 10000) * rate : 0;
    var fee = 0;
    var cl = selectedClone();
    if (cl && !cl.cloneFeeCharged && cloneFeeWhen() === 'first_synth') {
      fee = cloneFeeUser();
    }
    return { chars: chars, total: synth + fee, fee: fee };
  }

  function updateCostNote() {
    if (!costNote) return;
    var est = estimateUser();
    costNote.textContent = tr('tools.speechTts.costNote', {
      provider: providerId === 'qwen' ? 'Qwen' : 'MiniMax',
      model: MODEL_LABELS[modelId] || modelId,
      rate: userPer10k(modelId).toFixed(2),
      estimate: est.total.toFixed(3),
      cloneFee: cloneFeeUser().toFixed(2),
      max: maxChars
    });
    if (charCount) charCount.textContent = String((textEl.value || '').length);
    if (speedRow) speedRow.hidden = providerId === 'qwen';
  }

  function syncProviderChips() {
    if (!providerRow) return;
    var chips = providerRow.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle(
        'is-active',
        (chips[i].getAttribute('data-provider') || '') === providerId
      );
    }
  }

  function renderModels() {
    if (!modelRow) return;
    var models = providerModels();
    if (models.indexOf(modelId) < 0) modelId = models[0];
    modelRow.innerHTML = '';
    for (var i = 0; i < models.length; i++) {
      var mid = models[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-chip' + (mid === modelId ? ' is-active' : '');
      btn.setAttribute('data-model', mid);
      var info = modelInfo(mid);
      var price = info ? Number(info.userPer10kCny).toFixed(2) : '';
      btn.textContent = (MODEL_LABELS[mid] || mid) + (price ? ' · ¥' + price + '/万字' : '');
      modelRow.appendChild(btn);
    }
    syncMaxChars();
  }

  function voiceLabelOf(vid) {
    var i;
    var clones = clonesForProvider();
    for (i = 0; i < clones.length; i++) {
      if (clones[i].voice_id === vid) {
        return (clones[i].label || vid) + (clones[i].cloneFeeCharged ? '' : ' *');
      }
    }
    var sys = systemVoices();
    for (i = 0; i < sys.length; i++) {
      if (sys[i].voice_id === vid) return sys[i].voice_name || vid;
    }
    return vid || '—';
  }

  function updateSelectedVoiceLine() {
    if (!voiceSelected) return;
    voiceSelected.innerHTML =
      tr('tools.speechTts.voiceSelectedPrefix') +
      ' <strong>' +
      escapeHtml(voiceLabelOf(voiceId)) +
      '</strong>';
  }

  function syncVoiceActiveOnly() {
    if (!voiceList) return;
    var chips = voiceList.querySelectorAll('.rec-chip');
    for (var i = 0; i < chips.length; i++) {
      var on = (chips[i].getAttribute('data-voice') || '') === voiceId;
      chips[i].classList.toggle('is-active', on);
      chips[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    updateSelectedVoiceLine();
  }

  function filterQuery() {
    return ((voiceFilter && voiceFilter.value) || '').trim().toLowerCase();
  }

  function voiceMatches(label, vid, q) {
    if (!q) return true;
    return String(label || '').toLowerCase().indexOf(q) !== -1
      || String(vid || '').toLowerCase().indexOf(q) !== -1;
  }

  function renderVoices() {
    if (!voiceList) return;
    var q = filterQuery();
    var scrollTop = voiceList.scrollTop;
    voiceList.innerHTML = '';
    var shown = 0;
    var clones = clonesForProvider();
    var sys = systemVoices();

    function addChip(vid, label, extraClass) {
      if (!voiceMatches(label, vid, q)) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-chip' + (vid === voiceId ? ' is-active' : '') + (extraClass ? ' ' + extraClass : '');
      btn.setAttribute('data-voice', vid);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', vid === voiceId ? 'true' : 'false');
      btn.title = vid;
      btn.textContent = label;
      voiceList.appendChild(btn);
      shown += 1;
    }

    for (var c = 0; c < clones.length; c++) {
      var cv = clones[c];
      addChip(cv.voice_id, (cv.label || cv.voice_id) + (cv.cloneFeeCharged ? '' : ' *'), 'is-clone');
    }
    for (var s = 0; s < sys.length; s++) {
      addChip(sys[s].voice_id, sys[s].voice_name || sys[s].voice_id);
    }

    if (!shown) {
      var empty = document.createElement('div');
      empty.className = 'tts-voice-empty';
      empty.textContent = tr('tools.speechTts.voiceFilterEmpty');
      voiceList.appendChild(empty);
    }

    var stillValid = false;
    if (voiceId) {
      for (var i = 0; i < clones.length; i++) if (clones[i].voice_id === voiceId) stillValid = true;
      for (var j = 0; j < sys.length; j++) if (sys[j].voice_id === voiceId) stillValid = true;
    }
    if (!stillValid) {
      voiceId = (clones[0] && clones[0].voice_id) || (sys[0] && sys[0].voice_id) || '';
    }
    updateSelectedVoiceLine();
    voiceList.scrollTop = scrollTop;
  }

  function applyProvider(pid, keepVoice) {
    providerId = pid || 'qwen';
    var models = providerModels();
    if (models.indexOf(modelId) < 0) modelId = models[0];
    syncProviderChips();
    renderModels();
    if (!keepVoice) voiceId = '';
    renderVoices();
    updateCostNote();
  }

  function loadStatus() {
    return C.apiJson('/tts/status').then(function (s) {
      pricing = s.pricing || null;
      providersMeta = s.providers || [];
      systemByProvider = s.systemVoicesByProvider || { qwen: [], minimax: [] };
      clonedVoices = s.clonedVoices || [];
      if (s.defaultProvider) providerId = s.defaultProvider;
      if (s.defaultModel) modelId = s.defaultModel;
      if (s.qwenConfigured === false && s.minimaxConfigured) providerId = 'minimax';
      if (s.minimaxConfigured === false && s.qwenConfigured) providerId = 'qwen';
      applyProvider(providerId, true);
      if (s.defaultVoiceId && !voiceId) voiceId = s.defaultVoiceId;
      renderVoices();
      updateBalance(s.aiWallet);
      updateCostNote();
    }).catch(function (err) {
      C.setError(errorBox, err.message);
    });
  }

  if (providerRow) {
    providerRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn) return;
      applyProvider(btn.getAttribute('data-provider') || 'qwen', false);
    });
  }

  if (modelRow) {
    modelRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn) return;
      modelId = btn.getAttribute('data-model') || modelId;
      renderModels();
      updateCostNote();
    });
  }

  if (voiceList) {
    voiceList.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
      if (!btn || btn.disabled) return;
      voiceId = btn.getAttribute('data-voice') || voiceId;
      var cl = selectedClone();
      if (cl && cl.synthModel && providerId === 'qwen') {
        // cloned qwen voices use VC model server-side; keep UI on flash label
      }
      syncVoiceActiveOnly();
      updateCostNote();
    });
  }

  if (voiceFilter) {
    voiceFilter.addEventListener('input', function () { renderVoices(); });
  }
  if (textEl) textEl.addEventListener('input', updateCostNote);
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
    fd.append('provider', providerId);
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
    fd.append('provider', providerId);
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
            fee: (data.cloneFeePendingUserCny != null ? Number(data.cloneFeePendingUserCny) : 0).toFixed(2)
          })
        );
      }
      if (typeof tbNotify === 'function') {
        if (data.cloneFeeCharged) {
          tbNotify(tr('tools.speechTts.cloneOkQwen', {
            price: (data.chargedCny != null ? Number(data.chargedCny) : 0).toFixed(3)
          }));
        } else {
          tbNotify(tr('tools.speechTts.cloneOkNotify', {
            fee: (data.cloneFeePendingUserCny != null ? Number(data.cloneFeePendingUserCny) : cloneFeeUser()).toFixed(2)
          }));
        }
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
    var name = 'speech-tts.' + ((audioBlob && audioBlob.type && audioBlob.type.indexOf('wav') >= 0) ? 'wav' : 'mp3');
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
    updateSelectedVoiceLine();
    renderVoices();
    renderModels();
  });

  C.requireLogin(gate, app).then(function (user) {
    if (!user) return;
    loadStatus();
  });
})();
