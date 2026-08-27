document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadBtn = document.getElementById('download-btn');
  const promptInput = document.getElementById('prompt-input');
  const widthInput = document.getElementById('width-input');
  const heightInput = document.getElementById('height-input');
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

  async function generate() {
    const prompt = (promptInput.value || '').trim();
    if (!prompt) {
      alert(tr('privateHub.homePc.txt2imgNeedPrompt', '请输入正向提示词'));
      promptInput.focus();
      return;
    }

    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('width', String(parseInt(widthInput.value, 10) || 1024));
    fd.append('height', String(parseInt(heightInput.value, 10) || 1024));
    fd.append('seed', (seedInput.value || '').trim());

    setBusy(true, tr('privateHub.homePc.txt2imgGenerating', '提交 ComfyUI 生成中…'));
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    lastDataUrl = '';

    try {
      const res = await fetch(`${API_BASE_URL}/txt2img`, { method: 'POST', body: fd });
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
      resultImg.alt = tr('privateHub.homePc.txt2imgResultTitle', '生成结果');
      metaLine.textContent = `使用的种子：${data.seed_used != null ? data.seed_used : '—'}`;
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
    promptInput.value = '';
    widthInput.value = '1024';
    heightInput.value = '1024';
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
    a.download = `txt2img_${Date.now()}.png`;
    a.click();
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPng);
});
