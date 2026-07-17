(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    /** Inner playable size; board is padded with empty border. */
    var ROWS = 8;
    var COLS = 10;
    var PAD = 1;
    var TOTAL_R = ROWS + PAD * 2;
    var TOTAL_C = COLS + PAD * 2;
    var CLEAR_MS = 280;
    var PATH_MS = 320;
    var TILES = [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
        '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔'
    ];

    var boardEl = document.getElementById('board');
    var gridEl = document.getElementById('grid');
    var pathLayer = document.getElementById('path-layer');
    var scoreEl = document.getElementById('score');
    var pairsEl = document.getElementById('pairs');
    var statusEl = document.getElementById('status');
    var hintBtn = document.getElementById('hint-btn');
    var shuffleBtn = document.getElementById('shuffle-btn');
    var restartBtn = document.getElementById('restart-btn');

    /** @type {(string|null)[][]} */
    var grid = [];
    var score = 0;
    var selected = null;
    var busy = false;
    var won = false;
    /** @type {HTMLElement[][]} */
    var cellEls = [];

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }

    function emptyGrid() {
        var g = [];
        for (var r = 0; r < TOTAL_R; r++) {
            g[r] = [];
            for (var c = 0; c < TOTAL_C; c++) {
                g[r][c] = null;
            }
        }
        return g;
    }

    function pairsLeft() {
        var n = 0;
        for (var r = PAD; r < PAD + ROWS; r++) {
            for (var c = PAD; c < PAD + COLS; c++) {
                if (grid[r][c]) n++;
            }
        }
        return n / 2;
    }

    function updateStats() {
        scoreEl.textContent = String(score);
        pairsEl.textContent = String(pairsLeft());
    }

    function buildPool() {
        var need = ROWS * COLS;
        if (need % 2 !== 0) need -= 1;
        var pool = [];
        var i = 0;
        while (pool.length < need) {
            var emoji = TILES[i % TILES.length];
            pool.push(emoji, emoji);
            i++;
        }
        return shuffle(pool);
    }

    function fillInner(pool) {
        var idx = 0;
        for (var r = PAD; r < PAD + ROWS; r++) {
            for (var c = PAD; c < PAD + COLS; c++) {
                grid[r][c] = pool[idx++] || null;
            }
        }
    }

    function renderBoard() {
        gridEl.style.gridTemplateColumns = 'repeat(' + TOTAL_C + ', minmax(0, 1fr))';
        gridEl.innerHTML = '';
        cellEls = [];
        for (var r = 0; r < TOTAL_R; r++) {
            cellEls[r] = [];
            for (var c = 0; c < TOTAL_C; c++) {
                var el = document.createElement('button');
                el.type = 'button';
                el.className = 'llk-cell';
                el.dataset.r = String(r);
                el.dataset.c = String(c);
                var val = grid[r][c];
                if (val) {
                    el.classList.add('is-tile');
                    el.textContent = val;
                    el.setAttribute('aria-label', val);
                } else {
                    el.classList.add('is-empty');
                    el.disabled = true;
                    el.setAttribute('aria-hidden', 'true');
                }
                el.addEventListener('click', onCellClick);
                gridEl.appendChild(el);
                cellEls[r][c] = el;
            }
        }
        clearPath();
        clearSelectionUi();
        clearHintUi();
    }

    function clearSelectionUi() {
        gridEl.querySelectorAll('.llk-cell.is-selected').forEach(function (el) {
            el.classList.remove('is-selected');
        });
    }

    function clearHintUi() {
        gridEl.querySelectorAll('.llk-cell.is-hint').forEach(function (el) {
            el.classList.remove('is-hint');
        });
    }

    function clearPath() {
        while (pathLayer.firstChild) pathLayer.removeChild(pathLayer.firstChild);
    }

    function cellCenter(r, c) {
        var el = cellEls[r][c];
        var boardRect = boardEl.getBoundingClientRect();
        var rect = el.getBoundingClientRect();
        return {
            x: rect.left - boardRect.left + rect.width / 2,
            y: rect.top - boardRect.top + rect.height / 2
        };
    }

    function drawPath(points) {
        clearPath();
        if (!points || points.length < 2) return;
        var pts = points.map(function (p) {
            var center = cellCenter(p.r, p.c);
            return center.x + ',' + center.y;
        }).join(' ');
        var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', pts);
        pathLayer.appendChild(poly);
    }

    function isEmpty(r, c) {
        if (r < 0 || c < 0 || r >= TOTAL_R || c >= TOTAL_C) return false;
        return grid[r][c] === null;
    }

    /** Straight line between two cells; intermediates must be empty. Endpoints may be occupied. */
    function clearLine(r1, c1, r2, c2) {
        if (r1 === r2) {
            var minC = Math.min(c1, c2);
            var maxC = Math.max(c1, c2);
            for (var c = minC + 1; c < maxC; c++) {
                if (!isEmpty(r1, c)) return false;
            }
            return true;
        }
        if (c1 === c2) {
            var minR = Math.min(r1, r2);
            var maxR = Math.max(r1, r2);
            for (var r = minR + 1; r < maxR; r++) {
                if (!isEmpty(r, c1)) return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Find path with at most 2 turns (0–2 corners).
     * @returns {{r:number,c:number}[]|null}
     */
    function findPath(r1, c1, r2, c2) {
        if (r1 === r2 && c1 === c2) return null;
        if (grid[r1][c1] === null || grid[r2][c2] === null) return null;
        if (grid[r1][c1] !== grid[r2][c2]) return null;

        // 0 turns
        if (clearLine(r1, c1, r2, c2)) {
            return [{ r: r1, c: c1 }, { r: r2, c: c2 }];
        }

        // 1 turn
        var corners1 = [
            { r: r1, c: c2 },
            { r: r2, c: c1 }
        ];
        for (var i = 0; i < corners1.length; i++) {
            var m = corners1[i];
            if ((m.r === r1 && m.c === c1) || (m.r === r2 && m.c === c2)) continue;
            if (!isEmpty(m.r, m.c)) continue;
            if (clearLine(r1, c1, m.r, m.c) && clearLine(m.r, m.c, r2, c2)) {
                return [{ r: r1, c: c1 }, m, { r: r2, c: c2 }];
            }
        }

        // 2 turns: via empty cell on same row as start, then to target row
        var r;
        var c;
        for (c = 0; c < TOTAL_C; c++) {
            if (!isEmpty(r1, c)) continue;
            if (!clearLine(r1, c1, r1, c)) continue;
            if (isEmpty(r2, c) && clearLine(r1, c, r2, c) && clearLine(r2, c, r2, c2)) {
                return [{ r: r1, c: c1 }, { r: r1, c: c }, { r: r2, c: c }, { r: r2, c: c2 }];
            }
        }

        for (r = 0; r < TOTAL_R; r++) {
            if (!isEmpty(r, c1)) continue;
            if (!clearLine(r1, c1, r, c1)) continue;
            if (isEmpty(r, c2) && clearLine(r, c1, r, c2) && clearLine(r, c2, r2, c2)) {
                return [{ r: r1, c: c1 }, { r: r, c: c1 }, { r: r, c: c2 }, { r: r2, c: c2 }];
            }
        }

        return null;
    }

    function hasAnyMove() {
        var cells = [];
        for (var r = PAD; r < PAD + ROWS; r++) {
            for (var c = PAD; c < PAD + COLS; c++) {
                if (grid[r][c]) cells.push({ r: r, c: c, v: grid[r][c] });
            }
        }
        for (var i = 0; i < cells.length; i++) {
            for (var j = i + 1; j < cells.length; j++) {
                if (cells[i].v !== cells[j].v) continue;
                if (findPath(cells[i].r, cells[i].c, cells[j].r, cells[j].c)) {
                    return { a: cells[i], b: cells[j] };
                }
            }
        }
        return null;
    }

    function newGame() {
        grid = emptyGrid();
        fillInner(buildPool());
        score = 0;
        selected = null;
        busy = false;
        won = false;
        renderBoard();
        updateStats();
        setStatus('', 'is-idle');
        ensureSolvable();
    }

    function ensureSolvable() {
        var tries = 0;
        while (!hasAnyMove() && pairsLeft() > 0 && tries < 40) {
            shuffleRemaining(false);
            tries++;
        }
        if (pairsLeft() > 0 && !hasAnyMove()) {
            setStatus(tr('tools.lianliankan.noMoves'), 'is-lose');
        }
    }

    function shuffleRemaining(announce) {
        var vals = [];
        var positions = [];
        for (var r = PAD; r < PAD + ROWS; r++) {
            for (var c = PAD; c < PAD + COLS; c++) {
                if (grid[r][c]) {
                    vals.push(grid[r][c]);
                    positions.push({ r: r, c: c });
                }
            }
        }
        shuffle(vals);
        for (var i = 0; i < positions.length; i++) {
            grid[positions[i].r][positions[i].c] = vals[i];
        }
        selected = null;
        renderBoard();
        if (announce) {
            var move = hasAnyMove();
            if (!move && pairsLeft() > 0) {
                var tries = 0;
                while (!hasAnyMove() && tries < 40) {
                    shuffleRemaining(false);
                    tries++;
                }
                renderBoard();
            }
            if (hasAnyMove()) {
                setStatus(tr('tools.lianliankan.shuffled'), 'is-idle');
            } else {
                setStatus(tr('tools.lianliankan.noMoves'), 'is-lose');
            }
        }
    }

    function onCellClick(ev) {
        if (busy || won) return;
        var el = ev.currentTarget;
        if (!el.classList.contains('is-tile')) return;
        var r = +el.dataset.r;
        var c = +el.dataset.c;
        if (!grid[r][c]) return;

        clearHintUi();

        if (!selected) {
            selected = { r: r, c: c };
            clearSelectionUi();
            el.classList.add('is-selected');
            return;
        }

        if (selected.r === r && selected.c === c) {
            selected = null;
            clearSelectionUi();
            return;
        }

        var r1 = selected.r;
        var c1 = selected.c;
        if (grid[r1][c1] !== grid[r][c]) {
            selected = { r: r, c: c };
            clearSelectionUi();
            el.classList.add('is-selected');
            return;
        }

        var path = findPath(r1, c1, r, c);
        if (!path) {
            selected = { r: r, c: c };
            clearSelectionUi();
            el.classList.add('is-selected');
            return;
        }

        clearMatch(r1, c1, r, c, path);
    }

    function clearMatch(r1, c1, r2, c2, path) {
        busy = true;
        selected = null;
        clearSelectionUi();
        drawPath(path);
        cellEls[r1][c1].classList.add('is-clearing');
        cellEls[r2][c2].classList.add('is-clearing');

        Promise.resolve()
            .then(function () { return wait(PATH_MS); })
            .then(function () {
                grid[r1][c1] = null;
                grid[r2][c2] = null;
                score += 10;
                updateStats();
                clearPath();
                cellEls[r1][c1].className = 'llk-cell is-empty';
                cellEls[r1][c1].textContent = '';
                cellEls[r1][c1].disabled = true;
                cellEls[r2][c2].className = 'llk-cell is-empty';
                cellEls[r2][c2].textContent = '';
                cellEls[r2][c2].disabled = true;
                return wait(CLEAR_MS);
            })
            .then(function () {
                busy = false;
                if (pairsLeft() === 0) {
                    won = true;
                    setStatus(tr('tools.lianliankan.win'), 'is-win');
                    return;
                }
                if (!hasAnyMove()) {
                    setStatus(tr('tools.lianliankan.suggestShuffle'), 'is-lose');
                } else {
                    setStatus('', 'is-idle');
                }
            });
    }

    function onHint() {
        if (busy || won) return;
        clearHintUi();
        var move = hasAnyMove();
        if (!move) {
            setStatus(tr('tools.lianliankan.suggestShuffle'), 'is-lose');
            return;
        }
        selected = null;
        clearSelectionUi();
        cellEls[move.a.r][move.a.c].classList.add('is-hint');
        cellEls[move.b.r][move.b.c].classList.add('is-hint');
        setStatus(tr('tools.lianliankan.hintFound'), 'is-idle');
    }

    function onShuffle() {
        if (busy || won) return;
        if (pairsLeft() === 0) return;
        shuffleRemaining(true);
        updateStats();
    }

    hintBtn.addEventListener('click', onHint);
    shuffleBtn.addEventListener('click', onShuffle);
    restartBtn.addEventListener('click', newGame);

    window.addEventListener('resize', function () {
        // Path overlay uses getBoundingClientRect; clear any stale path.
        clearPath();
    });

    newGame();
})();
