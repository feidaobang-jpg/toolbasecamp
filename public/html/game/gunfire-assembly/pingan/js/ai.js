// 敌我电脑单位：步兵、机枪手、军曹、特工队、城墙守军、掷弹筒、战友与山本一木
import * as THREE from '../vendor/three.module.js';
import { TAU, clamp, damp, angStep, fwdX, fwdZ, yawTo, dist, dist2, rand, pick } from './util.js';
import { L, resolveCircle, losBlocked, pointBlocked } from './world.js';
import { muzzleWorld } from './models.js';

export const DEF = {
  ally: { look: 'ally', hp: 6, speed: 6.4, range: 27 },
  dabiao: { look: 'dabiao', hp: 9, speed: 6.4, range: 27 },
  monk: { look: 'monk', hp: 9, speed: 6.6, range: 24 },
  rifle: { look: 'rifle', hp: 2, speed: 3.1, range: 30, score: 100 },
  mg: { look: 'mg', hp: 6, speed: 0, range: 36, score: 250 },
  officer: { look: 'officer', hp: 5, speed: 6.0, range: 2, score: 200 },
  elite: { look: 'elite', hp: 7, speed: 4.7, range: 24, score: 300 },
  wall: { look: 'rifle', hp: 2, speed: 0, range: 50, score: 120 },
  mortar: { look: 'rifle', hp: 2, speed: 0, range: 90, score: 200 },
  boss: { look: 'boss', hp: 280, speed: 4.9, score: 3000 },
};
const _v = new THREE.Vector3();

export function wakeGroup(g, group) {
  for (const e of g.enemies) if (e.group === group) e.active = true;
}

function wallUnits(g, active) {
  for (const x of [-30, -11, 11, 30]) { const e = g.addUnit('enemy', 'wall', x, L.wallZ1 - 1.35, { y: L.wallH, hold: true, group: 'wall' }); e.active = active; }
  for (const sx of [-1, 1]) { const e = g.addUnit('enemy', 'mortar', sx * L.mortarX, L.wallZ1 - 2.6, { y: L.wallH, hold: true, group: 'wall' }); e.active = active; e.stT = sx < 0 ? 9 : 13; }
}

export function spawnPhase(g, n) {
  const E = (type, x, z, o) => g.addUnit('enemy', type, x, z, o);
  g.boss = null;
  if (n === 1) {
    // 开局头几秒先让玩家看清局面，前哨不急着开枪
    for (const [x, z] of [[-3, 72], [5, 70], [12, 73]]) E('rifle', x, z, { group: 'pre' }).stT = rand(3.2, 4.8);
    E('mg', L.nestA.x, L.nestA.z + 0.3, { group: 'A', hold: true, nest: 'A' });
    E('rifle', -22, 55, { group: 'A', hold: true }); E('rifle', -10, 54.5, { group: 'A' }); E('rifle', -16, 51, { group: 'A', hold: true }); E('rifle', -25, 60, { group: 'A' });
    E('mg', L.nestB.x, L.nestB.z + 0.3, { group: 'B', hold: true, nest: 'B' });
    E('rifle', 9, 35, { group: 'B', hold: true }); E('rifle', 21, 35.5, { group: 'B' }); E('rifle', 15, 31, { group: 'B', hold: true }); E('rifle', 22, 41, { group: 'B' }); E('rifle', 6, 40, { group: 'B' });
    E('officer', 15, 33.5, { group: 'B', wake: 22 });
  } else if (n === 2) {
    wallUnits(g, false);
  } else if (n === 3) {
    wallUnits(g, true);
    g.sortieT = 10;
  } else if (n === 4) {
    E('rifle', -4, -43.4, { group: 'S1', hold: true }); E('rifle', 4, -43.4, { group: 'S1', hold: true }); E('rifle', 0, -44.5, { group: 'S1', hold: true });
    E('rifle', -2.5, -46.5, { group: 'S1' }); E('rifle', 2.5, -47.5, { group: 'S1' }); E('officer', -1.5, -50, { group: 'S1', wake: 24 }); E('officer', 1.5, -51, { group: 'S1', wake: 24 });
    E('mg', L.streetNest.x, L.streetNest.z + 0.3, { group: 'S2', hold: true, nest: 'S' });
    E('elite', -5, -72, { group: 'S2' }); E('elite', 5, -72, { group: 'S2' });
    E('rifle', -15, -58.5, { group: 'S2' }); E('rifle', 13, -60, { group: 'S2' }); E('rifle', -19, -60, { group: 'S2' });
    E('rifle', 12, -70, { group: 'D', hold: true, wake: 14 }); E('rifle', 18, -71, { group: 'D', hold: true, wake: 14 });
    E('elite', -4, -76.5, { group: 'S3', wake: 26 }); E('elite', 4, -76.5, { group: 'S3', wake: 26 });
    E('rifle', -6, -74.5, { group: 'S3', hold: true, wake: 26 }); E('rifle', 6, -74.5, { group: 'S3', hold: true, wake: 26 });
    if (!g.flags.loot) g.spawnLoot(15.5, -73);
  } else if (n === 5) {
    const b = E('boss', L.bossPos.x, L.bossPos.z, { group: 'boss' });
    b.active = true; b.state = 'walk'; b.cd = 1.2; b.stage = 1; b.r = 0.55; b.strafe = 1; b.inv = 0;
    g.boss = b;
  }
}

