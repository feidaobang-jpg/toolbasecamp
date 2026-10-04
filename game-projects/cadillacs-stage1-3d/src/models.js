// 程序化低模角色与道具：按原作配色还原造型。每个骨骼节点的零件合并成一个带顶点色的网格，
// 角色用卡通着色（MeshToonMaterial）+ 法线外扩描边，接近 CPS 街机像素画的粗轮廓。
// 模型本地 +Z 为正面、+X 为角色左手侧、+Y 向上；脚底在原点。
import * as THREE from 'three';

// ---------- 公共材质 ----------
const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
export const TOON_GRAD = grad;
export function toonMat(opts) { return new THREE.MeshToonMaterial(Object.assign({ color: 0xffffff, vertexColors: true, gradientMap: grad }, opts || {})); }
export const outline = { on: true, mats: [] };
export function outlineMat(width) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1c1310, side: THREE.BackSide });
  m.userData.w = { value: width || 0.018 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutW = m.userData.w;
    sh.vertexShader = 'uniform float uOutW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * uOutW;');
  };
  outline.mats.push(m);
  return m;
}
const OUTLINE = outlineMat(0.017);
const OUTLINE_THIN = outlineMat(0.011);
export function setOutlines(on) { outline.on = on; }

// ---------- 几何拼装：带颜色的零件合并为一个 BufferGeometry ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mtx(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _s.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
  _p.set(x || 0, y || 0, z || 0);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
export class Parts {
  constructor() { this.list = []; }
  add(geo, color, m) { this.list.push({ geo, color: new THREE.Color(color), m: m || new THREE.Matrix4() }); return this; }
  get empty() { return this.list.length === 0; }
  build() { return mergeColored(this.list); }
}
export function mergeColored(list) {
  let nv = 0, ni = 0, hasUv = list.length > 0;
  for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; if (!it.geo.attributes.uv) hasUv = false; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = hasUv ? new Float32Array(nv * 2) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const it of list) {
    const g = it.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, c = it.color;
    nm.getNormalMatrix(it.m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(it.m);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      const k = (vo + i) * 3;
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      if (uv) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
    }
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
    else { for (let i = 0; i < P.count; i++) idx[io + i] = vo + i; io += P.count; }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
// 基础几何（单位尺寸，靠矩阵缩放）
export const GEO = {
  sph: new THREE.SphereGeometry(1, 14, 10),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  hemi: new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  tor: new THREE.TorusGeometry(1, 0.25, 6, 14),
  oct: new THREE.OctahedronGeometry(1, 0)
};
const capCache = new Map();
export function capsule(r, len) {
  const k = r.toFixed(3) + '|' + len.toFixed(3);
  let g = capCache.get(k);
  if (!g) { g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 10); capCache.set(k, g); }
  return g;
}
const latheCache = new Map();
function lathe(profile, phiStart, phiLen, key) {
  let g = latheCache.get(key);
  if (!g) { g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 16, phiStart || 0, phiLen || Math.PI * 2); latheCache.set(key, g); }
  return g;
}

// ---------- 人形骨架 ----------
// 体型（按 1.85m 身高给出，构建时按身高缩放）
const BUILD = {
  thin: { cw: 0.40, cd: 0.24, waist: 0.80, arm: 0.052, fore: 0.047, thigh: 0.078, shin: 0.062, hipW: 0.165, neck: 0.055, hand: 0.058 },
  normal: { cw: 0.47, cd: 0.27, waist: 0.76, arm: 0.060, fore: 0.053, thigh: 0.086, shin: 0.068, hipW: 0.18, neck: 0.062, hand: 0.062 },
  muscle: { cw: 0.55, cd: 0.30, waist: 0.70, arm: 0.072, fore: 0.062, thigh: 0.094, shin: 0.074, hipW: 0.19, neck: 0.07, hand: 0.068, bicep: 1 },
  huge: { cw: 0.66, cd: 0.35, waist: 0.68, arm: 0.090, fore: 0.076, thigh: 0.106, shin: 0.084, hipW: 0.21, neck: 0.085, hand: 0.078, bicep: 1.25 },
  fat: { cw: 0.62, cd: 0.42, waist: 1.04, arm: 0.080, fore: 0.068, thigh: 0.115, shin: 0.088, hipW: 0.225, neck: 0.085, hand: 0.072, belly: 0.36 },
  female: { cw: 0.37, cd: 0.22, waist: 0.64, arm: 0.043, fore: 0.039, thigh: 0.074, shin: 0.056, hipW: 0.17, neck: 0.046, hand: 0.05, bust: 1 }
};
const PROFILE = {
  base: [[0, -0.03], [0.76, 0], [0.80, 0.25], [0.94, 0.55], [1.0, 0.74], [0.93, 0.9], [0.56, 1.0], [0, 1.03]],
  female: [[0, -0.03], [0.80, 0], [0.64, 0.28], [0.86, 0.55], [0.90, 0.72], [0.84, 0.9], [0.5, 1.0], [0, 1.03]],
  fat: [[0, -0.03], [0.98, 0], [1.0, 0.3], [1.0, 0.6], [0.98, 0.78], [0.86, 0.92], [0.5, 1.0], [0, 1.03]]
};

function col(c) { return new THREE.Color(c); }
function darker(c, k) { return col(c).multiplyScalar(k || 0.78); }

