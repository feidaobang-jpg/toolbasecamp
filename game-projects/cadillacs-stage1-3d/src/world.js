// 场景：第一关三个区域（楼顶 / 大楼内部 / 第 47 街）。按原作画面配色：楼顶淡紫色天空与沉在海里的高楼，
// 室内棕色壁纸、大理石柱、红地毯与金色骑士像，47 街的残破砖墙与铜绿色摩天楼。四周都有布景，Q/E 转到任何角度都不穿帮；
// 室内的外墙与天花板在镜头位于墙外时剖切（玩偶屋视图），户外挡住主角的建筑半透明。
import * as THREE from 'three';
import { fixedRng } from './core.js';
import { AREAS } from './level.js';
import { Parts, mtx, GEO, toonMat, meshFrom, drumGeo, pipesGeo, buildHuman, SPECS, bakeModel, buildPtero, capsule } from './models.js';
import { applyPose, HP, mod } from './anim.js';

// ---------- 程序化贴图 ----------
function mkTex(w, h, seed, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const r = fixedRng(seed);
  fn(g, w, h, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const rgb = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
function speckle(g, w, h, r, n, col, size) { g.fillStyle = col; for (let i = 0; i < n; i++) { const s = (size || 2) * (0.5 + r()); g.fillRect(r() * w, r() * h, s, s); } }
function crack(g, x, y, len, r, col) { g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); let a = r() * Math.PI * 2; for (let i = 0; i < 6; i++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y); } g.stroke(); }
const TEX = {};
function T(name) {
  if (TEX[name]) return TEX[name];
  let t;
  switch (name) {
    case 'roof': t = mkTex(256, 256, 11, (g, w, h, r) => {   // 楼顶：米色石板 + 裂缝 + 青苔
      g.fillStyle = '#d6c7a6'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 200 + r() * 26; g.fillStyle = rgb(v + 14, v + 4, v - 26); g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
      g.strokeStyle = '#a8977a'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      speckle(g, w, h, r, 600, 'rgba(120,100,70,0.25)', 2); speckle(g, w, h, r, 140, 'rgba(96,130,60,0.55)', 3);
      for (let i = 0; i < 7; i++) crack(g, r() * w, r() * h, 40 + r() * 50, r, 'rgba(90,76,58,0.7)');
    }); break;
    case 'brick': t = mkTex(256, 256, 12, (g, w, h, r) => {
      g.fillStyle = '#6e5c48'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 11; row++) for (let i = -1; i < 5; i++) {
        const x = i * 64 + (row % 2) * 32, y = row * 24, v = r();
        g.fillStyle = rgb(150 + v * 40, 112 + v * 30, 76 + v * 20); g.fillRect(x + 2, y + 2, 60, 20);
        g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(x + 2, y + 2, 60, 4);
      }
      speckle(g, w, h, r, 300, 'rgba(60,40,20,0.3)', 2);
    }); break;
    case 'stone': t = mkTex(256, 256, 13, (g, w, h, r) => {   // 大块石砌外墙
      g.fillStyle = '#8f8270'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 6; row++) for (let i = -1; i < 3; i++) { const x = i * 128 + (row % 2) * 64, y = row * 43, v = r(); g.fillStyle = rgb(178 + v * 30, 164 + v * 26, 138 + v * 20); g.fillRect(x + 3, y + 3, 122, 37); }
      speckle(g, w, h, r, 500, 'rgba(70,60,48,0.25)', 2); speckle(g, w, h, r, 90, 'rgba(90,120,60,0.4)', 3);
    }); break;
    case 'tower': t = mkTex(128, 256, 14, (g, w, h, r) => {   // 摩天楼窗格（顶点色染成淡紫 / 铜绿）
      g.fillStyle = '#f2f0f2'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 6; x++) { const d = r(); g.fillStyle = d < 0.12 ? '#54506a' : rgb(150 + d * 40, 150 + d * 40, 172 + d * 30); g.fillRect(6 + x * 20, 6 + y * 16, 12, 10); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < 6; x++) g.fillRect(4 + x * 20, 0, 2, h);
    }); break;
    case 'facade': t = mkTex(256, 256, 15, (g, w, h, r) => {   // 楼体外立面（石墙 + 窗）
      g.fillStyle = '#c9b894'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = '#5e5446'; g.fillRect(14 + x * 64, 12 + y * 64, 34, 44); g.fillStyle = '#8a8070'; g.fillRect(14 + x * 64, 12 + y * 64, 34, 4); g.fillStyle = '#e8dcc0'; g.fillRect(10 + x * 64, 58 + y * 64, 42, 4); }
      speckle(g, w, h, r, 400, 'rgba(90,76,58,0.25)', 2); speckle(g, w, h, r, 60, 'rgba(90,120,60,0.45)', 4);
    }); break;
    case 'wallpaper': t = mkTex(128, 128, 16, (g, w, h, r) => {   // 棕色菱格壁纸
      g.fillStyle = '#8c6c4a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6a4e34'; g.lineWidth = 3;
      for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i * 64 + 128, 0); g.lineTo(i * 64, 128); g.stroke(); }
      g.fillStyle = '#a8865e'; for (const [x, y] of [[32, 0], [96, 64], [32, 128], [0, 64], [128, 64]]) { g.beginPath(); g.ellipse(x, y, 7, 12, 0, 0, Math.PI * 2); g.fill(); }
      speckle(g, w, h, r, 200, 'rgba(50,30,15,0.18)', 2);
    }); break;
    case 'wood': t = mkTex(128, 128, 17, (g, w, h, r) => {
      g.fillStyle = '#4e3020'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) { g.fillStyle = rgb(86 + r() * 16, 54 + r() * 10, 34); g.fillRect(i * 32 + 2, 0, 28, h); }
      g.strokeStyle = 'rgba(40,22,12,0.5)'; for (let i = 0; i < 30; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, 40, x - 4, 80, x + 2, 128); g.stroke(); }
    }); break;
    case 'carpet': t = mkTex(256, 256, 18, (g, w, h, r) => {   // 红地毯（深红 + 暗纹）
      g.fillStyle = '#7c2b22'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6a2018'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.beginPath(); g.arc(16 + x * 32, 16 + y * 32, 9, 0, Math.PI * 2); g.fill(); }
      speckle(g, w, h, r, 1600, 'rgba(160,70,50,0.25)', 1.5); speckle(g, w, h, r, 900, 'rgba(40,10,6,0.25)', 1.5);
    }); break;
    case 'marble': t = mkTex(64, 256, 19, (g, w, h, r) => {
      g.fillStyle = '#b7b4aa'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) crack(g, r() * w, r() * h, 60 + r() * 80, r, 'rgba(60,58,54,0.75)');
      speckle(g, w, h, r, 200, 'rgba(120,118,110,0.4)', 2);
    }); break;
    case 'pave': t = mkTex(256, 256, 20, (g, w, h, r) => {   // 街道：裂开的灰石板 + 尘土
      g.fillStyle = '#b3a68c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const v = r() * 18; g.fillStyle = rgb(182 + v, 170 + v, 146 + v); g.fillRect(x * 85 + 2, y * 85 + 2, 81, 81); }
      g.strokeStyle = '#8a7e66'; g.lineWidth = 2; for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(i * 85, 0); g.lineTo(i * 85, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 85); g.lineTo(w, i * 85); g.stroke(); }
      for (let i = 0; i < 9; i++) crack(g, r() * w, r() * h, 50 + r() * 60, r, 'rgba(90,80,60,0.7)');
      speckle(g, w, h, r, 700, 'rgba(120,100,70,0.3)', 2); speckle(g, w, h, r, 120, 'rgba(100,130,60,0.5)', 3);
    }); break;
    case 'chain': t = mkTex(64, 64, 21, (g, w, h) => {   // 铁丝网（透明）
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,74,80,1)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
    }); break;
    case 'web': t = mkTex(128, 128, 22, (g, w, h, r) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(235,235,230,0.85)'; g.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) { const a = i / 6 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 128, Math.sin(a) * 128); g.stroke(); }
      for (let k = 1; k < 7; k++) { g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 6 * Math.PI / 2, rr = k * 18 + r() * 4; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    }); break;
    case 'water': t = mkTex(256, 256, 23, (g, w, h, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(150,160,200,0.45)'; g.lineWidth = 2;
      for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, l = 10 + r() * 26; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
    }); break;
    case 'plaster': t = mkTex(128, 128, 24, (g, w, h, r) => {
      g.fillStyle = '#c8bb9c'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 500, 'rgba(110,96,72,0.25)', 2); speckle(g, w, h, r, 80, 'rgba(90,120,60,0.5)', 4);
      for (let i = 0; i < 4; i++) crack(g, r() * w, r() * h, 40, r, 'rgba(90,76,58,0.6)');
    }); break;
  }
  TEX[name] = t;
  return t;
}
function texMat(name, rep, opts) {
  const t = T(name).clone(); t.needsUpdate = true; t.repeat.set(rep ? rep[0] : 1, rep ? rep[1] : 1);
  return new THREE.MeshLambertMaterial(Object.assign({ map: t }, opts || {}));
}
// 按真实尺寸设置 UV 的盒子（贴图每 unit 米重复一次），便于合并后不拉伸
function texBox(w, h, d, unit) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, u = unit || 2;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / u, uv.getY(k) * dims[f][1] / u); }
  return g;
}
function skyTex(top, mid, bot) {
  return mkTex(16, 256, 31, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.48, mid); gr.addColorStop(0.52, bot); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}

