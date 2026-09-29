// Hop Fox 3D · Stage 1 — deterministic side-scrolling platformer logic (no rendering imports; runs in Node).
// Units are tiles. x grows to the right, y grows up; ground surface is y = 0. Depth (z) is purely visual.
export const W = 200, YMIN = -3, YMAX = 16, H = YMAX - YMIN;
export const EMPTY = 0, GROUND = 1, STONE = 2, CLAY = 3, CRATE = 4, USED = 5, LOG = 6, PLANK = 7, SPRING = 8;
export const GOAL_X = 168, GOAL_TOP = 10, DOOR_X = 177.5, LEVEL_END = 186;
export const CHECKPOINT_X = 96;
export const SPAWN = { x: 3, y: 0 };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const idx = (x, y) => (y - YMIN) * W + x;

// Terrain columns: [x0, x1 inclusive, top]. Missing columns are pits.
export const TERRAIN = [[0, 27, 0], [28, 35, 2], [36, 55, 0], [59, 81, 0], [93, 133, 0], [134, 139, 1], [140, 145, 2], [146, 151, 3], [152, 157, 4], [158, W - 1, 0]];
export const PLATFORM = { x0: 83.5, x1: 90.5, y: 3, w: 3, speed: 2.2 };

export function buildLevel() {
  const grid = new Uint8Array(W * H), crates = new Map(), acorns = [], enemies = [];
  const put = (x, y, t) => { if (x >= 0 && x < W && y >= YMIN && y < YMAX) grid[idx(x, y)] = t; };
  for (const [a, b, top] of TERRAIN) for (let x = a; x <= b; x++) for (let y = YMIN; y < top; y++) put(x, y, GROUND);
  const crate = (x, y, content, hidden = false) => { put(x, y, hidden ? EMPTY : CRATE); crates.set(x + ',' + y, { content, hidden, left: content === 'multi' ? 8 : 1, timer: 0 }); };
  const row = (x, y, s) => [...s].forEach((c, i) => { if (c === 'c') put(x + i, y, CLAY); if (c === 'p') put(x + i, y, PLANK); if (c === 's') put(x + i, y, STONE); });
  const coins = (x0, x1, y) => { for (let x = x0; x <= x1; x++) acorns.push({ x: x + .5, y: y + .5, alive: true }); };
  // Opening meadow.
  coins(7, 9, 2);
  crate(15, 3, 'acorn');
  row(18, 3, 'ppppp'); coins(18, 22, 4); crate(20, 6, 'power');
  enemies.push(['beetle', 25]);
  // Raised hill with a lone crate.
  crate(31, 6, 'acorn'); coins(29, 30, 4); coins(33, 34, 4);
  // Stumps and a branch walkway.
  for (let y = 0; y < 3; y++) { put(40, y, LOG); put(41, y, LOG); }
  enemies.push(['beetle', 44], ['beetle', 46]);
  row(47, 4, 'ppppp'); coins(47, 51, 5);
  for (let y = 0; y < 2; y++) { put(53, y, LOG); put(54, y, LOG); }
  // First pit 56–58, then the clay row with a hidden extra-life crate.
  row(62, 4, 'c.c.c'); crate(63, 4, 'acorn'); crate(65, 4, 'multi');
  crate(70, 4, 'life', true);
  enemies.push(['snail', 67], ['beetle', 73]);
  // Stone steps up to the moving log over the wide gap.
  for (let i = 0; i < 4; i++) for (let y = 0; y <= i; y++) put(78 + i, y, STONE);
  coins(85, 88, 6);
  // Checkpoint at 96, clay corridor with a crate loft.
  row(100, 4, 'ccccc.ccccc'); crate(105, 4, 'power'); crate(103, 8, 'acorn'); crate(107, 8, 'acorn');
  enemies.push(['beetle', 102], ['beetle', 104], ['beetle', 107]);
  // Spring leaf with an acorn arc.
  put(114, 0, SPRING);
  coins(115, 118, 9); acorns.push({ x: 114.5, y: 8, alive: true }, { x: 119.5, y: 8, alive: true });
  row(120, 8, 'ppp'); crate(121, 11, 'acorn');
  // Snail patrol and a last crate row.
  row(123, 4, 'c.c'); crate(124, 4, 'acorn');
  enemies.push(['snail', 127], ['beetle', 131], ['beetle', 137]);
  // Tiered climb to the plateau.
  coins(141, 143, 5); coins(147, 149, 6); coins(153, 155, 7);
  enemies.push(['beetle', 150], ['snail', 155]);
  return { grid, crates, acorns, enemies: enemies.map(([kind, x], i) => makeEnemy(kind, x + .5, surfaceAt(grid, x), i)) };
}
export function surfaceAt(grid, x) { for (let y = YMIN; y < YMAX; y++) if (!grid[idx(x, y)]) return y; return YMAX; }   // top of the column's solid base
function makeEnemy(kind, x, y, id) { return { id, kind, x, y, vx: -(kind === 'snail' ? 1.3 : 1.6), vy: 0, hw: kind === 'snail' ? .42 : .4, h: kind === 'snail' ? .9 : .7, state: 'walk', alive: true, active: false, timer: 0, grounded: false, spawnX: x }; }

