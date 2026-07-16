(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function apiBase() {
        return (typeof siteConfig !== 'undefined' && siteConfig.apiBase) || '';
    }

    function getByPath(obj, path) {
        if (obj == null || !path) return undefined;
        var parts = String(path).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function fmtValue(val, spec) {
        if (val == null || val === '') return '';
        if (spec && spec.fmt === 'bool01') {
            return Number(val) === 0 ? tr('life.f.false') : tr('life.f.true');
        }
        return String(val);
    }

    function fieldSpec(entry) {
        if (Array.isArray(entry)) return { path: entry[0], labelKey: entry[1] };
        return entry || {};
    }

    function renderRows(rows, host) {
        rows.forEach(function (row) {
            if (!row.value && row.value !== 0) return;
            var wrap = document.createElement('div');
            wrap.className = 'life-field';
            var lab = document.createElement('div');
            lab.className = 'life-field-label';
            lab.textContent = tr(row.labelKey);
            var val = document.createElement('div');
            val.className = 'life-field-value';
            if (row.html) val.innerHTML = String(row.value);
            else val.textContent = String(row.value);
            wrap.appendChild(lab);
            wrap.appendChild(val);
            host.appendChild(wrap);
        });
    }

    function collectFromFields(result, fields) {
        var cards = [];
        var listSpec = null;
        var plain = [];
        (fields || []).forEach(function (f) {
            if (f && f.list) listSpec = f;
            else plain.push(f);
        });

        if (listSpec) {
            var arr = getByPath(result, listSpec.list);
            if (!Array.isArray(arr)) arr = [];
            arr.forEach(function (it) {
                var rows = [];
                (listSpec.item || []).forEach(function (entry) {
                    var spec = fieldSpec(entry);
                    rows.push({
                        labelKey: spec.labelKey,
                        value: fmtValue(getByPath(it, spec.path), spec),
                        html: !!spec.html
                    });
                });
                cards.push(rows);
            });
            return cards;
        }

        var rows = [];
        plain.forEach(function (entry) {
            var spec = fieldSpec(entry);
            rows.push({
                labelKey: spec.labelKey,
                value: fmtValue(getByPath(result, spec.path), spec),
                html: !!spec.html
            });
        });
        return [rows];
    }

    var params = new URLSearchParams(window.location.search);
    var featureId = params.get('id') || '';
    var hit = typeof lifeFindById === 'function' ? lifeFindById(featureId) : null;

    var titleEl = document.getElementById('life-title');
    var descEl = document.getElementById('life-desc');
    var inputWrap = document.getElementById('life-input-wrap');
    var inputEl = document.getElementById('life-input');
    var runBtn = document.getElementById('life-run');
    var copyBtn = document.getElementById('life-copy');
    var resultEl = document.getElementById('life-result');
    var errorEl = document.getElementById('life-error');
    var busyEl = document.getElementById('life-busy');

    if (!hit) {
        if (titleEl) titleEl.textContent = tr('life.unknown');
        if (runBtn) runBtn.disabled = true;
        if (errorEl) {
            errorEl.textContent = tr('life.unknown');
            errorEl.classList.add('show');
        }
        return;
    }

    var item = hit.item;
    if (titleEl) titleEl.textContent = tr(item.titleKey);
    if (descEl) descEl.textContent = tr('life.desc');
    document.title = tr(item.titleKey) + ' - ' + tr('site.pageTitleSuffix');

    if (item.input && inputWrap && inputEl) {
        inputWrap.hidden = false;
        inputEl.placeholder = tr(item.input.placeholderKey || 'life.ph.keyword');
    }

    var lastPlainText = '';

    function setBusy(on) {
        if (busyEl) busyEl.hidden = !on;
        if (runBtn) runBtn.disabled = !!on;
    }

    function setError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg || '';
        errorEl.classList.toggle('show', !!msg);
    }

    function showResult(result) {
        resultEl.innerHTML = '';
        lastPlainText = '';
        var cards = collectFromFields(result, item.fields);
        if (!cards.length || !cards.some(function (rows) {
            return rows.some(function (r) { return r.value; });
        })) {
            setError(tr('life.empty'));
            if (copyBtn) copyBtn.disabled = true;
            return;
        }
        var parts = [];
        cards.forEach(function (rows, idx) {
            var card = document.createElement('div');
            card.className = 'life-card';
            renderRows(rows, card);
            resultEl.appendChild(card);
            rows.forEach(function (r) {
                if (r.value) parts.push(tr(r.labelKey) + '：' + r.value.replace(/<[^>]+>/g, ''));
            });
            if (idx < cards.length - 1) parts.push('---');
        });
        lastPlainText = parts.join('\n');
        if (copyBtn) copyBtn.disabled = !lastPlainText;
        setError('');
        requestAnimationFrame(function () {
            var scroller = document.querySelector('.content') || document.scrollingElement || document.documentElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        });
    }

    function detailMessage(data, fallback) {
        var d = data && data.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d) && d.length) {
            return d.map(function (x) { return (x && x.msg) || String(x); }).join('; ');
        }
        return (data && (data.msg || data.message)) || fallback;
    }

    function run() {
        setError('');
        var q = {};
        if (item.input) {
            var v = (inputEl.value || '').trim();
            if (!v && !item.input.optional) {
                setError(tr('life.needKeyword'));
                return;
            }
            if (v) q[item.input.param || 'word'] = v;
        }
        setBusy(true);
        if (copyBtn) copyBtn.disabled = true;
        resultEl.innerHTML = '';
        var qs = Object.keys(q).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
        }).join('&');
        var url = apiBase() + '/life/tian/' + encodeURIComponent(item.api) + (qs ? '?' + qs : '');
        fetch(url).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    throw new Error(detailMessage(data, res.statusText || tr('life.fetchFail')));
                }
                showResult(data.result);
            });
        }).catch(function (err) {
            setError(err.message || tr('life.fetchFail'));
        }).finally(function () {
            setBusy(false);
        });
    }

    runBtn.addEventListener('click', run);
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            if (!lastPlainText) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(lastPlainText).then(function () {
                    copyBtn.textContent = tr('life.copied');
                    setTimeout(function () { copyBtn.textContent = tr('life.copy'); }, 1200);
                });
            }
        });
    }
    if (inputEl) {
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') run();
        });
    }

    document.addEventListener('tb:locale', function () {
        if (titleEl) titleEl.textContent = tr(item.titleKey);
        if (descEl) descEl.textContent = tr('life.desc');
        if (item.input && inputEl) {
            inputEl.placeholder = tr(item.input.placeholderKey || 'life.ph.keyword');
        }
        runBtn.textContent = tr('life.query');
        if (copyBtn) copyBtn.textContent = tr('life.copy');
    });

    if (!item.input) run();
})();
