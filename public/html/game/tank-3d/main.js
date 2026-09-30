import {installDemoControls} from '../../../js/game/demo-controls.js?v=1';
import { createWorld, startWorld, stepWorld, ENEMY_TYPES } from './world.js?v=modes1';
import { createScene } from './scene.js?v=modes1';
import { GameAudio } from './audio.js?v=1';

const $ = id => document.getElementById(id);
const tr = (k, p) => (typeof window.t === 'function' ? window.t(k, p) : k);
let world = createWorld();
const audio = new GameAudio();
const view = createScene($('world'), world);
const modes=installDemoControls(()=>world,view,true);
const held = new Set(), pointerKeys = new Set(), tapped = new Set(), dirStack = [];   // tapped: presses shorter than a frame still count once
const DIR_KEYS = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
const HOLD_ALIASES = {}; // Menu arrows remain available for navigation.
let phase = 'title', paused = false, introT = 0, last = performance.now(), orientationBlocked = false, bigTimer = 0;
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;
const HI_KEY = 'tb-game-tank3d-hi';
let hi = 0; try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch (e) { /* storage unavailable */ }
let stick = { id: null, x: 0, y: 0, axis: -1 };

function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function toast(text, ms = 1700) { const e = $('toast'); e.textContent = text; e.classList.add('visible'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), ms); }
function pressed(code) { return held.has(code) || pointerKeys.has(code) || tapped.has(code); }
function cameraQuarter() { const k = Math.round(view.yaw / (Math.PI / 2)); return ((k % 4) + 4) % 4; }
function inputDir() {
  let d = -1;
  if (stick.id !== null && stick.axis >= 0) d = stick.axis;
  else for (let i = dirStack.length - 1; i >= 0; i--) if (pressed(dirStack[i])) { d = DIR_KEYS[dirStack[i]]; break; }
  if (d < 0) for (const code of tapped) if (code in DIR_KEYS) d = DIR_KEYS[code];
  return d < 0 ? -1 : (d - cameraQuarter() + 4) % 4;   // WASD are relative to the (snapped) camera heading
}
function clearInput() {
  held.clear(); pointerKeys.clear(); tapped.clear(); dirStack.length = 0; stick = { id: null, x: 0, y: 0, axis: -1 };
  $('knob').style.transform = 'translate(0,0)';
  document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
}
function requestFull() {
  const el = document.documentElement;
  try { if (document.fullscreenElement !== el && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => { if (mobileDevice) toast(tr('tank3d.fullFail'), 2600); }); } catch (e) { /* unsupported */ }
}
function refreshSoundLabel() { setText('sound', audio.enabled ? tr('tank3d.soundOn') : tr('tank3d.soundOff')); }
function refreshPauseLabel() { setText('pause', paused ? tr('tank3d.resume') : tr('tank3d.pause')); }

function buildReserve() {
  const r = $('reserve'); r.innerHTML = '';
  for (let i = 0; i < world.roster.length; i++) { const icon = document.createElement('i'); if (world.roster[i] === 'fast') icon.className = 'fast'; r.appendChild(icon); }
}
function updateHud() {
  modes.sync();
  setText('score', String(world.score).padStart(6, '0'));
  setText('hi', String(Math.max(hi, world.score)).padStart(6, '0'));
  setText('lives', '∞');
  setText('level', '★'.repeat(world.level) + '☆'.repeat(3 - world.level));
  const icons = $('reserve').children, left = world.roster.length - world.rosterIndex;
  for (let i = 0; i < icons.length; i++) { const on = i < left; if (icons[i].classList.contains('gone') === on) icons[i].classList.toggle('gone', !on); }
  const chips = [];
  if (world.freeze > 0) chips.push(tr('tank3d.chipFreeze') + ' ' + Math.ceil(world.freeze));
  if (world.shovel > 0) chips.push(tr('tank3d.chipFort') + ' ' + Math.ceil(world.shovel));
  if (world.player && world.player.shield > 0 && phase === 'playing') chips.push(tr('tank3d.chipShield') + ' ' + Math.ceil(world.player.shield));
  const html = chips.map(c => '<span>' + c + '</span>').join('');
  if ($('chips').innerHTML !== html) $('chips').innerHTML = html;
}
function showPanel(kind) {
  $('bigtext').hidden = true; bigTimer = 0;
  $('panel').hidden = false; document.body.classList.remove('playing');
  const won = kind === 'won';
  $('panel-kicker').textContent = won ? 'STAGE 1 CLEAR' : 'GAME OVER';
  $('panel-title').textContent = won ? tr('tank3d.winTitle') : world.reason === 'base' ? (world.baseBy === 'player' ? tr('tank3d.ownGoalTitle') : tr('tank3d.baseTitle')) : tr('tank3d.deadTitle');
  $('panel-copy').textContent = won ? tr('tank3d.winCopy') : tr('tank3d.deadCopy');
  const rows = ['basic', 'fast'].map(k => `<div><span>${tr('tank3d.type_' + k)}</span><b>${world.tally[k]} × ${ENEMY_TYPES[k].score}</b></div>`);
  rows.push(`<div><span>${tr('tank3d.bonus')}</span><b>${world.pickups} × 500</b></div>`);
  rows.push(`<div class="total"><span>${tr('tank3d.total')}</span><b>${world.score}</b></div>`);
  $('tally').innerHTML = rows.join(''); $('tally').hidden = false;
  $('instructions').hidden = true;
  $('start').textContent = tr('tank3d.restart');
  if (world.score > hi) { hi = world.score; try { localStorage.setItem(HI_KEY, String(hi)); } catch (e) { /* ignore */ } }
  $('start').focus({ preventScroll: true });
}
function bigText(text, cls, seconds) { const b = $('bigtext'); b.textContent = text; b.className = cls; b.hidden = false; bigTimer = seconds; }

