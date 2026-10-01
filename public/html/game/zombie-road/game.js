// Zombie Road 3D — simulation core. Pure data + step(), no THREE / DOM here.
// Original design: a zombie horde shambles down a snow-night highway toward the sandbag line;
// the player holds six waves, harvests parts from kills and builds auto turrets.

export const TOTAL_WAVES = 6;
export const FIELD = { minX: -13, maxX: 13, minZ: -118, maxZ: 49 };
export const WALL = { z: 42, minX: -9.5, maxX: 9.5 };
export const SPAWN = { x: 0, z: 46 }; // player respawn point, behind the sandbag line
export const LANES = [-6.5, -2.2, 2.2, 6.5];
export const SPAWN_ZONE = { z: -108 };

export const ENEMY_TYPES = {
  shambler: { hp: 40,  speed: 2.6, dmg: 7,  rate: 1.1, range: 2.2, pts: 10,  parts: 6,  radius: .8,  height: 1.8 },
  runner:   { hp: 24,  speed: 5.6, dmg: 5,  rate: .8,  range: 2.0, pts: 12,  parts: 6,  radius: .7,  height: 1.7 },
  brute:    { hp: 220, speed: 1.7, dmg: 16, rate: 1.5, range: 2.6, pts: 30,  parts: 14, radius: 1.3, height: 2.2 },
  spitter:  { hp: 55,  speed: 2.2, dmg: 12, rate: 3.0, range: 18,  pts: 18,  parts: 10, radius: .9,  height: 1.8, ranged: true },
  overlord: { hp: 420, speed: 2.0, dmg: 22, rate: 1.4, range: 2.8, pts: 60,  parts: 24, radius: 1.4, height: 2.5, elite: true },
  boneLord: { hp: 2600, speed: 1.6, dmg: 30, rate: 2.2, range: 3.6, pts: 400, parts: 80, radius: 2.4, height: 4.4, boss: true }
};
// Weapon 1 rifle (fast), 2 flamethrower (short cone, group damage + ignite), 3 sniper (heavy slow).
export const WEAPONS = [
  { key: 'w1', dmg: 12, rof: 7,   range: 62, tracer: 0xffe2a8 },
  { key: 'w2', dps: 52, range: 11, cone: .80, burn: 2.4, tracer: 0xff8a3c },
  { key: 'w3', dmg: 95, rof: 1.0, range: 95, tracer: 0xbfe8ff }
];
export const TURRET_COST = 100, TURRET_MAX = 6, TURRET_HP = 200, REPAIR_COST = 40;
export const WALL_HP = 1200, ALIVE_CAP = 30, MEDKIT_CHANCE = .1;

const WAVES = [
  { shambler: 12 },
  { shambler: 14, runner: 8 },
  { shambler: 14, runner: 10, brute: 3, overlord: 1 },
  { shambler: 14, runner: 12, brute: 5, spitter: 4 },
  { shambler: 16, runner: 12, brute: 6, spitter: 6, overlord: 1 },
  { shambler: 14, runner: 10, brute: 6, spitter: 6, overlord: 1, boneLord: 1 }
];
// Stages beyond the first loop: the six-wave core, scaled up, one more wave each loop.
export function totalWaves(w) { return TOTAL_WAVES + (w.loop - 1); }
function waveComp(n) {
  const base = WAVES[Math.min(n, WAVES.length) - 1];
  if (n <= WAVES.length) return base;
  const k = 1 + (n - WAVES.length) * .18, out = {};
  for (const t in base) out[t] = Math.round(base[t] * k);
  return out;
}

const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const clampF = (v, a, b) => v < a ? a : v > b ? b : v;

export function createWorld() {
  return {
    loop: 1, wave: 0, phase: 'idle', time: 0,
    wallHp: WALL_HP, wallMax: WALL_HP, parts: 0, score: 0,
    player: { x: SPAWN.x, z: SPAWN.z, y: 0, yaw: Math.PI, hp: 100, maxHp: 100, weapon: 0, fireCd: 0, flameEvt: 0, rollT: 0, rollCd: 0, rollDir: 0, invuln: 0, dead: false, deadT: 0, regenT: 0, demoInvuln: false, walk: 0 },
    enemies: [], shots: [], turrets: [], pickups: [],
    spawnQueue: [], spawnT: 0, burst: 2,
    kills: { shambler: 0, runner: 0, brute: 0, spitter: 0, overlord: 0, boneLord: 0 },
    softlock: null, events: [], wallAlarmT: 0, interT: 0, bossRef: null
  };
}

