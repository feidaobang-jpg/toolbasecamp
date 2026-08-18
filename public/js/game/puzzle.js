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
    var presetGrid = document.getElementById('preset-grid');
    var cropPanel = document.getElementById('crop-panel');
    var cropStage = document.getElementById('crop-stage');
    var cropImg = document.getElementById('crop-img');
    var cropApply = document.getElementById('crop-apply');
    var cropCancel = document.getElementById('crop-cancel');
    var audio = window.GameAudio;

    if (audio) audio.boot('calm');

    function play(name) {
        if (audio) audio.sfx(name);
    }

    var PRESET_BASE = '../../assets/game/puzzle/';
    var PRESETS = [
        '01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg',
        '06.jpg', '07.jpg', '08.jpg', '09.jpg', '10.jpg'
    ];

    var grid = 3;
    var imageUrl = '';
    var activePreset = -1;
    var pieces = [];
    var selected = -1;
    var complete = false;
    var objectUrl = null;
    var cropSource = null;
    var cropNatural = { w: 0, h: 0 };
    var cropScale = 1;
    var cropOffset = { x: 0, y: 0 };
    var drag = null;
    var tileDrag = null;
    var OUTPUT = 900;
    var DRAG_THRESHOLD = 8;

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
        ctx.fillText('工具大本营', 300, 300);
        return c.toDataURL('image/png');
    }

    function presetUrl(index) {
        return PRESET_BASE + PRESETS[index] + '?v=2';
    }

    function syncPresetActive() {
        if (!presetGrid) return;
        Array.prototype.forEach.call(presetGrid.querySelectorAll('.puzzle-pick-btn'), function (btn) {
            var idx = Number(btn.dataset.preset);
            btn.classList.toggle('is-active', idx === activePreset);
            btn.setAttribute('aria-selected', idx === activePreset ? 'true' : 'false');
        });
    }

    function selectPreset(index, reshuffle) {
        if (index < 0 || index >= PRESETS.length) return;
        activePreset = index;
        imageUrl = presetUrl(index);
        syncPresetActive();
        if (reshuffle !== false) build();
        else {
            previewEl.src = imageUrl;
            if (pieces.length) render();
        }
    }

    function renderPresetGrid() {
        if (!presetGrid) return;
        presetGrid.innerHTML = '';
        PRESETS.forEach(function (name, index) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'puzzle-pick-btn';
            btn.dataset.preset = String(index);
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-label', 'Image ' + (index + 1));
            var img = document.createElement('img');
            img.src = presetUrl(index);
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            btn.appendChild(img);
            btn.addEventListener('click', function () {
                play('click');
                if (fileInput) fileInput.value = '';
                selectPreset(index, true);
            });
            presetGrid.appendChild(btn);
        });
        syncPresetActive();
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
        play('start');
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

    function swapTiles(a, b) {
        if (a === b || a < 0 || b < 0) return false;
        var tmp = pieces[a];
        pieces[a] = pieces[b];
        pieces[b] = tmp;
        selected = -1;
        if (checkWin()) {
            complete = true;
            play('win');
            setStatus(tr('tools.puzzle.win'), 'is-win');
        } else {
            play('swap');
            setStatus('');
        }
        render();
        return true;
    }

    function indexAtPoint(clientX, clientY) {
        var rect = boardEl.getBoundingClientRect();
        var size = boardEl.clientWidth || 1;
        var cell = size / grid;
        var x = clientX - rect.left;
        var y = clientY - rect.top;
        if (x < 0 || y < 0 || x >= size || y >= size) return -1;
        var col = Math.min(grid - 1, Math.floor(x / cell));
        var row = Math.min(grid - 1, Math.floor(y / cell));
        return row * grid + col;
    }

    function onTileSelectClick(idx) {
        if (selected < 0) {
            selected = idx;
            play('select');
            render();
            return;
        }
        if (selected === idx) {
            selected = -1;
            play('click');
            render();
            return;
        }
        swapTiles(selected, idx);
    }

    function onTilePointerDown(e) {
        if (complete) return;
        var el = e.target.closest('.puzzle-piece');
        if (!el) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var idx = Number(el.dataset.index);
        var p = pointerPos(e);
        tileDrag = {
            from: idx,
            el: el,
            startX: p.x,
            startY: p.y,
            moved: false,
            dx: 0,
            dy: 0,
            pointerId: e.pointerId
        };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
    }

    function onTilePointerMove(e) {
        if (!tileDrag || e.pointerId !== tileDrag.pointerId) return;
        var p = pointerPos(e);
        var dx = p.x - tileDrag.startX;
        var dy = p.y - tileDrag.startY;
        if (!tileDrag.moved && (dx * dx + dy * dy) >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
            tileDrag.moved = true;
            selected = -1;
            tileDrag.el.classList.add('is-dragging');
            play('select');
        }
        if (!tileDrag.moved) return;
        tileDrag.dx = dx;
        tileDrag.dy = dy;
        tileDrag.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        e.preventDefault();
    }

    function onTilePointerUp(e) {
        if (!tileDrag || e.pointerId !== tileDrag.pointerId) return;
        var from = tileDrag.from;
        var moved = tileDrag.moved;
        var el = tileDrag.el;
        var p = pointerPos(e);
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.classList.remove('is-dragging');
        el.style.transform = '';
        tileDrag = null;

        if (complete) return;
        if (moved) {
            var to = indexAtPoint(p.x, p.y);
            if (to >= 0 && to !== from) swapTiles(from, to);
            else render();
            return;
        }
        onTileSelectClick(from);
    }

    function onTilePointerCancel(e) {
        if (!tileDrag || e.pointerId !== tileDrag.pointerId) return;
        var el = tileDrag.el;
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.classList.remove('is-dragging');
        el.style.transform = '';
        tileDrag = null;
        render();
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

    boardEl.addEventListener('pointerdown', onTilePointerDown);
    boardEl.addEventListener('pointermove', onTilePointerMove);
    boardEl.addEventListener('pointerup', onTilePointerUp);
    boardEl.addEventListener('pointercancel', onTilePointerCancel);
    // prevent ghost click after drag on some browsers
    boardEl.addEventListener('click', function (e) {
        if (e.target.closest('.puzzle-piece')) e.preventDefault();
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
        activePreset = -1;
        syncPresetActive();
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

    renderPresetGrid();
    activePreset = Math.floor(Math.random() * PRESETS.length);
    imageUrl = presetUrl(activePreset);
    syncPresetActive();
    var bootImg = new Image();
    bootImg.onload = function () { build(); };
    bootImg.onerror = function () {
        imageUrl = makeDefaultImage();
        activePreset = -1;
        syncPresetActive();
        build();
    };
    bootImg.src = imageUrl;
})();
