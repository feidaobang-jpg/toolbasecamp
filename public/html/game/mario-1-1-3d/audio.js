// Original chiptune-style audio for Mario 1-1 3D (all synthesised, no samples).
export class GameAudio {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false; this.bgmTimer = null; this.step = 0;
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : .32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  mute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : .32;
    if (this.muted) this.stopBgm(); else this.startBgm();
    return this.muted;
  }
  tone(freq, dur, type = 'square', delay = 0, vol = .22, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + .02);
  }
  noise(dur, delay = 0, vol = .25, hp = 400) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
  // Upbeat original loop in C major, 8 bars of eighth notes.
  startBgm() {
    if (this.bgmTimer || !this.ctx || this.muted) return;
    const lead = [
      523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 698, 0,
      523, 0, 659, 0, 784, 0, 1047, 0, 988, 784, 659, 587, 523, 0, 0, 0,
      659, 0, 784, 0, 988, 0, 784, 0, 587, 0, 698, 0, 880, 0, 698, 0,
      523, 523, 659, 659, 784, 0, 880, 784, 659, 0, 523, 0, 392, 0, 0, 0,
    ];
    const bass = [
      131, 0, 196, 0, 131, 0, 196, 0, 147, 0, 220, 0, 147, 0, 220, 0,
      131, 0, 196, 0, 131, 0, 196, 0, 165, 0, 220, 0, 165, 0, 220, 0,
      147, 0, 220, 0, 147, 0, 220, 0, 131, 0, 196, 0, 131, 0, 196, 0,
      131, 131, 165, 165, 196, 0, 220, 196, 165, 0, 131, 0, 98, 0, 0, 0,
    ];
    const spb = .16;
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.step % lead.length;
      if (lead[i]) this.tone(lead[i], spb * 1.7, 'square', 0, .1);
      if (bass[i]) this.tone(bass[i], spb * 1.8, 'triangle', 0, .14);
      this.step++;
    }, spb * 1000);
  }
  stopBgm() { clearInterval(this.bgmTimer); this.bgmTimer = null; }
  tick(on) { if (on && !this.bgmTimer) this.startBgm(); if (!on) this.stopBgm(); }
  effect(type) {
    switch (type) {
      case 'jump': this.tone(330, .18, 'square', 0, .2, 420); break;
      case 'coin': this.tone(988, .09, 'square', 0, .22); this.tone(1319, .22, 'square', .09, .22); break;
      case 'stomp': this.noise(.16, 0, .3, 200); this.tone(180, .12, 'square', 0, .2, -80); break;
      case 'bump': this.tone(140, .1, 'square', 0, .22, -40); break;
      case 'brick': this.noise(.3, 0, .35, 300); this.tone(220, .18, 'sawtooth', 0, .16, -120); break;
      case 'powerAppear': [392, 523, 659, 784].forEach((f, i) => this.tone(f, .1, 'square', i * .07, .2)); break;
      case 'grow': [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, .09, 'square', i * .05, .2)); break;
      case 'shrink': [784, 659, 523, 392, 330, 262].forEach((f, i) => this.tone(f, .09, 'square', i * .05, .2)); break;
      case 'die': this.tone(494, .12, 'square', 0, .25); this.tone(466, .12, 'square', .14, .25); this.tone(440, .3, 'square', .28, .25, -300); this.noise(.5, .3, .2, 150); break;
      case 'oneup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .12, 'triangle', i * .08, .25)); break;
      case 'checkpoint': this.tone(660, .12, 'square', 0, .2); this.tone(880, .18, 'square', .12, .2); break;
      case 'flag': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .14, 'square', i * .1, .22)); break;
      case 'win': [523, 523, 523, 659, 784, 0, 659, 784, 1047].forEach((f, i) => this.tone(f, f ? .16 : .02, 'square', i * .16, .24)); break;
    }
  }
}