function startGame() {
  if (phase === 'playing' || phase === 'intro') { if (paused) togglePause(); return; }
  if (phase === 'over') {  // in-place restart: fresh world, walls rebuild, no page reload (keeps fullscreen)
    Object.assign(world, createWorld());
    view.reset();
  }
  audio.unlock().then(() => audio.effect('start'));

  clearInput(); buildReserve();
  phase = 'intro'; paused = false; introT = 0;
  $('panel').hidden = true; $('tally').hidden = true; $('instructions').hidden = false; $('bigtext').hidden = true;
  document.body.classList.add('playing');
  const c = $('curtain'); c.hidden = false; c.classList.remove('run'); void c.offsetWidth; c.classList.add('run');
  refreshPauseLabel(); orientation(); $('game').focus({ preventScroll: true });
}
function togglePause() {
  if (phase !== 'playing' && phase !== 'intro') return;
  paused = !paused; refreshPauseLabel(); audio.effect('pause');
  if (paused) { clearInput(); bigText(tr('tank3d.paused'), 'pause', 1e9); } else { $('bigtext').hidden = true; bigTimer = 0; }
}

const PICKUP_KEYS = { star: 'puStar', grenade: 'puGrenade', helmet: 'puHelmet', shovel: 'puShovel', timer: 'puTimer', tank: 'puTank' };
function handleEvents() {
  for (const e of world.events) {
    view.effect(e); audio.effect(e);
    switch (e.type) {
      case 'powerup': toast(tr('tank3d.powerupAppear')); break;
      case 'pickup': toast(tr('tank3d.' + PICKUP_KEYS[e.kind]), 2200); break;
      case 'die': if (world.lives > 0) toast(tr('tank3d.lostLife')); break;
      case 'baseboom': toast(e.by === 'player' ? tr('tank3d.ownGoal') : tr('tank3d.baseLost'), 2600); break;
      case 'win': phase = 'over'; showPanel('won'); break;
      case 'gameover': phase = 'over'; bigText('GAME OVER', 'over', 2.2); setTimeout(() => { if (phase === 'over') showPanel('lost'); }, 1500); break;
    }
  }
  world.events.length = 0;
}

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) {   // resize/orientation events can arrive late or out of order on phones
    const c = $('world'); if (c.clientWidth !== frame.w || c.clientHeight !== frame.h) { frame.w = c.clientWidth; frame.h = c.clientHeight; view.resize(); }
    orientation();
  }
  const active = !paused && !orientationBlocked;
  const cam = {};
  // Intro: shutters close on "STAGE 1" (0–0.75 s), then the camera swoops from the eagle up to the overview.
  if (phase === 'intro' && active) {
    introT += dt;
    if (introT >= 1.25) $('curtain').hidden = true;
    if (introT >= 2.4) { phase = 'playing'; startWorld(world); }
  }
  if (phase === 'intro') cam.intro = Math.min(1, Math.max(0, (introT - .7) / 2.2));
  else if (phase === 'playing' && introT < 2.9 && active) { introT += dt; cam.intro = Math.min(1, (introT - .7) / 2.2); }
  if (phase === 'title') cam.attract = true;
  if (phase === 'playing' && active) {
    stepWorld(world, { dir: inputDir(), fire: pressed('KeyJ') }, dt);
    handleEvents();
  } else world.events.length = 0;
  if (bigTimer > 0 && bigTimer < 1e8) { bigTimer -= dt; if (bigTimer <= 0 && phase !== 'over') $('bigtext').hidden = true; }
  audio.tick(phase === 'playing' && active && !!world.player, !!(world.player && world.player.moving));
  view.update(active || phase === 'title' || phase === 'over' ? dt : 0, active || phase !== 'playing' ? cam : { intro: cam.intro });
  updateHud(); tapped.clear();
  requestAnimationFrame(frame);
}

