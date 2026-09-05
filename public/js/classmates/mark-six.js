/**
 * 六合彩统计详情：加减 / 包生肖 / 选波 + 2s 轮询
 */
(function () {
  'use strict';

  var G = window.MarkSixGuard;
  var sheetId = 0;
  var sheet = null;
  var tableData = [];
  var odds = 47;
  var updatedAtUtc = '';
  var pollTimer = null;
  var saving = false;
  var modalOpen = false;
  var amountCtx = { index: -1, isAdd: true };
  var selectedZodiacs = {};
  var selectedWaves = {};
  var ZODIAC_LIST = ['蛇', '龙', '兔', '虎', '牛', '鼠', '猪', '狗', '鸡', '猴', '羊', '马'];
  var WAVE_LIST = ['红波', '蓝波', '绿波'];
  var zodiacMap = {};
  var waveMap = {};

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      Authorization: 'Bearer ' + G.token()
    });
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

  function qsId() {
    try {
      var u = new URL(window.location.href);
      return parseInt(u.searchParams.get('id') || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function calcTotal() {
    return Math.round(tableData.reduce(function (s, r) {
      return s + (Number(r.value) || 0);
    }, 0) * 100) / 100;
  }

  function enrichRow(row) {
    var v = Number(row.value) || 0;
    row.zodiac = zodiacMap[String(row.number)] || row.zodiac || '';
    row.wave = waveMap[String(row.number)] || row.wave || '';
    row.payout = Math.round(v * odds * 100) / 100;
    var expr = row.expression || '0';
    if (String(expr).indexOf('+') >= 0 || String(expr).indexOf('-') >= 0) {
      row.displayValue = expr + '=' + v;
    } else {
      row.displayValue = String(v);
    }
    return row;
  }

  function numbersByZodiac(z) {
    var out = [];
    Object.keys(zodiacMap).forEach(function (n) {
      if (zodiacMap[n] === z) out.push(parseInt(n, 10));
    });
    return out;
  }

  function numbersByWave(w) {
    var out = [];
    Object.keys(waveMap).forEach(function (n) {
      if (waveMap[n] === w) out.push(parseInt(n, 10));
    });
    return out;
  }

  function renderTable() {
    var tb = document.getElementById('table-body');
    var totalEl = document.getElementById('total-label');
    if (totalEl) {
      totalEl.textContent = G.tr('classmates.total', '合计') + ' ' + calcTotal();
    }
    if (!tb) return;
    tb.innerHTML = tableData
      .map(function (row, idx) {
        var waveClass = row.wave ? ' ms-wave-' + row.wave : '';
        return (
          '<tr>' +
          '<td class="ms-num">' +
          row.number +
          '</td>' +
          '<td>' +
          (row.zodiac || '') +
          '</td>' +
          '<td class="' +
          waveClass.trim() +
          '">' +
          (row.wave || '') +
          '</td>' +
          '<td>' +
          (row.displayValue || row.value || 0) +
          '</td>' +
          '<td>' +
          (row.payout || 0) +
          '</td>' +
          '<td><div class="ms-ops">' +
          '<button type="button" class="tb-btn ms-add" data-i="' +
          idx +
          '">+</button>' +
          '<button type="button" class="tb-btn ms-sub" data-i="' +
          idx +
          '">−</button>' +
          '</div></td></tr>'
        );
      })
      .join('');
    tb.querySelectorAll('.ms-add').forEach(function (b) {
      b.addEventListener('click', function () {
        openAmount(parseInt(b.getAttribute('data-i'), 10), true);
      });
    });
    tb.querySelectorAll('.ms-sub').forEach(function (b) {
      b.addEventListener('click', function () {
        openAmount(parseInt(b.getAttribute('data-i'), 10), false);
      });
    });
  }

  function setSync(text) {
    var el = document.getElementById('sync-label');
    if (el) el.textContent = text || '';
  }

  function applySheet(s) {
    sheet = s;
    odds = Number(s.odds) || 47;
    tableData = (s.table_data || []).map(function (r) {
      return enrichRow(Object.assign({}, r));
    });
    updatedAtUtc = s.updated_at_utc || '';
    var titleEl = document.getElementById('sheet-title');
    if (titleEl) titleEl.textContent = s.title || G.tr('classmates.defaultTitle', '统计数据');
    renderTable();
  }

  function persist() {
    if (!sheetId || saving) return Promise.resolve();
    saving = true;
    setSync(G.tr('classmates.saving', '保存中…'));
    return api('/mark-six/sheets/' + sheetId, {
      method: 'PUT',
      body: {
        title: sheet && sheet.title,
        table_data: tableData,
        total: calcTotal(),
        odds: odds
      }
    })
      .then(function (p) {
        saving = false;
        if (!p.res.ok || !p.body.success) {
          setSync(p.body.detail || G.tr('classmates.saveFail', '保存失败'));
          return;
        }
        applySheet(p.body.sheet);
        setSync(G.tr('classmates.saved', '已保存'));
      })
      .catch(function () {
        saving = false;
        setSync(G.tr('classmates.saveFail', '保存失败'));
      });
  }

  function openAmount(index, isAdd) {
    var row = tableData[index];
    if (!row) return;
    if (!isAdd && !(Number(row.value) > 0)) {
      alert(G.tr('classmates.cannotSubZero', '当前值为 0，无法减少'));
      return;
    }
    amountCtx = { index: index, isAdd: isAdd };
    modalOpen = true;
    var modal = document.getElementById('amount-modal');
    var title = document.getElementById('amount-modal-title');
    var hint = document.getElementById('amount-modal-hint');
    var input = document.getElementById('amount-input');
    if (title) {
      title.textContent = isAdd
        ? G.tr('classmates.addAmount', '加金额')
        : G.tr('classmates.subAmount', '减金额');
    }
    if (hint) hint.textContent = '#' + row.number + ' · ' + (row.displayValue || row.value);
    if (input) input.value = '';
    if (modal) modal.hidden = false;
    if (input) input.focus();
  }

  function closeAmount() {
    modalOpen = false;
    var modal = document.getElementById('amount-modal');
    if (modal) modal.hidden = true;
  }

  function confirmAmount() {
    var input = document.getElementById('amount-input');
    var raw = input ? String(input.value || '').trim() : '';
    if (!raw || !/^(\d+)(\.\d*)?$/.test(raw) || parseFloat(raw) <= 0) {
      alert(G.tr('classmates.invalidAmount', '请输入大于 0 的数值'));
      return;
    }
    var amt = Math.round(parseFloat(raw) * 100) / 100;
    var idx = amountCtx.index;
    var row = tableData[idx];
    if (!row) return;
    var cur = Number(row.value) || 0;
    var expr = row.expression || '0';
    if (amountCtx.isAdd) {
      row.value = Math.round((cur + amt) * 100) / 100;
      expr = expr === '0' ? String(amt) : expr + '+' + amt;
    } else {
      if (cur < amt) {
        alert(G.tr('classmates.subTooLarge', '减少值不能大于当前值'));
        return;
      }
      row.value = Math.round((cur - amt) * 100) / 100;
      expr = expr === '0' ? '0-' + amt : expr + '-' + amt;
    }
    row.expression = expr;
    enrichRow(row);
    closeAmount();
    renderTable();
    persist();
  }

  function addToNumbers(nums, amt) {
    var set = {};
    nums.forEach(function (n) {
      set[n] = true;
    });
    tableData.forEach(function (row) {
      if (!set[row.number]) return;
      var cur = Number(row.value) || 0;
      var expr = row.expression || '0';
      row.value = Math.round((cur + amt) * 100) / 100;
      expr = expr === '0' ? String(amt) : expr + '+' + amt;
      row.expression = expr;
      enrichRow(row);
    });
  }

  function openZodiac() {
    selectedZodiacs = {};
    modalOpen = true;
    var chips = document.getElementById('zodiac-chips');
    var input = document.getElementById('zodiac-input');
    var info = document.getElementById('zodiac-info');
    if (chips) {
      chips.innerHTML = ZODIAC_LIST.map(function (z) {
        return '<button type="button" class="ms-chip" data-z="' + z + '">' + z + '</button>';
      }).join('');
      chips.querySelectorAll('.ms-chip').forEach(function (c) {
        c.addEventListener('click', function () {
          var z = c.getAttribute('data-z');
          if (selectedZodiacs[z]) {
            delete selectedZodiacs[z];
            c.classList.remove('is-on');
          } else {
            selectedZodiacs[z] = true;
            c.classList.add('is-on');
          }
          updateZodiacInfo();
        });
      });
    }
    if (input) input.value = '';
    if (info) info.textContent = '';
    document.getElementById('zodiac-modal').hidden = false;
  }

  function updateZodiacInfo() {
    var input = document.getElementById('zodiac-input');
    var info = document.getElementById('zodiac-info');
    var amt = input ? parseFloat(input.value) : 0;
    var zs = Object.keys(selectedZodiacs);
    if (!zs.length || !(amt > 0)) {
      if (info) info.textContent = '';
      return;
    }
    var count = 0;
    zs.forEach(function (z) {
      count += numbersByZodiac(z).length;
    });
    var per = count ? Math.round((amt / count) * 100) / 100 : 0;
    if (info) {
      info.textContent =
        G.tr('classmates.zodiacSplit', '均分到') +
        ' ' +
        count +
        ' ' +
        G.tr('classmates.numbers', '个号码') +
        '，' +
        G.tr('classmates.each', '每个') +
        ' ' +
        per;
    }
  }

  function confirmZodiac() {
    var input = document.getElementById('zodiac-input');
    var raw = input ? String(input.value || '').trim() : '';
    var zs = Object.keys(selectedZodiacs);
    if (!zs.length) {
      alert(G.tr('classmates.pickZodiac', '请选择生肖'));
      return;
    }
    if (!raw || !/^(\d+)(\.\d*)?$/.test(raw) || parseFloat(raw) <= 0) {
      alert(G.tr('classmates.invalidAmount', '请输入大于 0 的数值'));
      return;
    }
    var amt = Math.round(parseFloat(raw) * 100) / 100;
    var nums = [];
    zs.forEach(function (z) {
      nums = nums.concat(numbersByZodiac(z));
    });
    var per = Math.round((amt / nums.length) * 100) / 100;
    addToNumbers(nums, per);
    document.getElementById('zodiac-modal').hidden = true;
    modalOpen = false;
    renderTable();
    persist();
  }

  function openWave() {
    selectedWaves = {};
    modalOpen = true;
    var chips = document.getElementById('wave-chips');
    var input = document.getElementById('wave-input');
    var info = document.getElementById('wave-info');
    if (chips) {
      chips.innerHTML = WAVE_LIST.map(function (w) {
        return '<button type="button" class="ms-chip" data-w="' + w + '">' + w + '</button>';
      }).join('');
      chips.querySelectorAll('.ms-chip').forEach(function (c) {
        c.addEventListener('click', function () {
          var w = c.getAttribute('data-w');
          if (selectedWaves[w]) {
            delete selectedWaves[w];
            c.classList.remove('is-on');
          } else {
            selectedWaves[w] = true;
            c.classList.add('is-on');
          }
          updateWaveInfo();
        });
      });
    }
    if (input) input.value = '';
    if (info) info.textContent = '';
    document.getElementById('wave-modal').hidden = false;
  }

  function updateWaveInfo() {
    var input = document.getElementById('wave-input');
    var info = document.getElementById('wave-info');
    var amt = input ? parseFloat(input.value) : 0;
    var ws = Object.keys(selectedWaves);
    if (!ws.length || !(amt > 0)) {
      if (info) info.textContent = '';
      return;
    }
    var count = 0;
    ws.forEach(function (w) {
      count += numbersByWave(w).length;
    });
    if (info) {
      info.textContent =
        G.tr('classmates.waveApply', '将对') +
        ' ' +
        count +
        ' ' +
        G.tr('classmates.numbers', '个号码') +
        ' ' +
        G.tr('classmates.eachPlus', '各加') +
        ' ' +
        amt;
    }
  }

  function confirmWave() {
    var input = document.getElementById('wave-input');
    var raw = input ? String(input.value || '').trim() : '';
    var ws = Object.keys(selectedWaves);
    if (!ws.length) {
      alert(G.tr('classmates.pickWave', '请选择波色'));
      return;
    }
    if (!raw || !/^(\d+)(\.\d*)?$/.test(raw) || parseFloat(raw) <= 0) {
      alert(G.tr('classmates.invalidAmount', '请输入大于 0 的数值'));
      return;
    }
    var amt = Math.round(parseFloat(raw) * 100) / 100;
    var nums = [];
    ws.forEach(function (w) {
      nums = nums.concat(numbersByWave(w));
    });
    addToNumbers(nums, amt);
    document.getElementById('wave-modal').hidden = true;
    modalOpen = false;
    renderTable();
    persist();
  }

  function clearAll() {
    if (!confirm(G.tr('classmates.clearConfirm', '确定清空全部数值？'))) return;
    tableData.forEach(function (row) {
      row.value = 0;
      row.expression = '0';
      enrichRow(row);
    });
    renderTable();
    persist();
  }

  function poll() {
    if (!sheetId || saving || modalOpen) return;
    var q = updatedAtUtc ? '?since=' + encodeURIComponent(updatedAtUtc) : '';
    api('/mark-six/sheets/' + sheetId + q).then(function (p) {
      if (!p.res.ok || !p.body.success) return;
      if (p.body.unchanged) {
        setSync(G.tr('classmates.synced', '已同步'));
        return;
      }
      if (p.body.sheet) {
        applySheet(p.body.sheet);
        setSync(G.tr('classmates.remoteUpdated', '他人已更新，已同步'));
      }
    });
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(poll, 2000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function bindUi() {
    var amountOk = document.getElementById('amount-ok');
    var amountCancel = document.getElementById('amount-cancel');
    if (amountOk) amountOk.addEventListener('click', confirmAmount);
    if (amountCancel) amountCancel.addEventListener('click', closeAmount);
    var zOk = document.getElementById('zodiac-ok');
    var zCancel = document.getElementById('zodiac-cancel');
    var zIn = document.getElementById('zodiac-input');
    if (zOk) zOk.addEventListener('click', confirmZodiac);
    if (zCancel) {
      zCancel.addEventListener('click', function () {
        document.getElementById('zodiac-modal').hidden = true;
        modalOpen = false;
      });
    }
    if (zIn) zIn.addEventListener('input', updateZodiacInfo);
    var wOk = document.getElementById('wave-ok');
    var wCancel = document.getElementById('wave-cancel');
    var wIn = document.getElementById('wave-input');
    if (wOk) wOk.addEventListener('click', confirmWave);
    if (wCancel) {
      wCancel.addEventListener('click', function () {
        document.getElementById('wave-modal').hidden = true;
        modalOpen = false;
      });
    }
    if (wIn) wIn.addEventListener('input', updateWaveInfo);
    var zb = document.getElementById('zodiac-btn');
    var wb = document.getElementById('wave-btn');
    var cb = document.getElementById('clear-btn');
    var sb = document.getElementById('save-btn');
    if (zb) zb.addEventListener('click', openZodiac);
    if (wb) wb.addEventListener('click', openWave);
    if (cb) cb.addEventListener('click', clearAll);
    if (sb) sb.addEventListener('click', persist);
  }

  function boot() {
    sheetId = qsId();
    if (!sheetId) {
      alert(G.tr('classmates.missingId', '缺少统计表 id'));
      window.location.href = 'mark-six-list.html';
      return;
    }
    bindUi();
    api('/mark-six/meta')
      .then(function (p) {
        if (p.res.ok && p.body.success) {
          zodiacMap = p.body.zodiac_map || {};
          waveMap = p.body.wave_map || {};
          if (p.body.zodiac_list && p.body.zodiac_list.length) ZODIAC_LIST = p.body.zodiac_list;
          if (p.body.wave_list && p.body.wave_list.length) WAVE_LIST = p.body.wave_list;
          if (p.body.odds_default) odds = Number(p.body.odds_default) || odds;
        }
        return api('/mark-six/sheets/' + sheetId);
      })
      .then(function (p) {
        if (!p || !p.res.ok || !p.body.success || !p.body.sheet) {
          alert((p && p.body && p.body.detail) || 'not found');
          window.location.href = 'mark-six-list.html';
          return;
        }
        applySheet(p.body.sheet);
        setSync(G.tr('classmates.synced', '已同步'));
        startPoll();
      });
  }

  document.addEventListener('tb:mark-six-ready', boot);
  window.addEventListener('beforeunload', stopPoll);
})();
