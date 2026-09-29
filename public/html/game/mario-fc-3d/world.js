// FC Super Mario World 1-1, rebuilt as a 3D side-scrolling platformer.
// Pure simulation module: no DOM, no THREE. main.js feeds input, scene.js reads state.

export const LEVEL_END = 198;        // flagpole x
export const TIME_LIMIT = 300;       // classic countdown units

// Ground strips [xStart, xEnd]; gaps between strips are deadly pits.
const GROUND = [[-8, 69], [71, 86], [89, 154], [156, 214]];
// Decorative/solid pipes [x, height]
const PIPES = [[28, 2], [38, 3], [46, 4], [57, 4]];

// Interactive blocks: integer cell coords, y = cell bottom sits at y.
// coin: pops a coin. mushroom: spawns a mushroom. brick: breaks when big,
// bumps when small. stair: solid decoration steps.
const BLOCKS = [
    [16, 3, 'coin'],
    [20, 3, 'brick'], [21, 3, 'mushroom'], [22, 3, 'brick'], [23, 3, 'coin'], [24, 3, 'brick'],
    [22, 7, 'coin'],
    [77, 3, 'brick'], [78, 3, 'coin'], [79, 3, 'brick'],
    [80, 7, 'brick'], [81, 7, 'coin'], [82, 7, 'brick'], [83, 7, 'brick'],
    [94, 3, 'coin'], [95, 7, 'brick'], [96, 7, 'brick'], [97, 7, 'coin'], [98, 7, 'brick'],
    [105, 3, 'coin'], [107, 3, 'mushroom'], [109, 3, 'coin'],
    [118, 3, 'brick'], [119, 3, 'coin'], [120, 3, 'brick'],
    [129, 3, 'coin'], [130, 3, 'coin'], [131, 3, 'coin'],
];

// Final staircase before the flagpole (classic 8-step pyramid).
const STAIRS = [];
for (let i = 0; i < 8; i++) for (let j = 0; j <= i; j++) STAIRS.push([178 + i, j]);

// Goomba patrol spawn points.
const ENEMY_SPAWNS = [22.5, 40.5, 51, 53, 80.5, 97, 99, 107.5, 114, 116, 125, 171, 173];

// Floating coins reachable with a short hop [x, y].
const COIN_SPOTS = [[74, 1.5], [75.5, 2.2], [77, 1.5], [90.5, 1.6], [92, 2.3], [93.5, 1.6],
    [101, 1.5], [102.5, 2.2], [104, 1.5], [146, 1.5], [147.5, 2.2], [149, 1.5], [161, 1.5], [162.5, 2.2], [164, 1.5]];

const GRAV = 30, JUMP_V = 16.5, JUMP_CUT = 5;
const WALK = 4.6, RUN = 7.6, ACCEL = 30, FRICTION = 26;
const DEPTH_MAX = 2.3, DEPTH_SCALE = .78;
const CHECKPOINT_X = 100;

function overlaps(ax, ax2, bx, bx2) { return ax < bx2 && ax2 > bx; }

export function createWorld() {
    const world = {
        status: 'ready',            // ready | playing | dying | dead | winning | won
        demoMode: false,
        player: { x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, big: false, grounded: true, invincible: 0, slide: 0 },
        blocks: BLOCKS.map(([x, y, type]) => ({ x, y, z: 0, type, alive: true, used: false, bump: 0 })),
        enemies: ENEMY_SPAWNS.map((x, i) => ({ id: i, x0: x, x, y: 0, z: (i % 2) * .04, vx: -1.6, vy: 0, dir: -1, alive: true, squash: 0 })),
        items: COIN_SPOTS.map(([x, y]) => ({ kind: 'coin', x, y, z: 0, alive: true })), // floating + spawned
        coins: 0, score: 0, time: TIME_LIMIT, timeAcc: 0,
        checkpoint: 0,              // 0 = start, CHECKPOINT_X = midway
        events: [],
        ground: GROUND, pipes: PIPES, stairs: STAIRS, coinSpots: COIN_SPOTS,
    };
    return world;
}

export function respawn(world) {
    const p = world.player;
    p.x = world.checkpoint >= CHECKPOINT_X ? CHECKPOINT_X : 3;
    p.y = 0; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.facing = 1;
    p.big = false; p.grounded = true; p.invincible = 2.5; p.slide = 0;
    world.time = TIME_LIMIT; world.timeAcc = 0;
    for (const e of world.enemies) { e.x = e.x0; e.y = 0; e.vx = -1.6; e.vy = 0; e.dir = -1; e.alive = true; e.squash = 0; }
    // Floating coins stay collected; transient items are cleared.
    for (let i = world.items.length - 1; i >= 0; i--) if (world.items[i].kind !== 'coin') world.items.splice(i, 1);
    world.status = 'playing';
    world.events.push({ type: 'respawn' });
}

