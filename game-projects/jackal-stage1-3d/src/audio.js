// 程序化音效与原创 BGM（WebAudio 实时合成；旋律为本作原创，不取自原作）。
import { store } from './core.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, capDest = null;
let eng = null;
let volume = store.get('volume', 0.7);
if (typeof volume !== 'number' || !isFinite(volume)) volume = 0.7;

const MUSIC_LEVEL = 0.8;
// 总线压缩：让爆炸不至于盖过音乐与机枪
function makeComp(c) { const k = c.createDynamicsCompressor(); k.threshold.value = -20; k.knee.value = 10; k.ratio.value = 4; k.attack.value = 0.003; k.release.value = 0.22; return k; }
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = volume;
  const comp = makeComp(ctx); master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_LEVEL; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
let fakeNow = null;   // 离线渲染时用游戏时间代替音频时钟
const now = () => (fakeNow !== null ? fakeNow : ctx.currentTime);

function tone(type, f0, f1, dur, vol, at, bus) {
  if (!ensure()) return;
  const t = at || now();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, fc0, fc1, at, bus, type) {
  if (!ensure()) return;
  const t = at || now();
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type || 'lowpass';
  f.frequency.setValueAtTime(fc0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, fc1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
}
const NOTE = {};
{
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 8; o++) for (let n = 0; n < 12; n++) NOTE[names[n] + o] = 440 * Math.pow(2, ((o - 4) * 12 + n - 9) / 12);
}
function seq(notes, step, type, vol, gate, bus) {
  if (!ensure()) return 0;
  const t = now() + 0.02;
  notes.forEach((n, i) => { if (n && n !== '-') tone(type, NOTE[n], NOTE[n], step * (gate || 0.85), vol, t + i * step, bus); });
  return notes.length * step;
}

