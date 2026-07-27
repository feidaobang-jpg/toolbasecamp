(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    if (audio) audio.boot('catchy');
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }

    var KEY = 'tbc_catcher_lv_v1';
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var state = 'idle', score = 0, lives = 3, level = 1, caught = 0, goal = 8, bestLv = 1;
    var basket = { x: W / 2, w: 64 }, items = [], keys = {}, spawn = 0, raf = 0, last = 0;
    var FRUITS = ['🍎', '🍊', '🍇', '🍓', '🍒'];
    try { bestLv = Math.max(1, +JSON.parse(localStorage.getItem(KEY) || '{}').bestLv || 1); } catch (e) {}

    function setStatus(m, c) {
        var el = document.getElementById('status');
        el.textContent = m;
        el.className = 'game-status' + (c ? ' ' + c : '');
    }
    function hud() {
        document.getElementById('score').textContent = score;
        document.getElementById('lives').textContent = lives;
        var lv = document.getElementById('level'); if (lv) lv.textContent = level;
        var g = document.getElementById('goal'); if (g) g.textContent = caught + '/' + goal;
    }
    function levelGoal(lv) { return 6 + lv * 4; }
    function bombRate(lv) { return Math.min(0.42, 0.12 + lv * 0.03); }
    function fallSpeed(lv) { return 2.0 + lv * 0.25; }
    function spawnGap(lv) { return Math.max(0.28, 0.95 - lv * 0.06); }

    function resetRun() {
        score = 0; lives = 3; level = 1; caught = 0; goal = levelGoal(1);
        items = []; basket.x = W / 2; spawn = 0; hud();
    }
    function nextLevel() {
        level++; caught = 0; goal = levelGoal(level);
        items = []; spawn = 0.4;
        if (lives < 5) lives++;
        if (level > bestLv) {
            bestLv = level;
            try { localStorage.setItem(KEY, JSON.stringify({ bestLv: bestLv })); } catch (e) {}
        }
        play('level');
        setStatus(tr('tools.catcher.levelClear', { n: level - 1 }), 'is-win');
        hud();
        setTimeout(function () {
            if (state === 'playing') setStatus(tr('tools.catcher.levelStart', { n: level, goal: goal }), 'is-idle');
        }, 700);
    }

    function update(dt) {
        if (state !== 'playing') return;
        var s = dt * 60;
        if (keys.ArrowLeft || keys.a || keys.A) basket.x -= 6 * s;
        if (keys.ArrowRight || keys.d || keys.D) basket.x += 6 * s;
        basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, basket.x));
        spawn -= dt;
        if (spawn <= 0) {
            spawn = spawnGap(level);
            var bomb = Math.random() < bombRate(level);
            items.push({
                x: 30 + Math.random() * (W - 60), y: -20,
                vy: fallSpeed(level) + Math.random() * 1.6,
                emoji: bomb ? '💣' : FRUITS[(Math.random() * FRUITS.length) | 0],
                bomb: bomb
            });
        }
        for (var i = items.length - 1; i >= 0; i--) {
            var it = items[i]; it.y += it.vy * s;
            if (it.y > H - 50 && Math.abs(it.x - basket.x) < basket.w * 0.55) {
                if (it.bomb) {
                    lives -= 1;
                    play('hit');
                    if (lives <= 0) { state = 'lose'; play('lose'); setStatus(tr('tools.catcher.gameOver'), 'is-lose'); }
                } else {
                    play('match'); score += 10; caught++;
                    if (caught >= goal) nextLevel();
                }
                items.splice(i, 1); hud(); continue;
            }
            if (it.y > H + 30) {
                if (!it.bomb) {
                    lives -= 1;
                    if (lives <= 0) { state = 'lose'; play('lose'); setStatus(tr('tools.catcher.gameOver'), 'is-lose'); }
                }
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
            ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui';
            ctx.fillText(tr('tools.catcher.tapStart'), W / 2, H / 2);
        }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw(); if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() {
        play('start'); cancelAnimationFrame(raf); resetRun(); state = 'playing'; last = 0;
        setStatus(tr('tools.catcher.levelStart', { n: level, goal: goal }), 'is-idle');
        raf = requestAnimationFrame(loop);
    }
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) {
        keys[e.key] = true;
        if (state !== 'playing' && (e.key === 'Enter' || e.key === ' ')) start();
    });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });
    canvas.addEventListener('pointermove', function (e) {
        var rect = canvas.getBoundingClientRect();
        basket.x = ((e.clientX - rect.left) / rect.width) * W;
    });
    canvas.addEventListener('pointerdown', function () { if (state !== 'playing') start(); });
    resetRun(); draw(); setStatus(tr('tools.catcher.hint'), 'is-idle');
})();
