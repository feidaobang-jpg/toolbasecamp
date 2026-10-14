// 苍云岭的出兵配置与 Boss 坂田信哲（指挥型：躲在沙袋后面开枪、叫掷弹筒和机枪、派卫兵冲锋，血少了才拔刀突进）
import { TAU, damp, angStep, yawTo, dist, dist2, rand, pick } from '../util.js';
import { resolveCircle, losBlocked, pointBlocked } from '../world-kit.js';
import { L } from './cangyunling-world.js';
import { move, still, shootAt } from '../ai.js';

const COVERS = [[-31, -116.4], [-15.6, -116.4]];   // 指挥部门口两段沙袋后面

export function spawnPhase(g, n, line) {
  const E = (type, x, z, o) => g.addUnit('enemy', type, x, z, o);
  const mortars = (active) => { for (const [m, st] of [[L.mortarL, 4], [L.mortarR, 8]]) { const e = E('mortar', m.x, m.z, { hold: true, group: 'M' }); e.active = active; e.stT = st; } };
  g.boss = null;
  if (n === 1) {
    mortars(true);
  } else if (n === 2) {
    E('mg', L.enemyNest.x, L.enemyNest.z + 0.3, { group: 'F', hold: true, nest: 'E', wake: 30 });
    E('rifle', -17, L.fwdZ - 1.2, { group: 'F', hold: true, wake: 30 }); E('rifle', 6, L.fwdZ - 1.2, { group: 'F', hold: true, wake: 30 });
    const m = E('mortar', L.mortarR.x, L.mortarR.z, { hold: true, group: 'M' }); m.active = true; m.stT = 9;
  } else if (n === 3) {
    mortars(true);
    // 前沿：左段步兵、右段机枪阵地、中间缺口有人守
    for (const [x, hold] of [[-23, 1], [-17, 1], [-30, 0]]) E('rifle', x, L.fwdZ - 1.2, { group: 'F1', hold: !!hold, wake: 34 });
    E('rifle', -11, L.fwdZ - 3, { group: 'F1', wake: 34 });
    E('mg', L.enemyNest.x, L.enemyNest.z + 0.3, { group: 'F2', hold: true, nest: 'E', wake: 34 });
    for (const [x, hold] of [[6, 1], [25, 1], [20, 0]]) E('rifle', x, L.fwdZ - 1.2 - (hold ? 0 : 2.5), { group: 'F2', hold: !!hold, wake: 34 });
    E('rifle', -2, 0, { group: 'F0', wake: 26 }); E('rifle', 3, -2, { group: 'F0', wake: 26 }); E('officer', 0, -5, { group: 'F0', wake: 22 });
    // 第二道线
    E('rifle', -24, L.line2Z - 1.2, { group: 'S1', hold: true, wake: 30 }); E('rifle', -18, L.line2Z - 1.2, { group: 'S1', hold: true, wake: 30 }); E('rifle', -21, L.line2Z - 5, { group: 'S1', wake: 30 });
    E('rifle', 8, L.line2Z - 1.2, { group: 'S2', hold: true, wake: 30 }); E('rifle', 12, L.line2Z - 1.2, { group: 'S2', wake: 30 }); E('rifle', 27, L.line2Z - 1.2, { group: 'S2', hold: true, wake: 30 }); E('elite', 10, L.line2Z - 6, { group: 'S2', wake: 30 });
    // 炮位附近的鬼子
    E('rifle', -14, -62, { group: 'G', wake: 26 }); E('rifle', 2, -60, { group: 'G', wake: 26 }); E('rifle', -8, -66, { group: 'G', wake: 26 });
    E('officer', -4, -64, { group: 'G', wake: 22 }); E('elite', -10, -70, { group: 'G', wake: 26 });
  } else if (n === 4) {
    // 指挥部的卫兵按兵不动（太远打不到炮位），机枪手守着门口
    E('mg', L.hqNest.x, L.hqNest.z + 0.3, { group: 'H', hold: true, nest: 'H', wake: 22 });
    for (const [x, z] of [[-30, -117], [-14, -118], [-24, -110]]) E('rifle', x, z, { group: 'H', wake: 18 });
  } else if (n === 5) {
    E('mg', L.hqNest.x, L.hqNest.z + 0.3, { group: 'H', hold: true, nest: 'H', wake: 34 });
    if (line === 'miss') {
      for (const [x, z] of [[-26, -117], [-12, -117]]) E('rifle', x, z, { group: 'H', hold: true, wake: 40 });
      E('officer', -36, -121, { group: 'H', wake: 30 }); E('officer', -8, -123, { group: 'H', wake: 30 });
      const b = E('boss', COVERS[0][0], COVERS[0][1], { group: 'boss', look: 'sakata', hp: 200 });
      b.active = true; b.state = 'cover'; b.cover = 0; b.cd = 3.5; b.moveT = 9; b.stage = 1; b.r = 0.55; b.strafe = 1; b.inv = 0; b.orderN = 0; b.yaw = 0;
      g.boss = b;
    } else {
      // 一炮打掉指挥部以后剩下的残兵
      for (const [x, z] of [[-30, -110], [-14, -109], [-24, -106], [-6, -118], [-36, -118]]) E('rifle', x, z, { group: 'H', wake: 34 });
      E('officer', -20, -104, { group: 'H', wake: 26 }); E('elite', -38, -112, { group: 'H', wake: 34 });
    }
  }
}