export function tileAt(w, x, y) { if (x < 0 || x >= W) return STONE; if (y < YMIN || y >= YMAX) return EMPTY; return w.grid[idx(x, y)]; }
function setTile(w, x, y, t) { if (x >= 0 && x < W && y >= YMIN && y < YMAX && w.grid[idx(x, y)] !== t) { w.grid[idx(x, y)] = t; w.gridVersion++; } }
const solidTile = t => t === GROUND || t === STONE || t === CLAY || t === CRATE || t === USED || t === LOG || t === SPRING;
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

export function createWorld() {
  const lvl = buildLevel();
  return {
    grid: lvl.grid, gridVersion: 0, crates: lvl.crates, acorns: lvl.acorns, enemies: lvl.enemies,
    items: [], sparks: [], events: [], status: 'ready', reason: '',
    time: 300, score: 0, coins: 0, lives: 3, checkpoint: SPAWN.x, elapsed: 0, combo: 0,
    platform: { x: PLATFORM.x0, dir: 1, dx: 0 },
    goal: null, hero: makeHero(SPAWN.x, SPAWN.y), nextId: 100, pendingStatus: null, endTimer: -1
  };
}
function makeHero(x, y) { return { x, y, vx: 0, vy: 0, hw: .36, h: 1.15, facing: 1, grounded: true, coyote: 0, jumpBuffer: 0, power: 0, invincible: 0, onPlatform: false, run: false, dead: false, deadTimer: 0, skid: false, throwCool: 0, squash: 0, landed: 0 }; }
export function startWorld(w) { if (w.status === 'ready') { w.status = 'playing'; emit(w, 'start'); } }

