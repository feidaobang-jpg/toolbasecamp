import {createSoundRelay} from '../../../public/js/game/coop.js';
import { installRemakeCoop } from '../../../public/js/game/remake-coop.js';
import { installRemakeUI, createPitchController, bindDragLook, addControlModeButtons, createLookController } from '../../../public/js/game/drag-look.js';
// 入口：渲染器、布局（竖屏自动旋转）、菜单 / 选人导航、HUD、全屏、画质、主循环与测试钩子
import * as THREE from 'three';
import { VERSION, STEP, TEST, CLEAN, store, seed, params, fmtTime, clamp } from './core.js';
import A from './audio.js';
import IN from './input.js';
import { buildWorld } from './world.js';
import { createFx } from './fx.js';
import { createCamera, PRESETS } from './camera.js';
import { HEROES, ENEMY, STAGES, AREAS } from './level.js';
import { buildHuman, buildRaptor, buildTrike, SPECS, portrait, outline, itemGeo, meshFrom, toonMat } from './models.js';
import { HP, applyPose, mod } from './anim.js';
import * as GM from './game.js';

const G = GM.G;
const $ = (id) => document.getElementById(id);
const app = $('app'), stage = $('stage'), canvas = $('screen');
const overlays = { menu: $('menu'), select: $('select'), pause: $('pause'), result: $('result'), cont: $('cont') };
const hud = $('hud'), hudTop = $('hud-top'), touch = $('touch'), toastEl = $('toast'), bannerEl = $('banner'), keyHint = $('keyhint');
const listUrl = app.getAttribute('data-list-url') || '../index.html';
const fpsEl = $('fps');
document.querySelectorAll('.list-link').forEach(a => { a.href = listUrl; });

// ---------- 设置 ----------
const pickOpt = (k, list, def) => { const v = store.get(k, def); return list.indexOf(v) >= 0 ? v : def; };
const settings = {
  lives: pickOpt('lives', ['inf', 'classic'], 'inf'),
  dur: pickOpt('dur', ['std', 'easy', 'classic'], 'std'),
  demo: false,
  quality: pickOpt('quality', ['auto', 'high', 'low'], 'auto'),
  touch: pickOpt('touch', ['auto', 'show', 'hide'], 'auto'),
  fps: store.get('fps', false) === true,
  hero: clamp(store.get('hero', 2) | 0, 0, 3),
  stage: clamp(store.get('stage', 0) | 0, 0, STAGES.length - 1)   // 起始关卡：已实现的两关都能直接选
};
if (params.get('q') === 'low' || params.get('q') === 'high') settings.quality = params.get('q');
let effQuality = settings.quality === 'low' ? 'low' : 'high';
let autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };
let coopDriver=null;
const coopSounds=createSoundRelay(A,['play'],()=>coopDriver?.config&&coopDriver.connection.host);
let uiMode = 'title';
let current = 'menu';

// ---------- 渲染器与场景 ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const el = $('loading'); el.hidden = false;
  el.innerHTML = '无法启动 3D 画面（WebGL 不可用）：' + (e.message || e) + '<br><button onclick="location.reload()">重试</button><br><a href="' + listUrl + '">返回游戏列表</a>';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camCtl = createCamera();
camCtl.setIndex(clamp(store.get('camera', 0) | 0, 0, PRESETS.length - 1));
const world = buildWorld(scene);
const fx = createFx(scene);
fx.cam = camCtl.cam; Object.defineProperty(fx, 'aspect', { get: () => camCtl.cam.aspect });
GM.init(scene, world, fx, camCtl);
A.setClock(() => (G.frames || 0) * STEP);

// ---------- 头像（离屏渲染） ----------
const FACES = {}, FULLS = {};
function makePortraits() {
  for (const h of HEROES) {
    const m = buildHuman(SPECS[h.id]); applyPose(m, HP.guard);
    FACES[h.id] = portrait(renderer, m, { size: 128 });
    const m2 = buildHuman(SPECS[h.id]); applyPose(m2, mod(HP.victory, { head: [-0.05, 0.25, 0] }));
    FULLS[h.id] = portrait(renderer, m2, { size: 256, full: true });
  }
  for (const t of ['ferris', 'gneiss', 'punk', 'blade', 'elmer', 'hammer', 'wrench', 'vice', 'poacher', 'skinner', 'gutter', 'thug', 'razor', 'lash', 'butcher', 'hogg']) { const m = buildHuman(SPECS[t]); applyPose(m, HP.guard); FACES[t] = portrait(renderer, m, { size: 96 }); }
  const r = buildRaptor(); r.setPalette('angry'); FACES.raptor = portrait(renderer, r, { size: 96, raptor: true });
  const tr = buildRaptor('trex'); FACES.shivat = portrait(renderer, tr, { size: 96, raptor: true, k: 2.1 });
  const tk = buildTrike(); FACES.hack = portrait(renderer, tk, { size: 96, raptor: true, k: 1.6 });
  // 续关画面：维斯用左轮指着玩家
  const v = buildHuman(SPECS.vice); applyPose(v, mod(HP.shoot, { spine: [0.05, 0.2, 0], head: [0.05, -0.15, 0], rS: [-1.5, 0.2, 0], rE: [0, 0, 0] }));
  const gun = meshFrom(itemGeo('gun'), { thin: true }); gun.rotation.set(Math.PI / 2, 0, 0); gun.scale.setScalar(1.3); v.bones.grip.add(gun);
  FACES.viceGun = portrait(renderer, v, { size: 320, fov: 34, camPos: [-0.35, 1.72, 1.55], camTgt: [-0.12, 1.62, 0] });
}
makePortraits();
GM.toTitle();

function applyQuality() {
  const high = effQuality === 'high';
  renderer.shadowMap.enabled = high;
  world.sun.castShadow = high;
  outline.mats.forEach(m => { m.visible = high; });
  scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  layout();
}

