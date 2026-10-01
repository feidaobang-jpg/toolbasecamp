import { createScene, CELL, COLS, ROWS } from './scene.js?v=pvz1';
import { GameAudio } from './audio.js?v=pvz1';

const $ = id => document.getElementById(id);
// t(): site locale first (pvz3d.* is merged into TB_LOCALES by index.html), then the in-page GAME_I18N dict.
function tr(key, params) {
  if (typeof window.t === 'function') { const v = window.t(key, params); if (v && v !== key) return v; }
  const lang = document.documentElement.lang || 'zh-CN';
  const pack = (window.GAME_I18N && (lang.startsWith('en') ? window.GAME_I18N.en : window.GAME_I18N.zh).pvz3d) || {};
  let v = pack[key.replace('pvz3d.', '')];
  if (v == null) return key;
  return String(v).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] != null ? params[k] : m));
}

// --- Tunables ---------------------------------------------------------------
const PLANTS = {
  sunflower: { cost: 50, hp: 300, cd: 5 },
  peashooter: { cost: 100, hp: 300, cd: 5 },
  snowpea: { cost: 175, hp: 300, cd: 5 },
  wallnut: { cost: 50, hp: 2600, cd: 16 },
  cherry: { cost: 150, hp: 9999, cd: 24 }
};
const CARD_ORDER = ['sunflower', 'peashooter', 'snowpea', 'wallnut', 'cherry'];
const ZOMBIES = {
  normal: { hp: 190, speed: .26, bite: .5, dmg: 34, score: 100 },
  cone: { hp: 430, speed: .26, bite: .5, dmg: 34, score: 150 },
  bucket: { hp: 830, speed: .24, bite: .5, dmg: 34, score: 250 },
  runner: { hp: 170, speed: .55, bite: .5, dmg: 34, score: 150 },
  garg: { hp: 2800, speed: .17, bite: 1.2, dmg: 1500, smash: true, score: 1500 }
};
const PEA_DMG = 25, PEA_RATE = 1.4, PEA_SPEED = 7, SUN_VALUE = 25;
const DIRKEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const BEST_KEY = 'tb-game-pvz3d-best';

// --- State ------------------------------------------------------------------
let best = { level: 1, score: 0 };
try { const raw = localStorage.getItem(BEST_KEY); if (raw) { const p = JSON.parse(raw); if (p && Number.isFinite(p.score)) best = { level: Math.max(1, p.level | 0), score: Math.max(0, p.score | 0) }; } } catch (e) { /* storage unavailable */ }
function saveBest(level, score) {
  let changed = false;
  if (level > best.level) { best.level = level; changed = true; }
  if (score > best.score) { best.score = score; changed = true; }
  if (changed) try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* storage unavailable */ }
}

