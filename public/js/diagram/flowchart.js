(function () {
    'use strict';

    var frame = document.getElementById('drawio-frame');
    if (!frame) return;

    function localeCode() {
        var lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
        return lang.startsWith('zh') ? 'zh' : 'en';
    }

    function buildEmbedUrl() {
        var params = [
            'embed=1',
            'ui=atlas',
            'spin=1',
            'modified=unsavedChanges',
            'proto=json',
            'noSaveBtn=1',
            'saveAndExit=0',
            'lang=' + encodeURIComponent(localeCode())
        ];
        return 'https://embed.diagrams.net/?' + params.join('&');
    }

    frame.src = buildEmbedUrl();

    document.addEventListener('tb:locale', function () {
        frame.src = buildEmbedUrl();
    });
})();