// spec 字段：H 身高、build、skin、hair{style,color}、beard、cap{color,logo}、shirt{color,sleeves,open,crop,collar}、
// vest{color,fur,chevron}、pants{color}、belt、boots{color,high}、wrist、straps、hunch、gold（雕像整体金色）
export function buildHuman(spec) {
  const H = spec.H || 1.85, s = H / 1.85;
  const B = Object.assign({}, BUILD[spec.build || 'normal']);
  for (const k of ['cw', 'cd', 'arm', 'fore', 'thigh', 'shin', 'hipW', 'neck', 'hand', 'belly']) if (B[k]) B[k] *= s;
  const gold = spec.gold;
  const C = (c) => gold ? (typeof gold === 'string' ? gold : '#d9b241') : c;
  const skin = C(spec.skin || '#e0a878');
  const fat = spec.build === 'fat';
  const hipH = H * (fat ? 0.46 : 0.5);
  const torsoH = H * 0.29, neckH = H * 0.035, headR = H * 0.064;
  const ua = H * 0.168, fa = H * 0.155;
  const th = hipH * 0.5, sh = hipH * 0.43, footH = hipH * 0.07;
  const prof = fat ? PROFILE.fat : spec.build === 'female' ? PROFILE.female : PROFILE.base;
  const profKey = fat ? 'fat' : spec.build === 'female' ? 'female' : 'base';

  const bones = {};
  const root = new THREE.Group(); root.name = 'human';
  const body = new THREE.Group(); root.add(body); bones.body = body;
  const hips = new THREE.Group(); hips.position.y = hipH; body.add(hips); bones.hips = hips;
  const spine = new THREE.Group(); spine.position.y = 0.04 * s; hips.add(spine); bones.spine = spine;
  const neck = new THREE.Group(); neck.position.y = torsoH * 0.98; spine.add(neck); bones.neck = neck;
  const head = new THREE.Group(); head.position.y = neckH + headR * 0.85; neck.add(head); bones.head = head;
  const shY = torsoH * 0.86, shX = B.cw / 2 - B.arm * 0.35;
  const mk = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); bones[name] = g; return g; };
  const lS = mk('lS', spine, shX, shY, 0), rS = mk('rS', spine, -shX, shY, 0);
  const lE = mk('lE', lS, 0, -ua, 0), rE = mk('rE', rS, 0, -ua, 0);
  const lHand = mk('lHand', lE, 0, -fa, 0), rHand = mk('rHand', rE, 0, -fa, 0);
  const lH = mk('lH', hips, B.hipW * 0.55, -0.02 * s, 0), rH = mk('rH', hips, -B.hipW * 0.55, -0.02 * s, 0);
  const lK = mk('lK', lH, 0, -th, 0), rK = mk('rK', rH, 0, -th, 0);
  const lA = mk('lA', lK, 0, -sh, 0), rA = mk('rA', rK, 0, -sh, 0);

  const parts = {};
  const P = (name) => parts[name] || (parts[name] = new Parts());
  const shirt = spec.shirt, vest = spec.vest, pants = spec.pants || { color: '#555' };
  const pantsC = C(pants.color), bootC = C((spec.boots && spec.boots.color) || '#5a3a20');

  // --- 躯干 ---
  const tW = B.cw / 2, tD = B.cd / 2;
  const torsoM = mtx(0, 0, 0, 0, 0, 0, tW, torsoH, tD);
  const covered = shirt && !shirt.open && !shirt.crop;
  if (!covered) P('spine').add(lathe(prof, 0, 0, 'skin' + profKey), skin, torsoM);
  if (spec.abs && !gold) {   // 裸露的胸肌腹肌：几块略深的皮肤色
    const dk = darker(skin, 0.86);
    P('spine').add(GEO.sph, dk, mtx(tW * 0.36, torsoH * 0.66, tD * 0.86, 0, 0, 0, tW * 0.36, torsoH * 0.13, tD * 0.25));
    P('spine').add(GEO.sph, dk, mtx(-tW * 0.36, torsoH * 0.66, tD * 0.86, 0, 0, 0, tW * 0.36, torsoH * 0.13, tD * 0.25));
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) P('spine').add(GEO.sph, dk, mtx(sx * tW * 0.18, torsoH * (0.42 - i * 0.13), tD * 0.74, 0, 0, 0, tW * 0.16, torsoH * 0.055, tD * 0.2));
  }
  if (shirt) {
    const sc = C(shirt.color);
    if (shirt.crop) {
      // 系结短上衣：只盖胸口以上，胸前打结
      const crop = prof.filter(p => p[1] >= 0.45 || p[0] === 0).map(p => [p[0] * 1.05, p[1]]);
      crop[0] = [0, 0.45]; crop.splice(1, 0, [prof[3][0] * 1.08, 0.45]);
      P('spine').add(lathe(crop, 0.35, Math.PI * 2 - 0.7, 'crop' + profKey), sc, torsoM);
      P('spine').add(GEO.sph, darker(sc, 0.9), mtx(0, torsoH * 0.46, tD * 0.95, 0, 0, 0, tW * 0.28, torsoH * 0.07, tD * 0.25));
      P('spine').add(GEO.cone, darker(sc, 0.9), mtx(tW * 0.15, torsoH * 0.36, tD * 0.95, 0, 0, 2.6, tW * 0.12, torsoH * 0.16, tD * 0.12));
      P('spine').add(GEO.cone, darker(sc, 0.9), mtx(-tW * 0.12, torsoH * 0.35, tD * 0.95, 0, 0, -2.7, tW * 0.12, torsoH * 0.16, tD * 0.12));
    } else {
      const open = shirt.open ? 0.32 : 0;
      P('spine').add(lathe(prof.map(p => [p[0] * 1.04, p[1]]), open, Math.PI * 2 - open * 2, 'shirt' + profKey + open), sc, torsoM);
      if (shirt.collar) {
        for (const sx of [-1, 1]) P('spine').add(GEO.box, darker(sc, 0.92), mtx(sx * tW * 0.3, torsoH * 0.92, tD * 0.78, 0.5, sx * 0.5, sx * 0.4, tW * 0.38, torsoH * 0.05, tD * 0.5));
      }
      if (shirt.tank) {   // 背心：两条宽肩带，腋下开口靠无袖体现
        P('spine').add(GEO.box, darker(sc, 0.95), mtx(0, torsoH * 0.78, 0, 0, 0, 0, tW * 1.6, torsoH * 0.04, tD * 1.7));
      }
    }
  }
  if (vest) {
    const vc = C(vest.color);
    P('spine').add(lathe(prof.map(p => [p[0] * 1.09, p[1]]), 0.55, Math.PI * 2 - 1.1, 'vest' + profKey), vc, torsoM);
    if (vest.chevron) {   // 背心上的人字纹
      for (const sx of [-1, 1]) P('spine').add(GEO.box, C(vest.chevron), mtx(sx * tW * 0.62, torsoH * 0.58, tD * 0.82, 0, sx * 0.55, sx * 0.6, tW * 0.38, torsoH * 0.05, 0.02 * s));
    }
    if (vest.fur) {   // 维斯的毛领：肩上一圈蓬松皮毛
      const fc = C(vest.fur);
      for (let i = 0; i < 9; i++) {
        const a = -2.4 + i * 0.6;
        P('spine').add(GEO.sph, i % 2 ? fc : darker(fc, 0.8), mtx(Math.sin(a) * tW * 0.9, torsoH * (0.98 + (i % 2) * 0.03), Math.cos(a) * tD * 0.9 - tD * 0.15, 0, 0, 0, tW * 0.32, torsoH * 0.16, tD * 0.42));
      }
    }
  }
  if (fat) {   // 啤酒肚
    const bc = shirt ? C(shirt.color) : skin;
    P('spine').add(GEO.sph, bc, mtx(0, torsoH * 0.28, tD * 0.25, 0, 0, 0, tW * 0.95, torsoH * 0.42, B.belly));
  }
  if (B.bust && !gold) P('spine').add(GEO.sph, shirt ? C(shirt.color) : skin, mtx(0, torsoH * 0.62, tD * 0.55, 0, 0, 0, tW * 0.8, torsoH * 0.13, tD * 0.55));
  if (spec.belt) P('hips').add(GEO.cyl, C(spec.belt), mtx(0, 0.03 * s, 0, 0, 0, 0, tW * prof[1][0] * 1.06, 0.045 * s, tD * prof[1][0] * 1.06));
  if (spec.straps) {   // 交叉皮带（维斯的裤子）
    for (const sx of [-1, 1]) P('hips').add(GEO.box, C(spec.straps), mtx(sx * 0.02, -0.04 * s, tD * 0.95, 0, 0, sx * 0.5, 0.04 * s, 0.32 * s, 0.03 * s));
  }
  // 骨盆
  P('hips').add(GEO.sph, pantsC, mtx(0, -0.02 * s, 0, 0, 0, 0, tW * prof[1][0] * 1.02, 0.13 * s, tD * prof[1][0] * 1.05));
  if (spec.overalls) {   // 背带裤：胸前护片 + 两条背带
    const oc = C(spec.overalls);
    P('spine').add(GEO.box, oc, mtx(0, torsoH * 0.38, tD * 0.9, 0, 0, 0, tW * 0.9, torsoH * 0.5, 0.03 * s));
    for (const sx of [-1, 1]) P('spine').add(GEO.box, oc, mtx(sx * tW * 0.45, torsoH * 0.78, 0, 0, 0, 0, 0.05 * s, torsoH * 0.35, tD * 2.1));
  }

  // --- 头 ---
  const hr = headR;
  P('head').add(GEO.sph, skin, mtx(0, 0, 0, 0, 0, 0, hr * 0.86, hr, hr * 0.92));
  P('head').add(GEO.sph, skin, mtx(0, -hr * 0.45, hr * 0.18, 0, 0, 0, hr * 0.62, hr * 0.5, hr * 0.7));    // 下颌
  P('head').add(GEO.box, darker(skin, 0.88), mtx(0, -hr * 0.08, hr * 0.92, -0.2, 0, 0, hr * 0.2, hr * 0.32, hr * 0.22));   // 鼻
  if (!gold) {
    const eyeC = spec.eyes || '#1d1a22';
    for (const sx of [-1, 1]) {
      P('head').add(GEO.box, eyeC, mtx(sx * hr * 0.36, hr * 0.12, hr * 0.84, 0, sx * 0.25, 0, hr * 0.2, hr * 0.13, hr * 0.06));
      P('head').add(GEO.box, spec.hair && spec.hair.color ? spec.hair.color : '#3a2a20', mtx(sx * hr * 0.36, hr * 0.32, hr * 0.86, 0, sx * 0.25, sx * -0.12, hr * 0.3, hr * 0.07, hr * 0.06));
      P('head').add(GEO.sph, skin, mtx(sx * hr * 0.86, 0, -hr * 0.05, 0, 0, 0, hr * 0.14, hr * 0.24, hr * 0.12));   // 耳
    }
    P('head').add(GEO.box, '#7a3a30', mtx(0, -hr * 0.52, hr * 0.78, 0, 0, 0, hr * 0.34, hr * 0.06, hr * 0.06));   // 嘴
  }
  // 原作头像的特征
  const hair = spec.hair || { style: 'short', color: '#3a2a20' };
  const hc = C(hair.color || '#3a2a20');
  const capTop = (sc, k) => P('head').add(GEO.hemi, k || hc, mtx(0, hr * 0.05, -hr * 0.04, -0.15, 0, 0, hr * 0.95 * sc, hr * 1.02 * sc, hr * 0.98 * sc));
  switch (hair.style) {
    case 'short': capTop(1.0); break;
    case 'messy':
      capTop(1.0);
      for (let i = 0; i < 6; i++) P('head').add(GEO.cone, hc, mtx((i - 2.5) * hr * 0.26, hr * 0.78, hr * 0.42, 1.2 + (i % 2) * 0.2, 0, (i - 2.5) * 0.18, hr * 0.2, hr * 0.55, hr * 0.2));
      P('head').add(GEO.sph, hc, mtx(0, hr * 0.62, -hr * 0.3, 0, 0, 0, hr * 0.9, hr * 0.5, hr * 0.8));
      break;
    case 'spiky':
      capTop(1.0);
      for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43; P('head').add(GEO.cone, hc, mtx(Math.sin(a) * hr * 0.6, hr * 0.85, Math.cos(a) * hr * 0.2 - hr * 0.2, -0.5 + Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.6, hr * 0.2, hr * 0.62, hr * 0.2)); }
      break;
    case 'spikyBlond':   // 维斯：向后炸开的金色鬃毛
      capTop(1.04);
      for (let i = 0; i < 11; i++) {
        const a = -1.6 + i * 0.32, up = 0.9 + (i % 3) * 0.12;
        P('head').add(GEO.cone, i % 2 ? hc : darker(hc, 0.86), mtx(Math.sin(a) * hr * 0.72, hr * 0.62, -hr * 0.35 + Math.cos(a) * hr * 0.1, -1.0 - (i % 2) * 0.3, 0, -Math.sin(a) * 0.8, hr * 0.28, hr * up, hr * 0.28));
      }
      for (let i = 0; i < 5; i++) P('head').add(GEO.cone, hc, mtx((i - 2) * hr * 0.3, hr * 0.85, hr * 0.35, 0.7, 0, (i - 2) * 0.3, hr * 0.22, hr * 0.5, hr * 0.22));
      break;
    case 'long':   // 长发：头顶 + 披到背上的发片 + 两侧发束
      capTop(1.04);
      P('head').add(GEO.sph, hc, mtx(0, -hr * 0.6, -hr * 0.55, 0.15, 0, 0, hr * 1.0, hr * 1.55, hr * 0.5));
      for (const sx of [-1, 1]) P('head').add(GEO.sph, hc, mtx(sx * hr * 0.82, -hr * 0.45, hr * 0.05, 0, 0, sx * 0.1, hr * 0.28, hr * 1.0, hr * 0.5));
      P('head').add(GEO.sph, hc, mtx(hr * 0.2, hr * 0.62, hr * 0.62, 0.3, 0, -0.5, hr * 0.55, hr * 0.28, hr * 0.3));
      break;
    case 'ponytail':
      capTop(1.02);
      P('head').add(capsule(hr * 0.28, hr * 1.6), hc, mtx(0, -hr * 0.4, -hr * 1.05, 0.35, 0, 0));
      P('head').add(GEO.sph, hc, mtx(0, hr * 0.3, -hr * 0.85, 0, 0, 0, hr * 0.38, hr * 0.38, hr * 0.38));
      break;
    case 'bandana':   // 头巾（尼斯）：头顶包住 + 脑后打结
      capTop(1.06);
      P('head').add(GEO.cyl, hc, mtx(0, hr * 0.32, 0, -0.12, 0, 0, hr * 0.98, hr * 0.22, hr * 1.02));
      P('head').add(GEO.sph, darker(hc, 0.85), mtx(0, hr * 0.25, -hr * 1.0, 0, 0, 0, hr * 0.25, hr * 0.2, hr * 0.2));
      P('head').add(GEO.box, darker(hc, 0.85), mtx(hr * 0.1, -hr * 0.05, -hr * 1.1, 0.4, 0, 0.3, hr * 0.15, hr * 0.6, hr * 0.06));
      break;
    case 'bald': if (!gold) P('head').add(GEO.hemi, darker(skin, 0.97), mtx(0, hr * 0.05, -hr * 0.03, -0.15, 0, 0, hr * 0.9, hr * 1.0, hr * 0.95)); break;
    case 'helmet':   // 骑士盔
      P('head').add(GEO.sph, hc, mtx(0, hr * 0.05, 0, 0, 0, 0, hr * 1.08, hr * 1.12, hr * 1.1));
      P('head').add(GEO.box, darker(hc, 0.5), mtx(0, hr * 0.12, hr * 1.02, 0, 0, 0, hr * 1.1, hr * 0.12, hr * 0.1));
      P('head').add(GEO.cone, hc, mtx(0, hr * 1.3, -hr * 0.1, 0, 0, 0, hr * 0.25, hr * 0.6, hr * 0.25));
      break;
  }
  if (spec.beard) {
    const bc = C(spec.beard);
    P('head').add(GEO.sph, bc, mtx(0, -hr * 0.62, hr * 0.32, 0.2, 0, 0, hr * 0.72, hr * (spec.longBeard ? 0.85 : 0.5), hr * 0.62));
    P('head').add(GEO.box, bc, mtx(0, -hr * 0.3, hr * 0.84, 0, 0, 0, hr * 0.5, hr * 0.1, hr * 0.1));
  }
  if (spec.cap) {   // 穆斯塔法的黄色鸭舌帽，帽前绿色 P 字
    const cc = C(spec.cap.color);
    P('head').add(GEO.hemi, cc, mtx(0, hr * 0.36, -hr * 0.04, -0.1, 0, 0, hr * 1.03, hr * 0.9, hr * 1.05));
    P('head').add(GEO.cyl, darker(cc, 0.9), mtx(0, hr * 0.4, hr * 0.86, 0.3, 0, 0, hr * 0.82, hr * 0.06, hr * 0.6));
    if (spec.cap.logo) {
      P('head').add(GEO.box, C(spec.cap.logo), mtx(0, hr * 0.78, hr * 0.8, -0.5, 0, 0, hr * 0.12, hr * 0.36, hr * 0.06));
      P('head').add(GEO.box, C(spec.cap.logo), mtx(hr * 0.09, hr * 0.9, hr * 0.72, -0.5, 0, 0, hr * 0.2, hr * 0.12, hr * 0.06));
    }
  }
  // 脖子
  P('neck').add(GEO.cyl, skin, mtx(0, neckH * 0.6, 0, 0, 0, 0, B.neck * 1.1, neckH * 2.4, B.neck));

  // --- 手臂 ---
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const sl = shirt && !shirt.crop ? shirt.sleeves : (shirt && shirt.crop ? 'short' : 'none');
    const armC = sl === 'long' ? C(shirt.color) : skin;
    P(side + 'S').add(capsule(B.arm, ua * 0.86), armC, mtx(0, -ua * 0.5, 0));
    if (B.bicep && !gold) P(side + 'S').add(GEO.sph, armC, mtx(0, -ua * 0.42, B.arm * 0.35, 0, 0, 0, B.arm * 1.05 * B.bicep, ua * 0.3, B.arm * 1.1 * B.bicep));
    if (shirt && sl === 'short') P(side + 'S').add(capsule(B.arm * 1.28, ua * 0.32), C(shirt.color), mtx(0, -ua * 0.18, 0));
    if (vest && vest.fur) P(side + 'S').add(GEO.sph, C(vest.fur), mtx(0, -ua * 0.02, 0, 0, 0, 0, B.arm * 1.7, B.arm * 1.4, B.arm * 1.7));
    P(side + 'S').add(GEO.sph, armC, mtx(0, 0, 0, 0, 0, 0, B.arm * 1.15, B.arm * 1.15, B.arm * 1.15));   // 肩头
    P(side + 'E').add(capsule(B.fore, fa * 0.85), sl === 'long' ? C(shirt.color) : skin, mtx(0, -fa * 0.5, 0));
    if (spec.wrist) P(side + 'E').add(GEO.cyl, C(spec.wrist), mtx(0, -fa * 0.82, 0, 0, 0, 0, B.fore * 1.25, fa * 0.18, B.fore * 1.25));
    P(side + 'Hand').add(GEO.sph, skin, mtx(0, -B.hand * 0.75, B.hand * 0.1, 0, 0, 0, B.hand * 0.95, B.hand * 1.05, B.hand * 1.0));
    P(side + 'Hand').add(GEO.sph, darker(skin, 0.92), mtx(sx * -B.hand * 0.55, -B.hand * 0.5, B.hand * 0.55, 0, 0, 0, B.hand * 0.35, B.hand * 0.45, B.hand * 0.35));   // 拇指
  }
  // --- 腿 ---
  const high = spec.boots && spec.boots.high;
  for (const side of ['l', 'r']) {
    P(side + 'H').add(capsule(B.thigh, th * 0.8), pantsC, mtx(0, -th * 0.5, 0));
    P(side + 'K').add(capsule(B.shin, sh * 0.82), high ? bootC : pantsC, mtx(0, -sh * 0.5, 0));
    if (!high) P(side + 'K').add(GEO.cyl, bootC, mtx(0, -sh * 0.86, 0, 0, 0, 0, B.shin * 1.22, sh * 0.3, B.shin * 1.22));
    else P(side + 'K').add(GEO.cyl, darker(bootC, 0.85), mtx(0, -sh * 0.12, 0, 0, 0, 0, B.shin * 1.22, sh * 0.1, B.shin * 1.22));
    P(side + 'A').add(capsule(B.shin * 0.95, 0.16 * s), bootC, mtx(0, -footH * 0.35, 0.07 * s, Math.PI / 2, 0, 0));
    P(side + 'A').add(GEO.box, darker(bootC, 0.6), mtx(0, -footH * 0.92, 0.07 * s, 0, 0, 0, B.shin * 1.9, footH * 0.3, 0.28 * s));
  }

  // --- 生成网格 ---
  const meshes = [];
  const mat = toonMat();
  for (const name in parts) {
    const geo = parts[name].build();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = false;
    const ol = new THREE.Mesh(geo, H > 1.2 ? OUTLINE : OUTLINE_THIN);
    ol.userData.outline = true;
    mesh.add(ol);
    bones[name].add(mesh);
    meshes.push(mesh);
  }
  // 武器挂点（右手）
  const grip = new THREE.Group(); grip.position.set(0, -B.hand * 0.8, B.hand * 0.2); rHand.add(grip); bones.grip = grip;
  const lgrip = new THREE.Group(); lgrip.position.set(0, -B.hand * 0.8, B.hand * 0.2); lHand.add(lgrip); bones.lgrip = lgrip;
  return { root, bones, meshes, mat, H, dims: { hipH, torsoH, ua, fa, th, sh, headR, chestW: B.cw, hand: B.hand } };
}

