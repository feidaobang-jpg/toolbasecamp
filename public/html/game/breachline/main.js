// Breachline 3D — bootstrap, input, HUD, panels, touch controls, i18n fallback.
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { createWorld, startRun, startWave, stepWorld, TOTAL_WAVES, FIELD, WEAPONS, qaJump } from './game.js?v=b1';
import { createScene } from './scene.js?v=b1';
import { GameAudio } from './audio.js?v=b1';

const $ = id => document.getElementById(id);
// t(): site dictionary first, then the page-embedded GAME_I18N fallback, then the key itself.
function tr(k, p) {
  let v;
  try { v = typeof window.t === 'function' ? window.t(k, p) : undefined; } catch (e) { /* site i18n unavailable */ }
  if (v && v !== k) return v;
  const lang = (document.documentElement.lang || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const d = window.GAME_I18N && window.GAME_I18N[lang];
  v = d ? d[k] : undefined;
  if (v == null) return k;
  if (p) for (const key in p) v = String(v).split('{' + key + '}').join(p[key]);
  return v;
}
function applyI18n() {
  document.querySelectorAll('[data-i18n^="breachline."]').forEach(el => { el.textContent = tr(el.getAttribute('data-i18n')); });
}
applyI18n();
document.addEventListener('tb:locale', applyI18n);
new MutationObserver(applyI18n).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

const world = createWorld();
const view = createScene($('world'), world);
const audio = new GameAudio();
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;
const BEST_KEY = 'tb-game-breachline-best';
let best = { w: 0, s: 0 };
try { const raw = localStorage.getItem(BEST_KEY); if (raw) { const b = JSON.parse(raw); if (b && Number.isFinite(b.w)) best = { w: Math.max(0, b.w | 0), s: Math.max(0, b.s | 0) }; } } catch (e) { /* storage unavailable */ }
function saveBest() { try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* ignore */ } }

let phase = 'title', paused = false, last = performance.now(), lastOutcome = '';
const held = new Set(), tapped = new Set();
let stick = { id: null, nx: 0, ny: 0 }, camHoldL = false, camHoldR = false;

function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function toast(text, ms = 1800) { const e = $('toast'); e.textContent = text; e.classList.add('visible'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), ms); }
function pressed(code) { return held.has(code) || tapped.has(code); }
function clearInput() {
  held.clear(); tapped.clear();
  stick = { id: null, nx: 0, ny: 0 }; camHoldL = camHoldR = false;
  $('knob').style.transform = 'translate(0,0)';
  document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
}
function requestFull() {
  const el = $('game');
  try {
    if (document.fullscreenElement !== el && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* unsupported */ } })
        .catch(() => toast(tr('breachline.fullFail'), 2600));
    }
  } catch (e) { toast(tr('breachline.fullFail'), 2600); }
}
function refreshSoundLabel() { setText('sound', audio.enabled ? tr('breachline.soundOn') : tr('breachline.soundOff')); }
function refreshPauseLabel() { setText('pause', paused ? tr('breachline.resume') : tr('breachline.pause')); }

