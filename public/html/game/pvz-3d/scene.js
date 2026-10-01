import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';

// All art is procedural: primitive meshes + canvas-drawn textures. Nothing is taken from the original game.
export const CELL = 2.2, COLS = 9, ROWS = 5;
const wx = x => (x - 4) * CELL, wz = z => (z - 2) * CELL;
const TAU = Math.PI * 2;
function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const icoGeo = new THREE.IcosahedronGeometry(1, 1);
const lowIco = new THREE.IcosahedronGeometry(1, 0);
const matCache = new Map();
function mat(color, rough = .6, metal = .1) { const k = color + rough + metal; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); return matCache.get(k); }
function mesh(parent, geo, material, x, y, z, sx, sy, sz, shadow = true) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// --- Plant models -----------------------------------------------------------
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function stemAndLeaves(g, stemColor = '#4e8a2e') {
  mesh(g, cylGeo, mat(stemColor, .7), 0, .26, 0, .09, .52, .09);
  const l1 = mesh(g, lowIco, mat('#5a9a36', .75), .2, .06, .05, .2, .05, .09); l1.rotation.z = -.3;
  const l2 = mesh(g, lowIco, mat('#5a9a36', .75), -.2, .06, -.05, .2, .05, .09); l2.rotation.z = .3;
}
function sunflowerModel() {
  const g = new THREE.Group();
  stemAndLeaves(g);
  const head = pivot(g, 0, .92, 0); head.rotation.x = -.28;
  mesh(head, icoGeo, mat('#8a5a28', .8), 0, 0, 0, .24, .2, .1);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU;
    const p = mesh(head, lowIco, mat(i % 2 ? '#ffd23f' : '#ffc01e', .6), Math.cos(a) * .32, Math.sin(a) * .32, 0, .13, .07, .05);
    p.rotation.z = a;
  }
  return { group: g, head, kind: 'sunflower' };
}
function shooterModel(kind) {
  const g = new THREE.Group();
  stemAndLeaves(g);
  const ice = kind === 'snowpea';
  const bodyColor = ice ? '#7fd4ef' : '#67b53a';
  const head = pivot(g, 0, .88, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: .55 });
  mesh(head, icoGeo, headMat, 0, 0, 0, .3, .28, .3);
  const snout = mesh(head, cylGeo, headMat, .3, .02, 0, .11, .3, .11); snout.rotation.z = -Math.PI / 2;
  mesh(head, cylGeo, mat(ice ? '#4d9cb8' : '#3e7d28', .6), .45, .02, 0, .13, .06, .13).rotation.z = -Math.PI / 2;
  if (ice) for (let i = 0; i < 3; i++) mesh(head, lowIco, mat('#eaf9ff', .3), -.06 + i * .09, .3 - i * .04, i % 2 ? .12 : -.12, .06, .08, .06);
  return { group: g, head, snout, headMat, kind, baseY: .88 };
}
function wallnutModel() {
  const g = new THREE.Group();
  const nut = mesh(g, icoGeo, new THREE.MeshStandardMaterial({ color: '#c08c4a', roughness: .8, flatShading: true }), 0, .58, 0, .42, .58, .42);
  for (const s of [-1, 1]) {
    mesh(g, lowIco, mat('#fdf6e4', .5), s * .12, .72, .36, .08, .1, .04);
    mesh(g, lowIco, mat('#33291a', .5), s * .12, .72, .4, .04, .05, .02);
  }
  return { group: g, nut, kind: 'wallnut' };
}
function cherryModel() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e33b2f', roughness: .45 });
  const a = mesh(g, icoGeo, red, -.18, .5, .05, .26, .26, .26);
  const b = mesh(g, icoGeo, red, .2, .58, -.04, .3, .3, .3);
  mesh(g, cylGeo, mat('#5a7a2e', .7), -.14, .82, .02, .025, .3, .025).rotation.z = .3;
  mesh(g, cylGeo, mat('#5a7a2e', .7), .16, .9, -.02, .025, .34, .025).rotation.z = -.25;
  return { group: g, redMat: red, berries: [a, b], kind: 'cherry' };
}
const PLANT_BUILDERS = { sunflower: sunflowerModel, peashooter: () => shooterModel('peashooter'), snowpea: () => shooterModel('snowpea'), wallnut: wallnutModel, cherry: cherryModel };

