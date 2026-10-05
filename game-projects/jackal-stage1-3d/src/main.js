import { bindDragLook, addControlModeButtons } from '../../../public/js/game/drag-look.js';
// 入口：渲染器、布局（竖屏自动旋转）、菜单导航、HUD、全屏、画质、主循环与测试钩子
import * as THREE from 'three';
import { VERSION, STEP, TEST, CLEAN, store, seed, params } from './core.js';
import * as L from './level.js';
import A from './audio.js';
import IN from './input.js';
import { buildWorld } from './world.js';
import { createFx } from './fx.js';
import { createCamera, PRESETS } from './camera.js';
import * as GM from './game.js';

const G = GM.G;
const $ = (id) => document.getElementById(id);
const app = $('app'), stage = $('stage'), canvas = $('screen');
const overlays = { menu: $('menu'), pause: $('pause'), result: $('result') };
const hud = $('hud'), hudTop = $('hud-top'), touch = $('touch'), toastEl = $('toast'), bannerEl = $('banner'), keyHint = $('keyhint'), bossBar = $('boss-bar');
const listUrl = app.getAttribute('data-list-url') || '../index.html';
const fpsEl = $('fps'), crosshairEl = $('crosshair');
document.querySelectorAll('.list-link').forEach(a => { a.href = listUrl; });

// ---------- 设置 ----------
const settings = {
  lives: store.get('lives', 'inf') === 'classic' ? 'classic' : 'inf',
  armor: store.get('armor', 'std') === 'classic' ? 'classic' : 'std',
  demo: false,
  quality: ['auto', 'high', 'low'].indexOf(store.get('quality', 'auto')) >= 0 ? store.get('quality', 'auto') : 'auto',
  touch: ['auto', 'show', 'hide'].indexOf(store.get('touch', 'auto')) >= 0 ? store.get('touch', 'auto') : 'auto',
  fps: store.get('fps', false) === true,
  gun: store.get('gun', 'follow') === 'up' ? 'up' : 'follow',
  stage: 1
};
const unlocked = () => Math.max(1, Math.min(L.STAGE_COUNT, store.get('unlocked', 1) | 0));
settings.stage = Math.max(1, Math.min(unlocked(), store.get('stage', 1) | 0));
if (params.get('stage')) settings.stage = Math.max(1, Math.min(L.STAGE_COUNT, parseInt(params.get('stage'), 10) || 1));   // 测试用：直接从某关开始
if (params.get('q') === 'low' || params.get('q') === 'high') settings.quality = params.get('q');   // 测试/录制用：强制画质
let effQuality = settings.quality === 'low' ? 'low' : 'high';
let autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };
let uiMode = 'title';
let current = 'menu';

// ---------- 渲染器与场景 ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: effQuality === 'high', powerPreference: 'high-performance' });
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
const world = buildWorld(scene);
const fx = createFx(scene);
GM.init(scene, world, fx, camCtl);
A.setClock(() => G.t);
L.loadStage(settings.stage); world.rebuild();
GM.toTitle();

function applyQuality() {
  const high = effQuality === 'high';
  renderer.shadowMap.enabled = high;
  world.sun.castShadow = high;
  scene.traverse(o => { if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true; });
  layout(true);
}

