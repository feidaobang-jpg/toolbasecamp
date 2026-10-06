// 场景：第一关三个区域（楼顶 / 大楼内部 / 第 47 街）与第二关三个区域（偷猎者森林 / 泥沼 / 黄昏的恐龙尸骸地）。按原作画面配色：楼顶淡紫色天空与沉在海里的高楼，
// 室内棕色壁纸、大理石柱、红地毯与金色骑士像，47 街的残破砖墙与铜绿色摩天楼。四周都有布景，Q/E 转到任何角度都不穿帮；
// 室内的外墙与天花板在镜头位于墙外时剖切（玩偶屋视图），户外挡住主角的建筑半透明。
import * as THREE from 'three';
import { fixedRng } from './core.js';
import { AREAS } from './level.js';
import { Parts, mtx, GEO, toonMat, meshFrom, drumGeo, barrelGeo, pipesGeo, buildHuman, SPECS, bakeModel, buildPtero, capsule } from './models.js';
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
      g.strokeStyle = '#715438'; g.lineWidth = 1.2;
      for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i * 64 + 128, 0); g.lineTo(i * 64, 128); g.stroke(); }
      g.fillStyle = '#ad8e65'; for (const [x, y] of [[32, 0], [96, 64], [32, 128], [0, 64], [128, 64]]) {
        for (let a = 0; a < 4; a++) { g.save(); g.translate(x, y); g.rotate(a * Math.PI / 2); g.beginPath(); g.ellipse(0, 6, 3, 8, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      }
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
    case 'dirt': t = mkTex(256, 256, 25, (g, w, h, r) => {   // 林地泥土：褐土 + 碎石 + 草屑 + 裂纹
      g.fillStyle = '#7a6040'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 30, v = r() * 30; g.fillStyle = rgb(110 + v, 88 + v * 0.8, 60 + v * 0.5); g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, r() * 3, 0, Math.PI * 2); g.fill(); }
      speckle(g, w, h, r, 900, 'rgba(50,36,20,0.35)', 2); speckle(g, w, h, r, 260, 'rgba(170,150,120,0.5)', 2.5);
      speckle(g, w, h, r, 220, 'rgba(80,120,50,0.6)', 3);
      g.strokeStyle = 'rgba(90,130,60,0.7)'; g.lineWidth = 1; for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 6); g.stroke(); }
      for (let i = 0; i < 6; i++) crack(g, r() * w, r() * h, 40 + r() * 40, r, 'rgba(50,36,20,0.6)');
    }); break;
    case 'mud': t = mkTex(256, 256, 26, (g, w, h, r) => {   // 泥沼底：深褐绿烂泥
      g.fillStyle = '#3e3a26'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) { const x = r() * w, y = r() * h, rr = 8 + r() * 26, v = r() * 20; g.fillStyle = rgb(70 + v, 64 + v, 40 + v * 0.5); g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, r() * 3, 0, Math.PI * 2); g.fill(); }
      speckle(g, w, h, r, 700, 'rgba(20,18,10,0.4)', 2); speckle(g, w, h, r, 200, 'rgba(90,110,60,0.45)', 3);
    }); break;
    case 'grain': t = mkTex(256, 256, 27, (g, w, h, r) => {   // 植物的通用纹理：白底上的深浅斑块，乘顶点色出叶簇和树皮的斑驳质感
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 2 + r() * 5; g.fillStyle = r() < 0.6 ? 'rgba(30,36,20,0.28)' : 'rgba(255,255,225,0.3)'; g.beginPath(); g.ellipse(x, y, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill(); }   // 叶簇 / 树皮斑块
      speckle(g, w, h, r, 1200, 'rgba(40,40,30,0.22)', 2); speckle(g, w, h, r, 400, 'rgba(255,255,230,0.3)', 1.5);
    }); break
  }
  TEX[name] = t;
  return t;
}
const SINK_DEPTH = 0.62;   // 与 game.js 的 SINK 一致：泥沼水面在 y=0，水底在 -0.62
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

