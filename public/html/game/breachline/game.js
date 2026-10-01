// Breachline 3D — simulation core. Pure data + step(), no THREE / DOM here.
// Original design: bug swarms pour from rifts, the player and ally squad hold the gate for 10 waves.

export const TOTAL_WAVES = 10;
export const FIELD = { minX: -62, maxX: 62, minZ: -122, maxZ: 44 };
export const GATE = { x: 0, z: 52.5 };
export const SPAWN = { x: 0, z: 36 };
// Six rift mouths ringed in the far north; enemies stream out of them.
export const RIFTS = [-0.9, -0.54, -0.18, 0.18, 0.54, 0.9].map(a => ({ x: Math.sin(a) * 50, z: -70 - Math.cos(a) * 50, a }));

export const ENEMY_TYPES = {
  crawler: { hp: 34, speed: 3.6, dmg: 8, rate: 1.0, range: 2.3, merit: 10, radius: 1.0, height: 1.2 },
  runner:  { hp: 18, speed: 6.8, dmg: 5, rate: .7,  range: 2.0, merit: 12, radius: .8,  height: 1.0 },
  spitter: { hp: 28, speed: 2.7, dmg: 11, rate: 2.8, range: 17, merit: 18, radius: 1.0, height: 1.2, ranged: true },
  flyer:   { hp: 14, speed: 5.4, dmg: 6, rate: 1.3, range: 2.6, merit: 15, radius: .9,  height: 1.0, flying: true },
  elite:   { hp: 170, speed: 2.3, dmg: 18, rate: 1.6, range: 2.9, merit: 40, radius: 1.6, height: 2.2 },
  boss:    { hp: 1500, speed: 1.9, dmg: 34, rate: 2.4, range: 4.2, merit: 400, radius: 3.0, height: 4.4, boss: true }
};
export const WEAPONS = [
  { key: 'w1', dmg: 11, rof: 7,   range: 62, splash: 0, tracer: 0xf7d9a0 },
  { key: 'w2', dmg: 55, rof: 1.1, range: 95, splash: 0, flyMult: 2, tracer: 0xbfe8ff },
  { key: 'w3', dmg: 42, rof: .85, range: 72, splash: 6.5, tracer: 0xffb469 }
];
export const TURRET_COST = 100, TURRET_MAX = 4, ALIVE_CAP = 24;

const WAVES = [
  { crawler: 8 },
  { crawler: 10, runner: 4 },
  { crawler: 8, runner: 6, spitter: 2 },
  { crawler: 8, runner: 8, spitter: 3, flyer: 2 },
  { crawler: 10, runner: 8, spitter: 4, flyer: 3, elite: 1 },
  { crawler: 12, runner: 8, spitter: 4, flyer: 4, elite: 2 },
  { crawler: 12, runner: 10, spitter: 5, flyer: 5, elite: 2 },
  { crawler: 14, runner: 10, spitter: 6, flyer: 5, elite: 3 },
  { crawler: 14, runner: 12, spitter: 6, flyer: 6, elite: 4 },
  { crawler: 8, runner: 6, spitter: 4, flyer: 4, elite: 2, boss: 1 }
];

const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const clampF = (v, a, b) => v < a ? a : v > b ? b : v;

