// Original chiptune-style score and effects (Web Audio oscillators + noise). No samples, no transcriptions.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
const m = s => s.split(' ').map(t => t === '.' ? 0 : t === '-' ? -1 : Number(t));   // midi numbers, '.' rest, '-' hold
// 64-step loop (eighth notes), key of F major, a bouncy meadow tune written for this game.
const LEAD = m('72 - 76 79 - 77 76 - 74 - 72 74 76 - . . 77 - 76 74 - 72 74 - 76 - 79 81 79 - . . 72 - 76 79 - 81 79 - 77 76 74 72 74 - . . 76 - 74 72 - 70 69 - 72 - 69 67 65 - . .');
const BASS = m('53 . 60 . 53 . 60 . 50 . 57 . 50 . 57 . 46 . 53 . 46 . 53 . 48 . 55 . 48 . 55 . 53 . 60 . 53 . 60 . 50 . 57 . 50 . 57 . 46 . 53 . 48 . 55 . 53 . 48 . 53 . 60 .');
export class GameAudio {
  constructor() { this.enabled = true; this.ctx = null; this.step = 0; this.next = 0; this.tempo = .145; this.music = true; }
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = this.enabled ? .22 : 0; this.gain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = .55; this.musicGain.connect(this.gain);
      this.capture = this.ctx.createMediaStreamDestination(); this.gain.connect(this.capture);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }
  tone(freq, dur = .1, type = 'square', delay = 0, vol = .2, slide = 0, out) {
    if (!this.enabled || !this.ctx || !freq) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(out || this.gain); o.start(t); o.stop(t + dur + .03);
  }
  noise(dur = .1, delay = 0, vol = .2, cutoff = 2000, type = 'lowpass', out) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = Math.max(1, Math.floor(this.ctx.sampleRate * dur)), buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = buf; f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(out || this.gain); s.start(t);
  }
  arp(notes, step = .06, type = 'square', vol = .18, len = .1) { notes.forEach((n, i) => this.tone(NOTE(n), len, type, i * step, vol)); }
  effect(e) {
    const name = typeof e === 'string' ? e : e.type;
    const map = {
      jump: () => this.tone(e.big ? 330 : 400, .16, 'square', 0, .13, e.big ? 740 : 880),
      stomp: () => { this.tone(220, .09, 'square', 0, .2, 110); this.noise(.06, 0, .15, 1200); },
      bump: () => this.tone(150, .08, 'triangle', 0, .25, 90),
      thud: () => this.tone(120, .06, 'triangle', 0, .18, 80),
      break: () => { this.noise(.25, 0, .35, 1600); this.tone(180, .12, 'square', 0, .12, 60); },
      acorn: () => { this.tone(NOTE(88), .06, 'square', 0, .12); this.tone(NOTE(93), .22, 'square', .06, .12); },
      sprout: () => this.arp([60, 64, 67, 72, 76], .05, 'triangle', .16, .09),
      reveal: () => this.arp([84, 88], .05, 'square', .12),
      powerup: () => this.arp([60, 67, 72, 76, 79, 84, 88], .045, 'square', .15, .09),
      shrink: () => this.arp([79, 74, 70, 67, 62], .06, 'square', .15, .09),
      oneup: () => this.arp([76, 79, 88, 84, 86, 91], .08, 'square', .15, .12),
      kick: () => { this.tone(520, .07, 'square', 0, .16, 260); this.noise(.05, 0, .12, 2400, 'highpass'); },
      shellwall: () => this.tone(160, .05, 'square', 0, .12),
      flip: () => this.tone(300, .12, 'square', 0, .14, 150),
      throw: () => this.tone(900, .08, 'square', 0, .1, 1600),
      fizz: () => this.noise(.08, 0, .1, 3000, 'highpass'),
      spring: () => this.tone(180, .35, 'sine', 0, .3, 900),
      land: () => e.hard && this.noise(.07, 0, .12, 500),
      checkpoint: () => this.arp([72, 76, 79, 84], .07, 'triangle', .18, .15),
      hurry: () => { this.arp([84, 86, 84, 86, 84, 86], .08, 'square', .12, .07); this.tempo = .11; },
      die: () => { this.music = false; this.arp([71, 72, 71, 67, 64, 60, 55], .12, 'square', .18, .14); },
      respawn: () => { this.music = true; this.tempo = .145; },
      goal: () => { this.music = false; this.tone(NOTE(96), 1.2, 'sine', 0, .25); this.tone(NOTE(91), 1.2, 'sine', .02, .15); this.arp([67, 72, 76, 79, 84, 88, 91], .09, 'square', .15, .2); },
      tick: () => this.tone(NOTE(100), .03, 'square', 0, .05),
      firework: () => { this.noise(.6, 0, .35, 900); this.tone(90, .3, 'sawtooth', 0, .12, 40); },
      door: () => this.arp([60, 64, 67], .08, 'triangle', .14),
      win: () => this.arp([72, 76, 79, 84, 79, 84, 88], .11, 'square', .16, .2),
      gameover: () => { this.music = false; this.arp([67, 64, 60, 59, 55, 52, 48], .2, 'triangle', .22, .3); },
      start: () => { this.music = true; this.tempo = .145; this.step = 0; }
    };
    (map[name] || (() => {}))();
  }
  tick(playing) {
    if (!this.ctx) return;
    if (!playing || !this.music) { this.next = this.ctx.currentTime + .05; return; }
    while (this.next < this.ctx.currentTime + .12) {
      const i = this.step % 64, t0 = this.next - this.ctx.currentTime;
      const lead = LEAD[i]; if (lead > 0) { let len = 1; while (LEAD[(i + len) % 64] === -1 && len < 4) len++; this.tone(NOTE(lead), this.tempo * len * .92, 'square', Math.max(0, t0), .07, 0, this.musicGain); }
      const bass = BASS[i]; if (bass > 0) this.tone(NOTE(bass - 12), this.tempo * .9, 'triangle', Math.max(0, t0), .22, 0, this.musicGain);
      if (i % 2 === 1) this.noise(.03, Math.max(0, t0), .05, 7000, 'highpass', this.musicGain);
      if (i % 8 === 0) this.noise(.08, Math.max(0, t0), .12, 300, 'lowpass', this.musicGain);
      this.step++; this.next += this.tempo;
    }
  }
  mute() { this.enabled = !this.enabled; if (this.gain) this.gain.gain.value = this.enabled ? .22 : 0; return this.enabled; }
}