// ---------- 远景：沉在海里的城市 ----------
function skyline(group, opts) {
  const r = fixedRng(opts.seed);
  const p = new Parts();
  const cx = opts.cx, cz = opts.cz || 0, base = opts.waterY;
  const pal = opts.palette;
  for (let i = 0; i < opts.count; i++) {
    const a = r() * Math.PI * 2;
    const dist = opts.rMin + r() * (opts.rMax - opts.rMin);
    let x = cx + Math.cos(a) * dist, z = cz + Math.sin(a) * dist;
    if (opts.keepOut && opts.keepOut(x, z)) continue;
    const w = 8 + r() * 18, d = 8 + r() * 18, hgt = opts.hMin + r() * (opts.hMax - opts.hMin);
    const col = pal[Math.floor(r() * pal.length)];
    const lean = r() < 0.25 ? (r() - 0.5) * 0.25 : 0;
    p.add(texBox(w, hgt, d, 6), col, mtx(x, base + hgt / 2 - 4, z, lean, r() * 0.5, lean * 0.5));
    if (r() < 0.55) { const h2 = hgt * (0.15 + r() * 0.2); p.add(texBox(w * 0.65, h2, d * 0.65, 6), col, mtx(x, base + hgt - 4 + h2 / 2, z, lean, 0, lean * 0.5)); }
    if (r() < 0.3) p.add(GEO.cone, opts.spire || col, mtx(x, base + hgt * 1.15 + 6, z, lean, 0, 0, w * 0.18, hgt * 0.35, d * 0.18));
    if (r() < 0.18) p.add(GEO.hemi, opts.dome || col, mtx(x, base + hgt - 4, z, 0, 0, 0, w * 0.5, w * 0.45, d * 0.5));
  }
  const mat = new THREE.MeshLambertMaterial({ map: T('tower'), vertexColors: true, fog: true });
  const m = new THREE.Mesh(p.build(), mat);
  group.add(m);
  return m;
}
function seaPlane(group, y, color, size) {
  const t = T('water').clone(); t.needsUpdate = true; t.repeat.set(size / 24, size / 24);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color, map: t }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = false;
  group.add(m);
  return m;
}
function skyDome(group, top, mid, bot) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex(top, mid, bot), side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; group.add(m);
  return m;
}

