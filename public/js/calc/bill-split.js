document.addEventListener('DOMContentLoaded', function () {
    var totalInput = document.getElementById('total-input');
    var peopleInput = document.getElementById('people-input');
    var weightsInput = document.getElementById('weights-input');
    var calcBtn = document.getElementById('calc-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultList = document.getElementById('result-list');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function sanitizeDecimal(value) {
        var cleaned = String(value || '').replace(/[^\d.]/g, '');
        var parts = cleaned.split('.');
        if (parts.length <= 1) return cleaned;
        return parts[0] + '.' + parts.slice(1).join('');
    }

    function calculate() {
        showError('');
        resultList.innerHTML = '';
        if (!totalInput.value.trim() || !peopleInput.value.trim()) {
            showError(tr('tools.billSplit.needFields'));
            resultWrap.hidden = true;
            return;
        }
        var total = parseFloat(totalInput.value);
        var people = parseInt(peopleInput.value, 10);
        if (!(total > 0) || !(people >= 1)) {
            showError(tr('tools.billSplit.invalid'));
            resultWrap.hidden = true;
            return;
        }
        var weights = [];
        var rawWeights = weightsInput.value.trim();
        if (rawWeights) {
            var parts = rawWeights.split(/[,，\s]+/).filter(Boolean);
            weights = parts.map(function (p) { return parseFloat(p); });
            if (weights.length !== people || weights.some(function (w) { return !(w > 0); })) {
                showError(tr('tools.billSplit.badWeights'));
                resultWrap.hidden = true;
                return;
            }
        } else {
            for (var i = 0; i < people; i++) weights.push(1);
        }
        var sumW = weights.reduce(function (a, b) { return a + b; }, 0);
        weights.forEach(function (w, i) {
            var share = total * w / sumW;
            var row = document.createElement('div');
            row.className = 'tb-result-row';
            var label = document.createElement('span');
            label.className = 'tb-result-label';
            label.textContent = tr('tools.billSplit.personLabel', { n: i + 1 });
            var value = document.createElement('span');
            value.className = 'tb-result-value';
            value.textContent = share.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            row.appendChild(label);
            row.appendChild(value);
            resultList.appendChild(row);
        });
        resultWrap.hidden = false;
    }

    function clearAll() {
        totalInput.value = '';
        peopleInput.value = '';
        weightsInput.value = '';
        showError('');
        resultList.innerHTML = '';
        resultWrap.hidden = true;
        totalInput.focus();
    }

    totalInput.addEventListener('input', function () {
        var next = sanitizeDecimal(totalInput.value);
        if (next !== totalInput.value) totalInput.value = next;
    });
    peopleInput.addEventListener('input', function () {
        peopleInput.value = peopleInput.value.replace(/\D/g, '');
    });
    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
});
