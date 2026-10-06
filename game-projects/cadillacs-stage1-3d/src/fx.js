// 特效：命中火花（漫画星形）、尘土、爆炸、碎片、枪口火光、子弹拖光、得分飘字、必杀冲击环。全部按游戏时间推进。
import * as THREE from 'three';
import { GEO } from './models.js';

function canvasSprite(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const starTex = canvasSprite(128, 128, (g, w, h) => {
  g.translate(w / 2, h / 2);
  const spikes = 10;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? 22 : 60, a = i / (spikes * 2) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#fff36a'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ff8a1a'; g.stroke();
  g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
});
const puffTex = canvasSprite(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const fireTex = canvasSprite(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,200,60,1)'); gr.addColorStop(0.7, 'rgba(240,90,20,0.8)'); gr.addColorStop(1, 'rgba(160,30,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const ringTex = canvasSprite(128, 128, (g) => { g.strokeStyle = 'rgba(255,240,180,1)'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke(); g.strokeStyle = 'rgba(255,160,60,0.8)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke(); });
const textCache = new Map();
function textTex(txt, color) {
  const key = txt + '|' + color;
  let t = textCache.get(key);
  if (!t) {
    t = canvasSprite(256, 96, (g, w, h) => {
      g.font = '900 64px "Arial Black", Impact, "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#2a1408'; g.strokeText(txt, w / 2, h / 2); g.fillStyle = color; g.fillText(txt, w / 2, h / 2);
    });
    textCache.set(key, t);
  }
  return t;
}

export function createFx(scene) {
  const group = new THREE.Group(); scene.add(group);
  const sprites = [], debris = [];
  const F = { shake: 0, group };
  function sprite(tex, opts) {
    let s = sprites.find(x => !x.alive && x.tex === tex && x.blend === (opts.blend || 'normal'));
    if (!s) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false, blending: opts.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
      s = { sp: new THREE.Sprite(mat), tex, blend: opts.blend || 'normal', alive: false };
      group.add(s.sp); sprites.push(s);
    }
    s.alive = true; s.t = 0; s.life = opts.life || 0.3; s.s0 = opts.s0 || 0.5; s.s1 = opts.s1 === undefined ? s.s0 : opts.s1;
    s.vx = opts.vx || 0; s.vy = opts.vy || 0; s.vz = opts.vz || 0; s.grav = opts.grav || 0; s.fade = opts.fade !== false; s.rot = opts.rot || 0; s.spin = opts.spin || 0;
    s.sp.material.color.set(opts.color || 0xffffff); s.sp.material.opacity = 1; s.sp.material.rotation = s.rot;
    s.sp.position.set(opts.x, opts.y, opts.z); s.sp.scale.setScalar(s.s0); s.sp.visible = true; s.sp.renderOrder = opts.order || 5;
    return s;
  }
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMats = new Map();
  function debrisMat(c) { let m = debrisMats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); debrisMats.set(c, m); } return m; }
  F.hit = (x, y, z, big) => {
    sprite(starTex, { x, y, z, life: big ? 0.2 : 0.14, s0: big ? 0.5 : 0.32, s1: big ? 1.15 : 0.75, rot: Math.random() * 3, order: 8, depthTest: false });
    if (big) F.shake = Math.max(F.shake, 0.12);
  };
  F.text = (x, y, z, txt, color, size) => sprite(textTex(txt, color || '#fff36a'), { x, y, z, life: 0.9, s0: size || 0.9, s1: (size || 0.9) * 1.05, vy: 1.0, order: 9, depthTest: false });
  F.pow = (x, y, z) => sprite(textTex('POW!', '#ffd84a'), { x, y, z, life: 0.35, s0: 0.6, s1: 1.1, order: 9, depthTest: false });
  F.dust = (x, y, z, n, size) => { for (let i = 0; i < (n || 4); i++) { const a = Math.random() * Math.PI * 2; sprite(puffTex, { x: x + Math.cos(a) * 0.2, y: y + 0.1, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.4, life: 0.5, s0: (size || 0.35), s1: (size || 0.35) * 2.2, color: 0xd8ccb4 }); } };
  F.blood = (x, y, z, dir) => { for (let i = 0; i < 4; i++) sprite(puffTex, { x, y, z, vx: dir * (0.8 + Math.random()) , vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5, grav: 9, life: 0.4, s0: 0.12, s1: 0.06, color: 0xc81e1e }); };
  F.muzzle = (x, y, z, big) => sprite(fireTex, { x, y, z, life: 0.07, s0: big ? 0.42 : 0.28, s1: big ? 0.7 : 0.46, blend: 'add', order: 7 });
  // 子弹拖光：亮芯 + 橙色光晕的细长条，从枪口飞向终点；头到终点后尾巴收拢消失。o = { speed 米/秒, len 拖光长度, w 粗细 }
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracerCore = new THREE.MeshBasicMaterial({ color: 0xfff8d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const tracerGlow = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const tracers = [];
  F.tracer = (x0, y0, z0, x1, y1, z1, o) => {
    let t = tracers.find(q => !q.alive);
    if (!t) {
      const m = new THREE.Mesh(tracerGeo, tracerCore), glow = new THREE.Mesh(tracerGeo, tracerGlow);
      glow.scale.set(2.8, 2.8, 1.15); m.add(glow); m.renderOrder = 7; glow.renderOrder = 6; group.add(m);
      t = { m, a: new THREE.Vector3(), d: new THREE.Vector3(), alive: false }; tracers.push(t);
    }
    t.a.set(x0, y0, z0); t.d.set(x1 - x0, y1 - y0, z1 - z0); t.L = t.d.length() || 0.01; t.d.multiplyScalar(1 / t.L);
    t.speed = (o && o.speed) || 70; t.len = (o && o.len) || 0.5; t.w = (o && o.w) || 0.045; t.t = 0; t.alive = true;
    t.m.position.copy(t.a); t.m.lookAt(x1, y1, z1); t.m.visible = false;
    return t;
  };
  F.boom = (x, y, z, size) => {
    const S = size || 1;
    for (let i = 0; i < 9; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6 * S; sprite(fireTex, { x: x + Math.cos(a) * r, y: y + 0.4 + Math.random() * 0.8 * S, z: z + Math.sin(a) * r, vy: 0.6, life: 0.45 + Math.random() * 0.2, s0: 0.8 * S, s1: 2.0 * S, blend: 'add', order: 7 }); }
    for (let i = 0; i < 7; i++) { const a = Math.random() * Math.PI * 2; sprite(puffTex, { x: x + Math.cos(a) * 0.4, y: y + 0.8, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 1.4, life: 1.0, s0: 0.8 * S, s1: 2.4 * S, color: 0x5a5048 }); }
    F.shake = Math.max(F.shake, 0.35);
  };
  F.glint = (x, y, z) => sprite(starTex, { x, y, z, life: 0.22, s0: 0.12, s1: 0.5, color: 0xffffff, order: 8, depthTest: false });   // 步枪兵开枪前的枪口闪光预警
  F.splash = (x, y, z, n, size) => { for (let i = 0; i < (n || 6); i++) { const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2; sprite(puffTex, { x: x + Math.cos(a) * 0.15, y, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.6 + Math.random() * 1.8, grav: 9, life: 0.55, s0: (size || 0.35) * 0.6, s1: (size || 0.35) * 1.3, color: 0xd8ece4 }); } };
  F.ring = (x, y, z) => sprite(ringTex, { x, y, z, life: 0.35, s0: 0.6, s1: 4.2, blend: 'add', order: 6 });
  F.debris = (x, y, z, color, n, size, speed) => {
    for (let i = 0; i < (n || 8); i++) {
      let d = debris.find(o => !o.alive);
      if (!d) { d = { m: new THREE.Mesh(debrisGeo, debrisMat(color)), alive: false }; d.m.castShadow = false; group.add(d.m); debris.push(d); }
      d.m.material = debrisMat(color);
      const sz = (size || 0.12) * (0.6 + Math.random() * 0.8);
      d.m.scale.set(sz, sz * (0.5 + Math.random()), sz * (0.6 + Math.random() * 0.8));
      d.m.position.set(x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2, sp = (speed || 3) * (0.5 + Math.random() * 0.7);
      d.vx = Math.cos(a) * sp; d.vz = Math.sin(a) * sp; d.vy = 2 + Math.random() * 3; d.rx = (Math.random() - 0.5) * 12; d.ry = (Math.random() - 0.5) * 12;
      d.t = 0; d.life = 1.2 + Math.random() * 0.5; d.alive = true; d.m.visible = true;
    }
  };
  F.update = (dt) => {
    for (const t of tracers) {
      if (!t.alive) continue;
      t.t += dt;
      const run = t.speed * t.t, head = Math.min(t.L, run), tail = Math.max(0, run - t.len);
      if (tail >= t.L) { t.alive = false; t.m.visible = false; continue; }
      const seg = head - tail;
      t.m.visible = seg > 0.01;
      t.m.position.copy(t.a).addScaledVector(t.d, tail + seg / 2);
      t.m.scale.set(t.w, t.w, Math.max(0.01, seg));
    }
    for (const s of sprites) {
      if (!s.alive) continue;
      s.t += dt;
      if (s.t >= s.life) { s.alive = false; s.sp.visible = false; continue; }
      const u = s.t / s.life;
      s.vy -= s.grav * dt;
      s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
      s.sp.scale.setScalar(s.s0 + (s.s1 - s.s0) * u);
      if (s.fade) s.sp.material.opacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      if (s.spin) s.sp.material.rotation += s.spin * dt;
    }
    for (const d of debris) {
      if (!d.alive) continue;
      d.t += dt;
      if (d.t >= d.life) { d.alive = false; d.m.visible = false; continue; }
      d.vy -= 16 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      if (d.m.position.y < 0.03) { d.m.position.y = 0.03; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.ry *= 0.5; }
      d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt;
    }
    F.shake = Math.max(0, F.shake - dt * 1.4);
  };
  F.clear = () => { tracers.forEach(t => { t.alive = false; t.m.visible = false; }); sprites.forEach(s => { s.alive = false; s.sp.visible = false; }); debris.forEach(d => { d.alive = false; d.m.visible = false; }); F.shake = 0; };
  F.stats = () => ({ sprites: sprites.length, live: sprites.filter(s => s.alive).length, debris: debris.length, tracers: tracers.filter(t => t.alive).length });
  // 预热：让各类纹理都先上屏一次
  F.warm = () => { F.glint(0, -50, 0); F.splash(0, -50, 0, 1); F.hit(0, -50, 0); F.text(0, -50, 0, '100'); F.boom(0, -50, 0, 0.1); F.dust(0, -50, 0, 1); F.ring(0, -50, 0); F.muzzle(0, -50, 0); F.tracer(0, -50, 0, 1, -50, 0); F.debris(0, -50, 0, '#888', 1); };
  F.GEO = GEO;
  return F;
}
