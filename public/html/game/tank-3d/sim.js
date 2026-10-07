// 坦克大战 3D · 玩法模拟（固定 60 帧/秒逐帧推进，坐标单位 = FC 像素；不依赖渲染，Node 可测）。
// 经典模式按 FC 原版（ROM 反汇编调研数值）复刻：移速、弹速、砖块 4px 削除、出生间隔、AI、道具与计时；
// 魔改模式在同一套规则上加入 2D 版玩法：船、手枪、装甲、精英怪、小 Boss / 大 Boss、敌军抢道具、耐久与修理包。
import { N, Q, FIELD, BASE_WALL, EAGLE_CELLS, buildStage, brickCell, setBrickCell, rngFrom, MINI_INFO, CHAPTERS } from './levels.js?v=merge1';

export { N, Q, FIELD, BASE_WALL };
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const EAGLE = { x: 96, y: 192, w: 16 };
export const PLAYER_SPAWN = { x: 64, y: 192 };
export const playerSpawn = slot => ({ x: [64, 128, 32, 160][slot] ?? 64, y: 192 });
export const BOT_SPAWNS = [{ x: 96, y: 0 }, { x: 192, y: 0 }, { x: 0, y: 0 }];   // 中 → 右 → 左
export const SCORE = { basic: 100, fast: 200, power: 300, armor: 400, heavy: 500, flame: 600, escort: 100, mini: 2000, boss: 5000, final: 20000 };
export const TYPE_NAMES = { basic: '普通坦克', fast: '快速坦克', power: '火力坦克', armor: '重甲坦克', heavy: '精英重炮', flame: '火焰车', escort: '护卫', mini: '小 Boss', boss: '大 Boss', final: '终焉 Boss' };
const POWERUP_TABLE = ['helmet', 'timer', 'shovel', 'star', 'grenade', 'tank', 'grenade', 'star'];   // 原版 rand & 7 查表
const REMIX_POWERUPS = ['helmet', 'timer', 'shovel', 'star', 'grenade', 'tank', 'star', 'gun', 'boat', 'grenade', 'boat', 'gun'];
const POWERUP_SPOTS = [24, 72, 120, 168];   // 原版 16 个固定掉落点（左上角 px）
const BOSS_NAMES = ['侦察型', '巡猎型', '重装型', '裂甲型', '赤焰型', '霜锋型', '要塞型', '暗影型', '炼狱型', '终焉型'];

export function createRun(o = {}) {
  return {
    mode: o.mode || 'classic', livesMode: o.lives || 'classic', armor: o.armor || 'classic', demo: !!o.demo, demoUsed: !!o.demo, coop: !!o.coop,
    lives: o.lives === 'inf' ? Infinity : 3, stage: o.stage || 1, cycle: o.cycle || 1, score: o.score || 0,
    playerCount: Math.max(2, Math.min(4, o.playerCount || 2)), playerSlots: o.playerSlots,
    stars: 0, plate: 0, boats: 0, hp: 3, bonusGiven: false, nextBonus: 20000,
    stats: { kills: 0, deaths: 0, hits: 0, stages: 0, pickups: 0, repairs: 0, bosses: 0 },
    seed: o.seed ?? Math.floor(Math.random() * 1e6)
  };
}

const unitsToFrames = (n, f) => (n - 1) * 64 + (64 - (f & 63));   // 原版 64 帧粒度计时器

export function createWorld(run) {
  const spec = buildStage(run.mode, run.stage, run.cycle);
  const classic = run.mode === 'classic';
  const rng = rngFrom(run.seed * 31 + run.stage * 977 + run.cycle * 13);
  const w = {
    run, spec, classic, rng,
    rules: { autofire: !classic, enemyLoot: !classic, stackTimers: !classic, powerupLife: classic ? 0 : 1200, bonusEvery: !classic },
    f: Math.floor(rng() * 64), t: 0,
    terrain: spec.terrain, terrainVersion: 1, changed: [],
    eagle: { alive: true, boom: 0 },
    player: null, playerSpawnT: 0, nextId: 1,
    bots: [], bullets: [], powerup: null, items: [], mines: [], mortars: [], lasers: [],
    roster: spec.roster.slice(), rosterIndex: 0, remaining: spec.roster.length, spawnTimer: 0, spawnSeq: 0, spawnCount: 0, maxBots: spec.maxBots,
    freeze: 0, shovel: 0, playerFrozen: 0,
    kills: {}, killOrder: 0, pickups: 0, stageScore: 0,
    status: 'play', endT: 0, overRise: 0, result: null, events: [],
    boss: null, bossNote: false
  };
  w.diff = spec.diff;
  spawnPlayer(w, 0);
  if (run.coop) {
    const fields = () => Object.fromEntries(PLAYER_FIELDS.map(k => [k, run[k]]));
    run.coopPlayers ||= Array.from({ length: run.playerCount || 2 }, (_, slot) => ({ ...fields(), ...(run.playerSlots && !run.playerSlots.includes(slot) ? { lives: 0 } : {}) }));
    w.seats = run.coopPlayers.map((state, slot) => ({ slot, state, tank: null, spawnT: state.lives > 0 ? 37 : 0 }));
    w.localSlot = 0;
  }
  return w;
}
export const emit = (w, type, d = {}) => { w.events.push({ ...d, ...(w.activeSlot === undefined ? {} : { slot: w.activeSlot }), type }); };

// Each player owns lives / equipment; score, enemies and base remain shared.
const PLAYER_FIELDS = ['lives', 'hp', 'stars', 'plate', 'boats'];
export const localPlayer = w => w?.seats ? w.seats[w.localSlot || 0].tank : w?.player;
export const localStats = w => w?.seats ? w.seats[w.localSlot || 0].state : w?.run;
export function joinPlayer(w,slot){
 const fresh=createRun({lives:w.run.livesMode,armor:w.run.armor});
 while(w.seats.length<=slot)w.seats.push({slot:w.seats.length,state:{lives:0,hp:3,stars:0,plate:0,boats:0},tank:null,spawnT:0});
 const seat=w.seats[slot];seat.state=Object.fromEntries(PLAYER_FIELDS.map(k=>[k,fresh[k]]));seat.tank=null;seat.spawnT=37;
 w.run.coopPlayers=w.seats.map(s=>s.state);w.run.playerCount=Math.max(w.run.playerCount,slot+1);
}
export function computerPlayerInput(w,slot){
 const p=w.seats[slot]?.tank;if(!p||p.state!=='active')return {dir:-1};
 const target=w.bots.filter(t=>t.state==='active').sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(!target)return {dir:-1,fire:false};
 const dx=target.x-p.x,dy=target.y-p.y;
 const wanted=Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0);
 const dirs=[wanted,(wanted+1)%4,(wanted+3)%4,(wanted+2)%4];
 const dir=dirs.find(n=>!blockedBy(w,p,p.x+DX[n]*2,p.y+DY[n]*2))??wanted;
 const safe=!(dir===2&&Math.abs(p.x-EAGLE.x)<24&&p.y<EAGLE.y);
 return {dir,look:wanted*Math.PI/2,fire:safe,firePressed:safe&&w.f%15===0};
}
const playerTanks = w => w.seats ? w.seats.map(s => s.tank).filter(Boolean) : w.player ? [w.player] : [];
const targetPlayer = (w, t) => playerTanks(w).filter(p => p.state === 'active').sort((a, b) => Math.abs(a.x - t.x) + Math.abs(a.y - t.y) - Math.abs(b.x - t.x) - Math.abs(b.y - t.y))[0];
function withSeat(w, seat, fn) {
  if (!w.seats) return fn();
  const saved = Object.fromEntries(PLAYER_FIELDS.map(k => [k, w.run[k]]));
  const tank = w.player, spawnT = w.playerSpawnT, slot = w.activeSlot;
  Object.assign(w.run, seat.state); w.player = seat.tank; w.playerSpawnT = seat.spawnT; w.activeSlot = seat.slot;
  try { return fn(); }
  finally {
    for (const k of PLAYER_FIELDS) seat.state[k] = w.run[k];
    seat.tank = w.player; seat.spawnT = w.playerSpawnT;
    Object.assign(w.run, saved); w.player = tank; w.playerSpawnT = spawnT; w.activeSlot = slot;
  }
}
function forPlayers(w, fn) {
  if (w.seats) { for (const seat of w.seats) withSeat(w, seat, fn); }
  else fn();
}

