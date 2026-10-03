// 第一关关卡数据：按 NES 版 Jackal 第一关（Checkpoint Alpha）的流程重建为 3D 场地。
// 海滩登陆 → 闪光俘虏小屋 → 营地大门 → 过桥（炮艇）→ 崖顶炮台 → 丛林（隐藏星）→ 最后俘虏屋与直升机坪 → 4 名守卫 → Boss 4 辆蓝色坦克。
// 网格每格 1×1；x ∈ [-36, 36)，y ∈ [0, 352)。
import { fixedRng } from './core.js';

export const COLS = 72, ROWS = 352, X0 = -36;
export const T = { GRASS: 0, SAND: 1, ROAD: 2, WATER: 3, SEA: 4, BRIDGE: 5, FLOOR: 6, DIRT: 7, PAD: 8 };

export const terrain = new Uint8Array(COLS * ROWS);
export const solid = new Int32Array(COLS * ROWS);       // 静态物体 id（0 = 空）
export const statics = [null];                          // id → 物体
export const spawns = [];                               // 动态实体出生表
export const decor = { palms: [], trees: [], bushes: [], rocks: [], flowers: [], tufts: [], outerTrees: [], tents: [], crates: [], watchtowers: [] };

const R = fixedRng(20261002);
const rr = (a, b) => a + (b - a) * R();

export const inGrid = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;
export const ci = (x) => Math.floor(x - X0);
export const cj = (y) => Math.floor(y);
export const idx = (i, j) => j * COLS + i;
export const cellX = (i) => X0 + i + 0.5;
export const cellY = (j) => j + 0.5;

// ---------- 静态物体 ----------
const KIND = {
  tree:     { move: true,  shot: false, by: null },
  palm:     { move: true,  shot: false, by: null },
  rock:     { move: true,  shot: true,  by: null },
  wall:     { move: true,  shot: true,  by: null },
  tower:    { move: true,  shot: true,  by: null },
  rail:     { move: true,  shot: false, by: null },
  gate:     { move: true,  shot: true,  by: 'explosive', hp: 8 },
  hut:      { move: true,  shot: true,  by: 'explosive', hp: 4 },
  tent:     { move: true,  shot: true,  by: null },
  crate:    { move: true,  shot: true,  by: 'explosive', hp: 2 },
  watch:    { move: true,  shot: true,  by: null },
  sandbag:  { move: true,  shot: true,  by: 'explosive', hp: 4 },
  barrel:   { move: true,  shot: true,  by: 'any', hp: 1 },
  bluff:    { move: true,  shot: true,  by: 'rocket', hp: 4 },
  barricade:{ move: true,  shot: true,  by: null }
};

export function addStatic(kind, x0, y0, x1, y1, data) {
  const k = KIND[kind];
  const s = {
    id: statics.length, kind, x0, y0, x1, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2,
    blocksMove: k.move, blocksShot: k.shot, by: k.by, hp: k.hp || 0, maxHp: k.hp || 0,
    alive: true, cells: [], data: data || {}
  };
  for (let j = cj(y0); j < Math.ceil(y1); j++) for (let i = ci(x0); i < Math.ceil(x1 - X0) + 0; i++) {
    if (!inGrid(i, j)) continue;
    if (cellX(i) < x0 || cellX(i) > x1 || cellY(j) < y0 || cellY(j) > y1) continue;
    const c = idx(i, j);
    if (solid[c]) continue;
    solid[c] = s.id; s.cells.push(c);
  }
  if (!s.cells.length && kind !== 'barricade') return null;
  statics.push(s);
  return s;
}