// --- Collision helpers (AABB vs tiles). Entities: x = centre, y = feet, hw = half width, h = height.
function sweepX(w, e, dx) {
  e.x += dx; let hit = false;
  const y0 = Math.floor(e.y + .02), y1 = Math.floor(e.y + e.h - .02);
  if (dx > 0) { const tx = Math.floor(e.x + e.hw); for (let ty = y0; ty <= y1; ty++) if (solidTile(tileAt(w, tx, ty))) { e.x = tx - e.hw - 1e-4; hit = true; break; } }
  else if (dx < 0) { const tx = Math.floor(e.x - e.hw); for (let ty = y0; ty <= y1; ty++) if (solidTile(tileAt(w, tx, ty))) { e.x = tx + 1 + e.hw + 1e-4; hit = true; break; } }
  return hit;
}
function sweepY(w, e, dy, isHero) {
  const prevY = e.y; e.y += dy;
  const x0 = Math.floor(e.x - e.hw + .02), x1 = Math.floor(e.x + e.hw - .02);
  if (dy < 0) {
    const ty = Math.floor(e.y);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(w, tx, ty);
      if (solidTile(t) || (t === PLANK && prevY >= ty + 1 - 1e-3)) { e.y = ty + 1; return { floor: true, tile: t, tx, ty }; }
    }
  } else if (dy > 0) {
    const ty = Math.floor(e.y + e.h);
    const hits = [];
    for (let tx = x0; tx <= x1; tx++) if (solidTile(tileAt(w, tx, ty))) hits.push(tx);
    if (hits.length) {
      // Corner forgiveness: clipping a ceiling edge by a sliver nudges the hero past it instead of stopping the jump.
      if (isHero && hits.length === 1) {
        const tx = hits[0], overlapL = (e.x + e.hw) - tx, overlapR = (tx + 1) - (e.x - e.hw);
        if (overlapL < .22 && !solidTile(tileAt(w, tx - 1, ty))) { e.x = tx - e.hw - 1e-3; return {}; }
        if (overlapR < .22 && !solidTile(tileAt(w, tx + 1, ty))) { e.x = tx + 1 + e.hw + 1e-3; return {}; }
      }
      e.y = ty - e.h - 1e-4;
      let best = hits[0], bo = -1;
      for (const tx of hits) { const o = Math.min(e.x + e.hw, tx + 1) - Math.max(e.x - e.hw, tx); if (o > bo) { bo = o; best = tx; } }
      return { ceiling: true, tx: best, ty };
    }
  }
  return {};
}
function standingTile(w, e) {
  const ty = Math.floor(e.y - .02);
  for (let tx = Math.floor(e.x - e.hw + .02); tx <= Math.floor(e.x + e.hw - .02); tx++) { const t = tileAt(w, tx, ty); if (solidTile(t) || (t === PLANK && Math.abs(e.y - (ty + 1)) < .03)) return t; }
  return EMPTY;
}
const overlap = (a, b) => Math.abs(a.x - b.x) < a.hw + b.hw && a.y < b.y + b.h && b.y < a.y + a.h;

// --- Blocks.
function bumpTile(w, tx, ty) {
  const t = tileAt(w, tx, ty), key = tx + ',' + ty, c = w.crates.get(key), hero = w.hero;
  if (c && (t === CRATE || (c.hidden && t === EMPTY))) {
    if (c.hidden) { c.hidden = false; setTile(w, tx, ty, CRATE); emit(w, 'reveal', { x: tx, y: ty }); }
    emit(w, 'bump', { x: tx, y: ty });
    if (c.content === 'acorn' || c.content === 'multi') {
      addAcorn(w, tx + .5, ty + 1.3, true);
      if (c.content === 'multi') { if (!c.timer) c.timer = 4; c.left--; if (c.left > 0 && c.timer > 0) { knockEnemiesAbove(w, tx, ty); return; } }
    } else if (c.content === 'power') {
      const kind = hero.power === 0 ? 'berry' : 'jar';
      w.items.push({ id: w.nextId++, kind, x: tx + .5, y: ty + 1, vx: 0, vy: 0, hw: .36, h: .7, rising: .6, baseY: ty + 1, alive: true });
      emit(w, 'sprout', { x: tx, y: ty, kind });
    } else if (c.content === 'life') {
      w.items.push({ id: w.nextId++, kind: 'leaf', x: tx + .5, y: ty + 1, vx: 0, vy: 0, hw: .36, h: .6, rising: .6, baseY: ty + 1, alive: true });
      emit(w, 'sprout', { x: tx, y: ty, kind: 'leaf' });
    }
    setTile(w, tx, ty, USED); w.crates.delete(key);
  } else if (t === CLAY) {
    if (hero.power > 0) { setTile(w, tx, ty, EMPTY); w.score += 50; emit(w, 'break', { x: tx, y: ty }); }
    else emit(w, 'bump', { x: tx, y: ty });
  } else if (solidTile(t)) emit(w, 'thud', { x: tx, y: ty });
  knockEnemiesAbove(w, tx, ty);
  // Acorns sitting on the bumped block pop too.
  for (const a of w.acorns) if (a.alive && Math.abs(a.x - (tx + .5)) < .6 && a.y > ty + 1 && a.y < ty + 1.9) collectAcorn(w, a);
}
function knockEnemiesAbove(w, tx, ty) {
  for (const e of w.enemies) if (e.alive && e.state !== 'dead' && Math.abs(e.x - (tx + .5)) < .5 + e.hw && Math.abs(e.y - (ty + 1)) < .3) flipEnemy(w, e, 100);
}
function addAcorn(w, x, y, fromCrate) { w.coins++; w.score += 200; emit(w, 'acorn', { x, y, fromCrate }); if (w.coins >= 100) { w.coins -= 100; w.lives++; emit(w, 'oneup', { x, y }); } }
function collectAcorn(w, a) { a.alive = false; addAcorn(w, a.x, a.y, false); }