// ---------- 角色表（按原作配色） ----------
export const SPECS = {
  // 玩家
  jack: { H: 1.86, build: 'muscle', skin: '#e9b48a', hair: { style: 'messy', color: '#74492a' }, shirt: { color: '#eef2f6', sleeves: 'short', open: true, collar: true }, pants: { color: '#3d5fa6' }, belt: '#4a3018', boots: { color: '#6b4426' } },
  hannah: { H: 1.74, build: 'female', skin: '#f2c8a2', hair: { style: 'long', color: '#242a4c' }, shirt: { color: '#e8622c', crop: true }, pants: { color: '#f4f1e8' }, belt: '#7a4a26', boots: { color: '#7c4a28', high: true } },
  mustapha: { H: 1.95, build: 'muscle', skin: '#a9693d', hair: { style: 'short', color: '#24160e' }, cap: { color: '#e4ba3c', logo: '#3c8c2a' }, shirt: { color: '#7fd257', sleeves: 'short', open: true, collar: true }, pants: { color: '#e8c33a' }, belt: '#4a3018', boots: { color: '#6c4628', high: true } },
  mess: { H: 2.04, build: 'huge', skin: '#e2a379', hair: { style: 'short', color: '#4a2b16' }, shirt: { color: '#e8742a', sleeves: 'none', open: true }, abs: true, pants: { color: '#a9dcb6' }, belt: '#5a3a1c', boots: { color: '#6a4424', high: true } },
  // 杂兵（原作第一关出场的几种）
  ferris: { H: 1.82, build: 'thin', skin: '#d79e6e', hair: { style: 'spiky', color: '#8c5a2a' }, vest: { color: '#5e6852', chevron: '#e6dcc0' }, abs: true, pants: { color: '#c96639' }, boots: { color: '#5a3a22' }, wrist: '#3a3a3a' },
  gneiss: { H: 1.8, build: 'thin', skin: '#d8a072', hair: { style: 'bandana', color: '#36b2b8' }, vest: { color: '#6d726b', chevron: '#d8d8d0' }, abs: true, pants: { color: '#3a9cb0' }, boots: { color: '#5a3a22' }, wrist: '#2f6f78' },
  punk: { H: 1.64, build: 'thin', skin: '#c98d60', hair: { style: 'short', color: '#26180f' }, shirt: { color: '#c63c30', sleeves: 'short' }, overalls: '#3554a8', pants: { color: '#3554a8' }, boots: { color: '#4a3020' } },
  blade: { H: 1.96, build: 'thin', skin: '#e3b08a', hair: { style: 'ponytail', color: '#efd26a' }, shirt: { color: '#2f63c6', sleeves: 'none', tank: true }, pants: { color: '#2f63c6' }, belt: '#24324e', boots: { color: '#38384a', high: true } },
  elmer: { H: 1.86, build: 'fat', skin: '#d39b6c', hair: { style: 'bald' }, beard: '#1d1410', longBeard: true, shirt: { color: '#cf90d2', sleeves: 'short' }, pants: { color: '#3d72b6' }, belt: '#5a3a1c', boots: { color: '#6a4426' } },
  hammer: { H: 1.84, build: 'fat', skin: '#dba272', hair: { style: 'bald' }, beard: '#b8462a', shirt: { color: '#f2a92a', sleeves: 'none' }, pants: { color: '#b0402c' }, belt: '#4a2a18', boots: { color: '#4a2e1c' } },
  wrench: { H: 1.88, build: 'fat', skin: '#d8a070', hair: { style: 'long', color: '#7a4a24' }, beard: '#7a4a24', longBeard: true, shirt: { color: '#eadfba', sleeves: 'short' }, pants: { color: '#5f903c' }, belt: '#4a2e18', boots: { color: '#5a3a22' } },
  // Boss：维斯·特修恩
  vice: { H: 2.1, build: 'huge', skin: '#e7ad82', hair: { style: 'spikyBlond', color: '#f3d566' }, vest: { color: '#25252c', fur: '#8d8d94' }, abs: true, pants: { color: '#9b63c8' }, straps: '#4a3460', boots: { color: '#bcc0cc', high: true }, wrist: '#76767e', eyes: '#2a3a7a' },
  // 大楼里的金色骑士雕像
  statue: { H: 1.9, build: 'muscle', gold: '#d6ae3e', hair: { style: 'helmet', color: '#d6ae3e' }, shirt: { color: '#d6ae3e', sleeves: 'long' }, pants: { color: '#d6ae3e' }, boots: { color: '#d6ae3e', high: true } }
};

