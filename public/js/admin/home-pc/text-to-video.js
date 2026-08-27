document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('start-btn');
  const clearBtn = document.getElementById('clear-btn');
  const cancelButton = document.getElementById('cancel-button');

  const textInput = document.getElementById('text-input');
  const deepseekNotice = document.getElementById('deepseek-notice');
  const voiceSelect = document.getElementById('voice-select');
  const speedInput = document.getElementById('speed-input');

  const optVideo16_9 = document.getElementById('opt-video-16-9');
  const optVideo9_16 = document.getElementById('opt-video-9-16');

  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');

  const videoBox = document.getElementById('video-box');
  const videoEl = document.getElementById('result-video');
  const videoEl16_9 = document.getElementById('result-video-16-9');
  const btnCopyOutput = document.getElementById('btn-copy-output');
  const btnOpenOutput = document.getElementById('btn-open-output');

  const resultVideosRow = document.getElementById('result-videos-row');
  const wrapResult16 = document.getElementById('wrap-result-16-9');
  const wrapResult9 = document.getElementById('wrap-result-9-16');

  const logOutput = document.getElementById('log-output');
  const logContainer = document.getElementById('log-container');

  const API_BASE_URL = window.HomePcApi.base();

  let pollingTimer = null;
  let currentTaskId = null;
  let videoProgressCreep = 0;
  let statusErrorStreak = 0;
  let lastLogLen = 0;
  let lastOutputDirectory = '';
  let lastDoneTaskId = '';

  function setProgress(visible, statusText, percent) {
    progressWrap.style.display = visible ? 'block' : 'none';
    if (statusText != null) progressStatus.textContent = statusText;
    if (percent != null) {
      const p = Math.max(0, Math.min(100, Number(percent) || 0));
      progressPercent.textContent = `${p}%`;
      progressBar.style.width = `${p}%`;
    }
  }

  function applyResultLayout(opts) {
    const o = opts || {};
    const anyV = !!(o.wantVideo16_9 || o.wantVideo9_16);
    if (wrapResult16) wrapResult16.style.display = o.wantVideo16_9 ? 'block' : 'none';
    if (wrapResult9) wrapResult9.style.display = o.wantVideo9_16 ? 'block' : 'none';
    if (resultVideosRow) resultVideosRow.style.display = anyV ? 'flex' : 'none';
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

  function resetOutput() {
    hideDeepseekNotice();
    videoBox.style.display = 'none';
    applyResultLayout({ wantVideo16_9: false, wantVideo9_16: false });
    videoEl.removeAttribute('src');
    videoEl.load();
    if (videoEl16_9) {
      videoEl16_9.removeAttribute('src');
      videoEl16_9.load();
    }
    lastOutputDirectory = '';
    lastDoneTaskId = '';
    if (btnCopyOutput) {
      btnCopyOutput.style.display = 'none';
    }
    if (btnOpenOutput) {
      btnOpenOutput.style.display = 'none';
    }

  }

  function getExportOptions() {
    const wantVideo16_9 = optVideo16_9 ? !!optVideo16_9.checked : false;
    const wantVideo9_16 = optVideo9_16 ? !!optVideo9_16.checked : true;
    return {
      wantVideo16_9,
      wantVideo9_16,
      hasAnyVideo: wantVideo16_9 || wantVideo9_16,
    };
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function logMessage(msg) {
    logOutput.innerHTML += msg + '\n';
    logContainer.scrollTop = logContainer.scrollHeight;  // Auto-scroll to bottom
  }

  async function startTask() {
    const text = (textInput.value || '').trim();
    if (!text) {
      alert('请输入要生成的文字内容（按句号/叹号/问号/逗号断句）');
      textInput.focus();
      return;
    }

    const opts = getExportOptions();
    if (!opts.hasAnyVideo) {
      alert('请至少选择一种导出视频（横屏 16:9 或竖屏 9:16）');
      return;
    }

    resetOutput();
    stopPolling();
    videoProgressCreep = 0;
    statusErrorStreak = 0;
    lastLogLen = 0;

    const form = new FormData();
    form.append('text', text);

    const speed = Number(speedInput.value || 1.0);
    const voice = voiceSelect.value;

    form.append('speed', String(Number.isFinite(speed) ? speed : 1.0));
    form.append('voice', voice);

    form.append('gen_video_16_9', opts.wantVideo16_9 ? '1' : '0');
    form.append('gen_video_9_16', opts.wantVideo9_16 ? '1' : '0');

    startBtn.disabled = true;
    cancelButton.style.display = 'inline-block';  // Show cancel button when task starts
    setProgress(true, '提交任务中...', 0);

    try {
      const res = await fetch(`${API_BASE_URL}/text-to-video/start`, {
        method: 'POST',
        body: form
      });

      // 检查502错误
      if (typeof check502Error !== 'undefined' && check502Error(res)) {
        throw new Error('Backend service unavailable');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      }

      currentTaskId = data.task_id;
      setProgress(true, '任务已提交，开始生成...', 1);
      pollStatus();
      pollingTimer = setInterval(pollStatus, 1500);
    } catch (e) {
      // 如果是502错误，已经显示弹窗，这里只显示简要提示
      if (e.message === 'Backend service unavailable') {
        setProgress(false);
      } else {
        alert(String(e.message || e));
        setProgress(false);
      }
    } finally {
      startBtn.disabled = false;
    }
  }

  function stageName(stage) {
    if (stage === 'init') return '初始化';
    if (stage === 'prompt_llm') return 'AI 编写画面提示词';
    if (stage === 'image') return '生成图片';
    if (stage === 'tts') return '合成语音';
    if (stage === 'video') return '合成视频';
    if (stage === 'done') return '完成';
    return stage || '处理中';
  }

  async function pollStatus() {
    if (!currentTaskId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/text-to-video/status?task_id=${encodeURIComponent(currentTaskId)}`);
      // 检查502错误
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

      // Prefer backend logs, avoid spamming repeated poll lines.
      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (lastLogLen === 0 && logs.length > 0) {
        logOutput.innerHTML = '';
      }
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

      const total = Number(data.progress?.total || 0);
      const cur = Number(data.progress?.current || 0);
      let percent = 0;
      if (total > 0) {
        percent = Math.round((cur / total) * 85);
      }
      if (data.stage === 'video') {
        videoProgressCreep = Math.min(9, videoProgressCreep + 1);
        percent = Math.max(percent, 90 + videoProgressCreep);
      } else {
        videoProgressCreep = 0;
      }
      if (data.stage === 'done') percent = 100;

      const statusText = data.stage === 'video'
        ? '合成视频中（耗时较长，请耐心等待）'
        : data.stage === 'prompt_llm'
          ? 'DeepSeek 正在把各句口播写成画面提示词…'
          : `${stageName(data.stage)}... (${cur}/${total || '-'})`;

      setProgress(true, statusText, percent);
      updateDeepseekNoticeFromStatus(data);

      const url9_16 = data.video_url_9_16 || data.video_url;
      const url16_9 = data.video_url_16_9;

      const opts = getExportOptions();

      if (data.status === 'done' && (url9_16 || url16_9 || data.output_directory)) {
        stopPolling();
        setProgress(true, '完成', 100);
        videoProgressCreep = 0;
        // 积分刷新已移除（媒体工具集不需要登录验证和积分）

        // 视频预览/下载（竖屏 9:16）
        if (opts.wantVideo9_16 && url9_16) {
          const videoUrl = url9_16.startsWith('http')
            ? url9_16
            : `${API_BASE_URL}${url9_16.startsWith('/') ? '' : '/'}${url9_16}`;
          videoEl.src = videoUrl;
        } else {
          videoEl.removeAttribute('src');
          videoEl.load();
        }

        if (videoEl16_9 && opts.wantVideo16_9 && url16_9) {
          const videoUrl16_9 = url16_9.startsWith('http')
            ? url16_9
            : `${API_BASE_URL}${url16_9.startsWith('/') ? '' : '/'}${url16_9}`;
          videoEl16_9.src = videoUrl16_9;
        } else if (videoEl16_9) {
          videoEl16_9.removeAttribute('src');
          videoEl16_9.load();
        }

        lastOutputDirectory = (data.output_directory && String(data.output_directory)) || '';
        lastDoneTaskId = (data.task_id && String(data.task_id)) || currentTaskId || '';
        if (btnCopyOutput && lastOutputDirectory) {
          btnCopyOutput.style.display = 'inline-block';
        }
        if (btnOpenOutput && isLocal && lastDoneTaskId) {
          btnOpenOutput.style.display = 'inline-block';
        }
        if (lastOutputDirectory) {
          logMessage(`输出目录：${lastOutputDirectory}`);
        }

        updateDeepseekNoticeFromStatus(data);
        applyResultLayout(opts);
        videoBox.style.display = 'block';
        cancelButton.disabled = true;  // Disable cancel button when task completes
      }
    } catch (e) {
      statusErrorStreak += 1;
      logMessage(`状态获取失败（将自动重试 ${statusErrorStreak}/5）：${String(e.message || e)}`);
      if (statusErrorStreak >= 5) {
        stopPolling();
        setProgress(true, `失败：连接超时/网络异常（已重试多次）。请检查后端是否在线、反代是否超时、ComfyUI 是否卡住。`, 0);
      }
    }
  }

  cancelButton.addEventListener('click', async () => {
    const tid = currentTaskId;
    currentTaskId = null;
    stopPolling();
    try {
      if (tid) {
        await fetch(`${API_BASE_URL}/text-to-video/cancel?task_id=${encodeURIComponent(tid)}`, { method: 'POST' });
      }
    } catch (e) {
      // ignore
    }
    logMessage('已发送取消请求');
    cancelButton.style.display = 'none';
  });

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

  if (btnCopyOutput) {
    btnCopyOutput.addEventListener('click', async () => {
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
    btnOpenOutput.addEventListener('click', async () => {
      if (!lastDoneTaskId) return;
      try {
        const fd = new FormData();
        fd.append('task_id', lastDoneTaskId);
        const res = await fetch(`${API_BASE_URL}/text-to-video/reveal-output`, { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
          throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        }
        logMessage('已在运行 API 的电脑上打开输出文件夹（请在本机访问 localhost:5000 时使用）');
      } catch (e) {
        alert(String(e.message || e));
      }
    });
  }

  setProgress(false);
});
