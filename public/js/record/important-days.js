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

    function parseYmd(value) {
        if (!value) return null;
        var parts = String(value).slice(0, 10).split('-').map(Number);
        if (parts.length !== 3) return null;
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        if (
            d.getFullYear() !== parts[0] ||
            d.getMonth() !== parts[1] - 1 ||
            d.getDate() !== parts[2]
        ) {
            return null;
        }
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function todayStart() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function dateOnYear(base, year) {
        var m = base.getMonth();
        var day = base.getDate();
        var d = new Date(year, m, day);
        // Feb 29 on non-leap → rolls to Mar 1; pin to Feb 28
        if (m === 1 && day === 29 && d.getMonth() !== 1) {
            d = new Date(year, 1, 28);
        }
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function dayDiff(a, b) {
        return Math.round((a.getTime() - b.getTime()) / 86400000);
    }

    /** Yearly cycle from original date — independent of API daysLeft. */
    function anniversaryCycle(dateStr) {
        var base = parseYmd(dateStr);
        var today = todayStart();
        if (!base) {
            return {
                daysLeft: 0,
                daysToNext: 0,
                anniversaryYears: 0,
                nextAnniversaryYears: 0
            };
        }

        if (base.getTime() > today.getTime()) {
            var until = dayDiff(base, today);
            return {
                daysLeft: until,
                daysToNext: until,
                anniversaryYears: 0,
                nextAnniversaryYears: 0
            };
        }

        var thisYear = dateOnYear(base, today.getFullYear());
        var nextOcc =
            thisYear.getTime() >= today.getTime()
                ? thisYear
                : dateOnYear(base, today.getFullYear() + 1);
        var daysToNext = dayDiff(nextOcc, today);
        var daysLeft;
        var anniversaryYears;

        if (thisYear.getTime() > today.getTime()) {
            daysLeft = dayDiff(thisYear, today);
            anniversaryYears = thisYear.getFullYear() - base.getFullYear();
        } else if (thisYear.getTime() === today.getTime()) {
            daysLeft = 0;
            anniversaryYears = thisYear.getFullYear() - base.getFullYear();
        } else {
            daysLeft = -dayDiff(today, thisYear);
            anniversaryYears = thisYear.getFullYear() - base.getFullYear();
        }

        return {
            daysLeft: daysLeft,
            daysToNext: daysToNext,
            anniversaryYears: Math.max(0, anniversaryYears),
            nextAnniversaryYears: Math.max(0, nextOcc.getFullYear() - base.getFullYear())
        };
    }

    function withCycle(item) {
        var cycle = anniversaryCycle(item.date);
        return Object.assign({}, item, cycle);
    }

    function primaryText(item) {
        if (item.daysLeft === 0) return tr('tools.importantDays.today');
        if (item.daysLeft > 0) return tr('tools.importantDays.inDays', { n: item.daysLeft });
        // Past this year's date: highlight countdown to next anniversary
        if (item.nextAnniversaryYears > 0) {
            return tr('tools.importantDays.nextWithYears', {
                n: item.daysToNext,
                years: item.nextAnniversaryYears
            });
        }
        return tr('tools.importantDays.inDays', { n: item.daysToNext });
    }

    function secondaryText(item) {
        if (item.daysLeft >= 0) return '';
        return tr('tools.importantDays.daysAgo', { n: Math.abs(item.daysLeft) });
    }

    function metaText(item) {
        var parts = [item.date];
        if (item.anniversaryYears >= 1) {
            parts.push(tr('tools.importantDays.anniversary', { n: item.anniversaryYears }));
        }
        return parts.join(' · ');
    }

    function sortItems(items) {
        return items.slice().sort(function (a, b) {
            var da = a.daysLeft;
            var db = b.daysLeft;
            if (da === 0 && db !== 0) return -1;
            if (db === 0 && da !== 0) return 1;
            if (da > 0 && db > 0) return da - db;
            if (da < 0 && db < 0) return a.daysToNext - b.daysToNext;
            return db - da;
        });
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
                '<div>' +
                '<p class="rec-item-title"></p>' +
                '<p class="rec-item-meta"></p>' +
                '<p class="rec-item-value" data-primary></p>' +
                '<p class="rec-item-meta" data-secondary></p>' +
                '</div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="edit"></button>' +
                '<button type="button" class="tb-btn" data-act="del"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent = metaText(item);
            el.querySelector('[data-primary]').textContent = primaryText(item);
            var secondaryEl = el.querySelector('[data-secondary]');
            var secondary = secondaryText(item);
            if (secondary) secondaryEl.textContent = secondary;
            else secondaryEl.hidden = true;
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
            .then(function (data) {
                var items = sortItems((data.items || []).map(withCycle));
                render(items);
            })
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
