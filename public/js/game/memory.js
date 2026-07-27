(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    if (audio) audio.boot('catchy');
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }

    var KEY = 'tbc_memory_lv_v1';
    var ALL = ['🐶', '🐱', '🐸', '🦊', '🐼', '🦁', '🐵', '🐷', '🐯', '🐮', '🐰', '🐻'];
    var LEVELS = [
        { pairs: 6, cols: 4 },
        { pairs: 8, cols: 4 },
        { pairs: 10, cols: 5 },
        { pairs: 12, cols: 6 }
    ];
    var grid = document.getElementById('grid'), cards = [], first = null, lock = false;
    var moves = 0, matched = 0, level = 1, pairNeed = 8, bestLv = 1;
    try { bestLv = Math.max(1, +JSON.parse(localStorage.getItem(KEY) || '{}').bestLv || 1); } catch (e) {}

    function setStatus(m, c) {
        var el = document.getElementById('status');
        el.textContent = m;
        el.className = 'game-status' + (c ? ' ' + c : '');
    }
    function hud() {
        document.getElementById('moves').textContent = moves;
        document.getElementById('matched').textContent = matched;
        var needEl = document.getElementById('pairNeed');
        if (needEl) needEl.textContent = pairNeed;
        var lvEl = document.getElementById('level');
        if (lvEl) lvEl.textContent = level;
    }
    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function saveBest() {
        if (level > bestLv) {
            bestLv = level;
            try { localStorage.setItem(KEY, JSON.stringify({ bestLv: bestLv })); } catch (e) {}
        }
    }

    function startLevel(lv) {
        play('start');
        level = Math.min(lv, LEVELS.length);
        var cfg = LEVELS[level - 1];
        pairNeed = cfg.pairs;
        var pool = shuffle(ALL.slice(0, pairNeed).concat(ALL.slice(0, pairNeed)));
        grid.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', 1fr)';
        grid.innerHTML = '';
        cards = []; first = null; lock = false; moves = 0; matched = 0; hud();
        setStatus(tr('tools.memory.levelStart', { n: level, pairs: pairNeed }), 'is-idle');
        pool.forEach(function (emoji, i) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'memory-card'; b.textContent = '?';
            b.dataset.emoji = emoji; b.dataset.i = i;
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
            a.classList.add('is-matched'); b.classList.add('is-matched');
            play('match'); matched++; hud(); lock = false;
            if (matched === pairNeed) {
                saveBest();
                play('win');
                if (level >= LEVELS.length) {
                    setStatus(tr('tools.memory.winAll', { n: moves }), 'is-win');
                } else {
                    setStatus(tr('tools.memory.levelClear', { n: level }), 'is-win');
                    setTimeout(function () { startLevel(level + 1); }, 850);
                }
            }
        } else {
            setTimeout(function () {
                a.classList.remove('is-flipped'); b.classList.remove('is-flipped');
                a.textContent = '?'; b.textContent = '?'; lock = false;
            }, Math.max(320, 550 - level * 30));
        }
    }

    document.getElementById('restart-btn').onclick = function () { startLevel(1); };
    startLevel(1);
})();