export function createWorld() {
  return {
    loop: 1, wave: 0, phase: 'idle', time: 0,
    gateHp: 1000, gateMax: 1000, merit: 0, score: 0,
    player: { x: SPAWN.x, z: SPAWN.z, y: 0, yaw: Math.PI, hp: 100, maxHp: 100, weapon: 0, fireCd: 0, rollT: 0, rollCd: 0, rollDir: 0, invuln: 0, dead: false, deadT: 0, regenT: 0, demoInvuln: false, walk: 0 },
    enemies: [], shots: [], turrets: [], allies: [
      { kind: 'rifle', x: -9, z: 28, yaw: Math.PI, hp: 70, maxHp: 70, cd: 0, alive: true, walk: 0 },
      { kind: 'rifle', x: 9, z: 28, yaw: Math.PI, hp: 70, maxHp: 70, cd: 0, alive: true, walk: 0 },
      { kind: 'tank', x: 0, z: 22, yaw: Math.PI, hp: 500, maxHp: 500, cd: 0, alive: true, walk: 0 }
    ],
    spawnQueue: [], spawnT: 0, burst: 2,
    kills: { crawler: 0, runner: 0, spitter: 0, flyer: 0, elite: 0, boss: 0 },
    softlock: null, events: [], gateAlarmT: 0, interT: 0, bossRef: null
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
  const comp = WAVES[w.wave - 1], q = [];
  for (const t in comp) for (let i = 0; i < comp[t]; i++) q.push(t);
  // Heavies first so the wave opens with its headline threat.
  q.sort((a, b) => (ENEMY_TYPES[b].merit - ENEMY_TYPES[a].merit));
  w.spawnQueue = q; w.spawnT = .6; w.burst = w.wave >= 6 ? 3 : 2;
  for (const a of w.allies) { if (!a.alive) { a.alive = true; a.hp = a.maxHp; } }
  w.events.push({ type: 'wave', n: w.wave, boss: !!ENEMY_TYPES[q[0]]?.boss || w.wave === TOTAL_WAVES });
}

function spawnEnemy(w, type) {
  const t = ENEMY_TYPES[type], rift = RIFTS[(Math.random() * RIFTS.length) | 0];
  const m = 1 + .35 * (w.loop - 1), sp = Math.min(1.6, 1 + .1 * (w.loop - 1)), dm = 1 + .2 * (w.loop - 1);
  const e = {
    type, x: rift.x + (Math.random() - .5) * 6, z: rift.z + (Math.random() - .5) * 6, y: t.flying ? 3.4 : 0,
    hp: t.hp * m, maxHp: t.hp * m, dmg: t.dmg * dm, speed: t.speed * sp,
    cd: 1 + Math.random(), retarget: 0, target: null, hitT: 0, walk: Math.random() * 6,
    summonT: 6, fanT: 3, dir: Math.random() * Math.PI * 2
  };
  w.enemies.push(e);
  if (t.boss) { w.bossRef = e; w.events.push({ type: 'bosswave' }); }
  w.events.push({ type: 'spawn' });
}

function pickTarget(w, e) {
  const t = ENEMY_TYPES[e.type];
  let best = null, bd = 1e9;
  const consider = (x, z, ref, kind) => {
    const d = dist2(e.x, e.z, x, z) * (kind === 'gate' ? .8 : 1);
    if (d < bd) { bd = d; best = { x, z, ref, kind }; }
  };
  if (t.boss || !t.flying) {
    if (!w.player.dead) consider(w.player.x, w.player.z, w.player, 'player');
    for (const a of w.allies) if (a.alive) consider(a.x, a.z, a, 'ally');
    for (const tu of w.turrets) consider(tu.x, tu.z, tu, 'turret');
  }
  if (t.flying) { // Flyers dive at the player above all else.
    if (!w.player.dead) return { x: w.player.x, z: w.player.z, ref: w.player, kind: 'player' };
  }
  if (!best) consider(GATE.x, GATE.z, null, 'gate');
  return best;
}

function damagePlayer(w, dmg, sx, sz) {
  const p = w.player;
  if (p.dead || p.invuln > 0 || p.rollT > 0 || p.demoInvuln) return;
  p.hp -= dmg; p.regenT = 5;
  w.events.push({ type: 'hurt', sx, sz });
  if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deadT = 1.8; w.events.push({ type: 'playerdown' }); }
}

function damageGate(w, dmg) {
  w.gateHp = Math.max(0, w.gateHp - dmg);
  w.events.push({ type: 'gatehit', dmg });
  if (w.gateHp <= 0 && w.phase === 'combat') { w.phase = 'over'; w.events.push({ type: 'lose' }); }
}

function damageAlly(w, a, dmg) {
  a.hp -= dmg;
  if (a.hp <= 0) { a.alive = false; w.events.push({ type: 'allydown', x: a.x, z: a.z }); }
}

