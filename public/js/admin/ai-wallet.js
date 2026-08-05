(function () {
  'use strict';

  var codesStatus = 'unused';
  var codesPage = 1;
  var codesPages = 1;
  var codesTotal = 0;
  var PAGE_SIZE = 20;

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
    if (!list || !list.length) {
      box.innerHTML = '<p class="text-gray-400 text-sm">' + tr('privateHub.ops.walletCodesEmpty') + '</p>';
      return;
    }
    box.innerHTML = list.map(function (c) {
      var used = c.redeemed
        ? ('<span class="text-amber-600">' + tr('privateHub.ops.walletCodeUsed') + '</span>')
        : ('<span class="text-emerald-600">' + tr('privateHub.ops.walletCodeUnused') + '</span>');
      var who = '';
      if (c.redeemed && c.redeemedAccount) {
        who = '<span class="text-xs text-gray-500 break-all">' +
          tr('privateHub.ops.walletCodeBy').replace('{account}', String(c.redeemedAccount)) +
          '</span>';
      }
      return (
        '<div class="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-white">' +
          '<div class="min-w-0 flex-1 space-y-0.5">' +
            '<code class="text-sm font-mono">' + String(c.code || '') + '</code>' +
            who +
          '</div>' +
          '<span>¥' + Number(c.amountCny || 0).toFixed(2) + '</span>' +
          used +
        '</div>'
      );
    }).join('');
  }

  function loadCodes() {
    syncFilterChips();
    var q = '/wallet/admin/codes?status=' + encodeURIComponent(codesStatus) +
      '&page=' + encodeURIComponent(String(codesPage)) +
      '&page_size=' + encodeURIComponent(String(PAGE_SIZE));
    return apiJson(q).then(function (data) {
      codesTotal = Number(data.total || 0) || 0;
      codesPage = Number(data.page || codesPage) || 1;
      codesPages = Number(data.pages || 1) || 1;
      renderCodes(data.codes || []);
      syncPager();
    }).catch(function (err) {
      setStatus(document.getElementById('codes-status'), err.message, true);
    });
  }

  function bootApp() {
    var boot = document.getElementById('boot-loading');
    if (boot) boot.classList.add('hidden');
    var creditBtn = document.getElementById('btn-credit');
    var codesBtn = document.getElementById('btn-codes');
    var refreshBtn = document.getElementById('btn-refresh-codes');
    var filterRow = document.getElementById('codes-filter');
    var prevBtn = document.getElementById('codes-prev');
    var nextBtn = document.getElementById('codes-next');

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
              .replace('{amount}', Number(data.creditedCny || amount).toFixed(2))
              .replace('{balance}', Number(data.balanceCny || 0).toFixed(2)),
            false
          );
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
    loadCodes();
  }

  document.addEventListener('tb:private-ready', bootApp);
})();