// ---------- 原创 BGM：关卡进行曲 / Boss 战 ----------
const SONGS = {
  stage: {
    bpm: 138,
    lead: 'A4 - A4 C5 E5 - D5 C5 | D5 - D5 F5 E5 - C5 - | A4 - A4 C5 E5 - G5 F5 | E5 D5 C5 B4 A4 - - - | F5 - F5 E5 D5 - C5 D5 | E5 - E5 D5 C5 - B4 C5 | D5 - D5 C5 B4 - G4 B4 | A4 - E5 - A5 - - -',
    bass: 'A2 - E3 - A2 - E3 - | D3 - A2 - D3 - A2 - | A2 - E3 - A2 - E3 - | E3 - B2 - E3 - E2 - | F2 - C3 - F2 - C3 - | C3 - G2 - C3 - G2 - | G2 - D3 - G2 - D3 - | A2 - E3 - A2 - A2 -',
    drum: 'k h s h k h s h'
  },
  // 第二关：废墟城（原创，多利亚调式的行进曲）
  ruins: {
    bpm: 128,
    lead: 'D5 - F5 - A5 - G5 F5 | E5 - C5 - D5 - - - | D5 - F5 - A5 - C6 B5 | A5 - G5 - A5 - - - | G5 - A5 - B5 - A5 G5 | F5 - E5 - D5 - C5 - | D5 - F5 A5 G5 - F5 E5 | D5 - A4 - D5 - - -',
    bass: 'D3 - A2 - D3 - A2 - | C3 - G2 - C3 - G2 - | D3 - A2 - D3 - A2 - | A2 - E2 - A2 - E2 - | G2 - D3 - G2 - D3 - | F2 - C3 - F2 - C3 - | D3 - A2 - D3 - A2 - | D3 - A2 - D3 - D3 -',
    drum: 'k h h s k h s h'
  },
  boss: {
    bpm: 164,
    lead: 'E5 E5 - E5 D5 - E5 - | G5 - F5 - E5 - D5 - | E5 E5 - E5 D5 - E5 - | B5 - A5 - G5 - F#5 - | C5 C5 - C5 B4 - C5 - | D5 - C5 - B4 - G#4 - | A4 A4 - C5 E5 - A5 - | G#5 - E5 - B4 - G#4 -',
    bass: 'E2 E2 E3 E2 E2 E2 E3 E2 | E2 E2 E3 E2 D2 D2 D3 D2 | E2 E2 E3 E2 E2 E2 E3 E2 | G2 G2 G3 G2 F#2 F#2 F#3 F#2 | C2 C2 C3 C2 C2 C2 C3 C2 | D2 D2 D3 D2 E2 E2 E3 E2 | A2 A2 A3 A2 A2 A2 A3 A2 | E2 E2 E3 E2 E2 E2 E3 E2',
    drum: 'k h s k k h s h'
  }
};
const parsed = {};
for (const k in SONGS) {
  const s = SONGS[k];
  parsed[k] = { step: 60 / s.bpm / 2, lead: s.lead.replace(/\|/g, ' ').split(/\s+/).filter(Boolean), bass: s.bass.replace(/\|/g, ' ').split(/\s+/).filter(Boolean), drum: s.drum.split(/\s+/) };
}
let music = { song: null, idx: 0, nextT: 0, timer: 0 };
function scheduleMusic(until) {
  if (!ctx || !music.song) return;
  const p = parsed[music.song];
  const limit = until !== undefined ? until : now() + 0.25;
  while (music.nextT < limit) {
    const i = music.idx, t = music.nextT;
    const ln = p.lead[i % p.lead.length], bn = p.bass[i % p.bass.length], dn = p.drum[i % p.drum.length];
    if (ln && ln !== '-') tone('square', NOTE[ln], NOTE[ln], p.step * 0.82, 0.09, t, musicBus);
    if (ln && ln !== '-') tone('square', NOTE[ln] * 1.005, NOTE[ln] * 1.005, p.step * 0.6, 0.025, t, musicBus);
    if (bn && bn !== '-') tone('triangle', NOTE[bn], NOTE[bn], p.step * 0.9, 0.22, t, musicBus);
    if (dn === 'k') { tone('sine', 120, 45, 0.12, 0.35, t, musicBus); }
    else if (dn === 's') { noise(0.11, 0.18, 4000, 1200, t, musicBus, 'bandpass'); }
    else if (dn === 'h') { noise(0.03, 0.05, 9000, 7000, t, musicBus, 'highpass'); }
    music.idx++; music.nextT += p.step;
  }
}

