(function () {
    'use strict';

    var frame = document.getElementById('drawio-frame');
    var errorBox = document.getElementById('drawio-error');
    if (!frame) return;

    function tr(key) {
        return typeof window.t === 'function' ? window.t(key) : key;
    }

    function localeCode() {
        var lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
        return lang.startsWith('zh') ? 'zh' : 'en';
    }

    function showError(msg) {
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.classList.add('is-visible');
    }

    function hideError() {
        if (!errorBox) errorBox = document.getElementById('drawio-error');
        if (!errorBox) return;
        errorBox.textContent = '';
        errorBox.classList.remove('is-visible');
    }

    function buildEmbedUrl() {
        var params = [
            'embed=1',
            'ui=atlas',
            'spin=0',
            'offline=1',
            'local=1',
            'stealth=1',
            'modified=unsavedChanges',
            'proto=json',
            'noSaveBtn=1',
            'saveAndExit=0',
            'lang=' + encodeURIComponent(localeCode())
        ];
        return '/drawio/?' + params.join('&');
    }

    function loadFrame() {
        hideError();
        frame.removeAttribute('data-loaded');
        frame.src = buildEmbedUrl();
    }

    frame.addEventListener('load', function () {
        frame.setAttribute('data-loaded', '1');
        hideError();
    });

    setTimeout(function () {
        if (frame.getAttribute('data-loaded') === '1') return;
        fetch('/drawio/index.html', { method: 'HEAD', cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) {
                    showError(tr('tools.flowchart.loadError'));
                }
            })
            .catch(function () {
                showError(tr('tools.flowchart.loadError'));
            });
    }, 12000);

    loadFrame();

    document.addEventListener('tb:locale', loadFrame);
})();
