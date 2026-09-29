// Tank Battle 3D · Stage 1 — deterministic gameplay, no rendering imports (testable in Node).
// Field: 26×26 cells (one cell = one 8px NES block). Positions are tank centres in cell units;
// x grows to the right, z grows toward the player's base (row 25). Directions: 0 up, 1 right, 2 down, 3 left.
export const N = 26;
export const EMPTY = 0, BRICK = 1, STEEL = 2, BASE = 3;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const HALF = 0.98;                      // tank half-size (a hair under one cell so 2-cell lanes fit)
export const BULLET_R = 0.18;
export const PLAYER_SPAWN = { x: 9, z: 25 };
export const ENEMY_SPAWNS = [{ x: 1, z: 1 }, { x: 13, z: 1 }, { x: 25, z: 1 }];
export const BASE_CENTER = { x: 13, z: 25 };
export const BASE_WALL = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [14, 24], [11, 25], [14, 25]];
export const MAX_ON_FIELD = 4;
export const SPAWN_INTERVAL = 2.6;

// Original layout written for this demo in the spirit of the classic first stage:
// brick columns, a steel core, steel edge posts and a brick fort around the eagle.
export const STAGE1 = [
  '..........................',
  '..........................',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##@@##..##..##..',
  '..##..##..##@@##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '..........##..##..........',
  '..........##..##..........',
  '##..####..........####..##',
  '@@..####..........####..@@',
  '..........##..##..........',
  '..........##..##..........',
  '..##..##..######..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '...........####...........',
  '...........#EE#...........',
  '...........#EE#...........'
];

export const ENEMY_TYPES = {
  basic: { speed: 3.1, bullet: 13, hp: 1, score: 100 },
  fast: { speed: 6.2, bullet: 13, hp: 1, score: 200 },
  power: { speed: 3.6, bullet: 24, hp: 1, score: 300 },
  armor: { speed: 3.1, bullet: 13, hp: 4, score: 400 }
};
// Classic stage-one mix: eighteen basic tanks followed by two fast scouts.
export const STAGE1_ROSTER = [...Array(18).fill('basic'), 'fast', 'fast'];
export const CARRIERS = [3, 10, 17];              // 4th, 11th and 18th enemies flash and carry a power-up
export const POWERUPS = ['star', 'grenade', 'helmet', 'shovel', 'timer', 'tank'];
export const PLAYER_LEVELS = [
  { bullet: 16, max: 1, power: false },
  { bullet: 27, max: 1, power: false },
  { bullet: 27, max: 2, power: false },
  { bullet: 27, max: 2, power: true }
];

