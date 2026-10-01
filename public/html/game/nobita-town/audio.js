// Procedural Web Audio sound design (oscillators + noise). No samples, no external assets.
export class GameAudio {
  constructor() { this.enabled = true; this.ctx = null; }
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.enabled ? .22 : 0;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .22, slideTo = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + duration + .02);
  }
  noise(duration = .25, delay = 0, volume = .25, cutoff = 1200) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.gain); src.start(t);
  }
  arp(notes, step = .08, type = 'triangle', volume = .2, len = .12) { notes.forEach((f, i) => this.tone(f, len, type, i * step, volume)); }
  effect(name) {
    const map = {
      start: () => this.arp([392, 523, 659, 784], .1, 'triangle', .2, .16),
      jump: () => this.tone(300, .16, 'sine', 0, .14, 620),
      sign: () => { this.arp([659, 880], .07, 'sine', .16, .14); this.tone(1175, .3, 'sine', .14, .1, 1175); },
      bell: () => { this.tone(1568, .5, 'sine', 0, .2); this.tone(2093, .4, 'sine', .04, .12); this.arp([784, 988, 1319], .07, 'triangle', .14, .1); },
      pause: () => this.arp([880, 660], .08, 'square', .12, .08),
      resume: () => this.arp([660, 880], .08, 'square', .12, .08),
      win: () => this.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], .11, 'triangle', .24, .18)
    };
    (map[name] || (() => {}))();
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .22 : 0; return this.enabled; }
}
