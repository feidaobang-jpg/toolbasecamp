// FC Super Mario Bros. stage 1-1 in 3D. Deterministic gameplay, independent of rendering.
// Axes: +x is level progress, z is depth (-2.2..2.2 playable), y is up.
export const LEVEL_END = 190;        // castle door
export const SPAWN_X = 2;
export const CHECKPOINT_X = 100;
export const FLAG_X = 184;           // flagpole
// Ground gaps (pits). Falling in is fatal.
export const GAPS = [[69, 72], [86, 89]];
// Solid blocks: brick / question. y is the block center height.
export const BLOCKS = [
  { x: 16, y: 3.35, kind: 'q', content: 'coin' },
  { x: 20, y: 3.35, kind: 'brick' },
  { x: 21, y: 3.35, kind: 'q', content: 'mushroom' },
  { x: 22, y: 3.35, kind: 'brick' },
  { x: 23, y: 3.35, kind: 'q', content: 'coin' },
  { x: 24, y: 3.35, kind: 'brick' },
  { x: 78, y: 6.35, kind: 'brick' },
  { x: 79, y: 6.35, kind: 'q', content: 'mushroom' },
  { x: 80, y: 6.35, kind: 'q', content: 'coin' },
  { x: 81, y: 6.35, kind: 'brick' },
  { x: 94, y: 3.35, kind: 'brick', content: 'coin' },
  { x: 101, y: 3.35, kind: 'brick' },
  { x: 102, y: 3.35, kind: 'q', content: 'coin' },
  { x: 103, y: 3.35, kind: 'brick' },
];
// Warp pipes: [x, height]
export const PIPES = [[28, 2], [37, 3], [46, 4], [57, 4]];
// Staircases: [x, height] — solid stone steps.
export const STAIRS = (() => {
  const s = [];
  for (let i = 0; i < 4; i++) s.push([130 + i, i + 1]);      // up
  for (let i = 0; i < 4; i++) s.push([135 + i, 4 - i]);      // down
  for (let i = 0; i < 8; i++) s.push([172 + i, i + 1]);      // final climb
  return s;
})();
// Floating coins: [x, y]
export const COINS = [
  [30.5, 1.6], [31.5, 2.2], [32.5, 2.2], [33.5, 1.6],
  [64, 1.5], [65, 2.1], [66, 1.5],
  [92, 1.5], [93, 2.1], [94, 2.1], [95, 1.5],
  [120, 1.6], [121, 2.2], [122, 2.2], [123, 1.6],
  [147, 1.5], [148, 2.1], [149, 1.5],
];
// Goombas (+ one koopa at 107): [x]
export const GOOMBA_X = [22, 40, 51, 52.5, 80, 82, 97, 98.5, 114, 115.5, 124, 125.5, 155, 157, 163, 164.5];
export const KOOPA_X = [107];

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const inGap = x => GAPS.some(([a, b]) => x > a && x < b);

// Build the solid AABB list for a set of block objects: blocks, pipes, stair steps.
export function buildSolids(blocks) {
  const s = [];
  for (const b of blocks) s.push({ x1: b.x - .5, x2: b.x + .5, y1: b.y - .35, y2: b.y + .35, block: b });
  for (const [x, h] of PIPES) s.push({ x1: x - .8, x2: x + .8, y1: 0, y2: h, pipe: true });
  for (const [x, h] of STAIRS) s.push({ x1: x - .5, x2: x + .5, y1: 0, y2: h, stair: true });
  return s;
}

export function createWorld() {
  const blocks = BLOCKS.map(b => ({ ...b, used: false, bumpT: 0, broken: false }));
  const w = {
    time: 240, score: 0, coins: 0, lives: 3, status: 'ready', reason: '', elapsed: 0,
    events: [], enemies: [], items: [], flagWalk: false, flagT: 0, shake: 0,
    checkpoint: SPAWN_X,
    blocks, solids: buildSolids(blocks),
    coinsLive: COINS.map(([x, y]) => ({ x, y, z: 0, alive: true, t: Math.random() * 6 })),
    player: {
      x: SPAWN_X, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, facing: 1,
      big: false, invuln: 0, coyote: 0, jumpBuffer: 0
    }
  };
  for (const x of GOOMBA_X) w.enemies.push({ kind: 'goomba', x, y: 0, z: 0, vx: -1.7, vy: 0, alive: true, squashT: 0, t: Math.random() * 6 });
  for (const x of KOOPA_X) w.enemies.push({ kind: 'koopa', x, y: 0, z: 0, vx: -1.9, vy: 0, alive: true, squashT: 0, t: Math.random() * 6 });
  return w;
}
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

export function floorAt(x) { return inGap(x) ? -Infinity : 0; }