export function rngFrom(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const idx = (x, z) => z * N + x;
export function cellAt(w, x, z) { return x < 0 || z < 0 || x >= N || z >= N ? STEEL : w.grid[idx(x, z)]; }
function setCell(w, x, z, v) { if (x < 0 || z < 0 || x >= N || z >= N) return; if (w.grid[idx(x, z)] !== v) { w.grid[idx(x, z)] = v; w.gridVersion++; } }
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

export function createWorld(seed = Date.now() % 100000) {
  const grid = new Uint8Array(N * N);
  STAGE1.forEach((row, z) => [...row].forEach((ch, x) => { grid[idx(x, z)] = ch === '#' ? BRICK : ch === '@' ? STEEL : ch === 'E' ? BASE : EMPTY; }));
  return {
    seed, rng: rngFrom(seed), grid, gridVersion: 0,
    status: 'ready', reason: '', time: 0, score: 0, lives: 3, level: 0,
    player: null, playerSpawn: null, nextId: 1,
    enemies: [], spawning: [], bullets: [], powerup: null, events: [],
    roster: STAGE1_ROSTER.slice(), rosterIndex: 0, killed: 0,
    tally: { basic: 0, fast: 0, power: 0, armor: 0 }, pickups: 0,
    spawnTimer: 0.4, spawnSlot: 0, freeze: 0, shovel: 0, baseAlive: true,
    endTimer: -1, pendingStatus: null, shake: 0
  };
}

export function startWorld(w) {
  if (w.status !== 'ready') return;
  w.status = 'playing';
  queuePlayer(w, 0.05);
}
function queuePlayer(w, delay) { w.playerSpawn = { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, t: delay + 0.75 }; emit(w, 'spawn', { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, team: 'player' }); }

function makeTank(w, team, type, x, z, dir) {
  const t = { id: w.nextId++, team, type, x, z, dir, speed: 0, hp: 1, carrier: false, shield: 0, fireTimer: 0.5, aiTimer: 0.8, alive: true, moving: false, travel: 0, recoil: 0, hitFlash: 0 };
  if (team === 'enemy') { const spec = ENEMY_TYPES[type]; t.speed = spec.speed; t.hp = spec.hp; }
  return t;
}
export function playerSpec(w) { return PLAYER_LEVELS[Math.min(3, w.level)]; }
function tanks(w) { return w.player && w.player.alive ? [w.player, ...w.enemies] : w.enemies; }
const overlapTanks = (ax, az, bx, bz) => Math.abs(ax - bx) < HALF * 2 && Math.abs(az - bz) < HALF * 2;

function solidCells(w, x, z, out) {
  out.length = 0;
  const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF - 1e-9), z0 = Math.floor(z - HALF), z1 = Math.floor(z + HALF - 1e-9);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (cellAt(w, cx, cz) !== EMPTY) out.push(cz * 64 + cx);
  return out;
}
const _a = [], _b = [];
function blocked(w, t, nx, nz) {
  if (nx - HALF < -1e-9 || nx + HALF > N + 1e-9 || nz - HALF < -1e-9 || nz + HALF > N + 1e-9) return true;
  // Only newly entered solid cells block, so a tank caught by the shovel wall can still drive out.
  solidCells(w, t.x, t.z, _a); solidCells(w, nx, nz, _b);
  for (const c of _b) if (!_a.includes(c)) return true;
  for (const o of tanks(w)) {
    if (o === t || !o.alive) continue;
    if (overlapTanks(nx, nz, o.x, o.z)) {
      const before = Math.abs(t.x - o.x) + Math.abs(t.z - o.z), after = Math.abs(nx - o.x) + Math.abs(nz - o.z);
      if (after < before - 1e-9) return true;
    }
  }
  return false;
}
export function turnTank(t, dir) {
  if (dir === t.dir) return;
  if ((dir & 1) !== (t.dir & 1)) { if (t.dir & 1) t.x = Math.round(t.x); else t.z = Math.round(t.z); }
  t.dir = dir;
}
export function moveTank(w, t, dist) {
  const [dx, dz] = DIRS[t.dir];
  let moved = 0;
  while (dist > 1e-9) {
    let step = Math.min(0.125, dist);
    if (blocked(w, t, t.x + dx * step, t.z + dz * step)) {
      // Close the remaining gap precisely so tanks sit flush against walls.
      let lo = 0, hi = step;
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (blocked(w, t, t.x + dx * mid, t.z + dz * mid)) hi = mid; else lo = mid; }
      t.x += dx * lo; t.z += dz * lo; moved += lo; break;
    }
    t.x += dx * step; t.z += dz * step; moved += step; dist -= step;
  }
  t.travel += moved;
  return moved;
}

function activeBullets(w, t) { let n = 0; for (const b of w.bullets) if (b.owner === t.id) n++; return n; }
export function fire(w, t) {
  const spec = t.team === 'player' ? playerSpec(w) : { bullet: ENEMY_TYPES[t.type].bullet, max: 1, power: false };
  if (activeBullets(w, t) >= spec.max) return false;
  const [dx, dz] = DIRS[t.dir];
  w.bullets.push({ owner: t.id, team: t.team, x: t.x + dx * 1.05, z: t.z + dz * 1.05, dir: t.dir, speed: spec.bullet, power: spec.power, alive: true, age: 0 });
  t.recoil = 0.12;
  emit(w, 'fire', { team: t.team, x: t.x + dx * 1.2, z: t.z + dz * 1.2, dir: t.dir });
  return true;
}

