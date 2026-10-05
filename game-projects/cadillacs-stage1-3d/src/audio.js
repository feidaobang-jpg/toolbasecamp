import {SampleAudio} from "../../../public/js/game/sample-audio.js";
// 音频：优先原作楼顶/内部/街道/Boss 音乐，未加载或不可用时合成回退。
// 点击 / 按键后解锁；所有暂停冻结音频时钟。
let ctx = null, master = null, musicBus = null, sfxBus = null, comp = null, capDest = null, noiseBuf = null, distCurve = null;
let samples=null;
let volume = 0.8;
try { const v = parseFloat(localStorage.getItem('cd3d-stage1:volume')); if (!isNaN(v)) volume = Math.max(0, Math.min(1, v)); } catch (e) { /* ignore */ }
let clockFn = () => 0;
const log = { on: false, events: [] };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = volume;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.42;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  comp = buildChain(ctx, musicBus, sfxBus, master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  distCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 3.2); }
  samples = new SampleAudio(ctx,musicBus,sfxBus,{"stage": "roof.mp3", "roof":"roof.mp3", "hall": "hall.mp3", "street": "street.mp3", "boss": "boss.mp3", "select": "select.mp3"});
  return ctx;
}
const now = () => ctx.currentTime;
// 总线：压缩 → 软限幅（tanh，小信号增益约为 1，峰值不超过 0.98）→ 主音量。爆炸、霰弹枪叠在一起时不会硬削波
let softCurve = null;
function buildChain(c, mBus, sBus, out) {
  const cp = c.createDynamicsCompressor(); cp.threshold.value = -18; cp.knee.value = 6; cp.ratio.value = 6; cp.attack.value = 0.003; cp.release.value = 0.2;
  if (!softCurve) { softCurve = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 2047 * 2 - 1; softCurve[i] = 0.98 * Math.tanh(2 * x); } }
  const pre = c.createGain(); pre.gain.value = 0.5;
  const sh = c.createWaveShaper(); sh.curve = softCurve; sh.oversample = '2x';
  mBus.connect(cp); sBus.connect(cp); cp.connect(pre); pre.connect(sh); sh.connect(out);
  return cp;
}
function env(g, t, a, peak, d, sus, r, len) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sus), t + a + d);
  if (len !== undefined) { g.gain.setValueAtTime(Math.max(0.0002, peak * sus), t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + r); }
}
function osc(type, f, t, dur, gainPeak, dest, opts) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (opts && opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + (opts.slide || dur));
  if (opts && opts.detune) o.detune.value = opts.detune;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gainPeak, t + (opts && opts.a || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  return { o, g };
}
function noise(t, dur, gainPeak, filt, f, q, dest, opts) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = filt; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 1;
  if (opts && opts.to) fl.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gainPeak, t + (opts && opts.a || 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest || sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// ---------- 音效 ----------
const SFX = {
  punch(t, v) { noise(t, 0.09, 0.9 * v, 'lowpass', 2200, 1, null, { to: 500 }); osc('sine', 160, t, 0.12, 0.8 * v, null, { to: 60 }); },
  punchHeavy(t, v) { noise(t, 0.16, 1.0 * v, 'lowpass', 1800, 1, null, { to: 300 }); osc('sine', 120, t, 0.2, 1.0 * v, null, { to: 40 }); osc('square', 90, t, 0.06, 0.15 * v); },
  kick(t, v) { noise(t, 0.12, 0.9 * v, 'bandpass', 900, 0.8, null, { to: 300 }); osc('sine', 130, t, 0.16, 0.9 * v, null, { to: 45 }); },
  whoosh(t, v) { noise(t, 0.12, 0.28 * v, 'bandpass', 900, 2, null, { to: 2600, a: 0.04 }); },
  slam(t, v) { noise(t, 0.35, 1.0 * v, 'lowpass', 900, 1, null, { to: 120 }); osc('sine', 90, t, 0.4, 1.1 * v, null, { to: 30 }); },
  land(t, v) { noise(t, 0.08, 0.35 * v, 'lowpass', 700, 1); },
  slash(t, v) { noise(t, 0.16, 0.5 * v, 'highpass', 3000, 1, null, { to: 6000 }); osc('sawtooth', 1400, t, 0.1, 0.06 * v, null, { to: 600 }); },
  clink(t, v) { osc('triangle', 2400, t, 0.25, 0.3 * v); osc('triangle', 3600, t, 0.18, 0.18 * v); },
  gun(t, v) { noise(t, 0.22, 1.0 * v, 'lowpass', 4000, 0.7, null, { to: 400 }); osc('square', 220, t, 0.05, 0.4 * v, null, { to: 60 }); },
  shotgun(t, v) { noise(t, 0.4, 1.2 * v, 'lowpass', 3000, 0.7, null, { to: 200 }); osc('sine', 110, t, 0.3, 1.0 * v, null, { to: 35 }); },
  boom(t, v) { noise(t, 0.9, 1.3 * v, 'lowpass', 1400, 0.8, null, { to: 80 }); osc('sine', 70, t, 0.8, 1.2 * v, null, { to: 25 }); },
  glass(t, v) { for (let i = 0; i < 7; i++) osc('triangle', 2200 + Math.random() * 3000, t + i * 0.025, 0.25, 0.12 * v); noise(t, 0.3, 0.4 * v, 'highpass', 5000); },
  wood(t, v) { noise(t, 0.2, 0.8 * v, 'bandpass', 600, 1.2, null, { to: 250 }); osc('square', 140, t, 0.08, 0.2 * v, null, { to: 70 }); },
  metal(t, v) { osc('square', 330, t, 0.18, 0.18 * v, null, { to: 280 }); osc('triangle', 990, t, 0.3, 0.2 * v); noise(t, 0.12, 0.5 * v, 'bandpass', 2400, 2); },
  pickup(t, v) { osc('square', 660, t, 0.07, 0.18 * v); osc('square', 990, t + 0.06, 0.1, 0.18 * v); },
  eat(t, v) { [523, 659, 784, 1047].forEach((f, i) => osc('square', f, t + i * 0.06, 0.1, 0.16 * v)); },
  coin(t, v) { osc('square', 988, t, 0.08, 0.16 * v); osc('square', 1319, t + 0.07, 0.25, 0.16 * v); },
  go(t, v) { osc('square', 880, t, 0.12, 0.16 * v); osc('square', 880, t + 0.18, 0.12, 0.16 * v); },
  timer(t, v) { osc('square', 1200, t, 0.06, 0.12 * v); },
  blip(t, v) { osc('square', 740 + Math.random() * 60, t, 0.035, 0.06 * v); },
  select(t, v) { osc('square', 520, t, 0.06, 0.14 * v); osc('square', 780, t + 0.05, 0.08, 0.14 * v); },
  start(t, v) { [392, 523, 659, 784].forEach((f, i) => osc('sawtooth', f, t + i * 0.07, 0.18, 0.12 * v)); },
  scream(t, v) {   // 杂兵倒地的惨叫：带共振峰的下滑音
    const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(520 + Math.random() * 80, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.5);
    f1.type = 'bandpass'; f1.frequency.setValueAtTime(1100, t); f1.frequency.linearRampToValueAtTime(700, t + 0.5); f1.Q.value = 4;
    env(g, t, 0.01, 0.35 * v, 0.5, 0.2, 0.1, 0.45);
    o.connect(f1); f1.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.7);
  },
  screamFat(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.7);
    f1.type = 'bandpass'; f1.frequency.value = 600; f1.Q.value = 3;
    env(g, t, 0.01, 0.45 * v, 0.6, 0.2, 0.1, 0.6);
    o.connect(f1); f1.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.9);
  },
  hurtP(t, v) { osc('sawtooth', 300, t, 0.18, 0.18 * v, null, { to: 180 }); },
  roar(t, v) {   // 迅猛龙嘶吼
    const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(520, t + 0.2); o.frequency.exponentialRampToValueAtTime(160, t + 0.9);
    lfo.frequency.value = 38; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
    f1.type = 'bandpass'; f1.frequency.value = 1500; f1.Q.value = 2;
    env(g, t, 0.03, 0.4 * v, 0.9, 0.3, 0.15, 0.8);
    o.connect(f1); f1.connect(g); g.connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 1.1); lfo.stop(t + 1.1);
    noise(t, 0.8, 0.25 * v, 'bandpass', 2500, 1.5);
  },
  jump(t, v) { noise(t, 0.08, 0.2 * v, 'bandpass', 1200, 1, null, { to: 2400 }); },
  mega(t, v) { noise(t, 0.6, 0.8 * v, 'bandpass', 400, 1, null, { to: 4000, a: 0.05 }); osc('sawtooth', 200, t, 0.5, 0.25 * v, null, { to: 900 }); },
  breakStatue(t, v) { SFX.metal(t, v); noise(t, 0.5, 0.7 * v, 'bandpass', 1500, 1, null, { to: 400 }); },
  chain(t, v) { for (let i = 0; i < 5; i++) osc('triangle', 1800 + Math.random() * 1200, t + i * 0.04, 0.08, 0.1 * v); },
  whip(t, v) { noise(t, 0.12, 0.8 * v, 'highpass', 2500, 1, null, { a: 0.06 }); osc('square', 1800, t + 0.08, 0.04, 0.2 * v); },
  oneup(t, v) { [784, 988, 1175, 1568].forEach((f, i) => osc('square', f, t + i * 0.08, 0.12, 0.16 * v)); },
  knifeThrow(t, v) { noise(t, 0.18, 0.3 * v, 'bandpass', 2400, 3, null, { to: 1200 }); },
  door(t, v) { SFX.wood(t, v); noise(t, 0.4, 0.5 * v, 'lowpass', 500, 1); },
  fuse(t, v) { noise(t, 0.5, 0.12 * v, 'highpass', 4000, 1); }
};

