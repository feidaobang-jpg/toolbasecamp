// Original Web Audio sound design (oscillators + noise). No samples or transcriptions from the original game.
export class GameAudio {
  constructor() { this.enabled = true; this.ctx = null; this.engineLevel = 0; }
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = this.enabled ? .2 : 0;
      this.gain.connect(this.ctx.destination);
      this.capture = this.ctx.createMediaStreamDestination(); this.gain.connect(this.capture);
      // Engine: two detuned saws through a low-pass, level driven by tick().
      this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      this.eng = [this.ctx.createOscillator(), this.ctx.createOscillator()];
      this.eng[0].type = 'sawtooth'; this.eng[1].type = 'square'; this.eng[0].frequency.value = 52; this.eng[1].frequency.value = 26.5;
      this.lfo = this.ctx.createOscillator(); this.lfo.frequency.value = 11; const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 6;
      this.lfo.connect(lfoGain); lfoGain.connect(this.eng[0].frequency);
      for (const o of this.eng) { o.connect(lp); o.start(); }
      this.lfo.start(); lp.connect(this.engGain); this.engGain.connect(this.gain);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .25, slideTo = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
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
  effect(e) {
    const name = typeof e === 'string' ? e : e.type, team = e.team;
    const map = {
      fire: () => team === 'player' ? (this.tone(420, .07, 'square', 0, .16, 180), this.noise(.06, 0, .12, 2400, 'highpass')) : this.tone(300, .08, 'square', 0, .08, 140),
      brick: () => { this.noise(.16, 0, team === 'player' ? .3 : .16, 1300); this.tone(140, .08, 'triangle', 0, .15, 70); },
      steel: () => team === 'player' && (this.tone(1560, .09, 'square', 0, .12, 1200), this.tone(2340, .06, 'triangle', .01, .08)),
      border: () => team === 'player' && this.tone(1180, .07, 'square', 0, .09, 900),
      puff: () => this.noise(.08, 0, .12, 3000),
      deflect: () => this.tone(1800, .12, 'sine', 0, .14, 2600),
      armor: () => this.tone(900, .08, 'square', 0, .14, 600),
      boom: () => { this.noise(.55, 0, .45, 700); this.tone(110, .45, 'sawtooth', 0, .28, 34); if (team === 'player') this.arp([392, 311, 233, 175], .09, 'triangle', .2, .16); },
      baseboom: () => { this.noise(1.2, 0, .6, 500); this.tone(80, 1, 'sawtooth', 0, .35, 24); this.noise(.5, .25, .4, 1600); },
      spawn: () => this.tone(team === 'player' ? 520 : 760, .14, 'sine', 0, .06, team === 'player' ? 1040 : 1520),
      playerSpawn: () => this.arp([523, 784], .07, 'triangle', .14),
      powerup: () => this.arp([988, 1319, 988, 1319, 1568], .06, 'triangle', .16, .1),
      pickup: () => this.arp([659, 784, 988, 1319], .06, 'square', .18, .12),
      levelup: () => this.arp([523, 659, 784, 1047, 1319], .05, 'square', .16, .1),
      life: () => this.arp([784, 988, 1175, 1568, 1175, 1568], .07, 'triangle', .22, .14),
      shield: () => this.tone(420, .5, 'sine', 0, .18, 1400),
      freeze: () => { this.arp([1976, 1760, 1568, 1319, 1175], .05, 'sine', .14, .18); },
      shovel: () => [0, .12, .24].forEach(d => { this.tone(220, .09, 'square', d, .16, 110); this.noise(.06, d, .14, 1800); }),
      shovelEnd: () => this.tone(330, .2, 'triangle', 0, .12, 220),
      grenade: () => { this.noise(1, 0, .6, 800); this.tone(60, .9, 'sawtooth', 0, .35, 30); },
      die: () => {},
      start: () => this.arp([392, 523, 659, 784, 659, 784, 1047], .11, 'square', .18, .16),
      pause: () => this.arp([880, 660], .08, 'square', .14, .08),
      gameover: () => this.arp([523, 466, 392, 311, 262, 196], .18, 'triangle', .26, .3),
      win: () => this.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], .11, 'square', .24, .18)
    };
    (map[name] || (() => {}))();
  }
  // Called every frame: engine rumble rises while the player drives.
  tick(active, moving) {
    if (!this.ctx || !this.engGain) return;
    const goal = !this.enabled || !active ? 0 : moving ? .5 : .16;
    this.engineLevel += (goal - this.engineLevel) * .12;
    this.engGain.gain.setTargetAtTime(this.engineLevel, this.ctx.currentTime, .03);
    this.eng[0].frequency.setTargetAtTime(moving ? 64 : 48, this.ctx.currentTime, .12);
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .2 : 0; return this.enabled; }
}