export function startRun(w, loop) {
  const fresh = createWorld();
  fresh.loop = loop;
  fresh.player.demoInvuln = w.player.demoInvuln;
  Object.assign(w, fresh);
  startWave(w);
}

export function startWave(w) {
  w.wave++;
  w.phase = 'combat';
  const comp = waveComp(w.wave), q = [];
  for (const t in comp) for (let i = 0; i < comp[t]; i++) q.push(t);
  // Heavies first so the wave opens with its headline threat.
  q.sort((a, b) => (ENEMY_TYPES[b].parts - ENEMY_TYPES[a].parts));
  w.spawnQueue = q; w.spawnT = .8; w.burst = w.wave >= 3 ? 3 : 2;
  w.events.push({ type: 'wave', n: w.wave, total: totalWaves(w), boss: !!ENEMY_TYPES[q[0]]?.boss || w.wave === totalWaves(w) });
}

function spawnEnemy(w, type) {
  const t = ENEMY_TYPES[type];
  const lane = LANES[(Math.random() * LANES.length) | 0];
  const m = 1 + .35 * (w.loop - 1), sp = Math.min(1.6, 1 + .1 * (w.loop - 1)), dm = 1 + .2 * (w.loop - 1);
  const e = {
    type, x: lane + (Math.random() - .5) * 2.5, z: SPAWN_ZONE.z - Math.random() * 8, y: 0,
    hp: t.hp * m, maxHp: t.hp * m, dmg: t.dmg * dm, speed: t.speed * sp,
    cd: 1 + Math.random(), retarget: 0, target: null, hitT: 0, burn: 0, walk: Math.random() * 6,
    summonT: 7, enraged: false, dir: Math.PI
  };
  w.enemies.push(e);
  if (t.boss) { w.bossRef = e; w.events.push({ type: 'bossroar' }); }
  w.events.push({ type: 'spawn' });
}

// Zombies march for the sandbag line; the player and turrets pull aggro up close.
function pickTarget(w, e) {
  const t = ENEMY_TYPES[e.type], p = w.player;
  const aggro = (t.boss ? 34 : t.elite ? 24 : 17) ** 2;
  let best = null, bd = aggro;
  const consider = (x, z, ref, kind, mult = 1) => {
    const d = dist2(e.x, e.z, x, z) * mult;
    if (d < bd) { bd = d; best = { x, z, ref, kind }; }
  };
  if (!p.dead && p.z < WALL.z) consider(p.x, p.z, p, 'player');
  for (const tu of w.turrets) consider(tu.x, tu.z, tu, 'turret', .8);
  if (best) return best;
  return { x: clampF(e.x, WALL.minX + 1, WALL.maxX - 1), z: WALL.z, ref: null, kind: 'wall' };
}

function damagePlayer(w, dmg, sx, sz) {
  const p = w.player;
  if (p.dead || p.invuln > 0 || p.rollT > 0 || p.demoInvuln) return;
  p.hp -= dmg; p.regenT = 5;
  w.events.push({ type: 'hurt', sx, sz });
  if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deadT = 2.2; w.events.push({ type: 'playerdown' }); }
}

function damageWall(w, dmg) {
  w.wallHp = Math.max(0, w.wallHp - dmg);
  w.events.push({ type: 'wallhit', dmg, x: clampF(w.player.x, WALL.minX, WALL.maxX), z: WALL.z });
  if (w.wallHp <= 0 && w.phase === 'combat') { w.phase = 'over'; w.events.push({ type: 'lose' }); }
}

