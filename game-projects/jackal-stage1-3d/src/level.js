// 关卡引擎：网格、静态物体、出生表与查询。各关布局在 stages/*.js，loadStage(n) 时整体重建。
// 网格每格 1×1；x ∈ [-36, 36)，y ∈ [0, 352)。逻辑坐标 x 向东、y 向北。
import { fixedRng } from './core.js';
import stage1 from './stages/stage1.js';
import stage2 from './stages/stage2.js';

export const COLS = 72, ROWS = 352, X0 = -36;
export const STAGE_COUNT = 2;   // 目前做到第二关
export const T = { GRASS: 0, SAND: 1, ROAD: 2, WATER: 3, SEA: 4, BRIDGE: 5, FLOOR: 6, DIRT: 7, PAD: 8, STONE: 9, CONCRETE: 10, MARSH: 11, CHASM: 12, CONVEYOR: 13 };

export const terrain = new Uint8Array(COLS * ROWS);
export const solid = new Int32Array(COLS * ROWS);       // 静态物体 id（0 = 空）
export const statics = [null];                          // id → 物体
export const spawns = [];                               // 动态实体出生表
const DECOR_KEYS = ['palms', 'trees', 'bushes', 'rocks', 'flowers', 'tufts', 'outerTrees', 'tents', 'crates', 'watchtowers', 'pines', 'reeds', 'marks', 'props'];
export const decor = {};
for (const k of DECOR_KEYS) decor[k] = [];

// 当前关卡（loadStage 时整体替换；ES 模块活绑定，其他模块读到的总是当前关）
export let STAGE_NO = 0;
export let STAGE = null;
export let PAD = null, BOSS = null, START = null, CHECKPOINTS = [], ROAD = [], SPURS = [];
export let GATE = null, GATES = [], HUTS = [], BLUFFS = [], BARRICADE = null, POW_TOTAL = 0;

export const inGrid = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;
export const ci = (x) => Math.floor(x - X0);
export const cj = (y) => Math.floor(y);
export const idx = (i, j) => j * COLS + i;
export const cellX = (i) => X0 + i + 0.5;
export const cellY = (j) => j + 0.5;

// ---------- 静态物体种类 ----------
// move：挡车；shot：挡子弹；by：可被什么摧毁（explosive 手雷火箭 / rocket 只有火箭 / any 任意）
const KIND = {
  tree:      { move: true,  shot: false, by: null },
  palm:      { move: true,  shot: false, by: null },
  rock:      { move: true,  shot: true,  by: null },
  wall:      { move: true,  shot: true,  by: null },
  tower:     { move: true,  shot: true,  by: null },
  rail:      { move: true,  shot: false, by: null },
  gate:      { move: true,  shot: true,  by: 'explosive', hp: 8 },
  hut:       { move: true,  shot: true,  by: 'explosive', hp: 4 },
  tent:      { move: true,  shot: true,  by: null },
  crate:     { move: true,  shot: true,  by: 'explosive', hp: 2 },
  watch:     { move: true,  shot: true,  by: null },
  sandbag:   { move: true,  shot: true,  by: 'explosive', hp: 4 },
  barrel:    { move: true,  shot: true,  by: 'any', hp: 1 },
  bluff:     { move: true,  shot: true,  by: 'rocket', hp: 4 },
  barricade: { move: true,  shot: true,  by: null },
  // 第 2～6 关
  pillar:    { move: true,  shot: true,  by: null },            // 废墟石柱
  ruin:      { move: true,  shot: true,  by: null },            // 断墙 / 石台
  warehouse: { move: true,  shot: true,  by: null },            // 仓库 / 营舍 / 机库
  container: { move: true,  shot: true,  by: null },            // 集装箱
  ridge:     { move: true,  shot: true,  by: null },            // 山脊 / 崖壁
  hedge:     { move: true,  shot: false, by: null },            // 草坡（子弹能飞过）
  jet:       { move: true,  shot: true,  by: 'explosive', hp: 4 },   // 停机坪上的战机
  pylon:     { move: true,  shot: false, by: null }             // 桥墩 / 系缆桩等小件
};