// ---------- 世界 ----------
export function buildWorld(scene) {
  const W = { areas: [], active: -1, doors: [], cutters: [], fades: [], pteros: [], waters: [] };
  const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.4);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);
  W.sun = sun; W.hemi = hemi;
  scene.fog = new THREE.Fog(0xccccdd, 60, 320);
  for (let i = 0; i < AREAS.length; i++) {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const A = { def: AREAS[i], group: g, cutters: [], fades: [], camBoxes: [], light: null };
    W.areas.push(A);
    BUILDERS[AREAS[i].id](A, W);
  }
  W.setArea = (i) => {
    W.active = i;
    W.areas.forEach((A, k) => { A.group.visible = k === i; });
    const L = W.areas[i].light;
    hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemi;
    sun.color.set(L.sun); sun.intensity = L.sunI; W.sunDir = new THREE.Vector3().fromArray(L.dir).normalize();
    scene.fog.color.set(L.fog); scene.fog.near = L.fogNear; scene.fog.far = L.fogFar;
    scene.background = new THREE.Color(L.bg || L.fog);
  };
  W.followLight = (x, z) => {
    const d = W.sunDir || new THREE.Vector3(0.4, 1, 0.6);
    sun.target.position.set(x, 0, z); sun.position.set(x + d.x * 25, d.y * 25, z + d.z * 25);
  };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  W.update = (t, dt, cam, focus) => {
    const A = W.areas[W.active];
    if (!A) return;
    // 剖切：镜头在墙外侧时隐藏该墙（玩偶屋视图）
    for (const c of A.cutters) {
      const d = (cam.position.x - c.p.x) * c.n.x + (cam.position.z - c.p.z) * c.n.z;
      const out = c.ceiling ? cam.position.y > c.p.y - 0.2 : d < 0.05;
      c.mesh.visible = !out;
      // 镜头还在墙前、但贴着这面墙（near 米内、且在墙的横向范围里）时整面墙渐隐，避免侧面大片砖墙贴满画面；转到墙后再整层剖切
      if (c.near && !out) {
        const b = c.box, P = cam.position, by = P.x > b.min.x - 1 && P.x < b.max.x + 1 && P.z > b.min.z - 1 && P.z < b.max.z + 1;
        const k = by ? Math.min(1, (d - 0.05) / c.near) : 1, op = 0.2 + 0.8 * k * k;
        c.mesh.userData.nearOp = op;
        if (c.mesh.userData.fade) continue;   // 同时有视线淡化的（楼体立面）在下面合并
        const m = c.mesh.material, tr = op < 0.99;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = op; m.depthWrite = op > 0.6;
      }
    }
    // 户外遮挡：镜头到主角的视线穿过建筑包围盒时半透明
    if (focus) for (const f of A.fades) {
      tmpA.copy(cam.position); tmpB.set(focus.x, focus.y + 1.0, focus.z);
      const hit = segBox(tmpA, tmpB, f.box);
      f.k += ((hit ? 0.22 : 1) - f.k) * Math.min(1, dt * 8);
      // transparent 切换必须 needsUpdate：opaque 材质编译时带 OPAQUE 宏（片元 alpha 固定为 1），只改标志不会变透明
      const op = Math.min(f.k, f.mesh.userData.nearOp === undefined ? 1 : f.mesh.userData.nearOp);
      for (const m of f.mats) { const tr = op < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = op > 0.6; }
    }
    for (const w of A.waters || []) w.material.map.offset.set(t * 0.004, t * 0.002);
    for (const p of A.pteros || []) {
      const a = t * p.speed + p.phase;
      p.g.position.set(p.cx + Math.cos(a) * p.r, p.y + Math.sin(a * 2) * 2, p.cz + Math.sin(a) * p.r * 0.5);
      p.g.rotation.y = Math.atan2(-Math.sin(a) * p.r, -Math.cos(a) * p.r * 0.5) + Math.PI;
      const flap = Math.sin(t * 5 + p.phase) * 0.55;
      p.g.userData.wings[0].rotation.z = flap; p.g.userData.wings[1].rotation.z = -flap;
    }
    for (const d of A.doors || []) {
      const target = d.open ? 1 : 0;
      d.k += (target - d.k) * Math.min(1, dt * 5);
      d.l.rotation.y = d.k * 1.45; d.r.rotation.y = -d.k * 1.45;
    }
    if (A.anim) A.anim(t, dt);
  };
  W.area = () => W.areas[W.active];
  // 运行中会切换透明的材质（户外遮挡淡化、墙面贴近渐隐）：main.js 开局时预编译它们的透明着色器变体
  W.fadeMats = () => { const s = new Set(); for (const A of W.areas) { for (const f of A.fades) f.mats.forEach(m => s.add(m)); for (const c of A.cutters) if (c.near) s.add(c.mesh.material); } return Array.from(s); };
  return W;
}
function segBox(a, b, box) {
  // 线段与轴对齐包围盒是否相交（slab 法）
  let t0 = 0, t1 = 1;
  for (const ax of ['x', 'y', 'z']) {
    const d = b[ax] - a[ax];
    if (Math.abs(d) < 1e-6) { if (a[ax] < box.min[ax] || a[ax] > box.max[ax]) return false; continue; }
    let u0 = (box.min[ax] - a[ax]) / d, u1 = (box.max[ax] - a[ax]) / d;
    if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}
function addFade(A, mesh, box) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  A.fades.push({ mesh, box, mats, k: 1 }); mesh.userData.fade = true;
}
function addCut(A, mesh, nx, nz, px, pz, ceiling, py, near) {
  A.cutters.push({ mesh, n: new THREE.Vector3(nx, 0, nz), p: new THREE.Vector3(px, py || 0, pz), ceiling: !!ceiling, near: near || 0, box: near ? new THREE.Box3().setFromObject(mesh) : null });
}
// 镜头避让用的实体包围盒：取 Parts 里每个零件变换后的轴对齐包围盒（camera.js 的 avoid 使用）
function addSolids(A, parts) {
  for (const it of parts.list) {
    if (!it.geo.boundingBox) it.geo.computeBoundingBox();
    A.camBoxes.push(it.geo.boundingBox.clone().applyMatrix4(it.m));
  }
}

