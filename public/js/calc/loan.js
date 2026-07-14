document.addEventListener('DOMContentLoaded', function () {
    const amountInput = document.getElementById('amount-input');
    const yearsInput = document.getElementById('years-input');
    const rateInput = document.getElementById('rate-input');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const errorBox = document.getElementById('error-box');
    const resultCard = document.getElementById('result-card');
    const detailCard = document.getElementById('detail-card');
    const detailBody = document.getElementById('detail-body');
    const paymentLabel = document.getElementById('payment-label');
    const resultMonthly = document.getElementById('result-monthly');
    const resultTotal = document.getElementById('result-total');
    const resultInterest = document.getElementById('result-interest');
    const methodBtns = Array.prototype.slice.call(document.querySelectorAll('.loan-method-btn'));

    let paymentMethod = 'equal';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function formatMoney(number) {
        return parseFloat(number).toFixed(2);
    }

    function moneyText(number) {
        return '¥ ' + formatMoney(number);
    }

    function sanitizeDecimal(value) {
        const cleaned = String(value || '').replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts.length <= 1) return cleaned;
        return parts[0] + '.' + parts.slice(1).join('');
    }

    function sanitizeInt(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function scrollToBottom() {
        requestAnimationFrame(function () {
            const el = document.scrollingElement || document.documentElement;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
    }

    function setMethod(method) {
        paymentMethod = method;
        methodBtns.forEach(function (btn) {
            btn.classList.toggle('is-active', btn.getAttribute('data-method') === method);
        });
    }

    function hideResults() {
        resultCard.hidden = true;
        detailCard.hidden = true;
        detailBody.innerHTML = '';
    }

    function calculate() {
        showError('');
        const principal = parseFloat(amountInput.value);
        const years = parseInt(yearsInput.value, 10);
        const annualRate = parseFloat(rateInput.value);

        if (!amountInput.value.trim() || !yearsInput.value.trim() || !rateInput.value.trim()) {
            showError(tr('tools.loan.needAll'));
            hideResults();
            return;
        }
        if (!(principal > 0) || !(years > 0) || !(annualRate >= 0)) {
            showError(tr('tools.loan.invalid'));
            hideResults();
            return;
        }
        if (years > 50) {
            showError(tr('tools.loan.yearsTooLong'));
            hideResults();
            return;
        }

        const months = years * 12;
        const monthRate = annualRate / 100 / 12;
        const rows = [];
        let monthlyPayment = 0;
        let totalPayment = 0;
        let totalInterest = 0;

        if (paymentMethod === 'equal') {
            if (monthRate === 0) {
                monthlyPayment = principal / months;
                totalPayment = principal;
                totalInterest = 0;
                let remain = principal;
                for (let i = 1; i <= months; i++) {
                    const principalPart = monthlyPayment;
                    remain -= principalPart;
                    rows.push({
                        month: i,
                        payment: monthlyPayment,
                        principal: principalPart,
                        interest: 0,
                        remain: remain < 0 ? 0 : remain
                    });
                }
            } else {
                monthlyPayment =
                    (principal * monthRate * Math.pow(1 + monthRate, months)) /
                    (Math.pow(1 + monthRate, months) - 1);
                totalPayment = monthlyPayment * months;
                totalInterest = totalPayment - principal;
                let remain = principal;
                for (let i = 1; i <= months; i++) {
                    const interest = remain * monthRate;
                    const principalPart = monthlyPayment - interest;
                    remain -= principalPart;
                    rows.push({
                        month: i,
                        payment: monthlyPayment,
                        principal: principalPart,
                        interest: interest,
                        remain: remain < 0 ? 0 : remain
                    });
                }
            }
        } else {
            const monthlyPrincipal = principal / months;
            let remain = principal;
            let totalPaymentSum = 0;
            let totalInterestSum = 0;
            for (let i = 1; i <= months; i++) {
                const interest = remain * monthRate;
                const payment = monthlyPrincipal + interest;
                remain -= monthlyPrincipal;
                totalPaymentSum += payment;
                totalInterestSum += interest;
                rows.push({
                    month: i,
                    payment: payment,
                    principal: monthlyPrincipal,
                    interest: interest,
                    remain: remain < 0 ? 0 : remain
                });
            }
            monthlyPayment = rows[0].payment;
            totalPayment = totalPaymentSum;
            totalInterest = totalInterestSum;
        }

        paymentLabel.textContent =
            paymentMethod === 'equal'
                ? tr('tools.loan.monthlyPayment')
                : tr('tools.loan.firstMonthPayment');
        resultMonthly.textContent = moneyText(monthlyPayment);
        resultTotal.textContent = moneyText(totalPayment);
        resultInterest.textContent = moneyText(totalInterest);

        const frag = document.createDocumentFragment();
        rows.forEach(function (row) {
            const trEl = document.createElement('tr');
            [
                String(row.month),
                formatMoney(row.payment),
                formatMoney(row.principal),
                formatMoney(row.interest),
                formatMoney(row.remain)
            ].forEach(function (cell) {
                const td = document.createElement('td');
                td.textContent = cell;
                trEl.appendChild(td);
            });
            frag.appendChild(trEl);
        });
        detailBody.innerHTML = '';
        detailBody.appendChild(frag);

        resultCard.hidden = false;
        detailCard.hidden = false;
        scrollToBottom();
    }

    function clearAll() {
        amountInput.value = '';
        yearsInput.value = '';
        rateInput.value = '';
        showError('');
        hideResults();
        setMethod('equal');
        amountInput.focus();
    }

    amountInput.addEventListener('input', function () {
        const next = sanitizeDecimal(amountInput.value);
        if (next !== amountInput.value) amountInput.value = next;
    });
    rateInput.addEventListener('input', function () {
        const next = sanitizeDecimal(rateInput.value);
        if (next !== rateInput.value) rateInput.value = next;
    });
    yearsInput.addEventListener('input', function () {
        const next = sanitizeInt(yearsInput.value);
        if (next !== yearsInput.value) yearsInput.value = next;
    });

    methodBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            setMethod(btn.getAttribute('data-method'));
        });
    });

    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
    [amountInput, yearsInput, rateInput].forEach(function (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') calculate();
        });
    });
});
