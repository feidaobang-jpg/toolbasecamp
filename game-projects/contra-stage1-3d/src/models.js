// 程序化低模：按 FC 魂斗罗第一关的造型与配色制作（比尔、奔跑兵、狙击手、武器箱、旋转炮、红色炮台、
// 飞行胶囊、武器标志、爆炸桥、Boss 防御墙）。角色朝 +x 建模，原点在脚底。
import * as THREE from 'three';

export const PAL = {
  skin: 0xf0a868, skinD: 0xc87838, hair: 0x5a2a08, band: 0xd82800,
  pants: 0x1c58e8, pantsD: 0x0c38a8, boot: 0x3a2a1a, gun: 0x6c6c6c, gunD: 0x3c3c3c,
  lancePants: 0xd82800,
  grey: 0xbcbcbc, greyD: 0x7c7c7c, greyDD: 0x4c4c4c, white: 0xfcfcfc,
  soldier: 0xc8c8c0, soldierD: 0x8c8c84, soldierBelt: 0x5c3c1c,
  red: 0xe02810, redL: 0xf87858, orange: 0xf88800, gold: 0xf0bc3c,
  rock: 0x9c7c08, rockL: 0xf0bc3c, rockD: 0x4a3200,
  grass: 0x00a000, grassL: 0x80d010,
  water: 0x0a6ce8, waterL: 0x3cbcfc,
  wallBlue: 0x1830b8, wallBlueL: 0x5c84fc, wallDark: 0x0c1450
};
const matCache = new Map();
export function mat(color, o) {
  const key = color + ':' + JSON.stringify(o || {});
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0.0, flatShading: true }, o || {}));
  matCache.set(key, m);
  return m;
}
const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = 'b' + w + ',' + h + ',' + d;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
export function box(w, h, d, color, x, y, z, o) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'number' ? mat(color, o) : color);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  return m;
}
export function cyl(rt, rb, h, color, seg, o) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), typeof color === 'number' ? mat(color, o) : color);
  m.castShadow = true;
  return m;
}
export function ball(r, color, seg, o) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 10, Math.max(6, (seg || 10) - 2)), typeof color === 'number' ? mat(color, o) : color);
  m.castShadow = true;
  return m;
}
function pivot(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

// ---------- 比尔（1P）：赤膊、蓝裤、红头巾 ----------
export function makeCommando(pantsColor) {
  const root = new THREE.Group();
  const spin = pivot(0, 1, 0); root.add(spin);            // 翻滚跳时绕身体中心旋转
  const body = pivot(0, -1, 0); spin.add(body);           // 整体（卧倒时转动）
  const hips = pivot(0, 0.98, 0); body.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = pivot(0, 0, s * 0.13); hips.add(leg);
    leg.add(box(0.24, 0.62, 0.22, pantsColor, 0, -0.3, 0));
    const knee = pivot(0, -0.6, 0); leg.add(knee);
    knee.add(box(0.22, 0.34, 0.2, pantsColor, 0, -0.17, 0));
    knee.add(box(0.32, 0.1, 0.22, PAL.boot, 0.05, -0.36, 0));
    legs.push({ leg, knee });
  }
  hips.add(box(0.36, 0.14, 0.44, 0x5a3a14, 0, 0.04, 0));   // 腰带
  const chest = pivot(0, 0.06, 0); hips.add(chest);
  chest.add(box(0.34, 0.56, 0.44, PAL.skin, 0, 0.3, 0));
  chest.add(box(0.06, 0.2, 0.3, PAL.skinD, 0.17, 0.42, 0));   // 胸肌阴影
  const head = pivot(0.02, 0.72, 0); chest.add(head);
  head.add(box(0.3, 0.32, 0.28, PAL.skin, 0, 0.12, 0));
  head.add(box(0.32, 0.12, 0.3, PAL.hair, -0.02, 0.3, 0));
  head.add(box(0.33, 0.07, 0.31, PAL.band, 0, 0.22, 0));
  const tail = box(0.3, 0.06, 0.06, PAL.band, -0.28, 0.2, 0.06); tail.rotation.z = 0.35; head.add(tail);
  // 双臂 + 步枪：以肩为轴整体转向瞄准方向
  const arms = pivot(0, 0.42, 0); chest.add(arms);
  arms.add(box(0.4, 0.14, 0.14, PAL.skin, 0.2, 0, 0.2));
  arms.add(box(0.4, 0.14, 0.14, PAL.skin, 0.2, 0, -0.2));
  arms.add(box(0.7, 0.12, 0.12, PAL.gun, 0.62, 0.02, 0));
  arms.add(box(0.22, 0.16, 0.1, PAL.gunD, 0.38, -0.08, 0));
  const muzzle = pivot(0.98, 0.02, 0); arms.add(muzzle);
  return { root, spin, body, hips, chest, head, arms, legs, muzzle, kind: 'commando' };
}

