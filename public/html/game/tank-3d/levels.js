// 坦克大战 3D · 关卡：经典模式的 35 关原版地图 / 名单，以及魔改模式 100 关一周目的自创地图与难度曲线。
// 纯数据与生成逻辑（不依赖渲染），Node 可直接测试。
// 坐标单位与原作一致：1 px = FC 一个像素；战场 208×208 px = 26×26 个 8px 格 = 52×52 个 4px 砖块。
import { CLASSIC_STAGES } from './classic.js?v=merge1';

export const N = 26, Q = 52, FIELD = 208, S = 13;
export const CLASSIC_COUNT = 35, REMIX_LEVELS = 100;
export const EAGLE_CELLS = [[12, 24], [13, 24], [12, 25], [13, 25]];
export const BASE_WALL = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [14, 24], [11, 25], [14, 25]];

export function emptyTerrain() {
  return { brick: new Uint8Array(Q * Q), steel: new Uint8Array(N * N), water: new Uint8Array(N * N), forest: new Uint8Array(N * N), ice: new Uint8Array(N * N) };
}
export function setBrickCell(t, cx, cy, on = 1) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) t.brick[(cy * 2 + dy) * Q + cx * 2 + dx] = on;
}
export function brickCell(t, cx, cy) {
  const i = cy * 2 * Q + cx * 2;
  return t.brick[i] | t.brick[i + 1] | t.brick[i + Q] | t.brick[i + Q + 1];
}
function clearCell(t, cx, cy) { setBrickCell(t, cx, cy, 0); const c = cy * N + cx; t.steel[c] = t.water[c] = t.forest[c] = t.ice[c] = 0; }
function setBaseFort(t) {
  for (const [x, y] of BASE_WALL) { clearCell(t, x, y); setBrickCell(t, x, y, 1); }
  for (const [x, y] of EAGLE_CELLS) clearCell(t, x, y);
}

// ---------------- 经典：FC 原版 35 关 ----------------
export function parseClassicMap(rows) {
  const t = emptyTerrain();
  rows.forEach((row, by) => row.split(' ').forEach((tok, bx) => {
    const k = tok[0], bits = tok.length > 1 ? parseInt(tok.slice(1), 16) : 15;
    const cells = [[0, 0, 1], [1, 0, 2], [0, 1, 4], [1, 1, 8]];
    for (const [dx, dy, bit] of cells) {
      const cx = bx * 2 + dx, cy = by * 2 + dy, c = cy * N + cx;
      if (k === 'B' && bits & bit) setBrickCell(t, cx, cy);
      else if (k === 'T' && bits & bit) t.steel[c] = 1;
      else if (k === 'R') t.water[c] = 1;
      else if (k === 'F') t.forest[c] = 1;
      else if (k === 'S') t.ice[c] = 1;
    }
  }));
  return t;
}
function expandBots(list) { const out = []; for (const d of list) { const [n, type] = d.split('*'); for (let i = 0; i < +n; i++) out.push(type); } return out; }

// 原作第 36～70 关：地图 = 关号 − 35，敌军名单与出生间隔固定按第 35 关；第 70 关之后回到第 1 关
export function classicStage(stageNo) {
  const n = ((stageNo - 1) % 70) + 1, second = n > 35;
  const mapNo = second ? n - 35 : n, rosterNo = second ? 35 : n;
  const src = CLASSIC_STAGES[mapNo - 1];
  return {
    mode: 'classic', stageNo, mapNo, displayStage: stageNo,
    terrain: parseClassicMap(src.map),
    roster: expandBots(CLASSIC_STAGES[rosterNo - 1].bots),
    carriers: [3, 10, 17],
    spawnInterval: 190 - 4 * Math.min(rosterNo, 35),
    maxBots: 4, role: 'normal', label: '第 ' + stageNo + ' 关',
    diff: { speed: 1, bullet: 1, fireDiv: 32, armorHp: 4, hunt: 1, scoreMul: 1 }
  };
}