// --- Keyboard.
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  const code = HOLD_ALIASES[e.code] || e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ'].includes(e.code) && document.body.classList.contains('playing')) e.preventDefault();
  if (e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'A') return;
    if (phase === 'title' || phase === 'over' || paused) { e.preventDefault(); if (paused) togglePause(); else startGame(); }
    return;
  }
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.repeat) return;
  held.add(code); tapped.add(code);
  if (code in DIR_KEYS) { const i = dirStack.indexOf(code); if (i >= 0) dirStack.splice(i, 1); dirStack.push(code); }
});
addEventListener('keyup', e => { const code = HOLD_ALIASES[e.code] || e.code; held.delete(code); const i = dirStack.indexOf(code); if (i >= 0) dirStack.splice(i, 1); });
addEventListener('blur', () => { clearInput(); if (phase === 'playing' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (phase === 'playing' && !paused) togglePause(); } last = performance.now(); });

// --- Buttons.
$('start').onclick = startGame; $('pause').onclick = togglePause; $('full').onclick = requestFull;
$('sound').onclick = async () => { await audio.unlock(); audio.mute(); refreshSoundLabel(); };
$('touch-toggle').onclick = () => { $('touch').hidden = !$('touch').hidden; document.body.classList.toggle('touch-mode', !$('touch').hidden); };
$('lang').onclick = () => tbSetLocale(tbGetLocale() === 'zh-CN' ? 'en' : 'zh-CN');
$('rotate-go').onclick = () => { orientation(); if (!orientationBlocked && paused) togglePause(); };
$('recenter').addEventListener('pointerdown', e => { e.preventDefault(); pointerKeys.add('KeyC'); setTimeout(() => pointerKeys.delete('KeyC'), 90); });
document.querySelectorAll('[data-hold]').forEach(btn => {
  const code = btn.dataset.hold;
  const down = e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); pointerKeys.add(code); btn.classList.add('held'); if (code === 'KeyJ') audio.unlock(); };
  const up = e => { e.preventDefault(); pointerKeys.delete(code); btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
// --- Virtual stick: 4-way, dominant axis with a little hysteresis so diagonals don't jitter.
const stickEl = $('stick'), knob = $('knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = stickEl.clientWidth * .38;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  if ($('game').classList.contains('portrait-play')) { const physicalX = dx; dx = dy; dy = -physicalX; }
  const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  const nx = dx / max, ny = dy / max, mag = Math.hypot(nx, ny);
  if (mag < .3) { stick.axis = -1; return; }
  const horiz = Math.abs(nx) > Math.abs(ny) + (stick.axis === 0 || stick.axis === 2 ? .18 : stick.axis === 1 || stick.axis === 3 ? -.18 : 0);
  stick.axis = horiz ? (nx > 0 ? 1 : 3) : (ny > 0 ? 2 : 0);
}
stickEl.addEventListener('pointerdown', e => { e.preventDefault(); stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); audio.unlock(); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
const releaseStick = e => { if (e.pointerId !== stick.id) return; stick = { id: null, x: 0, y: 0, axis: -1 }; knob.style.transform = 'translate(0,0)'; };
stickEl.addEventListener('pointerup', releaseStick); stickEl.addEventListener('pointercancel', releaseStick); stickEl.addEventListener('lostpointercapture', releaseStick);

function orientation() {
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  const rotate = mobileDevice && height > width && phase !== 'title';
  const game = $('game');
  if (rotate !== game.classList.contains('portrait-play')) clearInput();
  game.classList.toggle('portrait-play', rotate);
  if (rotate) { game.style.width = height + 'px'; game.style.height = width + 'px'; }
  else { game.style.width = ''; game.style.height = ''; }
  orientationBlocked = false; $('rotate').hidden = true;
}
document.addEventListener('tb:locale', () => { refreshSoundLabel(); refreshPauseLabel(); if (phase === 'over') showPanel(world.status === 'won' ? 'won' : 'lost'); });
$('touch').hidden = !mobileDevice; document.body.classList.toggle('touch-mode', mobileDevice);
addEventListener('resize', () => { clearInput(); orientation(); view.resize(); });
document.addEventListener('fullscreenchange', () => { clearInput(); orientation(); view.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { view.resize(); orientation(); }, 120));
buildReserve(); refreshSoundLabel(); refreshPauseLabel(); orientation(); updateHud();
$('game').focus({ preventScroll: true });
requestAnimationFrame(frame);
