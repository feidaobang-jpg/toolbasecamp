document.addEventListener('DOMContentLoaded', function () {
    var startInput = document.getElementById('start-input');
    var endInput = document.getElementById('end-input');
    var calcBtn = document.getElementById('calc-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultCalendar = document.getElementById('result-calendar');
    var resultWorkdays = document.getElementById('result-workdays');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function parseDate(val) {
        if (!val) return null;
        var parts = val.split('-');
        if (parts.length !== 3) return null;
        var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return isNaN(d.getTime()) ? null : d;
    }

    function dayDiff(a, b) {
        var ms = 86400000;
        var utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        var utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
        return Math.round((utcB - utcA) / ms);
    }

    function countWorkdays(start, end) {
        var forward = start <= end;
        var from = forward ? new Date(start) : new Date(end);
        var to = forward ? new Date(end) : new Date(start);
        var count = 0;
        var cur = new Date(from);
        while (cur <= to) {
            var dow = cur.getDay();
            if (dow >= 1 && dow <= 5) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    }

    function calculate() {
        showError('');
        var start = parseDate(startInput.value);
        var end = parseDate(endInput.value);
        if (!start || !end) {
            showError(tr('tools.dateDiff.needBoth'));
            resultWrap.hidden = true;
            return;
        }
        var calendar = Math.abs(dayDiff(start, end));
        var workdays = countWorkdays(start, end);
        if (start > end) {
            resultCalendar.textContent = calendar + ' (' + tr('tools.dateDiff.endBeforeStart') + ')';
        } else {
            resultCalendar.textContent = String(calendar);
        }
        resultWorkdays.textContent = String(workdays);
        resultWrap.hidden = false;
    }

    function clearAll() {
        startInput.value = '';
        endInput.value = '';
        showError('');
        resultWrap.hidden = true;
        startInput.focus();
    }

    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
});
