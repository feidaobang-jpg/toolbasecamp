import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { W, YMIN, YMAX, EMPTY, GROUND, STONE, CLAY, CRATE, USED, LOG, PLANK, SPRING, TERRAIN, PLATFORM, GOAL_X, GOAL_TOP, DOOR_X, CHECKPOINT_X, LEVEL_END } from './world.js';

// Everything here is procedural: primitive meshes plus canvas-painted textures. Original characters and scenery.
const TAU = Math.PI * 2;
function rngFrom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function speckle(g, w, h, n, colors, R) { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(R() * w, R() * h, 1 + R() * 2.5, 1 + R() * 2.5); } }
const TEX = {
  grass: () => canvasTex(128, 128, (g, w, h) => { const R = rngFrom(3); g.fillStyle = '#6cc04a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, ['#7fd158', '#5aae3d', '#8ddc62', '#4f9e36'], R); }, [1, 1]),
  soil: () => canvasTex(128, 128, (g, w, h) => {
    const R = rngFrom(4); const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#b77a45'); grd.addColorStop(1, '#8a5530'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['#9c6436', '#c68a52', '#7a4a28'], R);
    for (let i = 0; i < 9; i++) { g.fillStyle = '#d8b07a'; g.beginPath(); g.ellipse(R() * w, 30 + R() * (h - 30), 5 + R() * 6, 3 + R() * 3, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#5aae3d'; for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, 14 + R() * 8); g.lineTo(x + 8, 0); g.fill(); }
  }, [1, 1]),
  stone: () => canvasTex(128, 128, (g, w, h) => {
    const R = rngFrom(5); g.fillStyle = '#8f98a3'; g.fillRect(0, 0, w, h); speckle(g, w, h, 600, ['#a3acb6', '#7e8792', '#b3bbc4'], R);
    g.strokeStyle = '#6b737d'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); g.strokeStyle = '#c3cad2'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, h - 10); g.lineTo(8, 8); g.lineTo(w - 10, 8); g.stroke();
  }),
  clay: () => canvasTex(128, 128, (g, w, h) => {
    const R = rngFrom(6); g.fillStyle = '#7c3b22'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const x = c * 64 + 3, y = r * 64 + 3; g.fillStyle = ['#d0693c', '#c65f35', '#da7446', '#c86a3e'][r * 2 + c]; g.beginPath(); g.roundRect(x, y, 58, 58, 8); g.fill(); g.fillStyle = '#ee9463'; g.fillRect(x + 6, y + 5, 46, 4); }
    speckle(g, w, h, 160, ['#00000022', '#ffffff22'], R);
  }),
  crate: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d99a3e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = y % 64 ? '#e3a84c' : '#cf8f37'; g.fillRect(0, y, w, 30); g.fillStyle = '#9a5f1f'; g.fillRect(0, y + 30, w, 2); }
    g.strokeStyle = '#7b4715'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(64, 64, 28, 0, TAU); g.fill();
    g.fillStyle = '#3f9d45'; g.beginPath(); g.moveTo(64, 40); g.bezierCurveTo(92, 48, 90, 80, 64, 90); g.bezierCurveTo(38, 80, 36, 48, 64, 40); g.fill();
    g.strokeStyle = '#2b6e30'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 44); g.lineTo(64, 90); g.stroke();
  }),
  used: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { g.fillStyle = '#7a5c3e'; g.fillRect(0, y + 30, w, 2); } g.strokeStyle = '#5c422a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }),
  bark: () => canvasTex(128, 256, (g, w, h) => { const R = rngFrom(7); g.fillStyle = '#8a5a32'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.strokeStyle = i % 2 ? '#6e4424' : '#a06c3e'; g.lineWidth = 2 + R() * 3; g.beginPath(); const x = R() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 8, h * .3, x - 8, h * .6, x + 4, h); g.stroke(); } }, [2, 1]),
  rings: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e8c48a'; g.fillRect(0, 0, w, h); for (let r = 58; r > 4; r -= 8) { g.strokeStyle = r % 16 ? '#c99a5c' : '#b8874a'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, r, 0, TAU); g.stroke(); } }),
  plank: () => canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#b8864f'; g.fillRect(0, 0, w, h); g.fillStyle = '#9b6c3b'; g.fillRect(0, h - 5, w, 5); g.fillStyle = '#d6a466'; g.fillRect(0, 0, w, 4); g.fillStyle = '#6e4a26'; g.beginPath(); g.arc(10, 16, 3, 0, TAU); g.arc(118, 16, 3, 0, TAU); g.fill(); }, [1, 1])
};
function textTex(text, color) {
  return canvasTex(128, 64, (g, w, h) => { g.font = '900 38px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#3a2412'; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); });
}
function skyTex() {
  return canvasTex(8, 256, (g, w, h) => { const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#5aa7e6'); grd.addColorStop(.45, '#9fd2f2'); grd.addColorStop(.7, '#fde8c4'); grd.addColorStop(1, '#fbd9a8'); g.fillStyle = grd; g.fillRect(0, 0, w, h); });
}
function glowTex(inner, outer) { return canvasTex(64, 64, (g, w, h) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, inner); grd.addColorStop(.35, outer); grd.addColorStop(1, '#00000000'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }); }

const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 16, 12), lowSph = new THREE.SphereGeometry(1, 10, 7), midSph = new THREE.SphereGeometry(1, 14, 9), blob = new THREE.IcosahedronGeometry(1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 16), cone = new THREE.ConeGeometry(1, 1, 14), ico = new THREE.IcosahedronGeometry(1, 0);
const matCache = new Map();
function mat(color, rough = .7, metal = 0, extra) { const k = color + rough + metal + (extra ? JSON.stringify(extra) : ''); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra || {}) })); return matCache.get(k); }
function part(parent, geo, material, x, y, z, sx, sy, sz, shadow = true) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }

