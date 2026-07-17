(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height, state = 'idle', score = 0, lives = 3;
    var ship = { x: W / 2, y: H - 40 }, bullets = [], enemies = [], keys = {}, cool = 0, raf = 0, last = 0, spawnT = 0;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('lives').textContent = lives; }
    function reset() { score = 0; lives = 3; ship.x = W / 2; bullets = []; enemies = []; cool = 0; spawnT = 0; hud(); }
    function shoot() { if (cool > 0) return; cool = 0.22; bullets.push({ x: ship.x, y: ship.y - 18, vy: -9 }); }
    function update(dt) {
        if (state !== 'playing') return;
        var s = dt * 60;
        if (keys.Left || keys.a || keys.A) ship.x -= 5 * s;
        if (keys.Right || keys.d || keys.D) ship.x += 5 * s;
        if (keys[' '] || keys.Space) shoot();
        ship.x = Math.max(20, Math.min(W - 20, ship.x));
        cool -= dt; spawnT -= dt;
        if (spawnT <= 0) {
            spawnT = Math.max(0.35, 1.1 - score * 0.002);
            enemies.push({ x: 30 + Math.random() * (W - 60), y: -20, vy: 1.6 + Math.random() * 1.4, emoji: Math.random() < 0.3 ? '🛸' : '👾' });
        }
        bullets.forEach(function (b) { b.y += b.vy * s; });
        bullets = bullets.filter(function (b) { return b.y > -10; });
        enemies.forEach(function (e) { e.y += e.vy * s; });
        for (var i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i], hit = false;
            for (var j = bullets.length - 1; j >= 0; j--) {
                if (Math.hypot(bullets[j].x - e.x, bullets[j].y - e.y) < 22) {
                    bullets.splice(j, 1); hit = true; score += 20; break;
                }
            }
            if (hit) { enemies.splice(i, 1); continue; }
            if (e.y > H + 20) { enemies.splice(i, 1); lives -= 1; if (lives <= 0) { state = 'lose'; setStatus(tr('tools.shooter.gameOver'), 'is-lose'); } }
            else if (Math.hypot(e.x - ship.x, e.y - ship.y) < 26) {
                enemies.splice(i, 1); lives -= 1;
                if (lives <= 0) { state = 'lose'; setStatus(tr('tools.shooter.gameOver'), 'is-lose'); }
            }
        }
        hud();
    }
    function draw() {
        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
        ctx.font = '28px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        bullets.forEach(function (b) { ctx.fillText('✦', b.x, b.y); });
        enemies.forEach(function (e) { ctx.fillText(e.emoji, e.x, e.y); });
        ctx.fillText('🚀', ship.x, ship.y);
        if (state === 'idle') {
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.fillText(tr('tools.shooter.tapStart'), W / 2, H / 2);
        }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw();
        if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() {
        cancelAnimationFrame(raf); reset(); state = 'playing'; last = 0;
        setStatus(tr('tools.shooter.playing'), 'is-idle'); raf = requestAnimationFrame(loop);
    }
    document.getElementById('start-btn').onclick = function () { if (state !== 'playing') start(); };
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) { keys[e.key] = true; if (e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault(); if (state !== 'playing' && (e.key === ' ' || e.key === 'Enter')) start(); });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });
    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state !== 'playing') { start(); return; }
        var rect = canvas.getBoundingClientRect();
        ship.x = ((e.clientX - rect.left) / rect.width) * W;
        shoot();
    });
    canvas.addEventListener('pointermove', function (e) {
        if (state !== 'playing' || e.buttons === 0 && e.pointerType === 'mouse') return;
        if (e.pointerType === 'mouse' && e.buttons === 0) return;
        var rect = canvas.getBoundingClientRect();
        ship.x = ((e.clientX - rect.left) / rect.width) * W;
    });
    reset(); draw(); setStatus(tr('tools.shooter.hint'), 'is-idle');
})();
