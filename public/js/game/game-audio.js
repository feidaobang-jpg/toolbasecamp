/**
 * Shared procedural SFX + BGM for casual games (Web Audio API).
 * AudioContext is created only after a user gesture (browser autoplay policy).
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'tb-game-audio-muted';
    var ctx = null;
    var master = null;
    var sfxGain = null;
    var bgmGain = null;
    var unlocked = false;
    var muted = false;
    var bgmTimer = null;
    var bgmStep = 0;
    var bgmTheme = 'calm';
    var bgmWanted = false;
    var muteBtns = [];
    var pendingSfx = null;

    try {
        muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) { /* ignore */ }

    function AC() {
        return global.AudioContext || global.webkitAudioContext;
    }

    function ensure() {
        if (!unlocked) return null;
        if (ctx) return ctx;
        var Ctor = AC();
        if (!Ctor) return null;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.55;
        sfxGain.connect(master);
        bgmGain = ctx.createGain();
        bgmGain.gain.value = 0.14;
        bgmGain.connect(master);
        return ctx;
    }

    function resume() {
        var c = ensure();
        if (!c) return Promise.resolve();
        if (c.state === 'suspended') {
            return c.resume().catch(function () { /* ignore */ });
        }
        return Promise.resolve();
    }

    function unlock() {
        if (!unlocked) unlocked = true;
        return resume().then(function () {
            if (bgmWanted && !muted && !bgmTimer) startBgmInternal();
            if (pendingSfx) {
                var name = pendingSfx;
                pendingSfx = null;
                playSfxNow(name);
            }
        });
    }

    function setMasterMute(on) {
        muted = !!on;
        try {
            localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
        } catch (e) { /* ignore */ }
        if (master && ctx) {
            var now = ctx.currentTime;
            master.gain.cancelScheduledValues(now);
            master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.03);
        }
        if (muted) stopBgmInternal();
        else if (bgmWanted && unlocked) startBgmInternal();
        syncMuteButtons();
    }

    function i18n(key, fallback) {
        return typeof global.t === 'function' ? global.t(key) : fallback;
    }

    function syncMuteButtons() {
        muteBtns.forEach(function (btn) {
            if (!btn) return;
            var onLabel = i18n('tools.game.soundOn', 'Sound on');
            var offLabel = i18n('tools.game.soundOff', 'Muted');
            btn.dataset.soundOn = onLabel;
            btn.dataset.soundOff = offLabel;
            btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
            btn.textContent = muted ? offLabel : onLabel;
            btn.classList.toggle('is-muted', muted);
        });
    }

    function tone(freq, dur, type, gain, when, dest) {
        var c = ensure();
        if (!c || muted || c.state !== 'running') return;
        var t0 = (when != null ? when : c.currentTime);
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(dest || sfxGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    function noiseBurst(dur, gain, when) {
        var c = ensure();
        if (!c || muted || c.state !== 'running') return;
        var t0 = when != null ? when : c.currentTime;
        var len = Math.max(1, Math.floor(c.sampleRate * dur));
        var buf = c.createBuffer(1, len, c.sampleRate);
        var data = buf.getChannelData(0);
        var i;
        for (i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = c.createBufferSource();
        var g = c.createGain();
        var f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1200;
        f.Q.value = 0.7;
        src.buffer = buf;
        g.gain.setValueAtTime(gain || 0.15, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f);
        f.connect(g);
        g.connect(sfxGain);
        src.start(t0);
        src.stop(t0 + dur + 0.02);
    }

    var SFX = {
        select: function () { tone(660, 0.06, 'sine', 0.12); },
        click: function () { tone(520, 0.05, 'triangle', 0.1); },
        place: function () {
            tone(420, 0.07, 'sine', 0.14);
            tone(630, 0.05, 'sine', 0.08, (ctx && ctx.currentTime) + 0.04);
        },
        move: function () {
            tone(380, 0.06, 'triangle', 0.12);
            tone(480, 0.05, 'triangle', 0.08, (ctx && ctx.currentTime) + 0.035);
        },
        swap: function () {
            tone(500, 0.05, 'sine', 0.1);
            tone(700, 0.06, 'sine', 0.1, (ctx && ctx.currentTime) + 0.05);
        },
        invalid: function () {
            tone(220, 0.12, 'sawtooth', 0.08);
            tone(160, 0.14, 'sawtooth', 0.06, (ctx && ctx.currentTime) + 0.06);
        },
        match: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(523, 0.08, 'sine', 0.12, t);
            tone(659, 0.08, 'sine', 0.12, t + 0.06);
            tone(784, 0.1, 'sine', 0.12, t + 0.12);
        },
        hit: function () {
            tone(240, 0.04, 'square', 0.06);
            noiseBurst(0.04, 0.08);
        },
        brick: function () {
            tone(340, 0.05, 'triangle', 0.1);
            noiseBurst(0.05, 0.1);
        },
        power: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(440, 0.07, 'sine', 0.12, t);
            tone(660, 0.08, 'sine', 0.12, t + 0.07);
            tone(880, 0.1, 'sine', 0.12, t + 0.14);
        },
        life: function () {
            tone(300, 0.1, 'sawtooth', 0.07);
            tone(200, 0.14, 'sawtooth', 0.06, (ctx && ctx.currentTime) + 0.08);
        },
        win: function () {
            var t = ctx ? ctx.currentTime : 0;
            [523, 659, 784, 1046].forEach(function (f, i) {
                tone(f, 0.16, 'sine', 0.14, t + i * 0.1);
            });
        },
        lose: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(392, 0.18, 'triangle', 0.12, t);
            tone(311, 0.22, 'triangle', 0.12, t + 0.14);
            tone(233, 0.28, 'triangle', 0.12, t + 0.3);
        },
        start: function () {
            tone(523, 0.08, 'sine', 0.1);
            tone(784, 0.1, 'sine', 0.1, (ctx && ctx.currentTime) + 0.08);
        },
        level: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(659, 0.08, 'sine', 0.12, t);
            tone(784, 0.08, 'sine', 0.12, t + 0.07);
            tone(988, 0.12, 'sine', 0.12, t + 0.14);
        }
    };

    var THEMES = {
        calm: {
            bpm: 72,
            scale: [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25],
            pattern: [0, 2, 4, 2, 5, 4, 2, 0, 4, 5, 7, 5, 4, 2, 0, -1]
        },
        upbeat: {
            bpm: 108,
            scale: [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46],
            pattern: [0, 3, 5, 3, 4, 5, 7, 5, 3, 0, 5, 4, 3, 1, 0, 3]
        },
        arcade: {
            bpm: 120,
            scale: [196.0, 246.94, 293.66, 329.63, 392.0, 493.88, 587.33, 659.25],
            pattern: [0, 4, 2, 4, 5, 4, 7, 5, 4, 2, 0, 2, 5, 4, 3, 0]
        }
    };

    function playBgmNote(freq, beatDur) {
        var c = ensure();
        if (!c || muted || !bgmGain || c.state !== 'running') return;
        var t0 = c.currentTime;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + beatDur * 0.85);
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(t0);
        osc.stop(t0 + beatDur);
    }

    function startBgmInternal() {
        stopBgmInternal();
        if (!unlocked || muted) return;
        if (!ensure()) return;
        var theme = THEMES[bgmTheme] || THEMES.calm;
        var beat = 60 / theme.bpm;
        bgmStep = 0;
        function tick() {
            if (muted || !bgmWanted) return;
            var idx = theme.pattern[bgmStep % theme.pattern.length];
            if (idx >= 0) {
                var freq = theme.scale[idx % theme.scale.length];
                playBgmNote(freq, beat * 0.95);
                if (bgmStep % 4 === 0) {
                    playBgmNote(theme.scale[0] / 2, beat * 1.6);
                }
            }
            bgmStep++;
            bgmTimer = global.setTimeout(tick, beat * 1000);
        }
        tick();
    }

    function stopBgmInternal() {
        if (bgmTimer) {
            global.clearTimeout(bgmTimer);
            bgmTimer = null;
        }
    }

    function playSfxNow(name) {
        var fn = SFX[name];
        if (fn) fn();
    }

    function sfx(name) {
        if (muted || !SFX[name]) return;
        if (!unlocked) {
            // ignore autoplay-time sfx (e.g. newGame on load); wait for gesture
            return;
        }
        unlock().then(function () {
            playSfxNow(name);
        });
    }

    function startBgm(theme) {
        if (theme) bgmTheme = theme;
        bgmWanted = true;
        // do not create AudioContext here — wait for user gesture
        if (unlocked && !muted) startBgmInternal();
    }

    function stopBgm() {
        bgmWanted = false;
        stopBgmInternal();
    }

    function bindMuteButton(btn) {
        if (!btn) return;
        btn.removeAttribute('data-i18n');
        muteBtns.push(btn);
        syncMuteButtons();
        // refresh label after i18n applies language
        global.setTimeout(syncMuteButtons, 0);
        global.setTimeout(syncMuteButtons, 50);
        btn.addEventListener('click', function () {
            unlock();
            setMasterMute(!muted);
        });
    }

    function installUnlockGestures() {
        var once = function () {
            unlock();
            document.removeEventListener('pointerdown', once, true);
            document.removeEventListener('keydown', once, true);
            document.removeEventListener('touchstart', once, true);
        };
        document.addEventListener('pointerdown', once, true);
        document.addEventListener('keydown', once, true);
        document.addEventListener('touchstart', once, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installUnlockGestures);
    } else {
        installUnlockGestures();
    }

    global.GameAudio = {
        unlock: unlock,
        sfx: sfx,
        startBgm: startBgm,
        stopBgm: stopBgm,
        setMuted: setMasterMute,
        isMuted: function () { return muted; },
        bindMuteButton: bindMuteButton,
        refreshMuteLabels: syncMuteButtons,
        themes: Object.keys(THEMES)
    };
})(window);
