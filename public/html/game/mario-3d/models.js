// 角色与道具的程序化低模：采用赤色要塞式哑光低模造型（球体/方块/圆柱组合，不使用原作素材文件）。
import * as THREE from './three.js?v=2.1.0';

const sphere = new THREE.IcosahedronGeometry(1, 1);
const halfSphere = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const cube = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const shared = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!shared.has(k)) shared.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.88, flatShading: true }, opts)));
  return shared.get(k);
}
function add(parent, geo, material, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}
const ball = (p, m, x, y, z, sx, sy = sx, sz = sx) => add(p, sphere, m, x, y, z, sx, sy, sz);
const box = (p, m, x, y, z, sx, sy, sz) => add(p, cube, m, x, y, z, sx, sy, sz);

// ---------- 玛丽 ----------
export const MARIO_COLORS = {
  normal: { cap: '#ad5544', overalls: '#54778b' },
  fire: { cap: '#f6f2ea', overalls: '#ad5544' }
};
function buildMario(big, mats) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const legH = big ? 0.6 : 0.24, torsoH = big ? 0.56 : 0.27, headR = big ? 0.29 : 0.235, wid = big ? 1.12 : 1;
  const skin = mat('#f6c08a'), hair = mat('#5a3214'), shoe = mat('#6b3a12'), glove = mat('#fbfbf6'), eye = mat('#1b2a44'), button = mat('#ffd23a', { roughness: 0.3 });
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.1 * wid, legH, 0); body.add(leg);
    box(leg, mats.overalls, 0, -legH * 0.42, 0, 0.15 * wid, legH * 0.75, 0.16);
    ball(leg, shoe, 0, -legH + 0.06, 0.05, 0.11 * wid, 0.07, 0.15);
    legs.push(leg);
  }
  const torsoY = legH + torsoH * 0.5;
  ball(body, mats.overalls, 0, legH + torsoH * 0.3, 0, 0.2 * wid, torsoH * 0.55, 0.17);
  ball(body, mats.cap, 0, legH + torsoH * 0.78, -0.01, 0.19 * wid, torsoH * 0.42, 0.16);
  for (const s of [-1, 1]) {
    box(body, mats.overalls, s * 0.085 * wid, legH + torsoH * 0.78, 0.13, 0.05, torsoH * 0.5, 0.04);
    ball(body, button, s * 0.085 * wid, legH + torsoH * 0.62, 0.165, 0.028);
    const arm = new THREE.Group(); arm.position.set(s * 0.21 * wid, legH + torsoH * 0.82, 0); body.add(arm);
    ball(arm, mats.cap, s * 0.02, -torsoH * 0.2, 0, 0.075 * wid, torsoH * 0.32, 0.075);
    ball(arm, glove, s * 0.03, -torsoH * 0.55, 0.02, 0.085 * wid);
    arms.push(arm);
  }
  const head = new THREE.Group(); head.position.set(0, legH + torsoH + headR * 0.8, 0); body.add(head);
  ball(head, skin, 0, 0, 0, headR, headR * 0.95, headR * 0.92);
  ball(head, hair, 0, -0.02, -headR * 0.35, headR * 0.95, headR * 0.8, headR * 0.7);
  ball(head, skin, 0, -headR * 0.05, headR * 0.9, headR * 0.3, headR * 0.27, headR * 0.3);
  box(head, hair, 0, -headR * 0.38, headR * 0.82, headR * 0.95, headR * 0.17, headR * 0.16);
  for (const s of [-1, 1]) {
    ball(head, eye, s * headR * 0.3, headR * 0.22, headR * 0.83, headR * 0.09, headR * 0.17, headR * 0.06);
    ball(head, skin, s * headR * 0.95, 0, 0, headR * 0.16, headR * 0.22, headR * 0.14);
  }
  add(head, halfSphere, mats.cap, 0, headR * 0.28, -headR * 0.04, headR * 1.03, headR * 0.72, headR);
  box(head, mats.cap, 0, headR * 0.3, headR * 0.82, headR * 1.3, headR * 0.12, headR * 0.6);
  ball(head, glove, 0, headR * 0.62, headR * 0.78, headR * 0.24, headR * 0.2, headR * 0.06);
  g.userData = { body, legs, arms, head, legH, height: legH + torsoH + headR * 1.9 };
  return g;
}
export function mario() {
  const mats = { cap: new THREE.MeshStandardMaterial({ color: MARIO_COLORS.normal.cap, roughness: 0.88, flatShading: true }), overalls: new THREE.MeshStandardMaterial({ color: MARIO_COLORS.normal.overalls, roughness: 0.88, flatShading: true }) };
  const root = new THREE.Group();
  const small = buildMario(false, mats), big = buildMario(true, mats);
  root.add(small, big);
  return { root, small, big, mats };
}