// ---------------- 地形查询 ----------------
const cellIdx = (cx, cy) => cy * N + cx;
function inEagle(cx, cy) { return cx >= 12 && cx <= 13 && cy >= 24 && cy <= 25; }
function cellBlocksTank(w, t, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= N || cy >= N) return true;
  const T = w.terrain, c = cellIdx(cx, cy);
  if (inEagle(cx, cy)) return true;
  if (T.steel[c] || brickCell(T, cx, cy)) return true;
  if (T.water[c] && !(t.boats > 0)) return true;
  return false;
}
function markCell(w, cx, cy) { if (w.changed.length < 4000) w.changed.push(cy * N + cx); else w.changedAll = true; w.terrainVersion++; }
function clearArea(w, x, y, size) {   // 出生时把出生点清成空地（原版 $E3B2）
  const T = w.terrain;
  for (let cy = y >> 3; cy < (y + size) >> 3; cy++) for (let cx = x >> 3; cx < (x + size) >> 3; cx++) {
    const c = cellIdx(cx, cy);
    if (brickCell(T, cx, cy) || T.steel[c] || T.water[c] || T.forest[c] || T.ice[c]) { setBrickCell(T, cx, cy, 0); T.steel[c] = T.water[c] = T.forest[c] = T.ice[c] = 0; markCell(w, cx, cy); }
  }
}

// ---------------- 坦克 ----------------
function makeTank(w, team, type, x, y, size = 16) {
  const t = {
    id: w.nextId++, team, type, x, y, size, dir: team === 'player' ? 0 : 2, state: 'spawn', st: 0,
    hp: 1, maxHp: 1, carrier: false, slot: 0, moveAcc: 0, speed: .5, bulletSpeed: 2, power: 0, maxBullets: 1,
    wait: 0, pending: false, moving: false, travel: 0, recoil: 0, hitFlash: 0, shield: 0, boats: 0, stars: 0, cool: 0,
    fireCd: 0, telegraph: 0, attackT: 120, pattern: 0, escorts: 0, dash: 0, slide: 0, invuln: 0, plate: 0, lastFireHeld: false
  };
  return t;
}
function spawnPlayer(w, delay) {
  w.player = null; w.playerSpawnT = delay + 37;   // 玩家出生星星约 37 帧
  const p = playerSpawn(w.activeSlot || 0);
  emit(w, 'spawn', { team: 'player', x: p.x + 8, y: p.y + 8 });
}
function activatePlayer(w) {
  const spawn = playerSpawn(w.activeSlot || 0);
  const r = w.run, p = makeTank(w, 'player', 'player', spawn.x, spawn.y);
  p.slot = w.activeSlot || 0;
  clearArea(w, p.x, p.y, 16);
  p.state = 'active'; p.speed = .75; p.stars = r.stars; p.plate = r.plate; p.boats = r.boats;
  p.shield = w.classic ? unitsToFrames(3, w.f) : 180;   // 出生 / 复活自带头盔
  r.hp = 3;
  applyStars(w, p);
  w.player = p;
  emit(w, 'playerSpawn');
}
function applyStars(w, p) {
  const s = p.stars;
  p.bulletSpeed = s >= 1 ? 4 : 2;
  p.maxBullets = s >= 2 ? 2 : 1;
  p.power = s >= 4 ? 2 : s >= 3 ? 1 : 0;
}
function botStats(w, t) {
  const d = w.diff, type = t.type;
  const base = { basic: [.5, 2, 1], fast: [1, 2, 1], power: [.5, 4, 1], armor: [.5, 2, d.armorHp], heavy: [.55, 4, 2], flame: [.45, 2, 4], escort: [.55, 2, 1] }[type] || [.5, 2, 1];
  t.speed = base[0] * d.speed; t.bulletSpeed = base[1] * (w.classic ? 1 : d.bullet); t.hp = t.maxHp = base[2];
  if (type === 'heavy') t.maxBullets = 2;
  if (type === 'flame') t.weapon = 'flame';
}

function updateSpawning(w) {
  if (w.status !== 'play') return;
  if (w.spawnTimer > 0) w.spawnTimer--;
  const slots = w.bots.length;
  if (w.spawnTimer <= 0 && w.rosterIndex < w.roster.length && slots < w.maxBots) {
    const i = w.rosterIndex, type = w.roster[i];
    let x, y, size = 16;
    if (type === 'boss' || type === 'final') { x = 88; y = 0; size = 32; }
    else { const s = BOT_SPAWNS[w.spawnSeq++ % 3]; x = s.x; y = s.y; }   // 原版出生点顺序：中 → 右 → 左
    w.rosterIndex++;
    spawnBot(w, type, x, y, size, w.spec.carriers.includes(i));
    w.spawnTimer = w.spec.spawnInterval;
  }
}
function spawnBot(w, type, x, y, size, carrier, escort = false) {
  const t = makeTank(w, 'bot', type, x, y, size);
  t.slot = 2 + (w.spawnCount++ % 6); t.carrier = carrier; t.escort = escort;
  t.st = type === 'boss' || type === 'final' ? 100 : 56;   // 原版敌军出生星星 56 帧
  t.moveAcc = (t.slot & 1) * .5;
  if (type === 'mini' || type === 'boss' || type === 'final') makeBoss(w, t);
  else botStats(w, t);
  if (carrier && w.powerup) { w.powerup = null; emit(w, 'powerupGone'); }   // 新的红色坦克出场会收走场上的道具
  clearArea(w, x, y, size);
  w.bots.push(t);
  emit(w, 'spawn', { team: 'bot', x: x + size / 2, y: y + size / 2, big: size > 16 });
  return t;
}
function makeBoss(w, t) {
  const spec = w.spec, d = w.diff;
  if (t.type === 'mini') {
    t.kind = spec.miniKind; t.bossName = CHAPTERS[spec.chapter - 1].mini;
    t.hp = t.maxHp = Math.round((10 + spec.chapter * 2) * d.bossHp);
    t.speed = .55 * d.speed; t.bulletSpeed = 2.5 * d.bullet; t.maxBullets = 2; t.attackT = 150;
    if (t.kind === 'flamecar') t.weapon = 'flame';
  } else {
    const tier = spec.bossTier;
    t.tier = tier; t.kind = t.type; t.bossName = t.type === 'final' ? CHAPTERS[9].boss : CHAPTERS[spec.chapter - 1].boss;
    t.model = BOSS_NAMES[tier - 1];
    t.hp = t.maxHp = Math.round((t.type === 'final' ? 140 : 26 + tier * 7) * d.bossHp);
    t.speed = Math.max(.24, .4 - tier * .012) * d.speed; t.bulletSpeed = 3 * d.bullet; t.maxBullets = 6; t.attackT = 160;
    t.barrels = tier <= 2 ? 1 : tier <= 4 ? 2 : tier <= 7 ? 3 : 4;
  }
  w.boss = t;
}

