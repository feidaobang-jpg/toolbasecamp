document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const promptInput = document.getElementById('prompt-input');
  const presetWrap = document.getElementById('preset-wrap');
  const presetRow = document.getElementById('preset-row');
  const bgWrap = document.getElementById('bg-wrap');
  const bgPanel = document.getElementById('bg-toggle-panel');
  const bgToggleBtn = document.getElementById('bg-toggle-btn');
  const bgTimeRow = document.getElementById('bg-time-row');
  const bgGroups = document.getElementById('bg-groups');
  const qualityHint = document.getElementById('quality-hint');
  const zimageHint = document.getElementById('zimage-hint');
  const modelRow = document.getElementById('model-row');
  const selectAllBtn = document.getElementById('select-all-models');
  const modelWarn = document.getElementById('model-warn');
  const engineConflictHint = document.getElementById('engine-conflict-hint');
  const presetEngineHint = document.getElementById('preset-engine-hint');
  const denoiseWrap = document.getElementById('denoise-wrap');
  const denoiseInput = document.getElementById('denoise-input');
  const seedInput = document.getElementById('seed-input');
  const enableWatermark = document.getElementById('enable-watermark');
  const watermarkText = document.getElementById('watermark-text');
  const watermarkTextGroup = document.getElementById('watermark-text-group');
  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');
  const resultBox = document.getElementById('result-box');
  const resultGrid = document.getElementById('result-grid');
  const logOutput = document.getElementById('log-output');

  const API_BASE_URL = window.HomePcApi.base();
  const MAX_BATCH = 8;

  const MediaUi = window.HomePcMediaUi;

  let selectedFiles = [];
  let previewUrls = [];
  let results = [];
  let currentTaskId = null;
  let pollingTimer = null;
  let batchBusy = false;
  let presetUi = null;
  const notReadyEngines = {};
  let bgUi = null;
  let resultsLightbox = null;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function log(msg) {
    if (!logOutput) return;
    logOutput.textContent += `${msg}\n`;
    if (logOutput.parentElement) {
      logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
    }
  }

  function setBusy(busy, text, percentText) {
    batchBusy = !!busy;
    if (progressWrap) progressWrap.style.display = busy ? 'block' : 'none';
    if (text && progressStatus) progressStatus.textContent = text;
    if (progressPercent) progressPercent.textContent = busy ? (percentText || '…') : '';
    if (progressBar) progressBar.style.width = busy ? '40%' : '0%';
    if (genBtn) genBtn.disabled = busy;
    if (clearBtn) clearBtn.disabled = busy;
  }

  function stopPolling() {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    currentTaskId = null;
  }

  function revokePreviews() {
    previewUrls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ }
    });
    previewUrls = [];
  }

  function syncWatermarkUi() {
    if (!watermarkTextGroup || !enableWatermark) return;
    watermarkTextGroup.hidden = !enableWatermark.checked;
  }

  function renderPreview() {
    if (!previewWrap) return;
    previewWrap.innerHTML = '';
    revokePreviews();
    if (!selectedFiles.length) {
      previewWrap.hidden = true;
      if (window.HomePcUpload) HomePcUpload.syncDropVisible(dropZone, false);
      return;
    }
    selectedFiles.forEach(function (file, idx) {
      const card = document.createElement('div');
      card.className = 'instruct-source-card';
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url;
      img.alt = file.name || tr('privateHub.homePc.img2imgRefLabel', '参考图');
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'instruct-source-remove';
      rm.setAttribute('aria-label', tr('privateHub.homePc.img2imgRemoveImage', '移除'));
      rm.textContent = '×';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        selectedFiles.splice(idx, 1);
        renderPreview();
      });
      card.appendChild(img);
      card.appendChild(rm);
      previewWrap.appendChild(card);
    });
    previewWrap.hidden = false;
    if (window.HomePcUpload) HomePcUpload.syncDropVisible(dropZone, true);
  }

  function addFiles(files) {
    const list = Array.isArray(files) ? files : [];
    const pending = list.filter(function (file) {
      return file && file.type && file.type.indexOf('image/') === 0;
    });
    if (!pending.length) return;

    const room = Math.max(0, MAX_BATCH - selectedFiles.length);
    const slice = pending.slice(0, room);
    if (pending.length > room) {
      log(tr('privateHub.homePc.img2imgBatchMax', '最多 {n} 张').replace('{n}', String(MAX_BATCH)));
    }

    const compress = window.TBImageUploadCompress && TBImageUploadCompress.compressMany
      ? TBImageUploadCompress.compressMany(slice)
      : Promise.resolve(slice);

    compress.then(function (out) {
      (out || []).forEach(function (file) {
        if (!file) return;
        if (selectedFiles.length >= MAX_BATCH) return;
        selectedFiles.push(file);
      });
      renderPreview();
    }).catch(function () {
      slice.forEach(function (file) {
        if (selectedFiles.length >= MAX_BATCH) return;
        selectedFiles.push(file);
      });
      renderPreview();
    });
  }

  if (window.HomePcUpload) {
    HomePcUpload.bind({
      dropZone: dropZone,
      fileInput: fileInput,
      onFiles: addFiles,
      multiple: true
    });
  }

  function modelInputs() {
    return modelRow ? modelRow.querySelectorAll('input[name="img2img-model"]') : [];
  }

  function selectedModels() {
    const out = [];
    const inputs = modelInputs();
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].checked && !inputs[i].disabled) {
        out.push(inputs[i].getAttribute('data-engine') || inputs[i].value);
      }
    }
    return out;
  }

  function selectedHasZImage() {
    return selectedModels().indexOf('z_image') >= 0;
  }

  function selectedHasInstruct() {
    const m = selectedModels();
    return m.indexOf('qwen') >= 0 || m.indexOf('qwen21') >= 0;
  }

  function syncEngineUi() {
    const z = selectedHasZImage();
    const instruct = selectedHasInstruct();
    const mixed = z && instruct;
    if (denoiseWrap) denoiseWrap.hidden = !z;
    // 画风转换类预设要走 Z-Image，故只要有模型勾选就展示预设行
    if (presetWrap) presetWrap.hidden = !(instruct || z);
    if (bgWrap) bgWrap.hidden = !instruct;
    if (qualityHint) qualityHint.hidden = !instruct || z;
    if (zimageHint) zimageHint.hidden = !z;
    if (engineConflictHint) engineConflictHint.hidden = !mixed;
    applyPresetGuard();
  }

  /** 置灰当前预设明确做不了的模型，并说明原因（映射见 InstructEditPresets.META.blockedEngines）。 */
  function applyPresetGuard() {
    const P = window.InstructEditPresets;
    const active = presetUi ? presetUi.getActive() : '';
    const blocked = (P && active) ? P.blockedEngines(active) : [];
    const inputs = modelInputs();
    let blockedChecked = false;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const eng = input.getAttribute('data-engine') || input.value;
      const notReady = !!notReadyEngines[eng];
      const isBlocked = blocked.indexOf(eng) >= 0;
      input.disabled = notReady || isBlocked;
      if (isBlocked && !notReady) {
        input.title = tr('privateHub.homePc.img2imgPresetEngineBlocked', '该模型不适用于当前风格预设');
      } else if (!notReady) {
        input.title = '';
      }
      if (input.disabled && input.checked) {
        input.checked = false;
        if (isBlocked) blockedChecked = true;
      }
    }
    // 刚被置灰的是用户原本勾选的模型：自动改勾一个可用模型，避免卡住
    if (blockedChecked) {
      let anyChecked = false;
      let firstUsable = null;
      for (let j = 0; j < inputs.length; j++) {
        if (inputs[j].disabled) continue;
        if (!firstUsable) firstUsable = inputs[j];
        if (inputs[j].checked) anyChecked = true;
      }
      if (!anyChecked && firstUsable) firstUsable.checked = true;
    }
    if (presetEngineHint) {
      const isTransfer = !!(P && active && P.isTransfer && P.isTransfer(active));
      presetEngineHint.hidden = !isTransfer;
      if (isTransfer) {
        presetEngineHint.textContent = tr(
          'privateHub.homePc.img2imgPresetTransferHint',
          '「漫画 ↔ 真人」属于画风转换，指令改图类模型做不到，已置灰；建议用 Z-Image 整图重绘，Denoise 已提到 0.8。'
        );
      }
    }
  }

  function onPresetChange(id) {
    applyPresetGuard();
    // 整图重绘要改画风，Denoise 太低改不动
    if (window.InstructEditPresets && window.InstructEditPresets.isTransfer(id) && denoiseInput) {
      denoiseInput.value = '0.8';
    }
  }

  /** 权重未就位的模型置灰，避免排队后才失败。 */
  function applyModelAvailability(models) {
    const notReady = [];
    (models || []).forEach(function (m) {
      if (!m || m.id !== 'qwen-image-2.1:7b') return;
      const input = modelRow
        ? modelRow.querySelector('input[name="img2img-model"][value="qwen-image-2.1:7b"]')
        : null;
      if (!input) return;
      if (m.ready) {
        delete notReadyEngines['qwen21'];
        input.disabled = false;
        input.title = '';
        return;
      }
      const missing = (m.missing || []).join('；');
      notReadyEngines['qwen21'] = true;
      input.disabled = true;
      input.checked = false;
      input.title = missing || tr('privateHub.homePc.txt2imgModelNotReady', '未就位');
      const span = input.parentElement ? input.parentElement.querySelector('span') : null;
      if (span) {
        span.textContent =
          tr('privateHub.homePc.img2imgModelQwen21', 'Qwen-Image-2.1 · 7B（本地）') +
          '（' +
          tr('privateHub.homePc.txt2imgModelNotReady', '未就位，需先把权重放进 ComfyUI 的 models 目录') +
          '）';
      }
      notReady.push(missing || m.id);
    });
    if (modelWarn) {
      if (notReady.length) {
        modelWarn.hidden = false;
        modelWarn.textContent = tr(
          'privateHub.homePc.txt2imgModelWarnNotReady',
          'Qwen-Image-2.1 权重未就位，已自动跳过：{missing}'
        ).replace('{missing}', notReady.join('；'));
      } else {
        modelWarn.hidden = true;
        modelWarn.textContent = '';
      }
    }
    syncEngineUi();
  }

  function loadModels() {
    fetch(`${API_BASE_URL}/txt2img/models`)
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.models) applyModelAvailability(data.models);
      })
      .catch(function (e) {
        log(`模型清单获取失败：${String(e.message || e)}`);
      });
  }

  if (window.InstructEditPresetUi) {
    presetUi = window.InstructEditPresetUi.bind({
      presetRow: presetRow,
      promptEl: promptInput,
      tr: tr,
      onChange: onPresetChange
    });
  }

  (function bindModelRow() {
    const inputs = modelInputs();
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('change', syncEngineUi);
    }
    syncEngineUi();
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', function () {
        const enabled = [];
        const all = modelInputs();
        for (let j = 0; j < all.length; j++) if (!all[j].disabled) enabled.push(all[j]);
        const allOn = enabled.length > 0 && enabled.every(function (x) { return x.checked; });
        enabled.forEach(function (x) { x.checked = !allOn; });
        selectAllBtn.textContent = allOn
          ? tr('privateHub.homePc.img2imgSelectAllModels', '全选')
          : tr('privateHub.homePc.txt2imgSelectNoneModels', '取消全选');
        syncEngineUi();
      });
    }
  })();

  if (enableWatermark) {
    enableWatermark.addEventListener('change', syncWatermarkUi);
    syncWatermarkUi();
  }

  if (window.InstructEditBgUi) {
    bgUi = window.InstructEditBgUi.bind({
      promptEl: promptInput,
      toggleBtn: bgToggleBtn,
      panelEl: bgPanel,
      timeRowEl: bgTimeRow,
      groupsEl: bgGroups,
      tr: tr
    });
  }

  function engineLabel(engine) {
    if (engine === 'z_image') {
      return tr('privateHub.homePc.img2imgEngineZImage', 'Z-Image 整图重绘');
    }
    if (engine === 'qwen21') {
      return tr('privateHub.homePc.img2imgModelQwen21Short', 'Qwen-Image-2.1 · 7B');
    }
    return tr('privateHub.homePc.img2imgEngineQwen', 'Qwen 指令改图（推荐）');
  }

  function qualityLabel(q) {
    if (q === 'high') return tr('privateHub.homePc.img2imgQualityHigh', '高质量');
    return tr('privateHub.homePc.img2imgQualityStandard', '标准');
  }

  function toDataUrl(b64) {
    return b64 ? `data:image/png;base64,${b64}` : '';
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return;
    if (MediaUi && typeof MediaUi.triggerDownload === 'function') {
      MediaUi.triggerDownload(dataUrl, filename).catch(function () { /* ignore */ });
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  function ensureResultsLightbox() {
    if (!MediaUi) return null;
    if (resultsLightbox) return resultsLightbox;
    MediaUi.ensureLightboxDom();
    resultsLightbox = MediaUi.createLightbox({
      getItems: function () {
        return results.filter(function (r) { return r.cleanUrl; }).map(function (r) {
          return { url: r.cleanUrl, name: r.name };
        });
      },
      getHdUrl: function (it) {
        return it && it.url;
      },
      getCaption: function (it, i, n) {
        return (it && it.name ? it.name + ' · ' : '') + '#' + (i + 1) + ' / ' + n;
      },
      onBoundary: function (edge) {
        alert(
          edge === 'first'
            ? tr('privateHub.homePc.imagePipeLbFirst', '已经是第一张')
            : tr('privateHub.homePc.imagePipeLbLast', '已经是最后一张')
        );
      }
    });
    return resultsLightbox;
  }

  function applyThumbSrc(imgEl, item) {
    if (!imgEl || !item) return;
    if (item.thumbUrl) {
      imgEl.src = item.thumbUrl;
      return;
    }
    if (MediaUi && typeof MediaUi.makeThumbDataUrl === 'function' && item.cleanUrl) {
      MediaUi.makeThumbDataUrl(item.cleanUrl)
        .then(function (thumb) {
          item.thumbUrl = thumb;
          imgEl.src = thumb;
        })
        .catch(function () {
          imgEl.src = item.cleanUrl;
        });
      return;
    }
    imgEl.src = item.cleanUrl || '';
  }

  function renderResults() {
    if (!resultGrid || !resultBox) return;
    resultGrid.innerHTML = '';
    if (!results.length) {
      resultBox.style.display = 'none';
      if (downloadAllBtn) downloadAllBtn.style.display = 'none';
      return;
    }
    resultBox.style.display = 'block';
    if (downloadAllBtn) downloadAllBtn.style.display = 'inline-block';

    // 灯箱只收成功的图；失败条目不占位，避免点击放大时索引错位。
    let lbIndex = 0;
    results.forEach(function (item) {
      item.lightboxIndex = item.cleanUrl ? lbIndex++ : null;
    });

    results.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'home-pc-result-card';

      const meta = document.createElement('p');
      meta.className = 'home-pc-result-meta';
      const engLabel = item.engine === 'z_image'
        ? tr('privateHub.homePc.img2imgEngineZImage', 'Z-Image 整图重绘')
        : item.engine === 'qwen21'
          ? tr('privateHub.homePc.img2imgModelQwen21Short', 'Qwen-Image-2.1 · 7B')
          : tr('privateHub.homePc.img2imgEngineQwen', 'Qwen 指令改图（推荐）');
      let metaText = `${item.name || ('#' + (i + 1))} · ${engLabel} · seed ${item.seed_used != null ? item.seed_used : '—'}`;
      if (item.quality) metaText += ` · ${qualityLabel(item.quality)}`;
      if (item.denoise != null) metaText += ` · Denoise ${item.denoise}`;
      if (item.elapsed_sec != null) metaText += ` · ${Number(item.elapsed_sec).toFixed(1)}s`;
      var knownDim = MediaUi && MediaUi.formatItemDimSize ? MediaUi.formatItemDimSize(item) : '';
      if (knownDim) {
        meta.textContent = metaText + ' · ' + knownDim;
      } else {
        meta.textContent = metaText;
        if (MediaUi && typeof MediaUi.applyDimSizeMeta === 'function' && item.cleanUrl) {
          MediaUi.applyDimSizeMeta(meta, item, item.cleanUrl).then(function (dim) {
            if (dim) meta.textContent = metaText + ' · ' + dim;
          });
        }
      }
      card.appendChild(meta);

      if (item.cleanUrl) {
        const cleanWrap = document.createElement('div');
        cleanWrap.className = 'home-pc-result-img-wrap';
        const cleanImg = document.createElement('img');
        cleanImg.alt = item.name || tr('privateHub.homePc.img2imgResultTitle', '生成结果');
        cleanImg.style.cursor = 'pointer';
        cleanImg.addEventListener('click', function () {
          const lb = ensureResultsLightbox();
          if (lb && item.lightboxIndex != null) lb.openAt(item.lightboxIndex);
        });
        applyThumbSrc(cleanImg, item);
        cleanWrap.appendChild(cleanImg);
        card.appendChild(cleanWrap);
      } else {
        const err = document.createElement('p');
        err.className = 'home-pc-result-meta home-pc-result-error';
        err.textContent = item.error || tr('privateHub.homePc.img2imgFailed', '生成失败');
        card.appendChild(err);
      }

      if (item.wmUrl) {
        const wmLabel = document.createElement('p');
        wmLabel.className = 'home-pc-result-meta';
        wmLabel.textContent = tr('privateHub.homePc.img2imgWatermarkVersion', '水印版');
        card.appendChild(wmLabel);
        const wmRow = document.createElement('div');
        wmRow.className = 'action-row home-pc-tool-actions';
        const dlWm = document.createElement('button');
        dlWm.type = 'button';
        dlWm.className = 'tb-btn';
        dlWm.textContent = tr('privateHub.homePc.img2imgDownloadWatermark', '下载水印版');
        dlWm.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          downloadDataUrl(item.wmUrl, `img2img_wm_${i + 1}_${Date.now()}.png`);
        });
        wmRow.appendChild(dlWm);
        card.appendChild(wmRow);
      }

      if (MediaUi) {
        MediaUi.appendCardActions(card, {
          onDownload: function () {
            downloadDataUrl(item.cleanUrl, `img2img_${i + 1}_${Date.now()}.png`);
          },
          onDelete: function () {
            if (
              !window.confirm(
                tr('privateHub.homePc.deleteImageConfirm', '确定删除这张图？')
              )
            ) {
              return;
            }
            results.splice(i, 1);
            renderResults();
          }
        });
      }

      resultGrid.appendChild(card);
    });
  }

  function parseApiError(data, status) {
    let msg = data.detail || data.error || `HTTP ${status}`;
    if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || String(x); }).join(' ');
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }

  function waitTask(taskId) {
    return new Promise(function (resolve, reject) {
      async function tick() {
        try {
          const res = await fetch(`${API_BASE_URL}/img2img/status/${encodeURIComponent(taskId)}`);
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok) {
            reject(new Error(parseApiError(data, res.status)));
            return;
          }
          const st = data.status;
          if (st === 'queued' || st === 'running') {
            setBusy(
              true,
              st === 'queued'
                ? tr('privateHub.homePc.img2imgQueued', '排队中…')
                : tr('privateHub.homePc.img2imgRunning', 'ComfyUI 生成中…')
            );
            pollingTimer = setTimeout(tick, 2000);
            return;
          }
          if (st === 'error') {
            reject(new Error(data.error || tr('privateHub.homePc.img2imgFailed', '生成失败')));
            return;
          }
          if (st === 'done' && data.result) {
            resolve(data.result);
            return;
          }
          reject(new Error(tr('privateHub.homePc.img2imgFailed', '生成失败')));
        } catch (e) {
          reject(e);
        }
      }
      tick();
    });
  }

  async function runOne(file, prompt, engine, index, total) {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('prompt', prompt);
    fd.append('engine', engine);
    if (engine === 'z_image') {
      let denoise = parseFloat(denoiseInput.value);
      if (!Number.isFinite(denoise)) denoise = 0.4;
      denoise = Math.max(0.05, Math.min(1, denoise));
      denoiseInput.value = String(denoise);
      fd.append('denoise', String(denoise));
    } else {
      fd.append('quality', 'standard');
    }
    fd.append('seed', (seedInput.value || '').trim());
    const activePreset = presetUi ? presetUi.getActive() : '';
    if (activePreset) {
      fd.append('preset', activePreset);
      // 预设内置负面词：仅在 cfg>1 的引擎生效（qwen 指令改图 cfg=1 会忽略）
      const presetNeg = window.InstructEditPresets
        ? window.InstructEditPresets.negative(activePreset)
        : '';
      if (presetNeg) fd.append('negative_prompt', presetNeg);
    }
    const wantWm = !!(enableWatermark && enableWatermark.checked);
    fd.append('enable_watermark', wantWm ? 'true' : 'false');
    fd.append('watermark_text', (watermarkText && watermarkText.value) || '样片确认');

    setBusy(
      true,
      tr('privateHub.homePc.img2imgBatchProgressModel', '批量 {i}/{n}：{model} 提交中…')
        .replace('{i}', String(index + 1))
        .replace('{n}', String(total))
        .replace('{model}', engineLabel(engine)),
      `${index + 1}/${total}`
    );
    if (progressBar) progressBar.style.width = `${Math.max(8, Math.round(((index) / total) * 100))}%`;

    const res = await fetch(`${API_BASE_URL}/img2img/start`, { method: 'POST', body: fd });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(parseApiError(data, res.status));
    }
    if (!data.task_id) throw new Error('未返回 task_id');
    currentTaskId = data.task_id;
    const result = await waitTask(data.task_id);
    currentTaskId = null;
    return result;
  }

  async function generate() {
    if (batchBusy) return;
    const models = selectedModels();
    let rawPrompt = (promptInput.value || '').trim();
    if (!rawPrompt) {
      alert(tr('privateHub.homePc.img2imgNeedPrompt', '请输入正向提示词'));
      promptInput.focus();
      return;
    }
    if (!selectedFiles.length) {
      alert(tr('privateHub.homePc.img2imgNeedImage', '请先上传参考图'));
      return;
    }
    if (!models.length) {
      alert(tr('privateHub.homePc.img2imgModelNeedOne', '请至少勾选一个模型'));
      return;
    }

    // 指令改图类模型套风格预设；Z-Image 整图重绘默认用原始提示词，
    // 但画风转换类预设（漫画↔真人）的提示词本身就是指令，Z-Image 也要用。
    const activePreset = presetUi ? presetUi.getActive() : '';
    const transferPreset = !!(window.InstructEditPresets && window.InstructEditPresets.isTransfer(activePreset));
    let instructPrompt = rawPrompt;
    if ((models.indexOf('qwen') >= 0 || models.indexOf('qwen21') >= 0 || activePreset) && window.InstructEditPresets) {
      instructPrompt = window.InstructEditPresets.resolvePrompt(activePreset, rawPrompt).trim();
    }
    function promptFor(engine) {
      if (engine === 'z_image') return transferPreset ? instructPrompt : rawPrompt;
      return instructPrompt;
    }

    // 对比要公平：种子留空时前端定一个，所有图片/模型共用同一种子。
    let seedText = (seedInput.value || '').trim();
    if (!seedText) {
      seedText = String(Math.floor(Math.random() * 2147483647));
      seedInput.value = seedText;
    }

    stopPolling();
    results = [];
    renderResults();

    const files = selectedFiles.slice();
    const jobs = [];
    files.forEach(function (file, fi) {
      models.forEach(function (engine) {
        jobs.push({ file: file, engine: engine, fileIndex: fi });
      });
    });
    const total = jobs.length;

    setBusy(
      true,
      tr('privateHub.homePc.img2imgBatchProgress', '批量 {i}/{n}：上传并提交…')
        .replace('{i}', '0').replace('{n}', String(total)),
      `0/${total}`
    );

    let ok = 0;
    const batchStart = performance.now();
    for (let j = 0; j < total; j++) {
      const job = jobs[j];
      const file = job.file;
      const engine = job.engine;
      const fi = job.fileIndex;
      const label = engineLabel(engine);
      log(`${j + 1}/${total} ${file.name || ''} · ${label} seed=${seedText} 开始`);
      const itemStart = performance.now();
      try {
        const data = await runOne(file, promptFor(engine), engine, j, total);
        const elapsedSec = (performance.now() - itemStart) / 1000;
        const cleanUrl = toDataUrl(data.image_base64);
        if (!cleanUrl) throw new Error('未返回图片数据');
        results.push({
          name: file.name || `image-${fi + 1}`,
          cleanUrl: cleanUrl,
          wmUrl: toDataUrl(data.watermarked_image_base64),
          engine: data.engine || engine,
          model_id: data.model_id,
          seed_used: data.seed_used,
          quality: data.quality,
          denoise: data.denoise,
          elapsed_sec: elapsedSec
        });
        ok += 1;
        log(`  ${j + 1}/${total} ${label} 完成，耗时 ${elapsedSec.toFixed(1)}s`);
      } catch (e) {
        const msg = (window.HomePcApi && HomePcApi.friendlyFetchError)
          ? HomePcApi.friendlyFetchError(e)
          : String(e.message || e);
        log(`  ${j + 1}/${total} ${label} 失败：${msg}`);
        results.push({
          name: file.name || `image-${fi + 1}`,
          cleanUrl: '',
          engine: engine,
          seed_used: Number(seedText),
          elapsed_sec: (performance.now() - itemStart) / 1000,
          error: msg
        });
      }
      currentTaskId = null;
      renderResults();
      if (progressBar) progressBar.style.width = `${Math.round(((j + 1) / total) * 100)}%`;
    }
    stopPolling();
    const batchSec = (performance.now() - batchStart) / 1000;
    log(`完成 ${ok}/${total}，本批总耗时 ${batchSec.toFixed(1)}s ${new Date().toLocaleString()}`);
    setBusy(false);
    if (ok === 0 && total > 0) {
      alert(tr('privateHub.homePc.img2imgAllFailed', '所有任务都生成失败，详见日志'));
    }
  }

  function clearAll() {
    if (batchBusy) return;
    stopPolling();
    setBusy(false);
    selectedFiles = [];
    if (fileInput) fileInput.value = '';
    renderPreview();
    promptInput.value = '';
    if (presetUi) presetUi.reset();
    if (bgUi) bgUi.reset();
    if (denoiseInput) denoiseInput.value = '0.4';
    if (seedInput) seedInput.value = '';
    if (enableWatermark) enableWatermark.checked = false;
    if (watermarkText) watermarkText.value = '样片确认';
    syncWatermarkUi();
    const inputs = modelInputs();
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].checked = !inputs[i].disabled && inputs[i].value === 'qwen';
    }
    syncEngineUi();
    if (selectAllBtn) {
      selectAllBtn.textContent = tr('privateHub.homePc.img2imgSelectAllModels', '全选');
    }
    results = [];
    renderResults();
    if (logOutput) logOutput.textContent = '';
  }

  function downloadAll() {
    results.forEach(function (item, i) {
      if (!item.cleanUrl) return;
      downloadDataUrl(item.cleanUrl, `img2img_${i + 1}_${Date.now()}.png`);
      if (item.wmUrl) {
        downloadDataUrl(item.wmUrl, `img2img_wm_${i + 1}_${Date.now()}.png`);
      }
    });
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadAll);

  loadModels();

  if (window.HomePcMediaUi) {
    window.HomePcMediaUi.ensureLogToolbar(document.getElementById('log-container'), {
      getText: function () {
        return (document.getElementById('log-output') || {}).textContent || '';
      },
      onOpenDir: function () {
        alert(tr('privateHub.homePc.openLogDirNeedTask', '请先完成一次任务后再打开输出目录'));
      }
    });
  }
});
