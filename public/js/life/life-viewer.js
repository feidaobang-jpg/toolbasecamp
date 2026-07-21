(function () {
    'use strict';

    var MSG = {
        desc: '点击「查询」获取内容；部分条目支持关键字搜索。数据来自天行 API。',
        query: '查询',
        copy: '复制',
        copied: '已复制',
        empty: '暂无结果',
        needKeyword: '请先输入关键字',
        fetchFail: '请求失败，请稍后重试',
        upstreamFail: '服务器访问天行接口失败（多为海外 VPS 网络不通）。请在服务器上测试：curl -m 8 https://apis.tianapi.com/',
        notConfigured: '未配置天行密钥（TIANAPI_KEY）',
        unknown: '未找到该功能',
        pageSuffix: 'Tool Basecamp',
        true: '正确',
        false: '错误',
        defaultPlaceholder: '请输入关键字'
    };

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
            return Number(val) === 0 ? MSG.false : MSG.true;
        }
        return String(val);
    }

    function fieldSpec(entry) {
        if (Array.isArray(entry)) return { path: entry[0], label: entry[1] };
        return entry || {};
    }

    function renderRows(rows, host) {
        rows.forEach(function (row) {
            if (!row.value && row.value !== 0) return;
            var wrap = document.createElement('div');
            wrap.className = 'life-field';
            var lab = document.createElement('div');
            lab.className = 'life-field-label';
            lab.textContent = row.label;
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
                        label: spec.label,
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
                label: spec.label,
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
        if (titleEl) titleEl.textContent = MSG.unknown;
        if (runBtn) runBtn.disabled = true;
        if (errorEl) {
            errorEl.textContent = MSG.unknown;
            errorEl.classList.add('show');
        }
        return;
    }

    var item = hit.item;
    if (titleEl) titleEl.textContent = item.title || MSG.unknown;
    if (descEl) descEl.textContent = MSG.desc;
    document.title = (item.title || MSG.unknown) + ' - ' + MSG.pageSuffix;

    if (item.input && inputWrap && inputEl) {
        inputWrap.hidden = false;
        inputEl.placeholder = item.input.placeholder || MSG.defaultPlaceholder;
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
            setError(MSG.empty);
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
                if (r.value) parts.push(r.label + '：' + r.value.replace(/<[^>]+>/g, ''));
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

    function detailMessage(data, fallback, status) {
        var d = data && data.detail;
        if (typeof d === 'string' && d) return d;
        if (Array.isArray(d) && d.length) {
            return d.map(function (x) { return (x && x.msg) || String(x); }).join('; ');
        }
        if (status === 502 || status === 504) return MSG.upstreamFail;
        if (status === 503) return MSG.notConfigured;
        return (data && (data.msg || data.message)) || fallback || MSG.fetchFail;
    }

    function run() {
        setError('');
        var q = {};
        if (item.input) {
            var v = (inputEl.value || '').trim();
            if (!v && !item.input.optional) {
                setError(MSG.needKeyword);
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
            return res.text().then(function (text) {
                var data = {};
                try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
                if (!res.ok) {
                    throw new Error(detailMessage(data, res.statusText, res.status));
                }
                showResult(data.result);
            });
        }).catch(function (err) {
            setError(err.message || MSG.fetchFail);
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
                    copyBtn.textContent = MSG.copied;
                    setTimeout(function () { copyBtn.textContent = MSG.copy; }, 1200);
                });
            }
        });
    }
    if (inputEl) {
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') run();
        });
    }

    // 不自动请求：避免一进页卡住「加载中」；用户点「查询」再拉
})();
