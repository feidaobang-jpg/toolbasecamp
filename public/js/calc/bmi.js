document.addEventListener('DOMContentLoaded', function () {
    const heightInput = document.getElementById('height-input');
    const weightInput = document.getElementById('weight-input');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const errorBox = document.getElementById('error-box');
    const resultWrap = document.getElementById('result-wrap');
    const resultBmi = document.getElementById('result-bmi');
    const resultStatus = document.getElementById('result-status');
    const resultSuggestion = document.getElementById('result-suggestion');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function sanitizeDecimal(value) {
        const cleaned = String(value || '').replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts.length <= 1) return cleaned;
        return parts[0] + '.' + parts.slice(1).join('');
    }

    function bindDecimalInput(input) {
        input.addEventListener('input', function () {
            const next = sanitizeDecimal(input.value);
            if (next !== input.value) input.value = next;
        });
    }

    function classify(bmi) {
        if (bmi < 18.5) {
            return {
                key: 'under',
                status: tr('tools.bmi.statusUnder'),
                suggestion: tr('tools.bmi.tipUnder')
            };
        }
        if (bmi < 24) {
            return {
                key: 'normal',
                status: tr('tools.bmi.statusNormal'),
                suggestion: tr('tools.bmi.tipNormal')
            };
        }
        if (bmi < 28) {
            return {
                key: 'over',
                status: tr('tools.bmi.statusOver'),
                suggestion: tr('tools.bmi.tipOver')
            };
        }
        return {
            key: 'obese',
            status: tr('tools.bmi.statusObese'),
            suggestion: tr('tools.bmi.tipObese')
        };
    }

    function scrollToBottom() {
        requestAnimationFrame(function () {
            const el = document.scrollingElement || document.documentElement;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
    }

    function calculate() {
        showError('');
        const height = parseFloat(heightInput.value);
        const weight = parseFloat(weightInput.value);

        if (!heightInput.value.trim() || !weightInput.value.trim()) {
            showError(tr('tools.bmi.needBoth'));
            resultWrap.hidden = true;
            return;
        }
        if (!(height > 0) || !(weight > 0)) {
            showError(tr('tools.bmi.invalid'));
            resultWrap.hidden = true;
            return;
        }

        const heightM = height / 100;
        const bmi = weight / (heightM * heightM);
        const bmiText = bmi.toFixed(1);
        const info = classify(parseFloat(bmiText));

        resultBmi.textContent = bmiText;
        resultStatus.textContent = info.status;
        resultStatus.className = 'bmi-result-value status-' + info.key;
        resultSuggestion.textContent = info.suggestion;
        resultWrap.hidden = false;
        scrollToBottom();
    }

    function clearAll() {
        heightInput.value = '';
        weightInput.value = '';
        showError('');
        resultWrap.hidden = true;
        resultBmi.textContent = '';
        resultStatus.textContent = '';
        resultStatus.className = 'bmi-result-value';
        resultSuggestion.textContent = '';
        heightInput.focus();
    }

    bindDecimalInput(heightInput);
    bindDecimalInput(weightInput);
    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
    [heightInput, weightInput].forEach(function (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') calculate();
        });
    });
});
