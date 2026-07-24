document.addEventListener('DOMContentLoaded', function () {
    var modeRadios = document.querySelectorAll('input[name="mode"]');
    var tsPanel = document.getElementById('ts-panel');
    var datePanel = document.getElementById('date-panel');
    var tsInput = document.getElementById('ts-input');
    var dateInput = document.getElementById('date-input');
    var tzSelect = document.getElementById('tz-select');
    var convertBtn = document.getElementById('convert-btn');
    var nowBtn = document.getElementById('now-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultDatetime = document.getElementById('result-datetime');
    var resultSeconds = document.getElementById('result-seconds');
    var resultMillis = document.getElementById('result-millis');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function getMode() {
        var checked = document.querySelector('input[name="mode"]:checked');
        return checked ? checked.value : 'toDate';
    }

    function getTsUnit() {
        var checked = document.querySelector('input[name="ts-unit"]:checked');
        return checked ? checked.value : 'auto';
    }

    function formatInTz(ms, tz) {
        try {
            return new Intl.DateTimeFormat(undefined, {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(new Date(ms));
        } catch (e) {
            return new Date(ms).toISOString();
        }
    }

    function showResults(ms) {
        var tz = tzSelect.value;
        resultDatetime.textContent = formatInTz(ms, tz) + ' (' + tz + ')';
        resultSeconds.textContent = Math.floor(ms / 1000);
        resultMillis.textContent = ms;
        resultWrap.hidden = false;
    }

    function parseTimestamp(raw) {
        var unit = getTsUnit();
        var num = parseFloat(String(raw).trim());
        if (isNaN(num)) return null;
        if (unit === 's') return num * 1000;
        if (unit === 'ms') return num;
        if (Math.abs(num) >= 1e12) return num;
        return num * 1000;
    }

    function parseDatetimeLocal(val) {
        if (!val) return null;
        var d = new Date(val);
        return isNaN(d.getTime()) ? null : d.getTime();
    }

    function updatePanels() {
        var mode = getMode();
        tsPanel.hidden = mode !== 'toDate';
        datePanel.hidden = mode !== 'toTs';
    }

    function convert() {
        showError('');
        var mode = getMode();
        var ms;
        if (mode === 'toDate') {
            ms = parseTimestamp(tsInput.value);
            if (ms == null) {
                showError(tr('tools.timestampTimezone.invalidTs'));
                resultWrap.hidden = true;
                return;
            }
        } else {
            ms = parseDatetimeLocal(dateInput.value);
            if (ms == null) {
                showError(tr('tools.timestampTimezone.invalidDate'));
                resultWrap.hidden = true;
                return;
            }
        }
        showResults(ms);
    }

    function setNow() {
        showError('');
        var ms = Date.now();
        tsInput.value = String(Math.floor(ms / 1000));
        var d = new Date(ms);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        dateInput.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        showResults(ms);
    }

    function clearAll() {
        tsInput.value = '';
        dateInput.value = '';
        showError('');
        resultWrap.hidden = true;
        tsInput.focus();
    }

    modeRadios.forEach(function (r) {
        r.addEventListener('change', updatePanels);
    });
    convertBtn.addEventListener('click', convert);
    nowBtn.addEventListener('click', setNow);
    clearBtn.addEventListener('click', clearAll);
    tsInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') convert();
    });

    updatePanels();
});
