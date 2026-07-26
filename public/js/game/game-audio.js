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
    var bgmTheme = 'catchy';
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
        // ~2x previous loudness
        sfxGain.gain.value = 1.1;
        sfxGain.connect(master);
        bgmGain = ctx.createGain();
        bgmGain.gain.value = 0.32;
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
            var onLabel = i18n('tools.game.soundOn', 'Mute');
            var offLabel = i18n('tools.game.soundOff', 'Unmute');
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
        select: function () { tone(660, 0.06, 'sine', 0.22); },
        click: function () { tone(520, 0.05, 'triangle', 0.2); },
        place: function () {
            tone(420, 0.07, 'sine', 0.26);
            tone(630, 0.05, 'sine', 0.16, (ctx && ctx.currentTime) + 0.04);
        },
        move: function () {
            tone(380, 0.06, 'triangle', 0.22);
            tone(480, 0.05, 'triangle', 0.16, (ctx && ctx.currentTime) + 0.035);
        },
        swap: function () {
            tone(500, 0.05, 'sine', 0.2);
            tone(700, 0.06, 'sine', 0.2, (ctx && ctx.currentTime) + 0.05);
        },
        invalid: function () {
            tone(220, 0.12, 'sawtooth', 0.16);
            tone(160, 0.14, 'sawtooth', 0.12, (ctx && ctx.currentTime) + 0.06);
        },
        match: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(523, 0.08, 'sine', 0.24, t);
            tone(659, 0.08, 'sine', 0.24, t + 0.06);
            tone(784, 0.1, 'sine', 0.24, t + 0.12);
        },
        hit: function () {
            tone(240, 0.04, 'square', 0.12);
            noiseBurst(0.04, 0.16);
        },
        brick: function () {
            tone(340, 0.05, 'triangle', 0.2);
            noiseBurst(0.05, 0.2);
        },
        power: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(440, 0.07, 'sine', 0.24, t);
            tone(660, 0.08, 'sine', 0.24, t + 0.07);
            tone(880, 0.1, 'sine', 0.24, t + 0.14);
        },
        life: function () {
            tone(300, 0.1, 'sawtooth', 0.14);
            tone(200, 0.14, 'sawtooth', 0.12, (ctx && ctx.currentTime) + 0.08);
        },
        win: function () {
            var t = ctx ? ctx.currentTime : 0;
            [523, 659, 784, 1046].forEach(function (f, i) {
                tone(f, 0.16, 'sine', 0.28, t + i * 0.1);
            });
        },
        lose: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(392, 0.18, 'triangle', 0.24, t);
            tone(311, 0.22, 'triangle', 0.24, t + 0.14);
            tone(233, 0.28, 'triangle', 0.24, t + 0.3);
        },
        start: function () {
            tone(523, 0.08, 'sine', 0.2);
            tone(784, 0.1, 'sine', 0.2, (ctx && ctx.currentTime) + 0.08);
        },
        level: function () {
            var t = ctx ? ctx.currentTime : 0;
            tone(659, 0.08, 'sine', 0.24, t);
            tone(784, 0.08, 'sine', 0.24, t + 0.07);
            tone(988, 0.12, 'sine', 0.24, t + 0.14);
        }
    };

    // Bright major / cute casual-game earworms (short looping phrases)
    // scale: C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 (pentatonic-leaning, skip F/B for "羊了个羊" vibe)
    var CATCHY_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

    var THEMES = {
        // bouncy sheep-style motif: short call-and-response, sticky loop
        catchy: {
            bpm: 264,
            scale: CATCHY_SCALE,
            lead: [
                // call
                3, 3, 5, 3, 4, 4, 3, -1,
                1, 1, 3, 1, 0, 0, 0, -1,
                // response (higher)
                5, 5, 7, 5, 4, 3, 1, 3,
                5, 5, 4, 3, 1, 0, 0, -1,
                // bounce climb
                0, 1, 3, 5, 4, 3, 1, 0,
                3, 4, 5, 7, 5, 4, 3, 1,
                // tag — repeats hard in the ear
                5, 3, 5, 3, 4, 1, 0, 1,
                3, 3, 4, 3, 1, 0, 0, -1
            ],
            bass: [0, -1, 0, 3, 4, -1, 4, 3, 0, -1, 0, 3, 4, 3, 1, 0],
            hop: [5, 7, 5, -1, 8, 5, 7, -1]
        },
        calm: null,
        upbeat: null,
        arcade: null
    };
    THEMES.calm = THEMES.catchy;
    THEMES.upbeat = THEMES.catchy;
    THEMES.arcade = THEMES.catchy;

    function playVoice(freq, dur, type, gain, when) {
        var c = ensure();
        if (!c || muted || !bgmGain || c.state !== 'running') return;
        var t0 = when != null ? when : c.currentTime;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur * 0.9));
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    function playKick(beatDur) {
        var c = ensure();
        if (!c || muted || !bgmGain || c.state !== 'running') return;
        var t0 = c.currentTime;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t0);
        osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.08);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + beatDur * 0.55);
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(t0);
        osc.stop(t0 + beatDur);
    }

    function playHat(beatDur) {
        noiseBurst(Math.min(0.04, beatDur * 0.35), 0.08);
    }

    function startBgmInternal() {
        stopBgmInternal();
        if (!unlocked || muted) return;
        if (!ensure()) return;
        var theme = THEMES[bgmTheme] || THEMES.catchy;
        var beat = 60 / theme.bpm;
        bgmStep = 0;
        function tick() {
            if (muted || !bgmWanted) return;
            var c = ensure();
            if (!c || c.state !== 'running') {
                bgmTimer = global.setTimeout(tick, beat * 1000);
                return;
            }
            var lead = theme.lead;
            var bass = theme.bass;
            var hop = theme.hop;
            var li = lead[bgmStep % lead.length];
            var bi = bass[bgmStep % bass.length];
            var hi = hop[bgmStep % hop.length];
            var t0 = c.currentTime;

            // kick on 0/4, hat on offbeats — keeps the loop dancing
            if (bgmStep % 4 === 0) playKick(beat);
            else if (bgmStep % 2 === 1) playHat(beat);

            if (li >= 0) {
                playVoice(theme.scale[li % theme.scale.length], beat * 0.88, 'triangle', 0.3, t0);
                // cute chirp on alternate notes
                if (bgmStep % 2 === 0) {
                    playVoice(theme.scale[li % theme.scale.length] * 2, beat * 0.4, 'sine', 0.12, t0);
                }
            }
            if (bi >= 0) {
                playVoice(theme.scale[bi % theme.scale.length] / 2, beat * 1.05, 'square', 0.18, t0);
            }
            if (hi >= 0 && bgmStep % 4 === 2) {
                playVoice(theme.scale[hi % theme.scale.length], beat * 0.35, 'sine', 0.14, t0 + beat * 0.45);
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
        if (!unlocked) return;
        unlock().then(function () {
            playSfxNow(name);
        });
    }

    function startBgm(theme) {
        // All game themes map to the same catchy earworm loop
        bgmTheme = 'catchy';
        if (theme && THEMES[theme]) bgmTheme = theme === 'calm' || theme === 'upbeat' || theme === 'arcade'
            ? 'catchy'
            : theme;
        bgmWanted = true;
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
