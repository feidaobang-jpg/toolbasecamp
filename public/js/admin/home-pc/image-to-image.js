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
  const engineSelect = document.getElementById('engine-select');
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

  let selectedFiles = [];
  let previewUrls = [];
  let results = [];
  let currentTaskId = null;
  let pollingTimer = null;
  let batchBusy = false;
  let presetUi = null;
  let bgUi = null;

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
    list.forEach(function (file) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
      if (selectedFiles.length >= MAX_BATCH) return;
      selectedFiles.push(file);
    });
    if (list.length && selectedFiles.length >= MAX_BATCH) {
      log(tr('privateHub.homePc.img2imgBatchMax', '最多 {n} 张').replace('{n}', String(MAX_BATCH)));
    }
    renderPreview();
  }

  if (window.HomePcUpload) {
    HomePcUpload.bind({
      dropZone: dropZone,
      fileInput: fileInput,
      onFiles: addFiles,
      multiple: true
    });
  }

  function syncEngineUi() {
    const z = engineSelect && engineSelect.value === 'z_image';
    if (denoiseWrap) denoiseWrap.hidden = !z;
    if (presetWrap) presetWrap.hidden = !!z;
    if (bgWrap) bgWrap.hidden = !!z;
    if (qualityHint) qualityHint.hidden = !!z;
    if (zimageHint) zimageHint.hidden = !z;
  }

  if (window.InstructEditPresetUi) {
    presetUi = window.InstructEditPresetUi.bind({
      presetRow: presetRow,
      promptEl: promptInput,
      tr: tr
    });
  }

  if (engineSelect) {
    engineSelect.addEventListener('change', syncEngineUi);
    syncEngineUi();
  }

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

  function qualityLabel(q) {
    if (q === 'high') return tr('privateHub.homePc.img2imgQualityHigh', '高质量');
    return tr('privateHub.homePc.img2imgQualityStandard', '标准');
  }

  function toDataUrl(b64) {
    return b64 ? `data:image/png;base64,${b64}` : '';
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
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

    results.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'home-pc-result-card';

      const meta = document.createElement('p');
      meta.className = 'home-pc-result-meta';
      const engLabel = item.engine === 'z_image'
        ? tr('privateHub.homePc.img2imgEngineZImage', 'Z-Image 整图重绘')
        : tr('privateHub.homePc.img2imgEngineQwen', 'Qwen 指令改图（推荐）');
      let metaText = `${item.name || ('#' + (i + 1))} · ${engLabel} · seed ${item.seed_used != null ? item.seed_used : '—'}`;
      if (item.quality) metaText += ` · ${qualityLabel(item.quality)}`;
      if (item.denoise != null) metaText += ` · Denoise ${item.denoise}`;
      meta.textContent = metaText;
      card.appendChild(meta);

      const cleanWrap = document.createElement('div');
      cleanWrap.className = 'home-pc-result-img-wrap';
      const cleanImg = document.createElement('img');
      cleanImg.src = item.cleanUrl;
      cleanImg.alt = item.name || tr('privateHub.homePc.img2imgResultTitle', '生成结果');
      cleanWrap.appendChild(cleanImg);
      card.appendChild(cleanWrap);

      const actions = document.createElement('div');
      actions.className = 'action-row home-pc-tool-actions';
      const dlClean = document.createElement('button');
      dlClean.type = 'button';
      dlClean.className = 'tb-btn';
      dlClean.textContent = tr('privateHub.homePc.download', '下载');
      dlClean.addEventListener('click', function () {
        downloadDataUrl(item.cleanUrl, `img2img_${i + 1}_${Date.now()}.png`);
      });
      actions.appendChild(dlClean);

      if (item.wmUrl) {
        const wmLabel = document.createElement('p');
        wmLabel.className = 'home-pc-result-meta';
        wmLabel.textContent = tr('privateHub.homePc.img2imgWatermarkVersion', '水印版');
        card.appendChild(wmLabel);
        const wmWrap = document.createElement('div');
        wmWrap.className = 'home-pc-result-img-wrap';
        const wmImg = document.createElement('img');
        wmImg.src = item.wmUrl;
        wmImg.alt = tr('privateHub.homePc.img2imgWatermarkVersion', '水印版');
        wmWrap.appendChild(wmImg);
        card.appendChild(wmWrap);
        const dlWm = document.createElement('button');
        dlWm.type = 'button';
        dlWm.className = 'tb-btn';
        dlWm.textContent = tr('privateHub.homePc.img2imgDownloadWatermark', '下载水印版');
        dlWm.addEventListener('click', function () {
          downloadDataUrl(item.wmUrl, `img2img_wm_${i + 1}_${Date.now()}.png`);
        });
        actions.appendChild(dlWm);
      }

      card.appendChild(actions);
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
    const wantWm = !!(enableWatermark && enableWatermark.checked);
    fd.append('enable_watermark', wantWm ? 'true' : 'false');
    fd.append('watermark_text', (watermarkText && watermarkText.value) || '样片确认');

    setBusy(
      true,
      tr('privateHub.homePc.img2imgBatchProgress', '批量 {i}/{n}：上传并提交…')
        .replace('{i}', String(index + 1))
        .replace('{n}', String(total)),
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
    const engine = engineSelect ? engineSelect.value : 'qwen';
    let prompt = (promptInput.value || '').trim();
    if (engine === 'qwen' && window.InstructEditPresets) {
      prompt = window.InstructEditPresets.resolvePrompt(presetUi ? presetUi.getActive() : '', prompt).trim();
    }
    if (!prompt) {
      alert(tr('privateHub.homePc.img2imgNeedPrompt', '请输入正向提示词'));
      promptInput.focus();
      return;
    }
    if (!selectedFiles.length) {
      alert(tr('privateHub.homePc.img2imgNeedImage', '请先上传参考图'));
      return;
    }

    stopPolling();
    results = [];
    renderResults();
    setBusy(true, tr('privateHub.homePc.img2imgGenerating', '上传并提交 ComfyUI…'));

    const files = selectedFiles.slice();
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        log(`${i + 1}/${files.length} ${file.name || ''}`);
        const data = await runOne(file, prompt, engine, i, files.length);
        const cleanUrl = toDataUrl(data.image_base64);
        if (!cleanUrl) throw new Error('未返回图片数据');
        results.push({
          name: file.name || `image-${i + 1}`,
          cleanUrl: cleanUrl,
          wmUrl: toDataUrl(data.watermarked_image_base64),
          engine: data.engine,
          seed_used: data.seed_used,
          quality: data.quality,
          denoise: data.denoise
        });
        ok += 1;
        renderResults();
        if (progressBar) progressBar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
      }
      log(`完成 ${ok}/${files.length} ${new Date().toLocaleString()}`);
    } catch (e) {
      log(`错误：${String(e.message || e)}`);
      alert(String(e.message || e));
    } finally {
      stopPolling();
      setBusy(false);
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
    results = [];
    renderResults();
    if (logOutput) logOutput.textContent = '';
  }

  function downloadAll() {
    results.forEach(function (item, i) {
      downloadDataUrl(item.cleanUrl, `img2img_${i + 1}_${Date.now()}.png`);
      if (item.wmUrl) {
        downloadDataUrl(item.wmUrl, `img2img_wm_${i + 1}_${Date.now()}.png`);
      }
    });
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadAll);
});