// ---------------- 移动（1px 一步，按格阻挡） ----------------
function rectsOverlap(ax, ay, as, bx, by, bs) { return ax < bx + bs && ax + as > bx && ay < by + bs && ay + as > by; }
function blockedBy(w, t, nx, ny) {
  const s = t.size;
  if (nx < 0 || ny < 0 || nx + s > FIELD || ny + s > FIELD) return 'border';
  // 只检查新进入的一排 8px 格：坦克已在的格子不挡自己（原版按前沿两个角点判定）
  let cells = null;
  if (ny < t.y && (ny >> 3) !== (t.y >> 3)) cells = { y0: ny >> 3, y1: ny >> 3, x0: nx >> 3, x1: (nx + s - 1) >> 3 };
  else if (ny > t.y && ((ny + s - 1) >> 3) !== ((t.y + s - 1) >> 3)) cells = { y0: (ny + s - 1) >> 3, y1: (ny + s - 1) >> 3, x0: nx >> 3, x1: (nx + s - 1) >> 3 };
  else if (nx < t.x && (nx >> 3) !== (t.x >> 3)) cells = { x0: nx >> 3, x1: nx >> 3, y0: ny >> 3, y1: (ny + s - 1) >> 3 };
  else if (nx > t.x && ((nx + s - 1) >> 3) !== ((t.x + s - 1) >> 3)) cells = { x0: (nx + s - 1) >> 3, x1: (nx + s - 1) >> 3, y0: ny >> 3, y1: (ny + s - 1) >> 3 };
  if (cells) for (let cy = cells.y0; cy <= cells.y1; cy++) for (let cx = cells.x0; cx <= cells.x1; cx++) {
    if (!cellBlocksTank(w, t, cx, cy)) continue;
    // 大 Boss 碾碎挡路的砖墙（钢墙、水面、老鹰阵地照样挡住）
    if (t.size > 16 && cy < 21 && brickCell(w.terrain, cx, cy) && !w.terrain.steel[cellIdx(cx, cy)] && !(w.terrain.water[cellIdx(cx, cy)])) { setBrickCell(w.terrain, cx, cy, 0); markCell(w, cx, cy); emit(w, 'crush', { x: cx * 8 + 4, y: cy * 8 + 4 }); continue; }
    return 'wall';
  }
  // 坦克之间互相阻挡；出生星星中和爆炸中的坦克不挡路（原版）；已经重叠时允许分开
  const all = [...playerTanks(w), ...w.bots];
  for (const o of all) {
    if (o === t || o.state !== 'active') continue;
    if (!rectsOverlap(nx, ny, s, o.x, o.y, o.size)) continue;
    if (!rectsOverlap(t.x, t.y, s, o.x, o.y, o.size)) return 'tank';
    const before = Math.abs(t.x + s / 2 - o.x - o.size / 2) + Math.abs(t.y + s / 2 - o.y - o.size / 2), after = Math.abs(nx + s / 2 - o.x - o.size / 2) + Math.abs(ny + s / 2 - o.y - o.size / 2);
    if (after < before) return 'tank';
  }
  return null;
}
function step1(w, t) {
  const nx = t.x + DX[t.dir], ny = t.y + DY[t.dir];
  if (blockedBy(w, t, nx, ny)) return false;
  t.x = nx; t.y = ny; t.travel++;
  return true;
}
function moveTicks(t) {   // 累加小数速度，得到本帧走几步
  t.moveAcc += t.speed; let n = 0;
  while (t.moveAcc >= 1) { t.moveAcc -= 1; n++; }
  return n;
}
const onIce = (w, t) => w.terrain.ice[cellIdx((t.x + 8) >> 3, (t.y + 8) >> 3)] === 1;

// ---------------- 玩家 ----------------
function updatePlayer(w, input) {
  const p = w.player; if (!p || p.state !== 'active') return;
  if (Number.isFinite(input.look)) p.lookHeading = input.look;
  else if (input.look === null) delete p.lookHeading;
  if (p.shield > 0) p.shield--;
  if (p.invuln > 0) p.invuln--;
  p.recoil = Math.max(0, p.recoil - 1); p.hitFlash = Math.max(0, p.hitFlash - 1);
  const controllable = w.status !== 'gameover' && !(w.playerFrozen > 0);
  if (!w.seats && w.playerFrozen > 0) w.playerFrozen--;
  const dir = controllable ? input.dir : -1;
  const turn = want => {
    if (want === p.dir) return;
    if ((want & 1) !== (p.dir & 1)) { p.x = (p.x + 4) & ~7; p.y = (p.y + 4) & ~7; }   // 垂直转向就近对齐 8px；掉头不对齐
    p.dir = want;
  };
  // 冰面：起步后 13 步内不能转向和停下，松手后再滑最多 15 步（原版 $DB94 / $DC52）
  const ice = onIce(w, p);
  if (!ice) p.slide = 0;
  const n = moveTicks(p);
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const want = ice && p.slide >= 16 ? -1 : dir;
    if (want >= 0) {
      turn(want);
      if (ice && p.slide === 0) { p.slide = 28; emit(w, 'slide'); }
      if (step1(w, p)) moved++;
    } else if (ice && p.slide > 0) { p.slide--; if (step1(w, p)) moved++; }
  }
  if (n === 0 && dir >= 0 && !(ice && p.slide >= 16)) turn(dir);   // 不走的那一帧也立刻转向，手感更跟手
  p.moving = moved > 0 || (n === 0 && p.moving && (dir >= 0 || p.slide > 0));
  if (p.cool > 0) p.cool--;
  if (controllable) {
    const press = input.firePressed, hold = w.rules.autofire && input.fire && p.cool <= 0;
    if (press || hold) { if (fire(w, p)) p.cool = 12; }
  }
  // 拾取道具（中心距离 |d| < 12）
  const pu = w.powerup;
  if (pu && Math.abs(pu.x + 8 - p.x - 8) < 12 && Math.abs(pu.y + 8 - p.y - 8) < 12) { w.powerup = null; applyPowerup(w, pu.type, pu); }
  for (let i = w.items.length - 1; i >= 0; i--) {
    const it = w.items[i];
    if (Math.abs(it.x - p.x - 8) >= 12 || Math.abs(it.y - p.y - 8) >= 12) continue;
    if (it.type === 'repair') {
      if (w.run.hp >= 3 && w.classic) continue;
      const repaired = w.run.hp < 3;
      if (repaired) { w.run.hp = 3; w.run.stats.repairs++; }
      emit(w, 'repair', { x: it.x, y: it.y, repaired });
    }
    else { addScore(w, 500, it.x, it.y); emit(w, 'medal', { x: it.x, y: it.y }); }
    w.items.splice(i, 1);
  }
}

