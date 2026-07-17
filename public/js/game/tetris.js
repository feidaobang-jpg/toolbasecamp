(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var COLS = 10, ROWS = 20, BS = 20;
    var COLORS = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫'];
    var SHAPES = [
        [[1, 1, 1, 1]],
        [[1, 1], [1, 1]],
        [[0, 1, 0], [1, 1, 1]],
        [[1, 0, 0], [1, 1, 1]],
        [[0, 0, 1], [1, 1, 1]],
        [[0, 1, 1], [1, 1, 0]],
        [[1, 1, 0], [0, 1, 1]]
    ];
    var board, piece, score = 0, lines = 0, state = 'idle', dropMs = 600, acc = 0, raf = 0, last = 0;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('lines').textContent = lines; }
    function emptyBoard() {
        var b = []; for (var r = 0; r < ROWS; r++) { b[r] = []; for (var c = 0; c < COLS; c++) b[r][c] = null; } return b;
    }
    function spawn() {
        var id = (Math.random() * SHAPES.length) | 0;
        piece = { shape: SHAPES[id].map(function (r) { return r.slice(); }), x: 3, y: 0, emoji: COLORS[id] };
        if (collide(piece.x, piece.y, piece.shape)) { state = 'lose'; setStatus(tr('tools.tetris.gameOver'), 'is-lose'); }
    }
    function collide(x, y, shape) {
        for (var r = 0; r < shape.length; r++) for (var c = 0; c < shape[r].length; c++) {
            if (!shape[r][c]) continue;
            var nx = x + c, ny = y + r;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
        }
        return false;
    }
    function merge() {
        piece.shape.forEach(function (row, r) {
            row.forEach(function (v, c) {
                if (v && piece.y + r >= 0) board[piece.y + r][piece.x + c] = piece.emoji;
            });
        });
    }
    function clearLines() {
        var cleared = 0;
        for (var r = ROWS - 1; r >= 0; r--) {
            if (board[r].every(Boolean)) { board.splice(r, 1); board.unshift(Array(COLS).fill(null)); cleared++; r++; }
        }
        if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared]; dropMs = Math.max(120, 600 - lines * 8); hud(); }
    }
    function rotate() {
        var s = piece.shape, N = s.length, M = s[0].length, out = [];
        for (var c = 0; c < M; c++) { out[c] = []; for (var r = N - 1; r >= 0; r--) out[c].push(s[r][c]); }
        if (!collide(piece.x, piece.y, out)) piece.shape = out;
    }
    function softDrop() { if (!collide(piece.x, piece.y + 1, piece.shape)) piece.y++; else lock(); }
    function hardDrop() { while (!collide(piece.x, piece.y + 1, piece.shape)) piece.y++; lock(); }
    function lock() { merge(); clearLines(); spawn(); }
    function draw() {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
            if (board[r][c]) ctx.fillText(board[r][c], c * BS + BS / 2, r * BS + BS / 2);
            else { ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.strokeRect(c * BS, r * BS, BS, BS); }
        }
        if (piece && state === 'playing') {
            piece.shape.forEach(function (row, r) {
                row.forEach(function (v, c) {
                    if (v) ctx.fillText(piece.emoji, (piece.x + c) * BS + BS / 2, (piece.y + r) * BS + BS / 2);
                });
            });
        }
    }
    function update(dt) {
        if (state !== 'playing') return;
        acc += dt * 1000;
        while (acc >= dropMs) { acc -= dropMs; softDrop(); }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw(); if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() {
        cancelAnimationFrame(raf); board = emptyBoard(); score = 0; lines = 0; dropMs = 600; acc = 0;
        state = 'playing'; hud(); spawn(); last = 0; setStatus(tr('tools.tetris.playing'), 'is-idle'); raf = requestAnimationFrame(loop);
    }
    document.getElementById('start-btn').onclick = function () { if (state !== 'playing') start(); };
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) {
        if (state !== 'playing') { if (e.key === 'Enter' || e.key === ' ') start(); return; }
        if (e.key === 'ArrowLeft' && !collide(piece.x - 1, piece.y, piece.shape)) piece.x--;
        if (e.key === 'ArrowRight' && !collide(piece.x + 1, piece.y, piece.shape)) piece.x++;
        if (e.key === 'ArrowDown') softDrop();
        if (e.key === 'ArrowUp') rotate();
        if (e.key === ' ') { e.preventDefault(); hardDrop(); }
        draw();
    });
    var sx = 0;
    canvas.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; if (state !== 'playing') start(); }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
        if (state !== 'playing') return;
        var dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) < 20) rotate();
        else if (dx < 0 && !collide(piece.x - 1, piece.y, piece.shape)) piece.x--;
        else if (dx > 0 && !collide(piece.x + 1, piece.y, piece.shape)) piece.x++;
        draw();
    }, { passive: true });
    board = emptyBoard(); draw(); setStatus(tr('tools.tetris.hint'), 'is-idle');
})();
