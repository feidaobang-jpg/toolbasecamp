(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var GRID = 8;
    var TYPES = 7;
    var boardEl = document.getElementById('board');
    var scoreEl = document.getElementById('score');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var hintBtn = document.getElementById('hint-btn');

    var gems = [];
    var score = 0;
    var selected = -1;
    var busy = false;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function idx(x, y) { return y * GRID + x; }
    function xy(i) { return { x: i % GRID, y: Math.floor(i / GRID) }; }

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

    function collapse(board) {
        var x, y, write;
        for (x = 0; x < GRID; x++) {
            write = GRID - 1;
            for (y = GRID - 1; y >= 0; y--) {
                if (board[idx(x, y)] !== 0) {
                    board[idx(x, write)] = board[idx(x, y)];
                    if (write !== y) board[idx(x, y)] = 0;
                    write--;
                }
            }
            for (y = write; y >= 0; y--) {
                board[idx(x, y)] = 1 + Math.floor(Math.random() * TYPES);
            }
        }
    }

    function resolveMatches() {
        var loops = 0;
        while (loops < 30) {
            var matched = findMatches(gems);
            if (!matched.size) break;
            score += matched.size * 10;
            scoreEl.textContent = String(score);
            matched.forEach(function (i) { gems[i] = 0; });
            collapse(gems);
            loops++;
        }
        render();
    }

    function adjacent(a, b) {
        var pa = xy(a);
        var pb = xy(b);
        return (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y)) === 1;
    }

    function wouldMatch(board) {
        return findMatches(board).size > 0;
    }

    function trySwap(a, b) {
        if (!adjacent(a, b) || busy) return;
        busy = true;
        var tmp = gems[a];
        gems[a] = gems[b];
        gems[b] = tmp;
        if (!wouldMatch(gems)) {
            tmp = gems[a];
            gems[a] = gems[b];
            gems[b] = tmp;
            selected = -1;
            busy = false;
            setStatus(tr('tools.gemswap.invalidSwap'), 'is-lose');
            render();
            return;
        }
        selected = -1;
        setStatus(tr('tools.gemswap.hintPlay'), 'is-idle');
        resolveMatches();
        busy = false;
        if (!findHint()) setStatus(tr('tools.gemswap.noMoves'), 'is-lose');
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

    function render() {
        var size = boardEl.clientWidth || 320;
        var gemSize = size / GRID;
        var gap = 3;
        boardEl.innerHTML = '';
        for (var i = 0; i < gems.length; i++) {
            var p = xy(i);
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'gem gem-type-' + gems[i] + (selected === i ? ' is-selected' : '');
            el.style.width = (gemSize - gap * 2) + 'px';
            el.style.height = (gemSize - gap * 2) + 'px';
            el.style.left = (p.x * gemSize + gap) + 'px';
            el.style.top = (p.y * gemSize + gap) + 'px';
            el.dataset.index = String(i);
            boardEl.appendChild(el);
        }
    }

    function newGame() {
        gems = generateBoard();
        score = 0;
        selected = -1;
        busy = false;
        scoreEl.textContent = '0';
        setStatus(tr('tools.gemswap.hintPlay'), 'is-idle');
        resolveMatches();
        score = 0;
        scoreEl.textContent = '0';
        render();
    }

    boardEl.addEventListener('click', function (e) {
        if (busy) return;
        var el = e.target.closest('.gem');
        if (!el) return;
        var i = Number(el.dataset.index);
        if (selected < 0) {
            selected = i;
            setStatus(tr('tools.gemswap.hintPlay'), 'is-idle');
            render();
            return;
        }
        if (selected === i) {
            selected = -1;
            render();
            return;
        }
        trySwap(selected, i);
    });

    hintBtn.addEventListener('click', function () {
        var h = findHint();
        if (!h) {
            setStatus(tr('tools.gemswap.noMoves'), 'is-lose');
            return;
        }
        selected = h[0];
        setStatus(tr('tools.gemswap.hintFound'), 'is-idle');
        render();
        var second = boardEl.querySelector('[data-index="' + h[1] + '"]');
        if (second) second.classList.add('is-selected');
    });

    restartBtn.addEventListener('click', newGame);
    window.addEventListener('resize', render);
    newGame();
})();
