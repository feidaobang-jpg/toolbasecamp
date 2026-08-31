document.addEventListener('DOMContentLoaded', function () {
  var startBtn = document.getElementById('start-btn');
  var confirmBtn = document.getElementById('confirm-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var clearBtn = document.getElementById('clear-btn');
  var openOutputBtn = document.getElementById('open-output-btn');
  var promptInput = document.getElementById('prompt-input');
  var candidatesSelect = document.getElementById('candidates-select');
  var voiceSelect = document.getElementById('voice-select');
  var speedInput = document.getElementById('speed-input');
  var styleRow = document.getElementById('style-row');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var planBox = document.getElementById('plan-box');
  var planMeta = document.getElementById('plan-meta');
  var planList = document.getElementById('plan-list');
  var shotsBox = document.getElementById('shots-box');
  var shotsList = document.getElementById('shots-list');
  var videoBox = document.getElementById('video-box');
  var resultVideo = document.getElementById('result-video');
  var exportHint = document.getElementById('export-hint');
  var logOutput = document.getElementById('log-output');

  var API_BASE = window.HomePcApi.base();
  var selectedStyle = 'realistic';
  var currentTaskId = null;
  var pollingTimer = null;
  var lastLogLen = 0;
  var picks = {};

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

  function selectedAspect() {
    var el = document.querySelector('input[name="aspect"]:checked');
    return el ? el.value : '16_9';
  }

  function selectedVideoMode() {
    var el = document.querySelector('input[name="video-mode"]:checked');
    return el ? el.value : 'i2v';
  }

  function setBusy(busy) {
    startBtn.disabled = !!busy;
    confirmBtn.disabled = !!busy;
    cancelBtn.style.display = busy && currentTaskId ? '' : 'none';
  }

  function appendLogs(logs) {
    if (!Array.isArray(logs)) return;
    if (logs.length <= lastLogLen) return;
    var chunk = logs.slice(lastLogLen).join('\n');
    lastLogLen = logs.length;
    logOutput.textContent = (logOutput.textContent ? logOutput.textContent + '\n' : '') + chunk;
    // 不自动滚到底，避免抢滚动（站点约定）
  }

  function setProgress(task) {
    var stage = task.stage || '';
    var stMap = {
      plan: tr('privateHub.homePc.trailerStagePlan', '策划分镜…'),
      images: tr('privateHub.homePc.trailerStageImages', '生成候选图…'),
      awaiting_picks: tr('privateHub.homePc.trailerStagePicks', '等待选图'),
      compose: tr('privateHub.homePc.trailerStageCompose', '配音与拼接…'),
      i2v: tr('privateHub.homePc.trailerStageI2v', '图生视频…'),
      tts: tr('privateHub.homePc.trailerStageTts', '配音…'),
      video: tr('privateHub.homePc.trailerStageVideo', '成片…'),
      done: tr('privateHub.homePc.trailerStageDone', '完成'),
      error: tr('privateHub.homePc.trailerStageError', '失败'),
      cancelled: tr('privateHub.homePc.trailerStageCancelled', '已取消')
    };
    progressWrap.style.display = '';
    progressStatus.textContent = stMap[stage] || stage || '…';
    var cur = (task.progress && task.progress.current) || 0;
    var tot = (task.progress && task.progress.total) || 1;
    var pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
    if (task.status === 'awaiting_picks' || task.status === 'done') pct = 100;
    progressPercent.textContent = pct + '%';
    progressBar.style.width = pct + '%';
  }

  function renderPlan(plan) {
    if (!plan) {
      planBox.style.display = 'none';
      return;
    }
    planBox.style.display = '';
    var shots = plan.shots || [];
    var sum = 0;
    shots.forEach(function (s) { sum += Number(s.duration_sec) || 0; });
    planMeta.textContent =
      (plan.title || '') +
      (plan.logline ? ' — ' + plan.logline : '') +
      ' · ' +
      shots.length +
      ' 镜 · 约 ' +
      sum.toFixed(0) +
      's';
    planList.innerHTML = '';
    shots.forEach(function (s, i) {
      var li = document.createElement('li');
      li.innerHTML =
        '<strong>#' +
        (i + 1) +
        ' · ' +
        (s.duration_sec || '?') +
        's</strong> ' +
        '<span class="trailer-vo">' +
        escapeHtml(s.voiceover || '') +
        '</span>';
      planList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderShots(shotsUi, aspect) {
    if (!Array.isArray(shotsUi) || !shotsUi.length) {
      shotsBox.style.display = 'none';
      confirmBtn.style.display = 'none';
      return;
    }
    var appEl = document.getElementById('app');
    if (appEl) {
      if ((aspect || selectedAspect()) === '9_16') appEl.classList.add('trailer-portrait-preview');
      else appEl.classList.remove('trailer-portrait-preview');
    }
    shotsBox.style.display = '';
    confirmBtn.style.display = '';
    shotsList.innerHTML = '';
    picks = {};
    shotsUi.forEach(function (shot) {
      var idx = String(shot.index);
      var pick = typeof shot.default_pick === 'number' ? shot.default_pick : 0;
      picks[idx] = pick;
      var card = document.createElement('div');
      card.className = 'trailer-shot-card';
      var head = document.createElement('div');
      head.className = 'trailer-shot-head';
      head.innerHTML =
        '<strong>#' +
        (Number(shot.index) + 1) +
        '</strong> · ' +
        escapeHtml(String(shot.duration_sec || '')) +
        's · ' +
        '<span class="trailer-vo">' +
        escapeHtml(shot.voiceover || '') +
        '</span>';
      card.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'trailer-cand-grid';
      (shot.candidates || []).forEach(function (c, ci) {
        var label = document.createElement('label');
        label.className = 'trailer-cand' + (ci === pick ? ' is-selected' : '');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'shot-' + idx;
        input.value = String(ci);
        if (ci === pick) input.checked = true;
        input.addEventListener('change', function () {
          picks[idx] = ci;
          Array.prototype.forEach.call(grid.querySelectorAll('.trailer-cand'), function (el) {
            el.classList.remove('is-selected');
          });
          label.classList.add('is-selected');
        });
        var img = document.createElement('img');
        img.src = resolveUrl(c.url);
        img.alt = 'shot ' + idx + ' cand ' + ci;
        img.loading = 'lazy';
        label.appendChild(input);
        label.appendChild(img);
        grid.appendChild(label);
      });
      card.appendChild(grid);
      shotsList.appendChild(card);
    });
  }

  function stopPoll() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function poll() {
    if (!currentTaskId) return;
    fetch(API_BASE + '/trailer/status?task_id=' + encodeURIComponent(currentTaskId))
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        var task = pack.body || {};
        if (!pack.res.ok || task.success === false) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, task));
        }
        appendLogs(task.logs);
        setProgress(task);
        if (task.plan) renderPlan(task.plan);

        if (task.status === 'awaiting_picks') {
          stopPoll();
          setBusy(false);
          renderShots(task.shots_ui || [], task.aspect);
          return;
        }
        if (task.status === 'done') {
          stopPoll();
          setBusy(false);
          confirmBtn.style.display = 'none';
          openOutputBtn.style.display = '';
          if (task.shots_ui) renderShots(task.shots_ui, task.aspect);
          videoBox.style.display = '';
          exportHint.textContent =
            task.export_hint ||
            tr('privateHub.homePc.trailerExportHint', '粗剪已生成，素材可导入剪映。');
          if (task.video_url) {
            resultVideo.src = resolveUrl(task.video_url);
          }
          return;
        }
        if (task.status === 'error' || task.status === 'cancelled') {
          stopPoll();
          setBusy(false);
          if (task.error) {
            progressStatus.textContent = task.error;
          }
        }
      })
      .catch(function (err) {
        stopPoll();
        setBusy(false);
        progressWrap.style.display = '';
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  function startPoll() {
    stopPoll();
    poll();
    pollingTimer = setInterval(poll, 1600);
  }

  styleRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-style]');
    if (!btn) return;
    Array.prototype.forEach.call(styleRow.querySelectorAll('[data-style]'), function (el) {
      el.classList.toggle('is-active', el === btn);
    });
    selectedStyle = btn.getAttribute('data-style') || 'realistic';
  });

  startBtn.addEventListener('click', function () {
    var text = (promptInput.value || '').trim();
    if (text.length < 2) {
      progressWrap.style.display = '';
      progressStatus.textContent = tr('privateHub.homePc.trailerNeedPrompt', '请先填写书名、影视名或梗概');
      return;
    }
    stopPoll();
    lastLogLen = 0;
    logOutput.textContent = '';
    planBox.style.display = 'none';
    shotsBox.style.display = 'none';
    videoBox.style.display = 'none';
    confirmBtn.style.display = 'none';
    openOutputBtn.style.display = 'none';
    picks = {};
    currentTaskId = null;

    var fd = new FormData();
    fd.append('prompt', text);
    fd.append('visual_style', selectedStyle);
    fd.append('aspect', selectedAspect());
    fd.append('candidates_per_shot', candidatesSelect.value || '3');
    fd.append('voice', voiceSelect.value || 'zh-CN-YunxiNeural');
    fd.append('speed', speedInput.value || '1.0');
    fd.append('target_seconds', '60');
    fd.append('video_mode', selectedVideoMode());

    setBusy(true);
    progressWrap.style.display = '';
    progressStatus.textContent = tr('privateHub.homePc.trailerStarting', '提交任务…');
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';

    fetch(API_BASE + '/trailer/start', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        currentTaskId = pack.body.task_id;
        cancelBtn.style.display = '';
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  });

  confirmBtn.addEventListener('click', function () {
    if (!currentTaskId) return;
    var fd = new FormData();
    fd.append('task_id', currentTaskId);
    fd.append('picks_json', JSON.stringify(picks));
    setBusy(true);
    videoBox.style.display = 'none';
    fetch(API_BASE + '/trailer/confirm-picks', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  });

  cancelBtn.addEventListener('click', function () {
    if (!currentTaskId) return;
    var fd = new FormData();
    fd.append('task_id', currentTaskId);
    fetch(API_BASE + '/trailer/cancel', { method: 'POST', body: fd }).finally(function () {
      stopPoll();
      setBusy(false);
      progressStatus.textContent = tr('privateHub.homePc.trailerStageCancelled', '已取消');
    });
  });

  openOutputBtn.addEventListener('click', function () {
    if (!currentTaskId) return;
    var fd = new FormData();
    fd.append('task_id', currentTaskId);
    fetch(API_BASE + '/trailer/reveal-output', { method: 'POST', body: fd }).catch(function () {});
  });

  clearBtn.addEventListener('click', function () {
    stopPoll();
    currentTaskId = null;
    lastLogLen = 0;
    picks = {};
    promptInput.value = '';
    logOutput.textContent = '';
    planBox.style.display = 'none';
    shotsBox.style.display = 'none';
    videoBox.style.display = 'none';
    progressWrap.style.display = 'none';
    confirmBtn.style.display = 'none';
    openOutputBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    setBusy(false);
  });
});