function solidBoxes(world) {
    // Rebuilt on demand; level is small so this stays cheap (~90 boxes).
    const boxes = [];
    for (const [x, h] of world.pipes) boxes.push({ x0: x - .95, x1: x + .95, y0: 0, y1: h, z0: -.95, z1: .95 });
    for (const [x, y] of world.stairs) boxes.push({ x0: x - .5, x1: x + .5, y0: y, y1: y + 1, z0: -1.5, z1: 1.5 });
    for (const b of world.blocks) if (b.alive) boxes.push({ x0: b.x - .5, x1: b.x + .5, y0: b.y, y1: b.y + 1, z0: -.5, z1: .5, block: b });
    return boxes;
}

function groundAt(world, x, z) {
    for (const [a, b] of world.ground) if (x >= a && x <= b) return 0;
    return -Infinity;
}

function playerBox(p) {
    const h = p.big ? 2.05 : 1.5;
    return { x0: p.x - .34, x1: p.x + .34, y0: p.y, y1: p.y + h, z0: p.z - .34, z1: p.z + .34, h };
}

function moveAxis(world, p, box, axis, delta) {
    if (!delta) return;
    p[axis] += delta;
    const boxes = world._solids;
    for (const s of boxes) {
        if (!overlaps(box.x0, box.x1, s.x0, s.x1) || !overlaps(box.y0, box.y1, s.y0, s.y1) || !overlaps(box.z0, box.z1, s.z0, s.z1)) continue;
        if (axis === 'x') {
            p.x = delta > 0 ? s.x0 - .341 : s.x1 + .341;
            p.vx = 0;
        } else {
            p.z = delta > 0 ? s.z0 - .341 : s.z1 + .341;
            p.vz = 0;
        }
        // refresh player box after push-out
        box.x0 = p.x - .34; box.x1 = p.x + .34;
        box.z0 = p.z - .34; box.z1 = p.z + .34;
    }
}

function hitBlockFromBelow(world, p) {
    // Pick the block cell the head ran into, preferring the closest overlap in x.
    const head = p.y + (p.big ? 2.05 : 1.5);
    let best = null, bestDist = 1e9;
    for (const b of world.blocks) {
        if (!b.alive || b.used && b.type !== 'brick') continue;
        if (Math.abs(b.y + 1 - head) > .35) continue;
        if (Math.abs(p.z - b.z) > .8) continue;
        const d = Math.abs(p.x - b.x);
        if (d < .95 && d < bestDist) { best = b; bestDist = d; }
    }
    if (!best) return;
    if (best.type === 'brick') {
        if (p.big) {
            best.alive = false;
            world.score += 50;
            world.events.push({ type: 'break', x: best.x, y: best.y + .5, z: best.z });
        } else { best.bump = 1; world.events.push({ type: 'bump', x: best.x, y: best.y + 1, z: best.z }); }
        return;
    }
    if (best.used) return;
    best.used = true; best.bump = 1;
    if (best.type === 'coin') {
        world.coins++; world.score += 200;
        world.items.push({ kind: 'popcoin', x: best.x, y: best.y + 1.2, z: best.z, vy: 7.5, life: .8, alive: true });
        world.events.push({ type: 'coin', x: best.x, y: best.y + 1, z: best.z });
    } else if (best.type === 'mushroom') {
        world.items.push({ kind: 'mushroom', x: best.x, y: best.y + 1, z: best.z, rise: .9, vx: 0, vy: 0, dir: 1, alive: true });
        world.events.push({ type: 'spawn', x: best.x, y: best.y + 1, z: best.z });
    }
}

function hurt(world) {
    const p = world.player;
    if (p.invincible > 0 || world.demoMode) return;
    if (p.big) {
        p.big = false; p.invincible = 2;
        world.events.push({ type: 'shrink' });
    } else {
        world.status = 'dying'; p.vy = 11; p.vx = 0; p.vz = 0;
        world.events.push({ type: 'die' });
    }
}

