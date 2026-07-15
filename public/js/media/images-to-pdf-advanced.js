(function () {
    'use strict';
    var C = window.TBImageCloud;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var thumbs = document.getElementById('thumbs');
    var convertBtn = document.getElementById('convert-btn');
    var clearBtn = document.getElementById('clear-btn');
    var removeShadow = document.getElementById('remove-shadow');
    var quotaLine = document.getElementById('quota-line');
    var tencentWarn = document.getElementById('tencent-warn');
    var errorBox = document.getElementById('error-box');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');
    var files = [];
    var MAX = 12;
    var processing = false;
    var tencentOk = false;

    if (loginLink) loginLink.href = C.loginUrl();

    function setProcessing(on) {
        processing = !!on;
        C.setBusy(busyEl, busyText, processing, C.tr('tools.imageCloud.processing'));
        convertBtn.disabled = processing || !files.length;
        clearBtn.disabled = processing;
        removeShadow.disabled = processing || !tencentOk;
    }

    function refreshQuota(status) {
        if (!status) return;
        quotaLine.textContent = C.formatQuota(status.quotas, 'to_pdf');
        tencentOk = !!status.tencentConfigured;
        if (tencentWarn) {
            tencentWarn.hidden = tencentOk;
            if (!tencentOk) removeShadow.checked = false;
        }
        removeShadow.disabled = processing || !tencentOk;
    }

    function loadStatus() {
        return C.apiJson('/image/status').then(refreshQuota).catch(function (err) {
            C.setError(errorBox, err.message);
        });
    }

    function renderThumbs() {
        thumbs.innerHTML = '';
        files.forEach(function (file, idx) {
            var wrap = document.createElement('div');
            wrap.className = 'img-cloud-thumb';
            var img = document.createElement('img');
            img.alt = '';
            img.src = URL.createObjectURL(file);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('aria-label', 'remove');
            btn.textContent = '×';
            btn.addEventListener('click', function () {
                files.splice(idx, 1);
                renderThumbs();
            });
            wrap.appendChild(img);
            wrap.appendChild(btn);
            thumbs.appendChild(wrap);
        });
        convertBtn.disabled = !files.length;
    }

    function addFiles(list) {
        C.setError(errorBox, '');
        Array.prototype.forEach.call(list || [], function (f) {
            if (!f || !String(f.type || '').startsWith('image/')) return;
            if (files.length >= MAX) return;
            files.push(f);
        });
        renderThumbs();
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        addFiles(e.dataTransfer && e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () {
        addFiles(fileInput.files);
        fileInput.value = '';
    });

    clearBtn.addEventListener('click', function () {
        files = [];
        renderThumbs();
        C.setError(errorBox, '');
    });

    convertBtn.addEventListener('click', function () {
        if (!files.length || processing) return;
        C.setError(errorBox, '');
        setProcessing(true);
        var fd = new FormData();
        files.forEach(function (f) { fd.append('files', f, f.name || 'image.jpg'); });
        fd.append('remove_shadow', removeShadow.checked ? 'true' : 'false');
        C.apiBlob('/image/to-pdf-advanced', { method: 'POST', body: fd }).then(function (res) {
            var url = URL.createObjectURL(res.blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'images_advanced.pdf';
            a.click();
            URL.revokeObjectURL(url);
            return loadStatus();
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            setProcessing(false);
        });
    });

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
