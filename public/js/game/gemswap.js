(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var GRID = 8;
    var TYPES = 5;
    var SWAP_MS = 360;
    var CLEAR_MS = 300;
    var FALL_MS = 340;
    var KEY = 'tbc_gemswap_lv_v1';

    var boardEl = document.getElementById('board');
    var scoreEl = document.getElementById('score');
    var levelEl = document.getElementById('level');
    var goalEl = document.getElementById('goal');
    var movesEl = document.getElementById('moves');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var hintBtn = document.getElementById('hint-btn');
    var audio = window.GameAudio;

    var gems = [];
    var score = 0;
    var level = 1;
    var goal = 300;
    var movesLeft = 30;
    var bestLv = 1;
    var selected = -1;
    var busy = false;
    var cleared = false;
    var gemSize = 40;
    var gap = 3;
    try { bestLv = Math.max(1, +JSON.parse(localStorage.getItem(KEY) || '{}').bestLv || 1); } catch (e) {}

    if (audio) audio.boot('upbeat');

    function play(name) {
        if (audio) audio.sfx(name);
    }

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function cfg(lv) {
        return {
            types: Math.min(7, 4 + Math.floor((lv - 1) / 2)),
            goal: 250 + lv * 120,
            moves: Math.max(16, 34 - lv)
        };
    }

    function hud() {
        scoreEl.textContent = String(score);
        if (levelEl) levelEl.textContent = String(level);
        if (goalEl) goalEl.textContent = String(goal);
        if (movesEl) movesEl.textContent = String(movesLeft);
    }

    function saveBest() {
        if (level > bestLv) {
            bestLv = level;
            try { localStorage.setItem(KEY, JSON.stringify({ bestLv: bestLv })); } catch (e) {}
        }
    }

    function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function idx(x, y) { return y * GRID + x; }
    function xy(i) { return { x: i % GRID, y: Math.floor(i / GRID) }; }

    function cellLeft(x) { return x * gemSize + gap; }
    function cellTop(y) { return y * gemSize + gap; }
    function gemPixel(size) { return size - gap * 2; }

    function randomType(x, y, board) {
        var type;
        do {
            type = 1 + Math.floor(Math.random() * TYPES);
        } while (
            (x >= 2 && board[idx(x - 1, y)] === type && board[idx(x - 2, y)] === type) ||
            (y >= 2 && board[idx(x, y - 1)] === type && board[idx(x, y - 2)] === type)
        );
        return type;
    }

    function generateBoard() {
        var board = new Array(GRID * GRID);
        for (var y = 0; y < GRID; y++) {
            for (var x = 0; x < GRID; x++) {
                board[idx(x, y)] = randomType(x, y, board);
            }
        }
        return board;
    }

    function findMatches(board) {
        var matched = new Set();
        var x, y, i, run;
        for (y = 0; y < GRID; y++) {
            run = 1;
            for (x = 1; x <= GRID; x++) {
                if (x < GRID && board[idx(x, y)] === board[idx(x - 1, y)] && board[idx(x, y)] !== 0) {
                    run++;
                } else {
                    if (run >= 3) {
                        for (i = 0; i < run; i++) matched.add(idx(x - 1 - i, y));
                    }
                    run = 1;
                }
            }
        }
        for (x = 0; x < GRID; x++) {
            run = 1;
            for (y = 1; y <= GRID; y++) {
                if (y < GRID && board[idx(x, y)] === board[idx(x, y - 1)] && board[idx(x, y)] !== 0) {
                    run++;
                } else {
                    if (run >= 3) {
                        for (i = 0; i < run; i++) matched.add(idx(x, y - 1 - i));
                    }
                    run = 1;
                }
            }
        }
        return matched;
    }

    function wouldMatch(board) {
        return findMatches(board).size > 0;
    }

    function adjacent(a, b) {
        var pa = xy(a);
        var pb = xy(b);
        return (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y)) === 1;
    }

    function measure() {
        var size = boardEl.clientWidth || 320;
        gemSize = size / GRID;
    }

    function render(opts) {
        opts = opts || {};
        measure();
        var px = gemPixel(gemSize);
        boardEl.innerHTML = '';
        for (var i = 0; i < gems.length; i++) {
            if (!gems[i]) continue;
            var p = xy(i);
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'gem gem-type-' + gems[i] + (selected === i ? ' is-selected' : '');
            el.style.width = px + 'px';
            el.style.height = px + 'px';
            el.style.left = cellLeft(p.x) + 'px';
            el.style.top = cellTop(p.y) + 'px';
            if (opts.fromAbove) {
                el.style.top = cellTop(p.y - GRID) + 'px';
                el.classList.add('is-falling');
            }
            el.dataset.index = String(i);
            boardEl.appendChild(el);
        }
        if (opts.fromAbove) {
            // force reflow then drop into place
            void boardEl.offsetHeight;
            Array.prototype.forEach.call(boardEl.children, function (el) {
                var i = Number(el.dataset.index);
                var p = xy(i);
                el.style.top = cellTop(p.y) + 'px';
            });
        }
    }

    function gemEl(i) {
        return boardEl.querySelector('.gem[data-index="' + i + '"]');
    }

    function animateSwap(a, b) {
        var ea = gemEl(a);
        var eb = gemEl(b);
        if (!ea || !eb) return Promise.resolve();
        var pa = xy(a);
        var pb = xy(b);
        ea.classList.add('is-swapping');
        eb.classList.add('is-swapping');
        ea.style.left = cellLeft(pb.x) + 'px';
        ea.style.top = cellTop(pb.y) + 'px';
        eb.style.left = cellLeft(pa.x) + 'px';
        eb.style.top = cellTop(pa.y) + 'px';
        return wait(SWAP_MS).then(function () {
            ea.classList.remove('is-swapping');
            eb.classList.remove('is-swapping');
        });
    }

    function animateClear(matched) {
        matched.forEach(function (i) {
            var el = gemEl(i);
            if (el) el.classList.add('is-clearing');
        });
        return wait(CLEAR_MS);
    }

    function planCollapse(board) {
        var next = board.slice();
        var moves = []; // {from,to,type,isNew}
        var x, y, write, fromY;
        for (x = 0; x < GRID; x++) {
            var stack = [];
            for (y = GRID - 1; y >= 0; y--) {
                if (board[idx(x, y)]) stack.push({ y: y, type: board[idx(x, y)] });
            }
            write = GRID - 1;
            for (var s = 0; s < stack.length; s++) {
                fromY = stack[s].y;
                next[idx(x, write)] = stack[s].type;
                if (fromY !== write) {
                    moves.push({ from: idx(x, fromY), to: idx(x, write), type: stack[s].type, isNew: false });
                } else {
                    moves.push({ from: idx(x, fromY), to: idx(x, write), type: stack[s].type, isNew: false, stay: true });
                }
                write--;
            }
            var spawned = 0;
            while (write >= 0) {
                var type = 1 + Math.floor(Math.random() * TYPES);
                next[idx(x, write)] = type;
                moves.push({
                    from: idx(x, -1 - spawned),
                    to: idx(x, write),
                    type: type,
                    isNew: true,
                    spawnX: x,
                    spawnOffset: spawned + 1
                });
                spawned++;
                write--;
            }
        }
        return { next: next, moves: moves };
    }

    function animateFall(plan) {
        measure();
        var px = gemPixel(gemSize);
        boardEl.innerHTML = '';
        plan.moves.forEach(function (m) {
            var to = xy(m.to);
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'gem gem-type-' + m.type + ' is-falling';
            el.style.width = px + 'px';
            el.style.height = px + 'px';
            el.dataset.index = String(m.to);
            if (m.isNew) {
                el.style.left = cellLeft(m.spawnX) + 'px';
                el.style.top = cellTop(-m.spawnOffset) + 'px';
            } else {
                var from = xy(m.from);
                el.style.left = cellLeft(from.x) + 'px';
                el.style.top = cellTop(from.y) + 'px';
            }
            boardEl.appendChild(el);
        });
        void boardEl.offsetHeight;
        Array.prototype.forEach.call(boardEl.children, function (el) {
            var to = xy(Number(el.dataset.index));
            el.style.left = cellLeft(to.x) + 'px';
            el.style.top = cellTop(to.y) + 'px';
        });
        return wait(FALL_MS);
    }

    function resolveMatchesAnimated() {
        return new Promise(function (resolve) {
            function step() {
                var matched = findMatches(gems);
                if (!matched.size) {
                    render();
                    resolve();
                    return;
                }
                score += matched.size * 10;
                hud();
                play('match');
                animateClear(matched).then(function () {
                    matched.forEach(function (i) { gems[i] = 0; });
                    var plan = planCollapse(gems);
                    gems = plan.next;
                    return animateFall(plan);
                }).then(function () {
                    render();
                    return wait(40);
                }).then(step);
            }
            step();
        });
    }

    function trySwap(a, b) {
        if (!adjacent(a, b) || busy) return;
        busy = true;
        selected = -1;

        var snapshot = gems.slice();
        var tmp = gems[a];
        gems[a] = gems[b];
        gems[b] = tmp;
        var valid = wouldMatch(gems);
        // revert data for visual swap from current DOM positions first
        gems = snapshot;

        play('swap');
        animateSwap(a, b).then(function () {
            if (!valid) {
                // swap back visually
                return animateSwap(a, b).then(function () {
                    selected = -1;
                    busy = false;
                    play('invalid');
                    setStatus(tr('tools.gemswap.invalidSwap'), 'is-lose');
                    render();
                });
            }
            movesLeft -= 1;
            hud();
            tmp = gems[a];
            gems[a] = gems[b];
            gems[b] = tmp;
            render();
            setStatus(tr('tools.gemswap.hintPlay'), 'is-idle');
            return resolveMatchesAnimated().then(function () {
                busy = false;
                if (cleared) return;
                if (score >= goal) {
                    clearLevel();
                    return;
                }
                if (movesLeft <= 0) {
                    play('lose');
                    setStatus(tr('tools.gemswap.outOfMoves', { n: score }), 'is-lose');
                    return;
                }
                if (!findHint()) {
                    play('lose');
                    setStatus(tr('tools.gemswap.noMoves'), 'is-lose');
                }
            });
        }).catch(function () {
            busy = false;
            render();
        });
    }

    function clearLevel() {
        if (cleared) return;
        cleared = true;
        busy = true;
        saveBest();
        play('level');
        setStatus(tr('tools.gemswap.levelClear', { n: level }), 'is-win');
        setTimeout(function () { startLevel(level + 1, true); }, 900);
    }

    function findHint() {
        var i, j, tmp;
        for (i = 0; i < gems.length; i++) {
            var p = xy(i);
            var neighbors = [];
            if (p.x < GRID - 1) neighbors.push(idx(p.x + 1, p.y));
            if (p.y < GRID - 1) neighbors.push(idx(p.x, p.y + 1));
            for (j = 0; j < neighbors.length; j++) {
                var n = neighbors[j];
                tmp = gems[i]; gems[i] = gems[n]; gems[n] = tmp;
                var ok = wouldMatch(gems);
                tmp = gems[i]; gems[i] = gems[n]; gems[n] = tmp;
                if (ok) return [i, n];
            }
        }
        return null;
    }

    function clearInitialMatchesSync() {
        var guard = 0;
        while (guard++ < 40) {
            var matched = findMatches(gems);
            if (!matched.size) break;
            matched.forEach(function (i) { gems[i] = 0; });
            var plan = planCollapse(gems);
            gems = plan.next;
        }
    }

    function startLevel(lv, keepScore) {
        busy = false;
        cleared = false;
        selected = -1;
        level = lv;
        var c = cfg(level);
        TYPES = c.types;
        goal = c.goal;
        movesLeft = c.moves;
        if (!keepScore) score = 0;
        gems = generateBoard();
        clearInitialMatchesSync();
        hud();
        play('start');
        setStatus(tr('tools.gemswap.levelStart', { n: level, goal: goal, moves: movesLeft }), 'is-idle');
        render();
    }

    function newGame() {
        startLevel(1, false);
    }

    boardEl.addEventListener('click', function (e) {
        if (busy) return;
        var el = e.target.closest('.gem');
        if (!el) return;
        var i = Number(el.dataset.index);
        if (selected < 0) {
            selected = i;
            play('select');
            setStatus(tr('tools.gemswap.hintPlay'), 'is-idle');
            render();
            return;
        }
        if (selected === i) {
            selected = -1;
            play('click');
            render();
            return;
        }
        trySwap(selected, i);
    });

    hintBtn.addEventListener('click', function () {
        if (busy) return;
        var h = findHint();
        if (!h) {
            play('invalid');
            setStatus(tr('tools.gemswap.noMoves'), 'is-lose');
            return;
        }
        selected = h[0];
        play('select');
        setStatus(tr('tools.gemswap.hintFound'), 'is-idle');
        render();
        var second = gemEl(h[1]);
        if (second) second.classList.add('is-selected');
    });

    restartBtn.addEventListener('click', newGame);
    window.addEventListener('resize', function () {
        if (!busy) render();
    });
    newGame();
})();
