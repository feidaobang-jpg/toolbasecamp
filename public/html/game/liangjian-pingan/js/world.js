// 关卡场景：城外黄土地、平安县城城墙与城楼、城内街道、守备队部
import * as THREE from '../vendor/three.module.js';
import { Geo, makeTextures, gradientTexture } from './geo.js';
import { mulberry, clamp } from './util.js';

export const L = {
  start: { x: 0, z: 92 },
  nestA: { x: -16, z: 58 },
  nestB: { x: 15, z: 38 },
  firePos: { x: 0, z: 26 },
  cannonStart: { x: 0, z: 97 },
  wallZ0: -23, wallZ1: -17, wallH: 9,
  gateHalf: 3.5, gateH: 6,
  bunkerX: 20,
  towerY0: 9.7, towerY1: 19,
  mortarX: 34,
  streetNest: { x: 0, z: -68 },
  depot: { x: 15, z: -72 },
  hqGateZ: -81,
  arena: { x0: -17, x1: 17, z0: -103, z1: -82 },
  bossPos: { x: 0, z: -98 },
  flag: { x: -9, z: -101 },
  fieldX: 45,
  platA: { x: 6, z: 60, h: 1.5 },      // 土台：可从侧面压制左翼机枪阵地
  platB: { x: -4, z: 40, h: 1.5 },     // 土台：可从侧面压制右翼机枪阵地
  shed: { x: -10.7, z: -63, h: 2.4 },  // 十字街口的矮棚顶
  wires: [[-24, -9, 63.5], [8, 22, 43.5]],
};
// 站不上去的碰撞体（跳到上面也会滑下来）
const NO_STAND = { bound: 1, citywall: 1, house: 1, tree: 1, gate: 1, hqdoor: 1, rock: 1, wire: 1, solid: 1 };

const C = {
  loess: 0xc7a56c, loess2: 0xb8935a, road: 0xa98a58, crater: 0x6d5a3e,
  pave: 0x99958b, street: 0xaaa69c,
  brick: 0x8d8f8c, brickDark: 0x6f7170, stone: 0xa8a59c,
  bag: 0xb7a878, bag2: 0xa39466,
  plaster: 0xbdb3a2, grayBrick: 0x8a8782, wood: 0x6b4a2c, woodDark: 0x4a3220,
  tile: 0x3c3f46, tile2: 0x33363c, red: 0x7a2a1e, redPillar: 0x8e2f22, gold: 0xc9a646,
  rock: 0x8a7a62, trunk: 0x4a3a2a, leaf: 0x5d6b3a,
};

