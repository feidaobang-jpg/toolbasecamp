document.addEventListener('DOMContentLoaded', function () {
  var API_BASE = window.HomePcApi.base();
  var selectedStyle = 'realistic';
  var currentSeriesId = null;
  var currentSeries = null;
  var selectedShotId = null;
  var selectedEpId = null;
  var pollTimer = null;
  var lastLogLen = 0;
  var globalRefPicks = {};

  var seriesPick = document.getElementById('series-pick');
  var refreshListBtn = document.getElementById('refresh-list-btn');
  var deleteSeriesBtn = document.getElementById('delete-series-btn');
  var titleInput = document.getElementById('title-input');
  var synopsisInput = document.getElementById('synopsis-input');
  var styleRow = document.getElementById('style-row');
  var epCount = document.getElementById('ep-count');
  var scCount = document.getElementById('sc-count');
  var shCount = document.getElementById('sh-count');
  var shotDur = document.getElementById('shot-dur');
  var createPlanBtn = document.getElementById('create-plan-btn');
  var confirmGlobalBtn = document.getElementById('confirm-global-btn');
  var skipGlobalBtn = document.getElementById('skip-global-btn');
  var continueBtn = document.getElementById('continue-btn');
  var regenAllBtn = document.getElementById('regen-all-btn');
  var freeVramBtn = document.getElementById('free-vram-btn');
  var playlistBtn = document.getElementById('playlist-btn');
  var playlistFromPreviewBtn = document.getElementById('playlist-from-preview-btn');
  var composeEpisodeBtn = document.getElementById('compose-episode-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var bibleBox = document.getElementById('bible-box');
  var charactersBox = document.getElementById('characters-box');
  var charactersList = document.getElementById('characters-list');
  var regenAllCharsBtn = document.getElementById('regen-all-chars-btn');
  var globalRefsBox = document.getElementById('global-refs-box');
  var globalRefsList = document.getElementById('global-refs-list');
  var globalRefFile = document.getElementById('global-ref-file');
  var workspace = document.getElementById('workspace');
  var epTabs = document.getElementById('ep-tabs');
  var sceneBoard = document.getElementById('scene-board');
  var progressLine = document.getElementById('series-progress-line');
  var logOutput = document.getElementById('log-output');
  var copyLogBtn = document.getElementById('copy-log-btn');
  var openSeriesFolderBtn = document.getElementById('open-series-folder-btn');
  var shotPreviewBox = document.getElementById('shot-preview-box');
  var shotPreviewVideo = document.getElementById('shot-preview-video');
  var shotPreviewMeta = document.getElementById('shot-preview-meta');
  var openShotFolderBtn = document.getElementById('open-shot-folder-btn');
  var trimStartInput = document.getElementById('trim-start');
  var trimEndInput = document.getElementById('trim-end');
  var trimShotBtn = document.getElementById('trim-shot-btn');
  var seedanceCapHint = document.getElementById('seedance-cap-hint');
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var playlistQueue = [];
  var playlistIndex = 0;
  var seedanceReady = false;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveUrl(url) {
    return window.HomePcApi.assetUrl(url);
  }

  function selectedAspect() {
    var el = document.querySelector('input[name="aspect"]:checked');
    return el ? el.value : '16_9';
  }

  function selectedVideoMode() {
    var el = document.querySelector('input[name="video-mode"]:checked');
    return el ? el.value : 'wan22_5b';
  }

  function loadCapabilities() {
    return fetch(API_BASE + '/series/capabilities')
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) return;
        seedanceReady = !!pack.body.seedance;
        if (seedanceCapHint) {
          seedanceCapHint.textContent = seedanceReady
            ? tr(
                'privateHub.homePc.seriesSeedanceReady',
                'Seedance 已配置 API Key，可选云端成片（按量计费）。'
              )
            : tr(
                'privateHub.homePc.seriesSeedanceMissing',
                '本机默认 Wan/LTX；Seedance 需配置 SEEDANCE_API_KEY（或 ARK_API_KEY）后重启服务。'
              );
        }
        var seedRadio = document.querySelector('input[name="video-mode"][value="seedance_25"]');
        if (seedRadio && seedRadio.parentElement) {
          seedRadio.parentElement.classList.toggle('is-muted', !seedanceReady);
          seedRadio.parentElement.title = seedanceReady
            ? ''
            : tr('privateHub.homePc.seriesSeedanceMissingShort', '未配置 API Key');
        }
      })
      .catch(function () {});
  }

  function formatDialoguePreview(dialogue, voiceover) {
    var lines = Array.isArray(dialogue) ? dialogue : [];
    if (lines.length) {
      return lines
        .map(function (d) {
          var sp = (d && d.speaker) || '';
          var tx = (d && (d.text || d.line)) || '';
          return (sp ? sp + '：' : '') + String(tx || '').trim();
        })
        .filter(Boolean)
        .join(' / ')
        .slice(0, 96);
    }
    return String(voiceover || '').slice(0, 48);
  }

  function selectedUseGlobalRefs() {
    var el = document.querySelector('input[name="use-global-refs"]:checked');
    return !el || el.value !== '0';
  }

  function openLightbox(src) {
    if (!lightbox || !lightboxImg || !src) return;
    lightboxImg.src = src;
    lightbox.style.display = 'flex';
  }

  if (lightbox) {
    lightbox.addEventListener('click', function () {
      lightbox.style.display = 'none';
      if (lightboxImg) lightboxImg.src = '';
    });
  }

  function setBusy(busy) {
    createPlanBtn.disabled = !!busy;
    if (confirmGlobalBtn) confirmGlobalBtn.disabled = !!busy;
    if (skipGlobalBtn) skipGlobalBtn.disabled = !!busy;
    if (continueBtn) continueBtn.disabled = !!busy;
    if (regenAllBtn) regenAllBtn.disabled = !!busy;
    if (freeVramBtn) freeVramBtn.disabled = !!busy;
    if (playlistBtn) playlistBtn.disabled = !!busy;
    if (playlistFromPreviewBtn) playlistFromPreviewBtn.disabled = !!busy;
    if (sceneBoard) {
      Array.prototype.forEach.call(sceneBoard.querySelectorAll('[data-job-btn="1"]'), function (btn) {
        btn.disabled = !!busy;
      });
    }
  }


  function shortClock(s) {
    var t = String(s || '').trim();
    if (t.length >= 19) return t.slice(11, 19);
    return t;
  }

  function shotTimingHtml(sh) {
    var parts = [];
    var inProg = sh.status === 'stills' || sh.status === 'video' || sh.status === 'vo';
    if (sh.elapsed_label) {
      parts.push(tr('privateHub.homePc.seriesElapsed', '耗时') + ' ' + sh.elapsed_label);
    }
    if (sh.finished_at) {
      parts.push(tr('privateHub.homePc.seriesFinishedAt', '完成') + ' ' + shortClock(sh.finished_at));
    } else if (inProg && sh.started_at) {
      parts.push(tr('privateHub.homePc.seriesStartedAt', '开始') + ' ' + shortClock(sh.started_at));
    }
    if (sh.stills_label || sh.video_label) {
      var detail = [];
      if (sh.stills_label) detail.push(tr('privateHub.homePc.seriesStillsSec', '生图') + ' ' + sh.stills_label);
      if (sh.video_label) detail.push(tr('privateHub.homePc.seriesVideoSec', '视频') + ' ' + sh.video_label);
      if (detail.length) parts.push(detail.join(' · '));
    }
    if (!parts.length) return '';
    return '<div class="series-shot-timing">' + escapeHtml(parts.join(' · ')) + '</div>';
  }

  function statusLabel(st) {
    var map = {
      planned: tr('privateHub.homePc.seriesStatusPlanned', '未生成'),
      stills: tr('privateHub.homePc.seriesStatusStills', '生图中'),
      video: tr('privateHub.homePc.seriesStatusVideo', '视频中'),
      vo: tr('privateHub.homePc.seriesStatusVo', '配音中'),
      done: tr('privateHub.homePc.seriesStatusDone', '已完成'),
      failed: tr('privateHub.homePc.seriesStatusFailed', '失败'),
      approved: tr('privateHub.homePc.seriesStatusApproved', '已通过'),
      running: tr('privateHub.homePc.seriesStatusRunning', '进行中'),
      draft: tr('privateHub.homePc.seriesStatusDraft', '草稿'),
      awaiting_global_refs: tr('privateHub.homePc.trailerStageGlobalRefs', '等待确认全剧参考')
    };
    return map[st] || st || '';
  }

  function appendLogs(logs) {
    if (!Array.isArray(logs)) return;
    if (logs.length <= lastLogLen) {
      if (logs.length < lastLogLen) {
        lastLogLen = 0;
        logOutput.textContent = '';
      } else {
        return;
      }
    }
    var chunk = logs.slice(lastLogLen).join('\n');
    lastLogLen = logs.length;
    logOutput.textContent = (logOutput.textContent ? logOutput.textContent + '\n' : '') + chunk;
  }

  function renderBible(bible) {
    if (!bibleBox) return;
    bible = bible || {};
    var chars = bible.characters || [];
    var lines = [];
    if (bible.style_notes) lines.push('<div><strong>画风</strong> ' + escapeHtml(bible.style_notes) + '</div>');
    if (bible.world_look) lines.push('<div><strong>风貌</strong> ' + escapeHtml(bible.world_look) + '</div>');
    if (bible.palette) lines.push('<div><strong>色调</strong> ' + escapeHtml(bible.palette) + '</div>');
    if (bible.mood) lines.push('<div><strong>情绪</strong> ' + escapeHtml(bible.mood) + '</div>');
    if (bible.relationships) lines.push('<div><strong>关系</strong> ' + escapeHtml(bible.relationships) + '</div>');
    if (chars.length) {
      var ch = chars
        .map(function (c) {
          return escapeHtml((c.name || '') + (c.look ? '：' + c.look : ''));
        })
        .join('；');
      lines.push('<div><strong>角色</strong> ' + ch + '</div>');
    }
    if (!lines.length) {
      bibleBox.style.display = 'none';
      bibleBox.innerHTML = '';
      return;
    }
    bibleBox.style.display = 'block';
    bibleBox.innerHTML =
      '<h4 class="trailer-bible-title">' +
      escapeHtml(tr('privateHub.homePc.trailerBibleTitle', '全剧设定（DeepSeek）')) +
      '</h4>' +
      lines.join('');
  }

  function findCharRef(refs, char) {
    var cid = String((char && char.id) || '').trim();
    var name = String((char && char.name) || '').trim();
    var list = refs || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || String(it.kind || '').toLowerCase() !== 'character') continue;
      if (cid && String(it.character_id || '') === cid) return it;
      var label = String(it.label || '');
      if (name && (label === name || label.indexOf(name) >= 0)) return it;
    }
    return null;
  }

  function regenCharacterRefs(opts) {
    opts = opts || {};
    if (!currentSeriesId) return;
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    if (opts.characterId) fd.append('character_id', opts.characterId);
    if (opts.characterName) fd.append('character_name', opts.characterName);
    if (opts.feedback) fd.append('feedback', opts.feedback);
    setBusy(true);
    if (progressWrap) {
      progressWrap.style.display = '';
      progressStatus.textContent = tr('privateHub.homePc.seriesCharRegenStart', '人物定妆重出中…');
    }
    fetch(API_BASE + '/series/regen-character-refs', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
      });
  }

  function renderCharacters(series) {
    if (!charactersBox || !charactersList) return;
    series = series || {};
    var bible = series.bible || {};
    var chars = bible.characters || [];
    var refs = series.global_refs || [];
    var charRefs = refs.filter(function (it) {
      return it && String(it.kind || '').toLowerCase() === 'character';
    });
    if (!chars.length && !charRefs.length) {
      charactersBox.style.display = 'none';
      charactersList.innerHTML = '';
      return;
    }
    charactersBox.style.display = 'block';
    charactersList.innerHTML = '';
    var displayChars = chars.length
      ? chars
      : charRefs.map(function (it, i) {
          return {
            id: it.character_id || ('c' + (i + 1)),
            name: it.label || it.character_id || '角色',
            look: '',
            voice: ''
          };
        });
    displayChars.forEach(function (c) {
      var ref = findCharRef(refs, c);
      var card = document.createElement('div');
      card.className = 'series-char-card';
      var media = document.createElement('div');
      media.className = 'series-char-media';
      if (ref && (ref.thumb_url || ref.url)) {
        var img = document.createElement('img');
        img.src = resolveUrl(ref.thumb_url || ref.url);
        img.alt = c.name || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('click', function () {
          openLightbox(resolveUrl(ref.url || ref.thumb_url));
        });
        media.appendChild(img);
      } else {
        media.innerHTML =
          '<div class="series-char-placeholder">' +
          escapeHtml(tr('privateHub.homePc.seriesCharNoStill', '暂无定妆')) +
          '</div>';
      }
      var meta = document.createElement('div');
      meta.className = 'series-char-meta';
      meta.innerHTML =
        '<strong>' +
        escapeHtml(c.name || c.id || '') +
        '</strong>' +
        (c.role ? '<div class="series-char-role">' + escapeHtml(c.role) + '</div>' : '') +
        (c.look
          ? '<div class="series-char-look" title="' +
            escapeHtml(c.look) +
            '">' +
            escapeHtml(String(c.look).slice(0, 80)) +
            '</div>'
          : '') +
        (c.voice
          ? '<div class="series-char-voice">' +
            escapeHtml(tr('privateHub.homePc.seriesCharVoice', '音色') + '：' + c.voice) +
            '</div>'
          : '');
      var actions = document.createElement('div');
      actions.className = 'action-row series-char-actions';
      var regenBtn = document.createElement('button');
      regenBtn.type = 'button';
      regenBtn.className = 'tb-btn';
      regenBtn.setAttribute('data-job-btn', '1');
      regenBtn.textContent = tr('privateHub.homePc.seriesRegenOneChar', '重出此角色');
      regenBtn.addEventListener('click', function (e) {
        e.preventDefault();
        regenCharacterRefs({
          characterId: c.id || '',
          characterName: c.name || '',
          feedback: ''
        });
      });
      actions.appendChild(regenBtn);
      card.appendChild(media);
      card.appendChild(meta);
      card.appendChild(actions);
      charactersList.appendChild(card);
    });
  }

  function renderGlobalRefs(items, showActions) {
    if (!globalRefsBox || !globalRefsList) return;
    items = items || [];
    if (!items.length && !showActions) {
      globalRefsBox.style.display = 'none';
      return;
    }
    globalRefsBox.style.display = 'block';
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = showActions ? '' : 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = showActions ? '' : 'none';
    globalRefsList.innerHTML = '';
    if (showActions) globalRefPicks = {};
    items.forEach(function (it, i) {
      var fn = it.filename || ('ref_' + i);
      var selected = showActions ? it.selected !== false : !!it.selected;
      if (showActions) globalRefPicks[fn] = selected;
      var card = document.createElement('div');
      card.className = 'series-ref-card' + (selected ? ' is-selected' : '');
      var label = document.createElement('label');
      label.className = 'trailer-cand' + (selected ? ' is-selected' : '');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected;
      if (!showActions) input.disabled = true;
      input.addEventListener('change', function () {
        globalRefPicks[fn] = !!input.checked;
        label.classList.toggle('is-selected', input.checked);
        card.classList.toggle('is-selected', input.checked);
      });
      var img = document.createElement('img');
      var fullSrc = resolveUrl(it.url);
      var thumbSrc = resolveUrl(it.thumb_url || it.url);
      img.src = thumbSrc;
      img.alt = it.label || fn;
      img.loading = 'lazy';
      img.decoding = 'async';
      var zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'trailer-cand-zoom';
      zoomBtn.innerHTML = '<i class="fas fa-search-plus" aria-hidden="true"></i>';
      zoomBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(fullSrc);
      });
      var cap = document.createElement('span');
      cap.className = 'trailer-cand-cap';
      cap.textContent =
        (it.kind === 'character' ? '角色 · ' : it.kind === 'scene' ? '场景 · ' : it.source === 'upload' ? '上传 · ' : 'AI · ') +
        (it.label || fn);
      label.appendChild(input);
      label.appendChild(img);
      label.appendChild(zoomBtn);
      label.appendChild(cap);
      card.appendChild(label);
      if (showActions) {
        var fb = document.createElement('div');
        fb.className = 'series-ref-feedback';
        var ta = document.createElement('textarea');
        ta.rows = 2;
        ta.className = 'text-input series-ref-feedback-input';
        ta.placeholder = tr(
          'privateHub.homePc.seriesRefFeedbackPh',
          '修改意见，如：唐僧更年轻、沙僧灰袍不要黑蓝'
        );
        if (it.feedback) ta.value = it.feedback;
        var regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'tb-btn series-ref-regen-btn';
        regenBtn.textContent = tr('privateHub.homePc.seriesRefRegen', '按反馈重出');
        var statusEl = document.createElement('div');
        statusEl.className = 'series-ref-regen-status';
        statusEl.setAttribute('aria-live', 'polite');
        regenBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          regenGlobalRef(fn, ta.value || '', regenBtn, statusEl);
        });
        fb.appendChild(ta);
        fb.appendChild(regenBtn);
        fb.appendChild(statusEl);
        card.appendChild(fb);
      }
      globalRefsList.appendChild(card);
    });
  }

  function flashMsg(msg, isErr) {
    var text = String(msg || '');
    if (progressWrap && progressStatus) {
      progressWrap.style.display = '';
      progressStatus.textContent = text;
    }
    var box = document.getElementById('series-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'series-toast';
      box.className = 'series-toast';
      box.setAttribute('role', 'status');
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.classList.toggle('is-err', !!isErr);
    box.classList.add('is-show');
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(function () {
      box.classList.remove('is-show');
    }, isErr ? 10000 : 4500);
  }

  function setRefRegenBusy(busy, activeBtn) {
    var buttons = globalRefsList
      ? globalRefsList.querySelectorAll('.series-ref-regen-btn')
      : [];
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.disabled = !!busy;
      if (!busy) {
        btn.textContent = tr('privateHub.homePc.seriesRefRegen', '按反馈重出');
      }
    });
    if (busy && activeBtn) {
      activeBtn.disabled = true;
      activeBtn.textContent = tr('privateHub.homePc.seriesRefRegenning', '按反馈重出参考图…');
    }
  }

  function regenGlobalRef(filename, feedback, regenBtn, statusEl) {
    if (!currentSeriesId || !filename) {
      flashMsg(
        tr('privateHub.homePc.seriesRefNoProject', '请先打开一个剧集项目'),
        true
      );
      return;
    }
    var tip = (feedback || '').trim();
    if (tip.length < 2) {
      var need = tr(
        'privateHub.homePc.seriesRefNeedFeedback',
        '请先填写这张参考图的修改意见'
      );
      if (statusEl) statusEl.textContent = need;
      flashMsg(need, true);
      return;
    }
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    fd.append('filename', filename);
    fd.append('feedback', tip);
    setBusy(true);
    setRefRegenBusy(true, regenBtn);
    var runningMsg = tr(
      'privateHub.homePc.seriesRefRegenning',
      '按反馈重出参考图…大约半分钟，请稍候'
    );
    if (statusEl) statusEl.textContent = runningMsg;
    flashMsg(runningMsg, false);
    fetch(API_BASE + '/series/regen-global-ref', { method: 'POST', body: fd })
      .then(function (res) {
        return res.text().then(function (raw) {
          var body = null;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (e) {
            throw new Error(
              raw
                ? '接口返回非 JSON（HTTP ' + res.status + '）'
                : 'HTTP ' + res.status
            );
          }
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        renderGlobalRefs(pack.body.global_refs || [], true);
        setBusy(false);
        setRefRegenBusy(false);
        var done = tr('privateHub.homePc.seriesRefRegenDone', '参考图已按反馈更新');
        flashMsg(done, false);
        if (currentSeries) currentSeries.global_refs = pack.body.global_refs || [];
      })
      .catch(function (err) {
        setBusy(false);
        setRefRegenBusy(false);
        var msg = window.HomePcApi.friendlyFetchError(err);
        if (statusEl) statusEl.textContent = msg;
        flashMsg(msg, true);
      });
  }

  function updateActionVisibility(series) {
    var hasShots = false;
    (series.episodes || []).forEach(function (ep) {
      (ep.scenes || []).forEach(function (sc) {
        if ((sc.shots || []).length) hasShots = true;
      });
    });
    var awaiting = series.status === 'awaiting_global_refs';
    var running = series.job_status === 'running';
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = awaiting ? '' : 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = awaiting ? '' : 'none';
    if (continueBtn) continueBtn.style.display = hasShots && !awaiting ? '' : 'none';
    if (regenAllBtn) regenAllBtn.style.display = hasShots && !awaiting ? '' : 'none';
    if (freeVramBtn) freeVramBtn.style.display = currentSeriesId ? '' : 'none';
    if (playlistBtn) playlistBtn.style.display = hasShots && !awaiting ? '' : 'none';
    if (deleteSeriesBtn) deleteSeriesBtn.style.display = currentSeriesId ? '' : 'none';
    if (openSeriesFolderBtn) openSeriesFolderBtn.style.display = currentSeriesId ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = running ? '' : 'none';
    setBusy(running);
  }

  function findShotById(series, shotId) {
    var found = null;
    (series.episodes || []).forEach(function (ep) {
      (ep.scenes || []).forEach(function (sc) {
        (sc.shots || []).forEach(function (sh) {
          if (sh.id === shotId) found = sh;
        });
      });
    });
    return found;
  }

  function markSelectedShotCards() {
    if (!sceneBoard) return;
    Array.prototype.forEach.call(sceneBoard.querySelectorAll('.series-shot-card'), function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-shot-id') === selectedShotId);
    });
  }

  function showShotPreview(sh) {
    if (!shotPreviewBox || !shotPreviewVideo) return;
    if (!sh || !sh.clip_url) {
      shotPreviewBox.style.display = 'none';
      shotPreviewVideo.removeAttribute('src');
      try {
        shotPreviewVideo.load();
      } catch (e) {}
      if (sh) {
        flashMsg(tr('privateHub.homePc.seriesNoClip', '此镜尚无成片可预览'), true);
      }
      return;
    }
    shotPreviewBox.style.display = '';
    if (shotPreviewMeta) {
      var dlg = formatDialoguePreview(sh.dialogue, sh.voiceover);
      shotPreviewMeta.textContent =
        (sh.label || '镜 ' + sh.shot_no) +
        ' · ' +
        statusLabel(sh.status) +
        (sh.duration_sec ? ' · ' + Number(sh.duration_sec).toFixed(1) + 's' : '') +
        (dlg ? ' · ' + dlg : '');
    }
    if (trimStartInput) trimStartInput.value = '0';
    if (trimEndInput) trimEndInput.value = '';
    var full = resolveUrl(sh.clip_url);
    shotPreviewVideo.src = full + (full.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    try {
      shotPreviewVideo.load();
    } catch (e2) {}
  }

  function selectShot(sh, openPreview) {
    if (!sh) return;
    selectedShotId = sh.id;
    markSelectedShotCards();
    updateActionVisibility(currentSeries || { episodes: [], status: 'draft', job_status: 'idle' });
    if (openPreview !== false) showShotPreview(sh);
  }

  function revealSeriesFolder() {
    if (!currentSeriesId) return;
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    fetch(API_BASE + '/series/reveal-output', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
      })
      .catch(function (err) {
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
      });
  }

  function revealSelectedShotFolder() {
    if (!currentSeriesId || !selectedShotId) return;
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    fd.append('shot_id', selectedShotId);
    fetch(API_BASE + '/series/reveal-shot', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
      })
      .catch(function (err) {
        flashMsg(window.HomePcApi.friendlyFetchError(err), true);
      });
  }

  function renderWorkspace(series) {
    if (!workspace) return;
    var eps = series.episodes || [];
    if (!eps.length) {
      workspace.style.display = 'none';
      if (shotPreviewBox) shotPreviewBox.style.display = 'none';
      return;
    }
    workspace.style.display = 'block';
    var prog = series.progress || { done: 0, total: 0 };
    if (progressLine) {
      progressLine.textContent =
        tr('privateHub.homePc.seriesProgress', '进度') +
        '：' +
        prog.done +
        ' / ' +
        prog.total +
        ' · ' +
        statusLabel(series.status) +
        (series.job_status === 'running' ? ' · ' + tr('privateHub.homePc.seriesJobRunning', '任务运行中') : '');
    }

    if (!selectedEpId || !eps.some(function (e) { return e.id === selectedEpId; })) {
      selectedEpId = eps[0].id;
    }

    epTabs.innerHTML = '';
    eps.forEach(function (ep) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'series-ep-tab' + (ep.id === selectedEpId ? ' is-active' : '');
      btn.textContent = '第' + ep.ep_no + '集 ' + (ep.title || '');
      btn.title = ep.summary || '';
      btn.addEventListener('click', function () {
        selectedEpId = ep.id;
        selectedShotId = null;
        if (shotPreviewBox) shotPreviewBox.style.display = 'none';
        renderWorkspace(currentSeries);
      });
      epTabs.appendChild(btn);
    });

    var ep = eps.filter(function (e) { return e.id === selectedEpId; })[0] || eps[0];
    sceneBoard.innerHTML = '';
    (ep.scenes || []).forEach(function (sc) {
      var block = document.createElement('div');
      block.className = 'series-scene-block';
      var h = document.createElement('h4');
      h.className = 'series-scene-title';
      h.textContent =
        '第' +
        sc.sc_no +
        '场 · ' +
        (sc.title || '') +
        (sc.location ? ' · ' + sc.location : '') +
        '（' +
        statusLabel(sc.status) +
        '）';
      block.appendChild(h);
      var sceneActions = document.createElement('div');
      sceneActions.className = 'action-row series-scene-actions';
      var shootSceneBtn = document.createElement('button');
      shootSceneBtn.type = 'button';
      shootSceneBtn.className = 'tb-btn';
      shootSceneBtn.setAttribute('data-job-btn', '1');
      shootSceneBtn.textContent = tr('privateHub.homePc.seriesShootScene', '一键拍摄本场');
      shootSceneBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        postJob('/series/continue-scene', { scene_id: sc.id, force: '0' });
      });
      sceneActions.appendChild(shootSceneBtn);
      block.appendChild(sceneActions);
      var grid = document.createElement('div');
      grid.className = 'series-shot-grid';
      (sc.shots || []).forEach(function (sh) {
        var card = document.createElement('div');
        card.className =
          'series-shot-card status-' +
          (sh.status || 'planned') +
          (sh.id === selectedShotId ? ' is-selected' : '');
        card.setAttribute('data-shot-id', sh.id);
        var listImg = sh.image_thumb_url || sh.image_url;
        var thumb = listImg
          ? '<img src="' +
            escapeHtml(resolveUrl(listImg)) +
            '" alt="" loading="lazy" decoding="async" />'
          : '<div class="series-shot-placeholder">' + escapeHtml(statusLabel(sh.status)) + '</div>';
        card.innerHTML =
          thumb +
          '<div class="series-shot-meta">' +
          '<strong>镜 ' +
          sh.shot_no +
          '</strong> · ' +
          escapeHtml(statusLabel(sh.status)) +
          '<div class="series-shot-vo">' +
          escapeHtml(formatDialoguePreview(sh.dialogue, sh.voiceover)) +
          '</div>' +
          (Array.isArray(sh.dialogue) && sh.dialogue.length > 1
            ? '<div class="series-shot-dlg-badge">' +
              escapeHtml(
                tr('privateHub.homePc.seriesMultiDlg', '多角色对白') + ' · ' + sh.dialogue.length
              ) +
              '</div>'
            : '') +
          (sh.director_prompt
            ? '<div class="series-shot-vp" title="' +
              escapeHtml(String(sh.director_prompt).slice(0, 800)) +
              '">' +
              escapeHtml(String(sh.director_prompt).slice(0, 96)) +
              '</div>'
            : sh.visual_prompt
            ? '<div class="series-shot-vp">' + escapeHtml(String(sh.visual_prompt).slice(0, 72)) + '</div>'
            : '') +
          '</div>';
        var actions = document.createElement('div');
        actions.className = 'series-shot-actions';
        var previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'tb-btn';
        previewBtn.textContent = tr('privateHub.homePc.seriesPreviewPlay', '预览');
        previewBtn.disabled = !sh.clip_url;
        previewBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectShot(sh, true);
        });
        var folderBtn = document.createElement('button');
        folderBtn.type = 'button';
        folderBtn.className = 'tb-btn';
        folderBtn.textContent = tr('privateHub.homePc.seriesOpenFolder', '打开文件夹');
        folderBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectedShotId = sh.id;
          markSelectedShotCards();
          updateActionVisibility(currentSeries);
          revealSelectedShotFolder();
        });
        var runOrRegen = document.createElement('button');
        runOrRegen.type = 'button';
        runOrRegen.className = 'tb-btn';
        runOrRegen.setAttribute('data-job-btn', '1');
        var isDone = sh.status === 'done' || sh.status === 'approved';
        var isFailed = sh.status === 'failed';
        var inProgress = sh.status === 'stills' || sh.status === 'video' || sh.status === 'vo';
        if (inProgress) {
          runOrRegen.textContent = statusLabel(sh.status);
          runOrRegen.disabled = true;
        } else if (isDone || isFailed) {
          runOrRegen.textContent = tr('privateHub.homePc.seriesRegenShot', '重跑此镜');
          runOrRegen.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectedShotId = sh.id;
            markSelectedShotCards();
            postJob('/series/regen', { shot_id: sh.id });
          });
        } else {
          runOrRegen.textContent = tr('privateHub.homePc.seriesRunShot', '生成此镜');
          runOrRegen.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectedShotId = sh.id;
            markSelectedShotCards();
            postJob('/series/run-shot', { shot_id: sh.id, force: '0' });
          });
        }
        actions.appendChild(previewBtn);
        actions.appendChild(folderBtn);
        actions.appendChild(runOrRegen);
        card.appendChild(actions);
        card.addEventListener('click', function () {
          selectShot(sh, !!sh.clip_url);
        });
        if (sh.image_url) {
          card.addEventListener('dblclick', function (e) {
            e.preventDefault();
            openLightbox(resolveUrl(sh.image_url));
          });
        }
        grid.appendChild(card);
      });
      block.appendChild(grid);
      sceneBoard.appendChild(block);
    });
    if (selectedShotId) {
      var cur = findShotById(series, selectedShotId);
      if (cur && cur.clip_url) showShotPreview(cur);
    }
    updateActionVisibility(series);
  }

  function applySeries(series) {
    currentSeries = series;
    currentSeriesId = series.id;
    renderBible(series.bible);
    renderCharacters(series);
    var awaiting = series.status === 'awaiting_global_refs';
    renderGlobalRefs(series.global_refs || [], awaiting);
    appendLogs(series.logs || []);
    renderWorkspace(series);
    if (progressWrap) {
      progressWrap.style.display = '';
      progressStatus.textContent =
        (series.title || '') +
        ' · ' +
        statusLabel(series.status) +
        (series.job_error ? ' · ' + series.job_error : '');
      var prog = series.progress || { done: 0, total: 1 };
      var pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
      if (progressPercent) progressPercent.textContent = pct + '%';
    }
    updateActionVisibility(series);
    if (series.job_status === 'running') startPoll();
    else stopPoll();
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function poll() {
    if (!currentSeriesId) return;
    fetch(API_BASE + '/series/get?series_id=' + encodeURIComponent(currentSeriesId))
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        applySeries(pack.body.series);
      })
      .catch(function (err) {
        stopPoll();
        setBusy(false);
        if (progressStatus) progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  function startPoll() {
    stopPoll();
    poll();
    pollTimer = setInterval(poll, 1800);
  }

  function loadList() {
    return fetch(API_BASE + '/series/list')
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) return;
        var cur = seriesPick.value;
        seriesPick.innerHTML =
          '<option value="">' +
          escapeHtml(tr('privateHub.homePc.seriesPickPlaceholder', '请选择已有项目…')) +
          '</option>';
        (pack.body.items || []).forEach(function (it) {
          var opt = document.createElement('option');
          opt.value = it.id;
          var p = it.progress || {};
          opt.textContent =
            (it.title || it.id) + '（' + (p.done || 0) + '/' + (p.total || 0) + '）';
          seriesPick.appendChild(opt);
        });
        if (cur) seriesPick.value = cur;
      })
      .catch(function () {});
  }

  function loadSeries(id) {
    if (!id) {
      currentSeriesId = null;
      currentSeries = null;
      selectedShotId = null;
      selectedEpId = null;
      workspace.style.display = 'none';
      if (bibleBox) bibleBox.style.display = 'none';
      if (charactersBox) charactersBox.style.display = 'none';
      if (globalRefsBox) globalRefsBox.style.display = 'none';
      updateActionVisibility({ episodes: [], status: 'draft', job_status: 'idle' });
      return;
    }
    lastLogLen = 0;
    logOutput.textContent = '';
    fetch(API_BASE + '/series/get?series_id=' + encodeURIComponent(id))
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        var s = pack.body.series;
        titleInput.value = s.title || '';
        synopsisInput.value = s.synopsis || '';
        applySeries(s);
      })
      .catch(function (err) {
        if (progressStatus) {
          progressWrap.style.display = '';
          progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
        }
      });
  }

  styleRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-style]');
    if (!btn) return;
    Array.prototype.forEach.call(styleRow.querySelectorAll('[data-style]'), function (el) {
      el.classList.toggle('is-active', el === btn);
    });
    selectedStyle = btn.getAttribute('data-style') || 'realistic';
  });

  function resetNewForm() {
    stopPoll();
    currentSeriesId = null;
    currentSeries = null;
    selectedShotId = null;
    selectedEpId = null;
    lastLogLen = 0;
    logOutput.textContent = '';
    seriesPick.value = '';
    titleInput.value = '';
    synopsisInput.value = '';
    if (workspace) workspace.style.display = 'none';
    if (bibleBox) {
      bibleBox.style.display = 'none';
      bibleBox.innerHTML = '';
    }
    if (charactersBox) {
      charactersBox.style.display = 'none';
      if (charactersList) charactersList.innerHTML = '';
    }
    if (globalRefsBox) globalRefsBox.style.display = 'none';
    if (confirmGlobalBtn) confirmGlobalBtn.style.display = 'none';
    if (skipGlobalBtn) skipGlobalBtn.style.display = 'none';
    if (shotPreviewBox) shotPreviewBox.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'none';
    updateActionVisibility({ episodes: [], status: 'draft', job_status: 'idle' });
    if (synopsisInput) synopsisInput.focus();
  }

  refreshListBtn.addEventListener('click', function () {
    loadList();
  });

  seriesPick.addEventListener('change', function () {
    var id = seriesPick.value || '';
    if (!id) {
      resetNewForm();
      return;
    }
    loadSeries(id);
  });

  createPlanBtn.addEventListener('click', function () {
    var title = (titleInput.value || '').trim();
    var syn = (synopsisInput.value || '').trim();
    if (title.length < 1) {
      progressWrap.style.display = '';
      progressStatus.textContent = tr('privateHub.homePc.seriesNeedTitle', '请先填写剧名');
      if (titleInput) titleInput.focus();
      return;
    }
    if (syn.length < 2) {
      progressWrap.style.display = '';
      progressStatus.textContent = tr('privateHub.homePc.seriesNeedSynopsis', '请先填写故事梗概');
      if (synopsisInput) synopsisInput.focus();
      return;
    }
    setBusy(true);
    progressWrap.style.display = '';
    progressStatus.textContent = tr('privateHub.homePc.seriesCreating', '立项中…');
    lastLogLen = 0;
    logOutput.textContent = '';

    var fd = new FormData();
    fd.append('title', title);
    fd.append('synopsis', syn);
    fd.append('visual_style', selectedStyle);
    fd.append('aspect', selectedAspect());
    fd.append('video_mode', selectedVideoMode());
    fd.append('shot_duration', shotDur.value || '5');
    fd.append('episode_count', epCount.value || '1');
    fd.append('scenes_per_ep', scCount.value || '1');
    fd.append('shots_per_scene', shCount.value || '1');
    fd.append('voice', 'zh-CN-YunxiNeural');
    fd.append('speed', '1.0');

    fetch(API_BASE + '/series/create', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        currentSeriesId = pack.body.series_id;
        return loadList().then(function () {
          seriesPick.value = currentSeriesId;
          var fd2 = new FormData();
          fd2.append('series_id', currentSeriesId);
          fd2.append('use_global_refs', selectedUseGlobalRefs() ? '1' : '0');
          progressStatus.textContent = tr('privateHub.homePc.seriesPlanning', '拆解集/场/镜…');
          return fetch(API_BASE + '/series/plan', { method: 'POST', body: fd2 }).then(function (res) {
            return res.json().then(function (body) {
              return { res: res, body: body };
            });
          });
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  });

  function confirmGlobal(skip) {
    if (!currentSeriesId) return;
    var selected = [];
    if (!skip) {
      Object.keys(globalRefPicks).forEach(function (fn) {
        if (globalRefPicks[fn]) selected.push(fn);
      });
    }
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    fd.append('selected_json', JSON.stringify(selected));
    fd.append('skip', skip ? '1' : '0');
    setBusy(true);
    fetch(API_BASE + '/series/confirm-global-refs', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        applySeries(pack.body.series);
        setBusy(false);
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  if (confirmGlobalBtn) confirmGlobalBtn.addEventListener('click', function () { confirmGlobal(false); });
  if (skipGlobalBtn) skipGlobalBtn.addEventListener('click', function () { confirmGlobal(true); });

  if (globalRefFile) {
    globalRefFile.addEventListener('change', function () {
      if (!currentSeriesId || !globalRefFile.files || !globalRefFile.files.length) return;
      var files = Array.prototype.slice.call(globalRefFile.files);
      globalRefFile.value = '';
      var compress =
        window.TBImageUploadCompress && TBImageUploadCompress.compressMany
          ? TBImageUploadCompress.compressMany(files, 'default')
          : Promise.resolve(files);
      compress
        .then(function (list) {
          var chain = Promise.resolve();
          (list || []).forEach(function (file) {
            chain = chain.then(function () {
              var fd = new FormData();
              fd.append('series_id', currentSeriesId);
              fd.append('file', file);
              return fetch(API_BASE + '/series/upload-global-ref', { method: 'POST', body: fd }).then(
                function (res) {
                  return res.json().then(function (body) {
                    return { res: res, body: body };
                  });
                }
              ).then(function (pack) {
                if (!pack.res.ok || !pack.body.success) {
                  throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
                }
                renderGlobalRefs(pack.body.global_refs || [], true);
              });
            });
          });
          return chain;
        })
        .catch(function (err) {
          progressWrap.style.display = '';
          progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
        });
    });
  }

  function collectPlaylistClips(series, epIdOnly) {
    var list = [];
    (series.episodes || []).forEach(function (ep) {
      if (epIdOnly && ep.id !== epIdOnly) return;
      (ep.scenes || []).forEach(function (sc) {
        (sc.shots || []).forEach(function (sh) {
          if (sh.clip_url) {
            list.push({
              url: resolveUrl(sh.clip_url),
              label: sh.label || ('镜 ' + sh.shot_no),
              id: sh.id
            });
          }
        });
      });
    });
    return list;
  }

  function playPlaylistItem() {
    if (!shotPreviewVideo || !playlistQueue.length) return;
    if (playlistIndex >= playlistQueue.length) {
      if (shotPreviewMeta) {
        shotPreviewMeta.textContent = tr(
          'privateHub.homePc.seriesPlaylistDone',
          '合集播放结束'
        );
      }
      return;
    }
    var item = playlistQueue[playlistIndex];
    selectedShotId = item.id;
    markSelectedShotCards();
    if (shotPreviewBox) shotPreviewBox.style.display = '';
    if (shotPreviewMeta) {
      shotPreviewMeta.textContent =
        tr('privateHub.homePc.seriesPlaylistPlay', '合集预览') +
        ' · ' +
        (playlistIndex + 1) +
        '/' +
        playlistQueue.length +
        ' · ' +
        item.label;
    }
    var src = item.url + (item.url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    shotPreviewVideo.src = src;
    try {
      shotPreviewVideo.load();
      var p = shotPreviewVideo.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function startPlaylist(epOnly) {
    if (!currentSeries) return;
    var epId = epOnly ? selectedEpId : null;
    playlistQueue = collectPlaylistClips(currentSeries, epId);
    playlistIndex = 0;
    if (!playlistQueue.length) {
      flashMsg(tr('privateHub.homePc.seriesNoClip', '此镜尚无成片可预览'), true);
      return;
    }
    if (shotPreviewVideo) {
      shotPreviewVideo.onended = function () {
        playlistIndex += 1;
        playPlaylistItem();
      };
    }
    playPlaylistItem();
  }

  function postJob(path, extra) {
    if (!currentSeriesId) return;
    var fd = new FormData();
    fd.append('series_id', currentSeriesId);
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        fd.append(k, extra[k]);
      });
    }
    setBusy(true);
    progressWrap.style.display = '';
    progressStatus.textContent = tr('privateHub.homePc.seriesJobStarting', '任务已提交…');
    fetch(API_BASE + path, { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
        }
        startPoll();
      })
      .catch(function (err) {
        setBusy(false);
        progressStatus.textContent = window.HomePcApi.friendlyFetchError(err);
      });
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', function () {
      postJob('/series/continue', {});
    });
  }
  if (composeEpisodeBtn) {
    composeEpisodeBtn.addEventListener('click', function () {
      if (!currentSeriesId || !selectedEpId) {
        if (typeof window.tbNotify === 'function') {
          window.tbNotify(tr('privateHub.homePc.seriesNeedEpisode', '请先打开一集'));
        }
        return;
      }
      var fd = new FormData();
      fd.append('series_id', currentSeriesId);
      fd.append('episode_id', selectedEpId);
      setBusy(true);
      fetch(API_BASE + '/series/compose-episode', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (body) {
            return { res: res, body: body };
          });
        })
        .then(function (pack) {
          setBusy(false);
          if (!pack.res.ok || !pack.body.success) {
            throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
          }
          var msg =
            tr('privateHub.homePc.seriesComposeDone', '本集成片已导出') +
            '（' +
            (pack.body.shot_count || 0) +
            ' 镜）';
          if (typeof window.tbNotify === 'function') window.tbNotify(msg);
          if (pack.body.url && shotPreviewVideo) {
            shotPreviewBox.style.display = 'block';
            shotPreviewVideo.src = resolveUrl(pack.body.url);
            shotPreviewVideo.play().catch(function () {});
          }
        })
        .catch(function (err) {
          setBusy(false);
          if (typeof window.tbNotify === 'function') {
            window.tbNotify(window.HomePcApi.friendlyFetchError(err));
          }
        });
    });
  }
  if (regenAllBtn) {
    regenAllBtn.addEventListener('click', function () {
      if (!currentSeriesId) return;
      if (
        !window.confirm(
          tr('privateHub.homePc.seriesRegenAllConfirm', '确定全部重跑？已完成镜头也会重新生成。')
        )
      ) {
        return;
      }
      postJob('/series/continue', { force: '1' });
    });
  }

  if (freeVramBtn) {
    freeVramBtn.addEventListener('click', function () {
      if (!currentSeriesId) return;
      freeVramBtn.disabled = true;
      var fd = new FormData();
      fd.append('series_id', currentSeriesId);
      fetch(API_BASE + '/series/free-vram', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (body) {
            return { res: res, body: body };
          });
        })
        .then(function (pack) {
          if (!pack.res.ok || !pack.body.success) {
            throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
          }
          flashMsg(tr('privateHub.homePc.seriesFreeVramDone', '已请求释放显存'), false);
        })
        .catch(function (err) {
          flashMsg(window.HomePcApi.friendlyFetchError(err), true);
        })
        .finally(function () {
          freeVramBtn.disabled = false;
        });
    });
  }
  if (playlistBtn) {
    playlistBtn.addEventListener('click', function () {
      startPlaylist(true);
    });
  }
  if (playlistFromPreviewBtn) {
    playlistFromPreviewBtn.addEventListener('click', function () {
      startPlaylist(true);
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      if (!currentSeriesId) return;
      var fd = new FormData();
      fd.append('series_id', currentSeriesId);
      fetch(API_BASE + '/series/cancel', { method: 'POST', body: fd }).finally(function () {
        startPoll();
      });
    });
  }
  if (openShotFolderBtn) {
    openShotFolderBtn.addEventListener('click', function () {
      revealSelectedShotFolder();
    });
  }
  if (trimShotBtn) {
    trimShotBtn.addEventListener('click', function () {
      if (!currentSeriesId || !selectedShotId) {
        flashMsg(tr('privateHub.homePc.seriesNeedShotTrim', '请先选中一镜成片'), true);
        return;
      }
      var fd = new FormData();
      fd.append('series_id', currentSeriesId);
      fd.append('shot_id', selectedShotId);
      fd.append('start_sec', (trimStartInput && trimStartInput.value) || '0');
      fd.append('end_sec', (trimEndInput && trimEndInput.value) || '');
      setBusy(true);
      if (progressStatus) {
        progressWrap.style.display = '';
        progressStatus.textContent = tr('privateHub.homePc.seriesTrimWorking', '正在裁切…');
      }
      fetch(API_BASE + '/series/trim-shot', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (body) {
            return { res: res, body: body };
          });
        })
        .then(function (pack) {
          setBusy(false);
          if (!pack.res.ok || !pack.body.success) {
            throw new Error(window.HomePcApi.parseErrorResponse(pack.res, pack.body));
          }
          flashMsg(
            tr('privateHub.homePc.seriesTrimDone', '裁切完成') +
              ' · ' +
              (pack.body.duration_sec || '') +
              's'
          );
          if (pack.body.series) applySeries(pack.body.series);
          else startPoll();
          if (pack.body.clip_url && shotPreviewVideo) {
            shotPreviewBox.style.display = 'block';
            shotPreviewVideo.src =
              resolveUrl(pack.body.clip_url) +
              (String(pack.body.clip_url).indexOf('?') >= 0 ? '&' : '?') +
              't=' +
              Date.now();
            shotPreviewVideo.play().catch(function () {});
          }
        })
        .catch(function (err) {
          setBusy(false);
          flashMsg(window.HomePcApi.friendlyFetchError(err), true);
        });
    });
  }
  if (regenAllCharsBtn) {
    regenAllCharsBtn.addEventListener('click', function () {
      if (!currentSeriesId) return;
      if (
        !window.confirm(
          tr('privateHub.homePc.seriesRegenAllCharsConfirm', '确定重出全部角色定妆？')
        )
      ) {
        return;
      }
      regenCharacterRefs({});
    });
  }
  if (openSeriesFolderBtn) {
    openSeriesFolderBtn.addEventListener('click', function () {
      revealSeriesFolder();
    });
  }
  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      var text = (logOutput && logOutput.textContent) || '';
      if (!String(text).trim()) {
        flashMsg(tr('privateHub.homePc.logEmpty', '暂无日志可复制'), true);
        return;
      }
      var label = copyLogBtn.textContent;
      window.HomePcApi.copyText(text)
        .then(function () {
          copyLogBtn.textContent = tr('privateHub.homePc.logCopied', '已复制');
          setTimeout(function () {
            copyLogBtn.textContent = label;
          }, 1500);
        })
        .catch(function () {
          flashMsg(tr('privateHub.homePc.logCopyFail', '复制失败，请手动选择复制'), true);
        });
    });
  }
  if (deleteSeriesBtn) {
    deleteSeriesBtn.addEventListener('click', function () {
      if (!currentSeriesId) return;
      if (!window.confirm(tr('privateHub.homePc.seriesDeleteConfirm', '确定删除该剧项目？'))) return;
      var fd = new FormData();
      fd.append('series_id', currentSeriesId);
      fetch(API_BASE + '/series/delete', { method: 'POST', body: fd })
        .then(function () {
          currentSeriesId = null;
          seriesPick.value = '';
          loadList();
          loadSeries('');
          logOutput.textContent = '';
        })
        .catch(function () {});
    });
  }

  loadCapabilities();
  loadList();
});