// ---------- 选项 ----------
function optLabel(name) {
  switch (name) {
    case 'stage': { const S = STAGES[settings.stage]; return ['起始关卡', '第' + '一二三四五六七八'[S.no - 1] + '关 · ' + S.name, false]; }
    case 'lives': return ['命数', settings.lives === 'inf' ? '无限命' : '经典 3 命', false];
    case 'dur': return ['耐久', { std: '标准（受伤 ×0.7）', easy: '宽松（受伤 ×0.45）', classic: '经典（原作伤害）' }[settings.dur], false];
    case 'demo': return ['演示模式（无敌不限时）', settings.demo ? '开' : '关', settings.demo];
    case 'quality': return ['画质', { auto: '自动（按实测帧率）', high: '高', low: '流畅' }[settings.quality] + (settings.quality === 'auto' ? ' · 当前' + (effQuality === 'high' ? '高' : '流畅') : ''), false];
    case 'volume': return ['音量', A.volume === 0 ? '静音' : Math.round(A.volume * 100) + '%', false];
    case 'touch': return ['操作模式', { auto: '自动识别', show: '手机触屏', hide: '电脑键鼠' }[settings.touch], false];
    case 'camera': return ['视角（C）', camCtl.preset().name, false];
    case 'fps': return ['帧率显示', settings.fps ? '开' : '关', false];
  }
  return [name, '', false];
}
let refreshControlModes = () => {};
function refreshOptions() {
  refreshControlModes();
  document.querySelectorAll('[data-control-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.controlMode === settings.touch)));
  document.querySelectorAll('[data-opt]').forEach(b => {
    const l = optLabel(b.getAttribute('data-opt'));
    b.innerHTML = '<span>' + l[0] + '</span><span class="val' + (l[2] ? ' warn' : '') + '">◂ ' + l[1] + ' ▸</span>';
  });
  $('hi-val').textContent = G.hi;
  const fsOn = !!fsElement(), fsShow = fsOn || fsCapable();
  document.querySelectorAll('.fs-btn').forEach(b => { b.textContent = fsOn ? '退出全屏' : '全屏'; b.hidden = !fsShow; });
  document.querySelectorAll('.fs-label').forEach(b => { b.textContent = fsOn ? '退出' : '全屏'; });
  $('btn-fs').hidden = !fsShow;
  $('demo-badge').hidden = !(uiMode === 'game' && settings.demo);
  $('cam-label').textContent = camCtl.preset().name;
}
function adjust(name, delta) {
  if (name === 'stage') { settings.stage = (settings.stage + (delta < 0 ? STAGES.length - 1 : 1)) % STAGES.length; store.set('stage', settings.stage); }
  else if (name === 'lives') { settings.lives = settings.lives === 'inf' ? 'classic' : 'inf'; store.set('lives', settings.lives); }
  else if (name === 'dur') { const o = ['std', 'easy', 'classic']; settings.dur = o[(o.indexOf(settings.dur) + (delta < 0 ? 2 : 1)) % 3]; store.set('dur', settings.dur); }
  else if (name === 'demo') {
    if(coopDriver?.config){showToast('联机模式不启用演示无敌');return;}
    settings.demo = !settings.demo;
    if (uiMode === 'game') { G.settings.demo = settings.demo; if (settings.demo) G.demoUsed = true; }
  } else if (name === 'quality') {
    const order = ['auto', 'high', 'low'];
    settings.quality = order[(order.indexOf(settings.quality) + (delta < 0 ? 2 : 1)) % 3];
    store.set('quality', settings.quality);
    effQuality = settings.quality === 'low' ? 'low' : 'high';
    autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };
    applyQuality();
  } else if (name === 'volume') {
    let v = Math.round(A.volume * 10) + delta;
    if (v > 10) v = 0; if (v < 0) v = 10;
    A.unlock(); A.setVolume(v / 10); A.tick();
  } else if (name === 'touch') {
    const order = ['auto', 'show', 'hide'];
    settings.touch = order[(order.indexOf(settings.touch) + (delta < 0 ? 2 : 1)) % 3];
    IN.clear(); store.set('touch', settings.touch);
    layout();
  } else if (name === 'camera') { cycleCamera(); }
  else if (name === 'fps') { settings.fps = !settings.fps; store.set('fps', settings.fps); fpsEl.hidden = !settings.fps; }
  refreshOptions();
}
function cycleCamera() {
  IN.clear();
  const p = camCtl.cycle();
  if (G.player) delete G.player.lookHeading;
  store.set('camera', camCtl.idx);
  showToast('视角：' + p.name + (p.fp ? (coarsePointer() ? '（按住画面拖动）' : '（Q/E 转头）') : ''));
  refreshOptions();
}

// ---------- 选人 ----------
const cardsEl = $('cards');
function buildCards() {
  cardsEl.innerHTML = '';
  HEROES.forEach((h, i) => {
    const d = document.createElement('button');
    d.className = 'card'; d.setAttribute('role', 'option'); d.setAttribute('data-hero', i); d.tabIndex = -1;
    const dm = (n) => '◆'.repeat(n) + '<span style="opacity:.25">' + '◆'.repeat(5 - n) + '</span>';
    d.innerHTML = '<img alt="' + h.name + '" src="' + FULLS[h.id] + '"><div class="nm">' + h.name + '</div><div class="en">' + h.en + '</div>' +
      '<div class="st"><span>POWER</span><span class="dm">' + dm(h.power) + '</span><span>SPEED</span><span class="dm">' + dm(h.speed) + '</span><span>SKILL</span><span class="dm">' + dm(h.skill) + '</span></div>' +
      '<div class="mt">' + h.motto + '<small>' + h.cnMotto + '</small></div>';
    d.addEventListener('click', () => { if (settings.hero === i && current === 'select') startGame(); else selectHero(i); });
    cardsEl.appendChild(d);
  });
  selectHero(settings.hero, true);
}
function selectHero(i, silent) {
  settings.hero = (i + HEROES.length) % HEROES.length; store.set('hero', settings.hero);
  cardsEl.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('on', k === settings.hero));
  if (!silent) A.play('select');
}
buildCards();

