// Zombie Road 3D — procedural Three.js rendering. No external assets: geometry + canvas textures only.
// Snow-night highway: asphalt with lane lines, guardrails, sandbag line, wrecks, streetlights, snowfall.
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { WALL, SPAWN_ZONE, ENEMY_TYPES, TURRET_MAX } from './game.js?v=z1';

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

const snowTex = () => canvasTex(256, 256, (g, w, h) => {
  const R = rngFrom(19);
  g.fillStyle = '#b9c6da'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1800, ['#c3cfe1', '#aebccc', '#cdd8e8', '#a4b2c6'], R);
  g.strokeStyle = '#a7b5c9'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - .5) * 70; y += (R() - .5) * 70; g.lineTo(x, y); } g.stroke(); }
}, [20, 28]);
const roadTex = () => canvasTex(256, 256, (g, w, h) => {
  const R = rngFrom(41);
  g.fillStyle = '#22252c'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1400, ['#262a31', '#1d2026', '#2b2f37', '#191c22'], R);
  // Ploughed snow ridges along both edges + a dashed centre line.
  g.fillStyle = '#b9c6da'; g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h);
  g.fillStyle = '#8fa2bd'; for (let i = 0; i < 60; i++) g.fillRect(R() * 20, R() * h, 4 + R() * 8, 3 + R() * 5);
  g.fillStyle = '#8fa2bd'; for (let i = 0; i < 60; i++) g.fillRect(w - 20 - R() * 20, R() * h, 4 + R() * 8, 3 + R() * 5);
  g.fillStyle = '#c9b45e'; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y, 6, 34);
  g.strokeStyle = '#c9b45eaa'; g.lineWidth = 3; g.beginPath(); g.moveTo(26, 0); g.lineTo(26, h); g.moveTo(w - 26, 0); g.lineTo(w - 26, h); g.stroke();
}, [1, 10]);
const sandbagTex = () => canvasTex(128, 128, (g, w, h) => {
  const R = rngFrom(23);
  g.fillStyle = '#7a6b4e'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 6; r++) for (let c = -1; c < 5; c++) {
    const x = c * w / 4 + (r % 2) * w / 8, y = r * h / 6;
    g.fillStyle = ['#6d5f44', '#7d6f52', '#756749'][(R() * 3) | 0];
    g.beginPath(); g.ellipse(x + w / 8, y + h / 12, w / 9, h / 14, 0, 0, TAU); g.fill();
  }
  speckle(g, w, h, 220, ['#ffffff20', '#00000028'], R);
}, [5, 2]);
const glowSprite = (inner, outer) => canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  grd.addColorStop(0, inner); grd.addColorStop(.45, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});

const MAT = {
  snow: null, road: null, sandbag: null,
  rail: new THREE.MeshLambertMaterial({ color: 0x5c6572 }),
  post: new THREE.MeshLambertMaterial({ color: 0x474e59 }),
  wreck: new THREE.MeshLambertMaterial({ color: 0x5a4636 }),
  wreckDark: new THREE.MeshLambertMaterial({ color: 0x37302a }),
  lampPole: new THREE.MeshLambertMaterial({ color: 0x3a414c }),
  lampGlass: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  turret: new THREE.MeshLambertMaterial({ color: 0x7c8798 }),
  turretDark: new THREE.MeshLambertMaterial({ color: 0x3a414d }),
  player: new THREE.MeshLambertMaterial({ color: 0xcfd9e6 }),
  soldierGun: new THREE.MeshLambertMaterial({ color: 0x2c313c }),
  barBg: new THREE.MeshBasicMaterial({ color: 0x10141f, transparent: true, opacity: .75, depthTest: false }),
  barOk: new THREE.MeshBasicMaterial({ color: 0x46d17a, depthTest: false }),
  barHurt: new THREE.MeshBasicMaterial({ color: 0xff5a3c, depthTest: false }),
  warn: new THREE.MeshBasicMaterial({ color: 0xff3822, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false }),
  tracer: new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: .9 })
};
const ZOMBIE_MAT = {
  shambler: new THREE.MeshLambertMaterial({ color: 0x6f8261 }), shamblerSkin: new THREE.MeshLambertMaterial({ color: 0x8fa07c }),
  runner: new THREE.MeshLambertMaterial({ color: 0x8a4636 }), runnerSkin: new THREE.MeshLambertMaterial({ color: 0xb06046 }),
  brute: new THREE.MeshLambertMaterial({ color: 0x55604f }), brutePlate: new THREE.MeshLambertMaterial({ color: 0x6d7a8c }),
  spitter: new THREE.MeshLambertMaterial({ color: 0x7a8a4a }), spitSac: new THREE.MeshBasicMaterial({ color: 0x9dff4a }),
  overlord: new THREE.MeshLambertMaterial({ color: 0x433d52 }), overlordCrest: new THREE.MeshLambertMaterial({ color: 0x8a5aa8 }),
  boneLord: new THREE.MeshLambertMaterial({ color: 0xd8d3c0 }), boneRib: new THREE.MeshLambertMaterial({ color: 0xb8b2a0 }),
  boneEye: new THREE.MeshBasicMaterial({ color: 0xff5a3c })
};
const POOL_SIZES = { shambler: 20, runner: 16, brute: 8, spitter: 8, overlord: 4, boneLord: 1 };

