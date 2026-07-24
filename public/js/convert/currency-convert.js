document.addEventListener('DOMContentLoaded', function () {
    var amountInput = document.getElementById('amount-input');
    var fromCurrency = document.getElementById('from-currency');
    var toCurrency = document.getElementById('to-currency');
    var manualRate = document.getElementById('manual-rate');
    var rateStatus = document.getElementById('rate-status');
    var convertBtn = document.getElementById('convert-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultValue = document.getElementById('result-value');
    var resultRate = document.getElementById('result-rate');

    var cachedRate = null;
    var cachedPair = '';

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

    function pairKey() {
        return fromCurrency.value + '->' + toCurrency.value;
    }

    function setRateStatus(text, cls) {
        rateStatus.textContent = text || '';
        rateStatus.className = 'tb-status' + (cls ? ' ' + cls : '');
    }

    function apiBase() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
        return window.location.origin + '/api';
    }

    function fetchRate(from, to) {
        if (from === to) return Promise.resolve(1);
        var url = apiBase() + '/fx/rate?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
        return fetch(url).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (data) {
            if (data.rate == null) throw new Error('no rate');
            return Number(data.rate);
        });
    }

    function getManualRate() {
        var raw = manualRate.value.trim();
        if (!raw) return null;
        var rate = parseFloat(raw);
        return rate > 0 ? rate : null;
    }

    function resolveRate() {
        var manual = getManualRate();
        if (manual != null) {
            return Promise.resolve({ rate: manual, source: 'manual' });
        }
        var from = fromCurrency.value;
        var to = toCurrency.value;
        if (from === to) return Promise.resolve({ rate: 1, source: 'same' });
        if (cachedPair === pairKey() && cachedRate != null) {
            return Promise.resolve({ rate: cachedRate, source: 'live' });
        }
        setRateStatus(tr('tools.currencyConvert.fetching'), '');
        return fetchRate(from, to).then(function (rate) {
            cachedRate = rate;
            cachedPair = pairKey();
            setRateStatus(tr('tools.currencyConvert.liveOk'), 'ok');
            return { rate: rate, source: 'live' };
        }).catch(function () {
            setRateStatus(tr('tools.currencyConvert.liveFail'), 'warn');
            return null;
        });
    }

    function convert() {
        showError('');
        var raw = amountInput.value.trim();
        if (!raw) {
            showError(tr('tools.currencyConvert.needAmount'));
            resultWrap.hidden = true;
            return;
        }
        var amount = parseFloat(raw);
        if (!(amount >= 0)) {
            showError(tr('tools.currencyConvert.invalid'));
            resultWrap.hidden = true;
            return;
        }
        resolveRate().then(function (info) {
            if (!info) {
                showError(tr('tools.currencyConvert.needManual'));
                resultWrap.hidden = true;
                return;
            }
            var out = amount * info.rate;
            var to = toCurrency.value;
            var from = fromCurrency.value;
            resultValue.textContent = out.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' ' + to;
            if (info.source === 'same') {
                resultRate.textContent = '1 ' + from + ' = 1 ' + to;
            } else if (info.source === 'manual') {
                resultRate.textContent = tr('tools.currencyConvert.manualUsed', { from: from, to: to, rate: info.rate });
            } else {
                resultRate.textContent = '1 ' + from + ' = ' + info.rate + ' ' + to;
            }
            resultWrap.hidden = false;
        });
    }

    function clearAll() {
        amountInput.value = '';
        manualRate.value = '';
        cachedRate = null;
        cachedPair = '';
        showError('');
        setRateStatus('', '');
        resultWrap.hidden = true;
        amountInput.focus();
    }

    [amountInput, manualRate].forEach(function (input) {
        input.addEventListener('input', function () {
            var next = sanitizeDecimal(input.value);
            if (next !== input.value) input.value = next;
        });
    });
    fromCurrency.addEventListener('change', function () { cachedRate = null; cachedPair = ''; setRateStatus('', ''); });
    toCurrency.addEventListener('change', function () { cachedRate = null; cachedPair = ''; setRateStatus('', ''); });
    convertBtn.addEventListener('click', convert);
    clearBtn.addEventListener('click', clearAll);
    amountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') convert();
    });
});
