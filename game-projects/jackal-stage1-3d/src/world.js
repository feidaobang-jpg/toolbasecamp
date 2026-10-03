// 静态场景：地面、海与河、围墙、桥、直升机坪、营房、崖顶台地、树林（按区块实例化以便视锥剔除）
import * as THREE from 'three';
import * as L from './level.js';
import { part, merged, mesh, MAT, C, hutGeo, gateGeo, barrelGeo, sandbagGeo, crateGeo, BASE } from './models.js';
import { fixedRng } from './core.js';

const Z = (y) => -y;   // 逻辑 y（北）→ three 的 -Z

const CELL_COLOR = {
  [L.T.GRASS]: new THREE.Color(0x86c868), [L.T.SAND]: new THREE.Color(0xf3e3b2), [L.T.ROAD]: new THREE.Color(0xcfae84),
  [L.T.WATER]: new THREE.Color(0x3e9fb6), [L.T.SEA]: new THREE.Color(0x2f88a9), [L.T.BRIDGE]: new THREE.Color(0x3e9fb6),
  [L.T.FLOOR]: new THREE.Color(0xd3ba8e), [L.T.DIRT]: new THREE.Color(0xc9b383), [L.T.PAD]: new THREE.Color(0xd9d6c8)
};
const CELL_H = { [L.T.WATER]: -1.3, [L.T.SEA]: -1.9, [L.T.BRIDGE]: -1.3 };

