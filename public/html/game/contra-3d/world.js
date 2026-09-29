// Contra-style stage 1 in 3D. Deterministic gameplay, independent of rendering.
// Axes: +x is level progress, z is depth (-2.6..2.6 playable), y is up.
export const LEVEL_END = 196;        // fortress wall
export const WALL_X = 196;
export const SPAWN_X = 2;
// Walkable ground segments: [start, end]. Water segments have a lower floor.
export const LAND = [[-6, 70], [128, 200]];
export const WATER = [[82, 116]];
export const WATER_FLOOR = -0.85;
export const WATER_SURFACE = -0.32;
// Bridge segments (2 units wide) span the water gaps. They chain-explode once stepped on.
export const BRIDGE_1 = [70, 82];
export const BRIDGE_2 = [116, 128];
export const BRIDGE_SEGMENTS = (() => {
  const segs = [];
  for (let x = BRIDGE_1[0]; x < BRIDGE_1[1]; x += 2) segs.push({ x: x + 1, range: [x, x + 2], timer: -1, alive: true, y: 0 });
  for (let x = BRIDGE_2[0]; x < BRIDGE_2[1]; x += 2) segs.push({ x: x + 1, range: [x, x + 2], timer: -1, alive: true, y: 0 });
  return segs;
})();
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const inRange = (segs, x) => segs.some(([a, b]) => x >= a && x < b);

export function createWorld() {
  const w = {
    time: 240, score: 0, lives: 3, status: 'ready', reason: '', elapsed: 0,
    events: [], enemies: [], bullets: [], ebullets: [], pickups: [], capsules: [],
    bridge: BRIDGE_SEGMENTS, checkpoint: SPAWN_X, spawnTimer: 2.4, shake: 0,
    boss: { cannons: [{ y: 1.7, hp: 4, alive: true, cool: 1.2 }, { y: 4.1, hp: 4, alive: true, cool: 2.3 }], opened: false },
    player: {
      x: SPAWN_X, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, facing: Math.PI / 2,
      spread: false, dive: false, invincible: 0, fireCool: 0, coyote: 0, jumpBuffer: 0, inWater: false
    }
  };
  // Standing snipers: [x, z] — they aim and fire at the player.
  for (const [x, z] of [[18, -1.6], [33, 1.4], [48, -1.2], [61, 1.8], [139, -1.5], [152, 1.6], [167, -1.8], [183, 1.3]]) {
    w.enemies.push({ kind: 'sniper', x, y: 0, z, alive: true, cool: 1 + Math.abs(x) % 2, flash: 0 });
  }
  // Ground turrets: [x, z, hp] — rotating cannon, tougher.
  for (const [x, z] of [[44, 0], [99, 2.15], [106, -2.15], [150, 0], [176, 0.8]]) {
    const onWater = inRange(WATER, x);
    w.enemies.push({ kind: 'turret', x, y: onWater ? WATER_FLOOR : 0, z, hp: 4, alive: true, cool: 1.6, angle: Math.PI, flash: 0, rock: onWater });
  }
  // Capsule triggers: flying pods that drop the S (spread) pickup when shot.
  w.capsuleTriggers = [{ x: 30, done: false }, { x: 121, done: false }, { x: 162, done: false }];
  return w;
}
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

export function floorAt(w, x) {
  if (inRange(WATER, x)) return WATER_FLOOR;
  const bridged = (x >= BRIDGE_1[0] && x < BRIDGE_1[1]) || (x >= BRIDGE_2[0] && x < BRIDGE_2[1]);
  if (bridged) {
    const seg = w.bridge.find(s => x >= s.range[0] && x < s.range[1] && s.alive);
    if (seg) return 0;
    return WATER_FLOOR; // bridge gone -> water below
  }
  return 0;
}
const waterAt = (w, x) => inRange(WATER, x) || ((x >= BRIDGE_1[0] && x < BRIDGE_1[1]) || (x >= BRIDGE_2[0] && x < BRIDGE_2[1]) ? !w.bridge.some(s => x >= s.range[0] && x < s.range[1] && s.alive) : false);