// ---------------- 魔改：100 关一周目，无限周目 ----------------
// 10 个章节，每章 10 关：第 5 关小 Boss、第 10 关大 Boss，第 100 关为终焉超级 Boss。
// 章节名沿用 2D 版章节主题；颜色只影响画面，地形偏好影响地图生成。
export const CHAPTERS = [
  { name: '锈湾', mini: '锈甲火焰车', boss: '锈湾堡垒', ground: '#3a3530', sky: '#9fb2c0', tint: '#c9a184', water: .5, forest: .25, ice: 0, steel: 1 },
  { name: '青苔沼', mini: '苔盾双管车', boss: '沼心巨兽', ground: '#2c3a28', sky: '#9fc0a8', tint: '#b9c48a', water: .7, forest: .9, ice: 0, steel: .7 },
  { name: '熔岩脊', mini: '熔核布雷车', boss: '火脊领主', ground: '#3d2620', sky: '#c99a86', tint: '#e0a070', water: .25, forest: .1, ice: 0, steel: 1.5, lava: true },
  { name: '霜原', mini: '冰棱指挥车', boss: '永冻王座', ground: '#3a4552', sky: '#c6dcef', tint: '#d6e4f0', water: .35, forest: .2, ice: 1, steel: .9, frozen: true },
  { name: '紫雾林', mini: '咒纹狙击车', boss: '紫雾魔树', ground: '#2e2638', sky: '#a99bc6', tint: '#c7a8e0', water: .3, forest: 1, ice: 0, steel: .8 },
  { name: '砂海', mini: '风蚀火焰车', boss: '砂海沙皇', ground: '#4a3f2a', sky: '#e0caa0', tint: '#e8cf98', water: .1, forest: .15, ice: .2, steel: .7 },
  { name: '深渊礁', mini: '触须双管车', boss: '深渊海魔', ground: '#1f2c38', sky: '#8eb0c8', tint: '#9ac0d8', water: 1, forest: .4, ice: 0, steel: .8 },
  { name: '雷暴原', mini: '雷锤布雷车', boss: '风暴巨像', ground: '#2f3132', sky: '#a0a8b4', tint: '#e0e090', water: .4, forest: .3, ice: .3, steel: 1.1 },
  { name: '夜鸦城', mini: '暗刃指挥车', boss: '夜鸦君主', ground: '#22242c', sky: '#6c7a96', tint: '#a8b0d0', water: .3, forest: .3, ice: .1, steel: 1.4 },
  { name: '终焉虚空', mini: '裂隙狙击车', boss: '终焉之眼', ground: '#1e1628', sky: '#8a78b0', tint: '#d0a0ff', water: .5, forest: .5, ice: .5, steel: 1.3 }
];
export const MINI_KINDS = ['flamecar', 'twin', 'miner', 'commander', 'sniper'];
export const MINI_INFO = {
  flamecar: { name: '火焰战车', tip: '会喷出 2 格宽的火焰弹，烧穿砖墙和树林；炮口发红就躲开' },
  twin: { name: '双管突击车', tip: '一次两发并排炮弹，还会突然加速冲锋；冲锋后会停顿一下' },
  miner: { name: '布雷车', tip: '边走边埋地雷，地雷闪红后爆炸，可以用炮弹提前引爆' },
  commander: { name: '指挥车', tip: '会呼叫护卫坦克，护卫活着时有护盾；先打掉护卫' },
  sniper: { name: '狙击炮车', tip: '与你同行同列时会瞄准（红色激光），随后射出穿透砖墙的炮弹；别站在激光上' }
};
export const BOSS_TIERS = 10;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = d => 1 - Math.exp(-d);
export function rngFrom(seed = 1) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// 13×13 超级格（一格 = 2×2 个 8px 格 = 一辆坦克的占地）。值：0 空 1 砖 2 钢 3 水 4 树 5 冰
const E0 = 0, B = 1, T = 2, W = 3, F = 4, I = 5;
const at = (g, i, j) => (i < 0 || j < 0 || i >= S || j >= S ? T : g[j * S + i]);
const put = (g, i, j, v) => { if (i >= 0 && j >= 0 && i < S && j < S) g[j * S + i] = v; };
const sym = (g, i, j, v) => { put(g, i, j, v); put(g, S - 1 - i, j, v); };

