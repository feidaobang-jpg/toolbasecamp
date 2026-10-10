import { ORIGINAL_FILES, originalCue } from './original-sfx.js';
import {SampleAudio} from "../../../public/js/game/sample-audio.js";
// 音频：优先原作各区域与 Boss 音乐（第一、二关），未加载或不可用时合成回退。
// 点击 / 按键后解锁；所有暂停冻结音频时钟。
let ctx = null, master = null, musicBus = null, sfxBus = null, comp = null, capDest = null, noiseBuf = null, distCurve = null, roomIn = null;
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
  roomIn = buildRoom(ctx, sfxBus);
  // 第二关：2-1 In the Poachers' Forest、2-2 Ancient Earth、2-3 与 1-2 同曲 Trap of Silence、Boss 2
  // 原版曲目没加载完时不先放合成的旧版曲子；只有原版加载失败才用合成兜底
  // 先下最先要用的（选人曲、开场曲、所选起始关的第一首、全部音效），其余排在后面；同一个文件只下一次（stage=roof、grave=hall）
  const startAt = (() => { try { return JSON.parse(localStorage.getItem('cd3d-stage1:stage')) | 0; } catch (e) { return 0; } })(), startStage2 = startAt === 1, startStage3 = startAt === 2;
  // 第一批（并行）：选人曲、开场曲、全部音效，都很小；之后按需要的先后逐首下载，起始关的第一首排最前
  const first = startStage2 || startStage3 ? ['select'] : ['select', 'opening'];
  const S3 = ['desert', 'road', 'boss3'];
  const order = startStage3 ? S3.concat(['clear', 'cont', 'roof', 'hall', 'street', 'boss', 'forest', 'swamp', 'boss2']) : startStage2 ? ['forest', 'swamp', 'hall', 'boss2', 'clear', 'cont'].concat(S3, ['roof', 'street', 'boss']) : ['roof', 'hall', 'street', 'boss', 'clear', 'cont', 'forest', 'swamp', 'boss2'].concat(S3);
  const pick = (names) => Object.fromEntries(names.map(n => [n, MUSIC_FILES[n]]));
  samples = new SampleAudio(ctx, musicBus, sfxBus, { ...pick(first), ...ORIGINAL_FILES });
  samples.ready.then(() => loadRest(samples, order.concat(Object.keys(MUSIC_FILES).filter(n => !first.includes(n) && !order.includes(n)))));
  return ctx;
}
const now = () => ctx.currentTime;
// 原版曲子：第一关（楼顶 / 大楼内部 / 47 街 / Boss 1）、第二关（森林 / 泥沼 / 尸骸地 / Boss 2）、
// 第三关（3-A Roaring Sound 荒漠 / 3-B Like a Squall 公路 / Boss 3）、选人、开场、过关、续关
const MUSIC_FILES = { select: 'select.mp3', opening: 'opening.mp3?v=1', roof: 'roof.mp3?v=bgmfull1', hall: 'hall.mp3?v=bgmfull1', street: 'street.mp3?v=bgmfull1', boss: 'boss.mp3?v=bgmfull1', forest: 'forest.mp3?v=bgmfull1', swamp: 'swamp.mp3?v=bgmfull1', boss2: 'boss2.mp3?v=bgmfull1', desert: 'desert.mp3?v=hr1', road: 'road.mp3?v=hr1', boss3: 'boss3.mp3?v=hr1', clear: 'clear.mp3?v=1', cont: 'continue.mp3?v=1' };
const ALIAS = { stage: 'roof', grave: 'hall' };   // 同曲不同名：只下载一次
// 第二批：依次下载（不和第一批抢带宽），下完一首就能用；同名别名共用同一段解码好的音频
async function loadRest(s, names) {
  const base = new URL('./sounds/', location.href);
  for (const name of names) {
    try {
      const r = await fetch(new URL(MUSIC_FILES[name], base)); if (!r.ok) throw Error(r.status);
      s.buffers.set(name, await s.ctx.decodeAudioData(await r.arrayBuffer()));
      if (s.track?.name === name) s.startTrack();
    } catch (e) { s.failed.push(name); }
  }
}
function linkAlias(name) { const src = ALIAS[name]; if (src && samples && !samples.has(name) && samples.has(src)) samples.buffers.set(name, samples.buffers.get(src)); }
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
// 打击用的短混响：0.32 秒衰减的噪声脉冲，让拳脚声有“在场”的空间感
function buildRoom(c, out) {
  const len = Math.floor(c.sampleRate * 0.32), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  const cv = c.createConvolver(); cv.buffer = ir;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  const g = c.createGain(); g.gain.value = 0.22;
  const inp = c.createGain(); inp.connect(cv); cv.connect(lp); lp.connect(g); g.connect(out);
  return inp;
}
// 打击的“肉感”：正弦急速降调 + 失真，dest 可额外送进混响
function thump(t, f0, f1, dur, peak, slide) {
  const o = ctx.createOscillator(), sh = ctx.createWaveShaper(), g = ctx.createGain(), pre = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (slide || dur * 0.7));
  sh.curve = distCurve; pre.gain.value = 1.6;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(pre); pre.connect(sh); sh.connect(g); g.connect(sfxBus); if (roomIn) g.connect(roomIn);
  o.start(t); o.stop(t + dur + 0.05);
}
const vary = () => 0.92 + Math.random() * 0.16;   // 每一下音高略有不同，连打不机械
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
  if (opts && opts.room && roomIn) g.connect(roomIn);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// Short samples use this same context/bus for pause, mute, capture and offline rendering.
