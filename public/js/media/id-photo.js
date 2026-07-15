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
    var controls = document.getElementById('controls');
    var sizeSelect = document.getElementById('size-select');
    var swatches = document.getElementById('swatches');
    var runBtn = document.getElementById('run-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var canvas = document.getElementById('preview-canvas');
    var ctx = canvas.getContext('2d');
    var file = null;
    var previewUrl = '';
    var cutoutImg = null;
    var bgColor = '#2072EF';

    if (loginLink) loginLink.href = C.loginUrl();

    function loadStatus() {
        return C.apiJson('/image/status').then(function (s) {
            quotaLine.textContent = C.formatQuota(s.quotas, 'id_photo');
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        });
    }

    function parseSize() {
        var parts = String(sizeSelect.value || '295x413').split('x');
        return {
            w: Math.max(100, parseInt(parts[0], 10) || 295),
            h: Math.max(100, parseInt(parts[1], 10) || 413)
        };
    }

    function compose() {
        if (!cutoutImg) return;
        var size = parseSize();
        canvas.width = size.w;
        canvas.height = size.h;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size.w, size.h);
        var scale = Math.min(size.w / cutoutImg.width, size.h / cutoutImg.height);
        var dw = cutoutImg.width * scale;
        var dh = cutoutImg.height * scale;
        var dx = (size.w - dw) / 2;
        var dy = size.h - dh;
        ctx.drawImage(cutoutImg, dx, dy, dw, dh);
        previewWrap.hidden = false;
        downloadBtn.disabled = false;
    }

    function setFile(f) {
        C.setError(errorBox, '');
        if (!f || !String(f.type || '').startsWith('image/')) {
            C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        cutoutImg = null;
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        controls.hidden = false;
        runBtn.disabled = false;
        downloadBtn.disabled = true;
        previewWrap.hidden = true;
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

    swatches.addEventListener('click', function (e) {
        var btn = e.target.closest('.img-cloud-swatch');
        if (!btn) return;
        Array.prototype.forEach.call(swatches.querySelectorAll('.img-cloud-swatch'), function (el) {
            el.classList.toggle('is-active', el === btn);
        });
        bgColor = btn.getAttribute('data-color') || '#2072EF';
        compose();
    });

    sizeSelect.addEventListener('change', compose);

    clearBtn.addEventListener('click', function () {
        file = null;
        cutoutImg = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        sourceImg.removeAttribute('src');
        sourceWrap.hidden = true;
        controls.hidden = true;
        previewWrap.hidden = true;
        runBtn.disabled = true;
        downloadBtn.disabled = true;
        C.setError(errorBox, '');
    });

    runBtn.addEventListener('click', function () {
        if (!file) return;
        C.setError(errorBox, '');
        runBtn.disabled = true;
        var fd = new FormData();
        fd.append('file', file, file.name || 'portrait.jpg');
        C.apiJson('/image/id-photo/segment', { method: 'POST', body: fd }).then(function (data) {
            if (data.quota) {
                quotaLine.textContent = C.tr('tools.imageCloud.quotaLine', {
                    used: data.quota.used,
                    limit: data.quota.limit,
                    remaining: data.quota.remaining
                });
            }
            return new Promise(function (resolve, reject) {
                var img = new Image();
                img.onload = function () {
                    cutoutImg = img;
                    compose();
                    resolve();
                };
                img.onerror = function () { reject(new Error(C.tr('tools.idPhoto.loadFailed'))); };
                img.src = C.b64ToObjectUrl(data.imageBase64, data.contentType || 'image/png');
            });
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            runBtn.disabled = !file;
        });
    });

    downloadBtn.addEventListener('click', function () {
        if (!cutoutImg) return;
        canvas.toBlob(function (blob) {
            if (!blob) return;
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'id-photo.png';
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    });

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
