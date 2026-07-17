(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var EMOJIS = ['🐑', '🥕', '🌾', '🌿', '🪵', '🪣', '🧤', '🧶', '🔔', '🍎', '🌽', '🍄'];
    var TRAY_MAX = 7;
    var MATCH = 3;
    var START_TIME = 180;
    var TIME_BONUS = 30;

    var stage = document.getElementById('stage');
    var trayEl = document.getElementById('tray');
    var leftEl = document.getElementById('left');
    var scoreEl = document.getElementById('score');
    var timeEl = document.getElementById('time');
    var statusEl = document.getElementById('status');
    var restartBtn = document.getElementById('restart-btn');
    var propUndo = document.getElementById('prop-undo');
    var propBomb = document.getElementById('prop-bomb');
    var propHint = document.getElementById('prop-hint');
    var propTime = document.getElementById('prop-time');
    var cntUndo = document.getElementById('cnt-undo');
    var cntBomb = document.getElementById('cnt-bomb');
    var cntHint = document.getElementById('cnt-hint');
    var cntTime = document.getElementById('cnt-time');

    var tileSize = 48;
    var tiles = [];
    var tray = [];
    var score = 0;
    var ended = false;
    var history = [];
    var idSeq = 0;
    var props = { undo: 3, bomb: 2, hint: 3, time: 2 };
    var timeLeft = START_TIME;
    var timerId = 0;

    function setStatus(msg, cls) {
        statusEl.textContent = msg || '';
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function updatePropsUi() {
        cntUndo.textContent = String(props.undo);
        cntBomb.textContent = String(props.bomb);
        cntHint.textContent = String(props.hint);
        cntTime.textContent = String(props.time);
        propUndo.disabled = ended || props.undo <= 0 || history.length === 0;
        propBomb.disabled = ended || props.bomb <= 0 || tray.length === 0;
        propHint.disabled = ended || props.hint <= 0;
        propTime.disabled = ended || props.time <= 0;
    }

    function hud() {
        leftEl.textContent = String(tiles.filter(function (t) { return !t.gone; }).length);
        scoreEl.textContent = String(score);
        timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
        renderTray();
        updatePropsUi();
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
        var kinds = 8;
        var each = 6;
        var pool = [];
        for (var i = 0; i < kinds; i++) {
            for (var n = 0; n < each; n++) pool.push(EMOJIS[i]);
        }
        return shuffle(pool);
    }

    function overlaps(a, b) {
        var ax2 = a.x + tileSize;
        var ay2 = a.y + tileSize;
        var bx2 = b.x + tileSize;
        var by2 = b.y + tileSize;
        var ox = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
        var oy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
        return ox * oy > tileSize * tileSize * 0.18;
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

    function clearHints() {
        tiles.forEach(function (t) { t.el.classList.remove('is-hint'); });
    }

    function refreshBlocked() {
        tiles.forEach(function (t) {
            if (t.gone) return;
            if (isBlocked(t)) t.el.classList.add('is-blocked');
            else t.el.classList.remove('is-blocked');
        });
    }

    function freeTiles() {
        return tiles.filter(function (t) { return !t.gone && !isBlocked(t); });
    }

    function placeLayout(pool) {
        var W = stage.clientWidth || 320;
        var H = stage.clientHeight || 320;
        tileSize = Math.max(36, Math.min(48, Math.floor(W / 7.2)));
        stage.style.setProperty('--ss-tile', tileSize + 'px');

        var layers = [
            { count: 16, z: 0, pad: Math.floor(tileSize * 0.45) },
            { count: 16, z: 1, pad: Math.floor(tileSize * 0.85) },
            { count: 16, z: 2, pad: Math.floor(tileSize * 1.25) }
        ];
        var idx = 0;
        layers.forEach(function (layer) {
            var cols = 4;
            var rows = Math.ceil(layer.count / cols);
            var usableW = Math.max(tileSize, W - layer.pad * 2 - tileSize);
            var usableH = Math.max(tileSize, H - layer.pad * 2 - tileSize);
            for (var i = 0; i < layer.count && idx < pool.length; i++) {
                var c = i % cols;
                var r = (i / cols) | 0;
                var jitterX = (Math.random() - 0.5) * (tileSize * 0.35);
                var jitterY = (Math.random() - 0.5) * (tileSize * 0.35);
                var x = layer.pad + (cols === 1 ? 0 : (c / (cols - 1)) * usableW) + jitterX;
                var y = layer.pad + (rows === 1 ? 0 : (r / Math.max(1, rows - 1)) * usableH) + jitterY;
                x = Math.max(2, Math.min(W - tileSize - 2, x));
                y = Math.max(2, Math.min(H - tileSize - 2, y));
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
            }
        });
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
            if (ended) { stopTimer(); return; }
            timeLeft -= 1;
            hud();
            if (timeLeft <= 0) {
                timeLeft = 0;
                ended = true;
                stopTimer();
                setStatus(tr('tools.sheepstack.timeUp'), 'is-lose');
                updatePropsUi();
            }
        }, 1000);
    }

    function checkEnd() {
        var left = tiles.filter(function (t) { return !t.gone; }).length;
        if (left === 0) {
            ended = true;
            stopTimer();
            setStatus(tr('tools.sheepstack.win'), 'is-win');
            updatePropsUi();
            return true;
        }
        if (tray.length >= TRAY_MAX) {
            ended = true;
            stopTimer();
            setStatus(tr('tools.sheepstack.lose'), 'is-lose');
            updatePropsUi();
            return true;
        }
        return false;
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

        clearHints();
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
        if (!checkEnd()) setStatus(tr('tools.sheepstack.hint'), 'is-idle');
    }

    function useUndo() {
        if (ended && tray.length >= TRAY_MAX) ended = false;
        if (props.undo <= 0 || !history.length) return;
        if (ended && tiles.every(function (t) { return t.gone; })) return;

        props.undo -= 1;
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
        if (!timerId && timeLeft > 0) startTimer();
        clearHints();
        refreshBlocked();
        hud();
        setStatus(tr('tools.sheepstack.usedUndo'), 'is-idle');
    }

    function useBomb() {
        if (ended || props.bomb <= 0 || tray.length === 0) return;
        props.bomb -= 1;
        history = [];
        // Remove up to 3 tiles from tray (prefer incomplete groups)
        var removeN = Math.min(3, tray.length);
        tray.splice(tray.length - removeN, removeN);
        clearHints();
        hud();
        setStatus(tr('tools.sheepstack.usedBomb'), 'is-idle');
    }

    function useHint() {
        if (ended || props.hint <= 0) return;
        clearHints();
        var free = freeTiles();
        if (!free.length) {
            setStatus(tr('tools.sheepstack.noHint'), 'is-lose');
            return;
        }

        // Prefer an emoji that already has 1–2 in tray
        var trayCount = {};
        tray.forEach(function (t) { trayCount[t.emoji] = (trayCount[t.emoji] || 0) + 1; });

        var best = null;
        free.forEach(function (t) {
            var n = trayCount[t.emoji] || 0;
            if (n > 0 && n < MATCH) {
                if (!best || n > (trayCount[best.emoji] || 0)) best = t;
            }
        });
        if (!best) {
            // highlight two free tiles of same emoji if possible
            var map = {};
            free.forEach(function (t) {
                if (!map[t.emoji]) map[t.emoji] = [];
                map[t.emoji].push(t);
            });
            Object.keys(map).some(function (emoji) {
                if (map[emoji].length >= 2) {
                    map[emoji][0].el.classList.add('is-hint');
                    map[emoji][1].el.classList.add('is-hint');
                    best = map[emoji][0];
                    return true;
                }
                return false;
            });
            if (!best) best = free[0];
        }
        if (best) best.el.classList.add('is-hint');

        props.hint -= 1;
        hud();
        setStatus(tr('tools.sheepstack.usedHint'), 'is-idle');
    }

    function useTime() {
        if (ended || props.time <= 0) return;
        props.time -= 1;
        timeLeft += TIME_BONUS;
        if (!timerId) startTimer();
        hud();
        setStatus(tr('tools.sheepstack.usedTime', { n: TIME_BONUS }), 'is-win');
    }

    function reset() {
        stopTimer();
        stage.innerHTML = '';
        tiles = [];
        tray = [];
        score = 0;
        ended = false;
        history = [];
        idSeq = 0;
        props = { undo: 3, bomb: 2, hint: 3, time: 2 };
        timeLeft = START_TIME;
        placeLayout(buildPool());
        refreshBlocked();
        hud();
        setStatus(tr('tools.sheepstack.hint'), 'is-idle');
        startTimer();
    }

    propUndo.addEventListener('click', useUndo);
    propBomb.addEventListener('click', useBomb);
    propHint.addEventListener('click', useHint);
    propTime.addEventListener('click', useTime);
    restartBtn.addEventListener('click', reset);

    // Defer layout until size known
    requestAnimationFrame(function () {
        reset();
    });
})();