export function die(w, reason) {
  if (w.status !== 'playing') return;
  w.lives--; emit(w, 'die', { reason });
  if (w.lives <= 0) { w.status = 'dead'; w.reason = reason; emit(w, 'gameover'); }
  else respawn(w);
}
export function respawn(w) {
  const p = w.player;
  Object.assign(p, { x: w.checkpoint, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, facing: 1, invuln: 2.4, coyote: 0, jumpBuffer: 0 });
  w.items.length = 0; w.time = 240; w.flagWalk = false;
  w.status = 'playing';
}
export function addCoin(w, x, y, z) {
  w.coins++; w.score += 200; emit(w, 'coin', { x, y, z });
  if (w.coins >= 100) { w.coins -= 100; w.lives++; emit(w, 'oneup'); }
}
function hitBlockFromBelow(w, blk) {
  if (blk.used || blk.broken) return;
  blk.bumpT = .18;
  if (blk.kind === 'q') {
    blk.used = true;
    if (blk.content === 'mushroom') {
      w.items.push({ type: 'mushroom', x: blk.x, y: blk.y + .9, z: 0, vx: 2, vy: 3, alive: true });
      emit(w, 'powerAppear', { x: blk.x, y: blk.y + 1 });
    } else { addCoin(w, blk.x, blk.y + .8, 0); }
    emit(w, 'bump', { x: blk.x, y: blk.y });
  } else if (blk.content === 'coin') {
    blk.used = true; addCoin(w, blk.x, blk.y + .8, 0); emit(w, 'bump', { x: blk.x, y: blk.y });
  } else if (w.player.big) {
    blk.broken = true; w.score += 50; w.shake = .2;
    emit(w, 'brick', { x: blk.x, y: blk.y });
  } else emit(w, 'bump', { x: blk.x, y: blk.y });
}
function solidsOverlap(x, y, h, s, halfW) {
  return x + halfW > s.x1 && x - halfW < s.x2 && y + h > s.y1 && y < s.y2;
}
export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  const p = w.player; w.time -= dt; w.elapsed += dt; w.shake = Math.max(0, w.shake - dt * 2.5);
  p.invuln = Math.max(0, p.invuln - dt);
  if (w.time <= 0) { die(w, 'timeout'); return; }
  for (const b of w.blocks) b.bumpT = Math.max(0, b.bumpT - dt);

  const runSpeed = input.run ? 8.4 : 5.6;
  const accel = p.grounded ? 30 : 16;
  p.vx += clamp(input.x * runSpeed - p.vx, -accel * dt, accel * dt);
  if (Math.abs(input.x) > .15) p.facing = Math.sign(input.x);
  if (input.z) p.z = clamp(p.z + input.z * 4.5 * dt, -2.2, 2.2);
  p.coyote = p.grounded ? .09 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.jumpPressed ? .12 : Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = Math.abs(p.vx) > 7 ? 12.8 : 12; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; emit(w, 'jump');
  }
  const pHalf = .45, h = p.big ? 2.5 : 1.55;

  // Victory walk: bypass normal movement, march to the castle door.
  if (w.flagWalk) {
    w.flagT += dt;
    p.x = Math.min(LEVEL_END - 1.2, p.x + 3.2 * dt);
    if (p.x >= LEVEL_END - 1.25) {
      w.score += Math.ceil(w.time) * 10; w.status = 'won'; emit(w, 'win'); return;
    }
    advanceEnemies(w, dt, p, true); // peaceful: no contact damage during the walk
    return;
  }

  // --- Horizontal move + side collision (step-up for tiny lips only).
  p.x = clamp(p.x + p.vx * dt, -1, LEVEL_END - 1.6);
  for (const s of w.solids) {
    if (s.block && s.block.broken) continue;
    if (!solidsOverlap(p.x, p.y, h, s, pHalf)) continue;
    if (s.y2 - p.y <= .3 && p.vy <= 0) { p.y = s.y2; p.grounded = true; continue; } // step up
    // Push out horizontally toward the shallower side.
    const fromLeft = p.x < (s.x1 + s.x2) / 2;
    p.x = fromLeft ? s.x1 - pHalf - .001 : s.x2 + pHalf + .001;
    p.vx = 0;
  }
  // --- Vertical move + landing / head bump.
  const rising = p.vy > 0;
  p.vy -= (rising && input.jump ? 17 : 30) * dt;
  p.y += p.vy * dt;
  let landed = false;
  const ground = floorAt(p.x);
  if (p.vy <= 0) {
    let top = ground === -Infinity ? -Infinity : 0;
    for (const s of w.solids) {
      if (s.block && s.block.broken) continue;
      if (p.x + pHalf > s.x1 && p.x - pHalf < s.x2 && p.y <= s.y2 && p.y > s.y2 - 1.2 && s.y2 > top) top = s.y2;
    }
    if (top > -Infinity && p.y <= top) { p.y = top; p.vy = 0; landed = true; }
  } else {
    for (const s of w.solids) {
      if (!s.block || s.block.broken) continue;
      if (p.x + pHalf > s.x1 && p.x - pHalf < s.x2 && p.y + h > s.y1 && p.y + h < s.y1 + .5) {
        p.y = s.y1 - h; p.vy = 0; hitBlockFromBelow(w, s.block);
      }
    }
  }
  const wasGrounded = p.grounded;
  p.grounded = landed || (wasGrounded && p.vy <= 0 && p.y <= (ground === -Infinity ? -Infinity : ground) + .02 && p.y >= (ground === -Infinity ? -1 : ground));
  if (landed) p.grounded = true;
  if (p.grounded && ground === -Infinity && !landed) { /* walked off into a gap */ }
  if (p.y < -4) { die(w, 'pit'); return; }

  // Checkpoint & flagpole grab.
  if (p.x >= CHECKPOINT_X && w.checkpoint < CHECKPOINT_X) { w.checkpoint = CHECKPOINT_X + 2; emit(w, 'checkpoint'); }
  if (p.x > FLAG_X - .6) { w.flagWalk = true; w.flagT = 0; const bonus = clamp(Math.round(p.y) * 500, 100, 5000); w.score += bonus; emit(w, 'flag', { bonus }); return; }

  advanceEnemies(w, dt, p, false);

  // Items (mushrooms) slide, obey gravity, and power the player up.
  for (const it of w.items) {
    if (!it.alive) continue;
    it.vy -= 22 * dt; it.y += it.vy * dt; it.x += it.vx * dt;
    let top = floorAt(it.x) === -Infinity ? -Infinity : 0;
    for (const s of w.solids) {
      if ((s.block && s.block.broken) || s.pipe) continue;
      if (it.x + .4 > s.x1 && it.x - .4 < s.x2 && it.y <= s.y2 && it.y > s.y2 - 1 && s.y2 > top) top = s.y2;
    }
    if (top > -Infinity && it.y <= top) { it.y = top; it.vy = 0; }
    if (it.y < -4) { it.alive = false; continue; }
    if (Math.abs(p.x - it.x) < .8 && Math.abs(p.z - it.z) < .8 && p.y < it.y + .8 && p.y + h > it.y - .4) {
      it.alive = false; w.score += 1000;
      if (!p.big) { p.big = true; p.y += 1; emit(w, 'grow'); } else emit(w, 'grow');
    }
  }
  // Floating coins.
  for (const c of w.coinsLive) {
    if (!c.alive) continue; c.t += dt;
    if (Math.abs(p.x - c.x) < .8 && Math.abs(p.z - c.z) < .8 && p.y < c.y + .6 && p.y + h > c.y - .6) {
      c.alive = false; addCoin(w, c.x, c.y, 0);
    }
  }
}
function advanceEnemies(w, dt, p, peaceful) {
  const h = p.big ? 2.5 : 1.55;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.t += dt;
    if (e.squashT > 0) { e.squashT -= dt; if (e.squashT <= 0) e.alive = false; continue; }
    // Walk, reverse at solids, fall into pits.
    const nx = e.x + e.vx * dt;
    let blocked = false;
    for (const s of w.solids) {
      if (s.block && s.block.broken) continue;
      if (nx + .4 > s.x1 && nx - .4 < s.x2 && e.y < s.y2 - .3 && e.y + .8 > s.y1) { blocked = true; break; }
    }
    if (blocked) e.vx = -e.vx; else e.x = clamp(nx, -1, LEVEL_END - 1);
    e.vy -= 26 * dt; e.y += e.vy * dt;
    let top = floorAt(e.x) === -Infinity ? -Infinity : 0;
    for (const s of w.solids) {
      if (s.block && s.block.broken) continue;
      if (e.x + .4 > s.x1 && e.x - .4 < s.x2 && e.y <= s.y2 && e.y > s.y2 - 1 && s.y2 > top) top = s.y2;
    }
    if (top > -Infinity && e.y <= top) { e.y = top; e.vy = 0; }
    if (e.y < -4) { e.alive = false; continue; }
    e.z += clamp(p.z - e.z, -1, 1) * .5 * dt; // drift toward the player's lane
    if (peaceful || p.invuln > 0) continue;
    if (Math.abs(p.x - e.x) < .75 && Math.abs(p.z - e.z) < .75) {
      const falling = p.vy < -1 && p.y >= e.y + .5;
      if (falling) {
        e.squashT = .5; e.vx = 0; p.vy = 7.5; w.score += e.kind === 'koopa' ? 200 : 100; emit(w, 'stomp', { x: e.x, y: e.y, z: e.z });
      } else if (p.y + h > e.y + .2 && p.y < e.y + .9) {
        if (p.big) { p.big = false; p.invuln = 2; p.y = Math.max(0, p.y); emit(w, 'shrink'); }
        else { die(w, 'enemy'); return; }
      }
    }
  }
}