// ---------- 覆盖层与菜单导航 ----------
function show(name) {
  Object.keys(overlays).forEach(k => { overlays[k].hidden = k !== name; });
  if (name && name !== 'cont') toastEl.hidden = true;
  current = name;
  IN.clear();
  refreshOptions();
  layout();
  if (name && name !== 'cont') { const first = items()[0]; if (first) first.focus({ preventScroll: true }); }
  else { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); app.focus({ preventScroll: true }); }
}
// 只取实际显示的项：hidden 属性之外，样式收起的元素 focus() 后会让 ↑↓ 卡住
const items = () => current && current !== 'cont' ? Array.prototype.slice.call(overlays[current].querySelectorAll('.items > button, .items > a, .control-modes > button')).filter(el => !el.hidden && el.getClientRects().length > 0) : [];
document.addEventListener('keydown', (e) => {
  A.unlock();
  setInputMode('key');
  if (!current) {
    if (e.code === 'KeyF' && uiMode === 'game' && !e.repeat) { toggleFullscreen(); e.preventDefault(); }
    return;
  }
  if (current === 'cont') {
    if (!e.repeat && ['KeyJ', 'Enter', 'NumpadEnter', 'Space'].indexOf(e.code) >= 0) { IN.push('atk'); e.preventDefault(); }
    return;
  }
  const list = items(), i = list.indexOf(document.activeElement), el = list[i];
  if (current === 'select' && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].indexOf(e.code) >= 0) { selectHero(settings.hero + (/Left|KeyA/.test(e.code) ? -1 : 1)); e.preventDefault(); return; }
  switch (e.code) {
    case 'ArrowDown': case 'KeyS': list[(i + 1 + list.length) % list.length].focus(); e.preventDefault(); break;
    case 'ArrowUp': case 'KeyW': list[(i - 1 + list.length) % list.length].focus(); e.preventDefault(); break;
    case 'Tab': break;
    case 'ArrowLeft': case 'KeyA': case 'ArrowRight': case 'KeyD':
      if (el && el.hasAttribute('data-opt')) { adjust(el.getAttribute('data-opt'), /Left|KeyA/.test(e.code) ? -1 : 1); e.preventDefault(); }
      break;
    case 'KeyJ': case 'Enter': case 'NumpadEnter':
      if (e.repeat) { e.preventDefault(); break; }
      if (el) el.click(); else if (list[0]) list[0].click();
      e.preventDefault();
      break;
    case 'Escape':
      if (current === 'pause') { resume(); e.preventDefault(); }
      else if (current === 'select') { toTitle(); e.preventDefault(); }
      break;
    case 'KeyF': if (!e.repeat) { toggleFullscreen(); e.preventDefault(); } break;
    case 'KeyC': if (!e.repeat) { cycleCamera(); e.preventDefault(); } break;
  }
});
document.addEventListener('pointerdown', (e) => { A.unlock(); if (e.pointerType === 'touch') setInputMode('touch'); }, { capture: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-opt]');
  if (!t) return;
  if (t.hasAttribute('data-opt')) { adjust(t.getAttribute('data-opt'), 1); return; }
  switch (t.getAttribute('data-act')) {
    case 'select': A.music('select'); A.play('select'); show('select'); break;
    case 'start': startGame(); break;
    case 'restart': startGame(); break;
    case 'resume': resume(); break;
    case 'title': toTitle(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'list': A.music(null); break;
  }
});
overlays.cont.addEventListener('pointerdown', () => IN.push('atk'));
// 右上角按钮：触屏按下即触发（拖动转视角后紧接着的一下点击会被浏览器当作「停止惯性滑动」吞掉 click），鼠标仍走 click
function hudButton(el, fn) {
  let touchT = -1e9;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); touchT = performance.now(); fn(); });
  el.addEventListener('click', () => { if (performance.now() - touchT > 800) fn(); });
}
hudButton($('btn-pause'), () => { if (uiMode === 'game' && !current) pauseGame(); });
$('btn-fs').addEventListener('click', () => toggleFullscreen());
hudButton($('btn-cam'), () => { if (uiMode === 'game' && !current) cycleCamera(); });

