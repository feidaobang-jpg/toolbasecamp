(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var boardEl = document.getElementById('board');
    var stepsEl = document.getElementById('steps');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var diffRow = document.getElementById('diff-row');

    var size = 3;
    var board = [];
    var empty = { x: 2, y: 2 };
    var steps = 0;
    var gameOver = false;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function validDirs(x, y, n) {
        var dirs = [];
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
            var nx = x + d[0];
            var ny = y + d[1];
            if (nx >= 0 && nx < n && ny >= 0 && ny < n) dirs.push(d);
        });
        return dirs;
    }

    function isSolvable(b, n) {
        var flat = [];
        var emptyRow = 0;
        var i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                flat.push(b[i][j]);
                if (b[i][j] === 0) emptyRow = i;
            }
        }
        var inv = 0;
        for (i = 0; i < flat.length; i++) {
            if (flat[i] === 0) continue;
            for (j = i + 1; j < flat.length; j++) {
                if (flat[j] !== 0 && flat[i] > flat[j]) inv++;
            }
        }
        if (n % 2 === 1) return inv % 2 === 0;
        return (inv + (n - emptyRow)) % 2 === 1;
    }

    function shuffle() {
        var b = [];
        var count = 1;
        var i, j, k;
        for (i = 0; i < size; i++) {
            var row = [];
            for (j = 0; j < size; j++) {
                if (i === size - 1 && j === size - 1) row.push(0);
                else row.push(count++);
            }
            b.push(row);
        }
        var ep = { x: size - 1, y: size - 1 };
        for (k = 0; k < 120; k++) {
            var dirs = validDirs(ep.x, ep.y, size);
            var d = dirs[Math.floor(Math.random() * dirs.length)];
            var nx = ep.x + d[0];
            var ny = ep.y + d[1];
            b[ep.x][ep.y] = b[nx][ny];
            b[nx][ny] = 0;
            ep = { x: nx, y: ny };
        }
        if (!isSolvable(b, size)) {
            if (b[0][0] && b[0][1]) {
                var tmp = b[0][0]; b[0][0] = b[0][1]; b[0][1] = tmp;
            } else {
                var tmp2 = b[1][0]; b[1][0] = b[1][1]; b[1][1] = tmp2;
            }
        }
        board = b;
        empty = ep;
        steps = 0;
        gameOver = false;
        stepsEl.textContent = '0';
        setStatus(tr('tools.klotski.hint'), 'is-idle');
        render();
    }

    function checkWin() {
        var expected = 1;
        for (var i = 0; i < size; i++) {
            for (var j = 0; j < size; j++) {
                if (i === size - 1 && j === size - 1) {
                    if (board[i][j] !== 0) return false;
                } else if (board[i][j] !== expected++) {
                    return false;
                }
            }
        }
        return true;
    }

    function render() {
        boardEl.style.gridTemplateColumns = 'repeat(' + size + ', minmax(0, 1fr))';
        boardEl.innerHTML = '';
        for (var i = 0; i < size; i++) {
            for (var j = 0; j < size; j++) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'klotski-tile' + (board[i][j] === 0 ? ' is-empty' : '');
                btn.textContent = board[i][j] === 0 ? '' : String(board[i][j]);
                btn.dataset.x = String(i);
                btn.dataset.y = String(j);
                boardEl.appendChild(btn);
            }
        }
    }

    boardEl.addEventListener('click', function (e) {
        if (gameOver) return;
        var btn = e.target.closest('.klotski-tile');
        if (!btn || btn.classList.contains('is-empty')) return;
        var x = Number(btn.dataset.x);
        var y = Number(btn.dataset.y);
        var dx = Math.abs(x - empty.x);
        var dy = Math.abs(y - empty.y);
        if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return;
        board[empty.x][empty.y] = board[x][y];
        board[x][y] = 0;
        empty = { x: x, y: y };
        steps++;
        stepsEl.textContent = String(steps);
        render();
        if (checkWin()) {
            gameOver = true;
            setStatus(tr('tools.klotski.win', { n: steps }), 'is-win');
        }
    });

    diffRow.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-size]');
        if (!btn) return;
        size = Number(btn.dataset.size);
        Array.prototype.forEach.call(diffRow.querySelectorAll('.tb-btn'), function (el) {
            el.classList.toggle('is-active', el === btn);
        });
        shuffle();
    });

    restartBtn.addEventListener('click', shuffle);
    shuffle();
})();
