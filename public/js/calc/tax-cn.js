document.addEventListener('DOMContentLoaded', function () {
    var grossInput = document.getElementById('gross-input');
    var socialInput = document.getElementById('social-input');
    var calcBtn = document.getElementById('calc-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultTaxable = document.getElementById('result-taxable');
    var resultTax = document.getElementById('result-tax');
    var resultAfter = document.getElementById('result-after');
    var resultRate = document.getElementById('result-rate');

    var BRACKETS = [
        { max: 3000, rate: 0.03, deduction: 0 },
        { max: 12000, rate: 0.10, deduction: 210 },
        { max: 25000, rate: 0.20, deduction: 1410 },
        { max: 35000, rate: 0.25, deduction: 2660 },
        { max: 55000, rate: 0.30, deduction: 4410 },
        { max: 80000, rate: 0.35, deduction: 7160 },
        { max: Infinity, rate: 0.45, deduction: 15160 }
    ];

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

    function fmt(n) {
        return '¥' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function calcTax(taxable) {
        if (taxable <= 0) return { tax: 0, rate: 0 };
        for (var i = 0; i < BRACKETS.length; i++) {
            var b = BRACKETS[i];
            if (taxable <= b.max) {
                return { tax: taxable * b.rate - b.deduction, rate: b.rate };
            }
        }
        var last = BRACKETS[BRACKETS.length - 1];
        return { tax: taxable * last.rate - last.deduction, rate: last.rate };
    }

    function calculate() {
        showError('');
        if (!grossInput.value.trim()) {
            showError(tr('tools.taxCn.needGross'));
            resultWrap.hidden = true;
            return;
        }
        var gross = parseFloat(grossInput.value);
        var social = socialInput.value.trim() ? parseFloat(socialInput.value) : 0;
        if (!(gross >= 0) || isNaN(social) || social < 0) {
            showError(tr('tools.taxCn.invalid'));
            resultWrap.hidden = true;
            return;
        }
        var taxable = gross - 5000 - social;
        var info = calcTax(taxable);
        var tax = Math.max(0, info.tax);
        var after = gross - social - tax;
        resultTaxable.textContent = fmt(Math.max(0, taxable));
        resultTax.textContent = fmt(tax);
        resultAfter.textContent = fmt(after);
        resultRate.textContent = (info.rate * 100).toFixed(0) + '%';
        resultWrap.hidden = false;
    }

    function clearAll() {
        grossInput.value = '';
        socialInput.value = '';
        showError('');
        resultWrap.hidden = true;
        grossInput.focus();
    }

    [grossInput, socialInput].forEach(function (input) {
        input.addEventListener('input', function () {
            var next = sanitizeDecimal(input.value);
            if (next !== input.value) input.value = next;
        });
    });
    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
    grossInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') calculate();
    });
});
