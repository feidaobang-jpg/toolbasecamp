document.addEventListener('DOMContentLoaded', function () {
    function tr(key) {
        return typeof t === 'function' ? t(key) : key;
    }

    var frontInput = document.getElementById('front-input');
    var backInput = document.getElementById('back-input');
    var halfSize = document.getElementById('half-size');
    var wmText = document.getElementById('wm-text');
    var renderBtn = document.getElementById('render-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var canvas = document.getElementById('sheet-canvas');
    var lastUrl = '';

    var frontImg = null;
    var backImg = null;

    // A4 at ~150 DPI
    var PAGE_W = 1240;
    var PAGE_H = 1754;

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function loadInput(input, assign) {
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (!file) return;
            if (!file.type || file.type.indexOf('image/') !== 0) {
                setError(tr('tools.idCardCopy.invalidFile'));
                return;
            }
            setError('');
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { assign(img); };
            img.onerror = function () { setError(tr('tools.idCardCopy.loadFailed')); };
            img.src = url;
        });
    }

    loadInput(frontInput, function (img) { frontImg = img; });
    loadInput(backInput, function (img) { backImg = img; });

    function drawContained(ctx, img, boxX, boxY, boxW, boxH) {
        var ratio = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
        var w = img.naturalWidth * ratio;
        var h = img.naturalHeight * ratio;
        var x = boxX + (boxW - w) / 2;
        var y = boxY + (boxH - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
    }

    function drawWatermark(ctx, text) {
        if (!text) return;
        ctx.save();
        ctx.translate(PAGE_W / 2, PAGE_H / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.font = 'bold 64px sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var y = -PAGE_H; y < PAGE_H; y += 180) {
            for (var x = -PAGE_W; x < PAGE_W; x += 320) {
                ctx.fillText(text, x, y);
            }
        }
        ctx.restore();
    }

    renderBtn.addEventListener('click', function () {
        if (!frontImg) {
            setError(tr('tools.idCardCopy.needFront'));
            return;
        }
        setError('');
        canvas.width = PAGE_W;
        canvas.height = PAGE_H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);

        var margin = 72;
        var gap = 48;
        var half = halfSize.checked;
        var colW = PAGE_W - margin * 2;
        var rowH = half
            ? (PAGE_H - margin * 2 - gap) / 2
            : Math.min((PAGE_H - margin * 2 - gap) / 2, colW * 0.63);

        drawContained(ctx, frontImg, margin, margin, colW, rowH);
        if (backImg) {
            drawContained(ctx, backImg, margin, margin + rowH + gap, colW, rowH);
        }

        drawWatermark(ctx, (wmText.value || '').trim());
        lastUrl = canvas.toDataURL('image/png');
        previewWrap.hidden = false;
        downloadBtn.disabled = false;
    });

    downloadBtn.addEventListener('click', function () {
        if (!lastUrl) return;
        var a = document.createElement('a');
        a.href = lastUrl;
        a.download = 'id_card_copy_' + Date.now() + '.png';
        a.click();
    });

    clearBtn.addEventListener('click', function () {
        frontImg = null;
        backImg = null;
        frontInput.value = '';
        backInput.value = '';
        lastUrl = '';
        previewWrap.hidden = true;
        downloadBtn.disabled = true;
        setError('');
    });
});