export function addStatic(kind, x0, y0, x1, y1, data) {
  const k = KIND[kind];
  const s = {
    id: statics.length, kind, x0, y0, x1, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2,
    blocksMove: k.move, blocksShot: k.shot, by: k.by, hp: (data && data.hp) || k.hp || 0, maxHp: (data && data.hp) || k.hp || 0,
    alive: true, cells: [], data: data || {}
  };
  for (let j = cj(y0); j < Math.ceil(y1); j++) for (let i = ci(x0); i < Math.ceil(x1 - X0); i++) {
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

// ---------- 布局工具（给 stages/*.js 用） ----------
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}
export function polyDist(px, py, pts) {
  let d = 1e9;
  for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, segDist(px, py, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
  return d;
}

function makeBuilder(n) {
  const R = fixedRng(20261002 + (n - 1) * 1013);
  const rr = (a, b) => a + (b - a) * R();
  const keepClear = [];   // [x, y, r]
  const B = {
    n, T, R, rr, terrain, solid, statics, spawns, decor, COLS, ROWS, X0,
    ci, cj, idx, cellX, cellY, inGrid, polyDist, addStatic,
    road: [], spurs: [],
    forCells(fn) { for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) fn(cellX(i), cellY(j), idx(i, j), i, j); },
    fill(type, x0, y0, x1, y1, keep) {
      for (let j = Math.max(0, cj(y0)); j < Math.min(ROWS, Math.ceil(y1)); j++)
        for (let i = Math.max(0, ci(x0)); i < Math.min(COLS, Math.ceil(x1 - X0)); i++) {
          const c = idx(i, j);
          if (keep && keep.indexOf(terrain[c]) >= 0) continue;
          terrain[c] = type;
        }
    },
    // 按折线画路（skip 里的地形不覆盖）
    paintRoad(type, width, skip) {
      B.forCells((x, y, c) => {
        if (skip && skip.indexOf(terrain[c]) >= 0) return;
        let d = polyDist(x, y, B.road);
        for (const s of B.spurs) d = Math.min(d, polyDist(x, y, s) + 0.6);
        if (d < width) terrain[c] = type;
      });
    },
    tAt(x, y) { const i = ci(x), j = cj(y); return inGrid(i, j) ? terrain[idx(i, j)] : -1; },
    free(x, y) { const i = ci(x), j = cj(y); return inGrid(i, j) && !solid[idx(i, j)]; },
    okGround(x, y, types) {
      const i = ci(x), j = cj(y); if (!inGrid(i, j)) return false;
      const t = terrain[idx(i, j)];
      return types ? types.indexOf(t) >= 0 : (t === T.GRASS || t === T.SAND || t === T.DIRT || t === T.FLOOR);
    },
    clear(x, y, r) { keepClear.push([x, y, r]); },
    nearClear(x, y, pad) {
      if (B.road.length && polyDist(x, y, B.road) < 3.3 + pad) return true;
      for (const s of B.spurs) if (polyDist(x, y, s) < 2.8 + pad) return true;
      for (const k of keepClear) if ((x - k[0]) ** 2 + (y - k[1]) ** 2 < (k[2] + pad) ** 2) return true;
      return false;
    },
    // size 2 = 2×2 密林块；size 1 = 单棵。kind：tree / palm / pine
    tree(x, y, size, kind) {
      const sk = kind === 'palm' ? 'palm' : 'tree';
      if (size === 2) {
        const s = addStatic(sk, x, y, x + 2, y + 2);
        if (s) (kind === 'pine' ? decor.pines : decor.trees).push({ x: x + 1 + rr(-0.35, 0.35), y: y + 1 + rr(-0.35, 0.35), s: rr(1.05, 1.35), v: Math.floor(R() * 3), sid: s.id });
        return s;
      }
      const s = addStatic(sk, Math.floor(x), Math.floor(y), Math.floor(x) + 1, Math.floor(y) + 1);
      if (s) (kind === 'palm' ? decor.palms : kind === 'pine' ? decor.pines : decor.trees).push({ x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, s: kind === 'palm' ? rr(0.9, 1.15) : rr(0.75, 0.95), v: Math.floor(R() * 3), sid: s.id });
      return s;
    },
    forest(x0, y0, x1, y1, density, kind, ground) {
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        if (R() > (density || 1)) continue;
        if (B.nearClear(x + 1, y + 1, 0.4)) continue;
        let ok = true;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (!B.okGround(x + dx + 0.5, y + dy + 0.5, ground) || !B.free(x + dx + 0.5, y + dy + 0.5)) ok = false;
        if (ok) B.tree(x, y, 2, kind);
      }
    },
    cluster(cx, cy, r, n, kind, ground) {
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (!B.okGround(x, y, ground) || !B.free(x, y) || B.nearClear(x, y, 0)) continue;
        B.tree(x, y, 1, kind);
      }
    },
    rock(x, y, s) {
      const st = addStatic('rock', Math.floor(x), Math.floor(y), Math.floor(x) + 1, Math.floor(y) + 1);
      if (st) decor.rocks.push({ x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, s, sid: st.id });
      return st;
    },
    sandbags(x0, y, x1) { for (let x = x0; x < x1; x += 2) addStatic('sandbag', x, y, Math.min(x + 2, x1), y + 1); },
    // 2×2 一块的岩崖（火箭可炸毁）
    plateau(x0, y0, x1, y1, cut, list) {
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const corner = (x === x0 || x === x1 - 2) && (y === y0 || y === y1 - 2);
        if (corner && cut) continue;
        const s = addStatic('bluff', x, y, x + 2, y + 2);
        if (s) list.push(s);
      }
    },
    // 一圈墙（style 决定外观），gates：[[x0, x1, side]] 留口给大门
    wallBox(x0, y0, x1, y1, style, holes) {
      const hs = holes || [];
      const open = (side, a, b) => hs.some(h => h[2] === side && b > h[0] && a < h[1]);
      for (const [side, y] of [['s', y0], ['n', y1 - 1]]) for (let x = x0; x < x1; x++) if (!open(side, x, x + 1)) addStatic('wall', x, y + 0.5 - 0.5, x + 1, y + 1, { style });
      for (const [side, x] of [['w', x0], ['e', x1 - 1]]) for (let y = y0 + 1; y < y1 - 1; y++) if (!open(side, y, y + 1)) addStatic('wall', x, y, x + 1, y + 1, { style });
    },
    S(t, x, y, o) { spawns.push(Object.assign({ t, x, y }, o || {})); },
    // 纯装饰：花丛、灌木、草丛
    scatterDecor(nFlowers, nTufts, ground, fy, ty) {
      const fr = fy || [8, 300], tr = ty || [4, 350];
      for (let k = 0; k < nFlowers; k++) {
        const x = rr(-35, 35), y = rr(fr[0], fr[1]), i = ci(x), j = cj(y);
        if (!inGrid(i, j) || solid[idx(i, j)] || terrain[idx(i, j)] !== (ground == null ? T.GRASS : ground) || (B.road.length && polyDist(x, y, B.road) < 2.6)) continue;
        (k % 3 ? decor.flowers : decor.bushes).push({ x, y, s: rr(0.6, 1.1), v: Math.floor(R() * 3) });
      }
      for (let k = 0; k < nTufts; k++) {
        const x = rr(-35.5, 35.5), y = rr(tr[0], tr[1]), i = ci(x), j = cj(y);
        if (!inGrid(i, j) || solid[idx(i, j)]) continue;
        const t = terrain[idx(i, j)];
        if (t !== (ground == null ? T.GRASS : ground) && !(t === T.DIRT && R() < 0.3)) continue;
        if (B.road.length && polyDist(x, y, B.road) < 2.3) continue;
        decor.tufts.push({ x, y, s: rr(0.8, 1.4) });
      }
    },
    // 场外装饰林（三面围住关卡）
    outerForest(kind, skipY) {
      const list = kind === 'pine' ? decor.outerTrees : decor.outerTrees;
      for (let y = -6; y < 372; y += 2.4) for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
        if (skipY && skipY(y, side)) continue;
        list.push({ x: side * (37.5 + k * 2.6 + rr(-0.5, 0.5)), y: y + rr(-0.6, 0.6), s: rr(1.1, 1.6), v: Math.floor(R() * 3), kind });
      }
      for (let x = -36; x < 36; x += 2.4) for (let k = 0; k < 6; k++) list.push({ x: x + rr(-0.5, 0.5), y: 353.5 + k * 2.6, s: rr(1.1, 1.6), v: Math.floor(R() * 3), kind });
    }
  };
  return B;
}

