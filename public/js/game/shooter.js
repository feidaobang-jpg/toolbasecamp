(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    if (audio) audio.boot('catchy');
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }

    var KEY = 'tbc_shooter_lv_v1';
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var state = 'idle', score = 0, lives = 3, level = 1, kills = 0, need = 8, bestLv = 1;
    var ship = { x: W / 2, y: H - 40 }, bullets = [], enemies = [], keys = {};
    var cool = 0, raf = 0, last = 0, spawnT = 0;
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
        var g = document.getElementById('goal'); if (g) g.textContent = kills + '/' + need;
    }
    function waveNeed(lv) { return 10 + lv * 4; }
    function enemyVy(lv) { return 1.9 + lv * 0.28 + Math.random() * 1.3; }
    function spawnGap(lv) { return Math.max(0.24, 0.82 - lv * 0.065); }

    function resetRun() {
        score = 0; lives = 3; level = 1; kills = 0; need = waveNeed(1);
        ship.x = W / 2; bullets = []; enemies = []; cool = 0; spawnT = 0; hud();
    }
    function nextWave() {
        level++; kills = 0; need = waveNeed(level);
        enemies = []; bullets = []; spawnT = 0.5;
        if (lives < 5) lives++;
        if (level > bestLv) {
            bestLv = level;
            try { localStorage.setItem(KEY, JSON.stringify({ bestLv: bestLv })); } catch (e) {}
        }
        play('level');
        setStatus(tr('tools.shooter.levelClear', { n: level - 1 }), 'is-win');
        hud();
        setTimeout(function () {
            if (state === 'playing') setStatus(tr('tools.shooter.levelStart', { n: level, need: need }), 'is-idle');
        }, 700);
    }

    function shoot() {
        if (cool > 0) return;
        cool = Math.max(0.14, 0.24 - level * 0.008);
        play('hit');
        bullets.push({ x: ship.x, y: ship.y - 18, vy: -9 });
    }
    function update(dt) {
        if (state !== 'playing') return;
        var s = dt * 60;
        if (keys.Left || keys.a || keys.A) ship.x -= 5 * s;
        if (keys.Right || keys.d || keys.D) ship.x += 5 * s;
        if (keys[' '] || keys.Space) shoot();
        ship.x = Math.max(20, Math.min(W - 20, ship.x));
        cool -= dt; spawnT -= dt;
        if (spawnT <= 0) {
            spawnT = spawnGap(level);
            enemies.push({
                x: 30 + Math.random() * (W - 60), y: -20,
                vy: enemyVy(level),
                emoji: Math.random() < 0.25 + level * 0.02 ? '🛸' : '👾'
            });
        }
        bullets.forEach(function (b) { b.y += b.vy * s; });
        bullets = bullets.filter(function (b) { return b.y > -10; });
        enemies.forEach(function (e) { e.y += e.vy * s; });
        for (var i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i], hit = false;
            for (var j = bullets.length - 1; j >= 0; j--) {
                if (Math.hypot(bullets[j].x - e.x, bullets[j].y - e.y) < 22) {
                    bullets.splice(j, 1); hit = true; score += 20; kills++; break;
                }
            }
            if (hit) {
                enemies.splice(i, 1);
                if (kills >= need) nextWave();
                continue;
            }
            if (e.y > H + 20) {
                enemies.splice(i, 1); lives -= 1;
                if (lives <= 0) { state = 'lose'; play('lose'); setStatus(tr('tools.shooter.gameOver'), 'is-lose'); }
            } else if (Math.hypot(e.x - ship.x, e.y - ship.y) < 26) {
                enemies.splice(i, 1); lives -= 1;
                if (lives <= 0) { state = 'lose'; play('lose'); setStatus(tr('tools.shooter.gameOver'), 'is-lose'); }
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
            ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui';
            ctx.fillText(tr('tools.shooter.tapStart'), W / 2, H / 2);
        }
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw();
        if (state === 'playing') raf = requestAnimationFrame(loop);
    }
    function start() {
        play('start'); cancelAnimationFrame(raf); resetRun(); state = 'playing'; last = 0;
        setStatus(tr('tools.shooter.levelStart', { n: level, need: need }), 'is-idle');
        raf = requestAnimationFrame(loop);
    }
    document.getElementById('restart-btn').onclick = start;
    window.addEventListener('keydown', function (e) {
        keys[e.key] = true;
        if (e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault();
        if (state !== 'playing' && (e.key === ' ' || e.key === 'Enter')) start();
    });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });
    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state !== 'playing') { start(); return; }
        var rect = canvas.getBoundingClientRect();
        ship.x = ((e.clientX - rect.left) / rect.width) * W;
        shoot();
    });
    canvas.addEventListener('pointermove', function (e) {
        if (state !== 'playing') return;
        if (e.pointerType === 'mouse' && e.buttons === 0) return;
        var rect = canvas.getBoundingClientRect();
        ship.x = ((e.clientX - rect.left) / rect.width) * W;
    });
    resetRun(); draw(); setStatus(tr('tools.shooter.hint'), 'is-idle');
})();
