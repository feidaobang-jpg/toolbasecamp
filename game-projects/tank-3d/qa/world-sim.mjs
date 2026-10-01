// Node logic simulation for tank-3d (no browser). Run from repo root:
//   node game-projects/tank-3d/qa/world-sim.mjs
import assert from 'node:assert/strict';
import * as W from '../../../public/html/game/tank-3d/world.js';
import { TOTAL_STAGES, stageSpec, layoutFor, qa as SQ } from '../../../public/html/game/tank-3d/stages.js';

const { createWorld, startWorld, stepWorld, cellAt, BRICK, STEEL, BASE, EMPTY, N, HALF, qa } = W;
const { reach, isFree, parseRows, SUPER } = SQ;
const idle = { dir: -1, fire: false };
const results = [];
function test(name, fn) { fn(); results.push(name); console.log('ok -', name); }
function run(w, input, seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) stepWorld(w, typeof input === 'function' ? input(w, t) : input, dt); }
function freshPlaying(seed = 7, stage = 1, loop = 1) { const w = createWorld(seed, stage, loop); startWorld(w); run(w, idle, 0.9); assert.ok(w.player, 'player spawned'); w.events.length = 0; return w; }
function count(w, v) { let n = 0; for (const c of w.grid) if (c === v) n++; return n; }
function noEnemies(w) { w.enemies.length = 0; w.spawning.length = 0; w.rosterIndex = w.roster.length; }

test('stage map parses: bricks, steel, 2x2 eagle and its brick fort', () => {
  const w = createWorld(1);
  assert.equal(count(w, BASE), 4);
  assert.equal(count(w, STEEL), 8);
  assert.ok(count(w, BRICK) > 200, 'bricks ' + count(w, BRICK));
  for (const [x, z] of W.BASE_WALL) assert.equal(cellAt(w, x, z), BRICK);
  for (const s of [W.PLAYER_SPAWN, ...W.ENEMY_SPAWNS]) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) assert.equal(cellAt(w, s.x + dx, s.z + dz), EMPTY, 'spawn clear');
});

test('player drives up the lane and stops flush against the brick column', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 9; p.z = 25;           // lane x=8..9 is open from the spawn to the top wall
  run(w, { dir: 0, fire: false }, 6);
  assert.ok(p.z < 2, 'reached top area, z=' + p.z);
  // Now drive right from x=5 at z=12.5 region: put it next to the column at x=6 in row band 16-22.
  p.x = 5; p.z = 19; run(w, { dir: 1, fire: false }, 1);
  assert.ok(Math.abs(p.x + HALF - 6) < 0.02, 'flush with brick at x=6, x=' + p.x);
});

test('turning snaps the old axis to the one-cell grid', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 9; p.z = 25;
  run(w, { dir: 0, fire: false }, 0.27);
  assert.ok(Math.abs(p.z - Math.round(p.z)) > 0.05, 'mid-cell before turn: ' + p.z);
  W.turnTank(p, 3);
  assert.equal(p.z, Math.round(p.z));
});

test('one shot removes a two-cell-wide, one-cell-deep brick strip', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 3; p.z = 25; p.dir = 0;  // column x=2..3 rows 16-22 straight above
  const before = count(w, BRICK);
  W.fire(w, p); run(w, idle, 0.4);
  assert.equal(before - count(w, BRICK), 2);
  assert.equal(cellAt(w, 2, 22), EMPTY); assert.equal(cellAt(w, 3, 22), EMPTY); assert.equal(cellAt(w, 2, 21), BRICK);
  assert.ok(w.events.some(e => e.type === 'brick'));
});

test('normal shots clank on steel; a level-3 shot pierces steel', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 1; p.z = 16; p.dir = 0;   // steel post at x=0..1 row 13
  W.fire(w, p); run(w, idle, 0.5);
  assert.equal(cellAt(w, 0, 13), STEEL); assert.ok(w.events.some(e => e.type === 'steel'));
  w.level = 3; W.fire(w, p); run(w, idle, 0.5);
  assert.equal(cellAt(w, 0, 13), EMPTY); assert.equal(cellAt(w, 1, 13), EMPTY);
});

