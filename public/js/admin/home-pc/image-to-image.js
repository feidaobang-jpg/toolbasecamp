document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadBtn = document.getElementById('download-btn');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const promptInput = document.getElementById('prompt-input');
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
    card.className = 'home-pc-source-card';
    const img = document.createElement('img');
    previewUrl = URL.createObjectURL(selectedFile);
    img.src = previewUrl;
    img.alt = selectedFile.name || tr('privateHub.homePc.img2imgRefLabel', '参考图');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'home-pc-source-remove';
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

  async function generate() {
    const prompt = (promptInput.value || '').trim();
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
    let denoise = parseFloat(denoiseInput.value);
    if (!Number.isFinite(denoise)) denoise = 0.4;
    denoise = Math.max(0.05, Math.min(1, denoise));
    denoiseInput.value = String(denoise);
    fd.append('denoise', String(denoise));
    fd.append('seed', (seedInput.value || '').trim());

    setBusy(true, tr('privateHub.homePc.img2imgGenerating', '上传并提交 ComfyUI…'));
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    lastDataUrl = '';

    try {
      const res = await fetch(`${API_BASE_URL}/img2img`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        let msg = data.detail || data.error || `HTTP ${res.status}`;
        if (Array.isArray(msg)) msg = msg.map((x) => x.msg || String(x)).join(' ');
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      const b64 = data.image_base64;
      if (!b64) throw new Error('未返回图片数据');
      lastDataUrl = `data:image/png;base64,${b64}`;
      resultImg.src = lastDataUrl;
      resultImg.alt = tr('privateHub.homePc.img2imgResultTitle', '生成结果');
      metaLine.textContent = `种子：${data.seed_used != null ? data.seed_used : '—'}；Denoise：${data.denoise != null ? data.denoise : denoise}`;
      resultBox.style.display = 'block';
      downloadBtn.style.display = 'inline-block';
      log(`完成 ${new Date().toLocaleString()}`);
    } catch (e) {
      log(`错误：${String(e.message || e)}`);
      alert(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    renderPreview();
    promptInput.value = '';
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
