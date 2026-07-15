(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var SIZE = 15;
    var boardEl = document.getElementById('board');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');

    var board = [];
    var current = 1;
    var gameOver = false;
    var last = null;

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function turnMsg() {
        return current === 1 ? tr('tools.gomoku.blackTurn') : tr('tools.gomoku.whiteTurn');
    }

    function checkWin(x, y, player) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0];
            var dy = dirs[d][1];
            var count = 1;
            var i, nx, ny;
            for (i = 1; i < 5; i++) {
                nx = x + dx * i; ny = y + dy * i;
                if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && board[nx][ny] === player) count++;
                else break;
            }
            for (i = 1; i < 5; i++) {
                nx = x - dx * i; ny = y - dy * i;
                if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && board[nx][ny] === player) count++;
                else break;
            }
            if (count >= 5) return true;
        }
        return false;
    }

    function render() {
        boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ', minmax(0, 1fr))';
        boardEl.innerHTML = '';
        for (var i = 0; i < SIZE; i++) {
            for (var j = 0; j < SIZE; j++) {
                var cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'gomoku-cell';
                cell.dataset.x = String(i);
                cell.dataset.y = String(j);
                if (last && last.x === i && last.y === j) cell.classList.add('is-last');
                if (board[i][j]) {
                    var stone = document.createElement('span');
                    stone.className = 'gomoku-stone ' + (board[i][j] === 1 ? 'is-black' : 'is-white');
                    cell.appendChild(stone);
                }
                boardEl.appendChild(cell);
            }
        }
    }

    function reset() {
        board = [];
        for (var i = 0; i < SIZE; i++) {
            board[i] = [];
            for (var j = 0; j < SIZE; j++) board[i][j] = 0;
        }
        current = 1;
        gameOver = false;
        last = null;
        setStatus(turnMsg(), 'is-idle');
        render();
    }

    boardEl.addEventListener('click', function (e) {
        if (gameOver) return;
        var cell = e.target.closest('.gomoku-cell');
        if (!cell) return;
        var x = Number(cell.dataset.x);
        var y = Number(cell.dataset.y);
        if (board[x][y] !== 0) return;
        board[x][y] = current;
        last = { x: x, y: y };
        if (checkWin(x, y, current)) {
            gameOver = true;
            setStatus(current === 1 ? tr('tools.gomoku.blackWin') : tr('tools.gomoku.whiteWin'), 'is-win');
        } else {
            current = current === 1 ? 2 : 1;
            setStatus(turnMsg(), 'is-idle');
        }
        render();
    });

    restartBtn.addEventListener('click', reset);
    reset();
})();
