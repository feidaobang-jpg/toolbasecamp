document.addEventListener('DOMContentLoaded', function () {
    function tr(key) {
        return typeof t === 'function' ? t(key) : key;
    }

    var STYLES = {
        money_yellow: { text: '#ffff00', outline: '#000000', shadow: false, banner: false },
        money_red_bg: { text: '#ffffff', outline: null, shadow: false, banner: true, bannerBg: '#ff0000' },
        tech_basic: { text: '#ffffff', outline: '#000000', shadow: true, banner: false },
        tech_blue: { text: '#ffffff', outline: '#0055ff', shadow: false, banner: false },
        price_green: { text: '#00ff00', outline: '#000000', shadow: false, banner: false }
    };

    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var focusWrap = document.getElementById('focus-wrap');
    var focusContainer = document.getElementById('focus-container');
    var previewImg = document.getElementById('preview-img');
    var focusMarker = document.getElementById('focus-marker');
    var reselectBtn = document.getElementById('reselect-btn');
    var titleInput = document.getElementById('title-input');
    var charCount = document.getElementById('char-count');
    var fontSizeInput = document.getElementById('font-size-input');
    var generateBtn = document.getElementById('generate-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultSection = document.getElementById('result-section');
    var result916 = document.getElementById('result-916');
    var result169 = document.getElementById('result-169');
    var dl916 = document.getElementById('dl-916');
    var dl169 = document.getElementById('dl-169');

    var sourceImage = null;
    var focusPoint = { x: 0.5, y: 0.5 };
    var dragging = false;
    var data916 = '';
    var data169 = '';

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function selectedStyle() {
        var el = document.querySelector('input[name="cover-style"]:checked');
        return (el && el.value) || 'money_yellow';
    }

    function updateFocus(clientX, clientY) {
        var rect = previewImg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        var y = Math.max(0, Math.min(clientY - rect.top, rect.height));
        focusPoint.x = x / rect.width;
        focusPoint.y = y / rect.height;
        focusMarker.hidden = false;
        focusMarker.style.left = (focusPoint.x * 100) + '%';
        focusMarker.style.top = (focusPoint.y * 100) + '%';
    }

    function loadFile(file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            setError(tr('tools.coverMaker.invalidFile'));
            return;
        }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            sourceImage = img;
            previewImg.src = url;
            dropZone.hidden = true;
            focusWrap.hidden = false;
            focusPoint = { x: 0.5, y: 0.5 };
            focusMarker.hidden = true;
            setError('');
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            setError(tr('tools.coverMaker.loadFailed'));
        };
        img.src = url;
    }

    function cropToRatio(img, ratioW, ratioH, fx, fy) {
        var tw = img.naturalWidth;
        var th = img.naturalHeight;
        var target = ratioW / ratioH;
        var srcRatio = tw / th;
        var sx = 0;
        var sy = 0;
        var sw = tw;
        var sh = th;
        if (srcRatio > target) {
            sw = Math.round(th * target);
            var cx = Math.round(tw * fx);
            sx = cx - Math.floor(sw / 2);
            if (sx < 0) sx = 0;
            if (sx + sw > tw) sx = tw - sw;
        } else {
            sh = Math.round(tw / target);
            var cy = Math.round(th * fy);
            sy = cy - Math.floor(sh / 2);
            if (sy < 0) sy = 0;
            if (sy + sh > th) sy = th - sh;
        }
        return { sx: sx, sy: sy, sw: sw, sh: sh };
    }

    function wrapLines(ctx, text, maxWidth) {
        var lines = [];
        var current = '';
        for (var i = 0; i < text.length; i++) {
            var test = current + text[i];
            if (current && ctx.measureText(test).width > maxWidth) {
                lines.push(current);
                current = text[i];
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        return lines.length ? lines : [''];
    }

    function drawCover(img, title, styleKey, ratioW, ratioH, fontSize) {
        var outW = ratioW === 9 ? 1080 : 1920;
        var outH = ratioW === 9 ? 1920 : 1080;
        var crop = cropToRatio(img, ratioW, ratioH, focusPoint.x, focusPoint.y);
        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outW, outH);

        var style = STYLES[styleKey] || STYLES.money_yellow;
        var fontFamily = '"Microsoft YaHei","PingFang SC","Noto Sans SC",Arial,sans-serif';
        ctx.font = 'bold ' + fontSize + 'px ' + fontFamily;
        ctx.textBaseline = 'alphabetic';

        var marginX = Math.round(outW * 0.1);
        var maxTextW = outW - marginX * 2;
        var lines = wrapLines(ctx, title, maxTextW);
        var lineSpacing = Math.max(6, Math.round(fontSize * 0.15));
        var metrics = lines.map(function (ln) {
            var m = ctx.measureText(ln);
            var ascent = m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent : fontSize * 0.8;
            var descent = m.actualBoundingBoxDescent != null ? m.actualBoundingBoxDescent : fontSize * 0.2;
            return { w: m.width, h: ascent + descent, ascent: ascent };
        });
        var totalH = 0;
        var maxLineW = 0;
        metrics.forEach(function (m, i) {
            totalH += m.h + (i ? lineSpacing : 0);
            if (m.w > maxLineW) maxLineW = m.w;
        });
        var startY = Math.round((outH - totalH) / 2);

        if (style.banner) {
            var pad = Math.round(fontSize * 0.2);
            ctx.fillStyle = style.bannerBg;
            ctx.fillRect(
                Math.round((outW - maxLineW) / 2) - pad,
                startY - pad,
                maxLineW + pad * 2,
                totalH + pad * 2
            );
        }

        var outlineW = Math.max(2, Math.round(fontSize / 30));
        var shadowOff = Math.max(4, Math.round(fontSize / 25));
        var yCursor = startY;

        lines.forEach(function (ln, idx) {
            var m = metrics[idx];
            var x = Math.round((outW - m.w) / 2);
            var y = yCursor + m.ascent;

            if (style.shadow) {
                ctx.fillStyle = 'rgba(0,0,0,0.63)';
                ctx.fillText(ln, x + shadowOff, y + shadowOff);
            }
            if (style.outline) {
                ctx.fillStyle = style.outline;
                for (var ox = -outlineW; ox <= outlineW; ox++) {
                    for (var oy = -outlineW; oy <= outlineW; oy++) {
                        if (ox * ox + oy * oy <= outlineW * outlineW) {
                            ctx.fillText(ln, x + ox, y + oy);
                        }
                    }
                }
            }
            ctx.fillStyle = style.text;
            ctx.fillText(ln, x, y);
            yCursor += m.h + lineSpacing;
        });

        return canvas.toDataURL('image/png');
    }

    function generate() {
        if (!sourceImage) {
            setError(tr('tools.coverMaker.needImage'));
            return;
        }
        var title = (titleInput.value || '').trim();
        if (!title) {
            setError(tr('tools.coverMaker.needTitle'));
            titleInput.focus();
            return;
        }
        var fontSize = parseInt(fontSizeInput.value, 10);
        if (!Number.isFinite(fontSize)) fontSize = 140;
        fontSize = Math.max(20, Math.min(fontSize, 400));
        var style = selectedStyle();

        data916 = drawCover(sourceImage, title, style, 9, 16, fontSize);
        data169 = drawCover(sourceImage, title, style, 16, 9, fontSize);
        result916.src = data916;
        result169.src = data169;
        resultSection.hidden = false;
        setError('');
        requestAnimationFrame(function () {
            var scroller = document.querySelector('.content') || document.scrollingElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        });
    }

    function download(dataUrl, name) {
        if (!dataUrl) return;
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        a.click();
    }

    function clearAll() {
        sourceImage = null;
        focusPoint = { x: 0.5, y: 0.5 };
        data916 = '';
        data169 = '';
        fileInput.value = '';
        titleInput.value = '';
        charCount.textContent = '0';
        fontSizeInput.value = '140';
        var def = document.querySelector('input[name="cover-style"][value="money_yellow"]');
        if (def) def.checked = true;
        previewImg.removeAttribute('src');
        focusMarker.hidden = true;
        focusWrap.hidden = true;
        dropZone.hidden = false;
        resultSection.hidden = true;
        result916.removeAttribute('src');
        result169.removeAttribute('src');
        setError('');
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    reselectBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });

    focusContainer.addEventListener('mousedown', function (e) {
        dragging = true;
        updateFocus(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
        if (dragging) updateFocus(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function () { dragging = false; });
    focusContainer.addEventListener('touchstart', function (e) {
        if (!e.touches[0]) return;
        e.preventDefault();
        updateFocus(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    focusContainer.addEventListener('touchmove', function (e) {
        if (!e.touches[0]) return;
        e.preventDefault();
        updateFocus(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    titleInput.addEventListener('input', function () {
        charCount.textContent = String((titleInput.value || '').length);
    });
    generateBtn.addEventListener('click', generate);
    clearBtn.addEventListener('click', clearAll);
    dl916.addEventListener('click', function () { download(data916, 'cover_9_16.png'); });
    dl169.addEventListener('click', function () { download(data169, 'cover_16_9.png'); });
});