export function buildWorld(scene, quality) {
  const rnd = mulberry(424242);
  const R = (a, b) => a + rnd() * (b - a);
  const tex = makeTextures();
  const world = { colliders: [], fadeables: [], group: new THREE.Group(), smokes: [] };
  scene.add(world.group);
  const add = (m) => { world.group.add(m); return m; };
  const col = (x0, x1, z0, z1, h, tag, extra) => {
    const c = Object.assign({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h, y0: 0, tag: tag || 'solid', on: true }, extra || {});
    world.colliders.push(c);
    return c;
  };

  const matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matGround = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.ground });
  const matBrick = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.brick });
  const matTile = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.tile });

  // ---------- 天空与远山 ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 24, 12),
    new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#39486a'], [0.34, '#7d7f95'], [0.47, '#d79a72'], [0.52, '#f1c48e'], [0.56, '#d9b48c'], [1, '#c7a77e']]), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(26, 20), new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  sun.position.set(-300, 62, -330); sun.lookAt(0, 20, 0); sun.renderOrder = -9;
  scene.add(sun);

  // ---------- 地面（单张网格，按区域上色，城外两侧抬高成土塬） ----------
  {
    const gw = 300, gd = 320, sx = 100, sz = 106, cz = -20;
    const g = new THREE.PlaneGeometry(gw, gd, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(), cB = new THREE.Color();
    const craters = [[-8, 80, 3], [12, 72, 2.6], [-20, 46, 3.2], [6, 54, 2.4], [26, 44, 3], [-30, 24, 2.8], [10, 14, 3.4], [-12, 8, 3], [22, 4, 2.6], [-3, 34, 2.2], [32, 62, 3], [-34, 74, 2.6]];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = 0;
      const inCity = z < -23 && z > -126 && Math.abs(x) < 48;
      if (!inCity) {
        const ex = Math.max(0, Math.abs(x) - 47);
        y = Math.min(26, ex * ex * 0.03) * (0.75 + 0.25 * Math.sin(z * 0.11 + x * 0.05));
        if (z > 101) y = Math.max(y, Math.min(20, (z - 101) * (z - 101) * 0.04));
        if (z < -128) y = Math.max(y, Math.min(24, (-128 - z) * 1.2));
      }
      pos.setY(i, y);
      const n = Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.07 - z * 0.23) * 0.5;
      if (inCity) {
        cA.set(Math.abs(x) < 7.5 || (z < -55.5 && z > -64.5) ? C.street : C.pave);
        cA.multiplyScalar(0.94 + 0.06 * n);
      } else {
        cA.set(C.loess).lerp(cB.set(C.loess2), 0.5 + 0.5 * n);
        const roadX = Math.sin(z * 0.06) * 1.6;
        const rd = Math.abs(x - roadX);
        if (rd < 4.2 && z > -18 && z < 104) cA.lerp(cB.set(C.road), clamp((4.2 - rd) / 1.6, 0, 1) * 0.85);
        if (z < -6 && z > -17) cA.multiplyScalar(0.9);
        for (const [cx, cz2, cr] of craters) {
          const d = Math.hypot(x - cx, z - cz2);
          if (d < cr + 1.5) cA.lerp(cB.set(C.crater), clamp((cr + 1.5 - d) / 2.5, 0, 1) * 0.8);
        }
        if (y > 0.5) cA.lerp(cB.set(0xa88a5a), clamp(y / 16, 0, 0.6));
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
  // 远山
  {
    const g = new Geo();
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + R(-0.05, 0.05);
      const r = R(190, 260);
      const h = R(26, 60);
      g.cyl(R(50, 90), h, Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r - 20, i % 3 ? 0xa48a66 : 0x95805f, 6, 0.25, 0, R(0, 3), 0, 0.35);
    }
    add(g.build(matVC, { cast: false, receive: false }));
  }

  // ---------- 城外：掩体、机枪阵地、杂物 ----------
  const field = new Geo();
  const sandbagRow = (g, x0, x1, z, rows, depth = 0.8, jitter = true) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.62));
    const step = (x1 - x0) / n;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n + (r % 2 ? -1 : 0); i++) {
        const x = x0 + step * (i + 0.5) + (r % 2 ? step / 2 : 0);
        g.box(step * 0.96, 0.29, depth, x, 0.15 + r * 0.29, z + (jitter ? R(-0.04, 0.04) : 0), (i + r) % 2 ? C.bag : C.bag2, R(-0.05, 0.05), 0, 0, 0.3);
      }
    }
  };
  const sandbagCol = (g, x, z0, z1, rows, width = 0.8) => {
    const n = Math.max(1, Math.round((z1 - z0) / 0.62));
    const step = (z1 - z0) / n;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) g.box(width, 0.29, step * 0.96, x + R(-0.04, 0.04), 0.15 + r * 0.29, z0 + step * (i + 0.5), (i + r) % 2 ? C.bag : C.bag2, R(-0.05, 0.05), 0, 0, 0.3);
    }
  };
  const mgProp = (g, x, y, z) => {
    g.box(0.12, 0.14, 1.3, x, y + 0.2, z + 0.3, 0x2b2b2b, 0, 0, 0, 0);
    g.box(0.2, 0.2, 0.5, x, y + 0.18, z - 0.3, 0x35332e, 0, 0, 0, 0);
    g.box(0.05, 0.4, 0.05, x - 0.22, y - 0.02, z + 0.2, 0x2b2b2b, 0, 0, 0.5, 0);
    g.box(0.05, 0.4, 0.05, x + 0.22, y - 0.02, z + 0.2, 0x2b2b2b, 0, 0, -0.5, 0);
  };
  // 朝南（+Z）的 U 形机枪阵地
  const nest = (g, cx, cz, id) => {
    sandbagRow(g, cx - 2.6, cx + 2.6, cz + 1.3, 5);
    // 两侧只垒到腰高：正面打不穿，绕到侧面就能打到机枪手
    sandbagCol(g, cx - 2.3, cz - 1.0, cz + 0.9, 3);
    sandbagCol(g, cx + 2.3, cz - 1.0, cz + 0.9, 3);
    mgProp(g, cx, 1.45, cz + 1.2);
    g.box(0.5, 0.36, 0.34, cx + 1.1, 0.18, cz + 0.3, 0x5a6038);
    const cs = [
      col(cx - 2.7, cx + 2.7, cz + 0.9, cz + 1.7, 1.6, 'nest', { nest: id }),
      col(cx - 2.7, cx - 1.9, cz - 1.0, cz + 0.9, 0.95, 'nest', { nest: id }),
      col(cx + 1.9, cx + 2.7, cz - 1.0, cz + 0.9, 0.95, 'nest', { nest: id }),
    ];
    return cs;
  };
  const mound = (g, cx, cz, w, d = 1.5, h = 1.6) => {
    // 土坎：底座加一道坡顶，看着像推起来的土埂
    g.box(w, h * 0.5, d + 0.9, cx, h * 0.25, cz, C.loess2, 0, 0, 0, 0.35);
    g.roof(w * 0.97, h * 0.62, d + 0.8, cx, h * 0.5 + h * 0.31, cz, 0xb38f58);
    for (let i = 0; i < 3; i++) g.ball(R(0.3, 0.5), cx + R(-w / 2, w / 2), R(0.1, 0.3), cz + d / 2 + R(0.2, 0.6), C.rock, 0, 0.7);
    col(cx - w / 2, cx + w / 2, cz - d / 2 - 0.2, cz + d / 2 + 0.2, h, 'mound');
  };
  const rock = (g, cx, cz, s) => {
    g.ball(s, cx, s * 0.35, cz, C.rock, 0, 0.75);
    g.ball(s * 0.6, cx + s * 0.7, s * 0.2, cz + s * 0.3, 0x7c6d57, 0, 0.7);
    col(cx - s * 0.75, cx + s * 0.95, cz - s * 0.7, cz + s * 0.7, s * 1.1, 'rock');
  };
  const tree = (g, cx, cz, h, dead) => {
    g.cyl(0.26, h, cx, h / 2, cz, C.trunk, 6, 0.55, 0, R(0, 3), R(-0.08, 0.08));
    g.cyl(0.1, h * 0.5, cx + 0.5, h * 0.82, cz, C.trunk, 5, 0.5, 0, 0, -0.9);
    g.cyl(0.09, h * 0.45, cx - 0.45, h * 0.7, cz + 0.2, C.trunk, 5, 0.5, 0, 0, 0.8);
    if (!dead) { g.ball(h * 0.34, cx, h * 1.05, cz, C.leaf, 0, 0.8); g.ball(h * 0.24, cx + 0.8, h * 0.92, cz + 0.3, 0x6c7a44, 0, 0.8); }
    col(cx - 0.3, cx + 0.3, cz - 0.3, cz + 0.3, h, 'tree');
  };

  // 弹药箱：能跳上去当台阶
  const crate = (g, cx, cz, w, h, d, color = 0x6f7440) => {
    g.box(w, h, d, cx, h / 2, cz, color, R(-0.05, 0.05), 0, 0, 0.3);
    g.box(w + 0.04, 0.07, d + 0.04, cx, h * 0.28, cz, 0x3d4428, 0, 0, 0, 0);
    g.box(w + 0.04, 0.07, d + 0.04, cx, h * 0.78, cz, 0x3d4428, 0, 0, 0, 0);
    return col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h, 'crate');
  };
  // 平顶土台：南侧放一只箱子当台阶，跳上去能从侧面看到机枪阵地里面
  const platform = (g, cx, cz, h) => {
    const w = 4.2, d = 3.2;
    g.box(w + 0.8, h * 0.45, d + 0.8, cx, h * 0.225, cz, C.loess2, 0, 0, 0, 0.35);
    g.box(w, h, d, cx, h / 2, cz, 0xb38f58, 0, 0, 0, 0.3);
    g.box(w - 0.3, 0.06, d - 0.3, cx, h + 0.03, cz, 0xa98652, 0, 0, 0, 0);
    for (let i = 0; i < 6; i++) g.box(0.66, 0.28, 0.5, cx - 1.7 + i * 0.68, h + 0.14, cz - d / 2 + 0.3, i % 2 ? C.bag : C.bag2, R(-0.05, 0.05), 0, 0, 0.3);
    col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h, 'mound');
    crate(g, cx + 0.6, cz + d / 2 + 0.85, 2.0, 0.78, 1.7);
  };
  world.nests = {
    A: nest(field, L.nestA.x, L.nestA.z, 'A'),
    B: nest(field, L.nestB.x, L.nestB.z, 'B'),
  };
  // 出发阵地的矮沙袋与交通壕
  sandbagRow(field, -15, -3, 88.5, 3);
  sandbagRow(field, 3, 15, 88.5, 3);
  col(-15, -3, 88.1, 88.9, 0.95, 'low');
  col(3, 15, 88.1, 88.9, 0.95, 'low');
  for (const [x, z, w] of [[-6, 74, 6], [10, 66, 5], [-26, 68, 5], [-3, 49, 6], [25, 53, 5], [-17, 39, 5], [30, 30, 4.5], [-30, 33, 5], [-8, 62, 4], [15, 30, 4]]) mound(field, x, z, w);
  // 炮位土坎（中间留出炮口）
  mound(field, -5.2, 21.5, 5.2, 1.4, 1.35);
  mound(field, 5.2, 21.5, 5.2, 1.4, 1.35);
  for (const [x, z, s] of [[-38, 84, 1.6], [38, 78, 1.8], [-40, 56, 1.5], [41, 58, 1.4], [-37, 14, 1.7], [39, 12, 1.5], [18, 82, 1.2], [-20, 86, 1.1], [34, 40, 1.1], [-36, 44, 1.2], [14, 20, 1.0], [-22, 16, 1.1]]) rock(field, x, z, s);
  for (const [x, z, h, d] of [[-41, 70, 5, 1], [42, 68, 4.6, 0], [-42, 30, 4.4, 1], [43, 24, 5.2, 1], [-24, 78, 4, 1], [28, 70, 4.2, 0], [36, -4, 4.8, 1], [-35, -2, 4.4, 1], [20, 60, 3.6, 1]]) tree(field, x, z, h, d);
  // 烧毁的大车
  {
    const x = 9, z = 80;
    field.box(2.6, 0.2, 1.4, x, 0.75, z, 0x3d3026, 0.4, 0.12, 0, 0.3);
    field.box(0.12, 0.9, 0.12, x - 1.0, 0.45, z - 0.5, 0x2c241c); field.box(0.12, 0.9, 0.12, x + 0.9, 0.45, z + 0.6, 0x2c241c);
    field.cyl(0.55, 0.1, x - 0.6, 0.55, z + 0.9, 0x2c241c, 10, 1, 0, 0.4, Math.PI / 2);
    col(x - 1.4, x + 1.4, z - 0.9, z + 0.9, 1.2, 'cart');
  }
  // 铁丝网（装饰）
  for (const [x0, x1, z] of L.wires) {
    for (let x = x0; x <= x1; x += 2.5) { field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, 0.2); field.box(0.08, 1.0, 0.08, x, 0.5, z, 0x4a3a2a, 0, 0, -0.2); }
    for (const [yy, zz] of [[0.75, 0], [0.42, 0.12], [0.58, -0.12], [0.2, 0]]) field.box(x1 - x0, 0.035, 0.035, (x0 + x1) / 2, yy, z + zz, 0x55504a, 0, 0, 0, 0);
    col(x0, x1, z - 0.28, z + 0.28, 0.8, 'wire', { heroOnly: true });
  }
  platform(field, L.platA.x, L.platA.z, L.platA.h);
  platform(field, L.platB.x, L.platB.z, L.platB.h);
  crate(field, 19, 47, 1.9, 0.8, 1.9, 0x7a6a3c); crate(field, -12, 30, 1.9, 0.8, 1.9, 0x7a6a3c);
  add(field.build(matVC));
  // 场地边界
  col(-140, -L.fieldX, -17, 140, 30, 'bound');
  col(L.fieldX, 140, -17, 140, 30, 'bound');
  col(-140, 140, 100, 140, 30, 'bound');

  // ---------- 城墙 ----------
  {
    const g = new Geo();
    const zc = (L.wallZ0 + L.wallZ1) / 2, d = L.wallZ1 - L.wallZ0, H = L.wallH;
    g.box(80 - L.gateHalf, H, d, -(80 + L.gateHalf) / 2, H / 2, zc, C.brick, 0, 0, 0, 0.3);
    g.box(80 - L.gateHalf, H, d, (80 + L.gateHalf) / 2, H / 2, zc, C.brick, 0, 0, 0, 0.3);
    // 墙脚收分
    g.box(80 - L.gateHalf, 1.2, d + 1.0, -(80 + L.gateHalf) / 2, 0.6, zc, C.brickDark, 0, 0, 0, 0.1);
    g.box(80 - L.gateHalf, 1.2, d + 1.0, (80 + L.gateHalf) / 2, 0.6, zc, C.brickDark, 0, 0, 0, 0.1);
    // 垛口
    for (let x = -79; x <= 79; x += 2) {
      g.box(1.1, 0.75, 0.5, x, H + 0.95, L.wallZ1 - 0.25, C.brick, 0, 0, 0, 0.1);
    }
    g.box(160, 0.6, 0.5, 0, H + 0.3, L.wallZ1 - 0.25, C.brickDark, 0, 0, 0, 0);
    g.box(160, 0.9, 0.4, 0, H + 0.45, L.wallZ0 + 0.2, C.brickDark, 0, 0, 0, 0);
    // 角台
    for (const sx of [-1, 1]) {
      g.box(11, 12, 11, sx * 52, 6, zc - 1, C.brick, 0, 0, 0, 0.3);
      for (let i = -2; i <= 2; i++) g.box(1.2, 0.8, 0.5, sx * 52 + i * 2.2, 12.4, zc + 4.3, C.brickDark, 0, 0, 0, 0);
    }
    // 城内围墙
    g.box(4, 8, 106, -50, 4, -76, C.brick, 0, 0, 0, 0.3);
    g.box(4, 8, 106, 50, 4, -76, C.brick, 0, 0, 0, 0.3);
    g.box(104, 8, 4, 0, 4, -128, C.brick, 0, 0, 0, 0.3);
    add(g.build(matBrick, { uv: 3.2 }));
    col(-140, -L.gateHalf, L.wallZ0, L.wallZ1, H, 'citywall');
    col(L.gateHalf, 140, L.wallZ0, L.wallZ1, H, 'citywall');
    col(-52, -48, -130, -23, 8, 'solid');
    col(48, 52, -130, -23, 8, 'solid');
    col(-52, 52, -130, -126, 8, 'solid');
    // 城门洞上方的过梁（可淡化，避免挡住主角）
    const top = new Geo();
    top.box(L.gateHalf * 2, H - L.gateH, d, 0, (H + L.gateH) / 2, zc, C.brick, 0, 0, 0, 0.2);
    top.box(L.gateHalf * 2 + 1.4, 0.5, 0.3, 0, L.gateH + 0.9, L.wallZ1 + 0.1, C.stone, 0, 0, 0, 0);
    top.box(3.4, 1.1, 0.16, 0, L.gateH + 1.9, L.wallZ1 + 0.12, 0x2b2b2e, 0, 0, 0, 0);
    const topMat = matBrick.clone();
    const topMesh = add(top.build(topMat, { uv: 3.2 }));
    col(-L.gateHalf, L.gateHalf, L.wallZ0, L.wallZ1, H, 'citywall', { y0: L.gateH });
    world.fadeables.push({ meshes: [topMesh], x0: -L.gateHalf - 1, x1: L.gateHalf + 1, z0: L.wallZ0 - 1, z1: L.wallZ1 + 1, h: H, y0: L.gateH - 0.5, a: 1 });
    // 城门匾额文字
    const sign = signPlane('平安县', 3.2, 1.0, '#e8d9a0', '#2b2b2e');
    sign.position.set(0, L.gateH + 1.9, L.wallZ1 + 0.22);
    add(sign);
  }
  // 城门（可被炮轰开）
  {
    const g = new Geo();
    for (const sx of [-1, 1]) {
      g.box(L.gateHalf - 0.05, L.gateH - 0.1, 0.36, sx * L.gateHalf / 2, L.gateH / 2, 0, C.red, 0, 0, 0, 0.3);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) g.box(0.16, 0.16, 0.1, sx * (0.5 + c * 0.75), 0.9 + r * 1.05, 0.2, C.gold, 0, 0, 0, 0);
      g.box(0.3, 0.5, 0.12, sx * 0.4, 2.9, 0.22, 0x8a7030, 0, 0, 0, 0);
    }
    const doors = add(g.build(matVC));
    doors.position.set(0, 0, L.wallZ1 - 0.45);
    world.gate = { mesh: doors, col: col(-L.gateHalf, L.gateHalf, L.wallZ1 - 0.9, L.wallZ1, L.gateH, 'gate'), hp: 3, alive: true };
  }
  // 城楼（可被炸塌）
  {
    const zc = (L.wallZ0 + L.wallZ1) / 2, y0 = L.wallH;
    const body = new Geo();
    body.box(17.5, 0.7, 8.6, 0, y0 + 0.35, zc, C.stone, 0, 0, 0, 0.1);
    for (const x of [-7.6, -4.6, -1.6, 1.6, 4.6, 7.6]) for (const z of [-3.4, 3.4]) body.cyl(0.3, 3.5, x, y0 + 2.45, zc + z, C.redPillar, 8, 1);
    body.box(14.2, 3.3, 5.6, 0, y0 + 2.35, zc, C.red, 0, 0, 0, 0.25);
    for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) { body.box(1.5, 1.7, 0.1, x, y0 + 2.5, zc + 2.84, 0x3a2418, 0, 0, 0, 0); body.box(1.2, 1.4, 0.12, x, y0 + 2.5, zc + 2.86, 0xcbb98a, 0, 0, 0, 0.1); }
    body.box(10.2, 2.5, 4.4, 0, y0 + 6.55, zc, C.red, 0, 0, 0, 0.25);
    for (const x of [-3.4, 0, 3.4]) body.box(1.3, 1.2, 0.12, x, y0 + 6.6, zc + 2.24, 0xcbb98a, 0, 0, 0, 0.1);
    body.box(16.9, 0.36, 0.5, 0, y0 + 1.25, zc + 4.0, 0x5a3d26, 0, 0, 0, 0);
    const roof = new Geo();
    roof.box(19.4, 0.3, 11, 0, y0 + 4.25, zc, C.tile2, 0, 0, 0, 0);
    roof.roof(18.6, 1.7, 10.2, 0, y0 + 5.2, zc, C.tile);
    roof.box(13.6, 0.26, 7.4, 0, y0 + 7.9, zc, C.tile2, 0, 0, 0, 0);
    roof.roof(13, 2.2, 6.8, 0, y0 + 9.1, zc, C.tile);
    roof.box(13.6, 0.3, 0.4, 0, y0 + 10.25, zc, 0x2a2c30, 0, 0, 0, 0);
    for (const sx of [-1, 1]) {
      roof.box(0.5, 0.9, 0.5, sx * 6.7, y0 + 10.5, zc, 0x2a2c30, 0, 0, 0, 0);
      for (const sz of [-1, 1]) { roof.box(1.6, 0.26, 1.6, sx * 9.4, y0 + 4.5, zc + sz * 5.2, C.tile2, 0.78, 0.25 * sz, 0, 0); roof.box(1.2, 0.22, 1.2, sx * 6.6, y0 + 8.1, zc + sz * 3.5, C.tile2, 0.78, 0.25 * sz, 0, 0); }
    }
    const bodyMat = matVC.clone(), roofMat = matTile.clone();
    const bm = body.build(bodyMat), rm = roof.build(roofMat, { uv: 2.2 });
    const group = new THREE.Group();
    group.add(bm, rm);
    add(group);
    // 废墟
    const ruin = new Geo();
    ruin.box(17.5, 0.7, 8.6, 0, y0 + 0.35, zc, 0x77736b, 0, 0, 0, 0.1);
    for (let i = 0; i < 30; i++) ruin.box(R(0.6, 1.8), R(0.3, 0.9), R(0.5, 1.5), R(-7.5, 7.5), y0 + R(0.8, 1.6), zc + R(-3.4, 3.4), i % 3 ? 0x4a3028 : 0x33363c, R(0, 3), R(-0.5, 0.5), R(-0.4, 0.4), 0.2);
    for (const x of [-7.6, 1.6, 4.6]) ruin.cyl(0.3, R(1, 2.2), x, y0 + 1.4, zc - 3.4, 0x5a221a, 8, 1, 0, 0, R(-0.3, 0.3));
    const ruinMesh = add(ruin.build(matVC.clone()));
    ruinMesh.visible = false;
    world.tower = { group, ruin: ruinMesh, alive: true, mats: [bodyMat, roofMat], box: { x0: -8.6, x1: 8.6, z0: L.wallZ0 - 1.2, z1: L.wallZ1 + 1.2, y0: L.towerY0, y1: L.towerY1 + 2 } };
    world.fadeables.push({ meshes: [bm, rm, ruinMesh], x0: -10, x1: 10, z0: L.wallZ0 - 2, z1: L.wallZ1 + 2, h: 21, y0: 9, a: 1, tower: true });
  }
  // 城墙上的机枪堡
  world.bunkers = [];
  for (const sx of [-1, 1]) {
    const cx = sx * L.bunkerX, zc = L.wallZ1 - 1.6, y0 = L.wallH;
    const g = new Geo();
    for (let r = 0; r < 5; r++) for (let i = 0; i < 7; i++) g.box(0.68, 0.3, 0.9, cx - 2.1 + i * 0.7 + (r % 2 ? 0.2 : 0), y0 + 0.75 + r * 0.3, zc + 1.2, (i + r) % 2 ? C.bag : C.bag2, R(-0.04, 0.04), 0, 0, 0.25);
    for (const s2 of [-1, 1]) for (let r = 0; r < 6; r++) for (let i = 0; i < 4; i++) g.box(0.9, 0.3, 0.68, cx + s2 * 2.3, y0 + 0.75 + r * 0.3, zc - 1.2 + i * 0.7, (i + r) % 2 ? C.bag : C.bag2, R(-0.04, 0.04), 0, 0, 0.25);
    g.box(5.6, 0.3, 4.0, cx, y0 + 2.75, zc, C.woodDark, 0, 0, 0, 0.1);
    g.box(5.2, 0.28, 3.6, cx, y0 + 3.0, zc, C.bag2, 0, 0, 0, 0.2);
    g.box(0.12, 0.14, 1.6, cx, y0 + 2.2, zc + 1.9, 0x2b2b2b, 0, -0.12, 0, 0);
    const mesh = add(g.build(matVC));
    const ruin = new Geo();
    for (let i = 0; i < 14; i++) ruin.box(R(0.5, 1.3), R(0.2, 0.6), R(0.5, 1.2), cx + R(-2.6, 2.6), y0 + R(0.7, 1.2), zc + R(-1.6, 1.6), i % 2 ? 0x4a4436 : 0x2e2b26, R(0, 3), R(-0.5, 0.5), 0, 0.2);
    const ruinMesh = add(ruin.build(matVC));
    ruinMesh.visible = false;
    world.bunkers.push({ id: sx < 0 ? 'L' : 'R', x: cx, y: y0 + 2.2, z: zc + 1.0, mesh, ruin: ruinMesh, alive: true, box: { x0: cx - 3, x1: cx + 3, z0: zc - 2.2, z1: zc + 2.4, y0: y0 + 0.4, y1: y0 + 3.4 } });
  }

  // ---------- 城内房屋 ----------
  const house = (x0, x1, z0, z1, h, opts = {}) => {
    const g = new Geo();
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const wallC = opts.brick ? C.grayBrick : C.plaster;
    g.box(w, h, d, cx, h / 2, cz, wallC, 0, 0, 0, 0.3);
    g.box(w + 0.1, 0.5, d + 0.1, cx, 0.25, cz, 0x6d6a64, 0, 0, 0, 0);
    const along = w >= d;   // 屋脊沿长边
    const rh = Math.min(along ? d : w, 9) * 0.3 + 0.6;
    if (along) g.roof(w + 1.2, rh, d + 1.4, cx, h + rh / 2, cz, C.tile);
    else g.roof(d + 1.2, rh, w + 1.4, cx, h + rh / 2, cz, C.tile, Math.PI / 2);
    g.box(along ? w + 1.2 : 0.4, 0.3, along ? 0.4 : d + 1.2, cx, h + rh + 0.05, cz, C.tile2, 0, 0, 0, 0);
    // 朝街一面的门窗
    const face = opts.face || 0;   // +1 朝 +X，-1 朝 -X，2 朝 +Z（南），-2 朝 -Z
    const door = (px, pz, alongX) => {
      g.box(alongX ? 1.5 : 0.14, 2.3, alongX ? 0.14 : 1.5, px, 1.15, pz, C.woodDark, 0, 0, 0, 0.1);
      g.box(alongX ? 1.9 : 0.16, 0.2, alongX ? 0.16 : 1.9, px, 2.4, pz, C.wood, 0, 0, 0, 0);
    };
    const win = (px, pz, alongX) => {
      g.box(alongX ? 1.3 : 0.12, 1.0, alongX ? 0.12 : 1.3, px, h * 0.55, pz, 0x3a2c22, 0, 0, 0, 0);
      g.box(alongX ? 1.1 : 0.14, 0.8, alongX ? 0.14 : 1.1, px, h * 0.55, pz, 0xd9c898, 0, 0, 0, 0.1);
    };
    if (Math.abs(face) === 1) {
      const fx = face > 0 ? x1 + 0.03 : x0 - 0.03;
      door(fx, cz, false);
      if (d > 7) { win(fx, cz - d * 0.3, false); win(fx, cz + d * 0.3, false); }
      if (opts.sign) g.box(0.12, 0.8, 2.6, fx + face * 0.06, h * 0.86, cz, opts.sign, 0, 0, 0, 0);
    } else if (Math.abs(face) === 2) {
      const fz = face > 0 ? z1 + 0.03 : z0 - 0.03;
      door(cx, fz, true);
      if (w > 7) { win(cx - w * 0.3, fz, true); win(cx + w * 0.3, fz, true); }
    }
    const mat = matTileHouse.clone();
    const mesh = add(g.build(mat, { uv: 2.4 }));
    col(x0, x1, z0, z1, h + rh, 'house');
    world.fadeables.push({ meshes: [mesh], x0: x0 - 0.8, x1: x1 + 0.8, z0: z0 - 0.8, z1: z1 + 0.8, h: h + rh, y0: 0, a: 1 });
  };
  const matTileHouse = new THREE.MeshLambertMaterial({ vertexColors: true });
  // 主街两侧
  house(-21, -8, -40, -27, 4.6, { face: 1, sign: 0x2f5b45 });
  house(8, 21, -39, -27, 5.0, { face: -1, brick: true, sign: 0x7a2a1e });
  house(-21, -8, -54, -43, 5.2, { face: 1, brick: true });
  house(8, 21, -54, -42, 4.4, { face: -1, sign: 0x3c4a78 });
  house(-21, -8, -79, -66, 4.8, { face: 1 });
  // 外排（填满城内，避免看到空地）
  house(-44, -26, -42, -28, 4.2, { face: 1, brick: true });
  house(26, 44, -41, -28, 4.6, { face: -1 });
  house(-44, -26, -54, -45, 4.4, { face: 2 });
  house(26, 44, -54, -44, 4.2, { face: 2, brick: true });
  house(-44, -25, -80, -66, 4.6, { face: 2 });
  house(26, 44, -80, -66, 5.0, { face: 2, brick: true });
  house(-44, -22, -122, -86, 4.4, { face: 1 });
  house(22, 44, -122, -86, 4.4, { face: -1, brick: true });
  house(-18, 18, -124, -114, 5.2, { face: 2, brick: true });

  // ---------- 街垒、缴获仓库、守备队部 ----------
  const town = new Geo();
  // 街垒 S1
  // 胸口高：守军能越过沙袋开枪，露出的上半身也打得到；主角可以直接跳上去
  sandbagRow(town, -6.6, -1.6, -41, 4);
  sandbagRow(town, 1.6, 6.6, -41, 4);
  col(-6.7, -1.5, -41.5, -40.5, 1.1, 'bags');
  col(1.5, 6.7, -41.5, -40.5, 1.1, 'bags');
  town.box(2.4, 0.2, 1.3, -4.6, 0.8, -36, C.woodDark, 0.3, 0.1);
  town.cyl(0.5, 0.1, -5.6, 0.5, -35.6, 0x2c241c, 10, 1, 0, 0.3, Math.PI / 2);
  col(-5.9, -3.3, -36.8, -35.2, 1.2, 'cart');
  crate(town, -4.1, -39.5, 1.8, 0.8, 1.8);
  crate(town, 4.1, -39.5, 1.8, 0.8, 1.8, 0x7a6a3c);
  // 十字街口机枪阵地
  world.nests.S = nest(town, L.streetNest.x, L.streetNest.z, 'S');
  // 街口西侧的矮棚：踩两级箱子能上棚顶，从侧面打街口机枪
  {
    const x0 = -12.6, x1 = -8.8, z0 = -64.3, z1 = -61.7, hh = L.shed.h;
    town.box(x1 - x0, hh - 0.2, z1 - z0, (x0 + x1) / 2, (hh - 0.2) / 2, (z0 + z1) / 2, C.grayBrick, 0, 0, 0, 0.3);
    town.box(x1 - x0 + 0.5, 0.2, z1 - z0 + 0.5, (x0 + x1) / 2, hh - 0.1, (z0 + z1) / 2, C.woodDark, 0, 0, 0, 0);
    town.box(1.1, 1.7, 0.1, (x0 + x1) / 2, 0.85, z1 + 0.04, C.woodDark, 0, 0, 0, 0.1);
    col(x0, x1, z0, z1, hh, 'shed');
    crate(town, -7.95, -63, 1.5, 1.6, 2.2, 0x7a6a3c);
    crate(town, -6.3, -63, 1.7, 0.8, 2.2);
  }
  // 缴获仓库：矮墙院子，门朝南开在横街上
  {
    const x0 = 9, x1 = 21, z0 = -79, z1 = -66.5, hh = 2.6;
    town.box(0.6, hh, z1 - z0, x0, hh / 2, (z0 + z1) / 2, C.grayBrick);
    town.box(0.6, hh, z1 - z0, x1, hh / 2, (z0 + z1) / 2, C.grayBrick);
    town.box(x1 - x0, hh, 0.6, (x0 + x1) / 2, hh / 2, z0, C.grayBrick);
    town.box(4, hh, 0.6, x0 + 2, hh / 2, z1, C.grayBrick);
    town.box(4, hh, 0.6, x1 - 2, hh / 2, z1, C.grayBrick);
    town.box(4.6, 0.3, 0.9, 15, hh + 0.5, z1, C.tile, 0, 0, 0, 0);
    town.box(0.3, hh + 0.5, 0.3, 13, (hh + 0.5) / 2, z1, C.woodDark); town.box(0.3, hh + 0.5, 0.3, 17, (hh + 0.5) / 2, z1, C.woodDark);
    col(x0 - 0.3, x0 + 0.3, z0, z1, hh, 'solid'); col(x1 - 0.3, x1 + 0.3, z0, z1, hh, 'solid');
    col(x0, x1, z0 - 0.3, z0 + 0.3, hh, 'solid');
    col(x0, x0 + 4, z1 - 0.3, z1 + 0.3, hh, 'solid'); col(x1 - 4, x1, z1 - 0.3, z1 + 0.3, hh, 'solid');
    // 堆成山的弹药箱
    for (let i = 0; i < 16; i++) {
      const bx = x0 + 1.4 + (i % 4) * 1.15, bz = z0 + 1.2 + Math.floor(i / 8) * 0.8, by = 0.3 + (Math.floor(i / 4) % 2) * 0.6;
      town.box(1.0, 0.58, 0.66, bx, by, bz, i % 3 ? 0x66703e : 0x7a6a3c, R(-0.06, 0.06));
    }
    for (let i = 0; i < 6; i++) town.cyl(0.36, 1.0, x1 - 1.3 - (i % 3) * 0.85, 0.5, z0 + 1.3 + Math.floor(i / 3) * 0.85, 0x4b5540, 8, 1);
    col(x0 + 0.8, x0 + 5.6, z0 + 0.6, z0 + 2.5, 1.3, 'crates');
    col(x1 - 3.6, x1 - 0.8, z0 + 0.8, z0 + 2.6, 1.1, 'crates');
  }
  // 守备队部：院墙、正房、石墩、旗杆
  {
    const zs = L.hqGateZ, hh = 4;
    town.box(14.5, hh, 1, -10.75, hh / 2, zs, C.grayBrick); town.box(14.5, hh, 1, 10.75, hh / 2, zs, C.grayBrick);
    town.box(8.6, 0.5, 1.6, 0, hh + 0.9, zs, C.tile, 0, 0, 0, 0);
    town.box(0.7, hh + 0.7, 1.2, -3.8, (hh + 0.7) / 2, zs, C.redPillar); town.box(0.7, hh + 0.7, 1.2, 3.8, (hh + 0.7) / 2, zs, C.redPillar);
    town.box(1, hh, 31, -18, hh / 2, -96.5, C.grayBrick); town.box(1, hh, 31, 18, hh / 2, -96.5, C.grayBrick);
    col(-18.5, -3.5, zs - 0.5, zs + 0.5, hh, 'solid'); col(3.5, 18.5, zs - 0.5, zs + 0.5, hh, 'solid');
    col(-18.5, -17.5, -112, zs, hh, 'solid'); col(17.5, 18.5, -112, zs, hh, 'solid');
    // 正房
    town.box(29, 1.0, 9, 0, 0.5, -108, C.stone, 0, 0, 0, 0.1);
    town.box(27, 5.4, 7, 0, 3.7, -108.4, C.plaster, 0, 0, 0, 0.25);
    for (const x of [-12, -6.5, 6.5, 12]) town.cyl(0.34, 5.2, x, 3.6, -104.4, C.redPillar, 8, 1);
    town.box(3.2, 3.4, 0.2, 0, 2.7, -104.85, C.woodDark, 0, 0, 0, 0.1);
    for (const x of [-9.2, 9.2]) { town.box(2.6, 1.8, 0.16, x, 3.6, -104.86, 0x3a2c22, 0, 0, 0, 0); town.box(2.3, 1.5, 0.18, x, 3.6, -104.87, 0xd9c898, 0, 0, 0, 0.1); }
    town.box(8, 0.5, 2.2, 0, 0.25, -103.2, C.stone, 0, 0, 0, 0.1);
    town.box(30.6, 0.4, 10.6, 0, 6.55, -108.2, C.tile2, 0, 0, 0, 0);
    town.roof(30, 2.6, 10, 0, 8.05, -108.2, C.tile);
    col(-14.5, 14.5, -112.5, -103.6, 9, 'house');
    for (const [x, z] of [[-9, -88], [9, -88], [-9, -97], [9, -97]]) { town.box(1.3, 1.7, 1.3, x, 0.85, z, C.stone, 0, 0, 0, 0.25); town.box(1.5, 0.2, 1.5, x, 1.78, z, 0x8b887f, 0, 0, 0, 0); col(x - 0.65, x + 0.65, z - 0.65, z + 0.65, 1.8, 'pillar'); }
    crate(town, -13.4, -93, 1.9, 0.9, 1.8); crate(town, 13.4, -90.5, 1.9, 0.9, 1.8, 0x7a6a3c);
    town.cyl(0.12, 9, L.flag.x, 4.5, L.flag.z, 0x4a4640, 6, 1);
    town.box(0.9, 0.5, 0.9, L.flag.x, 0.25, L.flag.z, C.stone);
  }
  // 街上的杂物
  for (const [x, z] of [[-6.6, -30], [6.6, -47], [-6.4, -58], [6.3, -73]]) { town.cyl(0.38, 1.0, x, 0.5, z, 0x6b4a2c, 8, 1); town.cyl(0.4, 0.06, x, 0.3, z, 0x2c241c, 8, 1); town.cyl(0.4, 0.06, x, 0.75, z, 0x2c241c, 8, 1); col(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 1.0, 'barrel'); }
  for (const [x, z] of [[-7.4, -33], [7.4, -34], [-7.4, -49], [7.4, -50], [-7.4, -72]]) { town.box(0.14, 3.2, 0.14, x, 1.6, z, C.woodDark); town.box(0.5, 0.6, 0.5, x + (x < 0 ? 0.5 : -0.5), 2.9, z, 0xc23b2b, 0, 0, 0, 0.3); }
  add(town.build(matVC));

  // 旗帜（守备队部），胜利后换红旗
  {
    const mk = (draw) => {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
      const ctx = cv.getContext('2d'); draw(ctx);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.8, 6, 1), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
      m.position.set(L.flag.x + 1.42, 8, L.flag.z);
      return m;
    };
    world.flagEnemy = add(mk((c) => { c.fillStyle = '#f2efe6'; c.fillRect(0, 0, 128, 84); c.fillStyle = '#c23b2b'; c.beginPath(); c.arc(64, 42, 24, 0, 7); c.fill(); }));
    world.flagRed = add(mk((c) => { c.fillStyle = '#c8281e'; c.fillRect(0, 0, 128, 84); c.fillStyle = '#f5d24a'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('独立团', 64, 52); }));
    world.flagRed.visible = false;
  }

  // 城内几处黑烟
  world.smokes = [[-30, -50], [34, -96], [-12, -118], [28, -36]];
  world.tex = tex;
  return world;
}

