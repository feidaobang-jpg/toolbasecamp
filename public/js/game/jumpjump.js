(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height, KEY = 'tb_jump_best';
    var score = 0, best = 0, plats = [], player, charging = false, power = 0, flying = false, raf = 0, last = 0, state = 'ready';
    try { best = +localStorage.getItem(KEY) || 0; } catch (e) {}
    document.getElementById('best').textContent = best;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('best').textContent = best; }
    function addPlat(x, y, w) { plats.push({ x: x, y: y, w: w, emoji: ['🟫', '🟧', '🟪'][score % 3] }); }
    function reset() {
        score = 0; plats = []; flying = false; charging = false; power = 0; state = 'ready';
        addPlat(40, H - 80, 70); addPlat(200, H - 80, 60);
        player = { x: 75, y: H - 80, r: 14, vx: 0, vy: 0, on: 0 };
        hud(); setStatus(tr('tools.jumpjump.hint'), 'is-idle'); draw();
    }
    function nextPlat() {
        var lastP = plats[plats.length - 1];
        var gap = 70 + Math.random() * 90;
        var w = 48 + Math.random() * 30;
        var x = Math.min(W - w - 20, lastP.x + gap);
        if (x < 20) x = 20 + Math.random() * 40;
        addPlat(x, H - 80, w);
        if (plats.length > 4) plats.shift();
        // shift world left so current stay visible
        var shift = plats[0].x - 40;
        plats.forEach(function (p) { p.x -= shift; });
        player.x -= shift;
    }
    function update(dt) {
        if (charging) power = Math.min(1, power + dt * 1.1);
        if (!flying) return;
        var s = dt * 60;
        player.x += player.vx * s; player.y += player.vy * s; player.vy += 0.45 * s;
        if (player.y >= H - 80) {
            var landed = null;
            for (var i = 0; i < plats.length; i++) {
                var p = plats[i];
                if (player.x > p.x && player.x < p.x + p.w) { landed = i; break; }
            }
            player.y = H - 80; flying = false;
            if (landed == null) {
                state = 'lose';
                if (score > best) { best = score; try { localStorage.setItem(KEY, String(best)); } catch (e) {} }
                hud(); setStatus(tr('tools.jumpjump.miss'), 'is-lose'); return;
            }
            player.on = landed;
            if (landed === plats.length - 1) { score += 1; nextPlat(); hud(); setStatus(tr('tools.jumpjump.nice'), 'is-win'); }
            else setStatus(tr('tools.jumpjump.hint'), 'is-idle');
        }
    }
    function draw() {
        ctx.fillStyle = '#e0f2fe'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#86efac'; ctx.fillRect(0, H - 60, W, 60);
        plats.forEach(function (p) {
            ctx.fillStyle = '#78716c'; ctx.fillRect(p.x, p.y, p.w, 14);
            ctx.font = '20px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(p.emoji, p.x + p.w / 2, p.y);
        });
        if (charging) {
            ctx.fillStyle = '#2563eb'; ctx.fillRect(20, 20, power * 120, 10);
        }
        ctx.font = '28px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🧑', player.x, player.y - 16);
    }
    function loop(ts) {
        if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        update(dt); draw();
        if (state !== 'lose') raf = requestAnimationFrame(loop);
    }
    function jump() {
        if (state === 'lose' || flying || power < 0.08) { power = 0; charging = false; return; }
        var target = plats[Math.min(player.on + 1, plats.length - 1)];
        var dx = (target.x + target.w / 2) - player.x;
        // aim mostly toward next platform distance scaled by power
        var dist = 40 + power * 160;
        player.vx = Math.sign(dx || 1) * (dist / 28);
        player.vy = -8 - power * 4;
        flying = true; charging = false; power = 0; state = 'play';
    }
    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state === 'lose') { cancelAnimationFrame(raf); reset(); last = 0; raf = requestAnimationFrame(loop); return; }
        if (flying) return;
        charging = true; power = 0;
    });
    canvas.addEventListener('pointerup', function () { if (charging) jump(); });
    canvas.addEventListener('pointercancel', function () { charging = false; power = 0; });
    document.getElementById('restart-btn').onclick = function () { cancelAnimationFrame(raf); reset(); last = 0; raf = requestAnimationFrame(loop); };
    reset(); last = 0; raf = requestAnimationFrame(loop);
})();
