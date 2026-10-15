// 平安县城的出兵配置、城墙守军与 Boss 山本一木
import { TAU, clamp, damp, angStep, fwdX, fwdZ, yawTo, dist, dist2, rand, pick } from '../util.js';
import { resolveCircle, losBlocked, pointBlocked } from '../world-kit.js';
import { L } from './pingan-world.js';
import { move, still, shootAt } from '../ai.js';

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
    // 原作结局：山本在城楼上挨了那一炮，带伤进决战；救人那条路他毫发无伤
    if (g.flags.ending !== 'rescue') b.hp = Math.round(b.maxHp * 0.8);
    g.boss = b;
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
  if (u.stage === 2 && frac < 0.32) { u.stage = 3; summon(g, '大日本帝国的武士，不会输！'); }
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
        else if (u.stage >= 2 && r < 0.7 && d < 25) { u.state = 'nade'; u.stT = 0.55; u.slash = 0; }   // 手榴弹扔不过 25 米
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
        const def = g.bladeDefend(u, 'dash');   // 拔刀格挡：挡住被震退，刀到的一瞬间按下＝拼刀
        if (def === 'parry') break;
        // 刀锋贴地横扫：跳起来就躲过去了（格挡住了就不算）
        if (def) { /* 挡住了 */ }
        else if (h.y > 0.7) { g.addScore(150); g.stats.dodges = (g.stats.dodges || 0) + 1; if (!g.flags.jumpDodge) { g.flags.jumpDodge = 1; g.ui.toast('跳过去了！山本的突进扑了个空', 2.2); } }
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
