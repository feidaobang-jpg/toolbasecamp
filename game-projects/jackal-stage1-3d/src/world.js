// 静态场景：灯光常驻；每关的地面、水面、建筑、树林放在 stageRoot 里，换关时整体释放再重建。
import * as THREE from 'three';
import * as L from './level.js';
import { part, merged, mesh, MAT, C, hutGeo, gateGeo, barrelGeo, sandbagGeo, crateGeo, isCached } from './models.js';
import { fixedRng } from './core.js';

const Z = (y) => -y;   // 逻辑 y（北）→ three 的 -Z
const T = L.T;

const BASE_COLOR = {
  [T.GRASS]: 0x86c868, [T.SAND]: 0xf3e3b2, [T.ROAD]: 0xcfae84, [T.WATER]: 0x3e9fb6, [T.SEA]: 0x2f88a9, [T.BRIDGE]: 0x3e9fb6,
  [T.FLOOR]: 0xd3ba8e, [T.DIRT]: 0xc9b383, [T.PAD]: 0xd9d6c8, [T.STONE]: 0xd8d2bd, [T.CONCRETE]: 0xbfc1bf, [T.MARSH]: 0x9fd6a6,
  [T.CHASM]: 0x2a2018, [T.CONVEYOR]: 0x55585c
};
const CELL_H = { [T.WATER]: -1.3, [T.SEA]: -1.9, [T.BRIDGE]: -1.3, [T.CHASM]: -4.2, [T.MARSH]: -0.08 };

// 几种全关共用的实例几何体（只建一次，换关不释放）
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const S = {};
  S.trees = [
    (() => { const b = []; part(b, 'cyl6', 0x8a5a36, [0, 0.6, 0], [0.34, 1.2, 0.34]); part(b, 'ico', 0x4fae55, [0, 1.75, 0], [1.9, 1.6, 1.9]); part(b, 'ico', 0x63c260, [0.25, 2.35, 0.15], [1.25, 1.1, 1.25]); return merged(b); })(),
    (() => { const b = []; part(b, 'cyl6', 0x7d5232, [0, 0.5, 0], [0.3, 1.0, 0.3]); part(b, 'cone', 0x3f9a58, [0, 1.6, 0], [1.9, 1.6, 1.9]); part(b, 'cone', 0x52b062, [0, 2.4, 0], [1.4, 1.3, 1.4]); return merged(b); })(),
    (() => { const b = []; part(b, 'cyl6', 0x8a5a36, [0, 0.55, 0], [0.32, 1.1, 0.32]); part(b, 'ico', 0x5cb84e, [-0.35, 1.6, 0.1], [1.3, 1.2, 1.3]); part(b, 'ico', 0x6cc65a, [0.4, 1.7, -0.2], [1.3, 1.25, 1.3]); part(b, 'ico', 0x7ad063, [0, 2.3, 0], [1.2, 1.1, 1.2]); return merged(b); })()
  ];
  S.pine = (() => { const b = []; part(b, 'cyl6', 0x6e4a2c, [0, 0.45, 0], [0.28, 0.9, 0.28]); part(b, 'cone', 0x2f7a4a, [0, 1.4, 0], [1.9, 1.5, 1.9]); part(b, 'cone', 0x3a8c55, [0, 2.15, 0], [1.5, 1.3, 1.5]); part(b, 'cone', 0x48a062, [0, 2.8, 0], [1.0, 1.1, 1.0]); return merged(b); })();
  S.palm = (() => {
    const b = [];
    for (let k = 0; k < 4; k++) part(b, 'cyl6', k % 2 ? 0xa77b4f : 0x93683f, [k * 0.12, 0.4 + k * 0.8, 0], [0.3 - k * 0.03, 0.82, 0.3 - k * 0.03], [0, 0, -0.12]);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; part(b, 'cone', k % 2 ? 0x55b449 : 0x3f9c45, [0.5 + Math.sin(a) * 0.8, 3.15, Math.cos(a) * 0.8], [0.45, 1.8, 0.18], [Math.cos(a) * 1.15, a, -Math.sin(a) * 1.15]); }
    part(b, 'sphere', 0x7b5a32, [0.45, 3.2, 0], [0.32, 0.3, 0.32]);
    return merged(b);
  })();
  S.bush = (() => { const b = []; part(b, 'ico', 0x58b45a, [0, 0.35, 0], [1.1, 0.75, 1.0]); part(b, 'ico', 0x6dc560, [0.35, 0.5, 0.1], [0.7, 0.6, 0.7]); return merged(b); })();
  S.flower = (() => { const b = []; part(b, 'cyl6', 0x4e8f4c, [0, 0.15, 0], [0.06, 0.3, 0.06]); part(b, 'ico', 0xffffff, [0, 0.34, 0], [0.26, 0.18, 0.26]); return merged(b); })();
  S.tuft = (() => { const b = []; for (let k = 0; k < 3; k++) { const a = k * 2.1; part(b, 'cone4', k % 2 ? 0x5fa54c : 0x6cb456, [Math.sin(a) * 0.12, 0.22, Math.cos(a) * 0.12], [0.12, 0.45, 0.12], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]); } return merged(b); })();
  S.reed = (() => { const b = []; for (let k = 0; k < 5; k++) { const a = k * 1.3; part(b, 'cyl6', k % 2 ? 0x7fae5a : 0x9ac46a, [Math.sin(a) * 0.18, 0.5, Math.cos(a) * 0.18], [0.05, 1.0 + (k % 3) * 0.2, 0.05], [Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15]); } part(b, 'cyl6', 0x8a6a3a, [0.1, 1.05, 0], [0.09, 0.3, 0.09]); return merged(b); })();
  S.rock = (() => { const b = []; part(b, 'dode', 0xa9a49a, [0, 0.4, 0], [1.2, 0.9, 1.1]); part(b, 'dode', 0xbdb8ad, [0.35, 0.3, 0.3], [0.7, 0.6, 0.6]); return merged(b); })();
  S.hedge = (() => { const b = []; part(b, 'ico', 0x3f8a46, [0, 0.45, 0], [1.25, 0.95, 1.2]); part(b, 'ico', 0x4f9c4f, [0.2, 0.7, 0.15], [0.8, 0.6, 0.8]); return merged(b); })();
  S.swampRim = (() => { const b = []; part(b, 'dode', 0x8e8a80, [0, 0.35, 0], [1.2, 0.75, 1.15]); part(b, 'dode', 0xa8a399, [0.25, 0.55, -0.15], [0.7, 0.5, 0.7]); return merged(b); })();
  S.bluff = (() => {
    const b = [];
    part(b, 'rbox2', 0xc6a983, [0, 1.3, 0], [2.02, 2.6, 2.02]);
    part(b, 'rbox', 0xb39470, [0.35, 0.7, -0.62], [1.1, 1.0, 0.9]);
    part(b, 'rbox', 0xd3b994, [-0.4, 1.6, 0.6], [1.0, 1.2, 0.9]);
    part(b, 'box', 0x84c46a, [0, 2.62, 0], [2.0, 0.3, 2.0]);
    part(b, 'rbox', 0x77b660, [0, 2.5, 0], [2.04, 0.2, 2.04]);
    return merged(b);
  })();
  S.set = new Set([...S.trees, S.pine, S.palm, S.bush, S.flower, S.tuft, S.reed, S.rock, S.hedge, S.swampRim, S.bluff]);
  SHARED = S;
  return S;
}