// ---------- 流程 ----------
const gameRunning = () => uiMode === 'game' && ['play', 'cut', 'trans', 'clear', 'cont'].indexOf(G.mode) >= 0;
IN.active = () => uiMode === 'game' && !paused && (!current || current === 'cont') && !coopDriver?.lobby.opened;
let paused = false;
function startGame() {
  if(coopDriver?.action('restart'))return;
  A.musicDuck(false);   // 从暂停菜单「重新开始」：先解除暂停时挂起的音频，否则新的一局没有 BGM 和音效
  A.unlock(); A.play('start');
  uiMode = 'game'; paused = false;
  GM.newGame({ lives: settings.lives, dur: settings.dur, demo: settings.demo, hero: settings.hero, area: params.get('area') ? clamp(parseInt(params.get('area'), 10) || 0, 0, AREAS.length - 1) : STAGES[settings.stage].first, ...(coopDriver?.config||{}) });
  camCtl.yawOff = 0; if (G.player) delete G.player.lookHeading;
  show(null);
  last = performance.now(); acc = 0;
  autoProbe.frames = [];
  presentFrame(0, false, true);
}
function pauseGame() {
  if(coopDriver?.action('pause')){IN.clear();return;}
  if (!gameRunning() || paused || G.mode === 'cont') return;
  paused = true; A.musicDuck(true);
  show('pause');
}
function resume() {
  if(coopDriver?.action('resume'))return;
  paused = false; A.musicDuck(false);
  show(null);
  last = performance.now(); acc = 0;
}
function toTitle() {
  coopDriver?.leave();
  uiMode = 'title'; paused = false;
  A.musicDuck(false); A.music(null);
  GM.toTitle();
  titleT = 0;
  show('menu');
}
G.onEnd = (res) => { if(coopDriver?.config)coopDriver.result=res; setTimeout(() => showResult(res), res.win ? 400 : 200); };
const KILL_ROWS = [['ferris', '费里斯 FERRIS'], ['gneiss', '尼斯 GNEISS'], ['punk', '朋克 PUNK'], ['thug', '打手 THUG'], ['blade', '布雷德 BLADE'], ['razor', '雷泽 RAZOR'], ['hammer', '锤子·T HAMMER T.'], ['wrench', '扳手·T WRENCH T.'], ['elmer', '黑埃尔默 BLK ELMER'], ['poacher', '偷猎者 J POACHER J'], ['skinner', '斯金纳 SKINNER'], ['gutter', '格特 GUTTER'], ['lash', '拉什·T LASH T.'], ['raptor', '岩跳龙 R.HOPPER'], ['hack', '三角龙哈克 HACK'], ['shivat', '霸王龙希瓦特 SHIVAT'], ['vice', 'Boss 维斯·T VICE T.'], ['butcher', 'Boss 屠夫 BUTCHER'], ['hogg', 'Boss 霍格 HOGG']];
const STAGE_CN = ['', '第一关', '第二关', '第三关'];
function showResult(res) {
  if (uiMode !== 'game') return;
  A.music(null);
  $('res-title').textContent = res.win ? (res.cleared.length > 1 ? res.cleared.map(n => STAGE_CN[n]).join('、') + '全部通关！' : STAGE_CN[res.stage] + '完成！') : 'GAME OVER';
  let rows = '';
  for (const [k, name] of KILL_ROWS) { const n = res.kills[k] || 0; if (!n) continue; rows += '<tr><td>' + name + '</td><td>× ' + n + '</td><td>' + n * ENEMY[k].points + '</td></tr>'; }
  if (res.vitalityTotal) rows += '<tr><td>体力奖励 VITALITY</td><td>' + res.vitalityTotal + ' × 100</td><td>' + res.vitalityTotal * 100 + '</td></tr>';
  rows += '<tr class="total"><td>总分</td><td></td><td>' + res.score + '</td></tr>';
  $('tally').innerHTML = rows;
  const extra = [];
  extra.push(res.hero.name + ' · 用时 ' + Math.floor(res.seconds / 60) + ' 分 ' + (res.seconds % 60) + ' 秒 · 倒下 ' + res.deaths + ' 次 · 受击 ' + res.hits + ' 次');
  extra.push((res.lives === 'inf' ? '无限命' : '经典 3 命' + (res.conts ? '（续关 ' + res.conts + ' 次）' : '')) + ' · 耐久' + GM.DUR_NAME[res.dur]);
  if (res.demo) extra.push('本局用过演示模式（无敌），不计最高分');
  else if (res.newHi) extra.push('新纪录！最高分 ' + res.hi);
  else extra.push('最高分 ' + res.hi);
  $('res-extra').textContent = extra.join(' · ');
  $('res-like').textContent = res.win ? (res.stage >= 3 ? '霍格也拦不住这辆凯迪拉克！喜欢这趟公路狂飙，也给开发者来个一键三连？' : res.stage === 2 ? '屠夫的砍刀都被你缴了！下一站：地狱公路。' : '维斯被揍趴下了！喜欢这关的话，也给开发者来个一键三连？') : '';
  show('result');
}

// ---------- 全屏 ----------
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
// 全屏入口按浏览器实际能力显示，不按手机/电脑分类隐藏：iPhone Safari 没有元素全屏、未授权全屏的 iframe 报 fullscreenEnabled=false，
// 这些情况隐藏按钮；能请求但被拒绝时由 toggleFullscreen 提示并继续页面内游玩
function fsCapable() {
  const el = document.documentElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return false;
  const enabled = document.fullscreenEnabled !== undefined ? document.fullscreenEnabled : document.webkitFullscreenEnabled;
  return enabled !== false;
}
const fsLog = [];
function toggleFullscreen() {
  if (fsElement()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); return; }
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { fsLog.push('unsupported'); showToast('当前浏览器不支持全屏，已使用页面内横屏布局继续'); return; }
  let p;
  try { p = req.call(el, { navigationUI: 'hide' }); } catch (err) { fsLog.push('throw'); showToast('浏览器未允许全屏，可继续在页面内游玩'); return; }
  Promise.resolve(p).then(() => {
    fsLog.push('ok');
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').then(() => fsLog.push('lock-ok'), () => fsLog.push('lock-rejected'));
  }, () => { fsLog.push('rejected'); showToast('浏览器拒绝了全屏请求，可继续在页面内游玩'); });
}
function onFsChange() { if (!fsElement() && gameRunning() && !current) pauseGame(); refreshOptions(); layout(); }
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// ---------- 布局：填满视口；手机竖屏开始后旋转为横屏 ----------
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);
const display = { rotated: false, W: 0, H: 0, vw: 0, vh: 0, dpr: 1, touchOn: false };
const toLocal = (cx, cy) => display.rotated ? { x: cy, y: display.vw - cx } : { x: cx, y: cy };
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let inputMode = MOBILE_UA || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'touch' : 'key';
const coarsePointer = () => settings.touch === 'show' || settings.touch === 'auto' && inputMode === 'touch';
function setInputMode(mode) { if (settings.touch === 'auto' && mode !== inputMode) { IN.clear(); inputMode = mode; layout(); } }
let lastOrient = null, lastSize = '';
function viewport() {
  // Toy 宿主 iframe 可能先给 0×0：依次回退
  let vw = window.innerWidth, vh = window.innerHeight;
  if (!(vw > 0 && vh > 0)) { vw = document.documentElement.clientWidth; vh = document.documentElement.clientHeight; }
  if (!(vw > 0 && vh > 0) && window.visualViewport) { vw = window.visualViewport.width; vh = window.visualViewport.height; }
  if (!(vw > 0 && vh > 0)) { vw = screen.width || 844; vh = screen.height || 390; }
  return { vw, vh };
}
function layout() {
  const { vw, vh } = viewport(), coarse = settings.touch === 'show' || settings.touch === 'auto' && coarsePointer();
  // 手机触屏竖着拿时，标题菜单也直接旋转成横屏（2026-10-07 用户确认，原先到选人画面才旋转）
  const rotate = vh > vw && coarse;
  const W = rotate ? vh : vw, H = rotate ? vw : vh;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.transform = rotate ? 'translate(' + vw + 'px,0) rotate(90deg)' : 'none';
  stage.classList.toggle('rotated', rotate);
  stage.classList.toggle('compact', H < 520);
  stage.classList.toggle('narrow', W < 760);   // 667×375 一类窄横屏：主菜单上下排列、整层滚动，选项值不被截断
  stage.classList.toggle('portrait', H > W);
  const orient = rotate + ':' + (W > H);
  if (lastOrient !== null && orient !== lastOrient) IN.clear();
  lastOrient = orient;
  const cs = getComputedStyle(probe);
  const sa = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  const loc = rotate ? { l: sa.t, r: sa.b, t: sa.r, b: sa.l } : sa;
  stage.style.setProperty('--sal', loc.l + 'px'); stage.style.setProperty('--sar', loc.r + 'px');
  stage.style.setProperty('--sat', loc.t + 'px'); stage.style.setProperty('--sab', loc.b + 'px');
  const touchOn = settings.touch === 'show' || (settings.touch === 'auto' && coarse);
  document.body.classList.toggle('touch-on', touchOn);
  document.body.classList.toggle('mobile-device', MOBILE_UA || matchMedia('(pointer: coarse)').matches);
  const inGame = uiMode === 'game';
  touch.hidden = !(inGame && touchOn);
  hudTop.hidden = !inGame; hud.hidden = !inGame;
  keyHint.hidden = !(inGame && !touchOn && !CLEAN);
  const dprCap = effQuality === 'high' ? 2 : 1.25;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  camCtl.setAspect(W / Math.max(1, H));
  Object.assign(display, { rotated: rotate, W, H, vw, vh, dpr, touchOn, backing: [canvas.width, canvas.height] });
  lastSize = vw + 'x' + vh;
}
window.addEventListener('resize', () => layout());
window.addEventListener('orientationchange', () => setTimeout(() => layout(), 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => layout());
setInterval(() => { const { vw, vh } = viewport(); if (vw + 'x' + vh !== lastSize) layout(); }, 500);
window.addEventListener('blur', () => { if (gameRunning() && !current) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && gameRunning() && !current) pauseGame(); });
IN.bindTouch($('joy-zone'), $('joy-base'), $('joy-knob'), { atk: $('btn-atk'), jump: $('btn-jump'), run: $('btn-run'), mega: $('btn-mega') }, toLocal);   // 切换视角用右上角 #btn-cam
// 与虫潮一致：所有预设均向右拖、向右看；镜头的水平前向量是 (-sin(yaw), -cos(yaw))。
const pitchControl = createPitchController({turn:d=>camCtl.turnPitch(d)});
const lookControl = createLookController({ firstPerson: () => camCtl.fp(), turn: delta => {
  camCtl.yawOff -= delta;
  if (G.player && G.mode === 'play') G.player.lookHeading = (G.player.lookHeading ?? G.player.face) - delta;
} });
const dragLook = bindDragLook({ element: stage, active: () => uiMode === 'game' && G.mode === 'play' && !G.script && !current && !paused, toLocal, width: () => display.W, pitch: delta => pitchControl.queue(delta), rotate: delta => lookControl.queue(delta) });
IN.onClear(() => { dragLook.clear(); lookControl.clear(); pitchControl.clear(); });

