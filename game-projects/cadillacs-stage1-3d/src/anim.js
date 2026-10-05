// 关键姿势动画：每个姿势是一组骨骼欧拉角（数组），片段 = 关键帧序列，采样后再平滑过渡，避免切换动作时跳变。
// 约定（模型正面 +Z、左手侧 +X）：肩 rx 负 = 手臂向前抬；肘 rx 负 = 屈肘；左肩 rz 正 / 右肩 rz 负 = 手臂外展；
// 髋 rx 负 = 大腿前抬；膝 rx 正 = 屈膝；脊柱 rx 正 = 前倾、ry 正 = 右肩向前；body rx 负 = 整个人向后倒。
import { smooth } from './core.js';

export const BONES = ['body', 'hips', 'spine', 'neck', 'head', 'lS', 'lE', 'lHand', 'rS', 'rE', 'rHand', 'lH', 'lK', 'lA', 'rH', 'rK', 'rA'];
const BI = {}; BONES.forEach((b, i) => { BI[b] = i * 3; });
const EX = BONES.length * 3;       // 额外通道：hy 髋高偏移、py/pz 身体平移、rEs/lEs 前臂伸长倍数
export const EXTRA = { hy: EX, py: EX + 1, pz: EX + 2, rEs: EX + 3, lEs: EX + 4 };
export const POSE_LEN = EX + 5;

export function P(o) {
  const a = new Float32Array(POSE_LEN);
  a[EXTRA.rEs] = 1; a[EXTRA.lEs] = 1;
  for (const k in o) {
    if (k in BI) { const v = o[k]; a[BI[k]] = v[0] || 0; a[BI[k] + 1] = v[1] || 0; a[BI[k] + 2] = v[2] || 0; }
    else if (k in EXTRA) a[EXTRA[k]] = o[k];
  }
  return a;
}
// 以某姿势为底修改部分骨骼
export function mod(base, o) { const a = base.slice(); const b = P(o); for (const k in o) { if (k in BI) { a[BI[k]] = b[BI[k]]; a[BI[k] + 1] = b[BI[k] + 1]; a[BI[k] + 2] = b[BI[k] + 2]; } else a[EXTRA[k]] = b[EXTRA[k]]; } return a; }
export function mirror(p) {
  // 左右镜像：交换 l/r 骨骼，ry、rz 取反
  const a = new Float32Array(POSE_LEN);
  for (const b of BONES) {
    const m = b[0] === 'l' && b.length > 1 && b[1] === b[1].toUpperCase() ? 'r' + b.slice(1) : b[0] === 'r' && b.length > 1 && b[1] === b[1].toUpperCase() ? 'l' + b.slice(1) : b;
    const s = BI[b], d = BI[m];
    a[d] = p[s]; a[d + 1] = -p[s + 1]; a[d + 2] = -p[s + 2];
  }
  for (let i = EX; i < POSE_LEN; i++) a[i] = p[i];
  const t = a[EXTRA.rEs]; a[EXTRA.rEs] = a[EXTRA.lEs]; a[EXTRA.lEs] = t;
  return a;
}