function move(g, u, dx, dz, speed, dt) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-4) { u.moving = damp(u.moving, 0, 12, dt); u.vx = u.vz = 0; return; }
  let nx = dx / l, nz = dz / l;
  // 没有寻路：被箱子、土台、房角顶住时横着绕一下，下次再顶住就换另一边
  if (u.avoidT > 0) { u.avoidT -= dt; const px = -nz * u.avoidDir, pz = nx * u.avoidDir; nx = px * 0.92 + nx * 0.25; nz = pz * 0.92 + nz * 0.25; }
  const ox = u.x, oz = u.z;
  u.x += nx * speed * dt; u.z += nz * speed * dt;
  resolveCircle(g.world, u, u.r);
  if (Math.hypot(u.x - ox, u.z - oz) < speed * dt * 0.35) {
    u.stuckT = (u.stuckT || 0) + dt;
    if (u.stuckT > 0.22 && !(u.avoidT > 0)) { u.avoidT = 0.9; u.avoidDir = u.avoidDir ? -u.avoidDir : (rand() < 0.5 ? 1 : -1); u.stuckT = 0; }
  } else u.stuckT = 0;
  u.vx = (u.x - ox) / dt; u.vz = (u.z - oz) / dt;
  u.moving = damp(u.moving, 1, 12, dt);
  u.walk += dt * (3 + speed * 1.3);
}
const still = (u, dt) => { u.moving = damp(u.moving, 0, 12, dt); u.vx = u.vz = 0; };

function chooseTarget(g, u) {
  const h = g.hero, c = g.cannon;
  let best = null, bs = 1e9;
  if (h.alive) { best = h; bs = dist(u.x, u.z, h.x, h.z) * 0.8; }
  for (const a of g.allies) {
    if (!a.alive || a.down > 0) continue;
    const d = dist(u.x, u.z, a.x, a.z);
    if (d < bs) { bs = d; best = a; }
  }
  if (c.visible && c.alive && g.phase <= 3 && g.phase >= 2 && (u.wantCannon || u.y > 2)) {
    const d = dist(u.x, u.z, c.x, c.z) * (u.wantCannon ? 0.5 : 1.25);
    if (d < bs) { bs = d; best = c; }
  }
  return best;
}

function shootAt(g, u, t, spread, lead, speed = 34, left = false) {
  muzzleWorld(u.model, _v, left);
  const d = dist(u.x, u.z, t.x, t.z), fl = d / speed;
  const isCannon = t === g.cannon;
  const tx = t.x + (t.vx || 0) * fl * lead + rand(-spread, spread) * d;
  const tz = t.z + (isCannon ? 0.8 : 0) + (t.vz || 0) * fl * lead + rand(-spread, spread) * d;
  const ty = (t.y || 0) + (isCannon ? 0.9 : 1.1) + rand(-spread, spread) * d * 0.4;
  g.fireBullet(1, _v.x, _v.y, _v.z, tx, ty, tz, 1, speed, u.y > 2 ? 'citywall' : null);
  u.shotT = 0.07;
  g.sfxAt(u.type === 'elite' || u.type === 'boss' ? 'mg' : 'rifle', u.x, u.z, 0.75);
}