// --- Zombie models ----------------------------------------------------------
function zombieModel(kind) {
  const garg = kind === 'garg';
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: garg ? '#7d9468' : '#9db88a', roughness: .7 });
  const cloth = new THREE.MeshStandardMaterial({ color: garg ? '#4a4038' : '#6a6f78', roughness: .85 });
  const pants = new THREE.MeshStandardMaterial({ color: '#453c30', roughness: .9 });
  const legL = pivot(g, 0, .8, .16), legR = pivot(g, 0, .8, -.16);
  mesh(legL, boxGeo, pants, -.12, -.4, 0, .2, .8, .22);
  mesh(legR, boxGeo, pants, .12, -.4, 0, .2, .8, .22);
  const body = pivot(g, 0, .8, 0);
  mesh(body, boxGeo, cloth, 0, .38, 0, .52, .8, .5);
  mesh(body, boxGeo, cloth, 0, .62, 0, .6, .24, .56);
  const head = pivot(body, 0, .95, 0);
  mesh(head, boxGeo, skin, 0, .18, 0, .46, .44, .42);
  for (const s of [-1, 1]) mesh(head, boxGeo, mat('#26301e', .4), -.23, .22, s * .1, .03, .07, .07);
  mesh(head, boxGeo, mat('#3a3226', .9), -.05, .42, 0, .2, .06, .3);
  const armL = pivot(body, .05, .68, .3), armR = pivot(body, .05, .68, -.3);
  for (const arm of [armL, armR]) {
    mesh(arm, boxGeo, cloth, -.28, 0, 0, .56, .15, .15);
    mesh(arm, boxGeo, skin, -.6, 0, 0, .14, .13, .13);
    arm.rotation.z = .35;   // reach toward -x
  }
  let hat = null;
  if (kind === 'cone') { hat = new THREE.Mesh(new THREE.ConeGeometry(.26, .52, 10), new THREE.MeshStandardMaterial({ color: '#e08a3a', roughness: .6 })); hat.position.set(0, .58, 0); head.add(hat); }
  if (kind === 'bucket') { hat = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, .46, 12), new THREE.MeshStandardMaterial({ color: '#9aa2ac', roughness: .35, metalness: .55 })); hat.position.set(0, .56, 0); head.add(hat); }
  if (garg) { const club = mesh(body, boxGeo, mat('#6b4a2e', .85), -.5, .5, .18, 1.0, .2, .2); club.rotation.z = .5; }
  if (garg) g.scale.setScalar(1.65);
  return { group: g, legL, legR, body, head, armL, armR, skin, cloth, pants, kind };
}

