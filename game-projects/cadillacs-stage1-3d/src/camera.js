// 镜头：C 循环切换 侧视（原作画面）→ 斜视 → 正视（主角身后看向前进方向）→ 第一人称；Q/E 按住无极左右旋转。
// 侧视 / 斜视跟随「卷轴焦点」（锁屏时不动），正视与第一人称跟随主角。
import * as THREE from 'three';
import { clamp, damp } from './core.js';
import { HALF_W } from './level.js';

export const PRESETS = [
  { id: 'side', name: '侧视', yaw: 0, pitch: 0.27, fov: 36, ty: 0.95, fit: true },
  { id: 'oblique', name: '斜视', yaw: -0.68, pitch: 0.5, fov: 40, ty: 0.9, dist: 12.5 },
  { id: 'front', name: '正视', yaw: -Math.PI / 2, pitch: 0.22, fov: 58, ty: 1.45, dist: 5.4, follow: true },
  { id: 'fp', name: '第一人称', yaw: -Math.PI / 2, pitch: -0.1, fov: 76, follow: true, fp: true }
];

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 1600);
  const C = {
    cam, idx: 0, yawOff: 0, aspect: 16 / 9,
    tgt: new THREE.Vector3(4, 1, 0), pos: new THREE.Vector3(4, 4, 13),
    preset() { return PRESETS[this.idx]; },
    cycle() { this.idx = (this.idx + 1) % PRESETS.length; this.yawOff = 0; return PRESETS[this.idx]; },
    setIndex(i) { this.idx = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length; this.yawOff = 0; },
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
    // 侧视镜头按画面宽高比自动拉远，保证一屏能看到 ±HALF_W 的战斗范围
    fitDist(p) {
      const v = Math.tan(p.fov * Math.PI / 360);
      const h = v * this.aspect;
      return clamp((HALF_W + 0.9) / h, 10.5, 24) * 1.0;
    },
    // opt: { focusX, zc, player:{x,y,z,eye,face}, instant, shake, override:{pos,tgt}, title }
    update(dt, opt) {
      const p = opt.fpOff ? PRESETS[2] : PRESETS[this.idx];
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
        let dist = p.fit ? this.fitDist(p) : p.dist;
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
      cam.lookAt(this.tgt);
      if (opt.shake) { cam.position.x += (Math.random() - 0.5) * opt.shake; cam.position.y += (Math.random() - 0.5) * opt.shake; }
      cam.updateMatrixWorld();
    }
  };
  return C;
}
