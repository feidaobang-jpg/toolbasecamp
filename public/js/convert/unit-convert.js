document.addEventListener('DOMContentLoaded', function () {
    var categorySelect = document.getElementById('category-select');
    var valueInput = document.getElementById('value-input');
    var fromUnit = document.getElementById('from-unit');
    var toUnit = document.getElementById('to-unit');
    var convertBtn = document.getElementById('convert-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultValue = document.getElementById('result-value');

    var UNITS = {
        length: [
            { id: 'm', factor: 1 },
            { id: 'km', factor: 1000 },
            { id: 'cm', factor: 0.01 },
            { id: 'mm', factor: 0.001 },
            { id: 'mi', factor: 1609.344 },
            { id: 'ft', factor: 0.3048 },
            { id: 'in', factor: 0.0254 },
            { id: 'yd', factor: 0.9144 }
        ],
        mass: [
            { id: 'kg', factor: 1 },
            { id: 'g', factor: 0.001 },
            { id: 'mg', factor: 0.000001 },
            { id: 'lb', factor: 0.45359237 },
            { id: 'oz', factor: 0.028349523125 },
            { id: 't', factor: 1000 }
        ],
        temp: [
            { id: 'c' },
            { id: 'f' },
            { id: 'k' }
        ],
        area: [
            { id: 'm2', factor: 1 },
            { id: 'km2', factor: 1000000 },
            { id: 'cm2', factor: 0.0001 },
            { id: 'ha', factor: 10000 },
            { id: 'acre', factor: 4046.8564224 },
            { id: 'ft2', factor: 0.09290304 }
        ],
        volume: [
            { id: 'l', factor: 1 },
            { id: 'ml', factor: 0.001 },
            { id: 'm3', factor: 1000 },
            { id: 'gal', factor: 3.785411784 },
            { id: 'ft3', factor: 28.316846592 },
            { id: 'floz', factor: 0.0295735295625 }
        ]
    };

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function sanitizeDecimal(value) {
        var cleaned = String(value || '').replace(/[^\d.-]/g, '');
        var parts = cleaned.split('.');
        if (parts.length <= 1) return cleaned;
        return parts[0] + '.' + parts.slice(1).join('');
    }

    function populateUnits() {
        var cat = categorySelect.value;
        var list = UNITS[cat] || [];
        fromUnit.innerHTML = '';
        toUnit.innerHTML = '';
        list.forEach(function (u, i) {
            var label = tr('tools.unitConvert.unit.' + u.id);
            var opt1 = document.createElement('option');
            opt1.value = u.id;
            opt1.textContent = label;
            fromUnit.appendChild(opt1);
            var opt2 = document.createElement('option');
            opt2.value = u.id;
            opt2.textContent = label;
            toUnit.appendChild(opt2);
            if (i === 1) toUnit.selectedIndex = 1;
        });
    }

    function convertTemp(value, from, to) {
        var c;
        if (from === 'c') c = value;
        else if (from === 'f') c = (value - 32) * 5 / 9;
        else c = value - 273.15;
        if (to === 'c') return c;
        if (to === 'f') return c * 9 / 5 + 32;
        return c + 273.15;
    }

    function convert() {
        showError('');
        var raw = valueInput.value.trim();
        if (!raw) {
            showError(tr('tools.unitConvert.needValue'));
            resultWrap.hidden = true;
            return;
        }
        var value = parseFloat(raw);
        if (isNaN(value)) {
            showError(tr('tools.unitConvert.invalid'));
            resultWrap.hidden = true;
            return;
        }
        var cat = categorySelect.value;
        var from = fromUnit.value;
        var to = toUnit.value;
        var out;
        if (cat === 'temp') {
            out = convertTemp(value, from, to);
        } else {
            var list = UNITS[cat];
            var fromDef = list.find(function (u) { return u.id === from; });
            var toDef = list.find(function (u) { return u.id === to; });
            var base = value * fromDef.factor;
            out = base / toDef.factor;
        }
        var unitLabel = tr('tools.unitConvert.unit.' + to);
        resultValue.textContent = out.toLocaleString(undefined, { maximumFractionDigits: 10 }) + ' ' + unitLabel;
        resultWrap.hidden = false;
    }

    function clearAll() {
        valueInput.value = '';
        showError('');
        resultWrap.hidden = true;
        resultValue.textContent = '';
        valueInput.focus();
    }

    valueInput.addEventListener('input', function () {
        var next = sanitizeDecimal(valueInput.value);
        if (next !== valueInput.value) valueInput.value = next;
    });
    categorySelect.addEventListener('change', populateUnits);
    convertBtn.addEventListener('click', convert);
    clearBtn.addEventListener('click', clearAll);
    valueInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') convert();
    });

    populateUnits();
});
