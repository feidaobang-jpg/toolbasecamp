(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var boardEl = document.getElementById('board'), score = 0, best = 0, grid, won = false;
    var KEY = 'tb_2048_best';
    var COLORS = { 0: '#cdc1b4', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
    try { best = +localStorage.getItem(KEY) || 0; } catch (e) {}
    document.getElementById('best').textContent = best;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function empty() { return [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; }
    function spawn() {
        var free = [];
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!grid[r][c]) free.push([r, c]);
        if (!free.length) return;
        var p = free[(Math.random() * free.length) | 0];
        grid[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
    }
    function render() {
        boardEl.innerHTML = '';
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
            var v = grid[r][c], el = document.createElement('div');
            el.className = 'g2048-cell';
            el.style.background = COLORS[v] || '#3c3a32';
            if (v >= 8) el.style.color = '#f9f6f2';
            el.textContent = v || '';
            boardEl.appendChild(el);
        }
        document.getElementById('score').textContent = score;
        document.getElementById('best').textContent = best;
    }
    function slide(row) {
        var arr = row.filter(Boolean), out = [], i;
        for (i = 0; i < arr.length; i++) {
            if (arr[i] === arr[i + 1]) { out.push(arr[i] * 2); score += arr[i] * 2; i++; }
            else out.push(arr[i]);
        }
        while (out.length < 4) out.push(0);
        return out;
    }
    function move(dir) {
        var old = JSON.stringify(grid), r, c, col;
        if (dir === 'L') for (r = 0; r < 4; r++) grid[r] = slide(grid[r]);
        if (dir === 'R') for (r = 0; r < 4; r++) grid[r] = slide(grid[r].slice().reverse()).reverse();
        if (dir === 'U') for (c = 0; c < 4; c++) {
            col = slide([grid[0][c], grid[1][c], grid[2][c], grid[3][c]]);
            for (r = 0; r < 4; r++) grid[r][c] = col[r];
        }
        if (dir === 'D') for (c = 0; c < 4; c++) {
            col = slide([grid[3][c], grid[2][c], grid[1][c], grid[0][c]]);
            for (r = 0; r < 4; r++) grid[3 - r][c] = col[r];
        }
        if (JSON.stringify(grid) === old) return;
        spawn();
        if (score > best) { best = score; try { localStorage.setItem(KEY, String(best)); } catch (e) {} }
        render();
        if (!won && grid.some(function (row) { return row.indexOf(2048) >= 0; })) {
            won = true; setStatus(tr('tools.g2048.win'), 'is-win');
        } else if (!canMove()) setStatus(tr('tools.g2048.lose'), 'is-lose');
        else setStatus(tr('tools.g2048.hint'), 'is-idle');
    }
    function canMove() {
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
            if (!grid[r][c]) return true;
            if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
            if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
        }
        return false;
    }
    function reset() { grid = empty(); score = 0; won = false; spawn(); spawn(); render(); setStatus(tr('tools.g2048.hint'), 'is-idle'); }
    document.getElementById('restart-btn').onclick = reset;
    window.addEventListener('keydown', function (e) {
        var m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
        if (m[e.key]) { e.preventDefault(); move(m[e.key]); }
    });
    var sx = 0, sy = 0;
    boardEl.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    boardEl.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
    }, { passive: true });
    reset();
})();
