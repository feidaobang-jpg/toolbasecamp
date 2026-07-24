document.addEventListener('DOMContentLoaded', function () {
    var tabs = document.querySelectorAll('.tb-tab');
    var panelDiscount = document.getElementById('panel-discount');
    var panelPercent = document.getElementById('panel-percent');
    var originalInput = document.getElementById('original-input');
    var discountInput = document.getElementById('discount-input');
    var partInput = document.getElementById('part-input');
    var wholeInput = document.getElementById('whole-input');
    var calcBtn = document.getElementById('calc-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var rowPay = document.getElementById('row-pay');
    var rowSave = document.getElementById('row-save');
    var rowPercent = document.getElementById('row-percent');
    var resultPay = document.getElementById('result-pay');
    var resultSave = document.getElementById('result-save');
    var resultPercent = document.getElementById('result-percent');

    var activeTab = 'discount';

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

    function fmt(n) {
        return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function switchTab(name) {
        activeTab = name;
        tabs.forEach(function (tab) {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === name);
        });
        panelDiscount.hidden = name !== 'discount';
        panelPercent.hidden = name !== 'percent';
        showError('');
        resultWrap.hidden = true;
    }

    function calculate() {
        showError('');
        if (activeTab === 'discount') {
            var original = parseFloat(originalInput.value);
            var discount = parseFloat(discountInput.value);
            if (!originalInput.value.trim() || !discountInput.value.trim()) {
                showError(tr('tools.percentDiscount.needDiscountFields'));
                resultWrap.hidden = true;
                return;
            }
            if (!(original >= 0) || discount < 0 || discount > 100) {
                showError(tr('tools.percentDiscount.invalidDiscount'));
                resultWrap.hidden = true;
                return;
            }
            var saved = original * discount / 100;
            var pay = original - saved;
            resultPay.textContent = fmt(pay);
            resultSave.textContent = fmt(saved);
            resultPercent.textContent = '';
            rowPay.hidden = false;
            rowSave.hidden = false;
            rowPercent.hidden = true;
            resultWrap.hidden = false;
        } else {
            var part = parseFloat(partInput.value);
            var whole = parseFloat(wholeInput.value);
            if (!partInput.value.trim() || !wholeInput.value.trim()) {
                showError(tr('tools.percentDiscount.needPercentFields'));
                resultWrap.hidden = true;
                return;
            }
            if (!(whole > 0)) {
                showError(tr('tools.percentDiscount.invalidWhole'));
                resultWrap.hidden = true;
                return;
            }
            var pct = (part / whole) * 100;
            resultPercent.textContent = pct.toFixed(2) + '%';
            resultPay.textContent = '';
            resultSave.textContent = '';
            rowPay.hidden = true;
            rowSave.hidden = true;
            rowPercent.hidden = false;
            resultWrap.hidden = false;
        }
    }

    function clearAll() {
        originalInput.value = '';
        discountInput.value = '';
        partInput.value = '';
        wholeInput.value = '';
        showError('');
        resultWrap.hidden = true;
        (activeTab === 'discount' ? originalInput : partInput).focus();
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchTab(tab.getAttribute('data-tab'));
        });
    });
    [originalInput, discountInput, partInput, wholeInput].forEach(bindDecimal);
    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
});