// ---------- 背景音乐：简单的步进音序 ----------
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function freq(n) { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); if (!m) return 0; return 440 * Math.pow(2, (NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12 - 69) / 12); }
function tracker(str) { return str.trim().split(/\s+/); }
// 每首：bpm、steps（16 分音符数）、tracks
const rep = (s, n) => Array(n).fill(s).join(' ');
const SONGS = {
  stage: {
    bpm: 150, loop: true,
    lead: tracker(
      'E4 - - - G4 - A4 - B4 - - - A4 - G4 - ' + 'D5 - - - B4 - A4 - G4 - A4 - B4 - - - ' +
      'G4 - - - E4 - G4 - A4 - - - G4 - E4 - ' + 'D4 - - - E4 - - - - - - - . . . . ' +
      'E4 - - - G4 - A4 - B4 - - - D5 - E5 - ' + 'D5 - - - B4 - A4 - G4 - A4 - B4 - D5 - ' +
      'E5 - - - D5 - B4 - A4 - G4 - A4 - B4 - ' + 'E4 - - - - - - - . . . . . . . . ' +
      'A4 - C5 - E5 - - - D5 - C5 - B4 - - - ' + 'G4 - B4 - D5 - - - C5 - B4 - A4 - - - ' +
      'F4 - A4 - C5 - - - B4 - A4 - G4 - - - ' + 'G#4 - - - B4 - - - E5 - - - D5 - B4 - ' +
      'A4 - C5 - E5 - - - G5 - F#5 - E5 - D5 - ' + 'C5 - - - D5 - - - E5 - - - G5 - - - ' +
      'F#5 - - - D5 - - - A4 - - - D5 - E5 - ' + 'E5 - - - - - - - B4 - - - B4 - D5 - '),
    bass: tracker(
      rep('E2 . E2 . E3 . E2 . E2 . E2 . D2 . E2 .', 1) + ' ' + 'G2 . G2 . G3 . G2 . A2 . A2 . A3 . A2 .' + ' ' +
      'C3 . C3 . C2 . C3 . D3 . D3 . D2 . D3 .' + ' ' + 'E2 . E2 . E3 . E2 . B1 . B1 . D2 . D2 .' + ' ' +
      'E2 . E2 . E3 . E2 . E2 . E2 . D2 . E2 .' + ' ' + 'G2 . G2 . G3 . G2 . A2 . A2 . A3 . A2 .' + ' ' +
      'C3 . C3 . C2 . C3 . D3 . D3 . D2 . D3 .' + ' ' + 'E2 . E2 . E3 . E2 . E2 . G2 . A2 . B2 .' + ' ' +
      'A2 . A2 . A3 . A2 . A2 . A2 . G2 . A2 .' + ' ' + 'G2 . G2 . G3 . G2 . G2 . G2 . F#2 . G2 .' + ' ' +
      'F2 . F2 . F3 . F2 . F2 . F2 . E2 . F2 .' + ' ' + 'E2 . E2 . E3 . E2 . E2 . E2 . E3 . E2 .' + ' ' +
      'A2 . A2 . A3 . A2 . A2 . A2 . G2 . A2 .' + ' ' + 'C3 . C3 . C2 . C3 . D3 . D3 . D2 . D3 .' + ' ' +
      'D3 . D3 . D2 . D3 . D3 . D3 . C3 . D3 .' + ' ' + 'E2 . E2 . E3 . E2 . B1 . B1 . D2 . D2 .'),
    chord: tracker(
      'E3 - - - . . E3 - . . E3 - D3 - E3 - ' + 'G3 - - - . . G3 - A3 - - - . . A3 - ' + 'C3 - - - . . C3 - D3 - - - . . D3 - ' + 'E3 - - - . . E3 - B2 - - - D3 - - - ' +
      'E3 - - - . . E3 - . . E3 - D3 - E3 - ' + 'G3 - - - . . G3 - A3 - - - . . A3 - ' + 'C3 - - - . . C3 - D3 - - - . . D3 - ' + 'E3 - - - - - - - G3 - - - A3 - B2 - ' +
      'A2 - - - . . A2 - . . A2 - G2 - A2 - ' + 'G2 - - - . . G2 - . . G2 - F#2 - G2 - ' + 'F2 - - - . . F2 - . . F2 - E2 - F2 - ' + 'E2 - - - . . E2 - E2 - - - . . E2 - ' +
      'A2 - - - . . A2 - . . A2 - G2 - A2 - ' + 'C3 - - - . . C3 - D3 - - - . . D3 - ' + 'D3 - - - . . D3 - . . D3 - C3 - D3 - ' + 'E3 - - - . . E3 - B2 - - - D3 - - - '),
    drum: tracker(rep('x . h . s . h . x . x . s . h h', 7) + ' x . h . s . h . x . x . s s s s ' + rep('x . h . s . h . x . x . s . h h', 7) + ' c . h . s . h . x . s . s s s s')
  },
  boss: {
    bpm: 168, loop: true,
    lead: tracker(
      'E5 - . E5 F5 - E5 - . . D5 - E5 - - - ' + 'E5 - . E5 G5 - F5 - E5 - D5 - C5 - B4 - ' +
      'C5 - . C5 D5 - C5 - . . B4 - C5 - - - ' + 'B4 - - - A4 - - - G#4 - - - B4 - - - ' +
      'E5 - . E5 F5 - E5 - . . D5 - E5 - - - ' + 'G5 - . G5 A5 - G5 - F5 - E5 - D5 - E5 - ' +
      'F5 - - - E5 - - - D5 - - - C5 - - - ' + 'B4 - - - - - - - E5 - - - D#5 - - - '),
    bass: tracker(
      rep('E2 E2 E3 E2 E2 E2 F2 E2 E2 E2 E3 E2 G2 E2 F2 E2', 2) + ' ' + 'A1 A1 A2 A1 A1 A1 C2 A1 B1 B1 B2 B1 B1 B1 D2 B1' + ' ' + 'E2 E2 E3 E2 E2 E2 F2 E2 E2 E2 E3 E2 D#2 D#2 D#3 D#2' + ' ' +
      rep('E2 E2 E3 E2 E2 E2 F2 E2 E2 E2 E3 E2 G2 E2 F2 E2', 2) + ' ' + 'F2 F2 F3 F2 F2 F2 E2 F2 D2 D2 D3 D2 C2 C2 C3 C2' + ' ' + 'B1 B1 B2 B1 B1 B1 B2 B1 E2 E2 E3 E2 D#2 D#2 D#3 D#2'),
    chord: tracker(rep('E3 - . E3 - . E3 - . E3 - . F3 - E3 -', 2) + ' A2 - . A2 - . A2 - B2 - . B2 - . B2 - - ' + 'E3 - . E3 - . E3 - . E3 - . D#3 - - - ' + rep('E3 - . E3 - . E3 - . E3 - . F3 - E3 -', 2) + ' F3 - . F3 - . E3 - D3 - . D3 - C3 - - - ' + 'B2 - - - - - - - E3 - - - D#3 - - -'),
    drum: tracker(rep('x . h x s . h . x . x h s . x h', 7) + ' x . s . s . s s x s s s c s s s')
  },
  clear: {
    bpm: 140, loop: false,
    lead: tracker('G4 - C5 - E5 - G5 - - - E5 - G5 - - - C6 - - - - - - - - - - - . . . .'),
    bass: tracker('C3 . . . C3 . . . C3 . . . E3 . . . G2 - - - - - - - C3 - - - . . . .'),
    chord: tracker('C4 - - - E4 - - - G4 - - - E4 - - - C4 - - - - - - - C4 - - - . . . .'),
    drum: tracker('x . h . s . h . x . h . s . h . c . . . . . . . x . . . . . . .')
  },
  cont: {
    bpm: 120, loop: true,
    lead: tracker('E5 . . . . . . . D#5 . . . . . . . E5 . . . . . . . F5 . . . . . . .'),
    bass: tracker('E2 . . . E2 . . . E2 . . . E2 . . . E2 . . . E2 . . . F2 . . . F2 . . .'),
    chord: tracker('. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .'),
    drum: tracker('k . . . h . . . k . . . h . . . k . . . h . . . k . k . h . . .')
  }
};
const seq = { song: null, name: null, step: 0, next: 0, timer: 0, duck: false, gain: null };
function leadVoice(f, t, dur, dest) {
  const g = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter();
  sh.curve = distCurve; lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 1.2;
  const pre = ctx.createGain(); pre.gain.value = 0.6;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 8;
  vib.frequency.value = 5.5; vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
  o1.connect(pre); o2.connect(pre); pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.setValueAtTime(0.13, t + Math.max(0.02, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  [o1, o2, vib].forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
}
function bassVoice(f, t, dur, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur); lp.Q.value = 3;
  o.connect(lp); lp.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  o.start(t); o.stop(t + dur + 0.05);
}
function chordVoice(f, t, dur, dest) {   // 失真强力和弦：根音 + 五度 + 八度
  const g = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), pre = ctx.createGain();
  sh.curve = distCurve; lp.type = 'lowpass'; lp.frequency.value = 1700; pre.gain.value = 0.5;
  pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(dest);
  for (const m of [1, 1.4983, 2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * m; o.detune.value = (Math.random() - 0.5) * 10; o.connect(pre); o.start(t); o.stop(t + dur + 0.08); }
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.006); g.gain.setValueAtTime(0.09, t + Math.max(0.02, dur - 0.03)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
}
function drumVoice(ch, t, dest) {
  if (ch === 'k' || ch === 'x') { osc('sine', 150, t, 0.16, 0.9, dest, { to: 40, slide: 0.12 }); }
  if (ch === 's') { noise(t, 0.14, 0.45, 'bandpass', 1800, 0.8, dest); osc('triangle', 190, t, 0.08, 0.35, dest); }
  if (ch === 'h' || ch === 'x') noise(t, 0.035, 0.18, 'highpass', 7500, 1, dest);
  if (ch === 'o') noise(t, 0.18, 0.18, 'highpass', 6500, 1, dest);
  if (ch === 'c') { noise(t, 0.9, 0.28, 'highpass', 4000, 0.6, dest); osc('sine', 150, t, 0.16, 0.9, dest, { to: 40 }); }
}
function noteLen(track, i, stepDur) { let n = 1; while (track[(i + n) % track.length] === '-' && n < 32) n++; return n * stepDur; }
let offRendering = false;
function schedule() {
  if (!seq.song || !ctx || offRendering || ctx.state !== "running" || audioPaused) return;
  if (samples?.has(seq.name)) { if(seq.gain)seq.gain.gain.value=0; samples.music(seq.name); return; }
  const S = seq.song, stepDur = 60 / S.bpm / 4, total = S.lead.length;
  while (seq.next < now() + 0.15) {
    const i = seq.step, t = seq.next;
    if (i >= total) { if (!S.loop) { seq.song = null; return; } seq.step = 0; continue; }
    const L = S.lead[i % S.lead.length], Bn = S.bass[i % S.bass.length], Ch = S.chord[i % S.chord.length], D = S.drum[i % S.drum.length];
    if (L && L !== '-' && L !== '.') leadVoice(freq(L), t, noteLen(S.lead, i, stepDur) * 0.95, seq.gain);
    if (Bn && Bn !== '-' && Bn !== '.') bassVoice(freq(Bn), t, Math.min(noteLen(S.bass, i, stepDur), stepDur * 2) * 0.9, seq.gain);
    if (Ch && Ch !== '-' && Ch !== '.') chordVoice(freq(Ch), t, noteLen(S.chord, i, stepDur) * 0.9, seq.gain);
    if (D && D !== '.') drumVoice(D, t, seq.gain);
    seq.step++; seq.next += stepDur;
  }
}

const A = {
  get volume() { return volume; },
  setClock(fn) { clockFn = fn; },
  unlock() { if (!ensure()) return; syncAudioPause(); },
  setVolume(v) { volume = v; try { localStorage.setItem('cd3d-stage1:volume', String(v)); } catch (e) { /* ignore */ } if (master) master.gain.value = v; },
  tick() { if (ctx && ctx.state === 'running') SFX.select(now(), 1); },
  play(name, vol) {
    if (log.on) log.events.push({ t: +clockFn().toFixed(3), name, vol: vol || 1 });
    if (!ctx || offRendering || ctx.state !== 'running' || volume <= 0) return;
    const f = SFX[name]; if (!f) return;
    try { f(now() + 0.005, vol === undefined ? 1 : vol); } catch (e) { /* 节点上限等 */ }
  },
  music(name) {
    if (seq.name === name && (seq.song || samples?.track)) return;
    if (log.on) log.events.push({ t: +clockFn().toFixed(3), music: name });
    seq.name = name;
    if (!ensure()) return;
    samples?.music(name, name!=="clear");
    if (seq.gain) { const g = seq.gain; g.gain.setTargetAtTime(0, now(), 0.08); setTimeout(() => g.disconnect(), 600); }
    seq.gain = null; seq.song = null;
    if (!name || !(SONGS[name] || ["roof","hall","street"].includes(name))) return;
    seq.gain = ctx.createGain(); seq.gain.gain.value = seq.duck ? 0.25 : 1; seq.gain.connect(musicBus);
    seq.song = SONGS[name] || SONGS.stage; seq.step = 0; seq.next = now() + 0.08;
    if (!seq.timer) seq.timer = setInterval(schedule, 25);
  },
  musicDuck(on) { audioPaused = !!on; syncAudioPause(); },
  pause() { /* 音效都很短，暂停时不需要单独处理 */ },
  state: () => ({ ctx: ctx ? ctx.state : 'none', volume }),
  musicState: () => ({ name: seq.name, playing: !!(seq.song || samples?.source) && !audioPaused && !document.hidden }),
  captureStream() { if (!ensure()) return null; if (!capDest) { capDest = ctx.createMediaStreamDestination(); master.connect(capDest); } return capDest.stream; },
  logStart() { log.on = true; log.events = []; },
  logStop() { log.on = false; return log.events.slice(); },
  // 离线渲染同场音轨（逐帧录像用）：按事件时间重新合成音效与音乐，返回 16-bit WAV 的 base64。
  // 分 15 秒一段渲染再叠加尾音：一次性把整局几千个音符挂进同一张音频图，渲染耗时会随时长平方增长
  async renderOffline(events, dur) {
    const sr = 44100, SEG = 15, TAIL = 2.5;
    const N = Math.ceil(sr * dur);
    const outL = new Float32Array(N), outR = new Float32Array(N);
    const saved = { ctx, master, musicBus, sfxBus, comp, noiseBuf };
    offRendering = true;
    try {
      const mus = events.filter(e => 'music' in e);
      for (let s0 = 0; s0 < dur; s0 += SEG) {
        const s1 = Math.min(dur, s0 + SEG);
        const len = Math.min(dur - s0, SEG + TAIL);
        const off = new OfflineAudioContext(2, Math.ceil(sr * len), sr);
        ctx = off;
        master = off.createGain(); master.gain.value = 0.85;
        musicBus = off.createGain(); musicBus.gain.value = 0.42;
        sfxBus = off.createGain(); sfxBus.gain.value = 0.9;
        comp = buildChain(off, musicBus, sfxBus, master); master.connect(off.destination);
        noiseBuf = off.createBuffer(1, sr, sr); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const dest = off.createGain(); dest.connect(musicBus);
        // 本段开始的音符：只排起点落在 [s0, s1) 的
        mus.forEach((m, k) => {
          const S = SONGS[m.music]; if (!S) return;
          const tEnd = Math.min(k + 1 < mus.length ? mus[k + 1].t : dur, dur);
          const stepDur = 60 / S.bpm / 4, total = S.lead.length, base = m.t + 0.08;
          let i = Math.max(0, Math.ceil((s0 - base) / stepDur - 1e-9));
          for (; ; i++) {
            const t = base + i * stepDur;
            if (t >= tEnd || t >= s1) break;
            if (!S.loop && i >= total) break;
            if (t < s0) continue;
            const j = i % total, lt = t - s0;
            const L = S.lead[j], Bn = S.bass[j % S.bass.length], Ch = S.chord[j % S.chord.length], D = S.drum[j % S.drum.length];
            if (L && L !== '-' && L !== '.') leadVoice(freq(L), lt, Math.min(noteLen(S.lead, j, stepDur) * 0.95, tEnd - t), dest);
            if (Bn && Bn !== '-' && Bn !== '.') bassVoice(freq(Bn), lt, Math.min(noteLen(S.bass, j, stepDur), stepDur * 2) * 0.9, dest);
            if (Ch && Ch !== '-' && Ch !== '.') chordVoice(freq(Ch), lt, Math.min(noteLen(S.chord, j, stepDur) * 0.9, tEnd - t), dest);
            if (D && D !== '.') drumVoice(D, lt, dest);
          }
        });
        for (const e of events) if (e.name && SFX[e.name] && e.t >= s0 && e.t < s1) { try { SFX[e.name](e.t - s0 + 0.005, e.vol || 1); } catch (err) { /* ignore */ } }
        const buf = await off.startRendering();
        const a = buf.getChannelData(0), b = buf.getChannelData(1), o = Math.round(s0 * sr);
        for (let i = 0; i < a.length && o + i < N; i++) { outL[o + i] += a[i]; outR[o + i] += b[i]; }
      }
      // 编码 WAV
      const bytes = new Uint8Array(44 + N * 4), dv = new DataView(bytes.buffer);
      const wr = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
      wr(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, N * 4, true);
      let o = 44;
      for (let i = 0; i < N; i++) { for (const ch of [outL, outR]) { const v = Math.max(-1, Math.min(1, ch[i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; } }
      // 按 3 字节对齐分块 btoa 再拼接，避免超长字符串
      const parts = [], CH = 3 * 32768;
      for (let i = 0; i < bytes.length; i += CH) { const sub = bytes.subarray(i, i + CH); let bin = ''; for (let k = 0; k < sub.length; k += 8192) bin += String.fromCharCode.apply(null, sub.subarray(k, k + 8192)); parts.push(btoa(bin)); }
      return parts.join('');
    } finally {
      ({ ctx, master, musicBus, sfxBus, comp, noiseBuf } = saved);
      offRendering = false;
    }
  },
  SFX_NAMES: Object.keys(SFX)
};
export default A;

let audioPaused = false;
function syncAudioPause() {
  if (!ctx || ctx.state === 'closed') return;
  const stop = audioPaused || document.hidden;
  const op = stop ? ctx.suspend() : ctx.resume();
  if (op && op.catch) op.catch(() => {});
}
document.addEventListener('visibilitychange', syncAudioPause);
