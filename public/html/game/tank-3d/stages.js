// Tank Battle 3D · stage layouts and the difficulty curve (pure logic, no rendering — Node-testable).
// 50 stages, then the run loops: loop 2 starts again at stage 1 with harder enemies, and so on.
// Layouts are deterministic per stage number (a stage always looks the same, in every loop).
import { N, S, EMPTY, BRICK, STEEL, BASE, BASE_WALL, rngFrom, SPAWN_SUPERS, PLAYER_SUPER } from './field.js?v=stages1';

export { rngFrom };
export const TOTAL_STAGES = 50;
export const SPAWN_BAND = 22;              // rows 22-25 are the fixed eagle band for generated stages

// Original layout written for this demo in the spirit of the classic first stage:
// brick columns, a steel core, steel edge posts and a brick fort around the eagle.
export const STAGE1 = [
  '..........................',
  '..........................',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##@@##..##..##..',
  '..##..##..##@@##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '..........##..##..........',
  '..........##..##..........',
  '##..####..........####..##',
  '@@..####..........####..@@',
  '..........##..##..........',
  '..........##..##..........',
  '..##..##..######..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..##..##..##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '..##..##..........##..##..',
  '...........####...........',
  '...........#EE#...........',
  '...........#EE#...........'
];

const at = (g, i, j) => (i < 0 || j < 0 || i >= S || j >= S ? STEEL : g[j * S + i]);
const put = (g, i, j, v) => { if (i >= 0 && j >= 0 && i < S && j < S) g[j * S + i] = v; };
// Most themes are drawn on the left half and mirrored, which keeps the field readable and the
// three enemy spawn points equally reachable.
function sym(g, i, j, v) { put(g, i, j, v); put(g, S - 1 - i, j, v); }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Themes work on the 13×13 super grid (one super cell = one 2×2 block of field cells).
// Only rows 0..10 are themed; the eagle band below is rebuilt afterwards. `d` carries the
// stage-scaled densities: d.fill = how much of the field is built over, d.steel = brick→steel chance.
const THEMES = [
  { name: 'columns', fn(g, R, d) {                      // classic vertical brick pillars with a steel core
    for (let j = 1; j <= 9; j += 2) for (let i = 0; i < S; i += 2) if (R() < d.fill) sym(g, i, j, R() < d.steel ? STEEL : BRICK);
    for (const [i, j] of [[5, 4], [6, 4], [5, 5], [6, 5]]) put(g, i, j, STEEL);
    sym(g, 0, 6, STEEL); sym(g, 0, 7, STEEL);
  } },
  { name: 'bastion', fn(g, R, d) {                       // 2×2-supercell bunkers with steel cores
    for (let j = 1; j <= 8; j += 3) for (let i = 1; i <= 9; i += 4) {
      if (R() > d.fill) continue;
      for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 2; dx++) sym(g, i + dx, j + dz, BRICK);
      sym(g, i, j + 1, STEEL);
    }
  } },
  { name: 'serpentine', fn(g, R, d) {                   // long horizontal walls with alternating gaps
    for (let j = 1; j <= 9; j += 2) {
      const gap = 1 + Math.floor(R() * (S - 3));
      for (let i = 0; i < S; i++) if (Math.abs(i - gap) > 1 && R() < d.fill) put(g, i, j, R() < d.steel * 1.6 ? STEEL : BRICK);
    }
    for (let j = 2; j <= 8; j += 3) for (let i = 2; i < S - 2; i += 4) if (R() < .5) sym(g, i, j, BRICK);
  } },
  { name: 'crossfire', fn(g, R, d) {                    // diagonal steel bands plus brick quadrant clusters
    for (let k = 0; k < S; k++) { put(g, k, k, STEEL); put(g, S - 1 - k, k, STEEL); }
    for (let j = 1; j <= 9; j++) for (let i = 1; i <= 11; i++) {
      if (Math.abs(i - j) < 2 || i + j > S - 1 && i + j < S + 1) continue;
      if (R() < d.fill * .55) sym(g, i, j, BRICK);
    }
  } },
  { name: 'islands', fn(g, R, d) {                      // scattered plus-shaped clusters
    const n = Math.round(7 + d.fill * 9);
    for (let k = 0; k < n; k++) {
      const i = 1 + Math.floor(R() * (S - 2)), j = 1 + Math.floor(R() * 9);
      const core = R() < d.steel * 2 ? STEEL : BRICK;
      sym(g, i, j, core); sym(g, i - 1, j, BRICK); sym(g, i + 1, j, BRICK); sym(g, i, j - 1, BRICK); sym(g, i, j + 1, BRICK);
    }
  } },
  { name: 'redoubt', fn(g, R, d) {                      // rings around the middle of the field
    for (let j = 0; j <= 10; j++) for (let i = 0; i < S; i++) {
      const r = Math.max(Math.abs(i - 6), Math.abs(j - 5));
      if (r === 3) sym(g, i, j, STEEL);
      else if (r === 2) sym(g, i, j, BRICK);
      else if (r === 1) sym(g, i, j, R() < .55 ? BRICK : EMPTY);
      else if (r === 4 && R() < d.fill * .5) sym(g, i, j, R() < d.steel ? STEEL : BRICK);
    }
    for (const [i, j] of [[5, 3], [7, 7], [6, 1], [6, 9]]) sym(g, i, j, EMPTY);   // gun ports in the steel ring
  } },
  { name: 'pillars', fn(g, R, d) {                      // sparse steel pillars over brick strips
    for (let j = 2; j <= 9; j += 3) for (let i = 0; i < S; i++) if (R() < d.fill) put(g, i, j, BRICK);
    for (let j = 1; j <= 10; j += 3) for (let i = 1; i < S; i += 3) sym(g, i, j, STEEL);
    for (let j = 4; j <= 8; j += 4) for (let i = 0; i < S; i += 2) if (R() < .6) sym(g, i, j, BRICK);
  } },
  { name: 'trenches', fn(g, R, d) {                     // stacked trenches with offsets and steel revetments
    for (let j = 1, k = 0; j <= 9; j += 2, k++) {
      const gap = 1 + Math.floor(R() * (S - 4)), wide = 1 + (k % 2);
      for (let i = 0; i < S; i++) if (i < gap - wide || i > gap + wide) put(g, i, j, R() < d.steel ? STEEL : BRICK);
      for (let i = 0; i < S; i += 3) if (R() < .45) put(g, i, j - 1, STEEL);
    }
  } },
  { name: 'funnel', fn(g, R, d) {                       // V walls that herd tanks toward the middle files
    for (let j = 0; j <= 9; j++) for (let i = 0; i < S; i++) {
      const arm = Math.abs(i - 6) - j;
      if (arm === 0 || arm === 1) sym(g, i, j, j > 6 ? STEEL : BRICK);
      else if (arm === 3 && R() < d.fill) sym(g, i, j, BRICK);
    }
  } },
  { name: 'pinwheel', fn(g, R, d) {                     // four rotating brick arms, steel tips
    for (const [ox, oy] of [[2, 1], [2, 6], [8, 1], [8, 6]]) {
      const fx = ox < 6 ? 1 : -1;
      for (let k = 0; k < 4; k++) { put(g, ox + fx * k, oy, BRICK); put(g, ox + fx * 3, oy + k, BRICK); }
      put(g, ox + fx * 3, oy + 3, STEEL);
    }
    for (let j = 0; j <= 10; j++) for (let i = 0; i < S; i++) if (at(g, i, j) === EMPTY && R() < d.fill * .22) sym(g, i, j, R() < d.steel ? STEEL : BRICK);
  } },
];