export function createScene(canvas, world) {
  const tmpObj = new THREE.Object3D();
  const tmpVec = new THREE.Vector3();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#aacfdf'); scene.fog = new THREE.Fog('#aacfdf', 55, 130);
  const camera = new THREE.PerspectiveCamera(40, 1, .3, 240);
  scene.add(new THREE.HemisphereLight('#eaf4ff', '#4a5a34', 1.5));
  const sun = new THREE.DirectionalLight('#fff2da', 2.4); sun.position.set(-14, 26, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 20, bottom: -20, near: 1, far: 80 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);

  // --- Static diorama: lawn, house, road, graveyard, clouds.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: '#79a455', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.5; ground.receiveShadow = true; scene.add(ground);
  const bed = mesh(scene, boxGeo, mat('#5e4a34', .95), 0, -.3, 0, CELL * 10.4, .4, CELL * 5.9, false);
  bed.receiveShadow = true;
  const R = rngFrom(42);
  const tileMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9 });
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * .96, .34, CELL * .96), tileMat, COLS * ROWS);
  tiles.receiveShadow = true; tiles.castShadow = false;
  const tint = new THREE.Color();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    tmpObj.position.set(wx(c + .5), -.13, wz(r + .5)); tmpObj.rotation.set(0, 0, 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
    tiles.setMatrixAt(i, tmpObj.matrix);
    tint.setHSL(.26, (r + c) % 2 ? .42 : .38, (r + c) % 2 ? .42 : .37 + R() * .02);
    tiles.setColorAt(i, tint);
  }
  scene.add(tiles);
  // House (left side, behind the lawn).
  const house = new THREE.Group(); house.position.set(wx(-1.9), 0, 0); scene.add(house);
  mesh(house, boxGeo, mat('#c99a6a', .8), -.8, 1.25, 0, 3.4, 2.5, CELL * ROWS + 1.6);
  const roofL = mesh(house, boxGeo, mat('#8a4a3a', .8), -1.35, 3.15, 0, 2.6, .16, CELL * ROWS + 2.2); roofL.rotation.z = .62;
  const roofR = mesh(house, boxGeo, mat('#8a4a3a', .8), -.25, 3.15, 0, 2.6, .16, CELL * ROWS + 2.2); roofR.rotation.z = -.62;
  mesh(house, boxGeo, mat('#5a3a24', .8), .91, .8, 1.4, .12, 1.6, 1.1);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) mesh(house, boxGeo, mat('#ffe9a8', .3), .92, 1.7, z, .06, .7, .8);
  mesh(house, cylGeo, mat('#3c342a', .6), 1.1, 2.2, -4.4, .06, 1.4, .06);
  const lamp = mesh(house, lowIco, new THREE.MeshStandardMaterial({ color: '#ffdf8a', emissive: '#ffb42a', emissiveIntensity: .8 }), 1.1, 3, -4.4, .14, .18, .14);
  lamp.castShadow = false;
  // Road + graveyard (right side).
  mesh(scene, boxGeo, mat('#43464c', .95), wx(9.9), -.31, 0, 2.2, .36, CELL * ROWS + 2, false);
  for (let i = 0; i < 7; i++) mesh(scene, boxGeo, mat('#c9c9bd', .9), wx(9.9) + (R() - .5) * .5, -.3, -CELL * 2.4 + i * 1.7, .5, .02, .7, false);
  mesh(scene, boxGeo, mat('#4c4a42', .95), wx(11.9), -.32, 0, 5.6, .38, CELL * ROWS + 3.4, false);
  for (let i = 0; i < 9; i++) {
    const x = wx(10.9 + R() * 2.1), z = (R() - .5) * (CELL * ROWS + 1);
    const stone = mesh(scene, boxGeo, mat(i % 3 ? '#8b8d8a' : '#7a7c78', .9), x, .3, z, .8, 1, .28);
    stone.rotation.y = (R() - .5) * .8;
    mesh(scene, cylGeo, mat(i % 3 ? '#8b8d8a' : '#7a7c78', .9), x, .8, z, .4, .06, .28, false).rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    const x = wx(12.4 + R()), z = (R() - .5) * 9;
    mesh(scene, cylGeo, mat('#3d3630', .95), x, 1.1, z, .18, 2.2, .18);
    const br = mesh(scene, cylGeo, mat('#3d3630', .95), x + .3, 1.8, z, .09, 1, .09); br.rotation.z = -.8;
  }
  for (let i = 0; i < 8; i++) mesh(scene, boxGeo, mat('#5a4630', .9), wx(13.9), .5, -CELL * 2.5 + i * 1.55, .18, 1.9, .18);
  mesh(scene, boxGeo, mat('#5a4630', .9), wx(13.9), 1.1, 0, .12, .14, CELL * ROWS + 1.2);
  // Clouds.
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    for (let k = 0; k < 3; k++) mesh(g, lowIco, cm, k * 1.4 - 1.4, (R() - .5) * .4, (R() - .5) * .8, 1.6 + R(), .9 + R() * .4, 1.2);
    g.position.set((R() - .5) * 60, 11 + R() * 5, -26 - R() * 14);
    scene.add(g); clouds.push(g);
  }

  // --- Cell cursor.
  const cursorGroup = new THREE.Group();
  const cursorFill = new THREE.Mesh(new THREE.PlaneGeometry(CELL * .96, CELL * .96), new THREE.MeshBasicMaterial({ color: '#8ef06a', transparent: true, opacity: .2, depthWrite: false }));
  cursorFill.rotation.x = -Math.PI / 2;
  const cursorEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * .96, .04, CELL * .96)), new THREE.LineBasicMaterial({ color: '#d6ff5a' }));
  cursorGroup.add(cursorFill, cursorEdge); cursorGroup.position.y = .04; scene.add(cursorGroup);

  // --- Dynamic pools.
  const plantPool = new Map(), zombiePool = new Map();
  const plantViews = new Map(), zombieViews = new Map();
  const sunPool = [], sunGlow = glowTex('#fff7c8ff', '#ffd23f00');
  function newSun() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(icoGeo, new THREE.MeshBasicMaterial({ color: '#ffd94a' })); core.scale.setScalar(.3); g.add(core);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(1.5, 1.5, 1); g.add(sp);
    scene.add(g); return { group: g, core };
  }
  const peaPool = [];
  const peaMats = { green: new THREE.MeshBasicMaterial({ color: '#8fe05a' }), ice: new THREE.MeshBasicMaterial({ color: '#aee9ff' }) };
  function newPea() { const m = new THREE.Mesh(icoGeo, peaMats.green); m.scale.setScalar(.15); scene.add(m); return m; }
  const mowers = [];
  for (let r = 0; r < ROWS; r++) {
    const g = new THREE.Group();
    mesh(g, boxGeo, mat('#c94a3a', .55, .3), 0, .3, 0, .6, .3, .5);
    mesh(g, boxGeo, mat('#8a2e24', .6), .32, .18, 0, .16, .26, .48);
    mesh(g, cylGeo, mat('#5a5f66', .5, .5), .38, .16, 0, .16, .34, .16).rotation.z = Math.PI / 2;
    const handle = mesh(g, boxGeo, mat('#3c4046', .5, .4), -.4, .55, .2, .06, .7, .06); handle.rotation.x = .5;
    g.position.set(wx(-.75), 0, wz(r + .5)); scene.add(g); mowers.push(g);
  }

  // --- FX.
  const fx = [];
  const flashTex = glowTex('#fffbe8ff', '#ff8a2a00');
  function addFx(obj, o) { scene.add(obj); fx.push({ obj, life: o.life, max: o.life, type: o.type, vel: o.vel || null, spin: o.spin || 0, s0: o.s0 || 1, s1: o.s1 || 1, dispose: o.dispose, op: o.op ?? 1 }); if (fx.length > 300) { const f = fx.shift(); scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); } }
  const debrisMats = { zombie: mat('#5a6a4c', .8), plant: mat('#4e8a2e', .8), dirt: mat('#5e4a34', .9), gold: mat('#e2b233', .5, .4), grey: mat('#8b8d8a', .8) };
  function debris(x, y, z, kind, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const s = .09 + Math.random() * .14, m = new THREE.Mesh(boxGeo, debrisMats[kind]); m.scale.setScalar(s); m.position.set(x, y, z); m.castShadow = true;
      const v = new THREE.Vector3((Math.random() - .5) * 4 * power, 2.5 + Math.random() * 4, (Math.random() - .5) * 4 * power);
      addFx(m, { type: 'debris', life: .8 + Math.random() * .5, vel: v, spin: (Math.random() - .5) * 12, s0: s });
    }
  }
  function fireball(x, y, z, scale, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(icoGeo, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? '#fff1a8' : i % 3 === 1 ? '#ffb13b' : '#ff6a22', transparent: true, depthWrite: false }));
      m.position.set(x + (Math.random() - .5) * scale * .7, y + Math.random() * scale * .5, z + (Math.random() - .5) * scale * .7);
      addFx(m, { type: 'fire', life: .35 + Math.random() * .3, s0: scale * .2, s1: scale * (.6 + Math.random() * .5), dispose: true, vel: new THREE.Vector3(0, 1.4, 0) });
    }
  }
  function ring(x, z, radius, color = '#ffe27a') {
    const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); addFx(m, { type: 'ring', life: .5, s0: .3, s1: radius, dispose: true, op: .8 });
  }
  function flashAt(x, y, z, size, life = .12, tex = flashTex) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z); addFx(s, { type: 'flash', life, s0: size, s1: size * 1.4, dispose: true });
  }

  // --- Camera.
  const DEFAULT_PITCH = .95;
  let pitch = DEFAULT_PITCH, elapsed = 0, shakeT = 0;
  const target = new THREE.Vector3(1.4, 0, 0), camPos = new THREE.Vector3();
  function fitDistance() {
    const aspect = Math.max(.6, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const byH = (9 * Math.sin(pitch) + 2.6) / Math.tan(vFov / 2), byW = 15.4 / Math.tan(hFov / 2);
    return Math.max(byH, byW) * 1.04;
  }

  // --- Sync helpers.
  function getPlantModel(kind) {
    let pool = plantPool.get(kind); if (!pool) { pool = []; plantPool.set(kind, pool); }
    let m = pool.pop();
    if (!m) { m = PLANT_BUILDERS[kind](); scene.add(m.group); }
    m.group.visible = true; m.born = elapsed; return m;
  }
  function releasePlant(m) { m.group.visible = false; plantPool.get(m.kind).push(m); }
  function getZombieModel(kind) {
    let pool = zombiePool.get(kind); if (!pool) { pool = []; zombiePool.set(kind, pool); }
    let m = pool.pop();
    if (!m) { m = zombieModel(kind); scene.add(m.group); }
    m.group.visible = true; return m;
  }
  function releaseZombie(m) { m.group.visible = false; zombiePool.get(m.kind).push(m); }

  function syncPlant(idx, p, snap) {
    let view = plantViews.get(idx);
    if (view && view.kind !== p.kind) { releasePlant(view); view = null; }
    if (!view) { view = getPlantModel(p.kind); plantViews.set(idx, view); }
    const col = idx % COLS, row = Math.floor(idx / COLS);
    const g = view.group;
    g.position.set(wx(col + .5), 0, wz(row + .5));
    g.rotation.y = (R0(col, row) - .5) * .3;
    const pop = Math.min(1, (elapsed - view.born) / .3), s = .5 + .5 * (1 - Math.pow(1 - pop, 3));
    let dmg = 1;
    if (p.kind === 'wallnut') dmg = .82 + .18 * Math.max(0, p.hp / p.maxHp);
    g.scale.setScalar(s * dmg);
    if (view.head) view.head.rotation.z = Math.sin(elapsed * 2 + col * 1.3 + row) * .09;
    if (view.kind === 'peashooter' || view.kind === 'snowpea') {
      view.head.position.x = -(p.recoil || 0) * .22;
      if (p.recoil > .5) flashAt(g.position.x + .45, .92, g.position.z, .5, .08);
    }
    if (view.kind === 'sunflower') {
      const glow = p.glow > 0 ? p.glow : 0;
      view.head.scale.setScalar(1 + glow * .25);
    }
    if (view.kind === 'cherry') {
      const k = Math.max(0, 1 - p.fuse / .9);
      view.redMat.emissive.set('#ff3a1a'); view.redMat.emissiveIntensity = .3 + k * 1.4 * (Math.floor(elapsed * 14) % 2 ? 1 : .4);
      g.scale.setScalar(s * (1 + k * .12));
    }
    if (view.nut) { view.nut.material.emissive.set('#ffffff'); view.nut.material.emissiveIntensity = p.flash > 0 ? .7 : 0; }
  }
  const R0 = () => 1;
  function syncZombie(z) {
    let view = zombieViews.get(z.id);
    if (!view) { view = getZombieModel(z.kind); zombieViews.set(z.id, view); }
    view.seen = true;
    const g = view.group, speedK = z.def.speed;
    g.position.set(wx(z.x), 0, wz(z.row + .5));
    if (z.dead) {
      const k = Math.min(1, z.deadT / .6);
      g.rotation.z = k * Math.PI / 2 * .95;
      if (z.deadT > .7) g.position.y = -(z.deadT - .7) * 1.2;
      return;
    }
    const t = elapsed * (5 + speedK * 6) + z.id * 1.7;
    if (z.eating) {
      view.armL.rotation.y = Math.sin(elapsed * 12) * .45;
      view.armR.rotation.y = Math.sin(elapsed * 12 + 2) * .45;
      view.head.rotation.z = Math.sin(elapsed * 12) * .12;
    } else {
      view.armL.rotation.y = Math.sin(t) * .12; view.armR.rotation.y = Math.sin(t + 2) * .12;
      view.head.rotation.z = 0;
    }
    view.legL.rotation.z = Math.sin(t) * .45; view.legR.rotation.z = -Math.sin(t) * .45;
    view.body.position.y = .8 + Math.abs(Math.sin(t)) * .05;
    view.body.rotation.z = .07;
    const hit = z.flash > 0 ? .85 : 0, cold = z.slow > 0 ? .4 + .12 * Math.sin(elapsed * 6) : 0;
    view.skin.emissive.set(hit ? '#ffffff' : '#2a6dff'); view.skin.emissiveIntensity = hit || cold;
    view.cloth.emissive.set(hit ? '#ffffff' : '#2a6dff'); view.cloth.emissiveIntensity = hit || cold * .5;
  }

  function update(dt, active = true) {
    elapsed += active ? dt : 0;
    shakeT = Math.max(0, shakeT - dt * 2);
    // Plants.
    const seenCells = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const p = world.grid[i];
      if (!p) continue;
      seenCells.push(i);
      syncPlant(i, p);
      if (p.glow > 0) p.glow = Math.max(0, p.glow - dt * 2.2);
    }
    for (const [idx, view] of plantViews) if (!seenCells.includes(idx)) { releasePlant(view); plantViews.delete(idx); }
    // Zombies.
    for (const view of zombieViews.values()) view.seen = false;
    for (const z of world.zombies) syncZombie(z);
    for (const [id, view] of zombieViews) if (!view.seen) { releaseZombie(view); zombieViews.delete(id); }
    // Peas.
    while (peaPool.length < world.peas.length) peaPool.push(newPea());
    peaPool.forEach((m, i) => {
      const pea = world.peas[i]; m.visible = !!pea && pea.alive; if (!pea || !pea.alive) return;
      m.material = peaMats[pea.snow ? 'ice' : 'green'];
      m.position.set(wx(pea.x), .82, wz(pea.row + .5));
      m.rotation.y += dt * 8;
    });
    // Suns.
    while (sunPool.length < world.suns.length) sunPool.push(newSun());
    sunPool.forEach((s, i) => {
      const su = world.suns[i]; s.group.visible = !!su && su.alive; if (!su || !su.alive) return;
      s.group.position.set(wx(su.x), su.y + Math.sin(elapsed * 2.4 + su.x) * .08, wz(su.z));
      s.group.rotation.y += dt * 2.4;
      s.core.rotation.x += dt * 1.6;
      if (su.state === 'sit' && su.life < 3) s.group.visible = Math.floor(elapsed * 6) % 2 === 0;
    });
    // Mowers.
    world.mowers.forEach((m, i) => {
      const g = mowers[i];
      g.visible = m.state !== 'gone';
      g.position.x = wx(m.x);
      if (m.state === 'run') { g.position.y = Math.abs(Math.sin(elapsed * 30)) * .06; g.rotation.z = Math.sin(elapsed * 40) * .04; }
      else { g.position.y = 0; g.rotation.z = 0; }
    });
    // Cursor.
    const cur = world.cursor;
    cursorGroup.visible = !!(cur && cur.visible && world.playing);
    if (cursorGroup.visible) {
      cursorGroup.position.set(wx(cur.col + .5), .04, wz(cur.row + .5));
      const c = cur.valid ? '#d6ff5a' : '#ff6a4a';
      cursorEdge.material.color.set(c);
      cursorFill.material.color.set(cur.valid ? '#8ef06a' : '#ff8a6a');
      cursorFill.material.opacity = .16 + .08 * Math.sin(elapsed * 6);
    }
    // Clouds drift.
    for (const c of clouds) { c.position.x += dt * .5; if (c.position.x > 44) c.position.x = -44; }
    // FX.
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt; const t = 1 - Math.max(0, f.life) / f.max, o = f.obj;
      if (f.type === 'debris') {
        f.vel.y -= 16 * dt; o.position.addScaledVector(f.vel, dt);
        if (o.position.y < o.scale.x / 2) { o.position.y = o.scale.x / 2; f.vel.y *= -.3; f.vel.x *= .5; f.vel.z *= .5; }
        o.rotation.x += f.spin * dt; o.rotation.z += f.spin * .6 * dt;
        if (t > .7) o.scale.setScalar(f.s0 * (1 - (t - .7) / .3));
      } else if (f.type === 'fire' || f.type === 'ring' || f.type === 'flash') {
        const e = 1 - Math.pow(1 - t, 3), s = f.s0 + (f.s1 - f.s0) * e;
        if (f.type === 'ring') o.scale.set(s, s, s); else o.scale.setScalar(s);
        if (f.vel) o.position.addScaledVector(f.vel, dt);
        o.material.opacity = f.op * (1 - t);
      }
      if (f.life <= 0) { scene.remove(o); if (f.dispose) o.material.dispose(); fx.splice(i, 1); }
    }
    // Camera.
    sun.position.set(target.x - 12, 26, target.z + 12); sun.target.position.set(target.x, 0, target.z);
    const dist = fitDistance();
    camPos.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    if (shakeT > 0) camPos.add(tmpVec.set((Math.random() - .5) * shakeT, (Math.random() - .5) * shakeT, (Math.random() - .5) * shakeT));
    camera.position.copy(camPos);
    camera.lookAt(target.x, .4, target.z);
    renderer.render(scene, camera);
  }

  // World event → visual effect. Events carry cell coords: e.x = col+0.5, e.z = row+0.5.
  function effect(e) {
    const x = e.x !== undefined ? wx(e.x) : 0, z = e.z !== undefined ? wz(e.z) : 0;
    switch (e.type) {
      case 'plant': ring(x, z, 1.4, '#b6f06a'); debris(x, .4, z, 'dirt', 3, .5); break;
      case 'shovel': debris(x, .4, z, 'dirt', 5, .8); break;
      case 'peaHit': flashAt(x, .85, z, .55, .1); break;
      case 'zombieHit': flashAt(x, 1.1, z, .7, .09); break;
      case 'zombiedie': debris(x, .8, z, 'zombie', 5, .8); flashAt(x, .9, z, .8, .14); break;
      case 'smash': shakeT = Math.max(shakeT, .3); debris(x, .5, z, 'plant', 8, 1.1); break;
      case 'boom': fireball(x, .7, z, 3.4, 12); ring(x, z, 4.6, '#ffb13b'); shakeT = Math.max(shakeT, .55); debris(x, .6, z, 'grey', 8, 1.2); break;
      case 'mower': shakeT = Math.max(shakeT, .18); break;
      case 'sunpick': flashAt(x, 1, z, 1.6, .2, sunGlowTex); ring(x, z, 1.6, '#ffe27a'); break;
      case 'spawn': ring(x, z, 1.2, '#b98ae0'); break;
    }
  }
  const sunGlowTex = glowTex('#fff7c8ff', '#ffb62e00');

  // Pointer (screen px) → lawn cell coords {x: col float, z: lane float}. Handles the
  // portrait-play case where the whole container is rotated 90° via CSS.
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    let ndx, ndy;
    if (document.getElementById('game').classList.contains('portrait-play')) {
      const u = clientY - (r.top + r.height / 2), v = -(clientX - (r.left + r.width / 2));
      ndx = u / (canvas.clientWidth / 2); ndy = -v / (canvas.clientHeight / 2);
    } else {
      ndx = 2 * (clientX - r.left) / r.width - 1; ndy = 1 - 2 * (clientY - r.top) / r.height;
    }
    ndc.set(ndx, ndy); ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x / CELL + 4, z: hit.z / CELL + 2 };
  }
  function reset() {
    for (const [, view] of plantViews) releasePlant(view);
    plantViews.clear();
    for (const [, view] of zombieViews) releaseZombie(view);
    zombieViews.clear();
    for (const f of fx) { scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); }
    fx.length = 0; shakeT = 0;
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); update(0, true);
  return { setPitch(p) { pitch = p; }, get pitch() { return pitch; }, update, effect, resize, reset, pick, renderer, scene, camera };
}
