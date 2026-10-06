// 镜头：C 循环切换 侧视（原作画面）→ 斜视 → 正视（主角身后看向前进方向）→ 第一人称；Q/E 按住无极左右旋转。
// 侧视 / 斜视跟随「卷轴焦点」（锁屏时不动），正视与第一人称跟随主角。
// 机位避让：区域里登记的实体包围盒（camBoxes）挡在镜头与主角之间时，正视先抬高 1～2 米，抬不开再沿视线拉近；拉近快、回退慢。
// 贴着主角的整面墙不在这里避让，由 world.js 的剖切（镜头到墙后时整层隐藏）处理。
import * as THREE from 'three';
import { clamp, damp } from './core.js';
import { HALF_W, EDGE } from './level.js';

export const PRESETS = [
  { id: 'side', name: '侧视', yaw: 0, pitch: 0.27, fov: 36, ty: 0.95, fit: true },
  { id: 'oblique', name: '斜视', yaw: -0.68, pitch: 0.5, fov: 40, ty: 0.9, dist: 12.5 },
  { id: 'front', name: '正视', yaw: -Math.PI / 2, pitch: 0.22, fov: 58, ty: 1.45, dist: 5.4, follow: true },
  { id: 'fp', name: '第一人称', yaw: -Math.PI / 2, pitch: -0.1, fov: 76, follow: true, fp: true }
];

const CAM_R = 0.28;   // 镜头的碰撞半径（含近裁剪面四角）

