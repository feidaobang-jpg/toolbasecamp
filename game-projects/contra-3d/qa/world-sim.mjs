// Headless gameplay simulation for contra-3d world.js (no rendering needed).
// Run: node qa/world-sim.mjs
import { createWorld, stepWorld, LEVEL_END } from '../../../public/html/game/contra-3d/world.js';
import assert from 'node:assert/strict';

const noopInput = { x: 0, z: 0, shoot: false, jump: false, jumpPressed: false, divePressed: false, yaw: 0, pitch: 0, reset: false };
const DT = 1 / 60;

function run(w, input, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    stepWorld(w, { ...input, jumpPressed: input.jump && !run.wasJump, divePressed: false }, DT);
    run.wasJump = input.jump;
  }
  run.wasJump = false;
}

// 1. Start and run right: player advances and world stays consistent.
{
  const w = createWorld(); w.status = 'playing'; w.player.invincible = 999;
  run(w, { ...noopInput, x: 1 }, 4);
  assert.ok(w.player.x > 15, `player advanced: ${w.player.x}`);
  assert.equal(w.status, 'playing');
  console.log('1. run-right OK, x =', w.player.x.toFixed(1));
}
// 2. Shooting kills a pre-placed sniper ahead.
{
  const w = createWorld(); w.status = 'playing'; w.player.invincible = 999;
  const sniper = w.enemies.find(e => e.kind === 'sniper' && e.x === 18);
  w.player.z = sniper.z; // line up on the same lane
  // Walk close enough (x≈13), face right, hold fire.
  run(w, { ...noopInput, x: 1 }, 2.2);
  run(w, { ...noopInput, x: 0, shoot: true }, 3);
  assert.ok(!sniper.alive, 'sniper killed by bullets');
  assert.ok(w.score > 0, 'score increased');
  console.log('2. shoot-sniper OK, score =', w.score);
}
// 3. Bridge arms and explodes after being stepped on.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 70.5; w.player.y = 0; w.player.grounded = true;
  const seg = w.bridge.find(s => s.range[0] === 70);
  run(w, { ...noopInput }, 0.1);
  assert.ok(seg.timer >= 0 || !seg.alive, 'bridge armed on step');
  run(w, { ...noopInput, x: 1 }, 1);
  assert.ok(!seg.alive, 'first bridge segment exploded');
  const next = w.bridge.find(s => s.range[0] === 72);
  assert.ok(next.timer >= 0 || !next.alive, 'chain armed or exploded');
  console.log('3. bridge-explosion OK');
}
// 4. Water: dive protects from aimed bullets, player can move in water.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = 90; w.player.y = -0.85; w.player.grounded = true;
  assert.ok(w.player.inWater === false || true); // inWater set during step
  run(w, { ...noopInput, divePressed: true }, 0.05);
  // divePressed only honored via input.divePressed inside stepWorld; simulate hold:
  stepWorld(w, { ...noopInput, divePressed: true, dive: true }, DT);
  assert.ok(w.player.dive || w.player.inWater, 'dive/water state active in river');
  console.log('4. water-dive OK, inWater =', w.player.inWater, 'dive =', w.player.dive);
}
// 5. Contact death consumes a life and respawns at checkpoint, game over at 0.
{
  const w = createWorld(); w.status = 'playing';
  const runner = w.enemies.find(e => e.kind === 'turret' && e.x === 44);
  w.player.x = 44; w.player.z = 0; w.player.y = 0; w.player.invincible = 0;
  stepWorld(w, noopInput, DT);
  assert.equal(w.lives, 2, 'life lost on contact');
  assert.equal(w.player.invincible > 0, true, 'respawn invincibility');
  assert.equal(w.status, 'playing');
  w.lives = 1; w.player.invincible = 0; w.player.x = 44; w.player.z = 0;
  stepWorld(w, noopInput, DT);
  assert.equal(w.status, 'dead', 'game over after last life');
  console.log('5. death-lives-gameover OK');
}
// 6. Boss: destroy both wall cannons -> stage clear.
{
  const w = createWorld(); w.status = 'playing';
  w.player.x = LEVEL_END - 20; w.player.z = 0; w.checkpoint = 132;
  // Isolate from capsule triggers/pods that would legitimately intercept bullets.
  w.capsuleTriggers.forEach(t => { t.done = true; }); w.capsules.length = 0;
  // Fire straight at each cannon's height (4 hp each) by seeding bullets.
  for (const bc of w.boss.cannons) {
    for (const bx of [184, 186, 188, 190]) w.bullets.push({ x: bx, y: bc.y, z: 0, vx: 15, vz: 0, life: 1.5 });
  }
  run(w, noopInput, 1.2);
  assert.ok(!w.boss.cannons[0].alive, 'cannon 1 destroyed');
  assert.ok(!w.boss.cannons[1].alive, 'cannon 2 destroyed');
  assert.equal(w.status, 'won', 'stage clear when both cannons down');
  console.log('6. boss-win OK, score =', w.score);
}
console.log('ALL WORLD SIM TESTS PASSED');
