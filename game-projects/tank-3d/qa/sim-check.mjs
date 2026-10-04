// 逻辑模拟验收（Node）：经典 35 关数据、原版数值、魔改 100 关生成与 Boss 关可通关性、耐久与命数。
// node game-projects/tank-3d/qa/sim-check.mjs
import assert from 'node:assert/strict';
import { createRun, createWorld, step, qa } from '../../../public/html/game/tank-3d/sim.js';
import { classicStage, remixStage, CLASSIC_COUNT, REMIX_LEVELS, brickCell, N } from '../../../public/html/game/tank-3d/levels.js';
const results = [];
const ok = (name, extra = '') => { results.push({ name, extra }); console.log('ok  ' + name + (extra ? '  ' + extra : '')); };

// 1) 经典 35 关：每关 20 辆、出生间隔 190-4n、36～70 关地图循环且名单固定为第 35 关
for (let s = 1; s <= CLASSIC_COUNT; s++) {
  const st = classicStage(s);
  assert.equal(st.roster.length, 20, 'stage ' + s + ' roster');
  assert.equal(st.spawnInterval, 190 - 4 * s);
  for (const [x, y] of [[8, 24], [9, 24], [8, 25], [9, 25]]) assert.ok(!brickCell(st.terrain, x, y) && !st.terrain.steel[y * N + x], 'player spawn clear ' + s);
}
assert.deepEqual(classicStage(1).roster.slice(16), ['basic', 'basic', 'fast', 'fast']);
assert.equal(classicStage(36).mapNo, 1); assert.equal(classicStage(36).spawnInterval, 190 - 140); assert.deepEqual(classicStage(36).roster, classicStage(35).roster);
assert.equal(classicStage(71).mapNo, 1); assert.deepEqual(classicStage(71).roster, classicStage(1).roster);
ok('classic 35 stages + 36-70 loop');