// ---------- 迅猛龙（岩跳龙 Rock Hopper） ----------
const RAPTOR_COL = {
  calm: { base: '#79b04a', dark: '#46772c', belly: '#e3d68c', claw: '#f2ecd8' },
  angry: { base: '#ee8a2a', dark: '#b75816', belly: '#f6d47a', claw: '#fff4dc' }
};
const raptorGeoCache = {};
function raptorParts(pal) {
  const c = RAPTOR_COL[pal];
  const parts = {};
  const P = (n) => parts[n] || (parts[n] = new Parts());
  // 躯干（沿 Z 拉长，前高后低）
  P('body').add(GEO.sph, c.base, mtx(0, 0, 0.05, 0.12, 0, 0, 0.3, 0.32, 0.62));
  P('body').add(GEO.sph, c.belly, mtx(0, -0.1, 0.12, 0.12, 0, 0, 0.24, 0.24, 0.5));
  for (let i = 0; i < 4; i++) P('body').add(GEO.box, c.dark, mtx(0, 0.26 - i * 0.02, 0.35 - i * 0.22, 0.1, 0, 0, 0.42, 0.06, 0.08));
  P('neck').add(capsule(0.12, 0.38), c.base, mtx(0, 0.2, 0.06, -0.45, 0, 0));
  P('neck').add(capsule(0.09, 0.3), c.belly, mtx(0, 0.16, 0.12, -0.45, 0, 0));
  // 头与上颌
  P('head').add(GEO.sph, c.base, mtx(0, 0.02, 0.14, 0, 0, 0, 0.15, 0.14, 0.26));
  P('head').add(GEO.box, c.base, mtx(0, 0.0, 0.36, 0, 0, 0, 0.18, 0.12, 0.28));
  P('head').add(GEO.box, c.dark, mtx(0, 0.09, 0.2, 0, 0, 0, 0.2, 0.05, 0.3));
  for (const sx of [-1, 1]) {
    P('head').add(GEO.sph, '#f6e24a', mtx(sx * 0.12, 0.07, 0.2, 0, 0, 0, 0.04, 0.045, 0.045));
    P('head').add(GEO.box, '#1a1410', mtx(sx * 0.135, 0.07, 0.205, 0, 0, 0, 0.012, 0.04, 0.02));
  }
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) P('head').add(GEO.cone, c.claw, mtx(sx * 0.07, -0.07, 0.24 + i * 0.06, Math.PI, 0, 0, 0.018, 0.05, 0.018));
  P('jaw').add(GEO.box, c.belly, mtx(0, -0.04, 0.2, 0, 0, 0, 0.15, 0.06, 0.34));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) P('jaw').add(GEO.cone, c.claw, mtx(sx * 0.06, 0.0, 0.1 + i * 0.07, 0, 0, 0, 0.016, 0.045, 0.016));
  // 尾巴三节
  P('tail1').add(capsule(0.16, 0.42), c.base, mtx(0, 0, -0.3, Math.PI / 2, 0, 0));
  P('tail1').add(GEO.box, c.dark, mtx(0, 0.13, -0.3, 0, 0, 0, 0.2, 0.05, 0.08));
  P('tail2').add(capsule(0.1, 0.42), c.base, mtx(0, 0, -0.28, Math.PI / 2, 0, 0));
  P('tail2').add(GEO.box, c.dark, mtx(0, 0.08, -0.25, 0, 0, 0, 0.14, 0.04, 0.07));
  P('tail3').add(GEO.cone, c.base, mtx(0, 0, -0.32, -Math.PI / 2, 0, 0, 0.07, 0.6, 0.07));
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    P(side + 'Th').add(GEO.sph, c.base, mtx(sx * 0.03, -0.18, 0.02, 0.3, 0, 0, 0.13, 0.26, 0.17));
    P(side + 'Sh').add(capsule(0.06, 0.32), c.base, mtx(0, -0.2, 0));
    P(side + 'Ft').add(GEO.box, c.base, mtx(0, -0.02, 0.1, 0, 0, 0, 0.12, 0.06, 0.26));
    P(side + 'Ft').add(GEO.cone, c.claw, mtx(sx * 0.02, 0.06, 0.12, -0.6, 0, 0, 0.025, 0.12, 0.025));   // 镰刀爪
    for (let i = -1; i <= 1; i++) P(side + 'Ft').add(GEO.cone, c.claw, mtx(i * 0.04, -0.03, 0.25, Math.PI / 2, 0, 0, 0.018, 0.06, 0.018));
    P(side + 'Arm').add(capsule(0.035, 0.18), c.base, mtx(0, -0.1, 0.03, 0.4, 0, 0));
    P(side + 'Arm').add(GEO.cone, c.claw, mtx(0, -0.24, 0.1, 2.2, 0, 0, 0.02, 0.07, 0.02));
  }
  const out = {};
  for (const n in parts) out[n] = parts[n].build();
  return out;
}
export function buildRaptor() {
  if (!raptorGeoCache.calm) { raptorGeoCache.calm = raptorParts('calm'); raptorGeoCache.angry = raptorParts('angry'); }
  const bones = {};
  const root = new THREE.Group(); root.name = 'raptor';
  const mk = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); bones[name] = g; return g; };
  const body = mk('body', root, 0, 0.98, 0);
  const neck = mk('neck', body, 0, 0.12, 0.5);
  const head = mk('head', neck, 0, 0.42, 0.22);
  mk('jaw', head, 0, -0.04, 0.08);
  const t1 = mk('tail1', body, 0, 0.02, -0.5);
  const t2 = mk('tail2', t1, 0, 0, -0.55);
  mk('tail3', t2, 0, 0, -0.5);
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const th = mk(side + 'Th', body, sx * 0.2, -0.05, -0.05);
    const shn = mk(side + 'Sh', th, sx * 0.02, -0.38, 0.06);
    mk(side + 'Ft', shn, 0, -0.42, -0.04);
    mk(side + 'Arm', body, sx * 0.18, -0.08, 0.5);
  }
  const mat = toonMat();
  const meshes = {};
  for (const n in raptorGeoCache.calm) {
    const m = new THREE.Mesh(raptorGeoCache.calm[n], mat);
    m.castShadow = true;
    const ol = new THREE.Mesh(raptorGeoCache.calm[n], OUTLINE); ol.userData.outline = true; m.add(ol);
    bones[n].add(m); meshes[n] = m;
  }
  function setPalette(p) {
    const set = raptorGeoCache[p];
    for (const n in meshes) { meshes[n].geometry = set[n]; meshes[n].children[0].geometry = set[n]; }
  }
  return { root, bones, mat, setPalette, H: 1.6 };
}

