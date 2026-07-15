(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var boardEl = document.getElementById('board');
    var previewEl = document.getElementById('preview');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var diffRow = document.getElementById('diff-row');
    var fileInput = document.getElementById('file-input');
    var cropPanel = document.getElementById('crop-panel');
    var cropStage = document.getElementById('crop-stage');
    var cropImg = document.getElementById('crop-img');
    var cropApply = document.getElementById('crop-apply');
    var cropCancel = document.getElementById('crop-cancel');

    var grid = 3;
    var imageUrl = '';
    var pieces = [];
    var selected = -1;
    var complete = false;
    var objectUrl = null;
    var cropSource = null;
    var cropNatural = { w: 0, h: 0 };
    var cropScale = 1;
    var cropOffset = { x: 0, y: 0 };
    var drag = null;
    var OUTPUT = 900;

    function setStatus(msg, cls) {
        if (!msg) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function syncPreviewSize() {
        var boardSize = boardEl.clientWidth || 320;
        var cell = boardSize / grid;
        previewEl.style.width = cell + 'px';
        previewEl.style.height = cell + 'px';
    }

    function makeDefaultImage() {
        var c = document.createElement('canvas');
        c.width = 600;
        c.height = 600;
        var ctx = c.getContext('2d');
        var g = ctx.createLinearGradient(0, 0, 600, 600);
        g.addColorStop(0, '#60a5fa');
        g.addColorStop(0.5, '#a78bfa');
        g.addColorStop(1, '#f472b6');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 600, 600);
        for (var i = 0; i < 12; i++) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 4) * 0.05) + ')';
            ctx.arc(60 + (i * 47) % 540, 80 + (i * 71) % 460, 28 + (i % 5) * 8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(17,24,39,0.55)';
        ctx.font = 'bold 64px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Tool Basecamp', 300, 300);
        return c.toDataURL('image/png');
    }

    function scrollToBottom() {
        var root = document.scrollingElement || document.documentElement;
        var top = Math.max(
            root.scrollHeight,
            document.body ? document.body.scrollHeight : 0
        );
        if (typeof window.scrollTo === 'function') {
            window.scrollTo({ top: top, behavior: 'smooth' });
        } else {
            root.scrollTop = top;
        }
    }

    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        var ordered = true;
        for (i = 0; i < a.length; i++) if (a[i] !== i) { ordered = false; break; }
        if (ordered && a.length > 1) {
            tmp = a[0]; a[0] = a[1]; a[1] = tmp;
        }
        return a;
    }

    function build() {
        var order = shuffle(Array.from({ length: grid * grid }, function (_, i) { return i; }));
        pieces = order;
        selected = -1;
        complete = false;
        setStatus('');
        previewEl.src = imageUrl;
        render();
    }

    function render() {
        var size = boardEl.clientWidth || 320;
        var piece = size / grid;
        syncPreviewSize();
        boardEl.innerHTML = '';
        pieces.forEach(function (correctIndex, displayIndex) {
            var row = Math.floor(correctIndex / grid);
            var col = correctIndex % grid;
            var dr = Math.floor(displayIndex / grid);
            var dc = displayIndex % grid;
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'puzzle-piece' + (selected === displayIndex ? ' is-selected' : '');
            el.style.width = piece + 'px';
            el.style.height = piece + 'px';
            el.style.left = (dc * piece) + 'px';
            el.style.top = (dr * piece) + 'px';
            el.style.backgroundImage = 'url(' + imageUrl + ')';
            el.style.backgroundSize = (grid * 100) + '% ' + (grid * 100) + '%';
            el.style.backgroundPosition = (-col * piece) + 'px ' + (-row * piece) + 'px';
            el.dataset.index = String(displayIndex);
            boardEl.appendChild(el);
        });
    }

    function checkWin() {
        for (var i = 0; i < pieces.length; i++) {
            if (pieces[i] !== i) return false;
        }
        return true;
    }

    function clampCrop() {
        var stage = cropStage.clientWidth || 320;
        var drawW = cropNatural.w * cropScale;
        var drawH = cropNatural.h * cropScale;
        var minX = stage - drawW;
        var minY = stage - drawH;
        cropOffset.x = Math.min(0, Math.max(minX, cropOffset.x));
        cropOffset.y = Math.min(0, Math.max(minY, cropOffset.y));
    }

    function applyCropTransform() {
        clampCrop();
        cropImg.style.width = (cropNatural.w * cropScale) + 'px';
        cropImg.style.height = (cropNatural.h * cropScale) + 'px';
        cropImg.style.transform = 'translate(' + cropOffset.x + 'px,' + cropOffset.y + 'px)';
    }

    function openCropper(src) {
        cropSource = src;
        cropImg.onload = function () {
            cropNatural.w = cropImg.naturalWidth;
            cropNatural.h = cropImg.naturalHeight;
            var stage = cropStage.clientWidth || 320;
            // cover scale: fill square viewport
            cropScale = Math.max(stage / cropNatural.w, stage / cropNatural.h);
            cropOffset.x = (stage - cropNatural.w * cropScale) / 2;
            cropOffset.y = (stage - cropNatural.h * cropScale) / 2;
            applyCropTransform();
            cropPanel.hidden = false;
            if (window.requestAnimationFrame) {
                requestAnimationFrame(function () {
                    // remeasure after panel shown
                    var s = cropStage.clientWidth || 320;
                    cropScale = Math.max(s / cropNatural.w, s / cropNatural.h);
                    cropOffset.x = (s - cropNatural.w * cropScale) / 2;
                    cropOffset.y = (s - cropNatural.h * cropScale) / 2;
                    applyCropTransform();
                    scrollToBottom();
                });
            } else {
                scrollToBottom();
            }
        };
        cropImg.src = src;
    }

    function closeCropper() {
        cropPanel.hidden = true;
        cropSource = null;
        drag = null;
        cropStage.classList.remove('is-dragging');
    }

    function exportCrop() {
        var stage = cropStage.clientWidth || 320;
        // region of natural image visible in the square
        var sx = (-cropOffset.x) / cropScale;
        var sy = (-cropOffset.y) / cropScale;
        var side = stage / cropScale;
        var c = document.createElement('canvas');
        c.width = OUTPUT;
        c.height = OUTPUT;
        c.getContext('2d').drawImage(
            cropImg,
            sx, sy, side, side,
            0, 0, OUTPUT, OUTPUT
        );
        return c.toDataURL('image/jpeg', 0.92);
    }

    function pointerPos(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function onCropStart(e) {
        if (cropPanel.hidden) return;
        e.preventDefault();
        var p = pointerPos(e);
        drag = { x: p.x, y: p.y, ox: cropOffset.x, oy: cropOffset.y };
        cropStage.classList.add('is-dragging');
    }

    function onCropMove(e) {
        if (!drag) return;
        e.preventDefault();
        var p = pointerPos(e);
        cropOffset.x = drag.ox + (p.x - drag.x);
        cropOffset.y = drag.oy + (p.y - drag.y);
        applyCropTransform();
    }

    function onCropEnd() {
        drag = null;
        cropStage.classList.remove('is-dragging');
    }

    boardEl.addEventListener('click', function (e) {
        if (complete) return;
        var el = e.target.closest('.puzzle-piece');
        if (!el) return;
        var idx = Number(el.dataset.index);
        if (selected < 0) {
            selected = idx;
            render();
            return;
        }
        if (selected === idx) {
            selected = -1;
            render();
            return;
        }
        var tmp = pieces[selected];
        pieces[selected] = pieces[idx];
        pieces[idx] = tmp;
        selected = -1;
        if (checkWin()) {
            complete = true;
            setStatus(tr('tools.puzzle.win'), 'is-win');
        } else {
            setStatus('');
        }
        render();
    });

    diffRow.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-n]');
        if (!btn) return;
        grid = Number(btn.dataset.n);
        Array.prototype.forEach.call(diffRow.querySelectorAll('.tb-btn'), function (el) {
            el.classList.toggle('is-active', el === btn);
        });
        build();
    });

    fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            openCropper(objectUrl);
        };
        img.onerror = function () {
            setStatus(tr('tools.puzzle.loadFailed'), 'is-lose');
        };
        img.src = objectUrl;
    });

    cropApply.addEventListener('click', function () {
        if (!cropSource) return;
        imageUrl = exportCrop();
        closeCropper();
        build();
    });

    cropCancel.addEventListener('click', function () {
        closeCropper();
        fileInput.value = '';
    });

    cropStage.addEventListener('mousedown', onCropStart);
    cropStage.addEventListener('touchstart', onCropStart, { passive: false });
    window.addEventListener('mousemove', onCropMove);
    window.addEventListener('touchmove', onCropMove, { passive: false });
    window.addEventListener('mouseup', onCropEnd);
    window.addEventListener('touchend', onCropEnd);

    restartBtn.addEventListener('click', build);
    window.addEventListener('resize', function () {
        if (imageUrl) render();
        if (!cropPanel.hidden && cropNatural.w) {
            var stage = cropStage.clientWidth || 320;
            var prevScale = cropScale;
            cropScale = Math.max(stage / cropNatural.w, stage / cropNatural.h);
            cropOffset.x *= cropScale / prevScale;
            cropOffset.y *= cropScale / prevScale;
            applyCropTransform();
        }
    });

    imageUrl = makeDefaultImage();
    build();
})();
