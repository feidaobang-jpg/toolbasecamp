// Mario 1-1 in 3D — programmatic rendering on top of the deterministic world.
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { LEVEL_END, GAPS, FLAG_X, PIPES, STAIRS } from './world.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const edgeGeo = new THREE.EdgesGeometry(boxGeo);
const _matCache = new Map();
const M = (c, opts) => {
  if (!opts) { let m = _matCache.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); _matCache.set(c, m); } return m; }
  return new THREE.MeshLambertMaterial({ color: c, ...opts });
};
const _geoCache = new Map();
const sphereGeo = (r, w = 14, h = 10) => { const k = 's' + r + '_' + w + '_' + h; let g = _geoCache.get(k); if (!g) { g = new THREE.SphereGeometry(r, w, h); _geoCache.set(k, g); } return g; };
const cylGeo = (rt, rb, hh, seg) => { const k = 'c' + rt + '_' + rb + '_' + hh + '_' + seg; let g = _geoCache.get(k); if (!g) { g = new THREE.CylinderGeometry(rt, rb, hh, seg); _geoCache.set(k, g); } return g; };

// Procedural canvas textures — original art, no extracted game assets.
function canvasTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function questionTexture() {
  return canvasTex(g => {
    g.fillStyle = '#f8b800'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c98d00'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    for (const [x, y] of [[20, 20], [98, 20], [20, 98], [98, 98]]) { g.fillStyle = '#5a2c0c'; g.fillRect(x, y, 10, 10); }
    g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5a2c0c'; g.fillText('?', 68, 70);
    g.fillStyle = '#fff3c8'; g.fillText('?', 64, 64);
  });
}
function brickTexture() {
  return canvasTex(g => {
    g.fillStyle = '#c84c0c'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8f3208';
    for (let row = 0; row < 4; row++) { g.fillRect(0, row * 32 + 28, 128, 4); const off = row % 2 ? 32 : 0; for (let col = 0; col < 3; col++) g.fillRect(((off + col * 64) % 128) + 60, row * 32, 4, 30); }
    g.fillStyle = '#e0713a';
    for (let row = 0; row < 4; row++) { const off = row % 2 ? 32 : 0; for (let col = -1; col < 3; col++) g.fillRect(((off + col * 64) % 128) + 4, row * 32 + 4, 56, 3); }
  });
}

function mesh(parent, geo, color, x, y, z, cast = true) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? M(color) : color);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}