export function updateEnemy(g, u, dt) {
  if (!u.alive) return;
  u.stT -= dt; u.think -= dt;
  const h = g.hero;
  if (!u.active) {
    still(u, dt); u.aim = damp(u.aim, 0, 8, dt);
    if (u.think <= 0) {
      u.think = 0.3;
      if (u.group !== 'wall' && h.alive && dist2(u.x, u.z, h.x, h.z) < u.wake * u.wake) wakeGroup(g, u.group);
    }
    return;
  }
  if (g.cut > 0 || g.flags.won) { still(u, dt); u.aim = damp(u.aim, 0, 8, dt); return; }
  if (u.think <= 0 || (u.target && u.target.alive === false) || (u.target && u.target.down > 0)) {
    u.think = 0.5 + rand(0.3);
    u.target = chooseTarget(g, u);
    u.strafe = pick([-1, 1]);
  }
  const t = u.target;
  if (!t) { still(u, dt); u.aim = damp(u.aim, 0, 8, dt); return; }
  const dx = t.x - u.x, dz = t.z - u.z, d = Math.hypot(dx, dz);
  const type = u.type, def = u.def;

  if (type === 'mortar') {
    still(u, dt);
    u.yaw = angStep(u.yaw, yawTo(dx, dz), 4 * dt);
    if (u.stT <= 0) {
      u.stT = rand(6.2, 8.4);
      const c = g.cannon;
      let tx, tz;
      if (g.phase === 2) { if (c.z > 54 || c.placed) return; tx = c.x + rand(-1.5, 1.5); tz = c.z + rand(-1, 2); }
      else if (g.phase === 3) {
        if (!c.manned && h.alive && rand() < 0.55 && h.z < 60) { tx = h.x + h.vx * 0.8; tz = h.z + h.vz * 0.8; }
        else { const a = rand(TAU), r = rand(2.5, 8); tx = c.x + Math.cos(a) * r; tz = c.z + 1 + Math.sin(a) * r; }
      } else return;
      g.launchMortar(tx, tz, 3.8, 1.9, u.x, u.y + 1.5, u.z + 1);
      u.shotT = 0.1;
    }
    return;
  }

  if (type === 'mg') {
    still(u, dt);
    const ox = u.x, oz = u.z + 1.75;
    const ok = t.z > u.z - 1 && d < def.range && !losBlocked(g.world, ox, oz, t.x, t.z, 1.7, 1.7, 1.2);
    if (u.state === 'burst') {
      u.sh -= dt;
      u.tx = damp(u.tx, t.x, 2.2, dt); u.tz = damp(u.tz, t.z, 2.2, dt);
      u.yaw = angStep(u.yaw, yawTo(u.tx - u.x, u.tz - u.z), 5 * dt);
      if (u.sh <= 0) {
        u.sh = 0.085; u.burst--;
        g.fireBullet(1, ox, 1.72, oz, u.tx + rand(-2.0, 2.0), 1.0, u.tz + rand(-2.0, 2.0), 1, 36, null);
        g.fx.sparks(ox, 1.72, oz + 0.3, 1, 0xffe08a);
        g.sfxAt('mg', u.x, u.z, 0.9);
        if (u.burst <= 0) { u.state = 'idle'; u.stT = rand(2.2, 3.2); }
      }
    } else if (u.state === 'wind') {
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 5 * dt);
      if (u.stT <= 0) { u.state = 'burst'; u.burst = 10; u.sh = 0; }
    } else if (ok && u.stT <= 0) {
      u.state = 'wind'; u.stT = 0.75; u.tx = t.x; u.tz = t.z;
      g.fx.strip(ox, oz, yawTo(t.x - ox, t.z - oz), dist(ox, oz, t.x, t.z), 0.5, 0.75);
    } else if (!ok) u.yaw = angStep(u.yaw, Math.PI, 2 * dt);
    return;
  }

  if (type === 'officer') {
    u.yaw = angStep(u.yaw, yawTo(dx, dz), 9 * dt);
    if (u.slash >= 0) {
      still(u, dt);
      if (u.slash > 0.45 && !u.hitDone) {
        u.hitDone = true;
        if (d < 2.5 && !(t === h && h.y > u.y + 1.1)) { if (t === h) g.hurtHero(1, u.x, u.z); else if (t === g.cannon) g.hurtCannon(2); else g.hurtUnit(t, 2, dx, dz, 'blade'); }
      }
    } else if (d < 1.9 + (t === g.cannon ? 1.4 : 0) && u.stT <= 0) {
      u.slash = 0; u.hitDone = false; u.stT = 1.3; g.sfxAt('slash', u.x, u.z, 0.8);
    } else if (d > 1.5) move(g, u, dx, dz, def.speed, dt);
    else still(u, dt);
    return;
  }

  // 步兵 / 特工队 / 城墙守军
  const elite = type === 'elite', wall = type === 'wall';
  // 射界按子弹实际飞的高度算（枪口到目标胸口），矮掩体也算进去：被自己面前的沙袋、土坎挡住时就换位置，不对着掩体白打
  const los = !losBlocked(g.world, u.x, u.z, t.x, t.z, wall ? 1.7 : 0, u.y + 1.3, (t.y || 0) + 1.1);
  u.yaw = angStep(u.yaw, yawTo(dx, dz), 7 * dt);
  if (u.state === 'aim') {
    still(u, dt); u.aim = damp(u.aim, 1, 14, dt);
    if (u.stT <= 0) {
      if (elite) { u.state = 'burst'; u.burst = 3; u.sh = 0; }
      else { shootAt(g, u, t, wall ? 0.065 : 0.052, 0.35); u.state = 'cool'; u.stT = rand(1.9, 3.2) * (wall ? 1.5 : 1); }
    }
  } else if (u.state === 'burst') {
    still(u, dt); u.aim = 1; u.sh -= dt;
    if (u.sh <= 0) { u.sh = 0.13; u.burst--; shootAt(g, u, t, 0.04, 0.4, 38); if (u.burst <= 0) { u.state = 'cool'; u.stT = rand(1.8, 2.7); } }
  } else {
    u.aim = damp(u.aim, 0.2, 8, dt);
    const pref = elite ? Math.min(u.pref, 15) : u.pref;
    if (!u.hold && (d > pref || !los)) {
      if (d > pref) move(g, u, dx, dz, def.speed, dt);
      else move(g, u, dx * 0.5 - dz * u.strafe, dz * 0.5 + dx * u.strafe, def.speed, dt);   // 没射界：斜着往前绕出掩体
    } else if (elite) {
      u.strafeT -= dt;
      if (u.strafeT <= 0) { u.strafeT = rand(0.7, 1.5); u.strafe = pick([-1, 0, 1]); }
      if (u.strafe) move(g, u, -dz * u.strafe, dx * u.strafe, def.speed, dt); else still(u, dt);
    } else still(u, dt);
    if (u.stT <= 0 && d < def.range && los) { u.state = 'aim'; u.stT = elite ? 0.45 : wall ? 0.95 : 0.75; }
  }
}