// ---------------- 敌军 AI ----------------
function decide(w, t) {
  const S = w.spec.spawnInterval, k = (w.t >> 6) & 255, R = w.rng;
  const hunt = w.diff.hunt;   // 魔改：越往后越早开始追玩家、攻老鹰
  let tx = null, ty = null;
  if (k > Math.floor(S / 4 / hunt)) { tx = 96; ty = 192; }
  else if (k > Math.floor(S / 8 / hunt)) { const p = targetPlayer(w, t); if (p) { tx = p.x; ty = p.y; } }
  if (tx === null) { t.dir = Math.floor(R() * 4); return; }
  const dx = tx - t.x, dy = ty - t.y;
  if (R() < .5) t.dir = dx !== 0 ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  else t.dir = dy !== 0 ? (dy > 0 ? 2 : 0) : (dx > 0 ? 1 : 3);
}
function botMoveTick(w, t) {
  const R = w.rng, aligned = (t.x & 7) === 0 && (t.y & 7) === 0;
  if (t.wait > 0) { t.wait--; return; }
  if (t.pending) { t.pending = false; if (R() < .5) decide(w, t); else t.dir = (t.dir + (R() < .5 ? 1 : 3)) % 4; }
  else if (aligned && R() < 1 / 16) decide(w, t);
  if (step1(w, t)) { t.moving = true; return; }
  t.moving = false;
  if (R() < .75) {
    t.wait = 2;
    // 魔改：被砖墙挡住时更爱开炮开路
    if (!w.classic && R() < .25) t.wantFire = true;
  } else { t.dir = (t.dir + 2) % 4; if (aligned) t.pending = true; }
}
function updateBot(w, t) {
  t.recoil = Math.max(0, t.recoil - 1); t.hitFlash = Math.max(0, t.hitFlash - 1);
  if (t.shield > 0) t.shield--;
  if (t.state === 'spawn') { if (--t.st <= 0) { t.state = 'active'; if (t.type === 'boss' || t.type === 'final' || t.type === 'mini') emit(w, 'bossSpawn', { name: t.bossName, kind: t.kind, tip: t.type === 'mini' ? MINI_INFO[t.kind].tip : '背后装甲最薄：从后面击中伤害 ×2' }); } return; }
  if (t.state === 'boom') { if (--t.st <= 0) { t.state = 'gone'; w.remaining -= t.escort ? 0 : 1; } return; }
  if (w.freeze > 0) { t.moving = false; return; }
  if (t.size > 16 || t.type === 'mini') { bossBrain(w, t); return; }
  const n = moveTicks(t);
  for (let k = 0; k < n; k++) botMoveTick(w, t);
  // 原版开火：自己没有子弹在场时每帧 1/32
  const div = w.classic ? 32 : t.type === 'heavy' ? w.diff.fireDiv * .6 : w.diff.fireDiv;
  if (t.wantFire || Math.floor(w.rng() * div) === 0) { t.wantFire = false; fire(w, t); }
}

// ---------------- Boss ----------------
function alignedWithPlayer(w, t, tol = 6) {
  const p = targetPlayer(w, t); if (!p) return -1;
  const cx = t.x + t.size / 2, cy = t.y + t.size / 2, px = p.x + 8, py = p.y + 8;
  if (Math.abs(cx - px) <= tol + t.size / 2 - 8) return py < cy ? 0 : 2;
  if (Math.abs(cy - py) <= tol + t.size / 2 - 8) return px > cx ? 1 : 3;
  return -1;
}
function bossBrain(w, t) {
  const R = w.rng, p = targetPlayer(w, t), big = t.size > 16, enraged = t.hp <= t.maxHp / 2;
  if (enraged && !t.enraged) { t.enraged = true; emit(w, 'enrage', { name: t.bossName }); }
  // 移动：小 Boss 追玩家；大 Boss 在上半场横移对准玩家所在列，偶尔下压
  if (t.dash > 0) t.dash--;
  const spd = t.speed * (t.dash > 0 ? 3 : 1) * (enraged ? 1.3 : 1);
  t.moveAcc += spd;
  if (t.telegraph <= 0) {
    while (t.moveAcc >= 1) {
      t.moveAcc -= 1;
      if (t.wait > 0) { t.wait--; continue; }
      if (big) {
        if (t.aiT === undefined || --t.aiT <= 0) {
          t.aiT = 60 + Math.floor(R() * 80);
          const px = p ? p.x + 8 : 104, cx = t.x + 16;
          if (R() < .6 && Math.abs(px - cx) > 6) t.dir = px > cx ? 1 : 3;
          else t.dir = t.y > 96 ? 0 : R() < .5 ? 2 : Math.floor(R() * 4);
        }
        if (t.y >= 104 && t.dir === 2) t.dir = 0;
        if (!step1(w, t)) { t.dir = Math.floor(R() * 4); t.wait = 4; }
      } else {
        const aligned = (t.x & 7) === 0 && (t.y & 7) === 0;
        if (aligned && (R() < 1 / 10 || t.blocked)) {
          t.blocked = false;
          const dir = alignedWithPlayer(w, t, 2);
          if (dir >= 0 && R() < .7) t.dir = dir;
          else if (p && R() < .7) { const dx = p.x - t.x, dy = p.y - t.y; t.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); }
          else t.dir = Math.floor(R() * 4);
        }
        if (step1(w, t)) t.moving = true; else { t.moving = false; t.blocked = true; if (R() < .3) t.wantFire = true; }
      }
    }
  } else t.moving = false;
  // 普通炮击
  const div = Math.max(10, w.diff.fireDiv * (big ? .9 : .7));
  if (t.wantFire || Math.floor(R() * div) === 0) {
    t.wantFire = false;
    let shells = 0; for (const b of w.bullets) if (b.owner === t && b.kind === 'shell') shells++;
    if (t.kind !== 'sniper' && t.kind !== 'twin' && shells < (enraged ? 2 : 1)) fire(w, t, { force: true, kind: 'shell' });
  }
  // 招式：先预警（炮口发光）再出手
  if (t.telegraph > 0) { if (--t.telegraph === 0) bossAttack(w, t); return; }
  if (--t.attackT > 0) return;
  const kinds = big ? bossPatterns(t) : [t.kind];
  t.nextAttack = kinds[t.pattern++ % kinds.length];
  if (t.nextAttack === 'sniper') {
    const dir = alignedWithPlayer(w, t, 3);
    if (dir < 0) { t.attackT = 20; t.pattern--; return; }
    t.dir = dir; w.lasers.push({ owner: t.id, x: t.x + 8, y: t.y + 8, dir, t: 50 });
  }
  t.telegraph = t.nextAttack === 'sniper' ? 50 : big ? 42 : 36;
  emit(w, 'telegraph', { x: t.x + t.size / 2, y: t.y + t.size / 2, kind: t.nextAttack });
}
function bossPatterns(t) {
  const list = ['wide'], tier = t.tier;
  if (tier >= 2) list.push('spread');
  if (tier >= 3) list.push('barrage');
  if (tier >= 4) list.push('summon');
  if (tier >= 5) list.push('mortar');
  if (tier >= 6 || tier % 2 === 0) list.push('flamewide');
  return list;
}
function bossAttack(w, t) {
  const kind = t.nextAttack, R = w.rng, enraged = t.enraged;
  t.attackT = Math.round((t.size > 16 ? 170 : 160) * (enraged ? .62 : 1) * (1 - Math.min(.3, w.diff.tier / 600)));
  emit(w, 'bossAttack', { kind, x: t.x + t.size / 2, y: t.y + t.size / 2 });
  if (kind === 'flamecar') fire(w, t, { kind: 'flame', half: 8, force: true });
  else if (kind === 'twin') {
    fire(w, t, { offset: -5, force: true }); fire(w, t, { offset: 5, force: true });
    if (t.pattern % 3 === 0) { t.dash = 50; emit(w, 'dash', { x: t.x + 8, y: t.y + 8 }); }
  } else if (kind === 'miner') {
    w.mines.push({ x: t.x + 8, y: t.y + 8, t: 0, life: 420, owner: t.id });
    emit(w, 'mine', { x: t.x + 8, y: t.y + 8 });
    t.attackT = Math.round(t.attackT * .7);
  } else if (kind === 'commander') {
    if (t.escorts < 2) summon(w, t, 2 - t.escorts);
    t.attackT = 300;
  } else if (kind === 'sniper') {
    fire(w, t, { kind: 'pierce', speed: 6, force: true });
    w.lasers = w.lasers.filter(l => l.owner !== t.id);
  } else if (kind === 'wide') fire(w, t, { kind: 'wide', half: 16, speed: 3, force: true });
  else if (kind === 'flamewide') fire(w, t, { kind: 'flame', half: 16, speed: 2.5, force: true });
  else if (kind === 'spread') { const d0 = t.dir; for (const d of [d0, (d0 + 1) % 4, (d0 + 3) % 4]) fire(w, t, { dir: d, force: true }); }
  else if (kind === 'barrage') { t.burst = t.barrels + 1; t.burstT = 0; }
  else if (kind === 'summon') summon(w, t, enraged ? 3 : 2);
  else if (kind === 'mortar') {
    const p = targetPlayer(w, t), spots = [];
    if (p) spots.push({ x: p.x + 8, y: p.y + 8 });
    for (let i = spots.length; i < (enraged ? 5 : 3); i++) spots.push({ x: 16 + Math.floor(R() * 176), y: 40 + Math.floor(R() * 150) });
    for (const s of spots) w.mortars.push({ x: s.x, y: s.y, t: 75 });
    emit(w, 'mortarMark', { spots });
  }
}
function summon(w, t, n) {
  for (let i = 0; i < n; i++) {
    const s = BOT_SPAWNS[(w.spawnSeq + i) % 3];
    if (w.bots.some(o => o.state !== 'gone' && rectsOverlap(o.x, o.y, o.size, s.x, s.y, 16))) continue;
    const e = spawnBot(w, 'escort', s.x, s.y, 16, false, true);
    e.leader = t.id; t.escorts++;
  }
  emit(w, 'summon', { x: t.x + t.size / 2, y: t.y + t.size / 2 });
}
function updateBursts(w) {
  for (const t of w.bots) if (t.burst > 0 && t.state === 'active') {
    if (--t.burstT <= 0) { t.burstT = 9; t.burst--; const k = t.burst % Math.max(1, t.barrels); fire(w, t, { offset: (k - (t.barrels - 1) / 2) * 8, force: true }); }
  }
}