const lastSample = new Map();
const CUE_GAIN = { hit: 1.2, bodyfall: 1.0, finisher: 0.95, mega: 1.0, go: 0.9, dash: 0.9, shout: 0.95 };
const activeSamples = new Set();
function playOriginal(name, v, hero, t, throttle = true) {
  const key = originalCue(name, hero), buffer = samples?.buffers.get(key);
  if (!buffer) return false;
  // One impact per simultaneous hit group; every subsequent combo hit still sounds.
  if (throttle && name !== 'mega' && name !== 'go' && t - (lastSample.get(key) ?? -9) < 0.035) return true;
  if (throttle) lastSample.set(key, t);
  // 原作清完一波喊三遍 GO，间隔 0.59 秒（实机录像测得）
  const repeats = name === 'go' ? 3 : 1;
  for (let i = 0; i < repeats; i++) {
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; gain.gain.value = v * (CUE_GAIN[key.split('-')[0]] ?? 1);
    source.connect(gain); gain.connect(sfxBus);
    if (throttle) activeSamples.add(source);
    source.onended = () => { activeSamples.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(t + i * 0.59);
  }
  return true;
}

// ---------- 音效 ----------
const SFX = {
  // 拳：高频“啪”的瞬态 + 中频皮肉拍击 + 失真的降调闷响；重拳再叠低频冲击与碎裂感
  punch(t, v) { const r = vary(); noise(t, 0.022, 0.75 * v, 'highpass', 2600 * r, 0.8); noise(t, 0.075, 0.95 * v, 'bandpass', 1500 * r, 0.9, null, { to: 650, room: true }); thump(t, 200 * r, 62, 0.13, 0.75 * v); },
  punchHeavy(t, v) { const r = vary(); noise(t, 0.03, 0.9 * v, 'highpass', 2200 * r, 0.8); noise(t, 0.13, 1.05 * v, 'bandpass', 1100 * r, 0.8, null, { to: 380, room: true }); thump(t, 165 * r, 44, 0.26, 1.05 * v, 0.16); osc('sine', 62, t, 0.32, 0.7 * v, null, { to: 32 }); noise(t + 0.008, 0.06, 0.4 * v, 'lowpass', 3400, 1); },
  kick(t, v) { const r = vary(); noise(t, 0.025, 0.65 * v, 'highpass', 1900 * r, 0.8); noise(t, 0.1, 0.95 * v, 'bandpass', 950 * r, 0.8, null, { to: 360, room: true }); thump(t, 160 * r, 50, 0.17, 0.9 * v); },
  dashHit(t, v) { SFX.kickHeavy(t, v); },
  dash(t, v) { SFX.whoosh(t, v * 0.8); },
  kickHeavy(t, v) { const r = vary(); noise(t, 0.032, 0.85 * v, 'highpass', 1700 * r, 0.8); noise(t, 0.16, 1.1 * v, 'bandpass', 800 * r, 0.8, null, { to: 260, room: true }); thump(t, 140 * r, 38, 0.3, 1.1 * v, 0.18); osc('sine', 55, t, 0.34, 0.75 * v, null, { to: 30 }); },
  // 挥空：轻招短促偏高，重招更长更沉（带一点低频“呼”）
  whoosh(t, v) { const r = vary(); noise(t, 0.11, 0.5 * v, 'bandpass', 1300 * r, 1.4, null, { to: 3400 * r, a: 0.035 }); },
  whooshHeavy(t, v) { const r = vary(); noise(t, 0.2, 0.6 * v, 'bandpass', 600 * r, 1.2, null, { to: 2200 * r, a: 0.07 }); noise(t, 0.18, 0.3 * v, 'lowpass', 500, 1, null, { a: 0.06 }); },
  // 倒地：身体砸地的闷响 + 尘土沙沙声
  bodyfall(t, v) { const r = vary(); thump(t, 110 * r, 40, 0.22, 0.85 * v); noise(t, 0.2, 0.75 * v, 'lowpass', 700 * r, 1, null, { to: 180, room: true }); noise(t + 0.02, 0.22, 0.18 * v, 'highpass', 3500, 0.7); },
  slam(t, v) { noise(t, 0.35, 1.0 * v, 'lowpass', 900, 1, null, { to: 120, room: true }); thump(t, 120, 32, 0.42, 1.1 * v, 0.25); noise(t, 0.04, 0.6 * v, 'highpass', 2000, 0.8); },
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
  hurtP(t, v) { const r = vary(); osc('sawtooth', 300 * r, t, 0.18, 0.18 * v, null, { to: 180 }); thump(t, 150 * r, 55, 0.12, 0.5 * v); },
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
  fuse(t, v) { noise(t, 0.5, 0.12 * v, 'highpass', 4000, 1); },
  // 第二关（合成）
  rifle(t, v) { noise(t, 0.3, 1.1 * v, 'lowpass', 5200, 0.7, null, { to: 300 }); osc('square', 260, t, 0.05, 0.4 * v, null, { to: 70 }); noise(t + 0.02, 0.5, 0.18 * v, 'bandpass', 900, 1); },
  splash(t, v) { noise(t, 0.35, 0.6 * v, 'bandpass', 1200, 0.8, null, { to: 400 }); noise(t + 0.05, 0.25, 0.25 * v, 'highpass', 3000, 1); },
  engine(t, v) { const o = osc('sawtooth', 48, t, 2.0, 0.22 * v, null, { to: 70, slide: 1.4 }); noise(t, 2.0, 0.14 * v, 'lowpass', 300, 1); },
  // 第三关（合成）：凯迪拉克行驶中的低沉引擎声（一段约 2 秒，首尾渐入渐出，隔 1.5 秒接一段）、摩托轰油门
  carHum(t, v) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 54 + Math.random() * 3; o2.type = 'square'; o2.frequency.value = 27.5;
    lfo.frequency.value = 11; lg.gain.value = 2.5; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 230; f.Q.value = 0.8;
    env(g, t, 0.3, 0.1 * v, 0.1, 1, 0.55, 1.5);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + 2.15); }
  },
  bikeRev(t, v) { osc('sawtooth', 92, t, 0.9, 0.2 * v, null, { to: 190, slide: 0.35 }); osc('square', 46, t, 0.8, 0.1 * v, null, { to: 95, slide: 0.35 }); noise(t, 0.9, 0.12 * v, 'bandpass', 520, 1.2); },
  brake(t, v) { osc('triangle', 1700, t, 0.4, 0.06 * v, null, { to: 1300 }); noise(t, 0.4, 0.2 * v, 'bandpass', 2200, 3); },
  snort(t, v) { noise(t, 0.25, 0.5 * v, 'bandpass', 500, 1.5, null, { to: 250 }); },
  roarBig(t, v) {   // 霸王龙：更低更长的吼声
    const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(190, t + 0.3); o.frequency.exponentialRampToValueAtTime(60, t + 1.4);
    lfo.frequency.value = 22; lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
    f1.type = 'lowpass'; f1.frequency.value = 900; f1.Q.value = 2;
    env(g, t, 0.05, 0.55 * v, 1.3, 0.3, 0.2, 1.2);
    o.connect(f1); f1.connect(g); g.connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
    noise(t, 1.2, 0.3 * v, 'lowpass', 700, 1);
  },
  roarMan(t, v) {   // 屠夫的怒吼
    const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(190, t + 0.25); o.frequency.exponentialRampToValueAtTime(95, t + 0.9);
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 2.5;
    env(g, t, 0.03, 0.5 * v, 0.9, 0.3, 0.15, 0.8);
    o.connect(f1); f1.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.1);
  }
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
// 有原版录音的曲目（第一、二关各区域、Boss、选人）
// 第一关开场用原版「Opening Demo」，过关「Stage Clear」，续关倒数「Continue 1」
let pendingMusic = null, pendingTimer = 0;
// 原版曲还没下载好、当前也没在放原版曲：保持安静等它；下载失败才用合成兜底（开场曲没有合成版，失败就安静）
function waitOriginal(name) {
  const id = setInterval(() => {
    if (seq.name !== name) return clearInterval(id);
    linkAlias(name);
    if (samples.has(name)) { clearInterval(id); if (!samples.track || samples.track.name !== name || !samples.source) samples.music(name, name !== 'clear' && name !== 'opening', true); }
    else if (samples.failed.includes(name) || samples.failed.includes(ALIAS[name])) { clearInterval(id); if (name !== 'opening' && !seq.song) startSynth(name); }
  }, 150);
}
const ORIGINAL_MUSIC = new Set(['stage', 'roof', 'hall', 'street', 'boss', 'select', 'forest', 'swamp', 'grave', 'boss2', 'opening', 'clear', 'cont']);
function startSynth(name) {
  seq.gain = ctx.createGain(); seq.gain.gain.value = seq.duck ? 0.25 : 1; seq.gain.connect(musicBus);
  seq.song = SONGS[name] || (name === 'boss2' ? SONGS.boss : SONGS.stage); seq.step = 0; seq.next = now() + 0.08;
  if (!seq.timer) seq.timer = setInterval(schedule, 25);
}
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
  clearEffects() { for (const s of activeSamples) s.stop(); activeSamples.clear(); lastSample.clear(); },
  setVolume(v) { volume = v; try { localStorage.setItem('cd3d-stage1:volume', String(v)); } catch (e) { /* ignore */ } if (master) master.gain.value = v; },
  tick() { if (ctx && ctx.state === 'running') SFX.select(now(), 1); },
  play(name, vol, hero = 'jack') {
    if (log.on) log.events.push({ t: +clockFn().toFixed(3), name, vol: vol ?? 1, hero, sample: originalCue(name, hero), source: samples?.has(originalCue(name, hero)) ? 'original' : 'fallback' });
    if (!ctx || offRendering || ctx.state !== 'running' || volume <= 0) return;
    if (playOriginal(name, vol ?? 1, hero, now() + 0.005)) return;
    const f = SFX[name]; if (!f) return;
    try { f(now() + 0.005, vol === undefined ? 1 : vol); } catch (e) { /* 节点上限等 */ }
  },
  music(name) {
    if (seq.name === name && (seq.song || samples?.track || pendingMusic === name)) return;
    if (log.on) log.events.push({ t: +clockFn().toFixed(3), music: name });
    seq.name = name;
    if (!ensure()) return;
    if (name) linkAlias(name);
    pendingMusic = null;
    if (name && samples && !samples.has(name) && samples.source && !samples.failed.includes(name) && !samples.failed.includes(ALIAS[name])) {
      // 新原版曲还没下载完：先接着放当前这首原版曲，下好立刻换（开场必杀时第一关曲还在下载就是这种情况）
      pendingMusic = name;
      if (!pendingTimer) pendingTimer = setInterval(() => {
        if (!pendingMusic) return;
        linkAlias(pendingMusic);
        if (samples.has(pendingMusic)) { const n = pendingMusic; pendingMusic = null; samples.music(n, n !== 'clear' && n !== 'opening'); }
        else if (samples.failed.includes(pendingMusic) || samples.failed.includes(ALIAS[pendingMusic])) { const n = pendingMusic; pendingMusic = null; samples.music(null); if (n !== 'opening') startSynth(n); }
      }, 150);
      if (seq.gain) { const g = seq.gain; g.gain.setTargetAtTime(0, now(), 0.08); setTimeout(() => g.disconnect(), 600); }
      seq.gain = null; seq.song = null;
      return;
    }
    samples?.music(name, name !== 'clear' && name !== 'opening');
    if (seq.gain) { const g = seq.gain; g.gain.setTargetAtTime(0, now(), 0.08); setTimeout(() => g.disconnect(), 600); }
    seq.gain = null; seq.song = null;
    if (!name || !(SONGS[name] || ORIGINAL_MUSIC.has(name))) return;
    if (ORIGINAL_MUSIC.has(name) && !samples?.failed.includes(name)) { waitOriginal(name); return; }
    startSynth(name);
  },

  musicDuck(on) { audioPaused = !!on; syncAudioPause(); },
  pause() { /* 音效都很短，暂停时不需要单独处理 */ },
  state: () => ({ ctx: ctx ? ctx.state : 'none', volume, originalsLoaded: Object.keys(ORIGINAL_FILES).filter(k => samples?.has(k)), failed: samples?.failed.slice() || [] }),
  musicState: () => ({ name: seq.name, playing: !!(seq.song || samples?.source) && !audioPaused && !document.hidden, synth: !!seq.song, original: !!samples?.source, track: samples?.source ? samples.track?.name || null : null, loaded: samples ? Object.keys(MUSIC_FILES).filter(n => samples.has(n)) : [] }),
  captureStream() { if (!ensure()) return null; if (!capDest) { capDest = ctx.createMediaStreamDestination(); master.connect(capDest); } return capDest.stream; },
  logStart() { log.on = true; log.events = []; },
  logStop() { log.on = false; return log.events.slice(); },
  // 离线渲染同场音轨（逐帧录像用）：按事件时间重新合成音效与音乐，返回 16-bit WAV 的 base64。
  // 分 15 秒一段渲染再叠加尾音：一次性把整局几千个音符挂进同一张音频图，渲染耗时会随时长平方增长
  async renderOffline(events, dur) {
    const sr = 44100, SEG = 15, TAIL = 2.5;
    const N = Math.ceil(sr * dur);
    const outL = new Float32Array(N), outR = new Float32Array(N);
    const saved = { ctx, master, musicBus, sfxBus, comp, noiseBuf, roomIn };
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
        roomIn = buildRoom(off, sfxBus);
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
        for (const e of events) if (e.name && (SFX[e.name] || originalCue(e.name, e.hero)) && e.t >= s0 && e.t < s1) { try { if (!playOriginal(e.name, e.vol ?? 1, e.hero, e.t - s0 + 0.005, false) && SFX[e.name]) SFX[e.name](e.t - s0 + 0.005, e.vol ?? 1); } catch (err) { /* ignore */ } }
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
      ({ ctx, master, musicBus, sfxBus, comp, noiseBuf, roomIn } = saved);
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
