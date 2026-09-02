document.addEventListener('DOMContentLoaded', function () {
  var startBtn = document.getElementById('start-btn');
  var confirmBtn = document.getElementById('confirm-btn');
  var confirmGlobalBtn = document.getElementById('confirm-global-btn');
  var skipGlobalBtn = document.getElementById('skip-global-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var clearBtn = document.getElementById('clear-btn');
  var openOutputBtn = document.getElementById('open-output-btn');
  var promptInput = document.getElementById('prompt-input');
  var candidatesSelect = document.getElementById('candidates-select');
  var shotDurationSelect = document.getElementById('shot-duration-select');
  var segmentCountInput = document.getElementById('segment-count-input');
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
  var bibleBox = document.getElementById('bible-box');
  var globalRefsBox = document.getElementById('global-refs-box');
  var globalRefsList = document.getElementById('global-refs-list');
  var globalRefFile = document.getElementById('global-ref-file');
  var shotsBox = document.getElementById('shots-box');
  var shotsList = document.getElementById('shots-list');
  var videoBox = document.getElementById('video-box');
  var resultVideo = document.getElementById('result-video');
  var exportHint = document.getElementById('export-hint');
  var compareVideoList = document.getElementById('compare-video-list');
  var logOutput = document.getElementById('log-output');
  var copyLogBtn = document.getElementById('copy-log-btn');
  var historyList = document.getElementById('history-list');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');

  var API_BASE = window.HomePcApi.base();
  var selectedStyle = 'realistic';
  var currentTaskId = null;
  var pollingTimer = null;
  var lastLogLen = 0;
  var picks = {};
  var globalRefPicks = {};
  var lightbox = document.getElementById('trailer-lightbox');
  var lightboxImg = document.getElementById('trailer-lightbox-img');
  var lightboxBackdrop = lightbox ? lightbox.querySelector('.trailer-lightbox-backdrop') : null;

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

  function applyAspectPreview(aspect) {
    var appEl = document.getElementById('app');
    if (!appEl) return;
    if ((aspect || selectedAspect()) === '9_16') appEl.classList.add('trailer-portrait-preview');
    else appEl.classList.remove('trailer-portrait-preview');
  }

  function showResultVideo(url, aspect, hint) {
    if (!videoBox || !resultVideo) return;
    applyAspectPreview(aspect);
    videoBox.style.display = 'block';
    if (exportHint) {
      exportHint.textContent =
        hint ||
        tr('privateHub.homePc.trailerExportHint', '粗剪已生成，素材可导入剪映。');
    }
    if (url) {
      var full = resolveUrl(url);
      // 强制刷新，避免同源同路径缓存导致空白
      resultVideo.src = full + (full.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
      try {
        resultVideo.load();
      } catch (e) {}
    }
    try {
      videoBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e2) {}
  }

  function renderCompareVideos(items, aspect, hint) {
    var list = Array.isArray(items) ? items.filter(function (x) { return x && x.url; }) : [];
    // 多引擎时隐藏与引擎成片重复的 primary trailer_16_9 / trailer_9_16
    if (list.length > 1) {
      list = list.filter(function (x) {
        var m = String(x.mode || '');
        return m && m !== 'primary';
      });
      if (!list.length && Array.isArray(items)) list = items.filter(function (x) { return x && x.url; });
    }
    if (!compareVideoList) {
      if (list.length) showResultVideo(list[0].url, aspect, hint);
      return;
    }
    compareVideoList.innerHTML = '';
    if (list.length <= 1) {
      compareVideoList.style.display = 'none';
      if (list.length === 1) showResultVideo(list[0].url, aspect, hint);
      return;
    }
    compareVideoList.style.display = '';
    list.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-btn';
      btn.textContent = item.label || item.mode || ('成片 ' + (idx + 1));
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(compareVideoList.querySelectorAll('.tb-btn'), function (el) {
          el.classList.toggle('is-active', el === btn);
        });
        showResultVideo(item.url, aspect, hint);
      });
      if (idx === 0) btn.classList.add('is-active');
      compareVideoList.appendChild(btn);
    });
    showResultVideo(list[0].url, aspect, hint);
  }

  function hideResultVideo() {
    if (!videoBox || !resultVideo) return;
    videoBox.style.display = 'none';
    resultVideo.removeAttribute('src');
    try {
      resultVideo.load();
    } catch (e) {}
    if (compareVideoList) {
      compareVideoList.innerHTML = '';
      compareVideoList.style.display = 'none';
    }
  }

  function openLightbox(src) {
    if (!lightbox || !lightboxImg || !src) return;
    lightboxImg.src = src;
    lightboxImg.title = tr('privateHub.homePc.trailerPreviewTapClose', '点击关闭');
    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImg.removeAttribute('src');
  }

  if (lightboxImg) lightboxImg.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  function selectedAspect() {
    var el = document.querySelector('input[name="aspect"]:checked');
    return el ? el.value : '16_9';
  }

  function selectedVideoMode() {
    var modes = selectedVideoModes();
    return modes[0] || 'wan22_5b';
  }

  function selectedVideoModes() {
    var nodes = document.querySelectorAll('input[name="video-mode"]:checked');
    var out = [];
    Array.prototype.forEach.call(nodes, function (el) {
      if (el && el.value) out.push(el.value);
    });
    return out.length ? out : ['wan22_5b'];
  }

  function appendVideoModes(fd) {
    var modes = selectedVideoModes();
    fd.append('video_mode', modes[0]);
    fd.append('video_modes', JSON.stringify(modes));
  }

  function showResultVideosFromTask(task) {
    var hint =
      (task && task.export_hint) ||
      tr('privateHub.homePc.trailerExportHint', '粗剪已生成，素材可导入剪映。');
    var aspect = (task && task.aspect) || selectedAspect();
    var urls = (task && task.video_urls) || [];
    if (urls.length > 1) {
      renderCompareVideos(urls, aspect, hint);
      return;
    }
    if (urls.length === 1) {
      showResultVideo(urls[0].url, aspect, hint);
      return;
    }
    if (task && task.video_url) {
      showResultVideo(task.video_url, aspect, hint);
    }
  }

  var startBtnDefaultText = startBtn ? (startBtn.textContent || '').trim() : '';

  function setBusy(busy) {
    if (startBtn) {
      if (busy) {
        startBtn.style.display = 'none';
        startBtn.disabled = false;
      } else {
        startBtn.style.display = '';
        startBtn.disabled = false;
        if (startBtnDefaultText) startBtn.textContent = startBtnDefaultText;
      }
    }
    if (confirmBtn) confirmBtn.disabled = !!busy;
    if (confirmGlobalBtn) confirmGlobalBtn.disabled = !!busy;
    if (skipGlobalBtn) skipGlobalBtn.disabled = !!busy;
    if (cancelBtn) cancelBtn.style.display = busy && currentTaskId ? '' : 'none';
    if (clearBtn) clearBtn.disabled = !!busy;
  }

  function selectedUseGlobalRefs() {
    var el = document.querySelector('input[name="use-global-refs"]:checked');
    return !el || el.value !== '0';
  }

  function hideGlobalRefsUi() {
    if (globalRefsBox) globalRefsBox.style.display = 'none';
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = 'none';
  }

  function resetProgressUi(message) {
    progressWrap.style.display = '';
    progressStatus.textContent = message || tr('privateHub.homePc.trailerStarting', '提交任务…');
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';
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
      awaiting_global_refs: tr('privateHub.homePc.trailerStageGlobalRefs', '等待确认全剧参考'),
      global_refs: tr('privateHub.homePc.trailerStageGlobalGen', '生成全剧参考图…'),
      compose: tr('privateHub.homePc.trailerStageCompose', '配音与拼接…'),
      i2v: tr('privateHub.homePc.trailerStageI2v', '图生视频…'),
      t2v: tr('privateHub.homePc.trailerStageT2v', '文生视频…'),
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
    if (task.status === 'awaiting_picks' || task.status === 'done' || task.status === 'awaiting_global_refs') pct = 100;
    progressPercent.textContent = pct + '%';
    progressBar.style.width = pct + '%';
  }

  function renderBible(plan) {
    if (!bibleBox) return;
    var bible = (plan && plan.bible) || {};
    var chars = bible.characters || plan.characters || [];
    var lines = [];
    if (bible.style_notes) lines.push('<div><strong>画风</strong> ' + escapeHtml(bible.style_notes) + '</div>');
    if (bible.world_look) lines.push('<div><strong>风貌</strong> ' + escapeHtml(bible.world_look) + '</div>');
    if (bible.palette) lines.push('<div><strong>色调</strong> ' + escapeHtml(bible.palette) + '</div>');
    if (bible.mood) lines.push('<div><strong>情绪</strong> ' + escapeHtml(bible.mood) + '</div>');
    if (bible.relationships) lines.push('<div><strong>关系</strong> ' + escapeHtml(bible.relationships) + '</div>');
    if (chars.length) {
      var ch = chars
        .map(function (c) {
          return escapeHtml((c.name || '') + (c.look ? '：' + c.look : ''));
        })
        .join('；');
      lines.push('<div><strong>角色</strong> ' + ch + '</div>');
    }
    if (!lines.length) {
      bibleBox.style.display = 'none';
      bibleBox.innerHTML = '';
      return;
    }
    bibleBox.style.display = 'block';
    bibleBox.innerHTML =
      '<h4 class="trailer-bible-title">' +
      escapeHtml(tr('privateHub.homePc.trailerBibleTitle', '全剧设定（DeepSeek）')) +
      '</h4>' +
      lines.join('');
  }

  function renderPlan(plan) {
    if (!plan) {
      planBox.style.display = 'none';
      if (bibleBox) bibleBox.style.display = 'none';
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
    renderBible(plan);
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

  function renderGlobalRefs(items, showActions) {
    if (!globalRefsBox || !globalRefsList) return;
    if (!Array.isArray(items) || !items.length) {
      if (!showActions) {
        globalRefsBox.style.display = 'none';
        return;
      }
    }
    globalRefsBox.style.display = 'block';
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = showActions ? '' : 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = showActions ? '' : 'none';
    globalRefsList.innerHTML = '';
    if (showActions) globalRefPicks = {};
    (items || []).forEach(function (it, i) {
      var fn = it.filename || ('ref_' + i);
      var selected = showActions
        ? it.selected !== false
        : !!(it.selected || (globalRefPicks[fn] !== false));
      if (showActions) globalRefPicks[fn] = selected;
      var label = document.createElement('label');
      label.className = 'trailer-cand' + (selected ? ' is-selected' : '');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected;
      if (!showActions) input.disabled = true;
      input.addEventListener('change', function () {
        globalRefPicks[fn] = !!input.checked;
        label.classList.toggle('is-selected', input.checked);
      });
      var img = document.createElement('img');
      var src = resolveUrl(it.url);
      img.src = src;
      img.alt = it.label || fn;
      img.loading = 'lazy';
      img.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(src);
      });
      var zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'trailer-cand-zoom';
      zoomBtn.title = tr('privateHub.homePc.trailerZoomHint', '放大');
      zoomBtn.innerHTML = '<i class="fas fa-search-plus" aria-hidden="true"></i>';
      zoomBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(src);
      });
      var cap = document.createElement('span');
      cap.className = 'trailer-cand-cap';
      cap.textContent = (it.source === 'upload' ? '上传 · ' : 'AI · ') + (it.label || fn);
      label.appendChild(input);
      label.appendChild(img);
      label.appendChild(zoomBtn);
      label.appendChild(cap);
      globalRefsList.appendChild(label);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderShots(shotsUi, aspect, showConfirm) {
    if (!Array.isArray(shotsUi) || !shotsUi.length) {
      shotsBox.style.display = 'none';
      confirmBtn.style.display = 'none';
      return;
    }
    applyAspectPreview(aspect);
    shotsBox.style.display = 'block';
    confirmBtn.style.display = showConfirm ? '' : 'none';
    var shotsTitle = document.getElementById('shots-title');
    var shotsHint = document.getElementById('shots-hint');
    if (showConfirm) {
      if (shotsTitle) {
        shotsTitle.textContent = tr('privateHub.homePc.trailerShotsTitle', '勾选每镜关键帧');
      }
      if (shotsHint) {
        shotsHint.textContent = tr(
          'privateHub.homePc.trailerShotsHint',
          '每组分镜点选一张；全部选好后点「确认选图并成片」。'
        );
      }
    }
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
        var imgSrc = resolveUrl(c.url);
        img.src = imgSrc;
        img.alt = 'shot ' + idx + ' cand ' + ci;
        img.loading = 'lazy';
        img.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openLightbox(imgSrc);
        });
        var zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'trailer-cand-zoom';
        zoomBtn.title = tr('privateHub.homePc.trailerZoomHint', '放大');
        zoomBtn.setAttribute('aria-label', zoomBtn.title);
        zoomBtn.innerHTML = '<i class="fas fa-search-plus" aria-hidden="true"></i>';
        zoomBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openLightbox(imgSrc);
        });
        label.appendChild(input);
        label.appendChild(img);
        label.appendChild(zoomBtn);
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

        if (task.status === 'awaiting_global_refs') {
          stopPoll();
          setBusy(false);
          renderGlobalRefs(task.global_refs_ui || [], true);
          return;
        }
        if (task.status === 'awaiting_picks') {
          stopPoll();
          setBusy(false);
          hideGlobalRefsUi();
          if (task.global_refs_ui && task.global_refs_ui.length) {
            renderGlobalRefs(task.global_refs_ui, false);
          }
          renderShots(task.shots_ui || [], task.aspect, true);
          return;
        }
        if (task.status === 'done') {
          stopPoll();
          setBusy(false);
          hideGlobalRefsUi();
          confirmBtn.style.display = 'none';
          openOutputBtn.style.display = '';
          progressStatus.textContent = tr(
            'privateHub.homePc.trailerStageDone',
            '成片已就绪，请看上方预览播放器'
          );
          showResultVideosFromTask(task);
          if (task.global_refs_ui && task.global_refs_ui.length) {
            renderGlobalRefs(task.global_refs_ui, false);
          }
          if (task.shots_ui) renderShots(task.shots_ui, task.aspect, false);
          var shotsTitle = document.getElementById('shots-title');
          var shotsHint = document.getElementById('shots-hint');
          if (shotsTitle) {
            shotsTitle.textContent = tr('privateHub.homePc.trailerShotsDoneTitle', '所用关键帧');
          }
          if (shotsHint) {
            shotsHint.textContent = tr(
              'privateHub.homePc.trailerShotsDoneHint',
              '成片在上方预览区，请点播放。'
            );
          }
          loadHistory();
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
    if (bibleBox) {
      bibleBox.style.display = 'none';
      bibleBox.innerHTML = '';
    }
    shotsBox.style.display = 'none';
    hideResultVideo();
    hideGlobalRefsUi();
    confirmBtn.style.display = 'none';
    openOutputBtn.style.display = 'none';
    picks = {};
    globalRefPicks = {};
    currentTaskId = null;

    var fd = new FormData();
    fd.append('prompt', text);
    fd.append('visual_style', selectedStyle);
    fd.append('aspect', selectedAspect());
    fd.append('candidates_per_shot', candidatesSelect.value || '1');
    fd.append('use_global_refs', selectedUseGlobalRefs() ? '1' : '0');
    fd.append('voice', (voiceSelect && voiceSelect.value) || 'zh-CN-YunxiNeural');
    fd.append('speed', (speedInput && speedInput.value) || '1.0');
    fd.append('shot_duration', shotDurationSelect ? shotDurationSelect.value : '5');
    var segN = 1;
    if (segmentCountInput) {
      segN = parseInt(segmentCountInput.value, 10);
      if (!isFinite(segN) || segN < 1) segN = 1;
      if (segN > 30) segN = 30;
      segmentCountInput.value = String(segN);
    }
    fd.append('segment_count', String(segN));
    appendVideoModes(fd);

    setBusy(true);
    resetProgressUi(tr('privateHub.homePc.trailerStarting', '提交任务…'));

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

  function loadHistory() {
    if (!historyList) return;
    fetch(API_BASE + '/trailer/history?limit=20')
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        renderHistory(pack.body.items || []);
      })
      .catch(function () {
        if (historyList) {
          historyList.innerHTML =
            '<p class="trailer-history-empty">' +
            escapeHtml(tr('privateHub.homePc.trailerHistoryEmpty', '暂无历史记录')) +
            '</p>';
        }
      });
  }

  function renderHistory(items) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (!items.length) {
      historyList.innerHTML =
        '<p class="trailer-history-empty">' +
        escapeHtml(tr('privateHub.homePc.trailerHistoryEmpty', '暂无历史记录')) +
        '</p>';
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'trailer-history-item';
      var meta = document.createElement('p');
      meta.className = 'trailer-history-meta';
      meta.innerHTML =
        '<strong>' +
        escapeHtml(item.title || item.folder || '') +
        '</strong><br/>' +
        escapeHtml(item.created_display || '') +
        ' · ' +
        (item.shot_count || 0) +
        ' 镜 · ' +
        (item.image_count || 0) +
        ' 图';
      card.appendChild(meta);
      var thumbs = document.createElement('div');
      thumbs.className = 'trailer-history-thumbs';
      (item.thumbs || []).forEach(function (u) {
        var img = document.createElement('img');
        img.src = resolveUrl(u);
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('click', function () {
          openLightbox(resolveUrl(u));
        });
        thumbs.appendChild(img);
      });
      card.appendChild(thumbs);
      var actions = document.createElement('div');
      actions.className = 'action-row';
      var reuseBtn = document.createElement('button');
      reuseBtn.type = 'button';
      reuseBtn.className = 'tb-btn';
      reuseBtn.textContent = tr('privateHub.homePc.trailerHistoryReuse', '复用成片');
      reuseBtn.addEventListener('click', function () {
        reuseHistory(item.folder, true);
      });
      var loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'tb-btn';
      loadBtn.textContent = tr('privateHub.homePc.trailerHistoryLoad', '加载选图');
      loadBtn.addEventListener('click', function () {
        reuseHistory(item.folder, false);
      });
      actions.appendChild(reuseBtn);
      actions.appendChild(loadBtn);
      if (item.video_url || (item.video_urls && item.video_urls.length)) {
        var openVid = document.createElement('button');
        openVid.type = 'button';
        openVid.className = 'tb-btn';
        openVid.textContent = tr('privateHub.homePc.trailerHistoryOpenVideo', '打开成片');
        openVid.addEventListener('click', function () {
          showResultVideosFromTask(item);
        });
        actions.appendChild(openVid);
      }
      card.appendChild(actions);
      historyList.appendChild(card);
    });
  }

  function reuseHistory(folder, autoCompose) {
    if (!folder) return;
    stopPoll();
    lastLogLen = 0;
    logOutput.textContent = '';
    hideResultVideo();
    var fd = new FormData();
    fd.append('folder', folder);
    fd.append('voice', (voiceSelect && voiceSelect.value) || 'zh-CN-YunxiNeural');
    fd.append('speed', (speedInput && speedInput.value) || '1.0');
    fd.append('shot_duration', shotDurationSelect ? shotDurationSelect.value : '');
    appendVideoModes(fd);
    fd.append('auto_compose', autoCompose ? '1' : '0');
    setBusy(true);
    if (autoCompose) {
      resetProgressUi(tr('privateHub.homePc.trailerHistoryReuseCompose', '复用历史关键帧，正在成片…'));
    } else {
      resetProgressUi(tr('privateHub.homePc.trailerHistoryReuseOk', '已加载历史关键帧'));
    }
    fetch(API_BASE + '/trailer/reuse', { method: 'POST', body: fd })
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
        if (pack.body.plan) renderPlan(pack.body.plan);
        if (pack.body.shots_ui && pack.body.shots_ui.length) {
          renderShots(pack.body.shots_ui, selectedAspect(), !pack.body.auto_compose);
        }
        if (pack.body.auto_compose) {
          startPoll();
        } else {
          setBusy(false);
          stopPoll();
        }
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  if (historyRefreshBtn) {
    historyRefreshBtn.addEventListener('click', function () {
      loadHistory();
    });
  }
  loadHistory();

  function confirmGlobalRefs(skip) {
    if (!currentTaskId) return;
    var selected = [];
    if (!skip) {
      Object.keys(globalRefPicks).forEach(function (fn) {
        if (globalRefPicks[fn]) selected.push(fn);
      });
    }
    var fd = new FormData();
    fd.append('task_id', currentTaskId);
    fd.append('selected_json', JSON.stringify(selected));
    fd.append('skip', skip ? '1' : '0');
    setBusy(true);
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = 'none';
    fetch(API_BASE + '/trailer/confirm-global-refs', { method: 'POST', body: fd })
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
        if (confirmGlobalBtn) confirmGlobalBtn.style.display = '';
        if (skipGlobalBtn) skipGlobalBtn.style.display = '';
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  if (confirmGlobalBtn) {
    confirmGlobalBtn.addEventListener('click', function () {
      confirmGlobalRefs(false);
    });
  }
  if (skipGlobalBtn) {
    skipGlobalBtn.addEventListener('click', function () {
      confirmGlobalRefs(true);
    });
  }

  if (globalRefFile) {
    globalRefFile.addEventListener('change', function () {
      if (!currentTaskId || !globalRefFile.files || !globalRefFile.files.length) return;
      var files = Array.prototype.slice.call(globalRefFile.files);
      globalRefFile.value = '';
      var compress =
        window.TBImageUploadCompress && TBImageUploadCompress.compressMany
          ? TBImageUploadCompress.compressMany(files, 'default')
          : Promise.resolve(files);
      compress
        .then(function (list) {
          var chain = Promise.resolve();
          (list || []).forEach(function (file) {
            chain = chain.then(function () {
              var fd = new FormData();
              fd.append('task_id', currentTaskId);
              fd.append('file', file);
              return fetch(API_BASE + '/trailer/upload-global-ref', { method: 'POST', body: fd }).then(
                function (res) {
                  return res.json().then(function (body) {
                    return { res: res, body: body };
                  });
                }
              ).then(function (pack) {
                if (!pack.res.ok || !pack.body.success) {
                  throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
                }
                renderGlobalRefs(pack.body.global_refs_ui || [], true);
              });
            });
          });
          return chain;
        })
        .catch(function (err) {
          progressWrap.style.display = '';
          progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
        });
    });
  }

  confirmBtn.addEventListener('click', function () {
    if (!currentTaskId) return;
    var fd = new FormData();
    fd.append('task_id', currentTaskId);
    fd.append('picks_json', JSON.stringify(picks));
    setBusy(true);
    hideResultVideo();
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

  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      var text = (logOutput && logOutput.textContent) || '';
      if (!String(text).trim()) {
        progressStatus.textContent = tr('privateHub.homePc.logEmpty', '暂无日志可复制');
        progressWrap.style.display = '';
        return;
      }
      var label = copyLogBtn.textContent;
      window.HomePcApi.copyText(text)
        .then(function () {
          copyLogBtn.textContent = tr('privateHub.homePc.logCopied', '已复制');
          setTimeout(function () {
            copyLogBtn.textContent = label;
          }, 1500);
        })
        .catch(function () {
          progressStatus.textContent = tr('privateHub.homePc.logCopyFail', '复制失败，请手动选择复制');
          progressWrap.style.display = '';
        });
    });
  }

  clearBtn.addEventListener('click', function () {
    stopPoll();
    currentTaskId = null;
    lastLogLen = 0;
    picks = {};
    globalRefPicks = {};
    promptInput.value = '';
    logOutput.textContent = '';
    planBox.style.display = 'none';
    if (bibleBox) {
      bibleBox.style.display = 'none';
      bibleBox.innerHTML = '';
    }
    shotsBox.style.display = 'none';
    hideResultVideo();
    hideGlobalRefsUi();
    progressWrap.style.display = 'none';
    confirmBtn.style.display = 'none';
    openOutputBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    setBusy(false);
  });
});
