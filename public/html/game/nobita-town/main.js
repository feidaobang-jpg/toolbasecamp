import { createScene } from './scene.js?v=1';
import { GameAudio } from './audio.js?v=1';

// Nobita Town Wander 3D — main loop, input, HUD, panels, i18n fallback.
const $ = id => document.getElementById(id);
const GAME_I18N = window.GAME_I18N || { zh: {}, en: {} };

// t(): site dictionary first (window.t, keys merged into TB_LOCALES at boot),
// then the in-page GAME_I18N fallback, then the raw key.
function tr(key, params) {
  if (typeof window.t === 'function') {
    const v = window.t(key, params);
    if (v != null && v !== key) return v;
  }
  const lang = (document.documentElement.lang || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
  let cur = GAME_I18N[lang];
  const parts = key.split('.');
  for (let i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
  if (cur == null) {
    cur = GAME_I18N.en; for (let i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
  }
  if (cur == null) return key;
  return String(cur).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] != null ? String(params[k]) : '{' + k + '}'));
}

const audio = new GameAudio();
const view = createScene($('world'), tr);
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;
const BEST_KEY = 'tb-game-nobita-town-best';

// --- Persistent best record (namespaced, try/catch guarded).
let best = null;
try { best = JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch (e) { best = null; }
function saveBest(score, time) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify({ score, time })); } catch (e) { /* storage unavailable */ }
}

// --- Run state.
let phase = 'title', paused = false;
let bells = 0, visited = 0, elapsed = 0, dist = 0, steps = 0, score = 0, lastTimeText = '';
view.cameraMode = 'attract';
view.refreshTexts();

function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }
function toast(text, ms = 2000) {
  const e = $('toast'); e.textContent = text; e.classList.add('visible');
  clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), ms);
}

// --- Input: keyboard (held) + touch buttons (pointerKeys) + one-shot queues.
const held = new Set(), pointerKeys = new Set(), tapped = new Set();
let jumpQueued = false, interactQueued = false;
let stick = { id: null, x: 0, y: 0, mag: 0 };

function clearInput() {
  held.clear(); pointerKeys.clear(); tapped.clear();
  jumpQueued = interactQueued = false;
  stick = { id: null, x: 0, y: 0, mag: 0 };
  $('knob').style.transform = 'translate(0,0)';
  document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
}
function requestFull() {
  const el = $('game');
  try {
    if (document.fullscreenElement !== el && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => toast(tr('nobitaTown.fullFail'), 2600));
    }
  } catch (e) { toast(tr('nobitaTown.fullFail'), 2600); }
}

// --- Panels & HUD.
function refreshStartLabel() { setText('start', phase === 'over' ? tr('nobitaTown.replay') : tr('nobitaTown.start')); }
function refreshSoundLabel() { setText('sound', audio.enabled ? tr('nobitaTown.soundOn') : tr('nobitaTown.soundOff')); }
function refreshPauseLabel() { setText('pause', paused ? tr('nobitaTown.resume') : tr('nobitaTown.pause')); }

function startGame() {
  if (phase === 'playing') { if (paused) togglePause(); return; }
  audio.unlock().then(() => audio.effect('start'));
  bells = 0; visited = 0; elapsed = 0; dist = 0; steps = 0; score = 0; lastTimeText = '';
  view.reset(); view.cameraMode = 'follow';
  clearInput();
  phase = 'playing'; paused = false;
  $('panel').hidden = true; $('tally').hidden = true; $('instructions').hidden = false; $('bigtext').hidden = true;
  document.body.classList.add('playing');
  refreshPauseLabel(); orientation();
  $('game').focus({ preventScroll: true });
}
function togglePause() {
  if (phase !== 'playing') return;
  paused = !paused;
  refreshPauseLabel();
  audio.effect(paused ? 'pause' : 'resume');
  clearInput();
  const b = $('bigtext');
  if (paused) { b.textContent = tr('nobitaTown.paused'); b.hidden = false; }
  else { b.hidden = true; $('game').focus({ preventScroll: true }); }
}
let lastResults = null;
function renderResults() {
  const { bonus, isRecord } = lastResults;
  const rows = [
    ['statTime', fmtTime(elapsed)],
    ['statDistance', Math.round(dist) + ' m'],
    ['statSteps', String(steps)],
    ['statBells', '7 × 100 = 700'],
    ['statVisits', visited + ' / 7'],
    ['statBonus', String(bonus)]
  ].map(([k, v]) => `<div><span>${tr('nobitaTown.' + k)}</span><b>${v}</b></div>`);
  rows.push(`<div class="total"><span>${tr('nobitaTown.statTotal')}</span><b>${score}</b></div>`);
  rows.push(`<div><span>${tr('nobitaTown.statBest')}</span><b>${best.score} · ${fmtTime(best.time)}</b></div>`);
  $('tally').innerHTML = rows.join(''); $('tally').hidden = false;
  $('panel-kicker').textContent = tr('nobitaTown.resultKicker') + (isRecord ? ' · ' + tr('nobitaTown.newRecord') : '');
  $('panel-title').textContent = tr('nobitaTown.resultTitle');
}
function finishRun() {
  if (phase !== 'playing') return;
  phase = 'over'; paused = false;
  audio.effect('win');
  clearInput();
  const bonus = Math.max(0, Math.round((3000 - Math.floor(elapsed) * 10) / 10) * 10);
  score = bells * 100 + bonus;
  const isRecord = !best || score > best.score;
  if (isRecord) { best = { score, time: elapsed }; saveBest(score, elapsed); }
  lastResults = { bonus, isRecord };
  renderResults();
  $('panel').hidden = false; $('bigtext').hidden = true; $('prompt').hidden = true;
  $('panel-copy').textContent = tr('nobitaTown.intro');
  $('instructions').hidden = true;
  document.body.classList.remove('playing');
  refreshStartLabel();
  $('start').focus({ preventScroll: true });
}

