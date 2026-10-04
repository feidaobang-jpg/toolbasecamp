// 玩法模拟：与渲染无关。地形整条跑道纵深一致，碰撞按 (x,y) 网格计算，z 只用于跑道边界和实体之间的接触。
import { LANE, SOLID, tileKey, buildLevel, LEVEL_ORDER } from './levels.js?v=2.0.0';

export const STEP = 1 / 120;
export const PW = 0.36;                       // 玛丽半宽
const H_SMALL = 0.92, H_BIG = 1.84;
const ZMAX = LANE - 0.42;
// 按原作每帧像素换算（60 帧、16 像素一格），再为 3D 视角略放宽
const WALK = 5.7, RUN = 9.2;
const ACC_WALK = 13, ACC_RUN = 17, DECEL = 13, SKID = 30, AIR_ACC = 11, CROUCH_FRICTION = 7;
const G_FALL = 80, MAX_FALL = 17;
const STOMP_SCORES = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createSession(settings) {
  return {
    settings: Object.assign({}, settings), score: 0, coins: 0,
    lives: settings.lives === 'classic' ? 3 : Infinity, hearts: 3, power: 'small',
    levelId: settings.startLevel || '1-1', checkpoint: null, demoUsed: !!settings.demo,
    stats: { deaths: 0, oneups: 0, hits: 0, stomps: 0, coins: 0, secrets: 0, startTime: 0 }, finished: false
  };
}

export function heightOf(p) { return p.power === 'small' || p.crouch ? H_SMALL : H_BIG; }

export function createWorld(session, opts = {}) {
  const level = buildLevel(session.levelId);
  const cp = opts.fromCheckpoint && session.checkpoint === session.levelId ? level.checkpoint : null;
  const w = {
    session, level, levelId: session.levelId, time: level.time, timeAcc: 0, clock: 0, mode: 'play', modeT: 0,
    events: [], hurry: false, flag: null, pipeAnim: null, deathAnim: false, areaVersion: 0
  };
  w.player = {
    x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: false, jumping: false, gHold: 28, facing: Math.PI / 2,
    power: session.power, crouch: false, inv: opts.respawn ? 2.5 : 0, star: 0, coyote: 0, jumpBuffer: 0, chain: 0,
    onLift: null, growT: 0, fireT: 0, lastSafe: null, visible: true, walkT: 0, skid: false
  };
  if (session.settings.armor !== 'classic') session.hearts = 3;
  enterArea(w, cp ? cp.area : level.startArea);
  const p = w.player, a = w.area;
  if (cp) { p.x = cp.x; p.y = groundTopAt(w, cp.x); }
  else { p.x = a.start.x; p.y = a.start.y; }
  p.lastSafe = { x: p.x, y: p.y, z: 0 };
  return w;
}

function groundTopAt(w, x) {
  const c = Math.floor(x);
  for (let h = 12; h >= -2; h--) if (solidAt(w, c, h)) return h + 1;
  return 0;
}

export function emit(w, type, data) { w.events.push(Object.assign({ type }, data || {})); }

function enterArea(w, id) {
  const a = w.level.areas[id];
  if (!a.rt) {
    a.rt = {
      enemies: a.enemies.map(d => ({
        type: d.type, red: !!d.red, x: d.x, y: d.y, z: 0, vx: 0, vy: 0, dir: -1, state: 'walk', active: false,
        w: 0.42, h: d.type === 'koopa' ? 1.3 : 0.9, t: 0, kickGrace: 0, chain: 0, grounded: false, gone: false
      })),
      items: [], fireballs: [],
      coins: a.coins.map(c => ({ x: c.x, y: c.y, alive: true })),
      lifts: [], piranhas: a.piranhas.map(pr => ({ pipe: pr.pipe, phase: 'hidden', t: 0.6, rise: 0, alive: [true, true, true] }))
    };
    for (const l of a.lifts) {
      const span = l.max - l.min;
      for (let i = 0; i < l.count; i++) a.rt.lifts.push({ x: l.x, w: l.w, y: l.min + span * (i + 0.35) / l.count, dir: l.dir, speed: l.speed, min: l.min, max: l.max, dy: 0 });
    }
  }
  w.area = a; w.areaId = id; w.tiles = a.tiles; w.rt = a.rt; w.areaVersion++;
  w.player.onLift = null;
  emit(w, 'area', { id, theme: a.theme });
}

// ---------- 地形查询 ----------
export function tileAt(w, c, h) { return w.tiles.get(tileKey(c, h)); }
function solidAt(w, c, h) { const t = w.tiles.get(tileKey(c, h)); return !!t && SOLID.has(t.t) && !t.hidden; }
function anySolid(w, x0, y0, x1, y1) {
  for (let c = Math.floor(x0); c <= Math.floor(x1 - 1e-6); c++)
    for (let h = Math.floor(y0); h <= Math.floor(y1 - 1e-6); h++) if (solidAt(w, c, h)) return true;
  return false;
}

