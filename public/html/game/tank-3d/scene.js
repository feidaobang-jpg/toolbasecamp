import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { N, BRICK, STEEL, BASE_WALL, EMPTY, DIRS } from './world.js?v=modes1';

// All art is procedural: primitive meshes + canvas-drawn textures. No sprites or audio from the original game.
const C = N / 2;
const wx = x => x - C, wz = z => z - C;
const TAU = Math.PI * 2;
function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, n, colors, r) { const R = r || Math.random; for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } }
const brickTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(4);
  g.fillStyle = '#cbbd9f'; g.fillRect(0, 0, w, h);
  const rows = 4, bh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
    const x = c * w / 2 + (r % 2) * w / 4, y = r * bh;
    const tone = ['#b24d27', '#bf5a2f', '#a84624', '#c4622f'][Math.floor(R() * 4)];
    g.fillStyle = tone; g.fillRect(x + 3, y + 3, w / 2 - 6, bh - 6);
    g.fillStyle = '#d97a45'; g.fillRect(x + 3, y + 3, w / 2 - 6, 3);
    g.fillStyle = '#7e3319'; g.fillRect(x + 3, y + bh - 6, w / 2 - 6, 3);
  }
  noise(g, w, h, 260, ['#00000022', '#ffffff18'], R);
});
const steelTex = () => canvasTex(128, 128, (g, w, h) => {
  const b = 18;
  g.fillStyle = '#7d858e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - b, b); g.lineTo(b, b); g.lineTo(b, h - b); g.lineTo(0, h); g.fill();
  g.fillStyle = '#4b5159'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w, h); g.lineTo(0, h); g.lineTo(b, h - b); g.lineTo(w - b, h - b); g.lineTo(w - b, b); g.fill();
  const grd = g.createLinearGradient(b, b, w - b, h - b); grd.addColorStop(0, '#c9ced4'); grd.addColorStop(1, '#9aa1a9');
  g.fillStyle = grd; g.fillRect(b, b, w - 2 * b, h - 2 * b);
  for (const [x, y] of [[b + 10, b + 10], [w - b - 10, b + 10], [b + 10, h - b - 10], [w - b - 10, h - b - 10]]) { g.fillStyle = '#6c737b'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.fillStyle = '#eef1f4'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2, 0, TAU); g.fill(); }
});
const treadTex = () => canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#34373b'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = '#1d1f22'; g.fillRect(0, y, w, 3); g.fillStyle = '#4a4e53'; g.fillRect(0, y + 3, w, 1); } }, [1, 4]);
const groundTex = () => canvasTex(256, 256, (g, w, h) => {
  const R = rngFrom(9);
  g.fillStyle = '#23262b'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1400, ['#2c3036', '#1b1d21', '#30343a'], R);
  g.strokeStyle = '#34383f'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
}, [13, 13]);
const concreteTex = () => canvasTex(128, 128, (g, w, h) => { const R = rngFrom(12); g.fillStyle = '#7a7c80'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#6c6e72', '#88898d', '#727478'], R); g.fillStyle = '#5f6165'; g.fillRect(0, h - 3, w, 3); }, [8, 1]);
const grassTex = () => canvasTex(256, 256, (g, w, h) => { const R = rngFrom(21); g.fillStyle = '#4d6b3a'; g.fillRect(0, 0, w, h); noise(g, w, h, 2600, ['#5a7a44', '#435f33', '#628449', '#3f5a30'], R); }, [24, 24]);

function iconTex(type) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#10213acc'; g.strokeStyle = '#ffe27a'; g.lineWidth = 7;
    g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 22); g.fill(); g.stroke();
    g.save(); g.translate(64, 66); g.lineJoin = 'round';
    if (type === 'star') { g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 17 : 40, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); }
    if (type === 'grenade') { g.fillStyle = '#5d8a3a'; g.beginPath(); g.ellipse(0, 8, 27, 32, 0, 0, TAU); g.fill(); g.strokeStyle = '#2f4a1c'; g.lineWidth = 4; for (const y of [-6, 8, 22]) { g.beginPath(); g.moveTo(-24, y); g.lineTo(24, y); g.stroke(); } g.fillStyle = '#c9ced4'; g.fillRect(-10, -34, 20, 12); g.strokeStyle = '#c9ced4'; g.lineWidth = 5; g.beginPath(); g.arc(18, -34, 9, 0, TAU); g.stroke(); }
    if (type === 'helmet') { g.fillStyle = '#c9d2dc'; g.beginPath(); g.arc(0, 10, 36, Math.PI, 0); g.fill(); g.fillRect(-42, 8, 84, 10); g.fillStyle = '#7a8591'; g.fillRect(-36, 18, 72, 6); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-12, -8, 8, 13, -.5, 0, TAU); g.fill(); }
    if (type === 'shovel') { g.rotate(-.7); g.fillStyle = '#9b6a3a'; g.fillRect(-5, -42, 10, 50); g.fillRect(-16, -46, 32, 8); g.fillStyle = '#cfd6dd'; g.beginPath(); g.moveTo(-18, 8); g.lineTo(18, 8); g.lineTo(14, 36); g.lineTo(0, 46); g.lineTo(-14, 36); g.fill(); }
    if (type === 'timer') { g.fillStyle = '#f3f5f7'; g.beginPath(); g.arc(0, 4, 36, 0, TAU); g.fill(); g.strokeStyle = '#2a3446'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#c9ced4'; g.fillRect(-8, -42, 16, 9); g.strokeStyle = '#2a3446'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -20); g.moveTo(0, 4); g.lineTo(17, 12); g.stroke(); }
    if (type === 'tank') { g.fillStyle = '#e2b233'; g.fillRect(-34, -6, 68, 26); g.fillStyle = '#34373b'; g.fillRect(-38, 18, 76, 12); g.fillStyle = '#e2b233'; g.fillRect(-16, -22, 30, 18); g.fillRect(12, -16, 30, 7); }
    g.restore();
  });
}
function textTex(text, color = '#ffffff') {
  return canvasTex(128, 64, (g, w, h) => { g.font = '900 40px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#141820'; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); });
}
const starTex = () => canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, '#ffffffff'); grd.addColorStop(.25, '#fff4b0cc'); grd.addColorStop(1, '#fff4b000');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 9 : 62, a = i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
});
const flashTex = () => canvasTex(64, 64, (g, w, h) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, '#fffbe8ff'); grd.addColorStop(.35, '#ffd66acc'); grd.addColorStop(1, '#ff8a2a00'); g.fillStyle = grd; g.fillRect(0, 0, w, h); });

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const RED = new THREE.Color('#d9352b'), RED2 = new THREE.Color('#e84a3a');
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const icoGeo = new THREE.IcosahedronGeometry(1, 1);
const lowIco = new THREE.IcosahedronGeometry(1, 0);
const matCache = new Map();
function mat(color, rough = .6, metal = .1) { const k = color + rough + metal; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); return matCache.get(k); }
function mesh(parent, geo, material, x, y, z, sx, sy, sz, shadow = true) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }

