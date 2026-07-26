(function () {
    'use strict';

    var audio = window.GameAudio;
    function play(name) { if (audio) audio.sfx(name); }
    if (audio) audio.boot('catchy');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var PAD = 1;
    var CLEAR_MS = 280;
    var PATH_MS = 320;
    var BEST_KEY = 'tbc_lianliankan_v1';
    var TILES = [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
        '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
        '🐧', '🐦', '🐤', '🦄', '🐝', '🐛', '🦋', '🐞'
    ];

    /** Board size steps — each cell count is even so pairs fill exactly. */
    var SIZE_STEPS = [
        { rows: 4, cols: 6 },  // 12 pairs — tutorial
        { rows: 6, cols: 6 },  // 18
        { rows: 6, cols: 8 },  // 24
        { rows: 8, cols: 8 },  // 32
        { rows: 8, cols: 10 }, // 40
        { rows: 10, cols: 10 } // 50 — max
    ];

    /**
     * Level curve (1-based):
     *  1  4×6   4种  150s  提示5 洗牌4  — 入门
     *  2  6×6   6种  135s  提示4 洗牌3
     *  3  6×8   8种  120s  提示4 洗牌3
     *  4  8×8  10种  105s  提示3 洗牌2
     *  5  8×10 12种   95s  提示3 洗牌2
     *  6 10×10 14种   85s  提示2 洗牌2
     *  7+ 固定最大盘，种类↑、时间↓，道具最少各 1
     */
    function levelConfig(n) {
        var idx = Math.min(Math.max(n, 1) - 1, SIZE_STEPS.length - 1);
        var size = SIZE_STEPS[idx];
        var extra = Math.max(0, n - SIZE_STEPS.length);
        var typeBase = [4, 6, 8, 10, 12, 14];
        var typeCount = Math.min(
            TILES.length,
            (typeBase[idx] || 14) + extra
        );
        var timeBase = [150, 135, 120, 105, 95, 85];
        var timeLimit = Math.max(40, (timeBase[idx] || 85) - extra * 5);
        var hints = Math.max(1, 5 - Math.floor((n - 1) / 2));
        var shuffles = Math.max(1, 4 - Math.floor((n - 1) / 3));
        return {
            rows: size.rows,
            cols: size.cols,
            typeCount: typeCount,
            timeLimit: timeLimit,
            hints: hints,
            shuffles: shuffles
        };
    }

    var boardEl = document.getElementById('board');
    var gridEl = document.getElementById('grid');
    var pathLayer = document.getElementById('path-layer');
    var scoreEl = document.getElementById('score');
    var pairsEl = document.getElementById('pairs');
    var levelEl = document.getElementById('level');
    var timeEl = document.getElementById('time');
    var bestEl = document.getElementById('best');
    var statusEl = document.getElementById('status');
    var hintBtn = document.getElementById('hint-btn');
    var shuffleBtn = document.getElementById('shuffle-btn');
    var restartBtn = document.getElementById('restart-btn');

    var ROWS = 8;
    var COLS = 10;
    var TOTAL_R = ROWS + PAD * 2;
    var TOTAL_C = COLS + PAD * 2;

    /** @type {(string|null)[][]} */
    var grid = [];
    var score = 0;
    var level = 1;
    var bestLevel = 1;
    var timeLeft = 120;
    var hintsLeft = 3;
    var shufflesLeft = 3;
    var selected = null;
    var busy = false;
    var won = false;
    var ended = false;
    var timerId = 0;
    /** @type {HTMLElement[][]} */
    var cellEls = [];

    try {
        bestLevel = Math.max(1, parseInt(localStorage.getItem(BEST_KEY), 10) || 1);
    } catch (e) { /* ignore */ }

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

    function applySize(rows, cols) {
        ROWS = rows;
        COLS = cols;
        TOTAL_R = ROWS + PAD * 2;
        TOTAL_C = COLS + PAD * 2;
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
        if (levelEl) levelEl.textContent = String(level);
        if (timeEl) {
            timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
            timeEl.parentElement.classList.toggle('is-urgent', timeLeft > 0 && timeLeft <= 15);
        }
        if (bestEl) bestEl.textContent = String(bestLevel);
        hintBtn.disabled = busy || ended || won || hintsLeft <= 0;
        shuffleBtn.disabled = busy || ended || won || shufflesLeft <= 0 || pairsLeft() === 0;
        // Visible counts on buttons (drop data-i18n so labels stay in sync)
        hintBtn.removeAttribute('data-i18n');
        shuffleBtn.removeAttribute('data-i18n');
        hintBtn.textContent = tr('tools.lianliankan.hint') + ' (' + hintsLeft + ')';
        shuffleBtn.textContent = tr('tools.lianliankan.shuffle') + ' (' + shufflesLeft + ')';
        hintBtn.title = tr('tools.lianliankan.hintsLeft', { n: hintsLeft });
        shuffleBtn.title = tr('tools.lianliankan.shufflesLeft', { n: shufflesLeft });
    }

    function saveBest() {
        if (level > bestLevel) {
            bestLevel = level;
            try { localStorage.setItem(BEST_KEY, String(bestLevel)); } catch (e) { /* ignore */ }
        }
    }

    function stopTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = 0;
        }
    }

    function startTimer() {
        stopTimer();
        timerId = setInterval(function () {
            if (busy || won || ended) return;
            timeLeft -= 1;
            updateStats();
            if (timeLeft <= 0) {
                timeLeft = 0;
                ended = true;
                stopTimer();
                play('lose');
                setStatus(tr('tools.lianliankan.timeUp'), 'is-lose');
                updateStats();
            }
        }, 1000);
    }

    function buildPool(typeCount) {
        var need = ROWS * COLS;
        if (need % 2 !== 0) need -= 1;
        var kinds = TILES.slice(0, Math.max(2, typeCount));
        var pool = [];
        var i = 0;
        while (pool.length < need) {
            var emoji = kinds[i % kinds.length];
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
        gridEl.style.gridTemplateColumns =
            'minmax(4px, 0.25fr) repeat(' + COLS + ', minmax(0, 1fr)) minmax(4px, 0.25fr)';
        gridEl.style.gridTemplateRows =
            'minmax(4px, 0.25fr) repeat(' + ROWS + ', minmax(0, 1fr)) minmax(4px, 0.25fr)';
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
        syncEmojiSize();
    }

    function syncEmojiSize() {
        var sample = gridEl.querySelector('.llk-cell.is-tile') ||
            (cellEls[PAD] && cellEls[PAD][PAD]);
        if (!sample) return;
        var w = sample.clientWidth || sample.getBoundingClientRect().width;
        if (!w) return;
        var px = Math.max(20, Math.floor(w * 0.84));
        gridEl.style.setProperty('--llk-emoji-size', px + 'px');
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

    function clearLine(r1, c1, r2, c2) {
        if (r1 !== r2 && c1 !== c2) return false;
        var dr = r2 === r1 ? 0 : (r2 > r1 ? 1 : -1);
        var dc = c2 === c1 ? 0 : (c2 > c1 ? 1 : -1);
        var r = r1 + dr;
        var c = c1 + dc;
        while (r !== r2 || c !== c2) {
            if (!isEmpty(r, c)) return false;
            r += dr;
            c += dc;
        }
        return true;
    }

    function findPath(r1, c1, r2, c2) {
        if (grid[r1][c1] === null || grid[r2][c2] === null) return null;
        if (grid[r1][c1] !== grid[r2][c2]) return null;
        if (r1 === r2 && c1 === c2) return null;

        if (clearLine(r1, c1, r2, c2)) {
            return [{ r: r1, c: c1 }, { r: r2, c: c2 }];
        }

        if (isEmpty(r1, c2) && clearLine(r1, c1, r1, c2) && clearLine(r1, c2, r2, c2)) {
            return [{ r: r1, c: c1 }, { r: r1, c: c2 }, { r: r2, c: c2 }];
        }
        if (isEmpty(r2, c1) && clearLine(r1, c1, r2, c1) && clearLine(r2, c1, r2, c2)) {
            return [{ r: r1, c: c1 }, { r: r2, c: c1 }, { r: r2, c: c2 }];
        }

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

    function ensureSolvable() {
        var tries = 0;
        while (!hasAnyMove() && pairsLeft() > 0 && tries < 40) {
            shuffleRemaining(false);
            tries++;
        }
        if (pairsLeft() > 0 && !hasAnyMove()) {
            play('lose');
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
            var tries = 0;
            while (!hasAnyMove() && pairsLeft() > 0 && tries < 40) {
                shuffleRemaining(false);
                tries++;
            }
            renderBoard();
            if (hasAnyMove()) {
                setStatus(tr('tools.lianliankan.shuffled'), 'is-idle');
            } else {
                play('lose');
                setStatus(tr('tools.lianliankan.noMoves'), 'is-lose');
            }
        }
    }

    function startLevel(n, keepScore) {
        var cfg = levelConfig(n);
        level = n;
        applySize(cfg.rows, cfg.cols);
        if (!keepScore) score = 0;
        timeLeft = cfg.timeLimit;
        hintsLeft = cfg.hints;
        shufflesLeft = cfg.shuffles;
        selected = null;
        busy = false;
        won = false;
        ended = false;
        grid = emptyGrid();
        fillInner(buildPool(cfg.typeCount));
        renderBoard();
        updateStats();
        setStatus(tr('tools.lianliankan.levelStart', {
            n: level,
            rows: cfg.rows,
            cols: cfg.cols,
            time: cfg.timeLimit
        }), 'is-idle');
        ensureSolvable();
        startTimer();
        saveBest();
    }

    function newGame() {
        play('start');
        startLevel(1, false);
    }

    function nextLevel() {
        play('level');
        startLevel(level + 1, true);
    }

    function onCellClick(ev) {
        if (busy || won || ended) return;
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
                play('match');
                score += 10 + Math.min(20, level);
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
                    stopTimer();
                    var bonus = Math.max(0, Math.ceil(timeLeft)) * 2;
                    score += bonus;
                    updateStats();
                    play('win');
                    setStatus(tr('tools.lianliankan.levelClear', {
                        n: level,
                        bonus: bonus
                    }), 'is-win');
                    saveBest();
                    setTimeout(function () {
                        if (won) nextLevel();
                    }, 1200);
                    return;
                }
                if (!hasAnyMove()) {
                    play('invalid');
                    setStatus(tr('tools.lianliankan.suggestShuffle'), 'is-lose');
                } else {
                    setStatus('', 'is-idle');
                }
            });
    }

    function onHint() {
        if (busy || won || ended || hintsLeft <= 0) return;
        clearHintUi();
        var move = hasAnyMove();
        if (!move) {
            play('invalid');
            setStatus(tr('tools.lianliankan.suggestShuffle'), 'is-lose');
            return;
        }
        hintsLeft -= 1;
        selected = null;
        clearSelectionUi();
        cellEls[move.a.r][move.a.c].classList.add('is-hint');
        cellEls[move.b.r][move.b.c].classList.add('is-hint');
        setStatus(tr('tools.lianliankan.hintFound'), 'is-idle');
        updateStats();
        play('select');
    }

    function onShuffle() {
        if (busy || won || ended || shufflesLeft <= 0) return;
        if (pairsLeft() === 0) return;
        shufflesLeft -= 1;
        shuffleRemaining(true);
        updateStats();
        play('swap');
    }

    function refreshLocaleUi() {
        updateStats();
        if (!ended && !won) {
            var cfg = levelConfig(level);
            setStatus(tr('tools.lianliankan.levelStart', {
                n: level,
                rows: cfg.rows,
                cols: cfg.cols,
                time: Math.max(0, Math.ceil(timeLeft))
            }), statusEl.classList.contains('is-win') ? 'is-win'
                : statusEl.classList.contains('is-lose') ? 'is-lose'
                : 'is-idle');
        }
    }

    hintBtn.addEventListener('click', onHint);
    shuffleBtn.addEventListener('click', onShuffle);
    restartBtn.addEventListener('click', newGame);

    window.addEventListener('resize', function () {
        clearPath();
        syncEmojiSize();
    });

    newGame();
    // Scripts run before i18n init — refresh Chinese/English copy afterwards
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshLocaleUi);
    } else {
        setTimeout(refreshLocaleUi, 0);
    }
    document.addEventListener('tb:locale', refreshLocaleUi);

    requestAnimationFrame(function () {
        syncEmojiSize();
        requestAnimationFrame(syncEmojiSize);
    });
})();