function killEnemy(w, e) {
  const t = ENEMY_TYPES[e.type];
  w.merit += t.merit; w.score += t.merit; w.kills[e.type]++;
  e.dead = true;
  w.events.push({ type: 'kill', kind: e.type, x: e.x, y: e.y, z: e.z, merit: t.merit });
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
    for (const a of w.allies) if (a.alive && dist2(a.x, a.z, x, z) < r * r) damageAlly(w, a, dmg * .8);
    for (const tu of w.turrets) if (dist2(tu.x, tu.z, x, z) < r * r) tu.hp -= dmg * .8;
  }
}

function fireHitscan(w, ox, oy, oz, dx, dy, dz, dmg, range, flyMult) {
  let bt = range, hit = null;
  for (const e of w.enemies) {
    const t = ENEMY_TYPES[e.type], cy = e.y + t.height * .5;
    const px = e.x - ox, py = cy - oy, pz = e.z - oz;
    const proj = px * dx + py * dy + pz * dz;
    if (proj < 0 || proj > range) continue;
    const lx = px - dx * proj, ly = py - dy * proj, lz = pz - dz * proj;
    const rr = t.radius * (t.flying ? 1.3 : 1) + .35;
    if (lx * lx + ly * ly + lz * lz < rr * rr && proj < bt) { bt = proj; hit = e; }
  }
  const hx = ox + dx * bt, hy = oy + dy * bt, hz = oz + dz * bt;
  w.events.push({ type: 'tracer', x1: ox, y1: oy, z1: oz, x2: hx, y2: hy, z2: hz });
  if (hit) {
    let d = dmg;
    if (flyMult && ENEMY_TYPES[hit.type].flying) d *= flyMult;
    hit.hp -= d; hit.hitT = .12;
    if (hit.hp <= 0) killEnemy(w, hit);
  }
}

function enemyAttack(w, e, target, dt) {
  const t = ENEMY_TYPES[e.type];
  e.cd -= dt;
  if (e.cd > 0) return;
  if (t.ranged) {
    e.cd = t.rate;
    const lead = 1.1;
    if (t.boss) { // Acid fan: five warning circles in an arc.
      const base = Math.atan2(target.x - e.x, target.z - e.z);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * .22, d = 16;
        spawnAcid(w, e.x, e.y + 2.5, e.z, e.x + Math.sin(a) * d, 0, e.z + Math.cos(a) * d, e.dmg * .7);
      }
      w.events.push({ type: 'acid' });
    } else {
      spawnAcid(w, e.x, e.y + 1, e.z, target.x, 0, target.z, e.dmg);
      w.events.push({ type: 'acid' });
    }
    void lead;
  } else {
    e.cd = t.rate;
    if (target.kind === 'player') damagePlayer(w, e.dmg, e.x, e.z);
    else if (target.kind === 'ally') damageAlly(w, target.ref, e.dmg);
    else if (target.kind === 'turret') { target.ref.hp -= e.dmg; }
    else if (target.kind === 'gate') damageGate(w, e.dmg);
    w.events.push({ type: 'bug' });
  }
}