const TANK_STYLE = {
  player: { main: '#e2b233', dark: '#8f6a17', turret: '#eec04a', hull: [1.02, .34, 1.58], barrel: 1.0 },
  basic: { main: '#b8bec6', dark: '#636a73', turret: '#c9ced5', hull: [1.02, .36, 1.5], barrel: .9 },
  fast: { main: '#c9d6e3', dark: '#4f6378', turret: '#d9e3ec', hull: [.86, .28, 1.7], barrel: 1.08 },
  power: { main: '#b7c3b0', dark: '#586652', turret: '#c7d2c0', hull: [1.0, .34, 1.56], barrel: 1.2 },
  armor: { main: '#9aa3ad', dark: '#4c535b', turret: '#aab2bb', hull: [1.1, .42, 1.6], barrel: .95 }
};
function tankModel(kind, sharedTread) {
  const st = TANK_STYLE[kind] || TANK_STYLE.basic;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
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
  const turret = new THREE.Group(); turret.position.set(0, .3 + hh, .08); body.add(turret);
  const tScale = kind === 'fast' ? .82 : 1;
  const tb = mesh(turret, new THREE.CylinderGeometry(.34 * tScale, .44 * tScale, .3, 8), turretMat, 0, .15, 0, 1, 1, 1); tb.rotation.y = Math.PI / 8;
  mesh(turret, cylGeo, darkMat, .1, .32, .1, .13, .05, .13);
  const barrel = new THREE.Group(); barrel.position.set(0, .17, -.26); turret.add(barrel);
  const tube = mesh(barrel, cylGeo, darkMat, 0, 0, -st.barrel / 2, .075, st.barrel, .075); tube.rotation.x = Math.PI / 2;
  const brake = mesh(barrel, cylGeo, darkMat, 0, 0, -st.barrel, .11, .16, .11); brake.rotation.x = Math.PI / 2;
  const extras = new THREE.Group(); body.add(extras);
  return { group: g, body, turret, barrel, tube, brake, tread, wheels, bodyMat, turretMat, extras, kind, baseColor: new THREE.Color(st.main), turretColor: new THREE.Color(st.turret), barrelLen: st.barrel, level: -1 };
}
function applyPlayerLevel(model, level) {
  if (model.level === level) return;
  model.level = level;
  const len = [1.0, 1.18, 1.18, 1.3][level];
  model.tube.scale.y = len; model.tube.position.z = -len / 2; model.brake.position.z = -len; model.barrelLen = len;
  model.extras.clear();
  if (level >= 2) for (const s of [-1, 1]) mesh(model.extras, boxGeo, mat('#b58a22', .45, .4), s * 1.0, .33, 0, .06, .26, 1.6);
  if (level >= 3) { model.turretMat.emissive.set('#ff9a1f'); model.turretMat.emissiveIntensity = .22; mesh(model.extras, boxGeo, mat('#d9352b', .4, .2), 0, .95, .08, .5, .04, .5); }
  else model.turretMat.emissive.set('#000000');
}
function eagleModel() {
  const g = new THREE.Group();
  const stone = mat('#76787d', .8, .05), bronze = mat('#9a6a2c', .38, .55), gold = mat('#e2b240', .3, .7), white = mat('#f1ede2', .55, .05), beak = mat('#f4c430', .35, .3);
  mesh(g, boxGeo, stone, 0, .12, 0, 1.9, .24, 1.9);
  mesh(g, boxGeo, mat('#8d9095', .7, .05), 0, .36, .05, 1.3, .24, 1.05);
  mesh(g, boxGeo, gold, 0, .36, -.49, 1.1, .12, .04, false);
  const bird = new THREE.Group(); bird.position.y = .48; g.add(bird);
  mesh(bird, icoGeo, bronze, 0, .38, 0, .26, .36, .22);                 // body
  mesh(bird, icoGeo, white, 0, .78, -.04, .16, .16, .15);               // white head
  const b = mesh(bird, new THREE.ConeGeometry(.055, .2, 8), beak, 0, .74, -.2, 1, 1, 1); b.rotation.x = -Math.PI / 2 - .5;  // hooked beak
  for (const s of [-1, 1]) {
    // Broad spread wings: three feather tiers fanning out and up.
    const wing = new THREE.Group(); wing.position.set(s * .18, .52, 0); wing.rotation.z = s * -.35; bird.add(wing);
    for (let i = 0; i < 4; i++) { const f = mesh(wing, boxGeo, i === 3 ? gold : bronze, s * (.2 + i * .19), .06 + i * .07, .02, .26, .08, .42 - i * .06); f.rotation.z = s * -.12 * i; }
    for (let i = 0; i < 3; i++) { const tip = mesh(wing, boxGeo, bronze, s * (.84 + i * .02), .34 - i * .1, .02 + (i - 1) * .12, .3, .05, .09); tip.rotation.z = s * (-.5 + i * .25); }
  }
  for (let i = -1; i <= 1; i++) { const tf = mesh(bird, boxGeo, white, i * .09, .1, .2, .08, .05, .3); tf.rotation.y = i * .35; }
  for (const s of [-1, 1]) mesh(bird, boxGeo, beak, s * .09, .05, -.05, .06, .12, .1);
  const rubble = new THREE.Group(); rubble.visible = false; g.add(rubble);
  const R = rngFrom(33);
  for (let i = 0; i < 14; i++) { const r = mesh(rubble, lowIco, i % 3 ? mat('#3b3a38', .9, 0) : bronze, (R() - .5) * 1.5, .25 + R() * .12, (R() - .5) * 1.5, .12 + R() * .16, .08 + R() * .1, .12 + R() * .16); r.rotation.set(R() * 3, R() * 3, R() * 3); }
  const pole = mesh(rubble, cylGeo, mat('#d9d9d9', .5, .4), .35, .8, .25, .03, 1.2, .03);
  const flag = mesh(rubble, boxGeo, white, .6, 1.25, .25, .46, .3, .02); flag.rotation.z = -.08; pole.rotation.z = .12;
  g.scale.setScalar(1.12);
  return { group: g, bird, rubble };
}
export function createScene(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb9cc'); scene.fog = new THREE.Fog('#9fb9cc', 70, 150);
  const camera = new THREE.PerspectiveCamera(38, 1, .3, 220);
  scene.add(new THREE.HemisphereLight('#e2ecff', '#3b3a2c', 1.7));
  const sun = new THREE.DirectionalLight('#fff0d8', 2.7); sun.position.set(-11, 24, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 70 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);

  // --- Diorama: grass, concrete frame, dark battlefield plate (plate top sits at y=0; nothing coplanar).
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -.42; grass.receiveShadow = true; scene.add(grass);
  const plate = mesh(scene, boxGeo, new THREE.MeshStandardMaterial({ map: groundTex(), roughness: .95 }), 0, -.21, 0, N, .42, N, false);
  plate.material.map.repeat.set(13, 13);
  const frameMat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: .9 });
  for (const [x, z, sx, sz] of [[0, -C - .75, N + 3, 1.5], [0, C + .75, N + 3, 1.5], [-C - .75, 0, 1.5, N], [C + .75, 0, 1.5, N]]) mesh(scene, boxGeo, frameMat, x, .2, z, sx, 1.24, sz, true);
  // Scenery outside the arena (instanced pines and rocks).
  const R = rngFrom(77), trees = [];
  for (let i = 0; i < 140 && trees.length < 70; i++) { const x = (R() - .5) * 90, z = (R() - .5) * 90; if (Math.max(Math.abs(x), Math.abs(z)) < 17.5) continue; trees.push([x, z, .8 + R() * .7]); }
  const trunkM = new THREE.InstancedMesh(cylGeo, mat('#6b4a2e', .9), trees.length), leafM = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), mat('#2f5a33', .85), trees.length * 2);
  const tmp = new THREE.Object3D();
  trees.forEach(([x, z, s], i) => {
    tmp.position.set(x, .2 * s - .4, z); tmp.scale.set(.18 * s, 1.2 * s, .18 * s); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); trunkM.setMatrixAt(i, tmp.matrix);
    for (let k = 0; k < 2; k++) { tmp.position.set(x, (1.2 + k * .9) * s - .4, z); tmp.scale.set((1.05 - k * .3) * s, 1.5 * s, (1.05 - k * .3) * s); tmp.updateMatrix(); leafM.setMatrixAt(i * 2 + k, tmp.matrix); }
  });
  trunkM.castShadow = leafM.castShadow = true; scene.add(trunkM, leafM);

  // --- Walls: one InstancedMesh per material; cells map to instance slots, hidden via zero scale.
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex(), roughness: .85 });
  const steelMat = new THREE.MeshStandardMaterial({ map: steelTex(), roughness: .35, metalness: .55 });
  const brickCells = [], steelCells = [];
  const baseWallSet = new Set(BASE_WALL.map(([x, z]) => z * N + x));
  for (let i = 0; i < N * N; i++) {
    if (world.grid[i] === BRICK || baseWallSet.has(i)) brickCells.push(i);
    if (world.grid[i] === STEEL || baseWallSet.has(i)) steelCells.push(i);
  }
  const bricks = new THREE.InstancedMesh(boxGeo, brickMat, brickCells.length), steels = new THREE.InstancedMesh(boxGeo, steelMat, steelCells.length);
  bricks.castShadow = bricks.receiveShadow = steels.castShadow = steels.receiveShadow = true;
  const brickSlot = new Map(brickCells.map((c, i) => [c, i])), steelSlot = new Map(steelCells.map((c, i) => [c, i]));
  const tint = new THREE.Color(), CR = rngFrom(5);
  brickCells.forEach((c, i) => { tint.setHSL(.04 + CR() * .02, .55, .45 + CR() * .1); bricks.setColorAt(i, tint.lerp(new THREE.Color('#ffffff'), .5)); });
  scene.add(bricks, steels);
  const rise = new Map();                                // cell -> appear animation progress (0..1)
  const shown = new Uint8Array(N * N).fill(255), lastGrid = new Uint8Array(world.grid);
  function writeCell(c, force) {
    const g = world.grid[c];
    if (g !== lastGrid[c]) { if (g !== EMPTY) rise.set(c, 0); lastGrid[c] = g; }
    let v = g;
    if (baseWallSet.has(c) && world.shovel > 0 && world.shovel < 3 && v === STEEL && Math.floor(world.shovel * 5) % 2) v = BRICK; // blink before the steel wears off
    if (!force && shown[c] === v && !rise.has(c)) return;
    shown[c] = v;
    const x = c % N, z = Math.floor(c / N), a = rise.has(c) ? Math.max(.02, 1 - Math.pow(1 - rise.get(c), 3)) : 1;
    const put = (im, slot, on, h) => { if (slot === undefined) return; if (on) { tmp.position.set(wx(x + .5), h * a / 2, wz(z + .5)); tmp.scale.set(.999, h * a, .999); } else { tmp.position.set(0, -50, 0); tmp.scale.set(0, 0, 0); } tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); im.setMatrixAt(slot, tmp.matrix); im.instanceMatrix.needsUpdate = true; };
    put(bricks, brickSlot.get(c), v === BRICK, 1);
    put(steels, steelSlot.get(c), v === STEEL, 1.12);
  }
  for (const c of new Set([...brickCells, ...steelCells])) writeCell(c, true);
  let gridVersion = world.gridVersion;
  bricks.computeBoundingSphere(); steels.computeBoundingSphere();

  const eagle = eagleModel(); eagle.group.position.set(wx(13), 0, wz(25)); eagle.group.rotation.y = Math.PI; scene.add(eagle.group);

  // --- Dynamic pools.
  const sharedTread = treadTex();
  const tankModels = new Map();
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), new THREE.MeshBasicMaterial({ color: '#6fe7ff', wireframe: true, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.visible = false; scene.add(shield);
  const bulletGeo = new THREE.CapsuleGeometry(.1, .26, 3, 8); bulletGeo.rotateX(Math.PI / 2);
  const bulletMats = { player: new THREE.MeshBasicMaterial({ color: '#fff2a0' }), enemy: new THREE.MeshBasicMaterial({ color: '#ff8a52' }) };
  const trailGeo = new THREE.PlaneGeometry(.16, 1); trailGeo.translate(0, .5, 0); trailGeo.rotateX(-Math.PI / 2);
  const trailMats = { player: new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), enemy: new THREE.MeshBasicMaterial({ color: '#ff6a3a', transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
  const bulletPool = [];
  const sparkleTex = starTex(), flash = flashTex();
  const sparkles = [];
  const puTex = {}; const puGroup = new THREE.Group(); puGroup.visible = false; scene.add(puGroup);
  const puSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); puSprite.scale.set(1.9, 1.9, 1); puSprite.position.y = 1.5; puGroup.add(puSprite);
  const puRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 32), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); puRing.rotation.x = -Math.PI / 2; puRing.position.y = .03; puGroup.add(puRing);
  const puBeam = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 3, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2a0', transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); puBeam.position.y = 1.5; puGroup.add(puBeam);
  const scoreTex = new Map();
  const fx = [];
  function addFx(obj, o) { scene.add(obj); fx.push({ obj, life: o.life, max: o.life, type: o.type, vel: o.vel || new THREE.Vector3(), spin: o.spin || 0, s0: o.s0 || 1, s1: o.s1 || 1, dispose: o.dispose, op: o.op ?? 1 }); if (fx.length > 420) { const f = fx.shift(); scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); } }
  const debrisMats = { brick: mat('#b95a2e', .8), steel: mat('#b3b9c0', .4, .5), tank: mat('#4b4f55', .6, .3), gold: mat('#d7a52c', .5, .4), silver: mat('#aab1b9', .5, .4), dirt: mat('#3a3631', .9) };
  function debris(x, y, z, kind, n, power = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      const s = .08 + Math.random() * .16, m = new THREE.Mesh(boxGeo, debrisMats[kind]); m.scale.setScalar(s); m.position.set(x, y, z); m.castShadow = true;
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
  function ring(x, z, radius, color = '#ffd27a') {
    const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); addFx(m, { type: 'ring', life: .5, s0: .3, s1: radius, dispose: true, op: .8 });
  }
  function flashAt(x, y, z, size, life = .12) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); addFx(s, { type: 'flash', life, s0: size, s1: size * 1.4, dispose: true }); }
  function popScore(x, z, value) {
    if (!scoreTex.has(value)) scoreTex.set(value, textTex(String(value), value >= 500 ? '#ffe27a' : '#ffffff'));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: scoreTex.get(value), transparent: true, depthWrite: false })); s.position.set(wx(x), 1.8, wz(z));
    addFx(s, { type: 'score', life: 1.1, s0: 1.6, s1: 1.6, dispose: true, vel: new THREE.Vector3(0, 1.3, 0) });
  }

  // --- Camera: fitted overview by default; Q/E orbit, R/F tilt (low tilt = close follow), C reset.
  const DEFAULT_PITCH = .98, MIN_PITCH = .36, MAX_PITCH = 1.42;
  let yaw = 0, pitch = DEFAULT_PITCH, elapsed = 0, intro = -1, shakeT = 0, sway = 0;
  const target = new THREE.Vector3(), camPos = new THREE.Vector3(), follow = new THREE.Vector3();
  function fitDistance() {
    const aspect = Math.max(.6, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const byH = (14.5 * Math.sin(pitch) + 2.2) / Math.tan(vFov / 2), byW = 15.4 / Math.tan(hFov / 2);
    return Math.max(byH, byW);
  }
  function cameraPose(dt, snap) {
    const p = world.player;
    const low = THREE.MathUtils.clamp((DEFAULT_PITCH - pitch) / (DEFAULT_PITCH - MIN_PITCH), 0, 1);
    const fx0 = p ? wx(p.x) : 0, fz0 = p ? wz(p.z) : 6;
    const k = .12 + .88 * low;
    follow.set(fx0 * k, 0, fz0 * k + (1 - low) * 2.1);
    target.lerp(follow, snap ? 1 : 1 - Math.exp(-4 * dt));
    let dist = fitDistance() * 1.06 * (1 - .66 * low), pt = pitch, yw = yaw, tg = target;
    if (intro >= 0) {
      const t = Math.min(1, intro), e = t * t * (3 - 2 * t);
      const startT = new THREE.Vector3(wx(13), .6, wz(24));
      tg = startT.lerp(target, e); dist = THREE.MathUtils.lerp(6, dist, e); pt = THREE.MathUtils.lerp(.22, pitch, e); yw = THREE.MathUtils.lerp(-.9, yaw, e);
    }
    camPos.set(tg.x + Math.sin(yw) * Math.cos(pt) * dist, tg.y + Math.sin(pt) * dist, tg.z + Math.cos(yw) * Math.cos(pt) * dist);
    camera.position.copy(camPos);
    const sh = world.shake * .22 + shakeT;
    if (sh > 0) camera.position.add(new THREE.Vector3((Math.random() - .5) * sh, (Math.random() - .5) * sh, (Math.random() - .5) * sh));
    camera.lookAt(tg.x, tg.y + .4 * (1 - low), tg.z);
  }

  function syncTank(t, snapRot) {
    let m = tankModels.get(t.id);
    if (!m) { m = tankModel(t.team === 'player' ? 'player' : t.type, sharedTread); m.rot = -t.dir * Math.PI / 2; tankModels.set(t.id, m); scene.add(m.group); m.born = elapsed; }
    m.seen = true;
    if (t.team === 'player') applyPlayerLevel(m, world.level);
    m.group.position.set(wx(t.x), 0, wz(t.z));
    const goal = -t.dir * Math.PI / 2;
    let d = goal - m.rot; d = Math.atan2(Math.sin(d), Math.cos(d));
    m.rot += snapRot ? d : d * Math.min(1, dt_ * 18);
    m.group.rotation.y = m.rot;
    m.tread.offset.y = -t.travel * .55;
    m.wheels.forEach(w => { w.rotation.x = -t.travel * 3; });
    m.body.position.y = t.moving ? Math.abs(Math.sin(elapsed * 22 + t.id)) * .025 : 0;
    m.barrel.position.z = -.26 + (t.recoil || 0) * 1.4;
    const appear = Math.min(1, (elapsed - m.born) / .25); m.group.scale.setScalar(.6 + .4 * appear);
    // Carrier tanks flash red; frozen tanks glow icy; armour hits flash white.
    if (t.team === 'enemy') {
      const red = t.carrier && Math.floor(elapsed * 7) % 2 === 0;
      m.bodyMat.color.copy(red ? RED : m.baseColor); m.turretMat.color.copy(red ? RED2 : m.turretColor);
      const ice = world.freeze > 0 ? .35 + .15 * Math.sin(elapsed * 6) : 0, hit = t.hitFlash > 0 ? .8 : 0;
      m.bodyMat.emissive.set(hit ? '#ffffff' : '#4aa8ff'); m.bodyMat.emissiveIntensity = hit || ice;
    }
  }
  let dt_ = 0;
  const seenTmp = [];
  function update(dt, cam = {}, snap = false) {
    dt_ = dt; elapsed += dt;
    intro = cam.intro === undefined ? -1 : cam.intro;
    sway += ((cam.attract ? Math.sin(elapsed * .22) * .42 : 0) - sway) * Math.min(1, dt * 1.5);
    shakeT = Math.max(0, shakeT - dt * 2);
    // Walls.
    if (world.gridVersion !== gridVersion || rise.size || (world.shovel > 0 && world.shovel < 3.2)) {
      gridVersion = world.gridVersion;
      for (const c of brickCells) writeCell(c, false);
      for (const c of steelCells) writeCell(c, false);
      for (const [c, k] of rise) { const n = Math.min(1, k + dt / .35); rise.set(c, n); writeCell(c, true); if (n >= 1) rise.delete(c); }
    }
    // Tanks.
    for (const m of tankModels.values()) m.seen = false;
    if (world.player && world.player.alive) syncTank(world.player, snap);
    for (const e of world.enemies) if (e.alive) syncTank(e, snap);
    seenTmp.length = 0;
    for (const [id, m] of tankModels) if (!m.seen) seenTmp.push(id);
    for (const id of seenTmp) { const m = tankModels.get(id); scene.remove(m.group); m.bodyMat.dispose(); m.turretMat.dispose(); m.tread.dispose(); tankModels.delete(id); }
    // Shield bubble.
    const p = world.player;
    shield.visible = !!(p && p.alive && p.shield > 0);
    if (shield.visible) { shield.position.set(wx(p.x), .55, wz(p.z)); shield.rotation.y += dt * 2.4; shield.rotation.x = Math.sin(elapsed * 3) * .2; shield.material.opacity = .35 + .25 * Math.abs(Math.sin(elapsed * 9)) * (p.shield < 1.5 ? (Math.floor(elapsed * 10) % 2) : 1); }
    // Bullets.
    while (bulletPool.length < world.bullets.length) { const g = new THREE.Group(); const core = new THREE.Mesh(bulletGeo, bulletMats.player); const tr = new THREE.Mesh(trailGeo, trailMats.player); g.add(core, tr); g.core = core; g.trail = tr; scene.add(g); bulletPool.push(g); }
    bulletPool.forEach((g, i) => {
      const b = world.bullets[i]; g.visible = !!b; if (!b) return;
      g.position.set(wx(b.x), .72, wz(b.z)); g.rotation.y = -b.dir * Math.PI / 2;
      g.core.material = bulletMats[b.team]; g.trail.material = trailMats[b.team];
      g.trail.scale.z = Math.min(1.6, b.age * b.speed * .6) || .01; g.trail.position.z = .12;
    });
    // Spawn sparkles (enemies drop in on a light pillar; the player shimmers in).
    const spawns = world.spawning.map(s => ({ x: s.x, z: s.z, t: s.t, dur: 1 }));
    if (world.playerSpawn) spawns.push({ x: world.playerSpawn.x, z: world.playerSpawn.z, t: world.playerSpawn.t, dur: .8, player: true });
    while (sparkles.length < spawns.length) {
      const g = new THREE.Group(); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.y = .9; g.add(s);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.75, .95, 7, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3.5; g.add(beam);
      g.sprite = s; g.beam = beam; scene.add(g); sparkles.push(g);
    }
    sparkles.forEach((g, i) => {
      const s = spawns[i]; g.visible = !!s; if (!s) return;
      const k = 1 - Math.max(0, s.t) / s.dur;
      g.position.set(wx(s.x), 0, wz(s.z));
      const pulse = .9 + .7 * Math.abs(Math.sin(elapsed * 11)); g.sprite.scale.set(pulse * 1.8, pulse * 1.8, 1); g.sprite.material.rotation = elapsed * 5;
      g.beam.material.opacity = .22 * (1 - k * .6); g.beam.material.color.set(s.player ? '#ffe89a' : '#bfe9ff'); g.beam.scale.set(1 - k * .5, 1, 1 - k * .5);
    });
    // Power-up.
    const pu = world.powerup;
    puGroup.visible = !!pu && !(pu.life < 4 && Math.floor(elapsed * 8) % 2);
    if (pu) {
      if (!puTex[pu.type]) puTex[pu.type] = iconTex(pu.type);
      if (puSprite.material.map !== puTex[pu.type]) { puSprite.material.map = puTex[pu.type]; puSprite.material.needsUpdate = true; }
      puGroup.position.set(wx(pu.x), 0, wz(pu.z)); puSprite.position.y = 1.5 + Math.sin(elapsed * 3) * .18; puRing.rotation.z = elapsed * 1.5; puRing.scale.setScalar(1 + .08 * Math.sin(elapsed * 5));
    }
    // Eagle.
    eagle.bird.visible = world.baseAlive; eagle.rubble.visible = !world.baseAlive;
    if (world.baseAlive) eagle.bird.rotation.y = Math.sin(elapsed * .8) * .05;
    else if (Math.random() < dt * 6) smoke(wx(13), .8, wz(25), 1.4, 1, 2.2);
    // Effects.
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt; const t = 1 - Math.max(0, f.life) / f.max, o = f.obj;
      if (f.type === 'debris') {
        f.vel.y -= 18 * dt; o.position.addScaledVector(f.vel, dt);
        const floor = o.scale.x / 2; if (o.position.y < floor) { o.position.y = floor; f.vel.y *= -.3; f.vel.x *= .55; f.vel.z *= .55; f.spin *= .5; }
        o.rotation.x += f.spin * dt; o.rotation.z += f.spin * .7 * dt;
        if (t > .7) o.scale.setScalar(f.s0 * (1 - (t - .7) / .3));
      } else if (f.type === 'fire' || f.type === 'smoke' || f.type === 'ring' || f.type === 'flash') {
        const e = 1 - Math.pow(1 - t, 3), s = f.s0 + (f.s1 - f.s0) * e;
        if (f.type === 'ring') o.scale.set(s, s, s); else o.scale.setScalar(s);
        o.position.addScaledVector(f.vel, dt); o.rotation.y += f.spin * dt;
        o.material.opacity = f.op * (f.type === 'smoke' ? Math.min(1, (1 - t) * 1.6) : 1 - t);
      } else if (f.type === 'score') { o.position.addScaledVector(f.vel, dt); o.material.opacity = Math.min(1, (1 - t) * 2.5); }
      if (f.life <= 0) { scene.remove(o); if (f.dispose) o.material.dispose(); fx.splice(i, 1); }
    }
    sun.position.set(target.x - 11, 24, target.z + 14); sun.target.position.set(target.x, 0, target.z);
    cameraPose(dt, snap);
    renderer.render(scene, camera);
  }

  // World event → visual effect.
  function effect(e) {
    const x = e.x !== undefined ? wx(e.x) : 0, z = e.z !== undefined ? wz(e.z) : 0;
    switch (e.type) {
      case 'fire': { const [dx, dz] = DIRS[e.dir]; flashAt(x + dx * .35, .72, z + dz * .35, .9, .09); break; }
      case 'brick': for (const c of e.cells) { const cx = wx(c.x + .5), cz = wz(c.z + .5); debris(cx, .6, cz, c.steel ? 'steel' : 'brick', 3, .8, [DIRS[e.dir][0], DIRS[e.dir][1]]); } flashAt(x, .7, z, .8, .1); smoke(x, .5, z, .7, 1, .6); break;
      case 'steel': case 'border': flashAt(x, .7, z, .7, .1); debris(x, .7, z, 'steel', 2, .5); break;
      case 'puff': flashAt(x, .72, z, 1.1, .14); break;
      case 'deflect': flashAt(x, .72, z, 1.2, .16); ring(x, z, 1.2, '#6fe7ff'); break;
      case 'armor': flashAt(x, .9, z, 1, .12); debris(x, .8, z, 'silver', 3, .6); break;
      case 'boom': fireball(x, .7, z, e.big ? 2.2 : 1, e.big ? 7 : 3); smoke(x, .8, z, 1.6, 4); debris(x, .8, z, e.team === 'player' ? 'gold' : 'silver', 10, 1.1); debris(x, .6, z, 'tank', 6, .9); ring(x, z, 3.2); shakeT = Math.max(shakeT, .15); break;
      case 'baseboom': fireball(x, 1, z, 3.4, 10); smoke(x, 1, z, 2.6, 8, 2.4); debris(x, 1, z, 'gold', 16, 1.4); debris(x, .8, z, 'dirt', 12, 1.2); ring(x, z, 5, '#ff9a4a'); shakeT = .6; break;
      case 'score': popScore(e.x, e.z, e.value); break;
      case 'pickup': ring(x, z, 2.4, '#ffe27a'); flashAt(x, 1.2, z, 2.4, .25); break;
      case 'grenade': for (let i = 0; i < 3; i++) ring(0, 0, 14 + i * 3, '#ffb13b'); shakeT = .5; break;
      case 'shovel': for (const [cx, cz] of BASE_WALL) debris(wx(cx + .5), .4, wz(cz + .5), 'dirt', 2, .6); break;
      case 'freeze': ring(0, 0, 16, '#8fd8ff'); break;
    }
  }
  function reset() {
    for (const m of tankModels.values()) { scene.remove(m.group); m.bodyMat.dispose(); m.turretMat.dispose(); m.tread.dispose(); }
    tankModels.clear();
    for (const f of fx) { scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); }
    fx.length = 0; shakeT = 0; gridVersion = -1;
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); target.set(0, 0, 2.1); update(0, {}, true);
  return { setCamera(y,p){yaw=y;pitch=p;}, renderer, scene, camera, update, effect, resize, reset, get yaw() { return yaw; }, get pitch() { return pitch; } };
}
