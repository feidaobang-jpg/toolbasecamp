// 镜头：固定朝北的预设（C 键循环、即时切换），跟随吉普；第一人称跟车头（仅渲染）。
// 玩法判定（敌人激活/开火的可视四边形）始终用独立的朝北判定镜头，不随第一人称转。
import * as THREE from 'three';
import { clamp } from './core.js';

const D = Math.PI / 180;
export const PRESETS = [
  { id: 'oblique', name: '斜俯视', pitch: 56 * D, dist: 34, fov: 40, ahead: 4 },
  { id: 'top', name: '俯视', pitch: 84 * D, dist: 42, fov: 40, ahead: 2 },
  { id: 'low', name: '近景斜视', pitch: 40 * D, dist: 24, fov: 46, ahead: 7 },
  { id: 'wide', name: '战术远景', pitch: 64 * D, dist: 48, fov: 40, ahead: 6 },
  { id: 'front', name: '低位正视', pitch: 32 * D, dist: 18, fov: 48, ahead: 5 },
  { id: 'fp', name: '第一人称', fov: 76, dist: 24, ahead: 4, fp: true }
];

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 420);
  const judgeCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 420); // 玩法判定镜头：始终朝北跟随
  const C = {
    cam, judgeCam, idx: 0, lastIdx: 0, fpNow: false, yaw: 0, tx: -19, ty: 14, quad: [[0, 0], [0, 0], [0, 0], [0, 0]], aabb: { x0: 0, x1: 0, y0: 0, y1: 0 },
    preset() { return PRESETS[this.idx]; },
    cycle() { this.idx = (this.idx + 1) % PRESETS.length; this.yaw = 0; if (!PRESETS[this.idx].fp) this.lastIdx = this.idx; return PRESETS[this.idx]; },
    // 拖动转视角：yaw 以北为 0、顺时针为正，夹到 (-π, π]
    rotate(d) { this.yaw = ((this.yaw + d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; },
    // 正数表示玩家向右看；驾驶舱与环绕镜头的 yaw 定义相反，按实际生效的镜头换算。
    turnRight(d) { this.rotate(this.fpNow ? d : -d); },
    setAspect(a) { cam.aspect = a; cam.updateProjectionMatrix(); judgeCam.aspect = a; judgeCam.updateProjectionMatrix(); },
    snap(px, py) { const p = PRESETS[PRESETS[this.idx].fp ? this.lastIdx : this.idx]; this.tx = px; this.ty = py + p.ahead; },
    // 水平相机轴：给移动映射与测试使用（判定镜头恒朝北，因此右 = 东、前 = 北）
    axes() {
      const f = new THREE.Vector3(); judgeCam.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      return { fwd: { x: f.x, y: -f.z }, right: { x: r.x, y: -r.z } };
    },
    update(dt, px, py, opt) {
      const p = PRESETS[this.idx];
      const fp = !!p.fp && !!opt && !!opt.fpOK;
      const gp = fp ? PRESETS[this.lastIdx] : p;   // 第一人称未生效（标题/阵亡）时按上一常规预设摆放
      const switched = fp !== this.fpNow; this.fpNow = fp;
      let gx = px, gy = py + gp.ahead;
      const hfov = 2 * Math.atan(Math.tan(gp.fov * D / 2) * judgeCam.aspect);
      const hw = gp.dist * Math.tan(hfov / 2) * 0.86;
      if (opt && opt.lock) {
        const L = opt.lock;
        gx = clamp(px, L.cx - 7, L.cx + 7); gy = L.lockY ? L.cy : clamp(py + gp.ahead * 0.5, L.cy - 8, L.cy + 8);
      } else {
        gx = hw < 34 ? clamp(gx, -36 + hw, 36 - hw) : 0;
        gy = clamp(gy, 9, 342);
      }
      if (opt && opt.free) { gx = opt.free.x; gy = opt.free.y; }
      const k = (opt && opt.instant) || switched ? 1 : 1 - Math.exp(-dt * 5.5);
      this.tx += (gx - this.tx) * k; this.ty += (gy - this.ty) * k;
      const pitch = !fp && opt && opt.pitch ? opt.pitch : gp.pitch, dist = !fp && opt && opt.dist ? opt.dist : gp.dist;
      // 判定镜头按 yaw 环绕目标点（yaw=0 时朝北，与原实现一致）
      const oy = Math.cos(pitch) * dist;
      judgeCam.fov = gp.fov; judgeCam.updateProjectionMatrix();
      judgeCam.position.set(this.tx + Math.sin(this.yaw) * oy, Math.sin(pitch) * dist, -(this.ty) + Math.cos(this.yaw) * oy);
      judgeCam.lookAt(this.tx, 0, -(this.ty));
      judgeCam.updateMatrixWorld();
      this.computeQuad();
      // 渲染镜头：第一人称沿车头+yaw 看，其余视角与判定镜头同位
      if (fp) {
        const a = (opt.heading || 0) + this.yaw, fx = Math.sin(a), fz = Math.cos(a);
        cam.fov = p.fov; cam.updateProjectionMatrix();
        cam.position.set(px + fx * 0.7, 1.5, -(py + fz * 0.7));
        cam.lookAt(px + fx * 14, 0.35, -(py + fz * 14));
      } else {
        cam.fov = gp.fov; cam.updateProjectionMatrix();
        cam.position.copy(judgeCam.position);
        cam.quaternion.copy(judgeCam.quaternion);
      }
      cam.updateMatrixWorld();
      if (opt && opt.shake) {
        const sx = (Math.random() - 0.5) * opt.shake, sy = (Math.random() - 0.5) * opt.shake;
        cam.position.x += sx; cam.position.z += sy;
        cam.updateMatrixWorld();
      }
    },
    computeQuad() {
      const v = new THREE.Vector3(), o = judgeCam.position;
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
