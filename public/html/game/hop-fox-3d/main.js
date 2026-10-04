import { createWorld, startWorld, stepWorld, LEVEL_END } from './world.js';
import { createScene } from './scene.js?v=camera-mobile1';
import { GameAudio } from './audio.js?v=1';

const $ = id => document.getElementById(id);
const tr = (k, p) => (typeof window.t === 'function' ? window.t(k, p) : k);
const world = createWorld();
const audio = new GameAudio();
const view = createScene($('world'), world);
const held = new Set(), pointerKeys = new Set(), tapped = new Set();   // tapped: presses shorter than a frame still count once
const ALIASES = { ArrowLeft: 'KeyQ', ArrowRight: 'KeyE', ArrowUp: 'KeyR', ArrowDown: 'KeyF', Space: 'KeyK' };
let prevCamera = false;
let phase = 'title', paused = false, introT = 0, last = performance.now(), orientationBlocked = false, bigTimer = 0, prevJump = false, prevAction = false, stickX = 0, stickId = null;
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;
const HI_KEY = 'tb-game-hopfox3d-hi';
let hi = 0; try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch (e) { /* storage unavailable */ }

function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function toast(text, ms = 1700) { const e = $('toast'); e.textContent = text; e.classList.add('visible'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), ms); }
function pressed(code) { return held.has(code) || pointerKeys.has(code) || tapped.has(code); }
function clearInput() { held.clear(); pointerKeys.clear(); tapped.clear(); stickX = 0; stickId = null; $('knob').style.transform = 'translate(0,0)'; document.querySelectorAll('.held').forEach(el => el.classList.remove('held')); }
function readInput() {
  // Left/right follow the screen: with the orbit limited to ±55°, the camera's right vector always points toward +x.
  let x = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
  if (stickId !== null && Math.abs(stickX) > .3) x = Math.sign(stickX);
  const jump = pressed('KeyK') || pressed('KeyW'), action = pressed('KeyJ');
  const input = { x, run: action, jump, jumpPressed: jump && !prevJump, action, actionPressed: action && !prevAction };
  prevJump = jump; prevAction = action;
  return input;
}
document.body.classList.toggle('mobile-device', mobileDevice);
function requestFull() {
  if (mobileDevice) return;
  const el = $('game');
  try { if (document.fullscreenElement !== el && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => { if (mobileDevice) toast(tr('hopfox3d.fullFail'), 2600); }); } catch (e) { /* unsupported */ }
}
function refreshSoundLabel() { setText('sound', audio.enabled ? tr('hopfox3d.soundOn') : tr('hopfox3d.soundOff')); }
function refreshPauseLabel() { setText('pause', paused ? tr('hopfox3d.resume') : tr('hopfox3d.pause')); }
function updateHud() {
  setText('score', String(Math.floor(world.score)).padStart(6, '0'));
  setText('acorns', '×' + String(world.coins).padStart(2, '0'));
  setText('lives', '×' + Math.max(0, world.lives));
  setText('time', String(Math.max(0, Math.ceil(world.time))).padStart(3, '0'));
  $('time').classList.toggle('hurry', world.time < 100 && phase === 'playing');
  $('progress').style.width = Math.min(100, Math.max(0, world.hero.x / LEVEL_END * 100)) + '%';
}
function curtain(text, lives, ms) {
  const c = $('curtain'); setText('curtain-title', text); setText('curtain-lives', '×' + lives);
  c.hidden = false; c.classList.remove('run'); void c.offsetWidth; c.classList.add('run');
  clearTimeout(curtain.t); curtain.t = setTimeout(() => { c.hidden = true; }, ms);
}
function showPanel(kind) {
  $('bigtext').hidden = true; bigTimer = 0;
  $('panel').hidden = false; document.body.classList.remove('playing');
  const won = kind === 'won';
  $('panel-kicker').textContent = won ? 'STAGE 1 CLEAR' : 'GAME OVER';
  $('panel-title').textContent = won ? tr('hopfox3d.winTitle') : tr('hopfox3d.deadTitle');
  $('panel-copy').textContent = won ? tr('hopfox3d.winCopy') : tr('hopfox3d.deadCopy');
  const g = world.goal;
  const rows = [[tr('hopfox3d.acorns'), '×' + world.coins]];
  if (won && g) rows.push([tr('hopfox3d.bell'), '+' + g.points]);
  rows.push([tr('hopfox3d.total'), String(Math.floor(world.score))]);
  $('tally').innerHTML = rows.map(([a, b], i) => `<div class="${i === rows.length - 1 ? 'total' : ''}"><span>${a}</span><b>${b}</b></div>`).join('');
  $('tally').hidden = false; $('instructions').hidden = true; $('start').textContent = tr('hopfox3d.restart');
  if (world.score > hi) { hi = Math.floor(world.score); try { localStorage.setItem(HI_KEY, String(hi)); } catch (e) { /* ignore */ } }
  $('start').focus({ preventScroll: true });
}
function bigText(text, cls, seconds) { const b = $('bigtext'); b.textContent = text; b.className = cls; b.hidden = false; bigTimer = seconds; }

