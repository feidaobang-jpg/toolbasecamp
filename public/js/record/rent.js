document.addEventListener('DOMContentLoaded', function () {
    var R = window.TBRecords;
    var tr = R.tr;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var listView = document.getElementById('list-view');
    var formView = document.getElementById('form-view');
    var detailView = document.getElementById('detail-view');
    var listEl = document.getElementById('list');
    var emptyEl = document.getElementById('empty');
    var errorBox = document.getElementById('error-box');
    var formError = document.getElementById('form-error');
    var detailError = document.getElementById('detail-error');
    var formTitle = document.getElementById('form-title');
    var fTitle = document.getElementById('f-title');
    var fTenant = document.getElementById('f-tenant');
    var fAmount = document.getElementById('f-amount');
    var fDue = document.getElementById('f-due');
    var fNote = document.getElementById('f-note');
    var detailTitle = document.getElementById('detail-title');
    var detailMeta = document.getElementById('detail-meta');
    var detailStatus = document.getElementById('detail-status');
    var detailNote = document.getElementById('detail-note');
    var payPeriod = document.getElementById('pay-period');
    var payAmount = document.getElementById('pay-amount');
    var payNote = document.getElementById('pay-note');
    var payList = document.getElementById('pay-list');
    var payEmpty = document.getElementById('pay-empty');
    var loginLink = document.getElementById('login-link');
    var payBtn = document.getElementById('pay-btn');
    var currentId = null;
    var currentData = null;
    var editingId = null;

    loginLink.href = R.loginUrl();

    function paymentForPeriod(period) {
        var list = (currentData && currentData.payments) || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].period === period) return list[i];
        }
        return null;
    }

    function syncPayButton() {
        var existing = paymentForPeriod((payPeriod.value || '').trim());
        payBtn.textContent = existing ? tr('tools.rent.updatePayment') : tr('tools.rent.submitPayment');
    }

    function fmtYuan(v) {
        if (v == null || v === '') return '';
        var n = Number(String(v).replace(/,/g, ''));
        if (!isFinite(n)) return String(v);
        return String(Math.round(n));
    }

    function yuanNum(v) {
        var n = Number(String(v == null ? '' : v).replace(/,/g, ''));
        return isFinite(n) ? Math.round(n) : 0;
    }

    /** due | overdue | full | partial */
    function payState(item) {
        var paid = yuanNum(item.paidAmount || item.paid_amount);
        if (paid <= 0) {
            return item.status === 'overdue' ? 'overdue' : 'due';
        }
        var rent = yuanNum(item.rentAmount);
        if (rent > 0 && paid < rent) return 'partial';
        return 'full';
    }

    function statusLabel(state) {
        if (state === 'full') return tr('tools.rent.statusPaidFull');
        if (state === 'partial') return tr('tools.rent.statusPartial');
        if (state === 'overdue') return tr('tools.rent.statusOverdue');
        return tr('tools.rent.statusDue');
    }

    function statusClass(state) {
        if (state === 'full') return 'rec-rent-status is-full';
        if (state === 'partial') return 'rec-rent-status is-partial';
        if (state === 'overdue') return 'rec-rent-status is-overdue';
        return 'rec-rent-status is-due';
    }

    function hideAll() {
        listView.hidden = true;
        formView.hidden = true;
        detailView.hidden = true;
    }

    function showList() {
        hideAll();
        listView.hidden = false;
        currentId = null;
        currentData = null;
        editingId = null;
        R.setError(detailError, '');
        R.setError(formError, '');
    }

    function fillForm(data) {
        fTitle.value = data && data.title ? data.title : '';
        fTenant.value = data && data.tenantName ? data.tenantName : '';
        fAmount.value = data && data.rentAmount ? fmtYuan(data.rentAmount) : '';
        fDue.value = data && data.dueDay ? String(data.dueDay) : '1';
        fNote.value = data && data.note ? data.note : '';
    }

    function openForm(data) {
        hideAll();
        formView.hidden = false;
        editingId = data && data.id ? data.id : null;
        formTitle.textContent = editingId ? tr('tools.rent.edit') : tr('tools.rent.add');
        fillForm(data);
        R.setError(formError, '');
        fTitle.focus();
    }

    function renderPayments(payments) {
        payList.innerHTML = '';
        payEmpty.hidden = payments.length > 0;
        payments.forEach(function (row) {
            var el = document.createElement('div');
            el.className = 'rec-txn';
            el.innerHTML =
                '<div><strong data-period></strong> · <span data-amt></span>' +
                '<br><span data-time class="rec-item-meta"></span>' +
                '<br><span data-note class="rec-item-meta"></span></div>' +
                '<div><button type="button" class="tb-btn" data-act="del"></button></div>';
            el.querySelector('[data-period]').textContent = row.period;
            el.querySelector('[data-amt]').textContent = '¥' + fmtYuan(row.amount);
            el.querySelector('[data-time]').textContent = R.formatTime(row.time);
            var noteEl = el.querySelector('[data-note]');
            if (row.note) {
                noteEl.textContent = row.note;
            } else {
                noteEl.hidden = true;
            }
            var delBtn = el.querySelector('[data-act="del"]');
            delBtn.textContent = tr('tools.records.delete');
            delBtn.addEventListener('click', function () {
                if (!currentId) return;
                if (!R.confirmDelete(tr('tools.rent.deletePaymentConfirm', { period: row.period }))) return;
                R.apiJson('/records/rents/' + currentId + '/payments/' + row.id, { method: 'DELETE' })
                    .then(function (data) { applyDetail(data); })
                    .catch(function (e) { R.setError(detailError, e.message); });
            });
            payList.appendChild(el);
        });
    }

    function applyDetail(data) {
        currentId = data.id;
        currentData = data;
        detailTitle.textContent = data.title;
        var parts = [
            tr('tools.rent.metaLine', {
                tenant: data.tenantName || tr('tools.rent.noTenant'),
                amount: fmtYuan(data.rentAmount),
                dueDay: data.dueDay
            })
        ];
        detailMeta.textContent = parts.join(' · ');
        var state = payState(data);
        detailStatus.className = statusClass(state);
        var statusText = statusLabel(state) + ' · ' + data.currentPeriod;
        if (data.paidAmount) {
            statusText += ' · ' + tr('tools.rent.receivedAmount', { amount: fmtYuan(data.paidAmount) });
        }
        if (state === 'partial') {
            var owe = Math.max(0, yuanNum(data.rentAmount) - yuanNum(data.paidAmount));
            statusText += ' · ' + tr('tools.rent.owedAmount', { amount: String(owe) });
        }
        detailStatus.textContent = statusText;
        if (data.note) {
            detailNote.hidden = false;
            detailNote.textContent = data.note;
        } else {
            detailNote.hidden = true;
            detailNote.textContent = '';
        }
        payPeriod.value = data.currentPeriod || '';
        var existing = paymentForPeriod(payPeriod.value);
        if (existing) {
            payAmount.value = fmtYuan(existing.amount) || '';
            payNote.value = existing.note || '';
        } else {
            payAmount.value = '';
            payNote.value = '';
        }
        syncPayButton();
        renderPayments(data.payments || []);
        R.setError(detailError, '');
    }

    function openDetail(id) {
        R.setError(errorBox, '');
        R.apiJson('/records/rents/' + id)
            .then(function (data) {
                hideAll();
                detailView.hidden = false;
                applyDetail(data);
            })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    function renderList(items) {
        listEl.className = 'rec-list rec-rent-list';
        listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        items.forEach(function (item) {
            var state = payState(item);
            var paid = item.paidAmount || item.paid_amount;
            var el = document.createElement('div');
            el.className = 'rec-item rec-rent-item';
            el.innerHTML =
                '<div class="rec-rent-head">' +
                '<p class="rec-item-title"></p>' +
                '<span data-status></span>' +
                '</div>' +
                '<p class="rec-item-meta"></p>' +
                '<p class="rec-rent-amt" data-amt></p>' +
                '<p class="rec-rent-owed" data-owed hidden></p>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="open"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.title;
            el.querySelector('.rec-item-meta').textContent =
                (item.tenantName ? item.tenantName + ' · ' : '') +
                tr('tools.rent.dueDayShort', { day: item.dueDay }) +
                ' · ' + tr('tools.rent.perMonth', { amount: fmtYuan(item.rentAmount) });
            var st = el.querySelector('[data-status]');
            st.className = statusClass(state);
            st.textContent = statusLabel(state);
            var amtEl = el.querySelector('[data-amt]');
            if (paid) {
                amtEl.textContent = tr('tools.rent.receivedAmount', { amount: fmtYuan(paid) });
                amtEl.classList.add(state === 'full' ? 'is-full' : 'is-partial');
            } else {
                amtEl.textContent = tr('tools.rent.perMonth', { amount: fmtYuan(item.rentAmount) });
            }
            var owedEl = el.querySelector('[data-owed]');
            if (state === 'partial') {
                var owe = Math.max(0, yuanNum(item.rentAmount) - yuanNum(paid));
                owedEl.hidden = false;
                owedEl.textContent = tr('tools.rent.owedAmount', { amount: String(owe) });
            }
            el.querySelector('[data-act="open"]').textContent = tr('tools.rent.open');
            el.querySelector('[data-act="open"]').addEventListener('click', function () {
                openDetail(item.id);
            });
            el.addEventListener('click', function (e) {
                if (e.target.closest('button')) return;
                openDetail(item.id);
            });
            listEl.appendChild(el);
        });
    }

    function load() {
        R.setError(errorBox, '');
        return R.apiJson('/records/rents')
            .then(function (data) { renderList(data.items || []); })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    function saveForm() {
        var title = fTitle.value.trim();
        var tenant = fTenant.value.trim();
        var amount = fAmount.value.trim();
        var dueDay = parseInt(fDue.value, 10);
        var note = fNote.value.trim();
        if (!title) {
            R.setError(formError, tr('tools.rent.needTitle'));
            return;
        }
        if (!amount) {
            R.setError(formError, tr('tools.records.invalidAmount'));
            return;
        }
        if (!(dueDay >= 1 && dueDay <= 28)) {
            R.setError(formError, tr('tools.rent.invalidDueDay'));
            return;
        }
        var body = {
            title: title,
            tenant_name: tenant,
            rent_amount: amount,
            due_day: dueDay,
            note: note
        };
        var req = editingId
            ? R.apiJson('/records/rents/' + editingId, { method: 'PUT', body: JSON.stringify(body) })
            : R.apiJson('/records/rents', { method: 'POST', body: JSON.stringify(body) });
        req
            .then(function (data) {
                hideAll();
                detailView.hidden = false;
                applyDetail(data);
            })
            .catch(function (e) { R.setError(formError, e.message); });
    }

    document.getElementById('add-btn').addEventListener('click', function () {
        openForm(null);
    });
    document.getElementById('cancel-form-btn').addEventListener('click', function () {
        if (editingId) {
            openDetail(editingId);
        } else {
            showList();
            load();
        }
    });
    document.getElementById('save-btn').addEventListener('click', saveForm);
    document.getElementById('refresh-btn').addEventListener('click', load);
    document.getElementById('back-btn').addEventListener('click', function () {
        showList();
        load();
    });
    document.getElementById('edit-btn').addEventListener('click', function () {
        if (!currentData) return;
        openForm(currentData);
    });
    document.getElementById('delete-btn').addEventListener('click', function () {
        if (!currentId) return;
        if (!R.confirmDelete(tr('tools.rent.deleteConfirm', { title: detailTitle.textContent }))) return;
        R.apiJson('/records/rents/' + currentId, { method: 'DELETE' })
            .then(function () {
                showList();
                return load();
            })
            .catch(function (e) { R.setError(detailError, e.message); });
    });
    document.getElementById('pay-btn').addEventListener('click', function () {
        if (!currentId) return;
        var period = payPeriod.value.trim();
        if (!period) {
            R.setError(detailError, tr('tools.rent.needPeriod'));
            return;
        }
        var payload = { period: period, note: payNote.value.trim() };
        var amt = payAmount.value.trim();
        if (amt) payload.amount = amt;
        R.apiJson('/records/rents/' + currentId + '/payments', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
            .then(function (data) { applyDetail(data); })
            .catch(function (e) { R.setError(detailError, e.message); });
    });
    payPeriod.addEventListener('change', function () {
        var existing = paymentForPeriod((payPeriod.value || '').trim());
        if (existing) {
            payAmount.value = fmtYuan(existing.amount) || '';
            payNote.value = existing.note || '';
        } else {
            payAmount.value = '';
            payNote.value = '';
        }
        syncPayButton();
        R.setError(detailError, '');
    });

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