// --- Hero: an original fox cub with a green scarf. Faces +x when facing right.
function foxModel() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const fur = mat('#f08a2c', .75), cream = mat('#fff1dc', .8), dark = mat('#2b1a14', .5), scarf = mat('#2fae6a', .6), black = mat('#1b1210', .3);
  const body = part(rig, sph, fur, 0, .5, 0, .3, .32, .26); part(rig, sph, cream, .1, .48, 0, .2, .24, .2);
  const head = new THREE.Group(); head.position.set(.08, .95, 0); rig.add(head);
  part(head, sph, fur, 0, 0, 0, .3, .27, .27);
  part(head, sph, cream, .16, -.06, 0, .17, .14, .18);
  const snout = part(head, cone, fur, .32, -.04, 0, .1, .22, .1); snout.rotation.z = -Math.PI / 2;
  part(head, sph, black, .43, -.03, 0, .045, .04, .045);
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(-.02, .2, s * .15); ear.rotation.x = s * .25; head.add(ear);
    part(ear, cone, fur, 0, .12, 0, .1, .26, .07); part(ear, cone, dark, 0, .22, 0, .05, .08, .04, false);
    const eye = part(head, sph, black, .21, .06, s * .12, .05, .07, .045, false); part(eye, sph, mat('#ffffff', .2), .5, .45, 0, .35, .35, .35, false);
    part(head, sph, mat('#ff9c8a', .9), .19, -.06, s * .17, .05, .03, .03, false);
  }
  const scarfRing = part(rig, new THREE.TorusGeometry(.2, .065, 8, 18), scarf, .06, .76, 0, 1, 1, 1); scarfRing.rotation.x = Math.PI / 2;
  const scarfTail = part(rig, box, scarf, -.2, .7, .12, .26, .08, .12); scarfTail.rotation.z = .4;
  const legs = [];
  for (const [x, z] of [[.14, .12], [.14, -.12], [-.12, .12], [-.12, -.12]]) { const l = new THREE.Group(); l.position.set(x, .3, z); rig.add(l); part(l, cyl, fur, 0, -.13, 0, .065, .26, .065); part(l, sph, dark, .02, -.27, 0, .08, .05, .07); legs.push(l); }
  const tail = new THREE.Group(); tail.position.set(-.28, .52, 0); rig.add(tail);
  part(tail, sph, fur, -.18, .1, 0, .24, .12, .12); part(tail, sph, cream, -.4, .18, 0, .12, .09, .09);
  // Power gear.
  const helmet = new THREE.Group(); helmet.position.set(0, .2, 0); head.add(helmet); helmet.visible = false;
  part(helmet, new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI / 2), mat('#ffcc2e', .35, .2), 0, 0, 0, .3, .24, .3);
  part(helmet, cyl, mat('#e0a800', .4, .2), 0, 0, 0, .33, .03, .33);
  const lamp = part(helmet, cyl, mat('#fff7c2', .2, 0, { emissive: '#fff2a0', emissiveIntensity: 1.2 }), .28, .1, 0, .07, .05, .07); lamp.rotation.z = Math.PI / 2;
  const lantern = new THREE.Group(); lantern.position.set(.26, .55, .22); rig.add(lantern); lantern.visible = false;
  part(lantern, cyl, mat('#3b3f46', .5, .6), 0, .16, 0, .09, .04, .09);
  part(lantern, cyl, mat('#fff3a8', .1, 0, { emissive: '#ffd84a', emissiveIntensity: 2, transparent: true, opacity: .9 }), 0, 0, 0, .08, .24, .08, false);
  part(lantern, cyl, mat('#3b3f46', .5, .6), 0, -.13, 0, .09, .04, .09);
  return { group: g, rig, head, legs, tail, body, helmet, lantern, scarfTail };
}
function beetleModel() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  part(rig, new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2), mat('#3d4fb8', .25, .35), 0, .18, 0, .42, .42, .36);
  part(rig, box, mat('#2a347d', .3), 0, .5, 0, .03, .2, .5, false);
  part(rig, sph, mat('#1e2340', .5), .38, .22, 0, .16, .14, .16);
  for (const s of [-1, 1]) { part(rig, sph, mat('#ffffff', .2), .48, .28, s * .07, .045, .05, .04, false); part(rig, sph, mat('#111111', .2), .52, .28, s * .07, .025, .03, .025, false); const ant = part(rig, cyl, mat('#1e2340'), .5, .42, s * .06, .012, .2, .012, false); ant.rotation.z = -.6; }
  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const l = part(rig, cyl, mat('#1e2340'), -.15 + i * .15, .08, s * .3, .025, .22, .025, false); l.rotation.x = s * .9; legs.push(l); }
  return { group: g, rig, legs };
}
function snailModel() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const bodyG = new THREE.Group(); rig.add(bodyG);
  part(bodyG, new THREE.CapsuleGeometry(.16, .6, 6, 12), mat('#b8e07a', .45), .05, .17, 0, 1, 1, 1).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const st = part(bodyG, cyl, mat('#b8e07a', .45), .38, .42, s * .06, .03, .3, .03, false); st.rotation.z = -.3; part(bodyG, sph, mat('#222222', .2), .44, .57, s * .06, .05, .05, .05, false); }
  const shell = new THREE.Group(); shell.position.set(-.05, .42, 0); rig.add(shell);
  const shellMat = mat('#e8739a', .35, .1), swirl = mat('#b84a73', .4);
  part(shell, sph, shellMat, 0, 0, 0, .34, .34, .26);
  const spiral = part(shell, new THREE.TorusGeometry(.2, .05, 8, 24, TAU * .85), swirl, 0, 0, .21, 1, 1, 1, false);
  part(shell, new THREE.TorusGeometry(.2, .05, 8, 24, TAU * .85), swirl, 0, 0, -.21, 1, 1, 1, false);
  part(shell, sph, swirl, 0, 0, .23, .07, .07, .03, false); part(shell, sph, swirl, 0, 0, -.23, .07, .07, .03, false);
  return { group: g, rig, bodyG, shell, spiral };
}
function berryModel() { const g = new THREE.Group(); const red = mat('#e0303f', .2, 0, { emissive: '#5a0010', emissiveIntensity: .3 }); for (const [x, y, z] of [[0, .25, 0], [.13, .2, .08], [-.12, .2, .06], [0, .2, -.13]]) part(g, sph, red, x, y, z, .14, .14, .14); const lf = part(g, sph, mat('#3fae45', .5), 0, .45, 0, .2, .04, .1); lf.rotation.z = .4; return g; }
function jarModel() { const g = new THREE.Group(); part(g, cyl, mat('#cfe9ff', .05, 0, { transparent: true, opacity: .45 }), 0, .3, 0, .22, .45, .22, false); part(g, cyl, mat('#b8864f', .6), 0, .56, 0, .24, .08, .24); for (let i = 0; i < 5; i++) part(g, sph, mat('#fff49a', .2, 0, { emissive: '#ffe45a', emissiveIntensity: 2.5 }), (i % 2 - .5) * .15, .15 + i * .07, ((i * 7) % 3 - 1) * .08, .035, .035, .035, false); return g; }
function leafModel() { const g = new THREE.Group(); const l = part(g, sph, mat('#ffd23f', .3, .3, { emissive: '#8a6a00', emissiveIntensity: .4 }), 0, .35, 0, .32, .06, .18); l.rotation.z = .3; part(g, cyl, mat('#6b8a2a'), -.3, .25, 0, .02, .2, .02).rotation.z = 1; return g; }
function acornModel() { const g = new THREE.Group(); part(g, sph, mat('#e0a24a', .35, .15, { emissive: '#5a3000', emissiveIntensity: .25 }), 0, -.05, 0, .2, .24, .2); part(g, new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2), mat('#7a4a22', .8), 0, .06, 0, .23, .14, .23); part(g, cyl, mat('#5a3416'), 0, .22, 0, .025, .1, .025); return g; }

