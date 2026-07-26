(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    function armAudio() { if (audio && audio.unlock) audio.unlock(); }
    if (audio) audio.boot('catchy');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;

    var moneyEl = document.getElementById('money');
    var leftEl = document.getElementById('left');
    var levelEl = document.getElementById('level');
    var timeEl = document.getElementById('time');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');

    /** Base item types — spawn weights scaled by level. */
    var ITEM_TYPES = [
        { emoji: '💰', value: 100, mass: 1.2, size: 28, kind: 'gold' },
        { emoji: '💰', value: 250, mass: 1.7, size: 36, kind: 'gold' },
        { emoji: '💰', value: 500, mass: 2.4, size: 44, kind: 'gold' },
        { emoji: '💎', value: 600, mass: 0.65, size: 26, kind: 'gem' },
        { emoji: '🪨', value: 20, mass: 2.6, size: 34, kind: 'rock' },
        { emoji: '💣', value: -150, mass: 1.0, size: 28, kind: 'bomb' }
    ];

    var ORIGIN = { x: W / 2, y: 52 };
    var MAX_LEN = H - 80;
    var SWING_BASE = 0.028 / 3;
    var SHOOT_SPEED = 7;
    var BASE_RETRACT = 5;

    var state = 'idle'; // idle | playing | win | lose
    var level = 1;
    var money = 0;
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
    var statusResetTimer = 0;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function flashStatus(msg, cls, ms) {
        setStatus(msg, cls);
        clearTimeout(statusResetTimer);
        statusResetTimer = setTimeout(function () {
            if (state === 'playing') setStatus(tr('tools.goldminer.playing'), 'is-idle');
        }, ms || 1200);
    }

    /** Loot left to clear (bombs do not count). */
    function remainingLoot() {
        var n = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].alive && items[i].kind !== 'bomb') n++;
        }
        // Item currently on the hook still counts until finishPull
        if (caught && caught.kind !== 'bomb') n++;
        return n;
    }

    function updateHud() {
        moneyEl.textContent = String(money);
        if (leftEl) leftEl.textContent = String(remainingLoot());
        levelEl.textContent = String(level);
        timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
    }

    function swingSpeed() {
        // Slightly faster swing each level → harder to aim
        return SWING_BASE * (1 + (level - 1) * 0.07);
    }

    function retractSpeed() {
        // Slightly slower pull each level
        return BASE_RETRACT / (1 + (level - 1) * 0.05);
    }

    function spawnChance(kind) {
        // Higher levels: more rocks/bombs, fewer easy golds/gems
        var t = Math.min(level - 1, 8);
        if (kind === 'gold') return Math.max(0.28, 0.55 - t * 0.03);
        if (kind === 'gem') return Math.max(0.05, 0.12 - t * 0.008);
        if (kind === 'rock') return Math.min(0.4, 0.22 + t * 0.02);
        if (kind === 'bomb') return Math.min(0.18, 0.06 + t * 0.012);
        return 0.1;
    }

    function pickType() {
        var pool = [];
        var i;
        for (i = 0; i < ITEM_TYPES.length; i++) {
            var t = ITEM_TYPES[i];
            var w = spawnChance(t.kind);
            // Split gold chance across gold variants
            if (t.kind === 'gold') w = w / 3;
            pool.push({ t: t, w: w });
        }
        var sum = 0;
        for (i = 0; i < pool.length; i++) sum += pool[i].w;
        var r = Math.random() * sum;
        var acc = 0;
        for (i = 0; i < pool.length; i++) {
            acc += pool[i].w;
            if (r <= acc) return pool[i].t;
        }
        return ITEM_TYPES[0];
    }

    function placeItem(t) {
        var tries = 0;
        while (tries < 80) {
            tries++;
            var x = 40 + Math.random() * (W - 80);
            var y = 140 + Math.random() * (H - 200);
            var ok = true;
            for (var i = 0; i < items.length; i++) {
                if (Math.hypot(items[i].x - x, items[i].y - y) < 50) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            items.push({
                emoji: t.emoji,
                value: t.value,
                mass: t.mass,
                size: t.size,
                kind: t.kind,
                x: x,
                y: y,
                alive: true
            });
            return true;
        }
        return false;
    }

    function spawnItems() {
        items = [];
        var count = 8 + Math.min(level, 7);
        var tries = 0;
        while (items.length < count && tries < 220) {
            tries++;
            placeItem(pickType());
        }
        // Guarantee at least some clearable loot (bombs alone cannot clear a level)
        var loot = 0;
        for (var j = 0; j < items.length; j++) {
            if (items[j].kind !== 'bomb') loot++;
        }
        while (loot < 5) {
            if (!placeItem(ITEM_TYPES[Math.floor(Math.random() * 4)])) break; // gold/gem only
            loot++;
        }
    }

    function resetLevel(keepMoney) {
        if (!keepMoney) money = 0;
        // More items + less time each level
        timeLeft = Math.max(40, 75 - level * 3);
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

    function drawHook(x, y, ang) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#d97706';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 10);
        ctx.quadraticCurveTo(0, 18, 9, 17);
        ctx.quadraticCurveTo(12, 16, 11, 12);
        ctx.stroke();
        ctx.restore();
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
            if (caught.kind === 'bomb') {
                // Bomb: big score penalty (classic casual rule) + feedback
                money = Math.max(0, money + caught.value);
                play('hit');
                flashStatus(tr('tools.goldminer.bombHit', { n: Math.abs(caught.value) }), 'is-lose', 1400);
            } else {
                money += caught.value;
                play(caught.kind === 'gem' ? 'level' : 'match');
                if (caught.kind === 'rock') {
                    flashStatus(tr('tools.goldminer.rockHit'), 'is-idle', 900);
                }
            }
            caught = null;
            updateHud();
            // Clear all loot (gold/gem/rock); bombs may remain
            if (remainingLoot() === 0) {
                levelWin();
                return;
            }
        }
        phase = 'swing';
        hookLen = 36;
    }

    function levelWin() {
        state = 'win';
        play('win');
        setStatus(tr('tools.goldminer.levelClear', { n: level }), 'is-win');
        cancelAnimationFrame(raf);
        raf = 0;
        setTimeout(function () {
            level += 1;
            state = 'playing';
            resetLevel(true); // keep score across levels
            setStatus(tr('tools.goldminer.playing'), 'is-idle');
            lastTs = 0;
            raf = requestAnimationFrame(loop);
        }, 1000);
    }

    function gameOver(reasonKey) {
        play('lose');
        state = 'lose';
        setStatus(tr(reasonKey), 'is-lose');
        cancelAnimationFrame(raf);
        raf = 0;
    }

    function dropClaw() {
        if (state !== 'playing' || phase !== 'swing') return;
        play('click');
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
                if (remainingLoot() === 0) levelWin();
                else gameOver('tools.goldminer.timeUp');
                return;
            }
        }

        if (phase === 'swing') {
            angle += angleDir * swingSpeed() * (dt * 60);
            if (angle > angleMax) { angle = angleMax; angleDir = -1; }
            if (angle < angleMin) { angle = angleMin; angleDir = 1; }
        } else if (phase === 'shoot') {
            hookLen += SHOOT_SPEED * (dt * 60);
            if (!tryCatch()) {
                var tip = hookTip();
                if (tip.x < 8 || tip.x > W - 8 || tip.y > H - 12 || hookLen >= MAX_LEN) {
                    phase = 'pull';
                }
            }
        } else if (phase === 'pull') {
            var speed = retractSpeed() / (caught ? caught.mass : 1);
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

        var skyH = 96;
        ctx.fillStyle = '#7ec8e8';
        ctx.fillRect(0, 0, W, skyH);
        var dirt = ctx.createLinearGradient(0, skyH, 0, H);
        dirt.addColorStop(0, '#e8d4a8');
        dirt.addColorStop(0.45, '#d2b48c');
        dirt.addColorStop(1, '#b8956a');
        ctx.fillStyle = dirt;
        ctx.fillRect(0, skyH, W, H - skyH);

        ctx.font = '36px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧑‍⛏️', ORIGIN.x, 28);

        var tip = hookTip();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ORIGIN.x, ORIGIN.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        drawHook(tip.x, tip.y, angle);

        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it.alive && it !== caught) continue;
            var r = it.size * 0.55;
            ctx.beginPath();
            ctx.arc(it.x, it.y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(15,23,42,0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
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
        armAudio();
        play('start');
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

    restartBtn.addEventListener('click', function () {
        armAudio();
        startGame(true);
    });
    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        armAudio();
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