// ---------- 人形姿势库 ----------
const guardArms = { lS: [-0.32, 0, 0.18], lE: [-2.05, 0, 0], rS: [-0.42, 0, -0.16], rE: [-2.15, 0, 0] };
export const HP = {
  stand: P({ lS: [0.05, 0, 0.12], rS: [0.05, 0, -0.12], lE: [-0.2, 0, 0], rE: [-0.2, 0, 0] }),
  guard: P(Object.assign({ spine: [0.08, -0.3, 0], head: [0, 0.25, 0], lH: [-0.25, 0, 0.1], lK: [0.32, 0, 0], rH: [0.18, 0, -0.08], rK: [0.28, 0, 0], hy: -0.05 }, guardArms)),
  guard2: P(Object.assign({ spine: [0.1, -0.28, 0], head: [0.02, 0.25, 0], lH: [-0.28, 0, 0.1], lK: [0.4, 0, 0], rH: [0.16, 0, -0.08], rK: [0.36, 0, 0], hy: -0.08 }, guardArms)),
  jabL: P({ spine: [0.12, -0.45, 0], head: [0, 0.35, 0], lS: [-1.5, 0.15, 0.0], lE: [-0.08, 0, 0], rS: [-0.45, 0, -0.16], rE: [-2.2, 0, 0], lH: [-0.32, 0, 0.1], lK: [0.32, 0, 0], rH: [0.22, 0, -0.08], rK: [0.22, 0, 0], hy: -0.05 }),
  jabR: P({ spine: [0.14, 0.4, 0], head: [0, -0.3, 0], rS: [-1.52, -0.15, 0.0], rE: [-0.08, 0, 0], lS: [-0.4, 0, 0.18], lE: [-2.2, 0, 0], lH: [-0.3, 0, 0.1], lK: [0.3, 0, 0], rH: [0.26, 0, -0.08], rK: [0.2, 0, 0], hy: -0.06 }),
  hook: P({ spine: [0.1, 0.65, 0], head: [0, -0.5, 0], rS: [-1.35, -0.6, -0.95], rE: [-1.4, 0, 0], lS: [-0.4, 0, 0.18], lE: [-2.2, 0, 0], lH: [-0.3, 0, 0.1], lK: [0.3, 0, 0], rH: [0.26, 0, -0.08], rK: [0.25, 0, 0], hy: -0.08 }),
  upper0: P({ spine: [0.35, 0.25, 0], rS: [0.35, 0, -0.2], rE: [-1.9, 0, 0], lS: [-0.4, 0, 0.18], lE: [-2.2, 0, 0], lK: [0.7, 0, 0], rK: [0.7, 0, 0], lH: [-0.5, 0, 0.1], rH: [-0.1, 0, -0.1], hy: -0.2 }),
  upper1: P({ spine: [-0.25, 0.2, 0], head: [-0.2, 0, 0], rS: [-2.7, 0, -0.15], rE: [-0.8, 0, 0], lS: [-0.2, 0, 0.3], lE: [-1.6, 0, 0], lH: [-0.2, 0, 0.1], rH: [0.25, 0, -0.1], lK: [0.15, 0, 0], rK: [0.1, 0, 0], hy: 0.04 }),
  kickHi: P({ spine: [-0.3, -0.2, 0], rH: [-1.75, 0, -0.15], rK: [0.12, 0, 0], rA: [0.4, 0, 0], lH: [0.1, 0, 0.05], lK: [0.15, 0, 0], lS: [-0.2, 0, 0.6], lE: [-1.6, 0, 0], rS: [0.2, 0, -0.6], rE: [-1.4, 0, 0] }),
  kickMid0: P({ spine: [0.0, -0.1, 0], rH: [-1.5, 0, 0], rK: [1.7, 0, 0], lK: [0.25, 0, 0], lS: [-0.3, 0, 0.3], lE: [-2.0, 0, 0], rS: [-0.3, 0, -0.3], rE: [-2.0, 0, 0] }),
  kickMid: P({ spine: [-0.2, -0.15, 0], rH: [-1.55, 0, 0], rK: [0.05, 0, 0], rA: [0.6, 0, 0], lH: [0.08, 0, 0.05], lK: [0.18, 0, 0], lS: [-0.3, 0, 0.4], lE: [-1.9, 0, 0], rS: [0.15, 0, -0.5], rE: [-1.6, 0, 0] }),
  kneeUp: P({ spine: [0.25, 0, 0], rH: [-1.75, 0, 0], rK: [1.9, 0, 0], lK: [0.2, 0, 0], lS: [-1.1, 0, 0.25], lE: [-0.9, 0, 0], rS: [-1.1, 0, -0.25], rE: [-0.9, 0, 0] }),
  jumpUp: P({ lH: [-0.9, 0, 0.1], lK: [1.5, 0, 0], rH: [-0.5, 0, -0.1], rK: [1.2, 0, 0], lS: [-0.6, 0, 0.35], lE: [-1.6, 0, 0], rS: [-0.6, 0, -0.35], rE: [-1.6, 0, 0] }),
  jumpKick: P({ spine: [-0.15, -0.2, 0], rH: [-1.45, 0, 0], rK: [0.05, 0, 0], rA: [0.5, 0, 0], lH: [-0.9, 0, 0.1], lK: [1.8, 0, 0], lS: [-0.5, 0, 0.6], lE: [-1.4, 0, 0], rS: [0.2, 0, -0.5], rE: [-1.2, 0, 0] }),
  diveKick: P({ body: [0.25, 0, 0], spine: [-0.25, 0, 0], rH: [-0.7, 0, -0.12], rK: [0.05, 0, 0], rA: [0.4, 0, 0], lH: [-1.3, 0, 0.12], lK: [2, 0, 0], lS: [-0.4, 0, 0.9], rS: [-0.4, 0, -0.9], lE: [-1.5, 0, 0], rE: [-1.5, 0, 0] }),
  flyKick: P({ body: [-0.8, 0, 0], spine: [0.3, 0, 0], head: [0.45, 0, 0], lH: [-0.62, 0, 0.1], lK: [0.12, 0, 0], rH: [-0.8, 0, -0.1], rK: [0.04, 0, 0], lA: [0.5, 0, 0], rA: [0.5, 0, 0], lS: [0.5, 0, 0.9], lE: [-0.6, 0, 0], rS: [0.5, 0, -0.9], rE: [-0.6, 0, 0], py: 0.3 }),
  slide: P({ body: [-1.1, 0, 0], spine: [0.75, 0, 0], head: [0.55, 0, 0], rH: [-0.5, 0, 0], rK: [0.05, 0, 0], lH: [-0.1, 0, 0], lK: [1.2, 0, 0], lS: [0.7, 0, 0.6], lE: [-0.3, 0, 0], rS: [0.5, 0, -0.5], rE: [-0.4, 0, 0], py: 0.22, pz: 0.35 }),
  tackle: P({ spine: [0.75, -0.3, 0], head: [-0.4, 0.2, 0], lS: [-1.4, 0, 0.5], lE: [-1.5, 0, 0], rS: [0.4, 0, -0.3], rE: [-1.2, 0, 0], lH: [-1.0, 0, 0], lK: [0.9, 0, 0], rH: [0.5, 0, 0], rK: [0.6, 0, 0], hy: -0.12 }),
  kneeFly: P({ spine: [0.2, 0, 0], rH: [-1.9, 0, 0], rK: [2.0, 0, 0], lH: [0.3, 0, 0], lK: [0.9, 0, 0], lS: [-1.6, 0, 0.6], lE: [-0.6, 0, 0], rS: [-1.6, 0, -0.6], rE: [-0.6, 0, 0] }),
  spinA: P({ lS: [-1.5, 0, 1.3], rS: [-1.5, 0, -1.3], lE: [-0.2, 0, 0], rE: [-0.2, 0, 0], rH: [-1.2, 0, -0.6], rK: [0.2, 0, 0], lK: [0.4, 0, 0], spine: [-0.1, 0, 0] }),
  crouch: P({ spine: [0.6, 0, 0], head: [-0.3, 0, 0], lH: [-1.35, 0, 0.12], lK: [2.1, 0, 0], rH: [-1.1, 0, -0.12], rK: [2.0, 0, 0], lA: [-0.7, 0, 0], rA: [-0.8, 0, 0], lS: [-0.9, 0, 0.15], lE: [-0.4, 0, 0], rS: [-1.0, 0, -0.15], rE: [-0.3, 0, 0], hy: -0.42 }),
  hurt: P({ spine: [-0.4, 0.2, 0], head: [-0.5, 0, 0], lS: [-0.5, 0, 0.7], lE: [-0.9, 0, 0], rS: [-0.2, 0, -0.6], rE: [-0.7, 0, 0], lH: [-0.2, 0, 0.1], lK: [0.3, 0, 0], rH: [0.25, 0, -0.1], rK: [0.35, 0, 0], hy: -0.04 }),
  hurt2: P({ spine: [0.7, 0, 0], head: [0.3, 0, 0], lS: [-0.5, 0, 0.2], lE: [-1.4, 0, 0], rS: [-0.5, 0, -0.2], rE: [-1.4, 0, 0], lK: [0.45, 0, 0], rK: [0.45, 0, 0], lH: [-0.3, 0, 0], rH: [-0.1, 0, 0], hy: -0.08 }),
  fallBack: P({ body: [-0.9, 0, 0], spine: [-0.2, 0, 0], head: [-0.3, 0, 0], lS: [-1.6, 0, 1.0], lE: [-0.5, 0, 0], rS: [-1.6, 0, -1.0], rE: [-0.5, 0, 0], lH: [-0.7, 0, 0.2], lK: [0.6, 0, 0], rH: [-0.4, 0, -0.2], rK: [0.4, 0, 0], py: 0.25, pz: 0.5 }),
  lie: P({ body: [-1.5708, 0, 0], head: [-0.15, 0.4, 0], lS: [-0.3, 0, 1.2], lE: [-0.3, 0, 0], rS: [-0.2, 0, -1.1], rE: [-0.4, 0, 0], lH: [0, 0, 0.15], lK: [0.15, 0, 0], rH: [-0.2, 0, -0.15], rK: [0.5, 0, 0], py: 0.16, pz: 0.9 }),
  sit: P({ body: [-0.35, 0, 0], spine: [0.55, 0, 0], head: [0.1, 0, 0], lH: [-1.6, 0, 0.2], lK: [1.8, 0, 0], rH: [-1.5, 0, -0.2], rK: [1.2, 0, 0], lS: [0.4, 0, 0.3], lE: [-0.3, 0, 0], rS: [0.6, 0, -0.3], rE: [-0.2, 0, 0], hy: -0.5, py: 0.05, pz: 0.3 }),
  grab: P({ spine: [0.2, 0, 0], lS: [-1.3, -0.2, 0.15], lE: [-0.6, 0, 0], rS: [-1.3, 0.2, -0.15], rE: [-0.6, 0, 0], lH: [-0.25, 0, 0.1], lK: [0.3, 0, 0], rH: [0.2, 0, -0.1], rK: [0.3, 0, 0], hy: -0.05 }),
  throwUp: P({ spine: [-0.5, 0, 0], head: [-0.4, 0, 0], lS: [-2.9, 0, 0.3], lE: [-0.4, 0, 0], rS: [-2.9, 0, -0.3], rE: [-0.4, 0, 0], lH: [-0.2, 0, 0.1], rH: [0.3, 0, -0.1], lK: [0.2, 0, 0], rK: [0.3, 0, 0] }),
  throwDown: P({ spine: [0.8, 0, 0], head: [0.2, 0, 0], lS: [-1.1, 0, 0.3], lE: [-0.2, 0, 0], rS: [-1.1, 0, -0.3], rE: [-0.2, 0, 0], lH: [-0.6, 0, 0.1], lK: [0.7, 0, 0], rH: [0.4, 0, -0.1], rK: [0.4, 0, 0], hy: -0.15 }),
  held: P({ spine: [-0.2, 0, 0], head: [-0.3, 0, 0], lS: [-0.4, 0, 0.5], lE: [-1.0, 0, 0], rS: [-0.4, 0, -0.5], rE: [-1.0, 0, 0], lK: [0.4, 0, 0], rK: [0.3, 0, 0], hy: -0.02 }),
  thrown: P({ body: [-2.6, 0, 0], lS: [-2.5, 0, 0.6], rS: [-2.5, 0, -0.6], lH: [-0.6, 0, 0.3], rH: [-0.6, 0, -0.3], lK: [0.6, 0, 0], rK: [0.6, 0, 0], py: 0.7, pz: 0.0 }),
  shoot: P({ spine: [0.05, 0.3, 0], head: [0, -0.2, 0], rS: [-1.55, -0.1, 0], rE: [-0.05, 0, 0], lS: [-0.35, 0, 0.2], lE: [-2.0, 0, 0], lH: [-0.2, 0, 0.1], lK: [0.25, 0, 0], rH: [0.2, 0, -0.08], rK: [0.25, 0, 0] }),
  shotgun: P({ spine: [0.05, 0.25, 0], rS: [-1.2, -0.3, -0.25], rE: [-0.75, 0, 0], lS: [-1.45, -0.35, 0.3], lE: [-0.2, 0, 0], lH: [-0.25, 0, 0.1], lK: [0.3, 0, 0], rH: [0.25, 0, -0.08], rK: [0.3, 0, 0] }),
  throwBack: P({ spine: [-0.25, 0.5, 0], rS: [-2.8, 0, -0.3], rE: [-1.4, 0, 0], lS: [-1.0, 0, 0.4], lE: [-1.0, 0, 0], lH: [-0.4, 0, 0.1], rH: [0.3, 0, -0.1], lK: [0.3, 0, 0], rK: [0.3, 0, 0] }),
  throwFwd: P({ spine: [0.35, -0.3, 0], rS: [-1.2, 0, -0.1], rE: [-0.1, 0, 0], lS: [-0.2, 0, 0.5], lE: [-1.2, 0, 0], lH: [-0.5, 0, 0.1], rH: [0.4, 0, -0.1], lK: [0.4, 0, 0], rK: [0.3, 0, 0] }),
  swing0: P({ spine: [-0.1, 0.5, 0], rS: [-2.7, 0, -0.5], rE: [-0.9, 0, 0], lS: [-0.5, 0, 0.3], lE: [-1.6, 0, 0], lH: [-0.3, 0, 0.1], rH: [0.2, 0, -0.1], lK: [0.3, 0, 0], rK: [0.3, 0, 0] }),
  swing1: P({ spine: [0.35, -0.4, 0], rS: [-0.9, 0, 0.2], rE: [-0.1, 0, 0], lS: [-0.3, 0, 0.4], lE: [-1.4, 0, 0], lH: [-0.4, 0, 0.1], rH: [0.3, 0, -0.1], lK: [0.4, 0, 0], rK: [0.3, 0, 0], hy: -0.06 }),
  victory: P({ spine: [-0.05, 0, 0], head: [-0.1, 0.3, 0], rS: [-2.85, 0, -0.35], rE: [-0.35, 0, 0], lS: [0.15, 0, 0.55], lE: [-1.7, 0, 0], lH: [-0.05, 0, 0.12], rH: [0.05, 0, -0.12] }),
  victory2: P({ spine: [0.0, -0.3, 0], head: [0, 0.4, 0], rS: [-1.5, 0.6, -0.4], rE: [-1.2, 0, 0], lS: [0.15, 0, 0.55], lE: [-1.7, 0, 0], lH: [-0.05, 0, 0.12], rH: [0.05, 0, -0.12] }),
  taunt: P({ spine: [-0.1, 0, 0], head: [-0.15, 0, 0], lS: [-0.3, 0, 1.0], lE: [-1.2, 0, 0], rS: [-0.3, 0, -1.0], rE: [-1.2, 0, 0], lH: [-0.1, 0, 0.15], rH: [0.1, 0, -0.15], lK: [0.1, 0, 0], rK: [0.1, 0, 0] }),
  crossArms: P({ spine: [-0.05, 0, 0], head: [-0.1, 0.2, 0], lS: [-0.9, 0.6, 0.3], lE: [-1.9, 0, 0], rS: [-0.8, -0.6, -0.3], rE: [-1.9, 0, 0], lH: [-0.05, 0, 0.12], rH: [0.05, 0, -0.12] }),
  headbutt: P({ spine: [1.0, 0, 0], head: [-0.6, 0, 0], lS: [0.6, 0, 0.4], lE: [-0.4, 0, 0], rS: [0.6, 0, -0.4], rE: [-0.4, 0, 0], lH: [-0.8, 0, 0], lK: [0.8, 0, 0], rH: [0.5, 0, 0], rK: [0.4, 0, 0], hy: -0.15 }),
  buttSit: P({ spine: [-0.3, 0, 0], lH: [-1.4, 0, 0.3], lK: [0.6, 0, 0], rH: [-1.4, 0, -0.3], rK: [0.6, 0, 0], lS: [-1.2, 0, 0.8], rS: [-1.2, 0, -0.8], lE: [-0.4, 0, 0], rE: [-0.4, 0, 0], body: [-0.2, 0, 0] }),
  slash0: P({ spine: [-0.1, 0.6, 0], rS: [-2.6, 0, -0.9], rE: [-0.6, 0, 0], lS: [-0.4, 0, 0.3], lE: [-1.8, 0, 0], lH: [-0.3, 0, 0.1], rH: [0.2, 0, -0.1], lK: [0.3, 0, 0], rK: [0.3, 0, 0] }),
  slash1: P({ spine: [0.3, -0.5, 0], rS: [-0.8, 0, 0.35], rE: [-0.15, 0, 0], lS: [-0.3, 0, 0.5], lE: [-1.5, 0, 0], lH: [-0.45, 0, 0.1], rH: [0.35, 0, -0.1], lK: [0.5, 0, 0], rK: [0.3, 0, 0], hy: -0.1 }),
  longPunch: P({ spine: [0.25, 0.55, 0], head: [0, -0.4, 0], rS: [-1.55, -0.1, 0], rE: [0, 0, 0], lS: [-0.2, 0, 0.4], lE: [-1.8, 0, 0], lH: [-0.5, 0, 0.1], lK: [0.5, 0, 0], rH: [0.5, 0, -0.08], rK: [0.15, 0, 0], hy: -0.12, rEs: 2.3 }),
  gunUp: P({ spine: [-0.15, 0.1, 0], head: [-0.5, 0, 0], rS: [-3.0, 0, -0.15], rE: [-0.05, 0, 0], lS: [0.2, 0, 0.5], lE: [-1.6, 0, 0] }),
  whip0: P({ spine: [-0.2, 0.5, 0], rS: [-2.9, 0, -0.4], rE: [-0.8, 0, 0], lS: [-0.3, 0, 0.4], lE: [-1.4, 0, 0] }),
  whip1: P({ spine: [0.4, -0.4, 0], rS: [-0.6, 0, 0.2], rE: [-0.1, 0, 0], lS: [-0.3, 0, 0.4], lE: [-1.4, 0, 0], hy: -0.08 }),
  dizzy: P({ spine: [0.2, 0, 0.15], head: [0.3, 0, 0.3], lS: [0.1, 0, 0.2], rS: [0.1, 0, -0.2], lE: [-0.3, 0, 0], rE: [-0.3, 0, 0], lK: [0.5, 0, 0], rK: [0.3, 0, 0], hy: -0.06 }),
  climb: P({ lS: [-2.9, 0, 0.2], lE: [-0.2, 0, 0], rS: [-2.9, 0, -0.2], rE: [-0.2, 0, 0], lH: [-0.2, 0, 0.05], rH: [0.1, 0, -0.05], lK: [0.2, 0, 0], rK: [0.1, 0, 0] }),
  run0: P({ spine: [0.35, 0, 0], head: [-0.2, 0, 0], lH: [-1.1, 0, 0], lK: [0.6, 0, 0], rH: [0.6, 0, 0], rK: [1.3, 0, 0], lS: [0.7, 0, 0.15], lE: [-1.6, 0, 0], rS: [-1.0, 0, -0.15], rE: [-1.4, 0, 0], hy: -0.06 }),
  kickSide: P({ spine: [-0.15, 0, 0.35], rH: [-1.4, 0, -0.5], rK: [0.1, 0, 0], lK: [0.25, 0, 0], lS: [-0.4, 0, 0.8], lE: [-1.4, 0, 0], rS: [-0.2, 0, -0.4], rE: [-1.6, 0, 0], hy: -0.04 })
};
HP.jabL2 = mirror(HP.jabR);

