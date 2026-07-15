document.addEventListener('DOMContentLoaded', function () {
    function tr(key) {
        return typeof t === 'function' ? t(key) : key;
    }

    var frontInput = document.getElementById('front-input');
    var backInput = document.getElementById('back-input');
    var scaleInput = document.getElementById('scale-input');
    var scaleVal = document.getElementById('scale-val');
    var wmText = document.getElementById('wm-text');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var dragHint = document.getElementById('drag-hint');
    var canvas = document.getElementById('sheet-canvas');
    var ctx = canvas.getContext('2d');

    var PAGE_W = 1240;
    var PAGE_H = 1754;
    var MARGIN = 72;
    var GAP = 48;

    var front = null; // { img, url, x, y, w, h }
    var back = null;
    var drag = null; // { side, ox, oy }

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function scalePct() {
        return Math.max(0, Math.min(100, parseInt(scaleInput.value, 10) || 0));
    }

    function slotMaxSize() {
        var maxW = PAGE_W - MARGIN * 2;
        var maxH = (PAGE_H - MARGIN * 2 - GAP) / 2;
        return { maxW: maxW, maxH: maxH };
    }

    function sizedRect(img, cx, cy) {
        var slot = slotMaxSize();
        var pct = scalePct() / 100;
        var fit = Math.min(slot.maxW / img.naturalWidth, slot.maxH / img.naturalHeight);
        var w = Math.max(1, img.naturalWidth * fit * pct);
        var h = Math.max(1, img.naturalHeight * fit * pct);
        if (pct === 0) {
            w = 0;
            h = 0;
        }
        return {
            x: cx - w / 2,
            y: cy - h / 2,
            w: w,
            h: h
        };
    }

    function defaultCenter(side) {
        var midX = PAGE_W / 2;
        var topCy = MARGIN + slotMaxSize().maxH / 2;
        var botCy = PAGE_H - MARGIN - slotMaxSize().maxH / 2;
        return side === 'front' ? { cx: midX, cy: topCy } : { cx: midX, cy: botCy };
    }

    function applyScaleKeepCenter(item) {
        if (!item || !item.img) return;
        var cx = item.x + item.w / 2;
        var cy = item.y + item.h / 2;
        if (!(item.w > 0) || !(item.h > 0)) {
            var d = defaultCenter(item === front ? 'front' : 'back');
            cx = d.cx;
            cy = d.cy;
        }
        var r = sizedRect(item.img, cx, cy);
        item.x = r.x;
        item.y = r.y;
        item.w = r.w;
        item.h = r.h;
    }

    function clampItem(item) {
        if (!item || !(item.w > 0)) return;
        item.x = Math.min(PAGE_W - item.w, Math.max(0, item.x));
        item.y = Math.min(PAGE_H - item.h, Math.max(0, item.y));
    }

    function setItem(side, img, url) {
        var prev = side === 'front' ? front : back;
        if (prev && prev.url) URL.revokeObjectURL(prev.url);
        if (!img) {
            if (side === 'front') front = null;
            else back = null;
            return;
        }
        var d = defaultCenter(side);
        var r = sizedRect(img, d.cx, d.cy);
        var item = { img: img, url: url, x: r.x, y: r.y, w: r.w, h: r.h };
        if (side === 'front') front = item;
        else back = item;
    }

    function drawWatermark(text) {
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

    function drawItem(item, active) {
        if (!item || !(item.w > 0) || !(item.h > 0)) return;
        ctx.drawImage(item.img, item.x, item.y, item.w, item.h);
        ctx.strokeStyle = active ? '#2563eb' : '#cbd5e1';
        ctx.lineWidth = active ? 3 : 2;
        ctx.strokeRect(item.x, item.y, item.w, item.h);
    }

    function redraw() {
        scaleVal.textContent = scalePct() + '%';
        canvas.width = PAGE_W;
        canvas.height = PAGE_H;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);

        if (!front && !back) {
            previewWrap.hidden = true;
            downloadBtn.disabled = true;
            dragHint.hidden = true;
            return;
        }

        previewWrap.hidden = false;
        downloadBtn.disabled = !front;
        dragHint.hidden = !front;

        drawItem(front, drag && drag.side === 'front');
        drawItem(back, drag && drag.side === 'back');
        drawWatermark((wmText.value || '').trim());
    }

    function loadInput(input, side) {
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
            img.onload = function () {
                setItem(side, img, url);
                redraw();
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                setError(tr('tools.idCardCopy.loadFailed'));
            };
            img.src = url;
        });
    }

    loadInput(frontInput, 'front');
    loadInput(backInput, 'back');

    scaleInput.addEventListener('input', function () {
        applyScaleKeepCenter(front);
        applyScaleKeepCenter(back);
        clampItem(front);
        clampItem(back);
        redraw();
    });

    wmText.addEventListener('input', redraw);

    function canvasPoint(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = PAGE_W / rect.width;
        var scaleY = PAGE_H / rect.height;
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

    function hitTest(item, x, y) {
        return item && item.w > 0 && x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
    }

    function startDrag(e) {
        if (!front && !back) return;
        var p = canvasPoint(e);
        var side = null;
        var item = null;
        // Prefer topmost: back then front so front wins when overlapping
        if (hitTest(back, p.x, p.y)) {
            side = 'back';
            item = back;
        }
        if (hitTest(front, p.x, p.y)) {
            side = 'front';
            item = front;
        }
        if (!item) return;
        e.preventDefault();
        drag = { side: side, ox: p.x - item.x, oy: p.y - item.y };
        canvas.classList.add('is-dragging');
        redraw();
    }

    function moveDrag(e) {
        if (!drag) return;
        e.preventDefault();
        var item = drag.side === 'front' ? front : back;
        if (!item) return;
        var p = canvasPoint(e);
        item.x = p.x - drag.ox;
        item.y = p.y - drag.oy;
        clampItem(item);
        redraw();
    }

    function endDrag() {
        if (!drag) return;
        drag = null;
        canvas.classList.remove('is-dragging');
        redraw();
    }

    canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    canvas.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);

    downloadBtn.addEventListener('click', function () {
        if (!front) {
            setError(tr('tools.idCardCopy.needFront'));
            return;
        }
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'id_card_copy_' + Date.now() + '.png';
        a.click();
    });

    clearBtn.addEventListener('click', function () {
        setItem('front', null, '');
        setItem('back', null, '');
        frontInput.value = '';
        backInput.value = '';
        wmText.value = '';
        scaleInput.value = '85';
        drag = null;
        setError('');
        redraw();
    });

    redraw();
});