function killEnemy(w, e) {
  const t = ENEMY_TYPES[e.type];
  w.score += t.pts; w.kills[e.type]++;
  e.dead = true;
  w.pickups.push({ kind: 'parts', x: e.x + (Math.random() - .5), z: e.z + (Math.random() - .5), v: t.parts, t: 25 });
  if (!t.boss && Math.random() < MEDKIT_CHANCE) w.pickups.push({ kind: 'medkit', x: e.x + (Math.random() - .5) * 2, z: e.z + (Math.random() - .5) * 2, v: 30, t: 25 });
  w.events.push({ type: 'kill', kind: e.type, x: e.x, y: e.y, z: e.z, pts: t.pts });
  if (e === w.bossRef) w.bossRef = null;
}

function splashDamage(w, x, z, r, dmg, team) {
  if (team === 'player') {
    for (const e of w.enemies) {
      const d2 = dist2(e.x, e.z, x, z), rr = r + ENEMY_TYPES[e.type].radius;
      if (d2 < rr * rr) { e.hp -= dmg * (1 - Math.sqrt(d2) / rr * .5); e.hitT = .12; if (e.hp <= 0) killEnemy(w, e); }
    }
  } else {
    const p = w.player;
    if (!p.dead && dist2(p.x, p.z, x, z) < r * r) damagePlayer(w, dmg, x, z);
    for (const tu of w.turrets) if (dist2(tu.x, tu.z, x, z) < r * r) tu.hp -= dmg * .8;
  }
}

function fireHitscan(w, ox, oy, oz, dx, dy, dz, dmg, range) {
  let bt = range, hit = null;
  for (const e of w.enemies) {
    const t = ENEMY_TYPES[e.type], cy = e.y + t.height * .55;
    const px = e.x - ox, py = cy - oy, pz = e.z - oz;
    const proj = px * dx + py * dy + pz * dz;
    if (proj < 0 || proj > range) continue;
    const lx = px - dx * proj, ly = py - dy * proj, lz = pz - dz * proj;
    const rr = t.radius + .4;
    if (lx * lx + ly * ly + lz * lz < rr * rr && proj < bt) { bt = proj; hit = e; }
  }
  const hx = ox + dx * bt, hy = oy + dy * bt, hz = oz + dz * bt;
  w.events.push({ type: 'tracer', x1: ox, y1: oy, z1: oz, x2: hx, y2: hy, z2: hz, w: 'gun' });
  if (hit) { hit.hp -= dmg; hit.hitT = .12; if (hit.hp <= 0) killEnemy(w, hit); }
}

function enemyAttack(w, e, target, dt) {
  const t = ENEMY_TYPES[e.type];
  e.cd -= dt;
  if (e.cd > 0) return;
  e.cd = t.rate;
  if (t.ranged) {
    const d = Math.hypot(target.x - e.x, target.z - e.z);
    if (d > t.range + 2) return;
    w.shots.push({ kind: 'acid', sx: e.x, sy: 1.4, sz: e.z, tx: target.x, ty: 0, tz: target.z, t: 0, tfly: clampF(d / 14, .6, 1.6), dmg: e.dmg, r: 2.6 });
    w.events.push({ type: 'acid' });
  } else if (target.kind === 'player') damagePlayer(w, e.dmg, e.x, e.z);
  else if (target.kind === 'turret') target.ref.hp -= e.dmg;
  else if (target.kind === 'wall') damageWall(w, e.dmg);
  w.events.push({ type: 'growl' });
}

