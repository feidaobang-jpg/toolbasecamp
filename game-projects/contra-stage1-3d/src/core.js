// 公共常量与工具。世界坐标：x 向右（关卡前进方向），y 向上，z 朝向默认侧视镜头；1 单位 = FC 画面 16 像素。
export const VERSION = 'v0.1';
export const GAME_ID = 'contra-stage1-3d';
export const STEP = 1 / 60;            // 固定 60Hz 逻辑步长（与 FC 一帧一致）
export const PX = 1 / 16;              // FC 1 像素 = 1/16 单位
export const PF = 60 / 16;             // 「像素/帧」换算为「单位/秒」

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
// 布景用固定随机（与游玩随机分开，保证每局场景一致）
export function fixedRng(s) { return mulberry32(s >>> 0); }

const NS = 'contra3d-stage1:';
export const store = {
  get(k, def) {
    try { const v = window.localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(k, v) { try { window.localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 隐私模式等 */ } }
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
