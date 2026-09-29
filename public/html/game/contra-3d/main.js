import { createWorld, stepWorld, respawn, LEVEL_END } from './world.js';
import { createScene } from './scene.js?v=c1';
import { GameAudio } from './audio.js';

const $ = id => document.getElementById(id);
const world = createWorld();
const audio = new GameAudio();
const view = createScene($('world'), world);
const held = new Set(), pointerKeys = new Set();
let running = false, paused = false, last = performance.now();
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;
let orientationBlocked = false, hasStarted = false, rotatedLayout = false;
const input = { x: 0, z: 0, shoot: false, jump: false, jumpPressed: false, divePressed: false, yaw: 0, pitch: 0, reset: false };

function setText(id, value) { const el = $(id); if (el.textContent !== value) el.textContent = value; }
function toast(text) { const e = $('toast'); e.textContent = text; e.classList.add('visible'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), 1700); }
function pressed(key) { return held.has(key) || pointerKeys.has(key); }
function syncInput() {
  let x = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0), z = (pressed('KeyS') ? 1 : 0) - (pressed('KeyW') ? 1 : 0);
  if (Math.hypot(x, z) > 1) { x /= Math.SQRT2; z /= Math.SQRT2; }
  input.x = x; input.z = z;
  input.shoot = pressed('KeyJ'); input.jump = pressed('KeyK'); input.dive = pressed('KeyL');
  input.yaw = (pressed('KeyE') ? 1 : 0) - (pressed('KeyQ') ? 1 : 0); input.pitch = (pressed('KeyF') ? 1 : 0) - (pressed('KeyR') ? 1 : 0); input.reset = pressed('KeyC');
}
function startFullscreen() {
  const el = document.documentElement;
  try { if (document.fullscreenElement !== el && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) {}
  try { if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
function startGame() {
  if (world.status === 'dead') { location.reload(); return; }
  if (world.status === 'won') { location.reload(); return; }
  world.status = 'playing'; hasStarted = true; running = true; paused = false;
  $('panel').hidden = true; document.body.classList.add('playing');
  orientation(); setText('pause', paused ? t('contra3d.resume') : t('contra3d.pause'));
  audio.unlock(); $('game').focus();
}
function togglePause() {
  if (!running) return;
  paused = !paused; setText('pause', paused ? t('contra3d.resume') : t('contra3d.pause'));
  toast(paused ? t('contra3d.paused') : t('contra3d.continued'));
}
function updateHud() {
  setText('lives', '×' + Math.max(0, world.lives));
  setText('score', String(world.score).padStart(6, '0'));
  setText('time', String(Math.max(0, Math.ceil(world.time))).padStart(3, '0'));
  setText('weapon', world.player.spread ? 'S' : 'N');
  $('progress').style.width = Math.min(100, Math.max(0, (world.player.x / LEVEL_END) * 100)) + '%';
}
function eventEffects() {
  while (world.events.length) {
    const e = world.events.shift(); audio.effect(e.type);
    switch (e.type) {
      case 'shoot': break;
      case 'boom': view.burst(e.x, e.y, e.z, '#ffab4a', 12); break;
      case 'bridgeboom': view.burst(e.x, 0, 0, '#ff9a3c', 16); view.burst(e.x, .5, 1.2, '#ffd28a', 8); break;
      case 'splash': view.burst(e.x, -.2, e.z, '#bfe8ff', 8); break;
      case 'pickup': toast(t('contra3d.spread')); break;
      case 'capsule': toast(t('contra3d.capsule')); break;
      case 'checkpoint': toast(t('contra3d.checkpoint')); break;
      case 'dive': toast(t('contra3d.dive')); break;
      case 'die': {
        if (world.status === 'dead') {
          running = false; $('panel').hidden = false; document.body.classList.remove('playing');
          $('panel-kicker').textContent = 'GAME OVER';
          $('panel-title').textContent = t('contra3d.deadTitle'); $('panel-copy').textContent = t('contra3d.deadCopy');
          $('start').hidden = true; $('restart').hidden = false;
        } else toast(t('contra3d.lostLife'));
        break;
      }
      case 'win': {
        running = false; $('panel').hidden = false; document.body.classList.remove('playing');
        $('panel-kicker').textContent = 'STAGE 1 CLEAR';
        $('panel-title').textContent = t('contra3d.winTitle'); $('panel-copy').textContent = t('contra3d.winCopy');
        $('start').hidden = true; $('restart').hidden = false;
        break;
      }
    }
  }
}
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; syncInput();
  if (running && !paused && !orientationBlocked) {
    input.jumpPressed = input.jump && !frame.wasJump;
    input.divePressed = input.dive && !frame.wasDive;
    stepWorld(world, input, dt);
    frame.wasJump = input.jump; frame.wasDive = input.dive;
    audio.tick(true); eventEffects();
  } else { input.jumpPressed = false; input.divePressed = false; audio.tick(false); }
  view.update(dt, { yaw: input.yaw, pitch: input.pitch, reset: input.reset });
  updateHud(); requestAnimationFrame(frame);
}
frame.wasJump = false; frame.wasDive = false;
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter' && !running) { startGame(); return; }
  if (e.code === 'Escape') { togglePause(); return; }
  held.add(e.code);
});
window.addEventListener('keyup', e => held.delete(e.code));
window.addEventListener('blur', () => { held.clear(); pointerKeys.clear(); });
$('start').onclick = startGame; $('restart').onclick = () => location.reload(); $('pause').onclick = togglePause; $('full').onclick = startFullscreen;
$('sound').onclick = async () => { await audio.unlock(); const on = audio.mute(); $('sound').textContent = on ? t('contra3d.soundOff') : t('contra3d.soundOn'); };
$('touch-toggle').onclick = () => { $('touch').hidden = !$('touch').hidden; document.body.classList.toggle('touch-mode', !$('touch').hidden); };
$('lang').onclick = () => tbSetLocale(tbGetLocale() === 'zh-CN' ? 'en' : 'zh-CN');
$('recenter').onclick = () => { pointerKeys.add('KeyC'); setTimeout(() => pointerKeys.delete('KeyC'), 80); };
document.querySelectorAll('[data-hold]').forEach(btn => {
  const code = btn.dataset.hold;
  const down = e => { e.preventDefault(); pointerKeys.add(code); btn.classList.add('held'); };
  const up = e => { e.preventDefault(); pointerKeys.delete(code); btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
});
const stick = $('stick'), knob = $('knob'); let stickId = null;
function moveStick(e) {
  const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const screenX = e.clientX - cx, screenY = e.clientY - cy, dx = rotatedLayout ? screenY : screenX, dy = rotatedLayout ? -screenX : screenY, d = Math.min(r.width * .38, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
  knob.style.transform = `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`;
  const nx = Math.cos(a) * d / (r.width * .38), ny = Math.sin(a) * d / (r.height * .38);
  ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(k => pointerKeys.delete(k));
  if (nx < -.2) pointerKeys.add('KeyA'); if (nx > .2) pointerKeys.add('KeyD');
  if (ny < -.2) pointerKeys.add('KeyW'); if (ny > .2) pointerKeys.add('KeyS');
}
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(stickId); moveStick(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
function releaseStick(e) {
  if (e.pointerId !== stickId) return; stickId = null;
  ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(k => pointerKeys.delete(k));
  knob.style.transform = 'translate(0,0)';
}
stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick);
function orientation(){
  const nextRotation=hasStarted&&mobileDevice&&innerHeight>innerWidth;
  if(nextRotation!==rotatedLayout){
    held.clear();pointerKeys.clear();frame.wasJump=false;frame.wasDive=false;stickId=null;
    knob.style.transform='translate(0,0)';
    document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));
  }
  rotatedLayout=nextRotation;
  document.body.classList.toggle('rotated-layout',rotatedLayout);
  const game=$('game');
  game.style.width=(rotatedLayout?innerHeight:innerWidth)+'px';
  game.style.height=(rotatedLayout?innerWidth:innerHeight)+'px';
  game.style.left=rotatedLayout?innerWidth+'px':'0px';
  orientationBlocked=false;
  $('rotate').hidden=true;
  view.resize();
}
$('touch').hidden = !mobileDevice;
document.body.classList.toggle('touch-mode', mobileDevice);
addEventListener('resize', orientation);
document.addEventListener('fullscreenchange', orientation);
orientation(); view.update(0, { reset: true }); updateHud(); requestAnimationFrame(frame);
