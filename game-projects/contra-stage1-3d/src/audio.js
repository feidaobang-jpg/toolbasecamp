// FC 风格音频：两路方波（可切占空比）、三角波、噪声，WebAudio 实时合成。
// 音乐按参考乐谱的音高与时值重新演奏（见 music-data.js）；音效为按原作听感近似合成。
// 统一入口：A.music(name) / A.play(name, ...args)，便于记录日志并离线渲染同场音轨。
import { store } from './core.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, capDest = null;
let waves = null, noiseLong = null, noiseShort = null;
let volume = store.get('volume', 0.7);
if (typeof volume !== 'number' || !isFinite(volume)) volume = 0.7;
const MUSIC_LEVEL = 0.75;

function makeComp(c) { const k = c.createDynamicsCompressor(); k.threshold.value = -16; k.knee.value = 8; k.ratio.value = 4; k.attack.value = 0.003; k.release.value = 0.2; return k; }
function pulseWave(c, duty) {
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
    im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
  }
  return c.createPeriodicWave(re, im);
}
// FC 噪声：15 位线性反馈移位寄存器；短模式（6 号抽头）是 93 步循环的「金属」噪声
function lfsrBuffer(c, short) {
  const len = short ? 93 * 64 : c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let r = 1;
  for (let i = 0; i < len; i++) {
    const fb = (r & 1) ^ ((r >> (short ? 6 : 1)) & 1);
    r = (r >> 1) | (fb << 14);
    d[i] = (r & 1) ? 0.9 : -0.9;
  }
  return buf;
}
function build(c) {
  master = c.createGain(); master.gain.value = volume;
  const comp = makeComp(c); master.connect(comp); comp.connect(c.destination);
  sfxBus = c.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  musicBus = c.createGain(); musicBus.gain.value = MUSIC_LEVEL; musicBus.connect(master);
  waves = { p12: pulseWave(c, 0.125), p25: pulseWave(c, 0.25), p50: pulseWave(c, 0.5) };
  noiseLong = lfsrBuffer(c, false); noiseShort = lfsrBuffer(c, true);
}
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  build(ctx);
  return ctx;
}
let fakeNow = null;   // 离线渲染时用游戏时间代替音频时钟
const now = () => (fakeNow !== null ? fakeNow : ctx.currentTime);

