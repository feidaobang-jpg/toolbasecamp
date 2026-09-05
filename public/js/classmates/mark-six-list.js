(function () {
  'use strict';

  var G = window.MarkSixGuard;
  var pollTimer = null;
  var lastSig = '';
  var busy = false;

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
        return [s.id, s.total, s.updated_at, s.title].join(':');
      })
      .join('|');
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
    box.querySelectorAll('.ms-sheet-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm(G.tr('classmates.deleteConfirm', '确定删除该统计表？'))) return;
        busy = true;
        api('/mark-six/sheets/' + id, { method: 'DELETE' }).then(function (p) {
          busy = false;
          if (!p.res.ok || !p.body.success) {
            alert(p.body.detail || 'failed');
            return;
          }
          load(true);
        }).catch(function () {
          busy = false;
        });
      });
    });
  }

  function load(force) {
    if (busy && !force) return;
    api('/mark-six/sheets').then(function (p) {
      if (!p.res.ok || !p.body.success) {
        if (force) render([]);
        return;
      }
      var sheets = p.body.sheets || [];
      var sig = sheetsSig(sheets);
      if (!force && sig === lastSig) return;
      lastSig = sig;
      render(sheets);
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
    api('/mark-six/sheets', { method: 'POST', body: { title: title } }).then(function (p) {
      busy = false;
      if (!p.res.ok || !p.body.success || !p.body.sheet) {
        alert(p.body.detail || 'failed');
        return;
      }
      window.location.href = 'mark-six.html?id=' + p.body.sheet.id;
    }).catch(function () {
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

  document.addEventListener('tb:mark-six-ready', function () {
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
