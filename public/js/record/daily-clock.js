document.addEventListener('DOMContentLoaded', function () {
    var R = window.TBRecords;
    var tr = R.tr;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var listView = document.getElementById('list-view');
    var formView = document.getElementById('form-view');
    var listEl = document.getElementById('list');
    var emptyEl = document.getElementById('empty');
    var errorBox = document.getElementById('error-box');
    var formError = document.getElementById('form-error');
    var nameInput = document.getElementById('name-input');
    var targetInput = document.getElementById('target-input');
    var formTitle = document.getElementById('form-title');
    var loginLink = document.getElementById('login-link');
    var checkinDialog = document.getElementById('checkin-dialog');
    var checkinTitle = document.getElementById('checkin-title');
    var checkinHint = document.getElementById('checkin-hint');
    var checkinInput = document.getElementById('checkin-input');
    var checkinError = document.getElementById('checkin-error');
    var editId = null;
    var checkinItem = null;
    var CHECKIN_MAX = 999;

    loginLink.href = R.loginUrl();

    function showList() {
        listView.hidden = false;
        formView.hidden = true;
        editId = null;
        R.setError(formError, '');
    }

    function showForm(item) {
        listView.hidden = true;
        formView.hidden = false;
        editId = item ? item.id : null;
        formTitle.textContent = editId
            ? tr('tools.dailyClock.edit')
            : tr('tools.dailyClock.add');
        nameInput.value = item ? item.name : '';
        targetInput.value = item ? item.targetCount : '';
        R.setError(formError, '');
        nameInput.focus();
    }

    function closeCheckinDialog() {
        checkinDialog.hidden = true;
        checkinItem = null;
        R.setError(checkinError, '');
    }

    function openCheckinDialog(item) {
        var remaining = Math.max(0, item.targetCount - item.currentCount);
        if (remaining <= 0) return;
        checkinItem = item;
        checkinTitle.textContent = item.name || tr('tools.dailyClock.checkinTitle');
        checkinHint.textContent = tr('tools.dailyClock.checkinHint', { remaining: remaining });
        checkinInput.value = '1';
        checkinInput.max = String(Math.min(remaining, CHECKIN_MAX));
        R.setError(checkinError, '');
        checkinDialog.hidden = false;
        checkinInput.focus();
        checkinInput.select();
    }

    function submitCheckin() {
        if (!checkinItem) return;
        var remaining = Math.max(0, checkinItem.targetCount - checkinItem.currentCount);
        var count = parseInt(checkinInput.value, 10);
        if (!(count > 0)) {
            R.setError(checkinError, tr('tools.dailyClock.invalidCheckin'));
            return;
        }
        count = Math.min(count, remaining, CHECKIN_MAX);
        var itemId = checkinItem.id;
        R.apiJson('/records/clocks/' + itemId + '/checkin', {
            method: 'POST',
            body: JSON.stringify({ count: count })
        })
            .then(function () {
                closeCheckinDialog();
                return load();
            })
            .catch(function (e) { R.setError(checkinError, e.message); });
    }

    function render(items) {
        listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        items.forEach(function (item) {
            var pct = item.targetCount > 0
                ? Math.min(100, Math.round((item.currentCount / item.targetCount) * 100))
                : 0;
            var done = item.currentCount >= item.targetCount;
            var el = document.createElement('div');
            el.className = 'rec-item';
            el.innerHTML =
                '<div class="rec-item-main">' +
                '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p></div>' +
                '<div class="rec-item-value"></div>' +
                '</div>' +
                '<div class="rec-progress' + (done ? ' is-done' : '') + '"><span style="width:' + pct + '%"></span></div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="checkin"></button>' +
                '<button type="button" class="tb-btn" data-act="reset"></button>' +
                '<button type="button" class="tb-btn" data-act="edit"></button>' +
                '<button type="button" class="tb-btn" data-act="del"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent = tr('tools.dailyClock.progress', {
                current: item.currentCount,
                target: item.targetCount
            });
            el.querySelector('.rec-item-value').textContent = pct + '%';
            var checkBtn = el.querySelector('[data-act="checkin"]');
            var resetBtn = el.querySelector('[data-act="reset"]');
            checkBtn.textContent = tr('tools.dailyClock.checkin');
            checkBtn.disabled = done;
            resetBtn.textContent = tr('tools.dailyClock.resetOne');
            resetBtn.disabled = item.currentCount <= 0;
            el.querySelector('[data-act="edit"]').textContent = tr('tools.records.edit');
            el.querySelector('[data-act="del"]').textContent = tr('tools.records.delete');

            checkBtn.addEventListener('click', function () {
                openCheckinDialog(item);
            });
            resetBtn.addEventListener('click', function () {
                if (!R.confirmDelete(tr('tools.dailyClock.resetOneConfirm', { name: item.name }))) return;
                R.apiJson('/records/clocks/' + item.id + '/reset', {
                    method: 'POST',
                    body: '{}'
                })
                    .catch(function (e) {
                        // Stale API without /reset: recreate goal to clear progress.
                        if (!(e && e.status === 404)) throw e;
                        return R.apiJson('/records/clocks/' + item.id, { method: 'DELETE' })
                            .then(function () {
                                return R.apiJson('/records/clocks', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        name: item.name,
                                        target_count: item.targetCount
                                    })
                                });
                            });
                    })
                    .then(load)
                    .catch(function (e) { R.setError(errorBox, e.message); });
            });
            el.querySelector('[data-act="edit"]').addEventListener('click', function () {
                showForm(item);
            });
            el.querySelector('[data-act="del"]').addEventListener('click', function () {
                if (!R.confirmDelete(tr('tools.dailyClock.deleteConfirm', { name: item.name }))) return;
                R.apiJson('/records/clocks/' + item.id, { method: 'DELETE' })
                    .then(load)
                    .catch(function (e) { R.setError(errorBox, e.message); });
            });
            listEl.appendChild(el);
        });
    }

    function load() {
        R.setError(errorBox, '');
        return R.apiJson('/records/clocks')
            .then(function (data) { render(data.items || []); })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    function save() {
        var name = nameInput.value.trim();
        var target = parseInt(targetInput.value, 10);
        if (!name) {
            R.setError(formError, tr('tools.records.invalidName'));
            return;
        }
        if (!(target > 0)) {
            R.setError(formError, tr('tools.dailyClock.invalidTarget'));
            return;
        }
        var body = JSON.stringify({ name: name, target_count: target });
        var path = editId ? '/records/clocks/' + editId : '/records/clocks';
        var method = editId ? 'PUT' : 'POST';
        R.apiJson(path, { method: method, body: body })
            .then(function () {
                showList();
                return load();
            })
            .catch(function (e) { R.setError(formError, e.message); });
    }

    document.getElementById('add-btn').addEventListener('click', function () { showForm(null); });
    document.getElementById('refresh-btn').addEventListener('click', load);
    document.getElementById('save-btn').addEventListener('click', save);
    document.getElementById('cancel-btn').addEventListener('click', showList);
    document.getElementById('reset-btn').addEventListener('click', function () {
        if (!R.confirmDelete(tr('tools.dailyClock.resetConfirm'))) return;
        R.apiJson('/records/clocks/reset-counts', { method: 'POST', body: '{}' })
            .then(load)
            .catch(function (e) { R.setError(errorBox, e.message); });
    });
    document.getElementById('checkin-confirm').addEventListener('click', submitCheckin);
    checkinDialog.querySelectorAll('[data-act="close-checkin"]').forEach(function (el) {
        el.addEventListener('click', closeCheckinDialog);
    });
    checkinInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitCheckin();
        } else if (e.key === 'Escape') {
            closeCheckinDialog();
        }
    });

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
