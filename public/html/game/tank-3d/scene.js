// 坦克大战 3D · 渲染：地形（4px 砖块、钢、河、树林、冰）、坦克与 Boss 模型、特效，
// 以及 5 个视角预设（斜俯视 / 正俯视 / 近景 / 正视 / 第一人称）+ Q/E 无极旋转、正视剖面。
// 美术全部程序化：基础几何体 + Canvas 纹理。1 个 8px 格 = 1 个世界单位，战场中心在原点。
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { N, Q, FIELD, DIRS, BASE_WALL, localPlayer } from './sim.js?v=coop1';

const C = N / 2, TAU = Math.PI * 2;
const P = v => v / 8 - C;                       // FC 像素 → 世界坐标
export const PRESETS = [
  { id: 'overview', name: '斜俯视', pitch: .98, fov: 38, fit: true },
  { id: 'top', name: '正俯视', pitch: 1.53, fov: 36, fit: true },
  { id: 'close', name: '近景', pitch: .82, fov: 42, dist: 15, follow: true },
  { id: 'front', name: '正视', pitch: .36, fov: 58, dist: 7.4, follow: true, front: true },
  { id: 'fp', name: '第一人称', fov: 76, fp: true }
];
function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------- 纹理 ----------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, n, colors, R) { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } }
const brickTex = () => canvasTex(64, 64, (g, w, h) => {      // 一个 4px 砖块面：两排错缝小砖
  const R = rngFrom(4); g.fillStyle = '#cbbd9f'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 2; r++) for (let c = -1; c < 2; c++) {
    const x = c * 32 + (r % 2) * 16, y = r * 32;
    g.fillStyle = ['#b24d27', '#bf5a2f', '#a84624', '#c4622f'][Math.floor(R() * 4)]; g.fillRect(x + 2, y + 2, 28, 28);
    g.fillStyle = '#d97a45'; g.fillRect(x + 2, y + 2, 28, 3); g.fillStyle = '#7e3319'; g.fillRect(x + 2, y + 27, 28, 3);
  }
  noise(g, w, h, 120, ['#00000022', '#ffffff18'], R);
});
const steelTex = () => canvasTex(128, 128, (g, w, h) => {
  const b = 18; g.fillStyle = '#7d858e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - b, b); g.lineTo(b, b); g.lineTo(b, h - b); g.lineTo(0, h); g.fill();
  g.fillStyle = '#4b5159'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w, h); g.lineTo(0, h); g.lineTo(b, h - b); g.lineTo(w - b, h - b); g.lineTo(w - b, b); g.fill();
  const grd = g.createLinearGradient(b, b, w - b, h - b); grd.addColorStop(0, '#c9ced4'); grd.addColorStop(1, '#9aa1a9'); g.fillStyle = grd; g.fillRect(b, b, w - 2 * b, h - 2 * b);
});
const treadTex = () => canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#34373b'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = '#1d1f22'; g.fillRect(0, y, w, 3); g.fillStyle = '#4a4e53'; g.fillRect(0, y + 3, w, 1); } }, [1, 4]);
const groundTex = () => canvasTex(256, 256, (g, w, h) => { const R = rngFrom(9); g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h); noise(g, w, h, 1400, ['#969696', '#7c7c7c', '#a0a0a0'], R); g.strokeStyle = '#9c9c9c'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }, [13, 13]);
const concreteTex = () => canvasTex(128, 128, (g, w, h) => { const R = rngFrom(12); g.fillStyle = '#7a7c80'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#6c6e72', '#88898d', '#727478'], R); g.fillStyle = '#5f6165'; g.fillRect(0, h - 3, w, 3); }, [8, 1]);
const grassTex = () => canvasTex(256, 256, (g, w, h) => { const R = rngFrom(21); g.fillStyle = '#4d6b3a'; g.fillRect(0, 0, w, h); noise(g, w, h, 2600, ['#5a7a44', '#435f33', '#628449', '#3f5a30'], R); }, [24, 24]);
const waterTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(31); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c8d8ff'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const y = R() * h, x = R() * w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 6, x + 28, y); g.stroke(); }
}, [1, 1]);
const iceTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(41); g.fillStyle = '#e8f6ff'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(R() * w, R() * h); g.lineTo(R() * w, R() * h); g.stroke(); }
  g.strokeStyle = '#a8d4f0'; g.lineWidth = 1; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(R() * w, R() * h); g.lineTo(R() * w, R() * h); g.stroke(); }
});
function iconTex(type) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#10213acc'; g.strokeStyle = type === 'repair' ? '#7ef0a0' : '#ffe27a'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(28, 6); g.lineTo(w - 28, 6); g.quadraticCurveTo(w - 6, 6, w - 6, 28); g.lineTo(w - 6, h - 28); g.quadraticCurveTo(w - 6, h - 6, w - 28, h - 6); g.lineTo(28, h - 6); g.quadraticCurveTo(6, h - 6, 6, h - 28); g.lineTo(6, 28); g.quadraticCurveTo(6, 6, 28, 6); g.closePath(); g.fill(); g.stroke();
    g.save(); g.translate(64, 66); g.lineJoin = 'round';
    if (type === 'star') { g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 17 : 40, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); }
    if (type === 'grenade') { g.fillStyle = '#5d8a3a'; g.beginPath(); g.ellipse(0, 8, 27, 32, 0, 0, TAU); g.fill(); g.strokeStyle = '#2f4a1c'; g.lineWidth = 4; for (const y of [-6, 8, 22]) { g.beginPath(); g.moveTo(-24, y); g.lineTo(24, y); g.stroke(); } g.fillStyle = '#c9ced4'; g.fillRect(-10, -34, 20, 12); }
    if (type === 'helmet') { g.fillStyle = '#c9d2dc'; g.beginPath(); g.arc(0, 10, 36, Math.PI, 0); g.fill(); g.fillRect(-42, 8, 84, 10); g.fillStyle = '#7a8591'; g.fillRect(-36, 18, 72, 6); }
    if (type === 'shovel') { g.rotate(-.7); g.fillStyle = '#9b6a3a'; g.fillRect(-5, -42, 10, 50); g.fillRect(-16, -46, 32, 8); g.fillStyle = '#cfd6dd'; g.beginPath(); g.moveTo(-18, 8); g.lineTo(18, 8); g.lineTo(14, 36); g.lineTo(0, 46); g.lineTo(-14, 36); g.fill(); }
    if (type === 'timer') { g.fillStyle = '#f3f5f7'; g.beginPath(); g.arc(0, 4, 36, 0, TAU); g.fill(); g.strokeStyle = '#2a3446'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -20); g.moveTo(0, 4); g.lineTo(17, 12); g.stroke(); }
    if (type === 'tank') { g.fillStyle = '#e2b233'; g.fillRect(-34, -6, 68, 26); g.fillStyle = '#34373b'; g.fillRect(-38, 18, 76, 12); g.fillStyle = '#e2b233'; g.fillRect(-16, -22, 30, 18); g.fillRect(12, -16, 30, 7); }
    if (type === 'gun') { g.fillStyle = '#c9ced4'; g.fillRect(-36, -18, 62, 16); g.fillRect(-36, -18, 16, 46); g.fillStyle = '#7a5030'; g.fillRect(-34, 0, 12, 28); g.fillStyle = '#ffd23f'; g.fillRect(26, -14, 10, 8); }
    if (type === 'boat') { g.fillStyle = '#3f8fd0'; g.beginPath(); g.moveTo(-42, 0); g.lineTo(42, 0); g.lineTo(30, 26); g.lineTo(-30, 26); g.closePath(); g.fill(); g.fillStyle = '#f3f5f7'; g.beginPath(); g.moveTo(0, -40); g.lineTo(0, -4); g.lineTo(28, -4); g.closePath(); g.fill(); g.fillStyle = '#8a5a30'; g.fillRect(-3, -42, 6, 44); }
    if (type === 'repair') { g.rotate(.7); g.fillStyle = '#e0e6ec'; g.fillRect(-7, -30, 14, 60); g.beginPath(); g.arc(0, -32, 16, 0, TAU); g.fill(); g.fillStyle = '#10213a'; g.fillRect(-6, -48, 12, 18); g.fillStyle = '#7ef0a0'; g.beginPath(); g.arc(0, 30, 10, 0, TAU); g.fill(); }
    if (type === 'medal') { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(0, 8, 30, 0, TAU); g.fill(); g.fillStyle = '#c03030'; g.fillRect(-14, -44, 28, 26); g.fillStyle = '#10213a'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText('500', 0, 19); }
    g.restore();
  });
}
function textTex(text, color = '#ffffff') {
  return canvasTex(128, 64, (g, w, h) => { g.font = '900 40px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#141820'; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); });
}
const starTex = () => canvasTex(128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, '#ffffffff'); grd.addColorStop(.25, '#fff4b0cc'); grd.addColorStop(1, '#fff4b000');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 9 : 62, a = i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
});
const flashTex = () => canvasTex(64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, '#fffbe8ff'); grd.addColorStop(.35, '#ffd66acc'); grd.addColorStop(1, '#ff8a2a00'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); });

