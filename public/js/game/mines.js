(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    var ROWS = 9, COLS = 9, MINE_N = 10;
    var gridEl = document.getElementById('grid'), cells = [], mines = [], opened = 0, flags = 0, dead = false, won = false;
    function setStatus(m, c) { var el = document.getElementById('status'); el.textContent = m; el.className = 'game-status' + (c ? ' ' + c : ''); }
    function hud() { document.getElementById('mines').textContent = MINE_N; document.getElementById('flags').textContent = flags; }
    function idx(r, c) { return r * COLS + c; }
    function neighbors(r, c) {
        var out = [];
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            var nr = r + dr, nc = c + dc;
            if (nr >= 0 && nc >= 0 && nr < ROWS && nc < COLS) out.push(idx(nr, nc));
        }
        return out;
    }
    function reset() {
        dead = false; won = false; opened = 0; flags = 0; mines = [];
        gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 1fr)';
        gridEl.innerHTML = ''; cells = [];
        var positions = [];
        for (var i = 0; i < ROWS * COLS; i++) positions.push(i);
        for (var i = positions.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = positions[i]; positions[i] = positions[j]; positions[j] = t; }
        var mineSet = {};
        for (var m = 0; m < MINE_N; m++) mineSet[positions[m]] = true;
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
            var id = idx(r, c);
            var count = 0;
            neighbors(r, c).forEach(function (n) { if (mineSet[n]) count++; });
            mines[id] = { mine: !!mineSet[id], n: count, open: false, flag: false, r: r, c: c };
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'mines-cell'; b.dataset.id = id; b.textContent = '';
            b.addEventListener('click', onOpen);
            b.addEventListener('contextmenu', onFlag);
            var pressTimer = null;
            b.addEventListener('touchstart', function (e) {
                var self = this;
                pressTimer = setTimeout(function () { pressTimer = null; flagCell(+self.dataset.id); }, 450);
            }, { passive: true });
            b.addEventListener('touchend', function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
            b.addEventListener('touchmove', function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
            gridEl.appendChild(b); cells[id] = b;
        }
        hud(); setStatus(tr('tools.mines.hint'), 'is-idle');
    }
    function renderCell(id) {
        var cell = mines[id], el = cells[id];
        el.className = 'mines-cell';
        if (cell.flag) { el.classList.add('is-flag'); el.textContent = '🚩'; return; }
        if (!cell.open) { el.textContent = ''; return; }
        el.classList.add('is-open');
        if (cell.mine) { el.classList.add('is-mine'); el.textContent = '💣'; }
        else el.textContent = cell.n ? String(cell.n) : '';
    }
    function openCell(id) {
        var cell = mines[id];
        if (dead || won || cell.open || cell.flag) return;
        cell.open = true; opened++; renderCell(id);
        if (cell.mine) {
            dead = true;
            mines.forEach(function (c, i) { if (c.mine) { c.open = true; renderCell(i); } });
            setStatus(tr('tools.mines.lose'), 'is-lose'); return;
        }
        if (cell.n === 0) neighbors(cell.r, cell.c).forEach(openCell);
        if (opened === ROWS * COLS - MINE_N) { won = true; setStatus(tr('tools.mines.win'), 'is-win'); }
    }
    function flagCell(id) {
        var cell = mines[id];
        if (dead || won || cell.open) return;
        cell.flag = !cell.flag; flags += cell.flag ? 1 : -1; hud(); renderCell(id);
    }
    function onOpen(e) { openCell(+this.dataset.id); }
    function onFlag(e) { e.preventDefault(); flagCell(+this.dataset.id); }
    document.getElementById('restart-btn').onclick = reset;
    reset();
})();