const BUILDERS = [null, stage1, stage2];

// 载入第 n 关：清空网格与列表，调用该关布局，返回关卡配置
export function loadStage(n) {
  terrain.fill(0); solid.fill(0);
  statics.length = 1; spawns.length = 0;
  for (const k of DECOR_KEYS) decor[k].length = 0;
  const B = makeBuilder(n);
  const cfg = BUILDERS[n](B);
  STAGE_NO = n;
  STAGE = cfg;
  PAD = cfg.pad; BOSS = cfg.boss; START = cfg.start; CHECKPOINTS = cfg.checkpoints;
  ROAD = B.road; SPURS = B.spurs;
  GATES = statics.filter(s => s && s.kind === 'gate');
  GATE = cfg.gate || GATES[0] || null;
  HUTS = statics.filter(s => s && s.kind === 'hut');
  BLUFFS = statics.filter(s => s && s.kind === 'bluff');
  BARRICADE = cfg.barricade || null;
  if (BARRICADE) { for (const c of BARRICADE.cells) solid[c] = 0; BARRICADE.alive = false; }
  POW_TOTAL = HUTS.reduce((s, h) => s + (h.data.trap ? 0 : h.data.n + h.data.flash), 0) + spawns.filter(s => s.flashPow).length;
  return cfg;
}

// ---------- 查询 ----------
export function terrainAt(x, y) { const i = ci(x), j = cj(y); return inGrid(i, j) ? terrain[idx(i, j)] : T.GRASS; }
export function staticAt(x, y) { const i = ci(x), j = cj(y); if (!inGrid(i, j)) return null; const id = solid[idx(i, j)]; return id ? statics[id] : null; }
const NOGO = new Uint8Array(16); NOGO[T.SEA] = 1; NOGO[T.WATER] = 1; NOGO[T.CHASM] = 1;
export const isNoGo = (t) => NOGO[t] === 1;
// 车辆是否可通行（越界、海、河、深沟都不可）
export function blockedMove(x, y) {
  const i = ci(x), j = cj(y);
  if (!inGrid(i, j)) return true;
  const c = idx(i, j), t = terrain[c];
  if (NOGO[t]) return true;
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
  if (!BARRICADE) return;
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
