// 粒子特效：实例化对象池（火球、烟、碎片、火花、水花、冲击环、尘土、金色闪光）
import * as THREE from 'three';
import { BASE } from './models.js';
// 特效只用 Math.random：不消耗玩法随机数，保证同一种子 + 同样输入的对局可复现
const rand = Math.random;

const Z = (y) => -y;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class Pool {
  constructor(scene, geo, mat, max) {
    this.im = new THREE.InstancedMesh(geo, mat, max);
    this.im.frustumCulled = false;
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < max; i++) { this.im.setMatrixAt(i, ZERO); this.im.setColorAt(i, tmpC.setRGB(1, 1, 1)); }
    this.max = max; this.p = []; this.next = 0;
    for (let i = 0; i < max; i++) this.p.push({ on: false });
    scene.add(this.im);
  }
  spawn(o) {
    // 环形覆盖最旧粒子，保证数量有上限
    const i = this.next; this.next = (this.next + 1) % this.max;
    const p = this.p[i];
    Object.assign(p, { on: true, t: 0, vx: 0, vy: 0, vh: 0, g: 0, rx: 0, ry: 0, rz: 0, sr: 0, grow: 1, shrinkAt: 0.5, color: 0xffffff, color2: null, bounce: 0 }, o);
    return p;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; this.im.setMatrixAt(i, ZERO); any = true; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt; p.vh -= p.g * dt;
      if (p.g && p.h < 0.05) { p.h = 0.05; if (p.bounce) { p.vh = -p.vh * p.bounce; p.vx *= 0.6; p.vy *= 0.6; p.bounce *= 0.5; } else { p.vh = 0; p.vx *= 0.9; p.vy *= 0.9; } }
      p.rx += p.sr * dt; p.rz += p.sr * 0.7 * dt;
      const k = p.t / p.life;
      let s = p.size * (1 + (p.grow - 1) * Math.min(1, k * 2));
      if (k > p.shrinkAt) s *= Math.max(0, 1 - (k - p.shrinkAt) / (1 - p.shrinkAt));
      tmpE.set(p.rx, p.ry, p.rz); tmpQ.setFromEuler(tmpE);
      tmpV.set(p.x, p.h, Z(p.y)); tmpS.set(s * (p.sx || 1), s * (p.sh || 1), s * (p.sz || 1));
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.im.setMatrixAt(i, tmpM);
      if (p.color2 !== null) { tmpC.setHex(p.color).lerp(tmpC2.setHex(p.color2), Math.min(1, k * 1.6)); this.im.setColorAt(i, tmpC); }
      else this.im.setColorAt(i, tmpC.setHex(p.color));
      any = true;
    }
    if (any) { this.im.instanceMatrix.needsUpdate = true; if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true; }
  }
  clear() { for (let i = 0; i < this.max; i++) { this.p[i].on = false; this.im.setMatrixAt(i, ZERO); } this.im.instanceMatrix.needsUpdate = true; }
  count() { let n = 0; for (const p of this.p) if (p.on) n++; return n; }
}
const tmpC2 = new THREE.Color();

