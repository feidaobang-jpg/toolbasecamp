// 人物、火炮、战马等会动的模型（全部为程序化低模）
import * as THREE from '../vendor/three.module.js';
import { Geo } from './geo.js';

export const MAT = {
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  hurt: new THREE.MeshBasicMaterial({ color: 0xff5a44 }),
  muzzle: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }),
  steel: new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x556070 }),
};

const SKIN = 0xe3b98f;
const LOOKS = {
  // 八路军：灰蓝军装
  hero: { coat: 0x6c7d8e, pants: 0x62748a, wrap: 0x8f979c, hat: 'cap', hatC: 0x6c7d8e, weapon: 'pistol', cape: 0x35404f, blade: true, scale: 1.1, belt: 0x5a3d26 },
  ally: { coat: 0x7b8b9a, pants: 0x71839a, wrap: 0xa3aaad, hat: 'cap', hatC: 0x7b8b9a, weapon: 'rifle', pack: 0x8a8468, belt: 0x5a3d26 },
  dabiao: { coat: 0x73849a, pants: 0x687a92, wrap: 0x9aa2a6, hat: 'cap', hatC: 0x73849a, weapon: 'pistol', belt: 0x4a3020, strap: true },
  monk: { coat: 0x808f9c, pants: 0x71839a, wrap: 0xa3aaad, hat: 'none', weapon: 'pistol', belt: 0x5a3d26, scale: 1.06 },
  rider: { coat: 0x7b8b9a, pants: 0x71839a, wrap: 0x4a3a2c, hat: 'cap', hatC: 0x7b8b9a, weapon: 'saber', belt: 0x5a3d26 },
  // 日军：土黄军装
  rifle: { coat: 0xb39c58, pants: 0xa8914f, wrap: 0x8f8250, hat: 'helmet', hatC: 0x6f6b42, weapon: 'bayonet', pack: 0x7b6a3c, belt: 0x4b3521, tab: 0xc23b2b },
  mg: { coat: 0xb39c58, pants: 0xa8914f, wrap: 0x8f8250, hat: 'helmet', hatC: 0x6f6b42, weapon: 'none', belt: 0x4b3521, tab: 0xc23b2b },
  officer: { coat: 0xa89250, pants: 0x9a8648, wrap: 0x3a2c22, hat: 'flap', hatC: 0xa89250, weapon: 'katana', belt: 0x4b3521, tab: 0xc23b2b, scale: 1.04 },
  elite: { coat: 0x565c3c, pants: 0x4d5336, wrap: 0x2f2a22, hat: 'helmet', hatC: 0x3d4230, weapon: 'smg', belt: 0x2a2018, tab: 0xd8d2b8, goggles: true, scale: 1.05 },
  boss: { coat: 0x5d6240, pants: 0x545a3a, wrap: 0x231c16, hat: 'cap', hatC: 0x5d6240, weapon: 'katana', left: 'pistol', belt: 0x3a2618, tab: 0xd0a030, cape: 0x2b3024, gloves: 0xf2efe6, scale: 1.2 },
  // 苍云岭：军曹（臂章、腰刀、步枪）、虎子（警卫员）、柱子（炮手，背弹药袋）、坂田（眼镜、披风）、楚云飞与 358 团参谋（国军黄绿呢军装）、担架队
  sergeant: { coat: 0xb39c58, pants: 0xa8914f, wrap: 0x8f8250, hat: 'flap', hatC: 0xb39c58, weapon: 'rifle', pack: 0x7b6a3c, belt: 0x4b3521, tab: 0xd0a030, band: 0xe8e2d0 },
  huzi: { coat: 0x7b8b9a, pants: 0x71839a, wrap: 0xa3aaad, hat: 'cap', hatC: 0x7b8b9a, weapon: 'pistol', belt: 0x5a3d26, strap: true, scale: 0.96 },
  zhuzi: { coat: 0x758696, pants: 0x6b7d92, wrap: 0x9aa2a6, hat: 'cap', hatC: 0x758696, weapon: 'none', pack: 0x6f6a4a, belt: 0x5a3d26 },
  sakata: { coat: 0x5d6240, pants: 0x545a3a, wrap: 0x231c16, hat: 'cap', hatC: 0x5d6240, weapon: 'katana', left: 'pistol', belt: 0x3a2618, tab: 0xd0a030, cape: 0x2b3024, gloves: 0xf2efe6, glasses: true, scale: 1.12 },
  chu: { coat: 0x6e6a4c, pants: 0x5f5b40, wrap: 0x2c241c, hat: 'cap', hatC: 0x6e6a4c, weapon: 'none', belt: 0x4a3020, tab: 0xc23b2b, cape: 0x4c4a36, gloves: 0xf2efe6, star: true, scale: 1.08 },
  guojun: { coat: 0x77724f, pants: 0x6a6546, wrap: 0x2c241c, hat: 'cap', hatC: 0x77724f, weapon: 'none', belt: 0x4a3020, tab: 0xc23b2b, star: true },
  bearer: { coat: 0x7b8b9a, pants: 0x71839a, wrap: 0xa3aaad, hat: 'cap', hatC: 0x7b8b9a, weapon: 'none', belt: 0x5a3d26, band: 0xe8e2d0 },
  // 李家坡：山崎（大队长，黄呢军服、白手套、军刀、仁丹胡）、孔捷（副团长）
  yamazaki: { coat: 0x8f7c46, pants: 0x82703f, wrap: 0x2a2018, hat: 'cap', hatC: 0x8f7c46, weapon: 'katana', belt: 0x3a2618, tab: 0xd0a030, gloves: 0xf2efe6, scale: 1.14 },
  kongjie: { coat: 0x75869a, pants: 0x6a7c92, wrap: 0x9aa2a6, hat: 'cap', hatC: 0x75869a, weapon: 'pistol', belt: 0x4a3020, strap: true, scale: 1.03 },
  // 秀芹：花棉袄、黑裤、辫子；被绑着的版本身上有绳子
  xiuqin: { coat: 0xa3523f, pants: 0x38424f, wrap: 0x38424f, hat: 'none', weapon: 'none', belt: 0x8f4636, hair: 0x1d1814, rope: 0xcdb98a, scale: 0.98 },
  xiuqinFree: { coat: 0xa3523f, pants: 0x38424f, wrap: 0x38424f, hat: 'none', weapon: 'none', belt: 0x8f4636, hair: 0x1d1814, scale: 0.98 },
};

