// 公共常量与工具。世界坐标直接用 three：x = 关卡前进方向（向右），z = 纵深（正方向朝向侧视镜头），y = 高度（米）。
export const VERSION = 'v0.11.0-hellroad.1';
export const STEP = 1 / 60;            // 固定 60Hz 逻辑步长

export const params = new URLSearchParams(location.search);
export const TEST = params.get('test') === '1';     // 自动化测试钩子，仅 ?test=1 暴露
export const CLEAN = params.get('clean') === '1';   // 录制干净画面：隐藏桌面操作提示

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
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const chance = (p) => rng() < p;
// 布景用的固定随机（与游玩随机分开，保证每局场景一致）
export function fixedRng(s) { return mulberry32(s >>> 0); }

const NS = 'cd3d-stage1:';
export const store = {
  get(k, def) {
    try { const v = window.localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(k, v) { try { window.localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 隐私模式等 */ } }
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function approachAng(a, b, maxStep) { const d = angDiff(a, b); return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep; }
// 朝向角 face：three 的 rotation.y。模型本地 +Z 为正面，face 对应的水平方向 = (sin face, cos face)
export const faceOf = (dx, dz) => Math.atan2(dx, dz);
export const FACE_RIGHT = Math.PI / 2, FACE_LEFT = -Math.PI / 2;
export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
