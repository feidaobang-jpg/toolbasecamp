(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var EMOJIS = ['🐑', '🥕', '🌾', '🌿', '🪵', '🪣', '🧤', '🧶', '🔔', '🍎', '🌽', '🍄'];
    var TRAY_MAX = 7;
    var TILE = 48;
    var MATCH = 3;

    var stage = document.getElementById('stage');
    var trayEl = document.getElementById('tray');
    var leftEl = document.getElementById('left');
    var scoreEl = document.getElementById('score');
    var statusEl = document.getElementById('status');
    var undoBtn = document.getElementById('undo-btn');
    var restartBtn = document.getElementById('restart-btn');

    /** @type {{id:number,emoji:string,x:number,y:number,z:number,el:HTMLElement,gone:boolean}[]} */
    var tiles = [];
    /** @type {{emoji:string,fromId:number}[]} */
    var tray = [];
    var score = 0;
    var ended = false;
    var history = [];
    var idSeq = 0;

    function setStatus(msg, cls) {
        statusEl.textContent = msg || '';
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function hud() {
        var left = tiles.filter(function (t) { return !t.gone; }).length;
        leftEl.textContent = String(left);
        scoreEl.textContent = String(score);
        renderTray();
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = (Math.random() * (i + 1)) | 0;
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function buildPool() {
        // Multiples of 3 so board is always clearable in theory
        var kinds = 8;
        var each = 6; // 8*6 = 48 tiles
        var pool = [];
        for (var i = 0; i < kinds; i++) {
            for (var n = 0; n < each; n++) pool.push(EMOJIS[i]);
        }
        return shuffle(pool);
    }

    function overlaps(a, b) {
        var ax2 = a.x + TILE;
        var ay2 = a.y + TILE;
        var bx2 = b.x + TILE;
        var by2 = b.y + TILE;
        var ox = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
        var oy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
        return ox * oy > TILE * TILE * 0.18;
    }

    function isBlocked(tile) {
        if (tile.gone) return true;
        for (var i = 0; i < tiles.length; i++) {
            var o = tiles[i];
            if (o.gone || o.id === tile.id) continue;
            if (o.z > tile.z && overlaps(tile, o)) return true;
        }
        return false;
    }

    function refreshBlocked() {
        tiles.forEach(function (t) {
            if (t.gone) return;
            if (isBlocked(t)) t.el.classList.add('is-blocked');
            else t.el.classList.remove('is-blocked');
        });
    }

    function placeLayout(pool) {
        var W = stage.clientWidth || 360;
        var H = stage.clientHeight || 360;
        var layers = [
            { count: 16, z: 0, pad: 28 },
            { count: 16, z: 1, pad: 48 },
            { count: 16, z: 2, pad: 70 }
        ];
        var idx = 0;
        layers.forEach(function (layer) {
            var cols = 4;
            var rows = Math.ceil(layer.count / cols);
            var usableW = W - layer.pad * 2 - TILE;
            var usableH = H - layer.pad * 2 - TILE;
            for (var i = 0; i < layer.count && idx < pool.length; i++) {
                var c = i % cols;
                var r = (i / cols) | 0;
                var jitterX = (Math.random() - 0.5) * 18;
                var jitterY = (Math.random() - 0.5) * 18;
                var x = layer.pad + (cols === 1 ? 0 : (c / (cols - 1)) * usableW) + jitterX;
                var y = layer.pad + (rows === 1 ? 0 : (r / Math.max(1, rows - 1)) * usableH) + jitterY;
                x = Math.max(4, Math.min(W - TILE - 4, x));
                y = Math.max(4, Math.min(H - TILE - 4, y));
                addTile(pool[idx++], x, y, layer.z);
            }
        });
    }

    function addTile(emoji, x, y, z) {
        var id = ++idSeq;
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'ss-tile';
        el.textContent = emoji;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.zIndex = String(10 + z);
        el.dataset.id = String(id);
        el.addEventListener('click', onTileClick);
        stage.appendChild(el);
        tiles.push({ id: id, emoji: emoji, x: x, y: y, z: z, el: el, gone: false });
    }

    function renderTray() {
        trayEl.innerHTML = '';
        for (var i = 0; i < TRAY_MAX; i++) {
            var slot = document.createElement('div');
            slot.className = 'ss-tray-slot' + (tray[i] ? ' is-filled' : '');
            slot.textContent = tray[i] ? tray[i].emoji : '';
            trayEl.appendChild(slot);
        }
    }

    function clearMatches() {
        var counts = {};
        tray.forEach(function (t) {
            counts[t.emoji] = (counts[t.emoji] || 0) + 1;
        });
        var cleared = false;
        Object.keys(counts).forEach(function (emoji) {
            while (counts[emoji] >= MATCH) {
                var removed = 0;
                for (var i = tray.length - 1; i >= 0 && removed < MATCH; i--) {
                    if (tray[i].emoji === emoji) {
                        tray.splice(i, 1);
                        removed++;
                    }
                }
                counts[emoji] -= MATCH;
                score += 30;
                cleared = true;
            }
        });
        return cleared;
    }

    function onTileClick(ev) {
        if (ended) return;
        var id = +ev.currentTarget.dataset.id;
        var tile = null;
        for (var i = 0; i < tiles.length; i++) {
            if (tiles[i].id === id) { tile = tiles[i]; break; }
        }
        if (!tile || tile.gone || isBlocked(tile)) return;
        if (tray.length >= TRAY_MAX) return;

        history.push({
            tileId: tile.id,
            tray: tray.map(function (t) { return { emoji: t.emoji, fromId: t.fromId }; }),
            score: score
        });

        tile.gone = true;
        tile.el.classList.add('is-gone');
        tray.push({ emoji: tile.emoji, fromId: tile.id });
        clearMatches();
        refreshBlocked();
        hud();

        var left = tiles.filter(function (t) { return !t.gone; }).length;
        if (left === 0) {
            ended = true;
            setStatus(tr('tools.sheepstack.win'), 'is-win');
            return;
        }
        if (tray.length >= TRAY_MAX) {
            ended = true;
            setStatus(tr('tools.sheepstack.lose'), 'is-lose');
            return;
        }
        setStatus(tr('tools.sheepstack.hint'), 'is-idle');
    }

    function undo() {
        if (ended && tray.length >= TRAY_MAX) {
            // allow undo after lose
            ended = false;
        }
        if (!history.length || (ended && tiles.every(function (t) { return t.gone; }))) return;
        var snap = history.pop();
        tray = snap.tray.slice();
        score = snap.score;
        var tile = null;
        for (var i = 0; i < tiles.length; i++) {
            if (tiles[i].id === snap.tileId) { tile = tiles[i]; break; }
        }
        if (tile) {
            tile.gone = false;
            tile.el.classList.remove('is-gone');
        }
        ended = false;
        refreshBlocked();
        hud();
        setStatus(tr('tools.sheepstack.hint'), 'is-idle');
    }

    function reset() {
        stage.innerHTML = '';
        tiles = [];
        tray = [];
        score = 0;
        ended = false;
        history = [];
        idSeq = 0;
        placeLayout(buildPool());
        refreshBlocked();
        hud();
        setStatus(tr('tools.sheepstack.hint'), 'is-idle');
    }

    undoBtn.addEventListener('click', undo);
    restartBtn.addEventListener('click', reset);
    window.addEventListener('resize', function () {
        // Keep positions; only refresh blocked visuals
        refreshBlocked();
    });

    reset();
})();
