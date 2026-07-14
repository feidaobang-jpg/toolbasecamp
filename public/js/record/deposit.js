document.addEventListener('DOMContentLoaded', function () {
    var R = window.TBRecords;
    var tr = R.tr;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var listView = document.getElementById('list-view');
    var detailView = document.getElementById('detail-view');
    var listEl = document.getElementById('list');
    var emptyEl = document.getElementById('empty');
    var errorBox = document.getElementById('error-box');
    var detailError = document.getElementById('detail-error');
    var addForm = document.getElementById('add-form');
    var nameInput = document.getElementById('name-input');
    var amountInput = document.getElementById('amount-input');
    var detailName = document.getElementById('detail-name');
    var detailBalance = document.getElementById('detail-balance');
    var txnList = document.getElementById('txn-list');
    var txnEmpty = document.getElementById('txn-empty');
    var loginLink = document.getElementById('login-link');
    var currentId = null;
    var txnType = 'deposit';

    loginLink.href = R.loginUrl();

    function moneyLabel(amount) {
        return tr('tools.deposit.balance', { amount: amount });
    }

    function showList() {
        listView.hidden = false;
        detailView.hidden = true;
        currentId = null;
        addForm.hidden = true;
        nameInput.value = '';
        R.setError(detailError, '');
    }

    function setTxnType(type) {
        txnType = type;
        document.getElementById('type-deposit').classList.toggle('is-active', type === 'deposit');
        document.getElementById('type-withdraw').classList.toggle('is-active', type === 'withdraw');
    }

    function renderTxns(records) {
        txnList.innerHTML = '';
        txnEmpty.hidden = records.length > 0;
        records.forEach(function (row) {
            var el = document.createElement('div');
            el.className = 'rec-txn';
            var typeCls = row.type === 'withdraw' ? 'rec-txn-type-withdraw' : 'rec-txn-type-deposit';
            var typeText = row.type === 'withdraw'
                ? tr('tools.deposit.withdraw')
                : tr('tools.deposit.deposit');
            el.innerHTML =
                '<div><span class="' + typeCls + '"></span> · <span data-amt></span><br><span data-time class="rec-item-meta"></span></div>' +
                '<div data-bal></div>';
            el.querySelector('.' + typeCls).textContent = typeText;
            el.querySelector('[data-amt]').textContent = '¥' + row.amount;
            el.querySelector('[data-time]').textContent = R.formatTime(row.time);
            el.querySelector('[data-bal]').textContent = tr('tools.deposit.afterBalance', { amount: row.balance });
            txnList.appendChild(el);
        });
    }

    function openDetail(id) {
        R.setError(detailError, '');
        R.apiJson('/records/deposits/' + id)
            .then(function (data) {
                currentId = data.id;
                listView.hidden = true;
                detailView.hidden = false;
                detailName.textContent = data.name;
                detailBalance.textContent = moneyLabel(data.amount);
                amountInput.value = '';
                setTxnType('deposit');
                renderTxns(data.records || []);
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
                '<div class="rec-item-value"></div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="open"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent = R.formatTime(item.updatedAt);
            el.querySelector('.rec-item-value').textContent = '¥' + item.amount;
            el.querySelector('[data-act="open"]').textContent = tr('tools.deposit.open');
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
        return R.apiJson('/records/deposits')
            .then(function (data) { renderList(data.items || []); })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    document.getElementById('add-btn').addEventListener('click', function () {
        addForm.hidden = !addForm.hidden;
        if (!addForm.hidden) nameInput.focus();
    });
    document.getElementById('cancel-add-btn').addEventListener('click', function () {
        addForm.hidden = true;
        nameInput.value = '';
    });
    document.getElementById('create-btn').addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name) {
            R.setError(errorBox, tr('tools.records.invalidName'));
            return;
        }
        R.apiJson('/records/deposits', {
            method: 'POST',
            body: JSON.stringify({ name: name })
        })
            .then(function () {
                addForm.hidden = true;
                nameInput.value = '';
                return load();
            })
            .catch(function (e) { R.setError(errorBox, e.message); });
    });
    document.getElementById('refresh-btn').addEventListener('click', load);
    document.getElementById('back-btn').addEventListener('click', function () {
        showList();
        load();
    });
    document.getElementById('delete-btn').addEventListener('click', function () {
        if (!currentId) return;
        if (!R.confirmDelete(tr('tools.deposit.deleteConfirm', { name: detailName.textContent }))) return;
        R.apiJson('/records/deposits/' + currentId, { method: 'DELETE' })
            .then(function () {
                showList();
                return load();
            })
            .catch(function (e) { R.setError(detailError, e.message); });
    });
    document.getElementById('type-deposit').addEventListener('click', function () { setTxnType('deposit'); });
    document.getElementById('type-withdraw').addEventListener('click', function () { setTxnType('withdraw'); });
    document.getElementById('submit-txn-btn').addEventListener('click', function () {
        if (!currentId) return;
        var amount = amountInput.value.trim();
        if (!amount) {
            R.setError(detailError, tr('tools.records.invalidAmount'));
            return;
        }
        R.apiJson('/records/deposits/' + currentId + '/txns', {
            method: 'POST',
            body: JSON.stringify({ type: txnType, amount: amount })
        })
            .then(function (data) {
                detailBalance.textContent = moneyLabel(data.amount);
                amountInput.value = '';
                renderTxns(data.records || []);
                R.setError(detailError, '');
            })
            .catch(function (e) { R.setError(detailError, e.message); });
    });

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