export function createScene(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#cfe6f2', 45, 130);
  const camera = new THREE.PerspectiveCamera(42, 1, .3, 400);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false })); scene.add(sky);
  scene.add(new THREE.HemisphereLight('#dff0ff', '#6a8a3a', 1.55));
  const sun = new THREE.DirectionalLight('#fff0d2', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 14, bottom: -12, near: 1, far: 80 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);
  const R = rngFrom(11), tmp = new THREE.Object3D();

  // --- Terrain: soil body + grass cap per span; the cap sits 0.02 above the soil so no faces are coplanar.
  const soilTex = TEX.soil(), grassTex = TEX.grass();
  const DEPTH = 5, Z0 = -2.9;   // ground runs from z=-2.9 to 2.1 (a strip in front of the play line)
  for (const [a, b, top] of TERRAIN) {
    const len = b - a + 1, h = top - YMIN, cx = a + len / 2;
    const st = soilTex.clone(); st.needsUpdate = true; st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(len / 2, h / 2);
    part(scene, box, new THREE.MeshStandardMaterial({ map: st, roughness: .95 }), cx, YMIN + h / 2 - .02, Z0 + DEPTH / 2, len, h, DEPTH, false);
    const gt = grassTex.clone(); gt.needsUpdate = true; gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(len / 2, DEPTH / 2);
    part(scene, box, new THREE.MeshStandardMaterial({ map: gt, roughness: .9 }), cx, top - .1, Z0 + DEPTH / 2, len + .06, .24, DEPTH + .06, false).receiveShadow = true;
  }
  // River below the path (pits drop into it), a back meadow shelf and a far bank, so no view shows empty sky under the level.
  const rippleTex = canvasTex(128, 128, (g, w, h) => { const R2 = rngFrom(19); g.fillStyle = '#3d9bd4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.strokeStyle = i % 3 ? '#63b6e6' : '#a9dcf5'; g.lineWidth = 2; const x = R2() * w, y = R2() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16, y); g.stroke(); } }, [60, 6]);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(340, 22), new THREE.MeshStandardMaterial({ map: rippleTex, roughness: .12, metalness: .15, transparent: true, opacity: .93 }));
  river.rotation.x = -Math.PI / 2; river.position.set(100, -2.35, 8); river.receiveShadow = true; scene.add(river);
  const shelfSoil = new THREE.MeshStandardMaterial({ color: '#8a5530', roughness: 1 }), shelfGrass = new THREE.MeshStandardMaterial({ map: (() => { const t = grassTex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(80, 30); return t; })(), roughness: .95 });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(340, 2.7, 120), [shelfSoil, shelfSoil, shelfGrass, shelfSoil, shelfSoil, shelfSoil]); shelf.position.set(100, -1.65, -63.05); shelf.receiveShadow = true; scene.add(shelf);
  const bank = new THREE.Mesh(new THREE.BoxGeometry(340, 1, 60), [shelfSoil, shelfSoil, shelfGrass, shelfSoil, shelfSoil, shelfSoil]); bank.position.set(100, -2.6, 49); scene.add(bank);
  const rocks = new THREE.InstancedMesh(ico, new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: .9, flatShading: true }), 40);
  for (let i = 0; i < 40; i++) { tmp.position.set(-10 + i * 5.2 + R() * 3, -2.3, 3 + R() * 9); tmp.rotation.set(R() * 3, R() * 3, R() * 3); tmp.scale.set(.3 + R() * .5, .2 + R() * .3, .3 + R() * .5); tmp.updateMatrix(); rocks.setMatrixAt(i, tmp.matrix); }
  scene.add(rocks);
  // Grass tufts and flowers along the front edge and behind the play line (instanced).
  const tuftGeo = new THREE.ConeGeometry(.08, .35, 4); const tufts = new THREE.InstancedMesh(tuftGeo, mat('#4f9e36', .8), 900); let tn = 0;
  const flowerGeo = new THREE.SphereGeometry(.09, 8, 6); const flowers = new THREE.InstancedMesh(flowerGeo, mat('#ffffff', .6), 260); let fn = 0;
  const fcol = new THREE.Color(), flowerColors = ['#ffe45a', '#ff8fb1', '#ffffff', '#b58cff'];
  for (const [a, b, top] of TERRAIN) for (let x = a; x <= b; x += .5) for (const zr of [[1.3, 2.05], [-2.8, -1.2]]) {
    if (R() < .45 && tn < 900) { tmp.position.set(x + R() * .5, top + .12, zr[0] + R() * (zr[1] - zr[0])); tmp.rotation.set((R() - .5) * .5, R() * 3, (R() - .5) * .5); const s = .7 + R() * .8; tmp.scale.set(s, s, s); tmp.updateMatrix(); tufts.setMatrixAt(tn++, tmp.matrix); }
    if (R() < .09 && fn < 260) { tmp.position.set(x + R() * .5, top + .2, zr[0] + R() * (zr[1] - zr[0])); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(.8 + R() * .6); tmp.updateMatrix(); flowers.setMatrixAt(fn, tmp.matrix); flowers.setColorAt(fn++, fcol.set(flowerColors[Math.floor(R() * 4)])); }
  }
  tufts.count = tn; flowers.count = fn; scene.add(tufts, flowers);

  // --- Backdrop: rolling hills, round trees, pines, clouds and far mountains (all instanced).
  const hillMats = [mat('#7cc956', .95), mat('#63b04a', .95), mat('#9ad27a', .95)];
  for (let i = 0; i < 24; i++) { const x = -30 + i * 10.5 + R() * 6, z = -34 - R() * 26, r = 10 + R() * 9; const m = part(scene, midSph, hillMats[i % 3], x, -5, z, r * 1.4, r * .7, r, false); m.receiveShadow = false; }
  for (let i = 0; i < 20; i++) { const x = -15 + i * 11 + R() * 6, z = -17 - R() * 6, r = 4 + R() * 4; part(scene, midSph, hillMats[(i + 1) % 3], x, -2.2, z, r * 1.5, r * .55, r, false).receiveShadow = false; }
  const mountains = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), mat('#8fb4cf', 1), 16);
  for (let i = 0; i < 16; i++) { tmp.position.set(-30 + i * 16 + R() * 8, 6, -95 - R() * 30); tmp.rotation.set(0, R() * 3, 0); const s = 16 + R() * 14; tmp.scale.set(s, 26 + R() * 18, s); tmp.updateMatrix(); mountains.setMatrixAt(i, tmp.matrix); }
  scene.add(mountains);
  const trunkI = new THREE.InstancedMesh(cyl, mat('#7a5230', .9), 90), crownI = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ color: '#3f9a4a', roughness: .8, flatShading: true }), 90), pineI = new THREE.InstancedMesh(cone, mat('#2f7a45', .85), 120);
  let ti = 0, pi = 0;
  for (let x = -12; x < LEVEL_END + 30; x += 2.6 + R() * 3) {
    const z = -6.5 - R() * 9, s = .9 + R() * .9;
    if (R() < .55 && ti < 90) { tmp.rotation.set(0, 0, 0); tmp.position.set(x, 1 * s - .4, z); tmp.scale.set(.18 * s, 2 * s, .18 * s); tmp.updateMatrix(); trunkI.setMatrixAt(ti, tmp.matrix); tmp.position.set(x, 2.6 * s, z); tmp.scale.set(1.2 * s, 1.1 * s, 1.2 * s); tmp.updateMatrix(); crownI.setMatrixAt(ti++, tmp.matrix); }
    else if (pi < 118) { for (let k = 0; k < 2; k++) { tmp.rotation.set(0, 0, 0); tmp.position.set(x, (1.4 + k * 1.1) * s, z); tmp.scale.set((1.1 - k * .3) * s, 2 * s, (1.1 - k * .3) * s); tmp.updateMatrix(); pineI.setMatrixAt(pi++, tmp.matrix); } }
  }
  trunkI.count = ti; crownI.count = ti; pineI.count = pi; for (const m of [trunkI, crownI, pineI]) { m.castShadow = true; scene.add(m); }
  const cloudI = new THREE.InstancedMesh(midSph, new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: .55 }), 160); let ci = 0;
  for (let x = -30; x < LEVEL_END + 50; x += 14 + R() * 10) { const y = 17 + R() * 8, z = -45 - R() * 30; for (let k = 0; k < 5 && ci < 160; k++) { tmp.rotation.set(0, 0, 0); tmp.position.set(x + (k - 2) * 2.2, y + (k % 2) * .9, z + R() * 2); tmp.scale.set(2.4 + R() * 1.4, 1.5 + R() * .8, 1.6); tmp.updateMatrix(); cloudI.setMatrixAt(ci++, tmp.matrix); } }
  cloudI.count = ci; scene.add(cloudI);

  // --- Blocks: one InstancedMesh per look; each cell owns fixed slots, hidden by zero scale.
  const T = { stone: TEX.stone(), clay: TEX.clay(), crate: TEX.crate(), used: TEX.used() };
  const specs = [
    { type: STONE, mat: new THREE.MeshStandardMaterial({ map: T.stone, roughness: .85 }) },
    { type: CLAY, mat: new THREE.MeshStandardMaterial({ map: T.clay, roughness: .7 }) },
    { type: CRATE, mat: new THREE.MeshStandardMaterial({ map: T.crate, roughness: .6, emissive: '#402000', emissiveIntensity: .15 }) },
    { type: USED, mat: new THREE.MeshStandardMaterial({ map: T.used, roughness: .85 }) }
  ];
  const cellIdx = (x, y) => (y - YMIN) * W + x;
  const crateCells = [...world.crates.keys()].map(k => { const [x, y] = k.split(',').map(Number); return cellIdx(x, y); });
  for (const sp of specs) {
    const cells = [];
    for (let i = 0; i < world.grid.length; i++) if (world.grid[i] === sp.type) cells.push(i);
    if (sp.type === CRATE || sp.type === USED) for (const c of crateCells) if (!cells.includes(c)) cells.push(c);
    sp.cells = cells; sp.slot = new Map(cells.map((c, i) => [c, i]));
    sp.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.98, .98, .98), sp.mat, Math.max(1, cells.length)); sp.mesh.castShadow = sp.mesh.receiveShadow = true; sp.mesh.frustumCulled = false;
    scene.add(sp.mesh);
  }
  const bumps = new Map();   // cell -> seconds remaining
  function writeCell(c) {
    const v = world.grid[c], x = c % W, y = Math.floor(c / W) + YMIN, bt = bumps.get(c) || 0, lift = bt > 0 ? Math.sin((1 - bt / .22) * Math.PI) * .32 : 0;
    for (const sp of specs) {
      const slot = sp.slot.get(c); if (slot === undefined) continue;
      if (v === sp.type) { tmp.position.set(x + .5, y + .5 + lift, 0); tmp.scale.set(1, 1, 1); } else { tmp.position.set(0, -80, 0); tmp.scale.set(0, 0, 0); }
      tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); sp.mesh.setMatrixAt(slot, tmp.matrix); sp.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  const allCells = new Set(specs.flatMap(s => s.cells)); for (const c of allCells) writeCell(c);
  let gridVersion = world.gridVersion;
  // Static props: log stumps, planks, spring leaf, moving log.
  const barkTex = TEX.bark(), ringTex = TEX.rings();
  const logCols = new Map(); for (let i = 0; i < world.grid.length; i++) if (world.grid[i] === LOG) { const x = i % W, y = Math.floor(i / W) + YMIN; const k = x; if (!logCols.has(k)) logCols.set(k, []); logCols.get(k).push(y); }
  const seenLog = new Set();
  for (const [x, ys] of logCols) {
    if (seenLog.has(x)) continue; const pair = logCols.has(x + 1); seenLog.add(x); if (pair) seenLog.add(x + 1);
    const w2 = pair ? 2 : 1, top = Math.max(...ys) + 1, h = top + .1, cx = x + w2 / 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(w2 * .47, w2 * .5, h, 24), [new THREE.MeshStandardMaterial({ map: barkTex, roughness: .9 }), new THREE.MeshStandardMaterial({ map: ringTex, roughness: .8 }), new THREE.MeshStandardMaterial({ map: ringTex })]);
    log.position.set(cx, h / 2 - .1, 0); log.castShadow = log.receiveShadow = true; scene.add(log);
    part(scene, sph, mat('#58a83c', .8), cx - .3, top + .05, .35, .22, .12, .22);
  }
  const plankTex = TEX.plank();
  for (let y = YMIN; y < YMAX; y++) { let run = -1; for (let x = 0; x <= W; x++) { const on = x < W && world.grid[cellIdx(x, y)] === PLANK; if (on && run < 0) run = x; if (!on && run >= 0) { const len = x - run; const pt = plankTex.clone(); pt.needsUpdate = true; pt.wrapS = THREE.RepeatWrapping; pt.repeat.set(len, 1); part(scene, box, new THREE.MeshStandardMaterial({ map: pt, roughness: .8 }), run + len / 2, y + .86, 0, len, .28, 1.3); for (const px of [run + .3, x - .3]) part(scene, cyl, mat('#8a5a32', .9), px, y + .3, -.3, .08, 1.1, .08); run = -1; } } }
  const springs = [];
  for (let i = 0; i < world.grid.length; i++) if (world.grid[i] === SPRING) {
    const x = i % W, y = Math.floor(i / W) + YMIN, g = new THREE.Group(); g.position.set(x + .5, y, 0); scene.add(g);
    part(g, cyl, mat('#7a5230', .9), 0, .3, 0, .42, .6, .42);
    const pad = new THREE.Group(); pad.position.y = .65; g.add(pad);
    const leafM = mat('#46c25a', .5); for (let k = 0; k < 5; k++) { const l = part(pad, sph, leafM, Math.cos(k / 5 * TAU) * .32, .06, Math.sin(k / 5 * TAU) * .32, .38, .07, .2); l.rotation.y = -k / 5 * TAU; }
    part(pad, sph, mat('#ffe45a', .4), 0, .1, 0, .16, .1, .16); springs.push({ x, pad, t: 0 });
  }
  const mover = new THREE.Group(); scene.add(mover);
  const moverLog = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, PLATFORM.w, 20), [new THREE.MeshStandardMaterial({ map: barkTex, roughness: .9 }), new THREE.MeshStandardMaterial({ map: ringTex }), new THREE.MeshStandardMaterial({ map: ringTex })]);
  moverLog.rotation.z = Math.PI / 2; moverLog.position.set(PLATFORM.w / 2, PLATFORM.y + .08, 0); moverLog.castShadow = true; mover.add(moverLog);
  for (let k = 0; k < 3; k++) part(mover, sph, mat('#58a83c', .8), .6 + k * .9, PLATFORM.y + .5, (k - 1) * .25, .2, .08, .14);
  // Checkpoint lantern post, goal pole with bell + pennant, and the finish cottage with a windmill.
  const post = new THREE.Group(); post.position.set(CHECKPOINT_X + .5, 0, -.9); scene.add(post);
  part(post, cyl, mat('#5b4632', .8), 0, 1.2, 0, .07, 2.4, .07); part(post, box, mat('#5b4632', .8), .2, 2.35, 0, .45, .06, .06);
  const cpLampMat = new THREE.MeshStandardMaterial({ color: '#8a8a8a', emissive: '#000000', roughness: .3 }); part(post, cyl, cpLampMat, .38, 2.1, 0, .12, .3, .12);
  const pole = new THREE.Group(); pole.position.set(GOAL_X + .5, 0, 0); scene.add(pole);
  part(pole, cyl, mat('#f3f1ea', .4, .3), 0, GOAL_TOP / 2, 0, .08, GOAL_TOP, .08); part(pole, box, mat('#8f98a3', .8), 0, .25, 0, .9, .5, .9);
  const bell = new THREE.Group(); bell.position.set(0, GOAL_TOP + .2, 0); pole.add(bell);
  part(bell, new THREE.CylinderGeometry(.18, .42, .6, 20, 1, true), mat('#f2c230', .25, .8, { side: THREE.DoubleSide }), 0, -.35, 0, 1, 1, 1); part(bell, sph, mat('#f2c230', .25, .8), 0, -.05, 0, .2, .14, .2); part(bell, sph, mat('#8a6a10', .4, .6), 0, -.68, 0, .08, .08, .08);
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .8, 8, 1), new THREE.MeshStandardMaterial({ color: '#ff6a3d', side: THREE.DoubleSide, roughness: .7 })); pennant.position.set(-.75, GOAL_TOP - .9, 0); pole.add(pennant);
  const penBase = pennant.geometry.attributes.position.array.slice();
  const cottage = new THREE.Group(); cottage.position.set(DOOR_X, 0, -1.6); scene.add(cottage);
  part(cottage, box, mat('#fff4e0', .9), 0, 1.6, 0, 4.2, 3.2, 3);
  const roof = part(cottage, new THREE.ConeGeometry(3.4, 2.2, 4), mat('#d8583c', .7), 0, 4.3, 0, 1, 1, .95); roof.rotation.y = Math.PI / 4;
  part(cottage, box, mat('#7a4a22', .8), 0, .9, 1.52, 1.1, 1.8, .08); part(cottage, sph, mat('#f2c230', .3, .7), .35, .95, 1.58, .06, .06, .04);
  for (const s of [-1, 1]) { part(cottage, box, mat('#9fd2f2', .2, 0, { emissive: '#ffd27a', emissiveIntensity: .3 }), s * 1.4, 2.1, 1.52, .7, .7, .06); }
  part(cottage, box, mat('#c9b8a0', .9), 1.3, 4.3, .2, .45, 1.4, .45);
  const blades = new THREE.Group(); blades.position.set(1.3, 4.9, .55); blades.scale.setScalar(.75); cottage.add(blades);
  for (let k = 0; k < 4; k++) { const b = new THREE.Group(); b.rotation.z = k * Math.PI / 2; blades.add(b); part(b, box, mat('#f5ead2', .8), 0, 1.3, 0, .5, 2.2, .06); part(b, box, mat('#7a4a22', .8), 0, 1, .05, .08, 2.4, .08); }
  part(blades, cyl, mat('#7a4a22', .8), 0, 0, 0, .2, .3, .2).rotation.x = Math.PI / 2;

  // --- Dynamic actors.
  const fox = foxModel(); fox.group.scale.setScalar(1.15); scene.add(fox.group);
  const lanternLight = new THREE.PointLight('#ffd27a', 0, 6, 1.6); scene.add(lanternLight);
  const enemyModels = new Map(), itemModels = new Map();
  const acornGeo = acornModel(); const acornProtos = [];
  const acornGroup = new THREE.Group(); scene.add(acornGroup);
  for (const a of world.acorns) { const m = acornGeo.clone(); m.position.set(a.x, a.y, 0); acornGroup.add(m); acornProtos.push({ a, m }); }
  const sparkTex = glowTex('#fffbe0', '#ffb84a'), sparks = [];
  const fx = [];
  function addFx(obj, o) { scene.add(obj); fx.push({ obj, life: o.life, max: o.life, type: o.type, vel: o.vel || new THREE.Vector3(), spin: o.spin || 0, s0: o.s0 ?? 1, s1: o.s1 ?? 1, dispose: o.dispose, op: o.op ?? 1 }); if (fx.length > 500) { const f = fx.shift(); scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); } }
  const scoreTex = new Map();
  function popText(x, y, text, color = '#ffffff') {
    const key = text + color; if (!scoreTex.has(key)) scoreTex.set(key, textTex(text, color));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: scoreTex.get(key), transparent: true, depthWrite: false })); s.position.set(x, y, .6);
    addFx(s, { type: 'text', life: .9, s0: 1.4, vel: new THREE.Vector3(0, 1.6, 0), dispose: true });
  }
  function puff(x, y, z, n = 5, color = '#f3ead8', size = .25) {
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(lowSph, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, flatShading: true, depthWrite: false })); m.position.set(x + (Math.random() - .5) * .4, y + .1, z + (Math.random() - .5) * .5); addFx(m, { type: 'puff', life: .45 + Math.random() * .2, s0: size * .6, s1: size * 1.6, vel: new THREE.Vector3((Math.random() - .5) * 1.6, .6 + Math.random() * .6, (Math.random() - .5) * .8), dispose: true, op: .9 }); }
  }
  const chipMats = { clay: mat('#d0693c', .7), wood: mat('#d99a3e', .7), gold: mat('#ffd23f', .3, .4, { emissive: '#8a6000', emissiveIntensity: .5 }), star: mat('#fff3a0', .3, 0, { emissive: '#ffe45a', emissiveIntensity: 1.5 }) };
  function chips(x, y, kind, n, power = 1) {
    for (let i = 0; i < n; i++) { const s = .12 + Math.random() * .14, m = new THREE.Mesh(box, chipMats[kind]); m.scale.setScalar(s); m.position.set(x + (Math.random() - .5) * .6, y + (Math.random() - .5) * .6, (Math.random() - .5) * .6); m.castShadow = true;
      addFx(m, { type: 'chip', life: 1.1 + Math.random() * .4, vel: new THREE.Vector3((Math.random() - .5) * 6 * power, (4 + Math.random() * 5) * power, (Math.random() - .5) * 4), spin: (Math.random() - .5) * 16, s0: s }); }
  }
  function sparkle(x, y, color = '#fff3a0', n = 8, speed = 3) {
    const tex = glowTex('#ffffff', color);
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, .4); const a = i / n * TAU; addFx(s, { type: 'spark', life: .5 + Math.random() * .3, s0: .5, s1: .1, vel: new THREE.Vector3(Math.cos(a) * speed, Math.sin(a) * speed, (Math.random() - .5)), dispose: true }); }
  }
  function firework(x, y) {
    const colors = ['#ff5f7a', '#ffd23f', '#6fe7ff', '#9dff7a', '#c79bff'], c = colors[Math.floor(Math.random() * colors.length)], tex = glowTex('#ffffff', c);
    for (let i = 0; i < 36; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, -2); const a = Math.random() * TAU, b = Math.random() * Math.PI - Math.PI / 2, sp = 4 + Math.random() * 3; addFx(s, { type: 'firework', life: 1.2 + Math.random() * .5, s0: .9, s1: .2, vel: new THREE.Vector3(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 1, Math.sin(a) * Math.cos(b) * sp * .6), dispose: true }); }
  }
  function acornPop(x, y) { const m = acornGeo.clone(); m.position.set(x, y, 0); addFx(m, { type: 'acorn', life: .55, vel: new THREE.Vector3(0, 9, 0), spin: 18 }); }

  // --- Camera: side view with look-ahead; Q/E orbit (clamped so left/right stays readable), R/F tilt, C reset.
  const PRESETS = [
    {name:'侧视',yaw:0,pitch:.17,dist:15.5},
    {name:'斜俯视',yaw:-.62,pitch:.52,dist:18},
    {name:'俯视',yaw:0,pitch:1.48,dist:23},
    {name:'近景',yaw:0,pitch:.26,dist:11},
    {name:'远景',yaw:.55,pitch:.48,dist:25}
  ];
  let cameraIndex = 0;
  const DEF_YAW = 0, DEF_PITCH = .17, YAW_LIM = .95;
  let yaw = DEF_YAW, pitch = DEF_PITCH, elapsed = 0, shake = 0, lookAhead = 2, camY = 3, camX = world.hero.x;
  const target = new THREE.Vector3();
  function cameraPose(dt, cam, snap) {
    const p = world.hero, aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const dist = PRESETS[cameraIndex].dist + (aspect < 1.5 ? 2 : 0);
    lookAhead += ((p.facing || 1) * Math.min(3, 1 + Math.abs(p.vx) * .25) - lookAhead) * Math.min(1, dt * 2.2);
    const wantX = THREE.MathUtils.clamp(p.x + lookAhead, 7, LEVEL_END - 6);
    camX = snap ? wantX : camX + (wantX - camX) * Math.min(1, dt * 6);
    const floorY = world.goal ? 0 : p.y; const wantY = Math.max(4, floorY + 2.7);
    camY = snap ? wantY : camY + (wantY - camY) * Math.min(1, dt * (p.grounded || p.y < camY - 3 ? 3.5 : .8));
    let tx = camX, ty = camY, tz = 0, pt = pitch, yw = yaw, d = dist;
    if (cam.intro !== undefined && cam.intro >= 0) {
      const e = cam.intro * cam.intro * (3 - 2 * cam.intro);
      tx = THREE.MathUtils.lerp(26, camX, e); ty = THREE.MathUtils.lerp(9, camY, e); d = THREE.MathUtils.lerp(46, dist, e); yw = THREE.MathUtils.lerp(-.55, yaw, e); pt = THREE.MathUtils.lerp(.42, pitch, e);
    }
    if (cam.attract) { yw += Math.sin(elapsed * .25) * .18; }
    target.set(tx, ty, tz);
    camera.position.set(tx + Math.sin(yw) * Math.cos(pt) * d, ty + Math.sin(pt) * d, tz + Math.cos(yw) * Math.cos(pt) * d);
    if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - .5) * shake, (Math.random() - .5) * shake, 0));
    camera.lookAt(target);
    sun.position.set(tx - 10, ty + 22, 16); sun.target.position.set(tx, ty - 3, 0);
    sky.position.copy(camera.position);
  }

  function syncEnemy(e) {
    let m = enemyModels.get(e.id);
    if (!m) { m = e.kind === 'snail' ? snailModel() : beetleModel(); m.kind = e.kind; enemyModels.set(e.id, m); scene.add(m.group); }
    m.group.visible = !e.gone;
    if (e.gone) return;
    m.group.position.set(e.x, e.y, 0);
    const dir = e.vx >= 0 ? 1 : -1;
    m.group.rotation.y = e.state === 'shell' ? 0 : (dir > 0 ? 0 : Math.PI);
    if (e.state === 'dead') { m.group.rotation.z = Math.PI; m.group.position.y = e.y + (e.kind === 'snail' ? .8 : .5); return; }
    m.group.rotation.z = 0;
    if (m.kind === 'beetle') {
      const flat = e.state === 'squashed'; m.rig.scale.set(flat ? 1.25 : 1, flat ? .3 : 1, flat ? 1.2 : 1);
      m.legs.forEach((l, i) => { l.rotation.z = Math.sin(elapsed * 16 + i * 1.7) * .5; });
      m.rig.position.y = flat ? 0 : Math.abs(Math.sin(elapsed * 16)) * .03;
    } else {
      const shell = e.state === 'shell'; m.bodyG.visible = !shell; m.shell.position.set(shell ? 0 : -.05, shell ? .34 : .42, 0);
      if (shell) m.shell.rotation.z -= e.vx * .016; else { m.shell.rotation.z = Math.sin(elapsed * 3) * .05; m.bodyG.scale.x = 1 + Math.sin(elapsed * 6) * .06; }
    }
  }
  function itemModel(kind) { return kind === 'berry' ? berryModel() : kind === 'jar' ? jarModel() : leafModel(); }

  let dt_ = 0;
  function update(dt, cam = {}, snap = false) {
    dt_ = dt; elapsed += dt;
    yaw -= (cam.yaw || 0) * dt * 1.4;
    pitch = THREE.MathUtils.clamp(pitch + (cam.pitch || 0) * dt * .8, .02, 1.48);
    if (cam.reset) { cameraIndex = (cameraIndex + 1) % PRESETS.length; yaw = PRESETS[cameraIndex].yaw; pitch = PRESETS[cameraIndex].pitch; }
    shake = Math.max(0, shake - dt * 2.5);
    // Blocks (destruction, reveals, bump lifts).
    if (world.gridVersion !== gridVersion || bumps.size) {
      gridVersion = world.gridVersion;
      for (const c of allCells) if (!bumps.has(c)) writeCell(c);
      for (const [c, t] of bumps) { const n = t - dt; if (n <= 0) bumps.delete(c); else bumps.set(c, n); writeCell(c); }
    }
    // Hero.
    const p = world.hero, g = world.goal;
    fox.group.visible = !(g && g.hidden) && !(p.invincible > 0 && !p.dead && Math.floor(elapsed * 16) % 2 === 0);
    fox.group.position.set(p.x, p.y, 0); fox.group.scale.setScalar(1.15);
    const face = p.lookHeading !== undefined ? p.lookHeading : p.facing >= 0 ? 0 : Math.PI; fox.group.rotation.y += Math.atan2(Math.sin(face - fox.group.rotation.y), Math.cos(face - fox.group.rotation.y)) * Math.min(1, dt * 14);
    const speed = Math.abs(p.vx), air = !p.grounded && !p.dead;
    const cycle = elapsed * (6 + speed * 1.6);
    fox.legs.forEach((l, i) => { l.rotation.z = air ? (i < 2 ? -.9 : .8) : speed > .2 ? Math.sin(cycle + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(1, speed * .18) : 0; });
    fox.rig.position.y = !air && speed > .2 ? Math.abs(Math.sin(cycle)) * .06 : 0;
    fox.rig.rotation.z = p.dead ? 0 : p.skid ? .35 : air ? THREE.MathUtils.clamp(p.vy * .03, -.3, .3) : -Math.min(.2, speed * .02);
    const sq = p.squash; fox.rig.scale.set(1 + sq * .18, 1 - sq * .22 + (air && p.vy > 4 ? .08 : 0), 1 + sq * .12);
    fox.tail.rotation.z = Math.sin(elapsed * (speed > .2 ? 12 : 3)) * .35 + (air ? .5 : 0);
    fox.head.rotation.z = air ? .15 : Math.sin(elapsed * 2) * .03;
    fox.scarfTail.rotation.z = .4 + Math.sin(elapsed * 14) * .2 * Math.min(1, speed * .2 + (air ? 1 : 0));
    if (p.dead) { fox.group.rotation.y = Math.PI / 2; fox.rig.rotation.x = Math.PI * .1; } else fox.rig.rotation.x = 0;
    fox.helmet.visible = p.power >= 1 && !p.dead; fox.lantern.visible = p.power === 2 && !p.dead;
    lanternLight.intensity = p.power === 2 && !p.dead ? 3.5 + Math.sin(elapsed * 9) * .6 : 0; lanternLight.position.set(p.x + p.facing * .3, p.y + .7, .6);
    // Enemies, items, acorns, sparks.
    for (const e of world.enemies) syncEnemy(e);
    for (const it of world.items) {
      let m = itemModels.get(it.id); if (!m) { m = itemModel(it.kind); itemModels.set(it.id, m); scene.add(m); }
      m.visible = it.alive; if (!it.alive) continue;
      const rise = it.rising ? -(it.rising / .6) * .95 : 0; m.position.set(it.x, it.y + rise, 0); m.rotation.y = elapsed * (it.kind === 'jar' ? 1.2 : 3);
    }
    for (const { a, m } of acornProtos) { m.visible = a.alive; if (a.alive) { m.rotation.y = elapsed * 2.4 + a.x; m.position.y = a.y + Math.sin(elapsed * 3 + a.x) * .06; } }
    while (sparks.length < world.sparks.length) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(.8, .8, 1); scene.add(s); sparks.push(s); }
    sparks.forEach((s, i) => { const sp = world.sparks[i]; s.visible = !!sp; if (sp) { s.position.set(sp.x, sp.y + .18, .2); s.material.rotation = elapsed * 12; } });
    // Props.
    mover.position.x = world.platform.x;
    for (const s of springs) { s.t = Math.max(0, s.t - dt); s.pad.position.y = .65 - Math.sin(s.t / .35 * Math.PI) * .25; }
    const lit = world.checkpoint >= CHECKPOINT_X; cpLampMat.emissive.set(lit ? '#ffcf5a' : '#000000'); cpLampMat.emissiveIntensity = lit ? 1.6 : 0;
    blades.rotation.z -= dt * .8; rippleTex.offset.x = elapsed * .02; rippleTex.offset.y = Math.sin(elapsed * .5) * .02;
    const pos = pennant.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x0 = penBase[i * 3], y0 = penBase[i * 3 + 1]; pos.array[i * 3 + 2] = Math.sin(elapsed * 5 + x0 * 3) * .12 * (.7 - x0) ; pos.array[i * 3 + 1] = y0; } pos.needsUpdate = true;
    if (g) { bell.rotation.z = Math.sin(g.t * 9) * Math.max(0, .5 - g.t * .12); pennant.position.y = Math.max(.6, GOAL_TOP - .9 - Math.min(g.t, 1.2) * 6); }
    // Effects.
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt; const t = 1 - Math.max(0, f.life) / f.max, o = f.obj;
      if (f.type === 'chip') { f.vel.y -= 22 * dt; o.position.addScaledVector(f.vel, dt); o.rotation.x += f.spin * dt; o.rotation.y += f.spin * .7 * dt; if (t > .7) o.scale.setScalar(f.s0 * (1 - (t - .7) / .3)); }
      else if (f.type === 'acorn') { f.vel.y -= 26 * dt; o.position.addScaledVector(f.vel, dt); o.rotation.y += f.spin * dt; }
      else if (f.type === 'text') { o.position.addScaledVector(f.vel, dt); o.scale.set(f.s0, f.s0 / 2, 1); o.material.opacity = Math.min(1, (1 - t) * 3); }
      else { f.vel.multiplyScalar(f.type === 'firework' ? .985 : .96); if (f.type === 'firework') f.vel.y -= 2.5 * dt; o.position.addScaledVector(f.vel, dt); const s = f.s0 + (f.s1 - f.s0) * t; o.scale.setScalar(s); o.material.opacity = f.op * (1 - t); }
      if (f.life <= 0) { scene.remove(o); if (f.dispose) o.material.dispose(); fx.splice(i, 1); }
    }
    cameraPose(dt, cam, snap);
    renderer.render(scene, camera);
  }
  function effect(e) {
    switch (e.type) {
      case 'bump': case 'reveal': { const c = cellIdx(e.x, e.y); bumps.set(c, .22); writeCell(c); if (e.type === 'reveal') sparkle(e.x + .5, e.y + .5, '#ffe45a', 10); break; }
      case 'break': chips(e.x + .5, e.y + .5, 'clay', 12, 1); puff(e.x + .5, e.y + .3, 0, 3, '#e8b08a', .3); shake = Math.max(shake, .12); break;
      case 'acorn': if (e.fromCrate) acornPop(e.x, e.y); else sparkle(e.x, e.y, '#ffd23f', 6, 2.2); break;
      case 'stomp': puff(e.x, e.y + .1, 0, 5); sparkle(e.x, e.y + .4, '#ffffff', 6, 2.5); break;
      case 'kick': sparkle(e.x, e.y + .3, '#ffe45a', 8, 3); shake = Math.max(shake, .1); break;
      case 'flip': sparkle(e.x, e.y + .5, '#ffffff', 6, 2); break;
      case 'points': popText(e.x, e.y, String(e.value), e.value >= 1000 ? '#ffd23f' : '#ffffff'); break;
      case 'oneup': popText(e.x, e.y + .5, '1UP', '#7dff8a'); sparkle(e.x, e.y + .5, '#7dff8a', 12, 3); break;
      case 'sprout': sparkle(e.x + .5, e.y + 1.2, '#ffffff', 6, 1.6); break;
      case 'powerup': sparkle(e.x, e.y + .5, e.kind === 'jar' ? '#ffe45a' : '#ff8fa0', 16, 3.5); break;
      case 'shrink': puff(e.x, e.y + .5, 0, 6, '#ffffff', .3); break;
      case 'land': puff(e.x, e.y, 0, e.hard ? 7 : 4); if (e.hard) shake = Math.max(shake, .08); break;
      case 'spring': { const s = springs.find(s => s.x === e.x); if (s) s.t = .35; sparkle(e.x + .5, e.y + 1, '#9dff7a', 10, 3); break; }
      case 'throw': sparkle(e.x, e.y, '#ffd27a', 4, 1.5); break;
      case 'fizz': sparkle(e.x, e.y, '#ffb84a', 5, 1.5); break;
      case 'die': shake = .25; break;
      case 'checkpoint': sparkle(CHECKPOINT_X + .9, 2.1, '#ffcf5a', 14, 3); break;
      case 'goal': sparkle(GOAL_X + .5, GOAL_TOP, '#ffd23f', 18, 4); break;
      case 'firework': firework(e.x, e.y); break;
    }
  }
  function reset() { for (const m of enemyModels.values()) scene.remove(m.group); enemyModels.clear(); for (const m of itemModels.values()) scene.remove(m); itemModels.clear(); for (const f of fx) { scene.remove(f.obj); if (f.dispose) f.obj.material.dispose(); } fx.length = 0; bumps.clear(); gridVersion = -1; acornProtos.forEach((o, i) => { o.a = world.acorns[i]; }); camX = world.hero.x; }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); update(0, {}, true);
  return { subjectHeading:()=>fox.group.rotation.y, rotate(delta) { yaw += delta; }, renderer, scene, camera, update, effect, resize, reset, get yaw() { return yaw; }, get cameraIndex() { return cameraIndex; }, get cameraName() { return PRESETS[cameraIndex].name; }, get cameraCount() { return PRESETS.length; } };
}