export function createFx(scene) {
  const unlit = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const lit = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const fire = new Pool(scene, BASE.ico, unlit, 160);
  const smokeGeo = new THREE.SphereGeometry(0.5, 10, 7);
  const smoke = new Pool(scene, smokeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }), 140);
  const debris = new Pool(scene, BASE.box, lit, 140);
  const spark = new Pool(scene, BASE.lsphere, unlit, 120);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.8, 1, 28);
  const rings = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(ringGeo, ringMat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); rings.push({ m, t: 0, life: 0, size: 1 }); }
  let ringNext = 0;

  const F = {
    shake: 0,
    explosion(x, y, h, size) {
      size = size || 1;
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2, r = rand() * 0.7 * size;
        fire.spawn({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, h: h + 0.3 + rand() * 0.6 * size, vx: Math.cos(a) * 2 * size, vy: Math.sin(a) * 2 * size, vh: 1.5 + rand() * 2, life: 0.35 + rand() * 0.3, size: (0.7 + rand() * 0.7) * size, grow: 1.8, shrinkAt: 0.35, color: 0xfff3a0, color2: 0xff5a2a, sr: 3 });
      }
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2;
        smoke.spawn({ x: x + Math.cos(a) * 0.4 * size, y: y + Math.sin(a) * 0.4 * size, h: h + 0.5, vx: Math.cos(a) * 1.2 * size, vy: Math.sin(a) * 1.2 * size, vh: 1.6 + rand() * 1.2, life: 0.9 + rand() * 0.7, size: (0.45 + rand() * 0.4) * size, grow: 1.9, shrinkAt: 0.5, color: 0x8a847e, color2: 0xe6e1da, sr: 1 });
      }
      for (let i = 0; i < 8; i++) {
        const a = rand() * Math.PI * 2, sp = 3 + rand() * 4;
        spark.spawn({ x, y, h: h + 0.5, vx: Math.cos(a) * sp * size, vy: Math.sin(a) * sp * size, vh: 3 + rand() * 4, g: 14, life: 0.4 + rand() * 0.25, size: 0.16, color: 0xffe07a, shrinkAt: 0.4 });
      }
      F.ring(x, y, h, 2.2 * size);
      F.shake = Math.max(F.shake, 0.18 * size);
    },
    bigExplosion(x, y, h, size) {
      F.explosion(x, y, h, size);
      setTimeout(() => F.explosion(x + 0.6, y - 0.4, h + 0.4, size * 0.8), 120);
      F.shake = Math.max(F.shake, 0.4 * size);
    },
    debris(x, y, h, color, n, power) {
      for (let i = 0; i < (n || 8); i++) {
        const a = rand() * Math.PI * 2, sp = (2 + rand() * 4) * (power || 1);
        debris.spawn({ x, y, h: h + 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 3 + rand() * 5, g: 16, bounce: 0.35, life: 1.4 + rand() * 0.8, size: 0.18 + rand() * 0.22, color, sr: 8 + rand() * 6, shrinkAt: 0.75, sh: 0.6 });
      }
    },
    hit(x, y, h, color) {
      for (let i = 0; i < 5; i++) {
        const a = rand() * Math.PI * 2, sp = 2 + rand() * 3;
        spark.spawn({ x, y, h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 1 + rand() * 3, g: 10, life: 0.22 + rand() * 0.12, size: 0.12, color: color || 0xfff2a8 });
      }
    },
    muzzle(x, y, h, a, big) {
      const s = big ? 0.7 : 0.38;
      fire.spawn({ x: x + Math.sin(a) * 0.2, y: y + Math.cos(a) * 0.2, h, life: 0.06, size: s, grow: 1.4, color: 0xfff6c0, shrinkAt: 0.2 });
    },
    splash(x, y, size) {
      size = size || 1;
      for (let i = 0; i < 10; i++) {
        const a = rand() * Math.PI * 2, sp = (1 + rand() * 2.5) * size;
        spark.spawn({ x, y, h: -0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 4 + rand() * 4, g: 14, life: 0.5 + rand() * 0.3, size: 0.2 * size, color: rand() < 0.5 ? 0xffffff : 0xa8ecff });
      }
      F.ring(x, y, -0.25, 1.6 * size, 0xffffff);
    },
    smoke(x, y, h, n, color, color2) {
      for (let i = 0; i < (n || 1); i++) smoke.spawn({ x: x + (rand() - 0.5) * 0.6, y: y + (rand() - 0.5) * 0.6, h: h + rand() * 0.3, vx: (rand() - 0.5) * 0.4, vy: (rand() - 0.5) * 0.4, vh: 1 + rand() * 0.8, life: 1.2 + rand() * 0.6, size: 0.3 + rand() * 0.25, grow: 2.2, shrinkAt: 0.45, color: color || 0x7a746e, color2: color2 || 0xd8d3cc });
    },
    dust(x, y) { smoke.spawn({ x: x + (rand() - 0.5) * 0.5, y: y + (rand() - 0.5) * 0.5, h: 0.15, vh: 0.5, life: 0.5, size: 0.22, grow: 2.2, shrinkAt: 0.3, color: 0xd9c49a }); },
    sparkle(x, y, h, color) {
      for (let i = 0; i < 10; i++) {
        const a = rand() * Math.PI * 2, sp = 1 + rand() * 2;
        spark.spawn({ x, y, h: h + rand() * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 2 + rand() * 2, g: 4, life: 0.6 + rand() * 0.4, size: 0.14, color: color || 0xffe36b });
      }
    },
    ring(x, y, h, size, color) {
      const r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
      r.t = 0; r.life = 0.35; r.size = size; r.m.visible = true; r.m.position.set(x, h + 0.1, Z(y));
      r.m.material.color.setHex(color || 0xfff0b0);
    },
    update(dt) {
      fire.update(dt); smoke.update(dt); debris.update(dt); spark.update(dt);
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt;
        if (r.t >= r.life) { r.m.visible = false; continue; }
        const k = r.t / r.life, s = r.size * (0.3 + k);
        r.m.scale.set(s, s, s); r.m.material.opacity = 0.6 * (1 - k);
      }
      F.shake = Math.max(0, F.shake - dt * 1.4);
    },
    clear() { fire.clear(); smoke.clear(); debris.clear(); spark.clear(); for (const r of rings) r.m.visible = false; F.shake = 0; },
    stats() { return { fire: fire.count(), smoke: smoke.count(), debris: debris.count(), spark: spark.count() }; }
  };
  return F;
}