// 静态雕像（金色骑士）：烘焙为单网格
let statueGeo = null;
export function statueMesh() {
  if (!statueGeo) {
    const h = buildHuman(SPECS.statue);
    applyPose(h, mod(HP.stand, { rS: [-0.6, 0, -0.25], rE: [-1.2, 0, 0], lS: [-0.2, 0, 0.15], lE: [-0.6, 0, 0] }));
    // 长矛与盾
    const p = new Parts();
    p.add(GEO.cyl, '#c8a03a', mtx(0, 0, 0, 0, 0, 0, 0.025, 2.6, 0.025));
    p.add(GEO.cone, '#e8c860', mtx(0, 1.42, 0, 0, 0, 0, 0.07, 0.3, 0.03));
    const spear = new THREE.Mesh(p.build(), toonMat()); spear.position.set(0, 0.6, 0.06);
    h.bones.grip.add(spear);
    const sh = new Parts(); sh.add(GEO.cyl, '#c9a238', mtx(0, 0, 0, Math.PI / 2, 0, 0, 0.28, 0.05, 0.36)); sh.add(GEO.sph, '#e6c45a', mtx(0, 0, 0.03, 0, 0, 0, 0.08, 0.08, 0.05));
    const shield = new THREE.Mesh(sh.build(), toonMat()); shield.position.set(0.08, -0.1, 0.12); h.bones.lgrip.add(shield);
    const ped = new Parts(); ped.add(texBox(0.9, 0.3, 0.8, 1), '#6a5a48', mtx(0, -0.15, 0));
    const pedM = new THREE.Mesh(ped.build(), toonMat()); h.root.add(pedM);
    h.root.position.y = 0.3;
    const holder = new THREE.Group(); holder.add(h.root);
    statueGeo = bakeModel(holder);
  }
  return meshFrom(statueGeo, {});
}