// 通用实体移动：先 x 后 y，对整格方块做 AABB 推出。返回 {wall, landed, ceil}
function moveBody(w, b, dt, hw, hgt) {
  const r = { wall: 0, landed: false, ceil: false };
  b.x += b.vx * dt;
  const y0 = b.y + 0.04, y1 = b.y + hgt - 0.04;
  if (b.vx > 0) {
    const c = Math.floor(b.x + hw);
    for (let h = Math.floor(y0); h <= Math.floor(y1); h++) if (solidAt(w, c, h)) { b.x = c - hw - 1e-4; r.wall = 1; break; }
  } else if (b.vx < 0) {
    const c = Math.floor(b.x - hw);
    for (let h = Math.floor(y0); h <= Math.floor(y1); h++) if (solidAt(w, c, h)) { b.x = c + 1 + hw + 1e-4; r.wall = -1; break; }
  }
  const prevY = b.y;
  b.y += b.vy * dt;
  const c0 = Math.floor(b.x - hw + 0.03), c1 = Math.floor(b.x + hw - 0.03);
  if (b.vy <= 0) {
    const h = Math.floor(b.y);
    if (prevY >= h + 1 - 0.3) for (let c = c0; c <= c1; c++) if (solidAt(w, c, h)) { b.y = h + 1; b.vy = 0; r.landed = true; break; }
  } else {
    const h = Math.floor(b.y + hgt);
    for (let c = c0; c <= c1; c++) if (solidAt(w, c, h)) { b.y = h - hgt; b.vy = 0; r.ceil = true; break; }
  }
  return r;
}

// ---------- 主步进 ----------
export function step(w, input, dt) {
  w.clock += dt;
  w.modeT += dt;
  const p = w.player, s = w.session;
  updateLifts(w, dt);
  if (w.mode === 'play') {
    w.timeAcc += dt;
    while (w.timeAcc >= 0.4) {                                // 原作一个时间单位 ≈ 0.4 秒
      w.timeAcc -= 0.4; w.time--;
      if (w.time === 100 && !w.hurry) { w.hurry = true; emit(w, 'hurry'); }
      if (w.time <= 0) { w.time = 0; die(w, 'time'); break; }
    }
    if (w.mode === 'play') updatePlayer(w, input, dt);
  } else if (w.mode === 'pipe') updatePipe(w, dt);
  else if (w.mode === 'flag') updateFlag(w, dt);
  else if (w.mode === 'dying') updateDying(w, dt);
  if (w.mode !== 'dying' && w.mode !== 'clear') {
    updateEnemies(w, dt);
    updatePiranhas(w, dt);
    updateItems(w, dt);
    updateFireballs(w, dt);
  }
  for (const t of w.bumped || []) t.bump = Math.max(0, t.bump - dt);
  if (w.bumped) w.bumped = w.bumped.filter(t => t.bump > 0);
  p.inv = Math.max(0, p.inv - dt);
  if (p.star > 0) { p.star = Math.max(0, p.star - dt); if (p.star === 0) emit(w, 'starEnd'); }
  p.growT = Math.max(0, p.growT - dt);
  if (s.coins >= 100) { s.coins -= 100; oneUp(w, p.x, p.y + 2, p.z); }
}

function updateLifts(w, dt) {
  for (const l of w.rt.lifts) {
    const before = l.y;
    l.y += l.dir * l.speed * dt;
    l.wrapped = false;
    if (l.dir < 0 && l.y < l.min) { l.y += l.max - l.min; l.wrapped = true; }
    if (l.dir > 0 && l.y > l.max) { l.y -= l.max - l.min; l.wrapped = true; }
    l.dy = l.wrapped ? 0 : l.y - before;
  }
}

function addScore(w, n, x, y, z) { w.session.score += n; if (x !== undefined) emit(w, 'score', { x, y, z, text: String(n) }); }
function addCoin(w, x, y, z) { w.session.coins++; w.session.stats.coins++; addScore(w, 200); emit(w, 'coin', { x, y, z }); }
function oneUp(w, x, y, z) {
  const s = w.session;
  if (s.lives !== Infinity) s.lives++;
  s.stats.oneups++;
  emit(w, 'oneup', { x, y, z }); emit(w, 'score', { x, y, z, text: '1UP' });
}