// 线段 a→b 第一次进入（外扩 CAM_R 的）包围盒的比例 0～1；起点已在盒内的不算（主角贴着矮物时不至于把镜头吸到头上）
function firstHit(boxes, ax, ay, az, bx, by, bz) {
  let best = 1;
  const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az];
  for (const B of boxes) {
    const mn = [B.min.x - CAM_R, B.min.y - CAM_R, B.min.z - CAM_R], mx = [B.max.x + CAM_R, B.max.y + CAM_R, B.max.z + CAM_R];
    let t0 = 0, t1 = 1, inside = true, miss = false;
    for (let i = 0; i < 3; i++) {
      if (o[i] < mn[i] || o[i] > mx[i]) inside = false;
      if (Math.abs(d[i]) < 1e-6) { if (o[i] < mn[i] || o[i] > mx[i]) { miss = true; break; } continue; }
      let u0 = (mn[i] - o[i]) / d[i], u1 = (mx[i] - o[i]) / d[i];
      if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
      if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
      if (t0 > t1) { miss = true; break; }
    }
    if (!miss && !inside && t0 < best) best = t0;
  }
  return best;
}

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 1600);
  const C = {
    cam, idx: 0, pitchOff: 0, yawOff: 0, aspect: 16 / 9,
    tgt: new THREE.Vector3(4, 1, 0), pos: new THREE.Vector3(4, 4, 13),
    av: { s: 1, lift: 0, blocked: false },   // 避让状态：s = 镜头到观察点距离的比例，lift = 抬高量
    preset() { return PRESETS[this.idx]; },
    turnPitch(d) { const p=this.preset(), a=p.pitch+this.pitchOff+(p.fp?-d:d); this.pitchOff=clamp(a,p.fp?-1:.12,p.fp?1:1.48)-p.pitch; },
    cycle() { this.idx = (this.idx + 1) % PRESETS.length; this.yawOff = 0; this.pitchOff = 0; return PRESETS[this.idx]; },
    setIndex(i) { this.idx = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length; this.yawOff = 0; this.pitchOff = 0; },
    setAspect(a) { this.aspect = a; cam.aspect = a; cam.updateProjectionMatrix(); },
    yaw() { return PRESETS[this.idx].yaw + this.yawOff; },
    fp() { return !!PRESETS[this.idx].fp; },
    // 水平相机轴（移动映射）：前 = 镜头看向的水平方向，右 = 屏幕右方
    axes() {
      const y = this.yaw();
      const fwd = { x: -Math.sin(y), z: -Math.cos(y) };
      const right = { x: Math.cos(y), z: -Math.sin(y) };
      return { fwd, right };
    },
    // 侧视镜头按画面宽高比自动拉远：观察点纵深能看到 ±(HALF_W + 0.9)，
    // 并且最靠镜头的一排（离观察点 depth 米）也能完整看到锁屏窗口 ±(HALF_W - EDGE) 里的角色（透视下近处画面更窄）
    fitDist(p, depth) {
      const v = Math.tan(p.fov * Math.PI / 360);
      const h = v * this.aspect;
      const mid = (HALF_W + 0.9) / h, near = (HALF_W - EDGE + 0.75) / h + (depth || 0) * Math.cos(p.pitch);
      return clamp(Math.max(mid, near), 10.5, 24);
    },
    // opt: { focusX, zc, fitDepth, player:{x,y,z,eye,face}, instant, shake, override:{pos,tgt}, blocks:[Box3] }
    update(dt, opt) {
      const base = opt.fpOff ? PRESETS[2] : PRESETS[this.idx];
      const p = {...base,pitch:base.pitch+(opt.fpOff?0:this.pitchOff)};
      const yaw = p.yaw + this.yawOff;
      const k = opt.instant ? 1 : damp(p.follow ? 9 : 6, dt);
      let tx, ty, tz, px, py, pz;
      if (opt.override) {
        tx = opt.override.tgt.x; ty = opt.override.tgt.y; tz = opt.override.tgt.z;
        px = opt.override.pos.x; py = opt.override.pos.y; pz = opt.override.pos.z;
        cam.fov = opt.override.fov || 40;
      } else if (p.fp) {
        const P = opt.player;
        px = P.x; py = P.eye; pz = P.z;
        const cp = Math.cos(p.pitch);
        tx = px - Math.sin(yaw) * cp * 4; ty = py + Math.sin(p.pitch) * 4; tz = pz - Math.cos(yaw) * cp * 4;
        cam.fov = p.fov;
      } else {
        const P = opt.player;
        let dist = p.fit ? this.fitDist(p, opt.fitDepth) : p.dist;
        if (p.follow) { tx = P.x; tz = P.z; ty = P.ground + p.ty; }
        else { tx = opt.focusX; tz = opt.zc; ty = p.ty; }
        // 正视：看点稍微前移，能看到前方来敌
        if (p.follow) { tx += -Math.sin(yaw) * 2.2; tz += -Math.cos(yaw) * 2.2; dist += 2.2; }
        const cp = Math.cos(p.pitch);
        px = tx + Math.sin(yaw) * cp * dist; py = ty + Math.sin(p.pitch) * dist; pz = tz + Math.cos(yaw) * cp * dist;
        cam.fov = p.fov;
      }
      if (opt.instant || p.fp || opt.override) { this.tgt.set(tx, ty, tz); this.pos.set(px, py, pz); }
      else { this.tgt.x += (tx - this.tgt.x) * k; this.tgt.y += (ty - this.tgt.y) * k; this.tgt.z += (tz - this.tgt.z) * k; this.pos.x += (px - this.pos.x) * k; this.pos.y += (py - this.pos.y) * k; this.pos.z += (pz - this.pos.z) * k; }
      cam.near = p.fp ? 0.06 : 0.12;
      cam.updateProjectionMatrix();
      cam.position.copy(this.pos);
      const av = this.av;
      if (opt.blocks && opt.blocks.length && !p.fp && !opt.override) this.avoid(dt, opt, p);
      else { av.s = 1; av.lift = 0; av.blocked = false; }
      cam.lookAt(this.tgt);
      if (opt.shake) { cam.position.x += (Math.random() - 0.5) * opt.shake; cam.position.y += (Math.random() - 0.5) * opt.shake; }
      cam.updateMatrixWorld();
    },
    // 观察点：正视是主角头部，侧视 / 斜视是卷轴焦点。先找不被挡的抬高量，都不行就拉近到第一个挡点前（正视至少留 1.3 米）
    avoid(dt, opt, p) {
      const B = opt.blocks, av = this.av, P = opt.player;
      const ax = p.follow ? P.x : this.tgt.x, ay = p.follow ? P.ground + 1.5 : this.tgt.y, az = p.follow ? P.z : this.tgt.z;
      const bx = this.pos.x, by = this.pos.y, bz = this.pos.z;
      const len = Math.hypot(bx - ax, by - ay, bz - az) || 1;
      let wantLift = 0, wantS = 1;
      const lifts = p.follow ? [0, 1, 2] : [0];
      let found = -1;
      for (const L of lifts) if (firstHit(B, ax, ay, az, bx, by + L, bz) >= 1) { found = L; break; }
      if (found >= 0) wantLift = found;
      else wantS = Math.max(Math.min(1, (p.follow ? 1.3 : 3) / len), firstHit(B, ax, ay, az, bx, by, bz));
      av.blocked = found !== 0;
      if (opt.instant) { av.s = wantS; av.lift = wantLift; }
      else {
        av.s = wantS < av.s ? wantS : av.s + (wantS - av.s) * damp(2.2, dt);
        av.lift += (wantLift - av.lift) * damp(wantLift > av.lift ? 10 : 2, dt);
      }
      let cx = ax + (bx - ax) * av.s, cy = ay + (by + av.lift - ay) * av.s, cz = az + (bz - az) * av.s;
      // 兜底：抬高 / 回退的过渡中仍被挡，立即拉到挡点前
      const h = firstHit(B, ax, ay, az, cx, cy, cz);
      if (h < 1) { cx = ax + (cx - ax) * h; cy = ay + (cy - ay) * h; cz = az + (cz - az) * h; av.s *= h; }
      cam.position.set(cx, cy, cz);
    }
  };
  return C;
}