function fillTerrain(type, x0, y0, x1, y1, keep) {
  for (let j = Math.max(0, cj(y0)); j < Math.min(ROWS, Math.ceil(y1)); j++)
    for (let i = Math.max(0, ci(x0)); i < Math.min(COLS, Math.ceil(x1 - X0)); i++) {
      const c = idx(i, j);
      if (keep && keep.indexOf(terrain[c]) >= 0) continue;
      terrain[c] = type;
    }
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}
function polyDist(px, py, pts) {
  let d = 1e9;
  for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, segDist(px, py, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
  return d;
}

// ---------- 地形 ----------
export const shoreS = (x) => 3.2 + 0.9 * Math.sin(x * 0.31) + 0.6 * Math.sin(x * 0.13 + 1);
export const shoreW = (y) => -31.5 + 1.2 * Math.sin(y * 0.27);
export const riverS = (x) => 112 + 1.2 * Math.sin(x * 0.21);
export const riverN = (x) => 126 + 1.2 * Math.sin(x * 0.17 + 2);
const isSea = (x, y) => y < shoreS(x) || (y < 44 && x < shoreW(y) + Math.max(0, (y - 36)) * -0.6);

// 主干道（吉普车大致路线）
export const ROAD = [
  [-22, 10], [16, 11], [18, 40], [0, 46], [0, 88], [-22, 92], [-21, 104], [-21, 134], [-2, 146],
  [-4, 174], [7, 178], [7, 204], [10, 214], [-14, 222], [-14, 238], [12, 246], [12, 258], [12, 268],
  [-4, 278], [-4, 292], [0, 300], [0, 330]
];
const SPURS = [
  [[18, 30], [26, 26]],            // 去 H1
  [[0, 296], [22, 294]],           // 去直升机坪
  [[-14, 232], [-26, 232]],        // 去 H3
  [[-4, 282], [-28, 282]]          // 去 H4
];

for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
  const x = cellX(i), y = cellY(j), c = idx(i, j);
  let t = T.GRASS;
  if (isSea(x, y)) t = T.SEA;
  else if (y < shoreS(x) + 5.5 + 0.8 * Math.sin(x * 0.7) || (y < 50 && x < shoreW(y) + 5 + 0.7 * Math.sin(y * 0.9))) t = T.SAND;
  if (y > riverS(x) && y < riverN(x)) t = T.WATER;
  else if (y > riverS(x) - 1.6 && y < riverN(x) + 1.6) t = T.SAND;
  terrain[c] = t;
}
// 营地夯土地面
fillTerrain(T.FLOOR, -29, 57, 29, 97);
// 道路
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
  const c = idx(i, j), t = terrain[c];
  if (t === T.SEA || t === T.WATER) continue;
  const x = cellX(i), y = cellY(j);
  let d = polyDist(x, y, ROAD);
  for (const s of SPURS) d = Math.min(d, polyDist(x, y, s) + 0.6);
  if (d < 2.1) terrain[c] = T.ROAD;
}
// 桥（南北向跨河，x ∈ [-25, -17)）
fillTerrain(T.BRIDGE, -25, 109, -17, 129, [T.GRASS]);
for (let j = 109; j < 129; j++) for (let i = ci(-25); i < ci(-17); i++) { const c = idx(i, j); if (terrain[c] === T.WATER || terrain[c] === T.SAND || terrain[c] === T.ROAD) terrain[c] = T.BRIDGE; }
// 直升机坪
export const PAD = { x: 22, y: 294, r: 4 };
for (let j = 288; j < 300; j++) for (let i = ci(16); i < ci(28); i++) { const x = cellX(i), y = cellY(j); if ((x - PAD.x) ** 2 + (y - PAD.y) ** 2 < PAD.r * PAD.r) terrain[idx(i, j)] = T.PAD; }
// Boss 场地
fillTerrain(T.DIRT, -26, 306, 26, 346, [T.ROAD]);

// ---------- 静态物体 ----------
const free = (x, y) => { const i = ci(x), j = cj(y); return inGrid(i, j) && !solid[idx(i, j)]; };
const okGround = (x, y) => { const i = ci(x), j = cj(y); if (!inGrid(i, j)) return false; const t = terrain[idx(i, j)]; return t === T.GRASS || t === T.SAND || t === T.DIRT || t === T.FLOOR; };

