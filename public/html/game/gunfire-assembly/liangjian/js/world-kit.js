// 各章场景共用：碰撞工具（轴对齐盒子，地面高度 0）与沙袋、机枪阵地、土坎、石头、树、弹药箱等搭建件
import * as THREE from '../vendor/three.module.js';
import { clamp } from './util.js';

// 站不上去的碰撞体（跳到上面也会滑下来）
const NO_STAND = { bound: 1, citywall: 1, house: 1, tree: 1, gate: 1, hqdoor: 1, rock: 1, wire: 1, solid: 1, tent: 1 };

export const PALETTE = {
  loess: 0xc7a56c, loess2: 0xb8935a, road: 0xa98a58, crater: 0x6d5a3e,
  bag: 0xb7a878, bag2: 0xa39466,
  rock: 0x8a7a62, trunk: 0x4a3a2a, leaf: 0x5d6b3a,
};

// 搭建件：col 登记碰撞盒；其余函数往 Geo 里加几何并登记碰撞。R 是本章场景的随机数，调用顺序决定摆放细节
export function makeKit(world, R, C = PALETTE) {
  const col = (x0, x1, z0, z1, h, tag, extra) => {
    const c = Object.assign({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h, y0: 0, tag: tag || 'solid', on: true }, extra || {});
    world.colliders.push(c);
    return c;
  };
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
  // U 形机枪阵地：face=1 正面朝南（+Z，日军阵地朝我方），face=-1 正面朝北（-Z，我方阵地朝敌）
  const nest = (g, cx, cz, id, face = 1) => {
    const f = face >= 0 ? 1 : -1;
    const z0 = Math.min(cz - 1.0 * f, cz + 0.9 * f), z1 = Math.max(cz - 1.0 * f, cz + 0.9 * f);
    sandbagRow(g, cx - 2.6, cx + 2.6, cz + 1.3 * f, 5);
    // 两侧只垒到腰高：正面打不穿，绕到侧面就能打到机枪手
    sandbagCol(g, cx - 2.3, z0, z1, 3);
    sandbagCol(g, cx + 2.3, z0, z1, 3);
    // 机枪是单独的模型（game.js 的 initGuns），打掉机枪手后可以接管
    g.box(0.5, 0.36, 0.34, cx + 1.1, 0.18, cz + 0.3 * f, 0x5a6038);
    return [
      col(cx - 2.7, cx + 2.7, cz + 0.9 * f, cz + 1.7 * f, 1.6, 'nest', { nest: id }),
      col(cx - 2.7, cx - 1.9, cz - 1.0 * f, cz + 0.9 * f, 0.95, 'nest', { nest: id }),
      col(cx + 1.9, cx + 2.7, cz - 1.0 * f, cz + 0.9 * f, 0.95, 'nest', { nest: id }),
    ];
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
  return { col, sandbagRow, sandbagCol, nest, mound, rock, tree, crate, platform };
}

export function signPlane(text, w, h, fg, bg) {
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