// ---------- 道具 / 物品 / 武器 ----------
const propMat = toonMat();
const propCache = new Map();
function cachedGeo(key, fn) { let g = propCache.get(key); if (!g) { const p = new Parts(); fn(p); g = p.build(); propCache.set(key, g); } return g; }
export function meshFrom(geo, opts) {
  const o = opts || {};
  const m = new THREE.Mesh(geo, o.mat || propMat);
  m.castShadow = o.shadow !== false; m.receiveShadow = !!o.receive;
  if (o.outline !== false) { const ol = new THREE.Mesh(geo, o.thin ? OUTLINE_THIN : OUTLINE); ol.userData.outline = true; m.add(ol); }
  return m;
}
export function drumGeo() {
  return cachedGeo('drum', (p) => {
    p.add(GEO.cyl, '#c8662c', mtx(0, 0.45, 0, 0, 0, 0, 0.32, 0.9, 0.32));
    for (const y of [0.04, 0.3, 0.6, 0.86]) p.add(GEO.cyl, '#8e3f1a', mtx(0, y, 0, 0, 0, 0, 0.335, 0.035, 0.335));
    p.add(GEO.cyl, '#9a9aa2', mtx(0, 0.905, 0, 0, 0, 0, 0.3, 0.012, 0.3));
    p.add(GEO.cyl, '#e8a45c', mtx(0.2, 0.45, 0.2, 0, 0, 0, 0.05, 0.8, 0.05));   // 高光条
  });
}
export function pipesGeo() {
  return cachedGeo('pipes', (p) => {
    const g = '#a6aab4', d = '#7a7e88';
    p.add(GEO.cyl, g, mtx(0, 0.9, 0, 0, 0, 0, 0.09, 1.8, 0.09));
    p.add(GEO.cyl, g, mtx(0.3, 0.7, 0.05, 0, 0, 0, 0.07, 1.4, 0.07));
    p.add(GEO.cyl, g, mtx(0.15, 1.75, 0, 0, 0, Math.PI / 2, 0.07, 0.4, 0.07));
    p.add(GEO.cyl, g, mtx(0.3, 1.45, 0.05, 0, 0, 0, 0.07, 0.3, 0.07));
    p.add(GEO.cyl, d, mtx(-0.25, 0.55, 0.1, 0, 0, 0, 0.06, 1.1, 0.06));
    p.add(GEO.cyl, g, mtx(-0.12, 1.1, 0.1, 0, 0, Math.PI / 2, 0.06, 0.3, 0.06));
    for (const y of [0.3, 1.0, 1.5]) p.add(GEO.cyl, d, mtx(0, y, 0, 0, 0, 0, 0.11, 0.05, 0.11));
    p.add(GEO.box, '#6e6a62', mtx(0.05, 0.05, 0.05, 0, 0, 0, 0.8, 0.1, 0.4));
  });
}
const ITEM_BUILDERS = {
  steak: (p) => { p.add(GEO.sph, '#8a3a22', mtx(0, 0.06, 0, 0, 0, 0, 0.2, 0.06, 0.15)); p.add(GEO.sph, '#c85a3a', mtx(0, 0.09, 0, 0, 0, 0, 0.16, 0.04, 0.11)); p.add(capsule(0.025, 0.14), '#f2ecd8', mtx(0.2, 0.07, 0, 0, 0, Math.PI / 2)); p.add(GEO.cyl, '#f4f4f0', mtx(0, 0.01, 0, 0, 0, 0, 0.26, 0.02, 0.2)); },
  barbecue: (p) => { p.add(capsule(0.07, 0.36), '#9a4424', mtx(0, 0.08, 0, 0, 0, Math.PI / 2)); for (let i = -1; i <= 1; i++) p.add(GEO.sph, '#c66a34', mtx(i * 0.14, 0.12, 0.02, 0, 0, 0, 0.07, 0.05, 0.06)); p.add(GEO.cyl, '#d8d0b8', mtx(0, 0.08, 0, 0, 0, Math.PI / 2, 0.012, 0.66, 0.012)); },
  hamburger: (p) => { p.add(GEO.hemi, '#d8943c', mtx(0, 0.1, 0, 0, 0, 0, 0.14, 0.09, 0.14)); p.add(GEO.cyl, '#6a3a1e', mtx(0, 0.08, 0, 0, 0, 0, 0.15, 0.035, 0.15)); p.add(GEO.cyl, '#5ab04a', mtx(0, 0.1, 0, 0, 0, 0, 0.155, 0.012, 0.155)); p.add(GEO.cyl, '#d8943c', mtx(0, 0.04, 0, 0, 0, 0, 0.14, 0.05, 0.14)); },
  donut: (p) => { p.add(GEO.tor, '#d89a52', mtx(0, 0.05, 0, Math.PI / 2, 0, 0, 0.11, 0.11, 0.16)); p.add(GEO.tor, '#e86aa8', mtx(0, 0.075, 0, Math.PI / 2, 0, 0, 0.1, 0.1, 0.1)); },
  gold: (p) => { p.add(GEO.sph, '#a8743a', mtx(0, 0.12, 0, 0, 0, 0, 0.13, 0.13, 0.13)); p.add(GEO.cyl, '#7a4a24', mtx(0, 0.24, 0, 0, 0, 0, 0.05, 0.05, 0.05)); p.add(GEO.sph, '#ffd84a', mtx(0, 0.25, 0, 0, 0, 0, 0.07, 0.04, 0.07)); for (let i = 0; i < 3; i++) p.add(GEO.oct, '#ffe060', mtx(0.12 - i * 0.1, 0.03, 0.12, 0, i, 0, 0.04, 0.04, 0.04)); },
  diamond: (p) => { p.add(GEO.oct, '#9fe8ff', mtx(0, 0.18, 0, 0, 0, 0, 0.13, 0.17, 0.13)); p.add(GEO.oct, '#e6fbff', mtx(0.02, 0.22, 0.03, 0, 0.4, 0, 0.06, 0.08, 0.06)); },
  ring: (p) => { p.add(GEO.tor, '#ffd84a', mtx(0, 0.1, 0, 0, 0, 0, 0.08, 0.08, 0.08)); p.add(GEO.oct, '#ff4a6a', mtx(0, 0.19, 0, 0, 0, 0, 0.04, 0.05, 0.04)); },
  gun: (p) => { p.add(GEO.box, '#5c6068', mtx(0, 0.0, 0.1, 0, 0, 0, 0.04, 0.06, 0.24)); p.add(GEO.cyl, '#3c4048', mtx(0, 0.0, 0.03, Math.PI / 2, 0, 0, 0.045, 0.08, 0.045)); p.add(GEO.box, '#8a5a30', mtx(0, -0.07, -0.03, 0.4, 0, 0, 0.04, 0.12, 0.06)); p.add(GEO.box, '#3c4048', mtx(0, -0.035, 0.03, 0, 0, 0, 0.012, 0.03, 0.05)); },
  shotgun: (p) => { p.add(GEO.cyl, '#4a4e56', mtx(0, 0.02, 0.32, Math.PI / 2, 0, 0, 0.025, 0.64, 0.025)); p.add(GEO.box, '#8a5a30', mtx(0, -0.01, 0.2, 0, 0, 0, 0.05, 0.05, 0.2)); p.add(GEO.box, '#7a4a26', mtx(0, -0.05, -0.16, 0.25, 0, 0, 0.05, 0.1, 0.3)); p.add(GEO.box, '#3c4048', mtx(0, 0.0, 0.02, 0, 0, 0, 0.05, 0.07, 0.12)); },
  dynamite: (p) => { for (let i = -1; i <= 1; i++) p.add(GEO.cyl, '#d43a2a', mtx(i * 0.05, 0, 0, 0, 0, 0, 0.026, 0.24, 0.026)); p.add(GEO.cyl, '#2a2a2a', mtx(0, 0.03, 0, 0, 0, 0, 0.082, 0.03, 0.04)); p.add(GEO.cyl, '#e8e0c8', mtx(0, 0.15, 0, 0.4, 0, 0, 0.006, 0.08, 0.006)); },
  grenade: (p) => { p.add(GEO.sph, '#4c6a34', mtx(0, 0, 0, 0, 0, 0, 0.065, 0.085, 0.065)); for (const y of [-0.04, 0, 0.04]) p.add(GEO.cyl, '#36502a', mtx(0, y, 0, 0, 0, 0, 0.068, 0.012, 0.068)); p.add(GEO.cyl, '#9a9aa2', mtx(0, 0.09, 0, 0, 0, 0, 0.025, 0.03, 0.025)); p.add(GEO.tor, '#c0c0c8', mtx(0.03, 0.11, 0, 0, 0, 0, 0.02, 0.02, 0.02)); },
  knife: (p) => { p.add(GEO.box, '#d8dce4', mtx(0, 0, 0.14, 0, 0, 0, 0.012, 0.045, 0.24)); p.add(GEO.box, '#3a2a1e', mtx(0, 0, -0.04, 0, 0, 0, 0.03, 0.04, 0.12)); p.add(GEO.box, '#9a9aa2', mtx(0, 0, 0.02, 0, 0, 0, 0.03, 0.07, 0.015)); },
  pipe: (p) => { p.add(GEO.cyl, '#8c9098', mtx(0, 0, 0.3, Math.PI / 2, 0, 0, 0.03, 0.8, 0.03)); p.add(GEO.cyl, '#6a6e76', mtx(0, 0, -0.08, Math.PI / 2, 0, 0, 0.036, 0.06, 0.036)); },
  ammo: (p) => { p.add(GEO.box, '#6a7a3a', mtx(0, 0.07, 0, 0, 0, 0, 0.26, 0.14, 0.16)); p.add(GEO.box, '#e8c040', mtx(0, 0.15, 0, 0, 0, 0, 0.2, 0.02, 0.1)); },
  chain: (p) => { for (let i = 0; i < 10; i++) p.add(GEO.tor, '#8a8c94', mtx(0, 0, i * 0.09, 0, i % 2 ? Math.PI / 2 : 0, 0, 0.045, 0.045, 0.045)); }
};
export function itemGeo(kind) { return cachedGeo('item:' + kind, ITEM_BUILDERS[kind]); }
export function itemMesh(kind) { return meshFrom(itemGeo(kind), { thin: true }); }