function stepPlayer(w, inp, dt) {
  const p = w.player;
  p.fireCd -= dt; p.rollCd -= dt; p.invuln -= dt; p.regenT -= dt;
  if (p.dead) {
    p.deadT -= dt;
    if (p.deadT <= 0) {
      p.dead = false; p.hp = p.maxHp; p.x = SPAWN.x; p.z = SPAWN.z; p.y = 0; p.invuln = 3;
      w.events.push({ type: 'respawn' });
    }
    return;
  }
  if (p.regenT <= 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 4 * dt);
  // Movement (camera-relative axes resolved in main.js into world-space mx/my).
  const mag = Math.hypot(inp.mx, inp.mz);
  if (p.rollT > 0) {
    p.rollT -= dt;
    p.x += Math.sin(p.rollDir) * 14 * dt; p.z += Math.cos(p.rollDir) * 14 * dt;
  } else if (mag > .01) {
    const nx = inp.mx / mag, nz = inp.mz / mag, sp = 8.5 * Math.min(1, mag);
    p.x += nx * sp * dt; p.z += nz * sp * dt;
    p.walk += sp * dt;
    if (!inp.fire) p.yaw = Math.atan2(nx, nz);
  }
  if (inp.fire || w.softlock) p.yaw = inp.camYaw;
  if (inp.roll && p.rollCd <= 0 && p.rollT <= 0) {
    p.rollT = .42; p.rollCd = .95;
    p.rollDir = mag > .01 ? Math.atan2(inp.mx, inp.mz) : p.yaw;
    w.events.push({ type: 'roll' });
  }
  p.x = clampF(p.x, FIELD.minX, FIELD.maxX); p.z = clampF(p.z, FIELD.minZ, FIELD.maxZ);
  // Weapons.
  if (inp.weapon > 0) p.weapon = inp.weapon - 1;
  const wp = WEAPONS[p.weapon];
  if (inp.fire && p.weapon === 1) {
    // Flamethrower: continuous short cone, group damage + ignite. No ammo, no trigger cadence.
    p.yaw = inp.camYaw;
    let hitAny = false;
    for (const e of w.enemies) {
      const t = ENEMY_TYPES[e.type];
      const dx = e.x - p.x, dy = (e.y + t.height * .5) - (p.y + 1.4), dz = e.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > wp.range + t.radius) continue;
      const dot = (dx * inp.dx + dy * inp.dy + dz * inp.dz) / (d || 1);
      if (dot < wp.cone) continue;
      e.hp -= wp.dps * dt; e.burn = wp.burn; e.hitT = Math.max(e.hitT, .05);
      if (e.hp <= 0) killEnemy(w, e);
      hitAny = true;
    }
    p.flameEvt -= dt;
    if (p.flameEvt <= 0) { p.flameEvt = .06; w.events.push({ type: 'flame', ox: p.x, oy: p.y + 1.4, oz: p.z, dx: inp.dx, dy: inp.dy, dz: inp.dz, hit: hitAny }); }
  } else if (inp.fire && p.fireCd <= 0) {
    p.fireCd = 1 / wp.rof;
    const ox = p.x, oy = p.y + 1.5, oz = p.z;
    let dx = inp.dx, dy = inp.dy, dz = inp.dz;
    if (w.softlock) {
      const s = w.softlock, ty = s.y + ENEMY_TYPES[s.type].height * .55;
      const len = Math.hypot(s.x - ox, ty - oy, s.z - oz);
      dx = (s.x - ox) / len; dy = (ty - oy) / len; dz = (s.z - oz) / len;
    }
    fireHitscan(w, ox, oy, oz, dx, dy, dz, wp.dmg, wp.range);
    w.events.push({ type: 'fire', weapon: p.weapon });
  }
  // Build: U plants an auto turret at the crosshair ground spot.
  if (inp.build) {
    if (w.parts < TURRET_COST) w.events.push({ type: 'deny', why: 'parts' });
    else if (w.turrets.length >= TURRET_MAX) w.events.push({ type: 'deny', why: 'max' });
    else if (!inp.spot) w.events.push({ type: 'deny', why: 'spot' });
    else {
      const s = inp.spot;
      if (s.z > WALL.z - 2 || dist2(s.x, s.z, p.x, p.z) > 1100) w.events.push({ type: 'deny', why: 'spot' });
      else {
        w.parts -= TURRET_COST;
        w.turrets.push({ x: s.x, z: s.z, hp: TURRET_HP, maxHp: TURRET_HP, cd: 0, yaw: p.yaw, buildT: .5 });
        w.events.push({ type: 'turret', x: s.x, z: s.z });
      }
    }
  }
  // Repair: I patches the most damaged turret near the player.
  if (inp.repair) {
    let best = null, bd = 9 * 9;
    for (const tu of w.turrets) {
      if (tu.hp >= tu.maxHp) continue;
      const d2 = dist2(tu.x, tu.z, p.x, p.z);
      if (d2 < bd) { bd = d2; best = tu; }
    }
    if (!best) w.events.push({ type: 'deny', why: 'nott' });
    else if (w.parts < REPAIR_COST) w.events.push({ type: 'deny', why: 'parts' });
    else { w.parts -= REPAIR_COST; best.hp = best.maxHp; w.events.push({ type: 'repair', x: best.x, z: best.z }); }
  }
}