function updatePlayer(w, input, dt) {
  const p = w.player, s = w.session;
  // 下蹲（L）：变大后才能蹲；蹲着可以滑进一格高的缝
  const wasCrouch = p.crouch;
  if (p.power !== 'small' && p.grounded && input.down) p.crouch = true;
  if (p.crouch && (!input.down || p.power === 'small')) {
    if (p.power === 'small' || !anySolid(w, p.x - PW + 0.04, p.y + H_SMALL, p.x + PW - 0.04, p.y + H_BIG)) p.crouch = false;
  }
  const forcedCrouch = p.crouch && !input.down;
  if (p.crouch !== wasCrouch) emit(w, 'crouch');

  // 钻水管
  if (p.grounded && !p.onLift && tryPipes(w, input)) return;

  // 水平（x/z）加速
  const run = input.run;
  const maxSpd = forcedCrouch ? 2.2 : run ? RUN : WALK;
  const mag = Math.hypot(input.mx, input.mz);
  let tx = input.mx * maxSpd, tz = input.mz * maxSpd;
  if (p.crouch && p.grounded && !forcedCrouch) { tx = 0; tz = 0; }
  let rate;
  if (p.grounded) {
    if (p.crouch && !forcedCrouch) rate = CROUCH_FRICTION;
    else if (mag < 0.1) rate = DECEL;
    else rate = (p.vx * tx + p.vz * tz < 0) ? SKID : run ? ACC_RUN : ACC_WALK;
  } else rate = mag < 0.1 ? 1.5 : AIR_ACC;
  const dvx = tx - p.vx, dvz = tz - p.vz, dl = Math.hypot(dvx, dvz), stepv = rate * dt;
  if (dl <= stepv) { p.vx = tx; p.vz = tz; } else { p.vx += dvx / dl * stepv; p.vz += dvz / dl * stepv; }
  p.skid = p.grounded && mag > 0.1 && p.vx * tx + p.vz * tz < 0 && Math.hypot(p.vx, p.vz) > 3;
  if (mag > 0.2 && !(p.crouch && p.grounded)) {
    const target = Math.atan2(input.mx, input.mz);
    let d = target - p.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
    p.facing += clamp(d, -18 * dt, 18 * dt);
  }

  // 跳跃：起跳初速按当前速度分三档，按住 K 时上升重力较小（原作手感）
  p.coyote = p.grounded ? 0.08 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.jumpPressed ? 0.12 : Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
    const spd = Math.hypot(p.vx, p.vz);
    if (spd >= 8.4) { p.vy = 18.4; p.gHold = 33.5; }
    else if (spd >= 3.8) { p.vy = 15.7; p.gHold = 27.6; }
    else { p.vy = 15.5; p.gHold = 28; }
    p.jumping = true; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.onLift = null;
    emit(w, 'jump', { big: p.power !== 'small' });
  }
  const g = p.jumping && p.vy > 0 && input.jump ? p.gHold : G_FALL;
  if (p.vy <= 0) p.jumping = false;
  p.vy = Math.max(p.vy - g * dt, -MAX_FALL);

  // 火球（J 按下）
  p.fireT = Math.max(0, p.fireT - dt);
  if (input.firePressed && p.power === 'fire' && !p.crouch && p.fireT <= 0 && w.rt.fireballs.length < 2) {
    const dx = Math.sin(p.facing), dz = Math.cos(p.facing);
    w.rt.fireballs.push({ x: p.x + dx * 0.45, y: p.y + 1.05, z: clamp(p.z + dz * 0.45, -LANE + 0.3, LANE - 0.3), vx: dx * 13, vz: dz * 13, vy: -4, life: 2.6, dead: 0 });
    p.fireT = 0.18; emit(w, 'fireball');
  }

  // 随升降台移动
  const prevY0 = p.y;
  if (p.onLift) {
    const l = p.onLift;
    if (l.wrapped || p.x + PW < l.x || p.x - PW > l.x + l.w) p.onLift = null;
    else { p.y = l.y; }
  }
  const prevBottom = p.y;
  const hgt = heightOf(p);
  // x
  p.x += p.vx * dt;
  const y0 = p.y + 0.04, y1 = p.y + hgt - 0.04;
  if (p.vx > 0) {
    const c = Math.floor(p.x + PW);
    for (let h = Math.floor(y0); h <= Math.floor(y1); h++) if (solidAt(w, c, h)) { p.x = c - PW - 1e-4; p.vx = 0; break; }
  } else if (p.vx < 0) {
    const c = Math.floor(p.x - PW);
    for (let h = Math.floor(y0); h <= Math.floor(y1); h++) if (solidAt(w, c, h)) { p.x = c + 1 + PW + 1e-4; p.vx = 0; break; }
  }
  if (p.x < PW + 0.02) { p.x = PW + 0.02; p.vx = Math.max(0, p.vx); }
  if (p.x > w.area.width - PW) { p.x = w.area.width - PW; p.vx = Math.min(0, p.vx); }
  // z（跑道边界）
  p.z += p.vz * dt;
  if (p.z > ZMAX) { p.z = ZMAX; p.vz = Math.min(0, p.vz); }
  if (p.z < -ZMAX) { p.z = -ZMAX; p.vz = Math.max(0, p.vz); }
  // y
  p.y += p.vy * dt;
  const wasGrounded = p.grounded;
  p.grounded = false;
  const c0 = Math.floor(p.x - PW + 0.03), c1 = Math.floor(p.x + PW - 0.03);
  if (p.vy <= 0) {
    const h = Math.floor(p.y);
    if (prevBottom >= h + 1 - 0.3) for (let c = c0; c <= c1; c++) if (solidAt(w, c, h)) { p.y = h + 1; p.vy = 0; p.grounded = true; p.onLift = null; break; }
    if (!p.grounded) for (const l of w.rt.lifts) {
      if (p.x + PW > l.x && p.x - PW < l.x + l.w && prevBottom >= l.y - 0.32 && p.y <= l.y && !l.wrapped) { p.y = l.y; p.vy = 0; p.grounded = true; p.onLift = l; break; }
    }
  } else headBump(w, p, hgt);
  if (p.grounded) {
    p.chain = 0;
    if (!p.onLift) p.lastSafe = { x: p.x, y: p.y, z: p.z };
    if (!wasGrounded) emit(w, 'land');
  }
  unstick(w, p, dt);
  p.walkT += Math.hypot(p.vx, p.vz) * dt;

  if (p.y < w.area.killY) { die(w, 'pit'); return; }
  checkCheckpoint(w);
  collectCoins(w);
  checkFlag(w);
  void prevY0;
}

