// 通用数学与小工具
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function angStep(a, b, maxStep) {
  const d = angDiff(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

// 朝向约定：yaw=0 面向 -Z（县城方向），向右转 yaw 减小
export const fwdX = (yaw) => -Math.sin(yaw);
export const fwdZ = (yaw) => -Math.cos(yaw);
export const rightX = (yaw) => Math.cos(yaw);
export const rightZ = (yaw) => -Math.sin(yaw);
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng = mulberry(20261013);
export const reseed = (s) => { _rng = mulberry(s); };
export const rand = (a = 1, b) => (b === undefined ? _rng() * a : a + _rng() * (b - a));
export const pick = (arr) => arr[Math.floor(_rng() * arr.length) % arr.length];

// 线段与轴对齐矩形（XZ 平面）求进入参数 t∈[0,1]，不相交返回 -1
export function segRect(ax, az, bx, bz, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) {
    if (ax < r.x0 || ax > r.x1) return -1;
  } else {
    let ta = (r.x0 - ax) / dx, tb = (r.x1 - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < r.z0 || az > r.z1) return -1;
  } else {
    let ta = (r.z0 - az) / dz, tb = (r.z1 - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}

// 点到线段距离平方（XZ）
export function segPointD2(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

export const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + (r < 10 ? '0' : '') + r;
};