// ---------- 区域构建 ----------
const BUILDERS = {
  // 楼顶：EASTCOAST 2513，海上城市的高楼楼顶
  roof(A) {
    const g = A.group;
    A.light = { sky: '#e6dcff', ground: '#8a7a68', hemi: 1.25, sun: '#fff1dc', sunI: 1.9, dir: [-0.35, 1, 0.75], fog: '#cfc4ea', fogNear: 70, fogFar: 520, bg: '#cfc4ea' };
    skyDome(g, '#8f7fd0', '#e6dcf4', '#b8acd8');
    A.waters = [seaPlane(g, -34, '#8e8cc8', 1800)];
    skyline(g, { seed: 101, cx: 22, cz: 0, waterY: -34, count: 80, rMin: 120, rMax: 420, hMin: 22, hMax: 78, palette: ['#ece8f6', '#d8d2ee', '#c8c0e6', '#f4f0fa', '#bdb6dc'], dome: '#c9c2ea', spire: '#d4cff0', keepOut: (x, z) => Math.abs(z) < 90 && x > -60 && x < 100 });
    // 楼顶石板与楼体
    const roofMat = texMat('roof', [1, 1]);
    const slab = new THREE.Mesh(texBox(64, 0.6, 7.8, 2.2), roofMat); slab.position.set(21, -0.3, 0.1); slab.receiveShadow = true; g.add(slab);
    const body = new THREE.Mesh(texBox(64, 36, 7.6, 8), texMat('facade')); body.position.set(21, -18.6, 0.1); g.add(body);
    const stoneMat = new THREE.MeshLambertMaterial({ map: T('stone'), vertexColors: true });
    const p = new Parts();
    p.add(texBox(64, 0.34, 0.4, 2), '#e2d6bc', mtx(21, 0.17, 3.85));          // 前沿矮墙
    p.add(texBox(64, 0.9, 0.34, 2), '#d6caae', mtx(21, 0.45, -3.62));         // 后护墙
    p.add(texBox(64.4, 0.1, 0.5, 2), '#efe4ca', mtx(21, 0.95, -3.62));
    for (let x = -10; x <= 52; x += 4) p.add(texBox(0.5, 1.1, 0.5, 1), '#cbbf9f', mtx(x, 0.55, -3.62));
    for (let x = -10; x < 52; x += 7.3) p.add(texBox(1.4, 0.7, 1.0, 1), '#9a9488', mtx(x + 3, 0.35, -3.0));    // 通风口
    p.add(texBox(0.12, 3.5, 0.12, 1), '#8a8a90', mtx(8, 1.75, -3.3)); p.add(texBox(1.4, 0.06, 0.06, 1), '#8a8a90', mtx(8, 3.1, -3.3));   // 天线
    const deco = new THREE.Mesh(p.build(), stoneMat); deco.receiveShadow = true; deco.castShadow = true; g.add(deco);
    // 尽头的楼梯间小屋（门在西墙）+ 水塔
    const hutMat = new THREE.MeshLambertMaterial({ map: T('plaster'), vertexColors: true });
    const hp = new Parts();
    hp.add(texBox(0.4, 3.8, 3.2, 2), '#d8ccb0', mtx(45.2, 1.9, -2.2)); hp.add(texBox(0.4, 3.8, 3.4, 2), '#d8ccb0', mtx(45.2, 1.9, 2.3));
    hp.add(texBox(0.4, 1.2, 1.4, 2), '#d8ccb0', mtx(45.2, 3.2, 0.0));
    hp.add(texBox(7, 3.8, 0.4, 2), '#d0c4a8', mtx(48.5, 1.9, -3.8)); hp.add(texBox(7, 3.8, 0.4, 2), '#d0c4a8', mtx(48.5, 1.9, 4.0)); hp.add(texBox(0.4, 3.8, 8, 2), '#d0c4a8', mtx(52, 1.9, 0.1));
    hp.add(texBox(7.6, 0.3, 8.4, 2), '#bfb294', mtx(48.6, 3.95, 0.1));
    hp.add(texBox(0.5, 0.2, 1.8, 1), '#9a8e74', mtx(45.0, 2.55, 0));   // 门楣
    const hut = new THREE.Mesh(hp.build(), hutMat); hut.castShadow = true; hut.receiveShadow = true; g.add(hut);
    addFade(A, hut, new THREE.Box3(new THREE.Vector3(45, 0, -4), new THREE.Vector3(52.3, 4.1, 4.2)));
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 1.4), new THREE.MeshBasicMaterial({ color: 0x120c08 })); doorway.position.set(45.42, 1.2, 0); g.add(doorway);
    const door = meshFrom(new Parts().add(texBox(0.12, 2.4, 1.36, 1), '#6a4a2c', mtx(0, 1.2, 0.68)).add(GEO.box, '#3a2a1a', mtx(-0.07, 1.2, 1.1, 0, 0, 0, 0.04, 0.12, 0.12)).build(), { mat: toonMat() });
    door.position.set(44.98, 0, -0.68); g.add(door); A.hutDoor = door;
    const tank = new Parts();
    tank.add(GEO.cyl, '#8c7a62', mtx(49, 6.0, -1.0, 0, 0, 0, 1.3, 2.2, 1.3)); tank.add(GEO.cone, '#6a5a48', mtx(49, 7.6, -1.0, 0, 0, 0, 1.45, 1.0, 1.45));
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) tank.add(GEO.cyl, '#5a4a3a', mtx(49 + dx, 4.4, -1.0 + dz, 0, 0, 0, 0.08, 1.0, 0.08));
    const tankM = meshFrom(tank.build(), {}); g.add(tankM);
    // 翼龙（原作楼顶远景飞过）
    A.pteros = [];
    for (let i = 0; i < 3; i++) { const pg = buildPtero(); pg.scale.setScalar(2.2); g.add(pg); A.pteros.push({ g: pg, cx: 10 + i * 18, cz: -60 - i * 15, r: 40 + i * 10, y: 14 + i * 6, speed: 0.07 + i * 0.02, phase: i * 2.1 }); }
  },

  // 大楼内部：壁纸、大理石柱、双开门、金色骑士像、楼梯与尽头的窗户
  hall(A) {
    const g = A.group;
    A.light = { sky: '#ffe2c0', ground: '#3a2418', hemi: 1.1, sun: '#ffd7a0', sunI: 1.5, dir: [-0.3, 1, 0.8], fog: '#1c120c', fogNear: 40, fogFar: 140, bg: '#1c120c' };
    const X0 = -2.2, X1 = 63, ZB = -3.0, ZF = 3.5, CEIL = 6.2;
    // 地面：红地毯 + 两侧木地板
    const floor = new THREE.Mesh(texBox(X1 - X0, 0.2, ZF - ZB, 3), texMat('carpet')); floor.position.set((X0 + X1) / 2, -0.1, (ZB + ZF) / 2); floor.receiveShadow = true; g.add(floor);
    const woodMat = new THREE.MeshLambertMaterial({ map: T('wood'), vertexColors: true });
    const fp = new Parts();
    fp.add(texBox(X1 - X0, 0.04, 0.5, 1), '#a07048', mtx((X0 + X1) / 2, 0.01, ZB + 0.25)); fp.add(texBox(X1 - X0, 0.04, 0.45, 1), '#a07048', mtx((X0 + X1) / 2, 0.01, ZF - 0.22));
    fp.add(texBox(X1 - X0, 0.03, 0.08, 1), '#d8a848', mtx((X0 + X1) / 2, 0.025, ZB + 0.55)); fp.add(texBox(X1 - X0, 0.03, 0.08, 1), '#d8a848', mtx((X0 + X1) / 2, 0.025, ZF - 0.5));
    // 护墙板
    fp.add(texBox(X1 - X0, 1.15, 0.12, 1), '#c8a080', mtx((X0 + X1) / 2, 0.575, ZB + 0.1));
    fp.add(texBox(X1 - X0, 0.08, 0.2, 1), '#e0b880', mtx((X0 + X1) / 2, 1.18, ZB + 0.12));
    const fm = new THREE.Mesh(fp.build(), woodMat); fm.receiveShadow = true; g.add(fm);
    // 墙壳：后墙常显；前墙 / 两端 / 天花板按镜头位置剖切
    const wpMat = texMat('wallpaper', [1, 1]);
    const base = new THREE.Mesh(texBox(X1 - X0 + 2, 6, ZF - ZB + 0.6, 2), new THREE.MeshLambertMaterial({ color: '#2a1a12' })); base.position.set((X0 + X1) / 2, -3.2, (ZB + ZF) / 2); g.add(base);
    const lip = new THREE.Mesh(texBox(X1 - X0 + 2, 0.5, 0.2, 1), new THREE.MeshLambertMaterial({ map: T('wood'), color: '#9a7050' })); lip.position.set((X0 + X1) / 2, -0.25, ZF + 0.3); g.add(lip);
    // 后墙连同贴在墙上的门框、门洞、壁灯、蜘蛛网一起剖切（镜头转到墙后时不留下悬空的门框）
    const bg = new THREE.Group(); g.add(bg);
    const back = new THREE.Mesh(texBox(X1 - X0, 8, 0.3, 0.9), wpMat); back.position.set((X0 + X1) / 2, 4, ZB - 0.15); back.receiveShadow = true; bg.add(back);
    addCut(A, bg, 0, 1, 0, ZB - 0.3);
    const front = new THREE.Mesh(texBox(X1 - X0, 8, 0.3, 0.9), wpMat); front.position.set((X0 + X1) / 2, 4, ZF + 0.15); g.add(front);
    addCut(A, front, 0, -1, 0, ZF + 0.3);
    const start = new THREE.Mesh(texBox(0.3, 8, ZF - ZB, 0.9), wpMat); start.position.set(X0 - 0.15, 4, (ZB + ZF) / 2); g.add(start);
    addCut(A, start, 1, 0, X0 - 0.3, 0);
    // 尽头墙中间开窗（玩家从这里跳到 47 街）
    const endP = new Parts();
    const wz0 = -1.5, wz1 = 1.5, wy0 = 0.7, wy1 = 3.8;
    endP.add(texBox(0.3, 8, wz0 - ZB, 1.6), '#ffffff', mtx(X1 + 0.15, 4, (ZB + wz0) / 2));
    endP.add(texBox(0.3, 8, ZF - wz1, 1.6), '#ffffff', mtx(X1 + 0.15, 4, (ZF + wz1) / 2));
    endP.add(texBox(0.3, wy0, wz1 - wz0, 1.6), '#ffffff', mtx(X1 + 0.15, wy0 / 2, 0));
    endP.add(texBox(0.3, 8 - wy1, wz1 - wz0, 1.6), '#ffffff', mtx(X1 + 0.15, (8 + wy1) / 2, 0));
    const endW = new THREE.Mesh(endP.build(), new THREE.MeshLambertMaterial({ map: T('wallpaper'), vertexColors: true })); g.add(endW);
    addCut(A, endW, -1, 0, X1 + 0.3, 0);
    const ceil = new THREE.Mesh(texBox(X1 - X0, 0.3, ZF - ZB, 1.2), new THREE.MeshLambertMaterial({ map: T('wood'), color: '#c8a888', emissive: '#2a1a10' })); ceil.position.set((X0 + X1) / 2, CEIL + 0.15, (ZB + ZF) / 2); g.add(ceil);
    addCut(A, ceil, 0, 0, 0, 0, true, CEIL);
    // 窗：木框 + 玻璃（可击碎）
    const win = new THREE.Group(); win.position.set(X1, 0, 0); g.add(win);
    const frame = new Parts();
    for (const z of [wz0, 0, wz1]) frame.add(GEO.box, '#e8e0d0', mtx(0.02, (wy0 + wy1) / 2, z, 0, 0, 0, 0.12, wy1 - wy0, 0.1));
    for (const y of [wy0, (wy0 + wy1) / 2, wy1]) frame.add(GEO.box, '#e8e0d0', mtx(0.02, y, 0, 0, 0, 0, 0.12, 0.1, wz1 - wz0));
    const frameM = meshFrom(frame.build(), { mat: toonMat(), thin: true }); win.add(frameM);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, wy1 - wy0, wz1 - wz0), new THREE.MeshLambertMaterial({ color: '#bfe0f0', transparent: true, opacity: 0.45 }));
    glass.position.set(0.02, (wy0 + wy1) / 2, 0); win.add(glass);
    A.window = { group: win, frame: frameM, glass };
    // 窗外：远处城市
    const outside = new THREE.Group(); g.add(outside);
    const back2 = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), new THREE.MeshBasicMaterial({ map: skyTex('#8fa8c8', '#dfe6ee', '#9fb0c4'), fog: false }));
    back2.position.set(260, 30, 0); back2.rotation.y = -Math.PI / 2; outside.add(back2);
    const sea2 = seaPlane(outside, -10, '#7f9ab0', 300); sea2.position.x = 200;
    skyline(outside, { seed: 202, cx: 130, cz: 0, waterY: -10, count: 30, rMin: 30, rMax: 140, hMin: 20, hMax: 80, palette: ['#c4d8c4', '#a8c8b0', '#d8e0d4'], keepOut: (x) => x < 75 });
    // 柱子、壁灯、蜘蛛网
    const marbleMat = new THREE.MeshLambertMaterial({ map: T('marble'), vertexColors: true });
    const pp = new Parts();
    const PX = [2.4, 13.4, 26.6, 39.6, 49.2, 58.6];
    for (const x of PX) {
      pp.add(GEO.cyl, '#d8d4ca', mtx(x, 3.0, ZB + 0.3, 0, 0, 0, 0.3, 5.0, 0.3));
      pp.add(texBox(0.85, 0.55, 0.75, 1), '#bdb8ae', mtx(x, 0.28, ZB + 0.32));
      pp.add(texBox(0.95, 0.5, 0.8, 1), '#cfcac0', mtx(x, 5.6, ZB + 0.32));
      pp.add(GEO.cyl, '#a8a49a', mtx(x, 5.25, ZB + 0.3, 0, 0, 0, 0.38, 0.22, 0.38));
    }
    const pillars = new THREE.Mesh(pp.build(), marbleMat); pillars.castShadow = true; pillars.receiveShadow = true; g.add(pillars);
    const dp = new Parts();
    for (let i = 0; i < PX.length - 1; i++) {
      const x = (PX[i] + PX[i + 1]) / 2;
      if ([8, 20, 34].some(d => Math.abs(d - x) < 2)) continue;
      dp.add(GEO.hemi, '#d8c8a0', mtx(x, 3.3, ZB + 0.05, Math.PI / 2, 0, 0, 0.32, 0.18, 0.42));
      dp.add(GEO.box, '#7a5a38', mtx(x, 3.3, ZB + 0.02, 0, 0, 0, 0.5, 0.7, 0.05));
    }
    const decoM = new THREE.Mesh(dp.build(), toonMat()); bg.add(decoM);
    const webMat = new THREE.MeshBasicMaterial({ map: T('web'), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, flip] of [[13.4, 1], [26.6, -1], [39.6, 1], [49.2, -1], [2.4, 1]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), webMat); w.position.set(x + flip * 1.1, 4.6, ZB + 0.06); w.scale.x = flip; w.rotation.z = flip > 0 ? Math.PI / 2 : 0; bg.add(w);
    }
    // 双开门（敌人从门里出来）
    A.doors = [];
    for (const dd of A.def.doors) {
      const fr = new Parts();
      fr.add(GEO.box, '#5a3a22', mtx(dd.x - 1.15, 1.6, ZB + 0.12, 0, 0, 0, 0.18, 3.2, 0.25)); fr.add(GEO.box, '#5a3a22', mtx(dd.x + 1.15, 1.6, ZB + 0.12, 0, 0, 0, 0.18, 3.2, 0.25));
      fr.add(GEO.box, '#5a3a22', mtx(dd.x, 3.25, ZB + 0.12, 0, 0, 0, 2.5, 0.25, 0.25)); fr.add(GEO.box, '#e0b060', mtx(dd.x, 3.45, ZB + 0.1, 0, 0, 0, 1.6, 0.14, 0.18));
      bg.add(meshFrom(fr.build(), { mat: toonMat(), thin: true }));
      const dark = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x0d0805 })); dark.position.set(dd.x, 1.55, ZB + 0.02); bg.add(dark);
      const panel = new Parts().add(texBox(1.08, 3.0, 0.08, 1), '#7a5232', mtx(0.54, 1.5, 0)).add(GEO.box, '#5a3a22', mtx(0.54, 2.2, 0.05, 0, 0, 0, 0.8, 0.9, 0.03)).add(GEO.box, '#5a3a22', mtx(0.54, 0.9, 0.05, 0, 0, 0, 0.8, 0.9, 0.03)).add(GEO.sph, '#e0b060', mtx(0.95, 1.4, 0.07, 0, 0, 0, 0.04, 0.04, 0.04)).build();
      const l = new THREE.Group(), r = new THREE.Group();
      l.position.set(dd.x - 1.1, 0, ZB + 0.1); r.position.set(dd.x + 1.1, 0, ZB + 0.1);
      const lm = meshFrom(panel, { mat: toonMat(), thin: true }); l.add(lm);
      const rm = meshFrom(panel, { mat: toonMat(), thin: true }); rm.scale.x = -1; r.add(rm);
      bg.add(l, r);
      A.doors.push({ x: dd.x, l, r, k: 0, open: false });
    }
    // 楼梯（尽头靠后墙，原作里骑士像站在楼梯旁）
    const sp = new Parts();
    for (let i = 0; i < 12; i++) { const x = 49.8 + i * 0.7, y = (i + 1) * 0.32; sp.add(texBox(0.72, y, 0.9, 1), '#8a5e3c', mtx(x, y / 2, ZB + 0.55)); sp.add(texBox(0.74, 0.05, 0.95, 1), '#a87650', mtx(x, y, ZB + 0.55)); }
    for (let i = 0; i < 13; i++) { const x = 49.6 + i * 0.7, y = (i + 1) * 0.32; sp.add(GEO.cyl, '#d8c8a8', mtx(x, y + 0.5, ZB + 1.0, 0, 0, 0, 0.035, 1.0, 0.035)); }
    sp.add(GEO.box, '#6a4428', mtx(54.0, 2.95, ZB + 1.0, 0, 0, Math.atan2(0.32, 0.7), 9.8, 0.1, 0.12));
    sp.add(GEO.cyl, '#6a4428', mtx(49.5, 0.7, ZB + 1.0, 0, 0, 0, 0.08, 1.4, 0.08)); sp.add(GEO.sph, '#d8b060', mtx(49.5, 1.45, ZB + 1.0, 0, 0, 0, 0.1, 0.1, 0.1));
    const stairs = new THREE.Mesh(sp.build(), new THREE.MeshLambertMaterial({ map: T('wood'), vertexColors: true })); stairs.castShadow = true; stairs.receiveShadow = true; g.add(stairs);
  },

  // 第 47 街：石砌楼角（木门）+ 残破砖墙 + 铜绿色摩天楼；尽头 Boss 区有倒塌的铁丝网
  street(A) {
    const g = A.group;
    A.light = { sky: '#e2ecf6', ground: '#7a705c', hemi: 1.3, sun: '#fff4e2', sunI: 1.9, dir: [-0.3, 1, 0.8], fog: '#cdd8e0', fogNear: 70, fogFar: 520, bg: '#cdd8e0' };
    skyDome(g, '#8ea6c8', '#e4eaee', '#a6b8c8');
    A.waters = [seaPlane(g, -1.2, '#7f9ab0', 1600)];
    skyline(g, { seed: 303, cx: 33, cz: 0, waterY: -1.2, count: 64, rMin: 55, rMax: 300, hMin: 28, hMax: 120, palette: ['#cfe0cc', '#b8d0bc', '#e0e6dc', '#a6c4ae', '#d8d4cc'], dome: '#7fb89a', spire: '#9cc8a8', keepOut: (x, z) => Math.abs(z) < 34 && x > -26 && x < 92 });
    // 地面（向四周延伸成废墟空地）
    const ground = new THREE.Mesh(texBox(130, 0.4, 70, 2.8), texMat('pave')); ground.position.set(33, -0.2, 0); ground.receiveShadow = true; g.add(ground);
    const brickMat = new THREE.MeshLambertMaterial({ map: T('brick'), vertexColors: true });
    const r = fixedRng(404);
    // 后侧残墙：锯齿状墙头。单独成网格，镜头转到墙后时整层剖切（贴着走道的墙，靠拉近镜头躲不开）
    const wp = new Parts();
    let x = 12.2;
    while (x < 70) {
      const w = 1.2 + r() * 1.6, h = x < 14 ? 2.6 : 1.4 + r() * 2.8 * (x > 44 && x < 64 ? 0.55 : 1);
      wp.add(texBox(w, h, 0.5, 1.6), '#ffffff', mtx(x + w / 2, h / 2, -3.35));
      if (r() < 0.4) wp.add(texBox(w * 0.6, 0.3, 0.5, 1.6), '#ffffff', mtx(x + w * 0.3, h + 0.15, -3.35));
      x += w;
    }
    const wall = new THREE.Mesh(wp.build(), brickMat.clone()); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
    addCut(A, wall, 0, 1, 0, -3.1, false, 0, 0.7);   // 0.7：主角站最里排（墙前 0.8 米）时正视 / 第一人称不受影响
    const bp = new Parts();
    // 墙后的倒塌砖堆与第二道断墙
    for (let i = 0; i < 26; i++) { const xx = 8 + r() * 66, zz = -6 - r() * 16, w = 2 + r() * 5, h = 1 + r() * 5; bp.add(texBox(w, h, 0.6 + r() * 2, 1.6), '#f0e8e0', mtx(xx, h / 2 - 0.2, zz, 0, r() * 0.6 - 0.3, 0)); }
    // 前侧：低矮碎砖与路缘（不挡侧视镜头）
    for (let i = 0; i < 22; i++) { const xx = -4 + r() * 76, w = 0.5 + r() * 1.4; bp.add(texBox(w, 0.2 + r() * 0.35, 0.4 + r() * 0.6, 1.6), '#e8dcd0', mtx(xx, 0.12, 3.5 + r() * 1.8, 0, r() * 1.5, 0)); }
    bp.add(texBox(78, 0.25, 0.35, 1.6), '#d8d0c4', mtx(33, 0.12, 3.25));
    // 镜头身后的远处废墟（转视角时可见）
    for (let i = 0; i < 18; i++) { const xx = -10 + r() * 90, zz = 18 + r() * 14, w = 3 + r() * 6, h = 2 + r() * 7; bp.add(texBox(w, h, 1 + r() * 2, 1.6), '#efe6dc', mtx(xx, h / 2 - 0.2, zz, 0, r() * 0.8, 0)); }
    // 尽头：倒塌的砖堆挡住去路
    bp.add(texBox(3, 3.2, 9, 1.6), '#e8dcd0', mtx(68.4, 1.4, 0, 0, 0, 0.12)); bp.add(texBox(2.4, 1.8, 6, 1.6), '#f0e4d8', mtx(66.6, 0.6, 1.5, 0, 0.3, -0.2));
    const bricks = new THREE.Mesh(bp.build(), brickMat); bricks.castShadow = true; bricks.receiveShadow = true; g.add(bricks);
    addSolids(A, bp);
    // 藤蔓
    const vp = new Parts();
    for (let i = 0; i < 26; i++) { const xx = 12 + r() * 54; vp.add(GEO.sphLo, i % 2 ? '#4f8a3a' : '#6aa048', mtx(xx, 0.4 + r() * 1.8, -3.05, 0, 0, 0, 0.18 + r() * 0.25, 0.3 + r() * 0.6, 0.08)); }
    for (let i = 0; i < 18; i++) { const xx = 10 + r() * 56; vp.add(GEO.cone, '#7aa04a', mtx(xx, 0.15, -2.95 + r() * 0.3, 0, 0, (r() - 0.5) * 0.5, 0.05, 0.35 + r() * 0.3, 0.05)); }
    const vines = new THREE.Mesh(vp.build(), toonMat()); g.add(vines);
    addCut(A, vines, 0, 1, 0, -3.1, false, 0, 0.7);   // 藤蔓贴在后墙上，随墙一起剖切
    // 起点的石砌楼角：墙面、拱门（黑埃尔默破门而出）、侧墙
    const stoneMat = new THREE.MeshLambertMaterial({ map: T('stone'), vertexColors: true });
    const fp = new Parts();
    fp.add(texBox(5.0, 10, 1.0, 2.4), '#ffffff', mtx(1.5, 5, -3.7)); fp.add(texBox(5.9, 10, 1.0, 2.4), '#ffffff', mtx(9.5, 5, -3.7));
    fp.add(texBox(2.6, 6.6, 1.0, 2.4), '#ffffff', mtx(5.3, 6.7, -3.7));
    fp.add(texBox(16.6, 0.6, 1.4, 2), '#e6dcc8', mtx(4.0, 10.1, -3.6)); fp.add(texBox(16.6, 0.4, 1.3, 2), '#d8ccb4', mtx(4.0, 3.9, -3.5));
    for (let i = 0; i < 4; i++) fp.add(texBox(0.6, 10, 0.3, 1.5), '#e0d4bc', mtx(-0.6 + i * 3.6 + (i > 1 ? 2.6 : 0), 5, -3.15));
    for (const wx of [1.4, 10.0]) { fp.add(GEO.box, '#2a241c', mtx(wx, 6.2, -3.18, 0, 0, 0, 1.4, 2.0, 0.08)); fp.add(GEO.box, '#e6dcc8', mtx(wx, 5.15, -3.12, 0, 0, 0, 1.7, 0.16, 0.2)); }
    const facade = new THREE.Mesh(fp.build(), stoneMat); facade.castShadow = true; facade.receiveShadow = true; g.add(facade);
    addFade(A, facade, new THREE.Box3(new THREE.Vector3(-1.2, 0, -4.3), new THREE.Vector3(12.5, 10.5, -3.0)));
    addCut(A, facade, 0, 1, 0, -3.0, false, 0, 0.6);   // 镜头转到楼体立面后面（楼里）时剖切；0.6：主角站最里排（立面前 0.7 米）时不受影响
    const sideW = new THREE.Mesh(texBox(1.0, 10, 9.0, 2.4), new THREE.MeshLambertMaterial({ map: T('stone') })); sideW.position.set(-1.5, 5, 0.3); sideW.receiveShadow = true; g.add(sideW);
    addCut(A, sideW, 1, 0, -1.9, 0);
    const doorDark = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.1), new THREE.MeshBasicMaterial({ color: 0x0d0906 })); doorDark.position.set(5.3, 1.7, -3.2); g.add(doorDark);
    const planks = new THREE.Group(); planks.position.set(5.3, 0, -3.12); g.add(planks);
    addCut(A, doorDark, 0, 1, 0, -3.0); addCut(A, planks, 0, 1, 0, -3.0);
    A.facadePlanks = [];
    for (let i = 0; i < 5; i++) { const pk = meshFrom(new Parts().add(texBox(0.46, 3.3, 0.1, 1), i % 2 ? '#7a5634' : '#6a4a2c', mtx(0, 1.65, 0)).build(), { mat: toonMat(), thin: true }); pk.position.x = -0.96 + i * 0.48; planks.add(pk); A.facadePlanks.push(pk); }
    // Boss 区：倒塌的铁丝网
    const chainMat = new THREE.MeshLambertMaterial({ map: T('chain').clone(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    chainMat.map.needsUpdate = true; chainMat.map.repeat.set(12, 6);
    const posts = new Parts();
    const fences = [[46.5, 50.5, 0, 0], [50.5, 54.5, -0.15, 0.2], [54.5, 58.5, -0.85, 0.1], [58.5, 63.5, -0.25, -0.15]];
    for (const [a, b, tilt, yaw] of fences) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 3.4), chainMat);
      const piv = new THREE.Group(); piv.position.set((a + b) / 2, 0, -3.0); piv.rotation.set(tilt, yaw, 0); f.position.y = 1.7; piv.add(f); g.add(piv);
      posts.add(GEO.cyl, '#7a7e86', mtx(a, 1.7, -3.0, tilt * 0.5, 0, 0, 0.05, 3.4, 0.05));
    }
    posts.add(GEO.cyl, '#7a7e86', mtx(63.5, 1.7, -3.0, 0, 0, 0, 0.05, 3.4, 0.05));
    g.add(meshFrom(posts.build(), { thin: true }));
  }
};

// ---------- 可破坏 / 可拾取物体的网格工厂 ----------
export function propMesh(kind) {
  if (kind === 'drum') return meshFrom(drumGeo(), {});
  if (kind === 'pipes') return meshFrom(pipesGeo(), {});
  if (kind === 'statue') return statueMesh();
  return new THREE.Group();
}
export { capsule };
