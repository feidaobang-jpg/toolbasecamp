// 原创 Q 版低模模型：全部由程序化基本体拼合，顶点色 + 共享材质；模型正面朝 -Z（= 北）。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// ---------- 基本体（单位尺寸，缩放即实际尺寸） ----------
function roundedBox(seg, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = 0.5 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const cx = THREE.MathUtils.clamp(v.x, -inner, inner), cy = THREE.MathUtils.clamp(v.y, -inner, inner), cz = THREE.MathUtils.clamp(v.z, -inner, inner);
    const d = new THREE.Vector3(v.x - cx, v.y - cy, v.z - cz);
    if (d.lengthSq() > 1e-9) d.setLength(r);
    p.setXYZ(i, cx + d.x, cy + d.y, cz + d.z);
  }
  g.computeVertexNormals();
  return g;
}
function starShape(outer, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
export const BASE = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: roundedBox(2, 0.16),
  rbox2: roundedBox(2, 0.3),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  lsphere: new THREE.SphereGeometry(0.5, 8, 6),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  dode: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.4, 0.1, 6, 16),
  star: (() => { const g = new THREE.ExtrudeGeometry(starShape(0.5, 0.22), { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }); g.translate(0, 0, -0.09); g.computeVertexNormals(); return g; })()
};
for (const k in BASE) { if (!BASE[k].index) BASE[k] = BASE[k]; }

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
export function part(list, shape, color, p, s, r) {
  let g = BASE[shape].clone();
  if (g.index === null) { /* Extrude 等非索引几何保持非索引，合并前统一 */ }
  dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(s[0], s[1], s[2]);
  dummy.rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); dummy.updateMatrix();
  g.applyMatrix4(dummy.matrix);
  tmpColor.set(color);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = tmpColor.r; a[i + 1] = tmpColor.g; a[i + 2] = tmpColor.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  list.push(g);
  return g;
}
export function merged(list) {
  const flat = list.map(g => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(flat, false);
  list.forEach(g => g.dispose());
  return m;
}

export const MAT = {
  toy: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 28, specular: 0x2a2a2a }),
  flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffe36b, transparent: true, opacity: 0.55, depthWrite: false }),
  shadowBlob: null
};
// 接地软阴影贴片（流畅档或小物体使用）
{
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(20,40,30,0.42)'); gr.addColorStop(1, 'rgba(20,40,30,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  MAT.shadowBlob = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
}
const blobGeo = new THREE.PlaneGeometry(1, 1);
export function blob(w, d) {
  const m = new THREE.Mesh(blobGeo, MAT.shadowBlob);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.scale.set(w, d, 1); m.renderOrder = 1;
  return m;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
export function mesh(geo, mat, shadow) {
  const m = new THREE.Mesh(geo, mat || MAT.toy);
  m.castShadow = shadow !== false; m.receiveShadow = false;
  return m;
}

// ---------- 调色板 ----------
export const C = {
  olive: 0x6e9a4f, oliveL: 0x8cb866, oliveD: 0x4d7238, cream: 0xfff1d0, dark: 0x2f3a40, tire: 0x33393d,
  skin: 0xffcfa6, helmetG: 0x5d8a45, glass: 0x9fe0f0, yellow: 0xffd34d, wood: 0xb7804f, woodD: 0x8a5a36,
  red: 0xd4553f, redD: 0x9b3b2f, rust: 0xb8603f, gray: 0x8e989e, grayL: 0xc9cfd1, stone: 0xd2c8ad, stoneD: 0xa99f86,
  sand: 0xe7cf92, khaki: 0xb39b62, khakiD: 0x7f6c41, blue: 0x4f86d9, blueD: 0x35609e, brown: 0x9a6236, brownD: 0x6b4122,
  enemy: 0xc9583f, enemyD: 0x8e3a2a, helmetE: 0x5f6870, pow: 0xf6efdc, powPants: 0x88add6, gold: 0xffc93d
};

// ---------- Q 版小人（头大身小） ----------
function chibiHead(b, x, y, z, s, helmet, helmetColor) {
  part(b, 'sphere', C.skin, [x, y, z], [0.62 * s, 0.6 * s, 0.58 * s]);
  part(b, 'sphere', 0x2b2b2b, [x - 0.12 * s, y + 0.02 * s, z - 0.27 * s], [0.07 * s, 0.11 * s, 0.05 * s]);
  part(b, 'sphere', 0x2b2b2b, [x + 0.12 * s, y + 0.02 * s, z - 0.27 * s], [0.07 * s, 0.11 * s, 0.05 * s]);
  part(b, 'sphere', 0xff9f8a, [x - 0.2 * s, y - 0.09 * s, z - 0.22 * s], [0.1 * s, 0.05 * s, 0.04 * s]);
  part(b, 'sphere', 0xff9f8a, [x + 0.2 * s, y - 0.09 * s, z - 0.22 * s], [0.1 * s, 0.05 * s, 0.04 * s]);
  if (helmet === 'helmet') {
    part(b, 'sphere', helmetColor, [x, y + 0.14 * s, z + 0.02 * s], [0.7 * s, 0.5 * s, 0.68 * s]);
    part(b, 'cyl', helmetColor, [x, y + 0.07 * s, z], [0.76 * s, 0.06 * s, 0.74 * s]);
  } else if (helmet === 'cap') {
    part(b, 'cyl', helmetColor, [x, y + 0.24 * s, z], [0.62 * s, 0.2 * s, 0.62 * s]);
    part(b, 'box', 0x2b2b2b, [x, y + 0.16 * s, z - 0.32 * s], [0.4 * s, 0.04 * s, 0.18 * s]);
    part(b, 'sphere', C.gold, [x, y + 0.27 * s, z - 0.3 * s], [0.12 * s, 0.12 * s, 0.05 * s]);
  } else if (helmet === 'hair') {
    part(b, 'sphere', 0x6b4a2e, [x, y + 0.13 * s, z + 0.05 * s], [0.64 * s, 0.45 * s, 0.6 * s]);
  } else if (helmet === 'band') {
    part(b, 'sphere', 0x5b3c22, [x, y + 0.13 * s, z + 0.05 * s], [0.64 * s, 0.45 * s, 0.6 * s]);
    part(b, 'cyl', 0xe8e1c8, [x, y + 0.12 * s, z], [0.66 * s, 0.08 * s, 0.64 * s]);
  }
}

// 玩家吉普：返回 { root, body, turret, wheels[], riders[] }
export function makeJeep() {
  const bodyGeo = cached('jeepBody', () => {
    const b = [];
    part(b, 'rbox', C.olive, [0, 0.62, 0.05], [1.5, 0.5, 2.5]);
    part(b, 'rbox', C.oliveL, [0, 0.9, -0.72], [1.36, 0.24, 0.95]);
    part(b, 'cyl', C.cream, [0, 1.03, -0.72], [0.52, 0.02, 0.52]);
    part(b, 'box', C.dark, [0, 0.66, -1.24], [1.08, 0.34, 0.08]);
    for (const s of [-1, 1]) {
      part(b, 'sphere', C.yellow, [s * 0.48, 0.8, -1.26], [0.24, 0.24, 0.12]);
      part(b, 'rbox', C.oliveD, [s * 0.76, 0.78, -0.82], [0.3, 0.16, 0.86]);
      part(b, 'rbox', C.oliveD, [s * 0.76, 0.78, 0.86], [0.3, 0.16, 0.8]);
      part(b, 'rbox', 0x7a5638, [s * 0.34, 0.92, 0.12], [0.5, 0.2, 0.5]);
      part(b, 'rbox', 0x7a5638, [s * 0.34, 1.14, 0.36], [0.5, 0.42, 0.14]);
    }
    part(b, 'rbox', C.dark, [0, 0.4, -1.32], [1.62, 0.18, 0.16]);
    part(b, 'rbox', C.dark, [0, 0.4, 1.33], [1.5, 0.18, 0.14]);
    part(b, 'box', C.dark, [0, 1.2, -0.28], [1.36, 0.06, 0.06]);
    for (const s of [-1, 1]) part(b, 'box', C.dark, [s * 0.66, 1.0, -0.28], [0.06, 0.46, 0.06]);
    part(b, 'box', C.glass, [0, 1.0, -0.27], [1.22, 0.34, 0.03]);
    part(b, 'rbox', C.oliveD, [0, 0.95, 0.88], [1.42, 0.24, 0.84]);
    part(b, 'cyl', C.tire, [0, 0.82, 1.38], [0.62, 0.22, 0.62], [Math.PI / 2, 0, 0]);
    part(b, 'cyl', C.grayL, [0, 0.82, 1.48], [0.24, 0.04, 0.24], [Math.PI / 2, 0, 0]);
    // 车头右侧的榴弹发射筒
    part(b, 'cyl', C.dark, [0.58, 1.02, -0.5], [0.2, 0.7, 0.2], [Math.PI / 2 - 0.25, 0, 0]);
    // 驾驶员
    part(b, 'rbox', C.olive, [-0.34, 1.18, 0.12], [0.5, 0.42, 0.38]);
    chibiHead(b, -0.34, 1.62, 0.1, 0.9, 'helmet', C.helmetG);
    return merged(b);
  });
  const wheelGeo = cached('jeepWheel', () => {
    const b = [];
    part(b, 'cyl', C.tire, [0, 0, 0], [0.74, 0.36, 0.74], [0, 0, Math.PI / 2]);
    part(b, 'cyl', C.cream, [0, 0, 0], [0.34, 0.38, 0.34], [0, 0, Math.PI / 2]);
    return merged(b);
  });
  const turretGeo = cached('jeepTurret', () => {
    const b = [];
    part(b, 'cyl', C.dark, [0, 1.25, 0], [0.18, 0.5, 0.18]);
    part(b, 'rbox', C.dark, [0, 1.55, 0], [0.32, 0.26, 0.6]);
    part(b, 'cyl', C.dark, [0, 1.58, -0.62], [0.11, 0.9, 0.11], [Math.PI / 2, 0, 0]);
    part(b, 'cyl', C.dark, [0, 1.58, -1.06], [0.17, 0.1, 0.17], [Math.PI / 2, 0, 0]);
    part(b, 'rbox', 0x8a6a3a, [0.26, 1.46, 0.05], [0.18, 0.24, 0.3]);
    // 机枪手
    part(b, 'rbox', C.olive, [0, 1.5, 0.42], [0.5, 0.5, 0.38]);
    part(b, 'sphere', C.olive, [-0.24, 1.55, 0.18], [0.2, 0.2, 0.34]);
    part(b, 'sphere', C.olive, [0.24, 1.55, 0.18], [0.2, 0.2, 0.34]);
    chibiHead(b, 0, 1.98, 0.42, 0.92, 'helmet', C.helmetG);
    return merged(b);
  });
  const riderGeo = cached('jeepRider', () => {
    const b = [];
    part(b, 'rbox', C.pow, [0, 1.15, 0], [0.4, 0.34, 0.3]);
    chibiHead(b, 0, 1.5, 0, 0.72, 'hair');
    return merged(b);
  });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const bm = mesh(bodyGeo); body.add(bm);
  const wheels = [];
  for (const [x, z] of [[-0.78, -0.82], [0.78, -0.82], [-0.78, 0.86], [0.78, 0.86]]) {
    const w = mesh(wheelGeo); w.position.set(x, 0.4, z); body.add(w); wheels.push(w);
  }
  const turret = new THREE.Group(); turret.position.set(0, 0, 0.82); root.add(turret);
  turret.add(mesh(turretGeo));
  const riders = [];
  for (const [x, z] of [[-0.38, 1.0], [0.38, 1.0], [0.42, 0.55]]) {
    const r = mesh(riderGeo); r.position.set(x, -0.1, z); r.visible = false; body.add(r); riders.push(r);
  }
  root.add(blob(2.4, 3.2));
  return { root, body, turret, wheels, riders };
}

// 敌兵（soldier / officer / guard）
export function makeSoldier(kind) {
  const officer = kind === 'officer';
  const key = 'soldier-' + (officer ? 'o' : 's');
  const g = cached(key, () => {
    const b = [], legs = [];
    const coat = officer ? 0x7d2f26 : C.enemy, coatD = officer ? 0x5a1f19 : C.enemyD;
    part(b, 'rbox', coat, [0, 0.78, 0], [0.62, 0.56, 0.46]);
    part(b, 'box', 0x3a2a20, [0, 0.58, 0], [0.64, 0.1, 0.48]);
    part(b, 'sphere', C.gold, [0, 0.58, -0.25], [0.12, 0.1, 0.05]);
    if (officer) for (const y of [0.72, 0.88]) part(b, 'sphere', C.gold, [0, y, -0.24], [0.07, 0.07, 0.04]);
    for (const s of [-1, 1]) {
      part(b, 'sphere', coat, [s * 0.38, 0.86, -0.04], [0.22, 0.22, 0.22]);
      part(b, 'sphere', coatD, [s * 0.36, 0.7, -0.2], [0.18, 0.2, 0.22]);
      part(b, 'sphere', C.skin, [s * 0.3, 0.64, -0.36], [0.14, 0.14, 0.14]);
      const l = [];
      part(l, 'rbox', 0x4a4038, [s * 0.16, 0.26, 0], [0.22, 0.4, 0.24]);
      part(l, 'rbox', 0x2b2622, [s * 0.16, 0.08, -0.04], [0.26, 0.16, 0.34]);
      legs.push(merged(l));
    }
    chibiHead(b, 0, 1.32, 0, 1.0, officer ? 'cap' : 'helmet', officer ? C.redD : C.helmetE);
    // 步枪 / 手枪
    if (officer) part(b, 'box', 0x2b2b2b, [0.3, 0.66, -0.5], [0.08, 0.1, 0.3]);
    else { part(b, 'box', 0x2b2b2b, [0.22, 0.68, -0.5], [0.08, 0.1, 0.9]); part(b, 'box', C.woodD, [0.22, 0.64, -0.08], [0.1, 0.16, 0.3]); }
    return { body: merged(b), legs };
  });
  const root = new THREE.Group();
  const body = mesh(g.body); root.add(body);
  const legs = g.legs.map((lg, i) => { const m = mesh(lg); m.position.y = 0; root.add(m); return m; });
  root.add(blob(1.1, 1.1));
  return { root, body, legs };
}

// 俘虏（普通 / 闪光）
export function makePow(flash) {
  const g = cached('pow-' + (flash ? 'f' : 'n'), () => {
    const b = [], arms = [];
    const shirt = flash ? C.gold : C.pow;
    part(b, 'rbox', shirt, [0, 0.74, 0], [0.56, 0.52, 0.42]);
    for (const s of [-1, 1]) {
      part(b, 'rbox', C.powPants, [s * 0.15, 0.27, 0], [0.22, 0.44, 0.24]);
      part(b, 'rbox', 0x6b5038, [s * 0.15, 0.07, -0.04], [0.24, 0.14, 0.32]);
      const a = [];
      part(a, 'rbox', shirt, [s * 0.36, 0.25, 0], [0.18, 0.5, 0.18]);
      part(a, 'sphere', C.skin, [s * 0.36, 0.54, 0], [0.18, 0.18, 0.18]);
      arms.push(merged(a));
    }
    chibiHead(b, 0, 1.25, 0, 0.98, 'band');
    return { body: merged(b), arms };
  });
  const root = new THREE.Group();
  const body = mesh(g.body); root.add(body);
  const arms = g.arms.map((ag, i) => { const m = mesh(ag); m.position.set(0, 0.8, 0); root.add(m); return m; });
  let star = null, ring = null;
  if (flash) {
    star = mesh(cached('powStar', () => { const b = []; part(b, 'star', C.gold, [0, 0, 0], [0.7, 0.7, 0.7]); return merged(b); }), MAT.toy, false);
    star.position.y = 2.25; root.add(star);
    ring = new THREE.Mesh(cached('ringGeo', () => new THREE.RingGeometry(0.55, 0.85, 24)), MAT.glow);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; root.add(ring);
  }
  root.add(blob(1, 1));
  return { root, body, arms, star, ring };
}

// 敌方坦克（普通：卡其；Boss：蓝 → 受损后棕）
function tankGeos(paint, paintD, stripe, scale) {
  const hull = [], tur = [];
  part(hull, 'rbox', paint, [0, 0.72, 0], [2.0, 0.62, 2.9]);
  part(hull, 'rbox', paintD, [0, 1.0, 0.2], [1.7, 0.18, 2.2]);
  for (const s of [-1, 1]) {
    part(hull, 'rbox2', 0x3b3f42, [s * 1.12, 0.48, 0], [0.62, 0.78, 3.2]);
    for (let k = -1; k <= 1; k++) part(hull, 'cyl', 0x6d7377, [s * 1.12, 0.46, k * 0.95], [0.5, 0.66, 0.5], [0, 0, Math.PI / 2]);
    part(hull, 'box', paintD, [s * 1.12, 0.9, 0], [0.7, 0.08, 3.1]);
  }
  part(hull, 'sphere', 0xffd977, [-0.55, 0.92, -1.42], [0.2, 0.2, 0.1]);
  part(hull, 'sphere', 0xffd977, [0.55, 0.92, -1.42], [0.2, 0.2, 0.1]);
  part(tur, 'rbox2', paint, [0, 1.38, 0.1], [1.34, 0.62, 1.5]);
  part(tur, 'box', stripe, [0, 1.38, 0.1], [1.38, 0.14, 1.54]);
  part(tur, 'cyl', paintD, [0, 1.74, 0.35], [0.5, 0.16, 0.5]);
  part(tur, 'cyl', 0x3b3f42, [0, 1.38, -1.25], [0.22, 1.7, 0.22], [Math.PI / 2, 0, 0]);
  part(tur, 'cyl', 0x3b3f42, [0, 1.38, -2.1], [0.32, 0.22, 0.32], [Math.PI / 2, 0, 0]);
  const h = merged(hull), t = merged(tur);
  if (scale !== 1) { h.scale(scale, scale, scale); t.scale(scale, scale, scale); }
  return { hull: h, tur: t };
}
export function makeTank(variant) {
  const sets = {
    normal: () => cached('tank-n', () => tankGeos(C.khaki, C.khakiD, C.red, 1)),
    blue: () => cached('tank-b', () => tankGeos(C.blue, C.blueD, C.cream, 1.18)),
    brown: () => cached('tank-r', () => tankGeos(C.brown, C.brownD, C.cream, 1.18))
  };
  const g = sets[variant]();
  const root = new THREE.Group();
  const hull = mesh(g.hull); root.add(hull);
  const turret = new THREE.Group(); root.add(turret);
  const tm = mesh(g.tur); turret.add(tm);
  const sc = variant === 'normal' ? 1 : 1.18;
  root.add(blob(3.2 * sc, 4 * sc));
  return {
    root, hull, turret, tm,
    setVariant(v) { const ng = sets[v](); hull.geometry = ng.hull; tm.geometry = ng.tur; }
  };
}

// 炮台（地面混凝土或崖顶）
export function makeCannon() {
  const g = cached('cannon', () => {
    const base = [], tur = [];
    part(base, 'cyl6', C.grayL, [0, 0.4, 0], [2.6, 0.8, 2.6]);
    part(base, 'cyl6', C.gray, [0, 0.82, 0], [2.2, 0.08, 2.2]);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; part(base, 'rbox', C.sand, [Math.sin(a) * 1.3, 0.35, Math.cos(a) * 1.3], [0.9, 0.45, 0.5], [0, a, 0]); }
    part(tur, 'sphere', C.redD, [0, 1.05, 0], [1.4, 1.0, 1.4]);
    part(tur, 'cyl', 0x3b3f42, [0, 1.2, -1.15], [0.34, 1.6, 0.34], [Math.PI / 2, 0, 0]);
    part(tur, 'cyl', 0x3b3f42, [0, 1.2, -1.95], [0.46, 0.22, 0.46], [Math.PI / 2, 0, 0]);
    part(tur, 'box', C.yellow, [0, 1.42, 0.3], [0.5, 0.08, 0.5]);
    return { base: merged(base), tur: merged(tur) };
  });
  const root = new THREE.Group();
  root.add(mesh(g.base));
  const turret = new THREE.Group(); root.add(turret); turret.add(mesh(g.tur));
  root.add(blob(3, 3));
  return { root, turret };
}

// 机枪巢：沙袋环 + 机枪手
export function makeNest() {
  const g = cached('nest', () => {
    const b = [], tur = [];
    for (let k = 0; k < 9; k++) { const a = k * Math.PI * 2 / 9; part(b, 'rbox2', k % 2 ? C.sand : 0xd9bf82, [Math.sin(a) * 1.05, 0.28, Math.cos(a) * 1.05], [0.78, 0.5, 0.46], [0, a, 0]); }
    for (let k = 0; k < 7; k++) { const a = k * Math.PI * 2 / 7 + 0.3; part(b, 'rbox2', 0xe1c98e, [Math.sin(a) * 0.95, 0.66, Math.cos(a) * 0.95], [0.7, 0.36, 0.42], [0, a, 0]); }
    part(tur, 'rbox', C.enemy, [0, 0.8, 0.1], [0.5, 0.36, 0.4]);
    chibiHead(tur, 0, 1.12, 0.1, 0.85, 'helmet', C.helmetE);
    part(tur, 'cyl', 0x2b2b2b, [0, 0.92, -0.55], [0.1, 0.9, 0.1], [Math.PI / 2, 0, 0]);
    part(tur, 'rbox', 0x2b2b2b, [0, 0.9, -0.15], [0.26, 0.2, 0.42]);
    return { base: merged(b), tur: merged(tur) };
  });
  const root = new THREE.Group();
  root.add(mesh(g.base));
  const turret = new THREE.Group(); root.add(turret); turret.add(mesh(g.tur));
  root.add(blob(2.8, 2.8));
  return { root, turret };
}

// 炮艇
export function makeBoat() {
  const g = cached('boat', () => {
    const b = [], tur = [];
    part(b, 'rbox', 0x8c5145, [0, 0.25, 0.2], [1.7, 0.6, 3.0]);
    part(b, 'cone4', 0x8c5145, [0, 0.25, -1.6], [1.7, 1.0, 0.6], [-Math.PI / 2, Math.PI / 4, 0]);
    part(b, 'box', C.cream, [0, 0.56, 0.2], [1.72, 0.08, 3.02]);
    part(b, 'rbox', C.cream, [0, 0.95, 0.65], [1.0, 0.7, 1.1]);
    part(b, 'box', C.glass, [0, 1.05, 0.08], [0.8, 0.26, 0.04]);
    part(b, 'cyl', C.red, [0, 1.42, 0.8], [0.12, 0.6, 0.12]);
    part(tur, 'cyl', C.gray, [0, 0.72, 0], [0.6, 0.3, 0.6]);
    part(tur, 'cyl', 0x3b3f42, [0, 0.82, -0.55], [0.16, 0.9, 0.16], [Math.PI / 2, 0, 0]);
    return { hull: merged(b), tur: merged(tur) };
  });
  const root = new THREE.Group();
  root.add(mesh(g.hull));
  const turret = new THREE.Group(); turret.position.z = -0.9; root.add(turret); turret.add(mesh(g.tur));
  const wake = new THREE.Mesh(cached('wakeGeo', () => new THREE.CircleGeometry(0.5, 16)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.02, 1.9); wake.scale.set(1.6, 2.4, 1); root.add(wake);
  return { root, turret, wake };
}

// 营房 / 俘虏屋（带铁栏窗）
export function hutGeo(w, d, ruined) {
  return cached('hut-' + w + 'x' + d + (ruined ? 'r' : ''), () => {
    const b = [];
    if (!ruined) {
      part(b, 'rbox', C.wood, [0, 0.9, 0], [w, 1.8, d]);
      part(b, 'box', C.woodD, [0, 0.12, 0], [w + 0.1, 0.24, d + 0.1]);
      for (let k = -1; k <= 1; k += 2) part(b, 'box', C.woodD, [k * (w / 2 - 0.15), 0.9, -d / 2 - 0.02], [0.18, 1.8, 0.06]);
      part(b, 'cone4', C.red, [0, 2.35, 0], [w * 1.38, 1.2, d * 1.38], [0, Math.PI / 4, 0]);
      part(b, 'box', C.redD, [0, 1.82, 0], [w + 0.4, 0.14, d + 0.4]);
      part(b, 'rbox', 0x5a3a22, [0, 0.65, -d / 2 - 0.03], [0.9, 1.2, 0.08]);
      for (const s of [-1, 1]) {
        const x = s * w * 0.28;
        part(b, 'box', 0x3a2a1c, [x, 1.1, -d / 2 - 0.03], [0.8, 0.6, 0.06]);
        for (let k = -1; k <= 1; k++) part(b, 'box', C.grayL, [x + k * 0.22, 1.1, -d / 2 - 0.07], [0.06, 0.6, 0.06]);
      }
    } else {
      const r = [[-0.3, 0.4], [0.4, -0.3], [0.1, 0.2], [-0.4, -0.35], [0.45, 0.4]];
      r.forEach(([ax, az], k) => part(b, 'rbox', k % 2 ? C.woodD : 0x5b4030, [ax * w, 0.22, az * d], [w * 0.36, 0.4, d * 0.3], [0, k * 0.7, k % 2 ? 0.2 : -0.15]));
      part(b, 'box', C.redD, [0.1 * w, 0.2, 0], [w * 0.5, 0.12, d * 0.4], [0.2, 0.5, 0.1]);
      for (let k = 0; k < 4; k++) part(b, 'box', 0x3a2a1c, [(k - 1.5) * w * 0.2, 0.1, (k % 2 - 0.5) * d * 0.5], [0.16, 0.16, 1.1], [0, k * 0.9, 0]);
    }
    return merged(b);
  });
}
export function gateGeo(ruined) {
  return cached('gate' + (ruined ? 'r' : ''), () => {
    const b = [];
    if (!ruined) {
      for (const s of [-1, 1]) {
        part(b, 'rbox', C.wood, [s * 1.5, 1.2, 0], [2.96, 2.4, 0.6]);
        for (const y of [0.6, 1.8]) part(b, 'box', C.dark, [s * 1.5, y, -0.32], [2.9, 0.16, 0.06]);
        part(b, 'cyl', C.grayL, [s * 0.3, 1.2, -0.34], [0.16, 0.06, 0.16], [Math.PI / 2, 0, 0]);
      }
      part(b, 'box', C.redD, [0, 2.6, 0], [6.4, 0.3, 0.9]);
    } else {
      for (let k = 0; k < 6; k++) part(b, 'box', k % 2 ? C.wood : C.woodD, [(k - 2.5) * 0.9, 0.12, (k % 3 - 1) * 0.4], [0.5, 0.18, 1.6], [0, k * 0.6 - 1, 0]);
    }
    return merged(b);
  });
}
export function barrelGeo() {
  return cached('barrel', () => {
    const b = [];
    part(b, 'cyl', C.red, [0, 0.5, 0], [0.8, 1.0, 0.8]);
    for (const y of [0.2, 0.8]) part(b, 'cyl', 0x7a2a20, [0, y, 0], [0.84, 0.08, 0.84]);
    part(b, 'cyl', C.yellow, [0, 0.5, 0], [0.82, 0.16, 0.82]);
    return merged(b);
  });
}
export function sandbagGeo(w) {
  return cached('sandbag' + w, () => {
    const b = [];
    for (let row = 0; row < 2; row++) for (let k = 0; k < w * 2; k++) {
      const x = -w / 2 + 0.25 + k * 0.5 + (row ? 0.25 : 0);
      if (x > w / 2 - 0.2) continue;
      part(b, 'rbox2', (k + row) % 2 ? C.sand : 0xd9bf82, [x, 0.22 + row * 0.38, 0], [0.56, 0.4, 0.8]);
    }
    return merged(b);
  });
}
export function crateGeo() {
  return cached('crate', () => {
    const b = [];
    part(b, 'rbox', 0xc7955a, [0, 0.45, 0], [0.9, 0.9, 0.9]);
    part(b, 'box', C.woodD, [0, 0.45, 0], [0.94, 0.12, 0.94]);
    part(b, 'box', C.woodD, [0, 0.45, 0], [0.12, 0.94, 0.94]);
    return merged(b);
  });
}

// 救援直升机（友军）
export function makeHeli() {
  const g = cached('heli', () => {
    const b = [], rot = [], tail = [];
    part(b, 'sphere', 0x6f9e5a, [0, 1.6, 0], [2.4, 2.0, 3.2]);
    part(b, 'sphere', C.glass, [0, 1.85, -1.05], [1.7, 1.2, 1.3]);
    part(b, 'sphere', C.cream, [0, 1.25, 0.1], [2.2, 0.9, 2.6]);
    part(b, 'cyl', 0x6f9e5a, [0, 1.9, 2.6], [0.5, 3.2, 0.5], [Math.PI / 2 + 0.06, 0, 0]);
    part(b, 'rbox', 0x6f9e5a, [0, 2.6, 4.1], [0.18, 1.3, 0.8]);
    part(b, 'rbox', C.cream, [0, 2.2, 4.0], [1.4, 0.12, 0.5]);
    part(b, 'cyl', C.red, [1.21, 1.6, 0.2], [0.7, 0.04, 0.7], [0, 0, Math.PI / 2]);
    part(b, 'box', C.cream, [1.23, 1.6, 0.2], [0.04, 0.42, 0.12]);
    part(b, 'box', C.cream, [1.23, 1.6, 0.2], [0.04, 0.12, 0.42]);
    for (const s of [-1, 1]) {
      part(b, 'cyl', C.dark, [s * 1.0, 0.12, 0], [0.12, 3.0, 0.12], [Math.PI / 2, 0, 0]);
      part(b, 'cyl', C.dark, [s * 0.85, 0.5, -0.8], [0.08, 0.8, 0.08], [0, 0, s * 0.35]);
      part(b, 'cyl', C.dark, [s * 0.85, 0.5, 0.8], [0.08, 0.8, 0.08], [0, 0, s * 0.35]);
    }
    part(b, 'cyl', C.dark, [0, 2.75, 0], [0.24, 0.5, 0.24]);
    part(rot, 'box', 0x3b3f42, [0, 0, 0], [7.2, 0.06, 0.32]);
    part(rot, 'box', 0x3b3f42, [0, 0, 0], [0.32, 0.06, 7.2]);
    part(rot, 'cyl', C.gray, [0, 0.05, 0], [0.4, 0.14, 0.4]);
    part(tail, 'box', 0x3b3f42, [0, 0, 0], [0.06, 1.3, 0.16]);
    return { body: merged(b), rot: merged(rot), tail: merged(tail) };
  });
  const root = new THREE.Group();
  root.add(mesh(g.body));
  const rotor = mesh(g.rot); rotor.position.y = 3.02; root.add(rotor);
  const tail = mesh(g.tail); tail.position.set(0.18, 2.6, 4.35); root.add(tail);
  const shadow = blob(4, 5.5); root.add(shadow);
  return { root, rotor, tail, shadow };
}

// 登陆艇（开场用）
export function makeLandingCraft() {
  const b = [];
  part(b, 'rbox', 0x7d8a96, [0, 0.4, 0.4], [3.4, 1.4, 4.6]);
  part(b, 'box', 0x5d6a76, [0, 0.95, 0.4], [3.0, 0.2, 4.2]);
  part(b, 'box', 0x5d6a76, [0, 0.1, -2.4], [3.0, 0.2, 1.4], [0.35, 0, 0]);
  part(b, 'rbox', C.cream, [0, 1.5, 2.2], [1.2, 1.0, 0.8]);
  const m = mesh(merged(b));
  return m;
}

export function makeStar() {
  const root = new THREE.Group();
  const s = mesh(cached('starBig', () => { const b = []; part(b, 'star', C.gold, [0, 0, 0], [1.3, 1.3, 1.3]); return merged(b); }), MAT.toy, false);
  s.position.y = 1.2; root.add(s);
  const ring = new THREE.Mesh(cached('ringGeo2', () => new THREE.RingGeometry(0.8, 1.2, 24)), MAT.glow);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; root.add(ring);
  return { root, star: s, ring };
}

// 修理包：黄色工具箱 + 银色扳手（不用红十字等受保护标志）
export function makeRepairKit() {
  const g = cached('repairKit', () => {
    const b = [];
    part(b, 'rbox', 0xf2c13d, [0, 0, 0], [0.9, 0.55, 0.6]);
    part(b, 'box', 0xc98f1e, [0, 0.02, 0], [0.92, 0.08, 0.62]);
    part(b, 'cyl', 0x3b3f42, [-0.22, 0.38, 0], [0.08, 0.22, 0.08]);
    part(b, 'cyl', 0x3b3f42, [0.22, 0.38, 0], [0.08, 0.22, 0.08]);
    part(b, 'cyl', 0x3b3f42, [0, 0.5, 0], [0.08, 0.5, 0.08], [0, 0, Math.PI / 2]);
    part(b, 'box', 0xdfe6ea, [0, 0.05, -0.31], [0.5, 0.1, 0.04], [0, 0, 0.6]);
    part(b, 'torus', 0xdfe6ea, [0.2, 0.18, -0.31], [0.35, 0.35, 0.35]);
    part(b, 'torus', 0xdfe6ea, [-0.2, -0.1, -0.31], [0.35, 0.35, 0.35]);
    return merged(b);
  });
  const root = new THREE.Group();
  const box = mesh(g); box.position.y = 0.75; root.add(box);
  const ring = new THREE.Mesh(cached('kitRing', () => new THREE.RingGeometry(0.7, 1.0, 24)), cached('kitRingMat', () => new THREE.MeshBasicMaterial({ color: 0x8ef09a, transparent: true, opacity: 0.55, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; root.add(ring);
  root.add(blob(1.2, 1.2));
  return { root, box, ring };
}
