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
    var scaleField = document.getElementById('scale-field');
    var scaleInput = document.getElementById('scale-input');
    var scaleVal = document.getElementById('scale-val');
    var dragHint = document.getElementById('drag-hint');
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
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');

    var file = null;
    var previewUrl = '';
    var cutoutImg = null;
    var bgColor = '#2072EF';
    /** @type {{ x: number, y: number, w: number, h: number } | null} */
    var layout = null;
    var drag = null;
    var processing = false;

    if (loginLink) loginLink.href = C.loginUrl();

    function setProcessing(on) {
        processing = !!on;
        C.setBusy(busyEl, busyText, processing, C.tr('tools.imageCloud.processing'));
        runBtn.disabled = processing || !file;
        clearBtn.disabled = processing;
        downloadBtn.disabled = processing || !cutoutImg;
        if (scaleInput) scaleInput.disabled = processing;
        if (sizeSelect) sizeSelect.disabled = processing;
    }

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

    function scalePct() {
        return Math.max(0, Math.min(100, parseInt(scaleInput.value, 10) || 0));
    }

    function defaultLayout(canvasSize) {
        var pct = scalePct() / 100;
        var fit = Math.min(canvasSize.w / cutoutImg.width, canvasSize.h / cutoutImg.height);
        var w = cutoutImg.width * fit * pct;
        var h = cutoutImg.height * fit * pct;
        if (pct === 0) {
            w = 0;
            h = 0;
        }
        return {
            x: (canvasSize.w - w) / 2,
            y: (canvasSize.h - h) / 2,
            w: w,
            h: h
        };
    }

    function applyScaleKeepCenter(canvasSize) {
        if (!cutoutImg) return;
        var cx;
        var cy;
        if (layout && layout.w > 0 && layout.h > 0) {
            cx = layout.x + layout.w / 2;
            cy = layout.y + layout.h / 2;
        } else {
            var d = defaultLayout(canvasSize);
            cx = d.x + d.w / 2;
            cy = d.y + d.h / 2;
        }
        var pct = scalePct() / 100;
        var fit = Math.min(canvasSize.w / cutoutImg.width, canvasSize.h / cutoutImg.height);
        var w = cutoutImg.width * fit * pct;
        var h = cutoutImg.height * fit * pct;
        if (pct === 0) {
            w = 0;
            h = 0;
        }
        layout = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
        clampLayout(canvasSize);
    }

    function clampLayout(canvasSize) {
        if (!layout || !(layout.w > 0)) return;
        layout.x = Math.min(canvasSize.w - layout.w, Math.max(0, layout.x));
        layout.y = Math.min(canvasSize.h - layout.h, Math.max(0, layout.y));
    }

    function compose() {
        if (!cutoutImg) return;
        var size = parseSize();
        canvas.width = size.w;
        canvas.height = size.h;
        scaleVal.textContent = scalePct() + '%';

        if (!layout) {
            layout = defaultLayout(size);
        }
        clampLayout(size);

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size.w, size.h);
        if (layout && layout.w > 0 && layout.h > 0) {
            ctx.drawImage(cutoutImg, layout.x, layout.y, layout.w, layout.h);
            if (drag) {
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2;
                ctx.strokeRect(layout.x, layout.y, layout.w, layout.h);
            }
        }
        previewWrap.hidden = false;
        scaleField.hidden = false;
        dragHint.hidden = false;
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
        layout = null;
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        controls.hidden = false;
        scaleField.hidden = true;
        dragHint.hidden = true;
        runBtn.disabled = false;
        downloadBtn.disabled = true;
        previewWrap.hidden = true;
        dropZone.hidden = true;
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

    sizeSelect.addEventListener('change', function () {
        layout = null;
        compose();
    });

    scaleInput.addEventListener('input', function () {
        if (!cutoutImg) return;
        applyScaleKeepCenter(parseSize());
        compose();
    });

    function canvasPoint(e) {
        var rect = canvas.getBoundingClientRect();
        var size = parseSize();
        var scaleX = size.w / rect.width;
        var scaleY = size.h / rect.height;
        var clientX = e.clientX;
        var clientY = e.clientY;
        if (e.touches && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function startDrag(e) {
        if (!cutoutImg || !layout || !(layout.w > 0)) return;
        var p = canvasPoint(e);
        if (p.x < layout.x || p.x > layout.x + layout.w || p.y < layout.y || p.y > layout.y + layout.h) {
            return;
        }
        e.preventDefault();
        drag = { ox: p.x - layout.x, oy: p.y - layout.y };
        canvas.classList.add('is-dragging');
        compose();
    }

    function moveDrag(e) {
        if (!drag || !layout) return;
        e.preventDefault();
        var p = canvasPoint(e);
        var size = parseSize();
        layout.x = p.x - drag.ox;
        layout.y = p.y - drag.oy;
        clampLayout(size);
        compose();
    }

    function endDrag() {
        if (!drag) return;
        drag = null;
        canvas.classList.remove('is-dragging');
        compose();
    }

    canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    canvas.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);

    clearBtn.addEventListener('click', function () {
        file = null;
        cutoutImg = null;
        layout = null;
        drag = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        sourceImg.removeAttribute('src');
        sourceWrap.hidden = true;
        controls.hidden = true;
        scaleField.hidden = true;
        dragHint.hidden = true;
        previewWrap.hidden = true;
        dropZone.hidden = false;
        runBtn.disabled = true;
        downloadBtn.disabled = true;
        scaleInput.value = '100';
        scaleVal.textContent = '100%';
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
                    layout = null;
                    scaleInput.value = '100';
                    compose();
                    resolve();
                };
                img.onerror = function () { reject(new Error(C.tr('tools.idPhoto.loadFailed'))); };
                img.src = C.b64ToObjectUrl(data.imageBase64, data.contentType || 'image/png');
            });
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            setProcessing(false);
        });
    });

    downloadBtn.addEventListener('click', function () {
        if (!cutoutImg) return;
        // redraw without selection stroke
        var wasDrag = drag;
        drag = null;
        compose();
        canvas.toBlob(function (blob) {
            drag = wasDrag;
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
