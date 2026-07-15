document.addEventListener('DOMContentLoaded', function () {
    function tr(key, params) {
        return typeof t === 'function' ? t(key, params) : key;
    }

    var contentEl = document.getElementById('qr-content');
    var sizeEl = document.getElementById('qr-size');
    var canvas = document.getElementById('qr-canvas');
    var previewWrap = document.getElementById('preview-wrap');
    var errorBox = document.getElementById('error-box');
    var generateBtn = document.getElementById('generate-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var lastDataUrl = '';

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function generate() {
        var text = (contentEl.value || '').trim();
        if (!text) {
            setError(tr('tools.qrCode.emptyContent'));
            return;
        }
        if (typeof QRCode === 'undefined') {
            setError(tr('tools.qrCode.libFailed'));
            return;
        }
        var size = parseInt(sizeEl.value, 10) || 280;
        setError('');
        QRCode.toCanvas(canvas, text, {
            width: size,
            margin: 2,
            errorCorrectionLevel: 'M'
        }, function (err) {
            if (err) {
                setError(tr('tools.qrCode.generateFailed'));
                previewWrap.hidden = true;
                downloadBtn.disabled = true;
                return;
            }
            lastDataUrl = canvas.toDataURL('image/png');
            previewWrap.hidden = false;
            downloadBtn.disabled = false;
        });
    }

    generateBtn.addEventListener('click', generate);
    clearBtn.addEventListener('click', function () {
        contentEl.value = '';
        lastDataUrl = '';
        previewWrap.hidden = true;
        downloadBtn.disabled = true;
        setError('');
    });
    downloadBtn.addEventListener('click', function () {
        if (!lastDataUrl) return;
        var a = document.createElement('a');
        a.href = lastDataUrl;
        a.download = 'qrcode_' + Date.now() + '.png';
        a.click();
    });
});