// --- Panels.
function showPanel(kind) {
  $('bigtext').hidden = true;
  $('panel').hidden = false; document.body.classList.remove('playing');
  const won = kind === 'won';
  lastOutcome = kind;
  const score = world.score, nextLoop = world.loop + 1;
  $('panel-kicker').textContent = won ? tr('breachline.loopTag', { n: world.loop }) : tr('breachline.kicker');
  $('panel-title').textContent = won ? tr('breachline.winTitle') : tr('breachline.loseTitle');
  $('panel-copy').textContent = won ? tr('breachline.winCopy', { score, n: nextLoop }) : tr('breachline.loseCopy', { n: world.wave });
  const KNAMES = { crawler: 'enemyCrawler', runner: 'enemyRunner', spitter: 'enemySpitter', flyer: 'enemyFlyer', elite: 'enemyElite', boss: 'enemyBoss' };
  const rows = Object.keys(world.kills).filter(k => world.kills[k]).map(k => `<div><span>${tr('breachline.' + KNAMES[k])}</span><b>×${world.kills[k]}</b></div>`);
  rows.push(`<div class="total"><span>${tr('breachline.hudMerit')}</span><b>${score}</b></div>`);
  $('tally').innerHTML = rows.join(''); $('tally').hidden = false;
  $('instructions').hidden = true;
  $('start').textContent = won ? tr('breachline.nextLoop', { n: nextLoop }) : tr('breachline.retry');
  if (score > best.s) best.s = score;
  if (world.wave > best.w) best.w = world.wave;
  saveBest();
  $('start').focus({ preventScroll: true });
}
function bigText(text, cls, seconds) {
  const b = $('bigtext'); b.textContent = text; b.className = cls; b.hidden = false;
  if (b.t) { clearTimeout(b.t); b.t = 0; }
  if (seconds) b.t = setTimeout(() => { b.hidden = true; }, seconds * 1000);
}

function startGame() {
  if (phase === 'over') {
    startRun(world, lastOutcome === 'won' ? world.loop + 1 : 1);
  } else if (world.phase === 'intermission') {
    startWave(world);
    bigText(tr('breachline.waveBanner', { n: world.wave }), '', 2.2);
    return;
  } else if (phase === 'playing') {
    if (paused) togglePause();
    return;
  } else {
    startRun(world, world.loop);
  }
  audio.unlock().then(() => audio.effect('start'));
  clearInput();
  phase = 'playing'; paused = false;
  $('panel').hidden = true; $('tally').hidden = true; $('instructions').hidden = false;
  document.body.classList.add('playing');
  refreshPauseLabel(); orientation();
  $('game').focus({ preventScroll: true });
}
function togglePause() {
  if (phase !== 'playing') return;
  paused = !paused; refreshPauseLabel();
  audio.unlock().then(() => audio.effect('pause'));
  if (paused) { clearInput(); bigText(tr('breachline.paused'), 'pause', 0); } else { $('bigtext').hidden = true; }
}

// --- Floating popups + damage-direction arc.
const _pv = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _pv.set(x, y, z).project(view.camera);
  if (_pv.z > 1) return null;
  return { x: (_pv.x * .5 + .5) * $('world').clientWidth, y: (-_pv.y * .5 + .5) * $('world').clientHeight };
}
function spawnPop(e) {
  const wrap = $('popups');
  if (wrap.childElementCount > 14) return;
  const p = worldToScreen(e.x, e.y + 1.6, e.z);
  if (!p) return;
  const el = document.createElement('i');
  el.className = 'pop';
  el.style.left = (p.x + (Math.random() - .5) * 34) + 'px';
  el.style.top = (p.y - 10) + 'px';
  el.textContent = '+' + e.merit;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
function spawnGatePop(e) {
  const p = worldToScreen(0, 5, 52);
  if (!p) return;
  const el = document.createElement('i');
  el.className = 'pop gate';
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  el.textContent = '-' + Math.round(e.dmg);
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 900);
}
let arcT = 0;
function showHitArc(sx, sz) {
  const p = world.player, y = view.cam.yaw;
  // Source direction in camera space: screen-up = ahead of the camera, screen-x = camera-right.
  const vx = sx - p.x, vz = sz - p.z;
  const fwdDot = vx * Math.sin(y) + vz * Math.cos(y);
  const rightDot = vx * -Math.cos(y) + vz * Math.sin(y);
  const deg = Math.atan2(rightDot, fwdDot) * 180 / Math.PI;
  $('hitarc').style.transform = `translate(-50%,-50%) rotate(${deg.toFixed(1)}deg)`;
  $('hitarc').classList.add('on'); arcT = .55;
}