// 顶砖：取头顶正上方那一格；只擦到边缘时把人轻推开（原作的边角修正）
function headBump(w, p, hgt) {
  const h = Math.floor(p.y + hgt);
  const hits = [];
  const prevTop = p.y + hgt - p.vy * STEP;
  for (let c = Math.floor(p.x - PW + 0.02); c <= Math.floor(p.x + PW - 0.02); c++) {
    const t = tileAt(w, c, h);
    // 隐藏块只有头从下方顶进去时才算数
    if (t && SOLID.has(t.t) && (!t.hidden || prevTop <= t.h + 0.05)) hits.push(t);
  }
  if (!hits.length) return;
  const visible = hits.filter(t => !t.hidden);
  if (visible.length === 1 && hits.length === 1) {
    const t = visible[0];
    const overlap = Math.min(p.x + PW, t.c + 1) - Math.max(p.x - PW, t.c);
    if (overlap < 0.2) { p.x = t.c + 0.5 < p.x ? t.c + 1 + PW + 1e-3 : t.c - PW - 1e-3; return; }
  }
  const target = hits.find(t => p.x >= t.c && p.x < t.c + 1) || hits.reduce((a, b) => (Math.abs(a.c + 0.5 - p.x) <= Math.abs(b.c + 0.5 - p.x) ? a : b));
  p.y = h - hgt; p.vy = -1; p.jumping = false;
  hitBlock(w, target);
}

function unstick(w, p, dt) {
  // 变大或起身时卡进方块：横向慢慢挤出（与原作相同的处理方式）
  const hgt = heightOf(p), y0 = p.y + 0.05, y1 = p.y + hgt - 0.05;
  let push = 0;
  for (let c = Math.floor(p.x - PW + 0.05); c <= Math.floor(p.x + PW - 0.05); c++)
    for (let h = Math.floor(y0); h <= Math.floor(y1); h++) if (solidAt(w, c, h)) push += p.x >= c + 0.5 ? 1 : -1;
  if (push) p.x += Math.sign(push) * 4 * dt;
}

function tryPipes(w, input) {
  const p = w.player;
  if (input.down) {
    for (const pp of w.area.pipes) {
      if (!pp.enter) continue;
      if (Math.abs(p.y - pp.h) < 0.02 && p.x > pp.x + 0.5 && p.x < pp.x + 1.5) {
        startPipe(w, 'down', pp.enter, pp);
        return true;
      }
    }
  }
  for (const sp of w.area.sidePipes) {
    if (!sp.to) continue;
    if (Math.abs(p.y - sp.y) < 0.02 && p.x + PW >= sp.x - 0.06 && p.x < sp.x && (input.mx > 0.5 || input.down)) {
      startPipe(w, 'side', sp.to, sp);
      return true;
    }
  }
  return false;
}

function startPipe(w, kind, dest, from) {
  const p = w.player;
  w.mode = 'pipe'; w.modeT = 0;
  w.pipeAnim = { kind, dest, from, phase: 'in' };
  p.vx = p.vz = p.vy = 0; p.crouch = false;
  if (kind === 'down') p.x = from.x + 1;
  else p.facing = Math.PI / 2;
  emit(w, 'pipe');
}

function updatePipe(w, dt) {
  const p = w.player, a = w.pipeAnim;
  if (a.phase === 'in') {
    if (a.kind === 'down') p.y -= 2.3 * dt; else p.x += 1.6 * dt;
    if (w.modeT > 0.95) {
      if (a.dest.warp) { w.mode = 'clear'; emit(w, 'warp', { world: a.dest.warp }); w.session.stats.secrets++; return; }
      enterArea(w, a.dest.area);
      if (a.dest.mode === 'drop') {
        p.x = a.dest.x; p.y = 11.2; p.z = 0; p.vy = 0; w.mode = 'play'; w.pipeAnim = null;
        if (a.dest.area === 'bonus') w.session.stats.secrets++;
      } else {
        const out = w.area.pipes.find(q => q.exitId === a.dest.pipe);
        p.x = out.x + 1; p.y = out.h - heightOf(p) - 0.1; p.z = 0; p.facing = Math.PI / 2;
        a.phase = 'out'; a.out = out; w.modeT = 0;
        emit(w, 'pipe');
      }
    }
  } else {
    p.y += 2.3 * dt;
    if (p.y >= a.out.h) { p.y = a.out.h; p.grounded = true; w.mode = 'play'; w.pipeAnim = null; p.lastSafe = { x: p.x, y: p.y, z: p.z }; }
  }
}

function checkCheckpoint(w) {
  const cp = w.level.checkpoint, s = w.session, p = w.player;
  if (s.checkpoint !== w.levelId && w.areaId === cp.area && p.x >= cp.x) {
    s.checkpoint = w.levelId;
    if (s.settings.armor !== 'classic') s.hearts = 3;
    emit(w, 'checkpoint');
  }
}