const geoCache = {};
function soldierGeos(key) {
  if (geoCache[key]) return geoCache[key];
  const L = LOOKS[key];
  const out = {};
  // 躯干+头（原点在胯部）
  let g = new Geo();
  g.box(0.52, 0.6, 0.32, 0, 0.3, 0, L.coat);
  g.box(0.55, 0.09, 0.35, 0, 0.07, 0, L.belt, 0, 0, 0, 0.1);
  if (L.strap) g.box(0.07, 0.62, 0.34, 0.02, 0.32, 0, 0x4a3020, 0, 0, 0.62, 0.1);
  if (L.tab) { g.box(0.1, 0.07, 0.04, -0.13, 0.56, -0.165, L.tab, 0, 0, 0, 0); g.box(0.1, 0.07, 0.04, 0.13, 0.56, -0.165, L.tab, 0, 0, 0, 0); }
  g.box(0.36, 0.36, 0.36, 0, 0.8, 0, SKIN, 0, 0, 0, 0.12);
  g.box(0.06, 0.06, 0.03, -0.09, 0.84, -0.185, 0x2a2018, 0, 0, 0, 0);
  g.box(0.06, 0.06, 0.03, 0.09, 0.84, -0.185, 0x2a2018, 0, 0, 0, 0);
  if (key === 'hero') { g.box(0.22, 0.04, 0.03, 0, 0.9, -0.185, 0x2a2018, 0, 0, 0, 0); g.box(0.2, 0.05, 0.03, 0, 0.7, -0.185, 0x3a2c22, 0, 0, 0, 0); }
  if (key === 'boss' || key === 'sakata') g.box(0.16, 0.035, 0.03, 0, 0.74, -0.185, 0x1c1612, 0, 0, 0, 0);
  if (key === 'yamazaki') g.box(0.08, 0.05, 0.03, 0, 0.745, -0.185, 0x1c1612, 0, 0, 0, 0);
  if (L.glasses) { g.box(0.1, 0.07, 0.03, -0.09, 0.85, -0.195, 0x1a1a1a, 0, 0, 0, 0); g.box(0.1, 0.07, 0.03, 0.09, 0.85, -0.195, 0x1a1a1a, 0, 0, 0, 0); g.box(0.06, 0.02, 0.03, 0, 0.86, -0.195, 0x1a1a1a, 0, 0, 0, 0); }
  if (L.band) g.box(0.16, 0.1, 0.19, -0.335, 0.4, 0, L.band, 0, 0, 0, 0);
  if (L.hat === 'cap') {
    g.box(0.4, 0.15, 0.4, 0, 1.04, 0, L.hatC, 0, 0, 0, 0.1);
    g.box(0.3, 0.04, 0.16, 0, 0.99, -0.26, L.hatC, 0, 0, 0, 0.05);
    if (L.star) g.box(0.08, 0.08, 0.03, 0, 1.05, -0.205, 0xf2efe6, 0, 0, 0, 0);
    else if (key !== 'boss' && key !== 'sakata' && key !== 'yamazaki') g.box(0.07, 0.07, 0.03, 0, 1.05, -0.205, 0xc23b2b, 0, 0, 0, 0);
    else g.box(0.07, 0.07, 0.03, 0, 1.05, -0.205, 0xd0a030, 0, 0, 0, 0);
  } else if (L.hat === 'helmet') {
    g.cyl(0.26, 0.2, 0, 1.04, 0, L.hatC, 8, 0.72, 0, 0, 0, 0.15);
    g.cyl(0.29, 0.05, 0, 0.955, 0, L.hatC, 8, 1, 0, 0, 0, 0.05);
    if (L.goggles) g.box(0.3, 0.07, 0.04, 0, 1.0, -0.25, 0x1b1b1b, 0, 0, 0, 0);
  } else if (L.hat === 'flap') {
    g.box(0.39, 0.15, 0.39, 0, 1.04, 0, L.hatC, 0, 0, 0, 0.1);
    g.box(0.3, 0.04, 0.14, 0, 0.99, -0.25, L.hatC, 0, 0, 0, 0.05);
    g.box(0.36, 0.3, 0.04, 0, 0.82, 0.2, 0xc8b47a, 0, 0, 0, 0.1);
    g.box(0.04, 0.3, 0.2, -0.2, 0.82, 0.1, 0xc8b47a, 0, 0, 0, 0.1);
    g.box(0.04, 0.3, 0.2, 0.2, 0.82, 0.1, 0xc8b47a, 0, 0, 0, 0.1);
  }
  if (L.hair) {
    g.box(0.4, 0.13, 0.4, 0, 1.0, 0.01, L.hair, 0, 0, 0, 0.1);
    g.box(0.4, 0.34, 0.1, 0, 0.84, 0.2, L.hair, 0, 0, 0, 0.1);
    g.box(0.13, 0.44, 0.11, 0.1, 0.5, 0.25, L.hair, 0, 0, 0.12, 0.1);
    g.box(0.1, 0.06, 0.12, 0.13, 0.3, 0.25, 0xc23b2b, 0, 0, 0, 0);
  }
  if (L.rope) for (const y of [0.2, 0.4]) g.box(0.56, 0.05, 0.36, 0, y, 0, L.rope, 0, 0, 0, 0);
  if (L.pack) g.box(0.38, 0.36, 0.17, 0, 0.34, 0.245, L.pack);
  if (L.cape) {
    g.box(0.66, 0.2, 0.36, 0, 0.56, 0.04, L.cape, 0, 0, 0, 0.1);
    g.box(0.64, 0.92, 0.1, 0, 0.16, 0.23, L.cape, 0, 0.1, 0, 0.3);
  }
  if (L.blade) {
    // 背上的大刀
    g.box(0.1, 0.85, 0.035, 0.06, 0.42, 0.33, 0xcfd6dd, 0, 0, 0.5, 0.1);
    g.box(0.07, 0.24, 0.05, -0.2, 0.86, 0.33, 0x5a3d26, 0, 0, 0.5, 0);
    g.box(0.07, 0.2, 0.05, -0.3, 0.98, 0.33, 0xc23b2b, 0, 0, 0.9, 0);
  }
  out.torso = g;
  // 腿（原点在胯部，向下）
  g = new Geo();
  g.box(0.21, 0.42, 0.25, 0, -0.21, 0, L.pants);
  g.box(0.2, 0.22, 0.24, 0, -0.52, 0, L.wrap, 0, 0, 0, 0.1);
  g.box(0.21, 0.1, 0.3, 0, -0.67, -0.03, 0x2c241c, 0, 0, 0, 0);
  out.leg = g;
  // 手臂（原点在肩，向下）
  const arm = (weapon) => {
    const a = new Geo();
    a.box(0.15, 0.5, 0.17, 0, -0.25, 0, L.coat);
    a.box(0.13, 0.12, 0.14, 0, -0.56, 0, L.gloves || SKIN, 0, 0, 0, 0.05);
    let len = 0.6;
    if (weapon === 'rifle' || weapon === 'bayonet') {
      a.box(0.07, 0.62, 0.1, 0, -0.52, -0.04, 0x6b4a2c, 0, 0, 0, 0.1);
      a.box(0.045, 0.5, 0.045, 0, -1.02, -0.04, 0x2b2b2b, 0, 0, 0, 0);
      len = 1.27;
      if (weapon === 'bayonet') { a.box(0.02, 0.26, 0.03, 0, -1.38, -0.04, 0xd8dee4, 0, 0, 0, 0); len = 1.3; }
    } else if (weapon === 'pistol') {
      a.box(0.07, 0.14, 0.16, 0, -0.62, -0.06, 0x2b2b2b, 0, 0, 0, 0);
      a.box(0.05, 0.26, 0.06, 0, -0.78, -0.1, 0x33312e, 0, 0, 0, 0);
      len = 0.92;
    } else if (weapon === 'smg') {
      a.box(0.08, 0.5, 0.11, 0, -0.66, -0.05, 0x2c2c2a, 0, 0, 0, 0);
      a.box(0.06, 0.07, 0.3, 0, -0.62, -0.2, 0x3a3a36, 0, 0, 0, 0);
      len = 0.95;
    } else if (weapon === 'katana' || weapon === 'saber') {
      a.box(0.05, 0.2, 0.05, 0, -0.66, -0.02, 0x3a2618, 0, 0, 0, 0);
      a.box(0.13, 0.03, 0.09, 0, -0.77, -0.02, 0xc9a646, 0, 0, 0, 0);
      a.box(0.035, weapon === 'katana' ? 1.0 : 0.85, 0.02, 0, weapon === 'katana' ? -1.28 : -1.2, -0.02, 0xdfe6ee, 0, 0, 0, 0);
      len = 1.75;
    }
    return { geo: a, len };
  };
  const r = arm(L.weapon), l = arm(L.left || 'none');
  out.armR = r.geo; out.armL = l.geo; out.muzzle = r.len; out.muzzleL = l.len;
  for (const k of ['torso', 'leg', 'armR', 'armL']) out[k] = out[k].build(MAT.vc).geometry;
  geoCache[key] = out;
  return out;
}

