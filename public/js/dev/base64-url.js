document.addEventListener('DOMContentLoaded', function () {
    var tabs = document.querySelectorAll('.tb-tab');
    var inputText = document.getElementById('input-text');
    var convertBtn = document.getElementById('convert-btn');
    var clearBtn = document.getElementById('clear-btn');
    var copyBtn = document.getElementById('copy-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultText = document.getElementById('result-text');

    var mode = 'b64enc';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function utf8ToBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function base64ToUtf8(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    function switchMode(next) {
        mode = next;
        tabs.forEach(function (tab) {
            tab.classList.toggle('active', tab.getAttribute('data-mode') === next);
        });
        showError('');
        resultWrap.hidden = true;
    }

    function convert() {
        showError('');
        var raw = inputText.value;
        if (!raw.trim()) {
            showError(tr('tools.base64Url.needInput'));
            resultWrap.hidden = true;
            return;
        }
        try {
            var out;
            if (mode === 'b64enc') out = utf8ToBase64(raw);
            else if (mode === 'b64dec') out = base64ToUtf8(raw.trim());
            else if (mode === 'urlenc') out = encodeURIComponent(raw);
            else out = decodeURIComponent(raw);
            resultText.textContent = out;
            resultWrap.hidden = false;
        } catch (e) {
            showError(tr('tools.base64Url.convertError', { message: e.message }));
            resultWrap.hidden = true;
        }
    }

    function clearAll() {
        inputText.value = '';
        showError('');
        resultWrap.hidden = true;
        resultText.textContent = '';
        inputText.focus();
    }

    function copyResult() {
        var text = resultText.textContent;
        if (!text) {
            showError(tr('tools.base64Url.nothingToCopy'));
            return;
        }
        navigator.clipboard.writeText(text).then(function () {
            showError('');
            copyBtn.textContent = tr('tools.base64Url.copyDone');
            setTimeout(function () {
                copyBtn.textContent = tr('tools.base64Url.copy');
            }, 1500);
        }).catch(function () {
            showError(tr('tools.base64Url.copyFailed'));
        });
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchMode(tab.getAttribute('data-mode'));
        });
    });
    convertBtn.addEventListener('click', convert);
    clearBtn.addEventListener('click', clearAll);
    copyBtn.addEventListener('click', copyResult);
});