// --- Simulation events.
let gateToastT = 0;
function handleEvents(dt) {
  gateToastT -= dt;
  for (const e of world.events) {
    const sfx = e.type === 'kill' ? 'bugdie' : e.type === 'fire' ? WEAPONS[e.weapon].key : e.type;
    audio.effect(sfx);
    view.effect(e);
    switch (e.type) {
      case 'kill': spawnPop(e); break;
      case 'hurt': showHitArc(e.sx, e.sz); break;
      case 'playerdown': toast(tr('breachline.respawn'), 2200); break;
      case 'gatehit':
        if (gateToastT <= 0) { toast(tr('breachline.gateAlarm'), 1600); gateToastT = 5; }
        spawnGatePop(e); break;
      case 'wave':
        bigText(e.n === TOTAL_WAVES ? tr('breachline.bossWave') : tr('breachline.waveBanner', { n: e.n }), e.n === TOTAL_WAVES ? 'boss' : '', 2.4);
        audio.unlock().then(() => audio.effect('alarm'));
        break;
      case 'waveclear':
        toast(tr('breachline.waveClear'), 3200); audio.effect('waveclear');
        if (world.score > best.s) best.s = world.score;
        if (world.wave > best.w) best.w = world.wave;
        saveBest(); break;
      case 'win': phase = 'over'; audio.effect('win'); showPanel('won'); break;
      case 'lose': phase = 'over'; audio.effect('gameover'); showPanel('lost'); break;
      case 'turret': toast(tr('breachline.turretBuilt')); break;
      case 'deny': toast(e.why === 'max' ? tr('breachline.turretMax') : tr('breachline.turretNeed')); break;
      case 'turretFire': if (Math.random() < .4) audio.effect('turret'); break;
      case 'tankFire': audio.effect('rocket'); break;
      case 'boom': audio.effect('boom'); break;
      case 'spawn': if (Math.random() < .3) audio.effect('bug'); break;
      default: break;
    }
  }
  world.events.length = 0;
}

// --- HUD.
function bestText() {
  if (!best.w && !best.s) return '—';
  return (document.documentElement.lang || '').startsWith('en') ? `W${best.w}·${best.s}` : `${best.w}波·${best.s}`;
}
function updateHud() {
  const gh = Math.max(0, world.gateHp / world.gateMax), hp = Math.max(0, world.player.hp / world.player.maxHp);
  $('gate-meter').style.width = (gh * 100).toFixed(1) + '%';
  $('gate-meter').parentElement.classList.toggle('crit', gh < .35);
  $('hp-meter').style.width = (hp * 100).toFixed(1) + '%';
  setText('merit', String(world.merit));
  setText('wave', `${world.wave}/${TOTAL_WAVES}`);
  setText('weapon', tr('breachline.' + WEAPONS[world.player.weapon].key));
  setText('best', bestText());
  setText('wave-label', `WAVE ${Math.max(1, world.wave)} · LOOP ${world.loop}`);
  $('crosshair').classList.toggle('locked', !!world.softlock);
}

