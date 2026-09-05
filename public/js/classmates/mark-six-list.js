(function () {
  'use strict';

  var G = window.MarkSixGuard;
  var pollTimer = null;
  var lastSig = '';
  var lastTrashSig = '';
  var busy = false;
  var trashKeepDays = 7;
  var isAdmin = false;

  function setTrashVisible(show) {
    var sec = document.querySelector('.ms-trash');
    if (!sec) return;
    if (show) {
      sec.classList.remove('hidden');
      sec.hidden = false;
    } else {
      sec.classList.add('hidden');
      sec.hidden = true;
    }
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers.Authorization = 'Bearer ' + G.token();
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(G.apiBase() + path, opts).then(function (r) {
      return r.text().then(function (txt) {
        var b = {};
        try {
          b = txt ? JSON.parse(txt) : {};
        } catch (e) {
          b = {
            success: false,
            detail: r.status === 502 || r.status === 503
              ? G.tr('classmates.serverBusy', '服务暂时不可用，请稍后重试')
              : G.tr('classmates.badResponse', '服务器返回异常')
          };
        }
        return { res: r, body: b };
      });
    });
  }

  function sheetsSig(sheets) {
    return (sheets || [])
      .map(function (s) {
        return [s.id, s.total, s.updated_at, s.title, s.deleted_at, s.deleted_by].join(':');
      })
      .join('|');
  }

  function bindDelete(box) {
    box.querySelectorAll('.ms-sheet-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!id) return;
        if (
          !confirm(
            G.tr(
              'classmates.deleteConfirmSoft',
              '确定删除？可在回收站恢复（约 ' + trashKeepDays + ' 天内）'
            )
          )
        ) {
          return;
        }
        busy = true;
        api('/mark-six/sheets/' + id, { method: 'DELETE' })
          .then(function (p) {
            busy = false;
            if (!p.res.ok || !p.body.success) {
              alert(p.body.detail || 'failed');
              return;
            }
            if (p.body.trash_keep_days) trashKeepDays = p.body.trash_keep_days;
            load(true);
          })
          .catch(function () {
            busy = false;
          });
      });
    });
  }

  function bindRestore(box) {
    box.querySelectorAll('.ms-sheet-restore').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!id) return;
        busy = true;
        api('/mark-six/sheets/' + id + '/restore', { method: 'POST' })
          .then(function (p) {
            busy = false;
            if (!p.res.ok || !p.body.success) {
              alert(p.body.detail || 'failed');
              return;
            }
            load(true);
          })
          .catch(function () {
            busy = false;
          });
      });
    });
  }

  function render(sheets) {
    var box = document.getElementById('sheet-list');
    if (!box) return;
    if (!sheets || !sheets.length) {
      box.innerHTML =
        '<p class="ms-empty">' +
        G.tr('classmates.noSheets', '暂无统计数据，点击上方按钮创建') +
        '</p>';
      return;
    }
    box.innerHTML = sheets
      .map(function (s) {
        return (
          '<div class="ms-sheet-card">' +
          '<a class="ms-sheet-main" href="mark-six.html?id=' +
          s.id +
          '">' +
          '<div class="ms-sheet-info">' +
          '<span class="ms-sheet-title">' +
          (s.title || G.tr('classmates.defaultTitle', '统计数据')) +
          '</span>' +
          '<span class="ms-sheet-date">' +
          (s.updated_at || '') +
          '</span></div>' +
          '<div class="ms-sheet-total">' +
          G.tr('classmates.grandTotal', '总计：') +
          '<strong>' +
          (s.total || 0) +
          '</strong></div></a>' +
          '<button type="button" class="ms-sheet-del" data-id="' +
          s.id +
          '">' +
          G.tr('classmates.delete', '删除') +
          '</button></div>'
        );
      })
      .join('');
    bindDelete(box);
  }

  function renderTrash(sheets) {
    var box = document.getElementById('trash-list');
    var tip = document.getElementById('trash-tip');
    if (tip) {
      tip.textContent = G.tr(
        'classmates.trashTip',
        '删除后可在此恢复，约保留 ' + trashKeepDays + ' 天'
      );
    }
    if (!box) return;
    if (!sheets || !sheets.length) {
      box.innerHTML =
        '<p class="ms-empty">' + G.tr('classmates.trashEmpty', '回收站为空') + '</p>';
      return;
    }
    box.innerHTML = sheets
      .map(function (s) {
        var who = s.deleted_by_label || '';
        var meta =
          (s.deleted_at || '') +
          (who
            ? ' · ' + G.tr('classmates.deletedBy', '删除人') + ' ' + who
            : '');
        return (
          '<div class="ms-sheet-card ms-sheet-card--trash">' +
          '<div class="ms-sheet-main ms-sheet-main--static">' +
          '<div class="ms-sheet-info">' +
          '<span class="ms-sheet-title">' +
          (s.title || G.tr('classmates.defaultTitle', '统计数据')) +
          '</span>' +
          '<span class="ms-sheet-date">' +
          meta +
          '</span></div>' +
          '<div class="ms-sheet-total">' +
          G.tr('classmates.grandTotal', '总计：') +
          '<strong>' +
          (s.total || 0) +
          '</strong></div></div>' +
          '<button type="button" class="ms-sheet-restore" data-id="' +
          s.id +
          '">' +
          G.tr('classmates.restore', '恢复') +
          '</button></div>'
        );
      })
      .join('');
    bindRestore(box);
  }

  function load(force) {
    if (busy && !force) return;
    api('/mark-six/sheets').then(function (p) {
      if (!p.res.ok || !p.body.success) {
        if (force) render([]);
        return;
      }
      if (p.body.trash_keep_days) trashKeepDays = p.body.trash_keep_days;
      var sheets = p.body.sheets || [];
      var sig = sheetsSig(sheets);
      if (!force && sig === lastSig) return;
      lastSig = sig;
      render(sheets);
    });
    if (!isAdmin) {
      setTrashVisible(false);
      return;
    }
    setTrashVisible(true);
    api('/mark-six/sheets/trash').then(function (p) {
      if (!p.res.ok || !p.body.success) {
        if (force) renderTrash([]);
        return;
      }
      if (p.body.trash_keep_days) trashKeepDays = p.body.trash_keep_days;
      var sheets = p.body.sheets || [];
      var sig = sheetsSig(sheets);
      if (!force && sig === lastTrashSig) return;
      lastTrashSig = sig;
      renderTrash(sheets);
    });
  }

  function createSheet() {
    var title = prompt(
      G.tr('classmates.createPrompt', '统计表标题'),
      G.tr('classmates.defaultTitle', '统计数据')
    );
    if (title === null) return;
    title = String(title || '').trim() || G.tr('classmates.defaultTitle', '统计数据');
    busy = true;
    api('/mark-six/sheets', { method: 'POST', body: { title: title } })
      .then(function (p) {
        busy = false;
        if (!p.res.ok || !p.body.success || !p.body.sheet) {
          alert(p.body.detail || 'failed');
          return;
        }
        window.location.href = 'mark-six.html?id=' + p.body.sheet.id;
      })
      .catch(function () {
        busy = false;
      });
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      load(false);
    }, 2000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  document.addEventListener('tb:mark-six-ready', function (ev) {
    var u = (ev && ev.detail && ev.detail.user) || window.__markSixUser || {};
    isAdmin = !!(typeof window.tbIsAdminUser === 'function' && window.tbIsAdminUser(u));
    setTrashVisible(isAdmin);
    var c = document.getElementById('create-btn');
    if (c) c.addEventListener('click', createSheet);
    load(true);
    startPoll();
  });
  window.addEventListener('beforeunload', stopPoll);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPoll();
    else {
      load(false);
      startPoll();
    }
  });
})();
