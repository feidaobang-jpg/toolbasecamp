// Mario 1-1 in 3D — programmatic rendering on top of the deterministic world.
import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { LEVEL_END, GAPS, FLAG_X, PIPES, STAIRS } from './world.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const edgeGeo = new THREE.EdgesGeometry(boxGeo);
const M = (c, opts) => new THREE.MeshLambertMaterial({ color: c, ...opts });

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
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const level = new THREE.Group(); scene.add(level);

  // --- Ground strips (skip the two pits) with grass tops and dirt bodies.
  for (const [a, b] of [[-8, GAPS[0][0]], [GAPS[0][1], GAPS[1][0]], [GAPS[1][1], LEVEL_END + 6]]) {
    const w = b - a, cx = (a + b) / 2;
    const top = mesh(level, boxGeo, M('#3fae4a'), cx, -.15, 0); top.scale.set(w, .3, 6.4); top.castShadow = false;
    const body = mesh(level, boxGeo, M('#9c5a2c'), cx, -1.9, 0); body.scale.set(w, 3.5, 6.4); body.castShadow = false;
    const face = mesh(level, boxGeo, M('#7a4520'), cx, -.4, 3.21); face.scale.set(w, .5, .06); face.castShadow = false;
  }

  // --- Background dressing: hills, bushes, clouds (outside the play lane).
  const hill = (x, z, r, c) => { const m = mesh(level, new THREE.SphereGeometry(r, 18, 12), M(c), x, -.1, z, false); m.scale.y = .62; };
  const bush = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); level.add(g);
    for (const [dx, r] of [[-.6, .5], [0, .68], [.6, .5]]) mesh(g, new THREE.SphereGeometry(r, 12, 10), M('#2f9e3f'), dx, .3, 0, false);
  };
  const cloud = (x, y, z) => {
    const g = new THREE.Group(); g.position.set(x, y, z); level.add(g);
    for (const [dx, dy, r] of [[-.9, 0, .55], [0, .25, .75], [.95, 0, .55]]) mesh(g, new THREE.SphereGeometry(r, 12, 10), M('#ffffff'), dx, dy, 0, false);
  };
  for (let x = -4; x < LEVEL_END + 10; x += 26) { hill(x + 6, -8.5, 3.2, '#2f9e3f'); hill(x + 17, -7.5, 2.1, '#37a848'); }
  for (let x = 2; x < LEVEL_END + 8; x += 17) bush(x, -4.2 - (x % 3));
  for (let x = 0; x < LEVEL_END + 12; x += 21) { cloud(x, 7.5 + (x % 5) * .6, -10); cloud(x + 9, 9.2, -12); }

  // --- Question / brick blocks.
  const blockNodes = new Map();
  const edgeMat = new THREE.LineBasicMaterial({ color: '#5a2c0c' });
  for (const b of world.blocks) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, 0); level.add(g);
    const m = mesh(g, boxGeo, M(b.kind === 'q' ? '#f8b800' : '#c84c0c'), 0, 0, 0);
    m.scale.setScalar(.98);
    g.add(new THREE.LineSegments(edgeGeo, edgeMat));
    if (b.kind === 'q') for (const [dx, dy] of [[-.3, .3], [.3, .3], [-.3, -.3], [.3, -.3]]) {
      const r = mesh(g, boxGeo, M('#5a2c0c'), dx, dy, .5, false); r.scale.setScalar(.09);
    }
    blockNodes.set(b, { g, m, baseY: b.y });
  }

  // --- Pipes and staircases.
  for (const [x, h] of PIPES) {
    const g = new THREE.Group(); g.position.set(x, 0, 0); level.add(g);
    const body = mesh(g, new THREE.CylinderGeometry(.68, .68, h, 18), M('#2ea44f'), 0, h / 2, 0);
    const rim = mesh(g, new THREE.CylinderGeometry(.82, .82, .55, 18), M('#37b95a'), 0, h - .27, 0);
    const hole = mesh(g, new THREE.CylinderGeometry(.5, .5, .06, 18), M('#134d22'), 0, h + .01, 0, false);
  }
  for (const [x, h] of STAIRS) {
    const s = mesh(level, boxGeo, M('#c9c2b8'), x, h / 2, 0);
    s.scale.set(1, h, 3.2);
    const cap = mesh(level, boxGeo, M('#b5aea2'), x, h - .06, 0, false); cap.scale.set(1.02, .1, 3.24);
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
  let yaw = 0, pitch = .34, dist = 9.5;
  function update(dt, cam = {}) {
    const p = world.player;
    yaw += (cam.yaw || 0) * 2.2 * dt;
    pitch = Math.max(.08, Math.min(1.2, pitch + (cam.pitch || 0) * 1.6 * dt));
    if (cam.reset) { yaw = 0; pitch = .34; }
    const tx = p.x + Math.sin(yaw) * dist, tz = p.z + Math.cos(yaw) * dist;
    const ty = p.y + 1.6 + Math.sin(pitch) * dist * .55;
    camera.position.lerp(new THREE.Vector3(tx, Math.max(ty, p.y + .8), tz), 1 - Math.exp(-8 * dt));
    camera.lookAt(p.x, p.y + 1.3, p.z);
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
      else if (b.used && n.m.material.color.getHex() !== 0x8a5a2b) n.m.material = M('#8a5a2b');
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
