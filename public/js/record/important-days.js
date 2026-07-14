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
    var dateInput = document.getElementById('date-input');
    var formTitle = document.getElementById('form-title');
    var loginLink = document.getElementById('login-link');
    var editId = null;

    loginLink.href = R.loginUrl();

    function daysText(n) {
        if (n === 0) return tr('tools.importantDays.today');
        if (n > 0) return tr('tools.importantDays.inDays', { n: n });
        return tr('tools.importantDays.daysAgo', { n: Math.abs(n) });
    }

    function anniversaryText(item) {
        var years = item.anniversaryYears;
        if (years == null || years < 1) return '';
        return tr('tools.importantDays.anniversary', { n: years });
    }

    function metaText(item) {
        var parts = [item.date];
        var ann = anniversaryText(item);
        if (ann) parts.push(ann);
        return parts.join(' · ');
    }

    function nextHint(item) {
        if (item.daysLeft >= 0) return '';
        var n = item.daysToNext;
        if (n == null || n <= 0) return '';
        var nextYears = item.nextAnniversaryYears;
        if (nextYears != null && nextYears > 0) {
            return tr('tools.importantDays.nextWithYears', { n: n, years: nextYears });
        }
        return tr('tools.importantDays.nextInDays', { n: n });
    }

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
            ? tr('tools.importantDays.edit')
            : tr('tools.importantDays.add');
        nameInput.value = item ? item.name : '';
        dateInput.value = item ? item.date : '';
        R.setError(formError, '');
        nameInput.focus();
    }

    function render(items) {
        listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        items.forEach(function (item) {
            var cls = 'rec-item';
            if (item.daysLeft === 0) cls += ' rec-days-today';
            else if (item.daysLeft < 0) cls += ' rec-days-past';

            var el = document.createElement('div');
            el.className = cls;
            el.innerHTML =
                '<div class="rec-item-main">' +
                '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p><p class="rec-item-meta" data-next></p></div>' +
                '<div class="rec-item-value"></div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="edit"></button>' +
                '<button type="button" class="tb-btn" data-act="del"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent = metaText(item);
            var nextEl = el.querySelector('[data-next]');
            var hint = nextHint(item);
            if (hint) nextEl.textContent = hint;
            else nextEl.hidden = true;
            el.querySelector('.rec-item-value').textContent = daysText(item.daysLeft);
            el.querySelector('[data-act="edit"]').textContent = tr('tools.records.edit');
            el.querySelector('[data-act="del"]').textContent = tr('tools.records.delete');
            el.querySelector('[data-act="edit"]').addEventListener('click', function () {
                showForm(item);
            });
            el.querySelector('[data-act="del"]').addEventListener('click', function () {
                if (!R.confirmDelete(tr('tools.importantDays.deleteConfirm', { name: item.name }))) return;
                R.apiJson('/records/days/' + item.id, { method: 'DELETE' })
                    .then(load)
                    .catch(function (e) { R.setError(errorBox, e.message); });
            });
            listEl.appendChild(el);
        });
    }

    function load() {
        R.setError(errorBox, '');
        return R.apiJson('/records/days')
            .then(function (data) { render(data.items || []); })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    function save() {
        var name = nameInput.value.trim();
        var date = dateInput.value;
        if (!name) {
            R.setError(formError, tr('tools.records.invalidName'));
            return;
        }
        if (!date) {
            R.setError(formError, tr('tools.records.invalidDate'));
            return;
        }
        var body = JSON.stringify({ name: name, date: date });
        var path = editId ? '/records/days/' + editId : '/records/days';
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

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