function signPlane(text, w, h, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 256, 80);
  c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(4, 4, 248, 72);
  c.fillStyle = fg; c.font = 'bold 50px "STKaiti","KaiTi","楷体",serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 128, 43);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// ---------- 碰撞工具 ----------
export function resolveCircle(world, u, r, feet = 0, hero = false) {
  const cs = world.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.on || c.y0 > feet + 1.5) continue;
    if (c.heroOnly && !hero) continue;          // 铁丝网只拦主角，电脑单位照常通过
    if (feet >= c.h - 0.02) continue;           // 已经站在顶面以上
    if (u.x < c.x0 - r || u.x > c.x1 + r || u.z < c.z0 - r || u.z > c.z1 + r) continue;
    const nx = clamp(u.x, c.x0, c.x1), nz = clamp(u.z, c.z0, c.z1);
    let dx = u.x - nx, dz = u.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      u.x = nx + (dx / d) * r; u.z = nz + (dz / d) * r;
    } else {
      // 圆心在矩形内：沿最近的边推出
      const l = u.x - c.x0, rr = c.x1 - u.x, t = u.z - c.z0, b = c.z1 - u.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) u.x = c.x0 - r; else if (m === rr) u.x = c.x1 + r; else if (m === t) u.z = c.z0 - r; else u.z = c.z1 + r;
    }
  }
}