function spawnAcid(w, sx, sy, sz, tx, ty, tz, dmg) {
  const d = Math.hypot(tx - sx, tz - sz);
  w.shots.push({ kind: 'acid', team: 'enemy', sx, sy, sz, tx, ty, tz, t: 0, tfly: clampF(d / 14, .6, 1.6), dmg, r: 2.6 });
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
  // Movement (camera-relative axes resolved in main.js into world-space mx/mz).
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
  if (inp.jump && p.y <= 0) { p.vy = 7; w.events.push({ type: 'jump' }); }
  p.vy = (p.vy || 0) - 20 * dt; p.y += p.vy * dt;
  if (p.y < 0) { p.y = 0; p.vy = 0; }
  p.x = clampF(p.x, FIELD.minX, FIELD.maxX); p.z = clampF(p.z, FIELD.minZ, FIELD.maxZ);
  // Weapons.
  if (inp.weapon > 0) p.weapon = inp.weapon - 1;
  const wp = WEAPONS[p.weapon];
  if (inp.fire && p.fireCd <= 0) {
    p.fireCd = 1 / wp.rof;
    const ox = p.x, oy = p.y + 1.5, oz = p.z;
    let dx = inp.dx, dy = inp.dy, dz = inp.dz;
    if (w.softlock) {
      const s = w.softlock, ty = s.y + ENEMY_TYPES[s.type].height * .55;
      const len = Math.hypot(s.x - ox, ty - oy, s.z - oz);
      dx = (s.x - ox) / len; dy = (ty - oy) / len; dz = (s.z - oz) / len;
    }
    if (wp.splash) {
      w.shots.push({ kind: 'rocket', team: 'player', x: ox + dx, y: oy + dy, z: oz + dz, vx: dx * 26, vy: dy * 26, vz: dz * 26, life: 3, dmg: wp.dmg, r: wp.splash });
    } else fireHitscan(w, ox, oy, oz, dx, dy, dz, wp.dmg, wp.range, wp.flyMult);
    w.events.push({ type: 'fire', weapon: p.weapon });
  }
  // Turret build (spot validated here).
  if (inp.build) {
    if (w.merit < TURRET_COST) w.events.push({ type: 'deny', why: 'merit' });
    else if (w.turrets.length >= TURRET_MAX) w.events.push({ type: 'deny', why: 'max' });
    else if (!inp.spot) w.events.push({ type: 'deny', why: 'spot' });
    else {
      const s = inp.spot;
      if (s.z > FIELD.maxZ - 2 || dist2(s.x, s.z, p.x, p.z) > 900) w.events.push({ type: 'deny', why: 'spot' });
      else {
        w.merit -= TURRET_COST;
        w.turrets.push({ x: s.x, z: s.z, hp: 150, maxHp: 150, cd: 0, yaw: p.yaw });
        w.events.push({ type: 'turret', x: s.x, z: s.z });
      }
    }
  }
}

function stepEnemies(w, dt) {
  const es = w.enemies;
  for (let i = es.length - 1; i >= 0; i--) {
    const e = es[i], t = ENEMY_TYPES[e.type];
    e.hitT -= dt; e.retarget -= dt; e.walk += e.speed * dt;
    if (!e.target || e.target.ref?.alive === false || (e.target.kind === 'player' && w.player.dead) || e.retarget <= 0) {
      e.target = pickTarget(w, e); e.retarget = .6 + Math.random() * .4;
    }
    const tg = e.target;
    if (e.type === 'boss') {
      e.summonT -= dt; e.fanT -= dt;
      if (e.summonT <= 0) { e.summonT = 12; if (es.length < ALIVE_CAP - 2) for (let k = 0; k < 3; k++) spawnEnemy(w, 'crawler'); }
      void e.fanT;
    }
    const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || .001;
    e.dir = Math.atan2(dx, dz);
    const reach = (tg.kind === 'gate' ? 2.2 : t.range) + (tg.kind === 'turret' ? 1.2 : 0) + (tg.kind === 'ally' ? .6 : 0);
    if (d > reach) {
      const sp = t.ranged && d < t.range ? 0 : e.speed;
      e.x += dx / d * sp * dt; e.z += dz / d * sp * dt;
      if (t.flying) e.y += (3.4 + Math.sin(w.time * 3 + e.walk) * .6 - e.y) * 2 * dt;
    } else enemyAttack(w, e, tg, dt);
    e.x = clampF(e.x, FIELD.minX - 4, FIELD.maxX + 4); e.z = clampF(e.z, FIELD.minZ - 4, FIELD.maxZ + 8);
    if (e.hp <= 0) killEnemy(w, e);
  }
  // Cheap pairwise separation so the swarm doesn't collapse into one point.
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
    if (sh.kind === 'rocket') {
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.z += sh.vz * dt; sh.life -= dt;
      let boom = sh.y <= .1 || sh.life <= 0;
      if (!boom) for (const e of w.enemies) {
        const t = ENEMY_TYPES[e.type];
        if (dist2(e.x, e.z, sh.x, sh.z) < (t.radius + .9) ** 2 && Math.abs(sh.y - (e.y + t.height * .5)) < t.height) { boom = true; break; }
      }
      if (boom) {
        w.events.push({ type: 'boom', x: sh.x, y: Math.max(.4, sh.y), z: sh.z });
        splashDamage(w, sh.x, sh.z, sh.r, sh.dmg, 'player');
        s.splice(i, 1);
      }
    } else { // acid: parabolic lob toward the marked spot.
      sh.t += dt;
      if (sh.t >= sh.tfly) {
        w.events.push({ type: 'boom', x: sh.tx, y: .3, z: sh.tz, acid: true });
        splashDamage(w, sh.tx, sh.tz, sh.r, sh.dmg, 'enemy');
        s.splice(i, 1);
      }
    }
  }
}