// ---------------- 炮弹 ----------------
function liveBullets(w, t) { let n = 0; for (const b of w.bullets) if (b.owner === t) n++; return n; }
export function fire(w, t, o = {}) {
  if (t.state !== 'active') return false;
  if (!o.force && liveBullets(w, t) >= t.maxBullets) return false;
  const heading = t.team === 'player' ? t.lookHeading : undefined;
  const dir = heading === undefined ? (o.dir ?? t.dir) : ((Math.round(-heading / (Math.PI / 2)) % 4) + 4) % 4, s = t.size, cx = t.x + s / 2, cy = t.y + s / 2;
  const off = o.offset || 0;
  const vx = heading === undefined ? DX[dir] : -Math.sin(heading), vy = heading === undefined ? DY[dir] : -Math.cos(heading);
  const x = cx + vx * s / 2 + (dir & 1 ? 0 : off), y = cy + vy * s / 2 + (dir & 1 ? off : 0);
  const kind = o.kind || (t.weapon === 'flame' ? 'flame' : 'shell');
  const b = {
    id: w.nextId++, owner: t, team: t.team, x, y, dir, vx, vy, heading, speed: o.speed || (kind === 'flame' ? 2 : t.bulletSpeed), power: t.power, kind,
    half: o.half || (kind === 'flame' ? 6 : 0), state: 'fly', st: 0, age: 0, pierce: kind === 'pierce'
  };
  w.bullets.push(b);
  if (t.team === 'player') w.playerShots = (w.playerShots || 0) + 1;
  t.recoil = 7;
  emit(w, 'fire', { team: t.team, x, y, dir, big: kind !== 'shell' || s > 16, kind });
  return true;
}
// 地形探测点：在 52×52 砖块 / 26×26 格上查
function probe(w, px, py) {
  if (px < 0 || py < 0 || px >= FIELD || py >= FIELD) return 'border';
  const cx = px >> 3, cy = py >> 3;
  if (inEagle(cx, cy)) return 'eagle';
  if (w.terrain.steel[cellIdx(cx, cy)]) return 'steel';
  if (w.terrain.brick[(py >> 2) * Q + (px >> 2)]) return 'brick';
  return null;
}
function clearRowQuads(w, px, py, vertical, out) {   // 清掉该 8px 格里同一排的两个 4px 砖块
  const cx = px >> 3, cy = py >> 3, T = w.terrain;
  if (vertical) { const qy = py >> 2; for (const qx of [cx * 2, cx * 2 + 1]) if (T.brick[qy * Q + qx]) { T.brick[qy * Q + qx] = 0; out.push({ qx, qy }); } }
  else { const qx = px >> 2; for (const qy of [cy * 2, cy * 2 + 1]) if (T.brick[qy * Q + qx]) { T.brick[qy * Q + qx] = 0; out.push({ qx, qy }); } }
  markCell(w, cx, cy);
}
function clearWholeCell(w, px, py, out, steelToo) {
  const cx = px >> 3, cy = py >> 3, T = w.terrain, c = cellIdx(cx, cy);
  let any = false;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = (cy * 2 + dy) * Q + cx * 2 + dx; if (T.brick[i]) { T.brick[i] = 0; out.push({ qx: cx * 2 + dx, qy: cy * 2 + dy }); any = true; } }
  if (steelToo && T.steel[c]) { T.steel[c] = 0; out.push({ cx, cy, steel: true }); any = true; }
  if (any) markCell(w, cx, cy);
  return any;
}
// 返回 true 表示炮弹停下
function bulletTerrain(w, b) {
  const vertical = (b.dir & 1) === 0, broken = [];
  if (b.kind === 'shell') {
    // 原版：主探测点 A 与偏 1px 的 C；A / C 清掉砖时把同 tile 同一排另一块也清掉 → 16px 宽 × 4px 深
    const A = [b.x, b.y], C = vertical ? [b.x - 1, b.y] : [b.x, b.y - 1];
    const ta = probe(w, A[0], A[1]), tc = probe(w, C[0], C[1]);
    if (ta === 'eagle' || tc === 'eagle') { hitEagle(w, b); return true; }
    if (!ta && !tc) return false;
    let clank = false;
    for (const [pt, ty] of [[A, ta], [C, tc]]) {
      if (!ty) continue;
      if (ty === 'border') { clank = true; continue; }
      if (b.power >= 1) { clearWholeCell(w, pt[0], pt[1], broken, true); continue; }   // 三星：整格清除，砖钢都能打穿
      if (ty === 'brick') clearRowQuads(w, pt[0], pt[1], vertical, broken);
      else clank = true;
    }
    if (b.power >= 2) burnForest(w, b, broken);
    if (broken.length) emit(w, 'brick', { cells: broken, x: b.x, y: b.y, dir: b.dir, team: b.team, steel: broken.some(c => c.steel) });
    else if (clank) emit(w, ta === 'border' || tc === 'border' ? 'border' : 'steel', { x: b.x, y: b.y, team: b.team });
    return true;
  }
  // 宽弹 / 火焰弹 / 穿甲弹（魔改 Boss）：沿横截面每 4px 探测一次
  const pts = [];
  for (let o = -b.half; o <= b.half; o += 4) pts.push(vertical ? [b.x + o - (o === b.half ? 1 : 0), b.y] : [b.x, b.y + o - (o === b.half ? 1 : 0)]);
  if (!b.half) pts.push([b.x, b.y]);
  let stop = false, hitSteel = false;
  const isFort = (px, py) => BASE_WALL.some(([x, y]) => x === px >> 3 && y === py >> 3);
  for (const [px, py] of pts) {
    let ty = probe(w, px, py);
    // Boss 的宽弹 / 火焰弹 / 穿甲弹打到老鹰围墙或老鹰时只炸开不破坏：基地只能被普通炮弹慢慢削开，留出防守时间
    if (ty === 'eagle' || (ty === 'brick' && isFort(px, py))) ty = 'steel';
    if (b.kind === 'flame' && px >= 0 && py >= 0 && px < FIELD && py < FIELD) { const c = cellIdx(px >> 3, py >> 3); if (w.terrain.forest[c]) { w.terrain.forest[c] = 0; markCell(w, px >> 3, py >> 3); broken.push({ cx: px >> 3, cy: py >> 3, forest: true }); } }
    if (!ty) continue;
    if (ty === 'eagle') { hitEagle(w, b); return true; }
    if (ty === 'brick') { clearWholeCell(w, px, py, broken, false); if (!b.pierce) stop = true; }
    else { stop = true; hitSteel = true; }
  }
  if (broken.length) emit(w, 'brick', { cells: broken, x: b.x, y: b.y, dir: b.dir, team: b.team, flame: b.kind === 'flame' });
  if (stop && hitSteel && !broken.length) emit(w, 'steel', { x: b.x, y: b.y, team: b.team });
  return stop;
}
function burnForest(w, b, out) {
  const vertical = (b.dir & 1) === 0;
  for (const o of [-4, 3]) {
    const px = vertical ? b.x + o : b.x, py = vertical ? b.y : b.y + o;
    if (px < 0 || py < 0 || px >= FIELD || py >= FIELD) continue;
    const c = cellIdx(px >> 3, py >> 3);
    if (w.terrain.forest[c]) { w.terrain.forest[c] = 0; markCell(w, px >> 3, py >> 3); out.push({ cx: px >> 3, cy: py >> 3, forest: true }); }
  }
}
function hitEagle(w, b) {
  if (!w.eagle.alive) { emit(w, 'steel', { x: b.x, y: b.y, team: b.team }); return; }
  if (w.run.demo && b.team === 'bot') { emit(w, 'deflect', { x: b.x, y: b.y }); return; }   // 演示模式：老鹰也不会被敌军打掉
  w.eagle.alive = false; w.eagle.boom = 39; w.eagleBy = b.team;
  emit(w, 'eagle', { by: b.team });
}
function updateBullets(w) {
  for (const b of w.bullets) {
    if (b.state === 'boom') { b.st--; continue; }
    b.age++;
    let dist = b.speed;
    while (dist > 0 && b.state === 'fly') {
      const st = Math.min(2, dist); dist -= st;
      b.x += (b.vx ?? DX[b.dir]) * st; b.y += (b.vy ?? DY[b.dir]) * st;
      if (bulletTerrain(w, b)) { b.state = 'boom'; b.st = 9; emit(w, 'pop', { x: b.x, y: b.y, kind: b.kind }); break; }
      if (bulletTanks(w, b)) break;
    }
  }
  // 子弹互撞：至少一方是玩家子弹，|dx|<6 且 |dy|<6，两颗都直接消失
  for (const a of w.bullets) {
    if (a.state !== 'fly' || a.team !== 'player') continue;
    for (const c of w.bullets) {
      if (c === a || c.state !== 'fly' || c.owner === a.owner) continue;
      if (w.seats && c.team === 'player') continue;
      const r = 6 + (c.half || 0);
      if (Math.abs(a.x - c.x) < r && Math.abs(a.y - c.y) < r) {
        a.state = 'gone';
        // 魔改 Boss 的宽弹要打好几发才能抵消
        if (c.half) { c.blockHp = (c.blockHp ?? (c.half >= 16 ? 4 : 2)) - 1; if (c.blockHp > 0) { emit(w, 'puff', { x: a.x, y: a.y }); break; } }
        c.state = 'gone'; emit(w, 'puff', { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }); break;
      }
    }
  }
  w.bullets = w.bullets.filter(b => b.state === 'fly' || (b.state === 'boom' && b.st > 0));
}
function bulletTanks(w, b) {
  if (b.team === 'player') {
    for (const t of w.bots) {
      if (t.state !== 'active') continue;
      const r = t.size / 2 + 2 + (b.half || 0);
      if (Math.abs(b.x - t.x - t.size / 2) >= r || Math.abs(b.y - t.y - t.size / 2) >= r) continue;
      b.state = 'boom'; b.st = 9;
      hitBot(w, t, b);
      return true;
    }
    return false;
  }
  let hit = false;
  forPlayers(w, () => {
    const p = w.player, r = 10 + (b.half || 0);
    if (hit || !p || p.state !== 'active' || Math.abs(b.x - p.x - 8) >= r || Math.abs(b.y - p.y - 8) >= r) return;
    hit = true;
    if (p.shield > 0 || w.run.demo || p.invuln > 0) { b.state = 'gone'; emit(w, 'deflect', { x: b.x, y: b.y }); }
    else { b.state = 'boom'; b.st = 9; hurtPlayer(w, 1); }
  });
  return hit;
}
function hitBot(w, t, b) {
  if (t.shield > 0 || (t.kind === 'commander' && t.escorts > 0)) { emit(w, 'deflect', { x: b.x, y: b.y }); return; }
  if (t.carrier) { t.carrier = false; dropPowerup(w); }
  let dmg = 1;
  if (t.size > 16 && b.dir === t.dir) { dmg = 2; if (!w.bossNote) { w.bossNote = true; emit(w, 'weakHit'); } }   // 从背后打：伤害 ×2
  t.hp -= dmg; t.hitFlash = 8;
  if (t.hp > 0) { emit(w, 'armor', { x: b.x, y: b.y, big: t.size > 16 }); return; }
  destroyBot(w, t, false);
}
export function destroyBot(w, t, byGrenade) {
  if (t.state !== 'active' && t.state !== 'spawn') return;
  t.state = 'boom';
  t.st = byGrenade ? 48 : t.type === 'fast' ? 24 : t.size > 16 ? 90 : 48;
  t.carrier = false;
  if (t.leader) { const l = w.bots.find(o => o.id === t.leader); if (l) l.escorts = Math.max(0, l.escorts - 1); }
  const key = t.escort ? 'escort' : t.type;
  if (!byGrenade) {
    w.kills[key] = (w.kills[key] || 0) + 1;
    w.run.stats.kills++;
    const pts = Math.round(SCORE[key] * w.diff.scoreMul / 10) * 10;
    addScore(w, pts);
  }
  emit(w, 'boom', { x: t.x + t.size / 2, y: t.y + t.size / 2, big: true, huge: t.size > 16, team: 'bot', enemyType: t.type });
  if (t === w.boss || t.type === 'mini' || t.size > 16) {
    w.run.stats.bosses++;
    emit(w, 'bossDown', { name: t.bossName, x: t.x + t.size / 2, y: t.y + t.size / 2 });
    if (t.size > 16) for (const o of w.bots) if (o !== t && o.escort && (o.state === 'active' || o.state === 'spawn')) destroyBot(w, o, true);
    if (w.boss === t) w.boss = null;
  }
  // 固定补给：每关第 7、14 辆被击毁的敌军留下修理包（经典一发耐久时换成 500 分奖章）
  if (!t.escort) {
    w.killOrder++;
    if (w.killOrder === 7 || w.killOrder === 14) {
      const type = w.run.armor === 'std' ? 'repair' : 'medal';
      if (w.run.armor === 'std' || !w.classic) { w.items.push({ type, x: t.x + 8, y: t.y + 8 }); emit(w, 'item', { kind: type, x: t.x + 8, y: t.y + 8 }); }
    }
  }
}
function addScore(w, pts, x, y, delayed) {
  const r = w.run, before = r.score;
  r.score += pts; w.stageScore += pts;
  if (x !== undefined) emit(w, 'score', { x, y, value: pts, delayed });
  if (r.lives === Infinity || !w.eagle.alive) return;
  // 奖命：经典整局只在首次到 20000 分时 +1；魔改每 20000 分 +1
  const awardLife = () => {
    if (!w.seats) r.lives++;
    else {
      for (const s of w.seats) {
        if (s.slot === w.activeSlot) r.lives++;
        else if (s.state.lives > 0 && s.state.lives !== Infinity) s.state.lives++;
      }
      if (w.activeSlot === undefined) r.lives = w.seats[0].state.lives;
    }
    emit(w, 'life');
  };
  if (w.rules.bonusEvery) { while (r.score >= r.nextBonus) { r.nextBonus += 20000; awardLife(); } }
  else if (!r.bonusGiven && before < 20000 && r.score >= 20000) { r.bonusGiven = true; awardLife(); }
}

