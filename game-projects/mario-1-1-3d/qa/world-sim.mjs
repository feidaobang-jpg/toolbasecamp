// Headless deterministic gameplay tests for mario-1-1-3d (no THREE, no DOM).
import assert from 'node:assert';
import { createWorld, stepWorld, LEVEL_END, FLAG_X } from '../../../public/html/game/mario-1-1-3d/world.js';

const noop = { x: 0, z: 0, run: false, jump: false, jumpPressed: false, yaw: 0, pitch: 0, reset: false };
function run(w, input, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    stepWorld(w, { ...noop, ...input }, 1 / 60);
    if (w.status !== 'playing') break;
  }
  return w;
}
const drain = w => w.events.splice(0).map(e => e.type);

// 1. Run right: player advances past the first ?-block (enemies cleared — pure movement test).
{
  const w = createWorld(); w.status = 'playing';
  w.enemies.length = 0;
  run(w, { x: 1 }, 4);
  assert.ok(w.player.x > 18, `advanced: ${w.player.x.toFixed(1)}`);
  assert.equal(w.status, 'playing');
  console.log('1. run-right OK, x =', w.player.x.toFixed(1));
}
// 2. Jump and bump the ?-block at x=16 -> coin + score.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 16;
  // Jump right under the block, hold jump for full height.
  run(w, { x: 0 }, .1);
  w.player.jumpBuffer = 0;
  run(w, { jump: true, jumpPressed: true }, .2);
  run(w, { jump: true }, .5);
  const blk = w.blocks.find(b => b.x === 16);
  assert.ok(blk.used, 'question block used');
  assert.equal(w.coins, 1, 'coin collected');
  assert.ok(w.score >= 200, 'score for coin');
  console.log('2. bump ?-block OK, coins =', w.coins, 'score =', w.score);
}
// 3. Mushroom block: bump at 21, catch the mushroom, grow big.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 21;
  run(w, { jump: true, jumpPressed: true }, .2);
  run(w, { jump: true }, .6);
  const blk = w.blocks.find(b => b.x === 21);
  assert.ok(blk.used, 'mushroom block used');
  assert.ok(w.items.some(it => it.type === 'mushroom' && it.alive), 'mushroom spawned');
  // Mushroom walks right; wait for it to fall to ground and chase it.
  run(w, { x: 1, run: true }, 1.2);
  const caught = w.player.big || w.items.every(it => !it.alive);
  // Keep chasing until collected (mushroom moves at 2, player runs 8.4).
  for (let i = 0; i < 12 && !w.player.big; i++) run(w, { x: 1, run: true }, .4);
  assert.ok(w.player.big, 'player grew big');
  console.log('3. mushroom-grow OK, big =', w.player.big, 'score =', w.score);
}
// 4. Stomp a goomba.
{
  const w = createWorld(); w.status = 'playing';
  const g = w.enemies.find(e => e.kind === 'goomba' && e.x === 40);
  // Drop on it from above (x=40 has no blocks overhead).
  w.player.x = 40; w.player.z = 0; w.player.y = 3; w.player.vy = -2; w.player.grounded = false;
  run(w, {}, .6);
  assert.ok(g.squashT > 0 || !g.alive, 'goomba stomped');
  assert.ok(w.score >= 100, 'stomp score');
  console.log('4. stomp OK, score =', w.score);
}
// 5. Pit death: walk into the first gap, lose a life, respawn at start.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 68; w.player.grounded = true;
  run(w, { x: 1 }, 2.5);
  assert.equal(w.lives, 2, 'lost one life');
  assert.equal(w.checkpoint, 2, 'no checkpoint before the first gap');
  assert.ok(w.player.x < 30, `respawned near start and walked on: ${w.player.x.toFixed(1)}`);
  assert.equal(w.status, 'playing');
  console.log('5. pit-death + respawn OK, lives =', w.lives);
}
// 6. Big mario breaks a brick from below.
{
  const w = createWorld(); w.status = 'playing';
  w.player.big = true; w.player.x = 20;
  run(w, { jump: true, jumpPressed: true }, .2);
  run(w, { jump: true }, .6);
  const brick = w.blocks.find(b => b.x === 20);
  assert.ok(brick.broken, 'brick broken by big mario');
  console.log('6. brick-break OK');
}
// 7. Small mario bumping a brick only bounces it.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 20;
  run(w, { jump: true, jumpPressed: true }, .2);
  run(w, { jump: true }, .6);
  const brick = w.blocks.find(b => b.x === 20);
  assert.ok(!brick.broken && brick.bumpT >= 0, 'brick intact, bump registered');
  console.log('7. small-bump OK');
}
// 8. Flagpole: crossing it triggers the win walk and clear.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = FLAG_X - 2; w.player.grounded = true;
  run(w, { x: 1, run: true }, 5);
  assert.equal(w.status, 'won', 'stage won');
  assert.ok(w.score > 2000, 'flag + time bonus applied: ' + w.score);
  console.log('8. flagpole-win OK, score =', w.score);
}
// 9. Timeout kills.
{
  const w = createWorld(); w.status = 'playing';
  w.time = .05;
  run(w, {}, .3);
  assert.equal(w.lives, 2, 'timeout costs a life');
  console.log('9. timeout OK');
}
// 10. 100 coins -> 1-UP.
{
  const w = createWorld(); w.status = 'playing';
  w.coins = 99;
  const livesBefore = w.lives;
  // Teleport onto a floating coin and pick it up.
  const c = w.coinsLive[0];
  w.player.x = c.x; w.player.y = c.y - 1; w.player.z = 0;
  run(w, {}, .2);
  assert.ok(!c.alive, 'coin picked up');
  assert.equal(w.coins, 0, 'coin counter rolled over 100');
  assert.equal(w.lives, livesBefore + 1, '1-UP granted');
  console.log('10. coin-1up OK, lives =', w.lives);
}
console.log('ALL WORLD SIM TESTS PASSED');