function collectCoins(w) {
  const p = w.player, hgt = heightOf(p);
  for (const c of w.rt.coins) {
    if (!c.alive) continue;
    // 金币沿纵深并排三枚视作同一枚，任意 z 都能吃到
    if (Math.abs(c.x - p.x) < PW + 0.3 && c.y + 0.42 > p.y && c.y - 0.42 < p.y + hgt) {
      c.alive = false; addCoin(w, c.x, c.y, p.z);
    }
  }
}

// ---------- 方块 ----------
function hitBlock(w, t) {
  const p = w.player;
  if (t.t === 'U' || t.t === 'S' || t.t === 'P' || t.t === 'G' || t.t === 'F' || t.t === 'W') { emit(w, 'bump'); return; }
  const z = clamp(p.z, -LANE + 0.6, LANE - 0.6);
  if (t.hidden) { t.hidden = false; w.session.stats.secrets++; }
  const content = t.content;
  if (!content) {
    if (p.power !== 'small') {
      w.tiles.delete(tileKey(t.c, t.h));
      t.broken = true;
      addScore(w, 50);
      emit(w, 'break', { tile: t, z });
      bumpAbove(w, t);
      return;
    }
    bumpTile(w, t); emit(w, 'bump');
    return;
  }
  bumpTile(w, t);
  if (content === 'coin') { t.t = 'U'; t.content = null; emit(w, 'coinpop', { x: t.c + 0.5, y: t.h + 1, z }); addCoin(w); emit(w, 'score', { x: t.c + 0.5, y: t.h + 2.2, z, text: '200' }); }
  else if (content === 'coin10') {
    if (t.count === undefined) { t.count = 0; t.deadline = w.clock + 4.5; }
    t.count++;
    emit(w, 'coinpop', { x: t.c + 0.5, y: t.h + 1, z }); addCoin(w);
    if (t.count >= 10 || w.clock > t.deadline) { t.t = 'U'; t.content = null; }
  } else {
    t.t = 'U'; t.content = null;
    let type = content;
    if (content === 'power') type = p.power === 'small' ? 'mushroom' : 'flower';
    const it = { type, x: t.c + 0.5, y: t.h, z, vx: 0, vy: 0, dir: 1, emerge: 1, alive: true, t: 0 };
    if (t.dropDown) { it.y = t.h - 0.95; it.emerge = 0; it.dir = -1; }
    w.rt.items.push(it);
    emit(w, 'sprout', { type });
  }
  emit(w, 'tile', { tile: t });
  bumpAbove(w, t);
}

function bumpTile(w, t) {
  t.bump = 0.22;
  (w.bumped || (w.bumped = [])).push(t);
  emit(w, 'tile', { tile: t });
}

// 顶砖时砖上方的敌人被顶翻、道具被顶跳、金币被顶到
function bumpAbove(w, t) {
  const top = t.h + 1, cx = t.c + 0.5;
  for (const e of w.rt.enemies) {
    if (e.gone || e.state === 'dead' || e.state === 'squash') continue;
    if (Math.abs(e.y - top) < 0.25 && Math.abs(e.x - cx) < 0.5 + e.w) { killEnemy(w, e, 100, true); }
  }
  for (const it of w.rt.items) {
    if (it.alive && it.emerge <= 0 && Math.abs(it.y - top) < 0.25 && Math.abs(it.x - cx) < 0.9) { it.vy = 9; it.dir = it.x >= w.player.x ? 1 : -1; }
  }
  for (const c of w.rt.coins) {
    if (c.alive && Math.abs(c.x - cx) < 0.6 && Math.abs(c.y - (top + 0.5)) < 0.3) { c.alive = false; addCoin(w, c.x, c.y, w.player.z); }
  }
}

// ---------- 伤害与死亡 ----------
function hurt(w) {
  const p = w.player, s = w.session;
  if (s.settings.demo || p.inv > 0 || p.star > 0 || w.mode !== 'play') return;
  s.stats.hits++;
  if (p.power !== 'small') {
    p.power = 'small'; p.crouch = false; p.inv = 2.2; p.growT = 0.8;
    emit(w, 'shrink');
    return;
  }
  if (s.settings.armor !== 'classic' && s.hearts > 1) {
    s.hearts--; p.inv = 2.2; p.vy = Math.max(p.vy, 7);
    emit(w, 'hurt', { hearts: s.hearts });
    return;
  }
  die(w, 'enemy');
}

export function die(w, reason) {
  const p = w.player, s = w.session;
  if (w.mode !== 'play') return;
  if (s.settings.demo) {
    // 演示模式：掉坑回到最近站稳的位置，时间耗尽则重置时间
    if (reason === 'time') { w.time = w.level.time; w.hurry = false; emit(w, 'toast', { text: '演示模式：时间已重置' }); return; }
    const ls = p.lastSafe;
    Object.assign(p, { x: ls.x, y: ls.y + 0.05, z: ls.z, vx: 0, vy: 0, vz: 0, inv: 1.5, onLift: null });
    emit(w, 'toast', { text: '演示模式：掉坑后回到站稳的位置' });
    return;
  }
  w.mode = 'dying'; w.modeT = 0; w.deathAnim = reason !== 'pit'; w.deathReason = reason;
  p.vx = p.vz = 0; p.vy = 0; p.star = 0; p.crouch = false;
  s.stats.deaths++;
  emit(w, 'die', { reason });
}