// ---------------- 玩家受伤 / 阵亡 ----------------
function hurtPlayer(w, dmg) {
  const p = w.player, r = w.run;
  if (!p || p.state !== 'active') return;
  if (w.run.demo || p.shield > 0 || p.invuln > 0) return;
  if (p.plate > 0) { p.plate--; r.plate = p.plate; p.invuln = 60; p.hitFlash = 10; emit(w, 'plate', { left: p.plate }); return; }
  if (p.boats > 0) {
    p.boats--; r.boats = p.boats; p.invuln = 60; p.hitFlash = 10; emit(w, 'boatHit', { left: p.boats });
    if (p.boats === 0) ejectFromWater(w, p);
    return;
  }
  if (r.armor === 'std' && r.hp > 1) { r.hp -= dmg; r.stats.hits++; p.invuln = 72; p.hitFlash = 10; emit(w, 'hurt', { hp: r.hp }); return; }
  r.hp = 0; r.stats.hits++;
  killPlayer(w);
}
function ejectFromWater(w, p) {
  // 船没了还在水上：移到最近的陆地（2D 版规则）
  const onWater = () => { for (let cy = p.y >> 3; cy <= (p.y + 15) >> 3; cy++) for (let cx = p.x >> 3; cx <= (p.x + 15) >> 3; cx++) if (w.terrain.water[cellIdx(cx, cy)]) return true; return false; };
  if (!onWater()) return;
  let best = null, bd = 1e9;
  for (let y = 0; y <= FIELD - 16; y += 8) for (let x = 0; x <= FIELD - 16; x += 8) {
    let ok = true;
    for (let cy = y >> 3; cy <= (y + 15) >> 3 && ok; cy++) for (let cx = x >> 3; cx <= (x + 15) >> 3 && ok; cx++) if (cellBlocksTank(w, { boats: 0 }, cx, cy)) ok = false;
    if (!ok) continue;
    const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = { x, y }; }
  }
  if (best) { p.x = best.x; p.y = best.y; emit(w, 'eject', { x: p.x + 8, y: p.y + 8 }); }
}
function killPlayer(w) {
  const p = w.player, r = w.run;
  p.state = 'boom'; p.st = 32;
  r.stars = 0; r.plate = 0; r.boats = 0; r.stats.deaths++;
  for (const b of w.bullets) if (b.owner === p && b.state === 'fly') b.state = 'gone';
  emit(w, 'boom', { x: p.x + 8, y: p.y + 8, big: true, team: 'player' });
  emit(w, 'die');
}
function updatePlayerLife(w) {
  const p = w.player;
  if (p && p.state === 'boom' && --p.st <= 0) {
    w.player = null;
    const r = w.run;
    if (r.lives !== Infinity) r.lives--;
    if (r.lives <= 0) { r.lives = 0; if (!w.seats && w.status === 'play') startGameOver(w, 'lives'); }
    else spawnPlayer(w, 0);
  }
  if (!w.player && w.playerSpawnT > 0 && --w.playerSpawnT <= 0 && w.status !== 'over') activatePlayer(w);
}