function killPlayer(w) {
  const p = w.player; if (!p || !p.alive || w.demoMode) return;
  p.alive = false; w.player = null;  w.level = 0; w.shake = Math.max(w.shake, .7);
  emit(w, 'boom', { x: p.x, z: p.z, big: true, team: 'player' }); emit(w, 'die');
  for (const b of w.bullets) if (b.owner === p.id) b.alive = false;
  queuePlayer(w, 1.1);
}
function destroyEnemy(w, e, byGrenade = false) {
  e.alive = false;
  w.killed++; w.tally[e.type]++;
  const pts = byGrenade ? 0 : ENEMY_TYPES[e.type].score;
  w.score += pts; w.shake = Math.max(w.shake, .35);
  emit(w, 'boom', { x: e.x, z: e.z, big: true, team: 'enemy' });
  if (pts) emit(w, 'score', { x: e.x, z: e.z, value: pts });
  if (w.killed >= w.roster.length) endGame(w, 'won', 'clear', 2.6);
}
function endGame(w, status, reason, delay) {
  if (w.pendingStatus) return;
  w.pendingStatus = status; w.reason = reason; w.endTimer = delay;
}

export function spawnPowerup(w, forceType) {
  const type = forceType || POWERUPS[Math.floor(w.rng() * POWERUPS.length)];
  const spots = [];
  for (let z = 2; z <= 22; z += 2) for (let x = 2; x <= 24; x += 2) {
    if ([cellAt(w, x - 1, z - 1), cellAt(w, x, z - 1), cellAt(w, x - 1, z), cellAt(w, x, z)].every(c => c === EMPTY)) spots.push({ x, z });
  }
  const s = spots[Math.floor(w.rng() * spots.length)] || { x: 13, z: 13 };
  w.powerup = { type, x: s.x, z: s.z, life: 18, age: 0 };
  emit(w, 'powerup', { kind: type, x: s.x, z: s.z });
}
function applyPowerup(w, pu) {
  w.score += 500; w.pickups++;
  emit(w, 'pickup', { kind: pu.type, x: pu.x, z: pu.z }); emit(w, 'score', { x: pu.x, z: pu.z, value: 500 });
  switch (pu.type) {
    case 'star': w.level = Math.min(3, w.level + 1); emit(w, 'levelup', { level: w.level }); break;
    case 'grenade': for (const e of w.enemies) if (e.alive) destroyEnemy(w, e, true); w.shake = 1; emit(w, 'grenade'); break;
    case 'helmet': if (w.player) w.player.shield = 10; emit(w, 'shield'); break;
    case 'shovel': setBaseWall(w, STEEL); w.shovel = 18; emit(w, 'shovel'); break;
    case 'timer': w.freeze = 10; emit(w, 'freeze'); break;
    case 'tank': w.lives++; emit(w, 'life'); break;
  }
}
export function setBaseWall(w, type) { for (const [x, z] of BASE_WALL) setCell(w, x, z, type); }

// Returns true when the bullet stops. Bricks break in a 2-cell-wide strip (4 with a steel-piercing shot's depth).
function bulletVsWalls(w, b) {
  const [dx, dz] = DIRS[b.dir];
  const lx = b.x + dx * BULLET_R, lz = b.z + dz * BULLET_R;
  if (lx < 0 || lx > N || lz < 0 || lz > N) { emit(w, 'border', { x: b.x, z: b.z, team: b.team }); return true; }
  const vertical = dx === 0, lead = vertical ? Math.floor(Math.min(N - 1e-6, lz)) : Math.floor(Math.min(N - 1e-6, lx));
  const c = vertical ? b.x : b.z;
  const touch = [];
  for (let k = Math.floor(c - BULLET_R); k <= Math.floor(c + BULLET_R - 1e-9); k++) touch.push(k);
  const at = k => vertical ? cellAt(w, k, lead) : cellAt(w, lead, k);
  if (!touch.some(k => at(k) !== EMPTY)) return false;
  if (touch.some(k => at(k) === BASE)) { destroyBase(w, b.team); return true; }
  const broken = [];
  let clank = false;
  for (let depth = 0; depth < (b.power ? 2 : 1); depth++) {
    const row = lead + (vertical ? dz : dx) * depth;
    for (let k = Math.floor(c - 1 + 1e-9); k <= Math.floor(c + 1 - 1e-9); k++) {
      const cx = vertical ? k : row, cz = vertical ? row : k, v = cellAt(w, cx, cz);
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
      if (v === BRICK || (v === STEEL && b.power)) { setCell(w, cx, cz, EMPTY); broken.push({ x: cx, z: cz, steel: v === STEEL }); }
      else if (v === STEEL && depth === 0) clank = true;
    }
  }
  if (broken.length) emit(w, 'brick', { cells: broken, x: b.x, z: b.z, dir: b.dir, team: b.team });
  if (clank && !broken.length) emit(w, 'steel', { x: b.x, z: b.z, team: b.team });
  return true;
}
function destroyBase(w, by = 'enemy') {
  if (!w.baseAlive) return;
  w.baseAlive = false; w.shake = 1.2; w.baseBy = by;
  for (let z = 24; z <= 25; z++) for (let x = 12; x <= 13; x++) setCell(w, x, z, EMPTY);
  emit(w, 'baseboom', { x: BASE_CENTER.x, z: BASE_CENTER.z, by });
  endGame(w, 'lost', 'base', 2.8);
}