refreshControlModes = addControlModeButtons({ containers: [overlays.menu.querySelector('.items'), overlays.pause.querySelector('.items')], get: () => settings.touch, set: value => { IN.clear(); settings.touch = value; store.set('touch', value); layout(); refreshOptions(); } });

// ---------- HUD ----------
const H_ = { face: $('h-face'), name: $('h-name'), lives: $('h-lives'), score: $('h-score'), hp: $('h-hp'), enemy: $('h-enemy'), eface: $('h-eface'), ename: $('h-ename'), ecn: $('h-ecn'), ehp: $('h-ehp'), ehp2: $('h-ehp2'), timer: $('h-timer'), weapon: $('h-weapon'), wammo: $('h-wammo'), wname: $('h-wname'), go: $('h-go'), dialog: $('dialog'), dface: $('d-face'), dname: $('d-name'), dtext: $('d-text'), fade: $('fade'), hurt: $('hurt') };
const BAR_COLORS = ['#f2c21a', '#b05ae0', '#7ae05a', '#4a8aff', '#ff8ac8'];
const cache = {};
function setText(el, key, v) { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } }
function setStyle(el, key, prop, v) { if (cache[key] !== v) { cache[key] = v; el.style[prop] = v; } }
let lastBanner = null, lastToast = null;
// 开场远景镜头时像原作一样不显示 HUD 与键位提示
const CINE_HIDE = ['hud', 'hud-top', 'keyhint', 'h-timer'].map(id => document.getElementById(id)).filter(Boolean);
function updateHud() {
  const cine = !!G.cineCam;
  if (cache.cine !== cine) { cache.cine = cine; for (const el of CINE_HIDE) el.style.visibility = cine ? 'hidden' : ''; }
  const h = GM.hudState();
  const driving=!!G.road?.mounted;
  if(cache.driving!==driving){
    cache.driving=driving;
    for(const [id,key,walk,drive] of [['btn-atk','J','攻击','撞击'],['btn-jump','K','跳跃','刹车'],['btn-mega','U','必杀','下车'],['btn-run','I','冲刺','加速']]){
      const button=$(id);button.querySelector('span').textContent=driving?drive:walk;button.setAttribute('aria-label',key+' '+(driving?drive:walk));
    }
    const labels=keyHint.querySelectorAll('span');
    ['移动','攻击 / 捡东西','跳跃','必杀（J+K 也行）','冲刺（L / 双击方向也行）'].forEach((text,i)=>{
      if(i>0)labels[i].innerHTML='<kbd>'+['','J','K','U','I'][i]+'</kbd> '+(driving?['','撞击','刹车','下车（联机由房主操作）','加速'][i]:text);
    });
  }
  const hero = HEROES[h.hero];
  if (cache.hero !== hero.id) { cache.hero = hero.id; H_.face.src = FACES[hero.id]; H_.name.textContent = hero.en.split('.')[0]; }
  setText(H_.lives, 'lives', '=' + h.lives);
  setText(H_.score, 'score', String(h.score));
  setStyle(H_.hp, 'hp', 'width', (h.hp / h.maxHp * 100).toFixed(1) + '%');
  hud.classList.toggle('low', h.hp / h.maxHp < 0.25 && h.hp > 0);
  if (h.enemy) {
    H_.enemy.hidden = false;
    if (cache.etype !== h.enemy.type) { cache.etype = h.enemy.type; H_.eface.src = FACES[h.enemy.type] || ''; H_.ename.textContent = h.enemy.name; H_.ecn.textContent = h.enemy.cn; }
    let top = 1, under = 'transparent', col = BAR_COLORS[0];
    if (h.enemy.maxHp > 100) {
      const bars = Math.max(1, Math.ceil(h.enemy.hp / 100));
      top = (h.enemy.hp - (bars - 1) * 100) / 100; col = BAR_COLORS[(bars - 1) % BAR_COLORS.length]; under = bars > 1 ? BAR_COLORS[(bars - 2) % BAR_COLORS.length] : 'transparent';
      if (h.enemy.hp <= 0) top = 0;
    } else top = h.enemy.hp / h.enemy.maxHp;
    setStyle(H_.ehp, 'ehp', 'width', (top * 100).toFixed(1) + '%');
    setStyle(H_.ehp, 'ecol', 'background', col);
    setStyle(H_.ehp2, 'ehp2', 'width', under === 'transparent' ? '0%' : '100%');
    setStyle(H_.ehp2, 'ecol2', 'background', under);
  } else H_.enemy.hidden = true;
  const showTimer = ['play', 'cut'].indexOf(h.mode) >= 0;
  H_.timer.hidden = !showTimer;
  if (showTimer) { setText(H_.timer, 'timer', h.timerUnlimited ? '无限时间' : fmtTime(h.timer)); H_.timer.classList.toggle('big', !h.timerUnlimited && h.timerBig); H_.timer.classList.toggle('warn', !h.timerUnlimited && h.timer < 20); }
  if (h.weapon) { H_.weapon.hidden = false; setText(H_.wammo, 'wammo', h.weapon.ammo > 1 || ['gun', 'shotgun', 'rifle'].includes(h.weapon.kind) ? String(h.weapon.ammo) : ''); setText(H_.wname, 'wname', h.weapon.name); }
  else H_.weapon.hidden = true;
  H_.go.hidden = !h.go;
  // 对话框
  if (G.dialog) {
    H_.dialog.hidden = false;
    const who = G.dialog.who, isP = who === 'player';
    const fkey = isP ? hero.id : who;
    if (cache.dwho !== fkey) { cache.dwho = fkey; H_.dface.src = FACES[fkey] || ''; H_.dname.textContent = isP ? hero.full + ' ' + hero.en : ({ vice: '维斯·特修恩 VICE T.', butcher: '屠夫 BUTCHER' }[who] || who); }
    const n = Math.min(G.dialog.text.length, Math.floor(G.dialog.t * 24) + 1);
    setText(H_.dtext, 'dtext', G.dialog.text.slice(0, n));
  } else H_.dialog.hidden = true;
  setStyle(H_.fade, 'fade', 'opacity', G.fade.toFixed(2));
  const hf = uiMode === 'game' ? (G.hurtFx || 0) : 0;
  setStyle(H_.hurt, 'hurt', 'opacity', hf > 0.01 ? hf.toFixed(2) : '0');
  if (G.banner && G.banner.id !== lastBanner) { lastBanner = G.banner.id; bannerEl.innerHTML = '<b>' + G.banner.text + '</b>' + (G.banner.sub ? '<span>' + G.banner.sub + '</span>' : ''); bannerEl.hidden = false; bannerEl.classList.remove('pop'); void bannerEl.offsetWidth; bannerEl.classList.add('pop'); }
  if (!G.banner && !bannerEl.hidden) { bannerEl.hidden = true; lastBanner = null; }
  if (G.toast && G.toast.id !== lastToast) { lastToast = G.toast.id; showToast(G.toast.text); }
  $('demo-badge').hidden = !(uiMode === 'game' && G.settings.demo);
  // 续关画面
  if (G.mode === 'cont' && G.cont) {
    if (current !== 'cont') { $('cont-face').src = FACES.viceGun; show('cont'); }
    setText($('cont-n'), 'contn', String(Math.max(0, G.cont.count)));
    overlays.cont.dataset.shot = G.flash > 0.3 ? '1' : '0';
  } else if (current === 'cont') show(null);
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, titleT = 0, realT = 0, fpsT = 0;
const fpsWin = [];
const perf = { on: false, frames: [], work: [], info: [] };
let manual = false;
function frame(now) {
  if (manual) { last = now; requestAnimationFrame(frame); return; }
  const dtReal = Math.min(0.1, (now - last) / 1000);
  if (perf.on) perf.frames.push(now - last);
  last = now; realT += dtReal;
  const t0 = performance.now();
  if (uiMode === 'game' && !paused && (!current || current === 'cont')) {
    if (IN.take('pause') && G.mode !== 'cont' && !G.script) pauseGame();
    else {
      if (IN.take('camera')) cycleCamera();
      acc += dtReal;
      let n = 0;
      while (acc >= STEP && n < 6) { if(!coopDriver?.config||coopDriver.connection.host)GM.update(); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      if (autoProbe.on && !autoProbe.done && G.mode === 'play') {
        autoProbe.frames.push(dtReal * 1000);
        if (autoProbe.frames.length > 200) {
          const s = autoProbe.frames.slice(20).sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
          autoProbe.done = true; autoProbe.decided = { median: +med.toFixed(1), quality: med > 26 ? 'low' : 'high' };
          if (med > 26 && effQuality !== 'low') { effQuality = 'low'; applyQuality(); showToast('帧率偏低，已自动切换到流畅画质'); }
        }
      }
    }
  }
  presentFrame(dtReal, true);
  if (settings.fps) {
    fpsWin.push(dtReal * 1000);
    if (realT - fpsT > 0.5) {
      fpsT = realT;
      const arr = fpsWin.splice(0), mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length), worst = Math.max.apply(null, arr);
      const ri = renderer.info.render;
      fpsEl.textContent = (1000 / mean).toFixed(0) + ' FPS · ' + mean.toFixed(1) + 'ms · 最慢 ' + worst.toFixed(0) + 'ms · ' + canvas.width + '×' + canvas.height + ' · ' + (effQuality === 'high' ? '高' : '流畅') + ' · ' + ri.calls + ' 次绘制';
    }
  }
  if (perf.on) { perf.work.push(performance.now() - t0); if (perf.frames.length % 30 === 0) perf.info.push({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }); }
  requestAnimationFrame(frame);
}

function presentFrame(dtReal, draw, instant) {
  const playing = uiMode === 'game' && !paused && (!current || current === 'cont');
  if (uiMode === 'game') {
    const p = G.player;
    if (playing && G.mode === 'play' && !G.script) {
      lookControl.step(dtReal, (IN.down('rotR') ? 1 : 0) - (IN.down('rotL') ? 1 : 0));
      pitchControl.step(dtReal);
      if (IN.look.dx) { lookControl.queue(IN.look.dx * .005); IN.look.dx = 0; }
      if (!camCtl.fp() && ['walk','run','carry'].includes(p.state)) delete p.lookHeading;
      if (p.lookHeading !== undefined && p.state !== 'dead') p.face += Math.max(-dtReal*2.1,Math.min(dtReal*2.1,Math.atan2(Math.sin(p.lookHeading-p.face),Math.cos(p.lookHeading-p.face))));
    } else IN.look.dx = 0;
    const fpOff = camCtl.fp() && (['cut', 'trans', 'clear', 'over', 'cont'].indexOf(G.mode) >= 0 || ['down', 'dead', 'respawn', 'victory', 'door'].indexOf(p.state) >= 0);
    G.fpActive = camCtl.fp() && !fpOff;
    const AR = world.area().def;
    const cz1 = AR.camZ1 === undefined ? AR.z1 : AR.camZ1;   // 取景按这一排算；第二关可走范围比它更靠前（见 level.js camZ1）
    const zc = (AR.z0 + cz1) / 2 * 0.6 + p.z * 0.25;
    const fitDepth = cz1 - ((AR.z0 + cz1) / 2 * 0.6 + AR.z0 * 0.25);   // 主角站最里排时，观察点到最前一排的纵深
    camCtl.update(dtReal, { override: G.cineCam || undefined, focusX: p.lookHeading === undefined ? G.focusX : p.x, zc: p.lookHeading === undefined ? zc : p.z, fitDepth, tyOff: AR.camTy || 0, blocks: world.area().camBoxes, player: { x: p.x, y: p.y, z: p.z, ground: 0, eye: G.road?.mounted ? 1.65 : p.y + p.model.H * 0.92 - (p.state === 'pickup' ? 0.5 : 0) - GM.sinkK(p.x) * GM.SINK }, shake: fx.shake * 0.8, instant, fpOff });
    world.followLight(camCtl.preset().follow ? p.x : G.focusX, 0);
    updateHud();
  } else {
    titleT += dtReal;
    G.fpActive = false;
    // 标题：镜头缓慢摆动，四位主角落在菜单右侧的空位里
    // 按菜单面板实际占据的宽度算镜头距离与偏移，让四位主角落在右侧空位
    const wide = display.W > display.H * 1.2 && !stage.classList.contains('compact');
    const aspect = display.W / Math.max(1, display.H), tanH = Math.tan(21 * Math.PI / 180) * aspect;
    const panelR = wide ? Math.min(display.W, 920) : 0;
    const fs = wide ? Math.max(-0.3, (panelR - display.W / 2) / (display.W / 2)) : -1;
    const R = wide ? clamp(4.6 / ((1 - fs) * tanH), 8.6, 14) : 8.6;
    const sh = wide ? (fs + 1) / 2 * R * tanH : 0;
    const a = Math.sin(titleT * 0.11) * 0.4 - 0.1, cx = 7.5, cz = 0.6;
    const pos = { x: cx + Math.sin(a) * R, y: 2.2 + Math.sin(titleT * 0.2) * 0.25 + (R - 9) * 0.12, z: cz + Math.cos(a) * R };
    const tgt = { x: cx - Math.cos(a) * sh, y: 1.25, z: cz + Math.sin(a) * sh };
    camCtl.update(dtReal, { override: { pos, tgt, fov: 42 }, player: { x: cx, y: 0, z: cz, ground: 0, eye: 1.6 } });
    world.followLight(cx, cz);
  }
  world.update(realT, dtReal, camCtl.cam, uiMode === 'game' && G.player ? { x: G.player.x, y: G.player.y, z: G.player.z } : null);
  fx.update(paused || (current && current !== 'cont') ? 0 : dtReal * (G.timeScale || 1));
  GM.render(paused || (current && current !== 'cont') ? 0 : dtReal * (G.timeScale || 1), realT);
  coopDriver?.tick(performance.now());
  if (draw) renderer.render(scene, camCtl.cam);
}

// ---------- 启动 ----------
fpsEl.hidden = !settings.fps;
layout();
applyQuality();
refreshOptions();
fx.warm();
try { renderer.compile(scene, camCtl.cam); } catch (e) { /* 旧浏览器跳过 */ }
// 预编译「淡化」用的透明着色器变体（第一人称贴身淡化、墙面渐隐、户外遮挡淡化）：否则第一次触发时现编，卡一帧约 55 ms。
// 角色材质各自独立但参数相同，共用这里留住的卡通透明程序（warmToon 不释放）
const warmToon = toonMat();
try {
  const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01), mats = world.fadeMats().concat([warmToon]), tmp = [];
  for (const m of mats) { m.transparent = true; m.needsUpdate = true; const o = new THREE.Mesh(geo, m); scene.add(o); tmp.push(o); }
  renderer.compile(scene, camCtl.cam);
  for (const o of tmp) scene.remove(o);
  for (const m of mats) { m.transparent = false; m.needsUpdate = true; }
} catch (e) { /* 旧浏览器跳过 */ }
show('menu');
$('loading').hidden = true;
requestAnimationFrame((t) => { last = t; frame(t); });