// ---------------- 道具 ----------------
function dropPowerup(w) {
  const R = w.rng, p = w.player;
  let x, y, tries = 0;
  do { x = POWERUP_SPOTS[Math.floor(R() * 4)]; y = POWERUP_SPOTS[Math.floor(R() * 4)]; tries++; }
  while (tries < 20 && p && Math.abs(x - p.x) < 12 && Math.abs(y - p.y) < 12);
  const table = w.classic ? POWERUP_TABLE : REMIX_POWERUPS;
  const type = table[Math.floor(R() * table.length)];
  w.powerup = { type, x, y, age: 0, life: w.rules.powerupLife };
  emit(w, 'powerup', { kind: type, x: x + 8, y: y + 8 });
}
export function applyPowerup(w, type, at = {}) {
  const r = w.run, p = w.player;
  r.stats.pickups++; w.pickups++;
  addScore(w, 500, (at.x ?? 0) + 8, (at.y ?? 0) + 8);
  emit(w, 'pickup', { kind: type, x: (at.x ?? 0) + 8, y: (at.y ?? 0) + 8 });
  switch (type) {
    case 'helmet': if (p) p.shield = w.rules.stackTimers ? p.shield + 600 : unitsToFrames(10, w.f); emit(w, 'shield'); break;
    case 'timer': w.freeze = w.rules.stackTimers ? w.freeze + 480 : unitsToFrames(10, w.f); emit(w, 'freeze'); break;
    case 'shovel': if (!w.eagle.alive) break; setBaseWall(w, 'steel'); w.shovel = w.rules.stackTimers ? 1080 + 192 : unitsToFrames(20, w.f) + 0; emit(w, 'shovel'); break;
    case 'star': if (p) { const max = w.classic ? 3 : 4; if (p.stars < max) { p.stars++; if (!w.classic && p.stars === 3 && p.plate < 1) p.plate = 1; applyStars(w, p); r.stars = p.stars; r.plate = p.plate; emit(w, 'levelup', { level: p.stars }); } } break;
    case 'gun': if (p) { p.stars = p.stars >= 3 ? 4 : 3; p.plate = Math.min(2, p.plate + 1); applyStars(w, p); r.stars = p.stars; r.plate = p.plate; emit(w, 'levelup', { level: p.stars, gun: true }); } break;
    case 'boat': if (p) { p.boats = Math.min(3, p.boats + 1); r.boats = p.boats; emit(w, 'boat', { layers: p.boats }); } break;
    case 'grenade':
      for (const t of w.bots) {
        if (t.state !== 'active') continue;
        if (t.size > 16 || t.type === 'mini') { const dmg = Math.max(3, Math.ceil(t.maxHp * (t.size > 16 ? .25 : .5))); t.hp -= dmg; t.hitFlash = 12; if (t.hp <= 0) destroyBot(w, t, false); else emit(w, 'armor', { x: t.x + t.size / 2, y: t.y + t.size / 2, big: true }); }
        else destroyBot(w, t, true);
      }
      emit(w, 'grenade'); break;
    case 'tank': if (r.lives !== Infinity) r.lives++; emit(w, 'life'); break;
  }
}
function setBaseWall(w, kind) {
  const T = w.terrain;
  for (const [x, y] of BASE_WALL) {
    const c = cellIdx(x, y);
    setBrickCell(T, x, y, kind === 'brick' ? 1 : 0);
    T.steel[c] = kind === 'steel' ? 1 : 0;
    T.water[c] = T.forest[c] = 0;
    markCell(w, x, y);
  }
}
function updatePowerups(w) {
  const pu = w.powerup;
  if (pu) {
    pu.age++;
    if (pu.life && pu.age >= pu.life) { w.powerup = null; emit(w, 'powerupGone'); }
    // 魔改：道具在场上放 4 秒后，敌军也会抢
    else if (w.rules.enemyLoot && pu.age > 240) {
      for (const t of w.bots) {
        if (t.state !== 'active' || t.size > 16 || t.type === 'mini') continue;
        if (Math.abs(pu.x - t.x) < 12 && Math.abs(pu.y - t.y) < 12) { w.powerup = null; enemyLoot(w, t, pu.type, pu); break; }
      }
    }
  }
  if (w.shovel > 0) {
    w.shovel--;
    if (w.shovel === 0) { if (w.eagle.alive) setBaseWall(w, 'brick'); emit(w, 'shovelEnd'); }
    else if (w.shovel <= 192 && (w.shovel & 15) === 0) setBaseWall(w, (w.shovel >> 4) & 1 ? 'steel' : 'brick');   // 结束前 192 帧：先砖后钢，每 16 帧交替
  }
  if (w.freeze > 0) w.freeze--;
}
function enemyLoot(w, t, type, at) {
  const p = w.player;
  emit(w, 'enemyLoot', { kind: type, x: at.x + 8, y: at.y + 8 });
  switch (type) {
    case 'star': case 'gun': t.stars = (t.stars || 0) + (type === 'gun' ? 2 : 1); t.bulletSpeed = 4; if (t.stars >= 2) t.maxBullets = 2; if (t.stars >= 3) t.power = 1; t.hp++; t.maxHp++; t.elite = true; break;
    case 'boat': t.boats = 3; break;
    case 'grenade': forPlayers(w, () => hurtPlayer(w, 1)); break;
    case 'helmet': for (const o of w.bots) if (o.state === 'active') o.shield = 480; break;
    case 'shovel': if (w.eagle.alive) { w.shovel = 0; setBaseWall(w, 'none'); } break;
    case 'timer': w.playerFrozen = 180; break;
    case 'tank': w.roster.push('basic'); w.remaining++; break;
  }
}
function updateHazards(w) {
  const p = w.player;
  for (let i = w.mines.length - 1; i >= 0; i--) {
    const m = w.mines[i]; m.t++;
    const near = playerTanks(w).some(p => p.state === 'active' && Math.abs(p.x + 8 - m.x) < 14 && Math.abs(p.y + 8 - m.y) < 14 && m.t > 30);
    const shot = w.bullets.some(b => b.team === 'player' && b.state === 'fly' && Math.abs(b.x - m.x) < 6 && Math.abs(b.y - m.y) < 6);
    if (near || shot || m.t >= m.life) { blast(w, m.x, m.y, 16, !shot); w.mines.splice(i, 1); }
  }
  for (let i = w.mortars.length - 1; i >= 0; i--) {
    const m = w.mortars[i];
    if (--m.t <= 0) { blast(w, m.x, m.y, 14, true); w.mortars.splice(i, 1); }
  }
  for (let i = w.lasers.length - 1; i >= 0; i--) if (--w.lasers[i].t <= 0) w.lasers.splice(i, 1);
}
function blast(w, x, y, r, hurts) {
  const broken = [];
  for (let qy = Math.max(0, (y - r) >> 2); qy <= Math.min(Q - 1, (y + r) >> 2); qy++) for (let qx = Math.max(0, (x - r) >> 2); qx <= Math.min(Q - 1, (x + r) >> 2); qx++) {
    if ((qx * 4 + 2 - x) ** 2 + (qy * 4 + 2 - y) ** 2 > r * r) continue;
    if (BASE_WALL.some(([bx, by]) => bx === qx >> 1 && by === qy >> 1)) continue;   // 爆炸不直接拆老鹰围墙
    if (w.terrain.brick[qy * Q + qx]) { w.terrain.brick[qy * Q + qx] = 0; broken.push({ qx, qy }); markCell(w, qx >> 1, qy >> 1); }
  }
  emit(w, 'blast', { x, y, r, cells: broken });
  forPlayers(w, () => { const p = w.player;
    if (hurts && p && p.state === 'active' && Math.abs(p.x + 8 - x) < r + 6 && Math.abs(p.y + 8 - y) < r + 6) hurtPlayer(w, 1);
  });
}

