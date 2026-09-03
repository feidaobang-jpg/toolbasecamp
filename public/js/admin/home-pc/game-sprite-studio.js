document.addEventListener('DOMContentLoaded', function () {
  var startBtn = document.getElementById('start-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var clearBtn = document.getElementById('clear-btn');
  var confirmPickBtn = document.getElementById('confirm-pick-btn');
  var exportBtn = document.getElementById('export-btn');
  var openOutputBtn = document.getElementById('open-output-btn');
  var copyGodotBtn = document.getElementById('copy-godot-btn');
  var copyLogBtn = document.getElementById('copy-log-btn');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');
  var briefInput = document.getElementById('brief-input');
  var charName = document.getElementById('char-name');
  var canvasSelect = document.getElementById('canvas-select');
  var fpsSelect = document.getElementById('fps-select');
  var candidatesSelect = document.getElementById('candidates-select');
  var typeRow = document.getElementById('type-row');
  var styleRow = document.getElementById('style-row');
  var actionsRow = document.getElementById('actions-row');
  var actionsBlock = document.getElementById('actions-block');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var stillsBox = document.getElementById('stills-box');
  var stillsList = document.getElementById('stills-list');
  var previewBox = document.getElementById('preview-box');
  var previewList = document.getElementById('preview-list');
  var exportHint = document.getElementById('export-hint');
  var zipLink = document.getElementById('zip-link');
  var logOutput = document.getElementById('log-output');
  var historyList = document.getElementById('history-list');
  var refFile = document.getElementById('ref-file');
  var godotPath = document.getElementById('godot-path');

  var API_BASE = window.HomePcApi.base();
  var selectedType = 'character';
  var selectedStyle = 'cartoon';
  var currentTaskId = null;
  var pollingTimer = null;
  var lastLogLen = 0;
  var pickedStillId = null;

  var ACTION_GROUPS = [
    { key: 'idle', labelKey: 'gameSpriteActGroupIdle', fallback: '待机', ids: ['idle'] },
    { key: 'move', labelKey: 'gameSpriteActGroupMove', fallback: '移动', ids: ['walk', 'run', 'jump', 'fall'] },
    { key: 'combat', labelKey: 'gameSpriteActGroupCombat', fallback: '战斗', ids: ['attack', 'attack2', 'skill', 'defend', 'hit'] },
    { key: 'down', labelKey: 'gameSpriteActGroupDown', fallback: '倒地', ids: ['down', 'getup', 'death'] },
    { key: 'extra', labelKey: 'gameSpriteActGroupExtra', fallback: '可选补充', ids: ['cast', 'dodge', 'climb', 'swim', 'emote'] }
  ];

  var ACTION_LABELS = {
    idle: ['gameSpriteActIdle', '待机'],
    walk: ['gameSpriteActWalk', '走路'],
    run: ['gameSpriteActRun', '奔跑'],
    jump: ['gameSpriteActJump', '跳跃'],
    fall: ['gameSpriteActFall', '下落'],
    attack: ['gameSpriteActAttack', '攻击'],
    attack2: ['gameSpriteActAttack2', '攻击2'],
    skill: ['gameSpriteActSkill', '技能'],
    defend: ['gameSpriteActDefend', '防御'],
    hit: ['gameSpriteActHit', '受击'],
    down: ['gameSpriteActDown', '倒地'],
    getup: ['gameSpriteActGetup', '起身'],
    death: ['gameSpriteActDeath', '死亡'],
    cast: ['gameSpriteActCast', '施法'],
    dodge: ['gameSpriteActDodge', '闪避'],
    climb: ['gameSpriteActClimb', '攀爬'],
    swim: ['gameSpriteActSwim', '游泳'],
    emote: ['gameSpriteActEmote', '表情']
  };

  /** 页面默认：只选待机（生成再手点其它动作） */
  var DEFAULT_ACTIONS = ['idle'];
  /** 「全选常用」：不含可选补充 */
  var COMMON_ACTIONS = [
    'idle', 'walk', 'run', 'jump', 'fall',
    'attack', 'attack2', 'skill', 'defend', 'hit',
    'down', 'getup', 'death'
  ];
  var selectedActions = DEFAULT_ACTIONS.slice();

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function actionLabel(id) {
    var meta = ACTION_LABELS[id];
    if (!meta) return id;
    return tr('privateHub.homePc.' + meta[0], meta[1]);
  }

  function resolveUrl(url) {
    return window.HomePcApi.assetUrl(url);
  }

  function needsActions() {
    return selectedType === 'character' || selectedType === 'monster';
  }

  function setSelectedActions(ids) {
    selectedActions = (ids || []).slice();
    renderActionChips();
  }

  function renderActionChips() {
    if (!actionsRow) return;
    actionsRow.innerHTML = '';

    var toolbar = document.createElement('div');
    toolbar.className = 'gs-actions-toolbar action-row';
    var idleBtn = document.createElement('button');
    idleBtn.type = 'button';
    idleBtn.className = 'tb-btn';
    idleBtn.textContent = tr('privateHub.homePc.gameSpriteSelectDefault', '仅待机');
    idleBtn.addEventListener('click', function () {
      setSelectedActions(DEFAULT_ACTIONS);
    });
    var commonBtn = document.createElement('button');
    commonBtn.type = 'button';
    commonBtn.className = 'tb-btn';
    commonBtn.textContent = tr('privateHub.homePc.gameSpriteSelectCommon', '全选常用');
    commonBtn.addEventListener('click', function () {
      setSelectedActions(COMMON_ACTIONS);
    });
    var clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'tb-btn';
    clearAllBtn.textContent = tr('privateHub.homePc.gameSpriteClearAll', '清空全部');
    clearAllBtn.addEventListener('click', function () {
      setSelectedActions([]);
    });
    toolbar.appendChild(idleBtn);
    toolbar.appendChild(commonBtn);
    toolbar.appendChild(clearAllBtn);
    actionsRow.appendChild(toolbar);

    ACTION_GROUPS.forEach(function (group) {
      var row = document.createElement('div');
      row.className = 'gs-action-row';

      var label = document.createElement('div');
      label.className = 'gs-action-row-label';
      label.textContent = tr('privateHub.homePc.' + group.labelKey, group.fallback);
      row.appendChild(label);

      var chips = document.createElement('div');
      chips.className = 'gs-actions';
      group.ids.forEach(function (a) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rec-chip gs-action-chip' + (selectedActions.indexOf(a) >= 0 ? ' is-active' : '');
        btn.setAttribute('data-action', a);
        btn.title = a;
        var main = document.createElement('span');
        main.className = 'gs-action-main';
        main.textContent = actionLabel(a);
        var sub = document.createElement('span');
        sub.className = 'gs-action-id';
        sub.textContent = a;
        btn.appendChild(main);
        btn.appendChild(sub);
        btn.addEventListener('click', function () {
          var i = selectedActions.indexOf(a);
          if (i >= 0) selectedActions.splice(i, 1);
          else selectedActions.push(a);
          btn.classList.toggle('is-active');
        });
        chips.appendChild(btn);
      });
      row.appendChild(chips);
      actionsRow.appendChild(row);
    });
    if (actionsBlock) actionsBlock.style.display = needsActions() ? '' : 'none';
  }

  function bindChipRow(row, attr, onPick) {
    if (!row) return;
    row.querySelectorAll('.rec-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        row.querySelectorAll('.rec-chip').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        onPick(btn.getAttribute(attr));
      });
    });
  }

  bindChipRow(typeRow, 'data-type', function (v) {
    selectedType = v || 'character';
    if (actionsBlock) actionsBlock.style.display = needsActions() ? '' : 'none';
  });
  bindChipRow(styleRow, 'data-style', function (v) {
    selectedStyle = v || 'cartoon';
  });
  renderActionChips();
  document.addEventListener('tb:locale', function () {
    renderActionChips();
  });

  function setBusy(busy) {
    if (startBtn) startBtn.disabled = !!busy;
    if (cancelBtn) cancelBtn.disabled = !busy;
    if (confirmPickBtn) confirmPickBtn.disabled = !!busy && !!currentTaskId;
  }

  function appendLogs(logs) {
    if (!logOutput || !Array.isArray(logs)) return;
    if (logs.length <= lastLogLen) return;
    var chunk = logs.slice(lastLogLen);
    lastLogLen = logs.length;
    logOutput.textContent += (logOutput.textContent ? '\n' : '') + chunk.join('\n');
    // 不自动滚动（全局约定）
  }

  function updateProgress(data) {
    if (!progressWrap) return;
    var st = data.status || '';
    var stage = data.stage || '';
    var cur = (data.progress && data.progress.current) || 0;
    var tot = (data.progress && data.progress.total) || 1;
    var pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
    var label = stage;
    if (data.current_action) label += ' · ' + data.current_action;
    if (st === 'waiting_pick') label = tr('privateHub.homePc.gameSpriteWaitingPick', '等待选图');
    if (st === 'done') label = tr('privateHub.homePc.gameSpriteDone', '完成');
    if (st === 'failed') label = tr('privateHub.homePc.gameSpriteFailed', '失败') + (data.error ? ': ' + data.error : '');
    progressWrap.style.display = 'block';
    if (progressStatus) progressStatus.textContent = label;
    if (progressPercent) progressPercent.textContent = pct + '%';
    if (progressBar) progressBar.style.width = pct + '%';
  }

  var STILL_KIND_LABELS = {
    front: ['gameSpriteStillFront', '正面'],
    back: ['gameSpriteStillBack', '背面'],
    left: ['gameSpriteStillLeft', '左侧面'],
    right: ['gameSpriteStillRight', '右侧面'],
    side_00: ['gameSpriteStillSide', '侧视定妆'],
    side_01: ['gameSpriteStillSide', '侧视定妆'],
    side_02: ['gameSpriteStillSide', '侧视定妆'],
    concept: ['gameSpriteStillConcept', '概念图'],
    upload: ['gameSpriteStillUpload', '上传']
  };

  function stillKindLabel(kind) {
    var k = String(kind || '');
    if (STILL_KIND_LABELS[k]) {
      return tr('privateHub.homePc.' + STILL_KIND_LABELS[k][0], STILL_KIND_LABELS[k][1]);
    }
    if (k.indexOf('side_') === 0) {
      return tr('privateHub.homePc.gameSpriteStillSide', '侧视定妆');
    }
    return k;
  }

  var lightbox = document.getElementById('gs-lightbox');
  var lightboxImg = document.getElementById('gs-lightbox-img');
  var lightboxBackdrop = lightbox ? lightbox.querySelector('.trailer-lightbox-backdrop') : null;

  function openLightbox(src) {
    if (!lightbox || !lightboxImg || !src) return;
    lightboxImg.src = src;
    lightboxImg.title = tr('privateHub.homePc.trailerPreviewTapClose', '点击关闭');
    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImg.removeAttribute('src');
  }

  if (lightboxImg) lightboxImg.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  function renderStills(list, opts) {
    if (!stillsBox || !stillsList) return;
    var items = Array.isArray(list) ? list : [];
    if (!items.length) {
      stillsBox.style.display = 'none';
      return;
    }
    stillsBox.style.display = 'block';
    var generating = !!(opts && opts.generating);
    var hintEl = stillsBox.querySelector('.gs-stills-live-hint');
    if (!hintEl) {
      hintEl = document.createElement('p');
      hintEl.className = 'small-hint gs-stills-live-hint';
      var title = stillsBox.querySelector('.home-pc-result-title');
      if (title && title.nextSibling) stillsBox.insertBefore(hintEl, title.nextSibling);
      else stillsBox.insertBefore(hintEl, stillsList);
    }
    hintEl.textContent = generating
      ? tr('privateHub.homePc.gameSpriteStillsLive', '生成中：已出的图可先预览，全部完成后再确认选图。')
      : tr(
          'privateHub.homePc.gameSpriteStillsHint',
          '默认三视图：正面、背面、侧视定妆（绿幕抠成透明）。动作必须选「侧视定妆」；正/背只作设定对照。点放大镜看大图。'
        );
    if (confirmPickBtn) confirmPickBtn.disabled = !!generating;

    // 未选手动时，默认勾选侧视定妆
    if (!pickedStillId && !generating) {
      var prefer = null;
      for (var i = 0; i < items.length; i++) {
        var kid = String(items[i].id || items[i].kind || '');
        if (kid.indexOf('side_') === 0) {
          prefer = kid;
          break;
        }
      }
      if (prefer) pickedStillId = prefer;
    }

    // 只增不整表重绘：已有卡片保留，避免闪烁
    var existing = {};
    stillsList.querySelectorAll('.trailer-cand[data-still-id]').forEach(function (el) {
      existing[el.getAttribute('data-still-id')] = el;
    });
    items.forEach(function (it) {
      var id = it.id || it.path;
      if (existing[id]) {
        var img0 = existing[id].querySelector('img');
        if (img0 && it.url && img0.getAttribute('data-url') !== it.url) {
          img0.src = resolveUrl(it.url);
          img0.setAttribute('data-url', it.url);
        }
        delete existing[id];
        return;
      }
      var label = document.createElement('label');
      label.className = 'trailer-cand' + (pickedStillId === id ? ' is-selected' : '');
      label.setAttribute('data-still-id', id);
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'gs-still';
      input.value = id;
      if (pickedStillId === id) input.checked = true;
      input.addEventListener('change', function () {
        pickedStillId = id;
        stillsList.querySelectorAll('.trailer-cand').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        label.classList.add('is-selected');
      });
      var img = document.createElement('img');
      var fullSrc = resolveUrl(it.url);
      img.src = fullSrc;
      img.setAttribute('data-url', it.url || '');
      img.alt = stillKindLabel(it.kind || id);
      var zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'trailer-cand-zoom';
      zoomBtn.title = tr('privateHub.homePc.trailerZoomHint', '放大');
      zoomBtn.setAttribute('aria-label', zoomBtn.title);
      zoomBtn.innerHTML = '<i class="fas fa-search-plus" aria-hidden="true"></i>';
      zoomBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(fullSrc);
      });
      var cap = document.createElement('span');
      cap.className = 'trailer-cand-cap';
      cap.textContent = stillKindLabel(it.kind || id);
      label.appendChild(input);
      label.appendChild(img);
      label.appendChild(zoomBtn);
      label.appendChild(cap);
      stillsList.appendChild(label);
    });
  }

  function renderPreview(data) {
    if (!previewBox || !previewList) return;
    var items = Array.isArray(data.preview) ? data.preview : [];
    if (!items.length && !data.zip_url) {
      previewBox.style.display = 'none';
      return;
    }
    previewBox.style.display = 'block';
    if (exportHint) {
      exportHint.textContent =
        data.export_hint ||
        tr('privateHub.homePc.gameSpriteExportHint', '可下载 ZIP 拖入 Godot 工程。');
    }
    previewList.innerHTML = '';
    items.forEach(function (anim) {
      var card = document.createElement('div');
      card.className = 'gs-preview-card';
      var title = document.createElement('div');
      title.className = 'gs-preview-title';
      title.textContent =
        actionLabel(anim.anim) + ' · ' + anim.anim + ' (' + (anim.count || 0) + ')';
      card.appendChild(title);
      if (anim.sheet_url) {
        var sheet = document.createElement('img');
        sheet.className = 'gs-sheet';
        sheet.src = resolveUrl(anim.sheet_url);
        sheet.alt = anim.anim + ' sheet';
        card.appendChild(sheet);
      }
      var row = document.createElement('div');
      row.className = 'gs-frame-row';
      (anim.frames || []).forEach(function (u) {
        var img = document.createElement('img');
        img.src = resolveUrl(u);
        img.alt = '';
        row.appendChild(img);
      });
      card.appendChild(row);
      var rerun = document.createElement('button');
      rerun.type = 'button';
      rerun.className = 'tb-btn';
      rerun.textContent = tr('privateHub.homePc.gameSpriteRerun', '重跑此动作');
      rerun.addEventListener('click', function () {
        if (!currentTaskId) return;
        var fd = new FormData();
        fd.append('task_id', currentTaskId);
        fd.append('action', anim.anim);
        fetch(API_BASE + '/game-sprite/rerun-action', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function () {
            setBusy(true);
            startPolling();
          })
          .catch(function () {});
      });
      card.appendChild(rerun);
      previewList.appendChild(card);
    });
    if (zipLink) {
      if (data.zip_url) {
        zipLink.href = resolveUrl(data.zip_url);
        zipLink.style.display = '';
      } else {
        zipLink.style.display = 'none';
      }
    }
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollingTimer = setInterval(pollStatus, 2000);
    pollStatus();
  }

  function pollStatus() {
    if (!currentTaskId) return;
    fetch(API_BASE + '/game-sprite/status?task_id=' + encodeURIComponent(currentTaskId))
      .then(function (r) {
        if (r.status === 404) {
          stopPolling();
          setBusy(false);
          if (typeof window.tbNotify === 'function') {
            window.tbNotify(
              tr(
                'privateHub.homePc.gameSpriteTaskLost',
                '任务已丢失（服务可能刚重启）。请在下方历史里点「打开」，或重新生成定妆。'
              )
            );
          }
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.success) return;
        appendLogs(data.logs || []);
        updateProgress(data);
        if (data.stills_ui && data.stills_ui.length) {
          renderStills(data.stills_ui, {
            generating: data.status === 'running' && data.stage === 'stills'
          });
        }
        if (data.preview && data.preview.length) renderPreview(data);
        else if (data.zip_url) renderPreview(data);

        var st = data.status;
        if (st === 'waiting_pick') {
          setBusy(false);
          if (cancelBtn) cancelBtn.disabled = true;
        } else if (st === 'done' || st === 'failed' || st === 'cancelled') {
          setBusy(false);
          stopPolling();
          if (st === 'done') renderPreview(data);
        } else {
          setBusy(true);
        }
      })
      .catch(function () {});
  }

  function startTask() {
    var brief = (briefInput && briefInput.value || '').trim();
    if (brief.length < 2) {
      if (typeof window.tbNotify === 'function') {
        window.tbNotify(tr('privateHub.homePc.gameSpriteNeedBrief', '请填写设定描述'));
      } else {
        alert(tr('privateHub.homePc.gameSpriteNeedBrief', '请填写设定描述'));
      }
      return;
    }
    var fd = new FormData();
    fd.append('brief', brief);
    fd.append('char_name', (charName && charName.value) || '');
    fd.append('asset_type', selectedType);
    fd.append('visual_style', selectedStyle);
    fd.append('canvas', (canvasSelect && canvasSelect.value) || '256');
    fd.append('fps', (fpsSelect && fpsSelect.value) || '8');
    fd.append('pixel_art', selectedStyle === 'pixel' ? '1' : '0');
    fd.append('candidates', (candidatesSelect && candidatesSelect.value) || '1');
    var actPayload = needsActions()
      ? (selectedActions.length ? selectedActions.join(',') : 'idle')
      : 'idle';
    fd.append('actions', actPayload);
    fd.append('frames_per_action', '8');
    fd.append('action_duration_sec', '2.5');

    lastLogLen = 0;
    if (logOutput) logOutput.textContent = '';
    pickedStillId = null;
    if (stillsBox) stillsBox.style.display = 'none';
    if (stillsList) stillsList.innerHTML = '';
    if (previewBox) previewBox.style.display = 'none';

    setBusy(true);
    fetch(API_BASE + '/game-sprite/create', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success) throw new Error((data && data.detail) || 'create failed');
        currentTaskId = data.task_id;
        startPolling();
      })
      .catch(function (e) {
        setBusy(false);
        if (typeof window.tbNotify === 'function') {
          window.tbNotify(String(e.message || e));
        }
      });
  }

  if (startBtn) startBtn.addEventListener('click', startTask);

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      if (!currentTaskId) return;
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fetch(API_BASE + '/game-sprite/cancel', { method: 'POST', body: fd });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      stopPolling();
      currentTaskId = null;
      pickedStillId = null;
      lastLogLen = 0;
      if (briefInput) briefInput.value = '';
      if (charName) charName.value = '';
      if (logOutput) logOutput.textContent = '';
      if (stillsBox) stillsBox.style.display = 'none';
      if (previewBox) previewBox.style.display = 'none';
      if (progressWrap) progressWrap.style.display = 'none';
      setBusy(false);
    });
  }

  if (confirmPickBtn) {
    confirmPickBtn.addEventListener('click', function () {
      if (!currentTaskId || !pickedStillId) {
        if (typeof window.tbNotify === 'function') {
          window.tbNotify(tr('privateHub.homePc.gameSpriteNeedPick', '请先勾选一张参考图'));
        }
        return;
      }
      var sid = String(pickedStillId);
      var isSide =
        sid.indexOf('side_') === 0 ||
        sid === 'side' ||
        sid.indexOf('upload') === 0 ||
        sid.indexOf('concept') === 0;
      if (!isSide && typeof window.tbNotify === 'function') {
        window.tbNotify(
          tr(
            'privateHub.homePc.gameSpriteNeedSidePick',
            '动作请选「侧视定妆」（不要用正面/背面跑图生视频）'
          )
        );
        return;
      }
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fd.append('still_id', pickedStillId);
      fd.append('run_actions', '1');
      setBusy(true);
      fetch(API_BASE + '/game-sprite/confirm-pick', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function () { startPolling(); })
        .catch(function () { setBusy(false); });
    });
  }

  if (refFile) {
    refFile.addEventListener('change', function () {
      var file = refFile.files && refFile.files[0];
      if (!file || !currentTaskId) return;
      var run = function (f) {
        var fd = new FormData();
        fd.append('task_id', currentTaskId);
        fd.append('image', f);
        fd.append('run_actions', '0');
        fetch(API_BASE + '/game-sprite/upload-ref', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.stills_ui) renderStills(data.stills_ui);
            if (data && data.picked) pickedStillId = data.picked.id;
            pollStatus();
          });
      };
      if (window.TBImageUploadCompress && TBImageUploadCompress.prepareUploadFile) {
        TBImageUploadCompress.prepareUploadFile(file, run, 'default');
      } else {
        run(file);
      }
      refFile.value = '';
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      if (!currentTaskId) return;
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fetch(API_BASE + '/game-sprite/export', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            pollStatus();
            if (data.zip_url && zipLink) {
              zipLink.href = resolveUrl(data.zip_url);
              zipLink.style.display = '';
            }
          }
        });
    });
  }

  if (openOutputBtn) {
    openOutputBtn.addEventListener('click', function () {
      if (!currentTaskId) return;
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fetch(API_BASE + '/game-sprite/reveal-output', { method: 'POST', body: fd });
    });
  }

  if (copyGodotBtn) {
    copyGodotBtn.addEventListener('click', function () {
      if (!currentTaskId) return;
      var path = (godotPath && godotPath.value || '').trim();
      if (!path) {
        if (typeof window.tbNotify === 'function') {
          window.tbNotify(tr('privateHub.homePc.gameSpriteNeedGodotPath', '请填写 Godot 工程路径'));
        }
        return;
      }
      var fd = new FormData();
      fd.append('task_id', currentTaskId);
      fd.append('godot_project_path', path);
      fetch(API_BASE + '/game-sprite/copy-to-godot', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var msg = data && data.success
            ? tr('privateHub.homePc.gameSpriteCopied', '已复制到工程') + ': ' + (data.dest || '')
            : (data && data.detail) || 'failed';
          if (typeof window.tbNotify === 'function') window.tbNotify(msg);
        })
        .catch(function (e) {
          if (typeof window.tbNotify === 'function') window.tbNotify(String(e));
        });
    });
  }

  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      var text = (logOutput && logOutput.textContent) || '';
      if (!text) {
        if (typeof window.tbNotify === 'function') {
          window.tbNotify(tr('privateHub.homePc.logEmpty', 'Nothing to copy'));
        }
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          if (typeof window.tbNotify === 'function') {
            window.tbNotify(tr('privateHub.homePc.logCopied', 'Copied'));
          }
        });
      }
    });
  }

  function selectChip(row, attr, value) {
    if (!row || value == null || value === '') return;
    var want = String(value);
    var matched = false;
    row.querySelectorAll('.rec-chip').forEach(function (btn) {
      var on = btn.getAttribute(attr) === want;
      btn.classList.toggle('is-active', on);
      if (on) matched = true;
    });
    return matched;
  }

  function fillFormFromTask(data) {
    if (!data) return;
    if (briefInput && data.brief != null) briefInput.value = String(data.brief);
    if (charName) {
      charName.value = String(data.char_name || data.char_id || '');
    }
    if (data.asset_type) {
      selectedType = String(data.asset_type);
      selectChip(typeRow, 'data-type', selectedType);
      if (actionsBlock) actionsBlock.style.display = needsActions() ? '' : 'none';
    }
    if (data.visual_style) {
      selectedStyle = String(data.visual_style);
      selectChip(styleRow, 'data-style', selectedStyle);
    }
    if (canvasSelect && data.canvas) {
      var cw = Array.isArray(data.canvas) ? data.canvas[0] : data.canvas;
      var key = String(cw || '');
      if (canvasSelect.querySelector('option[value="' + key + '"]')) {
        canvasSelect.value = key;
      }
    }
    if (fpsSelect && data.fps != null) {
      var fpsKey = String(data.fps);
      if (fpsSelect.querySelector('option[value="' + fpsKey + '"]')) {
        fpsSelect.value = fpsKey;
      }
    }
    if (candidatesSelect && data.candidates != null) {
      var candKey = String(data.candidates);
      if (candidatesSelect.querySelector('option[value="' + candKey + '"]')) {
        candidatesSelect.value = candKey;
      }
    }
    if (Array.isArray(data.actions) && data.actions.length) {
      setSelectedActions(data.actions);
    }
  }

  function applyOpenedTask(data) {
    if (!data || !data.task_id) return;
    currentTaskId = data.task_id;
    lastLogLen = 0;
    if (logOutput) logOutput.textContent = '';
    fillFormFromTask(data);
    appendLogs(data.logs || []);
    updateProgress(data);
    if (data.stills_ui && data.stills_ui.length) {
      if (data.picked_ref && data.picked_ref.id) pickedStillId = data.picked_ref.id;
      renderStills(data.stills_ui);
    }
    renderPreview(data);
    var st = data.status || '';
    if (st === 'running' || st === 'queued') {
      setBusy(true);
      startPolling();
    } else {
      setBusy(false);
      stopPolling();
    }
  }

  function openHistoryItem(it) {
    var fd = new FormData();
    if (it.folder) fd.append('folder', it.folder);
    if (it.task_id) fd.append('task_id', it.task_id);
    fetch(API_BASE + '/game-sprite/open', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          var msg = (data && data.detail) || tr('privateHub.homePc.gameSpriteOpenFail', '无法打开历史任务');
          if (typeof window.tbNotify === 'function') window.tbNotify(String(msg));
          return;
        }
        applyOpenedTask(data);
      })
      .catch(function (e) {
        if (typeof window.tbNotify === 'function') window.tbNotify(String(e.message || e));
      });
  }

  function loadHistory() {
    if (!historyList) return;
    fetch(API_BASE + '/game-sprite/history?limit=20')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        historyList.innerHTML = '';
        if (!items.length) {
          historyList.innerHTML =
            '<p class="trailer-history-empty">' +
            tr('privateHub.homePc.gameSpriteHistoryEmpty', '暂无历史') +
            '</p>';
          return;
        }
        items.forEach(function (it) {
          var div = document.createElement('div');
          div.className = 'trailer-history-item gs-history-item';
          var meta = document.createElement('div');
          meta.className = 'trailer-history-meta gs-history-meta';
          meta.innerHTML =
            '<strong>' +
            (it.char_id || it.folder) +
            '</strong> · ' +
            (it.status || '') +
            '<br/>' +
            (it.brief || '') +
            '<br/><span class="small-hint">' +
            (it.folder || '') +
            '</span>';
          var openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'tb-btn';
          openBtn.textContent = tr('privateHub.homePc.gameSpriteOpen', '打开');
          openBtn.addEventListener('click', function () {
            openHistoryItem(it);
          });
          div.appendChild(meta);
          div.appendChild(openBtn);
          historyList.appendChild(div);
        });
      })
      .catch(function () {});
  }

  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);
  loadHistory();
});
