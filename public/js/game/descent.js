(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;

    var depthEl = document.getElementById('depth');
    var scoreEl = document.getElementById('score');
    var bestEl = document.getElementById('best');
    var statusEl = document.getElementById('status');
    var startBtn = document.getElementById('start-btn');
    var restartBtn = document.getElementById('restart-btn');

    var BEST_KEY = 'tb_descent_best';
    var PW = 70;
    var PH = 14;
    var GRAVITY = 0.42;
    var MOVE = 5.2;
    var MAX_FALL = 14;

    var state = 'idle';
    var player = { x: W / 2, y: 120, vx: 0, vy: 0, w: 28, h: 28 };
    var platforms = [];
    var camY = 0;
    var maxDepth = 0;
    var score = 0;
    var best = 0;
    var keys = { left: false, right: false };
    var touchDir = 0;
    var lastTs = 0;
    var raf = 0;
    var nextPlatY = 180;
    var dead = false;

    try {
        best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    } catch (e) {
        best = 0;
    }
    bestEl.textContent = String(best);

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function updateHud() {
        depthEl.textContent = String(maxDepth);
        scoreEl.textContent = String(score);
        bestEl.textContent = String(best);
    }

    function platTypeForDepth(depth) {
        var r = Math.random();
        if (depth < 8) return r < 0.85 ? 'safe' : 'bounce';
        if (depth < 25) {
            if (r < 0.55) return 'safe';
            if (r < 0.75) return 'bounce';
            if (r < 0.9) return 'vanish';
            return 'spike';
        }
        if (r < 0.4) return 'safe';
        if (r < 0.6) return 'bounce';
        if (r < 0.8) return 'vanish';
        return 'spike';
    }

    function styleOf(type) {
        if (type === 'bounce') return { color: '#38bdf8', emoji: '🟦' };
        if (type === 'vanish') return { color: '#fb923c', emoji: '🟧' };
        if (type === 'spike') return { color: '#ef4444', emoji: '🟥' };
        return { color: '#22c55e', emoji: '🟩' };
    }

    function addPlatform(y, forcedType) {
        var depthApprox = Math.max(0, Math.floor((y - 100) / 55));
        var type = forcedType || platTypeForDepth(depthApprox);
        var w = PW - Math.min(24, Math.floor(depthApprox / 8) * 4);
        if (w < 46) w = 46;
        var x = 16 + Math.random() * (W - w - 32);
        platforms.push({
            x: x,
            y: y,
            w: w,
            h: PH,
            type: type,
            alive: true,
            bounceUsed: false
        });
    }

    function seedPlatforms() {
        platforms = [];
        addPlatform(200, 'safe');
        addPlatform(280, 'safe');
        addPlatform(360, 'bounce');
        nextPlatY = 440;
        while (nextPlatY < camY + H + 200) {
            addPlatform(nextPlatY);
            nextPlatY += 48 + Math.random() * 28;
        }
    }

    function resetGame() {
        player.x = W / 2;
        player.y = 120;
        player.vx = 0;
        player.vy = 0;
        camY = 0;
        maxDepth = 0;
        score = 0;
        dead = false;
        touchDir = 0;
        seedPlatforms();
        updateHud();
    }

    function kill(reasonKey) {
        dead = true;
        state = 'lose';
        if (maxDepth > best) {
            best = maxDepth;
            try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        }
        updateHud();
        setStatus(tr(reasonKey, { n: maxDepth }), 'is-lose');
        cancelAnimationFrame(raf);
        raf = 0;
    }

    function update(dt) {
        if (state !== 'playing' || dead) return;
        var scale = dt * 60;

        var dir = 0;
        if (keys.left) dir -= 1;
        if (keys.right) dir += 1;
        if (touchDir) dir = touchDir;
        player.vx = dir * MOVE;
        player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * scale);
        player.x += player.vx * scale;
        player.y += player.vy * scale;

        if (player.x < player.w / 2) player.x = player.w / 2;
        if (player.x > W - player.w / 2) player.x = W - player.w / 2;

        // camera follows downward
        var focus = player.y - H * 0.35;
        if (focus > camY) camY = focus;

        var depth = Math.max(0, Math.floor((player.y - 100) / 50));
        if (depth > maxDepth) {
            score += (depth - maxDepth) * 10;
            maxDepth = depth;
            updateHud();
        }

        // spawn ahead
        while (nextPlatY < camY + H + 220) {
            var gap = 44 + Math.random() * (26 + Math.min(20, maxDepth * 0.4));
            nextPlatY += gap;
            addPlatform(nextPlatY);
        }

        // cull above
        platforms = platforms.filter(function (p) {
            return p.y > camY - 80 && p.alive !== false;
        });

        // land on platforms when falling
        if (player.vy > 0) {
            var feet = player.y + player.h / 2;
            var prevFeet = feet - player.vy * scale;
            for (var i = 0; i < platforms.length; i++) {
                var p = platforms[i];
                if (!p.alive) continue;
                var top = p.y;
                if (prevFeet <= top && feet >= top) {
                    if (player.x + player.w * 0.25 < p.x || player.x - player.w * 0.25 > p.x + p.w) continue;

                    if (p.type === 'spike') {
                        kill('tools.descent.hitSpike');
                        return;
                    }
                    player.y = top - player.h / 2;
                    if (p.type === 'bounce') {
                        player.vy = -11;
                    } else {
                        player.vy = -7.2;
                    }
                    if (p.type === 'vanish') {
                        p.alive = false;
                    }
                    break;
                }
            }
        }

        // fell too far below camera / off screen
        if (player.y - camY > H + 40) {
            kill('tools.descent.fell');
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // background stars
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(148,163,184,0.35)';
        for (var s = 0; s < 24; s++) {
            var sx = (s * 97 + 13) % W;
            var sy = ((s * 53 + Math.floor(camY * 0.2)) % H);
            ctx.fillRect(sx, sy, 2, 2);
        }

        // platforms
        for (var i = 0; i < platforms.length; i++) {
            var p = platforms[i];
            if (!p.alive) continue;
            var py = p.y - camY;
            if (py < -40 || py > H + 40) continue;
            var st = styleOf(p.type);
            ctx.fillStyle = st.color;
            roundRect(p.x, py, p.w, p.h, 6);
            ctx.fill();
            ctx.font = '14px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(st.emoji, p.x + p.w / 2, py + p.h / 2);
        }

        // player
        var px = player.x;
        var py2 = player.y - camY;
        ctx.font = '28px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦘', px, py2);

        // depth ribbon
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        ctx.fillRect(0, 0, W, 28);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 13px system-ui,sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(tr('tools.descent.depth') + ' ' + maxDepth, 10, 15);

        if (state === 'idle') {
            ctx.fillStyle = 'rgba(15,23,42,0.55)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = '600 18px system-ui,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(tr('tools.descent.tapStart'), W / 2, H / 2);
        }
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function loop(ts) {
        if (!lastTs) lastTs = ts;
        var dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        update(dt);
        draw();
        if (state === 'playing') raf = requestAnimationFrame(loop);
    }

    function start() {
        cancelAnimationFrame(raf);
        raf = 0;
        resetGame();
        state = 'playing';
        setStatus(tr('tools.descent.playing'), 'is-idle');
        lastTs = 0;
        raf = requestAnimationFrame(loop);
    }

    startBtn.addEventListener('click', function () {
        if (state === 'playing') return;
        start();
    });
    restartBtn.addEventListener('click', start);

    window.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
        if ((e.key === ' ' || e.key === 'Enter') && state !== 'playing') start();
    });
    window.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });

    function pointerX(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.clientX;
        if (e.touches && e.touches[0]) clientX = e.touches[0].clientX;
        return ((clientX - rect.left) / rect.width) * W;
    }

    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state !== 'playing') {
            start();
            return;
        }
        touchDir = pointerX(e) < W / 2 ? -1 : 1;
    });
    canvas.addEventListener('pointermove', function (e) {
        if (state !== 'playing' || !touchDir) return;
        touchDir = pointerX(e) < W / 2 ? -1 : 1;
    });
    canvas.addEventListener('pointerup', function () { touchDir = 0; });
    canvas.addEventListener('pointercancel', function () { touchDir = 0; });

    resetGame();
    draw();
    setStatus(tr('tools.descent.hint'), 'is-idle');
})();
