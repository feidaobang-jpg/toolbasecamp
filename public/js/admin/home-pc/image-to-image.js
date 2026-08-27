document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadBtn = document.getElementById('download-btn');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const previewImg = document.getElementById('preview-img');
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

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      selectedFile = f || null;
      if (!f) {
        previewWrap.style.display = 'none';
        previewImg.removeAttribute('src');
        return;
      }
      const url = URL.createObjectURL(f);
      previewImg.onload = function () {
        URL.revokeObjectURL(url);
      };
      previewImg.src = url;
      previewWrap.style.display = 'block';
    });
  }

  async function generate() {
    const prompt = (promptInput.value || '').trim();
    if (!prompt) {
      alert('请输入正向提示词');
      promptInput.focus();
      return;
    }
    if (!selectedFile) {
      alert('请先选择参考图');
      fileInput.focus();
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

    setBusy(true, '上传并提交 ComfyUI…');
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
    previewWrap.style.display = 'none';
    previewImg.removeAttribute('src');
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
