// 李家坡的出兵配置与 Boss 山崎（剑术型：刀能格开子弹，连砍、突刺；出刀落空收刀喘气时才吃子弹，突刺时亮剑能拼刀）
import { damp, angStep, angDiff, fwdX, fwdZ, yawTo, rand, pick } from '../util.js';
import { resolveCircle, pointBlocked } from '../world-kit.js';
import { L } from './lijiapo-world.js';
import { move, still } from '../ai.js';

const FZ = (L.ringF + L.ringFi) / 2;      // 南面环形战壕的中线

export function spawnPhase(g, n) {
  const E = (type, x, z, o) => g.addUnit('enemy', type, x, z, o);
  g.boss = null;
  if (n === 1) {
    // 山脚两个外围火力点：机枪手守在阵地里，步兵在两边沙袋后面
    for (const [id, p, extra] of [['PL', L.postL, 'officer'], ['PR', L.postR, 'elite']]) {
      E('mg', p.x, p.z + 0.3, { group: id, hold: true, nest: id, wake: 34 });
      E('rifle', p.x - 4.8, p.z + 0.6, { group: id, hold: true, wake: 34 });
      E('rifle', p.x + 4.8, p.z + 0.6, { group: id, hold: true, wake: 34 });
      E('rifle', p.x - 2, p.z - 3, { group: id, wake: 34 });
      E(extra, p.x + 2.5, p.z - 3.5, { group: id, wake: 30 });
      if (id === 'PR') E('officer', p.x - 3, p.z - 5, { group: id, wake: 26 });
    }
  } else if (n === 2) {
    // 坡顶的掷弹筒组：挖到一半才开始砸壕头（章节里叫醒）
    for (const x of [-20, 20]) { const m = E('mortar', x, -30.8, { hold: true, group: 'M', wake: 0.01 }); m.stT = rand(2, 5); }
  } else if (n === 3) {
    // 碉堡之间的散兵坑（能朝壕头开枪）、环形战壕里的守军（手榴弹雨的目标）、工事里的两门掷弹筒
    for (const x of [-9.2, -6.6, 6.6, 9.2]) E('rifle', x, -30.4, { group: 'RF', hold: true, wake: 60 }).active = true;
    for (const x of [-22, -11, -1, 9, 22]) E('rifle', x, FZ, { group: 'RT', hold: true, wake: 0.01 });
    E('officer', -6, FZ - 0.4, { group: 'RT', hold: true, wake: 0.01 }); E('officer', 13, FZ - 0.4, { group: 'RT', hold: true, wake: 0.01 });
    for (const x of [-12, 12]) { const m = E('mortar', x, -42, { hold: true, group: 'M', wake: 0.01 }); m.active = true; m.stT = rand(4, 7); }
  } else if (n === 4) {
    // 突击：南面战壕的鬼子端着刺刀冲出来，东西两段守着不动，靠近了才动
    for (const x of [-20, -14, -9, 9, 14, 20]) E('rifle', x, FZ, { group: 'F', wake: 999 }).active = true;
    for (const x of [-5, 0, 5]) { const e = E('officer', x, -40.5, { group: 'F', wake: 999 }); e.active = true; e.stT = 1.5; }
    for (const s of [-1, 1]) {
      const x = s * (L.ringX + L.ringXi) / 2, gid = s < 0 ? 'W' : 'E';
      for (const z of [-41, -50.5, -56]) E('rifle', x, z, { group: gid, hold: true, wake: 22 });
      E('officer', x, -45, { group: gid, wake: 20 });
      E(s < 0 ? 'elite' : 'officer', x, -53.5, { group: gid, wake: 22 });
    }
  } else if (n === 5) {
    // 指挥所周围的卫兵；山崎在射击孔都哑了以后才出来（章节里生成）
    for (const [x, z] of [[-12, -42.5], [12, -42.5], [-11, -55], [11, -55]]) E('rifle', x, z, { group: 'G', hold: true, wake: 28 });
  }
}

export function spawnYamazaki(g) {
  const d = g.world.cp.door;
  const b = g.addUnit('enemy', 'boss', d.x, d.z, { group: 'boss', look: 'yamazaki', hp: 150 });
  b.active = true; b.state = 'walk'; b.cd = 2.4; b.stage = 1; b.r = 0.55; b.strafe = 1; b.strafeT = 1; b.inv = 0; b.yaw = Math.PI;
  b.guard = true; b.noAlly = true;   // 谁也不许开枪：战友不打山崎
  g.boss = b;
  return b;
}

// ---------- 山崎 ----------
function startLunge(g, u, tele) {
  const h = g.hero;
  let dx = h.x + h.vx * 0.25 - u.x, dz = h.z + h.vz * 0.25 - u.z;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  u.dx = dx; u.dz = dz; u.yaw = yawTo(dx, dz);
  let len = 0;
  while (len < Math.min(13, l + 3)) { if (pointBlocked(g.world, u.x + dx * (len + 0.6), u.y + 1.0, u.z + dz * (len + 0.6))) break; len += 0.6; }
  u.dashLen = Math.max(2, len);
  u.state = 'dashTele'; u.stT = tele; u.hitDone = false;
  g.fx.strip(u.x, u.z, u.yaw, u.dashLen, 2.4, tele);
  g.sfxAt('unsheathe', u.x, u.z, 1);
}
function startCombo(g, u) {
  u.state = 'cTele'; u.combo = u.stage >= 2 ? 4 : 3; u.stT = u.stage >= 2 ? 0.36 : 0.44;
  comboWarn(g, u);
}
function comboWarn(g, u) {
  const h = g.hero;
  u.yaw = yawTo(h.x - u.x, h.z - u.z);
  g.fx.warn(u.x + fwdX(u.yaw) * 1.5, u.z + fwdZ(u.yaw) * 1.5, 1.9, u.stT);
}

