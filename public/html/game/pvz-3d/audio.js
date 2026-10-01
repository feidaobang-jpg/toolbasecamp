// Original Web Audio sound design (oscillators + noise). No samples or transcriptions from the original game.
export class GameAudio {
  constructor() { this.enabled = true; this.ctx = null; }
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = this.enabled ? .22 : 0;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .2, slideTo = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + duration + .02);
  }
  noise(duration = .3, delay = 0, volume = .25, cutoff = 900, type = 'lowpass') {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buf; f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.gain); src.start(t);
  }
  arp(notes, step = .08, type = 'square', volume = .18, len = .12) { notes.forEach((f, i) => this.tone(f, len, type, i * step, volume)); }
  // Zombie moan: two detuned saws sliding down through a low-pass.
  groan(pitch = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const det of [0, 7]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420;
      o.frequency.setValueAtTime((92 + det) * pitch, t); o.frequency.exponentialRampToValueAtTime(58 * pitch, t + .7);
      g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.09, t + .12); g.gain.exponentialRampToValueAtTime(.001, t + .8);
      o.connect(f); f.connect(g); g.connect(this.gain); o.start(t); o.stop(t + .85);
    }
  }
  effect(e) {
    const name = typeof e === 'string' ? e : e.type;
    const map = {
      plant: () => { this.noise(.14, 0, .3, 700); this.tone(180, .12, 'triangle', 0, .2, 90); this.tone(620, .1, 'sine', .04, .1, 880); },
      shovel: () => [0, .1, .2].forEach(d => { this.noise(.07, d, .22, 1600); this.tone(260, .06, 'square', d, .1, 140); }),
      shoot: () => { this.tone(560, .08, 'square', 0, .12, 210); this.noise(.05, 0, .08, 2600, 'highpass'); },
      iceShoot: () => this.tone(980, .12, 'sine', 0, .12, 420),
      peaHit: () => { this.noise(.06, 0, .18, 1800); this.tone(300, .05, 'triangle', 0, .1, 160); },
      zombieHit: () => { this.tone(150, .09, 'sawtooth', 0, .14, 80); this.noise(.08, 0, .12, 800); },
      zombiedie: () => { this.tone(120, .5, 'sawtooth', 0, .16, 45); this.noise(.3, .05, .16, 600); },
      groan: () => this.groan(e.pitch || 1),
      chomp: () => { this.noise(.09, 0, .2, 1100); this.tone(90, .1, 'square', 0, .12, 60); },
      smash: () => { this.noise(.25, 0, .4, 500); this.tone(70, .3, 'sawtooth', 0, .25, 32); },
      sunSpawn: () => this.tone(1245, .16, 'sine', 0, .08, 1560),
      sunpick: () => this.arp([988, 1319, 1568], .05, 'sine', .14, .1),
      boom: () => { this.noise(.7, 0, .5, 700); this.tone(95, .55, 'sawtooth', 0, .3, 30); this.noise(.3, .12, .3, 1800); },
      mower: () => { for (let i = 0; i < 5; i++) { this.tone(110 + i * 8, .16, 'sawtooth', i * .09, .16); this.noise(.1, i * .09, .14, 900); } },
      wave: () => this.arp([330, 330, 392, 330], .16, 'triangle', .16, .18),
      huge: () => { this.arp([220, 262, 311, 262, 220], .2, 'sawtooth', .18, .3); this.groan(.8); },
      error: () => this.tone(210, .12, 'square', 0, .1, 170),
      pick: () => this.tone(740, .06, 'square', 0, .08),
      start: () => this.arp([392, 523, 659, 784, 659, 1047], .1, 'square', .16, .14),
      pause: () => this.arp([880, 660], .08, 'square', .12, .08),
      win: () => this.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], .11, 'square', .2, .16),
      lose: () => { this.arp([466, 415, 349, 262, 220], .22, 'triangle', .2, .3); this.noise(.6, .5, .2, 500); this.groan(.6); }
    };
    (map[name] || (() => {}))();
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .22 : 0; return this.enabled; }
}