const cellOf = (g, x, z) => at(g, Math.floor(x / 2), Math.floor(z / 2));

// Fixed scenery under the themed rows: open moat on 22-23, brick gutters and the fort on 24-25.
function applyBaseBand(cells) {
  for (let z = SPAWN_BAND; z < N; z++) for (let x = 0; x < N; x++) cells[z * N + x] = EMPTY;
  for (const x of [2, 3, 4, 5, 20, 21, 22, 23]) for (const z of [24, 25]) cells[z * N + x] = BRICK;
  for (const [x, z] of BASE_WALL) cells[z * N + x] = BRICK;
  for (let z = 24; z <= 25; z++) for (let x = 12; x <= 13; x++) cells[z * N + x] = BASE;
}

// Footprints that must stay clear so tanks can always drop in and drive away.
const MUST_CLEAR = [...SPAWN_SUPERS.map(([i, j]) => [i, j]), PLAYER_SUPER, [PLAYER_SUPER[0], PLAYER_SUPER[1] - 1]];

function isFree(cells, i, j) {
  return [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dz]) => cells[(2 * j + dz) * N + 2 * i + dx] === EMPTY);
}

// Breadth-first search over open footprints; `order` is only used to keep the carve deterministic.
function reach(cells, from) {
  const seen = new Int8Array(S * S), q = [from[1] * S + from[0]];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % S, j = (c - i) / S;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= S || nj >= S || !isFree(cells, ni, nj)) continue;
      const k = nj * S + ni;
      if (!seen[k]) { seen[k] = 1; q.push(k); }
    }
  }
  return seen;
}