// 营地围墙与大门
export const GATE = addStatic('gate', -3, 55, 3, 57, { name: '营地大门' });
for (const [x0, x1] of [[-29, -5], [5, 29]]) addStatic('wall', x0, 55.5, x1, 56.5);
addStatic('wall', -30, 55.5, -29, 98); addStatic('wall', 29, 55.5, 30, 98);
addStatic('wall', -17, 96.5, 29, 97.5); addStatic('wall', -29, 96.5, -27, 97.5);
for (const [x, y] of [[-5, 55], [3, 55], [-31, 55], [29, 55], [-31, 96], [29, 96], [-19, 96], [-29, 96]]) addStatic('tower', x, y, x + 2, y + 2);

// 营房 / 俘虏屋：{n 普通俘虏, flash 闪光俘虏}
export const HUTS = [
  addStatic('hut', -17, 34, -12, 38, { n: 2, flash: 0, name: 'H0' }),
  addStatic('hut', 24, 22, 29, 26, { n: 2, flash: 1, name: 'H1' }),
  addStatic('hut', -21, 68, -15, 72, { n: 3, flash: 0, name: 'B1' }),
  addStatic('hut', 15, 78, 21, 82, { n: 2, flash: 1, name: 'B2' }),
  addStatic('hut', -31, 184, -26, 188, { n: 2, flash: 0, name: 'H2' }),
  addStatic('hut', -29, 230, -24, 234, { n: 2, flash: 0, name: 'H3' }),
  addStatic('hut', -33, 280, -28, 284, { n: 2, flash: 1, name: 'H4' })
];

// 营地内部
for (const [x, y] of [[16.5, 64.5], [-16.5, 86.5]]) { addStatic('tent', x - 1.5, y - 1.5, x + 1.5, y + 1.5); decor.tents.push([x, y]); }
addStatic('watch', 23, 91, 25, 93); decor.watchtowers.push([24, 92]);
for (const [x, y] of [[8.5, 66.5], [9.5, 66.5], [8.5, 67.5], [-26.5, 62.5], [-25.5, 62.5]]) { addStatic('crate', x - 0.5, y - 0.5, x + 0.5, y + 0.5); }
for (const [x, y] of [[-8.5, 76.5], [-7.5, 77.5], [-9.5, 77.5], [21.5, 70.5], [22.5, 71.5], [-28.5, 140.5], [-27.5, 141.5], [6.5, 262.5], [7.5, 263.5]]) addStatic('barrel', x - 0.5, y - 0.5, x + 0.5, y + 0.5);
// 沙袋掩体（2 格一段）
function sandbags(x0, y, x1) { for (let x = x0; x < x1; x += 2) addStatic('sandbag', x, y, Math.min(x + 2, x1), y + 1); }
sandbags(-4, 72, 4); sandbags(-2, 20, 4); sandbags(-14, 108, -8); sandbags(-6, 196, 0); sandbags(-14, 288, -8); sandbags(4, 150, 10);

// 桥栏
addStatic('rail', -25, 110, -24, 128); addStatic('rail', -18, 110, -17, 128);

// 崖顶台地（2×2 一块，火箭可炸毁）
export const BLUFFS = [];
function plateau(x0, y0, x1, y1, cut) {
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const corner = (x === x0 || x === x1 - 2) && (y === y0 || y === y1 - 2);
    if (corner && cut) continue;
    const s = addStatic('bluff', x, y, x + 2, y + 2);
    if (s) BLUFFS.push(s);
  }
}
plateau(-34, 154, -16, 166, true); plateau(8, 158, 30, 170, true); plateau(-14, 180, 2, 192, true); plateau(12, 188, 34, 200, true);

// Boss 入口路障（开战时升起）
export const BARRICADE = addStatic('barricade', -8, 304, 8, 306);
// 先把路障的格子从网格里拿掉，开战时再放回
for (const c of BARRICADE.cells) solid[c] = 0;
BARRICADE.alive = false;