const flashGeo = (() => {
  const g = new Geo();
  g.cyl(0.13, 0.34, 0, -0.17, 0, 0xffffff, 6, 0.1, 0, 0, 0, 0);
  g.box(0.36, 0.03, 0.03, 0, -0.06, 0, 0xffffff, 0, 0, 0, 0);
  g.box(0.03, 0.03, 0.36, 0, -0.06, 0, 0xffffff, 0, 0, 0, 0);
  return g.build(MAT.muzzle).geometry;
})();

export function buildSoldier(key) {
  const L = LOOKS[key];
  const gs = soldierGeos(key);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.72;
  root.add(body);
  const mk = (geo) => { const m = new THREE.Mesh(geo, MAT.vc); m.castShadow = true; return m; };
  const torso = mk(gs.torso);
  body.add(torso);
  const armR = mk(gs.armR); armR.position.set(0.335, 0.56, 0); body.add(armR);
  const armL = mk(gs.armL); armL.position.set(-0.335, 0.56, 0); body.add(armL);
  const legR = mk(gs.leg); legR.position.set(0.13, 0.72, 0); root.add(legR);
  const legL = mk(gs.leg); legL.position.set(-0.13, 0.72, 0); root.add(legL);
  const flash = new THREE.Mesh(flashGeo, MAT.muzzle);
  flash.position.y = -gs.muzzle; flash.visible = false; armR.add(flash);
  let flashL = null;
  if (L.left) { flashL = new THREE.Mesh(flashGeo, MAT.muzzle); flashL.position.y = -gs.muzzleL; flashL.visible = false; armL.add(flashL); }
  const s = L.scale || 1;
  root.scale.setScalar(s);
  const meshes = [torso, armR, armL, legR, legL];
  return { root, body, torso, armR, armL, legR, legL, flash, flashL, meshes, muzzle: gs.muzzle, muzzleL: gs.muzzleL, look: key, scale: s, melee: L.weapon === 'katana' || L.weapon === 'saber' };
}