// 录音日志：记录每次音效调用的游戏时间，供离线渲染同场音轨
let logClock = null, logOn = false, logBuf = [];
const A = {
  setClock(fn) { logClock = fn; },
  logStart() { logOn = true; logBuf = []; },
  logStop() { logOn = false; return logBuf.slice(); },
  unlock() { if (!ensure()) return; if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); },
  get volume() { return volume; },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
    store.set('volume', volume);
    if (master) master.gain.setTargetAtTime(volume, now(), 0.02);
  },
  music(name) {
    if (!ensure()) return;
    if (music.song === name) return;
    music.song = name; music.idx = 0; music.nextT = now() + 0.1;
    if (!music.timer) music.timer = setInterval(scheduleMusic, 60);
    if (!name) { clearInterval(music.timer); music.timer = 0; }
  },
  musicDuck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.15 : MUSIC_LEVEL, now(), 0.05); },
  mg() { tone('square', 900, 260, 0.05, 0.06); noise(0.05, 0.09, 5000, 1400); },
  grenade() { tone('triangle', 320, 120, 0.14, 0.22); noise(0.06, 0.08, 1500, 500); },
  rocket() { noise(0.35, 0.16, 800, 4000, null, null, 'bandpass'); tone('sawtooth', 180, 520, 0.25, 0.05); },
  boom(big) {
    noise(big ? 1.0 : 0.55, big ? 0.42 : 0.3, big ? 1800 : 2400, 60);
    tone('sine', big ? 90 : 120, 30, big ? 0.7 : 0.4, big ? 0.5 : 0.35);
  },
  splash() { noise(0.4, 0.25, 3000, 400, null, null, 'bandpass'); },
  enemyShot() { tone('square', 520, 260, 0.07, 0.05); },
  shell() { tone('sine', 160, 70, 0.18, 0.25); noise(0.12, 0.12, 1200, 300); },
  ping() { tone('square', 1900, 1700, 0.05, 0.05); tone('triangle', 2800, 2700, 0.06, 0.04); },
  thud() { noise(0.08, 0.12, 900, 300); },
  soldierDown() { tone('square', 520, 180, 0.12, 0.07); },
  squash() { noise(0.1, 0.2, 700, 200); tone('square', 300, 90, 0.1, 0.07); },
  powFree() { seq(['E6', 'G6'], 0.06, 'triangle', 0.14); },
  powPick() { seq(['C6', 'E6', 'G6'], 0.05, 'square', 0.08); },
  powDeliver() { seq(['G5', 'C6', 'E6', 'G6'], 0.07, 'square', 0.09); },
  missile() { noise(0.45, 0.14, 600, 2600, null, null, 'bandpass'); tone('sawtooth', 140, 380, 0.3, 0.05); },
  plane() { noise(2.4, 0.16, 300, 900, null, null, 'bandpass'); tone('sawtooth', 90, 70, 2.2, 0.05); },
  rumble() { noise(0.7, 0.3, 500, 120); tone('sine', 70, 40, 0.6, 0.18); },
  hurt() { tone('square', 260, 90, 0.16, 0.12); noise(0.18, 0.3, 2600, 400); tone('triangle', 1400, 900, 0.08, 0.06); },
  repair() { seq(['C6', 'G6', 'C7'], 0.06, 'triangle', 0.14); tone('square', 1800, 2400, 0.08, 0.04); },
  upgrade() { seq(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.05, 'square', 0.1); },
  checkpoint() { seq(['A5', 'E6'], 0.09, 'triangle', 0.15); },
  star() { seq(['E6', 'G#6', 'B6', 'E7', 'B6', 'E7'], 0.05, 'triangle', 0.15); },
  playerDown() { noise(1.0, 0.6, 2000, 60); tone('sawtooth', 220, 40, 0.9, 0.12); },
  alarm() { const t = now(); for (let k = 0; k < 6; k++) tone('square', k % 2 ? 660 : 880, k % 2 ? 660 : 880, 0.18, 0.07, t + k * 0.2); },
  pause() { seq(['A5', '-', 'A5'], 0.06, 'square', 0.09); },
  tick() { tone('square', 1200, 1200, 0.03, 0.05); },
  clear() {
    const st = 0.13;
    seq(['G4', 'C5', 'E5', 'G5', '-', 'E5', 'G5', '-', 'A5', 'G5', 'A5', 'B5', 'C6', '-', '-', '-'], st, 'square', 0.1, 0.8);
    seq(['C3', '-', 'G3', '-', 'C3', '-', 'G3', '-', 'F3', '-', 'G3', '-', 'C3', '-', '-', '-'], st, 'triangle', 0.22, 0.9);
  },
  gameOver() {
    const st = 0.2;
    seq(['E5', 'D5', 'C5', 'B4', 'A4', '-', 'E4', '-', '-', 'A3'], st, 'square', 0.1, 0.8);
    seq(['A2', '-', 'E2', '-', 'F2', '-', 'E2', '-', '-', 'A1'], st, 'triangle', 0.22, 0.9);
  },
  // 吉普引擎：'off' | 'idle' | 'move'
  engine(mode) {
    if (!ctx) return;
    if (mode === 'off') { if (eng) eng.g.gain.setTargetAtTime(0.0001, now(), 0.04); return; }
    if (!eng) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 70;
      f.type = 'lowpass'; f.frequency.value = 380;
      lfo.type = 'square'; lfo.frequency.value = 16; lg.gain.value = 14;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.0001;
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(); lfo.start();
      eng = { o, lfo, g };
    }
    const move = mode === 'move';
    eng.o.frequency.setTargetAtTime(move ? 96 : 64, now(), 0.06);
    eng.lfo.frequency.setTargetAtTime(move ? 24 : 13, now(), 0.06);
    eng.g.gain.setTargetAtTime(move ? 0.045 : 0.022, now(), 0.06);
  },
  captureStream() {
    if (!ensure()) return null;
    if (!capDest) { capDest = ctx.createMediaStreamDestination(); master.connect(capDest); }
    return capDest.stream;
  },
  state() { return ctx ? ctx.state : 'none'; },
  musicState() { return music.song; }
};
const LOGGED = ['missile', 'plane', 'rumble', 'hurt', 'repair', 'music', 'musicDuck', 'mg', 'grenade', 'rocket', 'boom', 'splash', 'enemyShot', 'shell', 'ping', 'thud', 'soldierDown', 'squash', 'powFree', 'powPick', 'powDeliver', 'upgrade', 'checkpoint', 'star', 'playerDown', 'alarm', 'pause', 'tick', 'clear', 'gameOver', 'engine'];
const RAW = {};
for (const k of LOGGED) {
  RAW[k] = A[k];
  A[k] = function () {
    if (logOn && logClock) logBuf.push({ t: +logClock().toFixed(4), n: k, a: Array.prototype.slice.call(arguments) });
    if (fakeNow !== null && k === 'music') return;   // 离线渲染时音乐单独排程
    return RAW[k].apply(A, arguments);
  };
}
// 离线渲染：用同一套合成函数把日志排到 OfflineAudioContext 上，输出 16-bit WAV（base64）
A.renderOffline = async function (events, duration) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const rate = 48000, off = new OAC(2, Math.ceil(rate * duration), rate);
  const saved = { ctx, master, sfxBus, musicBus, noiseBuf, eng, music, capDest };
  ctx = off;
  master = off.createGain(); master.gain.value = 0.9;
  const comp = makeComp(off); master.connect(comp); comp.connect(off.destination);
  sfxBus = off.createGain(); sfxBus.connect(master);
  musicBus = off.createGain(); musicBus.gain.value = MUSIC_LEVEL; musicBus.connect(master);
  noiseBuf = off.createBuffer(1, rate, rate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  eng = null; capDest = null; music = { song: null, idx: 0, nextT: 0, timer: 0 };
  try {
    const musicEv = events.filter((e, i, arr) => e.n === 'music').filter((e, i, arr) => i === 0 || arr[i - 1].a[0] !== e.a[0]);
    for (let k = 0; k < musicEv.length; k++) {
      const e = musicEv[k], end = k + 1 < musicEv.length ? musicEv[k + 1].t : duration;
      if (!e.a[0]) continue;
      music.song = e.a[0]; music.idx = 0; music.nextT = e.t + 0.1;
      fakeNow = e.t; scheduleMusic(Math.min(end, duration));
    }
    music.song = null;
    for (const e of events) {
      if (e.n === 'music' || e.t >= duration) continue;
      fakeNow = e.t;
      RAW[e.n].apply(A, e.a);
    }
    fakeNow = null;
    const buf = await off.startRendering();
    // WAV 编码
    const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const ws = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
    let o = 44, peak = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, ch[c][i])); peak = Math.max(peak, Math.abs(v)); out.setInt16(o, v * 32767, true); o += 2; }
    const bytes = new Uint8Array(out.buffer);
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { wav: btoa(bin), peak, seconds: n / rate };
  } finally {
    fakeNow = null;
    ({ ctx, master, sfxBus, musicBus, noiseBuf, eng, music, capDest } = saved);
  }
};
export default A;
