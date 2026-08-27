document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadBtn = document.getElementById('download-btn');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const promptInput = document.getElementById('prompt-input');
  const presetWrap = document.getElementById('preset-wrap');
  const presetRow = document.getElementById('preset-row');
  const bgWrap = document.getElementById('bg-wrap');
  const bgPanel = document.getElementById('bg-panel');
  const bgToggleBtn = document.getElementById('bg-toggle-btn');
  const bgTimeRow = document.getElementById('bg-time-row');
  const qualityWrap = document.getElementById('quality-wrap');
  const qualitySelect = document.getElementById('quality-select');
  const qualityHint = document.getElementById('quality-hint');
  const zimageHint = document.getElementById('zimage-hint');
  const engineSelect = document.getElementById('engine-select');
  const denoiseWrap = document.getElementById('denoise-wrap');
  const denoiseInput = document.getElementById('denoise-input');
  const seedInput = document.getElementById('seed-input');
  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');
  const resultBox = document.getElementById('result-box');
  const resultImg = document.getElementById('result-img');
  const metaLine = document.getElementById('meta-line');
  const logOutput = document.getElementById('log-output');

  const API_BASE_URL = window.HomePcApi.base();

  let lastDataUrl = '';
  let selectedFile = null;
  let previewUrl = '';
  let currentTaskId = null;
  let pollingTimer = null;
  let activePreset = '';
  let presetFillLock = false;
  let bgTime = 'day';
  let bgExpanded = false;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function log(msg) {
    logOutput.textContent += `${msg}\n`;
    logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
  }

  function setBusy(busy, text) {
    progressWrap.style.display = busy ? 'block' : 'none';
    if (text) progressStatus.textContent = text;
    progressPercent.textContent = busy ? '…' : '';
    progressBar.style.width = busy ? '40%' : '0%';
    genBtn.disabled = busy;
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    currentTaskId = null;
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }
  }

  function renderPreview() {
    if (!previewWrap) return;
    previewWrap.innerHTML = '';
    revokePreview();
    if (!selectedFile) {
      previewWrap.hidden = true;
      if (window.HomePcUpload) HomePcUpload.syncDropVisible(dropZone, false);
      return;
    }
    const card = document.createElement('div');
    card.className = 'instruct-source-card';
    const img = document.createElement('img');
    previewUrl = URL.createObjectURL(selectedFile);
    img.src = previewUrl;
    img.alt = selectedFile.name || tr('privateHub.homePc.img2imgRefLabel', '参考图');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'instruct-source-remove';
    rm.setAttribute('aria-label', tr('privateHub.homePc.img2imgRemoveImage', '移除'));
    rm.textContent = '×';
    rm.addEventListener('click', function (e) {
      e.stopPropagation();
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      renderPreview();
    });
    card.appendChild(img);
    card.appendChild(rm);
    previewWrap.appendChild(card);
    previewWrap.hidden = false;
    if (window.HomePcUpload) HomePcUpload.syncDropVisible(dropZone, true);
  }

  function pickFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
    selectedFile = file;
    renderPreview();
  }

  if (window.HomePcUpload) {
    HomePcUpload.bind({
      dropZone: dropZone,
      fileInput: fileInput,
      onFiles: function (files) { pickFile(files[0]); },
      multiple: false
    });
  }

  function syncEngineUi() {
    const z = engineSelect && engineSelect.value === 'z_image';
    if (denoiseWrap) denoiseWrap.hidden = !z;
    if (presetWrap) presetWrap.hidden = !!z;
    if (bgWrap) bgWrap.hidden = !!z;
    if (qualityWrap) qualityWrap.hidden = !!z;
    if (qualityHint) qualityHint.hidden = !!z;
    if (zimageHint) zimageHint.hidden = !z;
  }

  function setPreset(id) {
    activePreset = id || '';
    if (!presetRow) return;
    presetRow.querySelectorAll('.rec-chip').forEach(function (chip) {
      const p = chip.getAttribute('data-preset') || '';
      chip.classList.toggle('is-active', p === activePreset);
    });
    if (!window.InstructEditPresets) return;
    presetFillLock = true;
    if (activePreset) {
      promptInput.value = window.InstructEditPresets.applyColorHint(
        window.InstructEditPresets.prompt(activePreset)
      );
    }
    presetFillLock = false;
  }

  function setBgTime(time) {
    bgTime = time || 'day';
    if (!bgTimeRow) return;
    bgTimeRow.querySelectorAll('[data-bg-time]').forEach(function (chip) {
      const t = chip.getAttribute('data-bg-time') || 'day';
      chip.classList.toggle('is-active', t === bgTime);
    });
  }

  function setBgPanelExpanded(on) {
    bgExpanded = !!on;
    if (bgPanel) bgPanel.hidden = !bgExpanded;
    if (bgToggleBtn) {
      bgToggleBtn.textContent = tr(
        bgExpanded ? 'tools.instructEdit.bgCollapse' : 'tools.instructEdit.bgExpand',
        bgExpanded ? '收起' : '展开'
      );
    }
  }

  function applyBackgroundPreset(place) {
    if (!promptInput || !place || !window.InstructEditBgPresets) return;
    promptInput.value = window.InstructEditBgPresets.apply(promptInput.value, place, bgTime);
  }

  if (presetRow) {
    presetRow.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-preset]');
      if (!btn || !presetRow.contains(btn)) return;
      setPreset(btn.getAttribute('data-preset') || '');
    });
  }

  if (promptInput) {
    promptInput.addEventListener('input', function () {
      if (presetFillLock || !activePreset || !window.InstructEditPresets) return;
      var base = window.InstructEditPresets.prompt(activePreset);
      if ((promptInput.value || '').indexOf(base) === -1) setPreset('');
    });
  }

  if (bgToggleBtn) {
    bgToggleBtn.addEventListener('click', function () {
      setBgPanelExpanded(!bgExpanded);
    });
  }

  if (bgTimeRow) {
    bgTimeRow.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-bg-time]');
      if (!btn || !bgTimeRow.contains(btn)) return;
      setBgTime(btn.getAttribute('data-bg-time') || 'day');
    });
  }

  document.querySelectorAll('button[data-bg-place]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyBackgroundPreset(btn.getAttribute('data-bg-place') || btn.textContent || '');
    });
  });

  if (engineSelect) {
    engineSelect.addEventListener('change', syncEngineUi);
    syncEngineUi();
  }

  setBgPanelExpanded(false);
  setBgTime('day');

  function qualityLabel(q) {
    if (q === 'high') return tr('privateHub.homePc.img2imgQualityHigh', '高质量');
    return tr('privateHub.homePc.img2imgQualityStandard', '标准');
  }

  function showResult(data) {
    const b64 = data.image_base64;
    if (!b64) throw new Error('未返回图片数据');
    lastDataUrl = `data:image/png;base64,${b64}`;
    resultImg.src = lastDataUrl;
    resultImg.alt = tr('privateHub.homePc.img2imgResultTitle', '生成结果');
    const engLabel = data.engine === 'z_image'
      ? tr('privateHub.homePc.img2imgEngineZImage', 'Z-Image 整图重绘')
      : tr('privateHub.homePc.img2imgEngineQwen', 'Qwen 指令改图（推荐）');
    let meta = `${tr('privateHub.homePc.img2imgEngineLabel', '引擎')}：${engLabel}；种子：${data.seed_used != null ? data.seed_used : '—'}`;
    if (data.quality) meta += `；${tr('privateHub.homePc.img2imgQualityLabel', '质量')}：${qualityLabel(data.quality)}`;
    if (data.denoise != null) meta += `；Denoise：${data.denoise}`;
    metaLine.textContent = meta;
    resultBox.style.display = 'block';
    downloadBtn.style.display = 'inline-block';
    log(`完成 ${new Date().toLocaleString()}`);
  }

  function parseApiError(data, status) {
    let msg = data.detail || data.error || `HTTP ${status}`;
    if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || String(x); }).join(' ');
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }

  async function pollStatus() {
    if (!currentTaskId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/img2img/status/${encodeURIComponent(currentTaskId)}`);
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        throw new Error(parseApiError(data, res.status));
      }
      const st = data.status;
      if (st === 'queued') {
        setBusy(true, tr('privateHub.homePc.img2imgQueued', '排队中…'));
        return;
      }
      if (st === 'running') {
        setBusy(true, tr('privateHub.homePc.img2imgRunning', 'ComfyUI 生成中…'));
        return;
      }
      stopPolling();
      if (st === 'error') {
        throw new Error(data.error || tr('privateHub.homePc.img2imgFailed', '生成失败'));
      }
      if (st === 'done' && data.result) {
        showResult(data.result);
      } else {
        throw new Error(tr('privateHub.homePc.img2imgFailed', '生成失败'));
      }
    } catch (e) {
      stopPolling();
      log(`错误：${String(e.message || e)}`);
      alert(String(e.message || e));
    } finally {
      if (!currentTaskId) setBusy(false);
    }
  }

  async function generate() {
    const engine = engineSelect ? engineSelect.value : 'qwen';
    let prompt = (promptInput.value || '').trim();
    if (engine === 'qwen' && window.InstructEditPresets) {
      prompt = window.InstructEditPresets.resolvePrompt(activePreset, prompt).trim();
    }
    if (!prompt) {
      alert(tr('privateHub.homePc.img2imgNeedPrompt', '请输入正向提示词'));
      promptInput.focus();
      return;
    }
    if (!selectedFile) {
      alert(tr('privateHub.homePc.img2imgNeedImage', '请先上传参考图'));
      return;
    }

    const fd = new FormData();
    fd.append('image', selectedFile);
    fd.append('prompt', prompt);
    fd.append('engine', engine);
    if (engine === 'z_image') {
      let denoise = parseFloat(denoiseInput.value);
      if (!Number.isFinite(denoise)) denoise = 0.4;
      denoise = Math.max(0.05, Math.min(1, denoise));
      denoiseInput.value = String(denoise);
      fd.append('denoise', String(denoise));
    } else if (qualitySelect) {
      fd.append('quality', qualitySelect.value || 'standard');
    }
    fd.append('seed', (seedInput.value || '').trim());

    stopPolling();
    setBusy(true, tr('privateHub.homePc.img2imgGenerating', '上传并提交 ComfyUI…'));
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    lastDataUrl = '';

    try {
      const res = await fetch(`${API_BASE_URL}/img2img/start`, { method: 'POST', body: fd });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(parseApiError(data, res.status));
      }
      if (!data.task_id) throw new Error('未返回 task_id');
      currentTaskId = data.task_id;
      setBusy(true, tr('privateHub.homePc.img2imgSubmitted', '任务已提交，等待生成…'));
      await pollStatus();
      pollingTimer = setInterval(pollStatus, 2000);
    } catch (e) {
      stopPolling();
      log(`错误：${String(e.message || e)}`);
      alert(String(e.message || e));
      setBusy(false);
    }
  }

  function clearAll() {
    stopPolling();
    setBusy(false);
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    renderPreview();
    promptInput.value = '';
    setPreset('');
    setBgTime('day');
    setBgPanelExpanded(false);
    if (qualitySelect) qualitySelect.value = 'high';
    denoiseInput.value = '0.4';
    seedInput.value = '';
    resultImg.removeAttribute('src');
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    logOutput.textContent = '';
    lastDataUrl = '';
  }

  function downloadPng() {
    if (!lastDataUrl) return;
    const a = document.createElement('a');
    a.href = lastDataUrl;
    a.download = `img2img_${Date.now()}.png`;
    a.click();
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPng);
});
