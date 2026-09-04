/**
 * 家里电脑 · 图片流水线
 */
(function () {
  'use strict';

  var API_BASE = window.HomePcApi.base();
  var currentTaskId = null;
  var currentFolder = null;
  var currentTask = null;
  var pollTimer = null;
  var busy = false;

  var themeInput = document.getElementById('theme-input');
  var titleInput = document.getElementById('batch-title');
  var countInput = document.getElementById('count-input');
  var styleSelect = document.getElementById('style-select');
  var categorySelect = document.getElementById('category-select');
  var aspectSelect = document.getElementById('aspect-select');
  var modeSelect = document.getElementById('mode-select');
  var extraInput = document.getElementById('extra-input');
  var manualInput = document.getElementById('manual-input');
  var negInput = document.getElementById('neg-input');
  var seedInput = document.getElementById('seed-input');
  var manualWrap = document.getElementById('manual-wrap');
  var extraWrap = document.getElementById('extra-wrap');
  var startBtn = document.getElementById('start-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var openFolderBtn = document.getElementById('open-folder-btn');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var resultBox = document.getElementById('result-box');
  var resultMeta = document.getElementById('result-meta');
  var resultGrid = document.getElementById('result-grid');
  var historyList = document.getElementById('history-list');
  var logOutput = document.getElementById('log-output');
  var flashEl = document.getElementById('flash-msg');
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxBackdrop = document.getElementById('lightbox-backdrop');
  var lightboxPrev = document.getElementById('lightbox-prev');
  var lightboxNext = document.getElementById('lightbox-next');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lightboxIndex = -1;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function flashMsg(msg, isErr) {
    if (!flashEl) return;
    flashEl.style.display = '';
    flashEl.textContent = msg || '';
    flashEl.className = 'home-pc-flash' + (isErr ? ' home-pc-flash--err' : '');
  }

  function resolveUrl(url) {
    return window.HomePcApi.assetUrl(url);
  }

  function setBusy(on) {
    busy = !!on;
    if (startBtn) startBtn.disabled = busy;
    document.querySelectorAll('[data-job-btn]').forEach(function (el) {
      el.disabled = busy;
    });
  }

  function syncModeUi() {
    var mode = modeSelect ? modeSelect.value : 'auto';
    if (manualWrap) manualWrap.style.display = mode === 'manual' ? '' : 'none';
    if (extraWrap) extraWrap.style.display = mode === 'manual' ? 'none' : '';
  }

  function fillSelect(sel, map, preferred) {
    if (!sel || !map) return;
    sel.innerHTML = '';
    Object.keys(map).forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = map[k];
      sel.appendChild(opt);
    });
    if (preferred && map[preferred]) sel.value = preferred;
  }

  function loadDefaults() {
    return fetch(API_BASE + '/image-pipeline/defaults')
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) return;
        fillSelect(styleSelect, pack.body.styles, 'realistic');
        fillSelect(categorySelect, pack.body.categories, 'landscape');
        fillSelect(aspectSelect, pack.body.aspects, '1_1');
      })
      .catch(function () {
        fillSelect(
          styleSelect,
          {
            realistic: '写实摄影',
            cartoon: '卡通',
            anime: '二次元',
            ink: '水墨',
            watercolor: '水彩',
            oil: '油画',
            cyberpunk: '赛博朋克',
            flat: '扁平插画'
          },
          'realistic'
        );
        fillSelect(
          categorySelect,
          {
            landscape: '风景',
            character: '人物',
            product: '产品',
            food: '美食',
            animal: '动物',
            architecture: '建筑',
            abstract: '抽象',
            poster: '海报构图',
            wallpaper: '壁纸',
            other: '其他'
          },
          'landscape'
        );
        fillSelect(
          aspectSelect,
          {
            '1_1': '方形 1:1',
            '16_9': '横屏 16:9',
            '9_16': '竖屏 9:16',
            '3_4': '竖图 3:4',
            '4_3': '横图 4:3'
          },
          '1_1'
        );
      });
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      if (!currentTaskId) return;
      fetchStatus(currentTaskId);
    }, 1600);
    fetchStatus(currentTaskId);
  }

  function applyLogs(task) {
    if (!logOutput) return;
    var logs = (task && task.logs) || [];
    logOutput.textContent = logs.join('\n');
  }

  function applyProgress(task) {
    if (!task) return;
    var st = task.status || '';
    var prog = task.progress || {};
    var cur = Number(prog.current || 0);
    var tot = Number(prog.total || 0) || 1;
    var pct = Math.max(0, Math.min(100, Math.round((cur / tot) * 100)));
    if (progressWrap) progressWrap.style.display = '';
    if (progressBar) progressBar.style.width = pct + '%';
    if (progressPercent) progressPercent.textContent = cur + '/' + tot;
    if (progressStatus) {
      if (st === 'done') {
        progressStatus.textContent = tr('privateHub.homePc.imagePipeDone', '本批完成');
      } else if (st === 'error') {
        progressStatus.textContent =
          tr('privateHub.homePc.imagePipeFailed', '生成失败') +
          (task.error ? '：' + task.error : '');
      } else if (st === 'cancelled') {
        progressStatus.textContent = tr('privateHub.homePc.imagePipeCancel', '取消');
      } else {
        progressStatus.textContent =
          tr('privateHub.homePc.imagePipeWorking', '排队生成中…') +
          (task.stage ? ' · ' + task.stage : '');
      }
    }
    if (cancelBtn) {
      cancelBtn.style.display = st === 'running' || st === 'queued' ? '' : 'none';
    }
    if (openFolderBtn) {
      openFolderBtn.style.display = task.output_dir || currentFolder ? '' : 'none';
    }
  }

  function galleryImages() {
    return (currentTask && currentTask.images) || [];
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.style.display = 'none';
    lightbox.setAttribute('hidden', '');
    lightboxIndex = -1;
    if (lightboxImg) lightboxImg.src = '';
    if (lightboxCaption) lightboxCaption.textContent = '';
  }

  function updateLightboxNav() {
    var imgs = galleryImages();
    var n = imgs.length;
    var atStart = lightboxIndex <= 0;
    var atEnd = lightboxIndex < 0 || lightboxIndex >= n - 1;
    if (lightboxPrev) {
      lightboxPrev.disabled = atStart;
      lightboxPrev.classList.toggle('is-disabled', atStart);
      lightboxPrev.setAttribute('aria-disabled', atStart ? 'true' : 'false');
    }
    if (lightboxNext) {
      lightboxNext.disabled = atEnd;
      lightboxNext.classList.toggle('is-disabled', atEnd);
      lightboxNext.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
    }
  }

  function showLightboxAt(index) {
    var imgs = galleryImages();
    if (!lightbox || !lightboxImg || !imgs.length) return;
    if (index < 0 || index >= imgs.length) return;
    lightboxIndex = index;
    var it = imgs[index];
    lightboxImg.src = resolveUrl(it.url);
    lightboxImg.alt = it.prompt || '';
    if (lightboxCaption) {
      var elapsed =
        it.elapsed_sec != null
          ? ' · ' + Number(it.elapsed_sec).toFixed(1) + 's'
          : '';
      lightboxCaption.textContent =
        '#' +
        (it.index || index + 1) +
        ' / ' +
        imgs.length +
        elapsed +
        (it.seed != null ? ' · seed=' + it.seed : '') +
        '\n' +
        (it.prompt || '');
    }
    lightbox.style.display = '';
    lightbox.removeAttribute('hidden');
    updateLightboxNav();
  }

  function openLightboxByIndex(index) {
    showLightboxAt(index);
  }

  function stepLightbox(delta) {
    var imgs = galleryImages();
    if (!imgs.length || lightboxIndex < 0) return;
    var next = lightboxIndex + delta;
    if (next < 0 || next >= imgs.length) {
      flashMsg(
        next < 0
          ? tr('privateHub.homePc.imagePipeLbFirst', '已经是第一张')
          : tr('privateHub.homePc.imagePipeLbLast', '已经是最后一张'),
        true
      );
      return;
    }
    showLightboxAt(next);
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function renderResults(task) {
    currentTask = task || null;
    var images = (task && task.images) || [];
    if (!resultBox || !resultGrid) return;
    if (!images.length) {
      resultBox.style.display = 'none';
      resultGrid.innerHTML = '';
      return;
    }
    resultBox.style.display = '';
    if (resultMeta) {
      var timing = task.timing || {};
      var timingLabel = '';
      if (timing.batch_sec != null) {
        timingLabel = ' · 总耗时 ' + Number(timing.batch_sec).toFixed(1) + 's';
      }
      resultMeta.textContent =
        (task.title || '') +
        ' · ' +
        (task.style_label || task.style || '') +
        ' · ' +
        (task.category_label || task.category || '') +
        ' · ' +
        images.length +
        ' 张' +
        (task.plan_source ? ' · plan=' + task.plan_source : '') +
        timingLabel;
    }
    resultGrid.innerHTML = '';
    images.forEach(function (it, idx) {
      var card = document.createElement('label');
      card.className = 'image-pipe-card';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'image-pipe-check';
      check.setAttribute('data-index', String(it.index || ''));
      check.checked = !it.published;
      var img = document.createElement('img');
      img.src = resolveUrl(it.thumb_url || it.url);
      img.alt = it.prompt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('click', function (e) {
        e.preventDefault();
        openLightboxByIndex(idx);
      });
      var meta = document.createElement('div');
      meta.className = 'image-pipe-card-meta';
      var elapsed =
        it.elapsed_sec != null
          ? ' · ' + Number(it.elapsed_sec).toFixed(1) + 's'
          : '';
      meta.innerHTML =
        '<div class="image-pipe-card-idx">#' +
        (it.index || '') +
        elapsed +
        (it.published
          ? ' · ' + tr('privateHub.homePc.imagePipePublished', '已公开')
          : '') +
        '</div>' +
        '<div class="image-pipe-card-prompt" title="' +
        escapeAttr(it.prompt || '') +
        '">' +
        escapeAttr(String(it.prompt || '').slice(0, 90)) +
        (String(it.prompt || '').length > 90 ? '…' : '') +
        '</div>';
      card.appendChild(check);
      card.appendChild(img);
      card.appendChild(meta);
      resultGrid.appendChild(card);
    });
    if (lightbox && !lightbox.hasAttribute('hidden') && lightboxIndex >= 0) {
      if (lightboxIndex >= images.length) closeLightbox();
      else showLightboxAt(lightboxIndex);
    }
  }

  function fetchStatus(taskId) {
    return fetch(API_BASE + '/image-pipeline/status?task_id=' + encodeURIComponent(taskId))
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) return;
        var task = pack.body;
        currentFolder = task.output_dir || currentFolder;
        applyLogs(task);
        applyProgress(task);
        renderResults(task);
        if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
          stopPoll();
          setBusy(false);
          if (task.status === 'done') {
            flashMsg(tr('privateHub.homePc.imagePipeDone', '本批完成'));
          } else if (task.status === 'error') {
            flashMsg(
              tr('privateHub.homePc.imagePipeFailed', '生成失败') +
                (task.error ? '：' + task.error : ''),
              true
            );
          }
          loadHistory();
        }
      })
      .catch(function () {});
  }

  function startJob() {
    var theme = (themeInput && themeInput.value) || '';
    if (!String(theme).trim()) {
      flashMsg(tr('privateHub.homePc.imagePipeNeedTheme', '请填写主题描述'), true);
      return;
    }
    var mode = modeSelect ? modeSelect.value : 'auto';
    if (mode === 'manual') {
      var man = (manualInput && manualInput.value) || '';
      if (!String(man).trim()) {
        flashMsg(tr('privateHub.homePc.imagePipeNeedManual', '手动模式请每行一条提示词'), true);
        return;
      }
    }
    var fd = new FormData();
    fd.append('title', (titleInput && titleInput.value) || '');
    fd.append('theme', theme.trim());
    fd.append('style', styleSelect ? styleSelect.value : 'realistic');
    fd.append('category', categorySelect ? categorySelect.value : 'other');
    fd.append('count', countInput ? String(countInput.value || '4') : '4');
    fd.append('aspect', aspectSelect ? aspectSelect.value : '1_1');
    fd.append('prompt_mode', mode);
    fd.append('extra', (extraInput && extraInput.value) || '');
    fd.append('negative', (negInput && negInput.value) || '');
    fd.append('manual_prompts', (manualInput && manualInput.value) || '');
    fd.append('seed', (seedInput && seedInput.value) || '');

    setBusy(true);
    if (progressWrap) progressWrap.style.display = '';
    if (progressStatus) {
      progressStatus.textContent = tr('privateHub.homePc.imagePipeWorking', '排队生成中…');
    }
    if (logOutput) logOutput.textContent = '';
    fetch(API_BASE + '/image-pipeline/start', { method: 'POST', body: fd })
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
        currentFolder = pack.body.output_dir || null;
        if (cancelBtn) cancelBtn.style.display = '';
        if (openFolderBtn) openFolderBtn.style.display = '';
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
      });
  }

  function selectedIndices() {
    var out = [];
    if (!resultGrid) return out;
    resultGrid.querySelectorAll('.image-pipe-check:checked').forEach(function (el) {
      out.push(el.getAttribute('data-index'));
    });
    return out;
  }

  function publishSelected() {
    var indices = selectedIndices();
    if (!indices.length) {
      flashMsg(tr('privateHub.homePc.imagePipeNeedSelect', '请先勾选要公开的图片'), true);
      return;
    }
    if (!window.TBImageCloud || !window.TBImageCloud.publishPublicImage) {
      flashMsg(tr('privateHub.homePc.imagePipePublishFail', '公开失败') + '（缺少 image-cloud-client）', true);
      return;
    }
    var images = ((currentTask && currentTask.images) || []).filter(function (it) {
      return indices.indexOf(String(it.index)) >= 0;
    });
    if (!images.length) {
      flashMsg(tr('privateHub.homePc.imagePipeNeedSelect', '请先勾选要公开的图片'), true);
      return;
    }
    setBusy(true);
    flashMsg(tr('privateHub.homePc.imagePipePublish', '公开到前台') + '…');
    var ok = 0;
    var fail = 0;
    var chain = Promise.resolve();
    images.forEach(function (it) {
      chain = chain.then(function () {
        var url = resolveUrl(it.url);
        return fetch(url)
          .then(function (res) {
            if (!res.ok) throw new Error('fetch image failed');
            return res.blob();
          })
          .then(function (blob) {
            var cat = (currentTask && (currentTask.category_label || currentTask.category)) || '';
            var prompt =
              (cat ? '[' + cat + '] ' : '') +
              (it.prompt || (currentTask && currentTask.theme) || '');
            return window.TBImageCloud.publishPublicImage(blob, {
              prompt: prompt,
              model: 'home-pc/z-image-turbo',
              source: 'image_pipeline',
              filename: 'pipe-' + (it.index || '1') + '.png'
            });
          })
          .then(function () {
            ok += 1;
            it.published = true;
          })
          .catch(function () {
            fail += 1;
          });
      });
    });
    chain
      .then(function () {
        if (ok && (currentTaskId || currentFolder)) {
          var fd = new FormData();
          if (currentTaskId) fd.append('task_id', currentTaskId);
          if (currentFolder) fd.append('folder', currentFolder);
          fd.append('indices', indices.join(','));
          return fetch(API_BASE + '/image-pipeline/mark-published', {
            method: 'POST',
            body: fd
          }).catch(function () {});
        }
      })
      .then(function () {
        setBusy(false);
        renderResults(currentTask);
        if (ok && !fail) {
          flashMsg(tr('privateHub.homePc.imagePipePublishDone', '已公开到图片页') + ' · ' + ok);
        } else if (ok) {
          flashMsg(
            tr('privateHub.homePc.imagePipePublishPartial', '部分公开成功') +
              ' · ok=' +
              ok +
              ' fail=' +
              fail,
            true
          );
        } else {
          flashMsg(tr('privateHub.homePc.imagePipePublishFail', '公开失败'), true);
        }
      });
  }

  function loadHistory() {
    if (!historyList) return;
    fetch(API_BASE + '/image-pipeline/history?limit=30')
      .then(function (res) {
        return res.json();
      })
      .then(function (body) {
        if (!body || !body.success) {
          historyList.innerHTML =
            '<p class="small-hint">' +
            tr('privateHub.homePc.imagePipeHistoryEmpty', '暂无历史') +
            '</p>';
          return;
        }
        var items = body.items || [];
        if (!items.length) {
          historyList.innerHTML =
            '<p class="small-hint">' +
            tr('privateHub.homePc.imagePipeHistoryEmpty', '暂无历史') +
            '</p>';
          return;
        }
        historyList.innerHTML = '';
        items.forEach(function (it) {
          var row = document.createElement('div');
          row.className = 'image-pipe-history-row';
          var left = document.createElement('div');
          left.className = 'image-pipe-history-meta';
          left.innerHTML =
            '<strong>' +
            (it.title || it.folder || '') +
            '</strong>' +
            '<div class="small-hint">' +
            (it.theme || '') +
            ' · ' +
            (it.style || '') +
            '/' +
            (it.category || '') +
            ' · ' +
            (it.image_count || it.count || 0) +
            ' · ' +
            (it.status || '') +
            '</div>';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tb-btn';
          btn.setAttribute('data-job-btn', '1');
          btn.textContent = tr('privateHub.homePc.imagePipeHistoryOpen', '打开');
          btn.addEventListener('click', function () {
            openHistory(it);
          });
          row.appendChild(left);
          row.appendChild(btn);
          historyList.appendChild(row);
        });
      })
      .catch(function () {
        historyList.innerHTML =
          '<p class="small-hint">' +
          tr('privateHub.homePc.imagePipeHistoryEmpty', '暂无历史') +
          '</p>';
      });
  }

  function setSelectValue(sel, value) {
    if (!sel || value == null || value === '') return;
    var v = String(value);
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === v) {
        found = true;
        break;
      }
    }
    if (found) sel.value = v;
  }

  function fillFormFromTask(task) {
    if (!task) return;
    if (titleInput) titleInput.value = task.title || '';
    if (themeInput) themeInput.value = task.theme || '';
    if (countInput) {
      var n = Number(task.count || (task.images && task.images.length) || 4);
      countInput.value = String(Math.max(1, Math.min(24, n || 4)));
    }
    setSelectValue(styleSelect, task.style);
    setSelectValue(categorySelect, task.category);
    setSelectValue(aspectSelect, task.aspect);
    setSelectValue(modeSelect, task.prompt_mode || 'auto');
    syncModeUi();
    if (extraInput) extraInput.value = task.extra || '';
    if (negInput) negInput.value = task.negative || '';
    if (manualInput) manualInput.value = task.manual_prompts || '';
    if (seedInput) {
      seedInput.value =
        task.seed_base != null && task.seed_base !== '' ? String(task.seed_base) : '';
    }
  }

  function openHistory(it) {
    var fd = new FormData();
    if (it.folder) fd.append('folder', it.folder);
    if (it.task_id) fd.append('task_id', it.task_id);
    setBusy(true);
    fetch(API_BASE + '/image-pipeline/open', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        setBusy(false);
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        var task = pack.body;
        currentTaskId = task.task_id || null;
        currentFolder = task.output_dir || it.folder || null;
        fillFormFromTask(task);
        applyLogs(task);
        applyProgress(task);
        renderResults(task);
        if (task.status === 'running' || task.status === 'queued') {
          setBusy(true);
          startPoll();
        }
      })
      .catch(function (err) {
        setBusy(false);
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
      });
  }

  if (modeSelect) modeSelect.addEventListener('change', syncModeUi);
  if (startBtn) startBtn.addEventListener('click', startJob);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      if (!currentTaskId) return;
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fetch(API_BASE + '/image-pipeline/cancel', { method: 'POST', body: fd }).finally(function () {
        startPoll();
      });
    });
  }
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', function () {
      var fd = new FormData();
      if (currentTaskId) fd.append('task_id', currentTaskId);
      if (currentFolder) fd.append('folder', currentFolder);
      fetch(API_BASE + '/image-pipeline/reveal-output', { method: 'POST', body: fd }).catch(
        function () {}
      );
    });
  }
  var selectAllBtn = document.getElementById('select-all-btn');
  var selectNoneBtn = document.getElementById('select-none-btn');
  var publishBtn = document.getElementById('publish-btn');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function () {
      if (!resultGrid) return;
      resultGrid.querySelectorAll('.image-pipe-check').forEach(function (el) {
        el.checked = true;
      });
    });
  }
  if (selectNoneBtn) {
    selectNoneBtn.addEventListener('click', function () {
      if (!resultGrid) return;
      resultGrid.querySelectorAll('.image-pipe-check').forEach(function (el) {
        el.checked = false;
      });
    });
  }
  if (publishBtn) publishBtn.addEventListener('click', publishSelected);
  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);
  if (lightboxBackdrop) {
    lightboxBackdrop.addEventListener('click', closeLightbox);
  }
  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', function (e) {
      e.stopPropagation();
      stepLightbox(-1);
    });
  }
  if (lightboxNext) {
    lightboxNext.addEventListener('click', function (e) {
      e.stopPropagation();
      stepLightbox(1);
    });
  }
  if (lightboxImg) {
    lightboxImg.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
  if (lightboxCaption) {
    lightboxCaption.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (!lightbox || lightbox.hasAttribute('hidden') || lightbox.style.display === 'none') {
      return;
    }
    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepLightbox(1);
    }
  });

  syncModeUi();
  loadDefaults().then(loadHistory);
})();