// --- Per-frame gameplay checks (no allocation in the hot loop).
const nearest = { sign: -1, signD: 1e9, place: -1, placeD: 1e9 };
function checkSpots() {
  nearest.sign = -1; nearest.signD = 1e9; nearest.place = -1; nearest.placeD = 1e9;
  const px = view.pos.x, pz = view.pos.z;
  for (let i = 0; i < view.signs.length; i++) {
    const s = view.signs[i], d = Math.hypot(px - s.x, pz - s.z);
    if (d < nearest.signD) { nearest.signD = d; nearest.sign = i; }
  }
  for (let i = 0; i < view.places.length; i++) {
    const p = view.places[i], d = Math.hypot(px - p.x, pz - p.z);
    if (d < nearest.placeD) { nearest.placeD = d; nearest.place = i; }
  }
  // bells: auto-collect on approach
  for (let i = 0; i < view.bells.length; i++) {
    const b = view.bells[i];
    if (b.taken) continue;
    if (Math.hypot(px - b.group.position.x, pz - b.group.position.z) < 1.9) {
      view.collectBell(i);
      bells++;
      score += 100;
      audio.effect('bell');
      toast(tr('nobitaTown.bellGot', { n: bells }));
      if (bells >= 7) { setTimeout(finishRun, 600); }
    }
  }
  // HUD place name
  const near = nearest.placeD < 17 ? nearest.place : -1;
  setText('place-label', near >= 0 ? tr('nobitaTown.place_' + view.places[near].id) : tr('nobitaTown.plaza'));
  view._nearPlace = near;
  // sign prompt
  const showPrompt = nearest.sign >= 0 && nearest.signD < 3;
  $('prompt').hidden = !showPrompt;
  if (showPrompt && interactQueued) {
    const s = view.signs[nearest.sign], key = 'nobitaTown.place_' + view.places[s.i].id;
    let msg = tr(key) + ' — ' + tr(key + '_desc');
    if (!s.lit) {
      view.setSignLit(s.i, true);
      visited++;
      audio.effect('sign');
      msg = tr('nobitaTown.signLit', { n: visited }) + ' · ' + msg;
    }
    toast(msg, 3600);
    interactQueued = false;
  }
}

function updateHud() {
  setText('bells', bells + ' / 7');
  setText('score', String(score).padStart(4, '0'));
  const t = fmtTime(elapsed);
  if (t !== lastTimeText) { setText('time', t); lastTimeText = t; }
}

// --- Main loop.
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) {
    const c = $('world');
    if (c.clientWidth !== frame.w || c.clientHeight !== frame.h) { frame.w = c.clientWidth; frame.h = c.clientHeight; view.resize(); }
    orientation();
  }
  if (phase === 'playing' && !paused) {
    let mx = 0, mz = 0, run = false;
    if (stick.id !== null && stick.mag > .25) {
      mx = stick.x; mz = stick.y; run = stick.mag > .92;
    } else {
      mx = (held.has('KeyD') || pointerKeys.has('KeyD') ? 1 : 0) - (held.has('KeyA') || pointerKeys.has('KeyA') ? 1 : 0);
      mz = (held.has('KeyW') || pointerKeys.has('KeyW') ? 1 : 0) - (held.has('KeyS') || pointerKeys.has('KeyS') ? 1 : 0);
      run = held.has('ShiftLeft') || held.has('ShiftRight');
      const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    }
    const jump = jumpQueued; jumpQueued = false;
    view.update(dt, mx, mz, run, jump);
    dist += view.frameDist;
    steps = Math.floor(dist / .72);
    elapsed += dt;
    checkSpots();
  } else {
    view.update(paused ? 0 : dt, 0, 0, false, false);
    $('prompt').hidden = true;
  }
  updateHud();
  view.render();
  requestAnimationFrame(frame);
}

// --- Keyboard (no mouse / pointer lock needed).
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && phase === 'playing') e.preventDefault();
  if (e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'A') return;
    if (phase === 'title' || phase === 'over' || paused) { e.preventDefault(); paused ? togglePause() : startGame(); }
    return;
  }
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.repeat) return;
  held.add(e.code); tapped.add(e.code);
  if (e.code === 'KeyK') jumpQueued = true;
  if (e.code === 'KeyJ') interactQueued = true;
});
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => { clearInput(); if (phase === 'playing' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (phase === 'playing' && !paused) togglePause(); } last = performance.now(); });

