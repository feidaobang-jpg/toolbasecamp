// Original Web Audio sound design (oscillators + noise buffers). No external samples.
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
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .25, slideTo = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + duration + .02);
  }
  noise(duration = .3, delay = 0, volume = .3, cutoff = 900, type = 'lowpass') {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buf; f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.gain); src.start(t);
  }
  arp(notes, step = .08, type = 'square', volume = .2, len = .12) { notes.forEach((f, i) => this.tone(f, len, type, i * step, volume)); }
  effect(name) {
    const map = {
      rifle: () => { this.tone(540, .06, 'square', 0, .11, 200); this.noise(.05, 0, .1, 2800, 'highpass'); },
      sniper: () => { this.tone(1000, .17, 'sawtooth', 0, .2, 120); this.noise(.15, 0, .24, 1500); },
      flame: () => { this.noise(.12, 0, .07, 750); this.tone(90 + Math.random() * 40, .1, 'sawtooth', 0, .04, 60); },
      boom: () => { this.noise(.45, 0, .32, 700); this.tone(95, .35, 'sawtooth', 0, .22, 34); },
      acid: () => { this.tone(320, .18, 'sine', 0, .12, 90); this.noise(.12, 0, .08, 500); },
      growl: () => { this.tone(70 + Math.random() * 60, .22, 'sawtooth', 0, .09, 45 + Math.random() * 40); },
      zombiedie: () => { this.tone(180 + Math.random() * 80, .2, 'sawtooth', 0, .14, 50); this.noise(.1, 0, .1, 800); },
      hurt: () => { this.tone(220, .18, 'square', 0, .2, 90); this.noise(.1, 0, .14, 700); },
      wallhit: () => { this.tone(120, .2, 'square', 0, .16, 60); this.noise(.14, 0, .16, 500); },
      alarm: () => { this.tone(620, .3, 'square', 0, .12, 420); this.tone(620, .3, 'square', .38, .12, 420); },
      bossroar: () => { this.tone(90, .7, 'sawtooth', 0, .3, 40); this.noise(.6, 0, .22, 420); this.tone(140, .5, 'square', .1, .12, 70); },
      enrage: () => { this.tone(120, .4, 'sawtooth', 0, .24, 300); this.noise(.3, 0, .18, 900); },
      roll: () => this.noise(.16, 0, .14, 1200),
      pickup: () => this.arp([660, 880], .05, 'triangle', .12, .07),
      medkit: () => this.arp([523, 784, 1047], .06, 'triangle', .14, .1),
      turret: () => { this.tone(700, .05, 'square', 0, .09, 320); this.noise(.04, 0, .07, 3000, 'highpass'); },
      build: () => this.arp([392, 523, 659], .07, 'triangle', .18),
      repair: () => this.arp([440, 587, 880], .06, 'triangle', .16),
      deny: () => this.tone(180, .16, 'square', 0, .16, 120),
      respawn: () => this.arp([523, 659, 784], .08, 'triangle', .16),
      start: () => this.arp([392, 523, 659, 784, 659, 784, 1047], .11, 'square', .18, .16),
      pause: () => this.arp([880, 660], .08, 'square', .14, .08),
      gameover: () => this.arp([523, 466, 392, 311, 262, 196], .18, 'triangle', .26, .3),
      win: () => this.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], .11, 'square', .24, .18),
      waveclear: () => this.arp([659, 784, 988], .09, 'triangle', .18, .14)
    };
    (map[name] || (() => {}))();
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .22 : 0; return this.enabled; }
}