// ---------- 自动化测试钩子（仅 ?test=1） ----------
if (TEST) {
  let rec = null, chunks = [];
  window.__CD_TEST__ = {
    subjectHeading: () => G.player?.model.root.rotation.y,
    project: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camCtl.cam); return [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4)]; },   // 世界点 → 画面比例坐标（0..1，左上为原点）
    areaDef: () => Object.assign({}, AREAS[G.area], { props: undefined, waves: undefined }),
    version: VERSION, seed, HEROES,
    snapshot() {
      const s = GM.snapshot();
      s.ui = { uiMode, overlay: current, paused, display: Object.assign({}, display), touchHidden: touch.hidden, fs: !!fsElement(), fsCapable: fsCapable(), fsLog: fsLog.slice(), audio: A.state(), music: A.musicState(), camera: camCtl.preset().id, yawOff: +camCtl.yawOff.toFixed(3), fpActive: !!G.fpActive, quality: { setting: settings.quality, effective: effQuality, auto: autoProbe.decided }, focus: document.activeElement && (document.activeElement.getAttribute('data-act') || document.activeElement.getAttribute('data-opt') || document.activeElement.getAttribute('data-hero') || document.activeElement.id), toast: toastEl.hidden ? null : toastEl.textContent, banner: bannerEl.hidden ? null : bannerEl.textContent, hero: settings.hero, settings: Object.assign({}, settings) };
      s.input = IN.debug();
      s.cam = { pos: camCtl.cam.position.toArray().map(v => +v.toFixed(2)), axes: camCtl.axes(), av: { s: +camCtl.av.s.toFixed(3), lift: +camCtl.av.lift.toFixed(3), blocked: camCtl.av.blocked } };
      s.hud = { hp: H_.hp.style.width, timer: H_.timer.hidden ? null : H_.timer.textContent, enemy: H_.enemy.hidden ? null : H_.ename.textContent, weapon: H_.weapon.hidden ? null : H_.wname.textContent, go: !H_.go.hidden, dialog: H_.dialog.hidden ? null : H_.dtext.textContent };
      return s;
    },
    events: () => G.events.slice(),
    cheat: GM._test,
    fx: () => fx.stats(),
    renderInfo: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, gl: (() => { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() }),
    perfStart() { perf.frames = []; perf.work = []; perf.info = []; perf.on = true; },
    perfStop() { perf.on = false; return { frames: perf.frames.slice(1), work: perf.work.slice(1), info: perf.info.slice() }; },
    setQuality(q) { settings.quality = q; effQuality = q === 'low' ? 'low' : 'high'; autoProbe = { on: q === 'auto', frames: [], done: false, decided: null }; applyQuality(); refreshOptions(); },
    setCamera(i, yaw) { camCtl.setIndex(i); camCtl.yawOff = yaw || 0; refreshOptions(); },
    startCapture(fps) {
      const stream = canvas.captureStream(fps || 60);
      const as = A.captureStream();
      if (as) as.getAudioTracks().forEach(t => stream.addTrack(t));
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m))[0];
      chunks = [];
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 9000000, audioBitsPerSecond: 160000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(500);
      return { mime, audioTracks: as ? as.getAudioTracks().length : 0 };
    },
    stopCapture() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: rec.mimeType });
          const fr = new FileReader();
          fr.onload = () => { const r = String(fr.result); resolve(r.slice(r.indexOf('base64,') + 7)); };
          fr.readAsDataURL(blob);
        };
        rec.stop();
      });
    },
    toLocal, faces: () => Object.assign({}, FACES),
    audioLogStart: () => A.logStart(), audioLogStop: () => A.logStop(), audioOffline: (ev, dur) => A.renderOffline(ev, dur),
    _scene: scene, _renderer: renderer, _cam: camCtl,
    manual(on) { manual = !!on; last = performance.now(); acc = 0; },
    step(n, draw) {
      for (let k = 0; k < n; k++) {
        if (uiMode === 'game' && !paused && (!current || current === 'cont')) {
          if (IN.take('pause') && G.mode !== 'cont' && !G.script) { pauseGame(); break; }
          if (IN.take('camera')) cycleCamera();
          GM.update();
        }
        realT += STEP;
        if (k % 2 === 1 || k === n - 1) presentFrame(STEP * (k === n - 1 ? 1 : 2), false);
      }
      if (draw !== false) renderer.render(scene, camCtl.cam);
      const P = G.player;
      return { mode: G.mode, t: +G.t.toFixed(2), overlay: current, x: P ? +P.x.toFixed(2) : 0, z: P ? +P.z.toFixed(2) : 0, state: P ? P.state : null, hp: P ? P.hp : 0 };
    }
  };
}

