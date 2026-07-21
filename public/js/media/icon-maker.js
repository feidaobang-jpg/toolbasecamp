document.addEventListener('DOMContentLoaded', function () {
    function tr(key, params) {
        return typeof t === 'function' ? t(key, params) : key;
    }

    var BG = {
        blue: '#2563eb',
        red: '#dc2626',
        green: '#16a34a',
        black: '#111827'
    };

    var textInput = document.getElementById('text-input');
    var sizeInput = document.getElementById('size-input');
    var fontSizeInput = document.getElementById('font-size-input');
    var radiusInput = document.getElementById('corner-radius-input');
    var generateBtn = document.getElementById('generate-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultSection = document.getElementById('result-section');
    var resultImg = document.getElementById('result-img');
    var resultSize = document.getElementById('result-size');
    var lastDataUrl = '';

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function selectedBg() {
        var el = document.querySelector('input[name="bg-color"]:checked');
        return (el && el.value) || 'blue';
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function measure(ctx, ch) {
        var m = ctx.measureText(ch);
        var w = m.width;
        var ascent = m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent : 0;
        var descent = m.actualBoundingBoxDescent != null ? m.actualBoundingBoxDescent : 0;
        var h = ascent + descent;
        if (!h) h = parseInt(ctx.font, 10) || 16;
        return { w: w, h: h, ascent: ascent || h * 0.8 };
    }

    function generateIcon() {
        var text = (textInput.value || '').trim();
        if (!text) {
            setError(tr('tools.iconMaker.needText'));
            textInput.focus();
            return;
        }

        var size = parseInt(sizeInput.value, 10);
        if (!Number.isFinite(size)) size = 100;
        size = Math.max(16, Math.min(size, 1024));

        var corner = parseInt(radiusInput.value, 10);
        if (!Number.isFinite(corner)) corner = 0;
        corner = Math.max(0, Math.min(corner, Math.floor(size / 2)));

        var fontSize = parseInt(fontSizeInput.value, 10);
        if (!Number.isFinite(fontSize)) fontSize = Math.round(size * 0.42);
        fontSize = Math.max(8, Math.min(fontSize, size * 4));

        var chars = [];
        for (var i = 0; i < text.length; i++) {
            if (text[i].trim()) chars.push(text[i]);
        }
        if (!chars.length) chars = [''];

        var n = chars.length;
        var rows = n <= 1 ? 1 : 2;
        var cols = Math.max(1, Math.ceil(n / rows));
        var pad = Math.max(4, Math.round(size * 0.06));
        var innerW = size - pad * 2;
        var innerH = size - pad * 2;
        var cellW = innerW / cols;
        var cellH = innerH / rows;

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');

        roundRectPath(ctx, 0, 0, size, size, corner);
        ctx.fillStyle = BG[selectedBg()] || BG.blue;
        ctx.fill();
        if (corner > 0) {
            ctx.save();
            roundRectPath(ctx, 0, 0, size, size, corner);
            ctx.clip();
        }

        var fontFamily = '"Microsoft YaHei","PingFang SC","Noto Sans SC",Arial,sans-serif';
        function fits(fs) {
            ctx.font = 'bold ' + fs + 'px ' + fontFamily;
            for (var c = 0; c < chars.length; c++) {
                var m = measure(ctx, chars[c]);
                if (m.w > cellW * 0.9 || m.h > cellH * 0.9) return false;
            }
            return true;
        }

        while (fontSize > 8 && !fits(fontSize)) fontSize -= 2;
        ctx.font = 'bold ' + fontSize + 'px ' + fontFamily;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'alphabetic';

        chars.forEach(function (ch, idx) {
            var row = Math.floor(idx / cols);
            var col = idx % cols;
            var m = measure(ctx, ch);
            var cx = pad + col * cellW + cellW / 2;
            var cy = pad + row * cellH + cellH / 2;
            var x = cx - m.w / 2;
            var y = cy - m.h / 2 + m.ascent;
            ctx.fillText(ch, x, y);
        });

        if (corner > 0) ctx.restore();

        lastDataUrl = canvas.toDataURL('image/png');
        resultImg.src = lastDataUrl;
        resultSize.textContent = size + ' × ' + size;
        resultSection.hidden = false;
        downloadBtn.disabled = false;
        setError('');
        requestAnimationFrame(function () {
            var scroller = document.querySelector('.content') || document.scrollingElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        });
    }

    function download() {
        if (!lastDataUrl) return;
        var a = document.createElement('a');
        a.href = lastDataUrl;
        a.download = 'icon.png';
        a.click();
    }

    function clearAll() {
        textInput.value = '';
        sizeInput.value = '100';
        fontSizeInput.value = '50';
        radiusInput.value = '0';
        var blue = document.querySelector('input[name="bg-color"][value="blue"]');
        if (blue) blue.checked = true;
        lastDataUrl = '';
        resultImg.removeAttribute('src');
        resultSection.hidden = true;
        downloadBtn.disabled = true;
        setError('');
    }

    generateBtn.addEventListener('click', generateIcon);
    downloadBtn.addEventListener('click', download);
    clearBtn.addEventListener('click', clearAll);
    textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') generateIcon();
    });
});