export function setSoldierMat(model, mat) {
  for (const m of model.meshes) m.material = mat;
}

const _v = new THREE.Vector3();
export function muzzleWorld(model, out, left = false) {
  const arm = left ? model.armL : model.armR;
  arm.updateWorldMatrix(true, false);
  return out.set(0, -(left ? model.muzzleL : model.muzzle), 0).applyMatrix4(arm.matrixWorld);
}

// 姿势：st = { walk(弧度相位), moving(0~1), aim(0~1), pitch, slash(0~1,-1 表示无), carry:'rifle'|'side'|'blade', cheer }
export function poseSoldier(m, st) {
  const sw = Math.sin(st.walk) * 0.75 * st.moving;
  m.legR.rotation.x = sw;
  m.legL.rotation.x = -sw;
  m.body.position.y = 0.72 + Math.abs(Math.cos(st.walk)) * 0.04 * st.moving;
  m.body.rotation.x = 0.1 * st.moving;
  let rx, lx, rz = 0, lz = 0;
  if (st.carry === 'blade') { rx = 2.4; lx = -sw * 0.6; rz = -0.25; }
  else if (st.carry === 'rifle') { rx = 0.95 - sw * 0.15; lx = 0.8 + sw * 0.15; lz = 0.5; rz = -0.25; }
  else { rx = -sw * 0.7; lx = sw * 0.7; }
  if (st.aim > 0) {
    const ar = Math.PI / 2 + (st.pitch || 0);
    rx += (ar - rx) * st.aim;
    if (st.carry === 'rifle') { lx += (ar * 0.92 - lx) * st.aim; }
    rz *= 1 - st.aim;
  }
  if (st.aimL > 0) lx += (Math.PI / 2 + (st.pitch || 0) - lx) * st.aimL;
  if (st.slash >= 0) {
    // 挥刀：先举高，再快速劈下
    const k = st.slash;
    rx = k < 0.35 ? 2.4 + (k / 0.35) * 0.7 : 3.1 - Math.min(1, (k - 0.35) / 0.3) * 2.6;
    rz = -0.2;
  }
  if (st.cheer > 0) { rx = 3.0 + Math.sin(st.cheer * 9) * 0.25; lx = 3.0 + Math.cos(st.cheer * 9) * 0.25; rz = 0.3; lz = -0.3; }
  m.armR.rotation.set(rx, 0, rz);
  m.armL.rotation.set(lx, 0, lz);
}

