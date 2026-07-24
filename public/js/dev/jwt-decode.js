document.addEventListener('DOMContentLoaded', function () {
    var jwtInput = document.getElementById('jwt-input');
    var decodeBtn = document.getElementById('decode-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultHeader = document.getElementById('result-header');
    var resultPayload = document.getElementById('result-payload');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function base64UrlDecode(str) {
        var s = str.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        var json = decodeURIComponent(escape(atob(s)));
        return JSON.parse(json);
    }

    function pretty(obj) {
        return JSON.stringify(obj, null, 2);
    }

    function decode() {
        showError('');
        var raw = jwtInput.value.trim().replace(/^Bearer\s+/i, '');
        if (!raw) {
            showError(tr('tools.jwtDecode.needJwt'));
            resultWrap.hidden = true;
            return;
        }
        var parts = raw.split('.');
        if (parts.length < 2) {
            showError(tr('tools.jwtDecode.invalidJwt'));
            resultWrap.hidden = true;
            return;
        }
        try {
            var header = base64UrlDecode(parts[0]);
            var payload = base64UrlDecode(parts[1]);
            resultHeader.textContent = pretty(header);
            resultPayload.textContent = pretty(payload);
            resultWrap.hidden = false;
        } catch (e) {
            showError(tr('tools.jwtDecode.decodeError', { message: e.message }));
            resultWrap.hidden = true;
        }
    }

    function clearAll() {
        jwtInput.value = '';
        showError('');
        resultWrap.hidden = true;
        resultHeader.textContent = '';
        resultPayload.textContent = '';
        jwtInput.focus();
    }

    decodeBtn.addEventListener('click', decode);
    clearBtn.addEventListener('click', clearAll);
});