// 片段：[时间, 姿势]；采样时用平滑插值
export const HC = {
  rollingElbow: { dur: 0.72, keys: [[0, HP.guard], [0.1, HP.crouch], [0.22, mod(HP.crouch, { body: [2.7, 0, 0], py: 0.55 })], [0.36, mod(HP.crouch, { body: [5.9, 0, 0], py: 0.2 })], [0.48, mod(HP.hook, { body: [6.283185, 0, 0] })], [0.72, mod(HP.guard, { body: [6.283185, 0, 0] })]] },
  rollingJump: { dur: 0.78, keys: [[0, HP.guard], [0.12, HP.crouch], [0.26, mod(HP.upper1, { py: 0.7 })], [0.4, mod(HP.buttSit, { py: 0.85 })], [0.56, mod(HP.buttSit, { py: 0.1 })], [0.78, HP.guard]] },
  risingKick: { dur: 0.62, keys: [[0, HP.guard], [0.1, HP.crouch], [0.2, HP.kickHi], [0.38, HP.kickHi], [0.62, HP.guard]] },
  flipKick: { dur: 0.68, keys: [[0, HP.guard], [0.1, HP.crouch], [0.2, mod(HP.kickHi, { body: [-1.2, 0, 0], py: 0.65 })], [0.34, mod(HP.jumpKick, { body: [-3.1, 0, 0], py: 1.15 })], [0.49, mod(HP.crouch, { body: [-5.4, 0, 0], py: 0.65 })], [0.68, mod(HP.guard, { body: [-6.283185, 0, 0] })]] },
  jab1: { dur: 0.26, keys: [[0, HP.guard], [0.05, HP.jabL], [0.14, HP.jabL], [0.26, HP.guard]] },
  jab2: { dur: 0.28, keys: [[0, HP.guard], [0.06, HP.jabR], [0.15, HP.jabR], [0.28, HP.guard]] },
  hook: { dur: 0.32, keys: [[0, HP.guard], [0.07, HP.hook], [0.18, HP.hook], [0.32, HP.guard]] },
  upper: { dur: 0.46, keys: [[0, HP.guard], [0.08, HP.upper0], [0.16, HP.upper1], [0.3, HP.upper1], [0.46, HP.guard]] },
  kickMid: { dur: 0.36, keys: [[0, HP.guard], [0.07, HP.kickMid0], [0.13, HP.kickMid], [0.24, HP.kickMid], [0.36, HP.guard]] },
  kickHi: { dur: 0.46, keys: [[0, HP.guard], [0.08, HP.kickMid0], [0.16, HP.kickHi], [0.3, HP.kickHi], [0.46, HP.guard]] },
  kickSide: { dur: 0.44, keys: [[0, HP.guard], [0.08, HP.kickMid0], [0.15, HP.kickSide], [0.3, HP.kickSide], [0.44, HP.guard]] },
  knee: { dur: 0.24, keys: [[0, HP.grab], [0.06, HP.kneeUp], [0.14, HP.kneeUp], [0.24, HP.grab]] },
  throw: { dur: 0.5, keys: [[0, HP.grab], [0.15, HP.throwUp], [0.3, HP.throwDown], [0.5, HP.guard]] },
  slam: { dur: 0.6, keys: [[0, HP.grab], [0.2, HP.throwUp], [0.34, HP.throwDown], [0.48, HP.throwDown], [0.6, HP.guard]] },
  pickup: { dur: 0.3, keys: [[0, HP.guard], [0.1, HP.crouch], [0.2, HP.crouch], [0.3, HP.guard]] },
  throwItem: { dur: 0.34, keys: [[0, HP.guard], [0.08, HP.throwBack], [0.16, HP.throwFwd], [0.34, HP.guard]] },
  swing: { dur: 0.42, keys: [[0, HP.guard], [0.1, HP.swing0], [0.2, HP.swing1], [0.3, HP.swing1], [0.42, HP.guard]] },
  shoot: { dur: 0.3, keys: [[0, HP.shoot], [0.3, HP.shoot]] },
  shotgun: { dur: 0.5, keys: [[0, HP.shotgun], [0.5, HP.shotgun]] },
  getup: { dur: 0.5, keys: [[0, HP.lie], [0.2, HP.sit], [0.38, HP.crouch], [0.5, HP.guard]] },
  slash: { dur: 0.5, keys: [[0, HP.guard], [0.16, HP.slash0], [0.26, HP.slash1], [0.38, HP.slash1], [0.5, HP.guard]] },
  whip: { dur: 0.6, keys: [[0, HP.stand], [0.25, HP.whip0], [0.35, HP.whip1], [0.6, HP.stand]] },
  longPunch: { dur: 0.7, keys: [[0, HP.guard], [0.24, HP.hurt2 && HP.guard2], [0.34, HP.longPunch], [0.52, HP.longPunch], [0.7, HP.guard]] },
  headbutt: { dur: 0.6, keys: [[0, HP.guard], [0.15, HP.headbutt], [0.6, HP.headbutt]] },
  victory: { dur: 1.2, keys: [[0, HP.guard], [0.25, HP.victory2], [0.7, HP.victory2], [0.95, HP.victory], [1.2, HP.victory]] }
};

