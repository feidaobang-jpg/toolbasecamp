// Real projectile collision -> gameplay event -> sample/fallback routing.
import assert from 'node:assert/strict';
import { createRun, createWorld, step, fire, qa, emit } from '../../../public/html/game/tank-3d/sim.js';
import { GameAudio } from '../../../public/html/game/tank-3d/audio.js';
const originalFetch = globalThis.fetch;
globalThis.fetch = undefined;
const audio = new GameAudio();
globalThis.fetch = originalFetch;
let calls = [];
audio.play = (name) => { calls.push(name); return true; };
audio.tone = () => calls.push('fallback-tone');
audio.noise = () => calls.push('fallback-noise');
let passed = 0;
for (const mode of ['classic', 'remix']) for (const type of ['basic', 'fast', 'power', 'armor', 'heavy', 'flame']) {
  const w = createWorld(createRun({ mode, seed: 24 }));
  for (let i = 0; i < 40; i++) step(w, { dir: -1 });
  for (const value of Object.values(w.terrain)) value.fill(0);
  w.bots = []; w.bullets = []; w.rosterIndex = w.roster.length; w.remaining = 99;
  Object.assign(w.player, { x: 96, y: 128, dir: 0, lookHeading: 0 });
  const bot = qa.spawnBot(w, type, 96, 96, 16, false);
  Object.assign(bot, { state: 'active', speed: 0, shield: 0, carrier: false });
  for (const hp of [2, 1]) {
    bot.hp = hp; calls = []; w.events = []; w.bullets = [];
    assert(fire(w, w.player, { force: true }));
    for (let i = 0; i < 20; i++) step(w, { dir: -1 });
    const event = w.events.find(e => e.type === (hp === 2 ? 'armor' : 'boom'));
    assert(event, `${mode}/${type}: hit event missing`);
    if (hp === 1) { assert.equal(event.enemyType, type); assert.equal(bot.state, 'boom'); }
    for (const e of w.events) audio.effect(e);
    assert(calls.includes(hp === 2 ? 'bullet_hit_1' : 'explosion_1'), `${mode}/${type}: sample not played`);
    passed++;
  }
}
const w = createWorld(createRun());
emit(w, 'boom', { type: 'basic' });
assert.equal(w.events.at(-1).type, 'boom', 'payload must not replace event kind');
calls = []; audio.play = () => false;
audio.effect({ type: 'armor' }); audio.effect({ type: 'boom', team: 'bot' });
assert(calls.includes('fallback-tone') && calls.includes('fallback-noise'));
console.log(JSON.stringify({ passed, sampleFailureFallback: true, protectedEventType: true }));