function startGame() {
  if (phase === 'playing' || phase === 'intro') { if (paused) togglePause(); return; }
  if (phase === 'over') { Object.assign(world, createWorld()); view.reset(); }
  audio.unlock().then(() => audio.effect('start'));
  requestFull(); clearInput();
  phase = 'intro'; paused = false; introT = 0;
  $('panel').hidden = true; $('tally').hidden = true; $('instructions').hidden = false; $('bigtext').hidden = true;
  document.body.classList.add('playing');
  curtain(tr('hopfox3d.stage'), world.lives, 1300);
  refreshPauseLabel(); orientation(); $('game').focus({ preventScroll: true });
}
function togglePause() {
  if (phase !== 'playing' && phase !== 'intro') return;
  paused = !paused; refreshPauseLabel(); audio.effect('tick');
  if (paused) { clearInput(); bigText(tr('hopfox3d.paused'), 'pause', 1e9); } else { $('bigtext').hidden = true; bigTimer = 0; }
}
function handleEvents() {
  for (const e of world.events) {
    view.effect(e); audio.effect(e);
    switch (e.type) {
      case 'powerup': toast(tr(e.kind === 'jar' ? 'hopfox3d.gotJar' : 'hopfox3d.gotBerry'), 2200); break;
      case 'shrink': toast(tr('hopfox3d.shrink')); break;
      case 'oneup': toast(tr('hopfox3d.oneup')); break;
      case 'checkpoint': toast(tr('hopfox3d.checkpoint')); break;
      case 'hurry': toast(tr('hopfox3d.hurry'), 2200); break;
      case 'die': if (e.reason === 'time') bigText(tr('hopfox3d.timeUp'), 'over', 2); break;
      case 'respawn': curtain(tr('hopfox3d.stage'), world.lives, 900); break;
      case 'goal': toast(tr('hopfox3d.bellRang', { n: e.points }), 2400); break;
      case 'win': phase = 'over'; showPanel('won'); break;
      case 'gameover': phase = 'over'; bigText('GAME OVER', 'over', 2.2); setTimeout(() => { if (phase === 'over') showPanel('lost'); }, 1500); break;
    }
  }
  world.events.length = 0;
}

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) {   // resize/orientation events can arrive late on phones
    const c = $('world'); if (c.clientWidth !== frame.w || c.clientHeight !== frame.h) { frame.w = c.clientWidth; frame.h = c.clientHeight; view.resize(); }
    orientation();
  }
  const active = !paused && !orientationBlocked;
  const cameraPressed = pressed('KeyC');
  const cam = { yaw: (pressed('KeyE') ? 1 : 0) - (pressed('KeyQ') ? 1 : 0), pitch: (pressed('KeyF') ? 1 : 0) - (pressed('KeyR') ? 1 : 0), reset: cameraPressed && !prevCamera };
  prevCamera = cameraPressed;
  if (phase === 'intro' && active) { introT += dt; if (introT >= 2.2) { phase = 'playing'; startWorld(world); } }
  if (phase === 'intro') cam.intro = Math.min(1, Math.max(0, (introT - .8) / 1.9));
  else if (phase === 'playing' && introT < 2.7 && active) { introT += dt; cam.intro = Math.min(1, (introT - .8) / 1.9); }
  if (phase === 'title') cam.attract = true;
  const input = readInput();
  if (phase === 'playing' && active) { stepWorld(world, input, dt); handleEvents(); } else world.events.length = 0;
  if (bigTimer > 0 && bigTimer < 1e8) { bigTimer -= dt; if (bigTimer <= 0 && phase !== 'over') $('bigtext').hidden = true; }
  audio.tick(phase === 'playing' && active && world.status === 'playing');
  view.update(active || phase === 'title' || phase === 'over' ? dt : 0, active || phase !== 'playing' ? cam : { intro: cam.intro });
  if (cam.reset && active) toast('视角：' + view.cameraName);
  updateHud(); tapped.clear();
  requestAnimationFrame(frame);
}

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  const code = ALIASES[e.code] || e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK'].includes(e.code) && document.body.classList.contains('playing')) e.preventDefault();
  if (e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'A') return;
    if (phase === 'title' || phase === 'over' || paused) { e.preventDefault(); if (paused) togglePause(); else startGame(); }
    return;
  }
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.repeat) return;
  held.add(code); tapped.add(code);
});
addEventListener('keyup', e => held.delete(ALIASES[e.code] || e.code));
addEventListener('blur', () => { clearInput(); if (phase === 'playing' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (phase === 'playing' && !paused) togglePause(); } last = performance.now(); });

