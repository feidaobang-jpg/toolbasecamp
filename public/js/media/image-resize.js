document.addEventListener('DOMContentLoaded', function () {
    function tr(key, params) {
        return typeof t === 'function' ? t(key, params) : key;
    }

    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var sourceWrap = document.getElementById('source-wrap');
    var sourceImg = document.getElementById('source-img');
    var sourceMeta = document.getElementById('source-meta');
    var controls = document.getElementById('controls');
    var widthInput = document.getElementById('width-input');
    var heightInput = document.getElementById('height-input');
    var lockRatio = document.getElementById('lock-ratio');
    var formatSelect = document.getElementById('format-select');
    var rotateBtn = document.getElementById('rotate-btn');
    var exportBtn = document.getElementById('export-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var previewImg = document.getElementById('preview-img');

    var state = {
        image: null,
        naturalW: 0,
        naturalH: 0,
        angle: 0,
        filling: false
    };

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function setBusy(hasImage) {
        rotateBtn.disabled = !hasImage;
        exportBtn.disabled = !hasImage;
        controls.hidden = !hasImage;
        sourceWrap.hidden = !hasImage;
        dropZone.hidden = hasImage;
    }

    function displaySize() {
        var rotated = state.angle % 180 !== 0;
        return {
            w: rotated ? state.naturalH : state.naturalW,
            h: rotated ? state.naturalW : state.naturalH
        };
    }

    function syncInputsFromNatural() {
        var sz = displaySize();
        state.filling = true;
        widthInput.value = String(sz.w);
        heightInput.value = String(sz.h);
        state.filling = false;
        sourceMeta.textContent = tr('tools.imageResize.meta', {
            width: sz.w,
            height: sz.h
        });
    }

    function loadFile(file) {
        if (!file || !file.type || file.type.indexOf('image/') !== 0) {
            setError(tr('tools.imageResize.invalidFile'));
            return;
        }
        setError('');
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            state.image = img;
            state.naturalW = img.naturalWidth;
            state.naturalH = img.naturalHeight;
            state.angle = 0;
            sourceImg.src = url;
            if (file.type === 'image/png') formatSelect.value = 'image/png';
            else if (file.type === 'image/webp') formatSelect.value = 'image/webp';
            else formatSelect.value = 'image/jpeg';
            syncInputsFromNatural();
            setBusy(true);
            previewWrap.hidden = true;
        };
        img.onerror = function () {
            setError(tr('tools.imageResize.loadFailed'));
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function renderToCanvas(outW, outH) {
        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.save();
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate((state.angle * Math.PI) / 180);
        var drawW = state.angle % 180 === 0 ? outW : outH;
        var drawH = state.angle % 180 === 0 ? outH : outW;
        ctx.drawImage(state.image, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        return canvas;
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
        fileInput.value = '';
    });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
        e.preventDefault();
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
    });

    widthInput.addEventListener('input', function () {
        if (state.filling || !lockRatio.checked || !state.image) return;
        var w = parseInt(widthInput.value, 10);
        if (!(w > 0)) return;
        var sz = displaySize();
        var h = Math.max(1, Math.round((w * sz.h) / sz.w));
        state.filling = true;
        heightInput.value = String(h);
        state.filling = false;
    });
    heightInput.addEventListener('input', function () {
        if (state.filling || !lockRatio.checked || !state.image) return;
        var h = parseInt(heightInput.value, 10);
        if (!(h > 0)) return;
        var sz = displaySize();
        var w = Math.max(1, Math.round((h * sz.w) / sz.h));
        state.filling = true;
        widthInput.value = String(w);
        state.filling = false;
    });

    rotateBtn.addEventListener('click', function () {
        if (!state.image) return;
        state.angle = (state.angle + 90) % 360;
        syncInputsFromNatural();
        previewWrap.hidden = true;
    });

    exportBtn.addEventListener('click', function () {
        if (!state.image) return;
        var w = parseInt(widthInput.value, 10);
        var h = parseInt(heightInput.value, 10);
        if (!(w > 0) || !(h > 0) || w > 10000 || h > 10000) {
            setError(tr('tools.imageResize.invalidSize'));
            return;
        }
        setError('');
        var canvas = renderToCanvas(w, h);
        var mime = formatSelect.value || 'image/jpeg';
        var quality = mime === 'image/jpeg' || mime === 'image/webp' ? 0.92 : undefined;
        var dataUrl = canvas.toDataURL(mime, quality);
        previewImg.src = dataUrl;
        previewWrap.hidden = false;
        var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'resized_' + w + 'x' + h + '_' + Date.now() + '.' + ext;
        a.click();
    });

    clearBtn.addEventListener('click', function () {
        state.image = null;
        state.naturalW = 0;
        state.naturalH = 0;
        state.angle = 0;
        sourceImg.removeAttribute('src');
        previewImg.removeAttribute('src');
        previewWrap.hidden = true;
        setBusy(false);
        setError('');
    });

    setBusy(false);
});