// ---------- 铁锹（挖交通壕时拿在右手，原点在手腕，向下） ----------
export function buildShovel() {
  const g = new Geo();
  g.box(0.05, 0.95, 0.05, 0, -0.9, -0.03, 0x6b4a2c, 0, 0, 0, 0.1);
  g.box(0.24, 0.3, 0.035, 0, -1.48, -0.03, 0x55585a, 0, 0, 0, 0.1);
  g.box(0.16, 0.05, 0.05, 0, -0.43, -0.03, 0x4a3420, 0, 0, 0, 0);
  const s = g.build(MAT.vc);
  s.castShadow = true;
  return s;
}

// ---------- 意大利炮（山炮造型） ----------
export function buildCannon() {
  const root = new THREE.Group();
  const yawG = new THREE.Group();
  root.add(yawG);
  const steel = 0x56604a, dark = 0x33382c, wood = 0x7a5a36, iron = 0x2a2c28;
  let g = new Geo();
  // 大架与驻锄（向后 +Z 伸出）
  g.box(0.16, 0.14, 2.5, -0.32, 0.5, 1.35, steel, 0.08);
  g.box(0.16, 0.14, 2.5, 0.32, 0.5, 1.35, steel, -0.08);
  g.box(0.9, 0.3, 0.12, 0, 0.36, 2.55, dark);
  g.box(1.1, 0.14, 0.4, 0, 0.72, 0.05, steel);
  // 防盾
  g.box(1.5, 0.95, 0.06, 0, 1.25, -0.28, steel, 0, -0.12, 0, 0.3);
  g.box(0.5, 0.36, 0.07, -0.52, 0.58, -0.3, steel);
  g.box(0.5, 0.36, 0.07, 0.52, 0.58, -0.3, steel);
  const base = g.build(MAT.vc);
  yawG.add(base);
  // 车轮
  const wheelGeo = (() => {
    const w = new Geo();
    w.cyl(0.62, 0.1, 0, 0, 0, iron, 14, 1, 0, 0, Math.PI / 2, 0);
    w.cyl(0.5, 0.11, 0, 0, 0, wood, 14, 1, 0, 0, Math.PI / 2, 0.1);
    w.cyl(0.14, 0.2, 0, 0, 0, dark, 8, 1, 0, 0, Math.PI / 2, 0);
    for (let i = 0; i < 6; i++) w.box(0.13, 0.9, 0.07, 0, 0, 0, 0x8a6a40, 0, (i * Math.PI) / 6, 0, 0);
    return w.build(MAT.vc).geometry;
  })();
  const wheelL = new THREE.Mesh(wheelGeo, MAT.vc); wheelL.position.set(-0.78, 0.62, 0); wheelL.castShadow = true;
  const wheelR = new THREE.Mesh(wheelGeo, MAT.vc); wheelR.position.set(0.78, 0.62, 0); wheelR.castShadow = true;
  yawG.add(wheelL, wheelR);
  // 炮身（俯仰轴）
  const pitchG = new THREE.Group();
  pitchG.position.set(0, 0.98, 0);
  yawG.add(pitchG);
  const slide = new THREE.Group();
  pitchG.add(slide);
  g = new Geo();
  g.box(0.34, 0.26, 1.5, 0, -0.12, -0.1, dark);
  g.cyl(0.17, 1.0, 0, 0.06, 0.25, steel, 10, 1, Math.PI / 2);
  g.cyl(0.13, 1.7, 0, 0.06, -1.05, steel, 10, 0.82, -Math.PI / 2);
  g.cyl(0.15, 0.16, 0, 0.06, -1.86, dark, 10, 1, Math.PI / 2);
  g.box(0.26, 0.26, 0.3, 0, 0.06, 0.82, dark);
  const barrel = g.build(MAT.vc);
  slide.add(barrel);
  const flash = new THREE.Mesh(flashGeo, MAT.muzzle);
  flash.rotation.x = Math.PI / 2; flash.position.set(0, 0.06, -1.95); flash.scale.setScalar(4.5); flash.visible = false;
  slide.add(flash);
  return { root, yawG, pitchG, slide, flash, wheelL, wheelR, muzzleZ: -1.95, muzzleY: 0.06 };
}

