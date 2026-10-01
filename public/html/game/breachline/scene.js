// Breachline 3D — procedural Three.js rendering. No external assets: geometry + canvas textures only.
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { FIELD, GATE, RIFTS, ENEMY_TYPES, WEAPONS } from './game.js?v=b1';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0), _yq = new THREE.Quaternion();

function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = ((t ^ t >>> 14) >>> 0) / 4294967296; return t; }; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function speckle(g, w, h, n, colors, R) { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); } }

const groundTex = () => canvasTex(256, 256, (g, w, h) => {
  const R = rngFrom(31);
  g.fillStyle = '#2e3340'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1500, ['#2b303d', '#1c202b', '#313645', '#262a35'], R);
  g.strokeStyle = '#1a1d26'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - .5) * 60; y += (R() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
}, [16, 22]);
const wallTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(7);
  g.fillStyle = '#4a4f5e'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 5; r++) for (let c = -1; c < 4; c++) {
    const x = c * w / 3 + (r % 2) * w / 6, y = r * h / 5;
    g.fillStyle = ['#3d4250', '#454a58', '#414653'][(R() * 3) | 0]; g.fillRect(x + 2, y + 2, w / 3 - 4, h / 5 - 4);
  }
  speckle(g, w, h, 300, ['#00000030', '#ffffff14'], R);
}, [6, 2]);
const gateTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(11);
  g.fillStyle = '#5d4a33'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { g.fillStyle = '#4a3a27'; g.fillRect(0, y, w, 4); g.fillStyle = '#6d5940'; g.fillRect(0, y + 4, w, 2); }
  g.strokeStyle = '#8a7454'; g.lineWidth = 3;
  for (let x = 20; x < w; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  speckle(g, w, h, 200, ['#00000026', '#ffffff12'], R);
});
const glowSprite = (inner, outer) => canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  grd.addColorStop(0, inner); grd.addColorStop(.45, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
const rockTex = () => canvasTex(128, 128, (g, w, h) => { const R = rngFrom(17); g.fillStyle = '#3a3f4d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, ['#454b5b', '#31353f', '#4d5464'], R); });

const MAT = {
  ground: null, wall: null, gate: null, rock: null,
  soldier: new THREE.MeshLambertMaterial({ color: 0x5f7a94 }),
  soldierGun: new THREE.MeshLambertMaterial({ color: 0x2c313c }),
  tank: new THREE.MeshLambertMaterial({ color: 0x4e6650 }),
  tankDark: new THREE.MeshLambertMaterial({ color: 0x37463a }),
  turret: new THREE.MeshLambertMaterial({ color: 0x7c8798 }),
  turretDark: new THREE.MeshLambertMaterial({ color: 0x3a414d }),
  player: new THREE.MeshLambertMaterial({ color: 0xc9d6e8 }),
  barBg: new THREE.MeshBasicMaterial({ color: 0x10141f, transparent: true, opacity: .75, depthTest: false }),
  barOk: new THREE.MeshBasicMaterial({ color: 0x46d17a, depthTest: false }),
  barHurt: new THREE.MeshBasicMaterial({ color: 0xff5a3c, depthTest: false }),
  warn: new THREE.MeshBasicMaterial({ color: 0xff3822, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false }),
  tracer: new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: .9 })
};
const ENEMY_MAT = {
  crawler: new THREE.MeshLambertMaterial({ color: 0x4b3a6b }), crawlerEye: new THREE.MeshBasicMaterial({ color: 0xd8ff5a }),
  runner: new THREE.MeshLambertMaterial({ color: 0x7a4630 }), runnerBlade: new THREE.MeshLambertMaterial({ color: 0xd9a066 }),
  spitter: new THREE.MeshLambertMaterial({ color: 0x51713a }), spitSac: new THREE.MeshBasicMaterial({ color: 0x9dff4a }),
  flyer: new THREE.MeshLambertMaterial({ color: 0x5a4668 }), flyerWing: new THREE.MeshLambertMaterial({ color: 0x8a6fa8, side: THREE.DoubleSide, transparent: true, opacity: .85 }),
  elite: new THREE.MeshLambertMaterial({ color: 0x565d6e }), elitePlate: new THREE.MeshLambertMaterial({ color: 0x7d8598 }),
  boss: new THREE.MeshLambertMaterial({ color: 0x6b3555 }), bossSac: new THREE.MeshBasicMaterial({ color: 0xff5a9e }), bossSpike: new THREE.MeshLambertMaterial({ color: 0x3a2438 })
};
const POOL_SIZES = { crawler: 16, runner: 14, spitter: 8, flyer: 8, elite: 5, boss: 1 };

function barMesh(w) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, .13), MAT.barBg);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(w, .13), MAT.barOk);
  fg.position.z = .01;
  g.add(bg, fg); g.userData.fg = fg;
  g.renderOrder = 5;
  return g;
}

