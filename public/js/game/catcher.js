(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height, state = 'idle', score = 0, lives = 3;
    var basket = { x: W / 2, w: 64 }, items = [], keys = {}, spawn = 0, raf = 0, last = 0;
    var FRUITS = ['🍎', '🍊', '🍇', '🍓', '🍒'];
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('lives').textContent = lives; }
    function reset() { score = 0; lives = 3; items = []; basket.x = W / 2; spawn = 0; hud(); }
    function update(dt) {
        if (state !== 'playing') return;
        var s = dt * 60;
        if (keys.ArrowLeft || keys.a || keys.A) basket.x -= 6 * s;
        if (keys.ArrowRight || keys.d || keys.D) basket.x += 6 * s;
        basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, basket.x));
        spawn -= dt;
        if (spawn <= 0) {
            spawn = Math.max(0.35, 0.9 - score * 0.004);
            var bomb = Math.random() < 0.18;
            items.push({ x: 30 + Math.random() * (W - 60), y: -20, vy: 2.2 + Math.random() * 2, emoji: bomb ? '💣' : FRUITS[(Math.random() * FRUITS.length) | 0], bomb: bomb });
        }
        for (var i = items.length - 1; i >= 0; i--) {
            var it = items[i]; it.y += it.vy * s;
            if (it.y > H - 50 && Math.abs(it.x - basket.x) < basket.w * 0.55) {
                if (it.bomb) { lives -= 1; if (lives <= 0) { state = 'lose'; setStatus(tr('tools.catcher.gameOver'), 'is-lose'); } }
                else score += 10;
                items.splice(i, 1); hud(); continue;
            }
            if (it.y > H + 30) {
                if (!it.bomb) { lives -= 1; if (lives <= 0) { state = 'lose'; setStatus(tr('tools.catcher.gameOver'), 'is-lose'); } }
                items.splice(i, 1); hud();
            }
        }
    }
    function draw() {
        ctx.fillStyle = '#ecfeff'; ctx.fillRect(0, 0, W, H);
        ctx.font = '30px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        items.forEach(function (it) { ctx.fillText(it.emoji, it.x, it.y); });
        ctx.fillText('🧺', basket.x, H - 36);
        if (state === 'idle') {
            ctx.fillStyle = 'rgba(15,23,42,0.4)'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.fillText(tr('tools.catcher.tapStart'), W / 2, H / 2);
        }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw(); if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() { cancelAnimationFrame(raf); reset(); state = 'playing'; last = 0; setStatus(tr('tools.catcher.playing'), 'is-idle'); raf = requestAnimationFrame(loop); }
    document.getElementById('start-btn').onclick = function () { if (state !== 'playing') start(); };
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) { keys[e.key] = true; if (state !== 'playing' && (e.key === 'Enter' || e.key === ' ')) start(); });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });
    canvas.addEventListener('pointermove', function (e) {
        var rect = canvas.getBoundingClientRect();
        basket.x = ((e.clientX - rect.left) / rect.width) * W;
    });
    canvas.addEventListener('pointerdown', function () { if (state !== 'playing') start(); });
    reset(); draw(); setStatus(tr('tools.catcher.hint'), 'is-idle');
})();
