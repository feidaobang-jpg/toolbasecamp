import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';

// Nobita Town Wander 3D — fully procedural low-poly evening town. No external art.
// A generic, abstract "round blue robot-cat head" statue (original design, not a replica
// of any specific character). All buildings/props are primitive meshes + canvas textures.

const TAU = Math.PI * 2;
const WORLD_R = 104;                 // playable radius
const PLACES = [
  { id: 'nobita', x: -54, z: 34 },
  { id: 'school', x: 64, z: 40 },
  { id: 'park', x: 74, z: -16 },
  { id: 'lot', x: 36, z: -60 },
  { id: 'shops', x: -16, z: -68 },
  { id: 'shrine', x: -70, z: -30 },
  { id: 'river', x: -30, z: 66 }
];

function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, n, colors, r) { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } }

const grassTex = () => canvasTex(256, 256, (g, w, h) => {
  const R = rngFrom(21);
  g.fillStyle = '#5d7c44'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 2600, ['#67894c', '#52713c', '#719354', '#4a6636'], R);
}, [26, 26]);
const roadTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(8);
  g.fillStyle = '#8d8577'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 900, ['#837b6e', '#968e80', '#7a7265'], R);
}, [8, 1]);
const stoneTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(12);
  g.fillStyle = '#b8ad98'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#968c78'; g.lineWidth = 2;
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
  noise(g, w, h, 500, ['#aaa08b', '#c2b7a2'], R);
}, [10, 10]);
const wallTex = (base, trim, rows) => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(5);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  noise(g, w, h, 220, ['#00000010', '#ffffff12'], R);
  const bh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
    const x = c * w / 2 + (r % 2 ? w / 8 : 0) + 8, y = r * bh + bh / 2 - 14;
    g.fillStyle = '#2b3542'; g.fillRect(x, y, w / 4 - 16, 28);
    g.fillStyle = '#ffd98f'; g.fillRect(x + 3, y + 3, w / 4 - 22, 22);   // warm evening light inside
  }
  g.fillStyle = trim; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
});
const glowTex = () => canvasTex(64, 64, (g) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, '#fff6d0ee'); grd.addColorStop(.4, '#ffd87388'); grd.addColorStop(1, '#ffd87300');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
});
const waterTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(31);
  g.fillStyle = '#4a7fa8'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 500, ['#5589b2', '#41759e', '#6396bd'], R);
  g.strokeStyle = '#a8d0e8'; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { const y = R() * h; g.beginPath(); g.moveTo(R() * w, y); g.lineTo(R() * w * .4 + 20, y); g.stroke(); }
}, [6, 6]);

// Shared geometry / material caches (object reuse, no per-frame allocation).
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const sphGeo = new THREE.SphereGeometry(1, 18, 14);
const coneGeo = new THREE.ConeGeometry(1, 1, 4);
const matCache = new Map();
function mat(color, rough = .7, metal = .05, emissive = 0) {
  const k = color + rough + metal + emissive;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive || 0x000000 }));
  return matCache.get(k);
}
function mesh(parent, geo, material, x, y, z, sx, sy, sz, shadow = true) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function angLerp(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }

function signTexture(text) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#27405c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3f5f83'; g.fillRect(5, 5, w - 10, h - 10);
    g.strokeStyle = '#ffd873'; g.lineWidth = 6; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#fff6d8'; g.font = '900 40px "Segoe UI","Microsoft YaHei",Arial,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2, w - 36);
  });
}