// Cheapest footprint path if a pair is not connected yet: entering a built-over super costs 1,
// so a corridor is cut through as little wall as possible and never inside the eagle band.
function carve(cells, from, to) {
  const cost = new Int16Array(S * S).fill(32000), prev = new Int16Array(S * S).fill(-1);
  const start = from[1] * S + from[0]; cost[start] = 0;
  const bag = [start];
  for (let h = 0; h < bag.length; h++) {
    const c = bag[h], i = c % S, j = (c - i) / S;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
      const k = nj * S + ni;
      const add = isFree(cells, ni, nj) ? 0 : (nj > 10 ? 40 : 1);   // don't chew into the eagle band
      if (cost[c] + add < cost[k]) { cost[k] = cost[c] + add; prev[k] = c; bag.push(k); }
    }
  }
  let c = to[1] * S + to[0], guard = 0;
  while (c >= 0 && c !== start && guard++ < 400) {
    const i = c % S, j = (c - i) / S;
    if (j <= 10) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) cells[(2 * j + dz) * N + 2 * i + dx] = EMPTY;
    c = prev[c];
  }
}

// The file directly above the eagle fort: whoever holds it can defend (or shell) the base.
const DEFENCE_SUPER = [6, 10];

// Theme rotation that also shifts each decade of stages, so stage 10 and stage 20 never repeat.
const themeFor = stage => THEMES[((stage - 1) + Math.floor((stage - 1) / 10)) % THEMES.length];

export function layoutFor(stage) {
  if (stage === 1) return STAGE1.slice();
  const theme = themeFor(stage);
  const R = rngFrom(2027 + stage * 7919);
  const d = { fill: clamp(.6 + (stage - 1) * .006, .6, .86), steel: clamp(.05 + (stage - 1) * .004, .05, .22) };
  const g = new Uint8Array(S * S);
  theme.fn(g, R, d);
  const cells = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) cells[z * N + x] = cellOf(g, x, z);
  applyBaseBand(cells);
  for (const [i, j] of MUST_CLEAR) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) cells[(2 * j + dz) * N + 2 * i + dx] = EMPTY;
  // Guarantee: every spawn can drive to the player and to the file directly above the eagle fort.
  const targets = [PLAYER_SUPER, DEFENCE_SUPER];
  for (const [i, j] of SPAWN_SUPERS) for (const t of targets) {
    for (let attempt = 0; attempt < 3 && !reach(cells, [i, j])[t[1] * S + t[0]]; attempt++) carve(cells, [i, j], t);
  }
  // The player must also be able to patrol both halves of the moat, not just its own corner.
  for (const t of [[0, 11], [12, 11], ...SPAWN_SUPERS.map(([i, j]) => [i, j])]) {
    for (let attempt = 0; attempt < 3 && !reach(cells, PLAYER_SUPER)[t[1] * S + t[0]]; attempt++) carve(cells, PLAYER_SUPER, t);
  }
  return cellsToRows(cells);
}

