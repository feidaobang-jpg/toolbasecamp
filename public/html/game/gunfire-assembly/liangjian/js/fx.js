// 粒子、曳光弹、爆炸与地面预警（全部用实例化或对象池，镜头不震动）
import * as THREE from '../vendor/three.module.js';
import { rand, TAU } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _c2 = new THREE.Color();

export class Fx {
  constructor(scene, quality) {
    this.scene = scene;
    this.scale = quality === 'low' ? 0.55 : 1;
    // 粒子
    const MAXP = 900;
    this.maxP = MAXP;
    this.pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
    this.pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
    this.pm.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.pm.frustumCulled = false;
    this.pm.count = 0;
    scene.add(this.pm);
    this.parts = [];
    // 烟与尘：半透明的圆团（和碎片火星分开画，才能做出透明感）
    const MAXS = 420;
    this.maxS = MAXS;
    this.sm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false }), MAXS);
    this.sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 3), 3);
    this.sm.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.sm.frustumCulled = false; this.sm.count = 0; this.sm.renderOrder = 4;
    scene.add(this.sm);
    this.softs = [];
    // 曳光弹
    const MAXT = 260;
    this.tm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXT);
    this.tm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXT * 3), 3);
    this.tm.frustumCulled = false;
    this.tm.count = 0;
    this.maxT = MAXT;
    scene.add(this.tm);
    // 爆炸火球
    this.balls = [];
    const bg = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; scene.add(m); this.balls.push({ m, t: 0, d: 0, r: 1 });
    }
    // 冲击波环 / 地面预警圈
    this.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 40);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.visible = false; m.renderOrder = 3; scene.add(m); this.rings.push({ m, t: 0, d: 0, mode: 0 });
    }
    this.discs = [];
    const dg = new THREE.CircleGeometry(1, 36);
    dg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      m.visible = false; m.renderOrder = 2; scene.add(m); this.discs.push({ m, t: 0, d: 0 });
    }
    // 弹坑焦痕
    this.scorch = [];
    this.scorchI = 0;
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x1c1712, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false; m.renderOrder = 1; scene.add(m); this.scorch.push(m);
    }
    // 突进预警条
    this.strips = [];
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2); sg.translate(0, 0, -0.5);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xff2e20, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
      m.visible = false; m.renderOrder = 2; scene.add(m); this.strips.push({ m, t: 0, d: 0 });
    }
  }

  // ---- 粒子 ----
  spawn(o) {
    const list = o.soft ? this.softs : this.parts;
    if (list.length >= (o.soft ? this.maxS : this.maxP)) return;
    list.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: 0, max: o.life || 1, s0: o.s0 || 0.2, s1: o.s1 === undefined ? 0 : o.s1,
      g: o.g || 0, drag: o.drag || 0, c0: o.c0 || 0xffffff, c1: o.c1 === undefined ? o.c0 || 0xffffff : o.c1,
      rx: rand(TAU), ry: rand(TAU), spin: o.spin === undefined ? rand(-3, 3) : o.spin, bounce: o.bounce || 0, soft: !!o.soft,
    });
  }
  burst(n, f) { n = Math.max(1, Math.round(n * this.scale)); for (let i = 0; i < n; i++) f(i); }

  sparks(x, y, z, n = 6, color = 0xffd27a) {
    this.burst(n, () => this.spawn({ x, y, z, vx: rand(-4, 4), vy: rand(1, 5), vz: rand(-4, 4), life: rand(0.15, 0.35), s0: 0.09, s1: 0, g: 12, c0: color, c1: 0xff6a2a }));
  }
  dust(x, y, z, n = 5, color = 0xb89a6a) {
    this.burst(n, () => this.spawn({ soft: true, x: x + rand(-0.3, 0.3), y: y + rand(0, 0.2), z: z + rand(-0.3, 0.3), vx: rand(-1.2, 1.2), vy: rand(0.4, 1.6), vz: rand(-1.2, 1.2), life: rand(0.5, 1.0), s0: 0.35, s1: 1.1, drag: 2, c0: color, c1: 0xcbb994 }));
  }
  smokePuff(x, y, z, size = 1, color = 0x4a4640) {
    this.spawn({ soft: true, x, y, z, vx: rand(-0.4, 0.4), vy: rand(1.2, 2.4), vz: rand(-0.4, 0.4), life: rand(1.6, 2.8), s0: 0.6 * size, s1: 2.6 * size, drag: 0.4, c0: color, c1: 0x8d8983, spin: rand(-0.6, 0.6) });
  }
  blood(x, y, z) { this.sparks(x, y, z, 4, 0xe8dcc0); }
  debris(x, y, z, n, colors, power = 8, size = 0.4) {
    this.burst(n, () => this.spawn({ x: x + rand(-1, 1), y: y + rand(-0.5, 0.8), z: z + rand(-1, 1), vx: rand(-power, power), vy: rand(power * 0.4, power * 1.3), vz: rand(-power * 0.4, power), life: rand(1.4, 2.6), s0: rand(size * 0.5, size * 1.5), s1: size * 0.4, g: 20, bounce: 0.35, c0: colors[Math.floor(rand(colors.length))] }));
  }
  explosion(x, y, z, r = 4, big = false) {
    const b = this.balls.find((k) => !k.m.visible) || this.balls[0];
    b.m.visible = true; b.m.position.set(x, y + 0.4, z); b.t = 0; b.d = big ? 0.5 : 0.32; b.r = r * (big ? 0.75 : 0.6);
    this.ring(x, y + 0.06, z, r * 1.35, 0.45, 0xffe6b0, 1);
    this.burst(big ? 26 : 12, () => { const a = rand(TAU), sp = rand(2, big ? 13 : 8); this.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rand(3, big ? 14 : 9), vz: Math.sin(a) * sp, life: rand(0.4, 0.9), s0: rand(0.25, 0.5), s1: 0, g: 16, c0: 0xffd27a, c1: 0xb8401a }); });
    this.burst(big ? 16 : 8, () => this.spawn({ x: x + rand(-r * 0.4, r * 0.4), y: y + rand(0.2, 1.2), z: z + rand(-r * 0.4, r * 0.4), vx: rand(-1.5, 1.5), vy: rand(1.5, 4.5), vz: rand(-1.5, 1.5), life: rand(1.2, 2.6), s0: rand(0.8, 1.3), s1: rand(2.4, big ? 4.6 : 3.2), drag: 1.2, c0: 0x3a342e, c1: 0x9a948c, spin: rand(-0.8, 0.8), soft: true }));
    this.burst(big ? 14 : 7, () => { const a = rand(TAU), sp = rand(3, 9); this.spawn({ x, y: y + 0.2, z, vx: Math.cos(a) * sp, vy: rand(4, 10), vz: Math.sin(a) * sp, life: rand(0.8, 1.6), s0: rand(0.12, 0.3), s1: 0.1, g: 22, bounce: 0.3, c0: 0x6d5a3e }); });
    const gy = this.hgt ? this.hgt(x, z) : 0;
    if (y - gy < 0.6) { const s = this.scorch[this.scorchI++ % this.scorch.length]; s.visible = true; s.position.set(x, gy + 0.03, z); s.scale.setScalar(r * 0.42); this.tilt(s, x, z); }
  }

  // 有地形的章节：平放的圈、盘按脚下坡面倾斜（平地章节不动）
  tilt(m, x, z) {
    if (!this.hgt) return;
    const h = this.hgt, dx = (h(x + 0.6, z) - h(x - 0.6, z)) / 1.2, dz = (h(x, z + 0.6) - h(x, z - 0.6)) / 1.2;
    m.rotation.set(-Math.atan(dz), 0, Math.atan(dx));
  }
  ring(x, y, z, r, dur, color = 0xffffff, mode = 1) {
    const k = this.rings.find((q) => !q.m.visible) || this.rings[0];
    k.m.visible = true; k.m.position.set(x, y, z); k.m.material.color.set(color); this.tilt(k.m, x, z);
    k.t = 0; k.d = dur; k.r = r; k.mode = mode;   // mode 1：向外扩散；mode 2：预警（向内收缩）
    return k;
  }
  // 地面预警：红色圆盘逐渐填满，结束时由调用方触发爆炸
  warn(x, z, r, dur, color = 0xff3b2a, y = this.hgt ? this.hgt(x, z) : 0) {
    const k = this.discs.find((q) => !q.m.visible) || this.discs[0];
    k.m.visible = true; k.m.position.set(x, y + 0.05, z); k.m.material.color.set(color); k.t = 0; k.d = dur; k.r = r; this.tilt(k.m, x, z);
    this.ring(x, y + 0.07, z, r, dur, color, 2);
  }
  strip(x, z, yaw, len, width, dur, y = this.hgt ? this.hgt(x, z) : 0) {
    const k = this.strips.find((q) => !q.m.visible) || this.strips[0];
    // 坡上：预警条沿着朝向的坡度抬起或压低
    const pitch = this.hgt ? Math.atan2(this.hgt(x - Math.sin(yaw) * len, z - Math.cos(yaw) * len) - y, len) : 0;
    k.m.visible = true; k.m.position.set(x, y + 0.06, z); k.m.rotation.set(pitch, yaw, 0, 'YXZ'); k.m.scale.set(width, 1, len); k.t = 0; k.d = dur;
    return k;
  }

  clearWarnings() {
    for (const k of this.discs) k.m.visible = false;
    for (const k of this.strips) k.m.visible = false;
    for (const k of this.rings) if (k.mode === 2) k.m.visible = false;
  }

  update(dt) {
    // 粒子（硬的碎片火星 + 软的烟尘）
    this._run(this.parts, this.pm, dt, false);
    this._run(this.softs, this.sm, dt, true);
    this._rest(dt);
  }
  _run(ps, pm, dt, soft) {
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; p.vy *= (p.g ? 1 : k); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const fl = this.hgt && (p.g || p.bounce) ? this.hgt(p.x, p.z) + 0.05 : 0.05;
      if (p.y < fl && p.vy < 0) { if (p.bounce) { p.y = fl; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; } else if (p.g) { p.y = fl; p.vy = 0; p.vx = 0; p.vz = 0; } }
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
      const t = p.life / p.max;
      // 烟团先胀大，最后三成寿命缩回去，看起来像散掉
      const s = (p.s0 + (p.s1 - p.s0) * t) * (soft && t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1) + 0.001;
      _e.set(p.rx, p.ry, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      pm.setMatrixAt(n, _m);
      _c.set(p.c0);
      if (p.c1 !== p.c0) _c.lerp(_c2.set(p.c1), t);
      pm.setColorAt(n, _c);
      ps[n++] = p;
    }
    ps.length = n;
    pm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;
  }
  _rest(dt) {
    // 火球
    for (const b of this.balls) {
      if (!b.m.visible) continue;
      b.t += dt;
      const t = b.t / b.d;
      if (t >= 1) { b.m.visible = false; continue; }
      b.m.scale.setScalar(b.r * (0.35 + 0.65 * Math.sqrt(t)));
      b.m.material.opacity = 0.95 * (1 - t * t);
      b.m.material.color.setHex(t < 0.35 ? 0xfff0c0 : 0xff9a3a);
    }
    for (const k of this.rings) {
      if (!k.m.visible) continue;
      k.t += dt;
      const t = k.t / k.d;
      if (t >= 1) { k.m.visible = false; continue; }
      if (k.mode === 1) { k.m.scale.setScalar(k.r * (0.2 + 0.8 * t)); k.m.material.opacity = 0.8 * (1 - t); }
      else { k.m.scale.setScalar(k.r); k.m.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(k.t * 14)); }
    }
    for (const k of this.discs) {
      if (!k.m.visible) continue;
      k.t += dt;
      const t = k.t / k.d;
      if (t >= 1) { k.m.visible = false; continue; }
      k.m.scale.setScalar(Math.max(0.01, k.r * t));
      k.m.material.opacity = 0.28 + 0.2 * t;
    }
    for (const k of this.strips) {
      if (!k.m.visible) continue;
      k.t += dt;
      const t = k.t / k.d;
      if (t >= 1) { k.m.visible = false; continue; }
      k.m.material.opacity = 0.25 + 0.45 * t;
    }
  }

  // 每帧由游戏把存活的子弹写进来
  beginTracers() { this._tn = 0; }
  tracer(x, y, z, dx, dy, dz, len, color) {
    if (this._tn >= this.maxT) return;
    _d.set(dx, dy, dz);
    _q.setFromUnitVectors(_z, _d);
    _m.compose(_p.set(x - dx * len * 0.5, y - dy * len * 0.5, z - dz * len * 0.5), _q, _s.set(1, 1, len));
    this.tm.setMatrixAt(this._tn, _m);
    this.tm.setColorAt(this._tn, _c.set(color));
    this._tn++;
  }
  endTracers() {
    this.tm.count = this._tn;
    this.tm.instanceMatrix.needsUpdate = true;
    this.tm.instanceColor.needsUpdate = true;
  }
}