// ---------- 迫击炮（苍云岭柱子的炮）：座板 + 炮身 + 两脚架；炮口朝 -Z，俯仰轴在座板上 ----------
export function buildMortar() {
  const root = new THREE.Group();
  const yawG = new THREE.Group();
  root.add(yawG);
  const steel = 0x4c5444, dark = 0x2c302a;
  let g = new Geo();
  g.cyl(0.42, 0.08, 0, 0.05, 0.12, dark, 10, 0.9);                  // 座板
  g.box(0.5, 0.05, 0.12, 0, 0.1, 0.12, steel, 0, 0, 0, 0);
  // 两脚架：撑在炮身前段，开脚落地
  g.box(0.05, 0.95, 0.05, -0.28, 0.45, -0.62, steel, 0, -0.18, 0.32, 0);
  g.box(0.05, 0.95, 0.05, 0.28, 0.45, -0.62, steel, 0, -0.18, -0.32, 0);
  g.box(0.5, 0.05, 0.06, 0, 0.82, -0.52, dark, 0, 0, 0, 0);
  g.box(0.08, 0.16, 0.08, 0.16, 0.86, -0.5, dark, 0, 0, 0, 0);       // 方向机
  const base = g.build(MAT.vc); base.castShadow = true;
  yawG.add(base);
  const pitchG = new THREE.Group();
  pitchG.position.set(0, 0.16, 0.12);
  yawG.add(pitchG);
  const slide = new THREE.Group();
  pitchG.add(slide);
  g = new Geo();
  g.cyl(0.075, 1.1, 0, 0, -0.55, steel, 10, 1, Math.PI / 2);
  g.cyl(0.09, 0.08, 0, 0, -1.08, dark, 10, 1, Math.PI / 2);
  g.cyl(0.1, 0.12, 0, 0, -0.02, dark, 10, 0.8, Math.PI / 2);
  g.box(0.05, 0.1, 0.14, 0.09, 0.07, -0.7, 0x8a7a50, 0, 0, 0, 0);    // 瞄准镜
  const tube = g.build(MAT.vc); tube.castShadow = true;
  slide.add(tube);
  const flash = new THREE.Mesh(flashGeo, MAT.muzzle);
  flash.rotation.x = Math.PI / 2; flash.position.set(0, 0, -1.18); flash.scale.setScalar(2.4); flash.visible = false;
  slide.add(flash);
  return { root, yawG, pitchG, slide, flash, muzzleZ: -1.12, muzzleY: 0 };
}

