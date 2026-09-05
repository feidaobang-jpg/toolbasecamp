(function () {
  'use strict';

  var G = window.MarkSixGuard;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers.Authorization = 'Bearer ' + G.token();
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(G.apiBase() + path, opts).then(function (r) {
      return r.json().then(function (b) {
        return { res: r, body: b };
      });
    });
  }

  function render(sheets) {
    var box = document.getElementById('sheet-list');
    if (!box) return;
    if (!sheets || !sheets.length) {
      box.innerHTML =
        '<p class="ms-empty">' + G.tr('classmates.noSheets', '暂无统计表，点上方新建') + '</p>';
      return;
    }
    box.innerHTML = sheets
      .map(function (s) {
        return (
          '<div class="ms-sheet-card">' +
          '<div class="ms-sheet-main">' +
          '<a class="ms-sheet-title" href="mark-six.html?id=' +
          s.id +
          '">' +
          (s.title || G.tr('classmates.defaultTitle', '统计数据')) +
          '</a>' +
          '<div class="ms-sheet-meta">#' +
          s.id +
          ' · ' +
          G.tr('classmates.total', '合计') +
          ' ' +
          (s.total || 0) +
          ' · ' +
          (s.updated_at || '') +
          '</div></div>' +
          '<div class="action-row">' +
          '<a class="tb-btn" href="mark-six.html?id=' +
          s.id +
          '">' +
          G.tr('classmates.open', '打开') +
          '</a>' +
          '<button type="button" class="tb-btn ms-del" data-id="' +
          s.id +
          '">' +
          G.tr('classmates.delete', '删除') +
          '</button></div></div>'
        );
      })
      .join('');
    box.querySelectorAll('.ms-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm(G.tr('classmates.deleteConfirm', '确定删除该统计表？'))) return;
        api('/mark-six/sheets/' + id, { method: 'DELETE' }).then(function (p) {
          if (!p.res.ok || !p.body.success) {
            alert(p.body.detail || 'failed');
            return;
          }
          load();
        });
      });
    });
  }

  function load() {
    api('/mark-six/sheets').then(function (p) {
      if (!p.res.ok || !p.body.success) {
        render([]);
        return;
      }
      render(p.body.sheets || []);
    });
  }

  function createSheet() {
    var title = prompt(
      G.tr('classmates.createPrompt', '统计表标题'),
      G.tr('classmates.defaultTitle', '统计数据')
    );
    if (title === null) return;
    title = String(title || '').trim() || G.tr('classmates.defaultTitle', '统计数据');
    api('/mark-six/sheets', { method: 'POST', body: { title: title } }).then(function (p) {
      if (!p.res.ok || !p.body.success || !p.body.sheet) {
        alert(p.body.detail || 'failed');
        return;
      }
      window.location.href = 'mark-six.html?id=' + p.body.sheet.id;
    });
  }

  document.addEventListener('tb:mark-six-ready', function () {
    var c = document.getElementById('create-btn');
    var r = document.getElementById('refresh-btn');
    if (c) c.addEventListener('click', createSheet);
    if (r) r.addEventListener('click', load);
    load();
  });
})();