// 2) 原版数值：玩家 0.75px/帧；首辆立即出生；出生顺序 中 → 右 → 左
{
  const w = createWorld(createRun({ mode: 'classic', lives: 'classic', armor: 'classic', seed: 1 }));
  for (let i = 0; i < 40; i++) step(w, { dir: -1 });
  assert.ok(w.player && w.player.state === 'active', 'player spawned');
  w.terrain.brick.fill(0); w.terrain.steel.fill(0);
  const y0 = w.player.y; for (let i = 0; i < 40; i++) step(w, { dir: 0 });
  assert.equal(y0 - w.player.y, 30, 'player 0.75 px/frame');
  const w2 = createWorld(createRun({ mode: 'classic', seed: 4 }));
  step(w2); assert.equal(w2.bots[0].x, 96, 'first spawn middle, immediately');
  for (let i = 0; i < 400; i++) step(w2, { dir: -1 });
  const xs = w2.events.filter(e => e.type === 'spawn' && e.team === 'bot').map(e => e.x - 8);
  assert.deepEqual(xs.slice(0, 3), [96, 192, 0], 'spawn order mid/right/left');
  const gaps = []; let last = null; w2.events.length = 0;
  for (let i = 0; i < 1200; i++) { step(w2, { dir: -1 }); if (w2.events.some(e => e.type === 'spawn' && e.team === 'bot')) { if (last !== null) gaps.push(i - last); last = i; } w2.events.length = 0; }
  assert.ok(gaps.length === 0 || gaps.every(g => g >= 186), 'spawn interval >= 186 frames on stage 1: ' + gaps);
  ok('classic speeds / spawn order');
}
// 3) 砖块削除：普通弹 16px 宽 × 4px 深；三星整格清除可破钢
{
  const w = createWorld(createRun({ mode: 'classic', seed: 2 }));
  for (let i = 0; i < 40; i++) step(w, { dir: -1 });
  w.bots.length = 0; w.roster.length = 0; w.rosterIndex = 0; w.remaining = 99;
  const T = w.terrain; T.brick.fill(0); T.steel.fill(0);
  for (let cx = 6; cx <= 11; cx++) for (let cy = 16; cy <= 17; cy++) { const i = cy * 2 * 52 + cx * 2; T.brick[i] = T.brick[i + 1] = T.brick[i + 52] = T.brick[i + 53] = 1; }
  Object.assign(w.player, { x: 64, y: 176, dir: 0, shield: 0 });
  const before = T.brick.reduce((a, b) => a + b, 0);
  step(w, { dir: -1, firePressed: true });
  for (let i = 0; i < 30; i++) step(w, { dir: -1 });
  assert.equal(before - T.brick.reduce((a, b) => a + b, 0), 4, 'normal shell removes 4 quads (16x4px)');
  w.player.stars = 3; w.player.power = 1; w.player.bulletSpeed = 4;
  const b2 = T.brick.reduce((a, b) => a + b, 0);
  step(w, { dir: -1, firePressed: true }); for (let i = 0; i < 30; i++) step(w, { dir: -1 });
  assert.equal(b2 - T.brick.reduce((a, b) => a + b, 0), 4, '3-star clears the two whole 8px cells it touches (remaining halves)');
  T.steel[15 * N + 8] = 1; T.steel[15 * N + 9] = 1;
  step(w, { dir: -1, firePressed: true }); for (let i = 0; i < 30; i++) step(w, { dir: -1 });
  step(w, { dir: -1, firePressed: true }); for (let i = 0; i < 30; i++) step(w, { dir: -1 });
  assert.equal(T.steel[15 * N + 8] + T.steel[15 * N + 9], 0, '3-star breaks steel');
  ok('brick quadrant destruction');
}
// 4) 经典整关：演示模式（玩家与老鹰无敌）+ 追猎自动驾驶 + 定时清场，检查出场、计分、过关流程
function autoplay(w, frames, pilot) {
  for (let i = 0; i < frames && w.status !== 'won' && w.status !== 'over'; i++) step(w, pilot(w, i));
  return w.status;
}
const hunter = (w, i) => {
  const p = w.player; if (!p) return { dir: -1 };
  const t = w.bots.filter(b => b.state === 'active').sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y))[0];
  if (!t) return { dir: i % 240 < 120 ? 0 : 2, firePressed: false, fire: false };   // 没有目标时不开炮，免得自己打到老鹰
  const dx = t.x - p.x, dy = t.y - p.y;
  const dir = Math.abs(dx) < 6 ? (dy < 0 ? 0 : 2) : Math.abs(dy) < 6 ? (dx > 0 ? 1 : 3) : Math.abs(dx) < Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
  // 自动驾驶别朝自家老鹰开炮（老鹰在 x 96..112、y 192..208）
  const towardEagle = d => (p.y > 176 && (d === 1 || d === 3)) || (d === 2 && p.x > 76 && p.x < 116);
  const own = towardEagle(dir) || towardEagle(p.dir);
  return { dir, firePressed: !own && i % 6 === 0, fire: !own };
};
for (const s of [1, 2, 17, 35]) {
  const w = createWorld(createRun({ mode: 'classic', lives: 'inf', armor: 'classic', demo: true, stage: s, seed: 3 + s }));
  const st = autoplay(w, 60 * 60 * 12, (w, i) => { if (i % 900 === 0) for (const b of w.bots) if (b.state === 'active') qa.destroyBot(w, b, false); return hunter(w, i); });
  assert.equal(st, 'won', 'classic stage ' + s + ' clears');
  ok('classic stage ' + s + ' flow', 'frames=' + w.t + ' kills=' + JSON.stringify(w.kills));
}
// 5) 老鹰被毁 → 39 帧爆炸 → GAME OVER 字样 256 帧 → 结束
{
  const w = createWorld(createRun({ mode: 'classic', seed: 9 }));
  for (let i = 0; i < 40; i++) step(w);
  w.eagle.alive = false; w.eagle.boom = 39;
  let n = 0; while (w.status !== 'over' && n < 600) { step(w); n++; }
  assert.equal(w.status, 'over'); assert.equal(n, 39 + 255);
  ok('eagle game over timing', n + ' frames');
}
// 6) 魔改 100 关：名单合理、Boss 关、难度渐近
for (let L = 1; L <= REMIX_LEVELS; L++) {
  const st = remixStage(L, 1);
  if (st.role === 'boss' || st.role === 'final') assert.deepEqual(st.roster, [st.role === 'final' ? 'final' : 'boss']);
  else assert.ok(st.roster.length >= 16 && st.roster.length <= 35, 'roster ' + L);
  if (st.role === 'mini') assert.ok(st.roster.includes('mini'));
  for (const [x, y] of [[8, 24], [9, 24], [8, 25], [9, 25]]) assert.ok(!brickCell(st.terrain, x, y) && !st.terrain.water[y * N + x], 'remix player spawn clear ' + L);
}
for (const c of [1, 2, 5, 20, 200]) { const st = remixStage(37, c); assert.ok(st.diff.speed < 1.43 && st.diff.fireDiv > 18 && st.maxBots <= 6); }
ok('remix 100 levels generated');
// 7) 魔改小 Boss 关与大 Boss 关能打完（演示模式 + 自动驾驶 + 定时清场辅助）
for (const L of [5, 10, 45, 100]) {
  const w = createWorld(createRun({ mode: 'remix', lives: 'inf', armor: 'std', demo: true, stage: L, seed: 11 + L }));
  let bossSeen = false;
  const st = autoplay(w, 60 * 60 * 15, (w, i) => {
    if (w.boss && w.boss.state === 'active') bossSeen = true;
    if (i % 600 === 0) for (const b of w.bots) if (b.state === 'active' && b.size === 16 && b.type !== 'mini') qa.destroyBot(w, b, false);
    if (w.boss && w.boss.state === 'active' && i % 30 === 0) { w.boss.hp -= 1; if (w.boss.hp <= 0) qa.destroyBot(w, w.boss, false); }
    return hunter(w, i);
  });
  assert.equal(st, 'won', 'remix level ' + L + ' clears'); assert.ok(bossSeen, 'boss appeared ' + L);
  ok('remix level ' + L + ' (' + w.spec.role + ')', 'frames=' + w.t + ' bosses=' + w.run.stats.bosses);
}
// 8) 标准耐久：3 格、受击无敌、阵亡复活补满；经典 3 命一发
{
  const w = createWorld(createRun({ mode: 'remix', lives: 'classic', armor: 'std', seed: 5 }));
  for (let i = 0; i < 300; i++) step(w);
  w.player.shield = 0; qa.hurtPlayer(w, 1); assert.equal(w.run.hp, 2); qa.hurtPlayer(w, 1); assert.equal(w.run.hp, 2, 'invuln after hit');
  w.player.invuln = 0; qa.hurtPlayer(w, 1); assert.equal(w.run.hp, 1); w.player.invuln = 0; qa.hurtPlayer(w, 1);
  assert.equal(w.player.state, 'boom');
  for (let i = 0; i < 80; i++) step(w);
  assert.equal(w.run.lives, 2); assert.equal(w.run.hp, 3); assert.ok(w.player && w.player.shield > 0);
  const c = createWorld(createRun({ mode: 'classic', lives: 'classic', armor: 'classic', seed: 6 }));
  for (let i = 0; i < 300; i++) step(c);
  for (let k = 0; k < 3; k++) { c.player.shield = 0; qa.hurtPlayer(c, 1); assert.equal(c.player.state, 'boom'); for (let i = 0; i < 120; i++) step(c); }
  assert.equal(c.status, 'gameover', 'classic 3 lives exhausted');
  ok('durability + lives');
}
// 9) 魔改：道具放 4 秒后敌军能抢（铁锹挖空老鹰围墙）；修理包固定在第 7、14 辆掉落
{
  const w = createWorld(createRun({ mode: 'remix', lives: 'inf', armor: 'std', seed: 21, stage: 3 }));
  for (let i = 0; i < 200; i++) step(w);
  const bot = w.bots.find(b => b.state === 'active');
  w.powerup = { type: 'shovel', x: bot.x, y: bot.y, age: 241, life: 1200 };
  bot.speed = 0; step(w);
  assert.equal(w.powerup, null, 'enemy grabbed the powerup');
  assert.ok([[11, 23], [12, 23]].every(([x, y]) => !brickCell(w.terrain, x, y)), 'enemy shovel strips the fort');
  const killed = [];
  for (let k = 0; k < 14; k++) { const b = qa.spawnBot(w, 'basic', 8 + k * 12, 64, 16, false); b.state = 'active'; qa.destroyBot(w, b, false); killed.push(w.items.length); }
  assert.equal(killed[6], 1); assert.equal(killed[13], 2); assert.equal(w.items[0].type, 'repair');
  const c = createWorld(createRun({ mode: 'classic', armor: 'classic', seed: 22 }));
  for (let k = 0; k < 14; k++) { const b = qa.spawnBot(c, 'basic', 8 + k * 12, 64, 16, false); b.state = 'active'; qa.destroyBot(c, b, false); }
  assert.equal(c.items.length, 0, 'classic original rules: no extra drops');
  ok('remix enemy loot + fixed repair drops');
}
// 10) Boss 重型炮弹打到老鹰围墙只炸开不破坏；普通炮弹照常削砖
{
  const w = createWorld(createRun({ mode: 'remix', lives: 'inf', armor: 'std', seed: 23, stage: 10 }));
  for (let i = 0; i < 160; i++) step(w);
  const boss = w.bots.find(b => b.size > 16);
  boss.x = 88; boss.y = 120; boss.dir = 2; boss.state = 'active';
  const before = [...w.terrain.brick];
  qa.spawnBot; w.bullets.push({ id: 999, owner: boss, team: 'bot', x: 104, y: 160, dir: 2, speed: 3, power: 0, kind: 'wide', half: 16, state: 'fly', st: 0, age: 0 });
  for (let i = 0; i < 30; i++) step(w);
  assert.ok(w.eagle.alive, 'eagle survives wide shell');
  assert.deepEqual([[11, 23], [12, 23], [13, 23], [14, 23]].map(([x, y]) => brickCell(w.terrain, x, y)), [1, 1, 1, 1], 'fort bricks intact');
  ok('boss heavy shells cannot breach the HQ fort');
}
console.log(JSON.stringify({ passed: results.length }));
