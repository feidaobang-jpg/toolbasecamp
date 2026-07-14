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
    var editId = null;

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
            checkBtn.textContent = tr('tools.dailyClock.checkin');
            checkBtn.disabled = done;
            el.querySelector('[data-act="edit"]').textContent = tr('tools.records.edit');
            el.querySelector('[data-act="del"]').textContent = tr('tools.records.delete');

            checkBtn.addEventListener('click', function () {
                R.apiJson('/records/clocks/' + item.id + '/checkin', {
                    method: 'POST',
                    body: JSON.stringify({ count: 1 })
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

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