function stepEnemies(w, dt) {
  const es = w.enemies;
  for (let i = es.length - 1; i >= 0; i--) {
    const e = es[i], t = ENEMY_TYPES[e.type];
    e.hitT -= dt; e.retarget -= dt; e.walk += e.speed * dt;
    // Ignition damage over time (flamethrower).
    if (e.burn > 0) { e.burn -= dt; e.hp -= 10 * dt; if (e.hp <= 0 && !e.dead) { killEnemy(w, e); } }
    if (e.dead) continue;
    if (!e.target || e.target.ref?.alive === false || (e.target.kind === 'player' && w.player.dead) || e.target.kind === 'turret' && !w.turrets.includes(e.target.ref) || e.retarget <= 0) {
      e.target = pickTarget(w, e); e.retarget = .6 + Math.random() * .4;
    }
    if (t.boss) {
      e.summonT -= dt;
      if (e.summonT <= 0) { e.summonT = 12; if (es.length < ALIVE_CAP - 2) for (let k = 0; k < 3; k++) spawnEnemy(w, 'shambler'); }
      if (!e.enraged && e.hp < e.maxHp * .4) { e.enraged = true; e.speed *= 1.5; w.events.push({ type: 'enrage' }); }
    }
    const tg = e.target;
    const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || .001;
    e.dir = Math.atan2(dx, dz);
    const reach = (tg.kind === 'wall' ? 2.4 : t.range) + (tg.kind === 'turret' ? 1.2 : 0);
    if (d > reach) {
      const sp = t.ranged && tg.kind !== 'wall' && d < t.range ? 0 : e.speed;
      e.x += dx / d * sp * dt; e.z += dz / d * sp * dt;
    } else enemyAttack(w, e, tg, dt);
    e.x = clampF(e.x, FIELD.minX - 3, FIELD.maxX + 3); e.z = clampF(e.z, SPAWN_ZONE.z - 14, WALL.z + 1);
    if (e.hp <= 0 && !e.dead) killEnemy(w, e);
  }
  // Cheap pairwise separation so the horde doesn't collapse into one point.
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j];
    const rr = ENEMY_TYPES[a.type].radius + ENEMY_TYPES[b.type].radius;
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > .0001) {
      const d = Math.sqrt(d2), push = (rr - d) * .5 / d;
      a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
    }
  }
  for (let i = es.length - 1; i >= 0; i--) if (es[i].dead) es.splice(i, 1);
}

function stepShots(w, dt) {
  const s = w.shots;
  for (let i = s.length - 1; i >= 0; i--) {
    const sh = s[i];
    sh.t += dt; // acid: parabolic lob toward the marked spot.
    if (sh.t >= sh.tfly) {
      w.events.push({ type: 'boom', x: sh.tx, y: .3, z: sh.tz, acid: true });
      splashDamage(w, sh.tx, sh.tz, sh.r, sh.dmg, 'enemy');
      s.splice(i, 1);
    }
  }
}

function stepTurrets(w, dt) {
  for (let i = w.turrets.length - 1; i >= 0; i--) {
    const tu = w.turrets[i];
    if (tu.hp <= 0) { w.events.push({ type: 'turretDown', x: tu.x, z: tu.z }); w.turrets.splice(i, 1); continue; }
    if (tu.buildT > 0) { tu.buildT -= dt; continue; }
    tu.cd -= dt;
    let best = null, bd = 24 * 24;
    for (const e of w.enemies) { const d2 = dist2(e.x, e.z, tu.x, tu.z); if (d2 < bd) { bd = d2; best = e; } }
    if (best) {
      tu.yaw = Math.atan2(best.x - tu.x, best.z - tu.z);
      if (tu.cd <= 0) {
        tu.cd = .28;
        const oy = 1.5, dx = best.x - tu.x, dy = (best.y + .9) - oy, dz = best.z - tu.z, len = Math.hypot(dx, dy, dz);
        fireHitscan(w, tu.x, oy, tu.z, dx / len, dy / len, dz / len, 9, 26);
        w.events.push({ type: 'turretFire', x: tu.x, z: tu.z });
      }
    }
  }
}