// ---------------- 胜负流程 ----------------
function startGameOver(w, reason) {
  w.status = 'gameover'; w.result = reason; w.endT = 256; w.overRise = 0;
  emit(w, 'gameover', { reason });
}
function updateFlow(w) {
  if (w.eagle.boom > 0 && --w.eagle.boom === 0 && w.status === 'play') startGameOver(w, 'eagle');
  if (w.status === 'play' && w.remaining <= 0 && w.rosterIndex >= w.roster.length) { w.status = 'clearing'; w.endT = 128; emit(w, 'stageClear'); }
  if (w.status === 'clearing' && --w.endT <= 0) { w.status = 'won'; emit(w, 'end', { result: 'won' }); }
  if (w.status === 'gameover') { w.overRise = Math.min(127, w.overRise + 1); if (--w.endT <= 0) { w.status = 'over'; emit(w, 'end', { result: 'lost', reason: w.result }); } }
}

// ---------------- 每帧 ----------------
export function step(w, input = { dir: -1, fire: false, firePressed: false }) {
  if (w.status === 'won' || w.status === 'over') return;
  w.f++; w.t++;
  // 记录上一帧位置，渲染时在两帧之间插值（高刷新率屏幕不抖）
  for (const p of playerTanks(w)) { p.ox = p.x; p.oy = p.y; }
  for (const t of w.bots) { t.ox = t.x; t.oy = t.y; }
  for (const b of w.bullets) { b.ox = b.x; b.oy = b.y; }
  if (w.seats) {
    for (const seat of w.seats) withSeat(w, seat, () => {
      updatePlayerLife(w);
      updatePlayer(w, w.status === 'gameover' ? { dir: -1 } : (input.players?.[seat.slot] || { dir: -1 }));
    });
    w.player = w.seats[0].tank; w.playerSpawnT = w.seats[0].spawnT;
    Object.assign(w.run, w.seats[0].state);
    if (w.playerFrozen > 0) w.playerFrozen--;
    if (w.status === 'play' && w.seats.every(s => s.state.lives <= 0 && !s.tank)) startGameOver(w, 'lives');
  } else { updatePlayerLife(w); updatePlayer(w, w.status === 'gameover' ? { dir: -1 } : input); }
  updateSpawning(w);
  for (const t of w.bots) updateBot(w, t);
  updateBursts(w);
  w.bots = w.bots.filter(t => t.state !== 'gone');
  updateBullets(w);
  updatePowerups(w);
  updateHazards(w);
  updateFlow(w);
}

// 第一人称站着不动时，车头跟着视线转（与行驶转向一样就近对齐 8px）
export function turnPlayer(w, dir) {
  const p = w.player; if (!p || p.state !== 'active' || dir === p.dir || w.status === 'gameover') return;
  if ((dir & 1) !== (p.dir & 1)) { p.x = (p.x + 4) & ~7; p.y = (p.y + 4) & ~7; }
  p.dir = dir;
}

// 测试与 QA 用（玩家界面不可达）
export const qa = { destroyBot, killPlayer, applyPowerup, dropPowerup, hurtPlayer, setBaseWall, startGameOver, spawnBot, step1, blockedBy, probe };
