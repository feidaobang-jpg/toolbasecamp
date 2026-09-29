// Original oscillator phrases evoking a jungle run-and-gun mood; no transcriptions.
export class GameAudio {
  constructor() { this.enabled = true; this.ctx = null; this.next = 0; this.beat = 0; }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext(); this.gain = this.ctx.createGain(); this.gain.gain.value = .16;
      this.gain.connect(this.ctx.destination);
      this.capture = this.ctx.createMediaStreamDestination(); this.gain.connect(this.capture);
    }
    await this.ctx.resume();
  }
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .25) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + duration);
  }
  noise(duration = .3, delay = 0, volume = .3) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.gain); src.start(t);
  }
  effect(name) {
    const map = {
      shoot: () => this.tone(920, .06, 'square', 0, .18),
      eshoot: () => this.tone(320, .08, 'sawtooth', 0, .12),
      clank: () => this.tone(1300, .05, 'square', 0, .12),
      boom: () => { this.noise(.35, 0, .4); this.tone(90, .25, 'sawtooth', 0, .3); },
      bridgearm: () => { this.tone(660, .09, 'square', 0, .2); this.tone(660, .09, 'square', .12, .2); },
      bridgeboom: () => { this.noise(.5, 0, .5); this.tone(70, .35, 'sawtooth', 0, .35); },
      splash: () => this.noise(.25, 0, .25),
      dive: () => { this.tone(500, .1, 'sine', 0, .2); this.tone(260, .12, 'sine', .08, .2); },
      surface: () => { this.tone(260, .1, 'sine', 0, .2); this.tone(500, .12, 'sine', .08, .2); },
      pickup: () => [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .12, 'square', i * .07, .3)),
      capsule: () => [880, 660, 880, 660].forEach((f, i) => this.tone(f, .09, 'triangle', i * .1, .18)),
      jump: () => { this.tone(280, .07, 'square', 0, .16); this.tone(520, .08, 'square', .05, .14); },
      checkpoint: () => { this.tone(600, .12, 'square', 0, .25); this.tone(800, .14, 'square', .1, .25); },
      die: () => { [440, 330, 220, 110].forEach((f, i) => this.tone(f, .16, 'sawtooth', i * .09, .28)); this.noise(.4, .1, .3); },
      gameover: () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, .22, 'triangle', i * .18, .3)),
      win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, .16, 'square', i * .12, .3))
    };
    (map[name] || (() => {}))();
  }
  tick(playing) {
    if (!this.ctx) return;
    if (!playing) { this.next = this.ctx.currentTime; return; }
    if (this.ctx.currentTime >= this.next) {
      // Driving original bassline: minor key, marching eighth-feel.
      const bass = [131, 0, 131, 156, 131, 0, 117, 131, 110, 0, 110, 131, 123, 0, 117, 110];
      const lead = [0, 523, 0, 0, 622, 0, 523, 0, 0, 466, 0, 0, 440, 0, 0, 0];
      const b = this.beat;
      if (bass[b % 16]) this.tone(bass[b % 16], .14, 'triangle', 0, .22);
      if (b % 4 === 0) this.tone(65, .16, 'triangle', 0, .3);
      if (lead[b % 16] && b % 32 >= 16) this.tone(lead[b % 16], .1, 'square', 0, .1);
      this.beat++; this.next = this.ctx.currentTime + .155;
    }
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .16 : 0; return this.enabled; }
}