function barMesh(w) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, .13), MAT.barBg);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(w, .13), MAT.barOk);
  fg.position.z = .01;
  g.add(bg, fg); g.userData.fg = fg;
  g.renderOrder = 5;
  return g;
}

function limb(mat, len, thick) { return new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), mat); }

function buildZombieMesh(type) {
  const t = ENEMY_TYPES[type], g = new THREE.Group(), M = ZOMBIE_MAT;
  if (type === 'shambler') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .8, 3, 6), M.shambler); body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 7, 6), M.shamblerSkin); head.position.y = 1.66;
    const armL = limb(M.shamblerSkin, .75, .12); armL.position.set(-.42, 1.25, .3); armL.rotation.x = -1.25;
    const armR = armL.clone(); armR.position.x = .42;
    g.add(body, head, armL, armR); g.userData.armL = armL; g.userData.armR = armR;
  } else if (type === 'runner') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .7, 3, 6), M.runner); body.rotation.x = .5; body.position.y = 1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 7, 6), M.runnerSkin); head.position.set(0, 1.45, .3);
    const armL = limb(M.runnerSkin, .6, .1); armL.position.set(-.36, 1.15, -.25); armL.rotation.x = 2.2;
    const armR = armL.clone(); armR.position.x = .36;
    g.add(body, head, armL, armR); g.userData.armL = armL; g.userData.armR = armR;
  } else if (type === 'brute') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1), M.brute); body.position.y = 1.35;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, .5, 1.2), M.brutePlate); plate.position.y = 1.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 7, 6), M.brutePlate); head.position.set(0, 2.3, .2);
    const armL = limb(M.brute, 1.2, .34); armL.position.set(-.95, 1.2, .25); armL.rotation.x = -.5;
    const armR = armL.clone(); armR.position.x = .95;
    g.add(body, plate, head, armL, armR); g.userData.armL = armL; g.userData.armR = armR;
  } else if (type === 'spitter') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.72, 8, 7), M.spitter); body.position.y = .95; body.scale.set(1, .95, 1.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 7, 6), M.spitter); head.position.set(0, 1.6, .3);
    const sac = new THREE.Mesh(new THREE.SphereGeometry(.4, 7, 6), M.spitSac); sac.position.set(0, 1.15, -.5);
    const armL = limb(M.spitter, .7, .12); armL.position.set(-.5, 1.1, .3); armL.rotation.x = -1.1;
    const armR = armL.clone(); armR.position.x = .5;
    g.add(body, head, sac, armL, armR); g.userData.armL = armL; g.userData.armR = armR;
  } else if (type === 'overlord') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.44, 1.1, 3, 7), M.overlord); body.position.y = 1.4;
    const crest = new THREE.Mesh(new THREE.ConeGeometry(.2, 1, 5), M.overlordCrest); crest.position.set(0, 2.5, -.1); crest.rotation.x = -.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 7, 6), M.overlord); head.position.y = 2.15;
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.14, .5, 5), M.overlordCrest);
      spike.position.set(i < 2 ? -.6 : .6, 2, (i % 2) * .3 - .15); spike.rotation.z = i < 2 ? .8 : -.8;
      g.add(spike);
    }
    const armL = limb(M.overlord, 1, .18); armL.position.set(-.62, 1.5, .35); armL.rotation.x = -1.1;
    const armR = armL.clone(); armR.position.x = .62;
    g.add(body, crest, head, armL, armR); g.userData.armL = armL; g.userData.armR = armR;
  } else { // boneLord
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), M.boneLord); body.position.y = 2.7; body.scale.set(1, 1.15, .9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.75, 8, 7), M.boneLord); head.position.set(0, 4.35, .5);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(.9, .3, .7), M.boneRib); jaw.position.set(0, 3.9, .7);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 5), M.boneEye); eyeL.position.set(-.3, 4.45, 1.05);
    const eyeR = eyeL.clone(); eyeR.position.x = .3;
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * .12, .12, 6, 14, Math.PI), M.boneRib);
      rib.position.set(0, 3.4 - i * .5, .55); rib.rotation.set(0, 0, Math.PI);
      g.add(rib);
    }
    for (const s of [-1, 1]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.4, 1.8, 5), M.boneRib);
      spike.position.set(s * 1.7, 4.6, -.3); spike.rotation.z = -s * .5;
      const arm = limb(M.boneLord, 2.4, .5); arm.position.set(s * 2.3, 2.8, .5); arm.rotation.x = -.7; arm.rotation.z = s * .15;
      g.add(spike, arm);
      if (s < 0) g.userData.armL = arm; else g.userData.armR = arm;
    }
    g.add(body, head, jaw, eyeL, eyeR);
  }
  const bar = barMesh(type === 'boneLord' ? 4.5 : 1.1 * t.radius * 1.6);
  bar.position.y = t.height + (t.elite || t.boss ? .7 : .45);
  g.add(bar); g.userData.bar = bar;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  return g;
}