function buildEnemyMesh(type) {
  const t = ENEMY_TYPES[type], g = new THREE.Group(), M = ENEMY_MAT;
  if (type === 'crawler') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 0), M.crawler); body.position.y = .8;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.16, 6, 6), M.crawlerEye); eye.position.set(0, .95, .55);
    g.add(body, eye);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.1, .9, .1), M.crawler);
      leg.position.set(i < 2 ? -.6 : .6, .45, (i % 2) * .5 - .25);
      g.add(leg); g.userData['leg' + i] = leg;
    }
  } else if (type === 'runner') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .7, 3, 6), M.runner); body.rotation.x = Math.PI / 2.4; body.position.y = .7;
    const bladeL = new THREE.Mesh(new THREE.ConeGeometry(.14, .9, 5), M.runnerBlade); bladeL.position.set(-.5, .6, .3); bladeL.rotation.x = Math.PI / 2;
    const bladeR = bladeL.clone(); bladeR.position.x = .5;
    g.add(body, bladeL, bladeR);
  } else if (type === 'spitter') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.72, 8, 7), M.spitter); body.position.y = .85; body.scale.set(1, .9, 1.15);
    const sac = new THREE.Mesh(new THREE.SphereGeometry(.34, 7, 6), M.spitSac); sac.position.set(0, 1.15, -.45);
    g.add(body, sac);
  } else if (type === 'flyer') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(.4, 1, 6), M.flyer); body.rotation.x = Math.PI / 2; body.position.y = 1.6;
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .45), M.flyerWing); wingL.position.set(-.75, 1.7, 0); wingL.rotation.z = .3;
    const wingR = wingL.clone(); wingR.position.x = .75; wingR.rotation.z = -.3;
    g.add(body, wingL, wingR); g.userData.wingL = wingL; g.userData.wingR = wingR;
  } else if (type === 'elite') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 2, ), M.elite); body.position.y = 1.4;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, .4, 1.4), M.elitePlate); plate.position.y = 2.1;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(.28, 1, 5), M.elitePlate); horn.position.set(0, 2.1, 1); horn.rotation.x = 1.2;
    g.add(body, plate, horn);
  } else { // boss
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), M.boss); body.position.y = 2.6; body.scale.set(1.15, 1, 1.3);
    g.add(body);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.6, 5), M.bossSpike);
      const a = i / 5 * TAU; spike.position.set(Math.cos(a) * 1.7, 4.4, Math.sin(a) * 1.7 - .4); spike.rotation.x = .4;
      g.add(spike);
    }
    for (let i = 0; i < 3; i++) {
      const sac = new THREE.Mesh(new THREE.SphereGeometry(.55, 7, 6), M.bossSac);
      sac.position.set((i - 1) * 1.1, 2.2, -1.9); g.add(sac);
    }
  }
  if (type !== 'flyer') {
    const bar = barMesh(type === 'boss' ? 4 : 1.1 * t.radius * 1.6);
    bar.position.y = t.height + (type === 'elite' ? .6 : .5);
    g.add(bar); g.userData.bar = bar;
  } else {
    const bar = barMesh(1.2); bar.position.y = 2.7; g.add(bar); g.userData.bar = bar;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.visible = false;
  return g;
}