// ---------- 选项 ----------
function optLabel(name) {
  switch (name) {
    case 'lives': return ['命数', settings.lives === 'inf' ? '无限命' : '经典 3 命', false];
    case 'armor': return ['耐久', settings.armor === 'classic' ? '经典一发' : '标准 3 格', false];
    case 'demo': return ['演示模式（无敌）', settings.demo ? '开' : '关', settings.demo];
    case 'quality': return ['画质', { auto: '自动（按实测帧率）', high: '高', low: '流畅' }[settings.quality] + (settings.quality === 'auto' ? ' · 当前' + (effQuality === 'high' ? '高' : '流畅') : ''), false];
    case 'volume': return ['音量', A.volume === 0 ? '静音' : Math.round(A.volume * 100) + '%', false];
    case 'touch': return ['操作模式', { auto: '自动识别', show: '手机触屏', hide: '电脑键鼠' }[settings.touch], false];
    case 'camera': return [display.touchOn ? '切换视角' : '切换视角（C）', camCtl.preset().name, false];
    case 'fps': return ['帧率显示', settings.fps ? '开' : '关', false];
    case 'gun': return ['机枪方向', settings.gun === 'up' ? '原作朝上' : '跟随车头', false];
    case 'stage': return ['起始关卡', GM.STAGE_NAME[settings.stage], false];
  }
  return [name, '', false];
}
function refreshOptions() {
  document.querySelectorAll('[data-control-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.controlMode === settings.touch)));
  document.querySelectorAll('[data-opt]').forEach(b => {
    const l = optLabel(b.getAttribute('data-opt'));
    b.innerHTML = '<span>' + l[0] + '</span><span class="val' + (l[2] ? ' warn' : '') + '">◂ ' + l[1] + ' ▸</span>';
  });
  $('hi-val').textContent = G.hi;
  const fsOn = !!fsElement();
  document.querySelectorAll('.fs-btn').forEach(b => { b.textContent = fsOn ? '退出全屏' : '全屏'; });
  document.querySelectorAll('.fs-label').forEach(b => { b.textContent = fsOn ? '退出' : '全屏'; });
  $('demo-badge').hidden = !(uiMode === 'game' && settings.demo);
  $('cam-label').textContent = camCtl.preset().name;
  if (uiMode === 'title' && L.STAGE) $('menu-sub').textContent = GM.STAGE_NAME[L.STAGE_NO] + ' · ' + L.STAGE.title;
}
function adjust(name, delta) {
  if (name === 'lives') { settings.lives = settings.lives === 'inf' ? 'classic' : 'inf'; store.set('lives', settings.lives); }
  else if (name === 'armor') { settings.armor = settings.armor === 'classic' ? 'std' : 'classic'; store.set('armor', settings.armor); }
  else if (name === 'demo') {
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
    layout(true);
  } else if (name === 'camera') { cycleCamera(); }
  else if (name === 'fps') { settings.fps = !settings.fps; store.set('fps', settings.fps); fpsEl.hidden = !settings.fps; }
  else if (name === 'gun') {
    settings.gun = settings.gun === 'up' ? 'follow' : 'up'; store.set('gun', settings.gun);
    if (uiMode === 'game') G.settings.gun = settings.gun;
  } else if (name === 'stage') {
    const n = unlocked();
    settings.stage = ((settings.stage - 1 + (delta < 0 ? n - 1 : 1)) % n) + 1; store.set('stage', settings.stage);
    if (uiMode === 'title' && L.STAGE_NO !== settings.stage) { GM.toTitle(settings.stage); titleT = 0; }
  }
  refreshOptions();
}
function cycleCamera() {
  IN.clear();
  const p = camCtl.cycle();
  showToast('视角：' + p.name);
  updateFog();
  const pl = GM.player();
  if (pl) camCtl.update(0, pl.x, pl.y, { instant: true, lock: GM.bossLock(), heading: pl.ang, fpOK: pl.alive && GM.mode() === 'play' });
  refreshOptions();
}
function updateFog() {
  const p = camCtl.preset();
  scene.fog.near = p.dist * 1.25; scene.fog.far = p.dist * 3.6;
}
updateFog();

// ---------- 覆盖层与菜单导航 ----------
function show(name) {
  Object.keys(overlays).forEach(k => { overlays[k].hidden = k !== name; });
  current = name;
  IN.clear();
  refreshOptions();
  if (name) { const first = Array.prototype.find.call(overlays[name].querySelectorAll('.items > button, .items > a, .control-modes > button'), el => !el.hidden); if (first) first.focus({ preventScroll: true }); }
  else { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); app.focus({ preventScroll: true }); }
  layout(true);
}
const items = () => current ? Array.prototype.slice.call(overlays[current].querySelectorAll('.items > button, .items > a, .control-modes > button')).filter(el => !el.hidden) : [];
document.addEventListener('keydown', (e) => {
  A.unlock();
  setInputMode('key');
  if (!current) {
    if (e.code === 'KeyF' && uiMode === 'game' && !e.repeat) { toggleFullscreen(); e.preventDefault(); }
    return;
  }
  const list = items(), i = list.indexOf(document.activeElement), el = list[i];
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
      break;
    case 'KeyF':
      if (!e.repeat) { toggleFullscreen(); e.preventDefault(); }
      break;
    case 'KeyC':
      if (!e.repeat) { cycleCamera(); e.preventDefault(); }
      break;
  }
});
document.addEventListener('pointerdown', (e) => { A.unlock(); if (e.pointerType === 'touch') setInputMode('touch'); }, { capture: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-opt]');
  if (!t) return;
  if (t.hasAttribute('data-opt')) { adjust(t.getAttribute('data-opt'), 1); return; }
  switch (t.getAttribute('data-act')) {
    case 'start': startGame(); break;
    case 'restart': startGame(current === 'pause' ? G.stage : +(t.getAttribute('data-stage') || settings.stage)); break;
    case 'next': nextStage(); break;
    case 'resume': resume(); break;
    case 'title': toTitle(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'list': A.engine('off'); A.music(null); break;
  }
});
function bindTopButton(id, action) {
  const el = $(id);
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { e.preventDefault(); action(); }
  });
  el.addEventListener('click', e => { if (e.pointerType !== 'touch') action(); });
}
bindTopButton('btn-pause', () => { if (uiMode === 'game' && !current) pauseGame(); });
$('btn-fs').addEventListener('click', () => toggleFullscreen());
bindTopButton('btn-cam', () => { if (uiMode === 'game' && !current) cycleCamera(); });

