(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;

    var moneyEl = document.getElementById('money');
    var targetEl = document.getElementById('target');
    var levelEl = document.getElementById('level');
    var timeEl = document.getElementById('time');
    var statusEl = document.getElementById('status');
    var startBtn = document.getElementById('start-btn');
    var restartBtn = document.getElementById('restart-btn');

    var ITEM_TYPES = [
        { emoji: '💰', value: 100, weight: 1.2, size: 28, w: 0.35 },
        { emoji: '💰', value: 250, weight: 1.6, size: 36, w: 0.2 },
        { emoji: '💎', value: 500, weight: 0.7, size: 26, w: 0.12 },
        { emoji: '🪨', value: 20, weight: 2.2, size: 34, w: 0.25 },
        { emoji: '💣', value: -80, weight: 1.0, size: 28, w: 0.08 }
    ];

    var ORIGIN = { x: W / 2, y: 52 };
    var MAX_LEN = H - 80;
    var SWING_SPEED = 0.028;
    var SHOOT_SPEED = 7;
    var BASE_RETRACT = 5;

    var state = 'idle'; // idle | playing | win | lose
    var level = 1;
    var money = 0;
    var target = 650;
    var timeLeft = 60;
    var items = [];
    var angle = 0;
    var angleDir = 1;
    var angleMin = -1.15;
    var angleMax = 1.15;
    var hookLen = 36;
    var phase = 'swing'; // swing | shoot | pull
    var caught = null;
    var lastTs = 0;
    var timerAcc = 0;
    var raf = 0;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function updateHud() {
        moneyEl.textContent = String(money);
        targetEl.textContent = String(target);
        levelEl.textContent = String(level);
        timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
    }

    function pickType() {
        var r = Math.random();
        var acc = 0;
        for (var i = 0; i < ITEM_TYPES.length; i++) {
            acc += ITEM_TYPES[i].w;
            if (r <= acc) return ITEM_TYPES[i];
        }
        return ITEM_TYPES[0];
    }

    function spawnItems() {
        items = [];
        var count = 8 + Math.min(level, 6);
        var tries = 0;
        while (items.length < count && tries < 200) {
            tries++;
            var t = pickType();
            var x = 40 + Math.random() * (W - 80);
            var y = 140 + Math.random() * (H - 200);
            var ok = true;
            for (var i = 0; i < items.length; i++) {
                var d = Math.hypot(items[i].x - x, items[i].y - y);
                if (d < 48) { ok = false; break; }
            }
            if (!ok) continue;
            items.push({
                emoji: t.emoji,
                value: t.value,
                weight: t.weight,
                size: t.size,
                x: x,
                y: y,
                alive: true
            });
        }
    }

    function levelTarget(n) {
        return 500 + n * 150;
    }

    function resetLevel(keepMoney) {
        if (!keepMoney) money = 0;
        target = levelTarget(level);
        timeLeft = Math.max(40, 65 - level * 2);
        hookLen = 36;
        phase = 'swing';
        caught = null;
        angle = 0;
        angleDir = 1;
        spawnItems();
        updateHud();
    }

    function hookTip() {
        return {
            x: ORIGIN.x + Math.sin(angle) * hookLen,
            y: ORIGIN.y + Math.cos(angle) * hookLen
        };
    }

    function tryCatch() {
        var tip = hookTip();
        var best = null;
        var bestD = 1e9;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it.alive) continue;
            var d = Math.hypot(it.x - tip.x, it.y - tip.y);
            if (d < it.size * 0.55 && d < bestD) {
                bestD = d;
                best = it;
            }
        }
        if (best) {
            best.alive = false;
            caught = best;
            phase = 'pull';
            return true;
        }
        return false;
    }

    function finishPull() {
        if (caught) {
            money += caught.value;
            if (money < 0) money = 0;
            caught = null;
            updateHud();
            if (money >= target) {
                levelWin();
                return;
            }
        }
        phase = 'swing';
        hookLen = 36;
    }

    function levelWin() {
        state = 'win';
        setStatus(tr('tools.goldminer.levelClear', { n: level }), 'is-win');
        cancelAnimationFrame(raf);
        raf = 0;
        setTimeout(function () {
            level += 1;
            state = 'playing';
            resetLevel(true);
            setStatus(tr('tools.goldminer.playing'), 'is-idle');
            lastTs = 0;
            raf = requestAnimationFrame(loop);
        }, 900);
    }

    function gameOver(reasonKey) {
        state = 'lose';
        setStatus(tr(reasonKey), 'is-lose');
        cancelAnimationFrame(raf);
        raf = 0;
    }

    function dropClaw() {
        if (state !== 'playing' || phase !== 'swing') return;
        phase = 'shoot';
    }

    function update(dt) {
        if (state !== 'playing') return;

        timerAcc += dt;
        if (timerAcc >= 0.25) {
            timeLeft -= timerAcc;
            timerAcc = 0;
            updateHud();
            if (timeLeft <= 0) {
                if (money >= target) levelWin();
                else gameOver('tools.goldminer.timeUp');
                return;
            }
        }

        if (phase === 'swing') {
            angle += angleDir * SWING_SPEED * (dt * 60);
            if (angle > angleMax) { angle = angleMax; angleDir = -1; }
            if (angle < angleMin) { angle = angleMin; angleDir = 1; }
        } else if (phase === 'shoot') {
            hookLen += SHOOT_SPEED * (dt * 60);
            if (tryCatch()) {
                /* hooked an item */
            } else {
                var tip = hookTip();
                if (tip.x < 8 || tip.x > W - 8 || tip.y > H - 12 || hookLen >= MAX_LEN) {
                    phase = 'pull';
                }
            }
        } else if (phase === 'pull') {
            var speed = BASE_RETRACT / (caught ? caught.weight : 1);
            hookLen -= speed * (dt * 60);
            if (caught) {
                var tip3 = hookTip();
                caught.x = tip3.x;
                caught.y = tip3.y;
            }
            if (hookLen <= 36) {
                hookLen = 36;
                finishPull();
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // sky / ground already in CSS bg; fill soft ground overlay
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(0, 0, W, 96);

        // miner
        ctx.font = '36px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧑‍⛏️', ORIGIN.x, 28);

        // rope + hook
        var tip = hookTip();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ORIGIN.x, ORIGIN.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.font = '22px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.fillText('🪝', tip.x, tip.y);

        // items
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it.alive && it !== caught) continue;
            ctx.font = it.size + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
            ctx.fillText(it.emoji, it.x, it.y);
        }

        if (state === 'idle') {
            ctx.fillStyle = 'rgba(15,23,42,0.45)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = '600 18px system-ui,sans-serif';
            ctx.fillText(tr('tools.goldminer.tapStart'), W / 2, H / 2);
        }
    }

    function loop(ts) {
        if (!lastTs) lastTs = ts;
        var dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        update(dt);
        draw();
        if (state === 'playing') raf = requestAnimationFrame(loop);
    }

    function startGame(fromScratch) {
        cancelAnimationFrame(raf);
        raf = 0;
        if (fromScratch) {
            level = 1;
            money = 0;
        }
        state = 'playing';
        resetLevel(false);
        setStatus(tr('tools.goldminer.playing'), 'is-idle');
        lastTs = 0;
        raf = requestAnimationFrame(loop);
    }

    function newGame() {
        startGame(true);
    }

    startBtn.addEventListener('click', function () {
        if (state === 'playing') return;
        startGame(true);
    });
    restartBtn.addEventListener('click', newGame);
    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state === 'idle' || state === 'lose' || state === 'win') {
            if (state !== 'win') startGame(true);
            return;
        }
        dropClaw();
    });

    resetLevel(false);
    draw();
    setStatus(tr('tools.goldminer.hint'), 'is-idle');
})();
