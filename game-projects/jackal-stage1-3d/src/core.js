// 公共常量与工具。逻辑坐标：x 向东，y 向北（单位≈米）；渲染时 three 的 Z = -y。
export const VERSION = 'v0.3.1';
export const STEP = 1 / 60;            // 固定 60Hz 逻辑步长

export const params = new URLSearchParams(location.search);
export const TEST = params.get('test') === '1';     // 自动化测试钩子，仅 ?test=1 暴露
export const CLEAN = params.get('clean') === '1';   // 录制干净画面：隐藏桌面操作提示

// 8 方向：0 北 1 东北 2 东 3 东南 4 南 5 西南 6 西 7 西北（顺时针，0 = 画面上方）
export const DIR8 = [];
for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; DIR8.push({ x: Math.sin(a), y: Math.cos(a), a }); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedParam = params.get('seed');
export const seed = seedParam !== null && seedParam !== '' ? (parseInt(seedParam, 10) >>> 0) : ((Date.now() ^ 0x5bd1e995) >>> 0);
let rng = mulberry32(seed);
export function reseed(s) { rng = mulberry32(s >>> 0); }
export const rand = () => rng();
export const randRange = (a, b) => a + (b - a) * rng();
export const randInt = (n) => Math.floor(rng() * n);

// 关卡布景用的固定随机（与游玩随机分开，保证每局场景一致）
export function fixedRng(s) { return mulberry32(s >>> 0); }

const NS = 'jk3d-stage1:';
export const store = {
  get(k, def) {
    try { const v = window.localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(k, v) { try { window.localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 隐私模式等 */ } }
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const angTo = (ax, ay, bx, by) => Math.atan2(bx - ax, by - ay);   // 0 = 北，顺时针
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function approachAng(a, b, maxStep) { const d = angDiff(a, b); return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep; }