function enemyThink(w, e, dt) {
  e.aiTimer -= dt;
  const want = e.speed * dt, moved = moveTank(w, e, want);
  e.moving = moved > want * .3;
  if (moved < want * .5 || e.aiTimer <= 0) {
    e.aiTimer = .7 + w.rng() * 2.1;
    const r = w.rng(), p = w.player;
    let dir;
    if (r < .58) { const q = w.rng(); dir = q < .2 ? 0 : q < .46 ? 1 : q < .74 ? 2 : 3; }
    else {
      // Early in the stage tanks wander; the longer it runs, the more they hunt the eagle.
      const hunt = .72 + Math.min(.16, w.time / 600);
      const tx = r < hunt || !p ? BASE_CENTER.x : p.x, tz = r < hunt || !p ? BASE_CENTER.z : p.z;
      const ddx = tx - e.x, ddz = tz - e.z;
      dir = Math.abs(ddx) > Math.abs(ddz) + (w.rng() - .5) * 6 ? (ddx > 0 ? 1 : 3) : (ddz > 0 ? 2 : 0);
    }
    if (moved < want * .5 && dir === e.dir) dir = (dir + (w.rng() < .5 ? 1 : 3)) % 4;
    turnTank(e, dir);
    if (moved < want * .5 && w.rng() < .45) e.fireTimer = Math.min(e.fireTimer, .05);
  }
  e.fireTimer -= dt;
  if (e.fireTimer <= 0) { e.fireTimer = 1.1 + w.rng() * 2; fire(w, e); }
}

function spawnSlotFree(w, s) { return !tanks(w).some(t => overlapTanks(t.x, t.z, s.x, s.z)); }
function updateSpawns(w, dt) {
  w.spawnTimer -= dt;
  const busy = w.enemies.filter(e => e.alive).length + w.spawning.length;
  if (w.rosterIndex < w.roster.length && busy < MAX_ON_FIELD && w.spawnTimer <= 0) {
    for (let k = 0; k < 3; k++) {
      const slot = ENEMY_SPAWNS[(w.spawnSlot + k) % 3];
      if (!spawnSlotFree(w, slot) || w.spawning.some(s => s.x === slot.x)) continue;
      const i = w.rosterIndex++;
      w.spawning.push({ x: slot.x, z: slot.z, t: 1, type: w.roster[i], carrier: CARRIERS.includes(i), index: i });
      emit(w, 'spawn', { x: slot.x, z: slot.z, team: 'enemy' });
      w.spawnSlot = (w.spawnSlot + k + 1) % 3; w.spawnTimer = SPAWN_INTERVAL;
      break;
    }
  }
  for (let i = w.spawning.length - 1; i >= 0; i--) {
    const s = w.spawning[i]; s.t -= dt;
    if (s.t > 0 || !spawnSlotFree(w, s)) continue;
    const e = makeTank(w, 'enemy', s.type, s.x, s.z, 2); e.carrier = s.carrier; e.index = s.index; e.fireTimer = .6 + w.rng();
    if (e.carrier && w.powerup) w.powerup = null;   // a new carrier clears the old prize, as in the original
    w.enemies.push(e); w.spawning.splice(i, 1);
  }
}