function freshWorld(level) {
  return {
    level, sun: 50, time: 0, playing: false,
    grid: new Array(COLS * ROWS).fill(null),
    zombies: [], peas: [], suns: [],
    cards: (() => { const c = {}; for (const k of CARD_ORDER) c[k] = { cool: 0 }; return c; })(),
    mowers: Array.from({ length: ROWS }, (_, r) => ({ row: r, x: -.75, state: 'idle' })),
    hpMult: 1 + (level - 1) * .13, spMult: Math.min(1.5, 1 + (level - 1) * .05),
    waves: [], waveIndex: 0, spawned: 0, total: 0, allSpawned: false,
    killed: 0, sunCollected: 0, score: 0,
    skySunT: 4.5, groanT: 2.5, nextId: 1,
    cursor: { col: 4, row: 2, visible: false, valid: true },
    events: []
  };
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildWaves(level) {
  const w1 = [], w2 = [], w3 = [];
  const add = (a, k, n) => { for (let i = 0; i < n; i++) a.push(k); };
  add(w1, 'normal', 3 + Math.min(5, level));
  if (level >= 3) add(w1, 'runner', Math.min(2, Math.floor(level / 3)));
  add(w2, 'normal', 3 + Math.min(6, level));
  add(w2, 'cone', 1 + Math.floor(level * .6));
  if (level >= 2) add(w2, 'runner', Math.min(3, level - 1));
  add(w3, 'normal', 4 + Math.min(8, level));
  add(w3, 'cone', 1 + Math.floor(level * .7));
  if (level >= 2) add(w3, 'bucket', Math.min(4, Math.floor(level / 2)));
  if (level >= 3) add(w3, 'runner', Math.min(4, level - 1));
  add(w3, 'garg', 1 + Math.floor((level - 1) / 2));
  return [
    { list: shuffle(w1), huge: false, i: 0, next: 0, phase: 'announce', t: 2.4, wait: 40 },
    { list: shuffle(w2), huge: false, i: 0, next: 0, phase: 'announce', t: 2.2, wait: 40 },
    { list: shuffle(w3), huge: true, i: 0, next: 0, phase: 'announce', t: 3.4, wait: 55 }
  ];
}

const world = freshWorld(1);
const audio = new GameAudio();
const scene = createScene($('world'), world);
let phase = 'title', paused = false, selected = 0, shovelMode = false, runScore = 0, lastOutcome = '';
const mobileDevice = matchMedia('(pointer: coarse) and (hover: none)').matches;

// --- Small helpers ----------------------------------------------------------
function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function toast(text, ms = 1600) { const e = $('toast'); e.textContent = text; e.classList.add('visible'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('visible'), ms); }
function bigText(text, cls, sec) {
  const b = $('bigtext'); b.textContent = text; b.className = cls; b.hidden = false;
  clearTimeout(bigText.t);
  if (sec < 1e7) bigText.t = setTimeout(() => { b.hidden = true; }, sec * 1000);
}
function refreshSoundLabel() { setText('sound', audio.enabled ? tr('pvz3d.soundOn') : tr('pvz3d.soundOff')); }
function refreshPauseLabel() { setText('pause', paused ? tr('pvz3d.resume') : tr('pvz3d.pause')); }

// --- Cards UI ---------------------------------------------------------------
let cardEls = [], shovelEl = null;
function buildCards() {
  const wrap = $('cards'); wrap.innerHTML = ''; cardEls = [];
  CARD_ORDER.forEach((k, i) => {
    const el = document.createElement('button');
    el.className = 'card'; el.type = 'button';
    el.innerHTML = `<i class="ico ${k}"></i><span class="cost">${PLANTS[k].cost}</span><span class="key">${i + 1}</span><i class="cool"></i>`;
    el.addEventListener('pointerdown', e => { e.preventDefault(); audio.unlock(); selectCard(i); });
    wrap.appendChild(el); cardEls.push(el);
  });
  shovelEl = document.createElement('button');
  shovelEl.id = 'shovel-btn'; shovelEl.type = 'button';
  shovelEl.innerHTML = '<i class="ico"></i>';
  shovelEl.addEventListener('pointerdown', e => { e.preventDefault(); audio.unlock(); toggleShovel(); });
  wrap.appendChild(shovelEl);
  refreshCardTitles();
}
function refreshCardTitles() {
  CARD_ORDER.forEach((k, i) => {
    const cap = k[0].toUpperCase() + k.slice(1);
    cardEls[i].title = `${tr('pvz3d.card' + cap)} · ${tr('pvz3d.d' + cap)}`;
    cardEls[i].setAttribute('aria-label', tr('pvz3d.card' + cap));
  });
  shovelEl.title = tr('pvz3d.shovel') + ' (K)';
}
function selectCard(i) {
  if (phase !== 'playing') return;
  shovelMode = false; selected = i;
  audio.effect('pick');
}
function toggleShovel() {
  if (phase !== 'playing') return;
  shovelMode = !shovelMode;
  audio.effect('pick');
}

// --- Actions ----------------------------------------------------------------
function plantAt(col, row, kind) {
  const def = PLANTS[kind], card = world.cards[kind], idx = row * COLS + col;
  if (world.grid[idx]) { toast(tr('pvz3d.toastOccupied')); audio.effect('error'); return false; }
  if (card.cool > 0) { toast(tr('pvz3d.toastCool')); audio.effect('error'); return false; }
  if (world.sun < def.cost) { toast(tr('pvz3d.toastSun')); audio.effect('error'); return false; }
  world.sun -= def.cost; card.cool = def.cd;
  world.grid[idx] = { kind, hp: def.hp, maxHp: def.hp, row, col, age: 0, timer: kind === 'sunflower' ? 6 : PEA_RATE, fuse: .9, recoil: 0, flash: 0, glow: 0 };
  world.events.push({ type: 'plant', x: col + .5, z: row + .5 });
  return true;
}
function doShovel(col, row) {
  const idx = row * COLS + col;
  if (!world.grid[idx]) { toast(tr('pvz3d.toastEmpty')); return; }
  world.grid[idx] = null;
  world.events.push({ type: 'shovel', x: col + .5, z: row + .5 });
}
function collectSun(s) {
  if (!s.alive) return;
  s.alive = false; world.sun += SUN_VALUE; world.sunCollected += SUN_VALUE;
  world.events.push({ type: 'sunpick', x: s.x, z: s.z });
}
function sunNear(x, z, radius = .8) {
  let bestS = null, bd = radius;
  for (const s of world.suns) {
    if (!s.alive) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; bestS = s; }
  }
  return bestS;
}
function actionJ() {
  if (phase !== 'playing' || paused) return;
  const { col, row } = world.cursor;
  const s = sunNear(col + .5, row + .5);
  if (s) { collectSun(s); return; }
  if (shovelMode) { doShovel(col, row); return; }
  if (selected < 0) { toast(tr('pvz3d.toastPick')); audio.effect('error'); return; }
  plantAt(col, row, CARD_ORDER[selected]);
}
function actionK() {
  if (phase !== 'playing' || paused) return;
  doShovel(world.cursor.col, world.cursor.row);
}
function moveCursor(dir) {
  if (phase !== 'playing') return;
  const c = world.cursor;
  if (dir === 'up') c.row = Math.max(0, c.row - 1);
  if (dir === 'down') c.row = Math.min(ROWS - 1, c.row + 1);
  if (dir === 'left') c.col = Math.max(0, c.col - 1);
  if (dir === 'right') c.col = Math.min(COLS - 1, c.col + 1);
}

