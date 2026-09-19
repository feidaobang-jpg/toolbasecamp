document.addEventListener('DOMContentLoaded', function () {
  const startImagesBtn = document.getElementById('start-images-btn');
  const startVideoBtn = document.getElementById('start-video-btn');
  const clearBtn = document.getElementById('clear-btn');
  const cancelButton = document.getElementById('cancel-button');

  const textInput = document.getElementById('text-input');
  const deepseekNotice = document.getElementById('deepseek-notice');
  const aspectSelect = document.getElementById('aspect-select');
  const voiceSelect = document.getElementById('voice-select');
  const speedInput = document.getElementById('speed-input');

  const optVideo16_9 = document.getElementById('opt-video-16-9');
  const optVideo9_16 = document.getElementById('opt-video-9-16');
  const reuseReadyHint = document.getElementById('reuse-ready-hint');

  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');

  const resultBox = document.getElementById('result-box');
  const imageGallery = document.getElementById('image-gallery');
  const resultCount = document.getElementById('result-count');
  const btnDownloadAll = document.getElementById('btn-download-all');

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

  const illustrationPresets = window.TextIllustrationPresets && window.TextIllustrationPresets.bind({
    presetRow: document.getElementById('illustration-preset-row'),
    hintEl: document.getElementById('illustration-split-hint')
  });

  const API_BASE_URL = window.HomePcApi.base();

  let activeTaskKind = 'images';
  let pollingTimer = null;
  let currentTaskId = null;
  let videoProgressCreep = 0;
  let statusErrorStreak = 0;
  let lastLogLen = 0;
  let lastOutputDirectory = '';
  let lastDoneTaskId = '';
  let lastImages = [];
  /** 最近一次成功的「仅配图」任务，可供「生成视频」复用 */
  let reusableImagesTaskId = '';
  let reusableImagesText = '';
  let galleryLightbox = null;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function resolveUrl(url) {
    if (!url) return '';
    if (url.indexOf('http') === 0) return url;
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  function apiPrefix() {
    return activeTaskKind === 'images' ? 'text-to-images' : 'text-to-video';
  }

  function currentText() {
    return (textInput.value || '').trim();
  }

  function canReuseImages() {
    if (!reusableImagesTaskId || !lastImages.length) return false;
    return currentText() === reusableImagesText;
  }

  function syncReuseHint() {
    if (!reuseReadyHint) return;
    const ok = canReuseImages();
    reuseReadyHint.style.display = ok ? 'block' : 'none';
    if (startVideoBtn) {
      startVideoBtn.textContent = ok
        ? tr('privateHub.homePc.textToVideoStartVideoReuse', '生成视频（复用配图）')
        : tr('privateHub.homePc.textToVideoStartVideo', '生成视频');
    }
  }

  function setBusy(busy) {
    if (startImagesBtn) startImagesBtn.disabled = !!busy;
    if (startVideoBtn) startVideoBtn.disabled = !!busy;
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

  function clearReusableImages() {
    reusableImagesTaskId = '';
    reusableImagesText = '';
    syncReuseHint();
  }

  function resetVideoOnly() {
    if (videoBox) videoBox.style.display = 'none';
    applyResultLayout({ wantVideo16_9: false, wantVideo9_16: false });
    if (videoEl) {
      videoEl.removeAttribute('src');
      videoEl.load();
    }
    if (videoEl16_9) {
      videoEl16_9.removeAttribute('src');
      videoEl16_9.load();
    }
  }

  function resetOutput(opts) {
    const keepGallery = !!(opts && opts.keepGallery);
    hideDeepseekNotice();
    if (!keepGallery) {
      if (resultBox) resultBox.style.display = 'none';
      if (imageGallery) imageGallery.innerHTML = '';
      lastImages = [];
      if (resultCount) resultCount.textContent = '';
      if (btnDownloadAll) btnDownloadAll.style.display = 'none';
      clearReusableImages();
    }
    resetVideoOnly();
    lastOutputDirectory = '';
    lastDoneTaskId = '';
    if (btnCopyOutput) btnCopyOutput.style.display = 'none';
    if (btnOpenOutput) btnOpenOutput.style.display = 'none';
    if (cancelButton) {
      cancelButton.style.display = 'none';
      cancelButton.disabled = false;
    }
    syncReuseHint();
  }

  function getExportOptions() {
    const wantVideo16_9 = optVideo16_9 ? !!optVideo16_9.checked : false;
    const wantVideo9_16 = optVideo9_16 ? !!optVideo9_16.checked : true;
    return {
      wantVideo16_9,
      wantVideo9_16,
      hasAnyVideo: wantVideo16_9 || wantVideo9_16
    };
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function logMessage(msg) {
    if (!logOutput) return;
    logOutput.innerHTML += msg + '\n';
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
  }

  function ensureGalleryLightbox() {
    if (!window.HomePcMediaUi) return null;
    if (galleryLightbox) return galleryLightbox;
    window.HomePcMediaUi.ensureLightboxDom();
    galleryLightbox = window.HomePcMediaUi.createLightbox({
      getItems: function () {
        return lastImages.map(function (item) {
          return {
            url: resolveUrl(item.url),
            name: item.caption || item.filename || ''
          };
        });
      },
      getHdUrl: function (it) {
        return it && it.url;
      },
      getCaption: function (it, i, n) {
        return ((it && it.name) || `第 ${i + 1} 张`).slice(0, 120) + ' · #' + (i + 1) + ' / ' + n;
      },
      onBoundary: function (edge) {
        alert(
          edge === 'first'
            ? tr('privateHub.homePc.imagePipeLbFirst', '已经是第一张')
            : tr('privateHub.homePc.imagePipeLbLast', '已经是最后一张')
        );
      }
    });
    return galleryLightbox;
  }

  function renderGallery(images) {
    if (!imageGallery || !resultBox) return;
    imageGallery.innerHTML = '';
    lastImages = Array.isArray(images) ? images.slice() : [];
    if (!lastImages.length) {
      if (resultCount) resultCount.textContent = '';
      resultBox.style.display = 'none';
      if (btnDownloadAll) btnDownloadAll.style.display = 'none';
      return;
    }

    const MediaUi = window.HomePcMediaUi;

    lastImages.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'tti-card';

      const cap = document.createElement('p');
      cap.className = 'tti-caption';
      const capBase = (item.caption || `第 ${i + 1} 张`).slice(0, 120);
      const knownDim = MediaUi && MediaUi.formatItemDimSize ? MediaUi.formatItemDimSize(item) : '';
      if (knownDim) {
        cap.textContent = capBase + ' · ' + knownDim;
      } else {
        cap.textContent = capBase;
        const hdForProbe = item.url || '';
        if (MediaUi && typeof MediaUi.probeOriginalMeta === 'function' && hdForProbe) {
          MediaUi.probeOriginalMeta(resolveUrl(hdForProbe)).then(function (meta) {
            if (!item.width && meta.width) item.width = meta.width;
            if (!item.height && meta.height) item.height = meta.height;
            if ((item.bytes == null || item.bytes === '') && meta.bytes) item.bytes = meta.bytes;
            const dim = MediaUi.formatDimSize(meta.width, meta.height, meta.bytes);
            if (dim) cap.textContent = capBase + ' · ' + dim;
          });
        }
      }

      const img = document.createElement('img');
      img.alt = item.caption || `配图 ${i + 1}`;
      img.loading = 'lazy';
      img.style.cursor = 'pointer';
      img.addEventListener('click', function () {
        const lb = ensureGalleryLightbox();
        if (lb) lb.openAt(i);
      });

      const hdUrl = resolveUrl(item.url);
      const apiThumb = item.thumb_url ? resolveUrl(item.thumb_url) : '';
      if (apiThumb) {
        img.src = apiThumb;
      } else if (MediaUi && typeof MediaUi.makeThumbDataUrl === 'function' && hdUrl) {
        MediaUi.makeThumbDataUrl(hdUrl)
          .then(function (thumb) {
            item._clientThumb = thumb;
            img.src = thumb;
          })
          .catch(function () {
            img.src = hdUrl;
          });
      } else {
        img.src = hdUrl;
      }

      card.appendChild(cap);
      card.appendChild(img);

      if (MediaUi) {
        MediaUi.appendCardActions(card, {
          onDownload: function () {
            MediaUi.triggerDownload(hdUrl, item.filename || `image-${i + 1}.png`).catch(function () {
              /* ignore */
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
            lastImages.splice(i, 1);
            if (!lastImages.length) {
              clearReusableImages();
            }
            renderGallery(lastImages);
          }
        });
      } else {
        const actions = document.createElement('div');
        actions.className = 'tti-card-actions action-row';
        const dl = document.createElement('a');
        dl.className = 'tb-btn';
        dl.href = hdUrl;
        dl.download = item.filename || `image-${i + 1}.png`;
        dl.textContent = tr('privateHub.homePc.download', '下载');
        dl.target = '_blank';
        actions.appendChild(dl);
        card.appendChild(actions);
      }

      imageGallery.appendChild(card);
    });

    if (resultCount) resultCount.textContent = `（共 ${lastImages.length} 张）`;
    resultBox.style.display = 'block';
    if (btnDownloadAll) btnDownloadAll.style.display = 'inline-flex';
  }

  function stageName(stage) {
    if (stage === 'init') return '初始化';
    if (stage === 'prompt_llm') return 'AI 编写画面提示词';
    if (stage === 'image') return activeTaskKind === 'images' ? '生成配图' : '生成图片';
    if (stage === 'tts') return '合成语音';
    if (stage === 'video') return '合成视频';
    if (stage === 'done') return '完成';
    return stage || '处理中';
  }

  async function startImages() {
    const text = currentText();
    if (!text) {
      alert('请输入要生成的文字内容');
      textInput.focus();
      return;
    }

    resetOutput();
    stopPolling();
    videoProgressCreep = 0;
    statusErrorStreak = 0;
    lastLogLen = 0;
    if (logOutput) logOutput.innerHTML = '';
    activeTaskKind = 'images';

    const form = new FormData();
    form.append('text', text);
    form.append('aspect_preset', (aspectSelect && aspectSelect.value) || 'xhs_34');
    form.append('style_preset', (illustrationPresets && illustrationPresets.getActive)
      ? illustrationPresets.getActive()
      : '');

    setBusy(true);
    cancelButton.style.display = 'inline-block';
    setProgress(true, '提交配图任务…', 0);

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
      if (e.message !== 'Backend service unavailable') alert(String(e.message || e));
      setProgress(false);
    } finally {
      setBusy(false);
    }
  }

  async function startVideo() {
    const text = currentText();
    const reuse = canReuseImages();
    if (!text && !reuse) {
      alert('请输入要生成的文字内容');
      textInput.focus();
      return;
    }

    const opts = getExportOptions();
    if (!opts.hasAnyVideo) {
      alert('请至少选择一种导出视频（横屏 16:9 或竖屏 9:16）');
      return;
    }

    resetOutput({ keepGallery: reuse });
    stopPolling();
    videoProgressCreep = 0;
    statusErrorStreak = 0;
    lastLogLen = 0;
    if (logOutput) logOutput.innerHTML = '';
    activeTaskKind = 'video';

    const form = new FormData();
    form.append('text', text || reusableImagesText);
    form.append('style_preset', (illustrationPresets && illustrationPresets.getActive)
      ? illustrationPresets.getActive()
      : '');
    const speed = Number((speedInput && speedInput.value) || 1.0);
    form.append('speed', String(Number.isFinite(speed) ? speed : 1.0));
    form.append('voice', (voiceSelect && voiceSelect.value) || 'zh-CN-XiaoxiaoNeural');
    form.append('gen_video_16_9', opts.wantVideo16_9 ? '1' : '0');
    form.append('gen_video_9_16', opts.wantVideo9_16 ? '1' : '0');
    if (reuse) {
      form.append('reuse_images_task_id', reusableImagesTaskId);
    }

    setBusy(true);
    cancelButton.style.display = 'inline-block';
    setProgress(true, reuse ? '提交成片任务（复用配图）…' : '提交成片任务…', 0);

    try {
      const res = await fetch(`${API_BASE_URL}/text-to-video/start`, { method: 'POST', body: form });
      if (typeof check502Error !== 'undefined' && check502Error(res)) {
        throw new Error('Backend service unavailable');
      }
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      }
      currentTaskId = data.task_id;
      if (data.reused_images) {
        logMessage('将复用已生成的配图，跳过生图步骤');
      }
      setProgress(true, data.reused_images ? '已提交，开始配音与合成…' : '任务已提交，开始生成…', 1);
      pollStatus();
      pollingTimer = setInterval(pollStatus, 1500);
    } catch (e) {
      if (e.message !== 'Backend service unavailable') alert(String(e.message || e));
      setProgress(false);
    } finally {
      setBusy(false);
    }
  }

  async function pollStatus() {
    if (!currentTaskId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/${apiPrefix()}/status?task_id=${encodeURIComponent(currentTaskId)}`
      );
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

      const total = Number((data.progress && data.progress.total) || 0);
      const cur = Number((data.progress && data.progress.current) || 0);
      let percent = 0;

      if (activeTaskKind === 'images') {
        percent = total > 0 ? Math.round((cur / total) * 100) : 0;
        if (data.stage === 'done') percent = 100;
        const statusText = data.stage === 'prompt_llm'
          ? 'DeepSeek 正在把各句写成画面提示词…'
          : `${stageName(data.stage)}… (${cur}/${total || '-'})`;
        setProgress(true, statusText, percent);
        updateDeepseekNoticeFromStatus(data);

        if (data.status === 'done' && Array.isArray(data.images) && data.images.length) {
          stopPolling();
          setProgress(true, '配图完成', 100);
          renderGallery(data.images);
          reusableImagesTaskId = (data.task_id && String(data.task_id)) || currentTaskId || '';
          reusableImagesText = currentText();
          lastOutputDirectory = (data.output_directory && String(data.output_directory)) || '';
          lastDoneTaskId = reusableImagesTaskId;
          if (btnCopyOutput && lastOutputDirectory) btnCopyOutput.style.display = 'inline-flex';
          if (btnOpenOutput && typeof isLocal !== 'undefined' && isLocal && lastDoneTaskId) {
            btnOpenOutput.style.display = 'inline-flex';
          }
          if (lastOutputDirectory) logMessage(`输出目录：${lastOutputDirectory}`);
          logMessage('配图可用：若满意可直接点「生成视频」继续配音合成，无需重新生图');
          cancelButton.style.display = 'none';
          syncReuseHint();
        }
        return;
      }

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

        if (opts.wantVideo9_16 && url9_16 && videoEl) {
          videoEl.src = resolveUrl(url9_16);
        } else if (videoEl) {
          videoEl.removeAttribute('src');
          videoEl.load();
        }

        if (videoEl16_9 && opts.wantVideo16_9 && url16_9) {
          videoEl16_9.src = resolveUrl(url16_9);
        } else if (videoEl16_9) {
          videoEl16_9.removeAttribute('src');
          videoEl16_9.load();
        }

        lastOutputDirectory = (data.output_directory && String(data.output_directory)) || '';
        lastDoneTaskId = (data.task_id && String(data.task_id)) || currentTaskId || '';
        if (btnCopyOutput && lastOutputDirectory) btnCopyOutput.style.display = 'inline-block';
        if (btnOpenOutput && typeof isLocal !== 'undefined' && isLocal && lastDoneTaskId) {
          btnOpenOutput.style.display = 'inline-block';
        }
        if (lastOutputDirectory) logMessage(`输出目录：${lastOutputDirectory}`);

        updateDeepseekNoticeFromStatus(data);
        applyResultLayout(opts);
        if (videoBox) videoBox.style.display = 'block';
        cancelButton.disabled = true;
        cancelButton.style.display = 'none';
        syncReuseHint();
      }
    } catch (e) {
      statusErrorStreak += 1;
      logMessage(`状态获取失败（将自动重试 ${statusErrorStreak}/5）：${String(e.message || e)}`);
      if (statusErrorStreak >= 5) {
        stopPolling();
        setProgress(true, '失败：连接超时/网络异常（已重试多次）。请检查后端是否在线。', 0);
      }
    }
  }

  cancelButton.addEventListener('click', async function () {
    const tid = currentTaskId;
    currentTaskId = null;
    stopPolling();
    try {
      if (tid) {
        await fetch(`${API_BASE_URL}/${apiPrefix()}/cancel?task_id=${encodeURIComponent(tid)}`, {
          method: 'POST'
        });
      }
    } catch (e) { /* ignore */ }
    logMessage('已发送取消请求');
    cancelButton.style.display = 'none';
    setBusy(false);
  });

  function clearAll() {
    stopPolling();
    currentTaskId = null;
    textInput.value = '';
    if (illustrationPresets && illustrationPresets.reset) illustrationPresets.reset();
    resetOutput();
    setProgress(false);
    if (logOutput) logOutput.innerHTML = '';
    setBusy(false);
  }

  if (startImagesBtn) startImagesBtn.addEventListener('click', startImages);
  if (startVideoBtn) startVideoBtn.addEventListener('click', startVideo);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);

  if (textInput) {
    textInput.addEventListener('input', function () {
      if (reusableImagesTaskId && currentText() !== reusableImagesText) {
        syncReuseHint();
      } else {
        syncReuseHint();
      }
    });
  }

  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', function () {
      if (!lastImages.length) return;
      lastImages.forEach(function (item, i) {
        setTimeout(function () {
          const url = resolveUrl(item.url);
          const name = item.filename || `image-${i + 1}.png`;
          if (window.HomePcMediaUi && HomePcMediaUi.triggerDownload) {
            HomePcMediaUi.triggerDownload(url, name).catch(function () { /* ignore */ });
            return;
          }
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
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
        const prefix = reusableImagesTaskId && lastDoneTaskId === reusableImagesTaskId
          ? 'text-to-images'
          : 'text-to-video';
        const res = await fetch(`${API_BASE_URL}/${prefix}/reveal-output`, {
          method: 'POST',
          body: fd
        });
        const j = await res.json().catch(function () { return {}; });
        if (!res.ok || !j.success) {
          throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        }
        logMessage('已在运行 API 的电脑上打开输出文件夹');
      } catch (e) {
        alert(String(e.message || e));
      }
    });
  }

  document.addEventListener('tb:locale', syncReuseHint);
  syncReuseHint();
  setProgress(false);

  if (window.HomePcMediaUi) {
    window.HomePcMediaUi.ensureLogToolbar(document.getElementById('log-container'), {
      getText: function () {
        return (document.getElementById('log-output') || {}).textContent || '';
      },
      onOpenDir: function () {
        if (btnOpenOutput && lastDoneTaskId) {
          btnOpenOutput.click();
          return;
        }
        alert(tr('privateHub.homePc.openLogDirNeedTask', '请先完成一次任务后再打开输出目录'));
      }
    });
  }
});