// ---------- 敌人 ----------
export function goomba(theme) {
  const under = theme === 'underground';
  const g = new THREE.Group();
  const capM = mat(under ? '#2e6f87' : '#a4561f'), face = mat(under ? '#9fd6e0' : '#f2c895'), foot = mat(under ? '#163848' : '#3c2412');
  ball(g, capM, 0, 0.55, 0, 0.46, 0.33, 0.42);
  ball(g, face, 0, 0.3, 0.02, 0.26, 0.2, 0.25);
  for (const s of [-1, 1]) {
    ball(g, foot, s * 0.18, 0.08, 0.05, 0.17, 0.08, 0.2);
    ball(g, mat('#fbfbf2'), s * 0.13, 0.55, 0.32, 0.1, 0.13, 0.05);
    ball(g, mat('#1a1a1a'), s * 0.11, 0.53, 0.36, 0.045, 0.075, 0.02);
    const brow = box(g, foot, s * 0.15, 0.68, 0.33, 0.2, 0.05, 0.04); brow.rotation.z = s * 0.35;
  }
  box(g, mat('#fbfbf2'), -0.07, 0.36, 0.25, 0.04, 0.06, 0.02); box(g, mat('#fbfbf2'), 0.07, 0.36, 0.25, 0.04, 0.06, 0.02);
  return g;
}
export function koopa(red) {
  const g = new THREE.Group();
  const shellM = mat(red ? '#ab5947' : '#668762'), rim = mat('#f8f4e0'), skin = mat('#f6d27a'), dark = mat(red ? '#8c1c0c' : '#14701e');
  const shell = new THREE.Group(); g.add(shell);
  add(shell, halfSphere, shellM, 0, 0.32, 0, 0.42, 0.42, 0.46);
  add(shell, cyl, rim, 0, 0.3, 0, 0.44, 0.07, 0.48);
  ball(shell, rim, 0, 0.27, 0, 0.4, 0.12, 0.44);
  for (const [x, z] of [[0, 0], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) ball(shell, dark, x, 0.66 - Math.hypot(x, z) * 0.5, z, 0.11, 0.04, 0.11);
  const body = new THREE.Group(); g.add(body);
  ball(body, skin, 0, 0.98, 0.3, 0.19, 0.2, 0.21);
  ball(body, skin, 0, 0.76, 0.26, 0.09, 0.2, 0.09);
  ball(body, skin, 0, 0.93, 0.47, 0.12, 0.1, 0.1);
  for (const s of [-1, 1]) {
    ball(body, mat('#fbfbf2'), s * 0.09, 1.04, 0.44, 0.06, 0.09, 0.04);
    ball(body, mat('#1a1a1a'), s * 0.09, 1.03, 0.47, 0.03, 0.05, 0.02);
    ball(body, skin, s * 0.2, 0.09, 0.08, 0.1, 0.09, 0.15);
    ball(body, skin, s * 0.32, 0.45, 0.18, 0.07);
  }
  g.userData = { shell, body };
  return g;
}
export function piranha() {
  const g = new THREE.Group();
  const stem = mat('#668762'), red = mat('#d82c14'), white = mat('#fbfbf2');
  add(g, cyl, stem, 0, 0.32, 0, 0.06, 0.64, 0.06);
  for (const s of [-1, 1]) { const leaf = ball(g, stem, s * 0.2, 0.25, 0, 0.22, 0.05, 0.11); leaf.rotation.z = s * -0.5; }
  const head = new THREE.Group(); head.position.y = 0.72; g.add(head);
  const jaws = [];
  for (const s of [-1, 1]) {
    const j = new THREE.Group(); head.add(j);
    const half = add(j, halfSphere, red, 0, 0, 0, 0.3, 0.36, 0.3);
    half.rotation.z = s * -Math.PI / 2;
    half.position.set(s * 0.02, 0.36, 0);
    for (const [y, z] of [[0.5, 0.15], [0.25, -0.18], [0.6, -0.1]]) ball(j, white, s * 0.24, y, z, 0.06, 0.06, 0.03);
    const lip = add(j, cyl, white, s * 0.035, 0.36, 0, 0.3, 0.03, 0.3); lip.rotation.z = Math.PI / 2;
    jaws.push(j);
  }
  g.userData = { jaws };
  return g;
}

// ---------- 道具 ----------
export function mushroom(oneUp) {
  const g = new THREE.Group();
  add(g, cyl, mat('#f6e6c4'), 0, 0.22, 0, 0.22, 0.44, 0.22);
  add(g, halfSphere, mat(oneUp ? '#22a83a' : '#ad5544'), 0, 0.34, 0, 0.44, 0.44, 0.44);
  for (const [x, y, z, r] of [[0, 0.62, 0.3, 0.13], [-0.3, 0.5, 0.15, 0.1], [0.3, 0.5, 0.15, 0.1], [0, 0.78, 0, 0.12], [0, 0.55, -0.32, 0.12]]) ball(g, mat('#fbfbf2'), x, y, z, r, r * 0.6, r);
  for (const s of [-1, 1]) ball(g, mat('#1a1a1a'), s * 0.08, 0.24, 0.2, 0.035, 0.07, 0.02);
  return g;
}
export function flower() {
  const g = new THREE.Group();
  add(g, cyl, mat('#668762'), 0, 0.22, 0, 0.05, 0.44, 0.05);
  for (const s of [-1, 1]) { const l = ball(g, mat('#668762'), s * 0.17, 0.16, 0, 0.18, 0.05, 0.09); l.rotation.z = s * -0.4; }
  const head = new THREE.Group(); head.position.y = 0.62; g.add(head);
  ball(head, mat('#f04a10', { emissive: '#601000' }), 0, 0, 0, 0.32, 0.22, 0.2);
  ball(head, mat('#fbfbf2'), 0, 0, 0.06, 0.24, 0.16, 0.17);
  ball(head, mat('#ffc020', { emissive: '#402800' }), 0, 0, 0.1, 0.15, 0.1, 0.13);
  for (const s of [-1, 1]) ball(head, mat('#1a1a1a'), s * 0.05, 0, 0.22, 0.025, 0.05, 0.02);
  return g;
}
let starGeo = null;
export function star() {
  if (!starGeo) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.19 : 0.44, a = Math.PI / 2 + i * Math.PI / 5; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    s.closePath();
    starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
    starGeo.translate(0, 0, -0.08);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(starGeo, new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#a06000', roughness: 0.35 }));
  m.position.y = 0.45; m.castShadow = true; g.add(m);
  for (const s of [-1, 1]) ball(m, mat('#1a1a1a'), s * 0.07, 0.05, 0.16, 0.03, 0.07, 0.02);
  g.userData = { star: m };
  return g;
}
export const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.09, 18).rotateX(Math.PI / 2);
export const coinMat = new THREE.MeshStandardMaterial({ color: '#ffc531', emissive: '#6a4500', roughness: 0.25, metalness: 0.35 });
export function coin() { const m = new THREE.Mesh(coinGeo, coinMat); m.castShadow = true; return m; }
export function fireball() {
  const g = new THREE.Group();
  ball(g, new THREE.MeshBasicMaterial({ color: '#ff7a1a' }), 0, 0, 0, 0.17);
  ball(g, new THREE.MeshBasicMaterial({ color: '#fff0a0' }), 0, 0, 0, 0.09);
  return g;
}