// --- Enemies.
function flipEnemy(w, e, pts) { e.state = 'dead'; e.alive = false; e.vy = 7; e.vx = (w.hero.x < e.x ? 1 : -1) * 2; e.flipped = true; w.score += pts; emit(w, 'flip', { x: e.x, y: e.y, kind: e.kind }); emit(w, 'points', { x: e.x, y: e.y + 1, value: pts }); }
function stompPoints(w) { const table = [100, 200, 400, 500, 800, 1000, 2000, 4000]; const v = table[Math.min(table.length - 1, w.combo)]; w.combo++; if (w.combo > 8) { w.lives++; emit(w, 'oneup', { x: w.hero.x, y: w.hero.y + 1.5 }); } return v; }
function updateEnemy(w, e, dt) {
  if (!e.active) { if (Math.abs(e.x - w.hero.x) < 17) e.active = true; else return; }
  if (e.state === 'dead') { e.vy -= 30 * dt; e.x += e.vx * dt; e.y += e.vy * dt; if (e.y < YMIN - 3) e.gone = true; return; }
  if (e.state === 'squashed') { e.timer -= dt; if (e.timer <= 0) { e.alive = false; e.gone = true; } return; }
  e.timer = Math.max(0, e.timer - dt);
  if (e.state === 'shell' && Math.abs(e.vx) < .01) { e.idle = (e.idle || 0) + dt; if (e.idle > 7) { e.state = 'walk'; e.vx = -1.3; e.idle = 0; emit(w, 'wake', { x: e.x, y: e.y }); } }
  e.vy = Math.max(-20, e.vy - 30 * dt);
  const steps = Math.ceil(Math.abs(e.vx * dt) / .2) || 1;
  for (let i = 0; i < steps; i++) if (sweepX(w, e, e.vx * dt / steps)) { e.vx = -e.vx; if (e.state === 'shell') emit(w, 'shellwall', { x: e.x, y: e.y }); }
  const r = sweepY(w, e, e.vy * dt, false);
  if (r.floor) { e.vy = 0; e.grounded = true; } else if (r.ceiling) e.vy = 0;
  if (e.y < YMIN) { e.alive = false; e.gone = true; }
  // Moving shells knock out other enemies.
  if (e.state === 'shell' && Math.abs(e.vx) > 1) for (const o of w.enemies) if (o !== e && o.alive && o.state !== 'dead' && overlap(e, o)) { flipEnemy(w, o, 200); }
  // Walkers bounce off each other.
  if (e.state === 'walk') for (const o of w.enemies) if (o !== e && o.alive && o.state === 'walk' && overlap(e, o) && Math.sign(o.x - e.x) === Math.sign(e.vx)) e.vx = -e.vx;
}

