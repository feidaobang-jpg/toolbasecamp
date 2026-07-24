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
    var currentId = null;
    var currentData = null;
    var editingId = null;

    loginLink.href = R.loginUrl();

    function statusLabel(status) {
        if (status === 'paid') return tr('tools.rent.statusPaid');
        if (status === 'overdue') return tr('tools.rent.statusOverdue');
        return tr('tools.rent.statusDue');
    }

    function statusClass(status) {
        if (status === 'paid') return 'rec-rent-status is-paid';
        if (status === 'overdue') return 'rec-rent-status is-overdue';
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
        fAmount.value = data && data.rentAmount ? data.rentAmount : '';
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
            el.querySelector('[data-amt]').textContent = '¥' + row.amount;
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
                amount: data.rentAmount,
                dueDay: data.dueDay
            })
        ];
        detailMeta.textContent = parts.join(' · ');
        detailStatus.className = statusClass(data.status);
        detailStatus.textContent = statusLabel(data.status) + ' · ' + data.currentPeriod;
        if (data.note) {
            detailNote.hidden = false;
            detailNote.textContent = data.note;
        } else {
            detailNote.hidden = true;
            detailNote.textContent = '';
        }
        payPeriod.value = data.currentPeriod || '';
        payAmount.value = '';
        payNote.value = '';
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
        listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        items.forEach(function (item) {
            var el = document.createElement('div');
            el.className = 'rec-item';
            el.innerHTML =
                '<div class="rec-item-main">' +
                '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p></div>' +
                '<div class="rec-item-value"><span data-status></span><br><span data-amt></span></div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="open"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.title;
            el.querySelector('.rec-item-meta').textContent =
                (item.tenantName ? item.tenantName + ' · ' : '') +
                tr('tools.rent.dueDayShort', { day: item.dueDay });
            var st = el.querySelector('[data-status]');
            st.className = statusClass(item.status);
            st.textContent = statusLabel(item.status);
            el.querySelector('[data-amt]').textContent = tr('tools.rent.perMonth', { amount: item.rentAmount });
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

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
