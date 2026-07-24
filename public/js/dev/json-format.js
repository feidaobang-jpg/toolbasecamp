document.addEventListener('DOMContentLoaded', function () {
    var jsonInput = document.getElementById('json-input');
    var formatBtn = document.getElementById('format-btn');
    var minifyBtn = document.getElementById('minify-btn');
    var clearBtn = document.getElementById('clear-btn');
    var copyBtn = document.getElementById('copy-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultText = document.getElementById('result-text');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function process(pretty) {
        showError('');
        var raw = jsonInput.value.trim();
        if (!raw) {
            showError(tr('tools.jsonFormat.needInput'));
            resultWrap.hidden = true;
            return;
        }
        try {
            var parsed = JSON.parse(raw);
            resultText.textContent = pretty
                ? JSON.stringify(parsed, null, 2)
                : JSON.stringify(parsed);
            resultWrap.hidden = false;
        } catch (e) {
            showError(tr('tools.jsonFormat.parseError', { message: e.message }));
            resultWrap.hidden = true;
        }
    }

    function clearAll() {
        jsonInput.value = '';
        showError('');
        resultWrap.hidden = true;
        resultText.textContent = '';
        jsonInput.focus();
    }

    function copyResult() {
        var text = resultText.textContent;
        if (!text) {
            showError(tr('tools.jsonFormat.nothingToCopy'));
            return;
        }
        navigator.clipboard.writeText(text).then(function () {
            showError('');
            copyBtn.textContent = tr('tools.jsonFormat.copyDone');
            setTimeout(function () {
                copyBtn.textContent = tr('tools.jsonFormat.copy');
            }, 1500);
        }).catch(function () {
            showError(tr('tools.jsonFormat.copyFailed'));
        });
    }

    formatBtn.addEventListener('click', function () { process(true); });
    minifyBtn.addEventListener('click', function () { process(false); });
    clearBtn.addEventListener('click', clearAll);
    copyBtn.addEventListener('click', copyResult);
});
