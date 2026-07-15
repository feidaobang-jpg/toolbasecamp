(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var boardEl = document.getElementById('board');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var diffRow = document.getElementById('diff-row');
    var fileInput = document.getElementById('file-input');

    var grid = 3;
    var imageUrl = '';
    var pieces = [];
    var selected = -1;
    var complete = false;
    var objectUrl = null;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
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
        setStatus(tr('tools.puzzle.hint'), 'is-idle');
        render();
    }

    function render() {
        var size = boardEl.clientWidth || 320;
        var piece = size / grid;
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
            imageUrl = objectUrl;
            build();
        };
        img.onerror = function () {
            setStatus(tr('tools.puzzle.loadFailed'), 'is-lose');
        };
        img.src = objectUrl;
    });

    restartBtn.addEventListener('click', build);
    window.addEventListener('resize', function () {
        if (imageUrl) render();
    });

    imageUrl = makeDefaultImage();
    build();
})();