const SIEGE_POSTS = [[-9, 24.6], [9, 24.6], [-12.5, 27], [12.5, 27], [-6.5, 29.5], [7, 30.5]];
const ESCORT = [[-3.6, -1.5], [3.6, -1.5], [0, 5]];
const FORM = [[-2.3, 2.6], [2.3, 2.6], [-4.6, 4.4], [4.6, 4.4], [-1.2, 5.6], [1.6, 6.6]];
// 正视 / 第一人称时改成并排散开，免得战友挤在镜头正前方
const FORM_WIDE = [[-5, -1.5], [5.6, -1.5], [-8, 0.6], [8.6, 0.6], [-11, 2.4], [11.6, 2.4]];

export function updateAlly(g, u, dt) {
  if (!u.alive) return;
  const h = g.hero;
  if (u.down > 0) {
    u.down -= dt;
    if (u.down <= 0) { u.hp = u.maxHp; g.fx.dust(u.x, 0.2, u.z, 4, 0xe8e2d0); }
    return;
  }
  if (u.regen > 0) u.regen -= dt; else if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * 0.6);
  u.stT -= dt; u.think -= dt;
  if (g.flags.won) { still(u, dt); u.aim = 0; u.yaw = angStep(u.yaw, yawTo(L.flag.x - u.x, L.flag.z - u.z), 5 * dt); return; }
  if (g.cut > 0) { still(u, dt); return; }
  // 站位
  let sx, sz;
  const p = g.phase;
  if (u.hold) { sx = u.px; sz = u.pz; }
  else if (p === 3) { sx = SIEGE_POSTS[u.slot][0]; sz = SIEGE_POSTS[u.slot][1]; }
  else if (p === 2 && u.slot >= 3 && g.cannon.visible) { const e = ESCORT[u.slot - 3]; sx = g.cannon.x + e[0]; sz = g.cannon.z + e[1]; }
  else {
    // 跟随主角：按前进方向排成散兵线
    const adv = p >= 4 ? 0 : (g.advYaw === undefined ? 0 : g.advYaw);
    const f = FORM_WIDE[u.slot];
    sx = h.x + Math.cos(adv) * f[0] + Math.sin(adv) * f[1];
    sz = h.z - Math.sin(adv) * f[0] + Math.cos(adv) * f[1];
    if (p >= 4 && h.z < -23) sx = clamp(sx, -6.2, 6.2);
  }
  const ds = dist(u.x, u.z, sx, sz);
  if (ds > 42 && p !== 3 && !u.hold) { u.x = sx; u.z = sz; resolveCircle(g.world, u, u.r); }
  // 找目标
  if (u.think <= 0 || (u.target && !u.target.alive)) {
    u.think = 0.4 + rand(0.2);
    let best = null, bd = u.def.range * (p === 3 ? 1.5 : 1);
    for (const e of g.enemies) {
      if (!e.alive || !e.active) continue;
      if (e.y > 2 && p !== 3) continue;
      const d = dist(u.x, u.z, e.x, e.z) + (e.y > 2 ? 6 : 0);
      if (d < bd && !losBlocked(g.world, u.x, u.z, e.x, e.z, 1.7, 1.4, e.y + 1.2)) { bd = d; best = e; }
    }
    u.target = best;
  }
  const t = u.target;
  if (t && ds < 11) {
    still(u, dt);
    u.yaw = angStep(u.yaw, yawTo(t.x - u.x, t.z - u.z), 8 * dt);
    if (u.state === 'aim') {
      u.aim = damp(u.aim, 1, 14, dt);
      if (u.stT <= 0) {
        muzzleWorld(u.model, _v);
        const d = dist(u.x, u.z, t.x, t.z), fl = d / 70, sp = 0.1;
        const b = g.fireBullet(0, _v.x, _v.y, _v.z, t.x + (t.vx || 0) * fl * 0.5 + rand(-sp, sp) * d, t.y + 1.1 + rand(-sp, sp) * d * 0.3, t.z + (t.vz || 0) * fl * 0.5 + rand(-sp, sp) * d, 1, 70, null);
        b.fromAlly = 1;
        u.shotT = 0.07; g.sfxAt('rifle', u.x, u.z, 0.55);
        u.state = 'cool'; u.stT = rand(2.0, 3.3);
      }
    } else { u.aim = damp(u.aim, 0.3, 8, dt); if (u.stT <= 0) { u.state = 'aim'; u.stT = 0.5; } }
  } else {
    u.aim = damp(u.aim, 0, 8, dt);
    if (ds > 1.5) { move(g, u, sx - u.x, sz - u.z, ds > 9 ? 8.6 : u.def.speed, dt); u.yaw = angStep(u.yaw, yawTo(sx - u.x, sz - u.z), 10 * dt); }
    else { still(u, dt); if (h.alive) u.yaw = angStep(u.yaw, h.yaw, 3 * dt); }
  }
}