function updateDying(w, dt) {
  const p = w.player;
  if (w.deathAnim && w.modeT > 0.5) {
    if (!w.deathJump) { w.deathJump = true; p.vy = 15; }
    p.vy -= 38 * dt; p.y += p.vy * dt;
  }
  if (w.modeT > 3.1 && !w.deadSent) { w.deadSent = true; emit(w, 'dead', { reason: w.deathReason }); }
}

// ---------- 敌人 ----------
function killEnemy(w, e, score, flip) {
  e.state = 'dead'; e.flip = flip; e.vy = 9; e.vx = (e.x >= w.player.x ? 1 : -1) * 1.5; e.t = 0;
  addScore(w, score, e.x, e.y + e.h + 0.4, e.z);
  emit(w, 'kick', { x: e.x, y: e.y, z: e.z });
}

function chainScore(n) { return n < STOMP_SCORES.length ? STOMP_SCORES[n] : -1; }

function updateEnemies(w, dt) {
  const p = w.player, list = w.rt.enemies, hgt = heightOf(p);
  for (const e of list) {
    if (e.gone) continue;
    if (!e.active) { if (e.x < p.x + 17 && e.x > p.x - 22) e.active = true; else continue; }
    e.t += dt;
    e.kickGrace = Math.max(0, e.kickGrace - dt);
    if (e.state === 'squash') { if (e.t > 0.5) e.gone = true; continue; }
    if (e.state === 'dead') { e.vy -= 30 * dt; e.y += e.vy * dt; e.x += e.vx * dt; if (e.y < -10) e.gone = true; continue; }
    // 行走/滑壳
    if (e.state === 'walk') e.vx = e.dir * 1.9;
    else if (e.state === 'shell') {
      e.vx = 0;
      if (e.t > 8) { e.state = 'walk'; e.h = 1.3; e.t = 0; e.dir = p.x < e.x ? -1 : 1; emit(w, 'revive'); }
    } else if (e.state === 'shellMove') e.vx = e.dir * 10;
    e.vy = Math.max(e.vy - 40 * dt, -MAX_FALL);
    const r = moveBody(w, e, dt, e.w, e.h);
    e.grounded = r.landed;
    if (r.wall) { e.dir = -r.wall; if (e.state === 'shellMove') emit(w, 'bump'); }
    // 红乌龟不会走下平台
    if (e.red && e.state === 'walk' && e.grounded) {
      const ahead = Math.floor(e.x + e.dir * (e.w + 0.05));
      if (!solidAt(w, ahead, Math.floor(e.y - 0.5))) e.dir *= -1;
    }
    // 3D：靠近玛丽时缓慢对准她所在的纵深，不能从侧面轻松绕开
    if (e.state === 'walk' && Math.abs(p.x - e.x) < 9) {
      const dz = p.z - e.z;
      e.z += clamp(dz, -1.15 * dt, 1.15 * dt);
    }
    e.z = clamp(e.z, -ZMAX, ZMAX);
    if (e.y < w.area.killY - 2) { e.gone = true; continue; }

    // 与其他敌人
    for (const o of list) {
      if (o === e || o.gone || !o.active || o.state === 'dead' || o.state === 'squash') continue;
      if (Math.abs(o.x - e.x) < e.w + o.w && Math.abs(o.z - e.z) < 0.8 && Math.abs(o.y - e.y) < 0.7) {
        if (e.state === 'shellMove' && o.state !== 'shellMove') { killEnemy(w, o, shellScore(w, e), true); }
        else if (e.state === 'walk' && o.state === 'walk' && (o.x - e.x) * e.dir > 0) { e.dir *= -1; }
      }
    }

    // 与玛丽
    if (w.mode !== 'play') continue;
    if (Math.abs(p.z - e.z) > PW + e.w - 0.05) continue;
    if (!(Math.abs(p.x - e.x) < PW + e.w - 0.04 && p.y < e.y + e.h && p.y + hgt > e.y + 0.05)) continue;
    if (p.star > 0) { killEnemy(w, e, 100 * (1 + Math.min(4, p.chain++)), true); continue; }
    const stomping = p.vy < 0.5 && p.y >= e.y + e.h * 0.45;
    if (e.state === 'shell') {
      e.state = 'shellMove'; e.dir = (e.x - p.x) >= 0 ? 1 : -1; e.kickGrace = 0.3; e.t = 0; e.chain = 0;
      addScore(w, 400, e.x, e.y + 1.2, e.z); emit(w, 'kick', { x: e.x, y: e.y, z: e.z });
      if (stomping) bounce(w, p);
      continue;
    }
    if (stomping) {
      const sc = chainScore(p.chain++);
      if (sc < 0) oneUp(w, e.x, e.y + 1.2, e.z); else addScore(w, sc, e.x, e.y + e.h + 0.4, e.z);
      w.session.stats.stomps++;
      if (e.type === 'goomba') { e.state = 'squash'; e.t = 0; emit(w, 'stomp', { x: e.x, y: e.y, z: e.z }); }
      else { e.state = 'shell'; e.h = 0.85; e.t = 0; e.vx = 0; emit(w, 'stomp', { x: e.x, y: e.y, z: e.z }); }
      bounce(w, p);
      continue;
    }
    if (e.state === 'shellMove' && e.kickGrace > 0) continue;
    hurt(w);
  }
}

