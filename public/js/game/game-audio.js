/**
 * Shared procedural SFX + BGM for casual games (Web Audio API).
 * AudioContext is created only after a user gesture (browser autoplay policy).
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'tb-game-audio-muted';
    var VOLUME_KEY = 'tb-game-audio-volume';
    var ctx = null;
    var master = null;
    var sfxGain = null;
    var bgmGain = null;
    var unlocked = false;
    var muted = false;
    // 0–2 multiplier on master: 1 = current default (slider middle), 2 = louder max
    var volume = 1;
    var bgmTimer = null;
    var bgmStep = 0;
    var bgmTheme = 'catchy';
    var bgmWanted = false;
    var muteBtns = [];
    var volumeSliders = [];
    var pendingSfx = null;
    var resumeInFlight = null;

    try {
        muted = localStorage.getItem(STORAGE_KEY) === '1';
        var savedVol = parseFloat(localStorage.getItem(VOLUME_KEY));
        if (!isNaN(savedVol)) volume = Math.max(0, Math.min(2, savedVol));
    } catch (e) { /* ignore */ }

    function masterLevel() {
        return muted ? 0 : volume;
    }

    function applyMasterGain() {
        if (!master || !ctx) return;
        var now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(masterLevel(), now, 0.03);
    }

    function AC() {
        return global.AudioContext || global.webkitAudioContext;
    }

    /** @param {boolean} canCreate - only true from unlock() inside a user gesture */
    function ensure(canCreate) {
        if (ctx) return ctx;
        if (!canCreate) return null;
        var Ctor = AC();
        if (!Ctor) return null;
        try {
            ctx = new Ctor();
        } catch (e) {
            return null;
        }
        master = ctx.createGain();
        master.gain.value = masterLevel();
        master.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 2.2;
        sfxGain.connect(master);
        bgmGain = ctx.createGain();
        bgmGain.gain.value = 0.64;
        bgmGain.connect(master);
        return ctx;
    }

    function gestureActive() {
        try {
            // Chrome: only create/resume AudioContext while this is true
            if (navigator.userActivation && typeof navigator.userActivation.isActive === 'boolean') {
                return navigator.userActivation.isActive;
            }
        } catch (e) { /* ignore */ }
        return true;
    }

    function beepUnlock(c) {
        // Silent one-sample buffer — helps iOS / Chrome mark the context as running
        try {
            var buf = c.createBuffer(1, 1, c.sampleRate || 22050);
            var src = c.createBufferSource();
            src.buffer = buf;
            src.connect(master || c.destination);
            src.start(0);
        } catch (e) { /* ignore */ }
    }

    /** @param {boolean} fromResume - context just resumed after suspend; re-kick BGM */
    function afterUnlock(fromResume) {
        if (!ctx || ctx.state !== 'running') return;
        applyMasterGain();
        if (bgmWanted && !muted) {
            // After suspend (e.g. timer SFX / tab), scheduler may be dead — restart
            if (!bgmTimer || fromResume) startBgmInternal();
        }
        if (pendingSfx) {
            var name = pendingSfx;
            pendingSfx = null;
            if (!muted) playSfxNow(name);
        }
    }

    /**
     * Call from pointerdown/click. Creates AudioContext only while the browser
     * still has a user gesture (avoids console warning + silent failure).
     */
    function unlock() {
        if (!gestureActive()) return Promise.resolve();
        unlocked = true;
        var c = ensure(true);
        if (!c) return Promise.resolve();
        if (c.state === 'running') {
            afterUnlock(false);
            return Promise.resolve();
        }
        if (resumeInFlight) return resumeInFlight;
        beepUnlock(c);
        var p;
        try {
            p = c.resume();
        } catch (e) {
            return Promise.resolve();
        }
        resumeInFlight = Promise.resolve(p).then(function () {
            resumeInFlight = null;
            afterUnlock(true);
        }).catch(function () {
            resumeInFlight = null;
        });
        return resumeInFlight;
    }

    function setMasterMute(on) {
        muted = !!on;
        try {
            localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
        } catch (e) { /* ignore */ }
        applyMasterGain();
        if (muted) stopBgmInternal();
        else if (bgmWanted && unlocked) startBgmInternal();
        syncMuteButtons();
        syncVolumeSliders();
    }

    function setVolume(v) {
        var next = Math.max(0, Math.min(2, Number(v)));
        if (isNaN(next)) return;
        volume = next;
        try {
            localStorage.setItem(VOLUME_KEY, String(volume));
        } catch (e) { /* ignore */ }
        // dragging above 0 while muted → unmute
        if (volume > 0.001 && muted) {
            muted = false;
            try { localStorage.setItem(STORAGE_KEY, '0'); } catch (e2) { /* ignore */ }
            if (bgmWanted && unlocked) startBgmInternal();
            syncMuteButtons();
        }
        applyMasterGain();
        syncVolumeSliders();
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

    function syncVolumeSliders() {
        // slider 0–100 maps to volume 0–2 (50 = default)
        var pct = String(Math.round(volume * 50));
        volumeSliders.forEach(function (el) {
            if (!el) return;
            if (String(el.value) !== pct) el.value = pct;
            el.setAttribute('aria-valuenow', pct);
            el.title = i18n('tools.game.volume', 'Volume') + ' ' + pct + '%';
        });
    }

    function tone(freq, dur, type, gain, when, dest) {
        var c = ensure(false);
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
        var c = ensure(false);
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
        shoot: function () {
            tone(880, 0.04, 'square', 0.12);
            tone(520, 0.06, 'triangle', 0.1, (ctx && ctx.currentTime) + 0.03);
        },
        jump: function () {
            tone(360, 0.06, 'square', 0.16);
            tone(520, 0.08, 'square', 0.14, (ctx && ctx.currentTime) + 0.04);
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

    // Bright C major platformer vibe — original composition (not Nintendo copyright)
    // C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5
    var SCALE_C = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99];

    // Bouncy major hook ×3 — cheerful, skippy, Mario-era feel (original notes)
    var MARIOISH_HOOK = [
        // bounce up
        2, 4, 7, 4, 3, 5, 4, 2,
        0, 2, 4, 7, 6, 4, 5, 4,
        // higher reply then land
        2, 4, 7, 9, 8, 6, 7, 5,
        4, 2, 0, 2, 4, -1, 4, -1
    ];

    var THEMES = {
        // Cheerful major FC platformer BGM (era-inspired, original)
        catchy: {
            bpm: 158,
            scale: SCALE_C,
            voice: 'square',
            lead: MARIOISH_HOOK.concat(MARIOISH_HOOK, MARIOISH_HOOK),
            // skippy root–fifth bass
            bass: [
                0, -1, 4, -1, 0, -1, 4, -1,
                5, -1, 4, -1, 0, -1, 4, -1,
                0, -1, 4, -1, 0, -1, 4, -1,
                3, -1, 4, -1, 0, -1, 4, -1
            ],
            // light sparkle arpeggio
            hop: [7, -1, 9, -1, 11, -1, 9, -1, 7, -1, 4, -1, 7, -1, 9, -1]
        },
        calm: null,
        upbeat: null,
        arcade: null
    };
    THEMES.calm = THEMES.catchy;
    THEMES.upbeat = THEMES.catchy;
    THEMES.arcade = THEMES.catchy;

    function playVoice(freq, dur, type, gain, when) {
        var c = ensure(false);
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
        var c = ensure(false);
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

    var bgmNextTime = 0;

    function startBgmInternal() {
        stopBgmInternal();
        if (!unlocked || muted) return;
        var c = ensure(false);
        if (!c) return;
        var theme = THEMES[bgmTheme] || THEMES.catchy;
        var beat = 60 / theme.bpm;
        bgmStep = 0;
        bgmNextTime = c.currentTime + 0.05;

        function scheduleAt(t0, step) {
            var lead = theme.lead;
            var bass = theme.bass;
            var hop = theme.hop;
            var li = lead[step % lead.length];
            var bi = bass[step % bass.length];
            var hi = hop[step % hop.length];

            if (step % 4 === 0) {
                // inline kick at exact audio time
                if (!muted && bgmGain && c.state === 'running') {
                    var kOsc = c.createOscillator();
                    var kG = c.createGain();
                    kOsc.type = 'sine';
                    kOsc.frequency.setValueAtTime(140, t0);
                    kOsc.frequency.exponentialRampToValueAtTime(55, t0 + 0.08);
                    kG.gain.setValueAtTime(0.0001, t0);
                    kG.gain.exponentialRampToValueAtTime(0.45, t0 + 0.01);
                    kG.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 0.55);
                    kOsc.connect(kG);
                    kG.connect(bgmGain);
                    kOsc.start(t0);
                    kOsc.stop(t0 + beat);
                }
            } else if (step % 2 === 1) {
                // soft hat
                var len = Math.max(1, Math.floor(c.sampleRate * Math.min(0.04, beat * 0.35)));
                var buf = c.createBuffer(1, len, c.sampleRate);
                var data = buf.getChannelData(0);
                var i;
                for (i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
                var src = c.createBufferSource();
                var hg = c.createGain();
                var f = c.createBiquadFilter();
                f.type = 'highpass';
                f.frequency.value = 4000;
                src.buffer = buf;
                hg.gain.setValueAtTime(0.06, t0);
                hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
                src.connect(f);
                f.connect(hg);
                hg.connect(bgmGain);
                src.start(t0);
                src.stop(t0 + 0.05);
            }

            if (li >= 0) {
                // bright short square lead
                playVoice(theme.scale[li % theme.scale.length], beat * 0.7, theme.voice || 'square', 0.34, t0);
                // soft octave sparkle for "platformer" bounce
                if (step % 4 === 0) {
                    playVoice(theme.scale[li % theme.scale.length] * 2, beat * 0.35, 'triangle', 0.08, t0);
                }
            }
            if (bi >= 0) {
                playVoice(theme.scale[bi % theme.scale.length] / 2, beat * 0.9, 'triangle', 0.24, t0);
            }
            if (hi >= 0) {
                playVoice(theme.scale[hi % theme.scale.length], beat * 0.4, 'square', 0.09, t0);
            }
        }

        function tick() {
            if (muted || !bgmWanted) return;
            c = ensure(false);
            if (!c || c.state !== 'running') {
                bgmTimer = global.setTimeout(tick, 50);
                return;
            }
            // schedule ahead on the audio clock to avoid setTimeout drift/stutter
            var horizon = c.currentTime + 0.12;
            while (bgmNextTime < horizon) {
                scheduleAt(bgmNextTime, bgmStep);
                bgmNextTime += beat;
                bgmStep++;
            }
            bgmTimer = global.setTimeout(tick, 25);
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

    var SFX_ALIAS = {
        fire: 'shoot',
        laser: 'shoot',
        bomb: 'power',
        coin: 'place',
        eat: 'place',
        kick: 'hit',
        punch: 'hit',
        land: 'move'
    };

    function sfx(name) {
        if (muted) return;
        if (!SFX[name] && SFX_ALIAS[name]) name = SFX_ALIAS[name];
        if (!SFX[name]) return;
        // Never call resume() here — that triggers AudioContext autoplay warnings from rAF/game logic
        if (!unlocked || !ctx || ctx.state !== 'running') {
            pendingSfx = name;
            return;
        }
        playSfxNow(name);
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
        // pointerdown keeps user-activation; click alone can be too late (esp. DevTools device mode)
        btn.addEventListener('pointerdown', function () { unlock(); });
        btn.addEventListener('click', function () {
            unlock();
            setMasterMute(!muted);
        });
    }

    function bindVolumeSlider(el) {
        if (!el) return;
        volumeSliders.push(el);
        el.min = '0';
        el.max = '100';
        el.step = '1';
        syncVolumeSliders();
        var onChange = function () {
            unlock();
            // 50 → volume 1 (default), 100 → volume 2 (louder)
            setVolume(Number(el.value) / 50);
        };
        el.addEventListener('pointerdown', function () { unlock(); });
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
    }

    function bindControls(opts) {
        opts = opts || {};
        bindMuteButton(opts.muteBtn || document.getElementById('sound-btn'));
        bindVolumeSlider(opts.volumeSlider || document.getElementById('volume-slider'));
    }

    function refreshInjectedLabels() {
        syncMuteButtons();
        var volSpan = document.querySelector('.game-volume [data-i18n="tools.game.volume"]');
        if (volSpan) volSpan.textContent = i18n('tools.game.volume', 'Volume');
        var volInput = document.getElementById('volume-slider');
        if (volInput) volInput.setAttribute('aria-label', i18n('tools.game.volume', 'Volume'));
    }

    function injectToolbarControls() {
        if (document.getElementById('sound-btn') && document.getElementById('volume-slider')) {
            bindControls();
            refreshInjectedLabels();
            return true;
        }
        var row = document.querySelector('.game-toolbar .action-row') ||
            document.querySelector('.tool-card .action-row') ||
            document.querySelector('.action-row');
        if (!row) {
            var card = document.querySelector('.game-card') || document.querySelector('.tool-card');
            if (!card) return false;
            row = document.createElement('div');
            row.className = 'action-row game-audio-bar';
            card.insertBefore(row, card.firstChild);
        }
        if (!document.getElementById('sound-btn')) {
            var mute = document.createElement('button');
            mute.type = 'button';
            mute.className = 'tb-btn';
            mute.id = 'sound-btn';
            mute.setAttribute('data-i18n', 'tools.game.soundOn');
            mute.textContent = i18n('tools.game.soundOn', 'Mute');
            row.insertBefore(mute, row.firstChild);
        }
        if (!document.getElementById('volume-slider')) {
            var lab = document.createElement('label');
            lab.className = 'game-volume';
            var span = document.createElement('span');
            span.setAttribute('data-i18n', 'tools.game.volume');
            span.textContent = i18n('tools.game.volume', 'Volume');
            var input = document.createElement('input');
            input.type = 'range';
            input.id = 'volume-slider';
            input.min = '0';
            input.max = '100';
            input.value = '50';
            input.setAttribute('aria-label', i18n('tools.game.volume', 'Volume'));
            lab.appendChild(span);
            lab.appendChild(input);
            var muteBtn = document.getElementById('sound-btn');
            if (muteBtn && muteBtn.nextSibling) row.insertBefore(lab, muteBtn.nextSibling);
            else row.appendChild(lab);
        }
        bindControls();
        if (typeof global.tbApplyI18n === 'function') global.tbApplyI18n(row);
        refreshInjectedLabels();
        return true;
    }

    var gestureUnlockBound = false;

    /**
     * pointerdown keeps userActivation; click/onclick often runs after it expires
     * (esp. mobile / DevTools device mode), so unlock-on-click alone stays silent.
     */
    function bindGestureUnlock() {
        if (gestureUnlockBound) return;
        gestureUnlockBound = true;
        document.addEventListener('pointerdown', function () {
            unlock();
        }, { capture: true, passive: true });
    }

    /** Call once from each game: inject mute/volume UI + start BGM. */
    function boot(theme) {
        var run = function () {
            bindGestureUnlock();
            injectToolbarControls();
            startBgm(theme || 'catchy');
            refreshInjectedLabels();
        };
        // After i18n init when possible (DOMContentLoaded listener order = script order)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    document.addEventListener('tb:locale', refreshInjectedLabels);

    global.GameAudio = {
        unlock: unlock,
        sfx: sfx,
        startBgm: startBgm,
        stopBgm: stopBgm,
        setMuted: setMasterMute,
        isMuted: function () { return muted; },
        setVolume: setVolume,
        getVolume: function () { return volume; },
        bindMuteButton: bindMuteButton,
        bindVolumeSlider: bindVolumeSlider,
        bindControls: bindControls,
        injectToolbarControls: injectToolbarControls,
        boot: boot,
        refreshMuteLabels: syncMuteButtons,
        themes: Object.keys(THEMES)
    };
})(window);
