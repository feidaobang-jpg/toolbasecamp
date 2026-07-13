document.addEventListener('DOMContentLoaded', function () {
    const birthInput = document.getElementById('birth-date');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const errorBox = document.getElementById('error-box');
    const resultWrap = document.getElementById('result-wrap');
    const resultMain = document.getElementById('result-main');
    const resultVirtual = document.getElementById('result-virtual');
    const resultLunar = document.getElementById('result-lunar');
    const resultDetail = document.getElementById('result-detail');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function getLunarLib() {
        if (typeof solarLunar === 'undefined') return null;
        return solarLunar.default || solarLunar;
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

    function solarToLunar(date) {
        const lib = getLunarLib();
        if (!lib || typeof lib.solar2lunar !== 'function') return null;
        const result = lib.solar2lunar(
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate()
        );
        return result === -1 ? null : result;
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

    function calcVirtualAge(birth, today) {
        const birthLunar = solarToLunar(birth);
        const todayLunar = solarToLunar(today);
        if (!birthLunar || !todayLunar) return null;
        return todayLunar.lYear - birthLunar.lYear + 1;
    }

    function formatLunarBirthday(lunar) {
        if (!lunar) return '';
        const leap = lunar.isLeap ? tr('tools.age.leapPrefix') : '';
        const isZh = typeof window.tbGetLocale === 'function' && window.tbGetLocale() === 'zh-CN';
        if (isZh) {
            return lunar.gzYear + '年 ' + leap + lunar.monthCn + lunar.dayCn;
        }
        return tr('tools.age.lunarFormatEn', {
            gz: lunar.gzYear,
            animal: lunar.animal || '',
            month: lunar.monthCn,
            day: lunar.dayCn,
            leap: leap
        });
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
        const birthLunar = solarToLunar(birth);
        const virtualAge = calcVirtualAge(birth, today);

        resultMain.textContent = tr('tools.age.resultYears', { years: years });

        if (virtualAge !== null) {
            resultVirtual.textContent = tr('tools.age.resultVirtual', { years: virtualAge });
            resultVirtual.hidden = false;
        } else {
            resultVirtual.hidden = true;
        }

        if (birthLunar) {
            resultLunar.textContent = tr('tools.age.resultLunar', {
                lunar: formatLunarBirthday(birthLunar)
            });
            resultLunar.hidden = false;
        } else {
            resultLunar.hidden = true;
        }

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
        resultVirtual.textContent = '';
        resultLunar.textContent = '';
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
