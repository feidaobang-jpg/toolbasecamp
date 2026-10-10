import {SampleAudio} from "../../../js/game/sample-audio.js?v=unified3d1";
// 原版 BGM/音效优先；尚未加载或解码失败时使用原有合成回退。
const NOTE = {};
(() => {
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let o = 1; o <= 8; o++) names.forEach((n, i) => { NOTE[n + o] = 440 * Math.pow(2, (o - 4) + (i - 9) / 12); });
})();
const S = 0.108;                       // 一个十六分音符（原作约 0.1 秒）
const T = S * 4 / 3;                   // 三连音
function seq(str, d = S) { return str.trim().split(/\s+/).map(n => [n === '-' ? 0 : NOTE[n], d]); }
const tri = (a, b, c) => [[NOTE[a], T], [NOTE[b], T], [NOTE[c], T]];

const OVER_INTRO = seq('E5 E5 - E5 - C5 E5 - G5 - - - G4 - - -');
const OVER_A = [...seq('C5 - - G4 - - E4 - - A4 - B4 - As4 A4 -'), ...tri('G4', 'E5', 'G5'), ...seq('A5 - F5 G5 - E5 - C5 D5 B4 - -')];
const OVER_B = [...seq('- - G5 Fs5 F5 Ds5 - E5 - Gs4 A4 C5 - A4 C5 D5'), ...seq('- - G5 Fs5 F5 Ds5 - E5 - C6 - C6 C6 - - -'),
  ...seq('- - G5 Fs5 F5 Ds5 - E5 - Gs4 A4 C5 - A4 C5 D5'), ...seq('- - Ds5 - - D5 - - C5 - - - - - - -')];
const OVER_C = [...seq('C5 C5 - C5 - C5 D5 - E5 C5 - A4 G4 - - -'), ...seq('C5 C5 - C5 - C5 D5 E5 - - - - - - - -'), ...seq('C5 C5 - C5 - C5 D5 - E5 C5 - A4 G4 - - -')];
const OVERWORLD = { intro: OVER_INTRO, loop: [...OVER_A, ...OVER_A, ...OVER_B, ...OVER_B, ...OVER_C, ...OVER_INTRO, ...OVER_A, ...OVER_A], wave: 'square', vol: 0.16 };
const U1 = seq('C4 C5 A3 A4 As3 As4'), U2 = seq('F3 F4 D3 D4 Ds3 Ds4');
const UNDER_LOOP = [...U1, [0, S * 2], [0, S * 4], ...U1, [0, S * 2], [0, S * 4], ...U2, [0, S * 2], [0, S * 4], ...U2, [0, S * 2], [0, S * 2],
  ...seq('Ds4 Cs4 D4', S * 0.72), ...seq('Cs4 Ds4 Ds4 Gs3 G3 Cs4', S * 2), ...seq('C4 Fs4 F4 E3 As4 A4', S * 0.72), ...seq('Gs4 Ds4 B3 As3 A3 Gs3', S * 1.3), [0, S * 4], [0, S * 4], [0, S * 4]];
const UNDERGROUND = { intro: [], loop: UNDER_LOOP, wave: 'square', vol: 0.18 };
const STAR = { intro: [], loop: [...seq('C5 C5 C5 - C5 - C5 D5 C5 - C5 - C5 D5 C5 -'), ...seq('B4 B4 B4 - B4 - B4 C5 B4 - B4 - B4 C5 B4 -')], wave: 'square', vol: 0.15 };
// 城堡：原版录音加载失败时的近似合成回退（低音半音下行的阴森循环，不是原曲逐音还原）
const CASTLE = { intro: [], loop: [...seq('D4 Ds4 D4 Cs4 D4 Ds4 D4 Cs4 C4 Cs4 C4 B3 C4 Cs4 C4 B3', S * 1.4), ...seq('As3 B3 As3 A3 As3 B3 As3 A3 Gs3 A3 Gs3 G3 Gs3 A3 Gs3 G3', S * 1.4)], wave: 'square', vol: 0.15 };
const TRACKS = { overworld: OVERWORLD, underground: UNDERGROUND, star: STAR, castle: CASTLE };

