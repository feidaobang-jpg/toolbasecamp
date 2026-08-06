(function () {
  'use strict';

  var codesStatus = 'unused';
  var codesPage = 1;
  var codesPages = 1;
  var codesTotal = 0;
  var codesCache = [];
  var PAGE_SIZE = 20;
  var usersPage = 1;
  var usersPages = 1;
  var usersTotal = 0;
  var usersQ = '';

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isErr ? '#b91c1c' : '#334155';
  }

  function money(n) {
    return Number(n || 0).toFixed(2);
  }

  function copyText(text) {
    var s = String(text || '');
    if (!s) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand('copy')) reject(new Error('copy failed'));
        else resolve();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function apiJson(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    var tok = token();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;
    opts.cache = 'no-store';
    return fetch(apiBase() + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var detail = data && data.detail;
          if (Array.isArray(detail)) detail = detail.map(function (x) { return x.msg || JSON.stringify(x); }).join('; ');
          throw new Error(detail || ('HTTP ' + res.status));
        }
        return data;
      });
    });
  }

  function syncFilterChips() {
    var row = document.getElementById('codes-filter');
    if (!row) return;
    var chips = row.querySelectorAll('button[data-status]');
    for (var i = 0; i < chips.length; i++) {
      var st = chips[i].getAttribute('data-status') || 'unused';
      var on = st === codesStatus;
      chips[i].classList.toggle('is-active', on);
      chips[i].classList.toggle('border-blue-600', on);
      chips[i].classList.toggle('bg-blue-50', on);
      chips[i].classList.toggle('text-blue-700', on);
      chips[i].classList.toggle('border-gray-300', !on);
      chips[i].classList.toggle('bg-white', !on);
      chips[i].classList.toggle('text-gray-700', !on);
    }
  }

  function syncPager() {
    var pager = document.getElementById('codes-pager');
    var label = document.getElementById('codes-page-label');
    var prev = document.getElementById('codes-prev');
    var next = document.getElementById('codes-next');
    if (pager) pager.hidden = codesTotal <= 0;
    if (label) {
      label.textContent = tr('privateHub.ops.walletPageLabel')
        .replace('{page}', String(codesPage))
        .replace('{pages}', String(codesPages))
        .replace('{total}', String(codesTotal));
    }
    if (prev) prev.disabled = codesPage <= 1;
    if (next) next.disabled = codesPage >= codesPages;
  }

  function renderCodes(list) {
    var box = document.getElementById('codes-list');
    if (!box) return;
    codesCache = list || [];
    if (!list || !list.length) {
      box.innerHTML = '<p class="text-gray-400 text-sm">' + tr('privateHub.ops.walletCodesEmpty') + '</p>';
      return;
    }
    box.innerHTML = list.map(function (c) {
      var used = c.redeemed
        ? ('<span class="text-amber-600 whitespace-nowrap">' + tr('privateHub.ops.walletCodeUsed') + '</span>')
        : ('<span class="text-emerald-600 whitespace-nowrap">' + tr('privateHub.ops.walletCodeUnused') + '</span>');
      var meta = '';
      if (c.redeemed) {
        var account = c.redeemedAccount || '';
        var lines = [];
        if (account) {
          lines.push(
            '<div class="text-xs text-gray-500 break-all mt-1">' +
              tr('privateHub.ops.walletCodeBy').replace('{account}', String(account)) +
            '</div>'
          );
        } else {
          lines.push(
            '<div class="text-xs text-gray-400 mt-1">' +
              tr('privateHub.ops.walletCodeByUnknown') +
            '</div>'
          );
        }
        if (c.redeemedAt) {
          lines.push(
            '<div class="text-xs text-gray-500 mt-0.5">' +
              tr('privateHub.ops.walletCodeAt').replace(
                '{time}',
                String(c.redeemedAt).replace('T', ' ').replace(/\.\d+$/, '')
              ) +
            '</div>'
          );
        }
        meta = lines.join('');
      }
      var codeEsc = String(c.code || '').replace(/"/g, '&quot;');
      return (
        '<div class="flex flex-wrap items-start justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-white">' +
          '<div class="min-w-0 flex-1">' +
            '<code class="text-sm font-mono">' + String(c.code || '') + '</code>' +
            meta +
          '</div>' +
          '<div class="flex items-center gap-3 flex-shrink-0 pt-0.5">' +
            '<span>¥' + money(c.amountCny) + '</span>' +
            used +
            '<button type="button" class="text-xs text-blue-600 hover:underline" data-copy-code="' + codeEsc + '">' +
              tr('privateHub.ops.walletCodesCopy') +
            '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function filterCodesClient(list) {
    var arr = list || [];
    if (codesStatus === 'unused') {
      return arr.filter(function (c) { return !c.redeemed; });
    }
    if (codesStatus === 'used') {
      return arr.filter(function (c) { return !!c.redeemed; });
    }
    return arr;
  }

  function loadCodes() {
    syncFilterChips();
    var q = '/wallet/admin/codes?status=' + encodeURIComponent(codesStatus) +
      '&page=' + encodeURIComponent(String(codesPage)) +
      '&page_size=' + encodeURIComponent(String(PAGE_SIZE));
    return apiJson(q).then(function (data) {
      var serverStatus = data.status;
      var list = data.codes || [];
      if (!serverStatus || serverStatus !== codesStatus) {
        list = filterCodesClient(list);
        codesTotal = list.length;
        codesPages = 1;
        codesPage = 1;
      } else {
        codesTotal = Number(data.total || 0) || 0;
        codesPage = Number(data.page || codesPage) || 1;
        codesPages = Number(data.pages || 1) || 1;
      }
      renderCodes(list);
      syncPager();
    }).catch(function (err) {
      setStatus(document.getElementById('codes-status'), err.message, true);
    });
  }

  function syncUsersPager() {
    var pager = document.getElementById('users-pager');
    var label = document.getElementById('users-page-label');
    var prev = document.getElementById('users-prev');
    var next = document.getElementById('users-next');
    if (pager) pager.hidden = usersTotal <= 0;
    if (label) {
      label.textContent = tr('privateHub.ops.walletPageLabel')
        .replace('{page}', String(usersPage))
        .replace('{pages}', String(usersPages))
        .replace('{total}', String(usersTotal));
    }
    if (prev) prev.disabled = usersPage <= 1;
    if (next) next.disabled = usersPage >= usersPages;
  }

  function renderUsers(list) {
    var box = document.getElementById('users-list');
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<p class="text-gray-400 text-sm">' + tr('privateHub.ops.walletUsersEmpty') + '</p>';
      return;
    }
    box.innerHTML = list.map(function (u) {
      var isAdmin = u.role === 'admin';
      var role = isAdmin
        ? (' · <span class="text-xs text-blue-600">' + tr('privateHub.ops.walletUsersRoleAdmin') + '</span>')
        : '';
      var fillAcc = u.email || u.phone || '';
      var fillBtn = fillAcc
        ? ('<button type="button" class="text-xs text-blue-600 hover:underline" data-fill-account="' +
            String(fillAcc).replace(/"/g, '&quot;') + '">' +
            tr('privateHub.ops.walletUsersFillCredit') +
          '</button>')
        : '';
      var delBtn = (
        '<button type="button" class="text-xs text-red-600 hover:underline" data-delete-user="' +
          String(u.id) + '" data-delete-account="' +
          String(u.account || '').replace(/"/g, '&quot;') + '">' +
          tr('privateHub.ops.walletUsersDelete') +
        '</button>'
      );
      var stats = tr('privateHub.ops.walletUsersStats')
        .replace('{credited}', money(u.creditedCny))
        .replace('{redeemed}', money(u.redeemedCny))
        .replace('{gifted}', money(u.giftedCny))
        .replace('{spent}', money(u.spentCny));
      var joined = '';
      if (u.createdAt) {
        joined =
          '<div class="text-xs text-gray-400 mt-0.5">' +
            tr('privateHub.ops.walletUsersJoined').replace(
              '{time}',
              String(u.createdAt).replace('T', ' ').replace(/\.\d+$/, '')
            ) +
          '</div>';
      }
      return (
        '<div class="flex flex-wrap items-start justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-white">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="text-sm font-medium break-all">' + String(u.account || '') + role + '</div>' +
            (u.nickname && u.loginAccount
              ? ('<div class="text-xs text-gray-400 break-all mt-0.5">' + String(u.loginAccount) + '</div>')
              : '') +
            joined +
            '<div class="text-xs text-gray-500 mt-1 leading-relaxed">' + stats + '</div>' +
          '</div>' +
          '<div class="flex flex-col items-end gap-1 flex-shrink-0">' +
            '<span class="font-semibold">¥' + money(u.balanceCny) + '</span>' +
            fillBtn +
            delBtn +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function loadUsers() {
    var q = '/wallet/admin/users?page=' + encodeURIComponent(String(usersPage)) +
      '&page_size=' + encodeURIComponent(String(PAGE_SIZE)) +
      '&q=' + encodeURIComponent(usersQ || '');
    return apiJson(q).then(function (data) {
      usersTotal = Number(data.total || 0) || 0;
      usersPage = Number(data.page || usersPage) || 1;
      usersPages = Number(data.pages || 1) || 1;
      renderUsers(data.users || []);
      syncUsersPager();
    }).catch(function (err) {
      setStatus(document.getElementById('users-status'), err.message, true);
    });
  }

  function bootApp() {
    var boot = document.getElementById('boot-loading');
    if (boot) boot.classList.add('hidden');
    var creditBtn = document.getElementById('btn-credit');
    var codesBtn = document.getElementById('btn-codes');
    var refreshBtn = document.getElementById('btn-refresh-codes');
    var copyPageBtn = document.getElementById('btn-copy-page-codes');
    var filterRow = document.getElementById('codes-filter');
    var prevBtn = document.getElementById('codes-prev');
    var nextBtn = document.getElementById('codes-next');
    var codesList = document.getElementById('codes-list');

    if (creditBtn) {
      creditBtn.addEventListener('click', function () {
        var account = (document.getElementById('credit-account').value || '').trim();
        var amount = parseFloat(document.getElementById('credit-amount').value || '0');
        var note = (document.getElementById('credit-note').value || '').trim();
        var st = document.getElementById('credit-status');
        if (!account || !(amount > 0)) {
          setStatus(st, tr('privateHub.ops.walletNeedFields'), true);
          return;
        }
        creditBtn.disabled = true;
        setStatus(st, tr('common.loading'), false);
        apiJson('/wallet/admin/credit', {
          method: 'POST',
          body: { account: account, amountCny: amount, note: note }
        }).then(function (data) {
          setStatus(
            st,
            tr('privateHub.ops.walletCreditOk')
              .replace('{amount}', money(data.creditedCny || amount))
              .replace('{balance}', money(data.balanceCny)),
            false
          );
          return loadUsers();
        }).catch(function (err) {
          setStatus(st, err.message, true);
        }).finally(function () {
          creditBtn.disabled = false;
        });
      });
    }

    if (codesBtn) {
      codesBtn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('code-amount').value || '0');
        var count = parseInt(document.getElementById('code-count').value || '1', 10);
        var note = (document.getElementById('code-note').value || '').trim();
        var st = document.getElementById('codes-status');
        var neo = document.getElementById('codes-new');
        if (!(amount > 0) || !(count >= 1)) {
          setStatus(st, tr('privateHub.ops.walletNeedFields'), true);
          return;
        }
        codesBtn.disabled = true;
        setStatus(st, tr('common.loading'), false);
        apiJson('/wallet/admin/codes', {
          method: 'POST',
          body: { amountCny: amount, count: count, note: note }
        }).then(function (data) {
          var codes = (data.codes || []).map(function (c) { return c.code; });
          setStatus(st, tr('privateHub.ops.walletCodesOk').replace('{n}', String(codes.length)), false);
          if (neo) {
            neo.hidden = false;
            neo.classList.remove('hidden');
            neo.textContent = codes.join('\n');
          }
          codesStatus = 'unused';
          codesPage = 1;
          return loadCodes();
        }).catch(function (err) {
          setStatus(st, err.message, true);
        }).finally(function () {
          codesBtn.disabled = false;
        });
      });
    }

    if (filterRow) {
      filterRow.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-status]') : null;
        if (!btn) return;
        var st = btn.getAttribute('data-status') || 'unused';
        if (st === codesStatus) return;
        codesStatus = st;
        codesPage = 1;
        loadCodes();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (codesPage <= 1) return;
        codesPage -= 1;
        loadCodes();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (codesPage >= codesPages) return;
        codesPage += 1;
        loadCodes();
      });
    }

    if (refreshBtn) refreshBtn.addEventListener('click', loadCodes);

    if (copyPageBtn) {
      copyPageBtn.addEventListener('click', function () {
        var st = document.getElementById('codes-status');
        var text = (codesCache || []).map(function (c) { return c.code; }).filter(Boolean).join('\n');
        if (!text) {
          setStatus(st, tr('privateHub.ops.walletCodesEmpty'), true);
          return;
        }
        copyText(text).then(function () {
          setStatus(st, tr('privateHub.ops.walletCodesCopied'), false);
        }).catch(function () {
          setStatus(st, tr('privateHub.ops.walletCodesCopyFail'), true);
        });
      });
    }

    if (codesList) {
      codesList.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-copy-code]') : null;
        if (!btn) return;
        var code = btn.getAttribute('data-copy-code') || '';
        var st = document.getElementById('codes-status');
        copyText(code).then(function () {
          setStatus(st, tr('privateHub.ops.walletCodesCopied') + ': ' + code, false);
        }).catch(function () {
          setStatus(st, tr('privateHub.ops.walletCodesCopyFail'), true);
        });
      });
    }

    var usersSearchBtn = document.getElementById('btn-users-search');
    var usersRefreshBtn = document.getElementById('btn-users-refresh');
    var usersPrev = document.getElementById('users-prev');
    var usersNext = document.getElementById('users-next');
    var usersList = document.getElementById('users-list');
    var usersQInput = document.getElementById('users-q');

    function doUsersSearch() {
      usersQ = usersQInput ? (usersQInput.value || '').trim() : '';
      usersPage = 1;
      loadUsers();
    }
    if (usersSearchBtn) usersSearchBtn.addEventListener('click', doUsersSearch);
    if (usersQInput) {
      usersQInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doUsersSearch();
        }
      });
    }
    if (usersRefreshBtn) usersRefreshBtn.addEventListener('click', loadUsers);
    if (usersPrev) {
      usersPrev.addEventListener('click', function () {
        if (usersPage <= 1) return;
        usersPage -= 1;
        loadUsers();
      });
    }
    if (usersNext) {
      usersNext.addEventListener('click', function () {
        if (usersPage >= usersPages) return;
        usersPage += 1;
        loadUsers();
      });
    }
    if (usersList) {
      usersList.addEventListener('click', function (e) {
        var fillBtn = e.target && e.target.closest ? e.target.closest('[data-fill-account]') : null;
        if (fillBtn) {
          var acc = fillBtn.getAttribute('data-fill-account') || '';
          var input = document.getElementById('credit-account');
          if (input) {
            input.value = acc;
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        var delBtn = e.target && e.target.closest ? e.target.closest('[data-delete-user]') : null;
        if (!delBtn) return;
        var uid = delBtn.getAttribute('data-delete-user') || '';
        var account = delBtn.getAttribute('data-delete-account') || uid;
        var st = document.getElementById('users-status');
        var msg = tr('privateHub.ops.walletUsersDeleteConfirm').replace('{account}', account);
        if (!window.confirm(msg)) return;
        delBtn.disabled = true;
        setStatus(st, tr('common.loading'), false);
        apiJson('/wallet/admin/users/' + encodeURIComponent(uid), { method: 'DELETE' })
          .then(function (data) {
            setStatus(
              st,
              tr('privateHub.ops.walletUsersDeleteOk').replace('{account}', data.account || account),
              false
            );
            return loadUsers();
          })
          .catch(function (err) {
            setStatus(st, err.message, true);
          })
          .finally(function () {
            delBtn.disabled = false;
          });
      });
    }

    loadCodes();
    loadUsers();
  }

  document.addEventListener('tb:private-ready', bootApp);
})();