function cellsToRows(cells) {
  const out = [];
  for (let z = 0; z < N; z++) {
    let row = '';
    for (let x = 0; x < N; x++) row += cells[z * N + x] === BRICK ? '#' : cells[z * N + x] === STEEL ? '@' : cells[z * N + x] === BASE ? 'E' : '.';
    out.push(row);
  }
  return out;
}

export const ENEMY_TYPES = {
  basic: { speed: 3.1, bullet: 13, hp: 1, score: 100 },
  fast: { speed: 6.2, bullet: 13, hp: 1, score: 200 },
  power: { speed: 3.6, bullet: 24, hp: 1, score: 300 },
  armor: { speed: 3.1, bullet: 13, hp: 4, score: 400 }
};
export const POWERUPS = ['star', 'grenade', 'helmet', 'shovel', 'timer', 'tank'];
export const STAGE1_ROSTER = [...Array(18).fill('basic'), 'fast', 'fast'];   // classic stage-one mix

export function progressIndex(stage, loop) { return (loop - 1) * TOTAL_STAGES + stage; }

// The difficulty curve. `tier` is the run position: stage 1 loop 1 = tier 0, and it keeps climbing
// through every loop, so loop 2 of a stage is strictly harder than loop 1 of the same stage.
export function stageSpec(stage, loop = 1) {
  const tier = progressIndex(stage, loop) - 1;
  const R = rngFrom(4441 + stage * 104729 + loop * 7);
  const rows = layoutFor(stage);
  const count = stage === 1 && loop === 1 ? 20 : clamp(20 + Math.floor(tier / 6), 20, 40);
  let roster;
  if (stage === 1 && loop === 1) roster = STAGE1_ROSTER.slice();
  else {
    const w = {
      basic: Math.max(.08, 1 - tier / 55),
      fast: .15 + Math.min(.2, tier / 250),
      power: tier >= 3 ? .12 + Math.min(.18, tier / 300) : 0,
      armor: tier >= 7 ? .08 + Math.min(.3, tier / 170) : 0
    };
    const total = w.basic + w.fast + w.power + w.armor;
    roster = [];
    for (let k = 0; k < count; k++) {
      let r = R() * total;
      for (const key of ['basic', 'fast', 'power', 'armor']) { r -= w[key]; if (r <= 0) { roster.push(key); break; } }
    }
    // Always leave a couple of light tanks in the mix so a stage is never pure armour.
    if (roster.filter(t => t === 'armor').length > count * .45) roster[0] = 'basic';
  }
  const carriers = [Math.floor(count * .15), Math.floor(count * .5), Math.floor(count * .85)];
  if (loop >= 3) carriers.push(Math.floor(count * .35));   // a little mercy once the field gets brutal
  // Every curve below is asymptotic: it keeps climbing, a little at a time, for as many loops as
  // anybody can reach, but it flattens out instead of running away (a 2x-fast tank is unplayable).
  // So "each loop is harder than the last" stays true forever while late loops stay survivable.
  const ease = depth => 1 - Math.exp(-depth);
  return {
    stage, loop, tier, rows, roster, carriers,
    theme: stage === 1 && loop === 1 ? 'classic' : themeFor(stage).name,
    maxOnField: clamp(4 + Math.floor(tier / 26), 4, 6),
    spawnInterval: 1.25 + 1.35 * Math.exp(-tier / 110),
    speedMult: 1 + 1.0 * ease(tier / 200),
    bulletMult: 1 + .8 * ease(tier / 240),
    fireMult: 1 - .55 * ease(tier / 130),
    armorHp: Math.min(8, 4 + Math.floor(tier / 55)),
    scoreMult: 1 + (loop - 1) * .5
  };
}

// Debug-only helpers used by the QA scripts (not reachable from player controls).
export const qa = { reach, isFree, parseRows, SUPER: S, THEMES: THEMES.map(t => t.name) };

// Turn layout rows back into a flat cell array so tests can reuse the reachability helpers.
export function parseRows(rows) {
  const cells = new Uint8Array(N * N);
  rows.forEach((row, z) => [...row].forEach((ch, x) => { cells[z * N + x] = ch === '#' ? BRICK : ch === '@' ? STEEL : ch === 'E' ? BASE : EMPTY; }));
  return cells;
}
