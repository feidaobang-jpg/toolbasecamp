(function () {
    'use strict';
    function tr(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }

    /**
     * Weighted symbols. Three-of-a-kind prize names (lottery-flavored, fun only):
     * 🎆 礼炮奖 / 🐼 大熊猫 / 🚂 跑火车 / 🧧 红包奖 / 🍒 樱桃奖
     */
    var SYMBOLS = [
        { emoji: '🎆', weight: 4, prizeKey: 'fireworks', payout: 200 },
        { emoji: '🐼', weight: 6, prizeKey: 'panda', payout: 120 },
        { emoji: '🚂', weight: 10, prizeKey: 'train', payout: 60 },
        { emoji: '🧧', weight: 16, prizeKey: 'redpack', payout: 30 },
        { emoji: '🍒', weight: 24, prizeKey: 'cherry', payout: 15 },
        { emoji: '🍋', weight: 28, prizeKey: null, payout: 0 },
        { emoji: '🔔', weight: 22, prizeKey: null, payout: 0 }
    ];

    var COST = 10;
    var credits = 100;
    var spinning = false;
    var reels = [
        document.getElementById('r0'),
        document.getElementById('r1'),
        document.getElementById('r2')
    ];
    var spinBtn = document.getElementById('spin-btn');
    var resetBtn = document.getElementById('reset-btn');

    function setStatus(m, c) {
        var el = document.getElementById('status');
        el.textContent = m;
        el.className = 'game-status' + (c ? ' ' + c : '');
    }

    function hud(lastWin) {
        document.getElementById('credits').textContent = String(credits);
        if (lastWin != null) document.getElementById('last').textContent = String(lastWin);
    }

    function pickSymbol() {
        var total = 0;
        SYMBOLS.forEach(function (s) { total += s.weight; });
        var r = Math.random() * total;
        for (var i = 0; i < SYMBOLS.length; i++) {
            r -= SYMBOLS[i].weight;
            if (r <= 0) return SYMBOLS[i];
        }
        return SYMBOLS[SYMBOLS.length - 1];
    }

    function flashReel(el, duration, finalEmoji, done) {
        var t0 = performance.now();
        function frame(now) {
            if (now - t0 < duration) {
                el.textContent = SYMBOLS[(Math.random() * SYMBOLS.length) | 0].emoji;
                requestAnimationFrame(frame);
            } else {
                el.textContent = finalEmoji;
                if (done) done();
            }
        }
        requestAnimationFrame(frame);
    }

    function evaluate(a, b, c) {
        if (a.emoji === b.emoji && b.emoji === c.emoji) {
            return { win: a.payout, prizeKey: a.prizeKey, emoji: a.emoji };
        }
        // two fireworks / panda still give a small consolation
        var count = {};
        [a, b, c].forEach(function (s) { count[s.emoji] = (count[s.emoji] || 0) + 1; });
        if ((count['🎆'] || 0) >= 2) return { win: 20, prizeKey: 'nearFireworks', emoji: '🎆' };
        if ((count['🐼'] || 0) >= 2) return { win: 12, prizeKey: 'nearPanda', emoji: '🐼' };
        if ((count['🚂'] || 0) >= 2) return { win: 8, prizeKey: 'nearTrain', emoji: '🚂' };
        return { win: 0, prizeKey: null, emoji: null };
    }

    function spin() {
        if (spinning) return;
        if (credits < COST) {
            setStatus(tr('tools.slots.noCredits'), 'is-lose');
            return;
        }
        spinning = true;
        credits -= COST;
        hud(0);
        spinBtn.disabled = true;
        setStatus(tr('tools.slots.spinning'), 'is-idle');

        var results = [pickSymbol(), pickSymbol(), pickSymbol()];
        var done = 0;
        function onReelDone() {
            done++;
            if (done < 3) return;
            var ev = evaluate(results[0], results[1], results[2]);
            credits += ev.win;
            hud(ev.win);
            spinning = false;
            spinBtn.disabled = false;
            if (ev.win > 0 && ev.prizeKey && ev.prizeKey.indexOf('near') !== 0) {
                setStatus(tr('tools.slots.winPrize', {
                    prize: tr('tools.slots.prize.' + ev.prizeKey),
                    n: ev.win,
                    emoji: ev.emoji
                }), 'is-win');
            } else if (ev.win > 0) {
                setStatus(tr('tools.slots.winSmall', { n: ev.win, emoji: ev.emoji }), 'is-win');
            } else {
                setStatus(tr('tools.slots.thanks'), 'is-idle');
            }
        }

        flashReel(reels[0], 900, results[0].emoji, onReelDone);
        flashReel(reels[1], 1300, results[1].emoji, onReelDone);
        flashReel(reels[2], 1700, results[2].emoji, onReelDone);
    }

    spinBtn.addEventListener('click', spin);
    resetBtn.addEventListener('click', function () {
        if (spinning) return;
        credits = 100;
        hud(0);
        reels.forEach(function (r) { r.textContent = '❓'; });
        setStatus(tr('tools.slots.hint'), 'is-idle');
    });

    hud(0);
    setStatus(tr('tools.slots.hint'), 'is-idle');
})();