export function die(w, reason) {
  if (w.status !== 'playing') return;
  w.lives--; emit(w, 'die', { reason });
  if (w.lives <= 0) { w.status = 'dead'; w.reason = reason; emit(w, 'gameover'); }
  else respawn(w);
}
export function respawn(w) {
  const p = w.player;
  Object.assign(p, { x: w.checkpoint, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, dive: false, invincible: 2.4, fireCool: 0, coyote: 0, jumpBuffer: 0 });
  w.bullets.length = 0; w.ebullets.length = 0; w.spawnTimer = 1.8;
  if (inRange(WATER, w.checkpoint) || (w.checkpoint >= BRIDGE_1[0] && w.checkpoint < BRIDGE_2[1])) p.x = Math.max(p.x, 128); // never respawn mid-water
  w.status = 'playing';
}
export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  const p = w.player; w.time -= dt; w.elapsed += dt; w.shake = Math.max(0, w.shake - dt * 2.5);
  p.invincible = Math.max(0, p.invincible - dt); p.fireCool = Math.max(0, p.fireCool - dt);
  if (w.time <= 0) { die(w, 'timeout'); return; }
  const water = waterAt(w, p.x); p.inWater = water;
  // Bridges chain-explode once stepped on.
  for (let i = 0; i < w.bridge.length; i++) {
    const s = w.bridge[i];
    if (s.alive && s.timer < 0 && p.grounded && Math.abs(p.x - s.x) < 1.15 && Math.abs(p.y) < .3) { s.timer = .55; emit(w, 'bridgearm', { x: s.x }); }
    if (s.timer >= 0) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.alive = false; s.timer = -1; w.shake = .5; emit(w, 'bridgeboom', { x: s.x });
        const next = w.bridge[i + 1];
        if (next && next.alive && Math.abs(next.x - s.x) < 2.5) next.timer = Math.max(next.timer < 0 ? .38 : next.timer, .38);
      }
    }
  }
  // Movement: slower in water, dive toggles with L.
  if (input.divePressed && water) { p.dive = !p.dive; emit(w, p.dive ? 'dive' : 'surface'); }
  if (p.dive && !water) p.dive = false;
  const speed = water ? (p.dive ? 3.2 : 4.4) : 5.8;
  const blend = 1 - Math.exp(-15 * dt);
  p.vx += (input.x * speed - p.vx) * blend; p.vz += (input.z * speed - p.vz) * blend;
  if (Math.hypot(input.x, input.z) > .15) p.facing = Math.atan2(input.x, input.z);
  p.coyote = p.grounded ? .1 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.jumpPressed ? .13 : Math.max(0, p.jumpBuffer - dt);
  const canJump = water ? !p.dive : p.grounded;
  if (p.jumpBuffer > 0 && (p.coyote > 0 || (water && !p.dive))) {
    p.vy = water ? 8.4 : 11.2; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; if (water) p.dive = false; emit(w, 'jump');
  }
  // Shooting: forward along facing; spread gives a 5-way fan.
  if (input.shoot && p.fireCool <= 0 && !p.dive) {
    p.fireCool = p.spread ? .17 : .21;
    const dir = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    const bx = p.x + dir.x * .55, by = p.y + .75, bz = p.z + dir.z * .55;
    if (p.spread) {
      for (const a of [-.42, -.21, 0, .21, .42]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        w.bullets.push({ x: bx, y: by, z: bz, vx: (dir.x * ca - dir.z * sa) * 15, vz: (dir.x * sa + dir.z * ca) * 15, life: 1.4 });
      }
    } else w.bullets.push({ x: bx, y: by, z: bz, vx: dir.x * 15, vz: dir.z * 15, life: 1.3 });
    emit(w, 'shoot');
  }
  // Horizontal move with soft walls at the level edges.
  p.x = clamp(p.x + p.vx * dt, -2, WALL_X - 1.4);
  p.z = clamp(p.z + p.vz * dt, -2.55, 2.55);
  // Vertical: gravity, land on floor (bridge/water floor/land).
  const floor = floorAt(w, p.x);
  const oldY = p.y; p.vy -= 26 * dt; p.y += p.vy * dt;
  if (p.vy <= 0 && p.y <= floor) {
    p.y = floor; p.vy = 0;
    if (!p.grounded && water) { emit(w, 'splash', { x: p.x, z: p.z }); }
    p.grounded = true;
  } else if (p.y > floor + .02) p.grounded = false;
  if (oldY >= floor - .01 && p.grounded) p.y = floor;
  // Checkpoints on solid land.
  if (p.x >= 130 && w.checkpoint < 130) { w.checkpoint = 132; emit(w, 'checkpoint'); }
  // Falling far below (shouldn't happen: water catches), timeout handled above.
  if (p.y < -8) { die(w, 'pit'); return; }
  // Player bullets.
  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i]; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.life <= 0 || Math.abs(b.z) > 3.4) { w.bullets.splice(i, 1); continue; }
    if (b.x > WALL_X - .6) { w.bullets.splice(i, 1); emit(w, 'clank'); continue; }
    let hit = false;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const r = e.kind === 'turret' ? .95 : .68;
      if (Math.abs(b.x - e.x) < r && Math.abs(b.z - e.z) < r && b.y < (e.kind === 'turret' ? 1.9 : 2)) {
        hit = true;
        if (e.kind === 'turret') { e.hp--; e.flash = .12; if (e.hp <= 0) { e.alive = false; w.score += 500; w.shake = .3; emit(w, 'boom', { x: e.x, y: 1, z: e.z }); } else emit(w, 'clank'); }
        else { e.alive = false; w.score += e.kind === 'sniper' ? 200 : 100; emit(w, 'boom', { x: e.x, y: .8, z: e.z }); }
        break;
      }
    }
    if (!hit) for (const c of w.capsules) {
      if (c.alive && Math.abs(b.x - c.x) < 1 && Math.abs(b.y - c.y) < 1) {
        hit = true; c.alive = false; w.score += 500;
        w.pickups.push({ type: 'S', x: c.x, y: c.y, z: clamp(c.z, -1.8, 1.8), vy: 0, alive: true });
        emit(w, 'boom', { x: c.x, y: c.y, z: c.z }); break;
      }
    }
    if (!hit) for (const bc of w.boss.cannons) {
      if (bc.alive && Math.abs(b.x - (WALL_X - .5)) < .9 && Math.abs(b.y - bc.y) < .8) {
        hit = true; bc.hp--; w.shake = .25; emit(w, 'clank');
        if (bc.hp <= 0) { bc.alive = false; w.score += 1000; w.shake = .6; emit(w, 'boom', { x: WALL_X - .6, y: bc.y, z: 0 }); }
        break;
      }
    }
    if (hit) w.bullets.splice(i, 1);
  }
  // Enemy bullets: aimed shots, pass over a diving player.
  for (let i = w.ebullets.length - 1; i >= 0; i--) {
    const b = w.ebullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.life <= 0 || b.y < -.9) { w.ebullets.splice(i, 1); continue; }
    const head = p.dive ? -1 : p.y + 1.15, foot = p.dive ? -1 : p.y + .1;
    if (!(b.y > foot && b.y < head) || p.invincible > 0) continue;
    if (Math.abs(b.x - p.x) < .55 && Math.abs(b.z - p.z) < .55) { w.ebullets.splice(i, 1); die(w, 'shot'); return; }
  }
  // Contact death (Contra rule: touch = death), unless diving or invincible.
  if (p.invincible <= 0 && !p.dive) {
    for (const e of w.enemies) {
      if (e.alive && Math.abs(p.x - e.x) < .78 && Math.abs(p.z - e.z) < .78 && p.y < 1.2) { die(w, 'enemy'); return; }
    }
  }
  // Sniper / turret firing.
  for (const e of w.enemies) {
    if (!e.alive) continue; e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
    if (e.kind === 'turret') {
      e.angle = Math.atan2(dx, dz);
      e.cool -= dt;
      if (e.cool <= 0 && dist < 24 && Math.abs(dx) < 24) {
        e.cool = 2.1 + Math.random() * .9;
        const sy = e.y + .8, ty = p.dive ? .2 : p.y + .7;
        const len = Math.hypot(dx, ty - sy, dz) || 1, sp = 8.5;
        w.ebullets.push({ x: e.x + dx / len, y: sy, z: e.z + dz / len, vx: dx / len * sp, vy: (ty - sy) / len * sp, vz: dz / len * sp, life: 3.2 });
        emit(w, 'eshoot');
      }
    } else {
      e.cool -= dt;
      if (e.cool <= 0 && dist < 17 && Math.abs(dx) < 17 && !p.dive) {
        e.cool = 2.4 + Math.random() * 1.4; e.flash = .15;
        const sy = 1.1, ty = p.y + .7;
        const len = Math.hypot(dx, ty - sy, dz) || 1, sp = 8;
        w.ebullets.push({ x: e.x, y: sy, z: e.z, vx: dx / len * sp, vy: (ty - sy) / len * sp, vz: dz / len * sp, life: 3 });
        emit(w, 'eshoot');
      }
    }
  }
  // Runner spawns just ahead while on land — the classic pressure.
  if (!water) {
    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      w.spawnTimer = 2 + Math.random() * 1.6;
      const runners = w.enemies.filter(e => e.alive && e.kind === 'runner').length;
      if (runners < 5 && p.x < WALL_X - 24) {
        const sx = Math.min(WALL_X - 12, p.x + 17 + Math.random() * 5);
        w.enemies.push({ kind: 'runner', x: sx, y: floorAt(w, sx), z: (Math.random() * 2 - 1) * 1.9, alive: true, dir: -1, speed: 3.6 + Math.random() * 1.2, flash: 0, cool: 0 });
      }
    }
  }
  // Runners charge the player; they die to bullets and can't cross the wall.
  for (const e of w.enemies) {
    if (!e.alive || e.kind !== 'runner') continue;
    const dx = p.x - e.x;
    e.dir = Math.sign(dx) || -1;
    const nx = e.x + e.dir * e.speed * dt;
    const nf = floorAt(w, nx);
    e.y = nf; e.x = clamp(nx, -2, WALL_X - 1.2);
    e.z += clamp(p.z - e.z, -1, 1) * .45 * dt;
    e.flash = Math.max(0, e.flash - dt);
  }
  // Capsules fly overhead when triggered.
  for (const t of w.capsuleTriggers) {
    if (!t.done && p.x > t.x) { t.done = true; w.capsules.push({ x: p.x + 17, y: 3.4, z: 0, alive: true, t: 0 }); emit(w, 'capsule'); }
  }
  for (const c of w.capsules) { if (!c.alive) continue; c.t += dt; c.x -= 4.6 * dt; c.y = 3.4 + Math.sin(c.t * 2.4) * .5; c.z = Math.sin(c.t * 1.3) * 1.4; if (c.x < p.x - 24) c.alive = false; }
  // Pickups fall and float; collect for the spread gun.
  for (const pk of w.pickups) {
    if (!pk.alive) continue;
    pk.vy -= 14 * dt; pk.y += pk.vy * dt;
    const fl = floorAt(w, pk.x); const rest = waterAt(w, pk.x) ? WATER_SURFACE : fl + .5;
    if (pk.y <= rest) { pk.y = rest; pk.vy = 0; }
    if (Math.abs(p.x - pk.x) < .8 && Math.abs(p.z - pk.z) < .8 && p.y + 1.2 > pk.y - .4) {
      pk.alive = false; p.spread = true; w.score += 300; emit(w, 'pickup');
    }
  }
  // Boss cannons fire from the wall; destroying both wins the stage.
  for (const bc of w.boss.cannons) {
    if (!bc.alive) continue;
    bc.cool -= dt;
    if (bc.cool <= 0 && p.x > WALL_X - 26) {
      bc.cool = 1.7 + Math.random() * .8;
      const dx = p.x - (WALL_X - .5), dz = p.z, sy = bc.y, ty = p.dive ? .2 : p.y + .7;
      const len = Math.hypot(dx, ty - sy, dz) || 1, sp = 9;
      w.ebullets.push({ x: WALL_X - .8, y: sy, z: 0, vx: dx / len * sp, vy: (ty - sy) / len * sp, vz: dz / len * sp, life: 3 });
      emit(w, 'eshoot');
    }
  }
  if (!w.boss.cannons.some(c => c.alive) && !w.boss.opened) {
    w.boss.opened = true; w.score += Math.ceil(w.time) * 10 + 5000; w.status = 'won'; emit(w, 'win');
  }
}
