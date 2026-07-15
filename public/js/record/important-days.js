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
    var solarFields = document.getElementById('solar-fields');
    var lunarFields = document.getElementById('lunar-fields');
    var lunarYear = document.getElementById('lunar-year');
    var lunarMonth = document.getElementById('lunar-month');
    var lunarDay = document.getElementById('lunar-day');
    var lunarLeap = document.getElementById('lunar-leap');
    var lunarLeapWrap = document.getElementById('lunar-leap-wrap');
    var lunarSolarHint = document.getElementById('lunar-solar-hint');
    var editId = null;
    var calendarType = 'solar';

    loginLink.href = R.loginUrl();

    function getLunarLib() {
        if (typeof solarLunar === 'undefined') return null;
        return solarLunar.default || solarLunar;
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

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

    function formatYmd(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
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
        if (m === 1 && day === 29 && d.getMonth() !== 1) {
            d = new Date(year, 1, 28);
        }
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function dayDiff(a, b) {
        return Math.round((a.getTime() - b.getTime()) / 86400000);
    }

    function solarToLunar(date) {
        var lib = getLunarLib();
        if (!lib || typeof lib.solar2lunar !== 'function') return null;
        var result = lib.solar2lunar(
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate()
        );
        return result === -1 ? null : result;
    }

    function lunarToSolar(y, m, d, isLeap) {
        var lib = getLunarLib();
        if (!lib || typeof lib.lunar2solar !== 'function') return null;
        var result = lib.lunar2solar(y, m, d, !!isLeap);
        if (!result || result === -1) {
            if (isLeap) result = lib.lunar2solar(y, m, d, false);
        }
        if (!result || result === -1) return null;
        return parseYmd(result.cYear + '-' + pad2(result.cMonth) + '-' + pad2(result.cDay));
    }

    function formatLunarShort(lunar) {
        if (!lunar) return '';
        var leap = lunar.isLeap ? tr('tools.importantDays.leapPrefix') : '';
        return leap + (lunar.monthCn || '') + (lunar.dayCn || '');
    }

    function lunarLabelFromParts(month, day, leap) {
        var lib = getLunarLib();
        if (!lib) {
            return (leap ? tr('tools.importantDays.leapPrefix') : '') + month + '/' + day;
        }
        var monthCn = (leap ? tr('tools.importantDays.leapPrefix') : '') + lib.toChinaMonth(month);
        var dayCn = lib.toChinaDay(day);
        return monthCn + dayCn;
    }

    function emptyCycle() {
        return {
            daysLeft: 0,
            daysToNext: 0,
            anniversaryYears: 0,
            nextAnniversaryYears: 0
        };
    }

    function cycleFromOccurrence(base, thisOcc, nextOcc, today) {
        if (!thisOcc || !nextOcc) return emptyCycle();
        var daysToNext = dayDiff(nextOcc, today);
        var daysLeft;
        var anniversaryYears;
        if (thisOcc.getTime() > today.getTime()) {
            daysLeft = dayDiff(thisOcc, today);
            anniversaryYears = thisOcc.getFullYear() - base.getFullYear();
        } else if (thisOcc.getTime() === today.getTime()) {
            daysLeft = 0;
            anniversaryYears = thisOcc.getFullYear() - base.getFullYear();
        } else {
            daysLeft = -dayDiff(today, thisOcc);
            anniversaryYears = thisOcc.getFullYear() - base.getFullYear();
        }
        return {
            daysLeft: daysLeft,
            daysToNext: daysToNext,
            anniversaryYears: Math.max(0, anniversaryYears),
            nextAnniversaryYears: Math.max(0, nextOcc.getFullYear() - base.getFullYear())
        };
    }

    function anniversaryCycleSolar(dateStr) {
        var base = parseYmd(dateStr);
        var today = todayStart();
        if (!base) return emptyCycle();
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
        return cycleFromOccurrence(base, thisYear, nextOcc, today);
    }

    function anniversaryCycleLunar(item) {
        var base = parseYmd(item.date);
        var today = todayStart();
        if (!base || !item.lunarMonth || !item.lunarDay) {
            return anniversaryCycleSolar(item.date);
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
        var todayLunar = solarToLunar(today);
        if (!todayLunar) return anniversaryCycleSolar(item.date);
        var leap = !!item.lunarLeap;
        var thisOcc = lunarToSolar(
            todayLunar.lYear,
            item.lunarMonth,
            item.lunarDay,
            leap
        );
        var nextOcc = thisOcc;
        if (!thisOcc || thisOcc.getTime() < today.getTime()) {
            nextOcc = lunarToSolar(
                todayLunar.lYear + 1,
                item.lunarMonth,
                item.lunarDay,
                leap
            );
            if (!thisOcc) thisOcc = nextOcc;
        } else {
            nextOcc = thisOcc;
        }
        if (!nextOcc && thisOcc) nextOcc = thisOcc;
        return cycleFromOccurrence(base, thisOcc, nextOcc, today);
    }

    function withCycle(item) {
        var cycle =
            item.calendarType === 'lunar'
                ? anniversaryCycleLunar(item)
                : anniversaryCycleSolar(item.date);
        var lunarText = '';
        if (item.calendarType === 'lunar' && item.lunarMonth && item.lunarDay) {
            lunarText = lunarLabelFromParts(item.lunarMonth, item.lunarDay, item.lunarLeap);
        } else {
            var solar = parseYmd(item.date);
            var lunar = solar ? solarToLunar(solar) : null;
            lunarText = formatLunarShort(lunar);
        }
        return Object.assign({}, item, cycle, { lunarText: lunarText });
    }

    function primaryText(item) {
        if (item.daysLeft === 0) return tr('tools.importantDays.today');
        if (item.daysLeft > 0) return tr('tools.importantDays.inDays', { n: item.daysLeft });
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
        var parts = [];
        if (item.calendarType === 'lunar') {
            parts.push(tr('tools.importantDays.calendarLunar') + ' ' + (item.lunarText || ''));
            parts.push(tr('tools.importantDays.solarShort', { date: item.date }));
        } else {
            parts.push(item.date);
            if (item.lunarText) {
                parts.push(tr('tools.importantDays.lunarShort', { lunar: item.lunarText }));
            }
        }
        if (item.anniversaryYears >= 1) {
            parts.push(tr('tools.importantDays.anniversary', { n: item.anniversaryYears }));
        }
        return parts.filter(Boolean).join(' · ');
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

    function fillLunarDayOptions() {
        var y = parseInt(lunarYear.value, 10);
        var m = parseInt(lunarMonth.value, 10);
        var lib = getLunarLib();
        var maxDay = 30;
        if (lib && y && m) {
            if (lunarLeap.checked && typeof lib.leapDays === 'function') {
                maxDay = lib.leapDays(y) || 30;
            } else if (typeof lib.monthDays === 'function') {
                maxDay = lib.monthDays(y, m) || 30;
            }
        }
        var prev = parseInt(lunarDay.value, 10) || 1;
        lunarDay.innerHTML = '';
        for (var d = 1; d <= maxDay; d++) {
            var opt = document.createElement('option');
            opt.value = String(d);
            opt.textContent = String(d);
            lunarDay.appendChild(opt);
        }
        lunarDay.value = String(Math.min(prev, maxDay));
    }

    function updateLeapVisibility() {
        var y = parseInt(lunarYear.value, 10);
        var m = parseInt(lunarMonth.value, 10);
        var lib = getLunarLib();
        var leapM = lib && y && typeof lib.leapMonth === 'function' ? lib.leapMonth(y) : 0;
        var show = !!leapM && leapM === m;
        lunarLeapWrap.hidden = !show;
        if (!show) lunarLeap.checked = false;
        fillLunarDayOptions();
        updateLunarHint();
    }

    function updateLunarHint() {
        var y = parseInt(lunarYear.value, 10);
        var m = parseInt(lunarMonth.value, 10);
        var d = parseInt(lunarDay.value, 10);
        if (!(y && m && d)) {
            lunarSolarHint.textContent = '';
            return;
        }
        var solar = lunarToSolar(y, m, d, lunarLeap.checked);
        if (!solar) {
            lunarSolarHint.textContent = tr('tools.importantDays.invalidLunar');
            return;
        }
        lunarSolarHint.textContent = tr('tools.importantDays.lunarEqualsSolar', {
            date: formatYmd(solar)
        });
    }

    function setCalendarType(type) {
        calendarType = type === 'lunar' ? 'lunar' : 'solar';
        document.getElementById('cal-solar').classList.toggle('is-active', calendarType === 'solar');
        document.getElementById('cal-lunar').classList.toggle('is-active', calendarType === 'lunar');
        solarFields.hidden = calendarType !== 'solar';
        lunarFields.hidden = calendarType !== 'lunar';
        if (calendarType === 'lunar') {
            if (!lunarYear.value) lunarYear.value = String(todayStart().getFullYear());
            updateLeapVisibility();
        }
    }

    function initLunarMonthSelect() {
        lunarMonth.innerHTML = '';
        for (var m = 1; m <= 12; m++) {
            var opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = String(m);
            lunarMonth.appendChild(opt);
        }
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
        setCalendarType(item && item.calendarType === 'lunar' ? 'lunar' : 'solar');
        if (item && item.calendarType === 'lunar') {
            var solar = parseYmd(item.date);
            var fromSolar = solar ? solarToLunar(solar) : null;
            lunarYear.value = String(
                (fromSolar && fromSolar.lYear) || todayStart().getFullYear()
            );
            lunarMonth.value = String(item.lunarMonth || 1);
            lunarLeap.checked = !!item.lunarLeap;
            updateLeapVisibility();
            lunarDay.value = String(item.lunarDay || 1);
            updateLunarHint();
        } else {
            dateInput.value = item ? item.date : '';
        }
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
                render(sortItems((data.items || []).map(withCycle)));
            })
            .catch(function (e) { R.setError(errorBox, e.message); });
    }

    function save() {
        var name = nameInput.value.trim();
        if (!name) {
            R.setError(formError, tr('tools.records.invalidName'));
            return;
        }
        var body = {
            name: name,
            calendarType: calendarType,
            lunarMonth: null,
            lunarDay: null,
            lunarLeap: false
        };
        if (calendarType === 'lunar') {
            var y = parseInt(lunarYear.value, 10);
            var m = parseInt(lunarMonth.value, 10);
            var d = parseInt(lunarDay.value, 10);
            if (!(y && m && d)) {
                R.setError(formError, tr('tools.importantDays.invalidLunar'));
                return;
            }
            var solar = lunarToSolar(y, m, d, lunarLeap.checked);
            if (!solar) {
                R.setError(formError, tr('tools.importantDays.invalidLunar'));
                return;
            }
            body.date = formatYmd(solar);
            body.lunarMonth = m;
            body.lunarDay = d;
            body.lunarLeap = !!lunarLeap.checked;
        } else {
            if (!dateInput.value) {
                R.setError(formError, tr('tools.records.invalidDate'));
                return;
            }
            body.date = dateInput.value;
        }
        var path = editId ? '/records/days/' + editId : '/records/days';
        var method = editId ? 'PUT' : 'POST';
        R.apiJson(path, { method: method, body: JSON.stringify(body) })
            .then(function () {
                showList();
                return load();
            })
            .catch(function (e) { R.setError(formError, e.message); });
    }

    initLunarMonthSelect();
    document.getElementById('cal-solar').addEventListener('click', function () {
        setCalendarType('solar');
    });
    document.getElementById('cal-lunar').addEventListener('click', function () {
        setCalendarType('lunar');
    });
    lunarYear.addEventListener('input', updateLeapVisibility);
    lunarMonth.addEventListener('change', updateLeapVisibility);
    lunarDay.addEventListener('change', updateLunarHint);
    lunarLeap.addEventListener('change', function () {
        fillLunarDayOptions();
        updateLunarHint();
    });

    document.getElementById('add-btn').addEventListener('click', function () { showForm(null); });
    document.getElementById('refresh-btn').addEventListener('click', load);
    document.getElementById('save-btn').addEventListener('click', save);
    document.getElementById('cancel-btn').addEventListener('click', showList);

    R.requireLogin(gate, app).then(function (user) {
        if (user) load();
    });
});
