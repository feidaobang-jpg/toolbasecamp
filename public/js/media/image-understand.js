(function () {
    'use strict';
    var C = window.TBImageCloud;
    if (!C) return;

    var T2I_PROMPT_KEY = 'tbc_t2i_prompt_v1';
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var sourceWrap = document.getElementById('source-wrap');
    var sourceImg = document.getElementById('source-img');
    var modeRow = document.getElementById('mode-row');
    var runBtn = document.getElementById('run-btn');
    var copyBtn = document.getElementById('copy-btn');
    var t2iBtn = document.getElementById('t2i-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var result = document.getElementById('result');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');
    var file = null;
    var previewUrl = '';
    var processing = false;
    var mode = 'brief';

    if (loginLink) loginLink.href = C.loginUrl();

    function currentLocale() {
        try {
            if (typeof window.tbGetLocale === 'function') return String(window.tbGetLocale() || 'zh-CN');
        } catch (e) { /* ignore */ }
        try {
            var lang = (document.documentElement.lang || '').toLowerCase();
            if (lang.indexOf('zh') === 0) return 'zh-CN';
        } catch (e2) { /* ignore */ }
        return 'zh-CN';
    }

    function syncModeChips() {
        if (!modeRow) return;
        var chips = modeRow.querySelectorAll('.rec-chip');
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle('is-active', (chips[i].getAttribute('data-mode') || '') === mode);
        }
    }

    function setProcessing(on) {
        processing = !!on;
        C.setBusy(busyEl, busyText, processing, C.tr('tools.imageCloud.processing'));
        runBtn.disabled = processing || !file;
        clearBtn.disabled = processing;
        var hasText = !!(result.value || '').trim();
        copyBtn.disabled = processing || !hasText;
        t2iBtn.disabled = processing || !hasText;
        if (modeRow) {
            var chips = modeRow.querySelectorAll('.rec-chip');
            for (var i = 0; i < chips.length; i++) chips[i].disabled = processing;
        }
    }

    function loadStatus() {
        return C.apiJson('/image/status').then(function (s) {
            quotaLine.textContent = C.formatQuota(s.quotas, 'image_understand');
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        });
    }

    function setFile(f) {
        C.setError(errorBox, '');
        if (!f || !String(f.type || '').startsWith('image/')) {
            C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        runBtn.disabled = false;
        result.value = '';
        copyBtn.disabled = true;
        t2iBtn.disabled = true;
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) setFile(f);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
        fileInput.value = '';
    });

    if (modeRow) {
        modeRow.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.rec-chip') : null;
            if (!btn || btn.disabled) return;
            mode = btn.getAttribute('data-mode') || 'brief';
            syncModeChips();
        });
    }

    clearBtn.addEventListener('click', function () {
        file = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        sourceImg.removeAttribute('src');
        sourceWrap.hidden = true;
        runBtn.disabled = true;
        copyBtn.disabled = true;
        t2iBtn.disabled = true;
        result.value = '';
        C.setError(errorBox, '');
    });

    runBtn.addEventListener('click', function () {
        if (!file || processing) return;
        C.setError(errorBox, '');
        setProcessing(true);
        var fd = new FormData();
        fd.append('file', file, file.name || 'image.jpg');
        fd.append('mode', mode);
        fd.append('locale', currentLocale());
        C.apiJson('/image/image-understand', { method: 'POST', body: fd }).then(function (data) {
            result.value = data.text || '';
            if (data.quota) {
                quotaLine.textContent = C.formatQuotaItem(data.quota);
            } else {
                return loadStatus();
            }
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            setProcessing(false);
        });
    });

    copyBtn.addEventListener('click', function () {
        if (!result.value) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(result.value).catch(function () {
                result.select();
                document.execCommand('copy');
            });
        } else {
            result.select();
            document.execCommand('copy');
        }
    });

    t2iBtn.addEventListener('click', function () {
        var text = (result.value || '').trim();
        if (!text) return;
        try {
            localStorage.setItem(T2I_PROMPT_KEY, text);
        } catch (e) { /* ignore */ }
        var q = encodeURIComponent(text.slice(0, 1800));
        window.location.href = 'text-to-image.html?prompt=' + q;
    });

    document.addEventListener('tb:locale', function () {
        syncModeChips();
        if (file) {
            /* keep status line language-fresh if already loaded */
        }
    });

    syncModeChips();
    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
