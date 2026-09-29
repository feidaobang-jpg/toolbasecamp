import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { LAND, WATER, WATER_FLOOR, WATER_SURFACE, LEVEL_END } from './world.js';

const materials = new Map();
function mat(color, roughness = .7, extra = {}) { const k = color + ':' + roughness + ':' + JSON.stringify(extra); if (!materials.has(k)) materials.set(k, new THREE.MeshStandardMaterial({ color, roughness, ...extra })); return materials.get(k); }
const boxGeo = new THREE.BoxGeometry(1, 1, 1), ballGeo = new THREE.SphereGeometry(1, 14, 9);
function box(parent, x, y, z, sx, sy, sz, color, rough) { const m = new THREE.Mesh(boxGeo, mat(color, rough)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
function ball(parent, x, y, z, sx, sy, sz, color) { const m = new THREE.Mesh(ballGeo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
function cylinder(parent, x, y, z, r, h, color) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), mat(color, .5)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }

// Player commando: bare chest, blue pants, red headband — original procedural build.
export function commando() {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  box(body, 0, .95, 0, .42, .42, .26, '#e8b48c');                       // torso
  box(body, 0, .72, 0, .44, .16, .28, '#2a5fb8');                       // belt/pants top
  box(body, 0, .5, 0, .42, .3, .27, '#2a5fb8');                         // pants
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(s * .13, .42, 0); body.add(l);
    box(l, 0, -.16, 0, .17, .3, .19, '#2a5fb8'); box(l, 0, -.34, .03, .16, .1, .24, '#3a3a3a'); legs.push(l);
    const a = new THREE.Group(); a.position.set(s * .27, 1.1, 0); body.add(a);
    box(a, 0, -.14, 0, .13, .3, .14, '#e8b48c'); arms.push(a);
  }
  // Gun held forward in the right hand.
  const gun = new THREE.Group(); gun.position.set(.3, .96, .16); body.add(gun);
  box(gun, 0, 0, .3, .09, .12, .62, '#33383d'); box(gun, 0, -.08, .02, .08, .14, .14, '#2a2e33');
  ball(body, 0, 1.32, 0, .17, .19, .17, '#e8b48c');                     // head
  box(body, 0, 1.4, .02, .38, .08, .38, '#c8332b');                     // headband
  box(body, 0, 1.42, -.14, .38, .08, .12, '#c8332b');                   // band tail
  return { group: g, body, legs, arms, gun };
}
function soldier() {
  const g = new THREE.Group();
  box(g, 0, .92, 0, .4, .42, .25, '#4a6b3a');
  box(g, 0, .52, 0, .4, .3, .26, '#3c5a30');
  for (const s of [-1, 1]) { box(g, s * .12, .2, 0, .16, .26, .18, '#3c5a30'); box(g, s * .12, .04, .04, .15, .1, .22, '#2c2c2c'); }
  box(g, 0, 1.26, 0, .34, .2, .3, '#54724a');                           // helmet
  ball(g, 0, 1.14, .12, .1, .1, .08, '#d8a87a');
  return g;
}
function turretModel() {
  const g = new THREE.Group();
  cylinder(g, 0, .25, 0, .62, .5, '#5d6570');
  const dome = ball(g, 0, .55, 0, .5, .42, .5, '#79828e');
  const barrel = new THREE.Group(); barrel.position.set(0, .62, 0); g.add(barrel);
  cylinder(barrel, 0, 0, .45, .12, .8, '#3a3f46').rotation.x = Math.PI / 2;
  box(g, 0, .04, 0, 1.3, .1, 1.3, '#4d5560');
  return { group: g, dome, barrel };
}
function capsuleModel() {
  const g = new THREE.Group();
  ball(g, 0, 0, 0, .5, .34, .34, '#d8dde4');
  const wing = box(g, 0, .08, 0, .34, .12, 1.05, '#c8332b'); wing.castShadow = true;
  box(g, -.42, 0, 0, .22, .18, .3, '#8b939c');
  return g;
}
function pickupModel() {
  const g = new THREE.Group();
  box(g, 0, 0, 0, .55, .55, .22, '#e84432');
  const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff3df'; ctx.font = 'bold 46px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', 32, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  m.position.z = .13; g.add(m); return { group: g, face: m };
}
function palm(level, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); level.add(g);
  const trunk = cylinder(g, 0, 1.6 * s, 0, .14 * s, 3.2 * s, '#8a6a48'); trunk.rotation.z = (Math.random() - .5) * .16;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const frond = box(g, Math.cos(a) * .9 * s, 3.3 * s, Math.sin(a) * .9 * s, 1.7 * s, .07, .42 * s, '#3f8f4a');
    frond.rotation.y = -a; frond.rotation.z = .45; frond.castShadow = false;
  }
  ball(g, 0, 3.15 * s, 0, .3 * s, .24 * s, .3 * s, '#6da85e').castShadow = false;
}
function rock(level, x, y, z, s) { ball(level, x, y, z, s, s * .7, s, '#8d8f93').castShadow = false; }