// --- Input assembly (keyboard + touch → camera-relative world axes).
const _dir = new THREE.Vector3();
function gatherInput(dt) {
  // Camera orbit: ←/→ held rotates continuously, ↑/↓ tilts within limits; Q/E/C presets are one-shot.
  if (pressed('ArrowLeft') || camHoldL) view.cam.yaw += 2.3 * dt;
  if (pressed('ArrowRight') || camHoldR) view.cam.yaw -= 2.3 * dt;
  if (pressed('ArrowUp')) view.cam.pitch = Math.min(1.25, view.cam.pitch + 1.1 * dt);
  if (pressed('ArrowDown')) view.cam.pitch = Math.max(.12, view.cam.pitch - 1.1 * dt);
  if (tapped.has('KeyQ')) view.setPreset(0);
  if (tapped.has('KeyE')) view.setPreset(1);
  if (tapped.has('KeyC')) view.setPreset(0);

  let fwd = 0, strafe = 0;
  if (pressed('KeyW')) fwd += 1;
  if (pressed('KeyS')) fwd -= 1;
  if (pressed('KeyD')) strafe += 1;
  if (pressed('KeyA')) strafe -= 1;
  if (stick.id !== null) { fwd = -stick.ny; strafe = stick.nx; }
  const y = view.cam.yaw, sy = Math.sin(y), cy = Math.cos(y);
  const mx = sy * fwd - cy * strafe, mz = cy * fwd + sy * strafe;

  view.camera.getWorldDirection(_dir);
  let spot = null;
  if (tapped.has('KeyU') && _dir.y < -.05) {
    const t = -view.camera.position.y / _dir.y;
    const gx = view.camera.position.x + _dir.x * t, gz = view.camera.position.z + _dir.z * t;
    spot = { x: Math.max(FIELD.minX, Math.min(FIELD.maxX, gx)), z: Math.max(FIELD.minZ, Math.min(FIELD.maxZ, gz)) };
  }
  let weapon = 0;
  if (tapped.has('Digit1')) weapon = 1;
  if (tapped.has('Digit2')) weapon = 2;
  if (tapped.has('Digit3')) weapon = 3;

  return {
    mx, mz,
    fire: pressed('KeyJ'),
    jump: tapped.has('KeyK'),
    roll: tapped.has('KeyL'),
    weapon, build: tapped.has('KeyU'), spot,
    camYaw: y,
    dx: _dir.x, dy: _dir.y, dz: _dir.z,
    camX: view.camera.position.x, camY: view.camera.position.y, camZ: view.camera.position.z
  };
}

// --- Main loop.
let fpsAcc = 0, fpsN = 0, fps = 60;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= .5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) {
    const c = $('world');
    if (c.clientWidth !== frame.w || c.clientHeight !== frame.h) { frame.w = c.clientWidth; frame.h = c.clientHeight; view.resize(); }
    orientation();
  }
  const active = phase === 'playing' && !paused;
  if (active) {
    const inp = gatherInput(dt);
    stepWorld(world, inp, dt);
    handleEvents(dt);
  } else {
    world.events.length = 0;
    if (phase === 'title') view.cam.yaw += dt * .07; // slow attract orbit
  }
  if (arcT > 0) { arcT -= dt; if (arcT <= 0) $('hitarc').classList.remove('on'); }
  updateHud();
  tapped.clear();
  view.update(dt, active);
  requestAnimationFrame(frame);
}

// --- Keyboard.
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ'].includes(e.code) && document.body.classList.contains('playing')) e.preventDefault();
  if (e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'A') return;
    e.preventDefault();
    if (paused) togglePause(); else startGame();
    return;
  }
  if (e.code === 'Escape') { togglePause(); return; } // never preventDefault: let the browser exit fullscreen too
  if (e.repeat) return;
  held.add(e.code); tapped.add(e.code);
  if (e.code === 'KeyJ') audio.unlock();
});
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => { clearInput(); if (phase === 'playing' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (phase === 'playing' && !paused) togglePause(); } last = performance.now(); });

