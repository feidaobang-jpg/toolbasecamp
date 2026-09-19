/**
 * 后台 · 六合彩同学名单
 */
(function () {
  'use strict';

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function flash(msg, isErr) {
    var el = document.getElementById('member-flash');
    if (!el) return;
    el.style.display = '';
    el.textContent = msg || '';
    el.className = 'home-pc-flash' + (isErr ? ' home-pc-flash--err' : '');
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
  }

  function loadList() {
    return fetch(apiBase() + '/mark-six/members', { headers: authHeaders() })
      .then(function (r) {
        return r.json().then(function (b) {
          return { res: r, body: b };
        });
      })
      .then(function (pack) {
        var box = document.getElementById('member-list');
        if (!box) return;
        if (!pack.res.ok || !pack.body.success) {
          box.innerHTML =
            '<p style="padding:16px;">' +
            (pack.body.detail || pack.body.message || tr('privateHub.ops.markSixLoadFail', '加载失败')) +
            '</p>';
          return;
        }
        var rows = pack.body.members || [];
        if (!rows.length) {
          box.innerHTML =
            '<p style="padding:16px;color:#64748b;">' +
            tr('privateHub.ops.markSixEmpty', '暂无名单，请添加同学手机号') +
            '</p>';
          return;
        }
        var html =
          '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
          '<thead><tr style="background:#f8fafc;text-align:left;">' +
          '<th style="padding:10px 12px;">' +
          tr('privateHub.ops.markSixPhone', '手机号') +
          '</th>' +
          '<th style="padding:10px 12px;">' +
          tr('privateHub.ops.markSixNote', '备注') +
          '</th>' +
          '<th style="padding:10px 12px;">' +
          tr('privateHub.ops.markSixCreated', '添加时间') +
          '</th>' +
          '<th style="padding:10px 12px;"></th></tr></thead><tbody>';
        rows.forEach(function (m) {
          html +=
            '<tr style="border-top:1px solid #e2e8f0;">' +
            '<td style="padding:10px 12px;">' +
            (m.phone || '') +
            '</td>' +
            '<td style="padding:10px 12px;">' +
            (m.note || '—') +
            '</td>' +
            '<td style="padding:10px 12px;">' +
            (m.created_at || '') +
            '</td>' +
            '<td style="padding:10px 12px;"><button type="button" class="tb-btn ms-del" data-id="' +
            m.id +
            '">' +
            tr('privateHub.ops.markSixRemove', '移除') +
            '</button></td></tr>';
        });
        html += '</tbody></table>';
        box.innerHTML = html;
        box.querySelectorAll('.ms-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            if (!id) return;
            if (!confirm(tr('privateHub.ops.markSixRemoveConfirm', '确定移除此手机号？'))) return;
            fetch(apiBase() + '/mark-six/members/' + id, {
              method: 'DELETE',
              headers: authHeaders()
            })
              .then(function (r) {
                return r.json().then(function (b) {
                  return { res: r, body: b };
                });
              })
              .then(function (p) {
                if (!p.res.ok || !p.body.success) {
                  flash(p.body.detail || 'failed', true);
                  return;
                }
                flash(tr('privateHub.ops.markSixRemoved', '已移除'));
                loadList();
              })
              .catch(function () {
                flash(tr('privateHub.ops.markSixLoadFail', '加载失败'), true);
              });
          });
        });
      })
      .catch(function () {
        flash(tr('privateHub.ops.markSixLoadFail', '加载失败'), true);
      });
  }

  function addMember() {
    var phoneEl = document.getElementById('member-phone');
    var noteEl = document.getElementById('member-note');
    var phone = phoneEl ? String(phoneEl.value || '').trim() : '';
    var note = noteEl ? String(noteEl.value || '').trim() : '';
    fetch(apiBase() + '/mark-six/members', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ phone: phone, note: note })
    })
      .then(function (r) {
        return r.json().then(function (b) {
          return { res: r, body: b };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body.success) {
          flash(pack.body.detail || tr('privateHub.ops.markSixAddFail', '添加失败'), true);
          return;
        }
        if (phoneEl) phoneEl.value = '';
        if (noteEl) noteEl.value = '';
        flash(tr('privateHub.ops.markSixAdded', '已添加'));
        loadList();
      })
      .catch(function () {
        flash(tr('privateHub.ops.markSixAddFail', '添加失败'), true);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var addBtn = document.getElementById('member-add-btn');
    if (addBtn) addBtn.addEventListener('click', addMember);
    var boot = setInterval(function () {
      var app = document.getElementById('app');
      if (app && !app.hidden && !app.classList.contains('hidden')) {
        clearInterval(boot);
        loadList();
      }
    }, 200);
    setTimeout(function () {
      clearInterval(boot);
    }, 8000);
  });
})();
