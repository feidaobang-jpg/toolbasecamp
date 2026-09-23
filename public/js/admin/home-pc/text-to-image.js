document.addEventListener('DOMContentLoaded', function () {
  const genBtn = document.getElementById('gen-btn');
  const clearBtn = document.getElementById('clear-btn');
  const downloadBtn = document.getElementById('download-btn');
  const promptInput = document.getElementById('prompt-input');
  const widthInput = document.getElementById('width-input');
  const heightInput = document.getElementById('height-input');
  const seedInput = document.getElementById('seed-input');
  const modelRow = document.getElementById('model-row');
  const selectAllBtn = document.getElementById('select-all-models');
  const modelWarn = document.getElementById('model-warn');
  const progressWrap = document.getElementById('progress-wrap');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');
  const resultBox = document.getElementById('result-box');
  const resultGrid = document.getElementById('result-grid');
  const metaLine = document.getElementById('meta-line');
  const logOutput = document.getElementById('log-output');

  const API_BASE_URL = window.HomePcApi.base();
  const MediaUi = window.HomePcMediaUi;
  const QWEN21_ID = 'qwen-image-2.1:7b';
  const POLL_MS = 2000;

  let results = [];
  let resultsLightbox = null;
  let busy = false;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function modelShortLabel(id) {
    if (id === QWEN21_ID) {
      return tr('privateHub.homePc.txt2imgModelQwen21Short', 'Qwen-Image-2.1 · 7B');
    }
    return tr('privateHub.homePc.txt2imgModelZImageShort', 'Z-Image Turbo');
  }

  function log(msg) {
    logOutput.textContent += `${msg}\n`;
    logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
  }

  function setBusy(isBusy, text, percentText) {
    busy = !!isBusy;
    progressWrap.style.display = isBusy ? 'block' : 'none';
    if (text) progressStatus.textContent = text;
    progressPercent.textContent = isBusy ? (percentText || '…') : '';
    progressBar.style.width = isBusy ? '40%' : '0%';
    genBtn.disabled = isBusy;
    if (clearBtn) clearBtn.disabled = isBusy;
    if (downloadBtn && !isBusy && results.length) downloadBtn.style.display = 'inline-block';
  }

  // ---------- 模型多选 ----------

  function modelInputs() {
    return modelRow ? modelRow.querySelectorAll('input[name="t2i-model"]') : [];
  }

  function selectedModels() {
    const out = [];
    const inputs = modelInputs();
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].checked && !inputs[i].disabled) out.push(inputs[i].value);
    }
    return out;
  }

  /** 权重未就位的模型置灰并注明缺什么，避免用户排队后才发现跑不了。 */
  function applyModelAvailability(list) {
    const notReady = [];
    (list || []).forEach(function (m) {
      if (!m || !m.id) return;
      const input = modelRow
        ? modelRow.querySelector('input[name="t2i-model"][value="' + m.id + '"]')
        : null;
      if (!input) return;
      const span = input.parentElement ? input.parentElement.querySelector('span') : null;
      if (m.ready) {
        input.disabled = false;
        input.title = '';
        return;
      }
      const missing = (m.missing || []).join('；');
      input.disabled = true;
      input.checked = false;
      input.title = missing || tr('privateHub.homePc.txt2imgModelNotReady', '未就位');
      if (span) {
        span.textContent =
          modelShortLabel(m.id) +
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

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function () {
      const inputs = modelInputs();
      const enabled = [];
      for (let i = 0; i < inputs.length; i++) if (!inputs[i].disabled) enabled.push(inputs[i]);
      const allOn = enabled.length > 0 && enabled.every(function (x) { return x.checked; });
      enabled.forEach(function (x) { x.checked = !allOn; });
      selectAllBtn.textContent = allOn
        ? tr('privateHub.homePc.txt2imgSelectAllModels', '全选')
        : tr('privateHub.homePc.txt2imgSelectNoneModels', '取消全选');
    });
  }

  // ---------- 结果渲染 ----------

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

  function ensureLightbox() {
    if (!MediaUi) return null;
    if (resultsLightbox) return resultsLightbox;
    MediaUi.ensureLightboxDom();
    resultsLightbox = MediaUi.createLightbox({
      getItems: function () {
        return results.map(function (r) { return { url: r.cleanUrl, name: r.modelLabel }; });
      },
      getHdUrl: function (it) { return it && it.url; },
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
        .catch(function () { imgEl.src = item.cleanUrl; });
      return;
    }
    imgEl.src = item.cleanUrl || '';
  }

  function renderResults() {
    if (!resultGrid || !resultBox) return;
    resultGrid.innerHTML = '';
    if (!results.length) {
      resultBox.style.display = 'none';
      if (downloadBtn) downloadBtn.style.display = 'none';
      if (metaLine) metaLine.textContent = '';
      return;
    }
    resultBox.style.display = 'block';
    if (downloadBtn && !busy) downloadBtn.style.display = 'inline-block';
    if (metaLine) {
      metaLine.textContent = tr(
        'privateHub.homePc.txt2imgResultSummary',
        '共 {n} 张 · 种子 {seed}'
      )
        .replace('{n}', String(results.length))
        .replace('{seed}', results[0].seed_used != null ? String(results[0].seed_used) : '—');
    }

    results.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'home-pc-result-card';

      const meta = document.createElement('p');
      meta.className = 'home-pc-result-meta';
      let metaText = `${item.modelLabel} · seed ${item.seed_used != null ? item.seed_used : '—'}`;
      if (item.elapsed_sec != null) metaText += ` · ${Number(item.elapsed_sec).toFixed(1)}s`;
      const knownDim = MediaUi && MediaUi.formatItemDimSize ? MediaUi.formatItemDimSize(item) : '';
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

      const wrap = document.createElement('div');
      wrap.className = 'home-pc-result-img-wrap';
      const img = document.createElement('img');
      img.alt = item.modelLabel;
      img.style.cursor = 'pointer';
      img.addEventListener('click', function () {
        const lb = ensureLightbox();
        if (lb) lb.openAt(i);
      });
      applyThumbSrc(img, item);
      wrap.appendChild(img);
      card.appendChild(wrap);

      if (item.error) {
        const err = document.createElement('p');
        err.className = 'home-pc-result-meta';
        err.textContent = item.error;
        card.appendChild(err);
      }

      if (MediaUi) {
        MediaUi.appendCardActions(card, {
          onDownload: function () {
            downloadDataUrl(item.cleanUrl, `txt2img_${i + 1}_${Date.now()}.png`);
          },
          onDelete: function () {
            if (!window.confirm(tr('privateHub.homePc.deleteImageConfirm', '确定删除这张图？'))) return;
            results.splice(i, 1);
            renderResults();
          }
        });
      }

      resultGrid.appendChild(card);
    });
  }

  // ---------- 生成 ----------

  function parseApiError(data, status) {
    let msg = (data && (data.detail || data.error)) || `HTTP ${status}`;
    if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || String(x); }).join(' ');
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }

  function waitTask(taskId) {
    return new Promise(function (resolve, reject) {
      let timer = null;
      async function tick() {
        try {
          const res = await fetch(`${API_BASE_URL}/txt2img/status/${encodeURIComponent(taskId)}`);
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok) {
            reject(new Error(parseApiError(data, res.status)));
            return;
          }
          const st = data.status;
          if (st === 'queued' || st === 'running') {
            timer = setTimeout(tick, POLL_MS);
            return;
          }
          if (st === 'error') {
            reject(new Error(data.error || tr('privateHub.homePc.txt2imgFailed', '生成失败')));
            return;
          }
          if (st === 'done' && data.result) {
            resolve(data.result);
            return;
          }
          reject(new Error(tr('privateHub.homePc.txt2imgFailed', '生成失败')));
        } catch (e) {
          reject(e);
        }
      }
      tick();
    });
  }

  /** 一个模型一次完整任务：提交 → 轮询 → 拿结果。 */
  async function runOneModel(modelId, prompt, seedText) {
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('width', String(parseInt(widthInput.value, 10) || 1024));
    fd.append('height', String(parseInt(heightInput.value, 10) || 1024));
    fd.append('seed', seedText);
    fd.append('model', modelId);

    const res = await fetch(`${API_BASE_URL}/txt2img/start`, { method: 'POST', body: fd });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) throw new Error(parseApiError(data, res.status));
    if (!data.task_id) throw new Error('未返回 task_id');
    return waitTask(data.task_id);
  }

  async function generate() {
    if (busy) return;
    const prompt = (promptInput.value || '').trim();
    if (!prompt) {
      alert(tr('privateHub.homePc.txt2imgNeedPrompt', '请输入正向提示词'));
      promptInput.focus();
      return;
    }
    const models = selectedModels();
    if (!models.length) {
      alert(tr('privateHub.homePc.txt2imgModelNeedOne', '请至少勾选一个模型'));
      return;
    }

    // 对比要公平：种子留空时由前端定一个，所有模型共用同一种子。
    let seedText = (seedInput.value || '').trim();
    if (!seedText) {
      seedText = String(Math.floor(Math.random() * 2147483647));
      seedInput.value = seedText;
    }

    results = [];
    renderResults();
    setBusy(true, tr('privateHub.homePc.txt2imgGenerating', '提交 ComfyUI 生成中…'), `0/${models.length}`);

    let ok = 0;
    const t0 = performance.now();
    for (let i = 0; i < models.length; i++) {
      const mid = models[i];
      const label = modelShortLabel(mid);
      setBusy(
        true,
        tr('privateHub.homePc.txt2imgBatchProgress', '排队 {i}/{n} · {model}')
          .replace('{i}', String(i + 1))
          .replace('{n}', String(models.length))
          .replace('{model}', label),
        `${i}/${models.length}`
      );
      log(`${i + 1}/${models.length} ${label} seed=${seedText} 开始`);

      const itemStart = performance.now();
      try {
        const data = await runOneModel(mid, prompt, seedText);
        const cleanUrl = toDataUrl(data.image_base64);
        if (!cleanUrl) throw new Error('未返回图片数据');
        const elapsed = (performance.now() - itemStart) / 1000;
        results.push({
          modelId: mid,
          modelLabel: label,
          cleanUrl: cleanUrl,
          seed_used: data.seed_used != null ? data.seed_used : Number(seedText),
          elapsed_sec: elapsed
        });
        ok += 1;
        log(`  ${label} 完成，耗时 ${elapsed.toFixed(1)}s`);
      } catch (e) {
        const msg = window.HomePcApi && HomePcApi.friendlyFetchError
          ? HomePcApi.friendlyFetchError(e)
          : String(e.message || e);
        log(`  ${label} 失败：${msg}`);
        results.push({
          modelId: mid,
          modelLabel: label,
          cleanUrl: '',
          seed_used: Number(seedText),
          elapsed_sec: (performance.now() - itemStart) / 1000,
          error: msg
        });
      }
      renderResults();
      if (progressBar) {
        progressBar.style.width = `${Math.round(((i + 1) / models.length) * 100)}%`;
      }
    }

    const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
    log(`完成 ${ok}/${models.length}，总耗时 ${totalSec}s ${new Date().toLocaleString()}`);
    setBusy(false);
    if (ok === 0) {
      alert(tr('privateHub.homePc.txt2imgAllFailed', '所有模型都生成失败，详见日志'));
    }
  }

  function clearAll() {
    if (busy) return;
    promptInput.value = '';
    widthInput.value = '1024';
    heightInput.value = '1024';
    seedInput.value = '';
    results = [];
    renderResults();
    logOutput.textContent = '';
    const inputs = modelInputs();
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].checked = !inputs[i].disabled && inputs[i].value !== QWEN21_ID;
    }
  }

  function downloadAll() {
    results.forEach(function (item, i) {
      if (item.cleanUrl) {
        downloadDataUrl(item.cleanUrl, `txt2img_${i + 1}_${Date.now()}.png`);
      }
    });
  }

  if (genBtn) genBtn.addEventListener('click', generate);
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadAll);

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
