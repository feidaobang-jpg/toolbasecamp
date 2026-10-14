// 苍云岭场景：1940 年 2 月晋中山区，冬天阴天、黄土上压着残雪。南边是新一团守的山头阵地，北边是坂田联队的前沿和山坡上的指挥部帐篷
import * as THREE from '../../vendor/three.module.js';
import { Geo, makeTextures, gradientTexture } from '../geo.js';
import { mulberry, clamp } from '../util.js';
import { makeKit } from '../world-kit.js';

export const L = {
  start: { x: 0, z: 67 },
  trenchZ: 62.2,                       // 我方阵地的沙袋线（胸口高，能越过去开枪）
  nestL: { x: -13, z: 63 }, nestR: { x: 13, z: 63 },
  colZ: 91,                            // 师部、野战医院转移走的山后小路
  fwdZ: 8,                             // 鬼子前沿的沙袋线
  enemyNest: { x: 15, z: 6 },
  line2Z: -30,
  mortarL: { x: -22, z: -36 }, mortarR: { x: 18, z: -36 },
  mortarStart: { x: 1, z: 58.5 },
  // 炮组前出的路线：从我方阵地穿过鬼子前沿的缺口，到五百米外的炮位
  path: [[2, 55], [1, 40], [-3, 22], [-2, 5], [-5, -12], [-6, -32], [-6, -52]],
  firePos: { x: -6, z: -52 },
  hq: { x: -22, z: -125 },             // 坂田的指挥部（大帐篷）
  hqNest: { x: -9, z: -113 },
  hillZ: -137,                         // 指挥部背后是山坡，只有东边一个山口能突出去
  pass: { x0: 4, x1: 16, z1: -168 },
  out: { x: 10, z: -154 },
  fieldX: 48, southZ: 98,
  chu: { x: 66, z: -22 },              // 358 团的观察所（东边山梁上，场外）
};

const C = {
  loess: 0xb9a37f, loess2: 0xa99472, snow: 0xe9ecee, snow2: 0xd6dbe0, mud: 0x7d6e5a, crater: 0x5b5246, road: 0x9c8a6c,
  bag: 0xb3a682, bag2: 0x9f9370, rock: 0x8c8678, trunk: 0x4a3f34, leaf: 0x5d6b3a,
  canvas: 0xb7ad8a, canvas2: 0xa39a78, pole: 0x5a4632,
};