// Keep spatial batches small for frustum culling (same strategy as mario-3d).
function batchStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), position = new THREE.Vector3();
  root.traverse(m => { if (!m.isMesh) return; position.setFromMatrixPosition(m.matrixWorld);
    const key = [m.geometry.uuid, m.material.uuid, m.castShadow, m.receiveShadow, Math.floor(position.x / 24)].join(':');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0], batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    meshes.forEach((m, i) => { batch.setMatrixAt(i, m.matrixWorld); m.removeFromParent(); });
    batch.computeBoundingSphere(); root.add(batch);
  }
}

export function createScene(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9ed2e8'); scene.fog = new THREE.Fog('#9ed2e8', 40, 115);
  const camera = new THREE.PerspectiveCamera(44, 1, .1, 180);
  scene.add(new THREE.HemisphereLight('#e8f6ff', '#5a7a42', 2.5));
  const sun = new THREE.DirectionalLight('#fff0d0', 3.1); sun.position.set(-12, 24, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: .1, far: 85 }); sun.shadow.bias = -.001;
  scene.add(sun); scene.add(sun.target);

  const level = new THREE.Group(); scene.add(level);
  // Land strips: soil body + grass cap offset below collision plane (no coplanar z-fighting).
  for (const [a, b] of LAND) {
    box(level, (a + b) / 2, -.32, 0, b - a, .36, 6, '#6f9c46').castShadow = false;
    box(level, (a + b) / 2, -1.15, 0, b - a, 1.4, 6, '#7c5f3e').castShadow = false;
    for (let x = Math.ceil(a); x < b; x += 2) { box(level, x, -.52, 3.02, 1.8, .3, .07, '#5f8a3c').castShadow = false; box(level, x, -1.05, 3.03, 1.8, .7, .07, '#836544').castShadow = false; }
  }
  // Water floor under water zones + translucent animated surface.
  for (const [a, b] of WATER) {
    box(level, (a + b) / 2, WATER_FLOOR - .35, 0, b - a, .5, 6, '#b09a68').castShadow = false;
  }
  const waterMat = new THREE.MeshStandardMaterial({ color: '#3f9bc9', transparent: true, opacity: .68, roughness: .15 });
  const waterMeshes = [];
  for (const [a, b] of WATER) { const m = new THREE.Mesh(boxGeo, waterMat); m.position.set((a + b) / 2, WATER_SURFACE, 0); m.scale.set(b - a, .1, 6); m.receiveShadow = false; level.add(m); waterMeshes.push(m); }
  // Under-bridge water strips so gaps read as water, not void.
  // Under-bridge water strips so gaps read as water, not void.
  for (const [a, b] of [[68, 84], [114, 130]]) {
    const m = new THREE.Mesh(boxGeo, waterMat); m.position.set((a + b) / 2, WATER_SURFACE, 0); m.scale.set(b - a, .1, 6); level.add(m); waterMeshes.push(m);
    box(level, (a + b) / 2, WATER_FLOOR - .35, 0, b - a, .5, 6, '#b09a68').castShadow = false;
  }
  // Jungle props (kept outside the playable strip |z| <= 2.55 so the player never clips trunks).
  for (let x = 0; x < 205; x += 7) {
    if (x < 68 || (x > 84 && x < 114) || x > 130) {
      if (!LAND.some(([a, b]) => x > a && x < b - 2)) continue;
      palm(level, x + Math.random(), 3.05 + Math.random() * .45, .8 + Math.random() * .5);
      if (Math.random() < .7) palm(level, x + 3, -3.05 - Math.random() * .4, .7 + Math.random() * .5);
    }
    if (Math.random() < .8) rock(level, x + 1.5, -.05, (Math.random() - .5) * 4.6, .25 + Math.random() * .3);
  }
  // Distant ridge + clouds (no extracted artwork).
  for (let x = -14; x < 230; x += 16) {
    ball(level, x, -1, -14, 7 + (x % 3), 4.5 + (Math.abs(x) % 4), 4, '#5f8a55').castShadow = false;
    ball(level, x + 8, -1.6, -20, 9, 6.5, 5, '#6f9a62').castShadow = false;
    const cloud = new THREE.Group(); cloud.position.set(x + 4, 9 + (Math.abs(x) % 3), -16); level.add(cloud);
    for (let i = 0; i < 3; i++) ball(cloud, (i - 1) * 1.3, i === 1 ? .4 : 0, 0, 1.35, 1, 1, '#fdfbef').castShadow = false;
  }
  batchStatic(level);
  // Bridge segments (dynamic).
  const bridgeMat = mat('#9a6a3c', .8), railMat = mat('#7a5230', .8);
  const bridgeMeshes = new Map();
  for (const s of world.bridge) {
    const g = new THREE.Group(); g.position.set(s.x, 0, 0); scene.add(g);
    const deck = box(g, 0, -.09, 0, 2, .18, 3.4, '#9a6a3c');
    for (const zz of [-1.62, 1.62]) { box(g, 0, .32, zz, 1.95, .07, .12, '#7a5230'); for (const xx of [-.8, 0, .8]) box(g, xx, .12, zz, .1, .5, .1, '#7a5230'); }
    bridgeMeshes.set(s, g);
  }
  // Fortress wall + gate (the stage destination).
  const wall = new THREE.Group(); scene.add(wall);
  box(wall, LEVEL_END + 1, 3, 0, 2.4, 9, 7, '#8e8f96');
  for (let zz = -3; zz <= 3; zz += 1.5) box(wall, LEVEL_END + .2, 7.7, zz, 3, .8, 1.1, '#7e7f86');
  box(wall, LEVEL_END - .1, 1.6, 0, .5, 3.2, 2.2, '#565a63');           // gate recess
  for (const y of [.9, 1.7, 2.4]) box(wall, LEVEL_END - .12, y, 0, .42, .14, 2.24, '#6a6e77');
  // Soldier statue by the gate, purely decorative.
  batchStatic(wall);
  const player = commando(); scene.add(player.group);
  const enemyMeshes = new Map();
  const turretRig = new Map();
  const ensureEnemy = e => {
    let g;
    if (e.kind === 'turret') { const t = turretModel(); g = t.group; turretRig.set(e, t); scene.add(g); }
    else { g = soldier(); if (e.kind === 'runner') g.rotation.y = -Math.PI / 2; scene.add(g); }
    enemyMeshes.set(e, g); return g;
  };
  for (const e of world.enemies) ensureEnemy(e);
  const capsuleVisuals = new Map(), pickupVisuals = new Map();
  const capsuleProto = capsuleModel(), pickupProto = pickupModel();
  const bullets = new THREE.Group(), ebullets = new THREE.Group(); scene.add(bullets); scene.add(ebullets);
  const bulletProto = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe27a' }));
  const ebulletProto = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff5f4a' }));
  const sparks = [];
  // Boss cannons on the wall.
  const cannonVisuals = new Map();
  for (const bc of world.boss.cannons) {
    const g = new THREE.Group(); g.position.set(LEVEL_END - .5, bc.y, 0); scene.add(g);
    box(g, .25, 0, 0, .5, 1.1, 1.1, '#565a63');
    const dome = ball(g, -.15, .1, 0, .45, .45, .45, '#79828e');
    const br = cylinder(g, -.55, .1, 0, .13, .9, '#3a3f46'); br.rotation.z = Math.PI / 2;
    cannonVisuals.set(bc, g);
  }
  function burst(x, y, z, color, count = 10) {
    for (let i = 0; i < count; i++) { const m = new THREE.Mesh(boxGeo, mat(color)); m.scale.setScalar(.12 + Math.random() * .1); m.position.set(x, y, z); sparks.push({ mesh: m, v: new THREE.Vector3((Math.random() - .5) * 5, 2 + Math.random() * 4, (Math.random() - .5) * 5), life: .6 + Math.random() * .3 }); scene.add(m); }
  }
  let elapsed = 0, yaw = 0, pitch = .5, followX = 2, camY = 1.6;
  function update(dt, camInput = {}, snap = false) {
    elapsed += dt; const p = world.player;
    yaw += (camInput.yaw || 0) * dt * 1.8; pitch = THREE.MathUtils.clamp(pitch + (camInput.pitch || 0) * dt * .8, .12, .95);
    if (camInput.reset) { yaw = 0; pitch = .5; }
    followX = snap ? p.x : THREE.MathUtils.lerp(followX, p.x, 1 - Math.exp(-5 * dt));
    camY = THREE.MathUtils.lerp(camY, 1.6 + Math.max(0, p.y - 1.6) * .45, 1 - Math.exp(-3 * dt));
    const distance = canvas.clientWidth / canvas.clientHeight < 1.6 ? 18.5 : 16.5;
    const tx = followX + 2.6, ty = camY, tz = 0;
    camera.position.set(tx + Math.sin(yaw) * distance, ty + Math.sin(pitch) * distance, Math.cos(yaw) * distance * Math.cos(pitch));
    camera.lookAt(tx, ty, tz);
    if (world.shake > 0) { const s = world.shake * .18; camera.position.x += (Math.random() - .5) * s; camera.position.y += (Math.random() - .5) * s; }
    sun.position.set(followX - 12, 24, 12); sun.target.position.set(followX, 0, 0);
    // Player.
    const swim = p.inWater;
    player.group.position.set(p.x, p.dive ? p.y - .55 : p.y, p.z);
    player.group.visible = p.invincible <= 0 || Math.floor(elapsed * 14) % 2 === 0;
    player.group.rotation.y = p.facing;
    const moving = Math.hypot(p.vx, p.vz) > .3;
    const swing = moving ? Math.sin(elapsed * Math.min(14, Math.hypot(p.vx, p.vz) * 2.2)) * .7 : 0;
    player.legs.forEach((l, i) => l.rotation.x = p.grounded && !p.dive ? swing * (i ? 1 : -1) : -.5);
    player.arms.forEach((a, i) => a.rotation.x = p.grounded && !p.dive ? -swing * (i ? 1 : -1) : -1.4);
    player.group.scale.y = swim && !p.dive ? .8 : 1;
    // Enemies.
    for (const e of world.enemies) {
      if (!enemyMeshes.has(e)) ensureEnemy(e);
      const g = enemyMeshes.get(e); g.visible = e.alive;
      if (!e.alive) continue;
      if (e.kind === 'turret') {
        const rig = turretRig.get(e); g.position.set(e.x, e.y, e.z);
        rig.barrel.rotation.y = e.angle - Math.PI / 2; rig.dome.position.y = .55;
        g.scale.setScalar(e.flash > 0 ? 1.06 : 1);
        if (e.rock) rock(g, 0, e.y + .05, 0, .1);
      } else {
        g.position.set(e.x, e.y, e.z);
        if (e.kind === 'runner') { g.rotation.y = e.dir > 0 ? Math.PI / 2 : -Math.PI / 2; g.position.y = e.y + Math.abs(Math.sin(elapsed * 10 + e.x)) * .06; }
        else g.rotation.y = Math.atan2(p.x - e.x, p.z - e.z || .01) * 0 + -Math.atan2(p.x - e.x, p.z - e.z);
        g.scale.setScalar(1);
      }
    }
    // Capsules & pickups.
    for (const c of world.capsules) {
      if (!capsuleVisuals.has(c)) { const g = capsuleProto.clone(); scene.add(g); capsuleVisuals.set(c, g); }
      const g = capsuleVisuals.get(c); g.visible = c.alive;
      if (c.alive) { g.position.set(c.x, c.y, c.z); g.rotation.z = Math.sin(elapsed * 4) * .15; g.rotation.y = Math.PI; }
    }
    for (const pk of world.pickups) {
      if (!pickupVisuals.has(pk)) { const g = pickupProto.group.clone(); scene.add(g); pickupVisuals.set(pk, { g, face: g.children.find(ch => ch.material && ch.material.map) }); }
      const v = pickupVisuals.get(pk); v.g.visible = pk.alive;
      if (pk.alive) { v.g.position.set(pk.x, pk.y + .35, pk.z); v.g.rotation.y = elapsed * 2.2; if (v.face) v.face.rotation.y = -elapsed * 2.2; }
    }
    // Bullets pooled by visibility.
    const sync = (group, list, proto) => {
      while (group.children.length < list.length) group.add(proto.clone());
      while (group.children.length > list.length) group.remove(group.children[group.children.length - 1]);
      list.forEach((b, i) => group.children[i].position.set(b.x, b.y, b.z));
    };
    sync(bullets, world.bullets, bulletProto); sync(ebullets, world.ebullets, ebulletProto);
    // Bridge visuals.
    for (const [s, g] of bridgeMeshes) {
      g.visible = s.alive;
      if (s.alive && s.timer >= 0) g.position.y = Math.sin(elapsed * 40) * .05;
      if (!s.alive && g.visible) { g.visible = false; }
    }
    // Water shimmer.
    for (const m of waterMeshes) m.material.opacity = .62 + Math.sin(elapsed * 1.6) * .06;
    // Boss cannons.
    for (const [bc, g] of cannonVisuals) {
      g.visible = bc.alive; if (!bc.alive) continue;
      g.rotation.z = Math.sin(elapsed * 2 + bc.y) * .04;
    }
    // Sparks.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; s.v.y -= 11 * dt; s.mesh.position.addScaledVector(s.v, dt); s.mesh.rotation.x += dt * 5;
      if (s.life <= 0) { scene.remove(s.mesh); sparks.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize();
  return { renderer, scene, camera, update, resize, burst, get yaw() { return yaw; }, dispose() { renderer.dispose(); } };
}