// --- Hero.
export const PHYS = { walk: 6, run: 9.6, acc: 20, runAcc: 24, dec: 16, skid: 36, air: 15, jump: 14.2, jumpRunBonus: .26, gHold: 29, gFall: 72, spring: 22.5, stomp: 10, stompHold: 14 };
function hurtHero(w) {
  const p = w.hero; if (p.invincible > 0 || p.dead) return;
  if (p.power > 0) { p.power = 0; p.invincible = 2; emit(w, 'shrink', { x: p.x, y: p.y }); }
  else killHero(w, 'enemy');
}
function killHero(w, reason) {
  const p = w.hero; if (p.dead) return;
  p.dead = true; p.deadTimer = 2.6; p.vx = 0; p.vy = 12; w.reason = reason; w.lives--;
  emit(w, 'die', { reason, x: p.x, y: p.y });
}
function respawn(w) {
  if (w.lives <= 0) { w.status = 'lost'; emit(w, 'gameover'); return; }
  const x = w.checkpoint;
  w.hero = makeHero(x, surfaceAt(w.grid, Math.floor(x))); w.hero.invincible = 2;
  w.time = 300; w.combo = 0; w.sparks.length = 0;
  emit(w, 'respawn', { x });
}
function updateHero(w, input, dt) {
  const p = w.hero;
  if (p.dead) { p.deadTimer -= dt; if (p.deadTimer < 2.1) { p.vy -= 32 * dt; p.y += p.vy * dt; } if (p.deadTimer <= 0) respawn(w); return; }
  p.invincible = Math.max(0, p.invincible - dt); p.throwCool = Math.max(0, p.throwCool - dt); p.squash = Math.max(0, p.squash - dt * 4); p.landed = Math.max(0, p.landed - dt);
  const ix = input.x || 0; p.run = !!input.run;
  const max = p.run ? PHYS.run : PHYS.walk;
  p.skid = false;
  if (ix) {
    p.facing = ix;
    if (p.grounded && Math.sign(p.vx) === -ix && Math.abs(p.vx) > 1) { p.vx += ix * PHYS.skid * dt; p.skid = true; }
    else { const a = p.grounded ? (p.run ? PHYS.runAcc : PHYS.acc) : PHYS.air; if (Math.abs(p.vx) <= max || Math.sign(p.vx) !== ix) p.vx = clamp(p.vx + ix * a * dt, -max, max); else if (p.grounded) p.vx = Math.sign(p.vx) * Math.max(max, Math.abs(p.vx) - PHYS.dec * dt * .5); }
  } else if (p.grounded) { const d = PHYS.dec * dt; p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d; }
  // Jump with buffer + coyote time; running speed adds height; releasing K cuts the arc.
  p.coyote = p.grounded ? .09 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.jumpPressed ? .12 : Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && p.coyote > 0) { p.vy = PHYS.jump + Math.abs(p.vx) * PHYS.jumpRunBonus; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.onPlatform = false; emit(w, 'jump', { big: p.power > 0 }); }
  if (p.vy <= 0) p.boost = false;
  const g = p.vy > 0 && (input.jump || p.boost) ? PHYS.gHold : PHYS.gFall;
  p.vy = Math.max(-22, p.vy - g * dt);
  // Throw sparks with the lantern (J press).
  if (p.power === 2 && input.actionPressed && p.throwCool <= 0 && w.sparks.filter(s => s.alive).length < 2) {
    w.sparks.push({ x: p.x + p.facing * .5, y: p.y + .8, vx: p.facing * 11, vy: -2, hw: .18, h: .36, alive: true, life: 2.5 });
    p.throwCool = .18; emit(w, 'throw', { x: p.x, y: p.y + .8 });
  }
  // Integrate in small steps against the tile grid.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / .15));
  const wasGrounded = p.grounded, prevFeet = p.y; p.grounded = false;
  for (let i = 0; i < steps; i++) {
    if (sweepX(w, p, p.vx * dt / steps)) p.vx = 0;
    const r = sweepY(w, p, p.vy * dt / steps, true);
    if (r.floor) {
      if (r.tile === SPRING && p.vy < -1) { p.vy = PHYS.spring; p.boost = true; emit(w, 'spring', { x: r.tx, y: r.ty }); p.squash = 1; break; }
      if (!wasGrounded && p.vy < -8) { p.squash = 1; p.landed = .12; emit(w, 'land', { x: p.x, y: p.y, hard: p.vy < -15 }); }
      p.vy = 0; p.grounded = true; w.combo = 0;
    } else if (r.ceiling) { p.vy = Math.min(0, -1); bumpTile(w, r.tx, r.ty); break; }
  }
  // Moving log platform (one-way from above): land when crossing its top while falling, then ride along.
  const pl = w.platform, top = PLATFORM.y + .5;
  const overPl = Math.abs(p.x - (pl.x + PLATFORM.w / 2)) < PLATFORM.w / 2 + p.hw - .05;
  if (overPl && p.vy <= 0 && ((p.onPlatform && p.y >= top - .3) || (prevFeet >= top - .02 && p.y <= top + .02))) {
    p.y = top; p.vy = 0; p.grounded = true;
    if (!p.onPlatform) { w.combo = 0; if (prevFeet > top + .3) emit(w, 'land', { x: p.x, y: p.y, hard: false }); }
    p.onPlatform = true; sweepX(w, p, pl.dx);
  } else p.onPlatform = false;
  if (!p.grounded && standingTile(w, p) !== EMPTY && p.vy <= 0) p.grounded = true;
  p.x = clamp(p.x, .5, LEVEL_END + 2);
  if (p.y < YMIN - 1) killHero(w, 'pit');
  // Checkpoint.
  if (p.x > CHECKPOINT_X && w.checkpoint < CHECKPOINT_X) { w.checkpoint = CHECKPOINT_X; emit(w, 'checkpoint', { x: CHECKPOINT_X }); }
  // Floating acorns.
  for (const a of w.acorns) if (a.alive && Math.abs(a.x - p.x) < .5 + p.hw - .1 && a.y > p.y - .2 && a.y < p.y + p.h + .2) collectAcorn(w, a);
  // Items.
  for (const it of w.items) if (it.alive && !it.rising && overlap(p, it)) {
    it.alive = false;
    if (it.kind === 'leaf') { w.lives++; emit(w, 'oneup', { x: it.x, y: it.y }); }
    else { const before = p.power; p.power = it.kind === 'jar' ? 2 : Math.max(1, p.power); w.score += 1000; emit(w, 'powerup', { kind: it.kind, from: before, to: p.power, x: it.x, y: it.y }); emit(w, 'points', { x: it.x, y: it.y + 1, value: 1000 }); }
  }
  // Enemies: stomp from above, kick idle shells, otherwise get hurt.
  for (const e of w.enemies) {
    if (!e.alive || e.state === 'dead' || e.state === 'squashed' || !overlap(p, e)) continue;
    // Use the feet position from the start of this frame too: at 30 fps a fast fall moves ~0.7 tiles per frame
    // and would otherwise skip the stomp window and register as a side hit.
    const falling = p.vy < 0 || prevFeet > p.y + 1e-3, fromAbove = Math.max(p.y, prevFeet) > e.y + e.h * .45;
    if (falling && fromAbove) {
      const pts = stompPoints(w);
      if (e.kind === 'beetle') { e.state = 'squashed'; e.timer = .45; emit(w, 'stomp', { x: e.x, y: e.y, kind: e.kind }); }
      else if (e.state === 'walk' || Math.abs(e.vx) > 1) { e.state = 'shell'; e.vx = 0; e.idle = 0; emit(w, 'stomp', { x: e.x, y: e.y, kind: 'snail' }); }
      else { e.vx = (p.x < e.x ? 1 : -1) * 11; e.timer = .25; emit(w, 'kick', { x: e.x, y: e.y }); }
      w.score += pts; emit(w, 'points', { x: e.x, y: e.y + 1, value: pts });
      p.vy = input.jump ? PHYS.stompHold : PHYS.stomp; p.y = Math.max(p.y, e.y + e.h * .5);
    } else if (e.state === 'shell' && Math.abs(e.vx) < .01) {
      e.vx = (p.x < e.x ? 1 : -1) * 11; e.timer = .25; e.x += Math.sign(e.vx) * .3; w.score += 400; emit(w, 'kick', { x: e.x, y: e.y }); emit(w, 'points', { x: e.x, y: e.y + 1, value: 400 });
    } else if (!(e.state === 'shell' && e.timer > 0)) hurtHero(w);
  }
  // Goal pole: grab it anywhere along its height.
  if (!w.goal && p.x + p.hw >= GOAL_X + .5 && p.y < GOAL_TOP + .5) {
    const height = clamp(p.y, 0, GOAL_TOP), table = [[8.5, 5000], [6.5, 2000], [4.5, 800], [2.5, 400], [0, 100]];
    const pts = table.find(([h]) => height >= h)[1];
    w.goal = { phase: 'slide', grabY: height, points: pts, t: 0 }; w.score += pts; w.time = Math.ceil(w.time);
    p.x = GOAL_X + .5 - p.hw; p.vx = 0; p.vy = 0;
    emit(w, 'goal', { height, points: pts }); emit(w, 'points', { x: GOAL_X + .5, y: height + 1.2, value: pts });
  }
}
function updateGoal(w, dt) {
  const g = w.goal, p = w.hero; g.t += dt;
  if (g.phase === 'slide') { p.y = Math.max(0, p.y - 9 * dt); if (p.y <= 0 && g.t > .9) { g.phase = 'walk'; p.facing = 1; } }
  else if (g.phase === 'walk') { p.vx = 4.2; p.x += p.vx * dt; p.y = 0; if (p.x >= DOOR_X) { g.phase = 'tally'; p.vx = 0; g.hidden = true; emit(w, 'door'); } }
  else if (g.phase === 'tally') {
    if (w.time > 0) { const n = Math.min(w.time, Math.ceil(dt * 120)); w.time -= n; w.score += n * 50; if (Math.floor(w.time) % 5 === 0) emit(w, 'tick'); }
    else if (!g.fwStarted) { g.fwStarted = true; g.fireworks = 3; g.fx = .3; }
    else { g.fx -= dt; if (g.fx <= 0 && g.fireworks > 0) { g.fireworks--; g.fx = .55; emit(w, 'firework', { x: DOOR_X - 4 + g.fireworks * 3.5, y: 6 + g.fireworks * .9 }); w.score += 500; } if (g.fireworks === 0 && g.fx <= 0 && !g.done) { g.done = true; w.pendingStatus = 'won'; w.endTimer = 1; } }
  }
}