// ---------- 山本一木 ----------
function dashLength(g, x, z, dx, dz, max) {
  let l = 0;
  while (l < max) {
    const nx = x + dx * (l + 0.6), nz = z + dz * (l + 0.6);
    if (pointBlocked(g.world, nx, 1.0, nz)) break;
    l += 0.6;
  }
  return Math.max(2, l);
}
function startDash(g, u, tele) {
  const h = g.hero;
  let dx = h.x + h.vx * 0.25 - u.x, dz = h.z + h.vz * 0.25 - u.z;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  u.dx = dx; u.dz = dz; u.yaw = yawTo(dx, dz);
  u.dashLen = dashLength(g, u.x, u.z, dx, dz, Math.min(17, l + 5));
  u.state = 'dashTele'; u.stT = tele; u.hitDone = false;
  g.fx.strip(u.x, u.z, u.yaw, u.dashLen, 2.6, tele);
  g.sfxAt('unsheathe', u.x, u.z, 1);
}

export function updateBoss(g, u, dt) {
  if (!u.alive) return;
  const h = g.hero;
  const dx = h.x - u.x, dz = h.z - u.z, d = Math.hypot(dx, dz);
  if (g.cut > 0 || !h.alive) { still(u, dt); u.aim = damp(u.aim, 0, 8, dt); if (u.state !== 'stun') u.yaw = angStep(u.yaw, yawTo(dx, dz), 5 * dt); if (u.state === 'dash' || u.state === 'dashTele') { u.state = 'walk'; u.cd = 1.5; } return; }
  u.stT -= dt;
  const frac = u.hp / u.maxHp;
  if (u.stage === 1 && frac < 0.62) { u.stage = 2; summon(g, '特工队，给我上！'); }
  if (u.stage === 2 && frac < 0.32) { u.stage = 3; summon(g, '大日本帝国的武士，不会输！'); g.ui.danmaku(['山本急了', '他急了他急了', '二阶段'], 'red'); }
  const fast = u.stage >= 3;
  switch (u.state) {
    case 'walk': {
      u.aim = damp(u.aim, 0, 8, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      u.strafeT -= dt;
      if (u.strafeT <= 0) { u.strafeT = rand(1.2, 2.4); u.strafe = pick([-1, 1]); }
      if (d > 11) move(g, u, dx, dz, u.def.speed, dt);
      else if (d < 4.5) move(g, u, -dx, -dz, u.def.speed * 0.7, dt);
      else move(g, u, -dz * u.strafe, dx * u.strafe, u.def.speed * 0.75, dt);
      u.cd -= dt;
      if (u.cd <= 0) {
        const r = rand();
        if (d > 4 && r < 0.45) startDash(g, u, fast ? 0.62 : 0.85);
        else if (u.stage >= 2 && r < 0.7) { u.state = 'nade'; u.stT = 0.55; u.slash = 0; }
        else { u.state = 'aimShot'; u.stT = 0.5; }
      }
      break;
    }
    case 'aimShot':
      still(u, dt); u.aim = damp(u.aim, 1, 16, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      if (u.stT <= 0) { u.state = 'burst'; u.burst = fast ? 5 : 3; u.sh = 0; }
      break;
    case 'burst':
      still(u, dt); u.aim = 1;
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 5 * dt);
      u.sh -= dt;
      if (u.sh <= 0) {
        u.sh = 0.16; u.burst--;
        shootAt(g, u, h, 0.03, 0.55, 36, true);
        if (u.burst <= 0) { u.state = 'walk'; u.cd = rand(1.0, 1.7) / (fast ? 1.35 : 1); }
      }
      break;
    case 'dashTele':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'dash'; u.left = u.dashLen; g.sfxAt('slash', u.x, u.z, 1); u.slash = 0.3; }
      break;
    case 'dash': {
      const sp = 27, ox = u.x, oz = u.z;
      u.x += u.dx * sp * dt; u.z += u.dz * sp * dt;
      resolveCircle(g.world, u, u.r);
      const moved = Math.hypot(u.x - ox, u.z - oz);
      u.left -= sp * dt; u.moving = 1; u.walk += dt * 30;
      g.fx.spawn({ x: u.x, y: 1.2, z: u.z, life: 0.2, s0: 0.5, s1: 0.05, c0: 0xff8a70, c1: 0x7a1a12, spin: 0 });
      if (!u.hitDone && d < 1.7) {
        u.hitDone = true;
        // 刀锋贴地横扫：跳起来就躲过去了
        if (h.y > 0.7) { g.addScore(150); g.stats.dodges = (g.stats.dodges || 0) + 1; if (!g.flags.jumpDodge) { g.flags.jumpDodge = 1; g.ui.toast('跳过去了！山本的突进扑了个空', 2.2); g.ui.danmaku(['跳得好', '山本：？', '这也行'], ''); } }
        else g.hurtHero(2, u.x, u.z);
      }
      if (u.left <= 0 || moved < sp * dt * 0.3) {
        if (fast && !u.second) { u.second = true; startDash(g, u, 0.45); }
        else { u.second = false; u.state = 'recover'; u.stT = 1.15; }
      }
      break;
    }
    case 'recover':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'walk'; u.cd = 0.7; }
      break;
    case 'stun':
      still(u, dt); u.aim = 0;
      if (u.stT <= 0) { u.state = 'walk'; u.cd = 1.0; u.second = false; }
      break;
    case 'nade':
      still(u, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      if (u.stT <= 0) {
        const l = d || 1, px = -dz / l, pz = dx / l;
        for (const k of [-1, 0, 1]) g.launchMortar(h.x + h.vx * 0.5 + px * k * 3.8, h.z + h.vz * 0.5 + pz * k * 3.8, 3.0, 1.3, u.x, 1.8, u.z);
        g.sfxAt('throw', u.x, u.z, 1);
        u.state = 'walk'; u.cd = rand(1.3, 1.9) / (fast ? 1.3 : 1);
      }
      break;
  }
}
function summon(g, line) {
  g.ui.say('山本一木', line, { foe: true, now: true });
  for (const x of [-7, 7]) { const e = g.addUnit('enemy', 'elite', x, -102.2, { group: 'guard' }); e.active = true; e.stT = 1.2; }
  g.fx.dust(0, 0.3, -102.5, 8);
}