// --- Camera presets ---------------------------------------------------------
const CAM_PRESETS = [.68, 1.42], CAM_DEFAULT = .95;
let camIndex = -1;
function applyCam() { scene.setPitch(camIndex < 0 ? CAM_DEFAULT : CAM_PRESETS[camIndex]); }
function camStep(d) { camIndex = ((camIndex + d) % CAM_PRESETS.length + CAM_PRESETS.length) % CAM_PRESETS.length; applyCam(); }
function camReset() { camIndex = -1; applyCam(); }

// --- Simulation -------------------------------------------------------------
function spawnSkySun() {
  world.suns.push({ x: 1.2 + Math.random() * 7.2, z: .5 + Math.random() * 4, y: 7, state: 'fall', t: 0, life: 11, alive: true });
  world.events.push({ type: 'sunSpawn' });
}
function spawnFlowerSun(row, col) {
  world.suns.push({ x: col + .5 + (Math.random() - .5) * .7, z: row + .5 + (Math.random() - .5) * .7, y: .55, state: 'sit', t: 0, life: 10, alive: true });
  world.events.push({ type: 'sunSpawn', x: col + .5, z: row + .5 });
}
function spawnZombie(kind) {
  const w = world, def = ZOMBIES[kind];
  const z = {
    id: w.nextId++, kind, def, row: Math.floor(Math.random() * ROWS), x: 9.7 + Math.random() * .9,
    hp: def.hp * w.hpMult, maxHp: def.hp * w.hpMult, speed: def.speed * w.spMult,
    slow: 0, flash: 0, dead: false, deadT: 0, eating: false, bite: def.bite
  };
  w.zombies.push(z);
  w.events.push({ type: 'spawn', x: z.x, z: z.row + .5 });
}
function killZombie(z) {
  if (z.dead) return;
  z.dead = true; z.deadT = 0; world.killed++; world.score += z.def.score;
  world.events.push({ type: 'zombiedie', x: z.x, z: z.row + .5 });
}
function hitZombie(z, pea) {
  z.hp -= PEA_DMG; z.flash = .12;
  if (pea.snow) z.slow = 4;
  world.events.push({ type: 'zombieHit', x: z.x, z: z.row + .5 });
  if (z.hp <= 0) killZombie(z);
}
function explodeCherry(row, col) {
  const idx = row * COLS + col;
  if (!world.grid[idx] || world.grid[idx].kind !== 'cherry') return;
  world.grid[idx] = null;
  world.events.push({ type: 'boom', x: col + .5, z: row + .5 });
  for (const z of world.zombies) {
    if (z.dead) continue;
    if (Math.abs(z.row - row) <= 1 && z.x > col - .9 && z.x < col + 2.1) {
      z.hp -= 1800; z.flash = .2;
      if (z.hp <= 0) killZombie(z);
    }
  }
}
function updateWaves(dt) {
  const w = world;
  if (w.waveIndex >= w.waves.length) { w.allSpawned = true; return; }
  const cur = w.waves[w.waveIndex];
  if (cur.phase === 'announce') { cur.t -= dt; if (cur.t <= 0) cur.phase = 'run'; return; }
  if (cur.i < cur.list.length) {
    cur.next -= dt;
    while (cur.next <= 0 && cur.i < cur.list.length) {
      spawnZombie(cur.list[cur.i++]); w.spawned++;
      cur.next += cur.huge ? .7 + Math.random() * 1.1 : 2 + Math.random() * 1.6;
    }
  } else {
    const alive = w.zombies.reduce((n, z) => n + (z.dead ? 0 : 1), 0);
    if (w.waveIndex + 1 < w.waves.length) {
      cur.wait -= dt;
      if (alive <= 2 || cur.wait <= 0) {
        w.waveIndex++;
        w.events.push({ type: w.waves[w.waveIndex].huge ? 'huge' : 'wave', n: w.waveIndex + 1 });
      }
    } else w.allSpawned = true;
  }
}
function stepWorld(dt) {
  const w = world; w.time += dt;
  for (const k of CARD_ORDER) { const c = w.cards[k]; if (c.cool > 0) c.cool = Math.max(0, c.cool - dt); }
  w.skySunT -= dt;
  if (w.skySunT <= 0) { w.skySunT = 7.5 + Math.random() * 2.5; spawnSkySun(); }
  // Plants.
  for (let i = 0; i < w.grid.length; i++) {
    const p = w.grid[i]; if (!p) continue;
    p.age += dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.glow > 0) p.glow = Math.max(0, p.glow - dt * 2);
    if (p.kind === 'sunflower') {
      p.timer -= dt;
      if (p.timer <= 0) { p.timer = 9 + Math.random() * 1.5; p.glow = 1; spawnFlowerSun(p.row, p.col); }
    } else if (p.kind === 'cherry') {
      p.fuse -= dt;
      if (p.fuse <= 0) { explodeCherry(p.row, p.col); continue; }
    } else if (p.kind === 'peashooter' || p.kind === 'snowpea') {
      p.recoil = Math.max(0, p.recoil - dt * 4);
      const has = w.zombies.some(z => !z.dead && z.row === p.row && z.x > p.col + .2 && z.x < 10.4);
      if (has) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.timer = PEA_RATE; p.recoil = 1;
          w.peas.push({ row: p.row, x: p.col + .85, snow: p.kind === 'snowpea', alive: true });
          w.events.push({ type: p.kind === 'snowpea' ? 'iceShoot' : 'shoot', x: p.col + .5, z: p.row + .5 });
        }
      } else if (p.timer > .4) p.timer = .4;
    }
    if (p.hp <= 0) { w.grid[i] = null; w.events.push({ type: 'shovel', x: p.col + .5, z: p.row + .5 }); }
  }
  // Zombies.
  for (const z of w.zombies) {
    if (z.dead) { z.deadT += dt; continue; }
    if (z.flash > 0) z.flash -= dt;
    if (z.slow > 0) z.slow -= dt;
    const frontCol = Math.floor(z.x - .35);
    const p = (frontCol >= 0 && frontCol < COLS) ? w.grid[z.row * COLS + frontCol] : null;
    if (p) {
      z.eating = true; z.bite -= dt;
      if (z.bite <= 0) {
        z.bite = z.def.bite; p.hp -= z.def.dmg;
        w.events.push({ type: z.def.smash ? 'smash' : 'chomp', x: z.x, z: z.row + .5 });
      }
    } else {
      z.eating = false;
      z.x -= z.speed * (z.slow > 0 ? .5 : 1) * dt;
    }
    if (z.x < -.05) {
      const m = w.mowers[z.row];
      if (m.state === 'idle') { m.state = 'run'; w.events.push({ type: 'mower', z: z.row + .5 }); toast(tr('pvz3d.mower')); }
      else if (m.state === 'gone' && z.x < -.5) { doLose(); return; }
    }
  }
  // Mowers.
  for (const m of w.mowers) if (m.state === 'run') {
    m.x += 8 * dt;
    for (const z of w.zombies) if (!z.dead && z.row === m.row && Math.abs(z.x - m.x) < .75) killZombie(z);
    if (m.x > 10.8) m.state = 'gone';
  }
  // Peas.
  for (const pea of w.peas) {
    if (!pea.alive) continue;
    pea.x += PEA_SPEED * dt;
    if (pea.x > 10.4) { pea.alive = false; continue; }
    for (const z of w.zombies) {
      if (z.dead || z.row !== pea.row) continue;
      if (Math.abs(z.x - pea.x) < .32) { hitZombie(z, pea); pea.alive = false; break; }
    }
  }
  if (w.peas.some(p => !p.alive)) w.peas = w.peas.filter(p => p.alive);
  // Suns.
  for (const s of w.suns) {
    s.t += dt;
    if (s.state === 'fall') { s.y -= 2.2 * dt; if (s.y <= .55) { s.y = .55; s.state = 'sit'; } }
    else if (s.state === 'sit') { s.life -= dt; if (s.life <= 0) s.alive = false; }
  }
  if (w.suns.some(s => !s.alive)) w.suns = w.suns.filter(s => s.alive);
  // Corpse cleanup.
  if (w.zombies.some(z => z.dead && z.deadT > 1.1)) w.zombies = w.zombies.filter(z => !(z.dead && z.deadT > 1.1));
  // Ambient groans.
  w.groanT -= dt;
  if (w.groanT <= 0) {
    w.groanT = 3.5 + Math.random() * 4;
    if (w.zombies.some(z => !z.dead)) w.events.push({ type: 'groan', pitch: .8 + Math.random() * .5 });
  }
  updateWaves(dt);
  if (w.allSpawned && w.zombies.every(z => z.dead)) doWin();
}
function doWin() {
  if (!world.playing) return;
  world.playing = false;
  world.score += 1000;
  world.events.push({ type: 'win' });
}
function doLose() {
  if (!world.playing) return;
  world.playing = false;
  world.events.push({ type: 'lose' });
}

