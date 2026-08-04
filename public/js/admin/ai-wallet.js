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
      return (
        '<div class="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-white">' +
          '<code class="text-sm font-mono">' + String(c.code || '') + '</code>' +
          '<span>¥' + Number(c.amountCny || 0).toFixed(2) + '</span>' +
          used +
        '</div>'
      );
    }).join('');
  }

  function loadCodes() {
    return apiJson('/wallet/admin/codes?limit=40').then(function (data) {
      renderCodes(data.codes || []);
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
          return loadCodes();
        }).catch(function (err) {
          setStatus(st, err.message, true);
        }).finally(function () {
          codesBtn.disabled = false;
        });
      });
    }

    if (refreshBtn) refreshBtn.addEventListener('click', loadCodes);
    loadCodes();
  }

  document.addEventListener('tb:private-ready', bootApp);
})();
