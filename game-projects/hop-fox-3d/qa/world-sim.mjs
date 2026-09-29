// Node logic simulation for hop-fox-3d. Run from repo root: node game-projects/hop-fox-3d/qa/world-sim.mjs
import assert from 'node:assert/strict';
import * as W from '../../../public/html/game/hop-fox-3d/world.js';

const { createWorld, startWorld, stepWorld, tileAt, qa, CRATE, USED, CLAY, EMPTY } = W;
const DT = 1 / 60, results = [];
const idle = { x: 0, run: false, jump: false, jumpPressed: false, action: false, actionPressed: false };
function test(name, fn) { fn(); results.push(name); console.log('ok -', name); }
function run(w, input, seconds) { let prevJump = false, prevAct = false; for (let t = 0; t < seconds; t += DT) { const i = typeof input === 'function' ? input(w, t) : input; stepWorld(w, { ...i, jumpPressed: i.jump && !prevJump, actionPressed: i.action && !prevAct }, DT); prevJump = !!i.jump; prevAct = !!i.action; } }
function fresh() { const w = createWorld(); startWorld(w); w.enemies.forEach(e => { e.alive = false; e.gone = true; }); return w; }
const place = (w, x, y) => Object.assign(w.hero, { x, y, vx: 0, vy: 0, grounded: true });