function shellScore(w, e) { const n = e.chain++; return STOMP_SCORES[Math.min(n + 3, STOMP_SCORES.length - 1)]; }
function bounce(w, p) { p.vy = 13; p.jumping = true; p.gHold = 30; p.grounded = false; p.onLift = null; }

function updatePiranhas(w, dt) {
  const p = w.player, hgt = heightOf(p);
  for (const pr of w.rt.piranhas) {
    const cx = pr.pipe.x + 1;
    pr.t -= dt;
    if (pr.phase === 'hidden') {
      // 玛丽站在水管上或紧挨着时不出来（原作规则）
      if (pr.t <= 0 && Math.abs(p.x - cx) > 2.1) { pr.phase = 'up'; }
    } else if (pr.phase === 'up') { pr.rise = Math.min(1, pr.rise + dt / 0.75); if (pr.rise >= 1) { pr.phase = 'out'; pr.t = 1.4; } }
    else if (pr.phase === 'out') { if (pr.t <= 0) pr.phase = 'down'; }
    else if (pr.phase === 'down') { pr.rise = Math.max(0, pr.rise - dt / 0.75); if (pr.rise <= 0) { pr.phase = 'hidden'; pr.t = 1.4; } }
    if (pr.rise < 0.2 || w.mode !== 'play') continue;
    const top = pr.pipe.h + pr.rise * 1.45;
    for (let i = 0; i < 3; i++) {
      if (!pr.alive[i]) continue;
      const z = (i - 1) * 2;
      if (Math.abs(p.z - z) < PW + 0.42 && Math.abs(p.x - cx) < PW + 0.42 && p.y < top - 0.1 && p.y + hgt > pr.pipe.h) {
        if (p.star > 0) { pr.alive[i] = false; addScore(w, 200, cx, top, z); emit(w, 'kick', { x: cx, y: top, z }); }
        else hurt(w);
      }
    }
  }
}

// ---------- 道具 ----------
function updateItems(w, dt) {
  const p = w.player, hgt = heightOf(p), s = w.session;
  for (const it of w.rt.items) {
    if (!it.alive) continue;
    it.t += dt;
    if (it.emerge > 0) { const d = Math.min(it.emerge, 1.25 * dt); it.y += d; it.emerge -= d; continue; }
    if (it.type === 'mushroom' || it.type === '1up') {
      it.vx = it.dir * 3.3; it.vy = Math.max(it.vy - 32 * dt, -MAX_FALL);
      const r = moveBody(w, it, dt, 0.4, 0.85); if (r.wall) it.dir = -r.wall;
    } else if (it.type === 'star') {
      it.vx = it.dir * 4.2; it.vy = Math.max(it.vy - 32 * dt, -MAX_FALL);
      const r = moveBody(w, it, dt, 0.4, 0.85); if (r.wall) it.dir = -r.wall; if (r.landed) it.vy = 11; if (r.ceil) it.vy = -1;
    }
    if (it.y < w.area.killY - 1) { it.alive = false; continue; }
    if (w.mode !== 'play') continue;
    if (Math.abs(p.x - it.x) < PW + 0.4 && Math.abs(p.z - it.z) < PW + 0.5 && it.y < p.y + hgt && it.y + 0.85 > p.y) {
      it.alive = false;
      if (it.type === '1up') oneUp(w, it.x, it.y + 1, it.z);
      else if (it.type === 'star') { p.star = 10; addScore(w, 1000, it.x, it.y + 1, it.z); emit(w, 'star'); }
      else {
        addScore(w, 1000, it.x, it.y + 1, it.z);
        if (p.power === 'small') { p.power = 'big'; p.growT = 0.8; emit(w, 'grow'); }
        else if (it.type === 'flower' && p.power === 'big') { p.power = 'fire'; p.growT = 0.8; emit(w, 'fire'); }
        else emit(w, 'powerup');
        s.power = p.power;
      }
    }
  }
  w.rt.items = w.rt.items.filter(it => it.alive);
  s.power = p.power;
}