export function sample(clip, t) {
  const k = clip.keys;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const a = k[i - 1], b = k[i], u = smooth((t - a[0]) / Math.max(1e-4, b[0] - a[0]));
      return lerpPose(a[1], b[1], u, TMP[i % 2]);
    }
  }
  return k[k.length - 1][1];
}
const TMP = [new Float32Array(POSE_LEN), new Float32Array(POSE_LEN)];
export function lerpPose(a, b, u, out) {
  const o = out || new Float32Array(POSE_LEN);
  for (let i = 0; i < POSE_LEN; i++) o[i] = a[i] + (b[i] - a[i]) * u;
  return o;
}
// 走路 / 跑步：程序化循环（phase 弧度）
const WALK = new Float32Array(POSE_LEN), RUN = new Float32Array(POSE_LEN);
export function walkPose(phase, amp, base) {
  const o = WALK; o.set(base || HP.guard);
  const s = Math.sin(phase), c = Math.cos(phase);
  o[BI.lH] += -s * 0.5 * amp; o[BI.rH] += s * 0.5 * amp;
  o[BI.lK] += Math.max(0, c) * 0.7 * amp; o[BI.rK] += Math.max(0, -c) * 0.7 * amp;
  o[BI.lS] += s * 0.12 * amp; o[BI.rS] -= s * 0.12 * amp;
  o[BI.spine + 1] += s * 0.08 * amp;
  o[EXTRA.hy] += -Math.abs(c) * 0.035 * amp;
  return o;
}
export function runPose(phase) {
  const o = RUN; o.set(HP.run0);
  const s = Math.sin(phase), c = Math.cos(phase);
  o[BI.lH] = -s * 1.0 - 0.15; o[BI.rH] = s * 1.0 - 0.15;
  o[BI.lK] = 0.4 + Math.max(0, c) * 1.3; o[BI.rK] = 0.4 + Math.max(0, -c) * 1.3;
  o[BI.lS] = s * 0.9; o[BI.rS] = -s * 0.9;
  o[BI.spine + 1] = s * 0.18;
  o[EXTRA.hy] = -0.04 - Math.abs(c) * 0.05;
  return o;
}