// ---------------- 共享几何与材质 ----------------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const icoGeo = new THREE.IcosahedronGeometry(1, 1);
const lowIco = new THREE.IcosahedronGeometry(1, 0);
const effectRingGeo = new THREE.RingGeometry(.8, 1, 40);
const matCache = new Map();
function mat(color, rough = .6, metal = .1) { const k = color + rough + metal; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); return matCache.get(k); }
function mesh(parent, geo, material, x, y, z, sx, sy, sz, shadow = true) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }
const RED = new THREE.Color('#d9352b'), RED2 = new THREE.Color('#e84a3a');

// ---------------- 坦克模型 ----------------
const TANK_STYLE = {
  player: { main: '#e2b233', dark: '#8f6a17', turret: '#eec04a', hull: [1.02, .34, 1.58], barrel: 1.0 },
  basic: { main: '#b8bec6', dark: '#636a73', turret: '#c9ced5', hull: [1.02, .36, 1.5], barrel: .9 },
  fast: { main: '#c9d6e3', dark: '#4f6378', turret: '#d9e3ec', hull: [.86, .28, 1.7], barrel: 1.08 },
  power: { main: '#b7c3b0', dark: '#586652', turret: '#c7d2c0', hull: [1.0, .34, 1.56], barrel: 1.25 },
  armor: { main: '#9aa3ad', dark: '#4c535b', turret: '#aab2bb', hull: [1.1, .44, 1.62], barrel: .95 },
  escort: { main: '#a6aeb8', dark: '#55606c', turret: '#bfc6ce', hull: [.96, .32, 1.46], barrel: .9 },
  heavy: { main: '#b0452c', dark: '#5a1e12', turret: '#d6a23a', hull: [1.08, .42, 1.6], barrel: 1.3 },
  flame: { main: '#c8662a', dark: '#5a2a10', turret: '#e09a40', hull: [1.04, .4, 1.6], barrel: .7 },
  flamecar: { main: '#d0542a', dark: '#4a1a0c', turret: '#f0a040', hull: [1.1, .46, 1.7], barrel: .8 },
  twin: { main: '#2f8c8c', dark: '#144040', turret: '#58c0b8', hull: [1.08, .4, 1.66], barrel: 1.1 },
  miner: { main: '#6f7a34', dark: '#30360f', turret: '#9aa648', hull: [1.12, .46, 1.62], barrel: .8 },
  commander: { main: '#6a4a9a', dark: '#2a1a40', turret: '#a080d0', hull: [1.1, .42, 1.66], barrel: .95 },
  sniper: { main: '#4a4f58', dark: '#1a1d22', turret: '#6a707a', hull: [1.0, .36, 1.7], barrel: 1.7 }
};
const BOSS_COLORS = [['#7a8a98', '#3a4450', '#c8d4e0'], ['#5a7a58', '#243028', '#a8d090'], ['#8a7a50', '#3a3020', '#e0c878'], ['#6a5a7a', '#2a2038', '#c8a0e8'], ['#8a4a48', '#3a1818', '#f0a090'], ['#4a6a7a', '#183040', '#90d0e8'], ['#8a7840', '#3a2810', '#ffe080'], ['#5a4060', '#201028', '#e0a0c8'], ['#8a4028', '#301008', '#ff9040'], ['#3a2020', '#100808', '#ffd24a']];
function tankModel(kind, sharedTread, opts = {}) {
  let st = TANK_STYLE[kind] || TANK_STYLE.basic;
  const boss = kind === 'boss' || kind === 'final';
  if (boss) { const c = BOSS_COLORS[(opts.tier || 1) - 1]; st = { main: c[0], dark: c[1], turret: c[0], hull: [1.12, .46, 1.6], barrel: 1.0, accent: c[2] }; }
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  body.scale.set(.94, 1, .94);
  const bodyMat = new THREE.MeshStandardMaterial({ color: st.main, roughness: .45, metalness: .35 });
  const turretMat = new THREE.MeshStandardMaterial({ color: st.turret, roughness: .4, metalness: .35 });
  const darkMat = mat(st.dark, .6, .3);
  const tread = sharedTread.clone(); tread.needsUpdate = true;
  const treadMat = new THREE.MeshStandardMaterial({ map: tread, roughness: .9, metalness: .1 });
  const wheels = [];
  for (const s of [-1, 1]) {
    mesh(body, boxGeo, treadMat, s * .72, .21, 0, .46, .42, 1.9);
    mesh(body, boxGeo, darkMat, s * .72, .44, 0, .56, .06, 1.96);
    for (let i = 0; i < 4; i++) { const w = mesh(body, cylGeo, mat('#2a2d31', .7, .3), s * .96, .19, -.62 + i * .41, .15, .04, .15, false); w.rotation.z = Math.PI / 2; wheels.push(w); }
  }
  const [hw, hh, hl] = st.hull;
  mesh(body, boxGeo, bodyMat, 0, .3 + hh / 2, .04, hw, hh, hl);
  const glacis = mesh(body, boxGeo, bodyMat, 0, .38 + hh / 2, -hl / 2 + .02, hw, .16, .34); glacis.rotation.x = .6;
  mesh(body, boxGeo, darkMat, 0, .31 + hh, .5, hw * .8, .05, .42);
  if (kind === 'fast') mesh(body, boxGeo, mat('#3d7fd0', .5, .2), 0, .31 + hh, -.1, .16, .02, 1.1, false);
  if (kind === 'armor' || kind === 'heavy') for (const s of [-1, 1]) mesh(body, boxGeo, darkMat, s * .5, .45 + hh / 2, .04, .1, hh * .8, hl * .9);
  if (kind === 'flame' || kind === 'flamecar') { const tank = mesh(body, cylGeo, mat('#e8c040', .4, .5), 0, .5 + hh, .45, .26, .7, .26); tank.rotation.x = Math.PI / 2; }
  if (kind === 'miner') for (let i = 0; i < 3; i++) mesh(body, cylGeo, mat('#3a3a3a', .6, .4), -.3 + i * .3, .38 + hh, .6, .12, .08, .12);
  if (kind === 'commander') { mesh(body, cylGeo, mat('#d0d0d0', .4, .6), .35, 1.2, .45, .02, 1.2, .02); mesh(body, boxGeo, mat('#e0281c', .6, .1), .5, 1.65, .45, .3, .18, .02); }
  const turret = new THREE.Group(); turret.position.set(0, .3 + hh, .08); body.add(turret);
  const tScale = kind === 'fast' ? .82 : boss ? 1.1 : 1;
  const tb = mesh(turret, new THREE.CylinderGeometry(.34 * tScale, .44 * tScale, .3, 8), turretMat, 0, .15, 0, 1, 1, 1); tb.rotation.y = Math.PI / 8;
  mesh(turret, cylGeo, darkMat, .1, .32, .1, .13, .05, .13);
  const barrel = new THREE.Group(); barrel.position.set(0, .17, -.26); turret.add(barrel);
  const barrels = boss ? Math.max(1, opts.barrels || 1) : kind === 'twin' ? 2 : 1, tubes = [];
  for (let i = 0; i < barrels; i++) {
    const ox = barrels > 1 ? (i - (barrels - 1) / 2) * .2 : 0;
    const thick = kind === 'heavy' || kind === 'flamecar' ? .1 : .075;
    const tube = mesh(barrel, cylGeo, darkMat, ox, 0, -st.barrel / 2, thick, st.barrel, thick); tube.rotation.x = Math.PI / 2;
    const brake = mesh(barrel, cylGeo, darkMat, ox, 0, -st.barrel, thick * 1.5, .16, thick * 1.5); brake.rotation.x = Math.PI / 2;
    tubes.push({ tube, brake });
  }
  if (kind === 'sniper') mesh(turret, boxGeo, mat('#ff3030', .3, .2), .22, .3, -.1, .08, .08, .3, false);
  const glowMat = new THREE.MeshBasicMaterial({ color: st.accent || '#ff4020', transparent: true, opacity: 0, depthWrite: false });
  const glow = mesh(barrel, new THREE.SphereGeometry(.22, 10, 8), glowMat, 0, 0, -st.barrel - .1, 1, 1, 1, false);
  if (boss) {
    for (const s of [-1, 1]) mesh(body, boxGeo, mat(st.accent, .4, .4), s * .62, .62, 0, .08, .1, 1.5, false);
    if (kind === 'final') { const eye = mesh(turret, new THREE.SphereGeometry(.26, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ff8a1a', emissiveIntensity: .9 }), 0, .42, .05, 1, .7, 1, false); eye.name = 'eye'; }
  }
  const extras = new THREE.Group(); body.add(extras);
  if (boss) g.scale.setScalar(2);
  return { group: g, body, turret, barrel, tubes, tread, wheels, bodyMat, turretMat, glow, extras, kind, baseColor: new THREE.Color(st.main), turretColor: new THREE.Color(st.turret), barrelLen: st.barrel, level: -1, plate: -1, boats: -1 };
}
function applyPlayerGear(model, stars, plate, boats) {
  if (model.level === stars && model.plate === plate && model.boats === boats) return;
  model.level = stars; model.plate = plate; model.boats = boats;
  const len = [1.0, 1.18, 1.18, 1.3, 1.36][stars];
  for (const { tube, brake } of model.tubes) { tube.scale.y = len; tube.position.z = -len / 2; brake.position.z = -len; }
  model.barrelLen = len; model.glow.position.z = -len - .1;
  model.extras.clear();
  if (stars >= 2) for (const s of [-1, 1]) mesh(model.extras, boxGeo, mat('#b58a22', .45, .4), s * 1.0, .33, 0, .06, .26, 1.6);
  if (stars >= 3) { model.turretMat.emissive.set('#ff9a1f'); model.turretMat.emissiveIntensity = stars >= 4 ? .4 : .22; mesh(model.extras, boxGeo, mat('#d9352b', .4, .2), 0, .95, .08, .5, .04, .5); }
  else model.turretMat.emissive.set('#000000');
  for (let i = 0; i < plate; i++) for (const s of [-1, 1]) mesh(model.extras, boxGeo, mat('#7a8088', .4, .7), s * (.58 + i * .07), .58, .04, .05, .3, 1.3);
  if (boats > 0) {
    const hull = mesh(model.extras, boxGeo, mat('#2f78c0', .4, .3), 0, .05, 0, 1.25, .12 + boats * .04, 2.05, false);
    hull.name = 'boat';
  }
}
function eagleModel() {
  const g = new THREE.Group();
  const stone = mat('#76787d', .8, .05), bronze = mat('#9a6a2c', .38, .55), gold = mat('#e2b240', .3, .7), white = mat('#f1ede2', .55, .05), beak = mat('#f4c430', .35, .3);
  mesh(g, boxGeo, stone, 0, .12, 0, 1.9, .24, 1.9);
  mesh(g, boxGeo, mat('#8d9095', .7, .05), 0, .36, .05, 1.3, .24, 1.05);
  const bird = new THREE.Group(); bird.position.y = .48; g.add(bird);
  mesh(bird, icoGeo, bronze, 0, .38, 0, .26, .36, .22);
  mesh(bird, icoGeo, white, 0, .78, -.04, .16, .16, .15);
  const b = mesh(bird, new THREE.ConeGeometry(.055, .2, 8), beak, 0, .74, -.2, 1, 1, 1); b.rotation.x = -Math.PI / 2 - .5;
  for (const s of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(s * .18, .52, 0); wing.rotation.z = s * -.35; bird.add(wing);
    for (let i = 0; i < 4; i++) { const f = mesh(wing, boxGeo, i === 3 ? gold : bronze, s * (.2 + i * .19), .06 + i * .07, .02, .26, .08, .42 - i * .06); f.rotation.z = s * -.12 * i; }
  }
  const rubble = new THREE.Group(); rubble.visible = false; g.add(rubble);
  const R = rngFrom(33);
  for (let i = 0; i < 14; i++) { const r = mesh(rubble, lowIco, i % 3 ? mat('#3b3a38', .9, 0) : bronze, (R() - .5) * 1.5, .25 + R() * .12, (R() - .5) * 1.5, .12 + R() * .16, .08 + R() * .1, .12 + R() * .16); r.rotation.set(R() * 3, R() * 3, R() * 3); }
  const pole = mesh(rubble, cylGeo, mat('#d9d9d9', .5, .4), .35, .8, .25, .03, 1.2, .03); pole.rotation.z = .12;
  const flag = mesh(rubble, boxGeo, white, .6, 1.25, .25, .46, .3, .02); flag.rotation.z = -.08;
  return { group: g, bird, rubble };
}

// ---------------- 场景 ----------------
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb9cc'); scene.fog = new THREE.Fog('#9fb9cc', 70, 150);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .3, 220); scene.add(camera);
  const hemi = new THREE.HemisphereLight('#e2ecff', '#3b3a2c', 1.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.7); sun.position.set(-11, 24, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 70 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);

  // 地台：草地、混凝土围框、战场底板（顶面 y=0，没有共面）
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -.42; grass.receiveShadow = true; scene.add(grass);
  const plateMat = new THREE.MeshStandardMaterial({ map: groundTex(), roughness: .95, color: '#2a2c30' });
  plateMat.map.repeat.set(13, 13);
  mesh(scene, boxGeo, plateMat, 0, -.21, 0, N, .42, N, false);
  const frameMat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: .9 });
  const frames = [[0, -C - .75, N + 3, 1.5], [0, C + .75, N + 3, 1.5], [-C - .75, 0, 1.5, N], [C + .75, 0, 1.5, N]].map(([x, z, sx, sz]) => mesh(scene, boxGeo, frameMat, x, .2, z, sx, 1.24, sz, true));
  const R0 = rngFrom(77), trees = [];
  for (let i = 0; i < 140 && trees.length < 70; i++) { const x = (R0() - .5) * 90, z = (R0() - .5) * 90; if (Math.max(Math.abs(x), Math.abs(z)) < 17.5) continue; trees.push([x, z, .8 + R0() * .7]); }
  const tmp = new THREE.Object3D();
  const trunkM = new THREE.InstancedMesh(cylGeo, mat('#6b4a2e', .9), trees.length), leafM = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), mat('#2f5a33', .85), trees.length * 2);
  trees.forEach(([x, z, s], i) => {
    tmp.position.set(x, .2 * s - .4, z); tmp.scale.set(.18 * s, 1.2 * s, .18 * s); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); trunkM.setMatrixAt(i, tmp.matrix);
    for (let k = 0; k < 2; k++) { tmp.position.set(x, (1.2 + k * .9) * s - .4, z); tmp.scale.set((1.05 - k * .3) * s, 1.5 * s, (1.05 - k * .3) * s); tmp.updateMatrix(); leafM.setMatrixAt(i * 2 + k, tmp.matrix); }
  });
  trunkM.castShadow = leafM.castShadow = true; scene.add(trunkM, leafM);

  // ---------- 地形实例 ----------
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex(), roughness: .85 });
  const steelMat = new THREE.MeshStandardMaterial({ map: steelTex(), roughness: .35, metalness: .55 });
  const wTex = waterTex(); const waterMat = new THREE.MeshStandardMaterial({ map: wTex, color: '#2f6fd0', roughness: .2, metalness: .1, emissive: '#0a2a60', emissiveIntensity: .35 });
  const iceMat = new THREE.MeshStandardMaterial({ map: iceTex(), color: '#cfeaff', roughness: .12, metalness: .15 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: .8, flatShading: true });
  const bricks = new THREE.InstancedMesh(boxGeo, brickMat, Q * Q), steels = new THREE.InstancedMesh(boxGeo, steelMat, N * N);
  const waters = new THREE.InstancedMesh(boxGeo, waterMat, N * N), ices = new THREE.InstancedMesh(boxGeo, iceMat, N * N);
  const leaves = new THREE.InstancedMesh(lowIco, leafMat, N * N * 2);
  for (const im of [bricks, steels]) { im.castShadow = im.receiveShadow = true; im.frustumCulled = false; }
  for (const im of [waters, ices]) { im.receiveShadow = true; im.frustumCulled = false; }
  leaves.castShadow = true; leaves.receiveShadow = true; leaves.frustumCulled = false;
  const tint = new THREE.Color(), CR = rngFrom(5), WHITE = new THREE.Color('#ffffff');
  for (let i = 0; i < Q * Q; i++) { tint.setHSL(.04 + CR() * .02, .55, .45 + CR() * .1); bricks.setColorAt(i, tint.clone().lerp(WHITE, .5)); }
  for (let i = 0; i < N * N * 2; i++) { tint.setHSL(.28 + CR() * .06, .45, .32 + CR() * .12); leaves.setColorAt(i, tint.clone()); }
  scene.add(bricks, steels, waters, ices, leaves);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -50, 0);
  let world = null, cut = new Uint8Array(N * N), cutPrev = new Uint8Array(N * N), rise = new Map(), riseAll = 1;
  function writeCell(c) {
    const T = world.terrain, cx = c % N, cy = (c - cx) / N, x = cx - C + .5, z = cy - C + .5;
    const r = rise.has(c) ? Math.max(.03, 1 - Math.pow(1 - rise.get(c), 3)) : 1;
    const a = r * riseAll, low = cut[c] ? .14 : 1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const qi = (cy * 2 + dy) * Q + cx * 2 + dx;
      if (T.brick[qi]) { const h = a * low; tmp.position.set(x - .25 + dx * .5, h / 2, z - .25 + dy * .5); tmp.scale.set(.499, h, .499); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); bricks.setMatrixAt(qi, tmp.matrix); }
      else bricks.setMatrixAt(qi, ZERO);
    }
    if (T.steel[c]) { const h = 1.12 * a * low; tmp.position.set(x, h / 2, z); tmp.scale.set(.999, h, .999); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); steels.setMatrixAt(c, tmp.matrix); } else steels.setMatrixAt(c, ZERO);
    if (T.water[c]) { tmp.position.set(x, .035, z); tmp.scale.set(1, .05, 1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); waters.setMatrixAt(c, tmp.matrix); } else waters.setMatrixAt(c, ZERO);
    if (T.ice[c]) { tmp.position.set(x, .012, z); tmp.scale.set(1, .02, 1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); ices.setMatrixAt(c, tmp.matrix); } else ices.setMatrixAt(c, ZERO);
    for (let k = 0; k < 2; k++) {
      const li = c * 2 + k;
      if (T.forest[c] && !cut[c] && !(fpHide && fpHide(cx, cy))) {
        const j = ((cx * 7 + cy * 13 + k * 5) % 10) / 10;
        tmp.position.set(x + (k ? .22 : -.2) + (j - .5) * .1, (k ? 1.18 : .92) * a, z + (k ? -.18 : .2)); tmp.scale.set(.68 + j * .1, .55 * a + .02, .68 + j * .1); tmp.rotation.set(j * 3, k * 1.7 + j, 0); tmp.updateMatrix(); leaves.setMatrixAt(li, tmp.matrix);
      } else leaves.setMatrixAt(li, ZERO);
    }
  }
  let fpHide = null, wasFp = false;
  function flushTerrain() { for (const im of [bricks, steels, waters, ices, leaves]) im.instanceMatrix.needsUpdate = true; }
  function writeAll() { for (let c = 0; c < N * N; c++) writeCell(c); flushTerrain(); }

  const eagle = eagleModel(); eagle.group.position.set(P(104), 0, P(200)); eagle.group.rotation.y = Math.PI; eagle.group.scale.setScalar(1.12); scene.add(eagle.group);

  // ---------- 动态对象 ----------
  const sharedTread = treadTex();
  const tankModels = new Map();
  const shieldGeo = new THREE.IcosahedronGeometry(1.35, 1);
  const shieldMat = new THREE.MeshBasicMaterial({ color: '#6fe7ff', wireframe: true, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  const shields = [];
  const bulletGeo = new THREE.CapsuleGeometry(.1, .26, 3, 8); bulletGeo.rotateX(Math.PI / 2);
  const bulletMats = { player: new THREE.MeshBasicMaterial({ color: '#fff2a0' }), bot: new THREE.MeshBasicMaterial({ color: '#ff8a52' }), wide: new THREE.MeshBasicMaterial({ color: '#ffd0a0' }), flame: new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: .9 }), pierce: new THREE.MeshBasicMaterial({ color: '#ff3040' }) };
  const trailGeo = new THREE.PlaneGeometry(.16, 1); trailGeo.translate(0, .5, 0); trailGeo.rotateX(-Math.PI / 2);
  const trailMats = { player: new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), bot: new THREE.MeshBasicMaterial({ color: '#ff6a3a', transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
  const bulletPool = [];
  const sparkleTex = starTex(), flash = flashTex();
  const sparkles = [];
  const puTex = {};
  function puSprite() { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); s.scale.set(1.9, 1.9, 1); return s; }
  const puGroup = new THREE.Group(); puGroup.visible = false; scene.add(puGroup);
  const puIcon = puSprite(); puIcon.position.y = 1.5; puGroup.add(puIcon);
  const puRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 32), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); puRing.rotation.x = -Math.PI / 2; puRing.position.y = .04; puGroup.add(puRing);
  const puBeam = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 3, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2a0', transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); puBeam.position.y = 1.5; puGroup.add(puBeam);
  const itemPool = [];
  const mineGeo = new THREE.CylinderGeometry(.42, .5, .2, 14), mineMat = mat('#30343a', .5, .5), mineLight = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const minePool = [], markPool = [], laserPool = [];
  const markMat = new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false });
  const laserMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
  const fpGun = new THREE.Group(); camera.add(fpGun); fpGun.visible = false;
  { const t = mesh(fpGun, cylGeo, mat('#4a4a3c', .5, .5), 0, 0, -.62, .018, .8, .018, false); t.rotation.x = Math.PI / 2; const br = mesh(fpGun, cylGeo, mat('#3a3a30', .5, .5), 0, 0, -1.02, .04, .1, .04, false); br.rotation.x = Math.PI / 2; const h = mesh(fpGun, boxGeo, mat('#c99a28', .5, .35), 0, -.1, -.2, .34, .06, .26, false); h.rotation.x = .3; fpGun.position.set(0, -.24, -.05); }
  const scoreTex = new Map(), fx = [];
  function addFx(obj, o) { scene.add(obj); fx.push({ obj, life: o.life, max: o.life, type: o.type, vel: o.vel || new THREE.Vector3(), spin: o.spin || 0, s0: o.s0 || 1, s1: o.s1 || 1, dispose: o.dispose, op: o.op ?? 1, delay: o.delay || 0 }); if (fx.length > 420) { const f = fx.shift(); scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); } }
  const debrisMats = { brick: mat('#b95a2e', .8), steel: mat('#b3b9c0', .4, .5), tank: mat('#4b4f55', .6, .3), gold: mat('#d7a52c', .5, .4), silver: mat('#aab1b9', .5, .4), dirt: mat('#3a3631', .9), leaf: mat('#3f8a3a', .8) };
  function debris(x, y, z, kind, n, power = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      const s = .06 + Math.random() * .13, m = new THREE.Mesh(boxGeo, debrisMats[kind]); m.scale.setScalar(s); m.position.set(x, y, z); m.castShadow = true;
      const v = new THREE.Vector3((Math.random() - .5) * 5 * power, (2.5 + Math.random() * 4) * power, (Math.random() - .5) * 5 * power);
      if (dir) { v.x += dir[0] * 3 * power; v.z += dir[1] * 3 * power; }
      addFx(m, { type: 'debris', life: .9 + Math.random() * .6, vel: v, spin: (Math.random() - .5) * 14, s0: s });
    }
  }
  function fireball(x, y, z, scale, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(icoGeo, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? '#fff1a8' : i % 3 === 1 ? '#ffb13b' : '#ff6a22', transparent: true, depthWrite: false }));
      m.position.set(x + (Math.random() - .5) * scale * .7, y + Math.random() * scale * .5, z + (Math.random() - .5) * scale * .7);
      addFx(m, { type: 'fire', life: .35 + Math.random() * .3, s0: scale * .2, s1: scale * (.6 + Math.random() * .5), dispose: true, vel: new THREE.Vector3(0, 1.2, 0) });
    }
  }
  function smoke(x, y, z, scale, n, life = 1.4) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(lowIco, new THREE.MeshStandardMaterial({ color: i % 2 ? '#56585c' : '#3d3f43', transparent: true, opacity: .75, flatShading: true, depthWrite: false, roughness: 1 }));
      m.position.set(x + (Math.random() - .5) * scale, y + Math.random() * scale * .4, z + (Math.random() - .5) * scale);
      addFx(m, { type: 'smoke', life: life * (.7 + Math.random() * .6), s0: scale * .25, s1: scale * (.7 + Math.random() * .5), dispose: true, vel: new THREE.Vector3((Math.random() - .5) * .6, 1.4 + Math.random(), (Math.random() - .5) * .6), spin: (Math.random() - .5) * 2, op: .75 });
    }
  }
  function ring(x, z, radius, color = '#ffd27a', life = .5) {
    const m = new THREE.Mesh(effectRingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); addFx(m, { type: 'ring', life, s0: .3, s1: radius, dispose: true, op: .8 });
  }
  function flashAt(x, y, z, size, life = .12) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); addFx(s, { type: 'flash', life, s0: size, s1: size * 1.4, dispose: true }); }
  function popScore(x, z, value, delay = 0) {
    if (!scoreTex.has(value)) scoreTex.set(value, textTex(String(value), value >= 500 ? '#ffe27a' : '#ffffff'));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: scoreTex.get(value), transparent: true, depthWrite: false })); s.position.set(x, 1.8, z); s.visible = !delay;
    addFx(s, { type: 'score', life: 1.1 + delay, s0: 1.6, s1: 1.6, dispose: true, vel: new THREE.Vector3(0, 1.1, 0), delay });
  }

  // ---------- 镜头 ----------
  const view = { subjectHeading: () => { const m=tankModels.get(localPlayer(world)?.id); return m ? m.group.rotation.y+m.turret.rotation.y : null; }, presetIndex: 0, yawOffset: 0, snap: true, titleMode: true, shake: 0, quality: 'high' };
  let elapsed = 0, fpYaw = 0, introK = -1;
  const target = new THREE.Vector3(), follow = new THREE.Vector3(), camPos = new THREE.Vector3(), lookAt = new THREE.Vector3();
  view.pitchOffset = 0;
  view.turnPitch = d => {
    const p=PRESETS[view.presetIndex], base=p.pitch || 0, fp=!!p.fp;
    const pitch=base+view.pitchOffset+(fp?-d:d);
    view.pitchOffset=Math.max(fp?-1:.12,Math.min(fp?1:1.48,pitch))-base;
  };
  view.preset = () => PRESETS[view.presetIndex];
  view.setPreset = i => { view.presetIndex = i; view.yawOffset = 0; view.pitchOffset = 0; view.snap = true; };
  const fpActive = () => !!PRESETS[view.presetIndex].fp && !view.titleMode && localPlayer(world)?.state === 'active';
  view.firstPerson = fpActive;
  view.cameraYaw = () => (fpActive() ? fpYaw : 0) + view.yawOffset;
  view.facingYaw = () => fpYaw;
  view.fpTurn = delta => { fpYaw += delta; view.yawOffset -= delta; };   // 车头跟着视线转时，画面保持不动
  function fitDistance(pitch) {
    const aspect = Math.max(.6, camera.aspect), vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    if (pitch > 1.3) return Math.max(15 / Math.tan(vFov / 2), 15 / Math.tan(hFov / 2)) + 1;   // 正俯视：整块战场连围框装进画面
    return Math.max((14.5 * Math.sin(pitch) + 2.2) / Math.tan(vFov / 2), 15.4 / Math.tan(hFov / 2));
  }
  const lerpAngle = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };
  function playerPos(out) {
    const p = localPlayer(world);
    if (p) return out.set(P(lerpPx(p.ox ?? p.x, p.x) + 8), 0, P(lerpPx(p.oy ?? p.y, p.y) + 8));
    return out.set(P(72), 0, P(200));
  }
  let alpha = 1; const lerpPx = (a, b) => a + (b - a) * alpha;
  const pp = new THREE.Vector3();
  function updateCamera(dt) {
    let pr = PRESETS[view.presetIndex];
    if (pr.fp && !fpActive()) pr = PRESETS[3];       // 第一人称在出生 / 阵亡 / 标题时退回正视
    if (view.titleMode && (pr.front || pr.follow)) pr = PRESETS[0];
    playerPos(pp);
    const k = view.snap ? 1 : 1 - Math.exp(-5 * dt);
    const fov = pr.fov, near = pr.fp ? .06 : .3;
    if (camera.fov !== fov || camera.near !== near) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
    const p = localPlayer(world);
    if (pr.fp) {
      if (view.snap) fpYaw = -p.dir * Math.PI / 2;
      const yaw = fpYaw + view.yawOffset, fwd = [-Math.sin(yaw), -Math.cos(yaw)];
      camPos.set(pp.x + fwd[0] * .15, 1.16, pp.z + fwd[1] * .15);
      lookAt.set(pp.x + fwd[0] * 10, 1.16 + Math.tan(Math.max(-1,Math.min(1,-.061+view.pitchOffset)))*10, pp.z + fwd[1] * 10);
      camera.up.set(0, 1, 0); camera.position.copy(camPos); camera.lookAt(lookAt); target.copy(pp);
    } else {
      const yaw = view.yawOffset;
      if (pr.fit) follow.set(0, 0, pr.pitch > 1.3 ? 0 : 1.6);
      else if (pr.front) follow.set(pp.x - Math.sin(yaw) * 3.2, .5, pp.z - Math.cos(yaw) * 3.2);
      else follow.set(pp.x * .8, 0, pp.z * .8 + 1);
      target.lerp(follow, k);
      let dist = pr.fit ? fitDistance(pr.pitch+view.pitchOffset) : pr.dist, pitch = pr.pitch+view.pitchOffset, yw = yaw, tg = target;
      if (introK >= 0 && pr.fit) {
        const t = Math.min(1, introK), e = t * t * (3 - 2 * t), start = new THREE.Vector3(P(104), .6, P(192));
        tg = start.lerp(target, e); dist = THREE.MathUtils.lerp(6, dist, e); pitch = THREE.MathUtils.lerp(.22, pitch, e); yw = THREE.MathUtils.lerp(-.9, yaw, e);
      }
      camPos.set(tg.x + Math.sin(yw) * Math.cos(pitch) * dist, tg.y + Math.sin(pitch) * dist, tg.z + Math.cos(yw) * Math.cos(pitch) * dist);
      camera.position.copy(camPos);
      const sh = view.shake;
      if (sh > 0) camera.position.add(new THREE.Vector3((Math.random() - .5) * sh, (Math.random() - .5) * sh, (Math.random() - .5) * sh));
      lookAt.copy(tg);
      if (pitch > 1.3) { camera.up.set(-Math.sin(yw), 0, -Math.cos(yw)); } else camera.up.set(0, 1, 0);
      camera.lookAt(lookAt);
    }
    view.snap = false;
    fpGun.visible = !!pr.fp;
    // 镜头在战场围框外侧（正视 / 近景 / Q/E 转到侧面）时，把挡在前面的那段围框切矮
    const cp = camera.position, low = !pr.fit;
    const cutF = [low && cp.z < -C, low && cp.z > C, low && cp.x < -C, low && cp.x > C];
    frames.forEach((m, i) => { const h = cutF[i] ? .5 : 1.24; if (m.scale.y !== h) { m.scale.y = h; m.position.y = h / 2 - .42; } });
    // 阴影范围跟着镜头朝向往前挪
    const yawNow = view.cameraYaw(), ahead = pr.front || pr.fp ? 6 : 0;
    const sx = target.x - Math.sin(yawNow) * ahead, sz = target.z - Math.cos(yawNow) * ahead;
    sun.position.set(sx - 11, 24, sz + 14); sun.target.position.set(sx, 0, sz);
    return pr;
  }
  // 正视 / 近景：镜头和玩家之间、以及贴着镜头的墙和树切成矮墩（剖面），玩家始终可见
  function computeCut(pr) {
    cut.fill(0);
    fpHide = null;
    if (pr.fp) { const ex = camera.position.x + C, ez = camera.position.z + C; fpHide = (cx, cy) => Math.abs(cx + .5 - ex) < 1.6 && Math.abs(cy + .5 - ez) < 1.6; return; }
    if (!(pr.front || pr.follow) || !world) return;
    const ax = camera.position.x + C, az = camera.position.z + C, bx = pp.x + C, bz = pp.z + C, h0 = camera.position.y;
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      const px = cx + .5, pz = cy + .5;
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      const near = (px - ax) ** 2 + (pz - az) ** 2 < 1.6;
      if (!near && (t <= 0 || t >= .96)) continue;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + dx * t, qz = az + dz * t, d2 = (px - qx) ** 2 + (pz - qz) ** 2;
      const lineH = h0 + (.5 - h0) * t;                       // 视线在这一格的高度
      if (near || (d2 < .9 && lineH < 1.5)) cut[cy * N + cx] = 1;
    }
  }

  // ---------- 每帧同步 ----------
  const tmpV = new THREE.Vector3();
  function syncTank(t, isPlayer) {
    let m = tankModels.get(t.id);
    const kind = isPlayer ? 'player' : t.type === 'mini' ? t.kind : t.escort ? 'escort' : t.type;
    if (!m) { m = tankModel(kind, sharedTread, { tier: t.tier, barrels: t.barrels }); m.group.name = 'tank-' + t.id; tankModels.set(t.id, m); scene.add(m.group); m.born = elapsed; }
    m.seen = true;
    const s = t.size, x = P(lerpPx(t.ox ?? t.x, t.x) + s / 2), z = P(lerpPx(t.oy ?? t.y, t.y) + s / 2);
    m.group.position.set(x, 0, z);
    m.group.rotation.y = -t.dir * Math.PI / 2;
    if (isPlayer && t.lookHeading !== undefined) m.turret.rotation.y = t.lookHeading - m.group.rotation.y;
    else m.turret.rotation.y = 0;
    m.tread.offset.y = -t.travel * .07;
    m.wheels.forEach(w => { w.rotation.x = -t.travel * .4; });
    m.body.position.y = t.moving ? Math.abs(Math.sin(elapsed * 22 + t.id)) * .025 : 0;
    m.barrel.position.z = -.26 + (t.recoil || 0) / 7 * .18;
    const appear = Math.min(1, (elapsed - m.born) / .25); m.group.scale.setScalar((s > 16 ? 2 : 1) * (.6 + .4 * appear));
    if (isPlayer) {
      applyPlayerGear(m, t.stars, t.plate || 0, t.boats || 0);
      const blink = t.invuln > 0 && Math.floor(t.invuln / 4) % 2 === 0;
      m.group.visible = !blink && !(fpActive() && localPlayer(world)?.id === t.id);
      if (world.seats) { m.bodyMat.color.set(t.slot === 1 ? '#72c4dd' : '#e6be56'); m.turretMat.color.set(t.slot === 1 ? '#418ba7' : '#ba923a'); }
      m.bodyMat.emissive.set(t.hitFlash > 0 ? '#ff4040' : '#000000'); m.bodyMat.emissiveIntensity = t.hitFlash > 0 ? .9 : 0;
      return m;
    }
    m.group.visible = true;
    // 经典配色：带道具坦克全场同步红 / 银各 8 帧；重甲按剩余血量变色
    const f = world.f;
    let col = m.baseColor;
    if (t.carrier && (f & 8)) col = RED;
    else if (t.type === 'armor' && !t.carrier) col = ARMOR_TINT[Math.min(4, t.hp)] || m.baseColor;
    if (t.elite) col = ELITE;
    m.bodyMat.color.copy(col); m.turretMat.color.copy(col === RED ? RED2 : t.type === 'armor' || t.elite ? col : m.turretColor);
    const ice = world.freeze > 0 ? .35 + .15 * Math.sin(elapsed * 6) : 0, hit = t.hitFlash > 0 ? .85 : 0;
    m.bodyMat.emissive.set(hit ? '#ffffff' : '#4aa8ff'); m.bodyMat.emissiveIntensity = hit || ice;
    const tg = t.telegraph > 0 ? .5 + .5 * Math.sin(elapsed * 30) : 0;
    m.glow.material.opacity = tg * .9; m.glow.scale.setScalar(1 + tg * .8);
    if (t.enraged) m.turretMat.emissive.set('#ff3010'), m.turretMat.emissiveIntensity = .3 + .2 * Math.sin(elapsed * 8);
    const eye = m.turret.getObjectByName('eye'); if (eye) eye.scale.set(1, .7 + .3 * Math.abs(Math.sin(elapsed * 2)), 1);
    return m;
  }
  const ARMOR_TINT = [null, new THREE.Color('#b8bec6'), new THREE.Color('#b4c45a'), new THREE.Color('#d8c472'), new THREE.Color('#86c08a')];
  const ELITE = new THREE.Color('#d0a040');
  function shieldAt(i, t, color) {
    if (!shields[i]) { const s = new THREE.Mesh(shieldGeo, shieldMat.clone()); scene.add(s); shields[i] = s; }
    const s = shields[i]; s.visible = true; s.material.color.set(color);
    s.position.set(P(lerpPx(t.ox ?? t.x, t.x) + t.size / 2), .55 * t.size / 16, P(lerpPx(t.oy ?? t.y, t.y) + t.size / 2)); s.scale.setScalar(t.size / 16);
    s.rotation.y += .04; s.rotation.x = Math.sin(elapsed * 3) * .2;
    s.material.opacity = .35 + .25 * Math.abs(Math.sin(elapsed * 9));
  }
  function update(dt, a = 1, opts = {}) {
    alpha = a; elapsed += dt;
    introK = opts.intro ?? -1;
    view.shake = Math.max(0, view.shake - dt * 2);
    if (!world) { renderer.render(scene, camera); return; }
    const pr = updateCamera(dt);
    computeCut(pr);
    // 地形：增量更新变化的格子；剖面变化的格子；升起动画
    let dirty = false;
    if (world.changedAll) { world.changedAll = false; world.changed.length = 0; writeAll(); }
    if (world.changed.length) {
      for (const c of world.changed) { const T = world.terrain, cx = c % N, cy = (c - cx) / N; if (T.steel[c] || brickCell(T, cx, cy)) { if (!rise.has(c) && opts.riseNew !== false) rise.set(c, .55); } writeCell(c); }
      world.changed.length = 0; dirty = true;
    }
    const fpNow = !!fpHide;
    if (fpNow !== wasFp) { wasFp = fpNow; writeAll(); }
    for (let c = 0; c < N * N; c++) if (cut[c] !== cutPrev[c] || (fpHide && world.terrain.forest[c])) { writeCell(c); dirty = true; }
    cutPrev.set(cut);
    if (riseAll < 1) { riseAll = Math.min(1, riseAll + dt / .5); writeAll(); dirty = false; }
    for (const [c, k] of rise) { const n = Math.min(1, k + dt / .3); rise.set(c, n); writeCell(c); dirty = true; if (n >= 1) rise.delete(c); }
    if (dirty) flushTerrain();
    wTex.offset.set((elapsed * .05) % 1, (elapsed * .11) % 1);
    // 坦克
    for (const m of tankModels.values()) m.seen = false;
    let si = 0;
    const players = world.seats ? world.seats.map(s => s.tank).filter(Boolean) : world.player ? [world.player] : [];
    for (const p of players) if (p.state === 'active') { syncTank(p, true); if (p.shield > 0 && !(fpActive() && localPlayer(world)?.id === p.id)) shieldAt(si++, p, p.slot === 1 ? '#74d6ff' : '#ffe099'); }
    for (const t of world.bots) if (t.state === 'active') { syncTank(t, false); if (t.shield > 0 || (t.kind === 'commander' && t.escorts > 0)) shieldAt(si++, t, '#ff7aa0'); }
    for (let i = si; i < shields.length; i++) shields[i].visible = false;
    for (const [id, m] of tankModels) if (!m.seen) { scene.remove(m.group); m.bodyMat.dispose(); m.turretMat.dispose(); m.tread.dispose(); m.glow.material.dispose(); tankModels.delete(id); }
    // 炮弹
    const bs = world.bullets;
    while (bulletPool.length < bs.length) { const g = new THREE.Group(); const core = new THREE.Mesh(bulletGeo, bulletMats.player); const tr = new THREE.Mesh(trailGeo, trailMats.player); g.add(core, tr); g.core = core; g.trail = tr; scene.add(g); bulletPool.push(g); }
    bulletPool.forEach((g, i) => {
      const b = bs[i]; g.visible = !!b && b.state === 'fly'; if (!g.visible) return;
      g.position.set(P(lerpPx(b.ox ?? b.x, b.x)), .72, P(lerpPx(b.oy ?? b.y, b.y))); g.rotation.y = b.heading ?? -b.dir * Math.PI / 2;
      const special = b.kind !== 'shell';
      g.core.material = special ? bulletMats[b.kind] || bulletMats.wide : bulletMats[b.team];
      g.trail.material = trailMats[b.team];
      if (special) { const wdt = Math.max(.5, b.half / 4); g.core.scale.set(wdt * 2.2, b.kind === 'flame' ? 2.2 : 1.6, b.kind === 'pierce' ? 3 : 1.6); if (b.kind === 'flame') g.core.rotation.z = elapsed * 9; }
      else { g.core.scale.set(1, 1, 1); g.core.rotation.z = 0; }
      g.trail.scale.set(special ? 4 : 1, 1, Math.min(1.6, b.age * b.speed * .1) || .01); g.trail.position.z = .12;
    });
    // 出生光柱
    const spawns = [];
    for (const t of world.bots) if (t.state === 'spawn') spawns.push({ x: t.x + t.size / 2, y: t.y + t.size / 2, k: t.st / (t.size > 16 ? 100 : 56), big: t.size > 16 });
    if (world.seats) { for (const s of world.seats) if (!s.tank && s.spawnT > 0) spawns.push({ x: s.slot === 1 ? 136 : 72, y: 200, k: s.spawnT / 37, player: true }); }
    else if (!world.player && world.playerSpawnT > 0) spawns.push({ x: 72, y: 200, k: world.playerSpawnT / 37, player: true });
    while (sparkles.length < spawns.length) {
      const g = new THREE.Group(); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.y = .9; g.add(s);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.75, .95, 7, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3.5; g.add(beam);
      g.sprite = s; g.beam = beam; scene.add(g); sparkles.push(g);
    }
    sparkles.forEach((g, i) => {
      const s = spawns[i]; g.visible = !!s; if (!s) return;
      g.position.set(P(s.x), 0, P(s.y)); g.scale.setScalar(s.big ? 2 : 1);
      const pulse = .9 + .7 * Math.abs(Math.sin(elapsed * 11)); g.sprite.scale.set(pulse * 1.8, pulse * 1.8, 1); g.sprite.material.rotation = elapsed * 5;
      g.beam.material.opacity = .22 * (.4 + s.k * .6); g.beam.material.color.set(s.player ? '#ffe89a' : s.big ? '#ff9a7a' : '#bfe9ff');
    });
    // 道具（原版每 8 帧闪烁；魔改到期前加快）
    const pu = world.powerup;
    puGroup.visible = !!pu && ((world.f & 8) === 0 || (world.classic ? false : pu.life && pu.life - pu.age > 240));
    if (pu) {
      if (!puTex[pu.type]) puTex[pu.type] = iconTex(pu.type);
      if (puIcon.material.map !== puTex[pu.type]) { puIcon.material.map = puTex[pu.type]; puIcon.material.needsUpdate = true; }
      puGroup.position.set(P(pu.x + 8), 0, P(pu.y + 8)); puIcon.position.y = 1.5 + Math.sin(elapsed * 3) * .18; puRing.rotation.z = elapsed * 1.5;
    }
    while (itemPool.length < world.items.length) { const s = puSprite(); s.scale.set(1.5, 1.5, 1); scene.add(s); itemPool.push(s); }
    itemPool.forEach((s, i) => {
      const it = world.items[i]; s.visible = !!it; if (!it) return;
      if (!puTex[it.type]) puTex[it.type] = iconTex(it.type);
      if (s.material.map !== puTex[it.type]) { s.material.map = puTex[it.type]; s.material.needsUpdate = true; }
      s.position.set(P(it.x), 1.1 + Math.sin(elapsed * 3 + i) * .12, P(it.y));
    });
    // 地雷 / 炮击标记 / 狙击激光
    while (minePool.length < world.mines.length) { const g = new THREE.Group(); mesh(g, mineGeo, mineMat, 0, .1, 0, 1, 1, 1); const l = mesh(g, new THREE.SphereGeometry(.12, 8, 6), mineLight, 0, .24, 0, 1, 1, 1, false); g.light = l; scene.add(g); minePool.push(g); }
    minePool.forEach((g, i) => { const m = world.mines[i]; g.visible = !!m; if (!m) return; g.position.set(P(m.x), 0, P(m.y)); g.light.visible = Math.floor(elapsed * (m.life - m.t < 90 ? 12 : 3)) % 2 === 0; });
    while (markPool.length < world.mortars.length) { const m = new THREE.Mesh(effectRingGeo, markMat); m.rotation.x = -Math.PI / 2; scene.add(m); markPool.push(m); }
    markPool.forEach((m, i) => { const k = world.mortars[i]; m.visible = !!k; if (!k) return; m.position.set(P(k.x), .07, P(k.y)); const s = 1.75 * (1 + k.t / 75 * 1.2); m.scale.set(s, s, s); });
    while (laserPool.length < world.lasers.length) { const m = new THREE.Mesh(boxGeo, laserMat); scene.add(m); laserPool.push(m); }
    laserPool.forEach((m, i) => {
      const l = world.lasers[i]; m.visible = !!l; if (!l) return;
      const [dx, dy] = DIRS[l.dir], len = dx > 0 ? FIELD - l.x : dx < 0 ? l.x : dy > 0 ? FIELD - l.y : l.y;
      m.position.set(P(l.x + dx * len / 2), .7, P(l.y + dy * len / 2)); m.scale.set(dx ? len / 8 : .08, .06, dy ? len / 8 : .08);
      m.material.opacity = .4 + .4 * Math.abs(Math.sin(elapsed * 20));
    });
    // 老鹰
    eagle.bird.visible = world.eagle.alive; eagle.rubble.visible = !world.eagle.alive;
    if (world.eagle.alive) eagle.bird.rotation.y = Math.sin(elapsed * .8) * .05;
    else if (Math.random() < dt * 6) smoke(P(104), .8, P(200), 1.4, 1, 2.2);
    // 特效
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      if (f.delay > 0) { f.delay -= dt; f.life -= dt; if (f.delay <= 0) f.obj.visible = true; continue; }
      f.life -= dt; const t = 1 - Math.max(0, f.life) / f.max, o = f.obj;
      if (f.type === 'debris') {
        f.vel.y -= 18 * dt; o.position.addScaledVector(f.vel, dt);
        const floor = o.scale.x / 2; if (o.position.y < floor) { o.position.y = floor; f.vel.y *= -.3; f.vel.x *= .55; f.vel.z *= .55; f.spin *= .5; }
        o.rotation.x += f.spin * dt; o.rotation.z += f.spin * .7 * dt;
        if (t > .7) o.scale.setScalar(f.s0 * (1 - (t - .7) / .3));
      } else if (f.type === 'fire' || f.type === 'smoke' || f.type === 'ring' || f.type === 'flash') {
        const e = 1 - Math.pow(1 - t, 3), s = f.s0 + (f.s1 - f.s0) * e;
        o.scale.setScalar(s);
        o.position.addScaledVector(f.vel, dt); o.rotation.y += f.spin * dt;
        o.material.opacity = f.op * (f.type === 'smoke' ? Math.min(1, (1 - t) * 1.6) : 1 - t);
      } else if (f.type === 'score') { o.position.addScaledVector(f.vel, dt); o.material.opacity = Math.min(1, Math.max(0, f.life) * 2.5); }
      if (f.life <= 0) { scene.remove(o); if (f.dispose) o.material.dispose(); fx.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }

  // ---------- 事件 → 特效 ----------
  function effect(e) {
    const x = e.x !== undefined ? P(e.x) : 0, z = e.y !== undefined ? P(e.y) : 0;
    const dir = e.dir !== undefined ? DIRS[e.dir] : null;
    switch (e.type) {
      case 'fire': flashAt(x, .72, z, e.big ? 1.6 : .9, .09); break;
      case 'brick': {
        let n = 0;
        for (const c of e.cells) {
          if (n++ > 10) break;
          if (c.forest) { debris(c.cx - C + .5, 1, c.cy - C + .5, 'leaf', 3, .7); continue; }
          const cx = c.qx !== undefined ? c.qx / 2 - C + .25 : c.cx - C + .5, cz = c.qy !== undefined ? c.qy / 2 - C + .25 : c.cy - C + .5;
          debris(cx, .6, cz, c.steel ? 'steel' : 'brick', c.qx !== undefined ? 2 : 3, .7, dir);
        }
        flashAt(x, .7, z, e.flame ? 1.6 : .8, .1); smoke(x, .5, z, .7, 1, .6);
        if (e.flame) fireball(x, .6, z, 1.2, 3);
        break;
      }
      case 'crush': debris(x, .5, z, 'brick', 2, .6); break;
      case 'steel': case 'border': flashAt(x, .7, z, .7, .1); debris(x, .7, z, 'steel', 2, .5); break;
      case 'puff': flashAt(x, .72, z, 1.1, .14); break;
      case 'deflect': flashAt(x, .72, z, 1.2, .16); ring(x, z, 1.2, '#6fe7ff'); break;
      case 'armor': flashAt(x, .9, z, e.big ? 2 : 1, .12); debris(x, .8, z, 'silver', 3, .6); break;
      case 'boom':
        fireball(x, .7, z, e.huge ? 4.4 : 2.2, e.huge ? 14 : 7); smoke(x, .8, z, e.huge ? 3.2 : 1.6, e.huge ? 8 : 4);
        debris(x, .8, z, e.team === 'player' ? 'gold' : 'silver', e.huge ? 22 : 10, e.huge ? 1.6 : 1.1); debris(x, .6, z, 'tank', 6, .9);
        ring(x, z, e.huge ? 6 : 3.2); view.shake = Math.max(view.shake, e.huge ? .5 : .15); break;
      case 'eagle': fireball(P(104), 1, P(200), 3.4, 10); smoke(P(104), 1, P(200), 2.6, 8, 2.4); debris(P(104), 1, P(200), 'gold', 16, 1.4); debris(P(104), .8, P(200), 'dirt', 12, 1.2); ring(P(104), P(200), 5, '#ff9a4a'); view.shake = .6; break;
      case 'score': popScore(x, z, e.value, e.delayed ? .6 : 0); break;
      case 'pickup': ring(x, z, 2.4, '#ffe27a'); flashAt(x, 1.2, z, 2.4, .25); break;
      case 'repair': case 'medal': ring(x, z, 2, '#7ef0a0'); break;
      case 'grenade': for (let i = 0; i < 3; i++) ring(0, 0, 14 + i * 3, '#ffb13b', .8); view.shake = .5; break;
      case 'shovel': for (const [cx, cz] of BASE_WALL) debris(cx - C + .5, .4, cz - C + .5, 'dirt', 2, .6); break;
      case 'freeze': ring(0, 0, 16, '#8fd8ff', .9); break;
      case 'blast': fireball(x, .5, z, e.r / 6, 6); smoke(x, .6, z, e.r / 7, 3); ring(x, z, e.r / 6, '#ff8a3a'); view.shake = Math.max(view.shake, .25); break;
      case 'mortarMark': for (const s of e.spots) ring(P(s.x), P(s.y), 2.2, '#ff3a2a', .6); break;
      case 'telegraph': ring(x, z, e.kind === 'summon' ? 4 : 2.6, '#ff5a3a', .7); break;
      case 'summon': ring(x, z, 5, '#c080ff', .8); break;
      case 'bossSpawn': ring(x, z, 8, '#ffd24a', 1); view.shake = .4; break;
      case 'eject': ring(x, z, 1.6, '#7ad0ff'); break;
      case 'enemyLoot': ring(x, z, 2.4, '#ff5a5a'); flashAt(x, 1.2, z, 2.2, .25); break;
    }
  }

  function setWorld(w, opts = {}) {
    world = w;
    for (const m of tankModels.values()) { scene.remove(m.group); m.bodyMat.dispose(); m.turretMat.dispose(); m.tread.dispose(); m.glow.material.dispose(); }
    tankModels.clear();
    for (const f of fx) { scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); }
    fx.length = 0; rise.clear(); cut.fill(0); cutPrev.fill(0);
    for (const t of scoreTex.values()) t.dispose(); scoreTex.clear();
    riseAll = opts.rise === false ? 1 : 0;
    world.changed.length = 0; world.changedAll = false;
    applyTheme(w.spec);
    writeAll();
    view.snap = true;
  }
  function applyTheme(spec) {
    const th = spec.theme;
    const sky = th ? th.sky : '#9fb9cc', ground = th ? th.ground : '#202226';
    scene.background.set(sky); scene.fog.color.set(sky);
    plateMat.color.set(ground);
    waterMat.color.set(th && th.lava ? '#d0501a' : th && th.frozen ? '#5aa0e0' : '#2f6fd0');
    waterMat.emissive.set(th && th.lava ? '#a02800' : '#0a2a60'); waterMat.emissiveIntensity = th && th.lava ? .9 : .35;
    leafMat.color.set(th && th.name === '紫雾林' ? '#7a5aa8' : th && th.frozen ? '#6a9a8a' : '#3f8a3a');
  }
  function setQuality(q) {
    view.quality = q;
    sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    leafM.visible = trunkM.visible = q === 'high';
  }
  function resize(w, h, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); view.snap = true; }
  function stats() { const i = renderer.info.render; return { calls: i.calls, triangles: i.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; }
  Object.assign(view, { renderer, scene, camera, update, effect, setWorld, setQuality, resize, stats, get world() { return world; } });
  return view;
}
function brickCell(T, cx, cy) { const i = cy * 2 * Q + cx * 2; return T.brick[i] | T.brick[i + 1] | T.brick[i + Q] | T.brick[i + Q + 1]; }
