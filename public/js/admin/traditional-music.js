/**
 * Admin — song library: traditional upload + AI public delete
 */
(function () {
  'use strict';

  var activeTab = 'traditional';
  var existingSources = new Set();

  function normFileName(name) {
    var s = String(name || '').trim();
    var i = s.lastIndexOf('\\');
    if (i >= 0) s = s.slice(i + 1);
    i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s.toLowerCase();
  }

  function tr(k, params) {
    return typeof window.t === 'function' ? window.t(k, params) : k;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return String(siteConfig.apiBase).replace(/\/$/, '');
    return '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function authHeaders(extra) {
    var h = Object.assign({ Accept: 'application/json' }, extra || {});
    var tok = token();
    if (tok) h.Authorization = 'Bearer ' + tok;
    return h;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fmtDuration(sec) {
    sec = Math.max(0, parseInt(sec, 10) || 0);
    if (!sec) return '—';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function switchTab(tab) {
    if (tab !== 'traditional' && tab !== 'ai') return;
    activeTab = tab;
    document.querySelectorAll('[data-song-tab]').forEach(function (btn) {
      var t = btn.getAttribute('data-song-tab');
      btn.classList.toggle('active', t === tab);
      btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    var tradPanel = document.getElementById('panel-traditional');
    var aiPanel = document.getElementById('panel-ai');
    if (tradPanel) tradPanel.hidden = tab !== 'traditional';
    if (aiPanel) aiPanel.hidden = tab !== 'ai';
    if (tab === 'ai') loadAiList();
    else loadTradList();
  }

  function loadTradList() {
    var meta = document.getElementById('list-meta-trad');
    var list = document.getElementById('track-list-trad');
    if (!list) return Promise.resolve();
    list.innerHTML = '';
    setStatus(meta, tr('privateHub.ops.tradMusicLoading'));
    return fetch(apiBase() + '/music/traditional/admin/list?limit=500', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        existingSources = new Set();
        items.forEach(function (item) {
          if (item.source) existingSources.add(normFileName(item.source));
        });
        var ffmpeg = data && data.ffmpegAvailable;
        setStatus(
          meta,
          tr('privateHub.ops.tradMusicListMeta', {
            total: items.length,
            ffmpeg: ffmpeg ? tr('privateHub.ops.tradMusicFfmpegOk') : tr('privateHub.ops.tradMusicFfmpegMissing')
          })
        );
        if (!items.length) {
          list.innerHTML = '<p class="ladder-row-empty">' + escapeHtml(tr('privateHub.ops.tradMusicEmpty')) + '</p>';
          return;
        }
        items.forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'ladder-row';
          var title = item.title || item.id;
          var artist = (item.artist || '').trim();
          var sub = [
            item.id,
            artist,
            fmtDuration(item.duration),
            fmtBytes(item.previewBytes) + ' / ' + fmtBytes(item.fullBytes),
            item.hasLyrics ? tr('privateHub.ops.tradMusicHasLyrics') : tr('privateHub.ops.tradMusicNoLyrics'),
            item.createdAt || ''
          ].filter(Boolean).join(' · ');
          row.innerHTML =
            '<div class="ladder-row-main">' +
              '<div class="ladder-row-title">' + escapeHtml(title) + '</div>' +
              '<div class="ladder-row-sub">' + escapeHtml(sub) + '</div>' +
              (item.lyricsPreview ? ('<div class="ladder-row-sub">' + escapeHtml(item.lyricsPreview) + '</div>') : '') +
              (item.source ? ('<div class="ladder-row-sub">' + escapeHtml(tr('privateHub.ops.tradMusicSource') + ': ' + item.source) + '</div>') : '') +
            '</div>' +
            '<div class="action-row ladder-row-actions">' +
              '<button type="button" class="tb-btn" data-del-trad="' + escapeHtml(item.id) + '">' + escapeHtml(tr('privateHub.ops.tradMusicDelete')) + '</button>' +
            '</div>';
          row.querySelector('[data-del-trad]').addEventListener('click', function () {
            deleteTradTrack(item);
          });
          list.appendChild(row);
        });
      })
      .catch(function (err) {
        setStatus(meta, (err && err.message) || tr('privateHub.ops.tradMusicLoadFailed'), true);
      });
  }

  function loadAiList() {
    var meta = document.getElementById('list-meta-ai');
    var list = document.getElementById('track-list-ai');
    if (!list) return Promise.resolve();
    list.innerHTML = '';
    setStatus(meta, tr('privateHub.ops.tradMusicLoading'));
    return fetch(apiBase() + '/music/public/list?limit=100', { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        setStatus(meta, tr('privateHub.ops.tradMusicAiListMeta', { total: items.length }));
        if (!items.length) {
          list.innerHTML = '<p class="ladder-row-empty">' + escapeHtml(tr('privateHub.ops.tradMusicAiEmpty')) + '</p>';
          return;
        }
        items.forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'ladder-row';
          var nick = (item.creatorNickname || '').trim();
          var phone = (item.creatorPhone || '').trim();
          var sub = [
            item.id,
            item.model || '',
            fmtDuration(item.duration),
            nick || phone ? (nick + (phone && phone !== '—' ? (' · ' + phone) : '')) : '',
            item.createdAt || ''
          ].filter(Boolean).join(' · ');
          row.innerHTML =
            '<div class="ladder-row-main">' +
              '<div class="ladder-row-title">' + escapeHtml(item.title || tr('hub.musicPage.untitled')) + '</div>' +
              '<div class="ladder-row-sub">' + escapeHtml(sub) + '</div>' +
              ((item.prompt || '').trim() ? ('<div class="ladder-row-sub">' + escapeHtml(tr('hub.musicPage.promptLabel') + ': ' + item.prompt) + '</div>') : '') +
            '</div>' +
            '<div class="action-row ladder-row-actions">' +
              '<button type="button" class="tb-btn" data-del-ai="' + escapeHtml(item.id) + '">' + escapeHtml(tr('privateHub.ops.tradMusicDelete')) + '</button>' +
            '</div>';
          row.querySelector('[data-del-ai]').addEventListener('click', function () {
            deleteAiTrack(item);
          });
          list.appendChild(row);
        });
      })
      .catch(function (err) {
        setStatus(meta, (err && err.message) || tr('privateHub.ops.tradMusicLoadFailed'), true);
      });
  }

  function deleteTradTrack(item) {
    if (!item || !item.id) return;
    if (!window.confirm(tr('privateHub.ops.tradMusicDeleteConfirm', { title: item.title || item.id }))) return;
    fetch(apiBase() + '/music/traditional/admin/' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: authHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    }).then(function () {
      loadTradList();
    }).catch(function (err) {
      alert((err && err.message) || tr('privateHub.ops.tradMusicDeleteFailed'));
    });
  }

  function deleteAiTrack(item) {
    if (!item || !item.id) return;
    if (!window.confirm(tr('privateHub.ops.tradMusicAiDeleteConfirm', { title: item.title || item.id }))) return;
    fetch(apiBase() + '/music/public/' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: authHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || res.statusText);
        return data;
      });
    }).then(function () {
      loadAiList();
    }).catch(function (err) {
      alert((err && err.message) || tr('privateHub.ops.tradMusicDeleteFailed'));
    });
  }

  function uploadFiles(files) {
    var status = document.getElementById('upload-status');
    var progress = document.getElementById('upload-progress');
    var fetchLyrics = document.getElementById('fetch-lyrics');
    if (!files || !files.length) return;
    var picked = Array.prototype.slice.call(files);
    var skipped = 0;
    var skippedNames = [];
    var seen = new Set(existingSources);
    var queue = [];
    picked.forEach(function (file) {
      var key = normFileName(file.name);
      if (seen.has(key)) {
        skipped += 1;
        skippedNames.push(file.name);
        return;
      }
      seen.add(key);
      queue.push(file);
    });
    if (!queue.length) {
      setStatus(status, tr('privateHub.ops.tradMusicUploadSkipAll', { skip: skipped }));
      if (progress) progress.hidden = true;
      return;
    }
    var total = queue.length;
    var done = 0;
    var ok = 0;
    var fail = 0;
    var serverSkip = 0;

    function next() {
      if (!queue.length) {
        setStatus(
          status,
          tr('privateHub.ops.tradMusicUploadDone', {
            ok: ok,
            skip: skipped + serverSkip,
            fail: fail,
            total: picked.length
          })
        );
        if (progress) progress.hidden = true;
        loadTradList();
        return;
      }
      var file = queue.shift();
      done += 1;
      if (progress) {
        progress.hidden = false;
        progress.textContent = tr('privateHub.ops.tradMusicUploading', {
          current: done,
          total: total,
          name: file.name
        });
      }
      var fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('fetch_lyrics', fetchLyrics && fetchLyrics.checked ? '1' : '0');
      fetch(apiBase() + '/music/traditional/admin/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 409) {
            serverSkip += 1;
            return { skipped: true };
          }
          if (!res.ok) throw new Error((data && data.detail) || res.statusText);
          return data;
        });
      }).then(function (data) {
        if (data && data.skipped) {
          next();
          return;
        }
        ok += 1;
        existingSources.add(normFileName(file.name));
        next();
      }).catch(function (err) {
        fail += 1;
        setStatus(status, (err && err.message) || tr('privateHub.ops.tradMusicUploadFailed'), true);
        next();
      });
    }
    if (skipped) {
      setStatus(
        status,
        tr('privateHub.ops.tradMusicUploadSkippedPreflight', {
          skip: skipped,
          names: skippedNames.join('、')
        })
      );
    } else {
      setStatus(status, tr('privateHub.ops.tradMusicUploadStart', { total: total }));
    }
    next();
  }

  function bindUi() {
    document.querySelectorAll('[data-song-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-song-tab'));
      });
    });
    var input = document.getElementById('upload-input');
    var refreshTrad = document.getElementById('btn-refresh-trad');
    var refreshAi = document.getElementById('btn-refresh-ai');
    if (input) {
      input.addEventListener('change', function () {
        if (input.files && input.files.length) uploadFiles(input.files);
        input.value = '';
      });
    }
    if (refreshTrad) refreshTrad.addEventListener('click', loadTradList);
    if (refreshAi) refreshAi.addEventListener('click', loadAiList);
    switchTab('traditional');
  }

  document.addEventListener('tb:private-ready', bindUi);
})();