function buildSoldier() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .8, 3, 6), MAT.soldier); body.position.y = .95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 7, 6), MAT.player); head.position.y = 1.62;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(.12, .14, 1), MAT.soldierGun); gun.position.set(.3, 1.15, .35);
  g.add(body, head, gun); g.userData.gun = gun;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildTank() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, .9, 3.6), MAT.tank); hull.position.y = .85;
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.6, .6, 1.8), MAT.tankDark); turret.position.y = 1.6;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, 2.6, 6), MAT.soldierGun); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.62, 2);
  g.add(hull, turret, barrel); g.userData.turret = turret; g.userData.barrel = barrel;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildTurret() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1, .7, 8), MAT.turretDark); base.position.y = .35;
  const head = new THREE.Group(); head.position.y = 1.05;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 6), MAT.turret);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1.2), MAT.soldierGun); barrel.position.set(0, .1, .6);
  head.add(dome, barrel);
  g.add(base, head); g.userData.head = head;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createScene(canvas, world) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a26);
  scene.fog = new THREE.Fog(0x141a26, 70, 240);

  const camera = new THREE.PerspectiveCamera(62, 1, .1, 400);

  // --- Lights: dusk key + cool fill.
  const hemi = new THREE.HemisphereLight(0x9db2d8, 0x3a2f1e, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc48a, 2.2);
  sun.position.set(-40, 55, 20); sun.castShadow = !mobile;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.far = 160;
  scene.add(sun, sun.target);
  const gateLight = new THREE.PointLight(0xffb469, 30, 40); gateLight.position.set(0, 6, 44); scene.add(gateLight);

  // --- Ground / wall / gate / rifts / rocks.
  MAT.ground = new THREE.MeshLambertMaterial({ map: groundTex() });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 300), MAT.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -50); ground.receiveShadow = true; scene.add(ground);

  MAT.wall = new THREE.MeshLambertMaterial({ map: wallTex() });
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(10, 7, 2.4), MAT.wall, 14);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) { m4.setPosition((i - 6.5) * 10, 3.5, 54); wall.setMatrixAt(i, m4); }
  wall.castShadow = wall.receiveShadow = true; scene.add(wall);
  for (const tx of [-34, 34]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 11, 5), MAT.wall); tower.position.set(tx, 5.5, 54); tower.castShadow = true; scene.add(tower);
    const top = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), MAT.wall); top.position.set(tx, 11.4, 54); scene.add(top);
  }
  MAT.gate = new THREE.MeshLambertMaterial({ map: gateTex(), emissive: 0xffb469, emissiveIntensity: .08 });
  const gateL = new THREE.Mesh(new THREE.BoxGeometry(4.4, 6.4, 1.2), MAT.gate); gateL.position.set(-2.25, 3.2, 53.4);
  const gateR = gateL.clone(); gateR.position.x = 2.25;
  scene.add(gateL, gateR);

  const riftMats = [];
  for (const r of RIFTS) {
    const g = new THREE.Group(); g.position.set(r.x, 0, r.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, .5, 8, 24), new THREE.MeshBasicMaterial({ color: 0xb46bff }));
    ring.rotation.x = Math.PI / 2; ring.position.y = .6;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.9, 20), new THREE.MeshBasicMaterial({ color: 0x6b2fbf, transparent: true, opacity: .8 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = .45;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a4fe0, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 11;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(216,180,255,.9)', 'rgba(140,70,230,.35)'), transparent: true, depthWrite: false }));
    glow.scale.set(14, 14, 1); glow.position.y = 2.5;
    g.add(ring, disc, beam, glow);
    scene.add(g);
    riftMats.push({ ring: ring.material, disc: disc.material, glow: glow.material, ringMesh: ring });
  }

  MAT.rock = new THREE.MeshLambertMaterial({ map: rockTex() });
  const R = rngFrom(53);
  for (let i = 0; i < 18; i++) {
    const s = 1.2 + R() * 2.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), MAT.rock);
    const x = (R() - .5) * 110, z = -110 + R() * 130;
    if (Math.abs(x) < 12 && z > -20) continue;
    rock.position.set(x, s * .45, z); rock.rotation.set(R() * TAU, R() * TAU, R() * TAU);
    rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  }
  for (const side of [-1, 1]) { // wing highlands
    const h = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 120), MAT.wall);
    h.position.set(side * 92, 6, -40); h.castShadow = h.receiveShadow = true; scene.add(h);
  }
  // Stars (fog-exempt).
  {
    const pos = new Float32Array(1200), SR = rngFrom(5);
    for (let i = 0; i < 400; i++) { const a = SR() * TAU, el = .12 + SR() * 1.2, r = 280; pos[i * 3] = Math.cos(a) * Math.cos(el) * r; pos[i * 3 + 1] = Math.sin(el) * r * .6 + 30; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r - 50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: .8 })));
  }

  // --- Actors.
  const playerG = buildSoldier(); playerG.scale.setScalar(1.25); scene.add(playerG);
  const gunFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,240,200,1)', 'rgba(255,160,80,.6)'), transparent: true, depthWrite: false }));
  gunFlash.scale.set(1, 1, 1); gunFlash.visible = false; scene.add(gunFlash);
  const flashLight = new THREE.PointLight(0xffc48a, 0, 12); scene.add(flashLight);

  const soldierMs = [buildSoldier(), buildSoldier()], tankM = buildTank();
  soldierMs.forEach(m => scene.add(m)); scene.add(tankM);

  const turretMs = []; for (let i = 0; i < 4; i++) { const t = buildTurret(); t.visible = false; scene.add(t); turretMs.push(t); }

  const enemyPools = {};
  for (const type in POOL_SIZES) {
    enemyPools[type] = [];
    for (let i = 0; i < POOL_SIZES[type]; i++) {
      const em = buildEnemyMesh(type);
      scene.add(em);
      enemyPools[type].push(em);
    }
  }
  const lockedMat = type => new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .28 });
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 22), lockedMat());
  lockRing.rotation.x = -Math.PI / 2; lockRing.visible = false; scene.add(lockRing);

  // Pooled FX: tracers, explosions, acid marks.
  const tracers = []; for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1), MAT.tracer.clone());
    m.visible = false; scene.add(m); tracers.push({ m, t: 0 });
  }
  const booms = []; for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,235,190,1)', 'rgba(255,120,50,.5)'), transparent: true, depthWrite: false }));
    s.visible = false; scene.add(s); booms.push({ s, t: 0, size: 1 });
  }
  const warns = []; for (let i = 0; i < 14; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(2, 2.6, 22), MAT.warn);
    r.rotation.x = -Math.PI / 2; r.position.y = .1; r.visible = false; scene.add(r); warns.push(r);
  }
  const rocketPool = []; for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .8, 6), MAT.soldierGun); body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.14, .3, 6), new THREE.MeshBasicMaterial({ color: 0xff7d4d })); tip.rotation.x = Math.PI / 2; tip.position.z = .5;
    g.add(body, tip); g.visible = false; scene.add(g); rocketPool.push(g);
  }
  const acidPool = []; for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.3, 7, 6), new THREE.MeshBasicMaterial({ color: 0x9dff4a }));
    s.visible = false; scene.add(s); acidPool.push(s);
  }

  // --- Camera state (presets: 0 shoulder, 1 high tactical; C returns to 0).
  const cam = { yaw: Math.PI, pitch: .34, preset: 0, shake: 0 };
  const PRESETS = [{ dist: 7.5, pitch: .34, h: 2.1 }, { dist: 18, pitch: .92, h: 3 }];
  function setPreset(i) { cam.preset = ((i % 2) + 2) % 2; cam.pitch = PRESETS[cam.preset].pitch; }
  const off = new THREE.Vector3(), look = new THREE.Vector3();

  let flashT = 0, hurtT = 0;
  function effect(e) {
    switch (e.type) {
      case 'tracer': {
        const t = tracers.find(t => t.t <= 0); if (!t) break;
        t.t = .09;
        const dx = e.x2 - e.x1, dy = e.y2 - e.y1, dz = e.z2 - e.z1, len = Math.hypot(dx, dy, dz) || 1;
        t.m.position.set((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, (e.z1 + e.z2) / 2);
        t.m.scale.set(1, 1, len); t.m.lookAt(e.x2, e.y2, e.z2); t.m.visible = true;
        break;
      }
      case 'fire': {
        const wp = WEAPONS[e.weapon];
        const p = world.player;
        gunFlash.position.set(p.x + Math.sin(p.yaw) * 1.5, p.y + 1.25, p.z + Math.cos(p.yaw) * 1.5);
        gunFlash.visible = true; flashLight.position.copy(gunFlash.position); flashLight.intensity = wp.key === 'w2' ? 40 : 18; flashT = .05;
        cam.shake = Math.max(cam.shake, wp.key === 'w3' ? .3 : wp.key === 'w2' ? .18 : .07);
        break;
      }
      case 'boom': {
        const b = booms.find(b => b.t <= 0); if (!b) break;
        b.t = .4; b.size = e.acid ? 4.5 : 7;
        b.s.position.set(e.x, e.y, e.z); b.s.visible = true;
        cam.shake = Math.max(cam.shake, e.acid ? .2 : .45);
        break;
      }
      case 'turret': cam.shake = Math.max(cam.shake, .15); break;
      case 'hurt': hurtT = .5; cam.shake = Math.max(cam.shake, .3); break;
      case 'playerdown': cam.shake = Math.max(cam.shake, .6); break;
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  const tmpDir = new THREE.Vector3();
  function update(dt, active) {
    const p = world.player;
    // Camera rig: orbit behind the player, WASD resolved in main.js against cam.yaw.
    const pr = PRESETS[cam.preset];
    off.set(p.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * pr.dist,
      p.y + pr.h + Math.sin(cam.pitch) * pr.dist,
      p.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * pr.dist);
    off.y = Math.max(1.2, off.y);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 1.6);
      off.x += (Math.random() - .5) * cam.shake; off.y += (Math.random() - .5) * cam.shake; off.z += (Math.random() - .5) * cam.shake;
    }
    camera.position.copy(off);
    look.set(p.x + Math.sin(cam.yaw) * 6, p.y + 1.7, p.z + Math.cos(cam.yaw) * 6);
    camera.lookAt(look);
    // Shadow camera follows the player so the 1024 map stays crisp.
    sun.position.set(p.x - 40, 55, p.z + 20); sun.target.position.set(p.x, 0, p.z);

    // Player mesh.
    playerG.visible = !p.dead;
    playerG.position.set(p.x, p.y, p.z);
    playerG.rotation.y = p.yaw;
    playerG.rotation.x = p.rollT > 0 ? (1 - p.rollT / .42) * TAU : 0;
    playerG.position.y = p.y + (p.rollT > 0 ? .6 : Math.abs(Math.sin(p.walk * 2.2)) * .08);

    // Allies.
    for (let i = 0; i < 2; i++) {
      const a = world.allies[i], m = soldierMs[i];
      m.visible = a.alive; m.position.set(a.x, 0, a.z); m.rotation.y = a.yaw;
    }
    const tk = world.allies[2];
    tankM.visible = tk.alive; tankM.position.set(tk.x, 0, tk.z); tankM.rotation.y = tk.yaw;

    // Turrets.
    for (let i = 0; i < 4; i++) {
      const t = world.turrets[i], m = turretMs[i];
      if (!t) { m.visible = false; continue; }
      m.visible = true; m.position.set(t.x, 0, t.z);
      m.userData.head.rotation.y = t.yaw;
      m.userData.head.rotation.x = .1;
    }

    // Enemies: hand pool meshes to live entities each frame.
    for (const type in enemyPools) for (const m of enemyPools[type]) m.userData.free = true;
    for (const e of world.enemies) {
      const pool = enemyPools[e.type];
      let m = null;
      for (const c of pool) if (c.userData.free) { m = c; break; }
      if (!m) continue;
      m.userData.free = false; m.visible = true;
      m.position.set(e.x, e.y, e.z); m.rotation.y = e.dir;
      const t = ENEMY_TYPES[e.type];
      const scale = 1 + Math.min(.12, e.hitT > 0 ? .12 : 0);
      m.scale.setScalar(scale);
      if (e.type === 'flyer') {
        const flap = Math.sin(world.time * 14 + e.walk) * .7;
        m.userData.wingL.rotation.z = .3 + flap; m.userData.wingR.rotation.z = -.3 - flap;
      } else if (e.type === 'crawler') {
        for (let i = 0; i < 4; i++) m.userData['leg' + i].rotation.x = Math.sin(e.walk * 3 + i * 1.7) * .5;
      }
      if (m.userData.bar) {
        // Billboard: undo the group's yaw so the bar faces the camera (local = yawInv * camQuat).
        _yq.setFromAxisAngle(UP, -e.dir);
        m.userData.bar.quaternion.copy(camera.quaternion).premultiply(_yq);
        const fg = m.userData.bar.userData.fg, ratio = Math.max(0, e.hp / e.maxHp);
        fg.scale.x = ratio; fg.position.x = -(1 - ratio) * fg.geometry.parameters.width / 2;
        fg.material = ratio > .45 ? MAT.barOk : MAT.barHurt;
      }
    }
    for (const type in enemyPools) for (const m of enemyPools[type]) { if (m.userData.free) m.visible = false; }

    // Soft-lock ring.
    if (world.softlock) {
      const s = world.softlock;
      lockRing.visible = true;
      lockRing.position.set(s.x, .12, s.z);
      const r = ENEMY_TYPES[s.type].radius * 1.5 + .4;
      lockRing.scale.setScalar(r);
      lockRing.rotation.z = world.time * 2;
    } else lockRing.visible = false;

    // Shots.
    for (const g of rocketPool) g.visible = false;
    for (const s of acidPool) s.visible = false;
    for (const r of warns) r.visible = false;
    let ri = 0, ai = 0, wi = 0;
    for (const sh of world.shots) {
      if (sh.kind === 'rocket') {
        const g = rocketPool[ri++]; if (!g) continue;
        g.visible = true; g.position.set(sh.x, sh.y, sh.z);
        g.lookAt(sh.x + sh.vx, sh.y + sh.vy, sh.z + sh.vz);
      } else {
        const s = acidPool[ai++]; if (s) { s.visible = true; const k = sh.t / sh.tfly; s.position.set(sh.sx + (sh.tx - sh.sx) * k, sh.sy + (sh.ty - sh.sy) * k + Math.sin(k * Math.PI) * 6, sh.sz + (sh.tz - sh.sz) * k); }
        const r = warns[wi++]; if (r) { r.visible = true; r.position.set(sh.tx, .12, sh.tz); const pulse = 1 + Math.sin(world.time * 12) * .08; r.scale.setScalar(pulse); }
      }
    }

    // FX timers.
    for (const t of tracers) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / .09); if (t.t <= 0) t.m.visible = false; }
    for (const b of booms) if (b.t > 0) {
      b.t -= dt; const k = 1 - b.t / .4;
      b.s.scale.setScalar(b.size * (0.4 + k * 1.2)); b.s.material.opacity = 1 - k;
      if (b.t <= 0) b.s.visible = false;
    }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) { gunFlash.visible = false; flashLight.intensity = 0; } }
    // Rift pulse.
    for (let i = 0; i < riftMats.length; i++) {
      const r = riftMats[i], k = .75 + Math.sin(world.time * 2.2 + i) * .25;
      r.ring.color.setRGB(.7 * k, .42 * k, 1 * k);
      r.disc.opacity = .55 + Math.sin(world.time * 3 + i * 2) * .2;
    }
    // Gate integrity glow.
    const gh = world.gateHp / world.gateMax;
    MAT.gate.emissiveIntensity = gh > .6 ? .08 : gh > .3 ? .3 : .7;
    MAT.gate.emissive.setHex(gh > .3 ? 0xffb469 : 0xff3822);
    gateLight.intensity = 22 + Math.sin(world.time * 4) * 5;
    // Hurt vignette handled by main via hurtT getter.
    hurtT = Math.max(0, hurtT - dt);
    void tmpDir;
    renderer.render(scene, camera);
  }

  resize();
  return {
    renderer, scene, camera, cam, effect, resize, setPreset, update,
    get yaw() { return cam.yaw; }, set yaw(v) { cam.yaw = v; },
    get hurt() { return hurtT > 0; }
  };
}