function updateFireballs(w, dt) {
  const list = w.rt.fireballs;
  for (const f of list) {
    if (f.dead) { f.dead += dt; continue; }
    f.life -= dt;
    f.vy = Math.max(f.vy - 60 * dt, -14);
    const r = moveBody(w, f, dt, 0.18, 0.36);
    f.z += f.vz * dt;
    if (r.landed) f.vy = 8.5;
    if (r.wall || r.ceil || f.life <= 0 || Math.abs(f.z) > LANE || f.y < w.area.killY) { f.dead = 0.001; emit(w, 'pop', { x: f.x, y: f.y, z: f.z }); continue; }
    for (const e of w.rt.enemies) {
      if (e.gone || !e.active || e.state === 'dead' || e.state === 'squash') continue;
      if (Math.abs(e.x - f.x) < e.w + 0.2 && Math.abs(e.z - f.z) < 0.65 && f.y < e.y + e.h && f.y + 0.36 > e.y) {
        killEnemy(w, e, e.type === 'koopa' ? 200 : 100, true); f.dead = 0.001; break;
      }
    }
    if (f.dead) continue;
    for (const pr of w.rt.piranhas) {
      if (pr.rise < 0.2) continue;
      const cx = pr.pipe.x + 1, top = pr.pipe.h + pr.rise * 1.45;
      for (let i = 0; i < 3; i++) {
        const z = (i - 1) * 2;
        if (pr.alive[i] && Math.abs(f.x - cx) < 0.6 && Math.abs(f.z - z) < 0.7 && f.y < top && f.y > pr.pipe.h - 0.2) {
          pr.alive[i] = false; f.dead = 0.001; addScore(w, 200, cx, top + 0.3, z); emit(w, 'kick', { x: cx, y: top, z });
        }
      }
    }
  }
  w.rt.fireballs = list.filter(f => !f.dead || f.dead < 0.25);
}

// ---------- 旗杆与通关 ----------
function checkFlag(w) {
  const f = w.area.flag, p = w.player;
  if (!f || w.mode !== 'play') return;
  // 半空摸到细杆，或在地面撞到旗杆底座
  if (p.y < f.top + 0.5 && p.x + PW >= f.x - (p.y < 1.05 ? 0.56 : 0.14)) {
    w.mode = 'flag'; w.modeT = 0;
    const y = p.y;
    const pts = y >= 8.4 ? 5000 : y >= 6.4 ? 2000 : y >= 4.2 ? 800 : y >= 2.2 ? 400 : 100;
    addScore(w, pts, f.x + 0.8, y + 1.5, 0);
    w.flag = { phase: 'slide', flagY: f.top - 0.6, fireworks: [1, 3, 6].includes(w.time % 10) ? w.time % 10 : 0, fired: 0, t: 0 };
    p.x = f.x - PW - 0.06; p.vx = p.vz = p.vy = 0; p.facing = Math.PI / 2; p.star = 0;
    emit(w, 'flagpole');
  }
}

function updateFlag(w, dt) {
  const p = w.player, f = w.area.flag, fl = w.flag, castle = w.area.castle;
  fl.t += dt;
  p.z += clamp(-p.z, -3 * dt, 3 * dt);
  if (fl.phase === 'slide') {
    p.y = Math.max(1, p.y - 9 * dt);
    fl.flagY = Math.max(1.6, fl.flagY - 9 * dt);
    if (p.y <= 1 && fl.flagY <= 1.6) { fl.phase = 'hold'; fl.t = 0; }
  } else if (fl.phase === 'hold') {
    if (fl.t > 0.45) { p.x = f.x + PW + 0.08; p.facing = -Math.PI / 2; fl.phase = 'hop'; fl.t = 0; }
  } else if (fl.phase === 'hop') {
    if (fl.t > 0.35) { fl.phase = 'walk'; fl.t = 0; p.vy = 0; emit(w, 'clearTune'); }
  } else if (fl.phase === 'walk') {
    p.facing = Math.PI / 2;
    p.vy -= 40 * dt; p.y += p.vy * dt;
    if (p.y <= groundTopAt(w, p.x)) { p.y = groundTopAt(w, p.x); p.vy = 0; p.grounded = true; }
    p.x += 3.2 * dt; p.vx = 3.2; p.walkT += 3.2 * dt;
    const door = castle ? castle.x + 2.5 : f.x + 6;
    if (p.x >= door) { p.visible = false; p.vx = 0; fl.phase = 'tally'; fl.t = 0; }
  } else if (fl.phase === 'tally') {
    if (fl.t > 0.6) {
      const n = Math.min(w.time, Math.max(1, Math.round(dt * 120)));
      if (w.time > 0) { w.time -= n; w.session.score += 50 * n; emit(w, 'tick'); }
      if (w.time <= 0) { w.time = 0; fl.phase = 'fireworks'; fl.t = 0; }
    }
  } else if (fl.phase === 'fireworks') {
    if (fl.fired < fl.fireworks && fl.t > 0.35 + fl.fired * 0.55) {
      fl.fired++; w.session.score += 500;
      const cx = (castle ? castle.x + 2.5 : f.x + 6);
      emit(w, 'firework', { x: cx + (fl.fired % 3 - 1) * 3.2, y: 8 + (fl.fired % 2) * 1.6, z: -1.5 });
    }
    if (fl.t > 0.6 + fl.fireworks * 0.55) { fl.phase = 'castle'; fl.t = 0; emit(w, 'castleFlag'); }
  } else if (fl.phase === 'castle') {
    if (fl.t > 1.6) { w.mode = 'clear'; emit(w, 'clear'); }
  }
}

export function nextLevelId(id) { const i = LEVEL_ORDER.indexOf(id); return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null; }
