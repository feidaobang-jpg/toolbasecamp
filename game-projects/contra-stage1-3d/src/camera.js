// 镜头：横版预设（C 键循环、回正 Q/E 角度）+ Q/E 无极水平环绕。
// 默认「侧视」最接近 FC 原作画面；移动按「单轴」映射：A/D 取镜头右向量在关卡 x 轴上的投影方向，带滞回。
import * as THREE from 'three';
import { clamp } from './core.js';

const D = Math.PI / 180;
export const PRESETS = [
  { id: 'side', name: '侧视', yaw: 0, pitch: 3 * D, fov: 36, fit: 1.0, follow: 0 },
  { id: 'oblique', name: '斜视', yaw: 30 * D, pitch: 15 * D, fov: 40, fit: 0.92, follow: 0.35 },
  { id: 'depth', name: '纵深', yaw: 62 * D, pitch: 22 * D, fov: 50, fit: 0.72, follow: 0.7 }
];

export function createCamera(opts) {
  const fitH = opts && opts.fitH || 14.6;
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.3, 600);
  let vel = 0;
  const C = {
    cam, idx: 0, yawOff: 0, fx: 0, fy: 7, axisSign: 1,
    preset() { return PRESETS[this.idx]; },
    cycle() { this.idx = (this.idx + 1) % PRESETS.length; this.yawOff = 0; vel = 0; return PRESETS[this.idx]; },
    setPreset(i) { this.idx = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length; this.yawOff = 0; vel = 0; },
    setAspect(a) { cam.aspect = a; cam.updateProjectionMatrix(); },
    yaw() { return this.preset().yaw + this.yawOff; },
    // Q/E：约 90°/秒，起停带缓动；dir = -1 左转 / 1 右转 / 0 停
    rotate(dir, dt) {
      const target = dir * 90 * D;
      vel += (target - vel) * Math.min(1, dt * 10);
      if (!dir && Math.abs(vel) < 0.02) vel = 0;
      this.yawOff += vel * dt;
      if (this.yawOff > Math.PI) this.yawOff -= Math.PI * 2;
      if (this.yawOff < -Math.PI) this.yawOff += Math.PI * 2;
    },
    stopRotate() { vel = 0; },
    // 单轴映射：屏幕右方向对应的关卡 x 方向（+1 / -1），接近 90° 时保持原方向直到明显越过
    updateAxis() {
      const d = Math.cos(this.yaw());
      if (d > 0.22) this.axisSign = 1; else if (d < -0.22) this.axisSign = -1;
      return this.axisSign;
    },
    distance() { const p = this.preset(); return (fitH / 2) / Math.tan(p.fov * D / 2) * p.fit; },
    update(dt, fx, fy, o) {
      const p = this.preset();
      const k = o && o.instant ? 1 : 1 - Math.exp(-dt * 6);
      this.fx += (fx - this.fx) * k; this.fy += (fy - this.fy) * k;
      const yaw = this.yaw(), pitch = p.pitch, dist = this.distance();
      cam.fov = p.fov; cam.updateProjectionMatrix();
      cam.position.set(this.fx + Math.sin(yaw) * Math.cos(pitch) * dist, this.fy + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(this.fx, this.fy, 0);
      if (o && o.shake) { cam.position.x += (Math.random() - 0.5) * o.shake; cam.position.y += (Math.random() - 0.5) * o.shake; }
      cam.updateMatrixWorld();
      this.updateAxis();
    },
    // 侧视下镜头可见的关卡宽度（用于计算玩法窗口）
    sideWidth(aspect) { return clamp(fitH * aspect, 16, 30); }
  };
  return C;
}