// --- Buttons.
$('start').onclick = startGame;
$('pause').onclick = togglePause;
$('full').onclick = requestFull;
$('sound').onclick = async () => { await audio.unlock(); audio.mute(); refreshSoundLabel(); };
$('touch-toggle').onclick = () => {
  const on = $('touch').hidden;
  $('touch').hidden = !on;
  document.body.classList.toggle('touch-mode', on);
  if (!on) clearInput();
};
function applyLang() {
  if (window.tbApplyI18n) window.tbApplyI18n(document);
  refreshSoundLabel(); refreshPauseLabel(); refreshStartLabel();
  setText('prompt-text', tr('nobitaTown.promptJ'));
  setText('kb-help', tr('nobitaTown.help'));
  const near = view._nearPlace;
  setText('place-label', near >= 0 ? tr('nobitaTown.place_' + view.places[near].id) : tr('nobitaTown.plaza'));
  view.refreshTexts();
  if (phase === 'over' && lastResults) renderResults();
}
$('lang').onclick = () => {
  if (window.tbSetLocale) { tbSetLocale(tbGetLocale() === 'zh-CN' ? 'en' : 'zh-CN'); return; }
  const en = !(document.documentElement.lang || '').toLowerCase().startsWith('en');
  document.documentElement.lang = en ? 'en' : 'zh-CN';
  applyLang();
};
document.addEventListener('tb:locale', applyLang);

// --- Touch controls (Pointer Events, tracked by pointerId).
document.querySelectorAll('[data-hold]').forEach(btn => {
  const code = btn.dataset.hold;
  const down = e => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/inactive pointer */ }
    pointerKeys.add(code); btn.classList.add('held');
    if (code === 'KeyJ') interactQueued = true;
    if (code === 'KeyK') jumpQueued = true;
    audio.unlock();
  };
  const up = e => { e.preventDefault(); pointerKeys.delete(code); btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
document.querySelectorAll('[data-cam]').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); audio.unlock();
    const a = btn.dataset.cam;
    if (a === 'prev') view.cycle(-1); else if (a === 'next') view.cycle(1); else view.resetCam();
  });
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

// Virtual stick: analog vector with a deadzone; inverse-transformed in portrait.
const stickEl = $('stick'), knob = $('knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = stickEl.clientWidth * .38;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  if ($('game').classList.contains('portrait-play')) { const px = dx; dx = dy; dy = -px; }
  const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  const mag = Math.min(1, d / max);
  stick.mag = mag;
  if (mag < .25) { stick.x = 0; stick.y = 0; return; }
  stick.x = dx / max; stick.y = -dy / max;   // screen up = forward
}
stickEl.addEventListener('pointerdown', e => { e.preventDefault(); stick.id = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/inactive pointer */ } moveStick(e); audio.unlock(); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
const releaseStick = e => {
  if (e.pointerId !== stick.id) return;
  stick = { id: null, x: 0, y: 0, mag: 0 };
  knob.style.transform = 'translate(0,0)';
};
stickEl.addEventListener('pointerup', releaseStick);
stickEl.addEventListener('pointercancel', releaseStick);
stickEl.addEventListener('lostpointercapture', releaseStick);
stickEl.addEventListener('contextmenu', e => e.preventDefault());

// --- Portrait: rotate the whole game container 90° into a landscape layout (no blocking overlay).
let orientationBlocked = false;
function orientation() {
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  const rotate = mobileDevice && height > width && phase !== 'title';
  const game = $('game');
  if (rotate !== game.classList.contains('portrait-play')) clearInput();
  game.classList.toggle('portrait-play', rotate);
  if (rotate) { game.style.width = height + 'px'; game.style.height = width + 'px'; }
  else { game.style.width = ''; game.style.height = ''; }
  orientationBlocked = false;
  view.resize();
}

$('touch').hidden = !mobileDevice;
document.body.classList.toggle('touch-mode', mobileDevice);
addEventListener('resize', () => { clearInput(); orientation(); });
document.addEventListener('fullscreenchange', () => { clearInput(); orientation(); });
addEventListener('orientationchange', () => setTimeout(() => { orientation(); }, 120));

applyLang(); orientation(); updateHud();
$('game').focus({ preventScroll: true });
requestAnimationFrame(frame);

// --- QA hook: only with ?qa=1, mirrors the tank-3d pattern. Not reachable in normal play.
if (new URLSearchParams(location.search).has('qa')) {
  window.nobitaQa = {
    view, audio,
    get phase() { return phase; }, get paused() { return paused; },
    get bells() { return bells; }, get visited() { return visited; },
    get elapsed() { return elapsed; }, get score() { return score; },
    get dist() { return dist; },
    start: startGame, finish: finishRun,
    collect(i) { view.collectBell(i); bells++; score += 100; },
    visitAll() { view.signs.forEach((s, i) => { if (!s.lit) { view.setSignLit(i, true); visited++; } }); },
    teleport(i) { const p = view.places[i]; view.pos.x = p.x; view.pos.z = p.z; }
  };
}