// --- Flow -------------------------------------------------------------------
function startGame() {
  if (phase === 'playing') { if (paused) togglePause(); return; }
  audio.unlock().then(() => audio.effect('start'));
  const nextLevel = phase === 'over' && lastOutcome === 'win' ? world.level + 1 : phase === 'over' ? world.level : 1;
  if (phase === 'over' && lastOutcome !== 'win') runScore = 0;   // fresh attempt after a defeat
  Object.assign(world, freshWorld(nextLevel));
  world.waves = buildWaves(nextLevel);
  world.total = world.waves.reduce((s, v) => s + v.list.length, 0);
  world.waveIndex = 0;
  world.playing = true;
  world.events.push({ type: 'level', n: nextLevel });
  world.events.push({ type: 'wave', n: 1 });
  scene.reset();
  phase = 'playing'; paused = false;
  clearInput();
  $('panel').hidden = true; $('tally').hidden = true; $('instructions').hidden = true;
  document.body.classList.add('playing');
  refreshPauseLabel(); orientation();
  $('game').focus({ preventScroll: true });
}
function togglePause() {
  if (phase !== 'playing') return;
  paused = !paused; refreshPauseLabel(); audio.effect('pause');
  if (paused) { clearInput(); bigText(tr('pvz3d.paused'), 'pause', 1e9); }
  else $('bigtext').hidden = true;
}
function doWinUI() {
  audio.effect('win');
  runScore += world.score;
  saveBest(world.level + 1, runScore);
  phase = 'over'; lastOutcome = 'win';
  setTimeout(() => { if (phase === 'over' && lastOutcome === 'win') showPanel('win'); }, 1400);
}
function doLoseUI() {
  audio.effect('lose');
  saveBest(world.level, runScore + world.score);
  phase = 'over'; lastOutcome = 'lose';
  bigText(tr('pvz3d.loseTitle'), 'huge', 2.6);
  setTimeout(() => { if (phase === 'over' && lastOutcome === 'lose') showPanel('lose'); }, 2200);
}
function showPanel(kind) {
  $('bigtext').hidden = true;
  const won = kind === 'win';
  $('panel').hidden = false; document.body.classList.remove('playing');
  $('panel-kicker').textContent = won ? tr('pvz3d.winKicker') : tr('pvz3d.loseKicker');
  $('panel-title').textContent = won ? tr('pvz3d.winTitle', { n: world.level }) : tr('pvz3d.loseTitle');
  $('panel-copy').textContent = won ? tr('pvz3d.winCopy') : tr('pvz3d.loseCopy');
  const rows = won
    ? [[tr('pvz3d.statScore'), runScore], [tr('pvz3d.statKills'), world.killed], [tr('pvz3d.statSun'), world.sunCollected], [tr('pvz3d.statBest'), best.score]]
    : [[tr('pvz3d.statScore'), runScore + world.score], [tr('pvz3d.statLevel'), world.level], [tr('pvz3d.statBest'), best.score]];
  rows.push([tr('pvz3d.statBest') + ' · ' + tr('pvz3d.statLevel'), best.level]);
  $('tally').innerHTML = rows.map(([k, v], i) => `<div class="${i === rows.length - 1 ? 'total' : ''}"><span>${k}</span><b>${v}</b></div>`).join('');
  $('tally').hidden = false;
  $('instructions').hidden = true;
  $('start').textContent = won ? tr('pvz3d.nextLevel', { n: world.level + 1 }) : tr('pvz3d.retryLevel', { n: world.level });
  $('start').focus({ preventScroll: true });
}