// --- Buttons.
$('start').onclick = startGame;
$('pause').onclick = togglePause;
$('full').onclick = requestFull;
$('sound').onclick = async () => { await audio.unlock(); refreshSoundLabel(); setText('sound', audio.mute() ? tr('breachline.soundOn') : tr('breachline.soundOff')); };
$('touch-toggle').onclick = () => { $('touch').hidden = !$('touch').hidden; document.body.classList.toggle('touch-mode', !$('touch').hidden); };
$('lang').onclick = () => (typeof window.tbSetLocale === 'function' ? window.tbSetLocale(window.tbGetLocale() === 'zh-CN' ? 'en' : 'zh-CN') : localToggleLang());
function localToggleLang() {
  const en = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  document.documentElement.lang = en ? 'zh-CN' : 'en';
  applyI18n(); refreshSoundLabel(); refreshPauseLabel();
}
$('demo').onclick = () => {
  world.player.demoInvuln = !world.player.demoInvuln;
  $('demo').setAttribute('aria-pressed', String(world.player.demoInvuln));
};
// Hold-to-fire / hold-to-rotate buttons.
function bindHold(el, down, up) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); down(); el.classList.add('held'); audio.unlock(); });
  const end = e => { e.preventDefault(); up(); el.classList.remove('held'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
document.querySelectorAll('[data-hold]').forEach(btn => {
  const code = btn.dataset.hold;
  bindHold(btn, () => { if (code === 'KeyJ') tapped.add('KeyJ'); else if (code === 'camL') camHoldL = true; else if (code === 'camR') camHoldR = true; held.add(code === 'KeyJ' ? 'KeyJ' : code); },
    () => { held.delete(code === 'KeyJ' ? 'KeyJ' : code); if (code === 'camL') camHoldL = false; if (code === 'camR') camHoldR = false; });
});
document.querySelectorAll('[data-tap]').forEach(btn => {
  const code = btn.dataset.tap;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tapped.add(code); if (code === 'KeyJ') audio.unlock(); btn.classList.add('held'); setTimeout(() => btn.classList.remove('held'), 120); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

// --- Virtual stick (analog), with portrait inverse rotation.
const stickEl = $('stick'), knob = $('knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = stickEl.clientWidth * .38;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  if ($('game').classList.contains('portrait-play')) { const px = dx; dx = dy; dy = -px; }
  const d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  stick.nx = dx / max; stick.ny = dy / max;
}
stickEl.addEventListener('pointerdown', e => { e.preventDefault(); stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); audio.unlock(); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
const releaseStick = e => { if (e.pointerId !== stick.id) return; stick = { id: null, nx: 0, ny: 0 }; knob.style.transform = 'translate(0,0)'; };
stickEl.addEventListener('pointerup', releaseStick); stickEl.addEventListener('pointercancel', releaseStick); stickEl.addEventListener('lostpointercapture', releaseStick);
// Tap the battlefield to continue between waves (mobile has no Enter).
$('world').addEventListener('pointerdown', () => { if (phase === 'playing' && world.phase === 'intermission' && !paused) startGame(); });

// --- Orientation: on phones, portrait play rotates the whole container 90°.
function orientation() {
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  const rotate = mobileDevice && height > width && phase !== 'title';
  const game = $('game');
  if (rotate !== game.classList.contains('portrait-play')) clearInput();
  game.classList.toggle('portrait-play', rotate);
  if (rotate) { game.style.width = height + 'px'; game.style.height = width + 'px'; }
  else { game.style.width = ''; game.style.height = ''; }
}
document.addEventListener('tb:locale', () => { refreshSoundLabel(); refreshPauseLabel(); if (phase === 'over') showPanel(lastOutcome); });
$('touch').hidden = !mobileDevice; document.body.classList.toggle('touch-mode', mobileDevice);
addEventListener('resize', () => { clearInput(); orientation(); view.resize(); });
document.addEventListener('fullscreenchange', () => { clearInput(); orientation(); view.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { view.resize(); orientation(); }, 120));

refreshSoundLabel(); refreshPauseLabel(); orientation(); updateHud();
$('game').focus({ preventScroll: true });
requestAnimationFrame(frame);

// --- QA harness: only mounted with ?qa=1, for automated verification. Not a player-facing cheat UI.
if (new URLSearchParams(location.search).has('qa')) {
  window.breachQa = {
    world, view,
    get phase() { return phase; }, get paused() { return paused; },
    get fps() { return fps; },
    start: startGame,
    jump: n => { qaJump(world, n); },
    addMerit: n => { world.merit += n; world.score += 0; },
    setLoop: n => { world.loop = n; },
    killAll: () => { for (const e of world.enemies) e.hp = -1; world.spawnQueue.length = 0; }
  };
}
