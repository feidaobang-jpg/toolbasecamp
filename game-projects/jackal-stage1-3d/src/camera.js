// 镜头：固定朝北的预设（C 键循环、即时切换），跟随吉普；计算地面可视四边形供敌人激活/开火判定。
import * as THREE from 'three';
import { clamp } from './core.js';

const D = Math.PI / 180;
export const PRESETS = [
  { id: 'oblique', name: '斜俯视', pitch: 56 * D, dist: 34, fov: 40, ahead: 4 },
  { id: 'top', name: '俯视', pitch: 84 * D, dist: 42, fov: 40, ahead: 2 },
  { id: 'low', name: '近景斜视', pitch: 40 * D, dist: 24, fov: 46, ahead: 7 }
];

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 420);
  const C = {
    cam, idx: 0, tx: -19, ty: 14, quad: [[0, 0], [0, 0], [0, 0], [0, 0]], aabb: { x0: 0, x1: 0, y0: 0, y1: 0 },
    preset() { return PRESETS[this.idx]; },
    cycle() { this.idx = (this.idx + 1) % PRESETS.length; return PRESETS[this.idx]; },
    setAspect(a) { cam.aspect = a; cam.updateProjectionMatrix(); },
    snap(px, py) { const p = PRESETS[this.idx]; this.tx = px; this.ty = py + p.ahead; },
    // 水平相机轴：给移动映射与测试使用（所有预设都朝北，因此右 = 东、前 = 北）
    axes() {
      const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      return { fwd: { x: f.x, y: -f.z }, right: { x: r.x, y: -r.z } };
    },
    update(dt, px, py, opt) {
      const p = PRESETS[this.idx];
      let gx = px, gy = py + p.ahead;
      const hfov = 2 * Math.atan(Math.tan(p.fov * D / 2) * cam.aspect);
      const hw = Math.cos(p.pitch) * 0 + p.dist * Math.tan(hfov / 2) * 0.86;
      if (opt && opt.lock) {
        const L = opt.lock;
        gx = clamp(px, L.cx - 7, L.cx + 7); gy = clamp(py + p.ahead * 0.5, L.cy - 8, L.cy + 8);
      } else {
        gx = hw < 34 ? clamp(gx, -36 + hw, 36 - hw) : 0;
        gy = clamp(gy, 9, 342);
      }
      if (opt && opt.free) { gx = opt.free.x; gy = opt.free.y; }
      const k = opt && opt.instant ? 1 : 1 - Math.exp(-dt * 5.5);
      this.tx += (gx - this.tx) * k; this.ty += (gy - this.ty) * k;
      const pitch = opt && opt.pitch ? opt.pitch : p.pitch, dist = opt && opt.dist ? opt.dist : p.dist;
      cam.fov = p.fov; cam.updateProjectionMatrix();
      // 先用无抖动的镜头算可视区域（玩法判定），再叠加纯视觉的屏幕震动
      cam.position.set(this.tx, Math.sin(pitch) * dist, -(this.ty) + Math.cos(pitch) * dist);
      cam.lookAt(this.tx, 0, -(this.ty));
      cam.updateMatrixWorld();
      this.computeQuad();
      if (opt && opt.shake) {
        const sx = (Math.random() - 0.5) * opt.shake, sy = (Math.random() - 0.5) * opt.shake;
        cam.position.x += sx; cam.position.z += sy;
        cam.updateMatrixWorld();
      }
    },
    computeQuad() {
      const v = new THREE.Vector3(), o = cam.position;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let k = 0; k < 4; k++) {
        v.set(pts[k][0], pts[k][1], 0.5).unproject(cam).sub(o).normalize();
        let t = v.y < -1e-3 ? -o.y / v.y : 400;
        t = Math.min(t, 400);
        const gx = o.x + v.x * t, gy = -(o.z + v.z * t);
        this.quad[k][0] = gx; this.quad[k][1] = gy;
        x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
      }
      this.aabb.x0 = x0; this.aabb.x1 = x1; this.aabb.y0 = y0; this.aabb.y1 = y1;
    },
    // 点是否在可视四边形内（margin > 0 向内收缩）
    inView(x, y, margin) {
      const q = this.quad, m = margin || 0;
      for (let k = 0; k < 4; k++) {
        const a = q[k], b = q[(k + 1) % 4];
        const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
        // 四边形顶点按 屏幕左下→右下→右上→左上，在地面坐标（y 向北）里为逆时针
        const cross = (ex * (y - a[1]) - ey * (x - a[0])) / len;
        if (cross < m) return false;
      }
      return true;
    }
  };
  return C;
}