// --- HUD --------------------------------------------------------------------
function updateHud() {
  const w = world;
  setText('sun-count', String(w.sun));
  setText('level-label', tr('pvz3d.levelBanner', { n: w.level }));
  setText('wave-label', (w.waves.length ? Math.min(w.waveIndex + 1, w.waves.length) : 0) + '/3');
  setText('kills', String(w.killed));
  const fill = $('wavebar-fill'), pct = w.total ? Math.min(100, w.spawned / w.total * 100) : 0;
  if (fill.style.width !== pct + '%') fill.style.width = pct + '%';
  const cur = w.cursor;
  cur.visible = phase === 'playing' && w.playing;
  const idx = cur.row * COLS + cur.col;
  cur.valid = shovelMode ? !!w.grid[idx] : selected >= 0 && !w.grid[idx];
  CARD_ORDER.forEach((k, i) => {
    const el = cardEls[i], def = PLANTS[k], card = w.cards[k];
    const h = (card.cool > 0 ? card.cool / def.cd * 100 : 0).toFixed(1) + '%';
    if (el._h !== h) { el.querySelector('.cool').style.height = h; el._h = h; }
    el.classList.toggle('poor', w.sun < def.cost || card.cool > 0);
    el.classList.toggle('sel', !shovelMode && selected === i);
    el.classList.toggle('cherry-sel', !shovelMode && selected === i && k === 'cherry');
  });
  shovelEl.classList.toggle('sel', shovelMode);
}