// ---------- 树木 ----------
// size 2 = 2×2 密林块（连成实心林墙）；size 1 = 单棵
function tree(x, y, size, kind) {
  if (size === 2) {
    const s = addStatic(kind === 'palm' ? 'palm' : 'tree', x, y, x + 2, y + 2);
    if (s) decor.trees.push({ x: x + 1 + rr(-0.35, 0.35), y: y + 1 + rr(-0.35, 0.35), s: rr(1.05, 1.35), v: Math.floor(R() * 3), sid: s.id });
    return s;
  }
  const s = addStatic(kind === 'palm' ? 'palm' : 'tree', Math.floor(x), Math.floor(y), Math.floor(x) + 1, Math.floor(y) + 1);
  if (s) (kind === 'palm' ? decor.palms : decor.trees).push({ x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, s: kind === 'palm' ? rr(0.9, 1.15) : rr(0.75, 0.95), v: Math.floor(R() * 3), sid: s.id });
  return s;
}
const keepClear = [];   // [x, y, r]
function clear(x, y, r) { keepClear.push([x, y, r]); }
function nearClear(x, y, pad) {
  if (polyDist(x, y, ROAD) < 3.3 + pad) return true;
  for (const s of SPURS) if (polyDist(x, y, s) < 2.8 + pad) return true;
  for (const k of keepClear) if ((x - k[0]) ** 2 + (y - k[1]) ** 2 < (k[2] + pad) ** 2) return true;
  return false;
}
function forest(x0, y0, x1, y1, density) {
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    if (R() > (density || 1)) continue;
    if (nearClear(x + 1, y + 1, 0.4)) continue;
    let ok = true;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (!okGround(x + dx + 0.5, y + dy + 0.5) || !free(x + dx + 0.5, y + dy + 0.5)) ok = false;
    if (ok) tree(x, y, 2);
  }
}
function cluster(cx, cy, r, n, kind) {
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (!okGround(x, y) || !free(x, y) || nearClear(x, y, 0)) continue;
    tree(x, y, 1, kind);
  }
}

// 关键位置留空
clear(26.5, 24, 5); clear(-14.5, 36, 4.5); clear(PAD.x, PAD.y, 6); clear(-28.5, 186, 5); clear(-26.5, 232, 6); clear(-30.5, 282, 5);
clear(30, 205, 2.5);   // 隐藏星所在的林角
clear(0, 302, 9);
clear(-6, 140, 4);     // 坦克 T1

