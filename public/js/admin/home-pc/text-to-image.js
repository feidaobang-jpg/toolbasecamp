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
  const MediaUi = window.HomePcMediaUi;

  let lastDataUrl = '';
  let resultLightbox = null;

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

  function ensureLightbox() {
    if (!MediaUi) return null;
    if (resultLightbox) return resultLightbox;
    MediaUi.ensureLightboxDom();
    resultLightbox = MediaUi.createLightbox({
      getItems: function () {
        return lastDataUrl ? [{ url: lastDataUrl }] : [];
      },
      getHdUrl: function (it) {
        return it && it.url;
      },
      getCaption: function () {
        return tr('privateHub.homePc.txt2imgResultTitle', '生成结果') + ' · #1 / 1';
      },
      onBoundary: function (edge) {
        alert(
          edge === 'first'
            ? tr('privateHub.homePc.imagePipeLbFirst', '已经是第一张')
            : tr('privateHub.homePc.imagePipeLbLast', '已经是最后一张')
        );
      }
    });
    return resultLightbox;
  }

  function clearResultUi() {
    lastDataUrl = '';
    if (resultImg) resultImg.removeAttribute('src');
    if (resultBox) {
      resultBox.style.display = 'none';
      const actions = resultBox.querySelector('.home-pc-img-card-actions');
      if (actions) actions.remove();
    }
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (metaLine) metaLine.textContent = '';
  }

  function mountCardActions() {
    if (!MediaUi || !resultBox) return;
    const existing = resultBox.querySelector('.home-pc-img-card-actions');
    if (existing) existing.remove();
    MediaUi.appendCardActions(resultBox, {
      onDownload: downloadPng,
      onDelete: function () {
        if (
          !window.confirm(
            tr('privateHub.homePc.deleteImageConfirm', '确定删除这张图？')
          )
        ) {
          return;
        }
        clearResultUi();
      }
    });
  }

  function showResult(fullDataUrl, seedUsed) {
    lastDataUrl = fullDataUrl || '';
    if (!lastDataUrl || !resultImg) return;

    function applyThumb(src) {
      resultImg.src = src;
      resultImg.alt = tr('privateHub.homePc.txt2imgResultTitle', '生成结果');
      resultImg.style.cursor = 'pointer';
      if (metaLine) {
        metaLine.textContent = `使用的种子：${seedUsed != null ? seedUsed : '—'}`;
      }
      resultBox.style.display = 'block';
      if (downloadBtn) downloadBtn.style.display = 'inline-block';
      mountCardActions();
    }

    resultImg.onclick = function () {
      const lb = ensureLightbox();
      if (lb) lb.openAt(0);
    };

    if (MediaUi && typeof MediaUi.makeThumbDataUrl === 'function') {
      MediaUi.makeThumbDataUrl(lastDataUrl)
        .then(applyThumb)
        .catch(function () {
          applyThumb(lastDataUrl);
        });
    } else {
      applyThumb(lastDataUrl);
    }
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
    clearResultUi();

    const t0 = performance.now();
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
      const fullUrl = `data:image/png;base64,${b64}`;
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      showResult(fullUrl, data.seed_used);
      log(`完成，耗时 ${elapsed}s ${new Date().toLocaleString()}`);
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
    clearResultUi();
    logOutput.textContent = '';
  }

  function downloadPng() {
    if (!lastDataUrl) return;
    const name = `txt2img_${Date.now()}.png`;
    if (MediaUi && typeof MediaUi.triggerDownload === 'function') {
      MediaUi.triggerDownload(lastDataUrl, name).catch(function () {
        /* ignore */
      });
      return;
    }
    const a = document.createElement('a');
    a.href = lastDataUrl;
    a.download = name;
    a.click();
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPng);

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