// 担架（两名担架员抬着走）
export function buildStretcher() {
  const g = new Geo();
  g.box(0.62, 0.06, 2.0, 0, 0, 0, 0x6b4a2c, 0, 0, 0, 0);
  g.box(0.56, 0.1, 1.7, 0, 0.06, 0, 0xd8d0b8, 0, 0, 0, 0.1);
  g.box(0.5, 0.16, 0.6, 0, 0.14, 0.4, 0x7b8b9a, 0, 0, 0, 0.1);
  g.box(0.26, 0.16, 0.26, 0, 0.16, -0.62, 0xe3b98f, 0, 0, 0, 0.1);
  for (const sx of [-0.33, 0.33]) g.box(0.05, 0.05, 2.7, sx, 0, 0, 0x5a3d26, 0, 0, 0, 0);
  const m = g.build(MAT.vc); m.castShadow = true;
  return m;
}

// ---------- 战马与骑兵 ----------
let horseGeos = null;
// 阵地上的重机枪：枪管朝 -Z，原点在枪身下方的支架顶端；接管后跟着准星转
export function buildMG() {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const g = new Geo();
  g.box(0.11, 0.13, 1.25, 0, 0.2, -0.45, 0x2b2b2b, 0, 0, 0, 0);       // 枪管
  g.box(0.2, 0.2, 0.55, 0, 0.18, 0.2, 0x35332e, 0, 0, 0, 0);           // 机匣
  g.box(0.3, 0.2, 0.2, 0.24, 0.16, 0.12, 0x5a6038, 0, 0, 0, 0);        // 弹药盒
  g.box(0.06, 0.16, 0.06, 0, 0.02, 0.5, 0x2b2b2b, 0, 0, 0, 0);         // 握把
  g.box(0.05, 0.42, 0.05, -0.22, -0.02, -0.3, 0x2b2b2b, 0, 0, 0.5, 0);  // 前脚架
  g.box(0.05, 0.42, 0.05, 0.22, -0.02, -0.3, 0x2b2b2b, 0, 0, -0.5, 0);
  g.box(0.07, 1.05, 0.07, 0, -0.5, 0.05, 0x33382c, 0, 0, 0, 0);        // 立柱（架在沙袋上时埋在沙袋里）
  const mesh = g.build(MAT.vc); mesh.castShadow = true;
  root.add(mesh);
  return { root };
}

export function buildRider() {
  if (!horseGeos) {
    const body = new Geo();
    const coat = 0x6a4428, dark = 0x2c1c10;
    body.box(0.6, 0.66, 1.7, 0, 1.3, 0, coat);
    body.box(0.34, 0.8, 0.44, 0, 1.86, -0.88, coat, 0, -0.5);
    body.box(0.3, 0.34, 0.62, 0, 2.22, -1.26, coat, 0, 0.25);
    body.box(0.08, 0.16, 0.08, -0.1, 2.46, -1.08, dark); body.box(0.08, 0.16, 0.08, 0.1, 2.46, -1.08, dark);
    body.box(0.1, 0.62, 0.3, 0, 1.96, -0.66, dark, 0, -0.5);
    body.box(0.12, 0.7, 0.14, 0, 1.2, 0.92, dark, 0, 0.4);
    body.box(0.64, 0.1, 0.7, 0, 1.68, 0.05, 0x3a2a1c);
    const leg = new Geo();
    leg.box(0.17, 0.62, 0.2, 0, -0.31, 0, coat);
    leg.box(0.15, 0.42, 0.17, 0, -0.8, 0, dark, 0, 0, 0, 0.1);
    horseGeos = { body: body.build(MAT.vc).geometry, leg: leg.build(MAT.vc).geometry };
  }
  const root = new THREE.Group();
  const hb = new THREE.Mesh(horseGeos.body, MAT.vc); hb.castShadow = true; root.add(hb);
  const legs = [];
  for (const [x, z] of [[-0.22, -0.62], [0.22, -0.62], [-0.22, 0.66], [0.22, 0.66]]) {
    const l = new THREE.Mesh(horseGeos.leg, MAT.vc); l.position.set(x, 1.02, z); l.castShadow = true; root.add(l); legs.push(l);
  }
  const rider = buildSoldier('rider');
  rider.root.position.set(0, 1.02, 0.05);
  rider.legR.rotation.set(1.2, 0, -0.35); rider.legL.rotation.set(1.2, 0, 0.35);
  rider.armR.rotation.set(2.7, 0, -0.3); rider.armL.rotation.set(1.1, 0, -0.3);
  root.add(rider.root);
  return { root, legs, rider };
}