// A 区：海滩棕榈与丛林
for (let k = 0; k < 70; k++) {
  const x = rr(-34, 34), y = rr(3, 50);
  const i = ci(x), j = cj(y);
  if (!inGrid(i, j) || terrain[idx(i, j)] !== T.SAND || !free(x, y) || nearClear(x, y, 0.2)) continue;
  tree(x, y, 1, 'palm');
}
cluster(-26, 42, 4, 14); cluster(30, 42, 3.5, 10); cluster(-4, 36, 2, 5); cluster(8, 26, 1.6, 3); cluster(32, 14, 2.5, 6);
forest(-36, 48, -30, 100); forest(30, 48, 36, 100);
// C 区
cluster(20, 104, 3, 8); cluster(30, 106, 3, 8); cluster(-30, 146, 3, 9); cluster(24, 136, 3, 8); cluster(31, 150, 2, 5); cluster(-12, 132, 1.8, 4);
// D 区
forest(30, 154, 36, 204, 0.9); cluster(-32, 172, 2.5, 6); cluster(-12, 202, 2, 4); cluster(-34, 200, 2, 5);
// E 区：密林
forest(-36, 206, 36, 258);
// F 区
cluster(-22, 262, 3, 8); cluster(4, 266, 1.8, 4); cluster(-18, 297, 2, 4); cluster(31, 280, 2.5, 6); cluster(30, 262, 3, 7);
forest(-36, 256, -32, 300, 0.7); forest(34, 256, 36, 300, 0.7);
// G 区：Boss 场地四周密林、场内四处树丛
for (let y = 300; y < 352; y += 2) for (let x = -36; x < 36; x += 2) {
  const inArena = x >= -26 && x + 2 <= 26 && y >= 306 && y + 2 <= 346;
  const gapS = x >= -8 && x + 2 <= 8 && y < 306;
  const gapN = x >= -4 && x + 2 <= 4 && y >= 346;
  if (inArena || gapS || gapN) continue;
  if (y < 306 && Math.abs(x + 1) < 12 && y < 302) continue;
  tree(x, y, 2);
}
for (const [x, y] of [[-14, 316], [12, 316], [-14, 332], [12, 332]]) for (let dy = 0; dy < 4; dy += 2) for (let dx = 0; dx < 4; dx += 2) tree(x + dx, y + dy, 2);
// 岩石
for (const [x, y, s] of [[-33, 30, 1.6], [12, 8, 1.2], [-8, 128.5, 1.1], [16, 129, 1.3], [-34, 120, 1.5], [33, 120, 1.4], [-20, 150, 1.2], [26, 176, 1.3], [-2, 162, 1]]) {
  const st = addStatic('rock', Math.floor(x), Math.floor(y), Math.floor(x) + 1, Math.floor(y) + 1);
  if (st) decor.rocks.push({ x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, s, sid: st.id });
}
// 花丛与灌木（纯装饰，不挡路）
for (let k = 0; k < 260; k++) {
  const x = rr(-35, 35), y = rr(8, 300), i = ci(x), j = cj(y);
  if (!inGrid(i, j) || solid[idx(i, j)] || terrain[idx(i, j)] !== T.GRASS || polyDist(x, y, ROAD) < 2.6) continue;
  (k % 3 ? decor.flowers : decor.bushes).push({ x, y, s: rr(0.6, 1.1), v: Math.floor(R() * 3) });
}
// 草丛（纯装饰）
for (let k = 0; k < 1600; k++) {
  const x = rr(-35.5, 35.5), y = rr(4, 350), i = ci(x), j = cj(y);
  if (!inGrid(i, j) || solid[idx(i, j)]) continue;
  const t = terrain[idx(i, j)];
  if (t !== T.GRASS && !(t === T.DIRT && R() < 0.3)) continue;
  if (polyDist(x, y, ROAD) < 2.3) continue;
  decor.tufts.push({ x, y, s: rr(0.8, 1.4) });
}
// 场外装饰林
for (let y = 46; y < 372; y += 2.4) for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
  if (y > 106 && y < 131) continue;   // 河道延伸到场外
  if (side > 0 && y < 50) continue;
  const x = side * (37.5 + k * 2.6 + rr(-0.5, 0.5));
  decor.outerTrees.push({ x, y: y + rr(-0.6, 0.6), s: rr(1.1, 1.6), v: Math.floor(R() * 3) });
}
for (let x = -36; x < 36; x += 2.4) for (let k = 0; k < 6; k++) decor.outerTrees.push({ x: x + rr(-0.5, 0.5), y: 353.5 + k * 2.6, s: rr(1.1, 1.6), v: Math.floor(R() * 3) });

// ---------- 动态实体出生表 ----------
function S(t, x, y, o) { spawns.push(Object.assign({ t, x, y }, o || {})); }
// A 区：海滩
S('soldier', -12, 17, { patrol: [4, 0] }); S('soldier', -2, 15); S('soldier', 6, 31, { patrol: [0, 4] }); S('soldier', 14, 23);
S('soldier', 30, 30); S('soldier', 22, 38, { patrol: [-4, 0] }); S('soldier', -22, 30); S('soldier', -8, 44);
S('mg', -6, 28); S('mg', 10, 34);
// B 区：营地
S('soldier', -6, 52, { hold: true }); S('soldier', 6, 52, { hold: true });
S('cannon', -7, 62); S('cannon', 7, 62);
S('soldier', -10, 64, { patrol: [6, 0] }); S('soldier', 12, 72); S('soldier', -4, 84, { patrol: [0, 5] }); S('soldier', -22, 80); S('soldier', 22, 90);
S('officer', 0, 80); S('mg', 8, 86);
// C 区：河岸、炮艇、守桥坦克
S('soldier', -10, 104); S('soldier', 8, 108); S('soldier', -29, 106); S('mg', 2, 105);
S('boat', 10, 119, { range: [-13, 33] }); S('boat', 24, 121, { range: [-13, 33], dir: -1 });
S('tank', -6, 140, { flashPow: true }); S('soldier', -28, 135); S('soldier', 6, 134); S('soldier', 15, 147); S('mg', 12, 142);
// D 区：崖顶炮台
S('cannon', -25, 160, { elevated: true }); S('cannon', 19, 164, { elevated: true }); S('cannon', -6, 186, { elevated: true }); S('cannon', 23, 194, { elevated: true });
S('soldier', -6, 158); S('soldier', 2, 171); S('soldier', -24, 176); S('soldier', 8, 197); S('soldier', -31, 196); S('officer', -20, 191); S('mg', -3, 199.5);
S('star', 30, 205, { hidden: true });
// E 区：丛林
S('soldier', 8, 212); S('soldier', -6, 222); S('soldier', -17, 232); S('soldier', 0, 242); S('soldier', 15, 252); S('officer', -12, 229);
S('tank', 12, 251, { patrol: [[12, 246], [0, 242]] });
// F 区：最后的阵地
S('cannon', -14, 264); S('cannon', 24, 270); S('tank', 0, 284); S('tank', 15, 289); S('mg', -10, 291);
S('soldier', -26, 270); S('soldier', -22, 289); S('soldier', 8, 277); S('soldier', 29, 286); S('soldier', 17, 299);
// 4 名原地守卫
for (const x of [-6, -2, 2, 6]) S('soldier', x, 303.5, { hold: true, guard: true });