function stompCheck(world) {
    const p = world.player, box = playerBox(p);
    for (const e of world.enemies) {
        if (!e.alive) continue;
        if (!overlaps(box.x0, box.x1, e.x - .42, e.x + .42) || !overlaps(box.z0, box.z1, e.z - .42, e.z + .42)) continue;
        const falling = p.vy < -1, above = p.y > e.y + .25;
        if (falling && above) {
            e.alive = false; e.squash = .8;
            p.vy = 7.2; world.score += 100;
            world.events.push({ type: 'stomp', x: e.x, y: e.y + .4, z: e.z });
        } else hurt(world);
    }
}

function updateEnemies(world, dt) {
    for (const e of world.enemies) {
        if (!e.alive) { e.squash = Math.max(0, e.squash - dt); continue; }
        e.vy -= GRAV * dt;
        e.y += e.vy * dt;
        const g = groundAt(world, e.x, e.z);
        if (e.y <= g) { e.y = g; e.vy = 0; } else if (e.y < -6) { e.alive = false; continue; }
        // step support: sample ahead so goombas walk off ledges naturally
        e.x += e.vx * dt;
        const ahead = groundAt(world, e.x + Math.sign(e.vx) * .45, e.z);
        if (ahead === -Infinity && e.y <= 0) { e.vx = -e.vx; e.x += e.vx * dt * 2; }
        // pipes push them back
        for (const [px] of world.pipes) {
            if (Math.abs(e.x - px) < 1.3 && e.y < world.pipes.find(p => p[0] === px)[1]) {
                e.vx = Math.abs(e.x - px) < .95 ? -Math.sign(e.x - px) * 1.6 : e.vx;
            }
        }
        e.x = Math.min(.4 + (world.stairs.length ? Math.max(...world.stairs.map(s => s[0])) : 0), e.x);
        e.dir = e.vx > 0 ? 1 : -1;
    }
}

function updateItems(world, dt) {
    const p = world.player;
    for (let i = world.items.length - 1; i >= 0; i--) {
        const it = world.items[i];
        if (it.kind === 'coin') {
            if (Math.abs(it.x - p.x) < .8 && Math.abs(it.z - p.z) < .8 && p.y < it.y + 1.4 && p.y + 2 > it.y) {
                world.coins++; world.score += 200;
                world.events.push({ type: 'coin', x: it.x, y: it.y, z: it.z });
                world.items.splice(i, 1);
            }
            continue;
        }
        if (it.kind === 'popcoin') {
            it.vy -= GRAV * dt; it.y += it.vy * dt; it.life -= dt;
            if (it.life <= 0) world.items.splice(i, 1);
            continue;
        }
        if (it.rise > 0) { it.rise -= dt; it.y += dt * 1.1; continue; }
        it.vx = it.dir * 2.1;
        it.vy -= GRAV * dt; it.y += it.vy * dt;
        const g = groundAt(world, it.x, it.z);
        if (it.y <= g) { it.y = g; it.vy = 0; }
        it.x += it.vx * dt;
        if (groundAt(world, it.x + Math.sign(it.vx) * .4, it.z) === -Infinity) it.dir = -it.dir;
        for (const [px, h] of world.pipes) if (Math.abs(it.x - px) < 1.05 && it.y < h) { it.dir = -it.dir; it.x += it.dir * .2; }
        if (!overlaps(p.x - .5, p.x + .5, it.x - .5, it.x + .5) || Math.abs(p.z - it.z) > .9 || p.y > it.y + 1 || p.y + 2 < it.y) continue;
        it.alive = false;
        if (!p.big) { p.big = true; p.y += .55; }
        world.score += 1000;
        world.events.push({ type: 'grow', x: it.x, y: it.y, z: it.z });
        world.items.splice(i, 1);
    }
}