test('level loads; hero starts grounded on the meadow', () => {
  const w = fresh(); run(w, idle, .2);
  assert.equal(w.hero.y, 0); assert.ok(w.hero.grounded);
});
test('walk tops out at 6 tiles/s, holding J runs at 9.6, reversing skids', () => {
  const w = fresh(); run(w, { ...idle, x: 1 }, 1.2); assert.ok(Math.abs(w.hero.vx - 6) < .05, 'walk ' + w.hero.vx);
  place(w, 3, 0); run(w, { ...idle, x: 1, run: true }, 1.4); assert.ok(Math.abs(w.hero.vx - 9.6) < .05, 'run ' + w.hero.vx);
  let skidded = false; run(w, (ww) => { skidded ||= ww.hero.skid; return { ...idle, x: -1 }; }, .2); assert.ok(skidded);
});
test('variable jump: tap ≈ 1.5 tiles, hold ≈ 3.5 tiles, running jump higher', () => {
  const peak = (input, secs = 1.2) => { const w = fresh(); place(w, 3, 0); let m = 0; run(w, (ww, t) => { m = Math.max(m, ww.hero.y); return input(t); }, secs); return m; };
  const tap = peak(t => ({ ...idle, jump: t < .05 })), hold = peak(() => ({ ...idle, jump: true }));
  const runJ = (() => { const w = fresh(); place(w, 158.5, 0); w.hero.vx = 9.6; let m = 0; run(w, (ww, t) => { m = Math.max(m, ww.hero.y); return { ...idle, x: 1, run: true, jump: true }; }, 1.1); return m; })();
  console.log('   tap', tap.toFixed(2), 'hold', hold.toFixed(2), 'running', runJ.toFixed(2));
  assert.ok(tap > 1 && tap < 2.2); assert.ok(hold > 3.2 && hold < 4.3); assert.ok(runJ > hold + .6);
});
test('stump walls stop the hero flush', () => {
  const w = fresh(); place(w, 37, 0); run(w, { ...idle, x: 1 }, 1.5);
  assert.ok(Math.abs(w.hero.x + w.hero.hw - 40) < .01, 'x ' + w.hero.x);
});
test('bumping a crate from below pops an acorn and empties it', () => {
  const w = fresh(); place(w, 15.5, 0); run(w, (ww, t) => ({ ...idle, jump: t < .3 }), .8);
  assert.equal(w.coins, 1); assert.equal(tileAt(w, 15, 3), USED); assert.ok(w.events.length >= 0);
});
test('power crate → berry walks out → pickup → helmet can break clay', () => {
  const w = fresh(); place(w, 20.5, 4);   // standing on the plank row under the power crate at y=6
  run(w, (ww, t) => ({ ...idle, jump: t < .25 }), .5);
  const berry = w.items.find(i => i.kind === 'berry'); assert.ok(berry, 'berry spawned');
  berry.rising = 0; berry.vx = 0; Object.assign(w.hero, { x: berry.x, y: berry.y }); run(w, idle, .1);
  assert.equal(w.hero.power, 1);
  place(w, 100.5, 0); run(w, (ww, t) => ({ ...idle, jump: t < .3 }), .6);
  assert.equal(tileAt(w, 100, 4), EMPTY, 'clay broken');
  const w2 = fresh(); place(w2, 100.5, 0); run(w2, (ww, t) => ({ ...idle, jump: t < .3 }), .6); assert.equal(tileAt(w2, 100, 4), CLAY, 'small hero only bumps clay');
});
test('stomping a beetle squashes it; touching one from the side hurts', () => {
  const w = createWorld(); startWorld(w);
  const b = w.enemies[0]; b.vx = 0; Object.assign(w.hero, { x: b.x, y: b.y + 1.2, vy: -3, grounded: false }); run(w, idle, .25);
  assert.equal(b.state, 'squashed'); assert.equal(w.score, 100);
  const w2 = createWorld(); startWorld(w2); const b2 = w2.enemies[0]; b2.active = true; b2.vx = 0; place(w2, b2.x - 1.5, 0); run(w2, { ...idle, x: 1 }, .6);
  assert.ok(w2.hero.dead, 'small hero dies'); assert.equal(w2.lives, 2);
  const w3 = createWorld(); startWorld(w3); const b3 = w3.enemies[0]; b3.active = true; b3.vx = 0; w3.hero.power = 1; place(w3, b3.x - 1.5, 0); run(w3, { ...idle, x: 1 }, .6);
  assert.equal(w3.hero.power, 0); assert.ok(!w3.hero.dead); assert.ok(w3.hero.invincible > 0);
});
test('snail: stomp → shell, kick → sliding shell knocks out a beetle', () => {
  const w = createWorld(); startWorld(w);
  const s = w.enemies.find(e => e.kind === 'snail'), b = w.enemies.find(e => e.kind === 'beetle' && e.x > s.x);
  s.active = b.active = true;
  s.vx = 0; Object.assign(w.hero, { x: s.x, y: s.y + 1.3, vy: -3, grounded: false }); run(w, idle, .25);
  assert.equal(s.state, 'shell');
  place(w, s.x - 1.2, 0); run(w, { ...idle, x: 1 }, .3);
  assert.ok(Math.abs(s.vx) > 10, 'shell kicked');
  run(w, idle, 1.2);
  assert.equal(b.state, 'dead', 'beetle knocked out by shell');
});
test('falling in a pit costs a life and respawns at the checkpoint; three deaths end the run', () => {
  const w = fresh(); place(w, 55.5, 0); run(w, ww => ww.lives < 3 ? idle : { ...idle, x: 1 }, 3.5);
  assert.equal(w.lives, 2); assert.ok(!w.hero.dead); assert.equal(w.hero.x, 3);
  w.checkpoint = W.CHECKPOINT_X; qa.killHero(w, 'test'); run(w, idle, 3); assert.equal(w.hero.x, W.CHECKPOINT_X);
  qa.killHero(w, 'test'); run(w, idle, 3); assert.equal(w.status, 'lost');
});
test('spring leaf launches far higher than a jump', () => {
  const w = fresh(); place(w, 114.5, 3); w.hero.grounded = false; let m = 0; run(w, ww => { m = Math.max(m, ww.hero.y); return idle; }, 1.6);
  assert.ok(m > 8, 'peak ' + m.toFixed(2));
});
test('moving log carries the hero across the gap', () => {
  const w = fresh(); w.platform.x = 86; place(w, 87.5, 5); w.hero.grounded = false; run(w, idle, .5);
  assert.ok(w.hero.onPlatform, 'landed on the log'); const x0 = w.hero.x; run(w, idle, 1); assert.ok(Math.abs(w.hero.x - x0) > 1, 'carried'); assert.ok(!w.hero.dead);
});
test('goal: grabbing the pole high scores more, then slide, door, time bonus and win', () => {
  const w = fresh(); place(w, 165, 0); w.hero.vx = 9.6; const t0 = w.time;
  run(w, (ww, t) => ({ ...idle, x: 1, run: true, jump: t > .05 && t < .6 }), .8);
  assert.ok(w.goal, 'grabbed pole'); console.log('   pole height', w.goal.grabY.toFixed(2), 'points', w.goal.points);
  run(w, idle, 12);
  assert.equal(w.status, 'won'); assert.equal(w.time, 0); assert.ok(w.score > 20 * 50);
});

import { botInput } from './bot.mjs';
const bot = w => botInput(w, W);
test('bot plays the whole stage start to finish', () => {
  const w = createWorld(); startWorld(w);
  let deaths = 0, lastLives = w.lives, stuck = 0, lastX = 0;
  run(w, (ww, t) => { if (ww.lives < lastLives) { deaths++; lastLives = ww.lives; } if (Math.floor(t * 2) !== Math.floor((t - DT) * 2)) { stuck = Math.abs(ww.hero.x - lastX) < .1 ? stuck + 1 : 0; lastX = ww.hero.x; } return bot(ww); }, 120);
  console.log('   bot result', w.status, 'x', w.hero.x.toFixed(1), 'deaths', deaths, 'score', w.score, 'acorns', w.coins, 'time', w.time.toFixed(0));
  assert.equal(w.status, 'won');
});
console.log(`\n${results.length} checks passed`);