// 脚下能站的最高顶面（地面为 0）。只认不高于脚面一点点的顶面，所以必须跳上去而不是走上去
export function groundAt(world, x, z, feet) {
  const cs = world.colliders;
  let g = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.on || c.y0 > 0 || NO_STAND[c.tag] || c.h > feet + 0.06 || c.h <= g) continue;
    if (x >= c.x0 - 0.3 && x <= c.x1 + 0.3 && z >= c.z0 - 0.3 && z <= c.z1 + 0.3) g = c.h;
  }
  return g;
}

// 子弹等空间点是否打在实体上
export function pointBlocked(world, x, y, z, ignoreTag) {
  const cs = world.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.on || c.tag === ignoreTag) continue;
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && y <= c.h && y >= c.y0) return c;
  }
  return null;
}

// 视线是否被高于 minH 的实体挡住
export function losBlocked(world, ax, az, bx, bz, minH = 1.7, ay = 1.4, by = 1.4) {
  const cs = world.colliders;
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.on || c.h < minH || c.y0 > 3) continue;
    if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
    // 逐段检查进入点高度
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) ok = false; }
    else { let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) ok = false; }
      else { let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz; if (ta > tb) { const s = ta; ta = tb; tb = s; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); }
    }
    if (!ok || t0 > t1) continue;
    const yIn = ay + (by - ay) * t0, yOut = ay + (by - ay) * t1;
    if (Math.min(yIn, yOut) <= c.h) return true;
  }
  return false;
}