// ---------- 第二关：植物、岩石、远山（顶点色合并 + 斑驳纹理，画风与第一关的写实贴图一致） ----------
const GREENS = ['#4e7c3a', '#5e8e46', '#3e6a32', '#6a9a4a'];
function tree(p, x, z, s, r, o) {
  const h = (3.4 + r() * 2.6) * s, trunk = (o && o.trunk) || '#8c6e52';
  p.add(GEO.cyl6, trunk, mtx(x, h / 2, z, 0, r() * 3, 0, 0.3 * s, h, 0.3 * s));
  p.add(GEO.cone, trunk, mtx(x, 0.3 * s, z, 0, r() * 3, 0, 0.62 * s, 0.6 * s, 0.62 * s));   // 板根
  const g = (o && o.greens) || GREENS, n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 1.1 * s;
    p.add(GEO.sphLo, g[i % g.length], mtx(x + Math.cos(a) * d, h + (r() - 0.25) * 1.1 * s, z + Math.sin(a) * d, 0, r() * 3, 0, (1.3 + r() * 0.7) * s, (0.9 + r() * 0.5) * s, (1.3 + r() * 0.7) * s));
  }
  if (o && o.vines) for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2, l = (1.2 + r() * 1.8) * s; p.add(GEO.cyl6, '#5e8a3e', mtx(x + Math.cos(a) * 0.9 * s, h - l / 2, z + Math.sin(a) * 0.9 * s, 0, 0, 0, 0.04, l, 0.04)); }
}
function fern(p, x, z, s, r, col) {
  const c = col || '#6aa556';
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + r(); p.add(GEO.sphLo, i % 2 ? c : '#5c9a4a', mtx(x + Math.sin(a) * 0.28 * s, 0.32 * s, z + Math.cos(a) * 0.28 * s, -0.95, a, 0, 0.11 * s, 0.05 * s, 0.48 * s)); }
}
function bush(p, x, z, s, r) { for (let i = 0; i < 3; i++) p.add(GEO.sphLo, GREENS[(i + 1) % 4], mtx(x + (r() - 0.5) * 0.8 * s, 0.35 * s, z + (r() - 0.5) * 0.6 * s, 0, r() * 3, 0, 0.55 * s, 0.42 * s, 0.5 * s)); }
function flowers(p, x, z, r) { for (let i = 0; i < 4; i++) p.add(GEO.sphLo, i % 2 ? '#a77acb' : '#c592d8', mtx(x + (r() - 0.5) * 0.5, 0.18 + r() * 0.12, z + (r() - 0.5) * 0.4, 0, 0, 0, 0.07, 0.07, 0.07)); }
function tufts(p, x, z, r, col) { for (let k = 0; k < 4; k++) p.add(GEO.cone, col || (k % 2 ? '#7ea85c' : '#8fb86a'), mtx(x + (r() - 0.5) * 0.35, 0.12, z + (r() - 0.5) * 0.25, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4, 0.04, 0.3 + r() * 0.15, 0.04)); }
function rock(p, x, z, s, r, col) { p.add(GEO.oct, col || '#a39f92', mtx(x, 0.25 * s, z, r(), r() * 3, r() * 0.5, 0.8 * s, 0.5 * s, 0.7 * s)); }
function mountain(p, x, z, w, h, col) { p.add(GEO.cone, col, mtx(x, h / 2 - 1, z, 0, 0, 0, w, h, w * 0.8)); }
const vegMat = () => new THREE.MeshLambertMaterial({ map: T('grain'), vertexColors: true });   // 每个网格单独一份（淡化时互不影响），纹理共用
// 远景树环：背后 / 镜头一侧 / 区域两端各成一个网格，镜头转进树林时挡在视线上的那一片整体淡化
function ringMesh(A, g, parts, box) {
  const m = new THREE.Mesh(parts.build(), vegMat()); g.add(m);
  if (box) addFade(A, m, new THREE.Box3(new THREE.Vector3(box[0], -10, box[1]), new THREE.Vector3(box[2], 30, box[3])));
  return m;
}
// 死恐龙（尸骸地的布景）：肚皮朝下趴着，背上露出肋骨，背板可选（剑龙）
function carcass(p, x, z, s, ry, plates) {
  const skin = '#94808c', red = '#b0625a', bone = '#efe6d6';
  const c = Math.cos(ry), sn = Math.sin(ry);
  const W = (lx, ly, lz) => [x + lx * c + lz * sn, ly, z - lx * sn + lz * c];
  const at = (lx, ly, lz, rx, rz, sx, sy, sz) => { const w = W(lx, ly, lz); return mtx(w[0], w[1], w[2], rx || 0, ry, rz || 0, sx, sy, sz); };
  p.add(GEO.sph, skin, at(0, 0.45 * s, 0, 0, 0, 0.8 * s, 0.5 * s, 1.5 * s));
  p.add(GEO.sph, red, at(0.25 * s, 0.75 * s, 0.1 * s, 0, 0, 0.45 * s, 0.22 * s, 0.85 * s));
  for (let i = 0; i < 5; i++) p.add(GEO.tor, bone, at(0.2 * s, 0.62 * s, (-0.55 + i * 0.27) * s, 0, 0, 0.5 * s, 0.5 * s, 0.22 * s));
  p.add(capsule(0.2 * s, 0.7 * s), skin, at(0, 0.32 * s, 1.75 * s, Math.PI / 2 - 0.3, 0, 1, 1, 1));    // 脖子
  p.add(GEO.sph, skin, at(0, 0.24 * s, 2.35 * s, 0, 0, 0.26 * s, 0.22 * s, 0.38 * s));                 // 头
  p.add(GEO.cone, skin, at(0, 0.18 * s, -2.3 * s, -Math.PI / 2 - 0.05, 0, 0.3 * s, 1.6 * s, 0.22 * s));  // 尾巴
  for (const sx of [-1, 1]) for (const sz of [-0.7, 0.8]) p.add(capsule(0.12 * s, 0.4 * s), skin, at(sx * 0.75 * s, 0.18 * s, sz * s, 0, sx * 1.4, 1, 1, 1));
  if (plates) for (let i = 0; i < 6; i++) p.add(GEO.cone, '#b58260', at(-0.15 * s, (0.95 + Math.sin(i / 5 * Math.PI) * 0.15) * s, (-1.0 + i * 0.4) * s, 0, 0.5, 0.16 * s, 0.5 * s, 0.06 * s));
  p.add(GEO.cyl, '#7a4a44', at(0.4 * s, 0.015, 0.2 * s, 0, 0, 1.1 * s, 0.01, 1.4 * s));   // 地上的暗色血迹
}
// 泥沼水面：半透明、顶点轻微起伏
function swampWater(A) {
  const mat = new THREE.MeshPhongMaterial({ color: 0x4a5e44, transparent: true, opacity: 0.88, shininess: 70, specular: 0x8a9a80, depthWrite: false });
  const uni = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvec4 wp0 = modelMatrix * vec4(position,1.0);\ntransformed.z += 0.035*sin(wp0.x*0.8+uTime*1.3)+0.025*sin(wp0.z*1.1-uTime*1.0);');
  };
  A.waterUni = uni;
  return mat;
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
    fp.add(texBox(X1 - X0, 0.48, 0.12, 1), '#a58b6a', mtx((X0 + X1) / 2, 0.24, ZB + 0.1));
    fp.add(texBox(X1 - X0, 0.08, 0.2, 1), '#c0a581', mtx((X0 + X1) / 2, 0.51, ZB + 0.12));
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
      pp.add(GEO.cyl, '#bacac1', mtx(x, 1.7, ZB + 0.3, 0, 0, 0, 0.35, 2.6, 0.35));
      pp.add(texBox(0.85, 0.55, 0.75, 1), '#bdb8ae', mtx(x, 0.28, ZB + 0.32));
      pp.add(texBox(1.05, 0.42, 0.8, 1), '#c8aa7d', mtx(x, 3.1, ZB + 0.32));
      pp.add(GEO.cyl, '#8c9d92', mtx(x, 2.82, ZB + 0.3, 0, 0, 0, 0.42, 0.22, 0.42));
    }
    const pillars = new THREE.Mesh(pp.build(), marbleMat); pillars.castShadow = true; pillars.receiveShadow = true; g.add(pillars);
    // 原作室内的浅灰绿拱券和破损墙皮；程序化重绘，不直接使用参考图。
    const archMat = new THREE.MeshLambertMaterial({ color: '#82968b', side: THREE.DoubleSide });
    const rimMat = new THREE.MeshLambertMaterial({ color: '#c0a77c', side: THREE.DoubleSide });
    for (let i = 0; i < PX.length - 1; i++) {
      const l = PX[i], r = PX[i + 1], mid = (l + r) / 2, radius = (r - l) / 2;
      const arch = new THREE.Shape(); arch.moveTo(l, CEIL); arch.lineTo(r, CEIL);
      for (let j = 0; j <= 24; j++) { const a = j / 24 * Math.PI; arch.lineTo(mid + Math.cos(a) * radius, 3.3 + Math.sin(a) * 1.25); }
      arch.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(arch), archMat); mesh.position.z = ZB + 0.025; bg.add(mesh);
      const rim = new THREE.Shape();
      for (let j = 0; j <= 24; j++) { const a = j / 24 * Math.PI; const x = mid + Math.cos(a) * radius, y = 3.3 + Math.sin(a) * 1.25; j ? rim.lineTo(x, y) : rim.moveTo(x, y); }
      for (let j = 24; j >= 0; j--) { const a = j / 24 * Math.PI; rim.lineTo(mid + Math.cos(a) * radius, 3.19 + Math.sin(a) * 1.25); }
      const edge = new THREE.Mesh(new THREE.ShapeGeometry(rim), rimMat); edge.position.z = ZB + 0.04; bg.add(edge);
    }
    const damageTex = mkTex(256, 256, 51, (ctx, w, h, rand) => {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#394642';
      ctx.beginPath();
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, rr = 30 + rand() * 45; const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill();
      for (let i = 0; i < 7; i++) crack(ctx, 128, 128, 80 + rand() * 60, rand, '#323b38');
    });
    const damageMat = new THREE.MeshLambertMaterial({ map: damageTex, transparent: true, alphaTest: 0.1, depthWrite: false });
    for (const x of [3.3, 12.5, 25.5, 38.6, 48.3, 58]) for (const y of [0.85, 4.1]) {
      const damage = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.5), damageMat); damage.position.set(x, y, ZB + 0.06); bg.add(damage);
    }
    const dp = new Parts();
    for (let i = 0; i < PX.length - 1; i++) {
      const x = (PX[i] + PX[i + 1]) / 2;
      if ([8, 20, 34].some(d => Math.abs(d - x) < 2)) continue;
      dp.add(GEO.hemi, '#d8c8a0', mtx(x, 2.6, ZB + 0.05, Math.PI / 2, 0, 0, 0.32, 0.18, 0.42));
      dp.add(GEO.box, '#7a5a38', mtx(x, 2.6, ZB + 0.02, 0, 0, 0, 0.5, 0.7, 0.05));
    }
    const decoM = new THREE.Mesh(dp.build(), toonMat()); bg.add(decoM);
    const webMat = new THREE.MeshBasicMaterial({ map: T('web'), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, flip] of [[13.4, 1], [26.6, -1], [39.6, 1], [49.2, -1], [2.4, 1]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), webMat); w.position.set(x + flip * 1.1, 3.65, ZB + 0.06); w.scale.x = flip; w.rotation.z = flip > 0 ? Math.PI / 2 : 0; bg.add(w);
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
  },

  // ---------- 第二关 ----------
  // 2-1 偷猎者森林：林间土路、粗大的树干和藤蔓、蕨类和紫色小花；尽头是山崖，下面就是泥沼
  forest(A) {
    const g = A.group, r = fixedRng(505);
    A.light = { sky: '#eef6dc', ground: '#5a5a3a', hemi: 1.2, sun: '#fff2d8', sunI: 1.8, dir: [-0.35, 1, 0.7], fog: '#9fb890', fogNear: 40, fogFar: 230, bg: '#9fb890' };
    skyDome(g, '#7fa8b8', '#c8dcc0', '#9fb890');
    const ground = new THREE.Mesh(texBox(112.5, 0.4, 90, 3.2), texMat('dirt')); ground.position.set(16.25, -0.2, 0); ground.receiveShadow = true; g.add(ground);
    const gp = new Parts();
    for (let x = -10; x < 72; x += 0.9 + r() * 1.2) { tufts(gp, x, -2.6 - r() * 0.6, r); if (r() < 0.6) tufts(gp, x + 0.4, 2.9 + r() * 0.6, r); }   // 路边草丛
    // 山崖：地面在 x=72.5 断开，崖壁向下到泥沼
    gp.add(GEO.box, '#9a8a70', mtx(73.5, -4.2, 0, 0, 0, 0.08, 2.2, 8.4, 90));
    for (let i = 0; i < 14; i++) rock(gp, 72.8 + r() * 0.8, -12 + i * 2.2, 1.2 + r() * 0.8, r, '#8e8270');
    const gm = new THREE.Mesh(gp.build(), new THREE.MeshLambertMaterial({ vertexColors: true })); gm.receiveShadow = true; g.add(gm);
    // 崖下：泥沼水面、对岸的树和远山（转视角时可见）
    const below = new Parts();
    for (let i = 0; i < 26; i++) tree(below, 80 + r() * 60, -40 + r() * 80, 1.3 + r() * 0.6, r, { vines: true });
    for (let i = 0; i < 9; i++) mountain(below, 120 + r() * 90, -110 + i * 26, 22 + r() * 14, 26 + r() * 22, i % 2 ? '#8f86b0' : '#a39ac0');
    const bm = new THREE.Mesh(below.build(), vegMat()); bm.position.y = -6.5; g.add(bm);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 40, 40), swampWater(A)); water.rotation.x = -Math.PI / 2; water.position.set(150, -6.4, 0); g.add(water);
    // 背后近处的大树（镜头转到背后时整排淡化）
    const back = new Parts();
    for (let x = -8; x < 76; x += 4.2 + r() * 2.6) { tree(back, x, -4.6 - r() * 2.4, 1.25 + r() * 0.5, r, { vines: true }); if (r() < 0.6) fern(back, x + 1.8, -3.2 - r() * 0.4, 1.1, r); if (r() < 0.5) flowers(back, x + 0.8, -3.0, r); }
    const backM = new THREE.Mesh(back.build(), vegMat()); backM.castShadow = true; backM.receiveShadow = true; g.add(backM);
    addFade(A, backM, new THREE.Box3(new THREE.Vector3(-14, 0, -9.5), new THREE.Vector3(80, 14, -3.3)));
    // 远处的林子与山丘
    const farB = new Parts(), farF = new Parts(), farL = new Parts();
    for (let i = 0; i < 60; i++) tree(farB, -30 + r() * 120, -10.5 - r() * 22, 1.1 + r() * 0.7, r);
    for (let i = 0; i < 12; i++) farB.add(GEO.sphLo, i % 2 ? '#4f8644' : '#5f9a4c', mtx(-30 + i * 11, 2, -38 - r() * 6, 0, 0, 0, 9, 7 + r() * 4, 6));
    for (let i = 0; i < 50; i++) tree(farF, -30 + r() * 102, 14 + r() * 20, 1.1 + r() * 0.7, r);
    for (let i = 0; i < 16; i++) tree(farL, -42 + r() * 28, -9 + r() * 22, 1.1 + r() * 0.5, r);   // 起点左侧（车开进来的路两边）
    ringMesh(A, g, farB, [-45, -60, 110, -9.8]); ringMesh(A, g, farF, [-45, 13, 110, 45]); ringMesh(A, g, farL, [-46, -12, -10, 14]);
    // 前景低矮的蕨类、石头、小花（不挡侧视镜头）
    const front = new Parts();
    for (let x = -6; x < 74; x += 2.2 + r() * 2.4) { if (r() < 0.6) fern(front, x, 3.4 + r() * 1.0, 0.7 + r() * 0.3, r); else if (r() < 0.5) rock(front, x, 3.6 + r() * 0.8, 0.35 + r() * 0.2, r); else flowers(front, x, 3.4 + r() * 0.6, r); }
    for (let x = -6; x < 74; x += 5 + r() * 4) bush(front, x, 12 + r() * 4, 1 + r() * 0.6, r);
    g.add(new THREE.Mesh(front.build(), vegMat()));
    A.camBoxes.push(new THREE.Box3(new THREE.Vector3(-2.8, 0, -2.6), new THREE.Vector3(3.2, 1.6, -0.5)));   // 停着的凯迪拉克
    A.anim = (t) => { if (A.waterUni) A.waterUni.uTime.value = t; };
  },

  // 2-2 泥沼 MUD SWAMP：齐腰深的泥水、睡莲叶、芦苇、泡在水里的老树；右边上岸进林子，远处紫色的山
  swamp(A) {
    const g = A.group, r = fixedRng(606), W = A.def.water;
    A.light = { sky: '#e0ecd8', ground: '#4a4a34', hemi: 1.1, sun: '#fff0d0', sunI: 1.55, dir: [-0.3, 1, 0.8], fog: '#8ea48c', fogNear: 30, fogFar: 200, bg: '#8ea48c' };
    skyDome(g, '#7a98a0', '#c0d0c4', '#8ea48c');
    // 水底与水面：水只铺到 x=W.x1 附近，岸边斜坡接到地面
    const bed = new THREE.Mesh(texBox(80, 0.3, 90, 3), texMat('mud')); bed.position.set(W.x1 - 40 + 1.5, -SINK_DEPTH - 0.15, 0); g.add(bed);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(84, 90, 42, 45), swampWater(A)); water.rotation.x = -Math.PI / 2; water.position.set(W.x1 - 42 + 1.2, -0.02, 0); g.add(water);
    const ramp = new THREE.Mesh(texBox(Math.hypot(W.bank - W.x1 + 0.4, SINK_DEPTH), 0.3, 90, 3), texMat('mud')); ramp.rotation.z = Math.atan2(SINK_DEPTH, W.bank - W.x1 + 0.4); ramp.position.set((W.x1 + W.bank) / 2 - 0.2, -SINK_DEPTH / 2 - 0.14, 0); g.add(ramp);
    const land = new THREE.Mesh(texBox(80, 0.4, 90, 3.2), texMat('dirt')); land.position.set(W.bank + 40, -0.2, 0); land.receiveShadow = true; g.add(land);
    // 起点后面：刚跳下来的山崖
    const cliff = new Parts();
    cliff.add(GEO.box, '#9a8a70', mtx(-7.5, 2.5, 0, 0, 0, -0.08, 2.4, 7.5, 90));
    for (let i = 0; i < 12; i++) rock(cliff, -6.2 + r() * 0.6, -12 + i * 2.3, 1.2 + r() * 0.8, r, '#8e8270');
    for (let i = 0; i < 10; i++) tree(cliff, -10 - r() * 6, -20 + i * 4.4, 1.2, r, { vines: true });
    const cm = new THREE.Mesh(cliff.build(), vegMat()); g.add(cm);
    const cliffTop = new Parts(); for (let i = 0; i < 10; i++) tree(cliffTop, -10 - r() * 8, -22 + i * 4.8, 1.2, r, { vines: true });
    const ct = new THREE.Mesh(cliffTop.build(), vegMat()); ct.position.y = 6.2; g.add(ct);
    // 水里：睡莲叶、芦苇、老树和枯木
    const sw = new Parts();
    for (let i = 0; i < 70; i++) { const x = -5 + r() * (W.x1 + 4), z = -14 + r() * 26; if (z > -2.6 && z < 2.8 && r() < 0.6) continue; if (z > 3.2 && z < 9) continue; sw.add(GEO.cyl, i % 3 ? '#6f9e52' : '#7fae5e', mtx(x, 0.01, z, 0, r() * 3, 0, 0.22 + r() * 0.22, 0.02, 0.22 + r() * 0.22)); if (r() < 0.15) sw.add(GEO.sphLo, '#f2e6f0', mtx(x + 0.1, 0.08, z, 0, 0, 0, 0.08, 0.06, 0.08)); }
    for (let i = 0; i < 40; i++) { const x = -5 + r() * (W.x1 + 6), back = r() < 0.6, z = back ? -3.1 - r() * 2.5 : 3.2 + r() * 2.2, h = back ? 1.0 + r() * 0.8 : 0.4 + r() * 0.35; for (let k = 0; k < 4; k++) sw.add(GEO.cone, k % 2 ? '#8aa060' : '#9ab06c', mtx(x + (r() - 0.5) * 0.4, h / 2 - 0.1, z + (r() - 0.5) * 0.3, (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2, 0.05, h, 0.05)); }
    for (let x = -4; x < W.x1 + 2; x += 5 + r() * 4) {
      const z = -4.4 - r() * 3.5;
      tree(sw, x, z, 1.15 + r() * 0.4, r, { trunk: '#7a6650', greens: ['#5f8a4c', '#6e9a58', '#557a44'], vines: true });
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + r(); sw.add(GEO.tor, '#7a6650', mtx(x + Math.cos(a) * 0.5, 0.2, z + Math.sin(a) * 0.5, 0, -a, 0, 0.5, 0.6, 0.5)); }   // 气根
    }
    sw.add(capsule(0.35, 6), '#7a6650', mtx(14, 0.05, -3.4, 0, 0.2, Math.PI / 2));   // 泡在水里的倒木
    sw.add(capsule(0.3, 4), '#7a6650', mtx(26, 0.0, 3.9, 0, -0.3, Math.PI / 2));
    const swM = new THREE.Mesh(sw.build(), vegMat()); swM.castShadow = true; g.add(swM);
    addFade(A, swM, new THREE.Box3(new THREE.Vector3(-8, 0, -9.5), new THREE.Vector3(W.x1 + 6, 12, -3.0)));
    // 远处的沼泽树林
    const farB = new Parts(), farF = new Parts();
    for (let i = 0; i < 46; i++) tree(farB, -6 + r() * 50, -11 - r() * 24, 1.2 + r() * 0.6, r, { trunk: '#7a6650', greens: ['#5f8a4c', '#6e9a58', '#557a44'], vines: true });
    for (let i = 0; i < 34; i++) tree(farF, -6 + r() * 50, 14 + r() * 22, 1.2 + r() * 0.6, r, { trunk: '#7a6650', greens: ['#5f8a4c', '#6e9a58', '#557a44'] });
    ringMesh(A, g, farB, [-12, -60, 50, -9.8]); ringMesh(A, g, farF, [-12, 13, 50, 45]);
    // 岸上：林子、草丛，远处紫色群山（原作 2-2 后半段的背景）
    const bank = new Parts();
    for (let x = W.bank; x < 74; x += 0.9 + r() * 1.2) { tufts(bank, x, -2.6 - r() * 0.6, r); if (r() < 0.6) tufts(bank, x + 0.4, 2.9 + r() * 0.6, r); }
    for (let x = W.bank + 1; x < 84; x += 4.5 + r() * 3) { tree(bank, x, -4.6 - r() * 2.2, 1.2 + r() * 0.5, r, { vines: true }); if (r() < 0.6) fern(bank, x + 1.5, -3.2, 1.0, r); }
    const bankM = new THREE.Mesh(bank.build(), vegMat()); bankM.castShadow = true; g.add(bankM);
    addFade(A, bankM, new THREE.Box3(new THREE.Vector3(W.bank - 2, 0, -9.5), new THREE.Vector3(96, 14, -3.0)));
    const bankB = new Parts(), bankF = new Parts(), bankLow = new Parts(), bankEnd = new Parts();
    for (let i = 0; i < 40; i++) tree(bankB, W.bank + r() * 50, -11 - r() * 16, 1.1 + r() * 0.6, r);
    for (let i = 0; i < 30; i++) tree(bankF, W.bank + r() * 50, 14 + r() * 20, 1.1 + r() * 0.6, r);
    for (let i = 0; i < 24; i++) tree(bankEnd, 86 + r() * 24, -12 + r() * 26, 1.1 + r() * 0.6, r);   // 右端林子（离镜头转圈的半径远一些）
    for (let i = 0; i < 12; i++) mountain(bankLow, 10 + i * 12 + r() * 6, -60 - r() * 20, 14 + r() * 10, 20 + r() * 16, i % 2 ? '#8f86b0' : '#a39ac0');
    for (let x = W.bank; x < 74; x += 2.6 + r() * 2.4) { if (r() < 0.6) fern(bankLow, x, 3.6 + r() * 1.4, 0.8, r); else flowers(bankLow, x, 3.5 + r(), r); }
    ringMesh(A, g, bankB, [W.bank - 4, -60, 120, -9.8]); ringMesh(A, g, bankF, [W.bank - 4, 13, 120, 45]); ringMesh(A, g, bankEnd, [84, -20, 120, 20]); ringMesh(A, g, bankLow, null);
    A.anim = (t) => { if (A.waterUni) A.waterUni.uTime.value = t; };
  },

  // 2-3 黄昏的恐龙尸骸地：木栅栏、满地死恐龙、轮胎和火堆；尽头屠夫在肢解一头剑龙
  grave(A) {
    const g = A.group, r = fixedRng(707);
    A.light = { sky: '#ffcca0', ground: '#3a2418', hemi: 1.0, sun: '#ffa868', sunI: 1.7, dir: [-0.75, 0.55, 0.45], fog: '#7a4a3a', fogNear: 40, fogFar: 220, bg: '#7a4a3a' };
    skyDome(g, '#3a2e5a', '#d0805a', '#7a4a3a');
    const ground = new THREE.Mesh(texBox(150, 0.4, 90, 3.2), texMat('dirt', null, { color: '#c89a78' })); ground.position.set(33, -0.2, 0); ground.receiveShadow = true; g.add(ground);
    // 后侧木栅栏（尖头圆木）：贴着走道，镜头转到墙后时整排剖切
    const pal = new Parts();
    for (let x = -4; x < 70; x += 0.42) {
      if ((x > 21 && x < 22.4) || (x > 44 && x < 45.4)) continue;   // 两处豁口
      const h = 2.5 + r() * 0.6;
      pal.add(GEO.cyl6, r() < 0.5 ? '#f2dcc4' : '#e2c8ac', mtx(x, h / 2, -3.45, 0, r() * 3, 0, 0.21, h, 0.21));
      pal.add(GEO.cone, '#f6e2cc', mtx(x, h + 0.18, -3.45, 0, 0, 0, 0.21, 0.36, 0.21));
    }
    pal.add(GEO.box, '#c8ac90', mtx(33, 1.6, -3.2, 0, 0, 0, 74, 0.16, 0.12));   // 横撑
    pal.add(GEO.box, '#c8ac90', mtx(33, 0.6, -3.2, 0, 0, 0, 74, 0.16, 0.12));
    const palM = new THREE.Mesh(pal.build(), new THREE.MeshLambertMaterial({ map: T('wood'), vertexColors: true })); palM.castShadow = true; palM.receiveShadow = true; g.add(palM);
    addCut(A, palM, 0, 1, 0, -3.2, false, 0, 0.7);
    // 栅栏外：暗下来的林子与远山
    const farB = new Parts(), farF = new Parts(), farL = new Parts(), hills = new Parts();
    const dusk = ['#4f6a46', '#5a7650', '#465f40'];
    for (let i = 0; i < 70; i++) tree(farB, -30 + r() * 130, -7 - r() * 24, 1.2 + r() * 0.7, r, { trunk: '#6e5844', greens: dusk });
    for (let i = 0; i < 50; i++) tree(farF, -30 + r() * 130, 14 + r() * 22, 1.2 + r() * 0.7, r, { trunk: '#6e5844', greens: dusk });
    for (let i = 0; i < 18; i++) tree(farL, -42 + r() * 28, -6 + r() * 20, 1.1, r, { trunk: '#6e5844', greens: dusk });
    for (let i = 0; i < 10; i++) mountain(hills, -20 + i * 14 + r() * 6, -70 - r() * 15, 16 + r() * 10, 24 + r() * 14, i % 2 ? '#7a6a8e' : '#8a789a');
    ringMesh(A, g, farB, [-45, -60, 110, -6.4]); ringMesh(A, g, farF, [-45, 13, 110, 45]); ringMesh(A, g, farL, [-46, -10, -10, 16]); ringMesh(A, g, hills, null);
    // 尽头：大石堆挡路
    const end = new Parts();
    for (let i = 0; i < 12; i++) rock(end, 67.5 + r() * 2.5, -4 + i * 0.9, 1.8 + r() * 1.4, r, '#8e7e70');
    const endT = new Parts();
    for (let i = 0; i < 8; i++) tree(endT, 80 + r() * 8, -6 + i * 2.2, 1.3, r, { trunk: '#6e5844', greens: dusk });
    g.add(new THREE.Mesh(end.build(), vegMat()));
    ringMesh(A, g, endT, [76, -20, 100, 20]);
    addSolids(A, end);
    // 恐龙尸体、轮胎、木箱（前景的都放得很低，不挡侧视）
    const dead = new Parts();
    carcass(dead, 8.5, -2.75, 0.9, Math.PI / 2 + 0.1, false);
    carcass(dead, 27, 10.5, 0.9, Math.PI / 2 - 0.2, false);
    carcass(dead, 36.5, -2.8, 1.0, Math.PI / 2 - 0.1, true);
    carcass(dead, 50, 11, 0.85, Math.PI / 2 + 0.3, false);
    const C = A.def.boss.carcass; carcass(dead, C.x, C.z, 1.15, Math.PI / 2, true);   // 屠夫正在肢解的剑龙
    for (let i = 0; i < 9; i++) { const x = 3 + r() * 60, z = r() < 0.5 ? -2.9 : 3.6 + r() * 0.8; dead.add(GEO.tor, '#3c3636', mtx(x, 0.12, z, Math.PI / 2 - 0.1, 0, r(), 0.3, 0.3, 0.45)); }
    for (let i = 0; i < 5; i++) { const x = 6 + r() * 56; dead.add(GEO.box, '#9a7450', mtx(x, 0.35, -2.9, 0, r(), 0, 0.7, 0.7, 0.7)); }
    for (let i = 0; i < 12; i++) dead.add(capsule(0.05, 0.5), '#efe6d6', mtx(2 + r() * 62, 0.04, (r() < 0.5 ? -2.7 : 3.4 + r()), Math.PI / 2, r() * 3, 0));   // 散落的骨头
    const deadM = meshFrom(dead.build(), { receive: true }); g.add(deadM);   // 死恐龙与道具：与角色一样卡通着色 + 描边
    // 火堆（暖光闪动）
    const fireMat = new THREE.MeshBasicMaterial({ color: '#ffb054', transparent: true, opacity: 0.9 });
    A.fires = [];
    for (const [fx, fz] of [[18.5, -2.7], [40.5, -2.75], [61.5, -2.7]]) {
      const base = new Parts();
      for (let k = 0; k < 4; k++) base.add(capsule(0.06, 0.6), '#5a4030', mtx(fx, 0.08, fz, Math.PI / 2, k * 0.8, 0));
      for (let k = 0; k < 6; k++) base.add(GEO.oct, '#8e8478', mtx(fx + Math.cos(k) * 0.42, 0.06, fz + Math.sin(k) * 0.42, 0, 0, 0, 0.12, 0.1, 0.12));
      g.add(new THREE.Mesh(base.build(), vegMat()));
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), fireMat); fl.position.set(fx, 0.45, fz); g.add(fl);
      const fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), new THREE.MeshBasicMaterial({ color: '#fff0a0' })); fl2.position.set(fx, 0.35, fz); g.add(fl2);
      A.fires.push(fl, fl2);
    }
    A.anim = (t) => { A.fires.forEach((f, i) => { const k = 0.85 + Math.sin(t * 11 + i * 1.7) * 0.12 + Math.sin(t * 17 + i) * 0.06; f.scale.set(k, 0.9 + (k - 0.85) * 2.2, k); }); };
  }
};

// ---------- 可破坏 / 可拾取物体的网格工厂 ----------
export function propMesh(kind) {
  if (kind === 'drum') return meshFrom(drumGeo(), {});
  if (kind === 'barrel') return meshFrom(barrelGeo(), {});
  if (kind === 'pipes') return meshFrom(pipesGeo(), {});
  if (kind === 'statue') return statueMesh();
  return new THREE.Group();
}
export { capsule };