// --- Events → UI/audio ------------------------------------------------------
function handleEvents() {
  for (const e of world.events) {
    scene.effect(e); audio.effect(e);
    if (e.type === 'level') bigText(tr('pvz3d.levelBanner', { n: e.n }), 'level', 1.9);
    else if (e.type === 'wave') bigText(tr('pvz3d.waveTag', { n: e.n }), 'wave', 2.1);
    else if (e.type === 'huge') bigText(tr('pvz3d.hugeWave'), 'huge', 3.1);
    else if (e.type === 'win') doWinUI();
    else if (e.type === 'lose') doLoseUI();
  }
  world.events.length = 0;
}

// --- Main loop --------------------------------------------------------------
let last = performance.now(), orientationBlocked = false;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) {
    const c = $('world');
    if (c.clientWidth !== frame.w || c.clientHeight !== frame.h) { frame.w = c.clientWidth; frame.h = c.clientHeight; scene.resize(); }
    orientation();
  }
  if (phase === 'playing' && !paused && world.playing) stepWorld(dt);
  handleEvents();
  updateHud();
  scene.update(paused ? 0 : dt);
  requestAnimationFrame(frame);
}

// --- Input: keyboard --------------------------------------------------------
function clearInput() { shovelMode = false; }
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK'].includes(e.code) && document.body.classList.contains('playing')) e.preventDefault();
  if (e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'A') return;
    e.preventDefault();
    if (paused) togglePause(); else if (phase === 'title' || phase === 'over') startGame();
    return;
  }
  if (e.code === 'Escape') { togglePause(); return; }
  const isDir = e.code in DIRKEYS;
  if (e.repeat && !isDir) return;
  if (isDir) moveCursor(DIRKEYS[e.code]);
  else if (e.code === 'KeyJ') actionJ();
  else if (e.code === 'KeyK') actionK();
  else if (/^Digit[1-5]$/.test(e.code)) selectCard(+e.code.slice(5) - 1);
  else if (e.code === 'KeyQ') camStep(-1);
  else if (e.code === 'KeyE') camStep(1);
  else if (e.code === 'KeyC') camReset();
});
addEventListener('blur', () => { if (phase === 'playing' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'playing' && !paused) togglePause(); last = performance.now(); });