// ---------- 奔跑兵 / 狙击手：灰色军装 ----------
export function makeSoldier(withRifle) {
  const root = new THREE.Group();
  const spin = pivot(0, 1, 0); root.add(spin);
  const body = pivot(0, -1, 0); spin.add(body);
  const hips = pivot(0, 0.95, 0); body.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = pivot(0, 0, s * 0.12); hips.add(leg);
    leg.add(box(0.22, 0.58, 0.2, PAL.soldierD, 0, -0.28, 0));
    const knee = pivot(0, -0.56, 0); leg.add(knee);
    knee.add(box(0.2, 0.34, 0.18, PAL.soldierD, 0, -0.17, 0));
    knee.add(box(0.3, 0.1, 0.2, PAL.greyDD, 0.04, -0.36, 0));
    legs.push({ leg, knee });
  }
  const chest = pivot(0, 0.02, 0); hips.add(chest);
  chest.add(box(0.32, 0.6, 0.42, PAL.soldier, 0, 0.3, 0));
  chest.add(box(0.33, 0.08, 0.43, PAL.soldierBelt, 0, 0.04, 0));
  const head = pivot(0.02, 0.72, 0); chest.add(head);
  head.add(box(0.28, 0.3, 0.26, PAL.skin, 0, 0.1, 0));
  head.add(box(0.34, 0.14, 0.32, PAL.soldierD, -0.02, 0.27, 0));   // 军帽
  head.add(box(0.12, 0.05, 0.3, PAL.soldierD, 0.16, 0.22, 0));
  const arms = pivot(0, 0.42, 0); chest.add(arms);
  arms.add(box(0.36, 0.13, 0.13, PAL.soldier, 0.16, -0.04, 0.2));
  arms.add(box(0.36, 0.13, 0.13, PAL.soldier, 0.16, -0.04, -0.2));
  let muzzle = null;
  if (withRifle) {
    arms.add(box(0.8, 0.1, 0.1, PAL.gunD, 0.56, 0, 0));
    muzzle = pivot(0.98, 0, 0); arms.add(muzzle);
  }
  return { root, spin, body, hips, chest, head, arms, legs, muzzle, kind: 'soldier' };
}

// 跑步 / 站立姿态（t 为相位秒）
export function poseRun(m, t, speed) {
  const a = Math.sin(t * 12) * 0.8 * speed;
  m.legs[0].leg.rotation.z = a; m.legs[1].leg.rotation.z = -a;
  m.legs[0].knee.rotation.z = -Math.max(0, -a) * 1.2 - 0.1 * speed; m.legs[1].knee.rotation.z = -Math.max(0, a) * 1.2 - 0.1 * speed;
  m.hips.position.y = (m.kind === 'commando' ? 0.98 : 0.95) + Math.abs(Math.cos(t * 12)) * 0.05 * speed;
}
export function poseStand(m) {
  for (const l of m.legs) { l.leg.rotation.z = 0; l.knee.rotation.z = 0; }
  m.hips.position.y = m.kind === 'commando' ? 0.98 : 0.95;
  m.body.rotation.set(0, 0, 0); m.body.position.set(0, -1, 0); m.spin.rotation.set(0, 0, 0); m.spin.scale.setScalar(1);
}

// ---------- 武器箱（Pill Box Sensor）：灰框 + 四片开合挡板 + 红色隼标核心 ----------
export function makePillbox() {
  const root = new THREE.Group();
  root.add(box(2, 2, 1.2, PAL.greyD, 0, 0, -0.2));
  const frame = new THREE.Group(); root.add(frame);
  frame.add(box(2, 0.18, 0.3, PAL.grey, 0, 0.91, 0.45), box(2, 0.18, 0.3, PAL.grey, 0, -0.91, 0.45));
  frame.add(box(0.18, 2, 0.3, PAL.grey, 0.91, 0, 0.45), box(0.18, 2, 0.3, PAL.grey, -0.91, 0, 0.45));
  const core = ball(0.42, PAL.red, 12, { emissive: 0x801000, emissiveIntensity: 0.6 }); core.position.set(0, 0, 0.3); root.add(core);
  const wing = box(1.1, 0.18, 0.12, PAL.white, 0, 0.05, 0.62); root.add(wing);
  const flaps = [];
  for (let k = 0; k < 4; k++) {
    const p = pivot(0, 0, 0.52); p.rotation.z = k * Math.PI / 2; root.add(p);
    const hinge = pivot(0, 0.82, 0); p.add(hinge);
    const f = box(1.5, 0.82, 0.1, PAL.grey, 0, -0.41, 0.06); hinge.add(f);
    flaps.push(hinge);
  }
  return { root, core, flaps };
}