// ---------- 坂田信哲 ----------
function startDash(g, u, tele) {
  const h = g.hero;
  let dx = h.x + h.vx * 0.25 - u.x, dz = h.z + h.vz * 0.25 - u.z;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  u.dx = dx; u.dz = dz; u.yaw = yawTo(dx, dz);
  let len = 0;
  while (len < Math.min(15, l + 4)) { if (pointBlocked(g.world, u.x + dx * (len + 0.6), 1.0, u.z + dz * (len + 0.6))) break; len += 0.6; }
  u.dashLen = Math.max(2, len);
  u.state = 'dashTele'; u.stT = tele; u.hitDone = false;
  g.fx.strip(u.x, u.z, u.yaw, u.dashLen, 2.6, tele);
  g.sfxAt('unsheathe', u.x, u.z, 1);
}

// 下命令：掷弹筒齐射 / 卫兵冲锋 / 补上机枪手，轮着来
function order(g, u) {
  const h = g.hero, kinds = ['barrage', 'charge', 'mg'];
  let k = kinds[u.orderN++ % 3];
  if (k === 'mg' && g.enemies.some((e) => e.alive && e.nest === 'H')) k = 'barrage';
  if (k === 'barrage') {
    const dx = h.x - u.x, dz = h.z - u.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
    for (const s of [-1, 0, 1]) g.launchMortar(h.x + h.vx * 0.6 + px * s * 4.2, h.z + h.vz * 0.6 + pz * s * 4.2, 3.4, 1.6, u.x, 2, u.z - 8);
    g.ui.say('坂田信哲', '掷弹筒，覆盖射击！', { foe: true, now: true, dur: 2 });
  } else if (k === 'charge') {
    for (const x of [-40, -4]) { const e = g.addUnit('enemy', 'officer', x, -128, { group: 'guard' }); e.active = true; e.stT = 0.6; }
    g.fx.dust(-40, 0.3, -128, 6); g.fx.dust(-4, 0.3, -128, 6);
    g.ui.say('坂田信哲', '卫兵，上刺刀，冲锋！', { foe: true, now: true, dur: 2 });
  } else {
    const e = g.addUnit('enemy', 'mg', L.hqNest.x, L.hqNest.z + 0.3, { group: 'H', hold: true, nest: 'H' }); e.active = true; e.stT = 1.5;
    g.ui.say('坂田信哲', '机枪！把机枪架起来！', { foe: true, now: true, dur: 2 });
  }
}

