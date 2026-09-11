/**
 * 家里电脑 · 文生视频 / 图生视频（多模型依次对比）
 * body[data-video-kind="t2v"|"i2v"]
 */
(function () {
  'use strict';

  var KIND = (document.body.getAttribute('data-video-kind') || 't2v').toLowerCase();
  var API_BASE = window.HomePcApi.base();
  var MediaUi = window.HomePcMediaUi;

  var promptInput = document.getElementById('prompt-input');
  var negativeInput = document.getElementById('negative-input');
  var durationSelect = document.getElementById('duration-select');
  var seedInput = document.getElementById('seed-input');
  var startBtn = document.getElementById('start-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var clearBtn = document.getElementById('clear-btn');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var videoBox = document.getElementById('video-box');
  var resultVideo = document.getElementById('result-video');
  var exportHint = document.getElementById('export-hint');
  var compareVideoList = document.getElementById('compare-video-list');
  var logOutput = document.getElementById('log-output');
  var historyList = document.getElementById('history-list');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var refPreviewWrap = document.getElementById('ref-preview-wrap');
  var refPreview = document.getElementById('ref-preview');
  var refClearBtn = document.getElementById('ref-clear-btn');

  var currentTaskId = null;
  var currentFolder = null;
  var pollTimer = null;
  var lastLogLen = 0;
  var refFile = null;
  var refObjectUrl = null;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function resolveUrl(url) {
    return window.HomePcApi.assetUrl(url);
  }

  function selectedModes() {
    var nodes = document.querySelectorAll('input[name="video-mode"]:checked');
    var modes = [];
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.value) modes.push(el.value);
    });
    return modes;
  }

  function setModes(modes) {
    var set = {};
    (modes || []).forEach(function (m) {
      set[String(m)] = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="video-mode"]'), function (el) {
      el.checked = !!set[el.value];
    });
  }

  function selectedAspect() {
    var el = document.querySelector('input[name="aspect"]:checked');
    return (el && el.value) || '16_9';
  }

  function setAspect(aspect) {
    var a = aspect === '9_16' ? '9_16' : '16_9';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="aspect"]'), function (el) {
      el.checked = el.value === a;
    });
  }

  function appendLogs(logs) {
    if (!logOutput || !Array.isArray(logs)) return;
    if (logs.length < lastLogLen) lastLogLen = 0;
    var chunk = logs.slice(lastLogLen);
    lastLogLen = logs.length;
    if (!chunk.length) return;
    logOutput.textContent += (logOutput.textContent ? '\n' : '') + chunk.join('\n');
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function setProgress(data) {
    if (!progressWrap) return;
    var status = (data && data.status) || '';
    var stage = (data && data.stage) || '';
    var running = status === 'running';
    progressWrap.style.display = running ? '' : status === 'done' || status === 'error' ? '' : progressWrap.style.display;
    if (cancelBtn) cancelBtn.style.display = running ? '' : 'none';
    if (startBtn) startBtn.disabled = running;
    var prog = (data && data.progress) || {};
    var cur = Number(prog.current) || 0;
    var tot = Math.max(1, Number(prog.total) || 1);
    var pct = status === 'done' ? 100 : Math.min(99, Math.round((cur / tot) * 100));
    if (progressBar) progressBar.style.width = pct + '%';
    if (progressPercent) progressPercent.textContent = pct + '%';
    var label = '';
    if (status === 'done') label = tr('privateHub.homePc.t2vStageDone', '已完成');
    else if (status === 'error') label = tr('privateHub.homePc.trailerStageError', '失败');
    else if (status === 'cancelled') label = tr('privateHub.homePc.trailerStageCancelled', '已取消');
    else if (stage === 'video') label = KIND === 'i2v'
      ? tr('privateHub.homePc.trailerStageI2v', '图生视频…')
      : tr('privateHub.homePc.trailerStageT2v', '文生视频…');
    else label = tr('privateHub.homePc.trailerStarting', '提交任务…');
    if (progressStatus) progressStatus.textContent = label;
  }

  function showVideo(url, urls, hint) {
    if (!videoBox || !resultVideo) return;
    var list = Array.isArray(urls) ? urls.filter(function (x) { return x && x.url; }) : [];
    if (!url && list.length) url = list[0].url;
    if (!url) {
      videoBox.style.display = 'none';
      return;
    }
    videoBox.style.display = '';
    if (exportHint) exportHint.textContent = hint || '';
    resultVideo.src = resolveUrl(url);
    if (!compareVideoList) return;
    compareVideoList.innerHTML = '';
    if (list.length < 2) {
      compareVideoList.style.display = 'none';
      return;
    }
    compareVideoList.style.display = '';
    list.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-btn' + (idx === 0 ? ' is-active' : '');
      btn.textContent = item.label || item.mode || ('#' + (idx + 1));
      btn.addEventListener('click', function () {
        resultVideo.src = resolveUrl(item.url);
        Array.prototype.forEach.call(compareVideoList.querySelectorAll('.tb-btn'), function (el) {
          el.classList.remove('is-active');
        });
        btn.classList.add('is-active');
      });
      compareVideoList.appendChild(btn);
    });
  }

  function revokeRef() {
    if (refObjectUrl) {
      try {
        URL.revokeObjectURL(refObjectUrl);
      } catch (e) {}
      refObjectUrl = null;
    }
  }

  function setRefFile(file) {
    revokeRef();
    refFile = file || null;
    if (!refPreview || !refPreviewWrap || !dropZone) return;
    if (!refFile) {
      refPreview.removeAttribute('src');
      refPreviewWrap.hidden = true;
      dropZone.style.display = '';
      return;
    }
    refObjectUrl = URL.createObjectURL(refFile);
    refPreview.src = refObjectUrl;
    refPreviewWrap.hidden = false;
    dropZone.style.display = 'none';
  }

  async function pickImage(file) {
    if (!file) return;
    var Compress = window.TBImageUploadCompress;
    if (Compress && Compress.prepareUploadFile) {
      try {
        var prepared = await Compress.prepareUploadFile(file, null, 'video');
        setRefFile(prepared || file);
        return;
      } catch (e) {}
    }
    setRefFile(file);
  }

  function bindDrop() {
    if (!dropZone || KIND !== 'i2v') return;
    dropZone.addEventListener('click', function () {
      if (fileInput) fileInput.click();
    });
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('is-dragover');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('is-dragover');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pickImage(f);
    });
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) pickImage(f);
        fileInput.value = '';
      });
    }
    if (refClearBtn) {
      refClearBtn.addEventListener('click', function () {
        setRefFile(null);
      });
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollOnce() {
    if (!currentTaskId) return;
    try {
      var res = await fetch(API_BASE + '/video-clip/status?task_id=' + encodeURIComponent(currentTaskId));
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'status failed');
      appendLogs(data.logs || []);
      setProgress(data);
      currentFolder = data.output_dir || currentFolder;
      if (data.status === 'done') {
        stopPoll();
        showVideo(data.video_url, data.video_urls, data.export_hint);
        loadHistory();
      } else if (data.status === 'error' || data.status === 'cancelled') {
        stopPoll();
        if (data.error && progressStatus) progressStatus.textContent = data.error;
      } else if (data.video_urls && data.video_urls.length) {
        showVideo(data.video_url, data.video_urls, data.export_hint);
      }
    } catch (e) {
      /* keep polling */
    }
  }

  function startPoll() {
    stopPoll();
    pollOnce();
    pollTimer = setInterval(pollOnce, 2000);
  }

  async function startTask() {
    var modes = selectedModes();
    if (!modes.length) {
      alert(tr('privateHub.homePc.t2vNeedModel', '请至少勾选一个模型'));
      return;
    }
    var prompt = (promptInput && promptInput.value) || '';
    if (KIND === 't2v' && prompt.trim().length < 2) {
      alert(tr('privateHub.homePc.t2vNeedPrompt', '请填写提示词'));
      return;
    }
    if (KIND === 'i2v' && !refFile) {
      alert(tr('privateHub.homePc.i2vNeedImage', '请先上传首帧图'));
      return;
    }

    var fd = new FormData();
    fd.append('kind', KIND);
    fd.append('prompt', prompt.trim());
    fd.append('negative', (negativeInput && negativeInput.value) || '');
    fd.append('aspect', selectedAspect());
    fd.append('duration_sec', (durationSelect && durationSelect.value) || '3');
    fd.append('video_modes', JSON.stringify(modes));
    fd.append('video_mode', modes[0]);
    if (seedInput && seedInput.value.trim()) fd.append('seed', seedInput.value.trim());
    if (KIND === 'i2v' && refFile) fd.append('image', refFile, refFile.name || 'source.png');

    lastLogLen = 0;
    if (logOutput) logOutput.textContent = '';
    if (progressWrap) progressWrap.style.display = '';
    setProgress({ status: 'running', stage: 'prepare', progress: { current: 0, total: modes.length } });

    try {
      var res = await fetch(API_BASE + '/video-clip/start', { method: 'POST', body: fd });
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'start failed');
      currentTaskId = data.task_id;
      currentFolder = data.output_dir || '';
      appendLogs(data.logs || []);
      startPoll();
    } catch (e) {
      setProgress({ status: 'error', stage: 'error' });
      alert(String(e.message || e));
    }
  }

  async function cancelTask() {
    if (!currentTaskId) return;
    try {
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      await fetch(API_BASE + '/video-clip/cancel', { method: 'POST', body: fd });
      pollOnce();
    } catch (e) {}
  }

  function clearForm() {
    stopPoll();
    currentTaskId = null;
    currentFolder = null;
    lastLogLen = 0;
    if (promptInput) promptInput.value = '';
    if (negativeInput) negativeInput.value = '';
    if (seedInput) seedInput.value = '';
    if (durationSelect) durationSelect.value = '5';
    setAspect('16_9');
    if (KIND === 't2v') setModes(['ltx25_t2v']);
    else setModes(['wan22_14b_gguf']);
    setRefFile(null);
    if (logOutput) logOutput.textContent = '';
    if (progressWrap) progressWrap.style.display = 'none';
    if (videoBox) videoBox.style.display = 'none';
    if (resultVideo) resultVideo.removeAttribute('src');
    if (compareVideoList) {
      compareVideoList.innerHTML = '';
      compareVideoList.style.display = 'none';
    }
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (startBtn) startBtn.disabled = false;
  }

  function applyFormFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return;
    if (promptInput && meta.prompt != null) promptInput.value = meta.prompt;
    if (negativeInput && meta.negative != null) negativeInput.value = meta.negative;
    if (meta.aspect) setAspect(meta.aspect);
    if (durationSelect && meta.duration_sec != null) {
      durationSelect.value = String(Math.round(Number(meta.duration_sec) || 3));
    }
    if (seedInput) {
      seedInput.value = meta.seed != null && meta.seed !== '' ? String(meta.seed) : '';
    }
    var modes = meta.video_modes;
    if ((!modes || !modes.length) && meta.video_mode) modes = [meta.video_mode];
    if (modes && modes.length) setModes(modes);
  }

  async function openHistory(folder) {
    try {
      var fd = new FormData();
      fd.append('folder', folder);
      var res = await fetch(API_BASE + '/video-clip/open', { method: 'POST', body: fd });
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'open failed');
      applyFormFromMeta(data);
      currentFolder = data.folder || folder;
      currentTaskId = data.task_id || null;
      lastLogLen = 0;
      if (logOutput) logOutput.textContent = '';
      showVideo(data.video_url, data.video_urls, data.export_hint || '');
      if (KIND === 'i2v' && data.source_image && refPreview) {
        revokeRef();
        refFile = null;
        refPreview.src = resolveUrl(data.source_image);
        if (refPreviewWrap) refPreviewWrap.hidden = false;
        if (dropZone) dropZone.style.display = 'none';
      }
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  async function loadHistory() {
    if (!historyList) return;
    try {
      var res = await fetch(
        API_BASE + '/video-clip/history?kind=' + encodeURIComponent(KIND) + '&limit=24'
      );
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'history failed');
      historyList.innerHTML = '';
      var items = data.items || [];
      if (!items.length) {
        historyList.textContent = tr('privateHub.homePc.trailerHistoryEmpty', '暂无历史记录');
        return;
      }
      items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'trailer-history-card';
        var title = document.createElement('div');
        title.className = 'trailer-history-title';
        var prompt = (item.prompt || '').trim() || item.folder || '';
        title.textContent = prompt.length > 48 ? prompt.slice(0, 48) + '…' : prompt;
        var meta = document.createElement('div');
        meta.className = 'trailer-history-meta';
        var modes = (item.video_modes || []).join(', ') || '—';
        meta.textContent =
          (item.aspect || '') +
          ' · ' +
          (item.duration_sec != null ? item.duration_sec + 's' : '') +
          ' · ' +
          modes;
        var row = document.createElement('div');
        row.className = 'action-row';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'tb-btn';
        openBtn.textContent = tr('privateHub.homePc.t2vHistoryOpen', '打开');
        openBtn.addEventListener('click', function () {
          openHistory(item.folder);
        });
        row.appendChild(openBtn);
        if (item.video_url) {
          var playBtn = document.createElement('button');
          playBtn.type = 'button';
          playBtn.className = 'tb-btn';
          playBtn.textContent = tr('privateHub.homePc.trailerHistoryOpenVideo', '打开成片');
          playBtn.addEventListener('click', function () {
            showVideo(item.video_url, item.video_urls, '');
          });
          row.appendChild(playBtn);
        }
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tb-btn';
        delBtn.textContent = tr('privateHub.homePc.historyDelete', '删除');
        delBtn.addEventListener('click', function () {
          if (!window.HomePcApi || !HomePcApi.deleteHistoryTask) return;
          HomePcApi.deleteHistoryTask('/video-clip/delete', { folder: item.folder || '' })
            .then(function (r) {
              if (r && r.cancelled) return;
              loadHistory();
            })
            .catch(function (e) {
              alert(String((e && e.message) || e));
            });
        });
        row.appendChild(delBtn);
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(row);
        historyList.appendChild(card);
      });
    } catch (e) {
      historyList.textContent = String(e.message || e);
    }
  }

  function openOutputDir() {
    var key = currentFolder || currentTaskId;
    if (!key) {
      alert(tr('privateHub.homePc.t2vNoOutputYet', '暂无输出目录'));
      return;
    }
    var fd = new FormData();
    if (currentFolder) fd.append('folder', currentFolder);
    else fd.append('task_id', currentTaskId);
    fetch(API_BASE + '/video-clip/reveal-output', { method: 'POST', body: fd }).catch(function () {});
  }

  function bindLogToolbar() {
    var box = document.getElementById('log-container');
    if (!MediaUi || !MediaUi.ensureLogToolbar || !box) return;
    MediaUi.ensureLogToolbar(box, {
      getText: function () {
        return (logOutput && logOutput.textContent) || '';
      },
      onOpenDir: openOutputDir
    });
  }

  if (startBtn) startBtn.addEventListener('click', startTask);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelTask);
  if (clearBtn) clearBtn.addEventListener('click', clearForm);
  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);

  bindDrop();
  bindLogToolbar();
  loadHistory();
})();