// ---------- 检查点 ----------
export const CHECKPOINTS = [
  { ty: -1, x: -19, y: 10, name: '海滩' },
  { ty: 48, x: 8, y: 45, name: '营地外' },
  { ty: 59, x: 0, y: 60, name: '营地内' },
  { ty: 101, x: -21, y: 103, name: '南岸' },
  { ty: 130, x: -21, y: 131, name: '北岸' },
  { ty: 172, x: -4, y: 172, name: '崖顶' },
  { ty: 205, x: 7, y: 205, name: '丛林' },
  { ty: 258, x: 12, y: 258, name: '最后阵地' },
  { ty: 296, x: 2, y: 293.5, name: '场地入口' }
];
export const BOSS = { trigger: 308.5, cx: 0, cy: 325, x0: -26, x1: 26, y0: 306, y1: 346, respawn: { x: 0, y: 309.5 }, entry: { x: 0, y: 350 } };
export const START = { x: -19, y: 10, dir: 2, introFrom: { x: -26, y: 2.2 } };
export const POW_TOTAL = HUTS.reduce((s, h) => s + h.data.n + h.data.flash, 0) + spawns.filter(s => s.flashPow).length;

// ---------- 查询 ----------
export function terrainAt(x, y) { const i = ci(x), j = cj(y); return inGrid(i, j) ? terrain[idx(i, j)] : T.GRASS; }
export function staticAt(x, y) { const i = ci(x), j = cj(y); if (!inGrid(i, j)) return null; const id = solid[idx(i, j)]; return id ? statics[id] : null; }
// 车辆是否可通行（越界、海、河都不可）
export function blockedMove(x, y, vehicle) {
  const i = ci(x), j = cj(y);
  if (!inGrid(i, j)) return true;
  const c = idx(i, j), t = terrain[c];
  if (t === T.SEA || t === T.WATER) return true;
  const id = solid[c];
  return id ? statics[id].blocksMove : false;
}
export function blockedShot(x, y) {
  const i = ci(x), j = cj(y);
  if (!inGrid(i, j)) return null;
  const id = solid[idx(i, j)];
  return id && statics[id].blocksShot ? statics[id] : null;
}
export function removeStatic(s) {
  s.alive = false;
  for (const c of s.cells) if (solid[c] === s.id) solid[c] = 0;
}
export function activateBarricade() {
  BARRICADE.alive = true;
  for (const c of BARRICADE.cells) solid[c] = BARRICADE.id;
}

// 新局复位：所有静态物体回到初始状态，路障收回
export function resetStatics() {
  for (const s of statics) {
    if (!s) continue;
    if (s.kind === 'barricade') { for (const c of s.cells) if (solid[c] === s.id) solid[c] = 0; s.alive = false; continue; }
    s.hp = s.maxHp;
    if (!s.alive) { s.alive = true; for (const c of s.cells) solid[c] = s.id; }
  }
}
