(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var N = 16, cell = canvas.width / N, score = 0, best = 0, snake, dir, nextDir, food, state = 'idle', timer = 0;
    var KEY = 'tb_snake_best';
    try { best = +localStorage.getItem(KEY) || 0; } catch (e) {}
    document.getElementById('best').textContent = best;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('best').textContent = best; }
    function placeFood() {
        do { food = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; }
        while (snake.some(function (s) { return s.x === food.x && s.y === food.y; }));
    }
    function reset() {
        snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
        dir = nextDir = { x: 1, y: 0 }; score = 0; placeFood(); hud();
    }
    function draw() {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = (cell * 0.85) + 'px "Segoe UI Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🍎', food.x * cell + cell / 2, food.y * cell + cell / 2);
        snake.forEach(function (s, i) {
            ctx.fillText(i === 0 ? '🟢' : '🟩', s.x * cell + cell / 2, s.y * cell + cell / 2);
        });
    }
    function tick() {
        if (state !== 'playing') return;
        dir = nextDir;
        var h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || snake.some(function (s) { return s.x === h.x && s.y === h.y; })) {
            state = 'lose';
            if (score > best) { best = score; try { localStorage.setItem(KEY, String(best)); } catch (e) {} }
            hud(); setStatus(tr('tools.snake.gameOver'), 'is-lose'); clearInterval(timer); return;
        }
        snake.unshift(h);
        if (h.x === food.x && h.y === food.y) { score += 10; placeFood(); hud(); }
        else snake.pop();
        draw();
    }
    function start() {
        clearInterval(timer); reset(); state = 'playing';
        setStatus(tr('tools.snake.playing'), 'is-idle');
        timer = setInterval(tick, 140); draw();
    }
    function setDir(x, y) {
        if (state !== 'playing') return;
        if (dir.x === -x && dir.y === -y) return;
        nextDir = { x: x, y: y };
    }
    document.getElementById('start-btn').onclick = function () { if (state !== 'playing') start(); };
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) {
        var m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
        if (m[e.key]) { e.preventDefault(); if (state !== 'playing') start(); setDir(m[e.key][0], m[e.key][1]); }
    });
    var sx = 0, sy = 0;
    canvas.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; if (state !== 'playing') start(); }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0); else setDir(0, dy > 0 ? 1 : -1);
    }, { passive: true });
    reset(); draw(); setStatus(tr('tools.snake.hint'), 'is-idle');
})();