// 第一人称手里的枪
export function buildViewGun() {
  const g = new Geo();
  g.box(0.04, 0.06, 0.2, 0, 0, -0.05, 0x2b2b2b, 0, 0, 0, 0.1);
  g.box(0.022, 0.022, 0.17, 0, 0.012, -0.23, 0x1f1f1f, 0, 0, 0, 0);
  g.box(0.036, 0.075, 0.05, 0, -0.062, -0.09, 0x33312e, 0, 0, 0, 0.1);
  g.box(0.036, 0.12, 0.046, 0, -0.085, 0.05, 0x6b4a2c, 0, 0.3, 0, 0.1);
  g.box(0.08, 0.09, 0.1, 0.006, -0.09, 0.062, SKIN, 0, 0, 0, 0.1);
  g.box(0.09, 0.09, 0.3, 0.03, -0.15, 0.25, 0x35404f, 0, 0.35, 0, 0.2);
  const gun = g.build(new THREE.MeshLambertMaterial({ vertexColors: true }), { cast: false, receive: false });
  const group = new THREE.Group();
  group.add(gun);
  const flash = new THREE.Mesh(flashGeo, MAT.muzzle);
  flash.rotation.x = Math.PI / 2; flash.position.set(0, 0.012, -0.33); flash.scale.setScalar(0.5); flash.visible = false;
  group.add(flash);
  return { group, flash };
}

// 大刀（亮剑时握在手里）
export function buildBroadsword() {
  const g = new Geo();
  g.box(0.06, 0.22, 0.06, 0, -0.68, 0, 0x5a3d26, 0, 0, 0, 0);
  g.box(0.2, 0.04, 0.1, 0, -0.8, 0, 0xc9a646, 0, 0, 0, 0);
  g.box(0.16, 1.0, 0.03, 0.03, -1.32, 0, 0xe6ecf2, 0, 0, 0, 0);
  g.box(0.09, 0.16, 0.03, 0.065, -1.86, 0, 0xe6ecf2, 0, 0, 0, 0);
  g.box(0.05, 0.24, 0.05, -0.04, -0.52, 0, 0xc23b2b, 0, 0, 0.4, 0);
  const m = g.build(MAT.steel, { receive: false });
  m.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2f38 });
  return m;
}

// 小物件：急救包、弹药箱、旗帜
export function buildMedkit() {
  const g = new Geo();
  g.box(0.7, 0.42, 0.5, 0, 0.21, 0, 0xe9e2cf);
  g.box(0.3, 0.1, 0.52, 0, 0.24, 0, 0xc23b2b, 0, 0, 0, 0);
  g.box(0.1, 0.3, 0.52, 0, 0.24, 0, 0xc23b2b, 0, 0, 0, 0);
  g.box(0.3, 0.06, 0.08, 0, 0.46, 0, 0x5a3d26, 0, 0, 0, 0);
  return g.build(MAT.vc);
}
export function buildCrate(color = 0x66703e) {
  const g = new Geo();
  g.box(1.0, 0.6, 0.66, 0, 0.3, 0, color);
  g.box(1.04, 0.07, 0.7, 0, 0.14, 0, 0x3d4428, 0, 0, 0, 0);
  g.box(1.04, 0.07, 0.7, 0, 0.46, 0, 0x3d4428, 0, 0, 0, 0);
  g.box(0.36, 0.2, 0.02, 0, 0.3, -0.34, 0xe8dfa8, 0, 0, 0, 0);
  return g.build(MAT.vc);
}