export function createScene(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#5c94fc');
  scene.fog = new THREE.Fog('#5c94fc', 42, 95);
  const camera = new THREE.PerspectiveCamera(55, 2, .1, 220);

  scene.add(new THREE.HemisphereLight('#eaf4ff', '#3d7a2a', 1.05));
  const sun = new THREE.DirectionalLight('#fff6df', 1.6);
  sun.position.set(14, 26, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);

  const level = new THREE.Group(); scene.add(level);

  // --- Ground strips (skip the two pits) with grass tops and dirt bodies.
  const decor = new THREE.Group(); scene.add(decor);
  for (const [a, b] of [[-8, GAPS[0][0]], [GAPS[0][1], GAPS[1][0]], [GAPS[1][1], LEVEL_END + 6]]) {
    const w = b - a, cx = (a + b) / 2;
    const top = mesh(decor, boxGeo, M('#3fae4a'), cx, -.15, 0); top.scale.set(w, .3, 6.4); top.castShadow = false;
    const body = mesh(decor, boxGeo, M('#9c5a2c'), cx, -1.9, 0); body.scale.set(w, 3.5, 6.4); body.castShadow = false;
    const face = mesh(decor, boxGeo, M('#7a4520'), cx, -.4, 3.21); face.scale.set(w, .5, .06); face.castShadow = false;
  }

  // --- Background dressing: hills, bushes, clouds (outside the play lane).
  // Accumulated per color, then merged into a few InstancedMeshes so orbiting
  // the camera does not pay one draw call per decoration ball.
  const unitSphere = new THREE.SphereGeometry(1, 16, 12);
  const decorBalls = new Map(); // color -> [Matrix4]
  function decorBall(x, y, z, r, color, squash) {
    if (!decorBalls.has(color)) decorBalls.set(color, []);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion(),
      new THREE.Vector3(r, squash ? r * .62 : r, r)
    );
    decorBalls.get(color).push(m);
  }
  const hill = (x, z, r, c) => decorBall(x, -.1, z, r, c, true);
  const bush = (x, z) => {
    for (const [dx, r] of [[-.6, .5], [0, .68], [.6, .5]]) decorBall(x + dx, .3, z, r, '#2f9e3f', false);
  };
  const cloud = (x, y, z) => {
    for (const [dx, dy, r] of [[-.9, 0, .55], [0, .25, .75], [.95, 0, .55]]) decorBall(x + dx, y + dy, z, r, '#ffffff', false);
  };
  for (let x = -4; x < LEVEL_END + 10; x += 26) { hill(x + 6, -8.5, 3.2, '#2f9e3f'); hill(x + 17, -7.5, 2.1, '#37a848'); }
  for (let x = 2; x < LEVEL_END + 8; x += 17) bush(x, -4.2 - (x % 3));
  for (let x = 0; x < LEVEL_END + 12; x += 21) { cloud(x, 7.5 + (x % 5) * .6, -10); cloud(x + 9, 9.2, -12); }
  for (const [color, mats] of decorBalls) {
    const inst = new THREE.InstancedMesh(unitSphere, M(color), mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = false; inst.receiveShadow = false; inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    decor.add(inst);
  }

  // --- Question / brick blocks.
  const blockNodes = new Map();
  const edgeMat = new THREE.LineBasicMaterial({ color: '#5a2c0c' });
  const qMat = new THREE.MeshLambertMaterial({ map: questionTexture() });
  const bMat = new THREE.MeshLambertMaterial({ map: brickTexture() });
  const usedMat = new THREE.MeshLambertMaterial({ color: '#8a5a2b' });
  for (const b of world.blocks) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, 0); level.add(g);
    const m = mesh(g, boxGeo, b.kind === 'q' ? qMat : bMat, 0, 0, 0);
    m.scale.setScalar(.98);
    g.add(new THREE.LineSegments(edgeGeo, edgeMat));
    blockNodes.set(b, { g, m, baseY: b.y });
  }

  // --- Pipes and staircases (instanced: same geometry, per-instance scale).
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  const pipeParts = { body: [], rim: [], hole: [] };
  for (const [x, h] of PIPES) {
    pipeParts.body.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, 0), new THREE.Quaternion(), new THREE.Vector3(.68, h, .68)));
    pipeParts.rim.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - .27, 0), new THREE.Quaternion(), new THREE.Vector3(.82, .55, .82)));
    pipeParts.hole.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h + .01, 0), new THREE.Quaternion(), new THREE.Vector3(.5, .06, .5)));
  }
  function pipeInst(parts, color, x) {
    const inst = new THREE.InstancedMesh(unitCyl, M(color), parts.length);
    parts.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = x !== 'hole'; inst.receiveShadow = true;
    inst.computeBoundingSphere(); level.add(inst);
  }
  pipeInst(pipeParts.body, '#2ea44f'); pipeInst(pipeParts.rim, '#37b95a'); pipeInst(pipeParts.hole, '#134d22', 'hole');
  const stairM = [], capM4 = [];
  for (const [x, h] of STAIRS) {
    stairM.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, 0), new THREE.Quaternion(), new THREE.Vector3(1, h, 3.2)));
    capM4.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - .06, 0), new THREE.Quaternion(), new THREE.Vector3(1.02, .1, 3.24)));
  }
  for (const [mats, color, shadow] of [[stairM, '#c9c2b8', true], [capM4, '#b5aea2', false]]) {
    const inst = new THREE.InstancedMesh(boxGeo, M(color), mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = shadow; inst.receiveShadow = true;
    inst.computeBoundingSphere(); level.add(inst);
  }

  // --- Floating coins.
  const coinGeo = new THREE.CylinderGeometry(.32, .32, .08, 16);
  const coinMat = M('#f8c81c', { emissive: '#6b4e00' });
  const coinNodes = world.coinsLive.map(c => {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.rotation.x = Math.PI / 2; m.position.set(c.x, c.y, 0); m.castShadow = true;
    level.add(m); return m;
  });

  // --- Flagpole + castle.
  const pole = mesh(level, new THREE.CylinderGeometry(.09, .09, 10, 10), M('#e8f4e8'), FLAG_X, 5, 0);
  mesh(level, new THREE.SphereGeometry(.22, 10, 8), M('#f8c81c'), FLAG_X, 10.1, 0);
  const flag = mesh(level, new THREE.ConeGeometry(.55, 1.1, 3), M('#2ea44f'), FLAG_X - .65, 9.3, 0);
  flag.rotation.z = Math.PI / 2;
  const castle = new THREE.Group(); castle.position.set(LEVEL_END + 2.2, 0, 0); level.add(castle);
  const stone = M('#b8b8c8'), stoneDark = M('#8f8f9f');
  const base = mesh(castle, boxGeo, stone, 0, 2, 0); base.scale.set(5.4, 4, 5);
  const tower = mesh(castle, boxGeo, stone, 0, 5.4, 0); tower.scale.set(2.4, 3.2, 2.4);
  for (const dx of [-2.4, 0, 2.4]) { const t = mesh(castle, boxGeo, stoneDark, dx, 4.4, 0); t.scale.set(1, 1, 1); }
  const door = mesh(castle, boxGeo, M('#26262e'), 0, 1, 2.51); door.scale.set(1.4, 2, .1);
  const castleFlag = mesh(castle, boxGeo, M('#e8e8f0'), 0, 7.6, 0); castleFlag.scale.set(.06, 1.2, .06);

  // --- Mario.
  const mario = new THREE.Group(); level.add(mario);
  const skin = M('#f0b98a'), red = M('#e03c28'), blue = M('#2a52c8'), brown = M('#6b3a1f');
  const cap = mesh(mario, new THREE.SphereGeometry(.34, 14, 10), red, 0, 1.5, 0); cap.scale.set(1, .62, 1);
  const brim = mesh(mario, boxGeo, red, .3, 1.44, 0); brim.scale.set(.42, .08, .5);
  const face = mesh(mario, new THREE.SphereGeometry(.27, 14, 10), skin, 0, 1.18, .04);
  const torso = mesh(mario, boxGeo, blue, 0, .72, 0); torso.scale.set(.62, .68, .44);
  const shirt = mesh(mario, boxGeo, red, 0, 1.0, 0); shirt.scale.set(.66, .3, .48);
  const armL = mesh(mario, boxGeo, red, -.42, .82, 0); armL.scale.set(.16, .5, .16);
  const armR = mesh(mario, boxGeo, red, .42, .82, 0); armR.scale.set(.16, .5, .16);
  const legL = mesh(mario, boxGeo, blue, -.18, .22, 0); legL.scale.set(.2, .44, .2);
  const legR = mesh(mario, boxGeo, blue, .18, .22, 0); legR.scale.set(.2, .44, .2);
  const shoeL = mesh(mario, boxGeo, brown, -.18, .06, .06); shoeL.scale.set(.22, .12, .34);
  const shoeR = mesh(mario, boxGeo, brown, .18, .06, .06); shoeR.scale.set(.22, .12, .34);
  const mustache = mesh(mario, boxGeo, brown, 0, 1.08, .24); mustache.scale.set(.3, .08, .1);

  // --- Enemies, items: built lazily per entity, synced every frame.
  const eNodes = new Map();
  function enemyNode(e) {
    const g = new THREE.Group(); level.add(g);
    if (e.kind === 'goomba') {
      const body = mesh(g, new THREE.SphereGeometry(.42, 14, 10), M('#a05a20'), 0, .45, 0); body.scale.set(1, .82, 1);
      const cap2 = mesh(g, new THREE.SphereGeometry(.46, 14, 10), M('#8a4a18'), 0, .58, 0); cap2.scale.set(1, .55, 1);
      for (const dx of [-.18, .18]) mesh(g, new THREE.SphereGeometry(.13, 8, 6), M('#3a2410'), dx, .1, .08);
      for (const dx of [-.15, .15]) { const eye = mesh(g, new THREE.SphereGeometry(.07, 8, 6), M('#ffffff'), dx, .55, .38, false); }
    } else { // koopa
      const shell = mesh(g, new THREE.SphereGeometry(.4, 14, 10), M('#2ea44f'), 0, .42, 0); shell.scale.set(1, .8, 1);
      const head = mesh(g, new THREE.SphereGeometry(.2, 10, 8), M('#f0d060'), 0, .55, .34);
      for (const dx of [-.15, .15]) mesh(g, new THREE.SphereGeometry(.12, 8, 6), M('#f0c040'), dx, .08, 0);
    }
    return g;
  }
  const itemNodes = new Map();
  function itemNode(it) {
    const g = new THREE.Group(); level.add(g);
    mesh(g, new THREE.CylinderGeometry(.18, .2, .3, 10), M('#f8e8c8'), 0, .15, 0);
    const capM = mesh(g, new THREE.SphereGeometry(.3, 14, 10), M('#e03c28'), 0, .34, 0); capM.scale.set(1, .6, 1);
    for (const [dx, dz] of [[-.14, .1], [.15, -.08], [0, -.18]]) { const d = mesh(g, new THREE.SphereGeometry(.07, 8, 6), M('#ffffff'), dx, .42, dz, false); }
    return g;
  }

  // --- Particle bursts.
  const bursts = [];
  function burst(x, y, z, color, n = 10) {
    const geo = new THREE.SphereGeometry(.09, 6, 5);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, M(color));
      m.position.set(x, y, z); level.add(m);
      bursts.push({ m, vx: (Math.random() - .5) * 6, vy: Math.random() * 5 + 2, vz: (Math.random() - .5) * 6, life: .7 });
    }
  }

  // --- Camera (orbit around Mario, contra-style conventions).
  let yaw = 0, pitch = .38, dist = 10.8;
  function update(dt, cam = {}) {
    const p = world.player;
    yaw += (cam.yaw || 0) * 2.2 * dt;
    pitch = Math.max(.08, Math.min(1.2, pitch + (cam.pitch || 0) * 1.6 * dt));
    if (cam.reset) { yaw = 0; pitch = .38; }
    const tx = p.x + Math.sin(yaw) * dist, tz = p.z + Math.cos(yaw) * dist;
    const ty = p.y + 1.6 + Math.sin(pitch) * dist * .55;
    camera.position.lerp(new THREE.Vector3(tx, Math.max(ty, p.y + .8), tz), 1 - Math.exp(-8 * dt));
    camera.lookAt(p.x, p.y + 1.5, p.z);
    sun.position.set(p.x + 14, 26, 12); sun.target.position.set(p.x, 0, 0); sun.target.updateMatrixWorld();
    scene.add(sun.target);

    // Sync Mario.
    mario.position.set(p.x, p.y, p.z);
    mario.scale.setScalar(p.big ? 1.5 : 1);
    mario.visible = !(p.invuln > 0 && Math.floor(world.elapsed * 14) % 2 === 0);
    mario.rotation.y = p.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    const moving = Math.abs(p.vx) > .5 && p.grounded;
    const bob = moving ? Math.sin(world.elapsed * 16) * .06 : 0;
    legL.position.y = .22 + Math.max(0, bob); legR.position.y = .22 + Math.max(0, -bob);
    legL.rotation.x = bob * 2; legR.rotation.x = -bob * 2;
    armL.rotation.x = -bob * 2; armR.rotation.x = bob * 2;

    // Blocks: bump animation, used/broken state.
    for (const [b, n] of blockNodes) {
      n.g.position.y = n.baseY + (b.bumpT > 0 ? Math.sin(b.bumpT / .18 * Math.PI) * .3 : 0);
      if (b.broken) n.g.visible = false;
      else if (b.used && n.m.material !== usedMat) n.m.material = usedMat;
    }
    // Coins.
    world.coinsLive.forEach((c, i) => {
      const m = coinNodes[i];
      m.visible = c.alive;
      if (c.alive) { m.rotation.y = c.t * 3.2; m.position.y = c.y + Math.sin(c.t * 2.4) * .1; }
    });
    // Enemies.
    for (const e of world.enemies) {
      if (!e.alive) { const n = eNodes.get(e); if (n) { n.visible = false; } continue; }
      let n = eNodes.get(e);
      if (!n) { n = enemyNode(e); eNodes.set(e, n); }
      n.visible = true; n.position.set(e.x, e.y, e.z); n.rotation.y = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (e.squashT > 0) n.scale.set(1.3, .25, 1.3);
      else n.scale.setScalar(1);
    }
    // Items.
    for (const it of world.items) {
      if (!it.alive) { const n = itemNodes.get(it); if (n) n.visible = false; continue; }
      let n = itemNodes.get(it);
      if (!n) { n = itemNode(it); itemNodes.set(it, n); }
      n.visible = true; n.position.set(it.x, it.y, it.z);
    }
    // Flag slides down after grab.
    if (world.flagWalk) flag.position.y = Math.max(1.2, 9.3 - world.flagT * 2.2);
    // Particles.
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.life -= dt;
      if (b.life <= 0) { level.remove(b.m); bursts.splice(i, 1); continue; }
      b.vy -= 14 * dt; b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  return { update, resize, burst, renderer, camera };
}
