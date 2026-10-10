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
export function koopa(red, winged=false) {
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
  const wings=[];
  if (winged) for (const s of [-1,1]) {
    const wing=new THREE.Group(); wing.position.set(s*.29,.67,-.12); g.add(wing);
    for (let i=0;i<3;i++) {
      const feather=ball(wing,rim,s*(.12+i*.12),.18+i*.12,0,.13,.3-i*.045,.075);
      feather.rotation.z=-s*.4;
    }
    wings.push(wing);
  }
  g.userData = { shell, body, wings };
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
// ---------- 城堡：库巴、火焰、蘑菇人、斧头 ----------
const cone = new THREE.ConeGeometry(1, 1, 8);
const coneAt = (p, m, x, y, z, r, h, rx = 0, rz = 0) => { const o = add(p, cone, m, x, y, z, r, h, r); o.rotation.set(rx, 0, rz); return o; };
// 库巴：本地 +z 为正面（和其他模型一致），脚底 y=0；约 2 格高，左右（世界纵深）比前后宽。
export function bowser() {
  const g = new THREE.Group();
  const shellM = mat('#4f7f3a'), rim = mat('#efe2bc'), spike = mat('#f4f1e6', { roughness: 0.5 }), skin = mat('#d99a3c'), belly = mat('#ecd38e');
  const head = mat('#6f9d43'), hair = mat('#c8471c'), horn = mat('#f4efe0'), dark = mat('#1a1a1a'), white = mat('#fbfbf2'), claw = mat('#f1ead8');
  const body = new THREE.Group(); g.add(body);
  // 龟壳朝后，壳沿一圈奶白色，上面一排尖刺
  const shell = add(body, halfSphere, shellM, 0, 1.0, -0.2, 0.92, 0.78, 0.95); shell.rotation.x = -Math.PI / 2;
  const ring = add(body, cyl, rim, 0, 1.0, -0.2, 0.96, 0.1, 0.99); ring.rotation.x = Math.PI / 2;
  for (const [x, y] of [[0, 0.55], [0, 1.0], [0, 1.45], [-0.45, 0.78], [0.45, 0.78], [-0.45, 1.25], [0.45, 1.25]]) coneAt(body, spike, x, y, -0.2 - 0.66 * Math.cos(Math.hypot(x, y - 1) * 1.6), 0.11, 0.3, -Math.PI / 2);
  ball(body, belly, 0, 0.92, 0.22, 0.62, 0.72, 0.42);
  for (let i = 0; i < 3; i++) box(body, mat('#c9ae6a'), 0, 0.62 + i * 0.28, 0.6, 0.62 - i * 0.08, 0.04, 0.06);
  // 尾巴
  coneAt(body, skin, 0, 0.35, -1.05, 0.16, 0.5, -Math.PI / 2 - 0.4);
  // 腿脚
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.42, 0.55, 0.05); body.add(leg);
    ball(leg, skin, 0, -0.18, 0, 0.26, 0.34, 0.28);
    ball(leg, skin, 0, -0.45, 0.12, 0.24, 0.12, 0.32);
    for (const cx of [-0.1, 0.1]) coneAt(leg, claw, cx, -0.48, 0.42, 0.05, 0.16, Math.PI / 2);
    legs.push(leg);
  }
  // 手臂
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.68, 1.3, 0.2); body.add(arm);
    ball(arm, skin, s * 0.06, -0.18, 0.08, 0.15, 0.26, 0.15);
    ball(arm, skin, s * 0.08, -0.42, 0.18, 0.13);
    for (const cx of [-0.05, 0.05]) coneAt(arm, claw, s * 0.08 + cx, -0.5, 0.3, 0.04, 0.13, Math.PI / 2);
    // 刺环护腕
    add(arm, cyl, rim, s * 0.07, -0.3, 0.13, 0.15, 0.06, 0.15);
    arms.push(arm);
  }
  // 头：绿脸、黄口鼻、红色头发和眉毛、白角；下巴单独一组用来张嘴喷火
  const hd = new THREE.Group(); hd.position.set(0, 1.62, 0.42); body.add(hd);
  ball(hd, head, 0, 0.05, 0, 0.42, 0.36, 0.4);
  ball(hd, belly, 0, -0.06, 0.32, 0.3, 0.2, 0.24);
  for (const s of [-1, 1]) {
    ball(hd, dark, s * 0.08, 0.0, 0.54, 0.03, 0.03, 0.02);   // 鼻孔
    ball(hd, white, s * 0.17, 0.2, 0.3, 0.1, 0.12, 0.06);
    ball(hd, dark, s * 0.16, 0.19, 0.35, 0.045, 0.07, 0.02);
    const brow = box(hd, hair, s * 0.18, 0.32, 0.3, 0.2, 0.06, 0.06); brow.rotation.z = s * -0.35;
    coneAt(hd, horn, s * 0.3, 0.38, -0.05, 0.08, 0.36, -0.3, s * -0.5);
  }
  for (let i = 0; i < 5; i++) { const t = ball(hd, hair, (i - 2) * 0.12, 0.38 - Math.abs(i - 2) * 0.03, -0.22, 0.13, 0.2, 0.16); t.rotation.x = -0.4; }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.14, 0.12); hd.add(jaw);
  ball(jaw, belly, 0, -0.08, 0.22, 0.26, 0.1, 0.22);
  for (const s of [-1, 1]) coneAt(jaw, white, s * 0.14, 0.02, 0.38, 0.035, 0.09);
  for (const s of [-1, 1]) coneAt(hd, white, s * 0.12, -0.17, 0.44, 0.035, 0.09, Math.PI);
  g.userData = { body, legs, arms, jaw, head: hd };
  return g;
}
// 库巴的火焰：沿本地 x 拉长、尖头朝前（-x 方向飞），整条跑道纵深排 5 团，不能从旁边绕过
export function bowserFlame() {
  const g = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({ color: '#ff5a14' }), midM = new THREE.MeshBasicMaterial({ color: '#ffb02a' }), core = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
  const puffs = [];
  for (const z of [-2.4, -1.2, 0, 1.2, 2.4]) {
    const f = new THREE.Group(); f.position.z = z; g.add(f);
    ball(f, outer, 0, 0, 0, 0.78, 0.26, 0.34);
    ball(f, midM, -0.12, 0, 0, 0.56, 0.18, 0.26);
    ball(f, core, -0.26, 0, 0, 0.32, 0.1, 0.16);
    coneAt(f, outer, 0.82, 0, 0, 0.2, 0.42, 0, -Math.PI / 2);
    for (const o of f.children) o.castShadow = false;
    puffs.push(f);
  }
  g.userData = { puffs };
  return g;
}
// 蘑菇人（Toad）：白色大伞帽带红点、蓝背心
export function toad() {
  const g = new THREE.Group();
  const capM = mat('#fbfbf2'), spot = mat('#d8402a'), skin = mat('#f6d0a2'), vest = mat('#3d5fb8'), trim = mat('#e8b838'), pants = mat('#f4f0e6'), shoe = mat('#7a4a24'), dark = mat('#1a1a1a');
  for (const s of [-1, 1]) { ball(g, shoe, s * 0.13, 0.07, 0.05, 0.12, 0.07, 0.16); ball(g, pants, s * 0.12, 0.24, 0, 0.13, 0.16, 0.13); }
  ball(g, vest, 0, 0.5, 0, 0.26, 0.2, 0.2);
  for (const s of [-1, 1]) box(g, trim, s * 0.13, 0.5, 0.17, 0.04, 0.32, 0.03);
  for (const s of [-1, 1]) ball(g, skin, s * 0.3, 0.45, 0.04, 0.08, 0.13, 0.08);
  ball(g, skin, 0, 0.78, 0.03, 0.22, 0.2, 0.2);
  for (const s of [-1, 1]) ball(g, dark, s * 0.07, 0.8, 0.21, 0.035, 0.06, 0.02);
  add(g, halfSphere, capM, 0, 0.86, 0, 0.5, 0.48, 0.48);
  for (const [x, y, z, r] of [[0, 1.3, 0.15, 0.14], [-0.34, 1.05, 0.25, 0.13], [0.34, 1.05, 0.25, 0.13], [0, 1.08, -0.4, 0.15], [-0.4, 1.0, -0.2, 0.11], [0.4, 1.0, -0.2, 0.11]]) ball(g, spot, x, y, z, r, r * 0.55, r);
  return g;
}
// 斧头：长柄 + 双刃，挂在桥头石台上
export function axe() {
  const g = new THREE.Group();
  const wood = mat('#7a4e2a'), blade = mat('#f0b830', { roughness: 0.35, metalness: 0.45, emissive: '#5a3800' }), edge = mat('#fff2c0', { roughness: 0.3, metalness: 0.5 });
  add(g, cyl, wood, 0, 0.45, 0, 0.06, 0.9, 0.06);
  const bladeGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 16, 1, false, 0, Math.PI);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(bladeGeo, blade); b.position.set(s * 0.04, 0.7, 0); b.rotation.set(Math.PI / 2, s > 0 ? Math.PI : 0, 0); b.rotation.z = Math.PI / 2 * (s > 0 ? 1 : -1); b.castShadow = true; g.add(b);
    box(g, edge, s * 0.36, 0.7, 0, 0.03, 0.62, 0.1);
  }
  ball(g, blade, 0, 0.95, 0, 0.08);
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