// ---------- 流程 ----------
const gameRunning = () => uiMode === 'game' && ['intro', 'play', 'over', 'clear'].indexOf(G.mode) >= 0;
IN.active = () => gameRunning() && !current && !paused;
let paused = false;
function startGame(stageNo) {
  A.unlock();
  uiMode = 'game'; paused = false;
  GM.newGame({ lives: settings.lives, demo: settings.demo, armor: settings.armor, gun: settings.gun, stage: stageNo || settings.stage });
  show(null);
  camCtl.update(0, GM.player().x, GM.player().y, { instant: true });
  if (!touch.hidden && !dragHintShown) { dragHintShown = true; showToast('拖动画面空白处转视角；右上角切换视角'); }
  last = performance.now(); acc = 0;
  autoProbe.frames = [];
}
function nextStage() {
  A.unlock();
  uiMode = 'game'; paused = false;
  if (!GM.nextStage()) return toTitle();
  show(null);
  camCtl.update(0, GM.player().x, GM.player().y, { instant: true });
  last = performance.now(); acc = 0;
}
function pauseGame() {
  if (!gameRunning() || paused) return;
  paused = true; A.engine('off'); A.pause(); A.musicDuck(true);
  show('pause');
}
function resume() {
  paused = false; A.musicDuck(false);
  show(null);
  last = performance.now(); acc = 0;
}
function toTitle() {
  uiMode = 'title'; paused = false;
  A.musicDuck(false);
  GM.toTitle(settings.stage);
  titleT = 0;
  show('menu');
}
G.onEnd = (res) => { setTimeout(() => showResult(res), 300); };
const KILL_ROWS = [['soldier', '步兵'], ['officer', '军官'], ['mg', '机枪巢'], ['turret', '炮塔'], ['cannon', '炮台'], ['boat', '炮艇'], ['tank', '坦克'], ['brownTank', '棕色坦克'], ['bulltank', '重型坦克'],
  ['ejeep', '敌方吉普'], ['bomber', '轰炸机'], ['wstatue', '水中石像'], ['fallpillar', '倒塌石柱'], ['boss', 'Boss 蓝色坦克'], ['bust', 'Boss 石像'], ['hut', '营房']];
