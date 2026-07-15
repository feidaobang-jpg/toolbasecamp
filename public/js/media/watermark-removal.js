document.addEventListener('DOMContentLoaded', function () {
    function tr(key) {
        return typeof t === 'function' ? t(key) : key;
    }

    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var canvasWrap = document.getElementById('canvas-wrap');
    var canvas = document.getElementById('wm-canvas');
    var ctx = canvas.getContext('2d');
    var undoBtn = document.getElementById('undo-btn');
    var processBtn = document.getElementById('process-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');

    var state = {
        image: null,
        boxes: [],
        drawing: false,
        startX: 0,
        startY: 0,
        curX: 0,
        curY: 0,
        scale: 1
    };

    function setError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function setBusy(has) {
        dropZone.hidden = has;
        canvasWrap.hidden = !has;
        undoBtn.disabled = !has || state.boxes.length === 0;
        processBtn.disabled = !has || state.boxes.length === 0;
        downloadBtn.disabled = !has;
    }

    function fitCanvas() {
        if (!state.image) return;
        var maxW = Math.min(canvasWrap.clientWidth || 640, 900);
        var scale = Math.min(1, maxW / state.image.naturalWidth);
        state.scale = scale;
        canvas.width = Math.round(state.image.naturalWidth * scale);
        canvas.height = Math.round(state.image.naturalHeight * scale);
        redraw();
    }

    function redraw() {
        if (!state.image) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
        state.boxes.forEach(function (b) {
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(b.x * state.scale, b.y * state.scale, b.w * state.scale, b.h * state.scale);
            ctx.restore();
        });
        if (state.drawing) {
            var x = Math.min(state.startX, state.curX);
            var y = Math.min(state.startY, state.curY);
            var w = Math.abs(state.curX - state.startX);
            var h = Math.abs(state.curY - state.startY);
            ctx.save();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }

    function canvasPoint(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function loadFile(file) {
        if (!file || !file.type || file.type.indexOf('image/') !== 0) {
            setError(tr('tools.watermarkRemoval.invalidFile'));
            return;
        }
        setError('');
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            state.image = img;
            state.boxes = [];
            setBusy(true);
            fitCanvas();
        };
        img.onerror = function () {
            setError(tr('tools.watermarkRemoval.loadFailed'));
        };
        img.src = url;
    }

    function fillBox(imgCtx, box) {
        var x = Math.max(0, Math.floor(box.x));
        var y = Math.max(0, Math.floor(box.y));
        var w = Math.max(1, Math.floor(box.w));
        var h = Math.max(1, Math.floor(box.h));
        // Sample a ring around the box when possible, else white fill.
        var pad = 4;
        var sx = Math.max(0, x - pad);
        var sy = Math.max(0, y - pad);
        var sw = Math.min(imgCtx.canvas.width - sx, w + pad * 2);
        var sh = Math.min(imgCtx.canvas.height - sy, h + pad * 2);
        try {
            var data = imgCtx.getImageData(sx, sy, sw, sh).data;
            var r = 0, g = 0, b = 0, n = 0;
            for (var i = 0; i < data.length; i += 4) {
                var px = (i / 4) % sw;
                var py = Math.floor((i / 4) / sw);
                var inside = px >= pad && px < pad + w && py >= pad && py < pad + h;
                if (inside) continue;
                r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
            }
            if (n > 0) {
                imgCtx.fillStyle = 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
            } else {
                imgCtx.fillStyle = '#ffffff';
            }
        } catch (e) {
            imgCtx.fillStyle = '#ffffff';
        }
        imgCtx.fillRect(x, y, w, h);
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

    function onDown(e) {
        if (!state.image) return;
        e.preventDefault();
        var p = canvasPoint(e);
        state.drawing = true;
        state.startX = state.curX = p.x;
        state.startY = state.curY = p.y;
    }
    function onMove(e) {
        if (!state.drawing) return;
        e.preventDefault();
        var p = canvasPoint(e);
        state.curX = p.x;
        state.curY = p.y;
        redraw();
    }
    function onUp(e) {
        if (!state.drawing) return;
        e.preventDefault();
        state.drawing = false;
        var x1 = Math.min(state.startX, state.curX) / state.scale;
        var y1 = Math.min(state.startY, state.curY) / state.scale;
        var w = Math.abs(state.curX - state.startX) / state.scale;
        var h = Math.abs(state.curY - state.startY) / state.scale;
        if (w >= 4 && h >= 4) {
            state.boxes.push({ x: x1, y: y1, w: w, h: h });
        }
        undoBtn.disabled = state.boxes.length === 0;
        processBtn.disabled = state.boxes.length === 0;
        redraw();
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);

    undoBtn.addEventListener('click', function () {
        state.boxes.pop();
        undoBtn.disabled = state.boxes.length === 0;
        processBtn.disabled = state.boxes.length === 0;
        redraw();
    });

    processBtn.addEventListener('click', function () {
        if (!state.image || !state.boxes.length) return;
        var off = document.createElement('canvas');
        off.width = state.image.naturalWidth;
        off.height = state.image.naturalHeight;
        var octx = off.getContext('2d');
        octx.drawImage(state.image, 0, 0);
        state.boxes.forEach(function (b) { fillBox(octx, b); });
        var url = off.toDataURL('image/png');
        var img = new Image();
        img.onload = function () {
            state.image = img;
            state.boxes = [];
            undoBtn.disabled = true;
            processBtn.disabled = true;
            fitCanvas();
        };
        img.src = url;
    });

    downloadBtn.addEventListener('click', function () {
        if (!state.image) return;
        var off = document.createElement('canvas');
        off.width = state.image.naturalWidth;
        off.height = state.image.naturalHeight;
        off.getContext('2d').drawImage(state.image, 0, 0);
        var a = document.createElement('a');
        a.href = off.toDataURL('image/png');
        a.download = 'cleaned_' + Date.now() + '.png';
        a.click();
    });

    clearBtn.addEventListener('click', function () {
        state.image = null;
        state.boxes = [];
        setBusy(false);
        setError('');
    });

    window.addEventListener('resize', function () {
        if (state.image) fitCanvas();
    });

    setBusy(false);
});
