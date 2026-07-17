(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var grid = document.getElementById('grid'), holes = [], score = 0, time = 30, playing = false, timers = [];
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('score').textContent = score; document.getElementById('time').textContent = time; }
    for (var i = 0; i < 9; i++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'whack-hole'; b.textContent = '🕳️'; b.dataset.i = i;
        b.onclick = function () {
            if (!playing || this.dataset.up !== '1') return;
            score += 10; this.dataset.up = '0'; this.textContent = '🕳️'; hud();
        };
        grid.appendChild(b); holes.push(b);
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function pop() {
        if (!playing) return;
        var h = holes[(Math.random() * 9) | 0];
        h.dataset.up = '1'; h.textContent = Math.random() < 0.15 ? '🐰' : '🐹';
        timers.push(setTimeout(function () { if (h.dataset.up === '1') { h.dataset.up = '0'; h.textContent = '🕳️'; } }, 700 + Math.random() * 400));
        timers.push(setTimeout(pop, 450 + Math.random() * 350));
    }
    function start() {
        clearTimers(); score = 0; time = 30; playing = true; hud();
        setStatus(tr('tools.whack.playing'), 'is-idle');
        holes.forEach(function (h) { h.dataset.up = '0'; h.textContent = '🕳️'; });
        pop();
        var tick = setInterval(function () {
            if (!playing) { clearInterval(tick); return; }
            time -= 1; hud();
            if (time <= 0) {
                playing = false; clearTimers(); clearInterval(tick);
                setStatus(tr('tools.whack.done', { n: score }), 'is-win');
            }
        }, 1000);
        timers.push(tick);
    }
    document.getElementById('start-btn').onclick = function () { if (!playing) start(); };
    document.getElementById('restart-btn').onclick = start;
    setStatus(tr('tools.whack.hint'), 'is-idle');
})();