const BOSS_KEY = { tanks: 'boss', statues: 'bust' };
function showResult(res) {
  if (uiMode !== 'game') return;
  $('res-title').textContent = res.win ? GM.STAGE_NAME[res.stage] + '完成！' : '任务失败 · ' + GM.STAGE_NAME[res.stage];
  let rows = '';
  const bossKey = BOSS_KEY[L.BOSS.type];
  for (const [k, name] of KILL_ROWS) { const n = res.kills[k] || 0; if (!n && k !== bossKey) continue; rows += '<tr><td>' + name + '</td><td>× ' + n + '</td><td>' + n * GM.POINTS[k] + '</td></tr>'; }
  rows += '<tr><td>送达俘虏</td><td>' + res.delivered + ' / ' + res.total + '</td><td>' + res.delivered * GM.POINTS.pow + '</td></tr>';
  if (res.win) rows += '<tr><td>救援奖励</td><td>' + res.delivered + ' × ' + GM.POINTS.powBonus + '</td><td>' + res.powBonus + '</td></tr>';
  rows += '<tr class="total"><td>总分</td><td></td><td>' + res.score + '</td></tr>';
  $('tally').innerHTML = rows;
  const extra = [];
  extra.push('本关用时 ' + Math.floor(res.seconds / 60) + ' 分 ' + (res.seconds % 60) + ' 秒 · 阵亡 ' + res.deaths + ' 次');
  if (res.finalStage) extra.push('已打通目前全部 ' + res.stageCount + ' 关，后续关卡制作中');
  extra.push((res.lives === 'inf' ? '无限命' : '经典 3 命') + ' · ' + (res.armor === 'classic' ? '经典一发' : '标准 3 格护甲'));
  if (res.armor !== 'classic') extra.push('受击 ' + res.hits + ' 次 · 修理包 ' + res.kitsPicked + ' 个');
  if (res.demo) extra.push('本局用过演示模式（无敌），不计最高分');
  else if (res.newHi) extra.push('新纪录！最高分 ' + res.hi);
  else extra.push('最高分 ' + res.hi);
  $('res-extra').textContent = extra.join(' · ');
  // 过关：主按钮「进入下一关」；失败：重来本关；打通最后一关：从第一关再玩
  const nb = $('res-next'), rb = $('res-restart');
  nb.hidden = !res.hasNext;
  if (res.hasNext) nb.innerHTML = '进入' + GM.STAGE_NAME[res.stage + 1] + ' <kbd>Enter</kbd>';
  rb.setAttribute('data-stage', res.finalStage ? 1 : res.stage);
  rb.innerHTML = (res.finalStage ? '从第一关再玩一次' : res.win ? '重玩' + GM.STAGE_NAME[res.stage] : '重新开始' + GM.STAGE_NAME[res.stage]) + (res.hasNext ? '' : ' <kbd>Enter</kbd>');
  rb.classList.toggle('primary', !res.hasNext);
  show('result');
}

// ---------- 全屏 ----------
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
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
function onFsChange() { if (!fsElement() && gameRunning() && !current) pauseGame(); refreshOptions(); layout(true); }
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

// ---------- 布局：填满视口；手机竖屏开始后旋转为横屏 ----------
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);
const display = { rotated: false, W: 0, H: 0, vw: 0, vh: 0, dpr: 1, touchOn: false };
const toLocal = (cx, cy) => display.rotated ? { x: cy, y: display.vw - cx } : { x: cx, y: cy };
// 触屏还是键盘：开局看手机 UA 或主指针（手机/平板是 coarse），之后跟随玩家实际用的输入——真摸屏幕切触屏按键，按键盘切回键位提示。
// 不按触点数猜：部分 Windows 电脑报 10 个触点、any-pointer 也是 coarse，但主指针是鼠标，按它判断会把电脑当手机
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let inputMode = MOBILE_UA || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'touch' : 'key';
const coarsePointer = () => settings.touch === 'show' || settings.touch === 'auto' && inputMode === 'touch';
function setInputMode(mode) { if (settings.touch === 'auto' && mode !== inputMode) { IN.clear(); inputMode = mode; layout(); } }
let lastOrient = null;
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight, coarse = settings.touch === 'show' || settings.touch === 'auto' && coarsePointer();
  if (display.vw && (vw !== display.vw || vh !== display.vh)) IN.clear();
  const rotate = uiMode === 'game' && vh > vw && coarse;
  const W = rotate ? vh : vw, H = rotate ? vw : vh;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.transform = rotate ? 'translate(' + vw + 'px,0) rotate(90deg)' : 'none';
  stage.classList.toggle('rotated', rotate);
  stage.classList.toggle('compact', H < 520);
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
}
window.addEventListener('resize', () => layout());
window.addEventListener('orientationchange', () => setTimeout(() => layout(), 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => layout());
window.addEventListener('blur', () => { if (gameRunning() && !current) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && gameRunning() && !current) pauseGame(); });
IN.bindTouch($('joy-zone'), $('joy-base'), $('joy-knob'), { fire: $('btn-fire'), bomb: $('btn-bomb') }, toLocal);

