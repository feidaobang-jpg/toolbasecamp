// 李家坡场景：1940 年冬，晋西北。南边山脚是独立团、七七二团的出发阵地；中间一面朝南的黄土坡；
// 坡顶是山崎大队的环形工事：三个碉堡、两道沙袋墙夹着的环形战壕、中间一座加固的指挥所。
// 坡上的之字形交通壕按挖掘进度一段段出现（world.setDug），山坡是真实地形（world.hgt）
import * as THREE from '../../vendor/three.module.js';
import { Geo, makeTextures, gradientTexture } from '../geo.js';
import { mulberry, clamp } from '../util.js';
import { makeKit } from '../world-kit.js';

export const L = {
  start: { x: -22, z: 62 },
  footZ: 40, crestZ: -30, top: 14,          // 坡脚、坡顶（以北是平顶）和坡顶高度
  postL: { x: -30, z: 24 }, postR: { x: 28, z: 18 },   // 山脚两个外围火力点（各在一块挖平的小台地上）
  line772: 52, lineDl: 58,                   // 七七二团、独立团的出发线
  // 交通壕：从坡脚一路之字形往上挖，挖到离环形工事三十米上下
  trench: [[0, 41], [-6, 32], [4, 24], [-5, 15], [5, 6], [-4, -4], [3, -14]],
  bunkers: [[-16, -32], [0, -32], [16, -32]],
  ringF: -34.6, ringFi: -38.2, ringX: 25, ringXi: 21.4, ringB: -62, ringBi: -58.4,
  cp: { x: 0, z: -48.5 },                    // 山崎的指挥所
  fieldX: 44, southZ: 74, northZ: -72,
};

const C = {
  loess: 0xbda57c, loess2: 0xac936c, snow: 0xe8ebed, snow2: 0xd3d8dc, mud: 0x7d6b55, crater: 0x5a5044, road: 0x9c8a6c,
  bag: 0xb3a682, bag2: 0x9f9370, rock: 0x8c8678, trunk: 0x4a3f34, leaf: 0x5d6b3a,
  conc: 0x8d8a80, conc2: 0x77746b, slit: 0x121110, dirt: 0xa1855a, dirt2: 0x8a6f4c, floor: 0x5c4a35,
};

const smooth = (k) => k * k * (3 - 2 * k);
// 坡面：坡脚以南是平地，往北一路抬到坡顶，坡顶以北是平顶。下缓上陡（凹坡），坡顶的机枪能看到整面坡
function slope(z) { const s = clamp((L.footZ - z) / (L.footZ - L.crestZ), 0, 1); return L.top * Math.pow(s, 1.35); }
// 交通壕往地下挖 1.2 米、壕宽约 1 米：三条壕（中间主壕，左右各一条）挖到哪儿，地形高度就在哪儿往下陷
const TRENCH_DEPTH = 1.2, TRENCH_HALF = 0.45, TRENCH_EDGE = 0.8;
export const TRENCH_OFFSETS = [0, -15, 15];
const dig = { segs: null, dug: 0 };
function trenchCut(x, z) {
  if (!dig.segs || dig.dug <= 0 || z > 44 || z < -18 || Math.abs(x) > 29) return 0;
  let best = 9;
  for (const ox of TRENCH_OFFSETS) {
    const lx = x - ox;
    for (const s of dig.segs) {
      if (s.t0 > dig.dug) break;
      const lim = Math.min(s.len, dig.dug - s.t0), k = clamp((lx - s.x0) * s.dx + (z - s.z0) * s.dz, 0, lim);
      const d = Math.hypot(lx - (s.x0 + s.dx * k), z - (s.z0 + s.dz * k));
      if (d < best) best = d;
    }
  }
  if (best >= TRENCH_EDGE) return 0;
  return best <= TRENCH_HALF ? TRENCH_DEPTH : TRENCH_DEPTH * (1 - smooth((best - TRENCH_HALF) / (TRENCH_EDGE - TRENCH_HALF)));
}
export function hgt(x, z) { return baseHgt(x, z) - trenchCut(x, z); }
function baseHgt(x, z) {
  let h = slope(z);
  // 外围火力点：挖平的小台地
  for (const p of [L.postL, L.postR]) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 9) { const k = d < 4.6 ? 1 : 1 - (d - 4.6) / 4.4; h += (slope(p.z) - h) * smooth(k); }
  }
  // 场地外：东西两边、北边山后、南边身后都抬成山
  const ex = Math.max(0, Math.abs(x) - L.fieldX), ez = Math.max(0, z - L.southZ, L.northZ - z);
  const e = Math.hypot(ex, ez);
  if (e > 0) h += (e * e * 0.05 + e * 0.5) * (0.85 + 0.15 * Math.sin(x * 0.11 + z * 0.07));
  return h;
}