function stepTurrets(w, dt) {
  for (let i = w.turrets.length - 1; i >= 0; i--) {
    const tu = w.turrets[i];
    if (tu.hp <= 0) { w.events.push({ type: 'turretDown', x: tu.x, z: tu.z }); w.turrets.splice(i, 1); continue; }
    tu.cd -= dt;
    let best = null, bd = 26 * 26;
    for (const e of w.enemies) { const d2 = dist2(e.x, e.z, tu.x, tu.z); if (d2 < bd) { bd = d2; best = e; } }
    if (best) {
      tu.yaw = Math.atan2(best.x - tu.x, best.z - tu.z);
      if (tu.cd <= 0) {
        tu.cd = .25;
        const oy = 1.5, dx = best.x - tu.x, dy = (best.y + .6) - oy, dz = best.z - tu.z, len = Math.hypot(dx, dy, dz);
        fireHitscan(w, tu.x, oy, tu.z, dx / len, dy / len, dz / len, 10, 30, 0);
        w.events.push({ type: 'turretFire', x: tu.x, z: tu.z });
      }
    }
  }
}

function stepAllies(w, dt) {
  for (const a of w.allies) {
    if (!a.alive) continue;
    a.cd -= dt;
    let best = null, bd = (a.kind === 'tank' ? 34 : 26) ** 2;
    for (const e of w.enemies) { const d2 = dist2(e.x, e.z, a.x, a.z); if (d2 < bd) { bd = d2; best = e; } }
    if (!best) continue;
    a.yaw = Math.atan2(best.x - a.x, best.z - a.z);
    if (a.cd <= 0) {
      if (a.kind === 'tank') {
        a.cd = 1.4;
        w.shots.push({ kind: 'rocket', team: 'player', x: a.x + Math.sin(a.yaw) * 2, y: 1.8, z: a.z + Math.cos(a.yaw) * 2, vx: Math.sin(a.yaw) * 24, vy: .5, vz: Math.cos(a.yaw) * 24, life: 2.5, dmg: 40, r: 4 });
        w.events.push({ type: 'tankFire' });
      } else {
        a.cd = .6;
        const oy = 1.4, dx = best.x - a.x, dy = (best.y + .6) - oy, dz = best.z - a.z, len = Math.hypot(dx, dy, dz);
        fireHitscan(w, a.x, oy, a.z, dx / len, dy / len, dz / len, 9, 28, 0);
        a.walk += 1;
      }
    }
  }
}

function stepSpawning(w, dt) {
  if (w.phase !== 'combat' || !w.spawnQueue.length) return;
  w.spawnT -= dt;
  if (w.spawnT <= 0 && w.enemies.length < ALIVE_CAP) {
    w.spawnT = 1.5;
    for (let i = 0; i < w.burst && w.spawnQueue.length && w.enemies.length < ALIVE_CAP; i++) spawnEnemy(w, w.spawnQueue.shift());
  }
}

function stepWaves(w) {
  if (w.phase !== 'combat') return;
  if (!w.spawnQueue.length && !w.enemies.length) {
    if (w.wave >= TOTAL_WAVES) { w.phase = 'won'; w.events.push({ type: 'win' }); }
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
  w.gateAlarmT -= dt;
  updateSoftlock(w, inp);
  stepPlayer(w, inp, dt);
  stepEnemies(w, dt);
  stepShots(w, dt);
  stepTurrets(w, dt);
  stepAllies(w, dt);
  stepSpawning(w, dt);
  stepWaves(w);
  w.interT += dt;
}

// QA helper (used by the ?qa=1 harness only): jump the run to a given wave.
export function qaJump(w, wave) {
  w.enemies.length = 0; w.shots.length = 0; w.spawnQueue.length = 0;
  w.wave = clampF(wave, 1, TOTAL_WAVES) - 1;
  startWave(w);
}