function buildSoldier() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .8, 3, 6), MAT.player); body.position.y = .95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 7, 6), MAT.player); head.position.y = 1.62;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.28, 7, 6, 0, TAU, 0, 1.6), MAT.soldierGun); hood.position.y = 1.64;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(.12, .14, 1), MAT.soldierGun); gun.position.set(.3, 1.15, .35);
  g.add(body, head, hood, gun);
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
function buildWreck(R) {
  const g = new THREE.Group();
  const hue = ['#5a4636', '#4a4a52', '#5e5a48', '#463c4a'][(R() * 4) | 0];
  const bodyMat = new THREE.MeshLambertMaterial({ color: hue });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, .9, 4.6), bodyMat); hull.position.y = .75;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, .8, 2.2), MAT.wreckDark); cabin.position.set(0, 1.55, -.3);
  const snow = new THREE.Mesh(new THREE.BoxGeometry(2.3, .3, 4.7), new THREE.MeshLambertMaterial({ color: 0xc3cfe1 })); snow.position.y = 1.28;
  g.add(hull, cabin, snow);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
function buildLamp(side, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 8.5, 6), MAT.lampPole); pole.position.y = 4.25;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, .14), MAT.lampPole); arm.position.set(-side * 1, 8.4, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(.7, .22, .4), MAT.lampGlass); glass.position.set(-side * 2, 8.3, 0);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,220,160,.95)', 'rgba(255,170,80,.4)'), transparent: true, depthWrite: false }));
  glow.scale.set(6, 6, 1); glow.position.set(-side * 2, 8.3, 0);
  g.add(pole, arm, glass, glow);
  g.userData.glow = glow; g.userData.glass = glass;
  return g;
}