const orbitKeys = new Set();
window.addEventListener('keydown', e => { if (IN.active() && ['KeyQ','KeyE'].includes(e.code)) { orbitKeys.add(e.code); e.preventDefault(); } });
window.addEventListener('keyup', e => orbitKeys.delete(e.code));
IN.onClear(() => orbitKeys.clear());
let dragHintShown = false;
const dragLook = bindDragLook({ element: stage, active: () => uiMode === 'game' && !current && !paused, toLocal, width: () => display.W, rotate: delta => camCtl.queueLook(delta) });
IN.onClear(() => { dragLook.clear(); camCtl.clearLook(); });
stage.addEventListener('pointercancel', () => camCtl.clearLook());
function updateStep() {
  camCtl.stepLook(STEP, (orbitKeys.has('KeyE') ? 1 : 0) - (orbitKeys.has('KeyQ') ? 1 : 0));
  GM.update();
}

addControlModeButtons({ containers: [overlays.menu.querySelector('.items'), overlays.pause.querySelector('.items')], get: () => settings.touch, set: value => { IN.clear(); settings.touch = value; store.set('touch', value); layout(); refreshOptions(); } });

// ---------- HUD ----------
const hudEls = { score: $('h-score'), hi: $('h-hi'), wpn: $('h-wpn'), wlv: $('h-wlv'), carried: $('h-carried'), deliv: $('h-deliv'), lives: $('h-lives'), armor: $('h-armor'), armorCard: $('hc-armor'), bombLabel: $('bomb-label') };
const hurtEl = $('hurt');
let lastHitId = '', lastArmor = '';
let lastHud = '';
let lastBanner = null, lastToast = null;
function updateHud() {
  const s = [G.score, G.hi, G.weapon, G.carried, G.delivered, G.settings.lives === 'inf' ? '∞' : Math.max(0, G.lives), G.stage].join('|');
  if (s !== lastHud) {
    lastHud = s;
    hudEls.score.textContent = G.score; hudEls.hi.textContent = Math.max(G.hi, G.score);
    hudEls.wpn.textContent = GM.WEAPON_NAME[G.weapon]; hudEls.wlv.textContent = 'Lv' + G.weapon;
    hudEls.wlv.className = 'lv lv' + G.weapon;
    hudEls.carried.textContent = G.carried; hudEls.deliv.textContent = G.delivered + '/' + L.POW_TOTAL;
    hudEls.lives.textContent = G.settings.lives === 'inf' ? '∞' : '×' + Math.max(0, G.lives);
    hudEls.bombLabel.textContent = GM.WEAPON_NAME[G.weapon];
    $('h-stage').textContent = GM.STAGE_NAME[G.stage];
  }
  const pl = GM.player();
  const arm = pl ? pl.armor : G.armorMax;
  const ak = arm + '/' + G.armorMax;
  if (ak !== lastArmor) {
    lastArmor = ak;
    let h = '';
    for (let k = 1; k <= G.armorMax; k++) h += '<i class="' + (k <= arm ? 'on' : 'off') + '"></i>';
    hudEls.armor.innerHTML = h;
    hudEls.armorCard.classList.toggle('low', G.armorMax > 1 && arm === 1);
    hudEls.armorCard.classList.toggle('classic', G.armorMax === 1);
  }
  // 受击红边：按游戏时间衰减（手动时钟录制时也能对上画面）
  const hf = uiMode === 'game' ? (G.hurtFx || 0) : 0;
  const hs = hf > 0 ? hf.toFixed(2) : '0';
  if (hs !== lastHitId) { lastHitId = hs; hurtEl.style.opacity = hs; }
  if (G.banner && G.banner.id !== lastBanner) { lastBanner = G.banner.id; bannerEl.innerHTML = '<b>' + G.banner.text + '</b>' + (G.banner.sub ? '<span>' + G.banner.sub + '</span>' : ''); bannerEl.hidden = false; bannerEl.classList.remove('pop'); void bannerEl.offsetWidth; bannerEl.classList.add('pop'); }
  if (!G.banner && !bannerEl.hidden) { bannerEl.hidden = true; lastBanner = null; }
  if (G.toast && G.toast.id !== lastToast) { lastToast = G.toast.id; showToast(G.toast.text); }
  const b = G.boss;
  const bossOn = b && (b.state === 'fight' || b.state === 'intro');
  bossBar.hidden = !bossOn;
  if (bossOn) {
    const pips = GM.bossPips().map(v => '<i class="' + v + '"></i>');
    bossBar.dataset.type = b.type || '';
    const html = '<b>BOSS</b>' + pips.join('');
    if (bossBar.innerHTML !== html) bossBar.innerHTML = html;
  }
  $('demo-badge').hidden = !(uiMode === 'game' && G.settings.demo);
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, titleT = 0, realT = 0, fpsT = 0;
const fpsWin = [];
const perf = { on: false, frames: [], work: [], info: [] };
let manual = false;   // 测试：手动时钟（离线逐帧录制 / 快速模拟）
function frame(now) {
  if (manual) { last = now; requestAnimationFrame(frame); return; }
  const dtReal = Math.min(0.1, (now - last) / 1000);
  if (perf.on) perf.frames.push(now - last);
  last = now; realT += dtReal;
  const t0 = performance.now();
  if (uiMode === 'game' && !paused && !current) {
    if (IN.take('pause')) pauseGame();
    else {
      if (IN.take('camera')) cycleCamera();
      acc += dtReal;
      let n = 0;
      while (acc >= STEP && n < 6) { updateStep(); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      // 自动画质：开局 3 秒后按实测帧间隔决定
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

function presentFrame(dtReal, draw) {
  if (uiMode === 'game') {
    const p = GM.player();
    // 第一人称下相机在眼睛位置，同等震动体感更强，乘 0.3 抑制
    camCtl.update(dtReal, p.x, p.y, { lock: GM.bossLock(), shake: fx.shake * (camCtl.fpNow ? 0.36 : 1.2), heading: p.ang, fpOK: p.alive && GM.mode() === 'play' });
    crosshairEl.hidden = !camCtl.fpNow;
    updateHud();
  } else {
    titleT += dtReal;
    crosshairEl.hidden = true;
    const y = 18 + (titleT * 2.2) % 120;
    camCtl.update(dtReal, 0, 0, { free: { x: Math.sin(titleT * 0.15) * 6, y }, pitch: 0.92, dist: 32, instant: (titleT * 2.2) % 120 < 0.05 });
  }
  world.followLight(camCtl.tx, camCtl.ty);
  world.update(realT, dtReal);
  fx.update(paused || current ? 0 : dtReal);
  GM.render(dtReal, realT);
  if (draw) renderer.render(scene, camCtl.cam);
}

// ---------- 启动 ----------
fpsEl.hidden = !settings.fps;
layout(true);
applyQuality();
refreshOptions();
show('menu');
$('loading').hidden = true;
requestAnimationFrame((t) => { last = t; frame(t); });

// ---------- 自动化测试钩子（仅 ?test=1） ----------
if (TEST) {
  let rec = null, chunks = [];
  window.__JK_TEST__ = {
    version: VERSION, seed,
    snapshot() {
      const s = GM.snapshot();
      s.ui = { uiMode, overlay: current, paused, display: Object.assign({}, display), touchHidden: touch.hidden, fs: !!fsElement(), fsLog: fsLog.slice(), audio: A.state(), music: A.musicState(), camera: camCtl.preset().id, quality: { setting: settings.quality, effective: effQuality, auto: autoProbe.decided }, focus: document.activeElement && (document.activeElement.getAttribute('data-act') || document.activeElement.getAttribute('data-opt') || document.activeElement.id), toast: toastEl.hidden ? null : toastEl.textContent, banner: bannerEl.hidden ? null : bannerEl.textContent };
      s.input = IN.debug();
      const pl = GM.player();
      s.cam = { tx: +camCtl.tx.toFixed(2), ty: +camCtl.ty.toFixed(2), yaw: +camCtl.yaw.toFixed(3), heading: pl ? pl.ang + camCtl.yaw : 0, bodyHeading: pl ? pl.ang : 0, lookPending: camCtl.lookPending, gunAngle: pl ? GM.gunAngle() : 0, axes: camCtl.axes(), quad: camCtl.quad.map(q => q.map(v => +v.toFixed(1))) };
      return s;
    },
    events: () => G.events.slice(),
    clearInput: () => IN.clear(),
    cheat: GM._test,
    fx: () => fx.stats(),
    renderInfo: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, gl: (() => { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() }),
    perfStart() { perf.frames = []; perf.work = []; perf.info = []; perf.on = true; },
    perfStop() { perf.on = false; return { frames: perf.frames.slice(1), work: perf.work.slice(1), info: perf.info.slice() }; },
    setQuality(q) { settings.quality = q; effQuality = q === 'low' ? 'low' : 'high'; autoProbe = { on: q === 'auto', frames: [], done: false, decided: null }; applyQuality(); refreshOptions(); },
    startCapture(fps) {
      const stream = canvas.captureStream(fps || 60);
      const as = A.captureStream();
      if (as) as.getAudioTracks().forEach(t => stream.addTrack(t));
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m))[0];
      chunks = [];
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 160000 });
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
    toLocal,
    _scene: scene, _renderer: renderer, _cam: camCtl,
    // 手动时钟：on=true 时停止实时推进，由 step() 推进 n 个 1/60 秒逻辑步并（可选）渲染一帧
    manual(on) { manual = !!on; last = performance.now(); acc = 0; },
    step(n, draw) {
      for (let k = 0; k < n; k++) {
        if (uiMode === 'game' && !paused && !current) {
          if (IN.take('pause')) { pauseGame(); break; }
          if (IN.take('camera')) cycleCamera();
          updateStep();
        }
      }
      realT += n * STEP;
      presentFrame(n * STEP, draw !== false);
      const P = GM.player();
      return { mode: G.mode, t: +G.t.toFixed(2), overlay: current, x: P ? +P.x.toFixed(2) : 0, y: P ? +P.y.toFixed(2) : 0, alive: P ? P.alive : false };
    },
    grid() {
      const a = new Array(L.COLS * L.ROWS);
      for (let j = 0; j < L.ROWS; j++) for (let i = 0; i < L.COLS; i++) a[j * L.COLS + i] = L.blockedMove(L.cellX(i), L.cellY(j)) ? 1 : 0;
      return { cols: L.COLS, rows: L.ROWS, x0: L.X0, cells: a.join('') };
    },
    level: () => ({ huts: L.HUTS.map(h => ({ name: h.data.name, x: h.x, y: h.y, x0: h.x0, x1: h.x1, y0: h.y0, y1: h.y1 })), gate: { x: L.GATE.x, y: L.GATE.y }, pad: L.PAD, checkpoints: L.CHECKPOINTS, boss: L.BOSS, road: L.ROAD, bluffs: L.BLUFFS.length, powTotal: L.POW_TOTAL }),
    // 连通性检查：从起点出发（可破坏物体视为可通过，吉普占 3×3 格），能否到达直升机坪、各营房、Boss 触发线
    reach() {
      const C = L.COLS, R = L.ROWS;
      const bad = new Uint8Array(C * R);
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
        const c = j * C + i, t = L.terrain[c];
        if (L.isNoGo(t)) { bad[c] = 1; continue; }
        const id = L.solid[c];
        if (id && L.statics[id].blocksMove && !L.statics[id].by && L.statics[id].kind !== 'barricade') bad[c] = 1;
      }
      const ok = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= C || b >= R || bad[b * C + a]) return false; } return true; };
      const seen = new Uint8Array(C * R), q = [];
      const si = L.ci(L.START.x), sj = L.cj(L.START.y);
      seen[sj * C + si] = 1; q.push(si, sj);
      for (let h = 0; h < q.length; h += 2) {
        const i = q[h], j = q[h + 1];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= C || b >= R || seen[b * C + a] || !ok(a, b)) continue; seen[b * C + a] = 1; q.push(a, b); }
      }
      const near = (x, y, r) => { for (let j = Math.floor(y - r); j <= y + r; j++) for (let i = L.ci(x - r); i <= L.ci(x + r); i++) if (i >= 0 && j >= 0 && i < C && j < R && seen[j * C + i]) return true; return false; };
      return {
        cells: q.length / 2, pad: near(L.PAD.x, L.PAD.y, 3), boss: near(L.BOSS.respawn.x, L.BOSS.trigger + 2, 2),
        huts: L.HUTS.map(h => ({ name: h.data.name, ok: near(h.x, h.y, Math.max(h.x1 - h.x0, h.y1 - h.y0) / 2 + 3) })),
        checkpoints: L.CHECKPOINTS.map(c => ({ name: c.name, ok: near(c.x, c.y, 1.5) }))
      };
    },
    audioLogStart: () => A.logStart(),
    audioLogStop: () => A.logStop(),
    audioOffline: (events, dur) => A.renderOffline(events, dur)
  };
}