export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  w.time += dt; w.shake = Math.max(0, w.shake - dt * 2.2);
  if (w.endTimer >= 0) {
    w.endTimer -= dt;
    if (w.endTimer <= 0) { w.status = w.pendingStatus; emit(w, w.status === 'won' ? 'win' : 'gameover', { reason: w.reason }); return; }
  }
  // Player (re)spawn after the twinkle.
  if (w.playerSpawn) {
    w.playerSpawn.t -= dt;
    if (w.playerSpawn.t <= 0 && spawnSlotFree(w, w.playerSpawn) && w.pendingStatus !== 'lost') {
      w.player = makeTank(w, 'player', 'player', w.playerSpawn.x, w.playerSpawn.z, 0); w.player.shield = 3.2; w.playerSpawn = null; emit(w, 'playerSpawn');
    }
  }
  const p = w.player;
  if (p && p.alive) {
    p.shield = Math.max(0, p.shield - dt); p.recoil = Math.max(0, p.recoil - dt);
    const controllable = w.pendingStatus !== 'lost';
    if (controllable && input.dir >= 0) { turnTank(p, input.dir); p.moving = moveTank(w, p, 5.4 * dt) > 0.001; }
    else p.moving = false;
    if (controllable && input.fire) fire(w, p);
  }
  // Enemies.
  w.freeze = Math.max(0, w.freeze - dt);
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.recoil = Math.max(0, e.recoil - dt); e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (w.freeze > 0) { e.moving = false; continue; }
    enemyThink(w, e, dt);
  }
  w.enemies = w.enemies.filter(e => e.alive);
  updateSpawns(w, dt);
  // Shovel wears off: the steel ring turns back into (fully rebuilt) bricks.
  if (w.shovel > 0) { w.shovel -= dt; if (w.shovel <= 0) { w.shovel = 0; if (w.baseAlive) setBaseWall(w, BRICK); emit(w, 'shovelEnd'); } }
  // Bullets, sub-stepped so nothing tunnels through a one-cell wall.
  for (const b of w.bullets) {
    if (!b.alive) continue;
    b.age += dt;
    let dist = b.speed * dt;
    const [dx, dz] = DIRS[b.dir];
    while (dist > 0 && b.alive) {
      const step = Math.min(.2, dist); dist -= step; b.x += dx * step; b.z += dz * step;
      if (bulletVsWalls(w, b)) { b.alive = false; break; }
      // Bullet vs bullet (opposing teams cancel out).
      for (const o of w.bullets) {
        if (o === b || !o.alive || o.team === b.team) continue;
        if (Math.abs(o.x - b.x) < .42 && Math.abs(o.z - b.z) < .42) { o.alive = false; b.alive = false; emit(w, 'puff', { x: b.x, z: b.z }); break; }
      }
      if (!b.alive) break;
      // Bullet vs tanks.
      if (b.team === 'player') {
        for (const e of w.enemies) {
          if (!e.alive || Math.abs(e.x - b.x) > HALF + BULLET_R || Math.abs(e.z - b.z) > HALF + BULLET_R) continue;
          b.alive = false;
          if (e.carrier) { e.carrier = false; spawnPowerup(w); }
          e.hp--; e.hitFlash = .15;
          if (e.hp <= 0) destroyEnemy(w, e); else emit(w, 'armor', { x: e.x, z: e.z });
          break;
        }
      } else if (w.player && w.player.alive) {
        const q = w.player;
        if (Math.abs(q.x - b.x) <= HALF + BULLET_R && Math.abs(q.z - b.z) <= HALF + BULLET_R) {
          b.alive = false;
          if (q.shield > 0) emit(w, 'deflect', { x: b.x, z: b.z }); else killPlayer(w);
        }
      }
    }
  }
  w.bullets = w.bullets.filter(b => b.alive);
  // Power-up lifetime and pickup.
  if (w.powerup) {
    const pu = w.powerup; pu.age += dt; pu.life -= dt;
    if (pu.life <= 0) w.powerup = null;
    else if (w.player && w.player.alive && Math.abs(w.player.x - pu.x) < 1.7 && Math.abs(w.player.z - pu.z) < 1.7) { w.powerup = null; applyPowerup(w, pu); }
  }
}

// Debug-only helpers used by the QA scripts (not reachable from player controls).
export const qa = { destroyEnemy, killPlayer, destroyBase, applyPowerup };