// Parts and medkits left on the road: magnet to the player within 14 m, collected up close.
function stepPickups(w, dt) {
  const p = w.player;
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const k = w.pickups[i];
    k.t -= dt;
    if (k.t <= 0 || p.dead) { if (k.t <= 0) w.pickups.splice(i, 1); continue; }
    const d2 = dist2(k.x, k.z, p.x, p.z);
    if (d2 < 14 * 14) {
      const d = Math.sqrt(d2) || .001, pull = Math.min(d, (5 + (14 - d) * 2.4) * dt);
      k.x += (p.x - k.x) / d * pull; k.z += (p.z - k.z) / d * pull;
    }
    if (d2 < 1.6 * 1.6) {
      if (k.kind === 'parts') { w.parts += k.v; w.events.push({ type: 'pickup', x: p.x, y: 1.6, z: p.z, v: k.v }); }
      else { p.hp = Math.min(p.maxHp, p.hp + k.v); w.events.push({ type: 'medkit', x: p.x, y: 1.6, z: p.z, v: k.v }); }
      w.pickups.splice(i, 1);
    }
  }
}

function stepSpawning(w, dt) {
  if (w.phase !== 'combat' || !w.spawnQueue.length) return;
  w.spawnT -= dt;
  if (w.spawnT <= 0 && w.enemies.length < ALIVE_CAP) {
    w.spawnT = 1.1;
    for (let i = 0; i < w.burst && w.spawnQueue.length && w.enemies.length < ALIVE_CAP; i++) spawnEnemy(w, w.spawnQueue.shift());
  }
}

function stepWaves(w) {
  if (w.phase !== 'combat') return;
  if (!w.spawnQueue.length && !w.enemies.length) {
    if (w.wave >= totalWaves(w)) { w.phase = 'won'; w.events.push({ type: 'win' }); }
    else { w.phase = 'intermission'; w.interT = 0; w.events.push({ type: 'waveclear' }); }
  }
}

// Soft lock: nearest-to-aim-cone enemy, so keyboard aiming stays cheap.
function updateSoftlock(w, inp) {
  let best = null, bestScore = 1e9;
  for (const e of w.enemies) {
    const px = e.x - inp.camX, py = (e.y + ENEMY_TYPES[e.type].height * .5) - inp.camY, pz = e.z - inp.camZ;
    const d = Math.hypot(px, py, pz);
    if (d < 2 || d > 110) continue;
    const dot = (px * inp.dx + py * inp.dy + pz * inp.dz) / d;
    if (dot < .9) continue; // ~26° cone
    const ang = Math.acos(Math.min(1, dot));
    if (ang < bestScore) { bestScore = ang; best = e; }
  }
  w.softlock = best;
}

export function stepWorld(w, inp, dt) {
  w.time += dt;
  w.wallAlarmT -= dt;
  updateSoftlock(w, inp);
  stepPlayer(w, inp, dt);
  stepEnemies(w, dt);
  stepShots(w, dt);
  stepTurrets(w, dt);
  stepPickups(w, dt);
  stepSpawning(w, dt);
  stepWaves(w);
  w.interT += dt;
}

// QA helpers (?qa=1 harness only): jump to a wave, hurt the player.
export function qaJump(w, wave) {
  w.enemies.length = 0; w.shots.length = 0; w.pickups.length = 0; w.spawnQueue.length = 0;
  w.wave = clampF(wave, 1, totalWaves(w)) - 1;
  startWave(w);
}
export function qaHurt(w, dmg) { damagePlayer(w, dmg, w.player.x, w.player.z - 5); }