// 砖钢骨架：10 套布局（沿用 3D 版 50 关的布局语言），只铺第 0～10 行，底部两行留给老鹰阵地。
const THEMES = [
  (g, R, d) => { for (let j = 1; j <= 9; j += 2) for (let i = 0; i < S; i += 2) if (R() < d.fill) sym(g, i, j, R() < d.steel ? T : B); for (const [i, j] of [[5, 4], [6, 4], [5, 5], [6, 5]]) put(g, i, j, T); sym(g, 0, 6, T); },
  (g, R, d) => { for (let j = 1; j <= 8; j += 3) for (let i = 1; i <= 9; i += 4) { if (R() > d.fill) continue; for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 2; dx++) sym(g, i + dx, j + dz, B); sym(g, i, j + 1, T); } },
  (g, R, d) => { for (let j = 1; j <= 9; j += 2) { const gap = 1 + Math.floor(R() * (S - 3)); for (let i = 0; i < S; i++) if (Math.abs(i - gap) > 1 && R() < d.fill) put(g, i, j, R() < d.steel * 1.6 ? T : B); } },
  (g, R, d) => { for (let k = 0; k < S; k++) { put(g, k, k, T); put(g, S - 1 - k, k, T); } for (let j = 1; j <= 9; j++) for (let i = 1; i <= 11; i++) { if (Math.abs(i - j) < 2 || (i + j > S - 2 && i + j < S + 1)) continue; if (R() < d.fill * .5) sym(g, i, j, B); } },
  (g, R, d) => { const n = Math.round(7 + d.fill * 8); for (let k = 0; k < n; k++) { const i = 1 + Math.floor(R() * (S - 2)), j = 1 + Math.floor(R() * 9); sym(g, i, j, R() < d.steel * 2 ? T : B); sym(g, i - 1, j, B); sym(g, i + 1, j, B); sym(g, i, j - 1, B); sym(g, i, j + 1, B); } },
  (g, R, d) => { for (let j = 0; j <= 10; j++) for (let i = 0; i < S; i++) { const r = Math.max(Math.abs(i - 6), Math.abs(j - 5)); if (r === 3) sym(g, i, j, T); else if (r === 2) sym(g, i, j, B); else if (r === 4 && R() < d.fill * .5) sym(g, i, j, R() < d.steel ? T : B); } for (const [i, j] of [[6, 2], [3, 5], [6, 8], [9, 5]]) put(g, i, j, E0); },
  (g, R, d) => { for (let j = 2; j <= 9; j += 3) for (let i = 0; i < S; i++) if (R() < d.fill) put(g, i, j, B); for (let j = 1; j <= 10; j += 3) for (let i = 1; i < S; i += 3) sym(g, i, j, T); },
  (g, R, d) => { for (let j = 1, k = 0; j <= 9; j += 2, k++) { const gap = 1 + Math.floor(R() * (S - 4)), wide = 1 + (k % 2); for (let i = 0; i < S; i++) if (i < gap - wide || i > gap + wide) put(g, i, j, R() < d.steel ? T : B); } },
  (g, R, d) => { for (let j = 0; j <= 9; j++) for (let i = 0; i < S; i++) { const arm = Math.abs(i - 6) - j; if (arm === 0 || arm === 1) sym(g, i, j, j > 6 ? T : B); else if (arm === 3 && R() < d.fill) sym(g, i, j, B); } },
  (g, R, d) => { for (const [ox, oy] of [[2, 1], [2, 6], [10, 1], [10, 6]]) { const fx = ox < 6 ? 1 : -1; for (let k = 0; k < 4; k++) { put(g, ox + fx * k, oy, B); put(g, ox + fx * 3, oy + k, B); } put(g, ox + fx * 3, oy + 3, T); } for (let j = 0; j <= 10; j++) for (let i = 0; i < S; i++) if (at(g, i, j) === E0 && R() < d.fill * .2) sym(g, i, j, R() < d.steel ? T : B); }
];

// 章节地形点缀：河道（留桥）、水塘、树林、冰面，只盖在空地上
function decorate(g, R, ch, stageInCh) {
  const water = ch.water * (.5 + stageInCh / 14), forest = ch.forest, ice = ch.ice;
  if (R() < water) {                                    // 横穿的河道，左右各留至少一处桥
    const j = 3 + Math.floor(R() * 6), bridges = new Set([1 + Math.floor(R() * 4), 7 + Math.floor(R() * 4), 6]);
    for (let i = 0; i < S; i++) if (!bridges.has(i) && at(g, i, j) !== T) put(g, i, j, W);
  }
  const ponds = Math.round(water * 3 * R());
  for (let k = 0; k < ponds; k++) { const i = 1 + Math.floor(R() * 4), j = 1 + Math.floor(R() * 8); for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) if (at(g, i + a, j + b) === E0) sym(g, i + a, j + b, W); }
  const groves = Math.round(forest * (3 + R() * 4));
  for (let k = 0; k < groves; k++) { const i = Math.floor(R() * S), j = Math.floor(R() * 11), r = R() < .5 ? 1 : 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (at(g, i + a, j + b) === E0) sym(g, i + a, j + b, F); }
  const fields = Math.round(ice * (2 + R() * 3));
  for (let k = 0; k < fields; k++) { const i = Math.floor(R() * S), j = 1 + Math.floor(R() * 9); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (at(g, i + a, j + b) === E0) put(g, i + a, j + b, I); }
}

