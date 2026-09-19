/**
 * 六合彩统计详情：加减 / 包生肖 / 选波；弹窗「确定」即保存；2s 轮询同步
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
  var ZODIAC_LIST = ['马', '蛇', '龙', '兔', '虎', '牛', '鼠', '猪', '狗', '鸡', '猴', '羊'];
  var WAVE_SELECT_LIST = ['红波', '蓝波', '绿波', '红单', '红双', '蓝单', '蓝双', '绿单', '绿双'];
  var zodiacMap = {};
  var waveMap = {};
  var waveGroups = {};
  var failStreak = 0;
  var goneHandled = false;

  function leaveIfGone(detail) {
    if (goneHandled) return;
    goneHandled = true;
    stopPoll();
    modalOpen = false;
    ['amount-modal', 'zodiac-modal', 'wave-modal'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    alert(detail || G.tr('classmates.sheetDeleted', '该统计已被他人删除'));
    window.location.href = 'mark-six-list.html';
  }

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

  function qsId() {
    try {
      var u = new URL(window.location.href);
      return parseInt(u.searchParams.get('id') || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function calcTotal() {
    return Math.round(
      tableData.reduce(function (s, r) {
        return s + (Number(r.value) || 0);
      }, 0) * 100
    ) / 100;
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
    return out.sort(function (a, b) {
      return a - b;
    });
  }

  function numbersByWave(w) {
    if (waveGroups[w] && waveGroups[w].length) {
      return waveGroups[w].slice().sort(function (a, b) {
        return a - b;
      });
    }
    var out = [];
    Object.keys(waveMap).forEach(function (n) {
      if (waveMap[n] === w) out.push(parseInt(n, 10));
    });
    return out.sort(function (a, b) {
      return a - b;
    });
  }

  function setNet(quality) {
    var el = document.getElementById('net-label');
    if (!el) return;
    var q = quality || '优';
    el.setAttribute('data-quality', q);
    el.textContent = G.tr('classmates.network', '网络') + ':' + q;
  }

  function renderTable() {
    var tb = document.getElementById('table-body');
    var totalEl = document.getElementById('total-label');
    if (totalEl) totalEl.textContent = String(calcTotal());
    if (!tb) return;
    tb.innerHTML = tableData
      .map(function (row, idx) {
        return (
          '<div class="ms-row">' +
          '<div class="ms-cell-num">' +
          '<div class="ms-num-zodiac"><span class="ms-num">' +
          row.number +
          '</span><span class="ms-zodiac">' +
          (row.zodiac || '') +
          '</span></div>' +
          '<div class="ms-payout">' +
          G.tr('classmates.payoutPrefix', '赔:') +
          (row.payout || 0) +
          '</div></div>' +
          '<div class="ms-cell-val">' +
          (row.displayValue || row.value || 0) +
          '</div>' +
          '<div class="ms-cell-act"><button type="button" class="ms-add-btn" data-i="' +
          idx +
          '">' +
          G.tr('classmates.colAdd', '加') +
          '</button></div>' +
          '<div class="ms-cell-act"><button type="button" class="ms-sub-btn" data-i="' +
          idx +
          '">' +
          G.tr('classmates.colSub', '减') +
          '</button></div></div>'
        );
      })
      .join('');
    tb.querySelectorAll('.ms-add-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        openAmount(parseInt(b.getAttribute('data-i'), 10), true);
      });
    });
    tb.querySelectorAll('.ms-sub-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        openAmount(parseInt(b.getAttribute('data-i'), 10), false);
      });
    });
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

  /** 弹窗确定后立即写入服务端；他人 2s 轮询可见 */
  function persist() {
    if (!sheetId || saving) return Promise.resolve();
    saving = true;
    setNet('良');
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
        if (p.res.status === 404) {
          leaveIfGone(p.body.detail);
          return;
        }
        if (!p.res.ok || !p.body.success) {
          failStreak += 1;
          setNet(failStreak > 2 ? '断' : '差');
          alert(p.body.detail || G.tr('classmates.saveFail', '保存失败'));
          return;
        }
        failStreak = 0;
        applySheet(p.body.sheet);
        setNet('优');
      })
      .catch(function () {
        saving = false;
        failStreak += 1;
        setNet('断');
        alert(G.tr('classmates.saveFail', '保存失败'));
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
    var input = document.getElementById('amount-input');
    if (title) {
      title.textContent = isAdd
        ? G.tr('classmates.addAmount', '添加数值') + ' - ' + G.tr('classmates.serial', '序号') + row.number
        : G.tr('classmates.subAmount', '减少数值') + ' - ' + G.tr('classmates.serial', '序号') + row.number;
    }
    if (input) input.value = '';
    if (modal) modal.hidden = false;
    if (input) setTimeout(function () { input.focus(); }, 50);
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

  function addToNumber(number, amt) {
    tableData.forEach(function (row) {
      if (row.number !== number) return;
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
    var totalAmount = Math.round(amt * zs.length * 100) / 100;
    if (info) {
      info.textContent =
        G.tr('classmates.zodiacInfo1', '已选择') +
        ' ' +
        zs.length +
        ' ' +
        G.tr('classmates.zodiacUnit', '个生肖') +
        '，' +
        G.tr('classmates.totalNumbers', '共') +
        ' ' +
        count +
        ' ' +
        G.tr('classmates.numbers', '个号码') +
        '\n' +
        G.tr('classmates.eachZodiacAdd', '每个生肖将添加') +
        ' ' +
        amt +
        ' ' +
        G.tr('classmates.amountUnit', '金额') +
        '\n' +
        G.tr('classmates.totalAmount', '总金额') +
        ': ' +
        totalAmount;
    }
  }

  function confirmZodiac() {
    var input = document.getElementById('zodiac-input');
    var raw = input ? String(input.value || '').trim() : '';
    var zs = Object.keys(selectedZodiacs);
    if (!zs.length) {
      alert(G.tr('classmates.pickZodiac', '请至少选择一个生肖'));
      return;
    }
    if (!raw || !/^(\d+)(\.\d*)?$/.test(raw) || parseFloat(raw) <= 0) {
      alert(G.tr('classmates.invalidAmount', '请输入大于 0 的数值'));
      return;
    }
    var amt = Math.round(parseFloat(raw) * 100) / 100;
    // 与小程序一致：每个生肖获得 amt，再均分到该生肖下号码
    zs.forEach(function (z) {
      var nums = numbersByZodiac(z);
      if (!nums.length) return;
      var per = Math.round((amt / nums.length) * 100) / 100;
      nums.forEach(function (n) {
        addToNumber(n, per);
      });
    });
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
      var colorOpts = WAVE_SELECT_LIST.slice(0, 3);
      var parityOpts = WAVE_SELECT_LIST.slice(3);
      chips.innerHTML =
        '<div class="ms-chip-section">' +
        colorOpts
          .map(function (w) {
            return '<button type="button" class="ms-chip" data-w="' + w + '">' + w + '</button>';
          })
          .join('') +
        '</div>' +
        '<div class="ms-chip-section-label">' +
        G.tr('classmates.waveParity', '波色单双') +
        '</div>' +
        '<div class="ms-chip-section">' +
        parityOpts
          .map(function (w) {
            return '<button type="button" class="ms-chip" data-w="' + w + '">' + w + '</button>';
          })
          .join('') +
        '</div>';
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
    var totalAmount = Math.round(amt * count * 100) / 100;
    if (info) {
      info.textContent =
        G.tr('classmates.zodiacInfo1', '已选择') +
        ' ' +
        ws.length +
        ' ' +
        G.tr('classmates.waveUnit', '个波色') +
        '，' +
        G.tr('classmates.totalNumbers', '共') +
        ' ' +
        count +
        ' ' +
        G.tr('classmates.numbers', '个号码') +
        '\n' +
        G.tr('classmates.eachNumberAdd', '每个号码添加') +
        ' ' +
        amt +
        ' ' +
        G.tr('classmates.amountUnit', '金额') +
        '\n' +
        G.tr('classmates.totalAmount', '总金额') +
        ': ' +
        totalAmount;
    }
  }

  function confirmWave() {
    var input = document.getElementById('wave-input');
    var raw = input ? String(input.value || '').trim() : '';
    var ws = Object.keys(selectedWaves);
    if (!ws.length) {
      alert(G.tr('classmates.pickWave', '请至少选择一个波色'));
      return;
    }
    if (!raw || !/^(\d+)(\.\d*)?$/.test(raw) || parseFloat(raw) <= 0) {
      alert(G.tr('classmates.invalidAmount', '请输入大于 0 的数值'));
      return;
    }
    var amt = Math.round(parseFloat(raw) * 100) / 100;
    ws.forEach(function (w) {
      numbersByWave(w).forEach(function (n) {
        addToNumber(n, amt);
      });
    });
    document.getElementById('wave-modal').hidden = true;
    modalOpen = false;
    renderTable();
    persist();
  }

  function poll() {
    if (!sheetId || saving || modalOpen || goneHandled) return;
    var q = updatedAtUtc ? '?since=' + encodeURIComponent(updatedAtUtc) : '';
    api('/mark-six/sheets/' + sheetId + q)
      .then(function (p) {
        if (p.res.status === 404) {
          leaveIfGone(p.body.detail || G.tr('classmates.sheetDeleted', '该统计已被他人删除'));
          return;
        }
        if (!p.res.ok || !p.body.success) {
          failStreak += 1;
          setNet(failStreak > 2 ? '断' : '差');
          return;
        }
        failStreak = 0;
        setNet('优');
        if (p.body.unchanged) return;
        if (p.body.sheet) applySheet(p.body.sheet);
      })
      .catch(function () {
        failStreak += 1;
        setNet('断');
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
    var amountInput = document.getElementById('amount-input');
    if (amountInput) {
      amountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirmAmount();
      });
    }
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
    if (zb) zb.addEventListener('click', openZodiac);
    if (wb) wb.addEventListener('click', openWave);
  }

  function boot() {
    sheetId = qsId();
    if (!sheetId) {
      alert(G.tr('classmates.missingId', '缺少统计表 id'));
      window.location.href = 'mark-six-list.html';
      return;
    }
    bindUi();
    setNet('优');
    api('/mark-six/meta')
      .then(function (p) {
        if (p.res.ok && p.body.success) {
          zodiacMap = p.body.zodiac_map || {};
          waveMap = p.body.wave_map || {};
          waveGroups = p.body.wave_groups || {};
          if (p.body.zodiac_list && p.body.zodiac_list.length) ZODIAC_LIST = p.body.zodiac_list;
          if (p.body.wave_select_list && p.body.wave_select_list.length) {
            WAVE_SELECT_LIST = p.body.wave_select_list;
          } else if (p.body.wave_list && p.body.wave_parity_list) {
            WAVE_SELECT_LIST = [].concat(p.body.wave_list, p.body.wave_parity_list);
          } else if (p.body.wave_list && p.body.wave_list.length) {
            WAVE_SELECT_LIST = p.body.wave_list;
          }
          if (p.body.odds_default) odds = Number(p.body.odds_default) || odds;
        }
        return api('/mark-six/sheets/' + sheetId);
      })
      .then(function (p) {
        if (!p || !p.res.ok || !p.body.success || !p.body.sheet) {
          if (p && p.res && p.res.status === 404) {
            leaveIfGone(p.body.detail);
            return;
          }
          alert((p && p.body && p.body.detail) || G.tr('classmates.sheetDeleted', '该统计已被他人删除'));
          window.location.href = 'mark-six-list.html';
          return;
        }
        applySheet(p.body.sheet);
        setNet('优');
        startPoll();
      })
      .catch(function () {
        setNet('断');
      });
  }

  document.addEventListener('tb:mark-six-ready', boot);
  window.addEventListener('beforeunload', stopPoll);
})();