// 翼龙（背景装饰，原作楼顶远景里飞过）
export function buildPtero() {
  const g = new THREE.Group();
  const bodyG = cachedGeo('ptero-body', (p) => {
    p.add(GEO.sph, '#b8603a', mtx(0, 0, 0, 0, 0, 0, 0.18, 0.16, 0.6));
    p.add(GEO.cone, '#c8743c', mtx(0, 0.05, 0.75, Math.PI / 2, 0, 0, 0.08, 0.6, 0.06));
    p.add(GEO.cone, '#a04a2a', mtx(0, 0.25, 0.4, -0.6, 0, 0, 0.05, 0.45, 0.05));
  });
  const wingG = cachedGeo('ptero-wing', (p) => { p.add(GEO.box, '#c8703e', mtx(0.75, 0, 0, 0, 0, 0, 1.5, 0.03, 0.55)); p.add(GEO.box, '#9a4a28', mtx(0.75, 0.01, 0.2, 0, 0, 0, 1.5, 0.03, 0.12)); });
  const b = meshFrom(bodyG, { thin: true, shadow: false });
  g.add(b);
  const wl = new THREE.Group(), wr = new THREE.Group();
  const ml = meshFrom(wingG, { thin: true, shadow: false }), mr = meshFrom(wingG, { thin: true, shadow: false });
  wl.add(ml); wr.add(mr); mr.scale.x = -1;
  g.add(wl, wr);
  g.userData.wings = [wl, wr];
  return g;
}