test('enemy roster: 20 tanks, never more than 4 on the field, three flashing carriers', () => {
  const w = freshPlaying(3);
  const p = w.player; p.shield = 1e9;
  let maxOnField = 0; const carriers = new Set();
  run(w, (world) => { maxOnField = Math.max(maxOnField, world.enemies.length + world.spawning.length); for (const e of world.enemies) if (e.carrier) carriers.add(e.index); return idle; }, 60);
  assert.ok(maxOnField <= 4 && maxOnField >= 3, 'max on field ' + maxOnField);
  for (const c of carriers) assert.ok(w.spec.carriers.includes(c));
  assert.equal(w.roster.length, 20); assert.equal(w.roster.filter(t => t === 'fast').length, 2);
});

test('player bullet destroys an enemy for 100 points; hitting a carrier drops a power-up', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 9; p.z = 25; p.dir = 0;
  const e = { id: 999, team: 'enemy', type: 'basic', x: 9, z: 20, dir: 2, speed: 0, hp: 1, carrier: true, alive: true, fireTimer: 99, aiTimer: 99, travel: 0, recoil: 0, hitFlash: 0 };
  w.enemies.push(e); w.roster = ['basic']; w.rosterIndex = 1;
  W.fire(w, p); run(w, idle, 0.5);
  assert.equal(e.alive, false); assert.equal(w.score, 100); assert.equal(w.killed, 1);
  assert.ok(w.powerup, 'power-up spawned');
  const pu = w.powerup; for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) assert.equal(cellAt(w, pu.x + dx, pu.z + dz), EMPTY);
});

test('power-ups: star, helmet, shovel (reverts), timer, grenade (no points), tank', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player;
  qa.applyPowerup(w, { type: 'star', x: 1, z: 1 }); assert.equal(w.level, 1);
  qa.applyPowerup(w, { type: 'helmet', x: 1, z: 1 }); assert.ok(p.shield >= 9.9);
  qa.applyPowerup(w, { type: 'tank', x: 1, z: 1 }); assert.equal(w.lives, 4);
  // Damage the fort first so the rebuild is observable.
  w.grid[23 * N + 12] = EMPTY;
  qa.applyPowerup(w, { type: 'shovel', x: 1, z: 1 });
  for (const [x, z] of W.BASE_WALL) assert.equal(cellAt(w, x, z), STEEL);
  run(w, idle, 18.2);
  for (const [x, z] of W.BASE_WALL) assert.equal(cellAt(w, x, z), BRICK);
  qa.applyPowerup(w, { type: 'timer', x: 1, z: 1 }); assert.ok(w.freeze > 9);
  const scoreBefore = w.score + 500;
  w.roster = STAGE1(); w.rosterIndex = 2;
  for (const x of [5, 17]) w.enemies.push({ id: 900 + x, team: 'enemy', type: 'basic', x, z: 9, dir: 2, speed: 3, hp: 1, alive: true, fireTimer: 9, aiTimer: 9, travel: 0, recoil: 0, hitFlash: 0 });
  qa.applyPowerup(w, { type: 'grenade', x: 1, z: 1 });
  assert.equal(w.killed, 2); assert.equal(w.score, scoreBefore);
  function STAGE1() { return W.STAGE1_ROSTER.slice(); }
});

test('shield absorbs an enemy bullet; without it the tank is lost and a backup rolls in', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.shield = 5;
  const shooter = { id: 777, team: 'enemy', type: 'basic', x: 9, z: 19, dir: 2, speed: 0, hp: 1, alive: true, fireTimer: 99, aiTimer: 99, travel: 0, recoil: 0, hitFlash: 0 };
  w.enemies.push(shooter);
  // Freeze the shooter's AI but let it fire manually.
  w.freeze = 1e9; W.fire(w, shooter); run(w, idle, 0.6);
  assert.ok(w.player && w.player.alive, 'shielded tank survives');
  w.player.shield = 0; W.fire(w, shooter); run(w, idle, 0.6);
  assert.equal(w.level, 0, 'firepower resets with the tank');
  shooter.alive = false; w.enemies.length = 0;
  run(w, idle, 2.2);
  assert.ok(w.player && w.player.shield > 0, 'respawned with shield');
});

