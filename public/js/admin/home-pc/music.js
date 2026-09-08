document.addEventListener('DOMContentLoaded', function () {
  var modeSelect = document.getElementById('mode-select');
  var presetSelect = document.getElementById('preset-select');
  var presetWrap = document.getElementById('preset-wrap');
  var songFields = document.getElementById('song-fields');
  var promptInput = document.getElementById('prompt-input');
  var lyricsInput = document.getElementById('lyrics-input');
  var autoLyrics = document.getElementById('auto-lyrics');
  var durationInput = document.getElementById('duration-input');
  var bpmInput = document.getElementById('bpm-input');
  var langSelect = document.getElementById('lang-select');
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
  var lyricsPreview = document.getElementById('lyrics-preview');
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

  function syncModeUi() {
    var mode = modeSelect.value || 'bgm';
    var isSong = mode === 'song';
    songFields.style.display = isSong ? '' : 'none';
    presetWrap.style.display = isSong ? 'none' : '';
    if (!isSong && defaults) {
      durationInput.value = String(defaults.default_duration_bgm || 60);
    } else if (isSong && defaults) {
      durationInput.value = String(defaults.default_duration_song || 90);
    }
  }

  function clearUi() {
    promptInput.value = '';
    lyricsInput.value = '';
    autoLyrics.checked = false;
    bpmInput.value = '0';
    lastAudioUrl = '';
    lastFolder = '';
    resultAudio.removeAttribute('src');
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    metaLine.textContent = '';
    lyricsPreview.style.display = 'none';
    lyricsPreview.textContent = '';
    logOutput.textContent = '';
    setBusy(false);
  }

  function showResult(url, meta, lyrics) {
    lastAudioUrl = assetUrl(url);
    resultAudio.src = lastAudioUrl;
    resultBox.style.display = 'block';
    downloadBtn.style.display = '';
    metaLine.textContent = meta || '';
    if (lyrics && lyrics !== '[Instrumental]') {
      lyricsPreview.style.display = 'block';
      lyricsPreview.textContent = lyrics;
    } else {
      lyricsPreview.style.display = 'none';
      lyricsPreview.textContent = '';
    }
  }

  async function loadDefaults() {
    var res = await fetch(API_BASE_URL + '/music/defaults');
    var data = await res.json();
    defaults = data;
    fillSelect(modeSelect, data.modes, data.default_mode || 'bgm');
    fillSelect(presetSelect, data.presets_bgm, 'adventure');
    if (data.hint) {
      var hint = document.getElementById('music-hint');
      if (hint) hint.textContent = data.hint;
    }
    var st = data.acestep || {};
    engineLine.textContent =
      tr('privateHub.homePc.musicEngineStatus', '音乐引擎') +
      '：' +
      (st.ready
        ? tr('privateHub.homePc.musicLocalReady', 'ACE-Step 已就绪')
        : tr('privateHub.homePc.musicLocalNotReady', 'ACE-Step 未就绪')) +
      ' · ' +
      (st.engine || '');
    syncModeUi();
  }

  async function loadHistory() {
    historyList.innerHTML = '';
    try {
      var res = await fetch(API_BASE_URL + '/music/history?limit=20');
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
          (it.mode || '') +
          ' · ' +
          (it.engine_used || '') +
          '</div><div style="font-size:14px">' +
          (it.prompt || it.caption || '').replace(/</g, '&lt;') +
          '</div>';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'tb-btn';
        openBtn.textContent = tr('privateHub.homePc.musicHistoryOpen', '打开');
        openBtn.addEventListener('click', function () {
          if (it.mode && modeSelect.querySelector('option[value="' + it.mode + '"]')) {
            modeSelect.value = it.mode;
          }
          syncModeUi();
          promptInput.value = it.prompt || '';
          lyricsInput.value = it.lyrics && it.lyrics !== '[Instrumental]' ? it.lyrics : '';
          if (it.preset && presetSelect.querySelector('option[value="' + it.preset + '"]')) {
            presetSelect.value = it.preset;
          }
          if (it.lang && langSelect.querySelector('option[value="' + it.lang + '"]')) {
            langSelect.value = it.lang;
          }
          if (it.duration_req != null) durationInput.value = String(it.duration_req);
          if (it.bpm != null) bpmInput.value = String(it.bpm);
          lastFolder = it.folder || '';
          if (it.audio_url) {
            showResult(
              it.audio_url,
              (it.mode || '') +
                ' · ' +
                (it.engine_used || '') +
                (it.duration_sec ? ' · ' + Number(it.duration_sec).toFixed(1) + 's' : ''),
              it.lyrics || ''
            );
          }
        });
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tb-btn';
        delBtn.textContent = tr('privateHub.homePc.historyDelete', '删除');
        delBtn.addEventListener('click', function () {
          if (!window.HomePcApi || !HomePcApi.deleteHistoryTask) return;
          HomePcApi.deleteHistoryTask('/music/delete', { folder: it.folder || '' })
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
    var res = await fetch(API_BASE_URL + '/music/task/' + taskId);
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
          (data.mode || '') +
            ' · ' +
            (data.engine_used || '') +
            (data.duration_sec ? ' · ' + Number(data.duration_sec).toFixed(1) + 's' : '') +
            (data.timing && data.timing.total_sec ? ' · 耗时 ' + data.timing.total_sec + 's' : ''),
          data.lyrics || ''
        );
      }
      loadHistory();
      return;
    }
    if (data.status === 'error') {
      stopPoll();
      setBusy(false);
      alert(data.error || 'Music failed');
    }
  }

  async function start() {
    var mode = modeSelect.value || 'bgm';
    var prompt = (promptInput.value || '').trim();
    var lyrics = (lyricsInput.value || '').trim();
    if (mode === 'song' && !prompt && !lyrics && !autoLyrics.checked) {
      alert(tr('privateHub.homePc.musicNeedPrompt', '请填写风格描述或歌词'));
      return;
    }
    if (mode === 'bgm' && !prompt && (presetSelect.value || '') === 'custom') {
      alert(tr('privateHub.homePc.musicNeedPrompt', '请填写风格描述或歌词'));
      return;
    }
    var form = new FormData();
    form.append('mode', mode);
    form.append('prompt', prompt);
    form.append('lyrics', lyrics);
    form.append('preset', presetSelect.value || 'adventure');
    form.append('auto_lyrics', autoLyrics.checked ? '1' : '0');
    form.append('duration', String(durationInput.value || '60'));
    form.append('bpm', String(bpmInput.value || '0'));
    form.append('lang', langSelect.value || 'zh');

    setBusy(true, tr('privateHub.homePc.processing', '处理中…'));
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    try {
      var res = await fetch(API_BASE_URL + '/music/start', { method: 'POST', body: form });
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

  modeSelect.addEventListener('change', syncModeUi);
  genBtn.addEventListener('click', start);
  clearBtn.addEventListener('click', clearUi);
  downloadBtn.addEventListener('click', function () {
    if (!lastAudioUrl) return;
    if (typeof window.tbTriggerDownload === 'function') {
      tbTriggerDownload(lastAudioUrl, 'music.wav');
    } else {
      var a = document.createElement('a');
      a.href = lastAudioUrl;
      a.download = 'music.wav';
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
      alert(tr('privateHub.homePc.musicNoOutputYet', '暂无输出目录'));
      return;
    }
    var form = new FormData();
    form.append('folder', lastFolder);
    fetch(API_BASE_URL + '/music/open-dir', { method: 'POST', body: form }).catch(function () {});
  });

  loadDefaults()
    .then(loadHistory)
    .catch(function (e) {
      engineLine.textContent = String(e);
    });
});