export function updateBoss(g, u, dt) {
  if (!u.alive) return;
  const h = g.hero;
  const dx = h.x - u.x, dz = h.z - u.z, d = Math.hypot(dx, dz);
  if (g.cut > 0 || !h.alive) {
    still(u, dt); u.aim = damp(u.aim, 0, 8, dt);
    if (u.state === 'dash' || u.state === 'dashTele') { u.state = u.stage >= 3 ? 'walk' : 'cover'; u.cd = 1.5; }
    return;
  }
  u.stT -= dt;
  const frac = u.hp / u.maxHp;
  if (u.stage === 1 && frac < 0.66) {
    u.stage = 2; u.cd = Math.min(u.cd, 2);
    g.audio.voice('bt_zengbing');
    g.ui.say('坂田信哲', '不，一个大队兵力不够。命令第五步兵大队，协同第三大队进行攻击！', { foe: true, now: true, dur: 8.5 });
    for (const [x, z] of [[-45, -100], [6, -104]]) g.spawnWave(x, z, 3, 0, 'R5', 13);
    const e = g.addUnit('enemy', 'elite', -44, -104, { group: 'R5' }); e.active = true;
  }
  if (u.stage === 2 && frac < 0.33) {
    u.stage = 3; u.state = 'walk'; u.cd = 1.2;
    g.audio.voice('bt_yinmou');
    g.ui.say('坂田信哲', '不是他疯了，就是个阴谋。', { foe: true, now: true, dur: 3.5 });
    g.ui.stamp('坂田拔刀了！', 1.5, 'red');
    g.after(3.6, () => g.ui.toast('坂田突进时地上有红线：侧移、跳起来躲开，或者亮剑和他拼刀！', 5));
  }
  switch (u.state) {
    case 'cover': {
      // 守在沙袋后面：看得见就打几枪，时不时下命令、换另一段沙袋
      const c = COVERS[u.cover];
      const cd = Math.hypot(c[0] - u.x, c[1] - u.z);
      if (cd > 0.5) move(g, u, c[0] - u.x, c[1] - u.z, u.def.speed * 0.8, dt); else still(u, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 6 * dt);
      u.aim = damp(u.aim, 0.6, 8, dt);
      u.cd -= dt; u.moveT -= dt;
      if (u.moveT <= 0 && cd < 0.5) { u.moveT = rand(8, 12); u.cover = 1 - u.cover; }
      if (u.cd <= 0) {
        const los = d < 45 && !losBlocked(g.world, u.x, u.z, h.x, h.z, 1.7, 1.7, h.y + 1.1);
        if (u.orderT === undefined || u.orderT <= 0) { u.state = 'order'; u.stT = 0.9; u.slash = 0; u.orderT = u.stage >= 2 ? 2 : 3; }
        else if (los) { u.state = 'aimShot'; u.stT = 0.5; u.orderT--; }
        else { u.cd = 1.2; u.orderT--; }
      }
      break;
    }
    case 'order':
      still(u, dt); u.aim = 0;
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 6 * dt);
      if (u.stT <= 0) { order(g, u); u.state = u.stage >= 3 ? 'walk' : 'cover'; u.cd = rand(2.0, 3.0); }
      break;
    case 'aimShot':
      still(u, dt); u.aim = damp(u.aim, 1, 16, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      if (u.stT <= 0) { u.state = 'burst'; u.burst = u.stage >= 2 ? 4 : 3; u.sh = 0; }
      break;
    case 'burst':
      still(u, dt); u.aim = 1;
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 5 * dt);
      u.sh -= dt;
      if (u.sh <= 0) {
        u.sh = 0.2; u.burst--;
        shootAt(g, u, h, 0.035, 0.5, 34, true);
        if (u.burst <= 0) { u.state = u.stage >= 3 ? 'walk' : 'cover'; u.cd = rand(1.4, 2.2); }
      }
      break;
    case 'walk': {
      // 第三段：拔刀逼近，突进
      u.aim = damp(u.aim, 0, 8, dt);
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      u.strafeT -= dt;
      if (u.strafeT <= 0) { u.strafeT = rand(1.2, 2.4); u.strafe = pick([-1, 1]); }
      if (d > 10) move(g, u, dx, dz, u.def.speed, dt);
      else if (d < 4.5) move(g, u, -dx, -dz, u.def.speed * 0.7, dt);
      else move(g, u, -dz * u.strafe, dx * u.strafe, u.def.speed * 0.75, dt);
      u.cd -= dt;
      if (u.cd <= 0) {
        const r = rand();
        if (d > 4 && r < 0.55) startDash(g, u, 0.75);
        else if (r < 0.75) { u.state = 'order'; u.stT = 0.8; u.slash = 0; }
        else { u.state = 'aimShot'; u.stT = 0.45; }
      }
      break;
    }
    case 'dashTele':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'dash'; u.left = u.dashLen; g.sfxAt('slash', u.x, u.z, 1); u.slash = 0.3; }
      break;
    case 'dash': {
      const sp = 25, ox = u.x, oz = u.z;
      u.x += u.dx * sp * dt; u.z += u.dz * sp * dt;
      resolveCircle(g.world, u, u.r);
      const moved = Math.hypot(u.x - ox, u.z - oz);
      u.left -= sp * dt; u.moving = 1; u.walk += dt * 30;
      g.fx.spawn({ x: u.x, y: 1.2, z: u.z, life: 0.2, s0: 0.5, s1: 0.05, c0: 0xff8a70, c1: 0x7a1a12, spin: 0 });
      if (!u.hitDone && d < 1.7) {
        u.hitDone = true;
        if (h.dashT > 0) { g.tryClash(u); break; }
        if (h.y > 0.7) { g.addScore(150); if (!g.flags.jumpDodge) { g.flags.jumpDodge = 1; g.ui.toast('跳过去了！坂田的突进扑了个空', 2.2); } }
        else g.hurtHero(2, u.x, u.z);
      }
      if (u.left <= 0 || moved < sp * dt * 0.3) { u.state = 'recover'; u.stT = 1.2; }
      break;
    }
    case 'recover':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'walk'; u.cd = 0.9; }
      break;
    case 'stun':
      still(u, dt); u.aim = 0;
      if (u.stT <= 0) { u.state = 'walk'; u.cd = 1.0; }
      break;
    default:
      u.state = 'cover';
  }
}