test('eagle hit by any bullet ends the game after the explosion', () => {
  const w = freshPlaying(); noEnemies(w);
  const p = w.player; p.x = 13; p.z = 20; p.dir = 2; w.level = 3; // pierce the fort in two shots
  W.fire(w, p); run(w, idle, 0.4); W.fire(w, p); run(w, idle, 0.4);
  assert.equal(w.baseAlive, false); assert.equal(w.status, 'playing');
  run(w, idle, 3);
  assert.equal(w.status, 'lost'); assert.equal(w.reason, 'base');
});

test('respawns are unlimited: only the eagle can lose a stage', () => {
  const w = freshPlaying(); noEnemies(w);
  for (let i = 0; i < 5; i++) { run(w, idle, 2.5); assert.ok(w.player, 'player present ' + i); w.player.shield = 0; qa.killPlayer(w); }
  run(w, idle, 3);
  assert.equal(w.status, 'playing'); assert.ok(w.player, 'still rolling out backups');
});

test('destroying all 20 enemies clears the stage', () => {
  const w = freshPlaying(11);
  w.player.shield = 1e9;
  run(w, (world) => { for (const e of world.enemies) if (e.alive) qa.destroyEnemy(world, e); if (world.player) world.player.shield = 1e9; return idle; }, 80);
  assert.equal(w.killed, 20); assert.equal(w.status, 'won'); assert.equal(w.tally.basic, 18); assert.equal(w.tally.fast, 2);
});

test('long autoplay soak: bounds, no wall overlap, no NaN, bounded bullets (5 seeds × 4 minutes)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = createWorld(seed); startWorld(w);
    let dir = 0, maxBullets = 0;
    run(w, (world, t) => {
      if (world.player) world.player.shield = Math.max(world.player.shield, 0); // real rules
      if (Math.floor(t * 2) % 3 === 0) dir = Math.floor(world.rng() * 4);
      maxBullets = Math.max(maxBullets, world.bullets.length);
      for (const tank of [world.player, ...world.enemies]) {
        if (!tank || !tank.alive) continue;
        assert.ok(Number.isFinite(tank.x) && Number.isFinite(tank.z));
        assert.ok(tank.x >= HALF - 1e-6 && tank.x <= N - HALF + 1e-6 && tank.z >= HALF - 1e-6 && tank.z <= N - HALF + 1e-6, 'bounds');
        if (world.shovel <= 0) for (let cz = Math.floor(tank.z - HALF); cz <= Math.floor(tank.z + HALF - 1e-9); cz++) for (let cx = Math.floor(tank.x - HALF); cx <= Math.floor(tank.x + HALF - 1e-9); cx++) assert.equal(cellAt(world, cx, cz), EMPTY, 'tank inside wall at ' + cx + ',' + cz);
      }
      return { dir, fire: true };
    }, 240, 1 / 30);
    assert.ok(maxBullets <= 8, 'bullets ' + maxBullets);
    assert.ok(['playing', 'lost', 'won'].includes(w.status));
    console.log('   seed', seed, 'status', w.status, w.reason || '', 'killed', w.killed, 'score', w.score, 'lives', w.lives);
  }
});

test('pressure check: an idle (shielded, non-firing) player lets enemies reach the eagle, but not instantly', () => {
  const times = [];
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    const w = createWorld(seed); startWorld(w);
    run(w, (world) => { if (world.player) { world.player.shield = 1e9; world.player.x = 1; world.player.z = 25; } return idle; }, 240, 1 / 30);
    times.push(w.baseAlive ? 240 : Math.round(w.time));
  }
  console.log('   eagle survival seconds with idle player:', times.join(', '));
  assert.ok(Math.min(...times) >= 20, 'base falls too quickly');
});