export function stepWorld(world, input, dt) {
    const p = world.player;
    world._solids = solidBoxes(world);

    if (world.status === 'dying') {
        p.vy -= GRAV * dt; p.y += p.vy * dt;
        if (p.y < -14) world.status = 'dead';
        return;
    }
    if (world.status !== 'playing') return;

    // Timer: classic units, 1 unit per 0.4s. Demo mode freezes it at 30.
    if (!world.demoMode || world.time > 30) {
        world.timeAcc += dt;
        while (world.timeAcc >= .4) { world.timeAcc -= .4; world.time--; }
    }
    if (world.time <= 0) {
        world.time = 0;
        if (!world.demoMode) { world.status = 'dying'; p.vy = 11; world.events.push({ type: 'die' }); return; }
    }

    if (p.invincible > 0) p.invincible -= dt;

    // Horizontal run/walk with camera-relative input (mapped in main.js).
    const target = input.run ? RUN : WALK;
    const wishX = input.x * target, wishZ = input.z * target * DEPTH_SCALE;
    const approach = (cur, wish) => wish > cur ? Math.min(wish, cur + ACCEL * dt) : Math.max(wish, cur - ACCEL * dt);
    if (input.x) { p.vx = approach(p.vx, wishX); p.facing = input.x > 0 ? 1 : -1; }
    else if (p.grounded) p.vx = Math.abs(p.vx) < FRICTION * dt ? 0 : p.vx - Math.sign(p.vx) * FRICTION * dt;
    if (input.z) { p.vz = approach(p.vz, wishZ); } else if (p.grounded) p.vz = Math.abs(p.vz) < FRICTION * dt ? 0 : p.vz - Math.sign(p.vz) * FRICTION * dt;

    // Jump: single press, variable height via early release.
    if (input.jumpPressed && p.grounded) { p.vy = JUMP_V; p.grounded = false; world.events.push({ type: 'jump' }); }
    if (!input.jump && p.vy > JUMP_CUT) p.vy = JUMP_CUT;

    p.vy -= GRAV * dt;

    const box = playerBox(p);
    moveAxis(world, p, box, 'x', p.vx * dt);
    moveAxis(world, p, box, 'z', p.vz * dt);
    p.z = Math.max(-DEPTH_MAX, Math.min(DEPTH_MAX, p.z));
    const prevY = p.y;
    p.y += p.vy * dt;
    box.y0 = p.y; box.y1 = p.y + box.h;

    // Vertical resolution: land on solids and ground. Continuous checks so a
    // fast rise can't tunnel through a block row without triggering the bump.
    p.grounded = false;
    const g = groundAt(world, p.x, p.z);
    if (p.vy <= 0 && p.y <= g) { p.y = g; p.vy = 0; p.grounded = true; }
    for (const s of world._solids) {
        if (!overlaps(box.x0, box.x1, s.x0, s.x1) || !overlaps(box.z0, box.z1, s.z0, s.z1)) continue;
        if (p.vy <= 0 && prevY >= s.y1 - .01 && p.y <= s.y1) { p.y = s.y1; p.vy = 0; p.grounded = true; box.y0 = p.y; box.y1 = p.y + box.h; }
        else if (p.vy > 0 && prevY + box.h <= s.y0 + .01 && p.y + box.h > s.y0) {
            p.y = s.y0 - box.h; p.vy = 0; box.y0 = p.y; box.y1 = p.y + box.h;
            if (s.block) hitBlockFromBelow(world, p);
            else world.events.push({ type: 'bump', x: p.x, y: s.y0, z: p.z });
        }
    }

    if (p.y < -7) { world.status = 'dying'; p.vy = 11; world.events.push({ type: 'die' }); return; }

    stompCheck(world);
    if (world.status !== 'playing') return;
    updateEnemies(world, dt);
    updateItems(world, dt);

    // Block bump animation decay.
    for (const b of world.blocks) if (b.bump > 0) b.bump = Math.max(0, b.bump - dt * 4.5);

    // Checkpoint.
    if (world.checkpoint < CHECKPOINT_X && p.x >= CHECKPOINT_X) {
        world.checkpoint = CHECKPOINT_X;
        world.events.push({ type: 'checkpoint' });
    }

    // Flagpole: win by touching it. Score bonus scales with grab height.
    if (p.x >= LEVEL_END - .2) {
        world.status = 'winning';
        p.x = LEVEL_END - .2; p.vx = 0; p.vz = 0;
        p.slide = Math.min(1, Math.max(.15, p.y / 9));
        world.score += Math.round(100 + p.y * 220);
        world.events.push({ type: 'flag', x: p.x, y: p.y, z: p.z });
        return;
    }

    // Popcoin arcs above the player get collected on the way up.
    for (let i = world.items.length - 1; i >= 0; i--) {
        const it = world.items[i];
        if (it.kind !== 'popcoin') continue;
        if (Math.abs(it.x - p.x) < 1 && Math.abs(it.y - p.y - 1) < 2.2) {
            world.score += 200; world.coins++;
            world.items.splice(i, 1);
        }
    }
}

// Slide-down + walk-off animation once the pole is grabbed.
export function stepWin(world, dt) {
    const p = world.player;
    if (world.status !== 'winning') return;
    if (p.y > .4) { p.y = Math.max(.4, p.y - dt * 6); p.facing = 1; }
    else { p.slide = 0; p.vx = 2.4; p.x += p.vx * dt; p.facing = 1; }
    if (p.x > LEVEL_END + 6.5) { world.status = 'won'; world.events.push({ type: 'win' }); }
}
