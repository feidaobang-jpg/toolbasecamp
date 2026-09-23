/**
 * 家里电脑 · 数字人 / 对口型
 * 人物图（或视频）+ 台词 → 本地 TTS → 唇形同步引擎 → 说话视频
 */
(function () {
  'use strict';

  var API_BASE = window.HomePcApi.base();
  var MediaUi = window.HomePcMediaUi;

  var imageDrop = document.getElementById('image-drop');
  var imageInput = document.getElementById('image-input');
  var imageThumb = document.getElementById('image-thumb');
  var imagePreview = document.getElementById('image-preview');
  var imageRemove = document.getElementById('image-remove');

  var audioDrop = document.getElementById('audio-drop');
  var audioInput = document.getElementById('audio-input');
  var audioName = document.getElementById('audio-name');

  var textInput = document.getElementById('text-input');
  var engineSelect = document.getElementById('engine-select');
  var motionSelect = document.getElementById('motion-select');
  var voiceSelect = document.getElementById('voice-select');
  var speedInput = document.getElementById('speed-input');
  var voiceWrap = document.getElementById('voice-wrap');
  var speedWrap = document.getElementById('speed-wrap');
  var zoomInput = document.getElementById('zoom-input');
  var seedInput = document.getElementById('seed-input');
  var motionPrompt = document.getElementById('motion-prompt');

  var genBtn = document.getElementById('gen-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');

  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');

  var resultBox = document.getElementById('result-box');
  var resultVideo = document.getElementById('result-video');
  var metaLine = document.getElementById('meta-line');

  var logOutput = document.getElementById('log-output');
  var historyList = document.getElementById('history-list');
  var engineLine = document.getElementById('engine-line');

  var imageFile = null;
  var imageObjectUrl = null;
  var audioFile = null;
  var currentTaskId = null;
  var currentFolder = null;
  var pollTimer = null;
  var lastLogLen = 0;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function log(msg) {
    if (!logOutput) return;
    logOutput.textContent += (logOutput.textContent ? '\n' : '') + msg;
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function setBusy(busy) {
    genBtn.disabled = busy;
    cancelBtn.style.display = busy ? '' : 'none';
    progressWrap.style.display = busy ? '' : progressWrap.style.display;
  }

  function resetProgress() {
    progressWrap.style.display = 'none';
    progressBar.style.width = '0%';
    progressPercent.textContent = '';
    progressStatus.textContent = '';
  }

  // ------------------------------------------------------------------ //
  // 素材选择
  // ------------------------------------------------------------------ //

  function setImage(file) {
    if (!file || (file.type && file.type.indexOf('image/') !== 0)) return;
    imageFile = file;
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    imagePreview.src = imageObjectUrl;
    imageThumb.hidden = false;
    imageDrop.hidden = true;
  }

  function clearImage() {
    imageFile = null;
    if (imageObjectUrl) {
      URL.revokeObjectURL(imageObjectUrl);
      imageObjectUrl = null;
    }
    imageInput.value = '';
    imageThumb.hidden = true;
    imageDrop.hidden = false;
  }

  function setAudio(file) {
    audioFile = file || null;
    if (audioFile) {
      audioName.textContent = audioFile.name + ' · ' + (audioFile.size / 1024 / 1024).toFixed(2) + ' MB';
    } else {
      audioName.textContent = '';
    }
    syncVoiceVisibility();
  }

  function syncVoiceVisibility() {
    // 有音频时 TTS 参数无效，隐藏以免误解
    var show = !audioFile;
    if (voiceWrap) voiceWrap.style.display = show ? '' : 'none';
    if (speedWrap) speedWrap.style.display = show ? '' : 'none';
  }

  function bindDrop(drop, input, onFiles, accept) {
    if (!drop || !input) return;
    drop.addEventListener('click', function () {
      input.click();
    });
    drop.addEventListener('dragover', function (e) {
      e.preventDefault();
      drop.classList.add('drag-over');
    });
    drop.addEventListener('dragleave', function () {
      drop.classList.remove('drag-over');
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('drag-over');
      var files = (e.dataTransfer && e.dataTransfer.files) || [];
      if (files.length) onFiles(files[0], accept);
    });
    input.addEventListener('change', function () {
      var files = input.files;
      if (files && files.length) onFiles(files[0], accept);
      input.value = '';
    });
  }

  // ------------------------------------------------------------------ //
  // 默认值
  // ------------------------------------------------------------------ //

  function fillSelect(el, map, preferred) {
    if (!el) return;
    el.innerHTML = '';
    Object.keys(map || {}).forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = map[k];
      if (k === preferred) opt.selected = true;
      el.appendChild(opt);
    });
  }

  function loadDefaults() {
    return fetch(API_BASE + '/lipsync/defaults')
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var engines = (d && d.engines) || {};
        var map = {};
        var firstReady = '';
        Object.keys(engines).forEach(function (k) {
          var e = engines[k];
          var ready = !!e.ready;
          map[k] = e.label + (ready ? '' : tr('privateHub.homePc.dhEngineNotReady', '（未就绪）'));
          if (ready && !firstReady) firstReady = k;
        });
        fillSelect(engineSelect, map, d.default_engine || firstReady);

        var motions = (d && d.motions) || {};
        fillSelect(motionSelect, motions, d.default_motion || 'still');
        if (!motions.wan) {
          Array.prototype.forEach.call(motionSelect.options, function (o) {
            if (o.value === 'wan') o.disabled = true;
          });
        }

        var notes = [];
        if (!d.any_ready) {
          notes.push(tr(
            'privateHub.homePc.dhNoEngine',
            '本机还没有可用的口型引擎。先在家里电脑执行：python scripts/setup_lipsync.py --engine musetalk'
          ));
          genBtn.disabled = true;
        }
        Object.keys(engines).forEach(function (k) {
          var e = engines[k];
          if (!e.ready && e.reason) notes.push(e.label + '：' + e.reason);
        });
        if (d.privacy_note) notes.push(d.privacy_note);
        engineLine.textContent = notes.join('\n');
        engineLine.style.whiteSpace = 'pre-line';

        return loadVoices();
      });
  }

  function loadVoices() {
    return fetch(API_BASE + '/tts/defaults')
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var voices = (d && d.voices_edge) || {};
        if (Object.keys(voices).length) fillSelect(voiceSelect, voices, 'zh-CN-XiaoxiaoNeural');
        else fillSelect(voiceSelect, { '': tr('privateHub.homePc.dhVoiceDefault', '默认音色') }, '');
      })
      .catch(function () {
        fillSelect(voiceSelect, { '': tr('privateHub.homePc.dhVoiceDefault', '默认音色') }, '');
      });
  }

  // ------------------------------------------------------------------ //
  // 提交 / 轮询
  // ------------------------------------------------------------------ //

  function startTask() {
    if (!imageFile) {
      alert(tr('privateHub.homePc.dhNeedImage', '请先上传人物图片'));
      return;
    }
    var text = (textInput.value || '').trim();
    if (!text && !audioFile) {
      alert(tr('privateHub.homePc.dhNeedText', '请填写台词，或上传一段音频'));
      return;
    }

    var fd = new FormData();
    fd.append('image', imageFile, imageFile.name || 'face.png');
    if (audioFile) fd.append('audio', audioFile, audioFile.name || 'speech.wav');
    fd.append('text', text);
    fd.append('engine', engineSelect.value || '');
    fd.append('motion', motionSelect.value || 'still');
    fd.append('motion_prompt', (motionPrompt && motionPrompt.value) || '');
    fd.append('still_zoom', (zoomInput && zoomInput.value) || '1.0');
    fd.append('voice', voiceSelect ? voiceSelect.value || '' : '');
    fd.append('speed', (speedInput && speedInput.value) || '1.0');
    fd.append('seed', (seedInput && seedInput.value) || '1247');

    lastLogLen = 0;
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    currentFolder = null;
    setBusy(true);
    progressWrap.style.display = '';
    progressStatus.textContent = tr('privateHub.homePc.dhStarting', '提交任务…');
    progressBar.style.width = '5%';
    progressPercent.textContent = '5%';
    log(tr('privateHub.homePc.dhSubmitting', '正在提交任务…'));

    fetch(API_BASE + '/lipsync/start', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || !d.success) {
            throw new Error((d && d.detail) || tr('privateHub.homePc.dhSubmitFail', '提交失败'));
          }
          return d;
        });
      })
      .then(function (d) {
        currentTaskId = d.task_id;
        currentFolder = d.folder || '';
        log(tr('privateHub.homePc.dhTaskId', '任务') + ' ' + d.task_id + ' · ' + (d.engine || ''));
        poll();
      })
      .catch(function (e) {
        setBusy(false);
        log('✗ ' + String(e.message || e));
        alert(String(e.message || e));
      });
  }

  function appendLogs(logs) {
    if (!Array.isArray(logs)) return;
    if (logs.length < lastLogLen) lastLogLen = 0;
    var chunk = logs.slice(lastLogLen);
    lastLogLen = logs.length;
    if (chunk.length) {
      logOutput.textContent += (logOutput.textContent ? '\n' : '') + chunk.join('\n');
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  }

  function poll() {
    if (!currentTaskId) return;
    clearTimeout(pollTimer);
    fetch(API_BASE + '/lipsync/task/' + encodeURIComponent(currentTaskId))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        appendLogs(d.logs);
        if (d.folder) currentFolder = d.folder;

        var status = d.status || '';
        if (status === 'done') {
          clearTimeout(pollTimer);
          setBusy(false);
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';
          progressStatus.textContent = tr('privateHub.homePc.dhStageDone', '完成');
          showResult(d);
          loadHistory();
          return;
        }
        if (status === 'error') {
          clearTimeout(pollTimer);
          setBusy(false);
          progressStatus.textContent = tr('privateHub.homePc.dhStageError', '失败');
          log('✗ ' + (d.error || ''));
          alert(d.error || tr('privateHub.homePc.dhStageError', '失败'));
          return;
        }

        var prog = d.progress || {};
        var cur = Number(prog.current) || 0;
        var tot = Math.max(1, Number(prog.total) || 100);
        var pct = Math.min(98, Math.round((cur / tot) * 100));
        progressBar.style.width = pct + '%';
        progressPercent.textContent = pct + '%';
        progressStatus.textContent = d.stage_label || tr('privateHub.homePc.dhRunning', '处理中…');
        pollTimer = setTimeout(poll, 2000);
      })
      .catch(function (e) {
        log('轮询失败：' + String(e.message || e));
        pollTimer = setTimeout(poll, 4000);
      });
  }

  function showResult(d) {
    var urls = (d && d.video_urls) || [];
    var url = (urls[0] || d.video_url || '').trim();
    if (!url) {
      log(tr('privateHub.homePc.dhNoVideoUrl', '任务完成但没有视频地址'));
      return;
    }
    resultVideo.src = HomePcApi.assetUrl(url);
    resultBox.style.display = '';
    downloadBtn.style.display = '';
    var bits = [];
    if (d.engine) bits.push(d.engine);
    if (d.audio_duration) bits.push(Number(d.audio_duration).toFixed(1) + 's');
    if (d.timing && d.timing.total_sec) bits.push(tr('privateHub.homePc.dhElapsed', '耗时') + ' ' + d.timing.total_sec + 's');
    if (d.folder) bits.push(d.folder);
    metaLine.textContent = bits.join(' · ');
  }

  function cancelTask() {
    if (!currentTaskId) return;
    var fd = new FormData();
    fetch(API_BASE + '/lipsync/cancel/' + encodeURIComponent(currentTaskId), { method: 'POST', body: fd })
      .then(function () {
        log(tr('privateHub.homePc.dhCancelling', '已请求取消…'));
      })
      .catch(function () {});
  }

  function clearForm() {
    clearImage();
    setAudio(null);
    if (audioInput) audioInput.value = '';
    textInput.value = '';
    resetProgress();
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    currentTaskId = null;
    currentFolder = null;
    lastLogLen = 0;
    syncVoiceVisibility();
  }

  function download() {
    var url = resultVideo.getAttribute('src');
    if (!url) return;
    var name = 'digital-human-' + (currentTaskId || Date.now()) + '.mp4';
    if (MediaUi && MediaUi.triggerDownload) {
      MediaUi.triggerDownload(url, name).catch(function (e) {
        alert(String(e.message || e));
      });
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  // ------------------------------------------------------------------ //
  // 历史
  // ------------------------------------------------------------------ //

  function loadHistory() {
    if (!historyList) return;
    fetch(API_BASE + '/lipsync/history?limit=24')
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        historyList.innerHTML = '';
        var items = (d && d.items) || [];
        if (!items.length) {
          historyList.textContent = tr('privateHub.homePc.dhHistoryEmpty', '暂无历史记录');
          return;
        }
        items.forEach(function (it) {
          var card = document.createElement('div');
          card.className = 'home-pc-history-item';

          var head = document.createElement('div');
          head.className = 'home-pc-history-head';
          head.textContent = (it.created_at || '') + ' · ' + (it.engine || '') +
            (it.audio_duration ? ' · ' + Number(it.audio_duration).toFixed(1) + 's' : '');
          card.appendChild(head);

          if (it.text) {
            var t = document.createElement('p');
            t.className = 'small-hint';
            t.textContent = it.text.slice(0, 80);
            card.appendChild(t);
          }

          var row = document.createElement('div');
          row.className = 'action-row';

          if (it.video_url) {
            var playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'tb-btn';
            playBtn.textContent = tr('privateHub.homePc.dhPlay', '播放');
            playBtn.addEventListener('click', function () {
              resultVideo.src = HomePcApi.assetUrl(it.video_url);
              resultBox.style.display = '';
              currentFolder = it.folder || '';
              downloadBtn.style.display = '';
              metaLine.textContent = (it.created_at || '') + ' · ' + (it.engine || '');
              resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
            row.appendChild(playBtn);
          }
          card.appendChild(row);

          if (MediaUi && MediaUi.appendCardActions) {
            MediaUi.appendCardActions(card, {
              onDownload: function () {
                if (!it.video_url) return;
                var name = 'digital-human-' + String(it.folder || 'out').replace(/\W+/g, '_') + '.mp4';
                MediaUi.triggerDownload(HomePcApi.assetUrl(it.video_url), name).catch(function (e) {
                  alert(String(e.message || e));
                });
              },
              onDelete: function () {
                var fd = new FormData();
                fd.append('folder', it.folder || '');
                fetch(API_BASE + '/lipsync/delete', { method: 'POST', body: fd })
                  .then(function () {
                    loadHistory();
                  })
                  .catch(function () {});
              }
            });
          }

          historyList.appendChild(card);
        });
      })
      .catch(function (e) {
        historyList.textContent = String(e.message || e);
      });
  }

  function openOutputDir() {
    if (!currentFolder) {
      alert(tr('privateHub.homePc.dhNoOutputYet', '暂无输出目录'));
      return;
    }
    var fd = new FormData();
    fd.append('folder', currentFolder);
    fetch(API_BASE + '/lipsync/open-dir', { method: 'POST', body: fd }).catch(function () {});
  }

  // ------------------------------------------------------------------ //
  // 绑定
  // ------------------------------------------------------------------ //

  bindDrop(imageDrop, imageInput, function (f) {
    setImage(f);
  });
  bindDrop(audioDrop, audioInput, function (f) {
    setAudio(f);
  });

  if (imageRemove) {
    imageRemove.addEventListener('click', function (e) {
      e.stopPropagation();
      clearImage();
    });
  }
  if (genBtn) genBtn.addEventListener('click', startTask);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelTask);
  if (clearBtn) clearBtn.addEventListener('click', clearForm);
  if (downloadBtn) downloadBtn.addEventListener('click', download);

  var copyLogBtn = document.getElementById('copy-log-btn');
  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      var s = (logOutput && logOutput.textContent) || '';
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
  }

  var openDirBtn = document.getElementById('open-dir-btn');
  if (openDirBtn) openDirBtn.addEventListener('click', openOutputDir);

  syncVoiceVisibility();
  loadDefaults()
    .then(loadHistory)
    .catch(function (e) {
      engineLine.textContent = String(e.message || e);
      log(String(e.message || e));
    });
})();