export function createScene(canvas, world) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1320);
  scene.fog = new THREE.Fog(0x0d1320, 45, 190);

  const camera = new THREE.PerspectiveCamera(62, 1, .1, 400);

  // --- Lights: cold snow night, warm streetlamps.
  const hemi = new THREE.HemisphereLight(0x8aa4cc, 0x27303f, 1.15); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa8c0e8, 1.15);
  moon.position.set(-40, 60, 30); moon.castShadow = !mobile;
  moon.shadow.mapSize.set(1024, 1024);
  const sc = moon.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.far = 170;
  scene.add(moon, moon.target);

  // --- Ground: snowfields + asphalt road + shoulders.
  MAT.snow = new THREE.MeshLambertMaterial({ map: snowTex() });
  const snowField = new THREE.Mesh(new THREE.PlaneGeometry(240, 320), MAT.snow);
  snowField.rotation.x = -Math.PI / 2; snowField.position.set(0, 0, -55); snowField.receiveShadow = true; scene.add(snowField);
  MAT.road = new THREE.MeshLambertMaterial({ map: roadTex() });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(19, 300), MAT.road);
  road.rotation.x = -Math.PI / 2; road.position.set(0, .02, -80); road.receiveShadow = true; scene.add(road);

  // --- Guardrails along both sides of the road.
  const railMat = MAT.rail;
  for (const side of [-1, 1]) {
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .5, 5.9), railMat, 28);
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, 1, .18), MAT.post, 28);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) {
      m4.setPosition(side * 9.7, .95, 40 - i * 5.9); rail.setMatrixAt(i, m4);
      m4.setPosition(side * 9.7, .5, 40 - i * 5.9); post.setMatrixAt(i, m4);
    }
    rail.castShadow = post.castShadow = true;
    scene.add(rail, post);
  }

  // --- Sandbag defence line (the "wall") with a watchfire glow.
  MAT.sandbag = new THREE.MeshLambertMaterial({ map: sandbagTex() });
  const bags = new THREE.InstancedMesh(new THREE.BoxGeometry(2, .9, 1.3), MAT.sandbag, 30);
  const m4b = new THREE.Matrix4();
  let bi = 0;
  for (let row = 0; row < 2; row++) for (let c = 0; c < 10; c++) {
    m4b.setPosition(-8.1 + c * 1.8 + (row % 2) * .9, .45 + row * .85, WALL.z + (row ? .5 : -.4));
    bags.setMatrixAt(bi++, m4b);
  }
  bags.castShadow = bags.receiveShadow = true; scene.add(bags);
  for (const tx of [-11.5, 11.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), MAT.post); post.position.set(tx, 2.5, WALL.z); post.castShadow = true; scene.add(post);
    const lampG = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,214,150,.95)', 'rgba(255,150,60,.4)'), transparent: true, depthWrite: false }));
    lampG.scale.set(7, 7, 1); lampG.position.set(tx, 5.6, WALL.z); scene.add(lampG);
  }
  const wallLight = new THREE.PointLight(0xffb469, 26, 42); wallLight.position.set(0, 7, WALL.z + 3); scene.add(wallLight);

  // --- Streetlamps (warm islands along the road).
  const lampGlows = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, z = 30 - i * 28;
    const lamp = buildLamp(side, z); lamp.position.set(side * 11, 0, z); scene.add(lamp);
    lampGlows.push(lamp.userData.glow.material);
    if (i < 4) { const pl = new THREE.PointLight(0xffc98a, 14, 30); pl.position.set(side * 9, 8, z); scene.add(pl); }
  }

  // --- Wrecked cars off the lanes.
  const R = rngFrom(77);
  const wreckSpots = [[-6.8, -18, .5], [7, -42, -.6], [-7.4, -64, .9], [6.6, -84, -.4], [-6.2, -100, .3]];
  for (const [x, z, rot] of wreckSpots) {
    const w = buildWreck(R); w.position.set(x, 0, z); w.rotation.y = rot; w.rotation.z = (R() - .5) * .1; scene.add(w);
  }
  // Roadside pines (snow cones) for depth.
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2c4038 }), pineSnowMat = new THREE.MeshLambertMaterial({ color: 0xc9d5e6 });
  for (let i = 0; i < 26; i++) {
    const side = R() < .5 ? -1 : 1;
    const x = side * (14 + R() * 26), z = -115 + R() * 160;
    const h = 4 + R() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, 1.4, 5), MAT.wreckDark); trunk.position.set(x, .7, z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4 + R() * .8, h, 7), pineMat); cone.position.set(x, h * .55 + 1, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.8 + R() * .4, h * .35, 7), pineSnowMat); cap.position.set(x, h * .95 + 1, z);
    cone.castShadow = true;
    scene.add(trunk, cone, cap);
  }
  // Famine-red glow marking the spawn end of the road in the fog.
  const spawnGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,90,60,.8)', 'rgba(160,30,20,.35)'), transparent: true, depthWrite: false, opacity: .8 }));
  spawnGlow.scale.set(34, 12, 1); spawnGlow.position.set(0, 3, SPAWN_ZONE.z - 10); scene.add(spawnGlow);
  // Faint snow-mist stars.
  {
    const pos = new Float32Array(600), SR = rngFrom(9);
    for (let i = 0; i < 200; i++) { const a = SR() * TAU, el = .1 + SR() * 1.1, r = 270; pos[i * 3] = Math.cos(a) * Math.cos(el) * r; pos[i * 3 + 1] = Math.sin(el) * r * .5 + 40; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r - 50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbccdea, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .55 })));
  }

  // --- Snowfall: recycled particle cloud around the camera.
  const SNOW_N = 700;
  const snowPos = new Float32Array(SNOW_N * 3), snowVel = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3] = (Math.random() - .5) * 130; snowPos[i * 3 + 1] = Math.random() * 40; snowPos[i * 3 + 2] = (Math.random() - .5) * 130;
    snowVel[i] = 1.6 + Math.random() * 2.4;
  }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowPoints = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xe8eef8, size: .34, transparent: true, opacity: .85, depthWrite: false }));
  snowPoints.frustumCulled = false; scene.add(snowPoints);

  // --- Actors.
  const playerG = buildSoldier(); playerG.scale.setScalar(1.25); scene.add(playerG);
  const gunFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,240,200,1)', 'rgba(255,160,80,.6)'), transparent: true, depthWrite: false }));
  gunFlash.visible = false; scene.add(gunFlash);
  const flashLight = new THREE.PointLight(0xffc48a, 0, 12); scene.add(flashLight);

  const turretMs = []; for (let i = 0; i < TURRET_MAX; i++) { const t = buildTurret(); t.visible = false; scene.add(t); turretMs.push(t); }

  const zombiePools = {};
  for (const type in POOL_SIZES) {
    zombiePools[type] = [];
    for (let i = 0; i < POOL_SIZES[type]; i++) { const zm = buildZombieMesh(type); scene.add(zm); zombiePools[type].push(zm); }
  }
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 22), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .28 }));
  lockRing.rotation.x = -Math.PI / 2; lockRing.visible = false; scene.add(lockRing);

  // Pooled FX: tracers, flame puffs, explosions, acid, pickups.
  const tracers = []; for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1), MAT.tracer.clone());
    m.visible = false; scene.add(m); tracers.push({ m, t: 0 });
  }
  const flames = []; for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,220,140,1)', 'rgba(255,110,30,.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.visible = false; scene.add(s); flames.push({ s, t: 0, vx: 0, vy: 0, vz: 0 });
  }
  const booms = []; for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(180,255,140,1)', 'rgba(90,200,60,.5)'), transparent: true, depthWrite: false }));
    s.visible = false; scene.add(s); booms.push({ s, t: 0, size: 1 });
  }
  const warns = []; for (let i = 0; i < 12; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(2, 2.6, 22), MAT.warn);
    r.rotation.x = -Math.PI / 2; r.position.y = .12; r.visible = false; scene.add(r); warns.push(r);
  }
  const acidPool = []; for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.3, 7, 6), new THREE.MeshBasicMaterial({ color: 0x9dff4a }));
    s.visible = false; scene.add(s); acidPool.push(s);
  }
  const partPool = []; for (let i = 0; i < 44; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(.34, 0), new THREE.MeshBasicMaterial({ color: 0xffc94d }));
    m.visible = false; scene.add(m); partPool.push(m);
  }
  const medPool = []; for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .4, .6), new THREE.MeshLambertMaterial({ color: 0xe8eef4 }));
    const cross = new THREE.Mesh(new THREE.BoxGeometry(.34, .1, .62), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    g.add(box, cross); g.visible = false; scene.add(g); medPool.push(g);
  }

  // --- Camera state (presets: 0 shoulder, 1 high tactical; C returns to 0).
  const cam = { yaw: Math.PI, pitch: .34, preset: 0, shake: 0 };
  const PRESETS = [{ dist: 7.5, pitch: .34, h: 2.1 }, { dist: 17, pitch: .92, h: 3 }];
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
      case 'flame': {
        for (let k = 0; k < 3; k++) {
          const f = flames.find(f => f.t <= 0); if (!f) break;
          const spread = .16;
          const dx = e.dx + (Math.random() - .5) * spread, dy = e.dy + (Math.random() - .5) * spread + .04, dz = e.dz + (Math.random() - .5) * spread;
          const sp = 14 + Math.random() * 8;
          f.t = .38 + Math.random() * .12;
          f.s.position.set(e.ox, e.oy, e.oz);
          f.vx = dx * sp; f.vy = dy * sp; f.vz = dz * sp;
          f.s.scale.setScalar(.8 + Math.random() * .6); f.s.visible = true; f.s.material.opacity = .95;
        }
        flashLight.position.set(e.ox + e.dx * 2, e.oy, e.oz + e.dz * 2); flashLight.intensity = 26; flashT = .06;
        break;
      }
      case 'fire': {
        const p = world.player;
        gunFlash.position.set(p.x + Math.sin(p.yaw) * 1.5, p.y + 1.25, p.z + Math.cos(p.yaw) * 1.5);
        gunFlash.visible = true; flashLight.position.copy(gunFlash.position); flashLight.intensity = e.weapon === 2 ? 40 : 18; flashT = .05;
        cam.shake = Math.max(cam.shake, e.weapon === 2 ? .22 : .07);
        break;
      }
      case 'boom': {
        const b = booms.find(b => b.t <= 0); if (!b) break;
        b.t = .4; b.size = e.acid ? 4.5 : 6;
        b.s.position.set(e.x, e.y, e.z); b.s.visible = true;
        cam.shake = Math.max(cam.shake, e.acid ? .2 : .35);
        break;
      }
      case 'turret': case 'repair': cam.shake = Math.max(cam.shake, .12); break;
      case 'hurt': hurtT = .5; cam.shake = Math.max(cam.shake, .3); break;
      case 'playerdown': cam.shake = Math.max(cam.shake, .6); break;
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

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
    moon.position.set(p.x - 40, 60, p.z + 30); moon.target.position.set(p.x, 0, p.z);

    // Player mesh.
    playerG.visible = !p.dead;
    playerG.position.set(p.x, p.y + (p.rollT > 0 ? .6 : Math.abs(Math.sin(p.walk * 2.2)) * .08), p.z);
    playerG.rotation.y = p.yaw;
    playerG.rotation.x = p.rollT > 0 ? (1 - p.rollT / .42) * TAU : 0;

    // Turrets.
    for (let i = 0; i < TURRET_MAX; i++) {
      const t = world.turrets[i], m = turretMs[i];
      if (!t) { m.visible = false; continue; }
      m.visible = true; m.position.set(t.x, 0, t.z);
      m.userData.head.rotation.y = t.yaw;
      m.userData.head.rotation.x = .1;
    }

    // Zombies: hand pool meshes to live entities each frame.
    for (const type in zombiePools) for (const m of zombiePools[type]) m.userData.free = true;
    for (const e of world.enemies) {
      const pool = zombiePools[e.type];
      let m = null;
      for (const c of pool) if (c.userData.free) { m = c; break; }
      if (!m) continue;
      m.userData.free = false; m.visible = true;
      m.position.set(e.x, 0, e.z); m.rotation.y = e.dir;
      const t = ENEMY_TYPES[e.type];
      const sc2 = 1 + (e.hitT > 0 ? .1 : 0);
      m.scale.setScalar(sc2);
      if (m.userData.armL) {
        const sw = Math.sin(e.walk * 2.6) * .35;
        m.userData.armL.rotation.x = (e.type === 'runner' ? 2.2 : -1.2) + sw;
        m.userData.armR.rotation.x = (e.type === 'runner' ? 2.2 : -1.2) - sw;
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
    for (const type in zombiePools) for (const m of zombiePools[type]) { if (m.userData.free) m.visible = false; }

    // Soft-lock ring.
    if (world.softlock) {
      const s = world.softlock;
      lockRing.visible = true;
      lockRing.position.set(s.x, .12, s.z);
      const r = ENEMY_TYPES[s.type].radius * 1.5 + .4;
      lockRing.scale.setScalar(r);
      lockRing.rotation.z = world.time * 2;
    } else lockRing.visible = false;

    // Pickups.
    for (const m of partPool) m.visible = false;
    for (const m of medPool) m.visible = false;
    let pi = 0, mi = 0;
    for (const k of world.pickups) {
      const blink = k.t < 5 && (k.t * 6 | 0) % 2 === 0;
      if (k.kind === 'parts') {
        const m = partPool[pi++]; if (!m) continue;
        m.visible = !blink; m.position.set(k.x, .5 + Math.sin(world.time * 4 + k.x) * .1, k.z); m.rotation.y = world.time * 2.4;
      } else {
        const m = medPool[mi++]; if (!m) continue;
        m.visible = !blink; m.position.set(k.x, .45, k.z); m.rotation.y = world.time * 1.6;
      }
    }

    // Shots: acid lobs + warning rings.
    for (const s of acidPool) s.visible = false;
    for (const r of warns) r.visible = false;
    let ai = 0, wi = 0;
    for (const sh of world.shots) {
      const s = acidPool[ai++]; if (s) {
        s.visible = true; const k = sh.t / sh.tfly;
        s.position.set(sh.sx + (sh.tx - sh.sx) * k, sh.sy + (sh.ty - sh.sy) * k + Math.sin(k * Math.PI) * 6, sh.sz + (sh.tz - sh.sz) * k);
      }
      const r = warns[wi++]; if (r) {
        r.visible = true; r.position.set(sh.tx, .12, sh.tz); r.scale.setScalar(1 + Math.sin(world.time * 12) * .08);
      }
    }

    // FX timers.
    for (const t of tracers) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / .09); if (t.t <= 0) t.m.visible = false; }
    for (const f of flames) if (f.t > 0) {
      f.t -= dt;
      f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt;
      f.vy += 2.2 * dt;
      f.s.material.opacity = Math.max(0, f.t / .45);
      f.s.scale.multiplyScalar(1 + dt * 1.6);
      if (f.t <= 0) f.s.visible = false;
    }
    for (const b of booms) if (b.t > 0) {
      b.t -= dt; const k = 1 - b.t / .4;
      b.s.scale.setScalar(b.size * (0.4 + k * 1.2)); b.s.material.opacity = 1 - k;
      if (b.t <= 0) b.s.visible = false;
    }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) { gunFlash.visible = false; flashLight.intensity = 0; } }

    // Ambience: snowfall recycles around the camera; lamp glow flickers.
    for (let i = 0; i < SNOW_N; i++) {
      snowPos[i * 3 + 1] -= snowVel[i] * dt;
      snowPos[i * 3] += Math.sin(world.time * 1.3 + i) * dt * .5;
      if (snowPos[i * 3 + 1] < 0) {
        snowPos[i * 3] = p.x + (Math.random() - .5) * 130;
        snowPos[i * 3 + 1] = 34 + Math.random() * 8;
        snowPos[i * 3 + 2] = p.z + (Math.random() - .5) * 130;
      }
    }
    snowGeo.attributes.position.needsUpdate = true;
    const flick = .82 + Math.sin(world.time * 7) * .06 + Math.sin(world.time * 23) * .05;
    for (const gm of lampGlows) gm.opacity = flick;
    wallLight.intensity = 22 + Math.sin(world.time * 3.4) * 4;
    // Sandbag line glows red as it fails.
    const wh = world.wallHp / world.wallMax;
    MAT.sandbag.emissive.setHex(wh > .35 ? 0x000000 : 0x551408);
    MAT.sandbag.emissiveIntensity = wh > .35 ? 0 : (.35 - wh) * 2;
    // Spawn glow breathes harder during combat.
    spawnGlow.material.opacity = world.phase === 'combat' ? .6 + Math.sin(world.time * 2.4) * .25 : .4;

    hurtT = Math.max(0, hurtT - dt);
    renderer.render(scene, camera);
  }

  resize();
  return {
    renderer, scene, camera, cam, effect, resize, setPreset, update,
    get yaw() { return cam.yaw; }, set yaw(v) { cam.yaw = v; },
    get hurt() { return hurtT > 0; }
  };
}
