(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    if (audio) audio.boot('catchy');
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }

    var KEY = 'tbc_whack_lv_v1';
    var grid = document.getElementById('grid'), holes = [], score = 0, time = 30, level = 1, goal = 50;
    var playing = false, timers = [], bestLv = 1;
    try { bestLv = Math.max(1, +JSON.parse(localStorage.getItem(KEY) || '{}').bestLv || 1); } catch (e) {}

    function setStatus(m, c) {
        var el = document.getElementById('status');
        el.textContent = m;
        el.className = 'game-status' + (c ? ' ' + c : '');
    }
    function cfg(lv) {
        return {
            time: Math.max(14, 32 - lv * 2),
            goal: 40 + lv * 25,
            hide: Math.max(320, 900 - lv * 50),
            gap: Math.max(220, 520 - lv * 35)
        };
    }
    function hud() {
        document.getElementById('score').textContent = score;
        document.getElementById('time').textContent = time;
        var lvEl = document.getElementById('level');
        if (lvEl) lvEl.textContent = level;
        var gEl = document.getElementById('goal');
        if (gEl) gEl.textContent = goal;
    }
    function saveBest() {
        if (level > bestLv) {
            bestLv = level;
            try { localStorage.setItem(KEY, JSON.stringify({ bestLv: bestLv })); } catch (e) {}
        }
    }

    for (var i = 0; i < 9; i++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'whack-hole'; b.textContent = '🕳️'; b.dataset.i = i;
        b.onclick = function () {
            if (!playing || this.dataset.up !== '1') return;
            play('hit'); score += 10; this.dataset.up = '0'; this.textContent = '🕳️'; hud();
            if (score >= goal) clearLevel();
        };
        grid.appendChild(b); holes.push(b);
    }

    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function pop() {
        if (!playing) return;
        var c = cfg(level);
        var h = holes[(Math.random() * 9) | 0];
        h.dataset.up = '1'; h.textContent = Math.random() < 0.12 + level * 0.01 ? '🐰' : '🐹';
        timers.push(setTimeout(function () {
            if (h.dataset.up === '1') { h.dataset.up = '0'; h.textContent = '🕳️'; }
        }, c.hide + Math.random() * 200));
        timers.push(setTimeout(pop, c.gap + Math.random() * 180));
    }

    function clearLevel() {
        playing = false; clearTimers();
        play('level');
        saveBest();
        setStatus(tr('tools.whack.levelClear', { n: level }), 'is-win');
        timers.push(setTimeout(function () { startLevel(level + 1, true); }, 900));
    }

    function startLevel(lv, keepScore) {
        play('start');
        clearTimers();
        level = lv;
        var c = cfg(level);
        goal = c.goal;
        time = c.time;
        if (!keepScore) score = 0;
        playing = true;
        hud();
        setStatus(tr('tools.whack.levelStart', { n: level, goal: goal }), 'is-idle');
        holes.forEach(function (h) { h.dataset.up = '0'; h.textContent = '🕳️'; });
        pop();
        var tick = setInterval(function () {
            if (!playing) { clearInterval(tick); return; }
            time -= 1; hud();
            if (time <= 0) {
                playing = false; clearTimers(); clearInterval(tick);
                if (score >= goal) clearLevel();
                else {
                    play('lose');
                    setStatus(tr('tools.whack.fail', { n: level, score: score, goal: goal }), 'is-lose');
                }
            }
        }, 1000);
        timers.push(tick);
    }

    document.getElementById('restart-btn').onclick = function () { startLevel(1, false); };
    setStatus(tr('tools.whack.hint'), 'is-idle');
    hud();
})();