// Boss 竞技场：中间开阔，对称钢柱与砖堆，顶部中央留出 Boss 出场的 4×4 格
function arena(g, R, ch, tier) {
  const pillars = [[2, 3], [10, 3], [4, 6], [8, 6], [2, 9], [10, 9]];
  for (const [i, j] of pillars) put(g, i, j, T);
  for (let k = 0; k < 6 + tier; k++) { const i = Math.floor(R() * 6), j = 2 + Math.floor(R() * 8); if (at(g, i, j) === E0) sym(g, i, j, B); }
  for (let k = 0; k < Math.round(ch.forest * 3); k++) { const i = Math.floor(R() * 5), j = 3 + Math.floor(R() * 7); if (at(g, i, j) === E0) sym(g, i, j, F); }
  if (ch.ice) for (let i = 4; i <= 8; i++) for (let j = 4; j <= 5; j++) if (at(g, i, j) === E0) put(g, i, j, I);
  if (ch.water > .6) for (const i of [0, 1, 11, 12]) put(g, i, 6, W);
}

const PLAYER_SUPER = [4, 12], DEFENCE_SUPER = [6, 10], SPAWN_SUPERS = [[0, 0], [6, 0], [12, 0]];
const passable = v => v === E0 || v === F || v === I;
function reach(g, from) {
  const seen = new Uint8Array(S * S), q = [from[1] * S + from[0]]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % S, j = (c - i) / S;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + a, nj = j + b, k = nj * S + ni;
      if (ni < 0 || nj < 0 || ni >= S || nj >= S || seen[k] || !passable(g[k])) continue;
      seen[k] = 1; q.push(k);
    }
  }
  return seen;
}
// 中路护卫：中间出生点正下方一路通到老鹰会被开局第一辆敌军的随手几炮打穿（原版地图中路都有遮挡），
// 所以中路必须有钢块挡着，开路时也不拆它
const GUARD = [6, 7];
function guardCenter(g) {
  put(g, GUARD[0], GUARD[1], T);
  if (at(g, 5, 7) === E0) put(g, 5, 7, B);
  if (at(g, 7, 7) === E0) put(g, 7, 7, B);
}
// 不连通时按最少拆墙开路：进入有障碍的超级格代价 1（水改成桥），不碰老鹰阵地和中路护卫
function carve(g, from, to) {
  const cost = new Int16Array(S * S).fill(32000), prev = new Int16Array(S * S).fill(-1), start = from[1] * S + from[0];
  cost[start] = 0; const bag = [start];
  for (let h = 0; h < bag.length; h++) {
    const c = bag[h], i = c % S, j = (c - i) / S;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + a, nj = j + b; if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
      const k = nj * S + ni, add = passable(g[k]) ? 0 : nj > 10 || (ni === GUARD[0] && nj === GUARD[1]) ? 40 : 1;
      if (cost[c] + add < cost[k]) { cost[k] = cost[c] + add; prev[k] = c; bag.push(k); }
    }
  }
  let c = to[1] * S + to[0], guard = 0;
  while (c >= 0 && c !== start && guard++ < 400) { const i = c % S, j = (c - i) / S; if (j <= 10 && !passable(g[c])) g[c] = E0; c = prev[c]; }
}

export function remixInfo(level) {
  const chapter = Math.floor((level - 1) / 10) + 1, stage = ((level - 1) % 10) + 1;
  const role = level === REMIX_LEVELS ? 'final' : stage === 10 ? 'boss' : stage === 5 ? 'mini' : 'normal';
  return { chapter, stage, role, theme: CHAPTERS[chapter - 1] };
}

export function remixLayout(level) {
  const { chapter, stage, role, theme } = remixInfo(level);
  const R = rngFrom(7919 * level + 2027);
  const g = new Uint8Array(S * S);
  if (role === 'boss' || role === 'final') arena(g, R, theme, role === 'final' ? 10 : chapter);
  else {
    const d = { fill: clamp(.55 + level * .003, .55, .85), steel: clamp(.05 + level * .0015, .05, .2) * theme.steel };
    THEMES[((level - 1) + chapter) % THEMES.length](g, R, d);
    decorate(g, R, theme, stage);
  }
  for (let j = 11; j < S; j++) for (let i = 0; i < S; i++) g[j * S + i] = E0;
  guardCenter(g);
  const clear = [...SPAWN_SUPERS, PLAYER_SUPER, [4, 11]];
  if (role === 'boss' || role === 'final') clear.push([5, 0], [6, 0], [7, 0], [5, 1], [6, 1], [7, 1]);
  for (const [i, j] of clear) put(g, i, j, E0);
  for (const [i, j] of SPAWN_SUPERS) for (const t of [PLAYER_SUPER, DEFENCE_SUPER])
    for (let k = 0; k < 3 && !reach(g, [i, j])[t[1] * S + t[0]]; k++) carve(g, [i, j], t);
  for (const t of [[0, 11], [12, 11], ...SPAWN_SUPERS]) for (let k = 0; k < 3 && !reach(g, PLAYER_SUPER)[t[1] * S + t[0]]; k++) carve(g, PLAYER_SUPER, t);
  const t = emptyTerrain();
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = g[j * S + i];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const cx = i * 2 + dx, cy = j * 2 + dy, c = cy * N + cx;
      if (v === B) setBrickCell(t, cx, cy); else if (v === T) t.steel[c] = 1; else if (v === W) t.water[c] = 1; else if (v === F) t.forest[c] = 1; else if (v === I) t.ice[c] = 1;
    }
  }
  // 底部阵地：两侧砖墙掩体 + 老鹰砖墙；魔改在两侧角落加树丛方便埋伏
  for (const x of [2, 3, 4, 5, 20, 21, 22, 23]) for (const y of [24, 25]) setBrickCell(t, x, y);
  if (theme.forest > .2) for (const [x, y] of [[0, 22], [1, 22], [24, 22], [25, 22], [0, 23], [1, 23], [24, 23], [25, 23]]) t.forest[y * N + x] = 1;
  setBaseFort(t);
  return t;
}

