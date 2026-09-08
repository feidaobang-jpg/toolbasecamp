document.addEventListener('DOMContentLoaded', function () {
  var presetSelect = document.getElementById('preset-select');
  var promptInput = document.getElementById('prompt-input');
  var durationInput = document.getElementById('duration-input');
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

  function clearUi() {
    promptInput.value = '';
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
    var res = await fetch(API_BASE_URL + '/sfx/defaults');
    var data = await res.json();
    defaults = data;
    fillSelect(presetSelect, data.presets, data.default_preset || 'whoosh');
    durationInput.value = String(data.default_duration || 3);
    durationInput.min = String(data.duration_min || 0.5);
    durationInput.max = String(data.duration_max || 47);
    durationInput.step = '0.5';
    if (data.hint) {
      var hint = document.getElementById('sfx-hint');
      if (hint) hint.textContent = data.hint;
    }
    var st = data.stable_audio || data.acestep || {};
    engineLine.textContent =
      tr('privateHub.homePc.sfxEngineStatus', '音效引擎') +
      '：' +
      (st.ready
        ? tr('privateHub.homePc.sfxLocalReady', 'Stable Audio Open 已就绪')
        : tr('privateHub.homePc.sfxLocalNotReady', 'Stable Audio Open 未就绪')) +
      ' · ' +
      (st.engine || '');
  }

  async function loadHistory() {
    historyList.innerHTML = '';
    try {
      var res = await fetch(API_BASE_URL + '/sfx/history?limit=20');
      var data = await res.json();
      (data.items || []).forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'home-pc-history-item';
        row.style.cssText =
          'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #e5e7eb';
        var info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML =
          '<div style="font-size:13px;color:#374151">' +
          (it.created_at || '') +
          ' · ' +
          (it.preset || '') +
          ' · ' +
          (it.engine_used || '') +
          '</div><div style="font-size:14px">' +
          (it.prompt || it.caption || '').replace(/</g, '&lt;') +
          '</div>';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'tb-btn';
        openBtn.textContent = tr('privateHub.homePc.sfxHistoryOpen', '打开');
        openBtn.addEventListener('click', function () {
          if (it.preset && presetSelect.querySelector('option[value="' + it.preset + '"]')) {
            presetSelect.value = it.preset;
          }
          promptInput.value = it.prompt || '';
          if (it.duration_req != null) durationInput.value = String(it.duration_req);
          lastFolder = it.folder || '';
          if (it.audio_url) {
            showResult(
              it.audio_url,
              (it.preset || '') +
                ' · ' +
                (it.engine_used || '') +
                (it.duration_sec ? ' · ' + Number(it.duration_sec).toFixed(1) + 's' : '')
            );
          }
        });
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tb-btn';
        delBtn.textContent = tr('privateHub.homePc.historyDelete', '删除');
        delBtn.addEventListener('click', function () {
          if (!window.HomePcApi || !HomePcApi.deleteHistoryTask) return;
          HomePcApi.deleteHistoryTask('/sfx/delete', { folder: it.folder || '' })
            .then(function (r) {
              if (r && r.cancelled) return;
              if (lastFolder && it.folder && lastFolder === it.folder) lastFolder = '';
              loadHistory();
            })
            .catch(function (e) {
              alert(String((e && e.message) || e));
            });
        });
        var actions = document.createElement('div');
        actions.className = 'action-row';
        actions.appendChild(openBtn);
        actions.appendChild(delBtn);
        row.appendChild(info);
        row.appendChild(actions);
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
    var res = await fetch(API_BASE_URL + '/sfx/task/' + taskId);
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
          (data.preset || '') +
            ' · ' +
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
      alert(data.error || 'SFX failed');
    }
  }

  async function start() {
    var prompt = (promptInput.value || '').trim();
    var preset = presetSelect.value || 'whoosh';
    if (preset === 'custom' && !prompt) {
      alert(tr('privateHub.homePc.sfxNeedPrompt', '请填写音效描述'));
      return;
    }
    var form = new FormData();
    form.append('prompt', prompt);
    form.append('preset', preset);
    form.append('duration', String(durationInput.value || '10'));

    setBusy(true, tr('privateHub.homePc.processing', '处理中…'));
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    try {
      var res = await fetch(API_BASE_URL + '/sfx/start', { method: 'POST', body: form });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'HTTP ' + res.status);
      }
      lastFolder = data.output_dir || '';
      stopPoll();
      pollOnce(data.task_id);
      pollTimer = setInterval(function () {
        pollOnce(data.task_id);
      }, 2000);
    } catch (e) {
      setBusy(false);
      alert(HomePcApi.friendlyFetchError(e));
    }
  }

  genBtn.addEventListener('click', start);
  clearBtn.addEventListener('click', clearUi);
  downloadBtn.addEventListener('click', function () {
    if (!lastAudioUrl) return;
    if (typeof window.tbTriggerDownload === 'function') {
      tbTriggerDownload(lastAudioUrl, 'sfx.wav');
    } else {
      var a = document.createElement('a');
      a.href = lastAudioUrl;
      a.download = 'sfx.wav';
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
      alert(tr('privateHub.homePc.sfxNoOutputYet', '暂无输出目录'));
      return;
    }
    var form = new FormData();
    form.append('folder', lastFolder);
    fetch(API_BASE_URL + '/sfx/open-dir', { method: 'POST', body: form }).catch(function () {});
  });

  loadDefaults()
    .then(loadHistory)
    .catch(function (e) {
      engineLine.textContent = String(e);
    });
});
