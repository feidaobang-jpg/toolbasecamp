// 特效：粒子（实例化小方块）、爆炸火球、水花、屏幕震动；子弹等成批小物件的实例化渲染器。
import * as THREE from 'three';

export function createFx(scene) {
  const MAXP = 700;
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
  pMesh.frustumCulled = false; pMesh.count = 0;
  scene.add(pMesh);
  const ps = [];
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();

  // 火球：发光球体池
  const balls = [];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
    m.visible = false; scene.add(m); balls.push({ m, life: 0, max: 1, size: 1 });
  }
  const F = {
    shake: 0, count: 0,
    burst(x, y, z, n, colors, speed, life, size, grav) {
      for (let i = 0; i < n; i++) {
        if (ps.length >= MAXP) ps.shift();
        const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * Math.PI, sp = speed * (0.4 + Math.random() * 0.8);
        ps.push({ x, y, z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + speed * 0.3, vz: Math.sin(a) * Math.cos(b) * sp * 0.6,
          life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], g: grav === undefined ? 12 : grav, rot: Math.random() * 6 });
      }
    },
    fireball(x, y, z, size, life) {
      const b = balls.find(o => o.life <= 0) || balls[0];
      b.life = b.max = life || 0.45; b.size = size; b.m.position.set(x, y, z); b.m.visible = true;
    },
    explosion(x, y, size, z) {
      const s = size || 1, zz = z || 0.4;
      F.fireball(x, y, zz, 0.9 * s, 0.4 + 0.1 * s);
      F.fireball(x + (Math.random() - 0.5) * s, y + (Math.random() - 0.3) * s, zz + 0.2, 0.6 * s, 0.32);
      F.burst(x, y, zz, Math.round(14 * s), [0xfcfcfc, 0xfce020, 0xf88800, 0xd82800], 6 * s, 0.6, 0.16 * Math.sqrt(s), 10);
      F.shake = Math.max(F.shake, 0.08 * s);
    },
    spark(x, y, z, color) { F.burst(x, y, z || 0.4, 4, [color || 0xfcfcfc, 0xfce020], 4, 0.18, 0.09, 0); },
    splash(x, y) { F.burst(x, y, 0.3, 16, [0xfcfcfc, 0x3cbcfc, 0x0070ec], 5, 0.6, 0.14, 16); },
    clear() { ps.length = 0; for (const b of balls) { b.life = 0; b.m.visible = false; } F.shake = 0; },
    update(dt) {
      let n = 0;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 8;
      }
      for (const p of ps) {
        if (n >= MAXP) break;
        const k = Math.max(0.05, p.life / p.max);
        e.set(p.rot, p.rot * 0.7, 0); q.setFromEuler(e);
        s3.setScalar(p.size * (0.4 + 0.6 * k));
        m4.compose(v3.set(p.x, p.y, p.z), q, s3);
        pMesh.setMatrixAt(n, m4);
        col.setHex(p.color); pMesh.setColorAt(n, col);
        n++;
      }
      pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
      for (const b of balls) {
        if (b.life <= 0) { b.m.visible = false; continue; }
        b.life -= dt;
        const k = 1 - b.life / b.max;
        b.m.scale.setScalar(b.size * (0.5 + k * 0.9));
        b.m.material.opacity = Math.max(0, 1 - k * k);
        b.m.material.color.setHex(k < 0.3 ? 0xfcfcfc : k < 0.6 ? 0xfce020 : 0xf86000);
        if (b.life <= 0) b.m.visible = false;
      }
      F.shake = Math.max(0, F.shake - dt * 0.5);
      F.count = n;
    },
    stats: () => ({ particles: ps.length })
  };

  // 实例化小物件渲染器：每帧传入 [{x,y,z,r,sx,sy,sz}] 列表
  F.dots = function (geo, material, max) {
    const mesh = new THREE.InstancedMesh(geo, material, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh);
    return {
      mesh,
      set(list) {
        let n = 0;
        for (const o of list) {
          if (n >= max) break;
          e.set(0, 0, o.r || 0); q.setFromEuler(e);
          s3.set(o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1);
          m4.compose(v3.set(o.x, o.y, o.z || 0), q, s3);
          mesh.setMatrixAt(n++, m4);
        }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
      }
    };
  };
  return F;
}