// 难度：tier 是整个进度上的位置，周目越后越难，所有曲线渐近收敛，避免高周目不可玩
export function remixStage(level, cycle) {
  const info = remixInfo(level), tier = (cycle - 1) * REMIX_LEVELS + level - 1;
  const R = rngFrom(4441 + level * 104729 + cycle * 7);
  const diff = {
    tier,
    speed: 1 + .42 * ease(tier / 160),
    bullet: 1 + .5 * ease(tier / 200),
    fireDiv: 32 - 13 * ease(tier / 150),
    armorHp: Math.min(7, 4 + Math.floor(tier / 90)),
    hunt: 1 + .8 * ease(tier / 120),
    bossHp: 1 + .35 * (cycle - 1),
    scoreMul: 1 + .5 * (cycle - 1)
  };
  let roster = [];
  if (info.role === 'boss') roster = ['boss'];
  else if (info.role === 'final') roster = ['final'];
  else {
    const count = clamp(16 + info.chapter + Math.floor(info.stage / 3) + (cycle - 1) * 2, 16, 34);
    const w = {
      basic: Math.max(.1, 1 - tier / 70),
      fast: .2 + Math.min(.2, tier / 300),
      power: tier >= 2 ? .14 + Math.min(.16, tier / 400) : 0,
      armor: tier >= 4 ? .08 + Math.min(.26, tier / 250) : 0,
      heavy: tier >= 2 ? .06 + Math.min(.16, tier / 350) : 0,
      flame: tier >= 6 ? .04 + Math.min(.1, tier / 500) : 0
    };
    const keys = Object.keys(w), total = keys.reduce((s, k) => s + w[k], 0);
    for (let k = 0; k < count; k++) { let r = R() * total; for (const key of keys) { r -= w[key]; if (r <= 0) { roster.push(key); break; } } }
    if (level === 1 && cycle === 1) roster = [...Array(14).fill('basic'), 'fast', 'basic', 'fast', 'heavy', 'basic', 'fast'].slice(0, count);
    if (info.role === 'mini') roster.splice(Math.floor(roster.length / 2), 0, 'mini');
  }
  const carriers = info.role === 'boss' || info.role === 'final' ? [] : roster.length > 24 ? [3, 10, 17, 24] : [3, 10, 17];
  const spawnInterval = Math.max(56, 190 - 4 * Math.min(35, 4 + Math.floor(level / 3)) - (cycle - 1) * 8);
  return {
    mode: 'remix', stageNo: level, cycle, displayStage: level, mapNo: level,
    terrain: remixLayout(level), roster, carriers, spawnInterval,
    maxBots: clamp(4 + (tier >= 25 ? 1 : 0) + (tier >= 110 ? 1 : 0), 4, 6),
    role: info.role, chapter: info.chapter, chapterStage: info.stage, theme: info.theme,
    miniKind: MINI_KINDS[(info.chapter - 1) % MINI_KINDS.length],
    bossTier: info.role === 'final' ? BOSS_TIERS : info.chapter,
    label: '第 ' + level + ' 关 · ' + info.theme.name + ' ' + info.chapter + '-' + info.stage + (cycle > 1 ? ' · 第 ' + cycle + ' 周目' : ''),
    diff
  };
}

export function buildStage(mode, stageNo, cycle = 1) {
  return mode === 'classic' ? classicStage(stageNo) : remixStage(stageNo, cycle);
}
