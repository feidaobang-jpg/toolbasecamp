document.addEventListener('DOMContentLoaded', function () {
    const birthInput = document.getElementById('birth-date');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const errorBox = document.getElementById('error-box');
    const resultWrap = document.getElementById('result-wrap');
    const resultMain = document.getElementById('result-main');
    const resultDetail = document.getElementById('result-detail');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function parseBirthDate(value) {
        if (!value) return null;
        const parts = value.split('-').map(Number);
        if (parts.length !== 3) return null;
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (
            date.getFullYear() !== parts[0] ||
            date.getMonth() !== parts[1] - 1 ||
            date.getDate() !== parts[2]
        ) {
            return null;
        }
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function todayStart() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return now;
    }

    function calcAgeYears(birth, today) {
        let years = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            years -= 1;
        }
        return years;
    }

    function calcAgeDetail(birth, today) {
        let years = today.getFullYear() - birth.getFullYear();
        let months = today.getMonth() - birth.getMonth();
        let days = today.getDate() - birth.getDate();

        if (days < 0) {
            months -= 1;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years -= 1;
            months += 12;
        }

        return { years: years, months: months, days: days };
    }

    function formatDisplayDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.style.display = 'flex';
        resultWrap.hidden = true;
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    function calculate() {
        hideError();

        const birth = parseBirthDate(birthInput.value);
        if (!birth) {
            showError(tr('tools.age.emptyDate'));
            return;
        }

        const today = todayStart();
        if (birth.getTime() > today.getTime()) {
            showError(tr('tools.age.futureBirth'));
            return;
        }

        const years = calcAgeYears(birth, today);
        const detail = calcAgeDetail(birth, today);

        resultMain.textContent = tr('tools.age.resultYears', { years: years });
        resultDetail.textContent = tr('tools.age.resultDetail', {
            birth: formatDisplayDate(birth),
            years: detail.years,
            months: detail.months,
            days: detail.days
        });
        resultWrap.hidden = false;
    }

    function clearAll() {
        birthInput.value = '';
        hideError();
        resultWrap.hidden = true;
        resultMain.textContent = '';
        resultDetail.textContent = '';
    }

    calcBtn.addEventListener('click', calculate);
    clearBtn.addEventListener('click', clearAll);
    birthInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') calculate();
    });

    document.addEventListener('tb:locale', function () {
        if (resultWrap.hidden) return;
        calculate();
    });
});
