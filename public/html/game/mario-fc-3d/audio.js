// Procedural WebAudio effects — no audio files, everything synthesized.
export class GameAudio {
    constructor() {
        this.ctx = null; this.master = null; this.muted = false; this.ok = false;
    }
    unlock() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = .5;
            this.master.connect(this.ctx.destination);
            this.ok = true;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    }
    mute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : .5; return this.muted; }
    tone(freq0, freq1, dur, type = 'square', vol = .22, delay = 0) {
        if (!this.ok || this.muted) return;
        const t0 = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq0, t0);
        if (freq1 && freq1 !== freq0) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + .02);
    }
    noise(dur, vol = .3, freq = 800) {
        if (!this.ok || this.muted) return;
        const t0 = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
        const g = this.ctx.createGain(); g.gain.value = vol;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0);
    }
    effect(type) {
        switch (type) {
            case 'jump': this.tone(340, 720, .18, 'square', .16); break;
            case 'coin': this.tone(988, 988, .08, 'square', .16); this.tone(1319, 1319, .3, 'square', .16, .08); break;
            case 'bump': this.tone(160, 90, .1, 'square', .2); break;
            case 'break': this.noise(.25, .35, 1400); this.tone(220, 80, .2, 'triangle', .18); break;
            case 'stomp': this.tone(300, 90, .14, 'triangle', .25); this.noise(.1, .2, 500); break;
            case 'spawn': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, .12, 'square', .14, i * .09)); break;
            case 'grow': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, .12, 'square', .16, i * .08)); break;
            case 'shrink': [784, 659, 523, 392].forEach((f, i) => this.tone(f, f, .1, 'square', .14, i * .07)); break;
            case 'checkpoint': [659, 784, 1047].forEach((f, i) => this.tone(f, f, .15, 'triangle', .16, i * .1)); break;
            case 'flag': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, .14, 'square', .15, i * .09)); break;
            case 'die': [494, 466, 440, 415, 220, 165].forEach((f, i) => this.tone(f, f, .16, 'triangle', .2, i * .12)); break;
            case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, .18, 'square', .16, i * .13)); break;
        }
    }
    tick() {}
}