// 单音：wave 取 'p12' | 'p25' | 'p50' | 'tri' | 'sine' | 'saw'
function tone(wave, f0, f1, dur, vol, at, bus, sustain) {
  if (!ctx) return;
  const t = at || now();
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (waves[wave]) o.setPeriodicWave(waves[wave]); else o.type = wave === 'tri' ? 'triangle' : wave === 'saw' ? 'sawtooth' : 'sine';
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  if (sustain) { g.gain.setValueAtTime(vol * sustain, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, rate0, rate1, at, bus, short, fc) {
  if (!ctx) return;
  const t = at || now();
  const s = ctx.createBufferSource(); s.buffer = short ? noiseShort : noiseLong; s.loop = true;
  s.playbackRate.setValueAtTime(rate0, t);
  if (rate1 && rate1 !== rate0) s.playbackRate.exponentialRampToValueAtTime(Math.max(0.01, rate1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head = s;
  if (fc) { const f = ctx.createBiquadFilter(); f.type = fc.type || 'lowpass'; f.frequency.value = fc.f; s.connect(f); head = f; }
  head.connect(g); g.connect(bus || sfxBus);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.03);
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = {};
{
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 0; o <= 8; o++) for (let n = 0; n < 12; n++) NOTE[names[n] + o] = mtof((o + 1) * 12 + n);
}
function seq(notes, step, wave, vol, gate, bus, at) {
  const t0 = (at || now()) + 0.01;
  notes.forEach((n, i) => { if (n && n !== '-') tone(wave, NOTE[n], NOTE[n], step * (gate || 0.85), vol, t0 + i * step, bus, 0.7); });
  return notes.length * step;
}

// ---------- 音乐引擎 ----------
let SONGS = {};
const VOICE = {
  p1: { wave: 'p25', vol: 0.085 },
  p2: { wave: 'p12', vol: 0.065 },
  p3: { wave: 'p50', vol: 0.06 },
  tri: { wave: 'tri', vol: 0.24, oct: 0 },
  drum: null
};
function drumHit(p, t, bus) {
  // GM 鼓号映射到 FC 噪声 / 三角波打击
  if (p === 35 || p === 36) { tone('tri', 150, 45, 0.12, 0.42, t, bus); noise(0.05, 0.12, 0.6, 0.3, t, bus); }
  else if (p === 38 || p === 40 || p === 37 || p === 39) { noise(0.14, 0.22, 0.9, 0.5, t, bus); tone('tri', 220, 120, 0.05, 0.18, t, bus); }
  else if (p === 42 || p === 44 || p === 46 || p === 51) { noise(p === 46 ? 0.1 : 0.035, 0.07, 1, 1, t, bus, true, { type: 'highpass', f: 6000 }); }
  else if (p >= 41 && p <= 50) { tone('tri', mtof(p + 12), mtof(p), 0.14, 0.3, t, bus); }
  else noise(0.06, 0.1, 1, 0.8, t, bus);
}
let music = null;   // { name, t0, spt, cursor }；循环曲：首遍 [0, loopEnd)，之后每遍 [loopStart, loopEnd)
function scheduleMusic(untilT) {
  if (!ctx || !music) return;
  const s = SONGS[music.name]; if (!s) return;
  const until = untilT !== undefined ? untilT : now() + 0.3;
  const toTick = (until - music.t0) / music.spt;
  const from = music.cursor;
  if (toTick <= from) return;
  const loop = s.loopEnd !== undefined;
  const L = loop ? s.loopEnd - s.loopStart : 0;
  for (const tr of s.tracks) {
    const v = tr.ch === 'drum' ? null : (VOICE[tr.ch] || VOICE.p1);
    const n = tr.n;
    // 迭代所有可能落在 [from, toTick) 的遍历
    const passes = [];
    if (!loop) passes.push({ off: 0, lo: 0, hi: Infinity });
    else {
      passes.push({ off: 0, lo: 0, hi: s.loopEnd });
      const k0 = Math.max(1, Math.floor((from - s.loopEnd) / L) + 1), k1 = Math.floor((toTick - s.loopStart) / L) + 1;
      for (let k = k0; k <= k1; k++) passes.push({ off: k * L, lo: s.loopStart, hi: s.loopEnd });
    }
    for (const ps of passes) {
      for (let i = 0; i < n.length; i += 3) {
        const st = n[i]; if (st < ps.lo || st >= ps.hi) continue;
        const abs = st + ps.off; if (abs < from || abs >= toTick) continue;
        const t = music.t0 + abs * music.spt, dur = n[i + 1] * music.spt, p = n[i + 2];
        if (!v) drumHit(p, t, musicBus);
        else tone(v.wave, mtof(p), mtof(p), Math.max(0.04, dur * 0.92), v.vol, t, musicBus, v.wave === 'tri' ? 0.95 : 0.55);
      }
    }
  }
  music.cursor = toTick;
  if (!loop && s.end !== undefined && toTick > s.end + 4) { music.done = true; }
}
function startMusic(name, at) {
  const s = SONGS[name]; if (!s) { music = null; return; }
  music = { name, t0: (at !== undefined ? at : now()) + 0.06, spt: 60 / s.bpm / s.tpb, cursor: 0, done: false };
}

// 录音日志：记录每次音效 / 音乐调用的游戏时间，供离线渲染同场音轨
let logClock = null, logOn = false, logBuf = [];
let SFX = {};
let timer = 0;
const A = {
  setClock(fn) { logClock = fn; },
  setSongs(s) { SONGS = s; },
  defineSfx(table) { SFX = table; },
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
    if (logOn && logClock) logBuf.push({ t: +logClock().toFixed(4), n: 'music', a: [name] });
    if (fakeNow !== null) return;
    if (!ensure()) return;
    if (music && music.name === name && !music.done) return;
    if (!name) { music = null; return; }
    startMusic(name);
    if (!timer) timer = setInterval(() => scheduleMusic(), 40);
  },
  musicDuck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.12 : MUSIC_LEVEL, now(), 0.05); },
  play(name) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (logOn && logClock) logBuf.push({ t: +logClock().toFixed(4), n: name, a: args });
    if (!ctx || !SFX[name]) return;
    SFX[name].apply(null, [lib].concat(args));
  },
  captureStream() {
    if (!ensure()) return null;
    if (!capDest) { capDest = ctx.createMediaStreamDestination(); master.connect(capDest); }
    return capDest.stream;
  },
  state() { return ctx ? ctx.state : 'none'; },
  musicState() { return music ? music.name : null; }
};
// 给音效表用的合成工具
const lib = { tone, noise, seq, NOTE, mtof, now: () => now(), sfx: () => sfxBus };

// 离线渲染：用同一套合成函数把日志排到 OfflineAudioContext 上，输出 16-bit WAV（base64）
A.renderOffline = async function (events, duration) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const rate = 48000, off = new OAC(2, Math.ceil(rate * duration), rate);
  const saved = { ctx, master, sfxBus, musicBus, capDest, waves, noiseLong, noiseShort, music };
  ctx = off; capDest = null;
  build(off); master.gain.value = 0.9;
  try {
    const mus = events.filter(e => e.n === 'music');
    for (let k = 0; k < mus.length; k++) {
      const e = mus[k], end = k + 1 < mus.length ? mus[k + 1].t : duration;
      if (!e.a[0]) { music = null; continue; }
      if (k > 0 && mus[k - 1].a[0] === e.a[0]) continue;
      fakeNow = e.t; startMusic(e.a[0], e.t);
      scheduleMusic(Math.min(end, duration));
    }
    music = null;
    for (const e of events) {
      if (e.n === 'music' || e.t >= duration || !SFX[e.n]) continue;
      fakeNow = e.t;
      SFX[e.n].apply(null, [lib].concat(e.a));
    }
    fakeNow = null;
    const buf = await off.startRendering();
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
    ({ ctx, master, sfxBus, musicBus, capDest, waves, noiseLong, noiseShort, music } = saved);
  }
};
export default A;