// A crude defender bot: line up with the nearest enemy and shoot. Informational balance probe.
function bot(world) {
  const p = world.player; if (!p) return idle;
  let best = null, bd = 1e9;
  for (const e of world.enemies) { const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z); if (d < bd) { bd = d; best = e; } }
  if (world.powerup) { const pu = world.powerup; const d = Math.abs(pu.x - p.x) + Math.abs(pu.z - p.z); if (d < 8) best = { x: pu.x, z: pu.z }; }
  if (!best) return { dir: p.z < 20 ? 2 : -1, fire: false };
  const dx = best.x - p.x, dz = best.z - p.z;
  const hitsFort = d => (d === 2 && p.x > 9.5 && p.x < 16.5) || (p.z > 21.5 && ((d === 1 && p.x < 12) || (d === 3 && p.x > 14)));
  if (Math.abs(dx) < .6) { const d = dz < 0 ? 0 : 2; return { dir: d, fire: !hitsFort(d) }; }
  if (Math.abs(dz) < .6) { const d = dx < 0 ? 3 : 1; return { dir: d, fire: !hitsFort(d) }; }
  // Never aim at the own fort: avoid firing downward near the base columns.
  const dir = Math.abs(dx) < Math.abs(dz) ? (dx < 0 ? 3 : 1) : (dz < 0 ? 0 : 2);
  const safe = !hitsFort(dir);
  return { dir, fire: safe };
}
test('balance probe: a simple line-up-and-shoot bot can clear the stage on some seeds', () => {
  let wins = 0; const rows = [];
  for (let seed = 101; seed <= 112; seed++) {
    const w = createWorld(seed); startWorld(w);
    run(w, bot, 300, 1 / 30);
    if (w.status === 'won') wins++;
    rows.push(`${seed}:${w.status}/${w.reason || '-'}${w.baseBy ? '(' + w.baseBy + ')' : ''}/k${w.killed}/L${w.lives}/${Math.round(w.time)}s`);
  }
  console.log('   ' + rows.join('  '));
  console.log('   bot wins', wins, '/ 12');
  assert.ok(wins >= 1, 'stage never cleared by bot');
});

// --- The 50-stage campaign and the loop scaling.
test('all 50 stage layouts are playable: eagle, fort, clear spawns and connected lanes', () => {
  const themes = new Set();
  for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
    const rows = layoutFor(stage), cells = parseRows(rows);
    assert.equal(rows.length, N); rows.forEach(r => assert.equal(r.length, N, 'row width, stage ' + stage));
    for (const [x, z] of [[12, 24], [13, 24], [12, 25], [13, 25]]) assert.equal(cells[z * N + x], BASE, 'eagle cell, stage ' + stage);
    for (const [x, z] of W.BASE_WALL) assert.equal(cells[z * N + x], BRICK, 'fort brick, stage ' + stage);
    for (const s of [W.PLAYER_SPAWN, ...W.ENEMY_SPAWNS]) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) assert.equal(cells[(s.z + dz) * N + s.x + dx], EMPTY, 'spawn clear, stage ' + stage);
    // Footprint BFS: every spawn can drive to the player and to the file above the fort, and the
    // player can patrol both halves of the moat. Otherwise a stage would be an unwinnable maze.
    const seen = reach(cells, [4, 12]);
    for (const [i, j] of [[0, 0], [6, 0], [12, 0], [6, 10], [0, 11], [12, 11]]) assert.ok(seen[j * SUPER + i], `stage ${stage} unreachable from ${i},${j}`);
    for (const s of [[0, 0], [6, 0], [12, 0]]) assert.ok(reach(cells, s)[12 * SUPER + 4], 'stage ' + stage + ' player not reachable from spawn');
    let bricks = 0, steels = 0; for (const c of cells) { if (c === BRICK) bricks++; if (c === STEEL) steels++; }
    assert.ok(bricks >= 60, 'stage ' + stage + ' only has ' + bricks + ' bricks');
    themes.add(stageSpec(stage, 1).theme);
  }
  assert.ok(themes.size >= 10, 'distinct themes used: ' + themes.size);
  // No two neighbouring stages may repeat a theme, otherwise the campaign feels copy-pasted.
  for (let stage = 2; stage <= TOTAL_STAGES; stage++) assert.notEqual(stageSpec(stage, 1).theme, stageSpec(stage - 1, 1).theme, 'theme repeat at ' + stage);
});