// 把一个摆好姿势的模型烘焙成单个网格（静态雕像用，省绘制次数）
export function bakeModel(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    list.push({ geo: o.geometry, m, colorAttr: true });
  });
  // 合并：几何体本身已有顶点色，这里直接拷贝
  let nv = 0, ni = 0;
  for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0; const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const it of list) {
    const g = it.geo, Pp = g.attributes.position, N = g.attributes.normal, Cc = g.attributes.color;
    nm.getNormalMatrix(it.m);
    for (let i = 0; i < Pp.count; i++) {
      v.fromBufferAttribute(Pp, i).applyMatrix4(it.m); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      const k = (vo + i) * 3; pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z; nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
      colr[k] = Cc.getX(i); colr[k + 1] = Cc.getY(i); colr[k + 2] = Cc.getZ(i);
    }
    const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; vo += Pp.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// 角色头像：离屏渲染一张小图，HUD、对话框与选人卡片共用
export function portrait(renderer, model, opts) {
  const o = opts || {};
  const size = o.size || 128;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff6e6, 0x6a5a50, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1.5, 2, 3); sc.add(d);
  const holder = new THREE.Group(); holder.add(model.root); sc.add(holder);
  model.root.updateMatrixWorld(true);
  const head = new THREE.Vector3(); model.bones.head.getWorldPosition(head);
  const full = !!o.full;
  const cam = new THREE.PerspectiveCamera(o.fov || (full ? 30 : 26), 1, 0.05, 20);
  const H = model.H || 1.8;
  if (o.camPos) { cam.position.fromArray(o.camPos); cam.lookAt(new THREE.Vector3().fromArray(o.camTgt)); }
  else if (full) { cam.position.set(H * 0.55, H * 0.62, H * 2.2); cam.lookAt(0, H * 0.5, 0); }
  else if (o.raptor) { cam.position.set(head.x + 1.0, head.y + 0.25, head.z + 0.9); cam.lookAt(head.x, head.y - 0.05, head.z + 0.2); }
  else { cam.position.set(head.x + 0.16, head.y + 0.02, head.z + 0.92); cam.lookAt(head.x, head.y - 0.07, head.z); }
  const prevRT = renderer.getRenderTarget(), prevColor = new THREE.Color(); renderer.getClearColor(prevColor); const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(o.bg !== undefined ? o.bg : 0x000000, o.bg !== undefined ? 1 : 0);
  renderer.clear();
  renderer.render(sc, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose();
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  holder.remove(model.root);
  return cv.toDataURL('image/png');
}
