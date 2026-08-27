document.addEventListener('DOMContentLoaded', function () {
  const startBtn = document.getElementById('start-btn');
  const clearBtn = document.getElementById('clear-btn');
  const cancelButton = document.getElementById('cancel-button');
  const textInput = document.getElementById('text-input');
  const aspectSelect = document.getElementById('aspect-select');
  const deepseekNotice = document.getElementById('deepseek-notice');

  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');

  const resultBox = document.getElementById('result-box');
  const imageGallery = document.getElementById('image-gallery');
  const resultCount = document.getElementById('result-count');
  const btnDownloadAll = document.getElementById('btn-download-all');
  const btnCopyOutput = document.getElementById('btn-copy-output');
  const btnOpenOutput = document.getElementById('btn-open-output');

  const logOutput = document.getElementById('log-output');

  const API_BASE_URL = window.HomePcApi.base();

  let pollingTimer = null;
  let currentTaskId = null;
  let statusErrorStreak = 0;
  let lastLogLen = 0;
  let lastOutputDirectory = '';
  let lastDoneTaskId = '';
  let lastImages = [];

  function resolveUrl(url) {
    if (!url) return '';
    if (url.indexOf('http') === 0) return url;
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  function setProgress(visible, statusText, percent) {
    progressWrap.style.display = visible ? 'block' : 'none';
    if (statusText != null) progressStatus.textContent = statusText;
    if (percent != null) {
      const p = Math.max(0, Math.min(100, Number(percent) || 0));
      progressPercent.textContent = `${p}%`;
      progressBar.style.width = `${p}%`;
    }
  }

  function logMessage(msg) {
    const line = document.createElement('div');
    line.textContent = msg;
    logOutput.appendChild(line);
    logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
  }

  function hideDeepseekNotice() {
    if (!deepseekNotice) return;
    deepseekNotice.style.display = 'none';
    deepseekNotice.textContent = '';
  }

  function showDeepseekNotice(message, status) {
    if (!deepseekNotice || !message) return;
    deepseekNotice.textContent = message;
    if (status === 'failed') {
      deepseekNotice.style.background = '#fef2f2';
      deepseekNotice.style.border = '1px solid #f87171';
      deepseekNotice.style.color = '#991b1b';
    } else {
      deepseekNotice.style.background = '#fef3c7';
      deepseekNotice.style.border = '1px solid #f59e0b';
      deepseekNotice.style.color = '#92400e';
    }
    deepseekNotice.style.display = 'block';
  }

  function updateDeepseekNoticeFromStatus(data) {
    const st = data && data.deepseek_prompt_status;
    const msg = data && data.deepseek_prompt_message;
    if (st === 'failed' || st === 'skipped_no_key') {
      showDeepseekNotice(msg || '配图未使用 DeepSeek，已改用内置规则。', st);
    } else if (st === 'ok') {
      hideDeepseekNotice();
    }
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function resetOutput() {
    hideDeepseekNotice();
    resultBox.style.display = 'none';
    imageGallery.innerHTML = '';
    lastImages = [];
    if (resultCount) resultCount.textContent = '';
    if (btnDownloadAll) btnDownloadAll.style.display = 'none';
    if (btnCopyOutput) btnCopyOutput.style.display = 'none';
    if (btnOpenOutput) btnOpenOutput.style.display = 'none';
    cancelButton.style.display = 'none';
    cancelButton.disabled = false;
  }

  function renderGallery(images) {
    imageGallery.innerHTML = '';
    lastImages = images || [];
    if (!lastImages.length) return;

    lastImages.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'tti-card';

      const cap = document.createElement('p');
      cap.className = 'tti-caption';
      cap.textContent = (item.caption || `第 ${i + 1} 张`).slice(0, 120);

      const img = document.createElement('img');
      img.src = resolveUrl(item.url);
      img.alt = item.caption || `配图 ${i + 1}`;
      img.loading = 'lazy';

      const actions = document.createElement('div');
      actions.className = 'tti-card-actions';

      const dl = document.createElement('a');
      dl.className = 'tb-btn tb-btn-sm';
      dl.href = resolveUrl(item.url);
      dl.download = item.filename || `image-${i + 1}.png`;
      dl.textContent = '下载';
      dl.target = '_blank';

      actions.appendChild(dl);
      card.appendChild(cap);
      card.appendChild(img);
      card.appendChild(actions);
      imageGallery.appendChild(card);
    });

    if (resultCount) resultCount.textContent = `（共 ${lastImages.length} 张）`;
    resultBox.style.display = 'block';
    if (btnDownloadAll) btnDownloadAll.style.display = 'inline-flex';
  }

  async function startTask() {
    const text = (textInput.value || '').trim();
    if (!text) {
      alert('请输入文字内容');
      return;
    }

    resetOutput();
    stopPolling();
    statusErrorStreak = 0;
    lastLogLen = 0;
    logOutput.innerHTML = '';

    const form = new FormData();
    form.append('text', text);
    form.append('aspect_preset', aspectSelect.value || 'xhs_34');

    startBtn.disabled = true;
    cancelButton.style.display = 'inline-block';
    setProgress(true, '提交任务中…', 0);

    try {
      const res = await fetch(`${API_BASE_URL}/text-to-images/start`, { method: 'POST', body: form });
      if (typeof check502Error !== 'undefined' && check502Error(res)) {
        throw new Error('Backend service unavailable');
      }
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      }
      currentTaskId = data.task_id;
      setProgress(true, '任务已提交，开始生成配图…', 1);
      pollStatus();
      pollingTimer = setInterval(pollStatus, 1500);
    } catch (e) {
      if (e.message !== 'Backend service unavailable') {
        alert(String(e.message || e));
      }
      setProgress(false);
    } finally {
      startBtn.disabled = false;
    }
  }

  function stageName(stage) {
    if (stage === 'init') return '初始化';
    if (stage === 'prompt_llm') return 'AI 编写画面提示词';
    if (stage === 'image') return '生成配图';
    if (stage === 'done') return '完成';
    return stage || '处理中';
  }

  async function pollStatus() {
    if (!currentTaskId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/text-to-images/status?task_id=${encodeURIComponent(currentTaskId)}`);
      if (typeof check502Error !== 'undefined' && check502Error(response)) {
        logMessage('后端服务未开启');
        return;
      }
      if (!response.ok) {
        logMessage(`状态检查失败：HTTP ${response.status}`);
        return;
      }
      const data = await response.json();
      statusErrorStreak = 0;

      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (lastLogLen === 0 && logs.length > 0) logOutput.innerHTML = '';
      if (logs.length > lastLogLen) {
        for (let i = lastLogLen; i < logs.length; i++) {
          logMessage(String(logs[i]));
        }
        lastLogLen = logs.length;
      }

      if (data.status === 'error') {
        stopPolling();
        setProgress(true, `失败：${data.error || '未知错误'}`, 0);
        return;
      }

      const total = Number(data.progress && data.progress.total || 0);
      const cur = Number(data.progress && data.progress.current || 0);
      let percent = total > 0 ? Math.round((cur / total) * 100) : 0;
      if (data.stage === 'done') percent = 100;

      const statusText = data.stage === 'prompt_llm'
        ? 'DeepSeek 正在把各句写成画面提示词…'
        : `${stageName(data.stage)}… (${cur}/${total || '-'})`;

      setProgress(true, statusText, percent);
      updateDeepseekNoticeFromStatus(data);

      if (data.status === 'done' && Array.isArray(data.images) && data.images.length) {
        stopPolling();
        setProgress(true, '完成', 100);
        renderGallery(data.images);
        lastOutputDirectory = (data.output_directory && String(data.output_directory)) || '';
        lastDoneTaskId = (data.task_id && String(data.task_id)) || currentTaskId || '';
        if (btnCopyOutput && lastOutputDirectory) btnCopyOutput.style.display = 'inline-flex';
        if (btnOpenOutput && isLocal && lastDoneTaskId) btnOpenOutput.style.display = 'inline-flex';
        if (lastOutputDirectory) logMessage(`输出目录：${lastOutputDirectory}`);
        cancelButton.style.display = 'none';
      }
    } catch (e) {
      statusErrorStreak += 1;
      logMessage(`状态获取失败（${statusErrorStreak}/5）：${String(e.message || e)}`);
      if (statusErrorStreak >= 5) {
        stopPolling();
        setProgress(true, '连接超时，请检查 comfyui-api-server 是否在线', 0);
      }
    }
  }

  cancelButton.addEventListener('click', async function () {
    const tid = currentTaskId;
    currentTaskId = null;
    stopPolling();
    try {
      if (tid) {
        await fetch(`${API_BASE_URL}/text-to-images/cancel?task_id=${encodeURIComponent(tid)}`, { method: 'POST' });
      }
    } catch (e) { /* ignore */ }
    logMessage('已发送取消请求');
    cancelButton.style.display = 'none';
  });

  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', function () {
      if (!lastImages.length) return;
      lastImages.forEach(function (item, i) {
        setTimeout(function () {
          const a = document.createElement('a');
          a.href = resolveUrl(item.url);
          a.download = item.filename || `image-${i + 1}.png`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, i * 300);
      });
    });
  }

  if (btnCopyOutput) {
    btnCopyOutput.addEventListener('click', async function () {
      if (!lastOutputDirectory) return;
      try {
        await navigator.clipboard.writeText(lastOutputDirectory);
        logMessage('已复制输出目录到剪贴板');
      } catch (e) {
        prompt('请手动复制：', lastOutputDirectory);
      }
    });
  }

  if (btnOpenOutput) {
    btnOpenOutput.addEventListener('click', async function () {
      if (!lastDoneTaskId) return;
      try {
        const fd = new FormData();
        fd.append('task_id', lastDoneTaskId);
        const res = await fetch(`${API_BASE_URL}/text-to-images/reveal-output`, { method: 'POST', body: fd });
        const j = await res.json().catch(function () { return {}; });
        if (!res.ok || !j.success) throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        logMessage('已在运行 API 的电脑上打开输出文件夹');
      } catch (e) {
        alert(String(e.message || e));
      }
    });
  }

  function clearAll() {
    stopPolling();
    currentTaskId = null;
    textInput.value = '';
    resetOutput();
    setProgress(false);
    logOutput.innerHTML = '';
  }

  if (startBtn) startBtn.addEventListener('click', startTask);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  setProgress(false);
});