export function updateYamazaki(g, u, dt) {
  if (!u.alive) return;
  const h = g.hero;
  const dx = h.x - u.x, dz = h.z - u.z, d = Math.hypot(dx, dz);
  u.guard = !(u.state === 'recover' || u.state === 'stun');
  if (g.cut > 0 || !h.alive) {
    still(u, dt); u.aim = 0;
    if (u.state !== 'walk' && u.state !== 'stun') { u.state = 'walk'; u.cd = 1.6; }
    return;
  }
  u.stT -= dt;
  if (u.stage === 1 && u.hp / u.maxHp < 0.55) {
    u.stage = 2; u.cd = Math.min(u.cd, 1.2);
    g.ui.say('山崎', '卫兵！把他们给我砍下去！', { foe: true, now: true, dur: 2.4 });
    for (const s of [-1, 1]) { const e = g.addUnit('enemy', 'officer', g.world.cp.door.x + s * 2, g.world.cp.door.z, { group: 'guard' }); e.active = true; e.stT = 0.8; }
    g.ui.stamp('山崎急了！', 1.3, 'red');
  }
  switch (u.state) {
    case 'walk': {
      // 架着刀逼近：子弹打在刀上
      u.aim = 0;
      u.yaw = angStep(u.yaw, yawTo(dx, dz), 8 * dt);
      u.strafeT -= dt;
      if (u.strafeT <= 0) { u.strafeT = rand(0.9, 1.8); u.strafe = pick([-1, 1]); }
      const sp = u.def.speed * (u.stage >= 2 ? 1.1 : 1);
      if (d > 5) move(g, u, dx, dz, sp, dt);
      else if (d < 2.4) move(g, u, -dx, -dz, sp * 0.6, dt);
      else move(g, u, dx * 0.4 - dz * u.strafe, dz * 0.4 + dx * u.strafe, sp * 0.7, dt);
      u.cd -= dt;
      if (u.cd <= 0) {
        if (d < 4.4) startCombo(g, u);
        else if (d < 15) startLunge(g, u, u.stage >= 2 ? 0.6 : 0.75);
        else u.cd = 0.4;
      }
      break;
    }
    case 'cTele':
      still(u, dt);
      if (u.stT <= 0) {
        // 一刀砍下：红圈里、身前一个扇面
        u.slash = 0; g.sfxAt('slash', u.x, u.z, 1);
        const fx = fwdX(u.yaw), fz = fwdZ(u.yaw);
        const ok = d < 3.1 && (dx * fx + dz * fz) / (d || 1) > 0.35 && !(h.y > u.y + 1.0);
        const def = ok ? g.bladeDefend(u, 'combo') : null;
        if (def === 'parry') break;   // 连砍被弹开：山崎硬直，这一套断了
        if (ok && !def) g.hurtHero(1, u.x, u.z);
        u.x += fx * 0.8; u.z += fz * 0.8; resolveCircle(g.world, u, u.r, u.y);
        u.combo--;
        if (u.combo > 0) { u.state = 'cGap'; u.stT = 0.22; }
        else { u.state = 'recover'; u.stT = u.stage >= 2 ? 1.25 : 1.5; }
      }
      break;
    case 'cGap':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'cTele'; u.stT = u.stage >= 2 ? 0.3 : 0.36; comboWarn(g, u); }
      break;
    case 'dashTele':
      still(u, dt);
      if (u.stT <= 0) { u.state = 'dash'; u.left = u.dashLen; g.sfxAt('slash', u.x, u.z, 1); u.slash = 0.3; }
      break;
    case 'dash': {
      const sp = 24, ox = u.x, oz = u.z;
      u.x += u.dx * sp * dt; u.z += u.dz * sp * dt;
      resolveCircle(g.world, u, u.r, u.y);
      const moved = Math.hypot(u.x - ox, u.z - oz);
      u.left -= sp * dt; u.moving = 1; u.walk += dt * 30;
      g.fx.spawn({ x: u.x, y: u.y + 1.2, z: u.z, life: 0.2, s0: 0.5, s1: 0.05, c0: 0xff8a70, c1: 0x7a1a12, spin: 0 });
      if (!u.hitDone && Math.hypot(h.x - u.x, h.z - u.z) < 1.7) {
        u.hitDone = true;
        const def = g.bladeDefend(u, 'dash');   // 拔刀格挡：挡住被震退，刀到的一瞬间按下＝拼刀
        if (def === 'parry') break;
        if (!def) {
          if (h.y > u.y + 0.7) { g.addScore(150); if (!g.flags.jumpDodge) { g.flags.jumpDodge = 1; g.ui.toast('跳过去了！山崎这一刀扑了个空', 2.2); } }
          else g.hurtHero(2, u.x, u.z);
        }
      }
      if (u.left <= 0 || moved < sp * dt * 0.3) { u.state = 'recover'; u.stT = 1.3; }
      break;
    }
    case 'recover':
      // 收刀喘气：这时候子弹打得进去
      still(u, dt);
      if (u.stT <= 0) { u.state = 'walk'; u.cd = u.stage >= 2 ? 0.7 : 1.0; }
      break;
    case 'stun':
      still(u, dt); u.aim = 0;
      if (u.stT <= 0) { u.state = 'walk'; u.cd = 1.0; }
      break;
    default:
      u.state = 'walk';
  }
  u.guard = !(u.state === 'recover' || u.state === 'stun');
  if (u.state === 'walk' && Math.abs(angDiff(u.yaw, yawTo(dx, dz))) > 1.6) u.guard = false;   // 背对着时格不了
  u.aim = damp(u.aim, 0, 8, dt);
}
