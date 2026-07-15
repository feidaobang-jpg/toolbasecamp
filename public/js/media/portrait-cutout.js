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
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var resultImg = document.getElementById('result-img');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');

    var file = null;
    var previewUrl = '';
    var resultUrl = '';
    var processing = false;

    if (loginLink) loginLink.href = C.loginUrl();

    function setProcessing(on) {
        processing = !!on;
        C.setBusy(busyEl, busyText, processing, C.tr('tools.imageCloud.processing'));
        runBtn.disabled = processing || !file;
        clearBtn.disabled = processing;
        downloadBtn.disabled = processing || !resultUrl;
    }

    function loadStatus() {
        return C.apiJson('/image/status').then(function (s) {
            quotaLine.textContent = C.formatQuota(s.quotas, 'id_photo');
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        });
    }

    function revokeResult() {
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = '';
        resultImg.removeAttribute('src');
        previewWrap.hidden = true;
        downloadBtn.disabled = true;
    }

    function setFile(f) {
        C.setError(errorBox, '');
        if (!f || !String(f.type || '').startsWith('image/')) {
            C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        revokeResult();
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        dropZone.hidden = true;
        runBtn.disabled = false;
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
        dropZone.hidden = false;
        revokeResult();
        runBtn.disabled = true;
        C.setError(errorBox, '');
    });

    runBtn.addEventListener('click', function () {
        if (!file || processing) return;
        C.setError(errorBox, '');
        setProcessing(true);
        var fd = new FormData();
        fd.append('file', file, file.name || 'portrait.jpg');
        C.apiJson('/image/id-photo/segment', { method: 'POST', body: fd }).then(function (data) {
            if (data.quota) {
                quotaLine.textContent = C.formatQuotaItem(data.quota);
            }
            revokeResult();
            resultUrl = C.b64ToObjectUrl(data.imageBase64, data.contentType || 'image/png');
            resultImg.src = resultUrl;
            previewWrap.hidden = false;
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            setProcessing(false);
        });
    });

    downloadBtn.addEventListener('click', function () {
        if (!resultUrl) return;
        var a = document.createElement('a');
        a.href = resultUrl;
        a.download = 'portrait_cutout_' + Date.now() + '.png';
        a.click();
    });

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
