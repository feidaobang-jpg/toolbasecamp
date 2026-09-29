// Replays the capture harness's exact frame timing and bot in Node to find seeds where the
// scripted bot clears the stage (used to pick a seed for the offline-render showcase capture).
//   node game-projects/tank-3d/qa/seed-scan.mjs [fromSeed] [toSeed]
import * as W from '../../../public/html/game/tank-3d/world.js';

function botInput(w) {   // mirrors DRIVER.__beforeFrame in render-check.cjs
  const p = w.player;
  if (!p || w.status !== 'playing') return { dir: -1, fire: false };
  let best = null, bd = 1e9;
  for (const e of w.enemies) { const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z); if (d < bd) { bd = d; best = e; } }
  if (w.powerup) { const pu = w.powerup, d = Math.abs(pu.x - p.x) + Math.abs(pu.z - p.z); if (d < 9) best = pu; }
  const hitsFort = d => (d === 2 && p.x > 9.5 && p.x < 16.5) || (p.z > 21.5 && ((d === 1 && p.x < 12) || (d === 3 && p.x > 14)));
  let dir = -1, fire = false;
  if (best) {
    const dx = best.x - p.x, dz = best.z - p.z;
    if (Math.abs(dx) < .6) dir = dz < 0 ? 0 : 2; else if (Math.abs(dz) < .6) dir = dx < 0 ? 3 : 1;
    else dir = Math.abs(dx) < Math.abs(dz) ? (dx < 0 ? 3 : 1) : (dz < 0 ? 0 : 2);
    fire = !hitsFort(dir);
  }
  return { dir, fire };
}
export function replay(seed, maxSeconds = 90) {
  const w = W.createWorld(seed);
  let vnow = 1000, last = 1000, introT = 0, phase = 'title', frames = 0, bot = false, pickups = [];
  const ms = 1000 / 30;
  const frame = () => {
    vnow += ms; const dt = Math.min(.05, (vnow - last) / 1000); last = vnow; frames++;
    const input = bot ? botInput(w) : { dir: -1, fire: false };
    if (phase === 'intro') { introT += dt; if (introT >= 2.4) { phase = 'playing'; W.startWorld(w); } }
    if (phase === 'playing') { W.stepWorld(w, input, dt); for (const e of w.events) if (e.type === 'pickup') pickups.push(e.kind); w.events.length = 0; }
  };
  for (let i = 0; i < 2 + 20; i++) frame();          // open() + title frames
  phase = 'intro';                                    // Enter
  for (let i = 0; i < 90; i++) frame();
  bot = true;
  while (frames < (maxSeconds + 4) * 30 && w.status === 'playing') frame();
  return { seed, status: w.status, reason: w.reason, time: +w.time.toFixed(1), killed: w.killed, lives: w.lives, score: w.score, pickups };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 1, to = 200] = process.argv.slice(2).map(Number);
  const wins = [];
  for (let s = from; s <= to; s++) { const r = replay(s); if (r.status === 'won') wins.push(r); }
  wins.sort((a, b) => b.pickups.length - a.pickups.length || a.time - b.time);
  console.log(JSON.stringify(wins.slice(0, 12), null, 1));
  console.log('check seed 104 (first capture):', JSON.stringify(replay(104)));
}
