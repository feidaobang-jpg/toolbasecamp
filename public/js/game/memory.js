(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var EMOJIS = ['🐶', '🐱', '🐸', '🦊', '🐼', '🦁', '🐵', '🐷'];
    var grid = document.getElementById('grid'), cards = [], first = null, lock = false, moves = 0, matched = 0;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('moves').textContent = moves; document.getElementById('matched').textContent = matched; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function reset() {
        var pool = shuffle(EMOJIS.concat(EMOJIS));
        grid.innerHTML = ''; cards = []; first = null; lock = false; moves = 0; matched = 0; hud();
        setStatus(tr('tools.memory.hint'), 'is-idle');
        pool.forEach(function (emoji, i) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'memory-card'; b.textContent = '?'; b.dataset.emoji = emoji; b.dataset.i = i;
            b.onclick = onFlip; grid.appendChild(b); cards.push(b);
        });
    }
    function onFlip() {
        if (lock || this.classList.contains('is-flipped') || this.classList.contains('is-matched')) return;
        this.classList.add('is-flipped'); this.textContent = this.dataset.emoji;
        if (!first) { first = this; return; }
        moves++; hud(); lock = true;
        var a = first, b = this; first = null;
        if (a.dataset.emoji === b.dataset.emoji) {
            a.classList.add('is-matched'); b.classList.add('is-matched'); matched++; hud(); lock = false;
            if (matched === 8) setStatus(tr('tools.memory.win', { n: moves }), 'is-win');
        } else {
            setTimeout(function () {
                a.classList.remove('is-flipped'); b.classList.remove('is-flipped');
                a.textContent = '?'; b.textContent = '?'; lock = false;
            }, 550);
        }
    }
    document.getElementById('restart-btn').onclick = reset;
    reset();
})();