// 不可破坏的整块物体（合并进区块几何）
function wallCell(b, x, y, style, R, i, j) {
  if (style === 'fence') {
    part(b, 'box', 0xa7aaa8, [x, 0.3, Z(y)], [1.02, 0.6, 0.8]);
    part(b, 'box', 0x8e9290, [x, 0.62, Z(y)], [1.04, 0.08, 0.84]);
    if ((i + j) % 2 === 0) part(b, 'cyl6', 0x6d7175, [x, 1.3, Z(y)], [0.12, 1.4, 0.12]);
    part(b, 'box', 0xcfd3d4, [x, 1.25, Z(y)], [1.0, 1.1, 0.05]);
    part(b, 'box', 0x6d7175, [x, 1.95, Z(y)], [1.02, 0.06, 0.08]);
    return;
  }
  if (style === 'metal') {
    part(b, 'rbox', R() < 0.5 ? 0x7d8287 : 0x8a8f93, [x, 0.9, Z(y)], [1.02, 1.8, 1.02]);
    part(b, 'box', 0x5d6266, [x, 1.84, Z(y)], [1.08, 0.14, 1.08]);
    if ((i + j) % 3 === 0) part(b, 'box', 0xc9a23a, [x, 1.2, Z(y)], [1.04, 0.16, 1.04]);
    return;
  }
  const tone = style === 'ruin' ? (R() < 0.5 ? 0xb2afa4 : 0xc2bfb4) : (R() < 0.5 ? C.stone : 0xc8bd9f);
  part(b, 'rbox', tone, [x, 0.85, Z(y)], [1.02, 1.7, 1.02]);
  part(b, 'box', style === 'ruin' ? 0x8a877e : C.stoneD, [x, 1.76, Z(y)], [1.08, 0.16, 1.08]);
  if ((i + j) % 2 === 0) part(b, 'rbox', tone, [x, 2.0, Z(y)], [0.6, 0.38, 0.6]);
}
function pillarGeo(b, x, y, broken, k) {
  const col = k % 3 === 0 ? 0xdcc99c : k % 3 === 1 ? 0xd2bd8c : 0xe2d2a8;
  part(b, 'rbox', 0xb9a679, [x, 0.16, Z(y)], [1.1, 0.32, 1.1]);
  const h = broken ? 1.0 + (k % 4) * 0.25 : 2.6;
  part(b, 'cyl', col, [x, 0.32 + h / 2, Z(y)], [0.78, h, 0.78]);
  for (let r = 0; r < 3; r++) part(b, 'box', 0xc4b083, [x, 0.32 + h * (0.25 + r * 0.25), Z(y) - 0.39], [0.06, 0.3, 0.02]);
  if (!broken) { part(b, 'rbox', 0xc8b485, [x, 0.32 + h + 0.15, Z(y)], [1.0, 0.3, 1.0]); }
  else part(b, 'rbox', col, [x + 0.12, 0.32 + h + 0.05, Z(y) + 0.1], [0.5, 0.28, 0.42], [0.3, 0.6, 0.2]);
}
const WH = {
  port: { wall: 0xc87a38, wallD: 0x9a5726, roof: 0xd98a40, rib: 0xb06a2c, h: 3.0 },
  hq: { wall: 0x9aa09c, wallD: 0x6f7571, roof: 0x3f8a5a, rib: 0x2f6c45, h: 2.8 },
  bunker: { wall: 0x8a8f8c, wallD: 0x5f6461, roof: 0x7a7f7c, rib: 0x5a5f5c, h: 2.2 },
  cabin: { wall: 0x8a5a36, wallD: 0x5e3b22, roof: 0x7d6a3a, rib: 0x56482a, h: 2.4 },
  ruin: { wall: 0xb2afa4, wallD: 0x8a877e, roof: 0x9d9a8f, rib: 0x7d7a71, h: 2.2 },
  brick: { wall: 0xc96a3e, wallD: 0x8f4224, roof: 0x8a7a6a, rib: 0x6a5a4a, h: 2.6 }
};
function warehouseGeo(b, s) {
  const st = WH[s.data.style] || WH.port, w = s.x1 - s.x0, d = s.y1 - s.y0, h = s.data.h || st.h, x = s.x, y = s.y;
  part(b, 'box', st.wall, [x, h / 2, Z(y)], [w - 0.1, h, d - 0.1]);
  part(b, 'box', st.wallD, [x, 0.2, Z(y)], [w, 0.4, d]);
  part(b, 'box', st.roof, [x, h + 0.12, Z(y)], [w + 0.2, 0.24, d + 0.2]);
  const along = w >= d;
  const n = Math.max(2, Math.floor((along ? w : d) / 1.4));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n - 0.5;
    if (along) part(b, 'box', st.rib, [x + t * w, h + 0.28, Z(y)], [0.16, 0.1, d + 0.1]);
    else part(b, 'box', st.rib, [x, h + 0.28, Z(y + t * d)], [w + 0.1, 0.1, 0.16]);
  }
  // 南面卷帘门 / 窗
  const doors = Math.max(1, Math.floor(w / 4));
  for (let k = 0; k < doors; k++) {
    const dx = x + ((k + 0.5) / doors - 0.5) * w;
    part(b, 'box', 0x3e3a36, [dx, Math.min(1.1, h * 0.4), Z(s.y0) + 0.06], [Math.min(2.2, w / doors - 0.6), Math.min(2.0, h * 0.75), 0.06]);
    for (let r = 0; r < 4; r++) part(b, 'box', 0x5a5550, [dx, 0.3 + r * 0.42, Z(s.y0) + 0.1], [Math.min(2.2, w / doors - 0.6), 0.05, 0.03]);
  }
  if (s.data.style === 'hq') for (let k = 0; k < Math.floor(w / 2.4); k++) part(b, 'box', 0x9fe0f0, [s.x0 + 1.2 + k * 2.4, h * 0.7, Z(s.y0) + 0.05], [0.9, 0.5, 0.04]);
}
function containerGeo(b, s) {
  const w = s.x1 - s.x0, d = s.y1 - s.y0, col = s.data.color || 0xb8443a, h = 1.7;
  part(b, 'box', col, [s.x, h / 2, Z(s.y)], [w - 0.06, h, d - 0.06]);
  const along = w >= d, n = Math.floor((along ? w : d) / 0.5);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n - 0.5;
    if (along) { part(b, 'box', 0x7a2a22, [s.x + t * w, h / 2, Z(s.y0) + 0.02], [0.08, h - 0.2, 0.04]); part(b, 'box', 0x7a2a22, [s.x + t * w, h / 2, Z(s.y1) - 0.02], [0.08, h - 0.2, 0.04]); }
    else { part(b, 'box', 0x7a2a22, [s.x0 + 0.02, h / 2, Z(s.y + t * d)], [0.04, h - 0.2, 0.08]); part(b, 'box', 0x7a2a22, [s.x1 - 0.02, h / 2, Z(s.y + t * d)], [0.04, h - 0.2, 0.08]); }
  }
  part(b, 'box', 0x8a3a30, [s.x, h + 0.03, Z(s.y)], [w, 0.06, d]);
}
function jetGeo() {
  const b = [];
  part(b, 'cyl', 0x9aa2a8, [0, 0.9, 0], [0.9, 4.6, 0.9], [Math.PI / 2, 0, 0]);
  part(b, 'cone', 0x8a9298, [0, 0.9, -2.8], [0.9, 1.2, 0.9], [-Math.PI / 2, 0, 0]);
  part(b, 'sphere', 0x6fc4e0, [0, 1.35, -1.2], [0.6, 0.5, 1.2]);
  part(b, 'box', 0x8e969c, [0, 0.85, 0.2], [5.0, 0.14, 1.8]);
  part(b, 'box', 0x8e969c, [0, 0.95, 2.0], [2.2, 0.12, 0.8]);
  part(b, 'box', 0x8e969c, [0, 1.6, 2.0], [0.12, 1.2, 0.9]);
  part(b, 'box', 0xd4553f, [0, 1.95, 2.1], [0.14, 0.3, 0.5]);
  for (const s of [-1, 1]) part(b, 'cyl', 0x2b2b2b, [s * 0.9, 0.3, 0.3], [0.3, 0.4, 0.3], [0, 0, Math.PI / 2]);
  part(b, 'cyl', 0x2b2b2b, [0, 0.3, -1.8], [0.24, 0.3, 0.24], [0, 0, Math.PI / 2]);
  return merged(b);
}

