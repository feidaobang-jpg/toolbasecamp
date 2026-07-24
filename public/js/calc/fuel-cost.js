document.addEventListener('DOMContentLoaded', function () {
    var distanceInput = document.getElementById('distance-input');
    var consumptionInput = document.getElementById('consumption-input');
    var priceInput = document.getElementById('price-input');
    var calcBtn = document.getElementById('calc-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultLiters = document.getElementById('result-liters');
    var resultCost = document.getElementById('result-cost');

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

    function bindDecimal(input) {
        input.addEventListener('input', function () {
            var next = sanitizeDecimal(input.value);
            if (next !== input.value) input.value = next;
        });
    }

    function calculate() {
        showError('');
        if (!distanceInput.value.trim() || !consumptionInput.value.trim() || !priceInput.value.trim()) {
            showError(tr('tools.fuelCost.needAll'));
            resultWrap.hidden = true;
            return;
        }
        var distance = parseFloat(distanceInput.value);
        var consumption = parseFloat(consumptionInput.value);
        var price = parseFloat(priceInput.value);
        if (!(distance > 0) || !(consumption > 0) || !(price >= 0)) {
            showError(tr('tools.fuelCost.invalid'));
            resultWrap.hidden = true;
            return;
        }
        var liters = distance * consumption / 100;
        var cost = liters * price;
        resultLiters.textContent = liters.toFixed(2) + ' L';
        resultCost.textContent = cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        resultWrap.hidden = false;
    }

    function clearAll() {
        distanceInput.value = '';
        consumptionInput.value = '';
        priceInput.value = '';
        showError('');
        resultWrap.hidden = true;
        distanceInput.focus();
    }

    [distanceInput, consumptionInput, priceInput].forEach(bindDecimal);
    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
});