const JINGLES = {
  die: [[NOTE.B4, 0.13], [NOTE.F5, 0.13], [0, 0.13], [NOTE.F5, 0.13], [NOTE.F5, 0.18], [NOTE.E5, 0.18], [NOTE.D5, 0.18], [NOTE.C5, 0.14], [NOTE.E4, 0.14], [0, 0.14], [NOTE.E4, 0.14], [NOTE.C4, 0.4]],
  gameover: [[NOTE.C5, 0.28], [0, 0.1], [NOTE.G4, 0.28], [0, 0.1], [NOTE.E4, 0.3], [NOTE.A4, 0.18], [NOTE.B4, 0.18], [NOTE.A4, 0.18], [NOTE.Gs4, 0.2], [NOTE.As4, 0.2], [NOTE.Gs4, 0.2], [NOTE.G4, 0.14], [NOTE.F4, 0.14], [NOTE.G4, 0.6]],
  clear: [...tri('G3', 'C4', 'E4'), ...tri('G4', 'C5', 'E5'), [NOTE.G5, T * 3], [NOTE.E5, T * 3], ...tri('Gs3', 'C4', 'Ds4'), ...tri('Gs4', 'C5', 'Ds5'), [NOTE.Gs5, T * 3], [NOTE.Ds5, T * 3],
    ...tri('As3', 'D4', 'F4'), ...tri('As4', 'D5', 'F5'), [NOTE.As5, T * 3], [NOTE.As5, T], [NOTE.As5, T], [NOTE.As5, T], [NOTE.C6, T * 6]],
  hurry: seq('E6 - E6 - Fs6 - Fs6 - G6 - G6 - - - - -', 0.07),
  oneup: seq('E6 G6 E7 C7 D7 G7', 0.09),
  worldclear: [...tri('C4', 'E4', 'G4'), ...tri('C5', 'E5', 'G5'), [NOTE.C6, T * 6], ...tri('Gs3', 'C4', 'Ds4'), ...tri('Gs4', 'C5', 'Ds5'), [NOTE.Gs5, T * 6], ...tri('As3', 'D4', 'F4'), ...tri('As4', 'D5', 'F5'), [NOTE.As5, T * 6], [NOTE.C6, T * 9]],
  sprout: seq('G4 B4 D5 G5 B5 D6', 0.035)
};