export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  w.elapsed += dt;
  if (w.endTimer >= 0) { w.endTimer -= dt; if (w.endTimer <= 0) { w.status = w.pendingStatus; emit(w, 'win'); return; } }
  // Moving platform.
  const pl = w.platform, nx = clamp(pl.x + pl.dir * PLATFORM.speed * dt, PLATFORM.x0, PLATFORM.x1 - PLATFORM.w); pl.dx = nx - pl.x; pl.x = nx;
  if (pl.x <= PLATFORM.x0 || pl.x >= PLATFORM.x1 - PLATFORM.w) pl.dir = -pl.dir;
  // Multi-acorn crates run out after their timer.
  for (const c of w.crates.values()) if (c.timer > 0) { c.timer -= dt; if (c.timer <= 0) c.timer = -1; }
  if (w.goal) updateGoal(w, dt);
  else {
    if (!w.hero.dead) { w.time -= dt * 2.5; if (w.time <= 0) { w.time = 0; killHero(w, 'time'); } if (w.time < 100 && !w.hurry) { w.hurry = true; emit(w, 'hurry'); } }
    updateHero(w, input, dt);
  }
  if (w.status !== 'playing') return;
  for (const e of w.enemies) if (!e.gone) updateEnemy(w, e, dt);
  // Items: rise out of the crate, then walk (berry/leaf) or wait (jar).
  for (const it of w.items) {
    if (!it.alive) continue;
    if (it.rising) { it.rising = Math.max(0, it.rising - dt); it.y = it.baseY; if (!it.rising) it.vx = it.kind === 'jar' ? 0 : it.kind === 'leaf' ? 3.2 : 2.4; continue; }
    if (it.kind === 'jar') continue;
    it.vy = Math.max(-18, it.vy - 30 * dt);
    if (sweepX(w, it, it.vx * dt)) it.vx = -it.vx;
    const r = sweepY(w, it, it.vy * dt, false); if (r.floor) it.vy = 0;
    if (it.y < YMIN) it.alive = false;
  }
  // Sparks bounce along the ground and knock out enemies.
  for (const s of w.sparks) {
    if (!s.alive) continue; s.life -= dt;
    s.vy = Math.max(-14, s.vy - 38 * dt);
    if (sweepX(w, s, s.vx * dt)) { s.alive = false; emit(w, 'fizz', { x: s.x, y: s.y }); continue; }
    const r = sweepY(w, s, s.vy * dt, false); if (r.floor) s.vy = 7.5; else if (r.ceiling) s.vy = -2;
    for (const e of w.enemies) if (e.alive && e.state !== 'dead' && overlap(s, e)) { s.alive = false; flipEnemy(w, e, 200); break; }
    if (s.life <= 0 || s.y < YMIN || Math.abs(s.x - w.hero.x) > 18) s.alive = false;
  }
  w.sparks = w.sparks.filter(s => s.alive);
}

export const qa = { killHero, hurtHero, bumpTile, flipEnemy, respawn };