test('difficulty rises with every stage and every loop (never a step backwards)', () => {
  let prev = null;
  for (let loop = 1; loop <= 4; loop++) for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
    const s = stageSpec(stage, loop);
    if (prev) {
      assert.ok(s.tier > prev.tier, 'tier, stage ' + stage + ' loop ' + loop);
      assert.ok(s.speedMult > prev.speedMult && s.bulletMult > prev.bulletMult, 'mults, stage ' + stage);
      assert.ok(s.fireMult < prev.fireMult, 'enemies fire faster over time');
      assert.ok(s.spawnInterval < prev.spawnInterval, 'enemies arrive faster over time');
      assert.ok(s.maxOnField >= prev.maxOnField && s.scoreMult >= prev.scoreMult, 'field size and payout grow');
      assert.ok(s.roster.length >= 20 && s.roster.length <= 40, 'roster ' + s.roster.length);
    }
    if (loop === 1 && stage === 1) assert.deepEqual(s.roster, W.STAGE1_ROSTER, 'stage one keeps the classic mix');
    if (loop > 1) assert.ok(s.scoreMult > 1 && s.speedMult > stageSpec(stage, 1).speedMult, 'loop ' + loop + ' is harder than loop 1');
    if (stage > 1) assert.deepEqual(layoutFor(stage), s.rows, 'a stage keeps its layout across loops');
    prev = s;
  }
  const late = stageSpec(TOTAL_STAGES, 6);
  assert.ok(late.speedMult < 2 && late.fireMult > .4 && late.maxOnField <= 6, 'the curve stays sane at loop 6: ' + JSON.stringify({ sp: late.speedMult, f: late.fireMult, m: late.maxOnField }));
});

test('late-stage worlds wire the spec into enemy stats', () => {
  const base = createWorld(5, 1, 1), late = createWorld(5, 40, 3);
  assert.equal(late.stage, 40); assert.equal(late.loop, 3);
  assert.equal(late.roster.length, late.spec.roster.length);
  assert.ok(late.spec.roster.includes('armor') && late.spec.roster.includes('power'), 'armour and power tanks fielded by stage 40');
  startWorld(base); startWorld(late); run(base, idle, 6); run(late, idle, 6);
  const b = base.enemies[0], l = late.enemies[0];
  assert.ok(b && l, 'both spawn');
  assert.ok(l.speed > b.speed * 1.2, 'loop-3 tanks drive faster: ' + b.speed + ' → ' + l.speed);
  assert.ok(late.spec.maxOnField >= base.spec.maxOnField);
  const arm = late.spec.roster.indexOf('armor');
  if (arm >= 0) assert.equal(stageSpec(40, 3).armorHp >= 4, true);
});

test('spawn pressure holds on the hardest sampled stages (no stalled rosters, no NaN)', () => {
  for (const [stage, loop] of [[12, 1], [26, 2], [40, 3], [50, 4]]) {
    const w = createWorld(1000 + stage, stage, loop); startWorld(w);
    if (w.player) w.player.shield = 1e9;
    let maxOnField = 0;
    run(w, (world) => { if (world.player) world.player.shield = 1e9; maxOnField = Math.max(maxOnField, world.enemies.length + world.spawning.length); return idle; }, 240, 1 / 30);
    assert.ok(maxOnField <= w.spec.maxOnField, 'stage ' + stage + ' loop ' + loop + ' overflow: ' + maxOnField);
    assert.ok(w.killed + w.enemies.length + w.spawning.length > 0, 'enemies actually arrived');
    assert.ok(w.rosterIndex === w.roster.length || !w.baseAlive || w.status !== 'playing', 'the roster gets through the queue, stage ' + stage);
    assert.ok(['playing', 'won', 'lost'].includes(w.status));
    console.log(`   stage ${stage} loop ${loop}: ${w.status}/${w.reason || '-'} killed ${w.killed}/${w.roster.length} in ${Math.round(w.time)}s`);
  }
});

console.log(`\n${results.length} checks passed`);

