document.addEventListener('DOMContentLoaded', function () {
  var textInput = document.getElementById('text-input');
  var engineSelect = document.getElementById('engine-select');
  var langSelect = document.getElementById('lang-select');
  var voiceSelect = document.getElementById('voice-select');
  var speedInput = document.getElementById('speed-input');
  var durationInput = document.getElementById('duration-input');
  var refDrop = document.getElementById('ref-drop');
  var refInput = document.getElementById('ref-input');
  var refName = document.getElementById('ref-name');
  var genBtn = document.getElementById('gen-btn');
  var clearBtn = document.getElementById('clear-btn');
  var downloadBtn = document.getElementById('download-btn');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var resultBox = document.getElementById('result-box');
  var resultAudio = document.getElementById('result-audio');
  var metaLine = document.getElementById('meta-line');
  var logOutput = document.getElementById('log-output');
  var engineLine = document.getElementById('engine-line');
  var historyList = document.getElementById('history-list');
  var copyLogBtn = document.getElementById('copy-log-btn');
  var openDirBtn = document.getElementById('open-dir-btn');

  var API_BASE_URL = window.HomePcApi.base();
  var refFile = null;
  var lastAudioUrl = '';
  var lastFolder = '';
  var pollTimer = null;
  var defaults = null;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function log(msg) {
    logOutput.textContent += msg + '\n';
  }

  function setBusy(busy, text) {
    progressWrap.style.display = busy ? 'block' : 'none';
    if (text) progressStatus.textContent = text;
    progressPercent.textContent = busy ? '…' : '';
    progressBar.style.width = busy ? '45%' : '0%';
    genBtn.disabled = busy;
  }

  function fillSelect(el, map, preferred) {
    el.innerHTML = '';
    Object.keys(map || {}).forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = map[k];
      el.appendChild(opt);
    });
    if (preferred && map[preferred]) el.value = preferred;
  }

  function assetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.indexOf('blob:') === 0) return path;
    return HomePcApi.assetUrl(path);
  }

  function setRefFile(file) {
    refFile = file || null;
    refName.textContent = refFile ? refFile.name + ' (' + Math.round(refFile.size / 1024) + ' KB)' : '';
  }

  function clearUi() {
    textInput.value = '';
    setRefFile(null);
    refInput.value = '';
    lastAudioUrl = '';
    lastFolder = '';
    resultAudio.removeAttribute('src');
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    metaLine.textContent = '';
    logOutput.textContent = '';
    setBusy(false);
  }

  function showResult(url, meta) {
    lastAudioUrl = assetUrl(url);
    resultAudio.src = lastAudioUrl;
    resultBox.style.display = 'block';
    downloadBtn.style.display = '';
    metaLine.textContent = meta || '';
  }

  async function loadDefaults() {
    var res = await fetch(API_BASE_URL + '/tts/defaults');
    var data = await res.json();
    defaults = data;
    fillSelect(engineSelect, data.engines, data.default_engine || 'auto');
    fillSelect(langSelect, data.langs, 'AUTO');
    fillSelect(voiceSelect, data.voices_edge, 'zh-CN-XiaoxiaoNeural');
    if (data.hint) {
      var hint = document.getElementById('tts-hint');
      if (hint) hint.textContent = data.hint;
    }
    var st = data.indextts || {};
    engineLine.textContent =
      tr('privateHub.homePc.ttsEngineStatus', '语音引擎') +
      '：' +
      (st.ready
        ? tr('privateHub.homePc.ttsLocalReady', 'IndexTTS 已就绪')
        : tr('privateHub.homePc.ttsLocalNotReady', 'IndexTTS 未就绪')) +
      ' · ' +
      (st.engine || '');
  }

  async function loadHistory() {
    historyList.innerHTML = '';
    try {
      var res = await fetch(API_BASE_URL + '/tts/history?limit=20');
      var data = await res.json();
      (data.items || []).forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'home-pc-history-item';
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #e5e7eb';
        var info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML =
          '<div style="font-size:13px;color:#374151">' +
          (it.created_at || '') +
          ' · ' +
          (it.engine_used || '') +
          '</div><div style="font-size:14px">' +
          (it.text || '').replace(/</g, '&lt;') +
          '</div>';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'tb-btn';
        openBtn.textContent = tr('privateHub.homePc.ttsHistoryOpen', '打开');
        openBtn.addEventListener('click', function () {
          textInput.value = it.text || '';
          if (it.engine && engineSelect.querySelector('option[value="' + it.engine + '"]')) {
            engineSelect.value = it.engine;
          } else if (it.engine_used === 'edge-tts' && engineSelect.querySelector('option[value="edge"]')) {
            engineSelect.value = 'edge';
          } else if (String(it.engine_used || '').indexOf('indextts') === 0 && engineSelect.querySelector('option[value="indextts"]')) {
            engineSelect.value = 'indextts';
          }
          if (it.lang && langSelect.querySelector('option[value="' + it.lang + '"]')) {
            langSelect.value = it.lang;
          }
          if (it.voice && voiceSelect.querySelector('option[value="' + it.voice + '"]')) {
            voiceSelect.value = it.voice;
          }
          if (it.speed != null && speedInput) speedInput.value = String(it.speed);
          if (it.duration_factor != null && durationInput) durationInput.value = String(it.duration_factor);
          lastFolder = it.folder || '';
          if (it.audio_url) {
            showResult(
              it.audio_url,
              (it.engine_used || '') + (it.duration_sec ? ' · ' + it.duration_sec + 's' : '')
            );
          }
        });
        row.appendChild(info);
        row.appendChild(openBtn);
        historyList.appendChild(row);
      });
    } catch (e) {
      log('history: ' + e);
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollOnce(taskId) {
    var res = await fetch(API_BASE_URL + '/tts/task/' + taskId);
    var data = await res.json();
    if (Array.isArray(data.logs)) {
      logOutput.textContent = data.logs.join('\n') + '\n';
    }
    lastFolder = data.output_dir || lastFolder;
    if (data.status === 'done') {
      stopPoll();
      setBusy(false);
      if (data.audio_url) {
        showResult(
          data.audio_url,
          (data.engine_used || '') +
            (data.duration_sec ? ' · ' + Number(data.duration_sec).toFixed(1) + 's' : '') +
            (data.timing && data.timing.total_sec ? ' · 耗时 ' + data.timing.total_sec + 's' : '')
        );
      }
      loadHistory();
      return;
    }
    if (data.status === 'error') {
      stopPoll();
      setBusy(false);
      alert(data.error || 'TTS failed');
    }
  }

  async function start() {
    var text = (textInput.value || '').trim();
    if (!text) {
      alert(tr('privateHub.homePc.ttsNeedText', '请填写合成文本'));
      return;
    }
    var form = new FormData();
    form.append('text', text);
    form.append('engine', engineSelect.value || 'auto');
    form.append('lang', langSelect.value || 'AUTO');
    form.append('voice', voiceSelect.value || '');
    form.append('speed', String(speedInput.value || '1'));
    form.append('duration_factor', String(durationInput.value || '1'));
    if (refFile) form.append('ref_audio', refFile, refFile.name);

    setBusy(true, tr('privateHub.homePc.processing', '处理中…'));
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    try {
      var res = await fetch(API_BASE_URL + '/tts/start', { method: 'POST', body: form });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        throw new Error(data.detail || data.error || ('HTTP ' + res.status));
      }
      lastFolder = data.output_dir || '';
      stopPoll();
      pollOnce(data.task_id);
      pollTimer = setInterval(function () {
        pollOnce(data.task_id);
      }, 1500);
    } catch (e) {
      setBusy(false);
      alert(HomePcApi.friendlyFetchError(e));
    }
  }

  refDrop.addEventListener('click', function () {
    refInput.click();
  });
  refDrop.addEventListener('dragover', function (e) {
    e.preventDefault();
  });
  refDrop.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setRefFile(f);
  });
  refInput.addEventListener('change', function () {
    setRefFile(refInput.files && refInput.files[0]);
  });

  genBtn.addEventListener('click', start);
  clearBtn.addEventListener('click', clearUi);
  downloadBtn.addEventListener('click', function () {
    if (!lastAudioUrl) return;
    if (typeof window.tbTriggerDownload === 'function') {
      tbTriggerDownload(lastAudioUrl, 'speech.wav');
    } else {
      var a = document.createElement('a');
      a.href = lastAudioUrl;
      a.download = 'speech.wav';
      a.click();
    }
  });
  copyLogBtn.addEventListener('click', function () {
    var s = logOutput.textContent || '';
    if (!s) {
      alert(tr('privateHub.homePc.logEmpty', '暂无日志可复制'));
      return;
    }
    HomePcApi.copyText(s)
      .then(function () {
        alert(tr('privateHub.homePc.logCopied', '已复制'));
      })
      .catch(function () {
        alert(tr('privateHub.homePc.logCopyFail', '复制失败'));
      });
  });
  openDirBtn.addEventListener('click', function () {
    if (!lastFolder) {
      alert(tr('privateHub.homePc.ttsNoOutputYet', '暂无输出目录'));
      return;
    }
    var form = new FormData();
    form.append('folder', lastFolder);
    fetch(API_BASE_URL + '/tts/open-dir', { method: 'POST', body: form }).catch(function () {});
  });

  loadDefaults()
    .then(loadHistory)
    .catch(function (e) {
      engineLine.textContent = String(e);
    });
});