export function createScene(canvas, tr) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));   // pixel ratio cap 2
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;                        // on-demand shadow map

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f5c98e');
  scene.fog = new THREE.Fog('#f2bd8a', 70, 190);

  const camera = new THREE.PerspectiveCamera(55, 1, .1, 320);

  // Warm evening light.
  const hemi = new THREE.HemisphereLight('#ffdcb4', '#5e6f4a', .95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb36b', 1.5);
  sun.position.set(-60, 48, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
  sun.shadow.camera.far = 260; sun.shadow.bias = -.0015;
  scene.add(sun, sun.target);

  // --- Ground, roads, plaza.
  const world = new THREE.Group(); scene.add(world);
  const ground = mesh(world, new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }), 0, 0, 0, 1, 1, 1, false);
  ground.rotation.x = -Math.PI / 2;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 1 });
  const ring = mesh(world, new THREE.RingGeometry(47, 54, 64), roadMat, 0, .04, 0, 1, 1, 1, false);
  ring.rotation.x = -Math.PI / 2;
  const plaza = mesh(world, new THREE.CircleGeometry(15, 48), new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 1 }), 0, .06, 0, 1, 1, 1, false);
  plaza.rotation.x = -Math.PI / 2;
  for (const p of PLACES) {   // spur path from ring road to each landmark
    const a = Math.atan2(p.x, p.z), d = Math.hypot(p.x, p.z);
    const mid = 50 + (d - 50) / 2, len = d - 46;
    const path = mesh(world, new THREE.PlaneGeometry(4.5, len), roadMat, 0, .05, 0, 1, 1, 1, false);
    path.rotation.x = -Math.PI / 2; path.rotation.z = -a;
    path.position.set(Math.sin(a) * mid, .05, Math.cos(a) * mid);
  }

  // --- Obstacles (circle colliders) shared with the movement code.
  const obstacles = [];
  const solid = (x, z, r) => obstacles.push({ x, z, r });

  // --- Central plaza: abstract round-head blue robot-cat statue (original design).
  const statue = new THREE.Group(); world.add(statue);
  mesh(statue, cylGeo, mat('#b8ad98', .95), 0, .9, 0, 3.4, 1.8, 3.4);
  mesh(statue, cylGeo, mat('#9a8f7a', .95), 0, 1.9, 0, 3.9, .25, 3.9);
  const bodyBlue = mat('#2f7fd6', .5, .15);
  const head = mesh(statue, sphGeo, bodyBlue, 0, 5.6, 0, 2.7, 2.5, 2.6);
  mesh(statue, sphGeo, bodyBlue, 0, 3.5, 0, 2.1, 1.5, 1.9);                 // shoulders
  const face = mesh(statue, sphGeo, mat('#ffffff', .55), 0, 5.15, 1.75, 1.85, 1.3, .95);  // muzzle patch
  mesh(statue, sphGeo, mat('#ffffff', .4), -.9, 6.35, 2.1, .5, .75, .3);     // eyes
  mesh(statue, sphGeo, mat('#ffffff', .4), .9, 6.35, 2.1, .5, .75, .3);
  mesh(statue, sphGeo, mat('#1d2530', .4), -.8, 6.4, 2.36, .16, .28, .1, false);
  mesh(statue, sphGeo, mat('#1d2530', .4), .8, 6.4, 2.36, .16, .28, .1, false);
  mesh(statue, sphGeo, mat('#e0443a', .35), 0, 5.8, 2.55, .3, .27, .27);     // red nose
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++)                        // whiskers
    mesh(statue, boxGeo, mat('#ffffff', .5), s * 2.15, 5.05 + i * .35, 1.8, 1.25, .05, .05, false).rotation.y = s * .1;
  mesh(statue, sphGeo, mat('#ffd23f', .4, .5, 0x443300), 0, 3.5, 2, .42, .42, .2);  // little bell
  solid(0, 0, 4.2);
  for (let i = 0; i < 6; i++) {   // plaza lamps
    const a = i * TAU / 6 + .3, lx = Math.cos(a) * 11.5, lz = Math.sin(a) * 11.5;
    mesh(world, cylGeo, mat('#3a4250', .6, .4), lx, 2.2, lz, .12, 4.4, .12);
    const bulb = mesh(world, sphGeo, mat('#ffe2a0', .4, 0, 0xffc46a55), lx, 4.6, lz, .34, .44, .34, false);
    bulb.material = bulb.material.clone();
    solid(lx, lz, .4);
  }
    for (let i = 0; i < 4; i++) {   // benches
    const a = i * TAU / 4 + Math.PI / 4, bx = Math.cos(a) * 8.5, bz = Math.sin(a) * 8.5;
    const b = new THREE.Group(); b.position.set(bx, 0, bz); b.rotation.y = -a + Math.PI / 2; world.add(b);
    mesh(b, boxGeo, mat('#8a5a33', .85), 0, .45, 0, 2.2, .12, .6);
    mesh(b, boxGeo, mat('#8a5a33', .85), 0, .75, -.28, 2.2, .5, .1);
    for (const s of [-1, 1]) mesh(b, boxGeo, mat('#4a5260', .7), s, .22, 0, .12, .45, .55);
    solid(bx, bz, 1.2);
  }

  // --- Landmarks. Each: build fn, sign group, bell, collider, name/desc via i18n keys.
  const glowMap = glowTex();
  const signs = [], bells = [];
  const signMat = new THREE.MeshStandardMaterial({ roughness: .6, emissive: 0x000000, emissiveIntensity: .9 });

  function makeSign(p, off = 9) {
    const d = Math.hypot(p.x, p.z);
    const sx = p.x - p.x / d * off, sz = p.z - p.z / d * off;   // between the landmark and the plaza
    const g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = Math.atan2(p.x, p.z); world.add(g);
    mesh(g, cylGeo, mat('#5a4632', .85), 0, 1.3, 0, .14, 2.6, .14);
    const board = mesh(g, boxGeo, signMat, 0, 2.6, 0, 2.3, 1.15, .12);
    board.material = signMat.clone();
    mesh(g, boxGeo, mat('#5a4632', .85), 0, 1.95, 0, 1.7, .1, .3);
    solid(sx, sz, .5);
    return board;
  }
  function makeBell(p, bx, bz) {
    const g = new THREE.Group(); g.position.set(bx, 1.5, bz); world.add(g);
    const gold = new THREE.MeshStandardMaterial({ color: '#ffcf4d', roughness: .3, metalness: .6, emissive: '#7a5200' });
    const dome = mesh(g, sphGeo, gold, 0, 0, 0, .48, .5, .48); dome.scale.y = .55;
    mesh(g, cylGeo, gold, 0, .38, 0, .16, .22, .16);
    mesh(g, sphGeo, gold, 0, -.32, 0, .1, .12, .1, false);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false }));
    spr.scale.set(3, 3, 1); g.add(spr);
    g.visible = true;
    return { group: g, taken: false, phase: Math.random() * TAU };
  }
  function place(i, bx, bz, signOff) {
    const p = PLACES[i];
    const board = makeSign(p, signOff);
    const g = board.parent;
    signs.push({ i, board, x: g.position.x, z: g.position.z, lit: false });
    bells.push(Object.assign(makeBell(p, bx, bz), { i }));
  }

  // 1. Nobita's house: two-storey Japanese home + garden gate.
  {
    const g = new THREE.Group(); g.position.set(PLACES[0].x, 0, PLACES[0].z); g.rotation.y = Math.atan2(PLACES[0].x, PLACES[0].z) + Math.PI; world.add(g);
    mesh(g, boxGeo, new THREE.MeshStandardMaterial({ map: wallTex('#e8ddc8', '#8a5a33', 2), roughness: .9 }), 0, 3, 0, 10, 6, 8);
    const roof = mesh(g, coneGeo, mat('#41556b', .8), 0, 7.6, 0, 9.2, 3.6, 9.2); roof.rotation.y = Math.PI / 4;
    mesh(g, boxGeo, mat('#5a4632', .85), 0, 1.1, 4.05, 1.6, 2.2, .12);                 // door
    mesh(g, boxGeo, mat('#8a5a33', .85), -6.4, 1, 4.05, 1.4, 2, .12);                  // gate posts
    mesh(g, boxGeo, mat('#8a5a33', .85), 6.4, 1, 4.05, 1.4, 2, .12);
    mesh(g, boxGeo, mat('#8a5a33', .85), 0, 1.9, 4.05, 12.8, .18, .14);
    for (let x = -11; x <= 11; x += 1.6) mesh(g, boxGeo, mat('#a8b8a0', .9), x, .55, 4.05, .12, 1.1, .1, false);
    solid(PLACES[0].x, PLACES[0].z, 6.4);
    place(0, PLACES[0].x - 4, PLACES[0].z - 8);
  }
  // 2. School: building + oval running track + flag.
  {
    const g = new THREE.Group(); g.position.set(PLACES[1].x + 8, 0, PLACES[1].z + 8); world.add(g);
    mesh(g, boxGeo, new THREE.MeshStandardMaterial({ map: wallTex('#d8cbb2', '#a04a3a', 3), roughness: .9 }), 0, 4.5, 0, 20, 9, 11);
    mesh(g, boxGeo, mat('#8a8070', .9), 0, 9.4, 0, 20.6, .5, 11.6);
    solid(PLACES[1].x + 8, PLACES[1].z + 8, 10.5);
    const track = mesh(world, new THREE.RingGeometry(7, 11, 40), mat('#b0563e', .95), PLACES[1].x, .04, PLACES[1].z, 1, 1, 1, false);
    track.rotation.x = -Math.PI / 2;
    mesh(world, new THREE.CircleGeometry(7, 32), mat('#6f9552', 1), PLACES[1].x, .05, PLACES[1].z, 1, 1, 1, false).rotation.x = -Math.PI / 2;
    mesh(world, cylGeo, mat('#c9ced4', .5, .5), PLACES[1].x - 13, 4, PLACES[1].z, .1, 8, .1);
    mesh(world, boxGeo, mat('#e8e4d8', .8), PLACES[1].x - 12.6, 7.4, PLACES[1].z, 1.2, .7, .06, false);
    place(1, PLACES[1].x - 6, PLACES[1].z - 4);
  }
  // 3. Park: slide + paddling pool.
  {
    const g = new THREE.Group(); g.position.set(PLACES[2].x, 0, PLACES[2].z); world.add(g);
    mesh(world, new THREE.CircleGeometry(9, 32), mat('#dcc38a', 1), PLACES[2].x, .04, PLACES[2].z, 1, 1, 1, false).rotation.x = -Math.PI / 2;
    mesh(g, cylGeo, mat('#9aa8b5', .6), 3, .3, 2, 4.6, .5, 4.6);                       // pool wall
    mesh(g, cylGeo, new THREE.MeshStandardMaterial({ map: waterTex(), roughness: .25 }), 3, .42, 2, 4.2, .1, 4.2, false);
    mesh(g, boxGeo, mat('#3f6fb2', .6), -4, 1.6, -2, 1.2, 3.2, 1.2);                   // slide tower
    const slide = mesh(g, boxGeo, mat('#e2a23c', .5), -1.6, 1.1, -1.1, 4.6, .18, 1.4);
    slide.rotation.y = Math.PI / 2; slide.rotation.z = .5;
    solid(PLACES[2].x - 4, PLACES[2].z - 2, 1.6);
    solid(PLACES[2].x + 3, PLACES[2].z + 2, 4.9);
    place(2, PLACES[2].x - 2, PLACES[2].z - 8);
  }
  // 4. The empty lot: stacked concrete pipes + lumber pile.
  {
    const g = new THREE.Group(); g.position.set(PLACES[3].x, 0, PLACES[3].z); world.add(g);
    const pipeMat = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: .95 });
    const mkPipe = (x, y, z) => { const p = mesh(g, cylGeo, pipeMat, x, y, z, 1.35, 5.5, 1.35); p.rotation.z = Math.PI / 2; p.rotation.y = .3; };
    mkPipe(-2.2, 1.35, 0); mkPipe(2.2, 1.35, .4); mkPipe(0, 3.6, .2);
    solid(PLACES[3].x - 2.2, PLACES[3].z, 2.2); solid(PLACES[3].x + 2.2, PLACES[3].z + .4, 2.2);
    for (let i = 0; i < 6; i++) {
      const w = mesh(g, boxGeo, mat('#9b7440', .9), 6.5 + (i % 3) * .7, .35 + Math.floor(i / 3) * .75, -1.5 + i * .28, 5.5, .6, .55);
      w.rotation.y = .1 * (i - 2);
    }
    solid(PLACES[3].x + 6.5, PLACES[3].z - 1, 2.6);
    place(3, PLACES[3].x - 3, PLACES[3].z - 7);
  }
  // 5. Shopping street: arcade with columns, awnings and signboards.
  {
    const g = new THREE.Group(); g.position.set(PLACES[4].x, 0, PLACES[4].z); g.rotation.y = Math.PI; world.add(g);
    mesh(g, boxGeo, mat('#c8b8a0', .9), 0, 4.6, 0, 26, .6, 10);                        // arcade roof
    const awnColors = ['#d84a3a', '#3f7fbf', '#e2a23c', '#4f9e5a'];
    for (let i = 0; i < 5; i++) {
      const x = -10.8 + i * 5.4;
      for (const z of [-4.6, 4.6]) mesh(g, cylGeo, mat('#8a7a64', .8), x, 2.2, z, .22, 4.4, .22);
      mesh(g, boxGeo, mat('#e8ddc8', .9), x, 1.6, -6.4, 4.6, 3.2, 2.4);                // shop fronts
      const awn = mesh(g, boxGeo, mat(awnColors[i], .7), x, 3.1, -5.2, 4.4, .14, 1.8, false);
      awn.rotation.x = .35;
      mesh(g, boxGeo, mat('#27405c', .7), x, 4, -5.4, 2.6, .8, .1, false);             // hanging board
    }
    for (let i = 0; i < 5; i++) {
      solid(PLACES[4].x - 10.8 + i * 5.4, PLACES[4].z - 4.6, .5); solid(PLACES[4].x - 10.8 + i * 5.4, PLACES[4].z + 4.6, .5);
      solid(PLACES[4].x - 10.8 + i * 5.4, PLACES[4].z + 6.4, 2.4);                     // shop fronts (rotated group: local -z -> world +z)
    }
    place(4, PLACES[4].x + 8, PLACES[4].z + 10);
  }
  // 6. Shrine hill: stone steps + torii silhouette on a raised platform.
  {
    const g = new THREE.Group(); g.position.set(PLACES[5].x, 0, PLACES[5].z); world.add(g);
    mesh(g, cylGeo, mat('#7a8a64', 1), 0, 1.1, 0, 11, 2.2, 11);                        // hill platform
    for (let i = 0; i < 4; i++) {                                                      // stone steps down toward plaza
      const sy = 2.2 - i * .5;
      mesh(g, boxGeo, mat('#b8ad98', .95), 11.6 + i * 1.2, sy / 2, 0, 1.3, sy, 6);
    }
    mesh(g, cylGeo, mat('#b8ad98', .95), 0, 2.35, 0, 9.4, .3, 9.4);
    const torii = new THREE.Group(); torii.position.set(8.2, 2.4, 0); g.add(torii);    // abstract torii silhouette
    const red = mat('#c73e2e', .7);
    for (const s of [-1, 1]) { mesh(torii, cylGeo, red, 0, 2.1, s * 2.1, .32, 4.2, .32); mesh(torii, cylGeo, red, 0, 2.1, s * 2.1, .5, .3, .5); }
    mesh(torii, boxGeo, red, -.6, 4.3, 0, 4.4, .5, .7);
    mesh(torii, boxGeo, red, -.5, 3.6, 0, 3.6, .3, .5);
    mesh(g, boxGeo, mat('#8a5a33', .85), -2, 3.6, -2, 2.6, 2.4, 2.6);                  // small shrine hut
    mesh(g, coneGeo, mat('#41556b', .8), -2, 5.4, -2, 2.4, 1.6, 2.4).rotation.y = Math.PI / 4;
    solid(PLACES[5].x, PLACES[5].z, 11.4);
    place(5, PLACES[5].x + 12.6, PLACES[5].z + 2, 14.5);
  }
  // 7. Riverside levee: grass slope + river band.
  {
    const g = new THREE.Group(); g.position.set(PLACES[6].x, 0, PLACES[6].z); world.add(g);
    const water = mesh(world, new THREE.PlaneGeometry(220, 42), new THREE.MeshStandardMaterial({ map: waterTex(), roughness: .2 }), -20, .12, 100, 1, 1, 1, false);
    water.rotation.x = -Math.PI / 2;
    const levee = mesh(world, boxGeo, mat('#6f9552', 1), -20, .9, 80, 220, 2.4, 14, false);
    levee.rotation.x = -.18;
    mesh(g, boxGeo, mat('#b8ad98', .95), 0, .25, 3, 6, .5, 3);                         // stone lookout pad
    for (let i = 0; i < 3; i++) mesh(g, boxGeo, mat('#8a5a33', .85), 0, .5 + i * .4, 5.2 - i * .1, 3, .12, .4, false);
    solid(PLACES[6].x, PLACES[6].z + 3, 3);
    place(6, PLACES[6].x + 5, PLACES[6].z - 4);
  }

  // --- Trees scattered between landmarks (shared geo/mat, cloned meshes).
  {
    const R = rngFrom(77);
    const trunkMat = mat('#7a5a38', .9), leafA = mat('#4e7a3e', .9), leafB = mat('#5c8a46', .9);
    let n = 0, guard = 0;
    while (n < 52 && guard++ < 600) {
      const a = R() * TAU, d = 22 + R() * 78, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x, z) < 20) continue;
      if (Math.abs(Math.hypot(x, z) - 50.5) < 6) continue;                              // keep the ring road clear
      if (z > 66 && x < 30) continue;                                                   // river area
      let bad = false;
      for (const p of PLACES) if (Math.hypot(x - p.x, z - p.z) < 17) { bad = true; break; }
      if (bad) continue;
      const t = new THREE.Group(); t.position.set(x, 0, z); const s = .8 + R() * .8; t.scale.setScalar(s);
      mesh(t, cylGeo, trunkMat, 0, 1.1, 0, .22, 2.2, .22);
      mesh(t, sphGeo, R() < .5 ? leafA : leafB, 0, 2.8, 0, 1.5, 1.6, 1.5);
      mesh(t, sphGeo, leafB, .5, 2.2, .3, .9, .9, .9);
      world.add(t); solid(x, z, .8 * s); n++;
    }
  }

  // --- Player: generic low-poly kid (original design).
  const player = new THREE.Group(); scene.add(player);
  const parts = {};
  {
    const skin = mat('#f0c39a', .7), shirt = mat('#e8652f', .8), pants = mat('#3a5a8c', .8);
    parts.torso = mesh(player, boxGeo, shirt, 0, .95, 0, .52, .62, .3);
    parts.head = mesh(player, sphGeo, skin, 0, 1.55, 0, .34, .36, .32);
    parts.hair = mesh(player, sphGeo, mat('#2b2320', .9), 0, 1.68, -.04, .35, .28, .33, false);
    parts.legL = mesh(player, boxGeo, pants, -.15, .32, 0, .17, .64, .2);
    parts.legR = mesh(player, boxGeo, pants, .15, .32, 0, .17, .64, .2);
    parts.armL = mesh(player, boxGeo, shirt, -.36, 1, 0, .13, .55, .16);
    parts.armR = mesh(player, boxGeo, shirt, .36, 1, 0, .13, .55, .16);
    for (const k of ['legL', 'legR', 'armL', 'armR']) {
      const leg = k.startsWith('leg');
      const pivot = new THREE.Group();
      pivot.position.set(parts[k].position.x, leg ? .64 : 1.28, 0);
      parts[k].position.set(0, leg ? -.32 : -.27, 0);
      pivot.add(parts[k]); player.add(pivot); parts[k] = pivot;
    }
  }

  // --- Camera presets (Q/E cycle, C reset) — same semantics as the site demo-controls.
  const PRESETS = [{ pitch: .34, dist: 8.5, name: 'follow' }, { pitch: .55, dist: 13, name: 'wide' }, { pitch: 1.05, dist: 17, name: 'high' }];
  let presetIdx = 0, camYaw = Math.PI, camPos = new THREE.Vector3(0, 6, 16), camAim = new THREE.Vector3();
  const pPos = new THREE.Vector3(0, 0, 12), pPos2 = new THREE.Vector3();
  let heading = Math.PI, vy = 0, jumpY = 0, walk = 0;
  let shadowDirty = true, frameNo = 0, mode = 'attract', attractA = 0;

  const view = {
    places: PLACES, signs, bells, pos: pPos, obstacles,
    get camYaw() { return camYaw; },
    get presetName() { return PRESETS[presetIdx].name; },
    cycle(dir) { presetIdx = (presetIdx + dir + PRESETS.length) % PRESETS.length; },
    resetCam() { presetIdx = 0; },
    reset() {
      pPos.set(0, 0, 12); heading = Math.PI; camYaw = Math.PI; jumpY = 0; vy = 0; walk = 0;
      presetIdx = 0; mode = 'follow'; shadowDirty = true;
      for (const s of signs) setSignLit(s, false);
      for (const b of bells) { b.taken = false; b.group.visible = true; }
    },
    frameDist: 0,
    // mx: strafe right, mz: forward. Returns true when the player moved.
    update(dt, mx, mz, run, jump) {
      frameNo++;
      const moving = (mx !== 0 || mz !== 0) && mode === 'follow';
      if (moving) {
        const s = Math.sin(camYaw), c = Math.cos(camYaw);
        pPos2.set(-(s * mz) + (c * mx), 0, -(c * mz) + (s * mx));
        const speed = (run ? 9.5 : 5.2) * Math.min(1, Math.hypot(mx, mz));
        const len = Math.hypot(pPos2.x, pPos2.z) || 1;
        pPos2.multiplyScalar(speed * dt / len);
        pPos.x += pPos2.x; pPos.z += pPos2.z;
        // obstacle push-out
        for (const o of obstacles) {
          const dx = pPos.x - o.x, dz = pPos.z - o.z, dd = Math.hypot(dx, dz), min = o.r + .45;
          if (dd < min && dd > 1e-4) { pPos.x = o.x + dx / dd * min; pPos.z = o.z + dz / dd * min; }
        }
        const rr = Math.hypot(pPos.x, pPos.z);                                       // world bounds
        if (rr > WORLD_R) { pPos.x *= WORLD_R / rr; pPos.z *= WORLD_R / rr; }
        if (pPos.z > 74 && pPos.x < 40) pPos.z = 74;                                 // keep out of the river
        const dist = Math.hypot(pPos2.x, pPos2.z);
        this.frameDist = dist;
        heading = angLerp(heading, Math.atan2(pPos2.x, pPos2.z), Math.min(1, dt * 10));
        walk += dist * (run ? 1.5 : 1);
        shadowDirty = true;
      } else this.frameDist = 0;
      // jump
      if (jump && jumpY <= 0 && mode === 'follow') { vy = 5.4; }
      if (vy !== 0 || jumpY > 0) { vy -= 13.5 * dt; jumpY += vy * dt; if (jumpY <= 0) { jumpY = 0; vy = 0; } shadowDirty = true; }
      player.position.set(pPos.x, jumpY, pPos.z);
      player.rotation.y = heading;
      // walk cycle
      const sw = moving ? Math.sin(walk * 3.2) * .6 : 0;
      parts.legL.rotation.x = sw; parts.legR.rotation.x = -sw;
      parts.armL.rotation.x = -sw * .8; parts.armR.rotation.x = sw * .8;
      // bells bob
      const t = performance.now() / 1000;
      for (const b of bells) if (!b.taken) { b.group.position.y = 1.5 + Math.sin(t * 2 + b.phase) * .25; b.group.rotation.y = t * 1.2; }
      // camera
      if (mode === 'attract') {
        attractA += dt * .12;
        camPos.set(Math.cos(attractA) * 34, 15 + Math.sin(attractA * .7) * 3, Math.sin(attractA) * 34);
        camAim.set(0, 4, 0);
        camera.position.lerp(camPos, Math.min(1, dt * 2));
        camera.lookAt(camAim);
      } else {
        const pr = PRESETS[presetIdx];
        const want = heading + Math.PI;
        camYaw = angLerp(camYaw, want, Math.min(1, dt * 5));
        const cd = Math.cos(pr.pitch), sd = Math.sin(pr.pitch);
        camPos.set(pPos.x + Math.sin(camYaw) * pr.dist * cd, jumpY + pr.dist * sd, pPos.z + Math.cos(camYaw) * pr.dist * cd);
        camPos.y = Math.max(1.2, camPos.y);
        camera.position.lerp(camPos, Math.min(1, dt * 8));
        camAim.set(pPos.x, jumpY + 1.7, pPos.z);
        camera.lookAt(camAim);
      }
    },
    setSignLit(i, lit) { setSignLit(signs[i], lit); },
    collectBell(i) { bells[i].taken = true; bells[i].group.visible = false; shadowDirty = true; },
    refreshTexts() {
      for (const s of signs) {
        const board = s.board;
        board.material.map = signTexture(tr('nobitaTown.place_' + PLACES[s.i].id));
        board.material.needsUpdate = true;
      }
    },
    resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    render() {
      if (shadowDirty || frameNo < 4) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
      renderer.render(scene, camera);
    }
  };
  function setSignLit(s, lit) {
    s.lit = lit;
    s.board.material.emissive.set(lit ? '#ffb64f' : '#000000');
    s.board.material.emissiveIntensity = lit ? .55 : 0;
  }
  Object.defineProperty(view, 'cameraMode', {
    get() { return mode; },
    set(v) { if (mode !== v) { mode = v; shadowDirty = true; } }
  });
  return view;
}