export class GameAudio {
  constructor() {
    this.ctx = null; this.volume = 0.7; this.track = null; this.hurry = false; this.paused = false;
    this.next = 0; this.idx = 0; this.inIntro = false; this.jingleUntil = 0;
  }
  unlock() {
    try {
      if (!this.visibilityBound) { this.visibilityBound = true; document.addEventListener('visibilitychange', () => this.syncPause()); } if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
        this.samples=new SampleAudio(this.ctx,this.musicBus,this.sfxBus,{"overworld": "overworld.mp3?v=bgmfull1", "underground": "underground.mp3?v=bgmfull1", "star": "star.mp3?v=bgmfull1", "castle": "castle.mp3?v=castle1", "smb_1-up": "smb_1-up.wav", "smb_bowserfalls": "smb_bowserfalls.wav", "smb_bowserfire": "smb_bowserfire.wav", "smb_breakblock": "smb_breakblock.wav", "smb_bump": "smb_bump.wav", "smb_coin": "smb_coin.wav", "smb_fireball": "smb_fireball.wav", "smb_fireworks": "smb_fireworks.wav", "smb_flagpole": "smb_flagpole.wav", "smb_gameover": "smb_gameover.wav", "smb_jump-small": "smb_jump-small.wav", "smb_jump-super": "smb_jump-super.wav", "smb_kick": "smb_kick.wav", "smb_mariodie": "smb_mariodie.wav", "smb_pause": "smb_pause.wav", "smb_pipe": "smb_pipe.wav", "smb_powerup": "smb_powerup.wav", "smb_powerup_appears": "smb_powerup_appears.wav", "smb_stage_clear": "smb_stage_clear.wav", "smb_stomp": "smb_stomp.wav", "smb_vine": "smb_vine.wav", "smb_warning": "smb_warning.wav", "smb_world_clear": "smb_world_clear.wav"});
        this.applyVolume();
      }
      this.syncPause();
    } catch (e) { /* 无音频设备时静默 */ }
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyVolume(); }
  applyVolume() { if (this.master) this.master.gain.value = this.volume * 0.55; }
  tone(freq, start, dur, wave = 'square', vol = 0.2, bus = this.sfxBus, slideTo = 0) {
    if (!this.ctx || !freq) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(vol, start + 0.006);
    g.gain.setValueAtTime(vol, start + Math.max(0.01, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(bus); o.start(start); o.stop(start + dur + 0.02);
  }
  noise(start, dur, vol = 0.2, cutoff = 1800) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(start);
  }
  playSeq(notes, wave = 'square', vol = 0.2, bus = this.sfxBus) {
    if (!this.ctx) return 0;
    let t = this.ctx.currentTime + 0.02;
    for (const [f, d] of notes) { this.tone(f, t, d * 0.92, wave, vol, bus); t += d; }
    return t;
  }
  sfx(name, opt) {
    if (!this.ctx || this.volume <= 0) return;
    const map={jump:opt?.big?'smb_jump-super':'smb_jump-small',coin:'smb_coin',bump:'smb_bump',break:'smb_breakblock',stomp:'smb_stomp',kick:'smb_kick',fireball:'smb_fireball',sprout:'smb_powerup_appears',grow:'smb_powerup',fire:'smb_powerup',powerup:'smb_powerup',oneup:'smb_1-up',pipe:'smb_pipe',shrink:'smb_pipe',hurt:'smb_pipe',flagpole:'smb_flagpole',firework:'smb_fireworks',bowserfire:'smb_bowserfire',bowserfall:'smb_bowserfalls'};
    if(this.samples?.sfx(map[name]))return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'jump': opt && opt.big ? this.tone(170, t, 0.2, 'square', 0.16, this.sfxBus, 480) : this.tone(240, t, 0.17, 'square', 0.16, this.sfxBus, 640); break;
      case 'coin': this.tone(NOTE.B5, t, 0.07, 'square', 0.16); this.tone(NOTE.E6, t + 0.07, 0.38, 'square', 0.15); break;
      case 'bump': this.tone(150, t, 0.09, 'square', 0.22, this.sfxBus, 80); break;
      case 'break': this.noise(t, 0.28, 0.35, 1400); this.tone(120, t, 0.18, 'triangle', 0.3, this.sfxBus, 50); break;
      case 'stomp': this.tone(520, t, 0.06, 'square', 0.18, this.sfxBus, 200); this.tone(300, t + 0.06, 0.08, 'square', 0.16, this.sfxBus, 120); break;
      case 'kick': this.tone(1000, t, 0.06, 'square', 0.15, this.sfxBus, 300); break;
      case 'fireball': this.tone(1500, t, 0.06, 'square', 0.12, this.sfxBus, 400); break;
      case 'pop': this.noise(t, 0.08, 0.15, 3000); break;
      case 'sprout': this.playSeq(JINGLES.sprout, 'square', 0.13); break;
      case 'grow': case 'fire': case 'powerup': {
        const notes = seq('C5 G4 C5 E5 G5 C6 G5 C6 E6 G6 C7', 0.045); this.playSeq(notes, 'square', 0.14); break;
      }
      case 'oneup': this.playSeq(JINGLES.oneup, 'square', 0.15); break;
      case 'pipe': case 'shrink': case 'hurt': for (let i = 0; i < 3; i++) this.tone(i % 2 ? 110 : 150, t + i * 0.12, 0.09, 'square', 0.22); break;
      case 'flagpole': this.tone(1300, t, 1.0, 'square', 0.12, this.sfxBus, 180); break;
      case 'tick': this.tone(1046, t, 0.025, 'square', 0.08); break;
      case 'firework': this.noise(t, 0.45, 0.4, 900); break;
      case 'checkpoint': this.tone(NOTE.C6, t, 0.08, 'square', 0.1); this.tone(NOTE.G6, t + 0.08, 0.16, 'square', 0.1); break;
      case 'revive': this.tone(300, t, 0.05, 'square', 0.06); break;
      case 'bowserfire': this.noise(t, 0.6, 0.3, 700); this.tone(220, t, 0.5, 'sawtooth', 0.08, this.sfxBus, 90); break;
      case 'bowserfall': this.tone(600, t, 1.0, 'square', 0.12, this.sfxBus, 70); break;
    }
  }
  jingle(name) {
    if (!this.ctx) return;
    this.stopMusic();
    const original={die:'smb_mariodie',gameover:'smb_gameover',clear:'smb_stage_clear',worldclear:'smb_world_clear',hurry:'smb_warning',oneup:'smb_1-up',sprout:'smb_powerup_appears'}[name];
    if(this.samples?.sfx(original)){this.jingleUntil=this.ctx.currentTime+this.samples.duration(original);return;}
    const end = this.playSeq(JINGLES[name], 'square', 0.17, this.musicBus);
    this.jingleUntil = end;
  }
  music(name, restart = true) {
    if (!restart && this.track === TRACKS[name]) return;
    this.samples?.music(name,true,restart);
    this.track = name ? TRACKS[name] : null; this.trackName = name;
    this.idx = 0; this.inIntro = !!(this.track && this.track.intro.length);
    this.next = this.ctx ? Math.max(this.ctx.currentTime + 0.05, this.jingleUntil) : 0;
  }
  stopMusic() { this.samples?.stop(); this.track = null; this.trackName = null; }
  setHurry(h) { this.hurry = h; }
  syncPause() { if (!this.ctx || this.ctx.state === 'closed') return; const op = this.paused || document.hidden ? this.ctx.suspend() : this.ctx.resume(); if (op?.catch) op.catch(() => {}); }
 pause(on) { this.paused = !!on; this.syncPause(); }
  tick() {
    if (!this.ctx || !this.track || this.paused) { if (this.ctx) this.next = Math.max(this.next, this.ctx.currentTime); return; }
    if(this.samples?.has(this.trackName)){this.samples.music(this.trackName);if(this.samples.source)this.samples.source.playbackRate.value=this.hurry?1.45:1;return;}
    const tr = this.track, speed = this.hurry ? 1.45 : 1;
    if (this.next < this.ctx.currentTime - 0.3) this.next = this.ctx.currentTime + 0.02;
    while (this.next < this.ctx.currentTime + 0.25) {
      const list = this.inIntro ? tr.intro : tr.loop;
      const [f, d] = list[this.idx];
      const dur = d / speed;
      if (f) { this.tone(f, this.next, dur * 0.85, tr.wave, tr.vol, this.musicBus); this.tone(f / 2, this.next, dur * 0.8, 'triangle', tr.vol * 0.55, this.musicBus); }
      this.next += dur;
      this.idx++;
      if (this.idx >= list.length) { this.idx = 0; this.inIntro = false; }
    }
  }
}