export function buildWorld(scene) {
  const rnd = mulberry(19400322);
  const R = (a, b) => a + rnd() * (b - a);
  const tex = makeTextures();
  const world = { colliders: [], fadeables: [], group: new THREE.Group(), smokes: [], hgt };
  scene.add(world.group);
  const add = (m) => { world.group.add(m); return m; };
  const { col, sandbagRow, sandbagCol, nest, mound, rock, tree, crate } = makeKit(world, R, C);
  const matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matGround = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.ground });
  const field = new Geo();
  // 搭在坡上的东西：先按平地搭，再整体抬到地面高度（碰撞盒记下 base，便于按离地高度判断）
  const lifted = (y, fn) => {
    const p0 = field.p.length, c0 = world.colliders.length;
    fn();
    for (let i = p0 + 1; i < field.p.length; i += 3) field.p[i] += y;
    for (let i = c0; i < world.colliders.length; i++) { const c = world.colliders[i]; c.y0 = y - 0.4; c.h += y; c.base = y; }
  };
  const at = (x, z, fn) => lifted(hgt(x, z), fn);

  // ---------- 天空：灰蓝到暖黄的渐变（章节按阶段给它染成黄昏、夜里、拂晓） ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 24, 12),
    new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#5f6f86'], [0.3, '#93a1b0'], [0.47, '#cfcfca'], [0.53, '#e2d6c2'], [0.6, '#c8b9a0'], [1, '#a89a84']]), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;

  // ---------- 地面：一整张网格按地形抬高；黄土、残雪，坡中间七七二团冲锋的地方满是弹坑 ----------
  const craters = [[-4, 30, 2.6], [8, 22, 2.4], [-10, 14, 3], [12, 8, 2.6], [-2, 2, 2.8], [6, -8, 2.4], [-12, -16, 2.6], [14, -20, 2.2], [-6, 46, 2.2], [10, 44, 2.0], [-20, -2, 2.4], [22, 4, 2.6], [-18, -36, 2.4], [18, -40, 2.2], [-6, -64, 2.6]];
  {
    const gw = 200, gd = 250, sx = 134, sz = 168, cz = 0;
    const g = new THREE.PlaneGeometry(gw, gd, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(), cB = new THREE.Color();
    const groundColor = (x, z) => {      const n = Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.07 - z * 0.23) * 0.5;
      const n2 = Math.sin(x * 0.53 - z * 0.41) * 0.5 + Math.sin(x * 0.19 + z * 0.29) * 0.5;
      cA.set(C.loess).lerp(cB.set(C.loess2), 0.5 + 0.5 * n);
      // 残雪：朝南的坡面晒得多，雪少；平地和坡顶背阴处多一些
      const onSlope = z < L.footZ && z > L.crestZ;
      const snow = clamp(0.3 + 0.55 * n2 - (onSlope ? 0.35 : 0) + (z < L.crestZ - 10 ? 0.15 : 0), 0, 1);
      cA.lerp(cB.set(n > 0 ? C.snow : C.snow2), snow * 0.8);
      // 出发阵地踩成泥；环形战壕的壕底
      if ((Math.abs(z - L.line772) < 4 && Math.abs(x) < 18) || (Math.abs(z - L.lineDl) < 4 && x < -14 && x > -40)) cA.lerp(cB.set(C.mud), 0.55);
      const inRing = Math.abs(x) < L.ringX && z < L.ringF && z > L.ringB;
      const inInner = Math.abs(x) < L.ringXi && z < L.ringFi && z > L.ringBi;
      if (inRing && !inInner) cA.lerp(cB.set(C.floor), 0.6);
      for (const [cx, cz2, cr] of craters) {
        const d = Math.hypot(x - cx, z - cz2);
        if (d < cr + 1.5) cA.lerp(cB.set(C.crater), clamp((cr + 1.5 - d) / 2.5, 0, 1) * 0.85);
      }
      return cA;
    };
    // 壕沟那一片（PX0..PX1 × PZ0..PZ1，对齐大网格的格线）从大网格里挖掉，换成 5 倍细的网格
    const dx = gw / sx, dz = gd / sz;
    const ix0 = Math.floor((-27 + gw / 2) / dx), ix1 = Math.ceil((27 + gw / 2) / dx), iz0 = Math.floor((-20 + gd / 2) / dz), iz1 = Math.ceil((46 + gd / 2) / dz);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, hgt(x, z));
      const c = groundColor(x, z); colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    {
      const idx = g.index.array, keep = [];
      for (let q = 0; q < idx.length; q += 6) {
        const cell = q / 6, cx = cell % sx, czz = Math.floor(cell / sx);
        if (cx >= ix0 && cx < ix1 && czz >= iz0 && czz < iz1) continue;
        for (let k = 0; k < 6; k++) keep.push(idx[q + k]);
      }
      g.setIndex(keep);
    }
    {
      const SUB = 5, nx = (ix1 - ix0) * SUB, nz = (iz1 - iz0) * SUB;
      const X0 = -gw / 2 + ix0 * dx, Z0 = -gd / 2 + iz0 * dz;
      const pg = new THREE.PlaneGeometry((ix1 - ix0) * dx, (iz1 - iz0) * dz, nx, nz);
      pg.rotateX(-Math.PI / 2); pg.translate(X0 + (ix1 - ix0) * dx / 2, 0, Z0 + (iz1 - iz0) * dz / 2);
      const pp = pg.attributes.position, pc = new Float32Array(pp.count * 3);
      const dirt = new THREE.Color(C.floor), dirt2 = new THREE.Color(C.dirt2);
      // 边上一圈的点按大网格两端插值，和大网格严丝合缝
      const edge = (x, z) => {
        const fx = (x - X0) / dx, fz = (z - Z0) / dz, onX = Math.abs(fx - Math.round(fx)) < 1e-4, onZ = Math.abs(fz - Math.round(fz)) < 1e-4;
        if (onX && onZ) return baseHgt(x, z);
        if (onZ) { const a = Math.floor(fx), k = fx - a; return baseHgt(X0 + a * dx, z) * (1 - k) + baseHgt(X0 + (a + 1) * dx, z) * k; }
        const a = Math.floor(fz), k = fz - a; return baseHgt(x, Z0 + a * dz) * (1 - k) + baseHgt(x, Z0 + (a + 1) * dz) * k;
      };
      const border = (i) => { const c = i % (nx + 1), r = Math.floor(i / (nx + 1)); return c === 0 || r === 0 || c === nx || r === nz; };
      const refresh = () => {
        for (let i = 0; i < pp.count; i++) {
          const x = pp.getX(i), z = pp.getZ(i), cutD = trenchCut(x, z);
          pp.setY(i, border(i) ? edge(x, z) : baseHgt(x, z) - cutD);
          const c = groundColor(x, z);
          if (cutD > 0.05) c.lerp(cutD > 0.9 ? dirt : dirt2, 0.85);
          pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
        }
        pp.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.computeVertexNormals();
      };
      pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
      const puv = pg.attributes.uv;
      for (let i = 0; i < pp.count; i++) puv.setXY(i, pp.getX(i) / 7, pp.getZ(i) / 7);
      refresh();
      const patch = new THREE.Mesh(pg, matGround); patch.receiveShadow = true; add(patch);
      world.refreshTrenchGround = refresh;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 7, pos.getZ(i) / 7);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, matGround);
    ground.receiveShadow = true;
    add(ground);
  }
  // 远山
  {
    const g = new Geo();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + R(-0.05, 0.05);
      const r = R(210, 280);
      const h = R(45, 90);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      g.cyl(R(55, 95), h, x, h / 2 - 6, z, i % 3 ? 0x8f8474 : 0x847a6a, 6, 0.25, 0, R(0, 3), 0, 0.35);
      g.cyl(R(16, 26), h * 0.22, x, h * 0.9 - 6, z, 0xe2e5e8, 6, 0.2, 0, R(0, 3), 0, 0.2);
    }
    add(g.build(matVC, { cast: false, receive: false }));
  }

  // ---------- 山脚：独立团、七七二团的出发阵地 ----------
  sandbagRow(field, -14, 14, L.line772, 3); col(-14, 14, L.line772 - 0.42, L.line772 + 0.42, 1.0, 'bags');
  sandbagRow(field, -38, -16, L.lineDl, 3); col(-38, -16, L.lineDl - 0.42, L.lineDl + 0.42, 1.0, 'bags');
  crate(field, -26, 63, 1.8, 0.8, 1.4); crate(field, -32, 64, 1.6, 0.8, 1.4, 0x7a6a3c); crate(field, 8, 57, 1.8, 0.8, 1.4);
  for (const [x, z, s] of [[-40, 66, 1.4], [24, 60, 1.6], [36, 50, 1.3], [-8, 66, 1.1]]) rock(field, x, z, s);
  for (const [x, z, h] of [[-40, 52, 5], [30, 66, 4.6], [40, 46, 5.2], [-12, 70, 4.4], [16, 68, 4.8]]) tree(field, x, z, h, true);

  // ---------- 坡上：铁丝网（只拦主角；挡在两个火力点正面，逼着从侧面绕上去）、石头、枯树、土坎 ----------
  for (const [x0, x1] of [[-37, -23], [21, 35]]) {
    const z = 34;
    at((x0 + x1) / 2, z, () => {
      for (let x = x0; x <= x1; x += 2.5) { field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, 0.2); field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, -0.2); }
      for (const [yy, zz] of [[0.75, 0], [0.42, 0.12], [0.58, -0.12], [0.2, 0]]) field.box(x1 - x0, 0.035, 0.035, (x0 + x1) / 2, yy, z + zz, 0x55504a, 0, 0, 0, 0);
      col(x0, x1, z - 0.28, z + 0.28, 0.8, 'wire', { heroOnly: true });
    });
  }
  for (const [x, z, s] of [[-38, 40, 1.4], [36, 36, 1.6], [-16, 26, 1.1], [20, 30, 1.2], [-36, 6, 1.5], [34, 2, 1.4], [-24, -12, 1.3], [26, -16, 1.2], [-40, -24, 1.6], [38, -26, 1.4]]) at(x, z, () => rock(field, x, z, s));
  for (const [x, z, h] of [[-42, 30, 4.6], [42, 26, 4.4], [-38, -6, 4.2], [40, -10, 4.8], [-14, 36, 3.6]]) at(x, z, () => tree(field, x, z, h, true));
  for (const [x, z, w] of [[-18, 12, 4.4], [18, -4, 4.6], [-28, -18, 4], [24, 30, 4.2]]) at(x, z, () => mound(field, x, z, w));

  // ---------- 山脚两个外围火力点（第一阶段要拔掉） ----------
  world.nests = {};
  for (const [id, p, side] of [['PL', L.postL, -1], ['PR', L.postR, 1]]) {
    lifted(slope(p.z), () => {
      world.nests[id] = nest(field, p.x, p.z, id, 1);
      sandbagRow(field, p.x - 6.5, p.x - 3.2, p.z + 1.4, 2); col(p.x - 6.5, p.x - 3.2, p.z + 1.0, p.z + 1.8, 0.7, 'bags');
      sandbagRow(field, p.x + 3.2, p.x + 6.5, p.z + 1.4, 2); col(p.x + 3.2, p.x + 6.5, p.z + 1.0, p.z + 1.8, 0.7, 'bags');
      crate(field, p.x + side * 2.8, p.z - 3, 1.6, 0.8, 1.2, 0x6f7440);
    });
  }

  // ---------- 坡顶：环形工事（外墙、内墙两道沙袋，中间是战壕），三个碉堡嵌在南面 ----------
  const T = L.top;
  lifted(T, () => {
    const rows = 4, bh = 1.25;
    // 南面外墙：碉堡之间连起来，碉堡两侧各留一个缺口
    for (const [x0, x1] of [[-25, -19.2], [-12.8, -7.6], [-5.4, -3.2], [3.2, 5.4], [7.6, 12.8], [19.2, 25]]) {
      sandbagRow(field, x0, x1, L.ringF, rows); col(x0, x1, L.ringF - 0.42, L.ringF + 0.42, bh, 'bags', { ring: 'F' });
    }
    // 南面内墙：中间和两侧开口（指挥所的射击孔看得到前沿战壕）
    for (const [x0, x1] of [[-21.4, -11], [-9, -1.4], [1.4, 9], [11, 21.4]]) {
      sandbagRow(field, x0, x1, L.ringFi, rows); col(x0, x1, L.ringFi - 0.42, L.ringFi + 0.42, bh, 'bags');
    }
    // 东西两侧：外墙、内墙，各在半腰开口
    for (const s of [-1, 1]) {
      for (const [z0, z1] of [[-46, L.ringF + 0.4], [L.ringB, -48.4]]) { sandbagCol(field, s * L.ringX, z0, z1, rows); col(s * L.ringX - 0.42, s * L.ringX + 0.42, z0, z1, bh, 'bags'); }
      for (const [z0, z1] of [[-46.6, L.ringFi], [L.ringBi, -49]]) { sandbagCol(field, s * L.ringXi, z0, z1, rows); col(s * L.ringXi - 0.42, s * L.ringXi + 0.42, z0, z1, bh, 'bags'); }
    }
    // 北面：外墙、内墙
    sandbagRow(field, -25, 25, L.ringB, rows); col(-25, 25, L.ringB - 0.42, L.ringB + 0.42, bh, 'bags');
    for (const [x0, x1] of [[-21.4, -1.6], [1.6, 21.4]]) { sandbagRow(field, x0, x1, L.ringBi, rows); col(x0, x1, L.ringBi - 0.42, L.ringBi + 0.42, bh, 'bags'); }
    // 工事里：弹药箱、炮弹箱
    crate(field, -15, -44, 1.8, 0.8, 1.2); crate(field, 14, -54, 1.6, 0.8, 1.2, 0x7a6a3c); crate(field, -12, -55, 1.6, 0.8, 1.2);
    crate(field, 17, -42, 1.4, 0.7, 1.1, 0x7a6a3c);
    // 北面山坡下的帐篷
    for (const [x, z, w] of [[-12, -67, 5], [10, -68, 6]]) {
      field.box(w, 1.2, 4, x, 0.6, z, 0xb7ad8a, 0, 0, 0, 0.25);
      field.roof(w + 0.4, 1.6, 4.6, x, 2.0, z, 0xa39a78);
      col(x - w / 2, x + w / 2, z - 2, z + 2, 2.8, 'tent');
    }
    for (const [x, z, h] of [[-34, -50, 4.6], [36, -46, 5], [-30, -66, 4.4], [30, -70, 4.8]]) tree(field, x, z, h, true);
  });
  add(field.build(matVC));

  // ---------- 三个碉堡：混凝土方墩、顶盖、朝南的射击孔；打掉后变成一堆碎块，能从缺口冲进去 ----------
  world.bunkers = L.bunkers.map(([x, z], i) => {
    const y = T, g = new Geo();
    g.box(7.4, 1.2, 5.4, x, y - 0.3, z + 0.3, C.loess2, 0, 0, 0, 0.3);   // 外面培的土
    g.box(6, 2.3, 4, x, y + 1.15, z, C.conc, 0, 0, 0, 0.25);
    g.box(6.6, 0.42, 4.6, x, y + 2.5, z, C.conc2, 0, 0, 0, 0.2);
    for (let k = 0; k < 7; k++) g.box(0.82, 0.28, 0.6, x - 2.6 + k * 0.86, y + 2.86, z + R(-1.2, 1.2), k % 2 ? C.bag : C.bag2, R(-0.2, 0.2), 0, 0, 0.3);
    g.box(2.4, 0.42, 0.22, x, y + 1.45, z + 2.02, C.slit, 0, 0, 0, 0);
    g.cyl(0.06, 1.0, x + 0.2, y + 1.45, z + 2.45, 0x2a2c28, 6, 1, Math.PI / 2);
    for (const s of [-1, 1]) { for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) g.box(0.7, 0.28, 0.62, x + s * 3.4, y + 0.15 + r * 0.29, z - 1.8 + k * 0.66, (k + r) % 2 ? C.bag : C.bag2, R(-0.05, 0.05), 0, 0, 0.3); }
    const mesh = add(g.build(matVC));
    const ru = new Geo();
    for (let k = 0; k < 22; k++) ru.box(R(0.6, 2.0), R(0.2, 0.7), R(0.5, 1.6), x + R(-3, 3), y + R(0.1, 0.5), z + R(-2, 2), k % 3 ? C.conc2 : 0x3a3631, R(0, 3), R(-0.4, 0.4), R(-0.4, 0.4), 0.2);
    for (let k = 0; k < 4; k++) ru.box(0.1, R(1, 2), 0.1, x + R(-2.5, 2.5), y + 0.6, z + R(-1.6, 1.6), 0x4a4038, R(0, 3), R(-0.8, 0.8), R(-0.8, 0.8), 0);
    const ruin = add(ru.build(matVC));
    ruin.visible = false;
    const cols = [col(x - 3, x + 3, z - 2, z + 2, 2.7, 'bunker'), col(x - 3.75, x - 3.05, z - 1.9, z + 2.1, 0.9, 'bags'), col(x + 3.05, x + 3.75, z - 1.9, z + 2.1, 0.9, 'bags')];
    for (const c of cols) { c.y0 = y - 0.4; c.h += y; c.base = y; }
    // 射击孔的枪口焰（开火时闪）
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
    flash.position.set(x + 0.2, y + 1.45, z + 2.95); flash.visible = false; add(flash);
    // 被打掉的那段外墙（碉堡左右两侧的沙袋）也一起倒
    const wall = world.colliders.filter((c) => c.ring === 'F' && ((c.x1 > x - 4.5 && c.x1 < x - 2.5) || (c.x0 < x + 4.5 && c.x0 > x + 2.5)));
    return { i, x, z, y, mesh, ruin, cols, flash, wall, slit: { x: x + 0.2, y: y + 1.45, z: z + 2.4 }, alive: true, hp: 8, cd: R(1, 3), burst: 0, shotT: 0, tx: 0, tz: 0, flashT: 0 };
  });
  world.setBunker = (b, alive) => {
    b.alive = alive; b.mesh.visible = alive; b.ruin.visible = !alive;
    b.cols[0].on = alive;
    if (!alive) b.flash.visible = false;
  };

  // ---------- 山崎的指挥所：加固的方堡，四个射击孔（南面两个、东西各一个），南面正中是门 ----------
  {
    const p = L.cp, y = T, g = new Geo(), x = p.x, z = p.z;
    g.box(9.4, 1.0, 7.4, x, y - 0.2, z, C.loess2, 0, 0, 0, 0.3);
    g.box(8, 2.7, 6, x, y + 1.35, z, C.conc, 0, 0, 0, 0.25);
    g.box(8.8, 0.4, 6.8, x, y + 2.9, z, C.conc2, 0, 0, 0, 0.2);
    for (let k = 0; k < 9; k++) g.box(0.95, 0.3, 0.62, x - 3.8 + k * 0.95, y + 3.25, z + R(-2.4, 2.4), k % 2 ? C.bag : C.bag2, R(-0.3, 0.3), 0, 0, 0.3);
    for (let k = 0; k < 5; k++) g.cyl(0.14, 6.4, x - 3.4 + k * 1.7, y + 3.2, z, 0x5a4632, 6, 1, Math.PI / 2, 0, 0, 0.2);
    // 门：深色门洞加门框
    g.box(1.5, 2.1, 0.12, x, y + 1.05, z + 3.02, 0x1a1614, 0, 0, 0, 0);
    g.box(1.9, 0.18, 0.2, x, y + 2.18, z + 3.04, 0x5a4632, 0, 0, 0, 0);
    // 射击孔
    const ports = [[x - 2.6, z + 3, 0], [x + 2.6, z + 3, 0], [x + 4, z, -Math.PI / 2], [x - 4, z, Math.PI / 2]];
    for (const [px, pz, yaw] of ports) {
      if (yaw === 0) g.box(1.2, 0.36, 0.14, px, y + 1.5, pz + 0.02, C.slit, 0, 0, 0, 0);
      else g.box(0.14, 0.36, 1.2, px + (yaw < 0 ? 0.02 : -0.02), y + 1.5, pz, C.slit, 0, 0, 0, 0);
    }
    // 旗杆
    g.cyl(0.1, 7, x + 3.4, y + 3.5, z - 2.6, 0x4a4640, 6, 1);
    add(g.build(matVC));
    const c = col(x - 4, x + 4, z - 3, z + 3, 3.1, 'bunker'); c.y0 = y - 0.4; c.h += y; c.base = y;
    world.fadeables.push({ meshes: [], x0: x - 4, x1: x + 4, z0: z - 3, z1: z + 3, h: y + 3, y0: y, a: 1 });
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, 128, 84); ctx.fillStyle = '#c23b2b'; ctx.beginPath(); ctx.arc(64, 42, 24, 0, 7); ctx.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.45, 6, 1), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    flag.position.set(x + 4.55, y + 6.3, z - 2.6);
    world.flag = add(flag);
    // 射击孔：外侧的点（手榴弹落在附近就能把它炸哑）和朝向（yaw 为朝外的方向）
    world.cp = {
      x, z, y, col: c,
      ports: ports.map(([px, pz, yaw], k) => {
        const ox = px + (k === 2 ? 0.5 : k === 3 ? -0.5 : 0), oz = pz + (k < 2 ? 0.5 : 0);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
        fl.position.set(ox, y + 1.5, oz); fl.visible = false; add(fl);
        return { k, x: ox, z: oz, y: y + 1.5, face: yaw === 0 ? Math.PI : yaw === -Math.PI / 2 ? -Math.PI / 2 : Math.PI / 2, flash: fl, alive: true, cd: 0, burst: 0, shotT: 0, tx: 0, tz: 0, flashT: 0, smokeT: 0 };
      }),
      door: { x, z: z + 4.2 },
    };
  }

  // ---------- 交通壕：沿之字形路线一小段一小段的壕底、两侧土埂（实例化，按挖掘进度显示） ----------
  {
    const pts = L.trench, segs = [];
    let tot = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      segs.push({ x0, z0, x1, z1, len, t0: tot, dx: (x1 - x0) / len, dz: (z1 - z0) / len });
      tot += len;
    }
    const pointAt = (t) => {
      const s = segs.find((q) => t <= q.t0 + q.len) || segs[segs.length - 1];
      const k = clamp(t - s.t0, 0, s.len);
      return { x: s.x0 + s.dx * k, z: s.z0 + s.dz * k, dx: s.dx, dz: s.dz };
    };
    // 离交通壕中线最近的点：只看已经挖出来的那一截（t ≤ maxT）
    const locate = (x, z, maxT) => {
      let best = { t: 0, d: 1e9 };
      for (const s of segs) {
        if (s.t0 > maxT) break;
        const lim = Math.min(s.len, maxT - s.t0);
        const k = clamp((x - s.x0) * s.dx + (z - s.z0) * s.dz, 0, lim);
        const d = Math.hypot(x - (s.x0 + s.dx * k), z - (s.z0 + s.dz * k));
        if (d < best.d) best = { t: s.t0 + k, d };
      }
      return best;
    };
    dig.segs = segs;
    const STEP = 0.6, N = Math.floor(tot / STEP), NT = TRENCH_OFFSETS.length;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mk = (count, cast) => {
      const m = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      m.castShadow = cast; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
      add(m);
      return m;
    };
    const berm = mk(N * NT, true), top = mk(N * NT, true);
    const o = new THREE.Object3D(), col3 = new THREE.Color();
    const bermCols = [];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * STEP, p = pointAt(t), yaw = Math.atan2(-p.dx, -p.dz);
      // 挖出来的土堆在上坡（北，-z）一侧当胸墙
      let nx = -p.dz, nz = p.dx;
      if (nz > 0) { nx = -nx; nz = -nz; }
      for (let s = 0; s < NT; s++) {
        const ox = TRENCH_OFFSETS[s], cx = p.x + ox + nx * 1.05, cz = p.z + nz * 1.05, h = baseHgt(cx, cz), k = i * NT + s;
        o.position.set(cx, h + 0.3, cz); o.rotation.set(0, yaw + R(-0.06, 0.06), 0, 'YXZ'); o.scale.set(0.9, 0.8, 0.8); o.updateMatrix();
        berm.setMatrixAt(k, o.matrix); berm.setColorAt(k, col3.set(R(0, 1) < 0.5 ? C.dirt : C.dirt2).offsetHSL(0, 0, R(-0.03, 0.03)));
        o.position.set(cx + nx * 0.1, h + 0.72, cz + nz * 0.1); o.rotation.set(R(-0.1, 0.1), yaw + R(-0.15, 0.15), 0, 'YXZ'); o.scale.set(0.55, 0.28, 0.7); o.updateMatrix();
        top.setMatrixAt(k, o.matrix); top.setColorAt(k, col3.set(C.dirt2).offsetHSL(0, 0, R(-0.05, 0.02)));
        const c = col(cx - 0.3, cx + 0.3, cz - 0.3, cz + 0.3, 0.8, 'berm', { heroOnly: true });
        c.y0 = h - 0.3; c.h += h; c.base = h; c.on = false; c.t = t;
        bermCols.push(c);
      }
    }
    for (const m of [berm, top]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    // 壕头：一堆新翻出来的土、一把插着的铁锹
    const hp = new Geo();
    for (let k = 0; k < 6; k++) hp.ball(R(0.35, 0.6), R(-0.8, 0.8), R(0.05, 0.2), R(-0.4, 0.3), k % 2 ? C.dirt : C.dirt2, 0, 0.55);
    hp.box(0.05, 1.1, 0.05, 0.5, 0.75, 0.1, 0x6b4a2c, 0, 0.25, 0.2, 0); hp.box(0.24, 0.3, 0.03, 0.62, 0.18, 0.16, 0x55585a, 0, 0.25, 0.2, 0);
    const headGeo = hp.build(matVC);
    const heads = TRENCH_OFFSETS.map(() => add(headGeo.clone()));
    const head = heads[0];
    world.trench = { segs, total: tot, pointAt, locate, dug: 0, head, heads, offsets: TRENCH_OFFSETS };
    world.setDug = (d) => {
      const tr = world.trench;
      tr.dug = clamp(d, 0, tot);
      const n = Math.min(N, Math.floor(tr.dug / STEP));
      berm.count = n * NT; top.count = n * NT;
      for (const c of bermCols) c.on = c.t <= tr.dug - 0.2;
      const p = pointAt(tr.dug);
      heads.forEach((hd, s) => {
        const ox = TRENCH_OFFSETS[s];
        hd.visible = tr.dug > 0.3 && tr.dug < tot - 0.3;
        hd.position.set(p.x + ox + p.dx * 0.4, baseHgt(p.x + ox + p.dx * 0.4, p.z + p.dz * 0.4), p.z + p.dz * 0.4);
        hd.rotation.y = Math.atan2(-p.dx, -p.dz);
      });
      // 地面跟着往下挖：每挖 0.4 米刷新一次那块细网格
      dig.dug = tr.dug;
      if (world.refreshTrenchGround && (Math.abs(tr.dug - (tr.groundAt ?? -9)) >= 0.4 || tr.dug === 0 || tr.dug === tot)) { tr.groundAt = tr.dug; world.refreshTrenchGround(); }
    };
    world.setDug(0);
  }

  // ---------- 场地边界 ----------
  col(-160, -L.fieldX, -220, 160, 80, 'bound');
  col(L.fieldX, 160, -220, 160, 80, 'bound');
  col(-160, 160, L.southZ, 160, 80, 'bound');
  col(-160, 160, -220, L.northZ, 80, 'bound');

  world.smokes = [[-8, 18], [14, 4], [-26, 40], [20, -48], [-16, -60]];
  world.tex = tex;
  return world;
}