// 把姿势写入骨骼
export function applyPose(model, pose) {
  const b = model.bones;
  for (let i = 0; i < BONES.length; i++) {
    const g = b[BONES[i]];
    if (!g) continue;
    const k = i * 3;
    g.rotation.set(pose[k], pose[k + 1], pose[k + 2]);
  }
  if (!model.base) model.base = { hipsY: b.hips.position.y };
  b.hips.position.y = model.base.hipsY + pose[EXTRA.hy] * (model.H / 1.85);
  b.body.position.set(0, pose[EXTRA.py] * (model.H / 1.85), pose[EXTRA.pz] * (model.H / 1.85));
  b.rE.scale.y = pose[EXTRA.rEs]; b.lE.scale.y = pose[EXTRA.lEs];
}

// ---------- 迅猛龙姿势 ----------
const RB = ['body', 'neck', 'head', 'jaw', 'tail1', 'tail2', 'tail3', 'lTh', 'lSh', 'lFt', 'rTh', 'rSh', 'rFt', 'lArm', 'rArm'];
const RBI = {}; RB.forEach((b, i) => { RBI[b] = i * 3; });
export const R_LEN = RB.length * 3 + 2;   // + 身体高度偏移、前后平移
export function RP(o) {
  const a = new Float32Array(R_LEN);
  for (const k in o) { if (k in RBI) { a[RBI[k]] = o[k][0] || 0; a[RBI[k] + 1] = o[k][1] || 0; a[RBI[k] + 2] = o[k][2] || 0; } else if (k === 'y') a[R_LEN - 2] = o.y; else if (k === 'z') a[R_LEN - 1] = o.z; }
  return a;
}
export const RPOSE = {
  idle: RP({ body: [0.08, 0, 0], neck: [-0.1, 0, 0], head: [0.1, 0, 0], tail1: [-0.05, 0, 0], tail2: [0.05, 0, 0], lTh: [-0.2, 0, 0], lSh: [0.5, 0, 0], lFt: [-0.3, 0, 0], rTh: [0.1, 0, 0], rSh: [0.4, 0, 0], rFt: [-0.5, 0, 0], lArm: [0.3, 0, 0], rArm: [0.3, 0, 0] }),
  crouch: RP({ body: [0.25, 0, 0], neck: [0.3, 0, 0], head: [-0.2, 0, 0], tail1: [0.15, 0, 0], tail2: [0.1, 0, 0], lTh: [-0.7, 0, 0], lSh: [1.3, 0, 0], lFt: [-0.6, 0, 0], rTh: [-0.6, 0, 0], rSh: [1.2, 0, 0], rFt: [-0.6, 0, 0], y: -0.32 }),
  bite0: RP({ body: [-0.1, 0, 0], neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.9, 0, 0], tail1: [0.15, 0, 0], lTh: [-0.3, 0, 0], lSh: [0.6, 0, 0], lFt: [-0.3, 0, 0], rTh: [0.2, 0, 0], rSh: [0.5, 0, 0], rFt: [-0.6, 0, 0] }),
  bite1: RP({ body: [0.35, 0, 0], neck: [0.5, 0, 0], head: [0.2, 0, 0], jaw: [0.05, 0, 0], tail1: [-0.25, 0, 0], tail2: [-0.1, 0, 0], lTh: [-0.6, 0, 0], lSh: [0.8, 0, 0], lFt: [-0.2, 0, 0], rTh: [0.5, 0, 0], rSh: [0.4, 0, 0], rFt: [-0.7, 0, 0], z: 0.35 }),
  claw0: RP({ body: [-0.25, 0, 0], neck: [-0.3, 0, 0], tail1: [0.3, 0, 0], rTh: [-1.2, 0, 0], rSh: [1.6, 0, 0], rFt: [-0.4, 0, 0], lTh: [0.1, 0, 0], lSh: [0.5, 0, 0], lFt: [-0.4, 0, 0], jaw: [0.4, 0, 0] }),
  claw1: RP({ body: [-0.4, 0, 0], neck: [-0.4, 0, 0], tail1: [0.4, 0, 0], rTh: [-1.4, 0, 0], rSh: [0.2, 0, 0], rFt: [0.6, 0, 0], lTh: [0.2, 0, 0], lSh: [0.6, 0, 0], lFt: [-0.4, 0, 0], jaw: [0.6, 0, 0], z: 0.15 }),
  leap: RP({ body: [-0.15, 0, 0], neck: [0.2, 0, 0], head: [0.1, 0, 0], jaw: [0.7, 0, 0], tail1: [0.05, 0, 0], tail2: [-0.05, 0, 0], lTh: [-1.2, 0, 0], lSh: [0.6, 0, 0], lFt: [0.4, 0, 0], rTh: [-1.3, 0, 0], rSh: [0.5, 0, 0], rFt: [0.5, 0, 0], lArm: [-0.8, 0, 0], rArm: [-0.8, 0, 0] }),
  hurt: RP({ body: [-0.3, 0, 0.2], neck: [-0.6, 0.3, 0], head: [-0.3, 0, 0], jaw: [0.8, 0, 0], tail1: [0.3, 0, 0], lTh: [0.2, 0, 0], lSh: [0.6, 0, 0], rTh: [-0.1, 0, 0], rSh: [0.5, 0, 0] }),
  lie: RP({ body: [0, 0, 1.45], neck: [0.1, 0.4, 0], head: [0, 0.2, 0], jaw: [0.3, 0, 0], tail1: [0, 0.2, 0], tail2: [0, 0.2, 0], lTh: [-0.6, 0, 0.3], lSh: [0.9, 0, 0], rTh: [-0.4, 0, 0.3], rSh: [0.7, 0, 0], y: -0.62 }),
  roar: RP({ body: [-0.35, 0, 0], neck: [-0.7, 0, 0], head: [-0.5, 0, 0], jaw: [1.0, 0, 0], tail1: [0.3, 0, 0], tail2: [0.2, 0, 0], lArm: [-1.0, 0, 0.3], rArm: [-1.0, 0, -0.3] })
};
export function raptorRun(phase, amp, base) {
  const o = new Float32Array(R_LEN); o.set(base || RPOSE.idle);
  const s = Math.sin(phase), c = Math.cos(phase);
  o[RBI.lTh] += -s * 0.8 * amp; o[RBI.rTh] += s * 0.8 * amp;
  o[RBI.lSh] += Math.max(0, c) * 0.9 * amp; o[RBI.rSh] += Math.max(0, -c) * 0.9 * amp;
  o[RBI.lFt] += s * 0.3 * amp; o[RBI.rFt] -= s * 0.3 * amp;
  o[RBI.tail1 + 1] += s * 0.18 * amp; o[RBI.tail2 + 1] += Math.sin(phase - 0.6) * 0.22 * amp; o[RBI.tail3 + 1] += Math.sin(phase - 1.2) * 0.25 * amp;
  o[RBI.neck] += Math.abs(c) * 0.1 * amp; o[RBI.body] += 0.1 * amp;
  o[R_LEN - 2] += -Math.abs(c) * 0.06 * amp;
  return o;
}
export function lerpR(a, b, u, out) { const o = out || new Float32Array(R_LEN); for (let i = 0; i < R_LEN; i++) o[i] = a[i] + (b[i] - a[i]) * u; return o; }
export function applyRaptor(model, pose) {
  const b = model.bones;
  for (let i = 0; i < RB.length; i++) { const g = b[RB[i]]; if (!g) continue; const k = i * 3; g.rotation.set(pose[k], pose[k + 1], pose[k + 2]); }
  b.body.position.y = 0.98 + pose[R_LEN - 2];
  b.body.position.z = pose[R_LEN - 1];
}
