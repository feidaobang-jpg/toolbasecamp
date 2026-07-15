(function () {
    'use strict';
    var C = window.TBImageCloud;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var sourceWrap = document.getElementById('source-wrap');
    var sourceImg = document.getElementById('source-img');
    var runBtn = document.getElementById('run-btn');
    var copyBtn = document.getElementById('copy-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var result = document.getElementById('result');
    var file = null;
    var previewUrl = '';

    if (loginLink) loginLink.href = C.loginUrl();

    function loadStatus() {
        return C.apiJson('/image/status').then(function (s) {
            quotaLine.textContent = C.formatQuota(s.quotas, 'ocr_table');
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

    clearBtn.addEventListener('click', function () {
        file = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        sourceImg.removeAttribute('src');
        sourceWrap.hidden = true;
        runBtn.disabled = true;
        copyBtn.disabled = true;
        result.value = '';
        C.setError(errorBox, '');
    });

    runBtn.addEventListener('click', function () {
        if (!file) return;
        C.setError(errorBox, '');
        runBtn.disabled = true;
        var fd = new FormData();
        fd.append('file', file, file.name || 'image.jpg');
        C.apiJson('/image/ocr-table', { method: 'POST', body: fd }).then(function (data) {
            result.value = data.tsv || '';
            copyBtn.disabled = !result.value;
            if (!result.value) {
                C.setError(errorBox, C.tr('tools.ocrTable.empty'));
            }
            if (data.quota) {
                quotaLine.textContent = C.tr('tools.imageCloud.quotaLine', {
                    used: data.quota.used,
                    limit: data.quota.limit,
                    remaining: data.quota.remaining
                });
            } else {
                return loadStatus();
            }
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            runBtn.disabled = !file;
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

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