export function buildWorld(scene) {
  const R = fixedRng(77);
  const W = {};
  const handles = new Map();   // 静态物体 id → { mesh, inst, kind }

  // ---------- 天空与雾 ----------
  scene.background = new THREE.Color(0xbfe8ec);
  scene.fog = new THREE.Fog(0xcdeee4, 60, 150);

  // ---------- 灯光 ----------
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

  // ---------- 地面网格（顶点高度 + 顶点色，一次绘制） ----------
  {
    const VX = L.COLS + 1, VY = L.ROWS + 1;
    const pos = new Float32Array(VX * VY * 3), col = new Float32Array(VX * VY * 3);
    const tmp = new THREE.Color(), acc = new THREE.Color();
    const bluffCell = new Uint8Array(L.COLS * L.ROWS);
    for (const b of L.BLUFFS) for (const c of b.cells) bluffCell[c] = 1;
    for (let j = 0; j < VY; j++) for (let i = 0; i < VX; i++) {
      let h = 0, n = 0; acc.setRGB(0, 0, 0);
      for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
        const ii = Math.min(L.COLS - 1, Math.max(0, i + di)), jj = Math.min(L.ROWS - 1, Math.max(0, j + dj));
        const c = L.idx(ii, jj), t = L.terrain[c];
        h += CELL_H[t] || 0;
        tmp.copy(CELL_COLOR[t]);
        if (bluffCell[c]) tmp.setHex(0xb59c74);
        acc.add(tmp); n++;
      }
      h /= n; acc.multiplyScalar(1 / n);
      const x = L.X0 + i, y = j;
      // 草地上的大块明暗与细碎噪点
      const patch = 0.09 * Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) * Math.cos(y * 0.17 + x * 0.05) + 0.05 * Math.sin(x * 0.9 + y * 0.6) * Math.sin(y * 0.8 - x * 0.3);
      const k = 1 + patch + (R() - 0.5) * 0.05;
      const v = (j * VX + i) * 3;
      pos[v] = x; pos[v + 1] = h + (h < 0 ? 0 : (R() - 0.5) * 0.03); pos[v + 2] = Z(y);
      col[v] = acc.r * k; col[v + 1] = acc.g * k; col[v + 2] = acc.b * k;
    }
    // 按 44 行一块拆分，便于视锥剔除
    const posAttr = new THREE.BufferAttribute(pos, 3), colAttr = new THREE.BufferAttribute(col, 3);
    const full = new THREE.BufferGeometry();
    full.setAttribute('position', posAttr); full.setAttribute('color', colAttr);
    const allIdx = [];
    for (let j = 0; j < L.ROWS; j++) for (let i = 0; i < L.COLS; i++) { const a = j * VX + i, b = a + 1, c = a + VX, d = c + 1; allIdx.push(a, b, d, a, d, c); }
    full.setIndex(allIdx); full.computeVertexNormals();
    const nrm = full.getAttribute('normal');
    const gmat = new THREE.MeshLambertMaterial({ vertexColors: true });
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
      const m = new THREE.Mesh(g, gmat); m.receiveShadow = true; scene.add(m);
    }
    full.dispose();
    const ground = { isGroundGroup: true };
    W.ground = ground;
  }
  // 场外地面（装饰林下方）与海床
  {
    // 场外只在关卡网格之外铺设，避免盖住网格内的河道与海岸
    const grassM = new THREE.MeshLambertMaterial({ color: 0x6fae5a });
    const bedM = new THREE.MeshLambertMaterial({ color: 0x2c84a6 });
    const strip = (x0, x1, y0, y1, h, m) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), m);
      p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, h, Z((y0 + y1) / 2)); p.receiveShadow = m === grassM;
      scene.add(p);
    };
    strip(-100, -36, 44, 109, -0.02, grassM); strip(-100, -36, 129, 420, -0.02, grassM);
    strip(36, 100, 6, 109, -0.02, grassM); strip(36, 100, 129, 420, -0.02, grassM);
    strip(-36, 36, 352, 420, -0.02, grassM);
    strip(-100, -36, 109, 129, -1.3, bedM); strip(36, 100, 109, 129, -1.3, bedM);
    strip(-120, 120, -80, 6, -1.9, bedM); strip(-120, -36, 6, 44, -1.9, bedM);
  }

  // ---------- 水面（海 + 河），顶点波动 ----------
  {
    const water = new THREE.MeshPhongMaterial({ color: 0x35a6c6, transparent: true, opacity: 0.86, shininess: 90, specular: 0xe8ffff, depthWrite: false });
    const uni = { uTime: { value: 0 } };
    water.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 wp0 = modelMatrix * vec4(position,1.0);\ntransformed.z += 0.07*sin(wp0.x*0.7+uTime*1.6)+0.05*sin(wp0.z*0.9-uTime*1.2);');
      sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n');
    };
    W.waterUni = uni;
    // 海面只用一整块，避免两块半透明面重叠产生接缝；陆地会遮住它
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 132, 50, 33), water);
    sea.rotation.x = -Math.PI / 2; sea.position.set(-40, -0.35, Z(-16)); sea.renderOrder = 2; scene.add(sea);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(200, 20, 50, 10), water);
    river.rotation.x = -Math.PI / 2; river.position.set(0, -0.35, Z(119)); river.renderOrder = 2; scene.add(river);
    W.water = water;
  }

  // ---------- 合并的不可破坏物体（按 y 区块） ----------
  const chunks = new Map();
  const chunkList = (y) => { const k = Math.floor(y / 40); if (!chunks.has(k)) chunks.set(k, []); return chunks.get(k); };
  for (const s of L.statics) {
    if (!s) continue;
    if (s.kind === 'wall') {
      for (const c of s.cells) {
        const i = c % L.COLS, j = Math.floor(c / L.COLS), x = L.cellX(i), y = L.cellY(j), b = chunkList(y);
        const tone = R() < 0.5 ? C.stone : 0xc8bd9f;
        part(b, 'rbox', tone, [x, 0.85, Z(y)], [1.02, 1.7, 1.02]);
        part(b, 'box', C.stoneD, [x, 1.76, Z(y)], [1.08, 0.16, 1.08]);
        if ((i + j) % 2 === 0) part(b, 'rbox', tone, [x, 2.0, Z(y)], [0.6, 0.38, 0.6]);
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
      for (let y = s.y0 + 0.5; y < s.y1; y += 2) part(b, 'cyl', C.woodD, [s.x, 0.45, Z(y)], [0.24, 1.0, 0.24]);
      part(b, 'box', C.wood, [s.x, 0.8, Z(s.y)], [0.18, 0.16, s.y1 - s.y0]);
      part(b, 'box', C.wood, [s.x, 0.45, Z(s.y)], [0.14, 0.12, s.y1 - s.y0]);
    }
  }
  // 桥面
  {
    const b = chunkList(119);
    for (let y = 109.25; y < 129; y += 0.5) part(b, 'box', ((y * 2) | 0) % 2 ? C.wood : 0xc58f5b, [-21, -0.08, Z(y)], [7.6, 0.18, 0.44]);
    for (const x of [-23.5, -18.5]) part(b, 'box', C.woodD, [x, -0.32, Z(119)], [0.5, 0.36, 20]);
    for (let y = 112; y <= 126; y += 4) for (const x of [-24, -18]) part(b, 'cyl', C.woodD, [x, -1.0, Z(y)], [0.5, 2.0, 0.5]);
  }
  // 直升机坪
  {
    const b = chunkList(L.PAD.y), x = L.PAD.x, y = L.PAD.y;
    part(b, 'cyl', C.yellow, [x, 0.03, Z(y)], [8.2, 0.08, 8.2]);
    part(b, 'cyl', 0xd8d5c8, [x, 0.05, Z(y)], [7.4, 0.1, 7.4]);
    part(b, 'box', C.yellow, [x - 1.1, 0.11, Z(y)], [0.5, 0.04, 3.2]);
    part(b, 'box', C.yellow, [x + 1.1, 0.11, Z(y)], [0.5, 0.04, 3.2]);
    part(b, 'box', C.yellow, [x, 0.11, Z(y)], [2.2, 0.04, 0.5]);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; part(b, 'sphere', k % 2 ? 0xff6b5a : 0x8bff9a, [x + Math.sin(a) * 4.3, 0.14, Z(y + Math.cos(a) * 4.3)], [0.24, 0.2, 0.24]); }
  }
  for (const [k, list] of chunks) {
    const g = merged(list);
    const m = new THREE.Mesh(g, MAT.flat); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  // ---------- 可破坏 / 独立物体 ----------
  for (const s of L.statics) {
    if (!s) continue;
    let m = null;
    if (s.kind === 'hut') { m = mesh(hutGeo(s.x1 - s.x0, s.y1 - s.y0, false)); m.receiveShadow = true; }
    else if (s.kind === 'gate') m = mesh(gateGeo(false));
    else if (s.kind === 'barrel') m = mesh(barrelGeo());
    else if (s.kind === 'sandbag') m = mesh(sandbagGeo(s.x1 - s.x0));
    else if (s.kind === 'crate') m = mesh(crateGeo());
    if (m) {
      m.position.set(s.x, 0, Z(s.y));
      if (s.kind === 'crate') m.rotation.y = (s.id % 4) * 0.3;
      scene.add(m);
      handles.set(s.id, { mesh: m, kind: s.kind });
    }
  }
  // Boss 入口路障（开战前埋在地下）
  {
    const b = [];
    for (let x = -7.5; x < 8; x += 1) {
      part(b, 'rbox2', (x | 0) % 2 ? C.sand : 0xd9bf82, [x, 0.25, 0], [1.05, 0.5, 1.6]);
      part(b, 'rbox2', (x | 0) % 2 ? 0xd9bf82 : C.sand, [x + 0.5, 0.72, 0], [1.05, 0.46, 1.4]);
    }
    for (const x of [-7.5, -2.5, 2.5, 7.5]) part(b, 'cyl', C.woodD, [x, 0.9, -0.85], [0.3, 1.8, 0.3]);
    part(b, 'box', C.wood, [0, 1.5, -0.85], [16, 0.25, 0.25]);
    const m = mesh(merged(b));
    m.position.set(0, -2.2, Z(305)); m.visible = false;
    scene.add(m);
    W.barricade = m;
  }

  // ---------- 崖顶台地（实例化，可单块隐藏） ----------
  {
    const b = [];
    part(b, 'rbox2', 0xc6a983, [0, 1.3, 0], [2.02, 2.6, 2.02]);
    part(b, 'rbox', 0xb39470, [0.35, 0.7, -0.62], [1.1, 1.0, 0.9]);
    part(b, 'rbox', 0xd3b994, [-0.4, 1.6, 0.6], [1.0, 1.2, 0.9]);
    part(b, 'box', 0x84c46a, [0, 2.62, 0], [2.0, 0.3, 2.0]);
    part(b, 'rbox', 0x77b660, [0, 2.5, 0], [2.04, 0.2, 2.04]);
    const g = merged(b);
    const inst = new THREE.InstancedMesh(g, MAT.flat, L.BLUFFS.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    L.BLUFFS.forEach((s, k) => {
      d.position.set(s.x, 0, Z(s.y)); d.rotation.set(0, (k % 4) * Math.PI / 2, 0); d.scale.set(1, 1, 1); d.updateMatrix();
      inst.setMatrixAt(k, d.matrix);
      col.setScalar(0.96 + R() * 0.06); inst.setColorAt(k, col);
      handles.set(s.id, { inst, index: k, kind: 'bluff', matrix: d.matrix.clone() });
    });
    inst.castShadow = true; inst.receiveShadow = true; inst.computeBoundingSphere();
    scene.add(inst);
    W.bluffInst = inst;
  }

  // ---------- 树林（按 32 单位区块实例化） ----------
  const treeGeos = [
    (() => { const b = []; part(b, 'cyl6', 0x8a5a36, [0, 0.6, 0], [0.34, 1.2, 0.34]); part(b, 'ico', 0x4fae55, [0, 1.75, 0], [1.9, 1.6, 1.9]); part(b, 'ico', 0x63c260, [0.25, 2.35, 0.15], [1.25, 1.1, 1.25]); return merged(b); })(),
    (() => { const b = []; part(b, 'cyl6', 0x7d5232, [0, 0.5, 0], [0.3, 1.0, 0.3]); part(b, 'cone', 0x3f9a58, [0, 1.6, 0], [1.9, 1.6, 1.9]); part(b, 'cone', 0x52b062, [0, 2.4, 0], [1.4, 1.3, 1.4]); return merged(b); })(),
    (() => { const b = []; part(b, 'cyl6', 0x8a5a36, [0, 0.55, 0], [0.32, 1.1, 0.32]); part(b, 'ico', 0x5cb84e, [-0.35, 1.6, 0.1], [1.3, 1.2, 1.3]); part(b, 'ico', 0x6cc65a, [0.4, 1.7, -0.2], [1.3, 1.25, 1.3]); part(b, 'ico', 0x7ad063, [0, 2.3, 0], [1.2, 1.1, 1.2]); return merged(b); })()
  ];
  const palmGeo = (() => {
    const b = [];
    for (let k = 0; k < 4; k++) part(b, 'cyl6', k % 2 ? 0xa77b4f : 0x93683f, [k * 0.12, 0.4 + k * 0.8, 0], [0.3 - k * 0.03, 0.82, 0.3 - k * 0.03], [0, 0, -0.12]);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; part(b, 'cone', k % 2 ? 0x55b449 : 0x3f9c45, [0.5 + Math.sin(a) * 0.8, 3.15, Math.cos(a) * 0.8], [0.45, 1.8, 0.18], [Math.cos(a) * 1.15, a, -Math.sin(a) * 1.15]); }
    part(b, 'sphere', 0x7b5a32, [0.45, 3.2, 0], [0.32, 0.3, 0.32]);
    return merged(b);
  })();
  const bushGeo = (() => { const b = []; part(b, 'ico', 0x58b45a, [0, 0.35, 0], [1.1, 0.75, 1.0]); part(b, 'ico', 0x6dc560, [0.35, 0.5, 0.1], [0.7, 0.6, 0.7]); return merged(b); })();
  const flowerGeo = (() => { const b = []; part(b, 'cyl6', 0x4e8f4c, [0, 0.15, 0], [0.06, 0.3, 0.06]); part(b, 'ico', 0xffffff, [0, 0.34, 0], [0.26, 0.18, 0.26]); return merged(b); })();
  const tuftGeo = (() => { const b = []; for (let k = 0; k < 3; k++) { const a = k * 2.1; part(b, 'cone4', k % 2 ? 0x5fa54c : 0x6cb456, [Math.sin(a) * 0.12, 0.22, Math.cos(a) * 0.12], [0.12, 0.45, 0.12], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]); } return merged(b); })();
  const rockGeo = (() => { const b = []; part(b, 'dode', 0xa9a49a, [0, 0.4, 0], [1.2, 0.9, 1.1]); part(b, 'dode', 0xbdb8ad, [0.35, 0.3, 0.3], [0.7, 0.6, 0.6]); return merged(b); })();

  function instanced(geo, items, mat, opts) {
    const bands = new Map();
    for (const it of items) { const k = Math.floor(it.y / 32); if (!bands.has(k)) bands.set(k, []); bands.get(k).push(it); }
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (const [, list] of bands) {
      const im = new THREE.InstancedMesh(geo, mat || MAT.flat, list.length);
      list.forEach((it, n) => {
        d.position.set(it.x, 0, Z(it.y)); d.rotation.set(0, (it.x * 7.3 + it.y * 3.1) % 6.28, 0);
        const s = it.s || 1; d.scale.set(s, s * (opts && opts.squash ? 1 : (0.9 + ((it.x * 13.7) % 1 + 1) % 1 * 0.25)), s); d.updateMatrix();
        im.setMatrixAt(n, d.matrix);
        if (opts && opts.colors) { const L2 = opts.colors.length; col.setHex(opts.colors[(((n + Math.floor(it.x)) % L2) + L2) % L2]); } else col.setScalar(0.88 + ((it.y * 5.3) % 1 + 1) % 1 * 0.22);
        im.setColorAt(n, col);
      });
      im.castShadow = !(opts && opts.noShadow); im.receiveShadow = true; im.computeBoundingSphere();
      scene.add(im);
    }
  }
  for (let v = 0; v < 3; v++) instanced(treeGeos[v], L.decor.trees.filter(t => t.v === v).concat(L.decor.outerTrees.filter(t => t.v === v)));
  instanced(palmGeo, L.decor.palms);
  instanced(bushGeo, L.decor.bushes, null, { noShadow: true });
  instanced(flowerGeo, L.decor.flowers, null, { noShadow: true, squash: true, colors: [0xfff3a0, 0xffb3c7, 0xffffff, 0xc9b6ff] });
  instanced(rockGeo, L.decor.rocks);
  instanced(tuftGeo, L.decor.tufts, null, { noShadow: true, squash: true });

  // ---------- 接口 ----------
  W.removeStatic = (s, ruinKind) => {
    const h = handles.get(s.id);
    if (!h) return;
    if (h.inst) {
      const d = new THREE.Object3D(); d.scale.set(0, 0, 0); d.updateMatrix();
      h.inst.setMatrixAt(h.index, d.matrix); h.inst.instanceMatrix.needsUpdate = true;
    } else if (h.mesh) {
      if (s.kind === 'hut') { h.mesh.geometry = hutGeo(s.x1 - s.x0, s.y1 - s.y0, true); }
      else if (s.kind === 'gate') { h.mesh.geometry = gateGeo(true); }
      else { h.mesh.visible = false; }
    }
  };
  W.hitFlash = (s) => {
    const h = handles.get(s.id);
    if (h && h.mesh) { h.mesh.userData.shake = 0.25; }
  };
  W.update = (t, dt) => {
    W.waterUni.uTime.value = t;
    for (const [, h] of handles) {
      if (h.mesh && h.mesh.userData.shake > 0) {
        h.mesh.userData.shake -= dt;
        h.mesh.position.x += Math.sin(t * 90) * 0.04;
        if (h.mesh.userData.shake <= 0) { const s = L.statics.find(q => q && handles.get(q.id) === h); if (s) h.mesh.position.x = s.x; }
      }
    }
  };
  W.resetAll = () => {
    for (const s of L.statics) {
      if (!s) continue;
      const h = handles.get(s.id);
      if (!h) continue;
      if (h.inst) { h.inst.setMatrixAt(h.index, h.matrix); h.inst.instanceMatrix.needsUpdate = true; }
      else if (h.mesh) {
        if (s.kind === 'hut') h.mesh.geometry = hutGeo(s.x1 - s.x0, s.y1 - s.y0, false);
        else if (s.kind === 'gate') h.mesh.geometry = gateGeo(false);
        h.mesh.visible = true; h.mesh.position.x = s.x; h.mesh.userData.shake = 0;
      }
    }
    W.raiseBarricade(0);
  };
  W.raiseBarricade = (k) => { W.barricade.visible = k > 0; W.barricade.position.y = -2.2 + 2.2 * k; };
  return W;
}
