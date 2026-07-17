(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height, KEY = 'tb_runner_best';
    var ground = H - 40, player, obs = [], score = 0, best = 0, state = 'idle', speed = 5, spawn = 0, raf = 0, last = 0;
    try { best = +localStorage.getItem(KEY) || 0; } catch (e) {}
    document.getElementById('best').textContent = best;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = Math.floor(score); document.getElementById('best').textContent = best; }
    function reset() {
        player = { x: 60, y: ground, vy: 0, on: true }; obs = []; score = 0; speed = 5; spawn = 0; hud();
    }
    function jump() {
        if (state !== 'playing') return;
        if (player.on) { player.vy = -10; player.on = false; }
    }
    function update(dt) {
        if (state !== 'playing') return;
        var s = dt * 60;
        score += dt * 10; speed = 5 + score * 0.01;
        player.vy += 0.55 * s; player.y += player.vy * s;
        if (player.y >= ground) { player.y = ground; player.vy = 0; player.on = true; }
        spawn -= dt;
        if (spawn <= 0) {
            spawn = 0.9 + Math.random() * 0.9;
            obs.push({ x: W + 20, y: ground, emoji: Math.random() < 0.5 ? '🌵' : '🪨', w: 28 });
        }
        for (var i = obs.length - 1; i >= 0; i--) {
            obs[i].x -= speed * s;
            if (obs[i].x < -40) obs.splice(i, 1);
            else if (Math.abs(obs[i].x - player.x) < 24 && Math.abs(obs[i].y - player.y) < 28) {
                state = 'lose';
                var sc = Math.floor(score);
                if (sc > best) { best = sc; try { localStorage.setItem(KEY, String(best)); } catch (e) {} }
                hud(); setStatus(tr('tools.runner.gameOver', { n: sc }), 'is-lose');
            }
        }
        hud();
    }
    function draw() {
        ctx.fillStyle = '#bae6fd'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#86efac'; ctx.fillRect(0, ground + 10, W, H);
        ctx.font = '32px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('🏃', player.x, player.y);
        obs.forEach(function (o) { ctx.fillText(o.emoji, o.x, o.y); });
        if (state === 'idle') {
            ctx.fillStyle = 'rgba(15,23,42,0.35)'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.fillText(tr('tools.runner.tapStart'), W / 2, H / 2);
        }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw(); if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() { cancelAnimationFrame(raf); reset(); state = 'playing'; last = 0; setStatus(tr('tools.runner.playing'), 'is-idle'); raf = requestAnimationFrame(loop); }
    document.getElementById('start-btn').onclick = function () { if (state !== 'playing') start(); };
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); if (state !== 'playing') start(); else jump(); }
    });
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); if (state !== 'playing') start(); else jump(); });
    reset(); draw(); setStatus(tr('tools.runner.hint'), 'is-idle');
})();