// 地形高度：场地里是平地；场外按离场地边缘的距离抬成山坡（北边山坡后面就是指挥部，东边山口通往外面）
function outside(x, z) {
  const rect = (x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  return Math.min(rect(-L.fieldX, L.fieldX, L.hillZ, L.southZ), rect(L.pass.x0, L.pass.x1, L.pass.z1, L.hillZ + 1));
}
export function hgt(x, z) {
  const e = outside(x, z);
  if (e <= 0) return 0;
  const n = 0.8 + 0.2 * Math.sin(x * 0.09 + z * 0.05) + 0.12 * Math.sin(x * 0.23 - z * 0.17);
  return Math.min(40, (e * e * 0.045 + e * 0.35) * n);
}

export function buildWorld(scene) {
  const rnd = mulberry(19400214);
  const R = (a, b) => a + rnd() * (b - a);
  const tex = makeTextures();
  const world = { colliders: [], fadeables: [], group: new THREE.Group(), smokes: [] };
  scene.add(world.group);
  const add = (m) => { world.group.add(m); return m; };
  const { col, sandbagRow, sandbagCol, nest, mound, rock, tree, crate } = makeKit(world, R, C);
  const matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matGround = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.ground });

  // ---------- 天空：阴天，灰白一片 ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 24, 12),
    new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#7f8a96'], [0.3, '#a9b2bb'], [0.47, '#cfd4d8'], [0.53, '#dde0e1'], [0.6, '#c9c8c2'], [1, '#b0aa9c']]), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;

  // ---------- 地面：一张网格，场外抬成山坡；黄土上压着残雪 ----------
  const craters = [[-8, 48, 3], [14, 44, 2.6], [-22, 36, 3.2], [6, 30, 2.4], [24, 24, 3], [-30, 18, 2.8], [-4, 16, 2.6], [30, 40, 2.4], [-16, 52, 2.2],
    [-18, -6, 3], [20, -12, 2.8], [-2, -22, 2.4], [-26, -50, 3], [12, -44, 2.6], [-6, -52, 3.4], [-30, -78, 3], [6, -84, 2.8], [-14, -96, 2.6], [20, -104, 3], [-40, -100, 2.4]];
  {
    const gw = 260, gd = 340, sx = 104, sz = 136, cz = -30;
    const g = new THREE.PlaneGeometry(gw, gd, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(), cB = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = hgt(x, z);
      pos.setY(i, y);
      const n = Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.07 - z * 0.23) * 0.5;
      const n2 = Math.sin(x * 0.53 - z * 0.41) * 0.5 + Math.sin(x * 0.19 + z * 0.29) * 0.5;
      cA.set(C.loess).lerp(cB.set(C.loess2), 0.5 + 0.5 * n);
      // 残雪：一块一块的，山坡上更多
      const snow = clamp(0.45 + 0.55 * n2 + y * 0.05, 0, 1);
      cA.lerp(cB.set(n > 0 ? C.snow : C.snow2), snow * 0.85);
      // 我方阵地前后踩成泥，转移的小路
      if (z > 58 && z < 70 && y < 0.5) cA.lerp(cB.set(C.mud), 0.55);
      if (Math.abs(z - L.colZ) < 2.6 && y < 0.5) cA.lerp(cB.set(C.road), 0.7);
      for (const [cx, cz2, cr] of craters) {
        const d = Math.hypot(x - cx, z - cz2);
        if (d < cr + 1.5) cA.lerp(cB.set(C.crater), clamp((cr + 1.5 - d) / 2.5, 0, 1) * 0.85);
      }
      colors[i * 3] = cA.r; colors[i * 3 + 1] = cA.g; colors[i * 3 + 2] = cA.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 7, pos.getZ(i) / 7);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, matGround);
    ground.receiveShadow = true;
    add(ground);
  }
  // 远山：一圈灰褐色的山包，山头积雪
  {
    const g = new Geo();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + R(-0.05, 0.05);
      const r = R(200, 270);
      const h = R(40, 80);
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 30;
      g.cyl(R(55, 95), h, x, h / 2 - 6, z, i % 3 ? 0x8f8676 : 0x847b6c, 6, 0.25, 0, R(0, 3), 0, 0.35);
      g.cyl(R(16, 26), h * 0.22, x, h * 0.9 - 6, z, 0xe4e7ea, 6, 0.2, 0, R(0, 3), 0, 0.2);
    }
    add(g.build(matVC, { cast: false, receive: false }));
  }

  // ---------- 我方山头阵地 ----------
  const field = new Geo();
  world.nests = {
    L: nest(field, L.nestL.x, L.nestL.z, 'L', -1),
    R: nest(field, L.nestR.x, L.nestR.z, 'R', -1),
  };
  // 沙袋线：三段，两头和机枪阵地之间留出口子（鬼子军官会从口子里冲进来）
  for (const [x0, x1] of [[-34, -16.6], [-9.4, 9.4], [16.6, 34]]) {
    sandbagRow(field, x0, x1, L.trenchZ, 3);
    col(x0, x1, L.trenchZ - 0.42, L.trenchZ + 0.42, 1.0, 'bags');
  }
  // 阵地后面的弹药箱、担架、伤员棚
  crate(field, -6, 70, 1.8, 0.8, 1.4); crate(field, 7.5, 71, 1.6, 0.8, 1.4, 0x7a6a3c); crate(field, 26, 70, 1.8, 0.8, 1.4);
  for (const [x, z] of [[-24, 72], [20, 76], [-14, 80]]) rock(field, x, z, R(1.1, 1.6));
  // 山后的转移小路两边：枯树
  for (const [x, z, h] of [[-38, 86, 5], [-20, 96, 4.6], [6, 95, 5.2], [26, 86, 4.4], [40, 95, 4.8], [-6, 84, 4]]) tree(field, x, z, h, true);

  // ---------- 两军之间的开阔地 ----------
  for (const [x, z, w] of [[-20, 46, 5], [12, 50, 4.5], [-4, 36, 5.5], [24, 32, 5], [-28, 26, 4.5], [8, 22, 5], [-14, 14, 4]]) mound(field, x, z, w);
  for (const [x, z, s] of [[-34, 50, 1.5], [36, 54, 1.7], [30, 18, 1.4], [-38, 30, 1.3], [18, 38, 1.1], [-10, 28, 1.0], [40, 34, 1.2], [-42, 44, 1.4]]) rock(field, x, z, s);
  for (const [x, z, h] of [[-30, 40, 4.4], [32, 46, 4.0], [-42, 22, 5], [44, 20, 4.6], [16, 28, 3.8], [-8, 54, 3.6]]) tree(field, x, z, h, true);
  // 铁丝网（只拦主角）
  for (const [x0, x1, z] of [[-30, -18, 30.5], [20, 32, 15.5]]) {
    for (let x = x0; x <= x1; x += 2.5) { field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, 0.2); field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, -0.2); }
    for (const [yy, zz] of [[0.75, 0], [0.42, 0.12], [0.58, -0.12], [0.2, 0]]) field.box(x1 - x0, 0.035, 0.035, (x0 + x1) / 2, yy, z + zz, 0x55504a, 0, 0, 0, 0);
    col(x0, x1, z - 0.28, z + 0.28, 0.8, 'wire', { heroOnly: true });
  }

  // ---------- 鬼子前沿：短段沙袋，中间留出炮组要穿过去的缺口 ----------
  world.nests.E = nest(field, L.enemyNest.x, L.enemyNest.z, 'E', 1);
  for (const [x0, x1] of [[-34, -26], [-21, -13], [-8.6, -6.6], [3, 9], [21, 30]]) {
    sandbagRow(field, x0, x1, L.fwdZ, 3);
    col(x0, x1, L.fwdZ - 0.42, L.fwdZ + 0.42, 1.0, 'bags');
  }
  // 第二道线与两个掷弹筒坑
  for (const [x0, x1] of [[-30, -16], [4, 14], [22, 32]]) {
    sandbagRow(field, x0, x1, L.line2Z, 3);
    col(x0, x1, L.line2Z - 0.42, L.line2Z + 0.42, 1.0, 'bags');
  }
  for (const m of [L.mortarL, L.mortarR]) {
    sandbagRow(field, m.x - 2, m.x + 2, m.z + 1.6, 2);
    col(m.x - 2, m.x + 2, m.z + 1.2, m.z + 2.0, 0.7, 'bags');
  }
  for (const [x, z, w] of [[-30, -10, 5], [26, -20, 4.6], [10, -64, 4.5], [-24, -70, 5], [16, -92, 4.5], [-36, -94, 4.6], [-2, -100, 4]]) mound(field, x, z, w);
  for (const [x, z, s] of [[34, -4, 1.5], [-40, -24, 1.6], [30, -50, 1.4], [-36, -60, 1.5], [34, -80, 1.7], [-10, -80, 1.2], [26, -118, 1.4], [-44, -120, 1.6], [0, -118, 1.1]]) rock(field, x, z, s);
  for (const [x, z, h] of [[38, -30, 5], [-44, -40, 4.6], [-18, -86, 4.2], [30, -96, 4.8], [40, -126, 5], [-46, -130, 4.4]]) tree(field, x, z, h, true);
  // 炮位：弹坑北沿一道矮沙袋（挡北边来的子弹）
  sandbagRow(field, L.firePos.x - 4.5, L.firePos.x + 4.5, L.firePos.z - 3.6, 3);
  col(L.firePos.x - 4.5, L.firePos.x + 4.5, L.firePos.z - 4.0, L.firePos.z - 3.2, 1.0, 'bags');
  // 烧坏的大车
  {
    const x = 22, z = -60;
    field.box(2.6, 0.2, 1.4, x, 0.75, z, 0x3d3026, 0.4, 0.12, 0, 0.3);
    field.box(0.12, 0.9, 0.12, x - 1.0, 0.45, z - 0.5, 0x2c241c); field.box(0.12, 0.9, 0.12, x + 0.9, 0.45, z + 0.6, 0x2c241c);
    field.cyl(0.55, 0.1, x - 0.6, 0.55, z + 0.9, 0x2c241c, 10, 1, 0, 0.4, Math.PI / 2);
    col(x - 1.4, x + 1.4, z - 0.9, z + 0.9, 1.2, 'cart');
  }

  // ---------- 坂田的指挥部：山坡下的大帐篷、电台天线、太阳旗 ----------
  world.nests.H = nest(field, L.hqNest.x, L.hqNest.z, 'H', 1);
  for (const [x0, x1] of [[-36, -27], [-17, -14]]) {
    sandbagRow(field, x0, x1, -114, 3);
    col(x0, x1, -114.42, -113.58, 1.0, 'bags');
  }
  crate(field, -31, -119, 1.8, 0.9, 1.4); crate(field, -13, -120, 1.6, 0.8, 1.4, 0x7a6a3c); crate(field, -28, -131.5, 1.8, 0.8, 1.6);
  add(field.build(matVC));

  const tent = (g, cx, cz, w, d, h, color) => {
    g.box(w, h * 0.42, d, cx, h * 0.21, cz, color, 0, 0, 0, 0.25);
    g.roof(w + 0.4, h * 0.58, d + 0.6, cx, h * 0.42 + h * 0.29, cz, C.canvas2);
    g.box(0.12, h + 0.3, 0.12, cx - w / 2 + 0.2, (h + 0.3) / 2, cz, C.pole, 0, 0, 0, 0);
    g.box(0.12, h + 0.3, 0.12, cx + w / 2 - 0.2, (h + 0.3) / 2, cz, C.pole, 0, 0, 0, 0);
    g.box(1.3, h * 0.36, 0.06, cx, h * 0.18, cz + d / 2 + 0.02, 0x3a3226, 0, 0, 0, 0);   // 门帘
  };
  {
    const hq = L.hq;
    const g = new Geo();
    tent(g, hq.x, hq.z, 8, 6, 3.4, C.canvas);
    tent(g, hq.x - 12, hq.z + 1, 5, 4, 2.8, C.canvas2);
    tent(g, hq.x + 11, hq.z - 1.5, 5, 4, 2.8, C.canvas);
    // 桌子、地图板
    g.box(1.8, 0.08, 1.0, hq.x + 0.5, 0.9, hq.z + 5, 0x6b4a2c, 0, 0, 0, 0);
    for (const [dx, dz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) g.box(0.07, 0.9, 0.07, hq.x + 0.5 + dx, 0.45, hq.z + 5 + dz, 0x4a3220, 0, 0, 0, 0);
    g.box(1.4, 0.04, 0.8, hq.x + 0.5, 0.96, hq.z + 5, 0xe8dfc0, 0, 0, 0, 0);
    const mesh = add(g.build(matVC.clone()));
    // 废墟（一炮打中以后）
    const ruin = new Geo();
    for (let i = 0; i < 26; i++) ruin.box(R(0.6, 2.2), R(0.15, 0.5), R(0.5, 1.6), hq.x + R(-5, 5), R(0.1, 0.4), hq.z + R(-4, 4), i % 3 ? 0x5a5240 : 0x2e2b26, R(0, 3), R(-0.3, 0.3), R(-0.3, 0.3), 0.2);
    for (let i = 0; i < 4; i++) ruin.box(0.12, R(1, 2.4), 0.12, hq.x + R(-4, 4), 0.6, hq.z + R(-3, 3), C.pole, R(0, 3), R(-0.8, 0.8), R(-0.8, 0.8), 0);
    const ruinMesh = add(ruin.build(matVC));
    ruinMesh.visible = false;
    const cols = [col(hq.x - 4, hq.x + 4, hq.z - 3, hq.z + 3, 3.2, 'tent'), col(hq.x - 14.5, hq.x - 9.5, hq.z - 1, hq.z + 3, 2.6, 'tent'), col(hq.x + 8.5, hq.x + 13.5, hq.z - 3.5, hq.z + 0.5, 2.6, 'tent')];
    world.hqTents = { mesh, ruin: ruinMesh, cols, alive: true, box: { x0: hq.x - 4.2, x1: hq.x + 4.2, z0: hq.z - 3.2, z1: hq.z + 3.2, y1: 3.6 } };
    world.fadeables.push({ meshes: [mesh], x0: hq.x - 16, x1: hq.x + 15, z0: hq.z - 5, z1: hq.z + 5, h: 4, y0: 0, a: 1 });
    // 电台天线、旗杆
    const p = new Geo();
    p.cyl(0.08, 9, hq.x - 5, 4.5, hq.z - 6, 0x3a3a36, 6, 0.6);
    p.box(1.2, 0.05, 0.05, hq.x - 5, 8.4, hq.z - 6, 0x3a3a36, 0, 0, 0, 0);
    p.cyl(0.12, 8, hq.x + 5, 4, hq.z - 6.5, 0x4a4640, 6, 1);
    p.box(0.8, 0.5, 0.8, hq.x + 5, 0.25, hq.z - 6.5, 0x8c8678);
    add(p.build(matVC));
    col(hq.x - 5.3, hq.x - 4.7, hq.z - 6.3, hq.z - 5.7, 9, 'tree');
    col(hq.x + 4.6, hq.x + 5.4, hq.z - 6.9, hq.z - 6.1, 8, 'tree');
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, 128, 84); ctx.fillStyle = '#c23b2b'; ctx.beginPath(); ctx.arc(64, 42, 24, 0, 7); ctx.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 6, 1), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    flag.position.set(hq.x + 6.25, 7.1, hq.z - 6.5);
    world.flag = add(flag);
  }

  // ---------- 358 团的观察所（东边山梁，只在过场里看到） ----------
  {
    const g = new Geo(), c = L.chu, y = hgt(c.x, c.z);
    // 一块挖平的土台，西沿垒一道沙袋（朝着战场）
    g.box(4.4, 3, 4.6, c.x + 0.3, y - 1.5, c.z + 0.6, 0x8c7c64, 0, 0, 0, 0.2);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) g.box(0.8, 0.29, 0.62, c.x - 1.6, y + 0.15 + r * 0.29, c.z - 1.4 + i * 0.62 + (r % 2 ? 0.3 : 0), (i + r) % 2 ? C.bag : C.bag2, R(-0.05, 0.05), 0, 0, 0.3);
    add(g.build(matVC));
    world.chuY = y;
  }

  // ---------- 场地边界 ----------
  col(-140, -L.fieldX, -200, 140, 30, 'bound');
  col(L.fieldX, 140, -200, 140, 30, 'bound');
  col(-140, 140, L.southZ, 140, 30, 'bound');
  col(-L.fieldX, L.pass.x0, -200, L.hillZ, 30, 'bound');
  col(L.pass.x1, L.fieldX, -200, L.hillZ, 30, 'bound');
  col(L.pass.x0, L.pass.x1, -200, L.pass.z1, 30, 'bound');

  world.smokes = [[-30, 30], [26, 40], [-12, -18], [30, -66], [-40, -104]];
  world.tex = tex;
  return world;
}