installRemakeUI();

coopDriver=installRemakeCoop({
 game:'cadillacs',container:stage,menu:overlays.menu.querySelector('.items'),getConfig:()=>({...settings,stage:settings.stage+1,area:STAGES[settings.stage].first}),notify:showToast,
 onStart:config=>{settings.demo=false;startGame();GM.setCoopInput(slot=>coopDriver.connection.control(slot,slot===0?null:coopDriver.connection.input(slot),()=>GM.computerInput(slot)));},
 onJoin:m=>{if(coopDriver.connection.host)GM.joinCoopSlot(m.slot,m.hero);},
 getInput:()=>GM.coopInput(),getState:()=>({...GM.coopSnapshot(),sounds:coopSounds.snapshot()}),getUI:()=>({paused,current}),
 onState:state=>{
  GM.coopApply(state.game);coopSounds.apply(state.game.sounds);
  if(paused!==state.ui.paused){paused=state.ui.paused;A.musicDuck(paused);}
  if(state.ui.result&&!coopDriver.result){coopDriver.result=state.ui.result;showResult(state.ui.result);}
  else if(!state.ui.result&&current!==state.ui.current){coopDriver.result=null;show(state.ui.current);}
 },
 onAction:kind=>{if(kind==='pause')pauseGame();else if(kind==='resume')resume();else if(kind==='restart'||kind==='retry'){coopDriver.result=null;startGame();}},
 onEnd:m=>{if(m.type==='player_left')GM.leaveCoopSlot(m.slot);else if(m.type==='ended'){uiMode='title';paused=false;A.musicDuck(false);GM.toTitle();show('menu');}},
});
refreshOptions();
