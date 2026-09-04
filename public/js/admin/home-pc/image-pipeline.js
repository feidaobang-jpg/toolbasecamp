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
  var refFile = null;
  var refObjectUrl = null;

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
  var denoiseInput = document.getElementById('denoise-input');
  var denoiseWrap = document.getElementById('denoise-wrap');
  var lockEngineSelect = document.getElementById('lock-engine-select');
  var lockEngineWrap = document.getElementById('lock-engine-wrap');
  var refDrop = document.getElementById('ref-drop');
  var refFileInput = document.getElementById('ref-file');
  var refPreviewWrap = document.getElementById('ref-preview-wrap');
  var refPreview = document.getElementById('ref-preview');
  var refClearBtn = document.getElementById('ref-clear-btn');
  var manualWrap = document.getElementById('manual-wrap');
  var extraWrap = document.getElementById('extra-wrap');
  var startBtn = document.getElementById('start-btn');
  var cancelBtn = document.getElementById('cancel-btn');
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
  if (window.HomePcMediaUi && window.HomePcMediaUi.upgradeLightboxDom) {
    window.HomePcMediaUi.upgradeLightboxDom(lightbox);
  }

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

  function revokeRefObjectUrl() {
    if (refObjectUrl) {
      try {
        URL.revokeObjectURL(refObjectUrl);
      } catch (e) {}
      refObjectUrl = null;
    }
  }

  function syncLockUi() {
    var hasLocal = !!refFile;
    var hasRemote = !!(
      refPreview &&
      refPreview.getAttribute('data-remote') === '1' &&
      refPreview.getAttribute('src')
    );
    var has = hasLocal || hasRemote;
    var eng = lockEngineSelect ? lockEngineSelect.value : 'qwen';
    if (lockEngineWrap) lockEngineWrap.style.display = has ? '' : 'none';
    if (denoiseWrap) denoiseWrap.style.display = has && eng === 'z_image' ? '' : 'none';
    if (refDrop) refDrop.style.display = has ? 'none' : '';
    if (refPreviewWrap) refPreviewWrap.style.display = has ? '' : 'none';
  }

  function clearRef() {
    refFile = null;
    revokeRefObjectUrl();
    if (refFileInput) refFileInput.value = '';
    if (refPreview) {
      refPreview.removeAttribute('src');
      refPreview.removeAttribute('data-remote');
    }
    syncLockUi();
  }

  function setRefFile(file) {
    if (!file) return;
    refFile = file;
    revokeRefObjectUrl();
    refObjectUrl = URL.createObjectURL(file);
    if (refPreview) {
      refPreview.src = refObjectUrl;
      refPreview.removeAttribute('data-remote');
    }
    syncLockUi();
  }

  function setRefFromUrl(url) {
    refFile = null;
    revokeRefObjectUrl();
    if (refFileInput) refFileInput.value = '';
    if (refPreview && url) {
      refPreview.src = resolveUrl(url);
      refPreview.setAttribute('data-remote', '1');
    } else if (refPreview) {
      refPreview.removeAttribute('src');
      refPreview.removeAttribute('data-remote');
    }
    syncLockUi();
  }

  function pickRefFiles(fileList) {
    var file = fileList && fileList[0];
    if (!file) return;
    var compress =
      window.TBImageUploadCompress && typeof window.TBImageUploadCompress.compressIfNeeded === 'function'
        ? window.TBImageUploadCompress.compressIfNeeded(file, 'default')
        : Promise.resolve(file);
    Promise.resolve(compress)
      .then(function (out) {
        setRefFile(out || file);
      })
      .catch(function () {
        setRefFile(file);
      });
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
        tr('privateHub.homePc.imagePipePromptLabel', '提示词') +
        '：\n' +
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
      check.checked = false;
      check.addEventListener('change', syncSelectToggleLabel);
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
      if (window.HomePcMediaUi) {
        window.HomePcMediaUi.appendCardActions(card, {
          onDownload: function () {
            window.HomePcMediaUi.triggerDownload(
              resolveUrl(it.url),
              'pipe-' + (it.index || idx + 1) + '.png'
            ).catch(function (err) {
              flashMsg(window.HomePcApi.friendlyFetchError(err), true);
            });
          },
          onDelete: function () {
            if (
              !window.confirm(
                tr('privateHub.homePc.deleteImageConfirm', '确定删除这张图？')
              )
            ) {
              return;
            }
            var fd = new FormData();
            if (currentTaskId) fd.append('task_id', currentTaskId);
            if (currentFolder) fd.append('folder', currentFolder);
            fd.append('index', String(it.index || ''));
            setBusy(true);
            fetch(API_BASE + '/image-pipeline/delete-image', { method: 'POST', body: fd })
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
                flashMsg(tr('privateHub.homePc.imageDeleted', '已删除'));
                applyLogs(pack.body);
                renderResults(pack.body);
                loadHistory();
              })
              .catch(function (err) {
                setBusy(false);
                flashMsg(window.HomePcApi.friendlyFetchError(err), true);
              });
          }
        });
      }
      resultGrid.appendChild(card);
    });
    syncSelectToggleLabel();
    if (lightbox && !lightbox.hasAttribute('hidden') && lightboxIndex >= 0) {
      if (lightboxIndex >= images.length) closeLightbox();
      else showLightboxAt(lightboxIndex);
    }
  }

  function selectionState() {
    var boxes = resultGrid
      ? Array.prototype.slice.call(resultGrid.querySelectorAll('.image-pipe-check'))
      : [];
    var checked = boxes.filter(function (el) {
      return el.checked;
    }).length;
    return { total: boxes.length, checked: checked, all: boxes.length > 0 && checked === boxes.length };
  }

  function syncSelectToggleLabel() {
    var btn = document.getElementById('select-toggle-btn');
    if (!btn) return;
    var st = selectionState();
    btn.textContent = st.all
      ? tr('privateHub.homePc.imagePipeSelectNone', '取消全选')
      : tr('privateHub.homePc.imagePipeSelectAll', '全选');
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

  function resolveRefForUpload() {
    if (refFile) return Promise.resolve(refFile);
    var remote =
      refPreview &&
      refPreview.getAttribute('data-remote') === '1' &&
      refPreview.getAttribute('src');
    if (!remote) return Promise.resolve(null);
    return fetch(remote)
      .then(function (res) {
        if (!res.ok) throw new Error('ref fetch failed');
        return res.blob();
      })
      .then(function (blob) {
        var type = blob.type || 'image/jpeg';
        var name = type.indexOf('png') >= 0 ? 'ref.png' : 'ref.jpg';
        try {
          return new File([blob], name, { type: type });
        } catch (e) {
          blob.name = name;
          return blob;
        }
      });
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

    setBusy(true);
    if (progressWrap) progressWrap.style.display = '';
    if (progressStatus) {
      progressStatus.textContent = tr('privateHub.homePc.imagePipeWorking', '排队生成中…');
    }
    if (logOutput) logOutput.textContent = '';

    resolveRefForUpload()
      .then(function (file) {
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
        if (file) {
          fd.append('lock_subject', '1');
          fd.append('ref_image', file, file.name || 'ref.jpg');
          fd.append(
            'lock_engine',
            lockEngineSelect ? String(lockEngineSelect.value || 'qwen') : 'qwen'
          );
          fd.append('denoise', denoiseInput ? String(denoiseInput.value || '0.55') : '0.55');
        } else {
          fd.append('lock_subject', '0');
        }
        return fetch(API_BASE + '/image-pipeline/start', { method: 'POST', body: fd });
      })
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
        startPoll();
      })
      .catch(function (err) {
        // 若任务已创建成功但后续脚本出错，仍继续轮询，避免「后台在跑、页面停住」
        if (currentTaskId) {
          startPoll();
          flashMsg(window.HomePcApi.friendlyFetchError(err), true);
          return;
        }
        setBusy(false);
        if (progressWrap) progressWrap.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
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
            (it.lock_subject
              ? ' · ' +
                tr('privateHub.homePc.imagePipeLockedTag', '已锁主体') +
                (it.lock_engine === 'z_image' ? '/Z' : it.lock_engine === 'qwen' ? '/Qwen' : '')
              : '') +
            '</div>';
          var actions = document.createElement('div');
          actions.className = 'action-row image-pipe-history-actions';
          var openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'tb-btn';
          openBtn.setAttribute('data-job-btn', '1');
          openBtn.textContent = tr('privateHub.homePc.imagePipeHistoryOpen', '打开');
          openBtn.addEventListener('click', function () {
            openHistory(it);
          });
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'tb-btn';
          delBtn.setAttribute('data-job-btn', '1');
          delBtn.textContent = tr('privateHub.homePc.imagePipeHistoryDelete', '删除');
          delBtn.addEventListener('click', function () {
            deleteHistory(it);
          });
          actions.appendChild(openBtn);
          actions.appendChild(delBtn);
          row.appendChild(left);
          row.appendChild(actions);
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

  function clearCurrentIfMatches(it) {
    var folder = (it && it.folder) || '';
    var tid = (it && it.task_id) || '';
    var match =
      (tid && currentTaskId && tid === currentTaskId) ||
      (folder && currentFolder && folder === currentFolder);
    if (!match) return;
    stopPoll();
    currentTaskId = null;
    currentFolder = null;
    currentTask = null;
    if (resultBox) resultBox.style.display = 'none';
    if (resultGrid) resultGrid.innerHTML = '';
    if (resultMeta) resultMeta.textContent = '';
    if (logOutput) logOutput.textContent = '';
    if (progressWrap) progressWrap.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    setBusy(false);
  }

  function deleteHistory(it) {
    if (
      !confirm(
        tr(
          'privateHub.homePc.imagePipeHistoryDeleteConfirm',
          '确定删除该历史批次？将删除本地输出目录，不可恢复。'
        )
      )
    ) {
      return;
    }
    var fd = new FormData();
    if (it.folder) fd.append('folder', it.folder);
    if (it.task_id) fd.append('task_id', it.task_id);
    setBusy(true);
    fetch(API_BASE + '/image-pipeline/delete-batch', { method: 'POST', body: fd })
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
        clearCurrentIfMatches(it);
        flashMsg(tr('privateHub.homePc.imagePipeHistoryDeleted', '已删除该批次'));
        loadHistory();
      })
      .catch(function (err) {
        setBusy(false);
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
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
    if (denoiseInput && task.denoise != null && task.denoise !== '') {
      denoiseInput.value = String(task.denoise);
    } else if (denoiseInput) {
      denoiseInput.value = '0.55';
    }
    if (lockEngineSelect) {
      setSelectValue(lockEngineSelect, task.lock_engine || 'qwen');
      if (!lockEngineSelect.value) lockEngineSelect.value = 'qwen';
    }
    if (task.lock_subject && task.ref_url) {
      setRefFromUrl(task.ref_url);
    } else {
      clearRef();
    }
    syncLockUi();
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
  if (refClearBtn) refClearBtn.addEventListener('click', clearRef);
  if (lockEngineSelect) {
    lockEngineSelect.addEventListener('change', syncLockUi);
  }
  if (refFileInput) {
    refFileInput.addEventListener('change', function () {
      pickRefFiles(refFileInput.files);
    });
  }
  if (refDrop) {
    refDrop.addEventListener('click', function () {
      if (refFileInput) refFileInput.click();
    });
    refDrop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (refFileInput) refFileInput.click();
      }
    });
    refDrop.addEventListener('dragover', function (e) {
      e.preventDefault();
      refDrop.classList.add('is-dragover');
    });
    refDrop.addEventListener('dragleave', function () {
      refDrop.classList.remove('is-dragover');
    });
    refDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      refDrop.classList.remove('is-dragover');
      pickRefFiles(e.dataTransfer && e.dataTransfer.files);
    });
  }
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
  var selectToggleBtn = document.getElementById('select-toggle-btn');
  var publishBtn = document.getElementById('publish-btn');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');
  if (selectToggleBtn) {
    selectToggleBtn.addEventListener('click', function () {
      if (!resultGrid) return;
      var st = selectionState();
      var next = !st.all;
      resultGrid.querySelectorAll('.image-pipe-check').forEach(function (el) {
        el.checked = next;
      });
      syncSelectToggleLabel();
    });
  }
  if (publishBtn) publishBtn.addEventListener('click', publishSelected);
  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);
  if (window.HomePcMediaUi && window.HomePcMediaUi.upgradeLightboxDom && lightbox) {
    window.HomePcMediaUi.upgradeLightboxDom(lightbox);
  }
  if (lightbox) {
    lightbox.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      if (t === lightbox || t === lightboxBackdrop) {
        closeLightbox();
        return;
      }
      if (t.closest && t.closest('.image-pipe-lb-nav')) return;
      if (lightboxImg && (t === lightboxImg || lightboxImg.contains(t))) return;
      if (lightboxCaption && (t === lightboxCaption || lightboxCaption.contains(t))) return;
      var stage = lightbox.querySelector('.image-pipe-lb-stage');
      if (stage && stage.contains(t) && t !== stage) return;
      closeLightbox();
    });
  }
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
  syncLockUi();
  if (window.HomePcMediaUi) {
    window.HomePcMediaUi.ensureLogToolbar(document.getElementById('log-container'), {
      getText: function () {
        return (logOutput && logOutput.textContent) || '';
      },
      onOpenDir: function () {
        var fd = new FormData();
        if (currentTaskId) fd.append('task_id', currentTaskId);
        if (currentFolder) fd.append('folder', currentFolder);
        if (!currentTaskId && !currentFolder) {
          flashMsg(tr('privateHub.homePc.imagePipeNeedTheme', '请先打开或生成一个批次'), true);
          return;
        }
        fetch(API_BASE + '/image-pipeline/reveal-output', { method: 'POST', body: fd }).catch(
          function () {}
        );
      }
    });
  }
  loadDefaults().then(loadHistory);
})();
