// 敌我电脑单位（各章通用）：步兵、机枪手、军曹、特工队、城墙守军、掷弹筒与战友。出兵配置和 Boss 在各章的 chapters/*-ai.js
import * as THREE from '../vendor/three.module.js';
import { TAU, clamp, damp, angStep, fwdX, fwdZ, yawTo, dist, dist2, rand, pick } from './util.js';
import { resolveCircle, losBlocked, pointBlocked } from './world-kit.js';
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
  // 苍云岭：军曹（抓舌头的目标，行为同步兵）、警卫员虎子
  sergeant: { look: 'sergeant', hp: 4, speed: 3.1, range: 30, score: 300 },
  huzi: { look: 'huzi', hp: 9, speed: 6.6, range: 26 },
};
const _v = new THREE.Vector3();

export function wakeGroup(g, group) {
  for (const e of g.enemies) if (e.group === group) e.active = true;
}

export function move(g, u, dx, dz, speed, dt) {
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
export const still = (u, dt) => { u.moving = damp(u.moving, 0, 12, dt); u.vx = u.vz = 0; };

function chooseTarget(g, u) {
  const h = g.hero, c = g.cannon;
  let best = null, bs = 1e9;
  if (h.alive) { best = h; bs = dist(u.x, u.z, h.x, h.z) * 0.8; }
  for (const a of g.allies) {
    if (!a.alive || a.down > 0) continue;
    const d = dist(u.x, u.z, a.x, a.z);
    if (d < bs) { bs = d; best = a; }
  }
  if (g.gunTargetable(u)) {
    const d = dist(u.x, u.z, c.x, c.z) * (u.wantCannon ? 0.5 : 1.25);
    if (d < bs) { bs = d; best = c; }
  }
  return best;
}

export function shootAt(g, u, t, spread, lead, speed = 34, left = false) {
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
  if (u.downed) { still(u, dt); u.aim = 0; return; }   // 被打残倒地，等着被抓
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
      const tg = g.mortarAim(u);   // 落点由本章决定（砸炮组、炮位或主角）
      if (!tg) return;
      g.launchMortar(tg[0], tg[1], 3.8, 1.9, u.x, u.y + 1.5, u.z + 1);
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
  if (g.flags.won) { const cp = g.cheerPoint(); still(u, dt); u.aim = 0; u.yaw = angStep(u.yaw, yawTo(cp.x - u.x, cp.z - u.z), 5 * dt); return; }
  if (g.cut > 0) { still(u, dt); return; }
  // 站位：本章给了岗位就守岗位（fixed=固定岗位，不往主角身边瞬移），否则按前进方向排成散兵线跟着主角
  let sx, sz, fixed = false;
  const post = u.hold ? null : g.allyPost(u);
  if (u.hold) { sx = u.px; sz = u.pz; }
  else if (post) { sx = post[0]; sz = post[1]; fixed = !!post[2]; }
  else {
    const adv = g.formationYaw();
    const f = FORM_WIDE[u.slot % FORM_WIDE.length];
    sx = h.x + Math.cos(adv) * f[0] + Math.sin(adv) * f[1];
    sz = h.z - Math.sin(adv) * f[0] + Math.cos(adv) * f[1];
    sx = g.allyClamp(u, sx);
  }
  const ds = dist(u.x, u.z, sx, sz);
  if (ds > 42 && !fixed && !u.hold) { u.x = sx; u.z = sz; resolveCircle(g.world, u, u.r); }
  // 找目标（城墙上的敌人只在本章允许时才打）
  if (u.think <= 0 || (u.target && !u.target.alive)) {
    u.think = 0.4 + rand(0.2);
    const wallOk = g.allyEngageWall();
    let best = null, bd = u.def.range * (wallOk ? 1.5 : 1);
    for (const e of g.enemies) {
      if (!e.alive || !e.active || e.downed) continue;
      if (e.y > 2 && !wallOk) continue;
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