$('start').onclick = startGame; $('pause').onclick = togglePause; $('full').onclick = requestFull;
$('sound').onclick = async () => { await audio.unlock(); audio.mute(); refreshSoundLabel(); };
$('touch-toggle').onclick = () => { $('touch').hidden = !$('touch').hidden; document.body.classList.toggle('touch-mode', !$('touch').hidden); };
$('rotate-go').onclick = () => { orientation(); if (!orientationBlocked && paused) togglePause(); };
$('recenter').addEventListener('pointerdown', e => { e.preventDefault(); pointerKeys.add('KeyC'); setTimeout(() => pointerKeys.delete('KeyC'), 90); });
document.querySelectorAll('[data-hold]').forEach(btn => {
  const code = btn.dataset.hold;
  const down = e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); pointerKeys.add(code); tapped.add(code); btn.classList.add('held'); audio.unlock(); };
  const up = e => { e.preventDefault(); pointerKeys.delete(code); btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
const stickEl = $('stick'), knob = $('knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), max = r.width * .38;
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; stickX = dx / max;
}
stickEl.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); audio.unlock(); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
const releaseStick = e => { if (e.pointerId !== stickId) return; stickId = null; stickX = 0; knob.style.transform = 'translate(0,0)'; };
stickEl.addEventListener('pointerup', releaseStick); stickEl.addEventListener('pointercancel', releaseStick); stickEl.addEventListener('lostpointercapture', releaseStick);

function orientation() {
  const blocked = mobileDevice && innerHeight > innerWidth;
  if (blocked !== orientationBlocked) {
    orientationBlocked = blocked; $('rotate').hidden = !blocked;
    if (blocked) { clearInput(); if ((phase === 'playing' || phase === 'intro') && !paused) togglePause(); }
  }
}
document.addEventListener('tb:locale', () => { refreshSoundLabel(); refreshPauseLabel(); if (phase === 'over') showPanel(world.status === 'won' ? 'won' : 'lost'); });
$('touch').hidden = !mobileDevice; document.body.classList.toggle('touch-mode', mobileDevice);
addEventListener('resize', () => { view.resize(); orientation(); });
document.addEventListener('fullscreenchange', () => { view.resize(); orientation(); });
addEventListener('orientationchange', () => setTimeout(() => { view.resize(); orientation(); }, 120));
refreshSoundLabel(); refreshPauseLabel(); orientation(); updateHud();
$('game').focus({ preventScroll: true });
requestAnimationFrame(frame);

if(new URLSearchParams(location.search).get("test")==="1"){window.__CAMERA_QA__={view,world,begin(){startWorld(world);phase='playing';introT=3;view.update(0,{},true);},state:()=>({index:view.cameraIndex,name:view.cameraName,count:view.cameraCount})};}