export function buildWorld(scene) {
  const W = {};
  // ---------- 灯光（常驻） ----------
  const hemi = new THREE.HemisphereLight(0xe8f7ff, 0x9a9070, 0.74);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.05);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 170;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun; W.hemi = hemi;
  W.followLight = (x, y) => {
    // 阴影相机跟随镜头焦点，按纹素对齐避免移动时阴影边缘游动
    const step = 80 / sun.shadow.mapSize.x * 2;
    const sx = Math.round(x / step) * step, sy = Math.round(y / step) * step;
    sun.position.set(sx - 30, 62, Z(sy) + 26);
    sun.target.position.set(sx, 0, Z(sy));
  };
  scene.background = new THREE.Color(0xbfe8ec);
  scene.fog = new THREE.Fog(0xcdeee4, 60, 150);

  // 水面材质（常驻，顶点波动）
  const water = new THREE.MeshPhongMaterial({ color: 0x35a6c6, transparent: true, opacity: 0.86, shininess: 90, specular: 0xe8ffff, depthWrite: false });
  const waterUni = { uTime: { value: 0 } };
  water.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterUni.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvec4 wp0 = modelMatrix * vec4(position,1.0);\ntransformed.z += 0.07*sin(wp0.x*0.7+uTime*1.6)+0.05*sin(wp0.z*0.9-uTime*1.2);');
  };
  W.water = water; W.waterUni = waterUni;
  const gmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  let handles = new Map();
  let root = null;
  let conveyorTex = null;

  function build() {
    const cfg = L.STAGE;
    const R = fixedRng(77 + L.STAGE_NO * 31);
    const S = shared();
    root = new THREE.Group(); root.name = 'stage' + L.STAGE_NO;
    scene.add(root);
    handles = new Map();
    const add = (o) => { root.add(o); return o; };
    const pal = Object.assign({}, BASE_COLOR, cfg.palette || {});
    const COLOR = {}; for (const k in pal) COLOR[k] = new THREE.Color(pal[k]);
    scene.background.setHex(cfg.sky || 0xbfe8ec);
    scene.fog.color.setHex(cfg.fog || 0xcdeee4);
    hemi.color.setHex(cfg.hemiSky || 0xe8f7ff); hemi.groundColor.setHex(cfg.hemiGround || 0x9a9070);
    water.color.setHex(cfg.waterColor || 0x35a6c6);

    // ---------- 地面网格（顶点高度 + 顶点色） ----------
    {
      const VX = L.COLS + 1, VY = L.ROWS + 1;
      const pos = new Float32Array(VX * VY * 3), col = new Float32Array(VX * VY * 3);
      const tmp = new THREE.Color(), acc = new THREE.Color();
      const bluffCell = new Uint8Array(L.COLS * L.ROWS), ridgeCell = new Uint8Array(L.COLS * L.ROWS);
      for (const b of L.BLUFFS) for (const c of b.cells) bluffCell[c] = 1;
      for (const s of L.statics) if (s && s.kind === 'ridge') for (const c of s.cells) ridgeCell[c] = 1;
      const ridgeCol = new THREE.Color(cfg.ridgeColor || 0x8a6a45), ridgeTop = new THREE.Color(cfg.ridgeTop || 0x9a9a4a);
      for (let j = 0; j < VY; j++) for (let i = 0; i < VX; i++) {
        let h = 0, n = 0, nr = 0; acc.setRGB(0, 0, 0);
        for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
          const ii = Math.min(L.COLS - 1, Math.max(0, i + di)), jj = Math.min(L.ROWS - 1, Math.max(0, j + dj));
          const c = L.idx(ii, jj), t = L.terrain[c];
          if (ridgeCell[c]) { h += 2.9; nr++; tmp.copy(ridgeCol); }
          else { h += CELL_H[t] || 0; tmp.copy(COLOR[t] || COLOR[T.GRASS]); if (bluffCell[c]) tmp.setHex(0xb59c74); }
          acc.add(tmp); n++;
        }
        h /= n; acc.multiplyScalar(1 / n);
        if (nr === 4) { acc.lerp(ridgeTop, 0.55 + (R() - 0.5) * 0.2); h += (R() - 0.5) * 0.8; }
        else if (nr > 0) h += (R() - 0.5) * 0.4;
        const x = L.X0 + i, y = j;
        const patch = 0.09 * Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) * Math.cos(y * 0.17 + x * 0.05) + 0.05 * Math.sin(x * 0.9 + y * 0.6) * Math.sin(y * 0.8 - x * 0.3);
        const k = 1 + patch * (cfg.flatGround ? 0.35 : 1) + (R() - 0.5) * 0.05;
        const v = (j * VX + i) * 3;
        pos[v] = x; pos[v + 1] = h + (h < 0 || cfg.flatGround ? 0 : (R() - 0.5) * 0.03); pos[v + 2] = Z(y);
        col[v] = acc.r * k; col[v + 1] = acc.g * k; col[v + 2] = acc.b * k;
      }
      const full = new THREE.BufferGeometry();
      full.setAttribute('position', new THREE.BufferAttribute(pos, 3)); full.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const allIdx = [];
      for (let j = 0; j < L.ROWS; j++) for (let i = 0; i < L.COLS; i++) { const a = j * VX + i, b = a + 1, c = a + VX, d = c + 1; allIdx.push(a, b, d, a, d, c); }
      full.setIndex(allIdx); full.computeVertexNormals();
      const nrm = full.getAttribute('normal');
      const CH = 44;
      for (let j0 = 0; j0 < L.ROWS; j0 += CH) {
        const j1 = Math.min(L.ROWS, j0 + CH);
        const g = new THREE.BufferGeometry();
        const n = (j1 - j0 + 1) * VX;
        g.setAttribute('position', new THREE.BufferAttribute(pos.slice(j0 * VX * 3, (j0 * VX + n) * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(col.slice(j0 * VX * 3, (j0 * VX + n) * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nrm.array.slice(j0 * VX * 3, (j0 * VX + n) * 3), 3));
        const index = [];
        for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < L.COLS; i++) { const a = j * VX + i, b = a + 1, c = a + VX, d = c + 1; index.push(a, b, d, a, d, c); }
        g.setIndex(index); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, gmat); m.receiveShadow = true; add(m);
      }
      full.dispose();
    }
    // ---------- 场外地面与水床（只铺在关卡网格之外） ----------
    {
      const outerM = new THREE.MeshLambertMaterial({ color: cfg.outerGround || 0x6fae5a }); outerM.userData.stage = true;
      const bedM = new THREE.MeshLambertMaterial({ color: cfg.bedColor || 0x2c84a6 }); bedM.userData.stage = true;
      const strip = (x0, x1, y0, y1, h, m) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), m);
        p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, h, Z((y0 + y1) / 2)); p.receiveShadow = m === outerM;
        add(p);
      };
      const outer = cfg.outer || [[-160, -36, -80, 480], [36, 160, -80, 480], [-36, 36, -80, 0], [-36, 36, 352, 480]];
      for (const r of outer) strip(r[0], r[1], r[2], r[3], r[4] !== undefined ? r[4] : -0.02, outerM);
      for (const r of cfg.beds || []) strip(r[0], r[1], r[2], r[3], r[4], bedM);
    }
    // ---------- 水面 ----------
    for (const w of cfg.water || []) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h, Math.max(2, Math.round(w.w / 4)), Math.max(2, Math.round(w.h / 4))), water);
      m.rotation.x = -Math.PI / 2; m.position.set(w.x, -0.35, Z(w.y)); m.renderOrder = 2; add(m);
    }
    // ---------- 传送带（第 6 关） ----------
    if (cfg.conveyors && cfg.conveyors.length) {
      if (!conveyorTex) {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const x = c.getContext('2d'); x.fillStyle = '#4a4d50'; x.fillRect(0, 0, 64, 64);
        x.fillStyle = '#d9a43a'; for (let k = 0; k < 2; k++) { x.beginPath(); x.moveTo(8, 10 + k * 32); x.lineTo(32, 26 + k * 32); x.lineTo(56, 10 + k * 32); x.lineTo(56, 18 + k * 32); x.lineTo(32, 34 + k * 32); x.lineTo(8, 18 + k * 32); x.fill(); }
        conveyorTex = new THREE.CanvasTexture(c); conveyorTex.wrapS = conveyorTex.wrapT = THREE.RepeatWrapping;
      }
      for (const cv of cfg.conveyors) {
        const w = cv.x1 - cv.x0, h = cv.y1 - cv.y0;
        const tex = conveyorTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2, h / 2);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
        m.material.userData.stage = true; m.userData.tex = tex; m.userData.speed = cv.speed || 3;
        m.rotation.x = -Math.PI / 2; m.position.set((cv.x0 + cv.x1) / 2, 0.04, Z((cv.y0 + cv.y1) / 2)); m.receiveShadow = true;
        add(m); (W.conveyorMeshes = W.conveyorMeshes || []).push(m);
      }
    }

    // ---------- 合并的不可破坏物体（按 y 区块） ----------
    const chunks = new Map();
    const chunkList = (y) => { const k = Math.floor(y / 40); if (!chunks.has(k)) chunks.set(k, []); return chunks.get(k); };
    let pk = 0;
    for (const s of L.statics) {
      if (!s) continue;
      if (s.kind === 'wall') {
        const style = s.data.style || cfg.wallStyle || 'stone';
        for (const c of s.cells) {
          const i = c % L.COLS, j = Math.floor(c / L.COLS);
          wallCell(chunkList(L.cellY(j)), L.cellX(i), L.cellY(j), style, R, i, j);
        }
      } else if (s.kind === 'tower') {
        const b = chunkList(s.y);
        part(b, 'rbox', 0xc4b896, [s.x, 1.3, Z(s.y)], [2.1, 2.6, 2.1]);
        part(b, 'box', C.stoneD, [s.x, 2.66, Z(s.y)], [2.3, 0.2, 2.3]);
        for (const [dx, dy] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) part(b, 'rbox', 0xc4b896, [s.x + dx, 2.95, Z(s.y + dy)], [0.5, 0.45, 0.5]);
        part(b, 'box', 0x5a4a3a, [s.x, 1.6, Z(s.y - 1.06)], [0.5, 0.7, 0.04]);
      } else if (s.kind === 'tent') {
        const b = chunkList(s.y);
        part(b, 'cone4', 0x8aa26a, [s.x, 1.1, Z(s.y)], [4.0, 2.2, 4.0], [0, Math.PI / 4, 0]);
        part(b, 'box', 0x4d5f3a, [s.x, 0.6, Z(s.y - 1.42)], [0.9, 1.1, 0.06]);
      } else if (s.kind === 'watch') {
        const b = chunkList(s.y);
        for (const [dx, dy] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) part(b, 'cyl', C.woodD, [s.x + dx, 1.6, Z(s.y + dy)], [0.18, 3.2, 0.18]);
        part(b, 'rbox', C.wood, [s.x, 3.25, Z(s.y)], [2.3, 0.3, 2.3]);
        for (const [dx, dy, w, d] of [[0, -1.1, 2.3, 0.1], [0, 1.1, 2.3, 0.1], [-1.1, 0, 0.1, 2.3], [1.1, 0, 0.1, 2.3]]) part(b, 'box', C.woodD, [s.x + dx, 3.65, Z(s.y + dy)], [w, 0.5, d]);
        part(b, 'cone4', C.red, [s.x, 4.6, Z(s.y)], [3.0, 1.1, 3.0], [0, Math.PI / 4, 0]);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(b, 'cyl', C.woodD, [s.x + dx, 4.0, Z(s.y + dy)], [0.1, 1.0, 0.1]);
      } else if (s.kind === 'rail') {
        const b = chunkList(s.y);
        if (s.y1 - s.y0 >= s.x1 - s.x0) {
          for (let y = s.y0 + 0.5; y < s.y1; y += 2) part(b, 'cyl', s.data.stone ? 0x9c9a92 : C.woodD, [s.x, 0.45, Z(y)], [0.24, 1.0, 0.24]);
          part(b, 'box', s.data.stone ? 0xb9b6ac : C.wood, [s.x, 0.8, Z(s.y)], [0.18, 0.16, s.y1 - s.y0]);
          part(b, 'box', s.data.stone ? 0xb9b6ac : C.wood, [s.x, 0.45, Z(s.y)], [0.14, 0.12, s.y1 - s.y0]);
        } else {
          for (let x = s.x0 + 0.5; x < s.x1; x += 2) part(b, 'cyl', s.data.stone ? 0x9c9a92 : C.woodD, [x, 0.45, Z(s.y)], [0.24, 1.0, 0.24]);
          part(b, 'box', s.data.stone ? 0xb9b6ac : C.wood, [s.x, 0.8, Z(s.y)], [s.x1 - s.x0, 0.16, 0.18]);
        }
      } else if (s.kind === 'pillar') {
        pillarGeo(chunkList(s.y), s.x, s.y, !!s.data.broken, pk++);
      } else if (s.kind === 'ruin') {
        const b = chunkList(s.y), w = s.x1 - s.x0, d = s.y1 - s.y0, k = s.id;
        part(b, 'rbox', k % 2 ? 0xb2afa4 : 0xc2bfb4, [s.x, 0.55 + (k % 3) * 0.15, Z(s.y)], [w - 0.1, 1.1 + (k % 3) * 0.3, d - 0.1], [0, (k % 5) * 0.08, 0]);
        part(b, 'rbox', 0x9d9a8f, [s.x + w * 0.2, 1.4, Z(s.y)], [w * 0.4, 0.4, d * 0.5], [0.2, 0.3, 0.1]);
      } else if (s.kind === 'warehouse') {
        warehouseGeo(chunkList(s.y), s);
      } else if (s.kind === 'container') {
        containerGeo(chunkList(s.y), s);
      } else if (s.kind === 'pylon' && !s.data.hidden) {
        const b = chunkList(s.y);
        part(b, 'cyl', s.data.color || 0xe0b23a, [s.x, 0.45, Z(s.y)], [0.5, 0.9, 0.5]);
        part(b, 'cyl', 0x2b2b2b, [s.x, 0.6, Z(s.y)], [0.52, 0.14, 0.52]);
      }
    }
    // 桥面
    for (const br of cfg.bridges || []) {
      const b = chunkList((br.y0 + br.y1) / 2), cx = (br.x0 + br.x1) / 2, w = br.x1 - br.x0, h = br.y1 - br.y0;
      const deckH = br.kind === 'stone' ? -0.04 : -0.08;
      if (br.kind === 'stone') {
        for (let y = br.y0 + 0.5; y < br.y1; y += 1) for (let x = br.x0 + 0.5; x < br.x1; x += 1) part(b, 'box', ((x + y) | 0) % 2 ? 0xa9a6a0 : 0xb8b5ae, [x, deckH, Z(y)], [0.98, 0.3, 0.98]);
        part(b, 'box', 0x8a8780, [cx, -1.6, Z((br.y0 + br.y1) / 2)], [w - 0.4, 3.0, h - 0.2]);
        for (let y = br.y0 + 2; y < br.y1 - 1; y += 4) for (const x of [br.x0 + 0.6, br.x1 - 0.6]) part(b, 'rbox', 0x9c9a92, [x, -3.0, Z(y)], [1.2, 3.0, 1.2]);
      } else {
        for (let y = br.y0 + 0.25; y < br.y1; y += 0.5) part(b, 'box', ((y * 2) | 0) % 2 ? C.wood : 0xc58f5b, [cx, deckH, Z(y)], [w - 0.4, 0.18, 0.44]);
        for (const x of [br.x0 + 1.5, br.x1 - 1.5]) part(b, 'box', C.woodD, [x, -0.32, Z((br.y0 + br.y1) / 2)], [0.5, 0.36, h]);
        for (let y = br.y0 + 3; y <= br.y1 - 3; y += 4) for (const x of [br.x0 + 1, br.x1 - 1]) part(b, 'cyl', C.woodD, [x, -1.0, Z(y)], [0.5, 2.0, 0.5]);
      }
    }
    // 直升机坪
    if (L.PAD) {
      const b = chunkList(L.PAD.y), x = L.PAD.x, y = L.PAD.y;
      part(b, 'cyl', C.yellow, [x, 0.03, Z(y)], [8.2, 0.08, 8.2]);
      part(b, 'cyl', 0xd8d5c8, [x, 0.05, Z(y)], [7.4, 0.1, 7.4]);
      part(b, 'box', C.yellow, [x - 1.1, 0.11, Z(y)], [0.5, 0.04, 3.2]);
      part(b, 'box', C.yellow, [x + 1.1, 0.11, Z(y)], [0.5, 0.04, 3.2]);
      part(b, 'box', C.yellow, [x, 0.11, Z(y)], [2.2, 0.04, 0.5]);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; part(b, 'sphere', k % 2 ? 0xff6b5a : 0x8bff9a, [x + Math.sin(a) * 4.3, 0.14, Z(y + Math.cos(a) * 4.3)], [0.24, 0.2, 0.24]); }
    }
    // 地面标线与杂项装饰
    for (const m of L.decor.marks) {
      const b = chunkList(m.y), col = m.color || 0xf4f1e6, a = m.a || 0;
      if (m.kind === 'line') part(b, 'box', col, [m.x, 0.025, Z(m.y)], [m.w || 0.25, 0.02, m.l || 3], [0, -a, 0]);
      else if (m.kind === 'arrow') {
        const ca = Math.cos(a), sa = Math.sin(a), fx = (dx, dy) => [m.x + dx * ca + dy * sa, Z(m.y - dx * sa + dy * ca)];
        let p = fx(0, -0.4); part(b, 'box', col, [p[0], 0.025, p[1]], [0.26, 0.02, 1.6], [0, -a, 0]);
        p = fx(-0.32, 0.6); part(b, 'box', col, [p[0], 0.026, p[1]], [0.24, 0.02, 0.9], [0, -a + 0.8, 0]);
        p = fx(0.32, 0.6); part(b, 'box', col, [p[0], 0.026, p[1]], [0.24, 0.02, 0.9], [0, -a - 0.8, 0]);
      } else if (m.kind === 'hatch') {
        for (let k = -2; k <= 2; k++) part(b, 'box', col, [m.x + k * 0.6, 0.025, Z(m.y)], [0.22, 0.02, (m.l || 3)], [0, 0.5, 0]);
      } else if (m.kind === 'emblem') {
        part(b, 'cone4', 0x7a2a22, [m.x, 0.06, Z(m.y)], [m.s || 6, 0.1, (m.s || 6) * 0.6], [0, Math.PI / 4, 0]);
        part(b, 'sphere', 0xe9e2cf, [m.x, 0.14, Z(m.y + 0.2)], [1.4, 0.06, 1.2]);
        for (const s of [-1, 1]) part(b, 'sphere', 0x2b2b2b, [m.x + s * 0.32, 0.18, Z(m.y + 0.35)], [0.34, 0.04, 0.3]);
        part(b, 'box', 0xe9e2cf, [m.x, 0.13, Z(m.y - 0.75)], [0.9, 0.05, 0.4]);
      }
    }
    for (const p of L.decor.props) {
      const b = chunkList(p.y), a = p.a || 0;
      if (p.kind === 'log') { part(b, 'cyl', 0xd2bd8c, [p.x, 0.4, Z(p.y)], [0.8, p.l || 2.6, 0.8], [0, -a, Math.PI / 2]); part(b, 'cyl', 0xb9a679, [p.x + Math.cos(a) * (p.l || 2.6) / 2, 0.4, Z(p.y - Math.sin(a) * (p.l || 2.6) / 2)], [0.82, 0.1, 0.82], [0, -a, Math.PI / 2]); }
      else if (p.kind === 'lamp') { part(b, 'cyl6', 0x55595d, [p.x, 1.6, Z(p.y)], [0.14, 3.2, 0.14]); part(b, 'box', 0x55595d, [p.x + 0.4, 3.2, Z(p.y)], [0.9, 0.1, 0.16]); part(b, 'sphere', 0xfff2b0, [p.x + 0.8, 3.08, Z(p.y)], [0.3, 0.16, 0.3]); }
      else if (p.kind === 'crane') {
        for (const [dx, dy] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) part(b, 'box', 0xe0a83a, [p.x + dx, 3.2, Z(p.y + dy)], [0.3, 6.4, 0.3]);
        part(b, 'box', 0xe0a83a, [p.x, 6.5, Z(p.y)], [3.4, 0.4, 3.4]);
        part(b, 'box', 0xd0982a, [p.x, 6.95, Z(p.y + 3)], [0.6, 0.5, 12], [0, 0, 0]);
        part(b, 'box', 0x3b3f42, [p.x, 7.4, Z(p.y - 0.6)], [1.6, 1.0, 1.6]);
        part(b, 'cyl6', 0x2b2b2b, [p.x, 4.8, Z(p.y + 7)], [0.06, 4.0, 0.06]);
      } else if (p.kind === 'bollard') { part(b, 'cyl', 0x3b3f42, [p.x, 0.35, Z(p.y)], [0.4, 0.7, 0.4]); part(b, 'cyl', 0x3b3f42, [p.x, 0.72, Z(p.y)], [0.56, 0.1, 0.56]); }
      else if (p.kind === 'tunnel') {
        part(b, 'rbox2', 0x6e5a40, [p.x, 1.6, Z(p.y)], [6.0, 3.2, 3.0]);
        part(b, 'cyl', 0x1a1612, [p.x, 1.2, Z(p.y) + 1.4], [2.6, 0.3, 2.4], [Math.PI / 2, 0, 0]);
        part(b, 'box', 0x8a8780, [p.x, 2.7, Z(p.y) + 1.5], [3.6, 0.4, 0.3]);
      } else if (p.kind === 'track') {
        const len = p.l || 2, ca = Math.cos(a), sa = Math.sin(a);
        for (let k = 0; k < len; k += 1) part(b, 'box', 0x6b4a2e, [p.x + sa * (k - len / 2 + 0.5), 0.05, Z(p.y + ca * (k - len / 2 + 0.5))], [1.6, 0.1, 0.3], [0, -a, 0]);
        for (const s of [-0.5, 0.5]) part(b, 'box', 0x8e969c, [p.x + ca * s, 0.13, Z(p.y - sa * s)], [0.12, 0.1, len], [0, -a, 0]);
      } else if (p.kind === 'flag') {
        part(b, 'cyl6', 0x8e969c, [p.x, 2.2, Z(p.y)], [0.1, 4.4, 0.1]);
        part(b, 'box', 0xc9583f, [p.x + 0.6, 3.9, Z(p.y)], [1.2, 0.7, 0.04]);
      } else if (p.kind === 'statueDecor') {
        part(b, 'rbox', 0x9c9a92, [p.x, 0.6, Z(p.y)], [1.6, 1.2, 1.6]);
        part(b, 'sphere', 0xe6e0cf, [p.x, 1.9, Z(p.y)], [1.2, 1.4, 1.1]);
      }
    }
    for (const [, list] of chunks) {
      const g = merged(list);
      const m = new THREE.Mesh(g, MAT.flat); m.castShadow = true; m.receiveShadow = true;
      add(m);
    }

    // ---------- 可破坏 / 独立物体 ----------
    const hutStyle = cfg.hutStyle || 'wood', gateStyle = cfg.gateStyle || 'wood';
    let jetG = null;
    for (const s of L.statics) {
      if (!s) continue;
      let m = null;
      if (s.kind === 'hut') { m = mesh(hutGeo(s.x1 - s.x0, s.y1 - s.y0, false, s.data.style || hutStyle)); m.receiveShadow = true; }
      else if (s.kind === 'gate') { m = mesh(gateGeo(false, s.data.style || gateStyle, s.data.ew ? s.y1 - s.y0 : s.x1 - s.x0)); if (s.data.ew) m.rotation.y = Math.PI / 2; }
      else if (s.kind === 'barrel') m = mesh(barrelGeo());
      else if (s.kind === 'sandbag') m = mesh(sandbagGeo(s.x1 - s.x0));
      else if (s.kind === 'crate') m = mesh(crateGeo());
      else if (s.kind === 'jet') { if (!jetG) jetG = jetGeo(); m = mesh(jetG); m.rotation.y = s.data.a || 0; }
      if (m) {
        m.position.set(s.x, 0, Z(s.y));
        if (s.kind === 'crate') m.rotation.y = (s.id % 4) * 0.3;
        add(m);
        handles.set(s.id, { mesh: m, kind: s.kind });
      }
    }
    // Boss 入口路障（开战前埋在地下）
    W.barricade = null;
    if (L.BARRICADE) {
      const B = L.BARRICADE, w = B.x1 - B.x0, b = [];
      for (let x = -w / 2 + 0.5; x < w / 2; x += 1) {
        part(b, 'rbox2', (x | 0) % 2 ? C.sand : 0xd9bf82, [x, 0.25, 0], [1.05, 0.5, 1.6]);
        part(b, 'rbox2', (x | 0) % 2 ? 0xd9bf82 : C.sand, [x + 0.5, 0.72, 0], [1.05, 0.46, 1.4]);
      }
      for (let x = -w / 2 + 0.5; x <= w / 2; x += w / 3) part(b, 'cyl', C.woodD, [x, 0.9, -0.85], [0.3, 1.8, 0.3]);
      part(b, 'box', C.wood, [0, 1.5, -0.85], [w, 0.25, 0.25]);
      const m = mesh(merged(b));
      m.position.set(B.x, -2.2, Z((B.y0 + B.y1) / 2)); m.visible = false;
      add(m);
      W.barricade = m;
    }

    // ---------- 崖顶台地（实例化，可单块隐藏） ----------
    if (L.BLUFFS.length) {
      const inst = new THREE.InstancedMesh(S.bluff, MAT.flat, L.BLUFFS.length);
      const d = new THREE.Object3D(), col = new THREE.Color();
      L.BLUFFS.forEach((s, k) => {
        d.position.set(s.x, 0, Z(s.y)); d.rotation.set(0, (k % 4) * Math.PI / 2, 0); d.scale.set(1, 1, 1); d.updateMatrix();
        inst.setMatrixAt(k, d.matrix);
        col.setScalar(0.96 + R() * 0.06); inst.setColorAt(k, col);
        handles.set(s.id, { inst, index: k, kind: 'bluff', matrix: d.matrix.clone() });
      });
      inst.castShadow = true; inst.receiveShadow = true; inst.computeBoundingSphere();
      add(inst);
    }

    // ---------- 树林与装饰（按 32 单位区块实例化） ----------
    function instanced(geo, items, opts) {
      if (!items.length) return;
      const bands = new Map();
      for (const it of items) { const k = Math.floor(it.y / 32); if (!bands.has(k)) bands.set(k, []); bands.get(k).push(it); }
      const d = new THREE.Object3D(), col = new THREE.Color();
      for (const [, list] of bands) {
        const im = new THREE.InstancedMesh(geo, MAT.flat, list.length);
        list.forEach((it, n) => {
          d.position.set(it.x, it.h || 0, Z(it.y)); d.rotation.set(0, it.a !== undefined ? -it.a : (it.x * 7.3 + it.y * 3.1) % 6.28, 0);
          const s = it.s || 1; d.scale.set(s, s * (opts && opts.squash ? 1 : (0.9 + ((it.x * 13.7) % 1 + 1) % 1 * 0.25)), s); d.updateMatrix();
          im.setMatrixAt(n, d.matrix);
          if (opts && opts.colors) { const L2 = opts.colors.length; col.setHex(opts.colors[(((n + Math.floor(it.x)) % L2) + L2) % L2]); }
          else if (opts && opts.tint) col.setHex(opts.tint).multiplyScalar(0.9 + ((it.y * 5.3) % 1 + 1) % 1 * 0.2);
          else col.setScalar(0.88 + ((it.y * 5.3) % 1 + 1) % 1 * 0.22);
          im.setColorAt(n, col);
        });
        im.castShadow = !(opts && opts.noShadow); im.receiveShadow = true; im.computeBoundingSphere();
        add(im);
      }
    }
    const treeTint = cfg.treeTint || null;
    const outer = L.decor.outerTrees;
    for (let v = 0; v < 3; v++) instanced(S.trees[v], L.decor.trees.filter(t => t.v === v).concat(outer.filter(t => t.v === v && t.kind !== 'pine')), treeTint ? { tint: treeTint } : null);
    instanced(S.pine, L.decor.pines.concat(outer.filter(t => t.kind === 'pine')));
    instanced(S.palm, L.decor.palms);
    instanced(S.bush, L.decor.bushes, { noShadow: true, tint: cfg.bushTint || undefined });
    instanced(S.flower, L.decor.flowers, { noShadow: true, squash: true, colors: [0xfff3a0, 0xffb3c7, 0xffffff, 0xc9b6ff] });
    instanced(S.rock, L.decor.rocks, cfg.rockTint ? { tint: cfg.rockTint } : null);
    instanced(S.tuft, L.decor.tufts, { noShadow: true, squash: true, tint: cfg.tuftTint || undefined });
    instanced(S.reed, L.decor.reeds, { noShadow: true, squash: true });
    // 草篱 / 沼泽石边（hedge 静态物体）
    const hedges = [], rims = [];
    for (const s of L.statics) if (s && s.kind === 'hedge') for (const c of s.cells) { const i = c % L.COLS, j = Math.floor(c / L.COLS); (s.data.style === 'rim' ? rims : hedges).push({ x: L.cellX(i), y: L.cellY(j), s: 1 }); }
    instanced(S.hedge, hedges, cfg.hedgeTint ? { tint: cfg.hedgeTint } : null);
    instanced(S.swampRim, rims);
    W.root = root;
  }

  function disposeStage() {
    if (!root) return;
    root.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.geometry && !isCached(o.geometry) && !(SHARED && SHARED.set.has(o.geometry))) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.stage) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      }
    });
    scene.remove(root);
    root = null; W.conveyorMeshes = [];
  }

  W.rebuild = () => { disposeStage(); build(); };

  // ---------- 接口 ----------
  W.removeStatic = (s) => {
    const h = handles.get(s.id);
    if (!h) return;
    if (h.inst) {
      const d = new THREE.Object3D(); d.scale.set(0, 0, 0); d.updateMatrix();
      h.inst.setMatrixAt(h.index, d.matrix); h.inst.instanceMatrix.needsUpdate = true;
    } else if (h.mesh) {
      if (s.kind === 'hut') { h.mesh.geometry = hutGeo(s.x1 - s.x0, s.y1 - s.y0, true, s.data.style || L.STAGE.hutStyle || 'wood'); }
      else if (s.kind === 'gate') { h.mesh.geometry = gateGeo(true, s.data.style || L.STAGE.gateStyle || 'wood', s.data.ew ? s.y1 - s.y0 : s.x1 - s.x0); }
      else { h.mesh.visible = false; }
    }
  };
  W.hitFlash = (s) => {
    const h = handles.get(s.id);
    if (h && h.mesh) { h.mesh.userData.shake = 0.25; }
  };
  W.update = (t, dt) => {
    waterUni.uTime.value = t;
    for (const [id, h] of handles) {
      if (h.mesh && h.mesh.userData.shake > 0) {
        h.mesh.userData.shake -= dt;
        h.mesh.position.x += Math.sin(t * 90) * 0.04;
        if (h.mesh.userData.shake <= 0) { const s = L.statics[id]; if (s) h.mesh.position.x = s.x; }
      }
    }
    for (const m of W.conveyorMeshes || []) m.userData.tex.offset.y = (m.userData.tex.offset.y + dt * m.userData.speed / 2) % 1;
  };
  W.resetAll = () => {
    for (const s of L.statics) {
      if (!s) continue;
      const h = handles.get(s.id);
      if (!h) continue;
      if (h.inst) { h.inst.setMatrixAt(h.index, h.matrix); h.inst.instanceMatrix.needsUpdate = true; }
      else if (h.mesh) {
        if (s.kind === 'hut') h.mesh.geometry = hutGeo(s.x1 - s.x0, s.y1 - s.y0, false, s.data.style || L.STAGE.hutStyle || 'wood');
        else if (s.kind === 'gate') h.mesh.geometry = gateGeo(false, s.data.style || L.STAGE.gateStyle || 'wood', s.data.ew ? s.y1 - s.y0 : s.x1 - s.x0);
        h.mesh.visible = true; h.mesh.position.x = s.x; h.mesh.userData.shake = 0;
      }
    }
    W.raiseBarricade(0);
  };
  W.raiseBarricade = (k) => { if (!W.barricade) return; W.barricade.visible = k > 0; W.barricade.position.y = -2.2 + 2.2 * k; };
  return W;
}