// ---------- 旋转炮（Rotating Gun）：嵌在岩壁里的灰色炮座 ----------
export function makeRotGun() {
  const root = new THREE.Group();
  root.add(box(2, 2, 1.2, PAL.greyDD, 0, 0, -0.2));
  root.add(box(2, 0.16, 0.3, PAL.grey, 0, 0.92, 0.45), box(2, 0.16, 0.3, PAL.grey, 0, -0.92, 0.45));
  root.add(box(0.16, 2, 0.3, PAL.grey, 0.92, 0, 0.45), box(0.16, 2, 0.3, PAL.grey, -0.92, 0, 0.45));
  const disc = new THREE.Group(); disc.position.set(0, 0, 0.42); root.add(disc);
  const d = cyl(0.72, 0.72, 0.24, PAL.grey, 16); d.rotation.x = Math.PI / 2; disc.add(d);
  disc.add(box(0.5, 0.5, 0.3, PAL.greyD, 0, 0, 0.1));
  const barrel = box(0.9, 0.24, 0.24, PAL.greyDD, 0.55, 0, 0.18); disc.add(barrel);
  const lamp = ball(0.16, PAL.red, 8, { emissive: 0xa01000, emissiveIntensity: 0.8 }); lamp.position.set(0, 0, 0.3); disc.add(lamp);
  return { root, disc, lamp };
}

// ---------- 红色炮台（Red Turret）：从地下升起 ----------
export function makeTurret() {
  const root = new THREE.Group();
  const lift = new THREE.Group(); root.add(lift);
  const base = cyl(0.85, 0.95, 1.1, PAL.red, 12); base.position.y = 0.55; lift.add(base);
  const ring = cyl(0.98, 0.98, 0.18, PAL.redL, 12); ring.position.y = 0.2; lift.add(ring);
  const dome = ball(0.62, PAL.red, 12); dome.position.y = 1.1; dome.scale.y = 0.75; lift.add(dome);
  const gun = new THREE.Group(); gun.position.set(0, 1.12, 0); lift.add(gun);
  gun.add(box(1.0, 0.26, 0.26, PAL.greyD, 0.55, 0, 0));
  gun.add(box(0.2, 0.34, 0.34, PAL.greyDD, 1.05, 0, 0));
  return { root, lift, gun };
}

// ---------- 飞行胶囊：带翼银色舱 ----------
export function makeCapsule() {
  const root = new THREE.Group();
  const b = cyl(0.36, 0.36, 1.0, PAL.grey, 10); b.rotation.z = Math.PI / 2; root.add(b);
  const n1 = ball(0.36, PAL.grey, 10); n1.position.x = 0.5; root.add(n1);
  const n2 = ball(0.36, PAL.grey, 10); n2.position.x = -0.5; root.add(n2);
  root.add(box(0.34, 0.74, 0.74, PAL.red, 0, 0, 0));
  const wl = box(0.6, 0.06, 0.5, PAL.white, -0.1, 0.32, 0.45); wl.rotation.x = -0.5; root.add(wl);
  const wr = box(0.6, 0.06, 0.5, PAL.white, -0.1, 0.32, -0.45); wr.rotation.x = 0.5; root.add(wr);
  return { root, wl, wr };
}

// ---------- 武器标志（带翼字母）----------
const letterTex = new Map();
function letterTexture(L) {
  if (letterTex.has(L)) return letterTex.get(L);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c82000'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fcfcfc'; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c82000'; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(L, 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  letterTex.set(L, t);
  return t;
}
export function makeItem(L) {
  const root = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 20), [mat(PAL.red), new THREE.MeshStandardMaterial({ map: letterTexture(L), roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: letterTexture(L), roughness: 0.6 })]);
  disc.rotation.x = Math.PI / 2; root.add(disc);
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.4, 0.05, 0); root.add(w);
    for (let k = 0; k < 3; k++) {
      const f = box(0.5 - k * 0.1, 0.1, 0.1, k % 2 ? PAL.white : PAL.red, s * (0.22 + k * 0.03), 0.16 - k * 0.14, 0);
      f.rotation.z = s * (0.35 - k * 0.2); w.add(f);
    }
  }
  return { root };
}