// --- Input: touch / mouse on the lawn ---------------------------------------
const canvas = $('world');
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); audio.unlock();
  if (phase !== 'playing' || paused || !world.playing) return;
  const p = scene.pick(e.clientX, e.clientY);
  if (!p) return;
  if (p.x < -.6 || p.x > COLS + .7 || p.z < -.6 || p.z > ROWS + .6) return;
  const s = sunNear(p.x, p.z, .9);
  if (s) { collectSun(s); return; }
  const col = Math.max(0, Math.min(COLS - 1, Math.floor(p.x))), row = Math.max(0, Math.min(ROWS - 1, Math.floor(p.z)));
  world.cursor.col = col; world.cursor.row = row;
  if (shovelMode) doShovel(col, row);
  else if (selected >= 0) plantAt(col, row, CARD_ORDER[selected]);
  else { toast(tr('pvz3d.toastPick')); audio.effect('error'); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.querySelectorAll('[data-cam]').forEach(btn => {
  const act = { prev: () => camStep(-1), next: () => camStep(1), reset: camReset }[btn.dataset.cam];
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('held'); act(); });
  const up = () => btn.classList.remove('held');
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
});

// --- Buttons ----------------------------------------------------------------
function requestFull() {
  const el = document.documentElement;
  try {
    if (document.fullscreenElement !== el && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => { if (mobileDevice) toast(tr('pvz3d.fullFail'), 2600); });
  } catch (e) { /* unsupported */ }
}
$('start').onclick = startGame;
$('pause').onclick = togglePause;
$('full').onclick = requestFull;
$('sound').onclick = async () => { await audio.unlock(); audio.mute(); refreshSoundLabel(); };
$('touch-toggle').onclick = () => { $('touch').hidden = !$('touch').hidden; document.body.classList.toggle('touch-mode', !$('touch').hidden); };
$('lang').onclick = () => tbSetLocale(tbGetLocale() === 'zh-CN' ? 'en' : 'zh-CN');

// --- Orientation (portrait phones rotate the container to landscape) --------
function orientation() {
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  const rotate = mobileDevice && height > width && phase !== 'title';
  const game = $('game');
  game.classList.toggle('portrait-play', rotate);
  if (rotate) { game.style.width = height + 'px'; game.style.height = width + 'px'; }
  else { game.style.width = ''; game.style.height = ''; }
  orientationBlocked = false;
}
addEventListener('resize', () => { orientation(); scene.resize(); });
document.addEventListener('fullscreenchange', () => { orientation(); scene.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { scene.resize(); orientation(); }, 120));

// --- Locale switch ----------------------------------------------------------
document.addEventListener('tb:locale', () => {
  refreshSoundLabel(); refreshPauseLabel(); refreshCardTitles();
  if (phase === 'over') showPanel(lastOutcome === 'win' ? 'win' : 'lose');
});

// --- Boot -------------------------------------------------------------------
for (const k of CARD_ORDER) world.cards[k] = { cool: 0 };
buildCards();
refreshSoundLabel(); refreshPauseLabel(); orientation(); updateHud();
$('touch').hidden = !mobileDevice;
document.body.classList.toggle('touch-mode', mobileDevice);
$('game').focus({ preventScroll: true });
requestAnimationFrame(frame);

// --- QA hook: only mounted with ?qa=1, never exposed in normal play ---------
if (new URLSearchParams(location.search).has('qa')) {
  window.pvzQa = {
    world, scene, audio,
    get phase() { return phase; }, get paused() { return paused; }, get best() { return best; },
    get runScore() { return runScore; }, get outcome() { return lastOutcome; },
    start: startGame, pause: togglePause,
    addSun(n = 500) { world.sun += n; },
    win() { doWin(); },
    lose() { doLose(); },
    hugeWave() { world.waveIndex = 2; world.events.push({ type: 'huge', n: 3 }); },
    spawn(kind = 'normal') { spawnZombie(kind); },
    killAll() { for (const z of world.zombies) if (!z.dead) killZombie(z); },
    setCard(i) { selectCard(i); },
    cursor(col, row) { world.cursor.col = col; world.cursor.row = row; }
  };
}
