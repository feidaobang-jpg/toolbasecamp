(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var boardEl = document.getElementById('board');
    var padEl = document.getElementById('pad');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');

    var board = [];
    var original = [];
    var selected = { row: -1, col: -1 };

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function fillBox(b, row, col) {
        var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                var idx = Math.floor(Math.random() * nums.length);
                b[row + i][col + j] = nums[idx];
                nums.splice(idx, 1);
            }
        }
    }

    function isSafe(b, row, col, num) {
        var x;
        for (x = 0; x < 9; x++) if (b[row][x] === num || b[x][col] === num) return false;
        var sr = row - (row % 3);
        var sc = col - (col % 3);
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                if (b[sr + i][sc + j] === num) return false;
            }
        }
        return true;
    }

    function findEmpty(b) {
        for (var i = 0; i < 9; i++) {
            for (var j = 0; j < 9; j++) {
                if (b[i][j] === 0) return [i, j];
            }
        }
        return null;
    }

    function solve(b) {
        var empty = findEmpty(b);
        if (!empty) return true;
        var row = empty[0];
        var col = empty[1];
        for (var num = 1; num <= 9; num++) {
            if (isSafe(b, row, col, num)) {
                b[row][col] = num;
                if (solve(b)) return true;
                b[row][col] = 0;
            }
        }
        return false;
    }

    function generate() {
        var b = Array(9).fill(0).map(function () { return Array(9).fill(0); });
        for (var i = 0; i < 9; i += 3) fillBox(b, i, i);
        solve(b);
        var removed = 0;
        while (removed < 40) {
            var r = Math.floor(Math.random() * 9);
            var c = Math.floor(Math.random() * 9);
            if (b[r][c] !== 0) {
                b[r][c] = 0;
                removed++;
            }
        }
        return b;
    }

    function checkDuplicate(row, col, num) {
        if (num === 0) return null;
        var j, i;
        for (j = 0; j < 9; j++) {
            if (j !== col && board[row][j] === num) return tr('tools.sudoku.dupRow', { row: row + 1, n: num });
        }
        for (i = 0; i < 9; i++) {
            if (i !== row && board[i][col] === num) return tr('tools.sudoku.dupCol', { col: col + 1, n: num });
        }
        var sr = row - (row % 3);
        var sc = col - (col % 3);
        for (i = 0; i < 3; i++) {
            for (j = 0; j < 3; j++) {
                if ((sr + i !== row || sc + j !== col) && board[sr + i][sc + j] === num) {
                    return tr('tools.sudoku.dupBox', { n: num });
                }
            }
        }
        return null;
    }

    function isComplete() {
        var i, j;
        for (i = 0; i < 9; i++) {
            for (j = 0; j < 9; j++) {
                if (board[i][j] === 0) return false;
            }
        }
        return true;
    }

    function render() {
        boardEl.innerHTML = '';
        var sel = selected;
        var selVal = (sel.row >= 0) ? board[sel.row][sel.col] : 0;
        for (var r = 0; r < 9; r++) {
            for (var c = 0; c < 9; c++) {
                var cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'sudoku-cell';
                cell.dataset.row = String(r);
                cell.dataset.col = String(c);
                var val = board[r][c];
                cell.textContent = val ? String(val) : '';
                if (original[r][c] !== 0) cell.classList.add('is-fixed');
                if (sel.row === r && sel.col === c) cell.classList.add('is-selected');
                else if (selVal && val === selVal) cell.classList.add('is-same');
                boardEl.appendChild(cell);
            }
        }
    }

    function initPad() {
        padEl.innerHTML = '';
        for (var n = 1; n <= 9; n++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tb-btn';
            btn.textContent = String(n);
            btn.dataset.number = String(n);
            padEl.appendChild(btn);
        }
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tb-btn';
        clearBtn.dataset.number = '0';
        clearBtn.setAttribute('data-i18n', 'tools.sudoku.clearCell');
        clearBtn.textContent = tr('tools.sudoku.clearCell');
        padEl.appendChild(clearBtn);
    }

    function placeNumber(num) {
        var row = selected.row;
        var col = selected.col;
        if (row < 0 || col < 0) {
            setStatus(tr('tools.sudoku.hintPick'), 'is-idle');
            return;
        }
        if (original[row][col] !== 0) return;
        var dup = checkDuplicate(row, col, num);
        if (dup) {
            setStatus(dup, 'is-lose');
            return;
        }
        board[row][col] = num;
        render();
        if (isComplete()) setStatus(tr('tools.sudoku.complete'), 'is-win');
        else setStatus(tr('tools.sudoku.hintPick'), 'is-idle');
    }

    function newGame() {
        var puzzle = generate();
        board = puzzle.map(function (row) { return row.slice(); });
        original = puzzle.map(function (row) { return row.slice(); });
        selected = { row: -1, col: -1 };
        setStatus(tr('tools.sudoku.hintPick'), 'is-idle');
        render();
    }

    boardEl.addEventListener('click', function (e) {
        var cell = e.target.closest('.sudoku-cell');
        if (!cell) return;
        var row = Number(cell.dataset.row);
        var col = Number(cell.dataset.col);
        if (original[row][col] !== 0) return;
        selected = { row: row, col: col };
        render();
    });

    padEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-number]');
        if (!btn) return;
        placeNumber(Number(btn.dataset.number));
    });

    restartBtn.addEventListener('click', newGame);
    document.addEventListener('keydown', function (e) {
        if (e.key >= '1' && e.key <= '9') placeNumber(Number(e.key));
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') placeNumber(0);
    });

    function boot() {
        initPad();
        newGame();
        if (typeof window.tbApplyI18n === 'function') window.tbApplyI18n(padEl);
    }

    document.addEventListener('tb:locale', function () {
        initPad();
        if (typeof window.tbApplyI18n === 'function') window.tbApplyI18n(padEl);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