// ---------- 爆炸桥一节（2 单位宽）----------
export function makeBridgeSection() {
  const root = new THREE.Group();
  root.add(box(2, 0.3, 4.2, PAL.grey, 1, -0.15, -1.4));
  for (const z of [0.6, -3.4]) {
    root.add(box(2, 0.12, 0.12, PAL.white, 1, 0.75, z));
    root.add(box(0.12, 0.9, 0.12, PAL.grey, 0.06, 0.3, z));
    const diag = box(2.1, 0.08, 0.08, PAL.greyD, 1, 0.3, z); diag.rotation.z = 0.4; root.add(diag);
  }
  root.add(box(2, 0.22, 0.5, PAL.greyD, 1, -0.45, 0.6), box(2, 0.22, 0.5, PAL.greyD, 1, -0.45, -3.4));
  const lamp = box(0.5, 0.14, 0.2, PAL.red, 1, 0.08, 0.72, { emissive: 0x902000, emissiveIntensity: 0.9 }); root.add(lamp);
  return { root };
}

// ---------- Boss 防御墙 ----------
export function makeBossWall() {
  const root = new THREE.Group();
  // 主体：蓝色金属墙 + 灰色塔楼
  root.add(box(12, 16, 7, PAL.wallBlue, 7.6, 6, -1.5));
  for (let i = 0; i < 4; i++) root.add(box(0.2, 15.6, 0.2, PAL.wallBlueL, 3.0 + i * 1.6, 6, 2.05));
  root.add(box(12.1, 0.4, 7.1, PAL.grey, 7.6, 6.2, -1.5));
  const tower = new THREE.Group(); root.add(tower);
  tower.add(box(3.2, 9.4, 4.2, PAL.greyD, 0.8, 4.5, -0.4));
  tower.add(box(3.4, 0.3, 4.4, PAL.grey, 0.8, 9.3, -0.4));
  tower.add(box(0.3, 9.4, 0.3, PAL.grey, -0.75, 4.5, 1.75), box(0.3, 9.4, 0.3, PAL.grey, 2.35, 4.5, 1.75));
  tower.add(box(2.2, 2.6, 0.4, PAL.wallDark, 0.9, 7.6, 1.75));
  for (let k = 0; k < 4; k++) tower.add(box(0.24, 0.24, 0.3, PAL.white, -0.2 + k * 0.6, 8.6, 1.9));
  // 顶部掩体（狙击手藏身）
  const bunker = box(1.8, 0.8, 1.6, PAL.grey, 0.5, 9.8, 0.4); tower.add(bunker);
  // 核心：装甲门 + 红色感应灯
  const door = new THREE.Group(); door.position.set(0.3, 3.5, 1.9); root.add(door);
  door.add(box(2.4, 2.4, 0.4, PAL.grey, 0, 0, 0));
  door.add(box(1.8, 1.8, 0.2, PAL.greyD, 0, 0, 0.25));
  const core = ball(0.55, PAL.red, 14, { emissive: 0xc01800, emissiveIntensity: 1.0 }); core.position.z = 0.35; door.add(core);
  const xbar = box(2.3, 0.18, 0.1, PAL.white, 0, 0, 0.45); xbar.rotation.z = 0.78; door.add(xbar);
  const xbar2 = box(2.3, 0.18, 0.1, PAL.white, 0, 0, 0.45); xbar2.rotation.z = -0.78; door.add(xbar2);
  return { root, door, core, tower };
}
export function makeBombCannon() {
  const root = new THREE.Group();
  root.add(box(1.2, 1.0, 1.0, PAL.greyD, 0.2, 0, 0));
  const barrel = cyl(0.22, 0.26, 1.3, PAL.greyDD, 10); barrel.rotation.z = Math.PI / 2; barrel.position.set(-0.75, 0.1, 0); root.add(barrel);
  const lamp = ball(0.16, PAL.orange, 8, { emissive: 0xa04000, emissiveIntensity: 0.8 }); lamp.position.set(0.3, 0.35, 0.5); root.add(lamp);
  return { root, barrel, lamp };
}
