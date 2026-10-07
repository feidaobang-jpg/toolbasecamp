// 玩法核心：角色、连招、抓投、武器、敌人 AI、卷轴锁屏波次、计时、过场与结算。
// 第一关 Boss 维斯·T 与岩跳龙；第二关三角龙哈克、熟睡的霸王龙希瓦特、步枪偷猎者、链锤兵拉什·T、泥沼减速与 Boss 屠夫。
// 固定 60Hz 逻辑步长；坐标 x = 关卡前进方向，z = 纵深，y = 高度。
import * as THREE from 'three';
import { STEP, store, rand, randRange, chance, pick, clamp, lerp, angDiff, approachAng, faceOf, FACE_RIGHT, FACE_LEFT, reseed, seed } from './core.js';
import { AREAS, ENEMY, ITEMS, HEROES, HALF_W, EDGE, ENTER_DX, STAGES } from './level.js';
import { buildHuman, buildRaptor, buildTrike, buildCar, maceGeo, SPECS, itemMesh, meshFrom, itemGeo, GEO, toonMat } from './models.js';
import { HP, HC, P, mod, sample, lerpPose, walkPose, runPose, applyPose, POSE_LEN, RPOSE, raptorRun, lerpR, applyRaptor, R_LEN } from './anim.js';
import { propMesh } from './world.js';
import A from './audio.js';
import IN from './input.js';

export const G = {
  mode: 'title', t: 0, score: 0, hi: store.get('hi', 50000) | 0, lives: 0, settings: {}, hero: 0,
  area: 0, focusX: 7, lockX: null, wave: 0, waveOn: false, timer: 120, timeScale: 1,
  actors: [], items: [], props: [], projs: [], player: null, boss: null, raptor: null,
  banner: null, toast: null, dialog: null, fade: 0, hurtFx: 0, flash: 0, go: 0,
  events: [], kills: {}, stats: null, script: null, onEnd: null, cont: null, demoUsed: false, ended: false,
  sleeper: null, car: null, carAnim: null, blockers: [], water: null, cleared: [], extraWave: false, later: []
};
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八'];
export const SINK = 0.62;   // 泥沼齐腰：站在水里的角色整体下沉的深度（只影响画面，判定高度不变）
// 0..1：当前区域 x 处的泥沼深浅（水里 1，岸边斜坡渐变到 0）
export function sinkK(x) {
  const w = G.water;
  if (!w) return 0;
  if (x < w.x1) return 1;
  if (x < w.bank) return (w.bank - x) / (w.bank - w.x1);
  return 0;
}
let scene, world, fx, camCtl, nextId = 1, bannerId = 0, toastId = 0;
const GRAV = 24;
const DUR_MUL = { easy: 0.45, std: 0.7, classic: 1.0 };   // 耐久：敌人伤害倍率
export const DUR_NAME = { easy: '宽松', std: '标准', classic: '经典' };

function ev(type, data) { G.events.push(Object.assign({ t: +G.t.toFixed(2), type }, data || {})); if (G.events.length > 400) G.events.shift(); }
function banner(text, sub, dur) { G.banner = { id: ++bannerId, text, sub, until: G.t + (dur || 2) }; }
function toast(text) { G.toast = { id: ++toastId, text }; }
function addScore(n, x, y, z, show) {
  if (!n) return;
  const before = G.score;
  G.score += n;
  if (show !== false && x !== undefined) fx.text(x, y, z, String(n), '#ffffff', 0.55);
  // 原作：50 万、100 万分各奖一条命（经典命数时有效）
  for (const th of [500000, 1000000]) if (before < th && G.score >= th && G.settings.lives === 'classic') { G.lives++; A.play('oneup'); toast('奖励一条命！'); }
}

// ---------- 招式表 ----------
// hits：t0..t1 判定时间、reach 前方距离、r 判定半径、y0..y1 高度、dmg 伤害、kb 受击类型（hit 硬直 / down 击倒 / launch 挑飞）
const H = (t0, t1, reach, r, y0, y1, dmg, kb, pts, sfx, big) => ({ t0, t1, reach, r, y0, y1, dmg, kb, pts, sfx, big });
const MOVES = {
  jab1: { clip: 'jab1', dur: 0.26, cancel: 0.12, lunge: 0.7, hits: [H(0.05, 0.12, 0.8, 0.5, 0.9, 1.75, 5, 'hit', 100, 'punch')] },
  jab2: { clip: 'jab2', dur: 0.28, cancel: 0.13, lunge: 0.7, hits: [H(0.06, 0.13, 0.84, 0.5, 0.9, 1.75, 5, 'hit', 100, 'punch')] },
  hook: { clip: 'hook', dur: 0.32, cancel: 0.16, lunge: 0.9, hits: [H(0.07, 0.16, 0.82, 0.58, 0.9, 1.85, 7, 'hit', 100, 'punch')] },
  kickMid: { clip: 'kickMid', dur: 0.36, cancel: 0.19, lunge: 0.6, hits: [H(0.11, 0.2, 0.98, 0.5, 0.55, 1.45, 7, 'hit', 200, 'kick')] },
  upper: { clip: 'upper', dur: 0.5, lunge: 1.1, hits: [H(0.13, 0.24, 0.8, 0.58, 0.7, 2.1, 12, 'launch', 200, 'punchHeavy', true)] },
  kickHi: { clip: 'kickHi', dur: 0.5, lunge: 0.7, hits: [H(0.14, 0.25, 1.02, 0.55, 0.9, 2.0, 11, 'down', 200, 'kick', true)] },
  kickSide: { clip: 'kickSide', dur: 0.48, lunge: 0.9, hits: [H(0.13, 0.24, 1.08, 0.55, 0.7, 1.7, 11, 'down', 200, 'kick', true)] },
  // 下→上→攻击：独立特殊技，有前摇、判定与收招，不复用普通连击索引。
  risingKick: { clip: 'risingKick', dur: 0.62, lunge: 1.3, hits: [H(0.16, 0.34, 0.95, 0.65, 0.2, 2.3, 20, 'launch', 500, 'kick', true)] },
  flipKick: { clip: 'flipKick', dur: 0.68, lunge: 0.6, hits: [H(0.17, 0.39, 0.9, 0.7, 0.1, 2.5, 19, 'launch', 500, 'kick', true)] },
  rollingElbow: { clip: 'rollingElbow', dur: 0.72, lunge: 3.4, hits: [H(0.2, 0.48, 0.95, 0.65, 0, 1.8, 20, 'launch', 500, 'punchHeavy', true)] },
  rollingJump: { clip: 'rollingJump', dur: 0.78, lunge: 1.8, hits: [H(0.25, 0.58, 1.0, 0.75, 0, 2.5, 24, 'down', 600, 'punchHeavy', true)] },
  // 冲刺攻击（各角色不同）
  slide: { dash: true, dur: 0.62, speed: 7.5, decel: 9, hits: [H(0.04, 0.42, 0.7, 0.62, 0.0, 0.9, 12, 'down', 500, 'kick', true)], pose: 'slide' },
  flyKick: { dash: true, dur: 0.62, speed: 7.2, decel: 3, air: 5.2, hits: [H(0.06, 0.26, 0.9, 0.62, 0.4, 1.7, 8, 'hit', 500, 'kick'), H(0.27, 0.5, 0.9, 0.62, 0.4, 1.7, 8, 'down', 500, 'kick', true)], pose: 'flyKick' },
  kneeFly: { dash: true, dur: 0.56, speed: 6.8, decel: 4, air: 4.6, hits: [H(0.05, 0.4, 0.62, 0.6, 0.6, 1.8, 11, 'down', 500, 'kick', true)], pose: 'kneeFly' },
  tackle: { dash: true, dur: 0.6, speed: 6.6, decel: 6, hits: [H(0.04, 0.42, 0.75, 0.66, 0.4, 1.9, 14, 'down', 500, 'punchHeavy', true)], pose: 'tackle' },
  mega: { dur: 0.62, invul: true, hits: [H(0.1, 0.42, 0, 2.1, 0.0, 2.2, 18, 'down', 0, 'punchHeavy', true)] },
  knee: { clip: 'knee', dur: 0.24, hits: [] },
  // 武器
  swing: { clip: 'swing', dur: 0.42, lunge: 0.4, hits: [H(0.13, 0.24, 1.15, 0.6, 0.6, 1.9, 12, 'down', 400, 'punchHeavy', true)] },
  swordSlash: { clip: 'slash', dur: 0.44, lunge: 0.6, hits: [H(0.14, 0.27, 1.25, 0.64, 0.5, 2.0, 17, 'down', 400, 'slash', true)] },
  stab: { clip: 'jab2', dur: 0.3, lunge: 0.5, hits: [H(0.06, 0.14, 0.95, 0.5, 0.8, 1.7, 10, 'hit', 400, 'slash')] }
};
// 敌人招式：windup 前摇（摆出蓄力姿势），再播动作；判定时间为绝对时间
const EM = {
  punch: { clip: 'jab2', dur: 0.6, windup: 0.24, wind: 'guard2', hits: [H(0.29, 0.37, 0.95, 0.5, 0.9, 1.75, 1, 'hit', 0, 'punch')] },
  punch2: { clip: 'jab1', dur: 0.42, windup: 0.08, hits: [H(0.13, 0.2, 0.95, 0.5, 0.9, 1.75, 1, 'hit', 0, 'punch')] },
  kick: { clip: 'kickMid', dur: 0.66, windup: 0.26, wind: 'guard2', hits: [H(0.37, 0.46, 1.0, 0.5, 0.5, 1.4, 1.3, 'down', 0, 'kick')] },
  slash: { clip: 'slash', dur: 0.85, windup: 0.3, wind: 'slash0', hits: [H(0.42, 0.54, 1.3, 0.62, 0.6, 1.9, 1, 'down', 0, 'slash')] },
  eSwing: { clip: 'swing', dur: 0.8, windup: 0.3, wind: 'swing0', hits: [H(0.42, 0.54, 1.2, 0.6, 0.6, 1.9, 1.5, 'down', 0, 'punchHeavy')] },
  fatPunch: { clip: 'hook', dur: 0.7, windup: 0.3, wind: 'guard2', hits: [H(0.37, 0.47, 1.05, 0.62, 0.8, 1.8, 1, 'hit', 0, 'punchHeavy')] },
  vJab: { clip: 'jab1', dur: 0.3, windup: 0.06, hits: [H(0.1, 0.17, 1.0, 0.5, 0.9, 1.9, 1, 'hit', 0, 'punch')] },
  vJab2: { clip: 'jab2', dur: 0.3, windup: 0.04, hits: [H(0.09, 0.16, 1.0, 0.5, 0.9, 1.9, 1, 'hit', 0, 'punch')] },
  vLong: { clip: 'longPunch', dur: 0.85, windup: 0.12, hits: [H(0.46, 0.6, 1.95, 0.55, 0.9, 1.9, 1.75, 'down', 0, 'punchHeavy', true)] },
  // 第二关
  butt: { clip: 'swing', dur: 0.78, windup: 0.3, wind: 'swing0', hits: [H(0.42, 0.54, 1.15, 0.6, 0.6, 1.9, 1.3, 'down', 0, 'punchHeavy')] },   // 步枪枪托
  bSlash: { clip: 'slash', dur: 0.62, windup: 0.2, wind: 'slash0', hits: [H(0.3, 0.42, 1.35, 0.66, 0.5, 2.1, 1.3, 'hit', 0, 'slash')] },   // 屠夫右手刀
  bSlash2: { clip: 'slashL', dur: 0.66, windup: 0.06, wind: 'slash0L', hits: [H(0.18, 0.3, 1.4, 0.7, 0.5, 2.1, 1.5, 'down', 0, 'slash', true)] }   // 接左手刀
};

// ---------- 初始化 ----------
export function init(sc, w, f, cam) { scene = sc; world = w; fx = f; camCtl = cam; }
export const HERO_DATA = HEROES;
export const player = () => G.player;

function heroStats(h) {
  return { walk: 2.65 + h.speed * 0.24, run: 4.9 + h.speed * 0.42, dmg: 0.7 + h.power * 0.12, rec: 1.12 - h.skill * 0.04 };
}

// ---------- 角色创建 ----------
const blobGeo = new THREE.CircleGeometry(0.42, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
function makeActor(type, side, opts) {
  const a = {
    id: nextId++, type, side, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, face: FACE_LEFT, alive: true,
    state: 'idle', st: 0, sub: {}, invul: 0, flash: 0, hitstop: 0, stun: 0, stunT: 0, removeMe: false,
    pose: new Float32Array(POSE_LEN), walkPh: 0, move: null, weapon: null, grab: null, grabbedBy: null,
    token: false, cd: rand() * 0.6, radius: 0.32, height: 1.8, lastHitBy: null
  };
  Object.assign(a, opts || {});
  if (type === 'raptor' || type === 'shivat') {
    const trex = type === 'shivat';
    a.model = buildRaptor(trex ? 'trex' : undefined); a.isRaptor = true; a.isDino = true; a.pose = new Float32Array(R_LEN); a.pose.set(trex ? RPOSE.sleep : RPOSE.idle);
    a.radius = trex ? 1.05 : 0.5; a.height = trex ? 3.1 : 1.5;
  } else if (type === 'hack') {
    a.model = buildTrike(); a.isTrike = true; a.isDino = true; a.wild = true; a.radius = 0.78; a.height = 1.7;
  } else {
    a.model = buildHuman(SPECS[type]); a.pose.set(HP.guard); a.height = a.model.H * 0.95;
    if (SPECS[type] && SPECS[type].build === 'fat') a.radius = 0.45;
    if (type === 'vice' || type === 'mess' || type === 'lash') a.radius = 0.42;
    if (type === 'butcher') a.radius = 0.52;
  }
  a.blob = new THREE.Mesh(blobGeo, blobMat); a.blob.rotation.x = -Math.PI / 2; a.blob.renderOrder = 1;
  a.blob.scale.setScalar(a.radius / 0.32 * 0.85);
  scene.add(a.model.root, a.blob);
  G.actors.push(a);
  return a;
}
function removeActor(a) {
  scene.remove(a.model.root, a.blob);
  if (a.ball) scene.remove(a.ball, a.rope);
  if (a.model.mat) a.model.mat.dispose();
  a.removed = true;
}
function spawnEnemy(type, x, z, opts) {
  const def = ENEMY[type];
  const e = makeActor(type, 'enemy', { def, x, z, hp: def.hp, maxHp: def.hp, face: x > G.player.x ? FACE_LEFT : FACE_RIGHT });
  Object.assign(e, opts || {});
  if (def.knife) e.weapon = { kind: 'knife', ammo: 1 };
  if (def.rifle) e.weapon = { kind: 'rifle', ammo: 99 };
  if (opts && opts.weapon) e.weapon = { kind: opts.weapon, ammo: 99 };
  if (e.weapon) attachWeapon(e);
  if (type === 'butcher') { e.swords = 2; attachSwords(e); }
  ev('spawn', { enemy: type, id: e.id, x: +x.toFixed(1), z: +z.toFixed(1) });
  return e;
}
function attachWeapon(a) {
  const g = a.model.bones.grip;
  if (a.wmesh) { g.remove(a.wmesh); a.wmesh = null; }
  if (!a.weapon) return;
  const k = a.weapon.kind;
  const m = meshFrom(itemGeo(k), { thin: true, shadow: false });
  if (k === 'gun') { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, -0.02, 0.04); }
  else if (['shotgun', 'smg', 'bazooka', 'rifle'].includes(k)) { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, 0.05, 0.05); }
  else if (k === 'pipe' || k === 'knife' || k === 'sword') { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, -0.02, 0.0); }
  else { m.position.set(0, -0.04, 0.03); }
  g.add(m); a.wmesh = m;
}
// 枪口（武器模型本地坐标，枪管沿 +Z）：火花、子弹拖光、瞄准闪光都从这里出
const MUZ = { gun: [0, 0, 0.23], smg: [0, 0.01, 0.51], shotgun: [0, 0.02, 0.65], rifle: [0, 0.03, 0.74], bazooka: [0, 0.07, 0.72] };
const BULLET = { gun: { speed: 75, len: 0.55, w: 0.045 }, smg: { speed: 75, len: 0.45, w: 0.04 }, shotgun: { speed: 60, len: 0.32, w: 0.04 }, rifle: { speed: 95, len: 1.0, w: 0.05 } };
const _mz = new THREE.Vector3();
function muzzleOf(a) {
  a.model.root.updateMatrixWorld(true);
  const gm = a.gunMesh && a.gunMesh.visible ? a.gunMesh : a.wmesh, m = MUZ[gm && gm === a.gunMesh ? 'gun' : a.weapon && a.weapon.kind];
  if (gm && m) return gm.localToWorld(_mz.set(m[0], m[1], m[2]));
  return a.model.bones.grip.localToWorld(_mz.set(0, 0, 0.1));
}
// 开枪：伤害照旧在逻辑帧里立即结算；火花和子弹排队，等这一帧摆好开枪姿势、站位朝向都更新后从枪口发出（renderActors 里 flushFx）
// rays：每发子弹 { ang 相对朝向的偏角, dist 从站位量起的飞行距离, y 终点高度（默认与枪口同高）, up 朝天开枪 }
function queueShot(a, rays, opt) { (a.fxQ || (a.fxQ = [])).push(Object.assign({ type: 'shot', rays }, opt)); }
// 子弹飞到才命中：谁中弹、伤害多少在扣扳机时算好，结算（掉血、受击、火花、扬尘）推迟到子弹飞到；换区域时清空
function bulletDelay(kind, along) { return Math.max(0, along - 0.8) / (BULLET[kind] || BULLET.gun).speed; }
function atBullet(d, fn) { if (d <= 0.001) fn(); else G.later.push({ t: G.t + d, fn }); }
function runLater() { const due = G.later.filter(l => l.t <= G.t + 1e-6); if (!due.length) return; G.later = G.later.filter(l => l.t > G.t + 1e-6); for (const l of due) l.fn(); }
function flushFx(a) {
  const q = a.fxQ; a.fxQ = null;
  for (const r of q) {
    const t = muzzleOf(a), x0 = t.x, y0 = t.y, z0 = t.z;
    if (r.type === 'glint') { fx.glint(x0, y0, z0); continue; }
    fx.muzzle(x0, y0, z0, r.big);
    const b = BULLET[r.kind] || BULLET.gun, ends = [];
    for (const ray of r.rays) {
      if (ray.up) { fx.tracer(x0, y0, z0, x0, y0 + ray.dist, z0, b); ends.push([x0, y0 + ray.dist, z0]); continue; }
      const ang = a.face + (ray.ang || 0), dx = Math.sin(ang), dz = Math.cos(ang);
      const L = Math.max(0.3, ray.dist - ((x0 - a.x) * dx + (z0 - a.z) * dz));
      const y1 = ray.y === undefined ? y0 : ray.y;
      fx.tracer(x0, y0, z0, x0 + dx * L, y1, z0 + dz * L, b); ends.push([x0 + dx * L, y1, z0 + dz * L].map(v => +v.toFixed(3)));
    }
    G.lastShot = { id: a.id, kind: r.kind, t: +G.t.toFixed(3), muzzle: [x0, y0, z0].map(v => +v.toFixed(3)), ends };
  }
}
// 维斯拔枪时手里出现左轮（开枪、召唤小弟、开场朝天鸣枪）
function viceGun(v) {
  const on = v.state === 'gun' || v.state === 'summon' || v.sub.pose === 'gunUp';
  if (on && !v.gunMesh) { const m = meshFrom(itemGeo('gun'), { thin: true, shadow: false }); m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, -0.02, 0.04); m.scale.setScalar(1.15); v.model.bones.grip.add(m); v.gunMesh = m; }
  if (v.gunMesh) v.gunMesh.visible = on;
}
// 屠夫双手各一把砍刀；被打倒时掉在地上，可以被玩家捡走，他也会回去捡
function attachSwords(b) {
  if (!b.swordMeshes) {
    b.swordMeshes = ['grip', 'lgrip'].map(k => { const m = meshFrom(itemGeo('sword'), { shadow: false }); m.rotation.set(Math.PI / 2, 0, 0); m.scale.setScalar(1.3); b.model.bones[k].add(m); return m; });
  }
  b.swordMeshes[0].visible = b.swords >= 1; b.swordMeshes[1].visible = b.swords >= 2;
}

// ---------- 新游戏 / 区域 ----------
export function newGame(opts) {
  reseed(opts.seed !== undefined ? opts.seed : (seed + Date.now()) >>> 0);
  clearAll();
  G.settings = { lives: opts.lives || 'inf', dur: opts.dur || 'std', demo: !!opts.demo, hero: opts.hero || 0 };
  G.hero = G.settings.hero;
  G.score = 0; G.lives = G.settings.lives === 'inf' ? Infinity : 3; G.demoUsed = !!opts.demo; G.ended = false;
  G.kills = {}; G.stats = { hits: 0, deaths: 0, food: 0, t0: 0, contCount: 0, maxCombo: 0, damage: 0 };
  G.events = []; G.t = 0; G.frames = 0; G.timeScale = 1; G.slowT = 0; G.cont = null; G.vitality = 0; G.vitalityTotal = 0; G.lastTarget = null; G.cleared = []; G.areaLoaded = false;
  const h = HEROES[G.hero];
  const p = makeActor(h.id, 'player', { hero: h, stats: heroStats(h), hp: 100, maxHp: 100, face: FACE_RIGHT, comboN: 0, lastHitT: -9, radius: 0.34 });
  G.player = p;
  loadArea(opts.area || 0, true);
  ev('start', { hero: h.id, lives: G.settings.lives, dur: G.settings.dur });
}
function clearAll() {
  A.clearEffects();
  for (const a of G.actors) if (!a.removed) removeActor(a);
  G.actors = []; G.player = null; G.boss = null; G.raptor = null;
  for (const it of G.items) scene.remove(it.mesh);
  for (const p of G.props) if (p.mesh) scene.remove(p.mesh);
  for (const pr of G.projs) scene.remove(pr.mesh);
  G.items = []; G.props = []; G.projs = []; G.script = null; G.dialog = null; G.banner = null; G.go = 0; G.fade = 0;
  if (G.chain) { scene.remove(G.chain); G.chain = null; }
  if (G.car) { scene.remove(G.car); G.car = null; }
  G.carAnim = null; G.sleeper = null; G.blockers = []; G.water = null; G.extraWave = false; G.later = [];
  if (fx) fx.clear();
}
function areaMusic() { return G.boss && G.boss.alive ? (G.boss.type === 'butcher' ? 'boss2' : 'boss') : AREAS[G.area].id; }
function loadArea(i, first) {
  const prevStage = G.areaLoaded && AREAS[G.area] ? AREAS[G.area].stage : 0;
  // 清掉上一区域的敌人与物品，保留玩家；还在飞的子弹作废
  G.later = [];
  for (const a of G.actors) if (a !== G.player && !a.removed) removeActor(a);
  G.actors = G.player ? [G.player] : [];
  for (const it of G.items) scene.remove(it.mesh);
  for (const p of G.props) if (p.mesh) scene.remove(p.mesh);
  for (const pr of G.projs) scene.remove(pr.mesh);
  G.items = []; G.props = []; G.projs = []; G.boss = null; G.raptor = null;
  if (G.car) { scene.remove(G.car); G.car = null; }
  G.carAnim = null; G.sleeper = null; G.blockers = []; G.extraWave = false;
  if (G.player && G.player.carryMesh) { scene.remove(G.player.carryMesh); G.player.carryMesh = null; G.player.carryItem = null; }
  G.area = i; G.areaLoaded = true; const AR = AREAS[i];
  G.water = AR.water || null;
  world.setArea(i);
  G.focusX = AR.x0 + HALF_W; G.lockX = null; G.wave = 0; G.waveOn = false; G.pending = []; G.waveEnemies = [];
  G.timer = AR.timer; G.timerShow = 2.5; G.go = 0;
  const p = G.player;
  p.x = AR.start.x; p.z = AR.start.z; p.y = 0; p.vx = p.vy = p.vz = 0; p.face = FACE_RIGHT; setState(p, 'idle');
  for (const pd of AR.props) {
    const big = pd.kind === 'statue', pipes = pd.kind === 'pipes';
    const pr = { kind: pd.kind, x: pd.x, z: pd.z, item: pd.item, points: pd.points || (big ? 1000 : 0), hp: big ? 4 : pipes ? 2 : pd.kind === 'barrel' ? 2 : 3, r: big ? 0.45 : pipes ? 0.5 : 0.36, mesh: propMesh(pd.kind), shake: 0, broken: false };
    pr.mesh.position.set(pd.x, 0, pd.z);
    if (big) pr.mesh.rotation.y = 0;
    scene.add(pr.mesh); G.props.push(pr);
  }
  const W0 = world.area();
  if (W0.doors) W0.doors.forEach(d => { d.open = false; d.k = 0; });
  if (W0.hutDoor) { W0.hutDoor.rotation.set(0, 0, 0); W0.hutDoor.position.set(44.98, 0, -0.68); }
  if (W0.window) { W0.window.glass.visible = true; W0.window.frame.visible = true; }
  if (W0.facadePlanks) W0.facadePlanks.forEach((pk, k) => { pk.visible = true; pk.position.set(-0.96 + k * 0.48, 0, 0); pk.rotation.set(0, 0, 0); });
  const ST = STAGES[AR.stage - 1];
  if (ST.first === i && (first || AR.stage !== prevStage)) banner('第' + CN_NUM[AR.stage] + '关 · ' + ST.name, 'EPISODE ' + AR.stage + ' · ' + ST.en, 2.6);
  else if (AR.id === 'grave') banner('看看这些恐龙尸体！', AR.title, 2.6);   // 原作这一段的画面字幕
  else banner(AR.name, AR.title, 2.2);
  ev('area', { area: AR.id, stage: AR.stage });
  if (AR.sleeper) {
    // 熟睡的霸王龙：不算进波次；被吵醒或被打才会加入战斗
    const sh = makeActor('shivat', 'enemy', { def: ENEMY.shivat, x: AR.sleeper.x, z: AR.sleeper.z, hp: ENEMY.shivat.hp, maxHp: ENEMY.shivat.hp, face: FACE_LEFT, wakeN: 0, cd: 1 });
    setState(sh, 'sleep'); G.sleeper = sh;
  }
  if (i === 0) {
    // 楼顶开场：维斯带着四个手下
    const v = makeActor('vice', 'enemy', { def: ENEMY.vice, x: 12.9, z: 0.5, hp: 400, maxHp: 400, face: FACE_LEFT, cine: true });
    setState(v, 'cut'); v.sub.pose = 'crossArms';
    G.introVice = v;
    G.mode = 'cut';
    triggerWave(0);
    runScript([
      { wait: 0.6 },
      { say: 'vice', text: '你们老是来碍事，我们受够了！', dur: 2.6 },
      { say: 'vice', text: '小的们，给他们点教训！', dur: 2.2 },
      { fn: () => { v.sub.pose = 'gunUp'; A.play('gun'); queueShot(v, [{ up: true, dist: 7 }], { kind: 'gun' }); } },
      { wait: 0.5 },
      { fn: () => { setState(v, 'leave'); v.vy = 9; v.vx = 3.5; v.vz = -2.6; A.play('jump'); } },
      { wait: 0.9 },
      { fn: () => { if (!v.removed) removeActor(v); G.actors = G.actors.filter(a => a !== v); G.introVice = null; for (const e of G.waveEnemies) if (e.state === 'cut') setState(e, 'idle'); G.mode = 'play'; A.music(AR.id); } }
    ]);
  } else if (AR.car) {
    carIntro(AR);
  } else {
    G.mode = 'play';
    A.music(AR.id);
    if (AR.id === 'street') { p.y = 1.6; p.vy = 0; setState(p, 'jump'); p.sub.noAtk = true; p.vx = 2; }
    if (AR.id === 'swamp') { p.y = 2.6; p.vy = 0; setState(p, 'jump'); p.sub.noAtk = true; p.vx = 1.6; }   // 从山崖上跳进泥沼
  }
}
// 第二关开场：凯迪拉克开进森林停下，主角从驾驶座跳出来
function carIntro(AR) {
  const p = G.player, c = buildCar();
  c.rotation.y = Math.PI / 2;   // 车头（模型 +Z）朝前进方向 +X
  c.position.set(AR.car.x - 15, 0, AR.car.z);
  scene.add(c); G.car = c;
  G.carAnim = { t: 0, dur: 2.0, x0: AR.car.x - 15, x1: AR.car.x };
  G.blockers = [{ x: AR.car.x - 1.5, z: AR.car.z, r: 1.0 }, { x: AR.car.x + 0.1, z: AR.car.z, r: 1.0 }, { x: AR.car.x + 1.6, z: AR.car.z, r: 1.0 }];
  G.mode = 'cut';
  setState(p, 'incar');
  A.play('engine');
  const steps = [
    { until: () => !G.carAnim, max: 3.5 },
    { fn: () => { setState(p, 'jump', { noAtk: true }); p.y = 1.0; p.vy = 6.4; const ft = (6.4 + Math.sqrt(6.4 * 6.4 + 2 * GRAV * 1.0)) / GRAV; p.vx = (AR.start.x - p.x) / ft; p.vz = (AR.start.z - p.z) / ft; A.play('jump'); ev('carExit'); } },
    { until: () => p.state !== 'jump', max: 2 },
    { fn: () => { p.vx = p.vz = 0; G.mode = 'play'; A.music(AR.id); } }
  ];
  if (G.fade > 0) steps.unshift({ fade: 0, dur: 0.6 });   // 从上一关淡入（loadArea 里开的脚本会替换掉外层的淡入步骤）
  runScript(steps);
}
function stepCar(dt) {
  const C = G.carAnim, p = G.player;
  C.t += dt;
  const u = Math.min(1, C.t / C.dur), e = 1 - Math.pow(1 - u, 2.4);
  const x = C.x0 + (C.x1 - C.x0) * e;
  G.car.position.x = x;
  const spd = (1 - e) * 9;
  for (const w of G.car.userData.wheels) w.rotation.x += spd * dt / 0.36;
  if (p.state === 'incar') { p.x = x + 0.1; p.z = G.car.position.z - 0.42; p.y = 0.55; p.face = FACE_RIGHT; }
  if (u >= 1) { G.carAnim = null; A.play('brake'); fx.dust(x - 1.6, 0, G.car.position.z + 0.9, 4, 0.5); }
}

// ---------- 状态 ----------
function setState(a, s, data) {
  a.state = s; a.st = 0; a.sub = data || {};
  if (s !== 'attack') a.move = null;
}
function startMove(a, id, move) {
  const m = move || MOVES[id] || EM[id];
  a.move = { id, def: m, t: 0, hit: new Set(), connected: false, next: null };
  a.state = 'attack'; a.st = 0;
  if (m.dash) { a.vx = Math.sin(a.face) * m.speed; a.vz = Math.cos(a.face) * m.speed; if (m.air) { a.vy = m.air; a.y = Math.max(a.y, 0.01); } }
  if (m.invul) a.invul = Math.max(a.invul, m.dur);
}

// ---------- 主更新 ----------
export function update() {
  if (G.slowT > 0) { G.slowT -= STEP; if (G.slowT <= 0 && G.timeScale === 0.3) G.timeScale = 1; }
  const dt = STEP * G.timeScale;
  G.t += dt; G.frames = (G.frames || 0) + 1;
  if (G.mode === 'title') return;
  if (G.banner && G.t > G.banner.until) G.banner = null;
  if (G.script) stepScript(dt);
  if (G.carAnim) stepCar(dt);
  if (G.later.length) runLater();
  if (G.mode === 'cont') { updateContinue(dt); return; }
  // 玩家输入
  const p = G.player;
  if (G.mode === 'play') handleInput(p, dt);
  else IN.flush();
  // 角色
  for (const a of G.actors) {
    if (a.removed) continue;
    if (a.hitstop > 0) { a.hitstop -= dt; if (a.flash > 0) a.flash -= dt * 0.5; continue; }
    a.st += dt;
    if (a.invul > 0) a.invul -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.stunT > 0) { a.stunT -= dt; if (a.stunT <= 0) a.stun = 0; }
    if (a === p) updatePlayer(a, dt);
    else if (a.type === 'shivat') updateShivat(a, dt);
    else if (a.isTrike) updateTrike(a, dt);
    else if (a.isRaptor) updateRaptor(a, dt);
    else if (a.type === 'vice') updateVice(a, dt);
    else if (a.type === 'butcher') updateButcher(a, dt);
    else updateEnemy(a, dt);
    const beforeX=a.x,beforeZ=a.z;
    physics(a, dt);
    if (G.water) waterFx(a, dt);
    if(a===p&&!camCtl.fp()&&['walk','run','carry'].includes(a.state)) {
      const dx=a.x-beforeX,dz=a.z-beforeZ;
      if(Math.hypot(dx,dz)>.0001){delete a.lookHeading;a.face=approachAng(a.face,faceOf(dx,dz),dt*16);}
    }
  }

  separate();
  updateProjectiles(dt);
  updateItems(dt);
  updateProps(dt);
  G.actors = G.actors.filter(a => !a.removed);
  if (G.mode === 'play' || G.mode === 'cut') updateWaves(dt);
  updateCameraFocus(dt);
  if (G.mode === 'play') updateTimer(dt);
  if (G.hurtFx > 0) G.hurtFx = Math.max(0, G.hurtFx - dt * 2.2);
  if (G.go > 0) G.go -= dt;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 3);
  if (G.timerShow > 0) G.timerShow -= dt;
}

// ---------- 玩家输入 ----------
function moveVec() {
  const m = IN.move();
  if (!m.x && !m.y) return { x: 0, z: 0, len: 0, sx: 0, sy: 0 };
  const ax = camCtl.axes();
  let x = ax.right.x * m.x + ax.fwd.x * m.y, z = ax.right.z * m.x + ax.fwd.z * m.y;
  const len = Math.min(1, Math.hypot(m.x, m.y));
  const l = Math.hypot(x, z) || 1;
  return { x: x / l * len, z: z / l * len, len, sx: m.x, sy: m.y };
}
function laneMode() { const pr = camCtl.preset(); return (pr.id === 'side' || pr.id === 'oblique') && Math.abs(camCtl.yawOff) < 0.7; }
let lastJumpT = -9, lastAtkT = -9;
function handleInput(p, dt) {
  const canAct = ['idle', 'walk', 'run'].indexOf(p.state) >= 0;
  // 必杀：J+K 同时按（或 U）
  const atkE = IN.take('atk'), jumpE = IN.take('jump'), megaE = IN.take('mega'), dashE = IN.take('dash');
  if (atkE) lastAtkT = G.t;
  if (jumpE) lastJumpT = G.t;
  const directionalJump = moveVec().len > 0.2;
  const megaNow = megaE || (atkE && jumpE) || (atkE && !directionalJump && G.t - lastJumpT < 0.09 && p.state === 'jump' && p.st < 0.1) || (jumpE && G.t - lastAtkT < 0.09 && p.state === 'attack' && p.st < 0.1 && p.move && !p.move.def.dash);
  if (megaNow && (canAct || p.state === 'attack' || (p.state === 'jump' && p.st < 0.12) || p.state === 'grab' || p.state === 'hurt')) {
    if (p.grab) releaseGrab(p);
    p.y = 0; p.vy = 0; p.vx = p.vz = 0;
    startMove(p, 'mega');
    A.play('mega', 1, p.hero.id); fx.ring(p.x, 0.15, p.z);
    ev('mega');
    return;
  }
  if (atkE?.data?.offensive && canAct && !p.weapon) {
    startMove(p, ['risingKick', 'rollingElbow', 'flipKick', 'rollingJump'][G.hero]);
    ev('offensive', { hero: p.hero.id, move: p.move.id }); return;
  }
  if (!atkE && canAct && p.weapon?.kind === 'smg' && p.weapon.ammo > 0 && IN.down('atk')) { useWeapon(p); return; }
  if (dashE && canAct) { const mv = moveVec(); setState(p, 'run', { dirX: mv.len ? mv.x : Math.sin(p.face), dirZ: mv.len ? mv.z : Math.cos(p.face), tap: true }); }
  if (jumpE) {
    if (canAct) {
      const mv = moveVec(), spd = p.state === 'run' ? p.stats.run : p.stats.walk * 0.95;
      p.vx = mv.x * spd; p.vz = mv.z * spd; p.vy = p.state === 'run' ? 7.4 : 7.8; p.y = 0.01;
      setState(p, 'jump', { run: p.state === 'run' }); A.play('jump');
    } else if (p.state === 'grab') { releaseGrab(p); }
  }
  if (atkE) playerAttack(p);
}
function playerAttack(p) {
  const s = p.state;
  if (s === 'run') { if (p.weapon && ['dynamite', 'grenade', 'knife'].indexOf(p.weapon.kind) >= 0) return useWeapon(p); return startMove(p, p.hero.dash); }
  if (s === 'jump') {
    if (p.sub.atk || p.sub.noAtk) return;
    p.sub.atk = true; p.sub.atkT = p.st;
    const mv = moveVec();
    p.sub.dive = mv.len > 0.3;
    if (p.sub.dive) {
      p.face = faceOf(mv.x, mv.z); p.vx = mv.x / mv.len * 5.8; p.vz = mv.z / mv.len * 5.8;
      p.vy = Math.min(p.vy, -3.5); ev('diveKick');
    }
    p.sub.fly = Math.hypot(p.vx, p.vz) > 1.6;
    A.play('whoosh');
    return;
  }
  if (s === 'grab') return grabStrike(p);
  if (s === 'carry') return throwDrum(p);
  if (s === 'attack' && p.move && !p.move.def.dash && p.move.id !== 'mega') {
    // 连招缓冲：本招打中后可接下一招
    p.move.next = true; return;
  }
  if (['idle', 'walk'].indexOf(s) < 0) return;
  // 脚下有东西且面前没有敌人 → 捡起
  const it = itemUnder(p);
  if (it && !enemyInFront(p, 0.95)) return pickUp(p, it);
  if (p.weapon) return useWeapon(p);
  // 原作可以把油桶举起来扔：面前贴着油桶、身前没有敌人时举桶
  const drum = drumInFront(p);
  if (drum && !enemyInFront(p, 1.0)) return liftDrum(p, drum);
  autoAim(p);
  const combo = p.hero.combo;
  const chain = G.t - p.lastHitT < 0.6 && p.comboN < combo.length - 1;
  p.comboN = chain ? p.comboN + 1 : 0;
  startMove(p, combo[p.comboN]);
}
function autoAim(p) {
  // 自由视角（正视 / 第一人称 / 转过的镜头）下给出软锁定：转向身前最近的敌人；侧视保持原作的左右朝向
  if (laneMode()) return;
  let best = null, bd = 2.3;
  for (const e of G.actors) {
    if (e.side === 'player' || !hittable(e)) continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d < bd && Math.abs(angDiff(p.face, faceOf(dx, dz))) < 1.35) { bd = d; best = e; }
  }
  if (best) p.face = faceOf(best.x - p.x, best.z - p.z);
}
function enemyInFront(p, dist) {
  for (const e of G.actors) {
    if (e.side === 'player' || !hittable(e)) continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    if (Math.hypot(dx, dz) < dist && (dx * Math.sin(p.face) + dz * Math.cos(p.face)) > 0) return e;
  }
  return null;
}
function hittable(e) { return e.alive && !e.removed && ['down', 'dead', 'getup', 'enter', 'cut', 'leave', 'flee', 'knocked', 'incar'].indexOf(e.state) < 0; }

// ---------- 玩家更新 ----------
function updatePlayer(p, dt) {
  const st = p.stats;
  const fp = camCtl.fp();
  switch (p.state) {
    case 'idle': case 'walk': {
      const mv = G.mode === 'play' ? moveVec() : { x: 0, z: 0, len: 0 };
      if (G.mode === 'play' && IN.down('run') && mv.len > 0.2) { setState(p, 'run', { dirX: mv.x, dirZ: mv.z }); break; }
      if (mv.len > 0.05) {
        p.vx = mv.x * st.walk; p.vz = mv.z * st.walk;
        faceMove(p, mv, dt);
        if (p.state !== 'walk') setState(p, 'walk');
        // 走进敌人 = 抓住
        tryGrab(p, mv);
      } else {
        p.vx = p.vz = 0;
        if (p.state !== 'idle') setState(p, 'idle');
        if (fp && p.lookHeading === undefined) p.face = approachAng(p.face, camCtl.yaw() + Math.PI, dt * 2.1);
      }
      break;
    }
    case 'run': {
      const mv = G.mode === 'play' ? moveVec() : { x: 0, z: 0, len: 0 };
      const hold = IN.down('run') || (p.sub.tap && mv.len > 0.3);
      if (!hold || G.mode !== 'play') { setState(p, mv.len > 0.05 ? 'walk' : 'idle'); p.vx *= 0.5; p.vz *= 0.5; break; }
      let dx = mv.len > 0.2 ? mv.x : p.sub.dirX, dz = mv.len > 0.2 ? mv.z : p.sub.dirZ;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      p.sub.dirX = dx; p.sub.dirZ = dz;
      p.vx = dx * st.run; p.vz = dz * st.run;
      faceMove(p, { x: dx, z: dz, len: 1 }, dt);
      if (Math.floor(p.st * 6) !== Math.floor((p.st - dt) * 6)) fx.dust(p.x, 0, p.z, 1, 0.22);
      break;
    }
    case 'jump': {
      // 空中可微调
      const mv = G.mode === 'play' ? moveVec() : { x: 0, z: 0, len: 0 };
      p.vx += mv.x * dt * 3; p.vz += mv.z * dt * 3;
      if (p.sub.atk) {
        const t = p.st - p.sub.atkT;
        if (t > (p.sub.dive ? 0 : 0.05) && t < 0.55 && !p.sub.hitDone) {
          const fly = p.sub.fly || p.hero.id === 'mustapha';
          const h = p.sub.dive ? H(0, 9, 0.7, 0.68, -0.45, 1.5, 15, 'down', 300, 'kick', true) : fly ? H(0, 9, 0.95, 0.62, 0.0, 1.5, 12, 'down', 200, 'kick', true) : H(0, 9, 0.78, 0.58, 0.0, 1.4, 10, 'down', 200, 'kick', true);
          const hit = tryHit(p, h, true);
          if (hit) p.sub.hitDone = true;
        }
      }
      break;
    }
    case 'attack': updateMove(p, dt); break;
    case 'grab': {
      const e = p.grab;
      if (!e || e.state !== 'grabbed' || e.removed) { releaseGrab(p); setState(p, 'idle'); break; }
      p.vx = p.vz = 0;
      const dx = Math.sin(p.face), dz = Math.cos(p.face);
      e.x = p.x + dx * 0.66; e.z = p.z + dz * 0.66; e.face = p.face + Math.PI;
      // 锁屏时在画面边缘朝外抓人：两人一起往里挪，被抓的敌人不出画
      if (G.lockX !== null) { const m = HALF_W - EDGE - Math.max(0, e.radius - 0.34) - nearInset(e.z), o = e.x - clamp(e.x, G.focusX - m, G.focusX + m); if (o) { e.x -= o; p.x -= o; } }
      if (p.st > (e.type === 'vice' || e.type === 'butcher' || e.type === 'lash' ? 0.7 : 1.5)) { breakFree(p, e); }
      if (p.sub.anim && p.st - p.sub.animT > p.sub.animDur) p.sub.anim = null;
      break;
    }
    case 'throwing': {
      p.vx = p.vz = 0;
      if (p.st > p.sub.dur) setState(p, 'idle');
      break;
    }
    case 'hurt': p.vx *= 0.85; p.vz *= 0.85; if (p.st > 0.36) setState(p, 'idle'); break;
    case 'down': updateDown(p, dt); break;
    case 'getup': p.vx = p.vz = 0; if (p.st > 0.5) { setState(p, 'idle'); p.invul = Math.max(p.invul, 0.6); } break;
    case 'pickup': p.vx = p.vz = 0; if (p.st > 0.3) setState(p, 'idle'); break;
    case 'carry': {
      const mv = G.mode === 'play' ? moveVec() : { x: 0, z: 0, len: 0 };
      const k = { mess: 0.85, hannah: 0.45 }[p.hero.id] || 0.6;
      p.vx = mv.x * st.walk * k; p.vz = mv.z * st.walk * k;
      if (mv.len > 0.05) faceMove(p, mv, dt);
      if (p.carryMesh) { p.carryMesh.position.set(p.x, p.y + p.model.H + 0.12, p.z); p.carryMesh.rotation.y = p.face; }
      break;
    }
    case 'shoot': p.vx = p.vz = 0; if (p.st > p.sub.dur) setState(p, 'idle'); break;
    case 'dead': p.vx = p.vz = 0; updatePlayerDead(p, dt); break;
    case 'respawn': {
      if (p.y <= 0.001 && p.st > 0.2) { setState(p, 'idle'); fx.ring(p.x, 0.2, p.z); fx.dust(p.x, 0, p.z, 8, 0.5); A.play('slam'); shockwave(p); }
      break;
    }
    case 'cutwalk': {
      const tx = p.sub.x, tz = p.sub.z;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.08) { p.vx = p.vz = 0; setState(p, 'idle'); if (p.sub.face !== undefined) p.face = p.sub.face; }
      else { p.vx = dx / d * p.stats.walk; p.vz = dz / d * p.stats.walk; p.face = approachAng(p.face, faceOf(dx, dz), dt * 12); }
      break;
    }
    case 'victory': p.vx = p.vz = 0; break;
    case 'door': p.vx = p.vz = 0; break;
  }
  if (G.settings.demo) p.invul = Math.max(p.invul, 0.05);
}
function faceMove(p, mv, dt) {
  if (!camCtl.fp()) { delete p.lookHeading; return; }
  if (p.lookHeading !== undefined) { p.face = approachAng(p.face, p.lookHeading, dt * 2.1); return; }
  if (camCtl.fp()) { p.face = approachAng(p.face, camCtl.yaw() + Math.PI, dt * 2.1); return; }
  p.face = approachAng(p.face, faceOf(mv.x, mv.z), dt * 16);
}
function updateMove(a, dt) {
  const m = a.move, d = m.def;
  m.t += dt;
  const recMul = a.stats ? a.stats.rec : 1;
  // 前冲
  if (d.dash) {
    const sp = Math.max(0, Math.hypot(a.vx, a.vz) - d.decel * dt);
    a.vx = Math.sin(a.face) * sp; a.vz = Math.cos(a.face) * sp;
  } else if (d.lunge && m.t < 0.12) { a.vx = Math.sin(a.face) * d.lunge; a.vz = Math.cos(a.face) * d.lunge; }
  else { a.vx *= 0.7; a.vz *= 0.7; }
  // 挥空声与挥击残影：在打出那一下（第一段判定前一点）响，而不是一按键就响
  if (a === G.player && !m.swung && d.hits.length && m.id !== 'mega' && m.t >= d.hits[0].t0 - 0.025) {
    m.swung = true;
    const heavy = isHeavyMove(a, m);
    A.play(heavy ? 'whooshHeavy' : 'whoosh', heavy ? 0.9 : 0.75);
    if (heavy && !d.dash) swingArc(a, d.hits[0]);
  }
  // 判定
  for (let i = 0; i < d.hits.length; i++) {
    const h = d.hits[i];
    if (m.t >= h.t0 && m.t <= h.t1) {
      const hh = a.side === 'enemy' ? Object.assign({}, h, { dmg: h.dmg * (a.def ? a.def.dmg : 6), reach: h.reach * (a.reachMul || 1) }) : Object.assign({}, h, { dmg: h.dmg * (a.stats ? a.stats.dmg : 1) });
      if (m.id === 'mega') megaHits(a, hh, m);
      else if (tryHit(a, hh, false, m, i)) m.connected = true;
    }
  }
  if (m.id === 'mega' && m.t > 0.5 && m.megaHit && !m.paid) { m.paid = true; if (!G.settings.demo) a.hp = Math.max(1, a.hp - 6); }
  // 连招：打中且按了攻击 → 提前接下一招
  const cancelT = d.cancel !== undefined ? d.cancel * recMul : 9;
  if (a === G.player && m.next && m.connected && m.t >= cancelT) {
    a.lastHitT = G.t;
    const combo = a.hero.combo;
    if (a.comboN < combo.length - 1) { a.comboN++; autoAim(a); startMove(a, combo[a.comboN]); return; }
  }
  if (m.connected && a === G.player) a.lastHitT = G.t;
  if (m.t >= d.dur * (d.dash ? 1 : recMul)) {
    if (d.air && a.y > 0.02) return;   // 空中招式等落地
    setState(a, 'idle');
    // 挥空时按的攻击不丢：收招后立刻再出一拳（连打不会“吞键”）
    if (a === G.player && m.next && !m.connected && !d.dash && G.mode === 'play') { playerAttack(a); return; }
    if (d.dash) { a.vx *= 0.2; a.vz *= 0.2; }
  }
}
function megaHits(a, h, m) {
  for (const e of G.actors) {
    if (e === a || e.side === a.side || !hittable(e) || m.hit.has(e.id)) continue;
    const d = Math.hypot(e.x - a.x, e.z - a.z);
    if (d < h.r + e.radius && e.y < 2) { m.hit.add(e.id); m.megaHit = true; applyHit(a, e, h, faceOf(e.x - a.x, e.z - a.z)); }
  }
  for (const pr of G.props) if (!pr.broken && Math.hypot(pr.x - a.x, pr.z - a.z) < h.r + pr.r && !m.hit.has('p' + pr.x)) { m.hit.add('p' + pr.x); hitProp(pr, 2); }
}

// 重招：连招最后一下、踢、勾拳、上勾拳、特殊技与武器挥击（挥空声更沉、带挥击残影）
function isHeavyMove(a, m) {
  if (!m) return false;
  const c = a.hero && a.hero.combo;
  if (c && a.comboN === c.length - 1 && m.id === c[a.comboN]) return true;
  return ['hook', 'upper', 'kickMid', 'kickHi', 'kickSide', 'risingKick', 'flipKick', 'rollingElbow', 'rollingJump', 'swing', 'swordSlash'].includes(m.id);
}
function swingArc(a, h) {
  const r = camCtl.axes().right, fx0 = Math.sin(a.face), fz0 = Math.cos(a.face);
  const side = fx0 * r.x + fz0 * r.z;   // 朝画面右还是左
  if (Math.abs(side) < 0.25) return;   // 正对 / 背对镜头时残影看不出方向，不画
  const reach = Math.min(1.0, h.reach) * 0.85;
  fx.swoosh(a.x + fx0 * reach, a.y + (h.y0 + h.y1) / 2, a.z + fz0 * reach, side < 0, h.y1 - h.y0 > 1.2 ? 1.25 : 1.0);
}

// ---------- 抓投 ----------
function tryGrab(p, mv) {
  if (p.weapon && ['gun', 'shotgun', 'smg', 'bazooka', 'rifle'].includes(p.weapon.kind)) return;
  for (const e of G.actors) {
    if (e.side === 'player' || e.isDino || !hittable(e) || e.y > 0.1) continue;
    if (['idle', 'walk', 'hurt', 'hover'].indexOf(e.state) < 0) continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.8 || d < 0.01) continue;
    if ((dx * mv.x + dz * mv.z) / d < 0.6) continue;
    if (laneMode() && Math.abs(dz) > 0.38) continue;
    p.sub.grabT = (p.sub.grabT || 0) + STEP;
    if (p.sub.grabT < 0.1) return;
    p.face = laneMode() ? (dx > 0 ? FACE_RIGHT : FACE_LEFT) : faceOf(dx, dz);
    setState(p, 'grab', { strikes: 0 });
    p.grab = e; e.grabbedBy = p;
    releaseToken(e);
    setState(e, 'grabbed');
    A.play('blip');
    ev('grab', { id: e.id, enemy: e.type });
    return;
  }
  p.sub.grabT = 0;
}
function grabStrike(p) {
  const e = p.grab;
  if (!e) return;
  const mv = moveVec();
  const away = mv.len > 0.4 && (mv.x * Math.sin(p.face) + mv.z * Math.cos(p.face)) < -0.4;
  if (away || p.sub.strikes >= 3) return throwEnemy(p, e, away);
  p.sub.strikes++;
  p.sub.anim = 'knee'; p.sub.animT = p.st; p.sub.animDur = 0.24;
  const dmg = (p.hero.id === 'mess' ? 8 : 6) * p.stats.dmg;
  damage(p, e, dmg, 'hit', faceOf(e.x - p.x, e.z - p.z), 100, false);
  e.state = 'grabbed'; e.st = 0;
  fx.hit(e.x, 1.1, e.z, 1, p.face); A.play('kick');
  p.hitstop = Math.max(p.hitstop, 0.07); e.hitstop = Math.max(e.hitstop, 0.08); e.hsMax = 0.08; e.hsDir = p.face; e.hsAmp = 0.06;
  fx.shake = Math.max(fx.shake, 0.05);
  p.st = Math.min(p.st, 0.4);
}
function throwEnemy(p, e, back) {
  releaseGrab(p, true);
  const slam = p.hero.id === 'mess' && !back;
  setState(p, 'throwing', { dur: slam ? 0.6 : 0.5, clip: slam ? 'slam' : 'throw' });
  const dir = back ? p.face + Math.PI : p.face;
  const dmg = (slam ? 22 : 16) * p.stats.dmg;
  e.hp -= G.settings.demo && e.side === 'player' ? 0 : dmg;
  addScore(400, e.x, 2, e.z, false);
  e.lastHitBy = p;
  if (slam) {
    // 梅斯：原地抱摔
    setState(e, 'down', { phase: 'air', thrown: true, bounce: 1 });
    e.x = p.x + Math.sin(p.face) * 0.5; e.z = p.z + Math.cos(p.face) * 0.5;
    e.y = 1.8; e.vy = -4; e.vx = Math.sin(p.face) * 1.0; e.vz = Math.cos(p.face) * 1.0;
    A.play('slam');
  } else {
    setState(e, 'down', { phase: 'air', thrown: true });
    e.y = 1.2; e.vy = 5.5; e.vx = Math.sin(dir) * 6.2; e.vz = Math.cos(dir) * 6.2;
    e.face = dir + Math.PI;
    A.play('whoosh');
  }
  ev('throw', { id: e.id, back: !!back, slam });
}
function releaseGrab(p, keep) {
  const e = p.grab;
  p.grab = null;
  if (e) { e.grabbedBy = null; if (!keep && e.state === 'grabbed') setState(e, 'idle'); }
  if (p.state === 'grab') setState(p, 'idle');
}
function breakFree(p, e) {
  releaseGrab(p);
  const dx = Math.sin(p.face), dz = Math.cos(p.face);
  p.vx = -dx * 3; p.vz = -dz * 3; e.vx = dx * 3; e.vz = dz * 3;
  setState(p, 'hurt'); setState(e, 'idle'); e.cd = 0.4;
}

// ---------- 油桶：举起与投掷 ----------
function drumInFront(p) {
  let best = null, bd = 1.0;
  for (const pr of G.props) {
    if (pr.broken || (pr.kind !== 'drum' && pr.kind !== 'barrel')) continue;
    const dx = pr.x - p.x, dz = pr.z - p.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * Math.sin(p.face) + dz * Math.cos(p.face)) > 0.1) { bd = d; best = pr; }
  }
  return best;
}
function liftDrum(p, pr) {
  pr.broken = true;
  G.props = G.props.filter(x => x !== pr);
  p.carryMesh = pr.mesh; p.carryItem = pr.item; p.carryWood = pr.kind === 'barrel';
  setState(p, 'carry');
  A.play('metal', 0.6);
  ev('lift');
}
function dropCarry(p, thrown) {
  const m = p.carryMesh;
  if (!m) return;
  p.carryMesh = null;
  if (!thrown) {
    // 被打中时油桶掉地上摔破
    scene.remove(m);
    fx.debris(p.x, 1.2, p.z, p.carryWood ? '#b07c4a' : '#c8662c', 10, 0.14, 3); A.play(p.carryWood ? 'wood' : 'metal');
    if (p.carryItem) spawnItem(p.carryItem, p.x, p.z, { pop: true, life: ITEMS[p.carryItem].weapon ? 14 : 0 });
    p.carryItem = null;
  }
}
function throwDrum(p) {
  const m = p.carryMesh;
  if (!m) { setState(p, 'idle'); return; }
  p.carryMesh = null;
  autoAim(p);
  const f = { x: Math.sin(p.face), z: Math.cos(p.face) };
  const pr = { kind: 'drum', wood: p.carryWood, owner: p, side: 'player', x: p.x + f.x * 0.4, y: p.model.H, z: p.z + f.z * 0.4, vx: f.x * 7.5, vz: f.z * 7.5, vy: 2.2, t: 0, mesh: m, dmg: 30, face: p.face, hits: new Set(), item: p.carryItem };
  p.carryItem = null;
  G.projs.push(pr);
  setState(p, 'throwing', { dur: 0.4, clip: 'throwItem' });
  A.play('whoosh');
  ev('drumThrow');
}

// ---------- 物品 / 武器 ----------
function itemUnder(p) {
  let best = null, bd = 0.75;
  for (const it of G.items) { if (it.y > 0.3) continue; const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = it; } }
  return best;
}
function pickUp(p, it) {
  const def = ITEMS[it.kind];
  setState(p, 'pickup');
  removeItem(it);
  if (def.food) {
    if (p.hp < p.maxHp) { const heal = Math.round(p.maxHp * def.heal / 100); p.hp = Math.min(p.maxHp, p.hp + heal); fx.text(p.x, 2.3, p.z, '+' + def.cn, '#8dff7a', 0.6); }
    else addScore(def.points, p.x, 2.2, p.z);
    A.play('eat'); G.stats.food++;
    ev('eat', { kind: it.kind, hp: p.hp });
  } else if (def.weapon) {
    if (p.weapon) dropWeapon(p);
    p.weapon = { kind: it.kind, ammo: it.ammo !== undefined ? it.ammo : def.ammo };
    attachWeapon(p);
    A.play('pickup'); toast(def.cn + (def.ammo > 1 ? ' × ' + p.weapon.ammo : ''));
    ev('weapon', { kind: it.kind });
  } else {
    addScore(def.points, p.x, 2.2, p.z); A.play('coin');
    ev('treasure', { kind: it.kind });
  }
}
function dropWeapon(a) {
  if (!a.weapon) return;
  if (a.weapon.ammo > 0 && ['gun', 'shotgun', 'smg', 'bazooka', 'pipe', 'knife', 'dynamite', 'grenade', 'rifle', 'sword'].indexOf(a.weapon.kind) >= 0) spawnItem(a.weapon.kind, a.x, a.z, { ammo: a.weapon.ammo, pop: true, life: 10 });
  a.weapon = null; attachWeapon(a);
}
function useWeapon(p) {
  const w = p.weapon, k = w.kind;
  autoAim(p);
  const fwd = { x: Math.sin(p.face), z: Math.cos(p.face) };
  if (k === 'bazooka') {
    if (w.ammo <= 0) { throwProj(p, k, { dmg: 8 }); p.weapon = null; attachWeapon(p); setState(p, 'throwing', { dur: 0.34, clip: 'throwItem' }); return; }
    w.ammo--; setState(p, 'shoot', { dur: 0.7, clip: 'shotgun' });
    fireRocket(p, p.x + fwd.x * 0.65, 1.35, p.z + fwd.z * 0.65, fwd.x * 11, 0, fwd.z * 11);
    queueShot(p, [], { kind: 'bazooka', big: true }); A.play('shotgun');
    ev('shoot', { kind: k, ammo: w.ammo }); return;
  }
  if (k === 'gun' || k === 'shotgun' || k === 'smg' || k === 'rifle') {
    if (w.ammo <= 0) { throwProj(p, k, { dmg: 8, dizzy: true }); p.weapon = null; attachWeapon(p); setState(p, 'throwing', { dur: 0.34, clip: 'throwItem' }); return; }
    w.ammo--;
    const sg = k === 'shotgun', rf = k === 'rifle';
    setState(p, 'shoot', { dur: sg ? 0.55 : k === 'smg' ? 0.11 : rf ? 0.42 : 0.3, clip: sg || rf ? 'shotgun' : 'shoot' });
    A.play(sg ? 'shotgun' : rf ? 'rifle' : 'gun');
    if (sg || rf) fx.shake = Math.max(fx.shake, 0.1);
    let firstD = sg ? 5.6 : rf ? 13 : 12, hitAny = false;
    const cands = G.actors.filter(e => e.side !== 'player' && hittable(e)).map(e => {
      const dx = e.x - p.x, dz = e.z - p.z, along = dx * fwd.x + dz * fwd.z, perp = Math.abs(dx * fwd.z - dz * fwd.x);
      return { e, along, perp };
    }).filter(o => o.along > 0.2 && o.along < firstD && o.perp < (sg ? 0.55 + o.along * 0.18 : 0.5)).sort((a, b) => a.along - b.along);
    let first = null, stopD = firstD;
    for (const o of cands) {
      const dmg = sg ? Math.max(14, 36 - o.along * 3.5) : k === 'smg' ? 7 : rf ? 24 : 16;
      const kb = sg || rf ? 'down' : (o.e.stun >= 2 ? 'down' : 'hit');
      const e = o.e; atBullet(bulletDelay(k, o.along), () => { if (hittable(e)) applyHit(p, e, H(0, 0, 0, 0, 0, 2, dmg * p.stats.dmg, kb, 400, sg ? 'punchHeavy' : 'punch', sg), p.face); });
      hitAny = true; if (!first) { first = o; stopD = o.along; }
      if (!sg) break;
    }
    for (const pr of G.props) { if (pr.broken) continue; const dx = pr.x - p.x, dz = pr.z - p.z, along = dx * fwd.x + dz * fwd.z, perp = Math.abs(dx * fwd.z - dz * fwd.x); if (along > 0 && along < firstD && perp < 0.6) { atBullet(bulletDelay(k, along), () => { if (!pr.broken) hitProp(pr, sg ? 3 : 1); }); if (!first) stopD = Math.min(stopD, along); if (!sg) break; } }
    // 子弹画面：手枪 / 冲锋枪 / 步枪一发飞到命中点或射程尽头；霰弹枪五颗弹丸扇形散开（中间三颗打到命中的敌人为止）
    const hy = first ? first.e.y + 1.15 : undefined;
    const rays = sg ? [-0.17, -0.08, 0, 0.08, 0.17].map(a => ({ ang: a + (Math.random() - 0.5) * 0.04, dist: Math.abs(a) < 0.1 && first ? first.along : firstD * (0.75 + 0.25 * Math.random()), y: Math.abs(a) < 0.1 ? hy : undefined }))
      : [{ dist: stopD, y: hy }];
    queueShot(p, rays, { kind: k, big: sg || rf });
    ev('shoot', { kind: k, ammo: w.ammo, hit: hitAny });
    if (w.ammo <= 0) toast('子弹打光了，再按攻击把枪扔出去');
    return;
  }
  if (k === 'pipe' || k === 'sword') {
    startMove(p, k === 'sword' ? 'swordSlash' : 'swing'); w.ammo--; A.play(k === 'sword' ? 'slash' : 'whoosh');
    if (w.ammo <= 0) { p.weapon = null; attachWeapon(p); fx.debris(p.x, 1.2, p.z, k === 'sword' ? '#d6dade' : '#8c9098', 4, 0.1, 2); toast(k === 'sword' ? '砍刀卷刃了' : '铁管断了'); }
    return;
  }
  if (k === 'knife') {
    const near = enemyInFront(p, 1.0);
    if (near) { startMove(p, 'stab'); A.play('slash'); return; }
    throwProj(p, 'knife', { dmg: 14 }); p.weapon = null; attachWeapon(p); setState(p, 'throwing', { dur: 0.34, clip: 'throwItem' }); A.play('knifeThrow'); return;
  }
  if (k === 'dynamite' || k === 'grenade') {
    throwProj(p, k, {}); p.weapon = null; attachWeapon(p); setState(p, 'throwing', { dur: 0.34, clip: 'throwItem' }); A.play('whoosh'); return;
  }
}
function spawnItem(kind, x, z, opts) {
  const o = opts || {};
  const mesh = itemMesh(kind);
  scene.add(mesh);
  const it = { kind, x, z, y: o.pop ? 0.6 : 0, vy: o.pop ? 4.2 : 0, vx: o.pop ? randRange(-0.8, 0.8) : 0, vz: o.pop ? randRange(-0.5, 0.8) : 0, t: 0, life: o.life || 0, ammo: o.ammo, mesh, spin: rand() * 6 };
  G.items.push(it);
  return it;
}
function removeItem(it) { scene.remove(it.mesh); G.items = G.items.filter(i => i !== it); }
function updateItems(dt) {
  const AR = AREAS[G.area];
  for (const it of G.items.slice()) {
    it.t += dt;
    if (it.vy || it.y > 0) {
      it.vy -= GRAV * dt; it.y += it.vy * dt; it.x += it.vx * dt; it.z += it.vz * dt;
      it.z = clamp(it.z, AR.z0, AR.z1);
      if (it.y <= 0) { it.y = 0; it.vy = Math.abs(it.vy) > 2 ? -it.vy * 0.3 : 0; it.vx *= 0.5; it.vz *= 0.5; if (!it.vy) { it.vx = it.vz = 0; } }
    }
    if (it.life && it.t > it.life) { removeItem(it); continue; }
    const blink = it.life && it.t > it.life - 2.5 ? (Math.floor(it.t * 10) % 2 === 0) : true;
    it.mesh.visible = blink;
    it.mesh.position.set(it.x, it.y + 0.02 + (it.y === 0 ? Math.abs(Math.sin(G.t * 3 + it.spin)) * 0.03 : 0), it.z);
    it.mesh.rotation.y = it.spin + G.t * 0.8;
  }
}

// ---------- 道具（油桶 / 雕像 / 管道） ----------
function hitProp(pr, power) {
  if (pr.broken) return;
  pr.hp -= power || 1; pr.shake = 0.25;
  A.play(pr.kind === 'drum' ? 'metal' : pr.kind === 'barrel' ? 'wood' : pr.kind === 'statue' ? 'breakStatue' : 'metal', 0.8);
  fx.hit(pr.x, 0.8, pr.z, false);
  if (pr.hp <= 0) {
    pr.broken = true; scene.remove(pr.mesh);
    const col = pr.kind === 'drum' ? '#c8662c' : pr.kind === 'barrel' ? '#b07c4a' : pr.kind === 'statue' ? '#d6ae3e' : '#a6aab4';
    fx.debris(pr.x, 0.6, pr.z, col, pr.kind === 'statue' ? 16 : 10, pr.kind === 'statue' ? 0.18 : 0.14, 3.5);
    if (pr.points) addScore(pr.points, pr.x, 1.8, pr.z);
    if (pr.item) spawnItem(pr.item, pr.x, pr.z + 0.5, { pop: true, life: ITEMS[pr.item].weapon ? 14 : 0 });
    ev('prop', { kind: pr.kind, item: pr.item });
  }
}
function updateProps(dt) {
  for (const pr of G.props) {
    if (pr.broken) continue;
    if (pr.shake > 0) { pr.shake -= dt; pr.mesh.position.x = pr.x + Math.sin(pr.shake * 80) * 0.05; } else pr.mesh.position.x = pr.x;
  }
}

// ---------- 投射物 ----------
function throwProj(a, kind, o) {
  const f = { x: Math.sin(a.face), z: Math.cos(a.face) };
  const mesh = meshFrom(itemGeo(kind === 'gun' || kind === 'shotgun' ? kind : kind), { thin: true, shadow: false });
  scene.add(mesh);
  const flat = kind === 'knife' || kind === 'gun' || kind === 'shotgun';
  const spd = kind === 'knife' ? 11 : flat ? 9 : 6.5;
  const pr = { kind, owner: a, side: a.side, x: a.x + f.x * 0.5, y: 1.4, z: a.z + f.z * 0.5, vx: f.x * spd, vz: f.z * spd, vy: flat ? 0.4 : 4.2, t: 0, mesh, fuse: kind === 'dynamite' ? 1.4 : 0, landed: false, dmg: o.dmg || 0, dizzy: o.dizzy, face: a.face };
  G.projs.push(pr);
  return pr;
}
function fireRocket(owner, x, y, z, vx, vy, vz, rain = false) {
  const mesh = itemMesh('rocket'); scene.add(mesh);
  const pr = { kind: 'rocket', owner, side: owner.side, x, y, z, vx, vy, vz, t: 0, mesh, rain, face: owner.face };
  G.projs.push(pr); return pr;
}
function explode(x, z, r, dmg, owner, friendlySafe = false) {
  fx.boom(x, 0, z, r / 2); A.play('boom');
  for (const e of G.actors) {
    if (!e.alive || e.removed || ['dead', 'enter', 'cut', 'leave'].indexOf(e.state) >= 0) continue;
    if (friendlySafe && e.side === owner?.side) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < r + e.radius) {
      let k = 1 - d / (r + e.radius) * 0.5;
      if (e.side === 'player') k *= 0.5;
      applyHit(owner, e, H(0, 0, 0, 0, 0, 3, dmg * k, 'launch', owner && owner.side === 'player' ? 400 : 0, 'punchHeavy', true), faceOf(e.x - x, e.z - z), true);
    }
  }
  for (const pr of G.props) if (!pr.broken && Math.hypot(pr.x - x, pr.z - z) < r + pr.r) hitProp(pr, 4);
}
function updateProjectiles(dt) {
  const AR = AREAS[G.area];
  for (const pr of G.projs.slice()) {
    pr.t += dt;
    if (pr.kind === 'rocket') {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
      const hit = G.actors.some(e => e.side !== pr.side && hittable(e) && Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + 0.3 && pr.y < e.y + e.height && pr.y > e.y);
      const out = pr.x < G.focusX - HALF_W - 2 || pr.x > G.focusX + HALF_W + 2 || pr.z < AR.z0 - 0.5 || pr.z > AR.z1 + 0.5;
      if (hit || pr.y <= 0.15 || out || pr.t > 2.5) {
        explode(pr.x, pr.z, 2.2, pr.rain ? 20 : 42, pr.owner, true);
        ev('rocketExplosion', { rain: pr.rain }); killProj(pr); continue;
      }
      pr.mesh.position.set(pr.x, pr.y, pr.z);
      pr.mesh.rotation.set(pr.rain ? Math.PI / 2 : 0, pr.rain ? 0 : pr.face, 0);
      if (Math.floor(pr.t * 14) !== Math.floor((pr.t - dt) * 14)) fx.dust(pr.x, pr.y, pr.z, 1, 0.14);
      continue;
    }
    if (!pr.landed) {
      pr.vy -= (pr.kind === 'knife' ? 4 : GRAV * 0.8) * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
      if (pr.kind === 'drum') {
        for (const e of G.actors) {
          if (e.side === 'player' || !hittable(e) || pr.hits.has(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + 0.45 && pr.y < e.y + e.height + 0.3) { pr.hits.add(e.id); applyHit(pr.owner, e, H(0, 0, 0, 0, 0, 2, pr.dmg * pr.owner.stats.dmg, 'down', 1000, 'punchHeavy', true), pr.face); }
        }
        const outD = pr.x < G.focusX - HALF_W - 2 || pr.x > G.focusX + HALF_W + 2 || pr.z < AR.z0 - 1 || pr.z > AR.z1 + 1;
        if (pr.y <= 0.45 || outD) {
          fx.debris(pr.x, 0.6, clamp(pr.z, AR.z0, AR.z1), pr.wood ? '#b07c4a' : '#c8662c', 12, 0.15, 3.5); A.play(pr.wood ? 'wood' : 'metal');
          if (pr.item) spawnItem(pr.item, clamp(pr.x, G.focusX - HALF_W + 0.5, G.focusX + HALF_W - 0.5), clamp(pr.z, AR.z0, AR.z1), { pop: true, life: ITEMS[pr.item].weapon ? 14 : 0 });
          killProj(pr); continue;
        }
        pr.mesh.position.set(pr.x, pr.y - 0.45, pr.z); pr.mesh.rotation.set(pr.t * 9, pr.face, 0);
        continue;
      }
      // 命中角色
      for (const e of G.actors) {
        if (e.side === pr.side || !hittable(e) || e === pr.owner) continue;
        if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + 0.25 && pr.y > e.y && pr.y < e.y + e.height) {
          if (pr.kind === 'grenade') { explode(pr.x, pr.z, 2.0, 36, pr.owner); killProj(pr); break; }
          if (pr.kind === 'dynamite') { applyHit(pr.owner, e, H(0, 0, 0, 0, 0, 2, 6, 'down', 200, 'punch'), pr.face); pr.vx *= -0.3; pr.vz *= -0.3; pr.vy = 2; continue; }
          applyHit(pr.owner, e, H(0, 0, 0, 0, 0, 2, pr.dmg || 10, pr.dizzy ? 'down' : 'down', pr.side === 'player' ? 400 : 0, pr.kind === 'knife' ? 'slash' : 'punch'), pr.face);
          if (pr.kind === 'knife') fx.blood(e.x, 1.3, e.z, Math.sign(pr.vx) || 1);
          killProj(pr); break;
        }
      }
      if (pr.removed) continue;
      // 玩家用拳头打掉飞刀
      if (pr.kind === 'knife' && pr.side === 'enemy') {
        const p = G.player;
        if (p.state === 'attack' && p.move && p.move.def.hits.length && Math.hypot(p.x + Math.sin(p.face) * 0.7 - pr.x, p.z + Math.cos(p.face) * 0.7 - pr.z) < 0.55) {
          A.play('clink'); fx.hit(pr.x, pr.y, pr.z, false); spawnItem('knife', pr.x, pr.z, { pop: true, life: 10 }); killProj(pr); continue;
        }
      }
      const out = pr.x < G.focusX - HALF_W - 3 || pr.x > G.focusX + HALF_W + 3 || pr.z < AR.z0 - 3 || pr.z > AR.z1 + 3;
      if (pr.y <= 0 || out) {
        if (pr.kind === 'grenade') { explode(pr.x, pr.z, 2.0, 36, pr.owner); killProj(pr); continue; }
        if (pr.kind === 'dynamite' && !out) { pr.landed = true; pr.y = 0; pr.vx = pr.vz = pr.vy = 0; pr.fuseT = 0; A.play('fuse'); continue; }
        if (!out && (pr.kind === 'knife')) spawnItem('knife', pr.x, clamp(pr.z, AR.z0, AR.z1), { life: 8 });
        killProj(pr); continue;
      }
    } else {
      pr.fuseT += dt;
      if (Math.floor(pr.fuseT * 8) !== Math.floor((pr.fuseT - dt) * 8)) fx.muzzle(pr.x, 0.3, pr.z);
      if (pr.fuseT > pr.fuse) { explode(pr.x, pr.z, 2.3, 42, pr.owner); killProj(pr); continue; }
    }
    pr.mesh.position.set(pr.x, pr.y, pr.z);
    if (pr.kind === 'knife') pr.mesh.rotation.set(0, pr.face, 0);
    else pr.mesh.rotation.set(pr.t * 12, pr.face, 0);
  }
}
function killProj(pr) { pr.removed = true; scene.remove(pr.mesh); G.projs = G.projs.filter(p => p !== pr); }

// ---------- 命中判定 ----------
function tryHit(a, h, air, m, hi) {
  const f = { x: Math.sin(a.face), z: Math.cos(a.face) };
  const cx = a.x + f.x * h.reach, cz = a.z + f.z * h.reach;
  const y0 = a.y + h.y0, y1 = a.y + h.y1;
  let any = false;
  for (const e of G.actors) {
    if (e === a || !hittable(e)) continue;
    if (a.side === e.side && !a.wild && !(a.isRaptor && a.angry)) continue;   // 发怒的恐龙谁都咬
    if (a.isRaptor && e === a) continue;
    if (e.state === 'grabbed' && a.side === 'player' && a.grab !== e) continue;
    const key = e.id + ':' + (hi || 0);
    if (m && m.hit.has(key)) continue;
    const d = Math.hypot(e.x - cx, e.z - cz);
    if (d > h.r + e.radius) continue;
    if (y1 < e.y || y0 > e.y + e.height) continue;
    if (m) m.hit.add(key);
    applyHit(a, e, h, a.face);
    any = true;
    if (air) break;
  }
  if (a.side === 'player') {
    for (const pr of G.props) {
      if (pr.broken) continue;
      const key = 'p' + pr.x + ':' + (hi || 0);
      if (m && m.hit.has(key)) continue;
      if (Math.hypot(pr.x - cx, pr.z - cz) < h.r + pr.r && y0 < 1.6) { if (m) m.hit.add(key); hitProp(pr, 1); any = true; }
    }
  }
  return any;
}
function applyHit(a, e, h, dir, splash) {
  if (e.invul > 0 && !(splash && e.side !== 'player')) return false;
  if (e.side === 'player' && G.settings.demo) { fx.hit(e.x, e.y + 1.2, e.z, false); return false; }
  if (e.type === 'shivat' && e.state === 'sleep') wakeShivat(e);   // 打熟睡的霸王龙会把它打醒
  let dmg = h.dmg;
  if (e.side === 'player') dmg *= DUR_MUL[G.settings.dur];
  // 打击分量：0 轻（刺拳）、1 重（踢、击倒、武器）、2 终结（连招最后一下、挑飞）。停顿、震屏、火花、音效都按分量加码
  const fin = a && a.side === 'player' && a.move && a.hero && a.comboN === a.hero.combo.length - 1 && a.move.id === a.hero.combo[a.comboN];
  const w = h.kb === 'launch' || fin ? 2 : h.big || h.kb === 'down' ? 1 : 0;
  const px = e.x - Math.sin(dir) * 0.2, pz = e.z - Math.cos(dir) * 0.2;
  fx.hit(px, e.y + (h.y0 + h.y1) / 2 * 0.6 + 0.5, pz, e.side === 'player' ? Math.min(w, 1) : w, dir);
  let sfx = h.sfx;
  if (w >= 1 && sfx === 'punch') sfx = 'punchHeavy';
  if (w >= 1 && sfx === 'kick') sfx = 'kickHeavy';
  if (sfx) A.play(sfx);
  if (h.sfx === 'slash') fx.blood(e.x, 1.3, e.z, Math.sin(dir) > 0 ? 1 : -1);
  const hs = [0.065, 0.1, 0.14][w];
  // 远处飞来的子弹 / 爆炸不让开枪的人跟着定格
  if (a && Math.hypot(a.x - e.x, a.z - e.z) < 2.6) a.hitstop = Math.max(a.hitstop, hs - 0.012);
  // 被打的人通常在同一帧稍后才更新、会立刻少掉一帧，补上 STEP，让他比出手方多定格一点
  e.hitstop = Math.max(e.hitstop, hs + STEP); e.hsMax = e.hitstop; e.hsDir = dir; e.hsAmp = [0.05, 0.08, 0.11][w];
  e.hurtVar = h.y1 < 1.5 ? 'body' : (G.hurtAlt = !G.hurtAlt) ? 'head' : 'headM';
  if (e.side !== 'player') fx.shake = Math.max(fx.shake, [0.035, 0.09, 0.17][w]);
  if (a && a.side === 'player' && h.pts) addScore(h.pts, undefined, 0, 0, false);
  if (a && a.side === 'player') { G.lastTarget = e; G.lastTargetT = G.t; }
  if (e.side !== 'player' && a && a.side !== 'player' && a !== e) G.lastTarget = G.lastTarget;
  damage(a, e, dmg, h.kb, dir, 0, true);
  return true;
}
// 统一扣血与受击反应
function damage(a, e, dmg, kb, dir, pts, react) {
  e.hp -= dmg; e.flash = 0.08; e.lastHitBy = a;
  if (e.side === 'player') {
    G.hurtFx = Math.min(1, 0.55 + dmg / 30); G.stats.hits++; G.stats.damage += dmg;
    A.play('hurtP'); fx.shake = Math.max(fx.shake, 0.15);
    if (e.grab) releaseGrab(e);
    if (e.carryMesh) { dropCarry(e, false); }
    if (e.weapon && kb !== 'hit') dropWeapon(e);
  } else if (e.grabbedBy && kb !== 'hit') releaseGrab(e.grabbedBy);
  if (!react) return;
  const dead = e.hp <= 0;
  if (dead) { e.hp = 0; }
  e.stun++; e.stunT = 1.0;
  if (e.isDino && e.type !== 'raptor') {
    // 三角龙、霸王龙体型大：轻攻击不硬直；冲锋、苏醒时完全不吃硬直
    if (dead) { knockdown(e, dir, 0.25, true); return; }
    if ((e.type === 'hack' && (e.state === 'charge' || e.state === 'paw')) || e.state === 'waking' || e.state === 'sleep') return;
    const heavy = kb === 'launch' || kb === 'down';
    if (e.type === 'hack' && heavy && e.stun >= 3) { knockdown(e, dir, 0.3, false); return; }
    if (e.stun >= (e.type === 'shivat' ? 5 : 3)) { e.stun = 0; setState(e, 'hurt'); }
    return;
  }
  const tough = e.type === 'vice' || e.type === 'butcher' || e.type === 'lash';
  const armor = tough && !dead && kb === 'hit' && chance(e.type === 'lash' ? 0.2 : 0.3);   // 原作维斯、屠夫几乎没有硬直：偶尔硬吃拳头继续出招
  if (dead || kb === 'down' || kb === 'launch' || (e.side !== 'player' && e.stun >= (tough ? 6 : 5))) knockdown(e, dir, kb === 'launch' ? 1.3 : 1, dead);
  else if (!armor) {
    if (e.state === 'grabbed') return;
    if (e.grab) releaseGrab(e);
    releaseToken(e);
    const keepAttack = tough && e.state === 'attack' && chance(0.2);
    if (!keepAttack) { const hv = e.hurtVar || (chance(0.4) ? 'body' : 'head'); setState(e, 'hurt', { low: hv === 'body', hv }); e.vx = Math.sin(dir) * 2.1; e.vz = Math.cos(dir) * 2.1; }
  }
}
function knockdown(e, dir, power, dead) {
  if (e.grab) releaseGrab(e);
  if (e.grabbedBy) releaseGrab(e.grabbedBy, true);
  releaseToken(e);
  if (e.weapon && e.side === 'enemy' && (e.weapon.kind === 'knife' || e.weapon.kind === 'pipe')) { spawnItem(e.weapon.kind, e.x, e.z, { pop: true, life: 10, ammo: e.weapon.kind === 'pipe' ? 8 : 1 }); e.weapon = null; attachWeapon(e); }
  if (e.type === 'butcher' && e.swords > 0) {
    // 原作：屠夫被打倒时两把刀脱手，玩家可以捡起来用
    for (let i = 0; i < e.swords; i++) spawnItem('sword', e.x + (i ? 0.45 : -0.45), e.z + 0.2, { pop: true, ammo: ITEMS.sword.ammo });
    e.swords = 0; attachSwords(e); toast('屠夫的砍刀脱手了！'); ev('swordsDrop'); A.play('clink');
  }
  setState(e, 'down', { phase: 'air', dead, power });
  e.vy = 4.8 * power; e.y = Math.max(e.y, 0.05);
  const sp = 3.3 * power;
  e.vx = Math.sin(dir) * sp; e.vz = Math.cos(dir) * sp * 0.6;
  e.face = dir + Math.PI;
  e.stun = 0;
  if (dead) { e.alive = false; onDeath(e); }
}
function onDeath(e) {
  if (e.side === 'player') return;
  const def = e.def;
  G.kills[e.type] = (G.kills[e.type] || 0) + 1;
  if (e.isDino) A.play('roar', e.type === 'raptor' ? 0 : 0.8);
  else A.play(def && def.fat ? 'screamFat' : 'scream');
  if (def) addScore(def.points, e.x, 2.4, e.z);
  if (e.drop) spawnItem(e.drop, e.x, e.z, { pop: true, life: ITEMS[e.drop].weapon ? 14 : 0 });
  ev('kill', { enemy: e.type, id: e.id });
  if (e.type === 'vice' || e.type === 'butcher') bossDefeated(e);
  // 一波最后一个敌人被主角打倒：短暂慢动作，收尾更有分量
  else if (e.lastHitBy === G.player && G.mode === 'play' && G.waveOn && !G.pending.length && G.timeScale === 1 && !G.waveEnemies.some(o => o !== e && o.alive && !o.removed)) {
    G.timeScale = 0.3; G.slowT = 0.42; fx.shake = Math.max(fx.shake, 0.2); ev('finishSlow');
  }
}
function updateDown(e, dt) {
  const s = e.sub;
  if (s.phase === 'air') {
    // 被扔出去的人会砸到别人
    if (s.thrown) {
      for (const o of G.actors) {
        if (o === e || o.side !== e.side || !hittable(o) || (s.hitIds && s.hitIds.has(o.id))) continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) < o.radius + 0.5 && e.y < 1.6) { (s.hitIds || (s.hitIds = new Set())).add(o.id); applyHit(G.player, o, H(0, 0, 0, 0, 0, 2, 12, 'down', 400, 'punchHeavy', true), faceOf(o.x - e.x, o.z - e.z)); }
      }
    }
    if (e.y <= 0.001 && e.vy <= 0) {
      if ((s.bounce || 0) < 1 && !s.thrownLand) { s.bounce = (s.bounce || 0) + 1; e.vy = 2.2; e.y = 0.01; e.vx *= 0.5; e.vz *= 0.5; fx.dust(e.x, 0, e.z, s.thrown || e.isDino ? 8 : 6, s.thrown ? 0.55 : 0.45); A.play(s.thrown ? 'slam' : 'bodyfall'); fx.shake = Math.max(fx.shake, s.thrown ? 0.16 : 0.06); if (s.thrown && e.hp <= 0 && e.alive) { e.alive = false; onDeath(e); } return; }
      s.phase = 'lie'; s.lieT = 0; e.vx = e.vz = 0; e.y = 0;
      if (e.hp <= 0 && e.alive) { e.alive = false; onDeath(e); }
    }
  } else {
    s.lieT += dt; e.vx = e.vz = 0;
    const lieDur = e.side === 'player' ? 0.55 : e.type === 'vice' || e.type === 'butcher' ? 0.7 : e.isDino ? 1.2 : 0.9;
    if (!e.alive) {
      if (e.side === 'player') { setState(e, 'dead'); return; }
      if (s.lieT > 0.9) { setState(e, 'dead'); }
      return;
    }
    if (s.lieT > lieDur) { setState(e, 'getup'); e.invul = Math.max(e.invul, e.type === 'vice' || e.type === 'butcher' ? 0.8 : 0.55); }
  }
}

// ---------- 物理 ----------
function physics(a, dt) {
  const AR = AREAS[G.area];
  if (a.state === 'grabbed' || a.state === 'incar') return;
  // 泥沼齐腰深：在水里走、跑、冲刺都慢一截
  const wf = G.water && a.y < 0.4 ? 1 - 0.3 * sinkK(a.x) : 1;
  a.x += a.vx * dt * wf; a.z += a.vz * dt * wf;
  const wasAir = a.y > 0.05;
  if (a.y > 0 || a.vy > 0) {
    a.vy -= GRAV * dt; a.y += a.vy * dt;
    if (a.y <= 0) {
      a.y = 0;
      const wasJump = a.state === 'jump';
      if (a.state === 'down' || a.state === 'respawn') { /* 由 updateDown 处理 */ if (a.state === 'respawn') a.vy = 0; }
      else { a.vy = 0; }
      if (wasJump) { setState(a, 'idle'); a.vx *= 0.2; a.vz *= 0.2; fx.dust(a.x, 0, a.z, 2, 0.25); A.play('land', 0.6); }
      if (a.state === 'attack' && a.move && a.move.def.air) { setState(a, 'idle'); a.vx *= 0.2; a.vz *= 0.2; A.play('land', 0.6); }
      if (a.state === 'leap') { a.vx *= 0.2; a.vz *= 0.2; }
      if (wasAir && G.water && sinkK(a.x) > 0.4) { fx.splash(a.x, 0.05, a.z, 10, 0.5); A.play('splash'); }
    }
  }
  // 边界：纵深与区域两端；玩家受卷轴窗口限制，卷轴时敌人可稍出屏，锁屏时敌人也不出画
  const free = ['enter', 'leave', 'flee', 'cut', 'sleep', 'knocked', 'waking'].indexOf(a.state) >= 0;   // 熟睡的霸王龙不跟着卷轴窗口挪位置
  if (!free) {
    const zMin = AR.z0, zMax = AR.z1;
    a.z = clamp(a.z, zMin, zMax);
    if (a.side === 'player' || G.lockX !== null) {
      // 原作锁屏：敌人、Boss、被打飞或摔出去的角色撞到画面边缘就停住；岩跳龙连尾巴长 3 米多，多留一些
      const m = HALF_W - EDGE - (a.side === 'player' ? 0 : a.type === 'shivat' ? 2.4 : a.isTrike ? 1.25 : a.isRaptor ? 1.45 : Math.max(0, a.radius - 0.34)) - nearInset(a.z);
      const lo = a.side === 'player' ? Math.max(AR.x0 + 0.3, G.focusX - m) : G.focusX - m, hi = a.side === 'player' ? (G.mode === 'trans' ? AR.x1 + 3 : Math.min(AR.x1, G.focusX + m)) : G.focusX + m;
      if (a.x < lo) { a.x = lo; if (a.vx < 0) a.vx = 0; }
      else if (a.x > hi) { a.x = hi; if (a.vx > 0) a.vx = 0; }
      // 倒地横躺比站着多占半个身长：贴边倒下的再往里滑一点（不瞬移）
      if (a.state === 'down' || a.state === 'dead') {
        const lie = 0.45;
        if (a.x < lo + lie) { a.x = Math.min(lo + lie, a.x + 3 * dt); if (a.vx < 0) a.vx = 0; }
        else if (a.x > hi - lie) { a.x = Math.max(hi - lie, a.x - 3 * dt); if (a.vx > 0) a.vx = 0; }
      }
    }
    else a.x = clamp(a.x, Math.max(AR.x0 - 1, G.focusX - HALF_W - 2.2), Math.min(AR.x1 + 1, G.focusX + HALF_W + 2.2));
  }
  // 道具阻挡
  for (const pr of G.props) {
    if (pr.broken) continue;
    const dx = a.x - pr.x, dz = a.z - pr.z, d = Math.hypot(dx, dz), min = pr.r + a.radius * 0.8;
    if (d < min && d > 1e-4) { a.x = pr.x + dx / d * min; a.z = pr.z + dz / d * min; }
  }
  // 停着的凯迪拉克、趴着睡的霸王龙：几个圆挡住身体
  if (a.y < 0.5 && !a.isDino) for (const b of blockers()) {
    const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = b.r + a.radius * 0.8;
    if (d < min && d > 1e-4) { a.x = b.x + dx / d * min; a.z = b.z + dz / d * min; }
  }
}
function blockers() {
  const S = G.sleeper;
  if (!S || (S.state !== 'sleep' && S.state !== 'knocked' && S.state !== 'waking')) return G.blockers;
  const f = Math.sin(S.face) || -1;
  return G.blockers.concat([{ x: S.x + f * 1.6, z: S.z + 0.1, r: 0.62 }, { x: S.x, z: S.z, r: 0.85 }, { x: S.x - f * 1.4, z: S.z, r: 0.6 }]);
}
// 泥沼里走动时水花
function waterFx(a, dt) {
  if (a.removed || a.y > 0.05 || sinkK(a.x) < 0.5) return;
  const sp = Math.hypot(a.vx, a.vz);
  if (sp < 0.6) return;
  a.splashT = (a.splashT || 0) + dt * Math.min(2, sp / 2.5);
  if (a.splashT > 0.28) { a.splashT = 0; fx.splash(a.x - Math.sign(a.vx) * 0.2, 0.05, a.z + 0.15, 3, 0.28); }
}
function separate() {
  const L = G.actors;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (!a.alive || !b.alive || a.state === 'grabbed' || b.state === 'grabbed' || a.state === 'down' || b.state === 'down' || a.y > 0.4 || b.y > 0.4) continue;
    if (['enter', 'cut', 'leave', 'flee'].indexOf(a.state) >= 0 || ['enter', 'cut', 'leave', 'flee'].indexOf(b.state) >= 0) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = (a.radius + b.radius) * 0.85;
    if (d < min && d > 1e-4) {
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      const wa = a === G.player ? 0.35 : 1, wb = b === G.player ? 0.35 : 1;
      a.x -= nx * push * wa; a.z -= nz * push * wa; b.x += nx * push * wb; b.z += nz * push * wb;
    }
  }
}

// ---------- 敌人 AI ----------
function tokens() { return G.actors.filter(e => e.token && e.alive).length; }
function releaseToken(e) { e.token = false; }
function wantToken(e) { if (e.token) return true; if (tokens() < 2 || e.type === 'vice') { e.token = true; return true; } return false; }
function updateEnemy(e, dt) {
  const p = G.player, def = e.def;
  switch (e.state) {
    case 'cut': e.vx = e.vz = 0; e.face = approachAng(e.face, faceOf(p.x - e.x, p.z - e.z), dt * 6); break;
    case 'enter': updateEnter(e, dt); break;
    case 'idle': case 'walk': case 'hover': think(e, dt); break;
    case 'attack': updateEnemyMove(e, dt); break;
    case 'charge': updateCharge(e, dt); break;
    case 'throwK': e.vx = e.vz = 0; if (e.st > 0.45 && !e.sub.thrown) { e.sub.thrown = true; const pr = throwProj(e, e.sub.kind, { dmg: e.sub.kind === 'knife' ? 10 * DUR1() : 0 }); if (e.sub.kind === 'knife') A.play('knifeThrow'); pr.side = 'enemy'; if (e.sub.kind === 'knife' && e.type === 'blade') { /* 布雷德刀不离手：投出的是第二把 */ } } if (e.st > 0.8) { setState(e, 'idle'); e.cd = randRange(0.8, 1.6); if (e.sub.run) { setState(e, 'flee'); } } break;
    case 'hurt': e.vx *= 0.85; e.vz *= 0.85; if (e.st > 0.34) { setState(e, 'idle'); e.cd = Math.max(e.cd, randRange(0.1, 0.35)); } break;
    case 'grabbed': e.vx = e.vz = 0; e.y = 0; break;
    case 'down': updateDown(e, dt); break;
    case 'getup': e.vx = e.vz = 0; if (e.st > 0.5) { setState(e, 'idle'); e.cd = randRange(0.2, 0.6); } break;
    case 'dead': e.vx = e.vz = 0; if (e.st > 1.0) removeActor(e); break;
    case 'flee': {
      const dir = e.x > G.focusX ? 1 : -1;
      e.vx = dir * 4.5; e.vz = 0; e.face = dir > 0 ? FACE_RIGHT : FACE_LEFT;
      if (Math.abs(e.x - G.focusX) > HALF_W + 3) { if (e.sub.vanish) { e.alive = false; removeActor(e); } else { setState(e, 'enter', { kind: 'walk', tx: G.focusX + dir * (HALF_W - 1.2), tz: randRange(-1, 1.5) }); } }
      break;
    }
    case 'jumpkick': {
      if (e.y <= 0.001 && e.st > 0.1) { setState(e, 'idle'); e.cd = randRange(0.8, 1.4); e.vx *= 0.2; e.vz *= 0.2; break; }
      if (!e.sub.hit && e.st > 0.1) { const h = H(0, 9, 0.9, 0.55, 0.0, 1.5, 9 * DUR1(), 'down', 0, 'kick', true); if (tryHit(e, h, true)) e.sub.hit = true; }
      break;
    }
    case 'leave': break;
    case 'aim': {
      // 步枪兵：举枪瞄准 → 枪口闪一下（提示）→ 开枪；跳起来或换纵深就能躲开
      e.vx = e.vz = 0;
      if (!e.sub.glint && e.st > 0.3) { e.sub.glint = true; (e.fxQ || (e.fxQ = [])).push({ type: 'glint' }); A.play('clink', 0.35); }
      if (!e.sub.fired && e.st > 0.62) { e.sub.fired = true; rifleShot(e); }
      if (e.st > 1.0) { setState(e, 'idle'); e.cd = randRange(1.8, 3.0); }
      break;
    }
    case 'mace': updateMace(e, dt); break;
    case 'poke': {
      // 胖子去捶熟睡的霸王龙
      e.vx = e.vz = 0;
      const S = G.sleeper;
      if (S) e.face = approachAng(e.face, faceOf(S.x - 0.9 - e.x, S.z - e.z), dt * 10);
      if (!e.sub.hit && e.st > 0.3) { e.sub.hit = true; if (S && S.state === 'sleep') pokeSleeper(e, S); }
      if (e.st > 0.8) { setState(e, 'idle'); e.cd = 0.55; }
      break;
    }
  }
}
function rifleShot(e) {
  const f = { x: Math.sin(e.face), z: Math.cos(e.face) };
  A.play('rifle');
  const p = G.player;
  const dx = p.x - e.x, dz = p.z - e.z, along = dx * f.x + dz * f.z, perp = Math.abs(dx * f.z - dz * f.x);
  const hit = along > 0.3 && along < 10 && perp < 0.45 && hittable(p) && p.y < 0.55;   // 起跳就能躲过子弹
  const D = hit ? along : Math.min(10, Math.max(2, along + 1.5));
  const ex = e.x, ez = e.z, face = e.face;
  if (hit) atBullet(bulletDelay('rifle', along), () => { if (hittable(p)) applyHit(e, p, H(0, 0, 0, 0, 0, 2, 11, 'down', 0, 'punchHeavy', true), face); });
  else atBullet(bulletDelay('rifle', D), () => fx.dust(ex + f.x * D, 0, ez + f.z * D, 2, 0.25));   // 没打中：子弹落在主角身后的地上
  queueShot(e, [{ dist: D, y: hit ? p.y + 1.15 : 0.05 }], { kind: 'rifle', big: true });
  ev('rifleShot', { id: e.id, hit });
}
// 拉什·T：链锤过顶抡两圈后甩出约 3.6 米，再收回
function updateMace(e, dt) {
  e.vx = e.vz = 0;
  const s = e.sub, T0 = 0.6, T1 = 0.82, T2 = 1.02, T3 = 1.38;
  if (e.st < T0) s.ext = -1;
  else if (e.st < T1) s.ext = (e.st - T0) / (T1 - T0);
  else if (e.st < T2) s.ext = 1;
  else s.ext = Math.max(0, 1 - (e.st - T2) / (T3 - T2));
  if (!s.thrown && e.st >= T0) { s.thrown = true; A.play('whoosh'); A.play('chain', 0.6); }
  if (s.ext > 0.25 && e.st < T2 && !s.hit) { const h = H(0, 9, 0.7 + s.ext * 2.9, 0.5, 0.5, 1.8, 13, 'down', 0, 'punchHeavy', true); if (tryHit(e, h, true)) s.hit = true; }
  if (e.st > T3) { setState(e, 'idle'); e.cd = randRange(1.2, 2.0); }
}
function wakerThink(e, dt) {
  const S = G.sleeper;
  const tx = S.x - 1.5, tz = S.z + 1.15;   // 站到霸王龙脖子前面
  const ex = tx - e.x, ez = tz - e.z, ed = Math.hypot(ex, ez);
  if (ed > 0.25) { e.vx = ex / ed * e.def.speed; e.vz = ez / ed * e.def.speed; e.state = 'walk'; e.face = approachAng(e.face, faceOf(ex, ez), dt * 10); return; }
  e.vx = e.vz = 0; e.state = 'idle';
  e.face = approachAng(e.face, faceOf(S.x - 0.9 - e.x, S.z - e.z), dt * 10);
  if (e.cd <= 0) setState(e, 'poke');
}
function pokeSleeper(e, S) {
  S.wakeN++;
  fx.hit(S.x - 1.1, 0.7, S.z + 0.5, false); A.play('punch');
  fx.text(S.x - 1.8, 2.3, S.z, '!', '#ffd84a', 0.7);
  ev('poke', { n: S.wakeN, by: e.type });
  if (S.wakeN >= 3) wakeShivat(S);
}
function wakeShivat(S) {
  if (S.state !== 'sleep') return;
  setState(S, 'waking'); S.wild = true; S.angry = true; S.cd = 1.2;
  A.play('roarBig'); fx.shake = Math.max(fx.shake, 0.45);
  toast('霸王龙希瓦特被吵醒了！'); ev('shivatWake', { pokes: S.wakeN });
  if (!G.waveOn) { G.waveOn = true; G.extraWave = true; G.lockX = clamp(Math.max(G.focusX, S.x - 3), AREAS[G.area].x0 + HALF_W, AREAS[G.area].x1 - HALF_W); G.pending = []; G.waveEnemies = []; }
  if (G.waveEnemies.indexOf(S) < 0) G.waveEnemies.push(S);
  for (const e of G.actors) if (e.waker) e.waker = false;   // 叫醒以后胖子们回头打玩家
}
const DUR1 = () => 1;
function think(e, dt) {
  const p = G.player, def = e.def;
  e.cd -= dt;
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
  const pDown = ['down', 'dead', 'respawn', 'getup'].indexOf(p.state) >= 0 || !p.alive || G.mode !== 'play';
  e.face = approachAng(e.face, Math.abs(dz) < 0.6 || true ? (dx > 0 ? FACE_RIGHT : FACE_LEFT) : faceOf(dx, dz), dt * 10);
  if (pDown) { hover(e, dt, def.rifle ? 4.4 : 3.2); return; }
  if (e.waker && G.sleeper && G.sleeper.state === 'sleep') { wakerThink(e, dt); return; }
  if (def.rifle && e.cd <= 0 && Math.abs(dz) < 0.45 && dist > 2.6 && dist < 9 && chance(0.045)) { setState(e, 'aim'); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
  if (def.mace && e.cd <= 0 && Math.abs(dz) < 0.5 && dist > 1.8 && dist < 3.9 && chance(0.05)) { setState(e, 'mace', { ext: -1 }); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; A.play('chain', 0.7); return; }
  // 远程招式
  if (def.knife && e.cd <= 0 && Math.abs(dz) < 0.35 && dist > 2.6 && dist < 7 && chance(0.02)) { setState(e, 'throwK', { kind: 'knife' }); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
  if (def.bomb && e.cd <= 0 && dist > 3 && dist < 6.5 && chance(0.006) && !e.threw) { e.threw = true; setState(e, 'throwK', { kind: def.bomb, run: true }); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
  if (def.fat && e.cd <= 0 && Math.abs(dz) < 0.4 && dist > 2.4 && dist < 6.5 && chance(0.03)) { setState(e, 'charge', { dir: dx > 0 ? 1 : -1 }); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
  if (!wantToken(e)) { hover(e, dt, def.rifle ? 4.6 : 3.4); return; }
  // 走到玩家同一纵深的左右侧
  let side = Math.sign(e.x - p.x) || 1;
  if (def.behind) side = -Math.sign(Math.sin(p.face)) || side;   // 朋克爱绕到背后
  const tx = p.x + side * (def.reach * 0.88), tz = p.z;
  const ex = tx - e.x, ez = tz - e.z, ed = Math.hypot(ex, ez);
  if (ed > 0.12) {
    const sp = def.speed * (ed > 2 ? 1 : 0.8);
    e.vx = ex / ed * sp; e.vz = ez / ed * sp;
    e.state = 'walk';
    // 中距离飞踢
    if (def.kick && e.cd <= 0 && Math.abs(dz) < 0.3 && dist > 2.0 && dist < 3.4 && chance(0.012 * (def.kick * 4))) {
      setState(e, 'jumpkick'); e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; e.vy = 6.2; e.y = 0.01; e.vx = Math.sign(dx) * 4.2; e.vz = 0; A.play('jump'); return;
    }
  } else { e.vx = e.vz = 0; e.state = 'idle'; }
  if (e.cd <= 0 && Math.abs(dz) < 0.32 && Math.abs(Math.abs(dx) - def.reach * 0.88) < 0.4) {
    e.face = dx > 0 ? FACE_RIGHT : FACE_LEFT;
    const r = rand();
    let mv = 'punch';
    if (def.knife) mv = 'slash';
    else if (def.rifle) mv = r < 0.6 ? 'butt' : 'punch';
    else if (def.mace) mv = r < 0.5 ? 'eSwing' : r < 0.75 ? 'kick' : 'punch';
    else if (e.weapon && e.weapon.kind === 'pipe') mv = 'eSwing';
    else if (def.fat) mv = 'fatPunch';
    else if (r < 0.22) mv = 'kick';
    startMove(e, mv);
    e.combo = def.fat || def.knife || def.rifle ? 0 : (chance(def.aggr) ? 1 + (chance(0.4) ? 1 : 0) : 0);
  }
}
function hover(e, dt, dist) {
  const p = G.player;
  if (!e.sub.hx || e.st - (e.sub.ht || 0) > 1.6) {
    const side = Math.sign(e.x - p.x) || (chance(0.5) ? 1 : -1);
    e.sub.hx = side * (dist + rand() * 1.2); e.sub.hz = randRange(-1.8, 1.8); e.sub.ht = e.st;
  }
  const AR = AREAS[G.area];
  const tx = clamp(p.x + e.sub.hx, G.focusX - HALF_W + 0.8, G.focusX + HALF_W - 0.8), tz = clamp(p.z + e.sub.hz, AR.z0, AR.z1);
  const ex = tx - e.x, ez = tz - e.z, ed = Math.hypot(ex, ez);
  if (ed > 0.2) { e.vx = ex / ed * e.def.speed * 0.6; e.vz = ez / ed * e.def.speed * 0.6; e.state = 'walk'; }
  else { e.vx = e.vz = 0; e.state = 'idle'; }
}
function updateEnemyMove(e, dt) {
  const m = e.move;
  updateMove(e, dt);
  if (e.state !== 'attack') {
    // 连击：前一拳收招后接第二拳
    if (e.combo > 0 && m && m.id === 'punch' || (e.combo > 0 && m && m.id === 'punch2')) {
      const p = G.player;
      if (Math.abs(p.z - e.z) < 0.5 && Math.hypot(p.x - e.x, p.z - e.z) < 1.4 && p.state !== 'down') { e.combo--; startMove(e, 'punch2'); return; }
    }
    e.cd = randRange(0.7, 1.5) / (0.6 + e.def.aggr);
    if (chance(0.35)) releaseToken(e);
  }
}
function updateCharge(e, dt) {
  // 胖子：抱头冲撞
  const s = e.sub;
  if (e.st < 0.4) { e.vx = e.vz = 0; return; }
  if (!s.go) { s.go = true; A.play('whoosh'); }
  e.vx = s.dir * 6.8; e.vz = 0;
  if (!s.hit) { const h = H(0, 9, 0.5, 0.6, 0.6, 1.8, 12 * DUR1(), 'down', 0, 'punchHeavy', true); if (tryHit(e, h, true)) s.hit = true; }
  if (e.st > 1.5 || Math.abs(e.x - G.focusX) > HALF_W + 1.5) { setState(e, 'idle'); e.cd = randRange(1.0, 2.0); e.vx = 0; }
}
function updateEnter(e, dt) {
  const s = e.sub;
  if (s.kind === 'walk') {
    const ex = s.tx - e.x, ez = s.tz - e.z, d = Math.hypot(ex, ez);
    if (d < 0.15) { setState(e, 'idle'); e.cd = randRange(0.3, 0.9); return; }
    e.vx = ex / d * e.def.speed; e.vz = ez / d * e.def.speed; e.face = ex > 0 ? FACE_RIGHT : FACE_LEFT;
  } else if (s.kind === 'door') {
    if (e.st < 0.5) { e.vx = e.vz = 0; return; }
    e.vz = 1.6; e.vx = 0; e.face = 0;
    if (e.z > s.tz) { setState(e, 'idle'); e.cd = 0.3; const d = world.area().doors[s.door]; if (d) setTimeout(() => { d.open = false; }, 900); }
  } else if (s.kind === 'facade') {
    if (e.st < 0.25) { e.vx = e.vz = 0; return; }
    if (!s.burst) { s.burst = true; burstFacade(); }
    e.vz = 3.2; e.face = 0;
    if (e.z > s.tz) { setState(e, 'idle'); e.cd = 0.2; }
  } else if (s.kind === 'rise') {
    // 格特等人从泥水里冒出来
    e.vx = e.vz = 0;
    if (!s.sp) { s.sp = true; fx.splash(e.x, 0.05, e.z, 12, 0.55); A.play('splash'); }
    if (e.st > 0.75) { setState(e, 'idle'); e.cd = 0.4; fx.splash(e.x, 0.05, e.z, 6, 0.4); }
  } else if (s.kind === 'wall') {
    if (e.st < 0.6) { e.vx = e.vz = 0; e.y = s.h; e.vy = 0; return; }
    if (!s.jumped) { s.jumped = true; e.vy = 3.5; e.vz = 1.4; A.play('jump'); }
    if (e.y <= 0.001 && e.st > 0.7) { setState(e, 'idle'); e.cd = 0.4; fx.dust(e.x, 0, e.z, 3, 0.3); A.play('land'); }
  }
}
function burstFacade() {
  const W0 = world.area();
  if (!W0.facadePlanks) return;
  W0.facadePlanks.forEach(pk => { pk.visible = false; });
  fx.debris(5.3, 1.5, -3.0, '#6a4a2c', 14, 0.22, 4); A.play('door');
  fx.shake = Math.max(fx.shake, 0.2);
}

// ---------- Boss：维斯·T ----------
function updateVice(v, dt) {
  const p = G.player;
  switch (v.state) {
    case 'cut': case 'leave': v.vx = v.vz = 0; if (v.state === 'leave' && v.y > 0) { v.vx = 3.5; v.vz = -2.6; } break;
    case 'idle': case 'walk': viceThink(v, dt); break;
    case 'attack': {
      const m = v.move;
      updateMove(v, dt);
      if (v.state !== 'attack' && m) {
        // 三连拳 + 长臂直拳
        if (m.id === 'vJab' && v.sub2 && v.sub2.chain > 0) { v.sub2.chain--; startMove(v, v.sub2.chain === 0 ? 'vLong' : (v.sub2.chain % 2 ? 'vJab2' : 'vJab')); return; }
        if (m.id === 'vJab2' && v.sub2 && v.sub2.chain > 0) { v.sub2.chain--; startMove(v, v.sub2.chain === 0 ? 'vLong' : 'vJab'); return; }
        v.cd = randRange(0.5, 1.1);
      }
      break;
    }
    case 'flurry': {
      // 贴身连打（原作会连打五六下）
      v.vx = v.vz = 0;
      const n = Math.floor(v.st / 0.11);
      if (n !== v.sub.n && n < 6) { v.sub.n = n; v.sub.alt = !v.sub.alt; const h = H(0, 9, 0.95, 0.5, 0.9, 1.9, 4 * DUR1(), n === 5 ? 'down' : 'hit', 0, 'punch'); tryHit(v, h, true); }
      if (v.st > 0.8) { setState(v, 'idle'); v.cd = randRange(0.6, 1.2); }
      break;
    }
    case 'flykick': {
      if (v.y <= 0.001 && v.st > 0.15) { setState(v, 'idle'); v.vx *= 0.2; v.vz *= 0.2; v.cd = randRange(0.5, 1.0); A.play('land'); break; }
      if (!v.sub.hit && v.st > 0.12) { const h = H(0, 9, 0.95, 0.62, 0.0, 1.6, 12 * DUR1(), 'down', 0, 'kick', true); if (tryHit(v, h, true)) v.sub.hit = true; }
      break;
    }
    case 'gun': {
      // 拔左轮：长时间瞄准后开枪
      v.vx = v.vz = 0;
      if (v.st > 0.95 && !v.sub.fired) {
        v.sub.fired = true;
        const f = { x: Math.sin(v.face), z: Math.cos(v.face) };
        A.play('gun');
        const dx = p.x - v.x, dz = p.z - v.z, along = dx * f.x + dz * f.z, perp = Math.abs(dx * f.z - dz * f.x);
        const hit = along > 0 && along < 12 && perp < 0.45 && hittable(p) && p.y < 1.4;
        const face = v.face, dmg = 16 * DUR1();
        if (hit) atBullet(bulletDelay('gun', along), () => { if (hittable(p)) applyHit(v, p, H(0, 0, 0, 0, 0, 2, dmg, 'down', 0, 'punchHeavy', true), face); });
        queueShot(v, [{ dist: hit ? along : 12, y: hit ? p.y + 1.15 : undefined }], { kind: 'gun' });
      }
      if (v.st > 1.4) { setState(v, 'idle'); v.cd = randRange(0.6, 1.2); }
      break;
    }
    case 'summon': {
      v.vx = v.vz = 0;
      if (v.st > 0.6 && !v.sub.fired) { v.sub.fired = true; v.pendingSummon = 0; queueShot(v, [{ up: true, dist: 7 }], { kind: 'gun' }); A.play('gun'); summonHenchmen(v.sub.n); }
      if (v.st > 1.3) { setState(v, 'idle'); v.cd = 0.4; }
      break;
    }
    case 'hurt': v.vx *= 0.85; v.vz *= 0.85; if (v.st > 0.24) { setState(v, 'idle'); v.cd = Math.min(v.cd, 0.25); } break;
    case 'grabbed': v.vx = v.vz = 0; break;
    case 'down': updateDown(v, dt); break;
    case 'getup': v.vx = v.vz = 0; if (v.st > 0.5) { setState(v, 'idle'); v.cd = 0.15; } break;
    case 'dead': v.vx = v.vz = 0; break;
  }
}
function viceThink(v, dt) {
  const p = G.player;
  v.cd -= dt;
  const dx = p.x - v.x, dz = p.z - v.z, dist = Math.hypot(dx, dz);
  v.face = approachAng(v.face, dx > 0 ? FACE_RIGHT : FACE_LEFT, dt * 10);
  // 血量阈值：朝天开枪叫手下（原作每掉到一定血量就叫一批）
  const frac = v.hp / v.maxHp;
  // 叫人被打断时（原作这时正是进攻机会），起身后照样把手下叫来
  if (v.pendingSummon && G.mode === 'play') { summonHenchmen(v.pendingSummon); v.pendingSummon = 0; }
  if (v.summons < 2 && frac < (v.summons === 0 ? 0.7 : 0.4) && G.mode === 'play') { v.summons++; v.pendingSummon = v.summons; setState(v, 'summon', { n: v.summons }); v.sub.pose = 'gunUp'; return; }
  const pDown = ['down', 'dead', 'respawn', 'getup'].indexOf(p.state) >= 0 || G.mode !== 'play';
  if (pDown) { hover(v, dt, 3.5); return; }
  const aligned = Math.abs(dz) < 0.35;
  if (v.cd <= 0) {
    if (dist > 3.2 && chance(0.04)) {
      if (aligned && chance(0.45)) { setState(v, 'gun'); v.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; A.play('chain', 0.5); return; }
      // 飞身踢：从一边飞到另一边
      setState(v, 'flykick'); v.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; v.vy = 7.2; v.y = 0.01;
      const t = 0.62; v.vx = clamp(dx / t, -9, 9); v.vz = clamp(dz / t, -4, 4); A.play('jump'); return;
    }
    if (aligned && dist < 1.35) {
      v.face = dx > 0 ? FACE_RIGHT : FACE_LEFT;
      const r = rand();
      if (r < 0.5) { v.sub2 = { chain: 3 }; startMove(v, 'vJab'); }
      else if (r < 0.72) { setState(v, 'flurry', { n: -1 }); }
      else startMove(v, 'vLong');
      return;
    }
    if (aligned && dist >= 1.35 && dist < 2.3 && chance(0.06)) { v.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; startMove(v, 'vLong'); return; }
  }
  // 靠近玩家同一纵深
  const side = Math.sign(v.x - p.x) || 1;
  const tx = p.x + side * 1.05, tz = p.z;
  const ex = tx - v.x, ez = tz - v.z, ed = Math.hypot(ex, ez);
  if (ed > 0.15) { const sp = v.def.speed * (ed > 2.5 ? 1.05 : 0.8); v.vx = ex / ed * sp; v.vz = ez / ed * sp; v.state = 'walk'; }
  else { v.vx = v.vz = 0; v.state = 'idle'; }
}
function summonHenchmen(n) {
  const sets = [[['gneiss', 1], ['ferris', -1]], [['ferris', 1], ['elmer', -1]]];
  const set = sets[(n - 1) % 2];
  set.forEach(([type, side], k) => {
    const e = spawnEnemy(type, G.focusX + side * ENTER_DX, randRange(-1.6, 1.8), { drop: type === 'elmer' ? 'donut' : null });
    setState(e, 'enter', { kind: 'walk', tx: G.focusX + side * (HALF_W - 1.4 - k * 0.3), tz: e.z });
  });
  ev('summon', { n });
}
function bossDefeated(v) {
  G.timeScale = 0.35;
  ev('bossDown', { boss: v.type });
  A.music(null);
  // 剩下的杂兵逃走，恐龙跑开
  for (const e of G.actors) {
    if (e === v || e === G.player || !e.alive) continue;
    if (e.isRaptor && e.type === 'raptor') { setState(e, 'flee', { vanish: true }); e.angry = false; }
    else if (['down', 'dead', 'knocked', 'sleep'].indexOf(e.state) < 0) { setState(e, 'flee', { vanish: true }); }
  }
  G.mode = 'clear';
  const stage = AREAS[G.area].stage;
  if (G.cleared.indexOf(stage) < 0) G.cleared.push(stage);
  const steps = [
    { wait: 0.6 },
    { fn: () => { G.timeScale = 1; } },
    { wait: 1.0 },
    { fn: () => { const p = G.player; if (p.alive && ['idle', 'walk', 'run', 'attack', 'hurt', 'jump', 'shoot', 'throwing', 'pickup', 'grab'].indexOf(p.state) >= 0) { if (p.grab) releaseGrab(p); setState(p, 'victory'); p.face = FACE_RIGHT; } A.music('clear'); } },
    { say: 'player', text: HEROES[G.hero].win, dur: 2.2 },
    { fn: () => { const p = G.player; const vit = Math.round(p.hp / p.maxHp * 100); G.vitality = vit; G.vitalityTotal = (G.vitalityTotal || 0) + vit; addScore(vit * 100, p.x, 2.6, p.z); A.play('coin'); banner('体力奖励 VITALITY', vit + ' × 100 = ' + vit * 100, 2.4); } },
    { wait: 2.4 }
  ];
  if (v.type === 'vice') steps.push({ say: 'vice', text: '屠夫在北边的森林里打猎……别去惹他……那家伙是个疯子！', dur: 3.4 });
  const next = STAGES[stage];   // STAGES 按关号从 1 排：下标 stage 就是下一关
  steps.push({ fn: () => { if (next) toNextStage(next); else finish(true); } });
  runScript(steps);
}
// 过关后接着打下一关（街机一样连续）：体力回满，换下手里的武器
function toNextStage(ST) {
  runScript([
    { fade: 1, dur: 0.9 },
    { fn: () => { const p = G.player; p.hp = p.maxHp; p.invul = 0; if (p.weapon) { p.weapon = null; attachWeapon(p); } setState(p, 'idle'); G.timeScale = 1; ev('stageClear', { next: ST.no }); loadArea(ST.first); } },
    { fade: 0, dur: 0.7 }
  ]);
}

// ---------- 岩跳龙 ----------
function updateRaptor(r, dt) {
  const p = G.player;
  switch (r.state) {
    case 'chained': r.vx = r.vz = 0; if (G.boss) { r.face = approachAng(r.face, faceOf(p.x - r.x, p.z - r.z), dt * 3); } break;
    case 'idle': case 'walk': {
      r.cd -= dt;
      // 选目标：一般追玩家，旁边有别人也会咬
      let tgt = p;
      if (!hittable(p) || p.state === 'respawn') tgt = null;
      for (const e of G.actors) { if (e !== r && e !== p && hittable(e) && Math.hypot(e.x - r.x, e.z - r.z) < 1.6 && chance(0.02)) tgt = e; }
      if (r.sub.tgt && hittable(r.sub.tgt) && r.st < 1.5) tgt = r.sub.tgt;
      if (!tgt) { hover(r, dt, 3); break; }
      r.sub.tgt = tgt;
      const dx = tgt.x - r.x, dz = tgt.z - r.z, d = Math.hypot(dx, dz);
      r.face = approachAng(r.face, faceOf(dx, dz), dt * 8);
      if (r.cd <= 0 && d > 2.6 && d < 5.5 && chance(0.03)) { setState(r, 'leap'); r.face = faceOf(dx, dz); r.vy = 6.6; r.y = 0.01; const t = 0.55; r.vx = clamp(dx / t, -8, 8); r.vz = clamp(dz / t, -6, 6); A.play('roar', 0.6); break; }
      if (r.cd <= 0 && d < 1.45) { r.face = faceOf(dx, dz); setState(r, chance(0.55) ? 'bite' : 'claw'); break; }
      const sp = r.def.speed * (d > 3 ? 1 : 0.7);
      if (d > 1.1) { r.vx = dx / d * sp; r.vz = dz / d * sp; r.state = 'walk'; } else { r.vx = r.vz = 0; r.state = 'idle'; }
      break;
    }
    case 'bite': case 'claw': {
      r.vx = r.vz = 0;
      const bite = r.state === 'bite';
      const t0 = bite ? 0.28 : 0.32;
      if (r.st > t0 && r.st < t0 + 0.12 && !r.sub.hit) { const h = H(0, 9, bite ? 1.2 : 1.0, 0.58, 0.3, 1.6, (bite ? 9 : 11) * DUR1(), bite ? 'hit' : 'down', 0, bite ? 'slash' : 'kick', !bite); if (tryHit(r, h, true)) r.sub.hit = true; }
      if (r.st > 0.7) { setState(r, 'idle'); r.cd = randRange(0.5, 1.1); }
      break;
    }
    case 'leap': {
      if (!r.sub.hit && r.st > 0.08) { const h = H(0, 9, 1.0, 0.65, 0.0, 1.8, 13 * DUR1(), 'down', 0, 'slash', true); if (tryHit(r, h, true)) r.sub.hit = true; }
      if (r.y <= 0.001 && r.st > 0.15) { setState(r, 'idle'); r.cd = randRange(0.8, 1.5); r.vx = r.vz = 0; fx.dust(r.x, 0, r.z, 3, 0.35); }
      break;
    }
    case 'hurt': r.vx *= 0.85; r.vz *= 0.85; if (r.st > 0.3) { setState(r, 'idle'); r.cd = 0.3; } break;
    case 'down': updateDown(r, dt); if (r.state === 'dead') { setState(r, 'flee', { vanish: true }); r.alive = true; r.dazed = true; } break;
    case 'getup': r.vx = r.vz = 0; if (r.st > 0.5) setState(r, 'idle'); break;
    case 'flee': {
      const dir = r.x > G.focusX ? 1 : -1;
      r.vx = dir * 5.5; r.vz = 0; r.face = dir > 0 ? FACE_RIGHT : FACE_LEFT;
      if (Math.abs(r.x - G.focusX) > HALF_W + 4) { r.alive = false; removeActor(r); }
      break;
    }
  }
}

// ---------- 霸王龙希瓦特 ----------
function updateShivat(S, dt) {
  switch (S.state) {
    case 'sleep': case 'knocked':
      S.vx = S.vz = 0;
      S.zzT = (S.zzT || 0) + dt;
      if (S.zzT > 1.1) { S.zzT = 0; fx.text(S.x + Math.sin(S.face) * 2.3, 1.6, S.z + 0.2, 'Z', '#dff2ff', 0.42); }
      break;
    case 'waking': S.vx = S.vz = 0; if (S.st > 1.5) { setState(S, 'idle'); S.cd = 0.5; } break;
    case 'idle': case 'walk': shivatThink(S, dt); break;
    case 'bite': {
      S.vx = S.vz = 0;
      if (!S.sub.hit && S.st > 0.5 && S.st < 0.68) { const h = H(0, 9, 2.25, 0.85, 0.5, 2.8, 15, 'down', 0, 'slash', true); if (tryHit(S, h, true)) S.sub.hit = true; }
      if (S.st > 1.05) { setState(S, 'idle'); S.cd = randRange(0.9, 1.5); }
      break;
    }
    case 'stomp': {
      S.vx = S.vz = 0;
      if (!S.sub.hit && S.st > 0.6) { S.sub.hit = true; stompAoE(S); }
      if (S.st > 1.15) { setState(S, 'idle'); S.cd = randRange(1.0, 1.6); }
      break;
    }
    case 'hurt': S.vx *= 0.8; S.vz *= 0.8; if (S.st > 0.45) { setState(S, 'idle'); S.cd = 0.3; } break;
    case 'down': updateDown(S, dt); if (S.state === 'dead') { setState(S, 'knocked'); fx.dust(S.x, 0, S.z, 10, 0.8); fx.shake = Math.max(fx.shake, 0.3); } break;
    case 'getup': S.vx = S.vz = 0; if (S.st > 0.8) setState(S, 'idle'); break;
  }
}
function shivatThink(S, dt) {
  const p = G.player;
  S.cd -= dt;
  let tgt = hittable(p) && p.state !== 'respawn' && G.mode === 'play' ? p : null;
  for (const e of G.actors) if (e !== S && e !== p && e.side === 'enemy' && !e.isDino && hittable(e) && Math.hypot(e.x - S.x, e.z - S.z) < 3 && chance(0.008)) tgt = e;
  if (S.sub.tgt && hittable(S.sub.tgt) && S.st < 2.5) tgt = S.sub.tgt;
  if (!tgt) { S.vx = S.vz = 0; S.state = 'idle'; return; }
  S.sub.tgt = tgt;
  const dx = tgt.x - S.x, dz = tgt.z - S.z, d = Math.hypot(dx, dz), want = faceOf(dx, dz);
  S.face = approachAng(S.face, want, dt * 2.4);   // 大块头转身慢
  const facing = Math.abs(angDiff(S.face, want)) < 0.45;
  if (S.cd <= 0 && d < 1.9 && chance(0.05)) { setState(S, 'stomp'); A.play('roarBig', 0.5); return; }
  if (S.cd <= 0 && d < 3.1 && d > 1.2 && facing) { setState(S, 'bite'); A.play('roar', 0.6); return; }
  if (d > 2.3) { const sp = S.def.speed; S.vx = dx / d * sp; S.vz = dz / d * sp; S.state = 'walk'; }
  else { S.vx = S.vz = 0; S.state = 'idle'; }
  // 走路时地面轻微震动
  if (S.state === 'walk') { S.stepT = (S.stepT || 0) + dt; if (S.stepT > 0.6) { S.stepT = 0; fx.shake = Math.max(fx.shake, 0.07); A.play('land', 0.9); fx.dust(S.x, 0, S.z, 2, 0.4); } }
}
function stompAoE(S) {
  fx.shake = Math.max(fx.shake, 0.45); A.play('slam'); fx.dust(S.x, 0, S.z, 10, 0.6); fx.ring(S.x, 0.15, S.z);
  for (const e of G.actors) {
    if (e === S || !hittable(e) || e.y > 0.5 || e.isDino) continue;
    const d = Math.hypot(e.x - S.x, e.z - S.z);
    if (d < 2.5 + e.radius) applyHit(S, e, H(0, 0, 0, 0, 0, 2, 9, 'down', 0, 'punchHeavy', true), faceOf(e.x - S.x, e.z - S.z));
  }
  ev('stomp');
}

// ---------- 三角龙哈克 ----------
function updateTrike(t, dt) {
  switch (t.state) {
    case 'enter': updateEnter(t, dt); break;
    case 'idle': case 'walk': trikeThink(t, dt); break;
    case 'paw': {
      // 刨地预警：低头、刨两下前脚
      t.vx = t.vz = 0;
      if (Math.floor(t.st * 5) !== Math.floor((t.st - dt) * 5)) fx.dust(t.x + Math.sin(t.face) * 0.8, 0, t.z + 0.4, 2, 0.3);
      if (t.st > 0.8) { setState(t, 'charge', { dir: t.sub.dir, tz: t.sub.tz, hits: new Set() }); A.play('roar', 0.7); }
      break;
    }
    case 'charge': {
      const s = t.sub;
      t.vx = s.dir * 8.4; t.vz = clamp((s.tz - t.z) * 2, -1.0, 1.0); t.face = s.dir > 0 ? FACE_RIGHT : FACE_LEFT;
      for (const e of G.actors) {
        if (e === t || e.isDino || !hittable(e) || s.hits.has(e.id) || e.y > 1.1) continue;
        const ax = e.x - (t.x + s.dir * 1.0), az = e.z - t.z;
        if (Math.abs(ax) < 0.85 + e.radius && Math.abs(az) < 0.55 + e.radius * 0.6) { s.hits.add(e.id); applyHit(t, e, H(0, 0, 0, 0, 0, 2, 12, 'launch', 0, 'punchHeavy', true), t.face); }
      }
      if (Math.floor(t.st * 8) !== Math.floor((t.st - dt) * 8)) { fx.dust(t.x - s.dir * 0.9, 0, t.z, 2, 0.35); fx.shake = Math.max(fx.shake, 0.05); }
      const L = G.lockX !== null ? G.lockX : G.focusX, edge = L + s.dir * (HALF_W - EDGE - 1.3);
      if ((s.dir > 0 ? t.x >= edge - 0.05 : t.x <= edge + 0.05) || t.st > 2.2) setState(t, 'skid', { dir: s.dir });
      break;
    }
    case 'skid': t.vx = t.sub.dir * Math.max(0, 5 - t.st * 12); t.vz = 0; if (t.st > 0.5) { setState(t, 'idle'); t.cd = randRange(0.6, 1.2); } break;
    case 'gore': {
      t.vx = t.vz = 0;
      if (!t.sub.hit && t.st > 0.3 && t.st < 0.46) { const h = H(0, 9, 1.5, 0.62, 0.0, 1.8, 11, 'launch', 0, 'punchHeavy', true); if (tryHit(t, h, true)) t.sub.hit = true; }
      if (t.st > 0.78) { setState(t, 'idle'); t.cd = randRange(0.8, 1.3); }
      break;
    }
    case 'hurt': t.vx *= 0.8; t.vz *= 0.8; if (t.st > 0.35) { setState(t, 'idle'); t.cd = 0.4; } break;
    case 'down': updateDown(t, dt); if (t.state === 'dead') { setState(t, 'flee', { vanish: true }); t.alive = true; t.dazed = true; t.wild = false; } break;
    case 'getup': t.vx = t.vz = 0; if (t.st > 0.6) { setState(t, 'idle'); t.cd = 0.5; } break;
    case 'flee': {
      // 被打败的三角龙晕乎乎地跑开（不打死恐龙，与岩跳龙相同）
      const dir = t.x > G.focusX ? 1 : -1;
      t.vx = dir * 4.4; t.vz = 0; t.face = dir > 0 ? FACE_RIGHT : FACE_LEFT;
      if (Math.abs(t.x - G.focusX) > HALF_W + 4) { t.alive = false; removeActor(t); }
      break;
    }
  }
}
function trikeThink(t, dt) {
  t.cd -= dt;
  const p = G.player;
  if (G.mode !== 'play' || !hittable(p) || p.state === 'respawn') { t.vx = t.vz = 0; t.state = 'idle'; return; }
  const dx = p.x - t.x, dz = p.z - t.z, dist = Math.hypot(dx, dz);
  if (t.cd <= 0 && dist < 2.3 && Math.abs(dz) < 0.6) { t.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; setState(t, 'gore'); A.play('snort'); return; }
  // 退到与玩家同一纵深、相隔 4～5 米的一侧，再刨地冲锋（玩家换纵深就能躲开）
  const L = G.lockX !== null ? G.lockX : G.focusX;
  const minX = L - HALF_W + EDGE + 1.3, maxX = L + HALF_W - EDGE - 1.3;
  const side = Math.sign(t.x - p.x) || 1;
  let tx = clamp(p.x + side * 4.6, minX, maxX);
  if (Math.abs(tx - p.x) < 2.6) tx = clamp(p.x - side * 4.6, minX, maxX);
  const ex = tx - t.x, ez = p.z - t.z, ed = Math.hypot(ex, ez);
  if (ed > 0.35) { const sp = t.def.speed * 1.25; t.vx = ex / ed * sp; t.vz = ez / ed * sp; t.state = 'walk'; t.face = approachAng(t.face, faceOf(ex, ez), dt * 5); }
  else { t.vx = t.vz = 0; t.state = 'idle'; t.face = approachAng(t.face, dx > 0 ? FACE_RIGHT : FACE_LEFT, dt * 6); }
  if (t.cd <= 0 && Math.abs(dz) < 0.5 && Math.abs(dx) > 2.6 && (ed < 1.0 || chance(0.012))) {
    t.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; setState(t, 'paw', { dir: Math.sign(dx) || 1, tz: p.z }); A.play('snort');
  }
}

// ---------- Boss：屠夫 ----------
const BUTCHER_GANG = ['gutter', 'razor', 'thug', 'gneiss', 'blade', 'elmer'];
function updateButcher(b, dt) {
  const p = G.player;
  switch (b.state) {
    case 'cut': {
      b.vx = b.vz = 0;
      if (b.sub.chop) {
        // 原作登场：背对玩家在肢解一头死恐龙
        const ph = b.st % 0.9;
        if (ph < 0.5 && ph + dt >= 0.5) { A.play('slash', 0.6); fx.blood(b.x + 1.3, 0.5, b.z - 0.3, 1); }
      }
      break;
    }
    case 'idle': case 'walk': butcherThink(b, dt); break;
    case 'attack': {
      const m = b.move;
      updateMove(b, dt);
      if (b.state !== 'attack' && m) {
        if (m.id === 'bSlash' && b.swords > 1 && b.sub2 && b.sub2.chain) { b.sub2.chain = 0; startMove(b, 'bSlash2'); return; }
        b.cd = randRange(0.45, 0.9);
      }
      break;
    }
    case 'dash': {
      // 冲刺斩（有刀）/ 冲撞（没刀）
      const s = b.sub;
      if (b.st < 0.34) { b.vx = b.vz = 0; break; }
      if (!s.go) { s.go = true; A.play(b.swords ? 'slash' : 'whoosh'); }
      if (b.st < 0.8) {
        b.vx = s.dir * 9.4; b.vz = 0;
        if (!s.hit) { const h = b.swords ? H(0, 9, 0.9, 0.72, 0.4, 2.0, 16, 'down', 0, 'slash', true) : H(0, 9, 0.7, 0.66, 0.4, 2.0, 12, 'down', 0, 'punchHeavy', true); if (tryHit(b, h, true)) s.hit = true; }
        if (Math.floor(b.st * 10) !== Math.floor((b.st - dt) * 10)) fx.dust(b.x - s.dir * 0.5, 0, b.z, 1, 0.3);
      } else { b.vx *= 0.8; if (b.st > 1.05) { setState(b, 'idle'); b.cd = randRange(0.6, 1.1); } }
      break;
    }
    case 'leap': if (b.y <= 0.001 && b.st > 0.15) { setState(b, 'idle'); b.vx *= 0.2; b.vz *= 0.2; b.cd = randRange(0.3, 0.7); fx.dust(b.x, 0, b.z, 4, 0.4); A.play('land'); } break;
    case 'butt': {
      // 屁股坐：高高跳起追着玩家落下，原作会连坐好几下，被打断才停
      const s = b.sub;
      if (s.phase === 'up') {
        if (b.vy > 0) { b.vx = clamp((p.x - b.x) * 2.4, -7, 7); b.vz = clamp((p.z - b.z) * 2.4, -4, 4); }
        else { s.phase = 'down'; b.vx *= 0.3; b.vz *= 0.3; b.vy = -4; }
      } else if (s.phase === 'down') {
        b.vy -= dt * 22;
        if (b.y <= 0.001) { s.phase = 'land'; s.lt = b.st; b.vx = b.vz = 0; buttImpact(b); }
      } else if (s.phase === 'land') {
        if (b.st - s.lt > 0.4) {
          if (s.n > 1 && G.mode === 'play') { s.n--; s.phase = 'up'; b.vy = 10; b.y = 0.01; A.play('jump'); }
          else { setState(b, 'idle'); b.cd = randRange(0.7, 1.2); }
        }
      }
      break;
    }
    case 'summon': {
      b.vx = b.vz = 0;
      if (b.st > 0.55 && !b.sub.fired) { b.sub.fired = true; b.pendingSummon = 0; A.play('roarMan'); fx.shake = Math.max(fx.shake, 0.2); butcherHenchmen(2); }
      if (b.st > 1.2) { setState(b, 'idle'); b.cd = 0.4; }
      break;
    }
    case 'pickSword': {
      b.vx = b.vz = 0;
      if (b.st > 0.35 && !b.sub.done) { b.sub.done = true; const it = b.sub.it; if (it && G.items.indexOf(it) >= 0) { removeItem(it); b.swords = Math.min(2, b.swords + 1); attachSwords(b); A.play('clink'); ev('swordPick', { by: 'butcher' }); } }
      if (b.st > 0.6) { setState(b, 'idle'); b.cd = 0.3; }
      break;
    }
    case 'hurt': b.vx *= 0.85; b.vz *= 0.85; if (b.st > 0.24) { setState(b, 'idle'); b.cd = Math.min(b.cd, 0.25); } break;
    case 'grabbed': b.vx = b.vz = 0; break;
    case 'down': updateDown(b, dt); break;
    case 'getup': b.vx = b.vz = 0; if (b.st > 0.5) { setState(b, 'idle'); b.cd = 0.15; } break;
    case 'dead': b.vx = b.vz = 0; break;
  }
}
function buttImpact(b) {
  fx.shake = Math.max(fx.shake, 0.4); A.play('slam'); fx.dust(b.x, 0, b.z, 8, 0.55); fx.ring(b.x, 0.15, b.z);
  const p = G.player;
  if (hittable(p) && p.y < 0.6 && Math.hypot(p.x - b.x, p.z - b.z) < 1.45 + p.radius) applyHit(b, p, H(0, 0, 0, 0, 0, 2, 14, 'down', 0, 'punchHeavy', true), faceOf(p.x - b.x, p.z - b.z));
  ev('buttDrop');
}
function butcherThink(b, dt) {
  const p = G.player;
  b.cd -= dt; b.henchT = (b.henchT || 0) + dt;
  const dx = p.x - b.x, dz = p.z - b.z, dist = Math.hypot(dx, dz);
  b.face = approachAng(b.face, dx > 0 ? FACE_RIGHT : FACE_LEFT, dt * 10);
  const frac = b.hp / b.maxHp;
  if (b.pendingSummon && G.mode === 'play') { butcherHenchmen(b.pendingSummon); b.pendingSummon = 0; }
  if (b.summons < 2 && frac < (b.summons === 0 ? 0.7 : 0.4) && G.mode === 'play') { b.summons++; b.pendingSummon = 2; setState(b, 'summon'); return; }
  // 原作：小喽啰会不断出来帮忙。场上杂兵少于 2 个时每 12 秒补一个
  if (b.henchT > 12 && G.mode === 'play') {
    b.henchT = 0;
    if (G.actors.filter(e => e.side === 'enemy' && e !== b && e.alive && !e.removed).length < 2) butcherHenchmen(1);
  }
  const pDown = ['down', 'dead', 'respawn', 'getup'].indexOf(p.state) >= 0 || G.mode !== 'play';
  if (pDown) { hover(b, dt, 3.6); return; }
  // 没刀时会回去捡地上的砍刀
  if (b.swords < 2 && !b.sub.goSword && b.cd <= 0 && chance(0.015)) {
    const it = G.items.find(i => i.kind === 'sword' && i.y < 0.3 && Math.abs(i.x - G.focusX) < HALF_W - 0.6);
    if (it) b.sub.goSword = it;
  }
  if (b.sub.goSword) {
    const it = b.sub.goSword;
    if (G.items.indexOf(it) < 0) b.sub.goSword = null;
    else {
      const ex = it.x - b.x, ez = it.z - b.z, ed = Math.hypot(ex, ez);
      if (ed < 0.55) { setState(b, 'pickSword', { it }); return; }
      b.vx = ex / ed * b.def.speed * 1.2; b.vz = ez / ed * b.def.speed * 1.2; b.state = 'walk'; b.face = ex > 0 ? FACE_RIGHT : FACE_LEFT;
      return;
    }
  }
  const aligned = Math.abs(dz) < 0.4;
  if (b.cd <= 0) {
    if (dist > 2.8 && chance(0.04)) {
      const r = rand();
      if (r < 0.4) { setState(b, 'butt', { phase: 'up', n: 1 + (chance(0.6) ? 1 : 0) + (frac < 0.5 && chance(0.5) ? 1 : 0) }); b.vy = 10; b.y = 0.01; A.play('jump'); return; }
      if (aligned && r < 0.8) { setState(b, 'dash', { dir: Math.sign(dx) || 1 }); b.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
      // 原作像维斯一样满屏乱跳：跳到玩家另一侧
      setState(b, 'leap'); b.vy = 8.2; b.y = 0.01;
      const tx = clamp(p.x - (Math.sign(b.x - p.x) || 1) * 1.6, G.focusX - HALF_W + 1.4, G.focusX + HALF_W - 1.4), tt = 0.68;
      b.vx = clamp((tx - b.x) / tt, -10, 10); b.vz = clamp((p.z - b.z) / tt, -4, 4); b.face = tx > b.x ? FACE_RIGHT : FACE_LEFT; A.play('jump');
      return;
    }
    if (aligned && dist < 1.5) {
      b.face = dx > 0 ? FACE_RIGHT : FACE_LEFT;
      if (b.swords) { b.sub2 = { chain: chance(0.65) ? 1 : 0 }; startMove(b, 'bSlash'); }
      else startMove(b, chance(0.5) ? 'fatPunch' : 'kick');
      return;
    }
    if (aligned && dist >= 1.5 && dist < 3.2 && chance(0.03)) { setState(b, 'dash', { dir: Math.sign(dx) || 1 }); b.face = dx > 0 ? FACE_RIGHT : FACE_LEFT; return; }
  }
  const side = Math.sign(b.x - p.x) || 1;
  const tx = p.x + side * 1.15, tz = p.z;
  const ex = tx - b.x, ez = tz - b.z, ed = Math.hypot(ex, ez);
  if (ed > 0.15) { const sp = b.def.speed * (ed > 2.5 ? 1.05 : 0.8); b.vx = ex / ed * sp; b.vz = ez / ed * sp; b.state = 'walk'; }
  else { b.vx = b.vz = 0; b.state = 'idle'; }
}
function butcherHenchmen(n) {
  for (let k = 0; k < n; k++) {
    G.gangI = ((G.gangI || 0) + 1) % BUTCHER_GANG.length;
    const type = BUTCHER_GANG[G.gangI], side = (G.gangI + k) % 2 ? 1 : -1;
    const e = spawnEnemy(type, G.focusX + side * ENTER_DX, randRange(-1.6, 1.8), { drop: type === 'elmer' ? 'donut' : null });
    setState(e, 'enter', { kind: 'walk', tx: G.focusX + side * (HALF_W - 1.4 - k * 0.3), tz: e.z });
  }
  ev('summon', { n, boss: 'butcher' });
}
function startButcher(B) {
  const p = G.player;
  G.mode = 'cut';
  G.lockX = B.lock;
  if (p.grab) releaseGrab(p);
  const b = makeActor('butcher', 'enemy', { def: ENEMY.butcher, x: B.x, z: B.z, hp: ENEMY.butcher.hp, maxHp: ENEMY.butcher.hp, face: FACE_RIGHT, summons: 0, cd: 1, swords: 2 });
  attachSwords(b);
  setState(b, 'cut', { chop: true });
  G.boss = b; G.waveEnemies = [b];
  A.music(null);
  // 原作：屠夫回过头来，一句话不说就动手
  runScript([
    { fn: () => { setState(p, 'cutwalk', { x: Math.max(p.x, 47.4), z: 0.2, face: FACE_RIGHT }); } },
    { until: () => p.state !== 'cutwalk', max: 4 },
    { wait: 1.3 },
    { fn: () => { b.sub.chop = false; b.face = FACE_LEFT; b.sub.pose = 'taunt'; b.st = 0; A.play('roarMan'); fx.shake = 0.22; } },
    { wait: 1.0 },
    { fn: () => { setState(b, 'idle'); b.cd = 0.8; G.mode = 'play'; G.timer = 180; G.timerShow = 2.5; A.music('boss2'); banner('BOSS', 'BUTCHER 屠夫', 1.8); ev('bossStart', { boss: 'butcher' }); } }
  ]);
}

// ---------- 波次 / 卷轴 ----------
function triggerWave(i) {
  const AR = AREAS[G.area];
  const wv = AR.waves[i];
  G.waveOn = true; G.wave = i;
  const maxF = AR.x1 - HALF_W;
  G.lockX = Math.min(maxF, Math.max(wv.lock, G.focusX));
  G.pending = wv.spawns.map(s => Object.assign({ at: G.t + (s.delay || 0) }, s));
  G.waveEnemies = [];
  ev('wave', { id: wv.id });
  for (const s of G.pending.filter(s => s.stand)) { const e = doSpawn(s); setState(e, 'cut'); }
  G.pending = G.pending.filter(s => !s.stand);
}
function doSpawn(s) {
  const L = G.lockX !== null ? G.lockX : G.focusX;
  let e;
  const AR = AREAS[G.area];
  switch (s.from) {
    case 'right': e = spawnEnemy(s.type, L + ENTER_DX, s.z || 0, { drop: s.drop, weapon: s.weapon }); setState(e, 'enter', { kind: 'walk', tx: L + HALF_W - 1.4, tz: s.z || 0 }); break;
    case 'left': e = spawnEnemy(s.type, L - ENTER_DX, s.z || 0, { drop: s.drop, weapon: s.weapon }); setState(e, 'enter', { kind: 'walk', tx: L - HALF_W + 1.4, tz: s.z || 0 }); break;
    case 'door': {
      const d = world.area().doors[s.door];
      d.open = true; A.play('door', 0.6);
      e = spawnEnemy(s.type, d.x, -2.75, { drop: s.drop, weapon: s.weapon }); setState(e, 'enter', { kind: 'door', door: s.door, tz: -1.4 });
      break;
    }
    case 'facade': e = spawnEnemy(s.type, s.x, -3.1, { drop: s.drop }); setState(e, 'enter', { kind: 'facade', tz: -1.2 }); break;
    case 'wall': e = spawnEnemy(s.type, s.x, -2.95, { drop: s.drop }); e.y = 2.75; setState(e, 'enter', { kind: 'wall', h: 2.75 }); break;
    case 'water': e = spawnEnemy(s.type, s.x, s.z || 0, { drop: s.drop }); setState(e, 'enter', { kind: 'rise' }); break;
    default: e = spawnEnemy(s.type, s.x, s.z, { drop: s.drop, weapon: s.weapon });
  }
  e.z = clamp(e.z, AR.z0 - 1.2, AR.z1);
  if (s.wake && G.sleeper && G.sleeper.state === 'sleep') e.waker = true;
  if (e.isTrike) { e.sub.kind = 'walk'; }
  G.waveEnemies.push(e);
  return e;
}
function updateWaves(dt) {
  const AR = AREAS[G.area], p = G.player;
  for (const s of G.pending.slice()) if (G.t >= s.at) { G.pending = G.pending.filter(x => x !== s); doSpawn(s); }
  if (G.waveOn) {
    const alive = G.waveEnemies.some(e => e.alive && !e.removed);
    if (!alive && G.pending.length === 0 && G.mode === 'play') {
      G.waveOn = false; G.lockX = null;
      if (G.extraWave) G.extraWave = false; else G.wave++;   // 霸王龙被打醒时临时锁的屏不占波次
      const more = G.wave < AR.waves.length || AR.exit || AR.boss;
      if (more) { G.go = 2.4; A.play('go'); }
      ev('waveClear', { wave: G.wave });
    }
  } else if (G.mode === 'play') {
    if (G.wave < AR.waves.length) {
      if (p.x >= AR.waves[G.wave].trigger) triggerWave(G.wave);
    } else if (AR.exit) {
      const ex = AR.exit;
      const wide = ex.type === 'cliff' || ex.type === 'dusk';
      if (p.x >= ex.x - 0.6 && Math.abs(p.z - ex.z) < (wide ? 9 : 1.1) && ['idle', 'walk', 'run'].indexOf(p.state) >= 0) exitArea(ex.type);
    } else if (AR.boss && !G.boss && p.x >= AR.boss.trigger) startBoss();
  }
}
function updateCameraFocus(dt) {
  const AR = AREAS[G.area], p = G.player;
  const minF = AR.x0 + HALF_W, maxF = AR.x1 - HALF_W;
  let target = clamp(p.x + 0.8, minF, maxF);
  if (G.lockX !== null) target = G.lockX;
  else target = Math.max(G.focusX, target);   // 原作不能往回卷
  const k = 1 - Math.exp(-dt * (G.lockX !== null ? 3 : 6));
  G.focusX += (target - G.focusX) * k;
  if (G.lockX === null) G.focusX = Math.max(G.focusX, Math.min(target, p.x - HALF_W + 1.6));
}
// 第二关可走到取景排（camZ1）前面：每往镜头靠近 1 米，侧视画面左右各窄约 0.62 米
function nearInset(z) { const AR = AREAS[G.area]; return AR.camZ1 === undefined ? 0 : Math.max(0, z - AR.camZ1) * 0.62; }
function updateTimer(dt) {
  // 无敌演示不受限时约束；保留剩余时间，关闭后继续原倒计时。
  if (G.settings.demo) return;
  const p = G.player;
  if (!G.waveOn && !G.boss && G.lockX === null && G.wave === 0) { /* 开场还没触发也照样计时 */ }
  const before = G.timer;
  G.timer -= dt;
  if (G.timer < 30 && Math.floor(before) !== Math.floor(G.timer) && G.timer > 0) { A.play('timer'); }
  if (G.timer <= 0) {
    G.timer = AREAS[G.area].timer;
    if (p.alive && p.state !== 'dead') { banner('TIME OVER', '时间到！', 2); p.hp = 0; knockdownPlayerDeath(p); }
  }
}
function knockdownPlayerDeath(p) { knockdown(p, p.face + Math.PI, 1, true); }

// ---------- 区域切换 ----------
function exitArea(type) {
  const p = G.player, AR = AREAS[G.area], to = AR.exit.to;
  G.mode = 'trans';
  if (p.grab) releaseGrab(p);
  const W0 = world.area();
  if (type === 'door') {
    p.face = FACE_RIGHT; p.x = Math.min(p.x, 43.9); setState(p, 'door', { kick: true });
    runScript([
      { wait: 0.15 },
      { fn: () => { A.play('door'); fx.debris(45, 1.2, 0, '#6a4a2c', 10, 0.18, 3); fx.shake = 0.3; if (W0.hutDoor) { W0.hutDoor.rotation.z = -1.45; W0.hutDoor.position.x = 45.6; W0.hutDoor.position.y = 0.06; } } },
      { wait: 0.45 },
      { fn: () => { setState(p, 'cutwalk', { x: 46.5, z: 0 }); } },
      { fade: 1, dur: 0.5 },
      { fn: () => { loadArea(to); } },
      { fade: 0, dur: 0.5 }
    ]);
  } else if (type === 'window') {
    p.face = FACE_RIGHT;
    runScript([
      { fn: () => { setState(p, 'jump', { noAtk: true, atk: true, atkT: 0, fly: true, hitDone: true }); p.vy = 7; p.y = 0.01; p.vx = 3.5; p.vz = -p.z * 0.8; A.play('jump'); } },
      { wait: 0.3 },
      { fn: () => { A.play('glass'); if (W0.window) { W0.window.glass.visible = false; } fx.debris(63, 2.2, 0, '#bfe0f0', 18, 0.12, 4); fx.shake = 0.25; } },
      { fade: 1, dur: 0.5 },
      { fn: () => { loadArea(to); } },
      { fade: 0, dur: 0.5 }
    ]);
  } else if (type === 'cliff') {
    // 2-1 → 2-2：从山崖跳进泥沼
    p.face = FACE_RIGHT;
    runScript([
      { fn: () => { setState(p, 'cutwalk', { x: Math.min(AR.x1 - 0.3, p.x + 0.8), z: p.z, face: FACE_RIGHT }); } },
      { until: () => p.state !== 'cutwalk', max: 1.5 },
      { fn: () => { setState(p, 'jump', { noAtk: true }); p.vy = 6.2; p.y = 0.01; p.vx = 3.4; p.vz = 0; A.play('jump'); } },
      { wait: 0.35 },
      { fade: 1, dur: 0.45 },
      { fn: () => { loadArea(to); } },
      { fade: 0, dur: 0.5 }
    ]);
  } else if (type === 'dusk') {
    // 2-2 → 2-3：走出沼泽，天色转暗
    runScript([
      { fn: () => { setState(p, 'cutwalk', { x: Math.min(AR.x1 + 2, p.x + 2.6), z: p.z, face: FACE_RIGHT }); } },
      { fade: 1, dur: 1.0 },
      { fn: () => { loadArea(to); } },
      { fade: 0, dur: 0.8 }
    ]);
  }
  ev('exit', { kind: type });
}
function startBoss() {
  const AR = AREAS[G.area], B = AR.boss, p = G.player;
  if (B.type === 'butcher') return startButcher(B);
  G.mode = 'cut';
  G.lockX = B.lock;
  if (p.grab) releaseGrab(p);
  const v = makeActor('vice', 'enemy', { def: ENEMY.vice, x: B.viceX, z: B.viceZ, hp: ENEMY.vice.hp, maxHp: ENEMY.vice.hp, face: FACE_LEFT, summons: 0, cd: 1 });
  setState(v, 'cut'); v.sub.pose = 'stand';
  const r = makeActor('raptor', 'enemy', { def: ENEMY.raptor, x: B.raptorX, z: B.raptorZ, hp: ENEMY.raptor.hp, maxHp: ENEMY.raptor.hp, face: FACE_LEFT, cd: 1 });
  setState(r, 'chained');
  G.boss = v; G.raptor = r; G.waveEnemies = [v];
  // 锁链
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshLambertMaterial({ color: '#8a8c94' }));
  scene.add(chain); G.chain = chain;
  A.music(null);
  runScript([
    { fn: () => { setState(p, 'cutwalk', { x: Math.max(p.x, 50.6), z: 0.3, face: FACE_RIGHT }); } },
    { until: () => p.state !== 'cutwalk', max: 4 },
    { say: 'player', text: '喂，混蛋！离那只恐龙远点！', dur: 2.4 },
    { say: 'vice', text: '滚开，不然打掉你的牙！', dur: 2.2 },
    { say: 'vice', text: '你的尸体正好拿来喂肥这只岩跳龙——然后我再剥了它的皮！', dur: 3.2 },
    { fn: () => { v.sub.pose = 'whip'; v.st = 0; A.play('whip'); } },
    { wait: 0.35 },
    { fn: () => { r.angry = true; r.model.setPalette('angry'); A.play('roar'); fx.shake = 0.3; r.sub.roar = 0.9; } },
    { wait: 0.9 },
    { fn: () => { scene.remove(G.chain); G.chain = null; A.play('chain'); setState(v, 'idle'); setState(r, 'idle'); r.cd = 0.3; v.cd = 0.8; G.mode = 'play'; G.timer = 180; G.timerShow = 2.5; A.music('boss'); banner('BOSS', 'VICE T. 维斯·特修恩', 1.8); ev('bossStart', { boss: 'vice' }); } }
  ]);
}

// ---------- 过场脚本 ----------
function runScript(steps) { G.script = { steps, i: 0, t: 0 }; }
function stepScript(dt) {
  const S = G.script;
  while (S && S.i < S.steps.length) {
    const s = S.steps[S.i];
    if (S.t === 0 && s.say) { G.dialog = { who: s.say, text: s.text, t: 0 }; A.play('blip'); }
    S.t += dt;
    let done = false;
    if (s.wait !== undefined) done = S.t >= s.wait;
    else if (s.fn) { s.fn(); done = true; }
    else if (s.say) {
      G.dialog.t = S.t;
      const skip = S.t > 0.35 && (IN.take('atk') || IN.take('jump') || IN.take('pause'));
      if (Math.floor(S.t * 18) !== Math.floor((S.t - dt) * 18) && S.t * 22 < s.text.length) A.play('blip', 0.5);
      done = S.t >= s.dur || skip;
      if (done) G.dialog = null;
    } else if (s.until) done = s.until() || S.t > (s.max || 5);
    else if (s.fade !== undefined) { G.fade = lerp(s.fade ? 0 : 1, s.fade, Math.min(1, S.t / s.dur)); done = S.t >= s.dur; }
    if (!done) return;
    if (G.script !== S) return;   // fn 里开了新脚本
    S.i++; S.t = 0;
  }
  if (G.script === S) G.script = null;
}

// ---------- 死亡与复活 ----------
function updatePlayerDead(p, dt) {
  if (p.st < 1.2) return;
  if (p.sub.handled) return;
  p.sub.handled = true;
  G.stats.deaths++;
  ev('death', { lives: G.lives });
  if (G.settings.lives === 'classic') {
    G.lives--;
    if (G.lives <= 0) { startContinue(); return; }
  }
  respawn(p);
}
function respawn(p) {
  p.hp = p.maxHp; p.alive = true;
  p.y = 4.5; p.vy = -2; p.vx = p.vz = 0;
  p.x = clamp(p.x, G.focusX - HALF_W + 1.5, G.focusX + HALF_W - 1.5);
  setState(p, 'respawn');
  p.invul = 3.0;
  IN.clear();
  p.weapon = { kind: 'bazooka', ammo: ITEMS.bazooka.ammo }; attachWeapon(p);
  const ar = AREAS[G.area];
  for (let i = 0; i < 5; i++) {
    const x = clamp(p.x + (i - 2) * 1.8, G.focusX - HALF_W + 0.5, G.focusX + HALF_W - 0.5);
    fireRocket(p, x, 6 + i * 0.7, clamp(p.z + (i % 2 ? -0.65 : 0.65), ar.z0, ar.z1), 0, -8, 0, true);
  }
  toast('火箭支援！复活携带火箭筒');
  ev('respawn', { weapon: 'bazooka', rain: 5 });
}
function shockwave(p) {
  // 复活落地时把身边的敌人震倒（不扣血），避免被围在复活点
  for (const e of G.actors) {
    if (e === p || e.side === 'player' || !hittable(e)) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < 3.2 && !e.isRaptor) knockdown(e, faceOf(e.x - p.x, e.z - p.z), 0.8, false);
  }
  for (const pr of G.projs.slice()) if (pr.side === 'enemy' && Math.hypot(pr.x - p.x, pr.z - p.z) < 3) killProj(pr);
}
function startContinue() {
  G.mode = 'cont';
  G.cont = { t: 0, count: 9, shot: false };
  A.music('cont');
  ev('continue');
}
function updateContinue(dt) {
  const C = G.cont;
  C.t += dt;
  const n = 9 - Math.floor(C.t);
  if (n !== C.count && n >= 0) { C.count = n; A.play('timer'); }
  if (IN.take('atk') || IN.take('pause')) {
    G.stats.contCount++; G.score += 1; G.lives = 3;
    G.mode = 'play'; G.cont = null; A.music(areaMusic());
    respawn(G.player);
    ev('continued');
    return;
  }
  if (C.t > 10 && !C.shot) { C.shot = true; A.play('gun'); G.flash = 1; }
  if (C.t > 11.2) { G.cont = null; finish(false); }
}

// ---------- 结束 ----------
function finish(win) {
  if (G.ended) return;
  G.ended = true;
  G.mode = win ? 'clear' : 'over';
  const newHi = !G.demoUsed && G.score > G.hi;
  if (newHi) { G.hi = G.score; store.set('hi', G.hi); }
  const res = { win, score: G.score, hi: G.hi, newHi, demo: G.demoUsed, kills: Object.assign({}, G.kills), seconds: Math.round(G.t), deaths: G.stats.deaths, hits: G.stats.hits, food: G.stats.food, vitality: G.vitality || 0, vitalityTotal: G.vitalityTotal || G.vitality || 0, cleared: G.cleared.slice(), stage: AREAS[G.area].stage, hero: HEROES[G.hero], lives: G.settings.lives, dur: G.settings.dur, conts: G.stats.contCount };
  ev('end', { win, score: G.score });
  if (G.onEnd) G.onEnd(res);
}

// ---------- 标题画面：四位主角站在楼顶 ----------
export function toTitle() {
  clearAll();
  G.mode = 'title';
  world.setArea(0);
  G.focusX = 8; G.lockX = null;
  G.titleActors = HEROES.map((h, i) => {
    const a = makeActor(h.id, 'player', { x: 5.6 + i * 1.25, z: 1.0 - Math.abs(i - 1.5) * 0.35, face: 0.25 - i * 0.12, hero: h });
    setState(a, 'title');
    return a;
  });
}

// ---------- 渲染：姿势与模型同步 ----------
const tmpPose = new Float32Array(POSE_LEN);
const GUN_POSE = mod(HP.guard, { rS: [-0.6, 0, -0.2], rE: [-1.2, 0, 0] });
const SG_POSE = mod(HP.guard, { rS: [-0.5, -0.2, -0.2], rE: [-1.4, 0, 0], lS: [-0.9, -0.3, 0.3], lE: [-0.8, 0, 0] });
export function render(dt, realT) {
  for (const a of G.actors) {
    if (a.removed) continue;
    const frozen = a.hitstop > 0;
    if (a.isRaptor) renderRaptor(a, frozen ? 0 : dt);
    else if (a.isTrike) renderTrike(a, frozen ? 0 : dt);
    else renderHuman(a, frozen ? 0 : dt, realT);
    // 泥沼里整个人下沉到齐腰；从水里冒出来的敌人从水下升起（只改画面，判定高度不变）
    const sk = G.water ? sinkK(a.x) * SINK : 0;
    let vy = a.y - sk;
    if (a.state === 'enter' && a.sub.kind === 'rise') vy -= 1.9 * Math.max(0, 1 - a.st / 0.75);
    // 命中停顿：被打的人沿受力方向来回抖，越到后面越小
    let jx = 0, jz = 0;
    if (frozen && a.hsDir !== undefined && a.hsMax > 0) { const k = Math.min(1, a.hitstop / a.hsMax) * a.hsAmp * (Math.floor(G.frames / 2) % 2 ? 1 : -1); jx = Math.sin(a.hsDir) * k; jz = Math.cos(a.hsDir) * k; }
    a.model.root.position.set(a.x + jx, vy, a.z + jz);
    a.model.root.rotation.y = a.face;
    if (a.fxQ && !a.isDino) flushFx(a);
    a.blob.position.set(a.x, 0.015, a.z);
    const hs = Math.max(0.3, 1 - a.y * 0.25);
    if (a.isDino) { const r = a.radius / 0.32 * 0.85 * hs; a.blob.scale.set(r * 1.1, r * (a.type === 'shivat' ? 2.6 : 1.9), 1); a.blob.rotation.z = -a.face; }
    else a.blob.scale.setScalar(a.radius / 0.32 * 0.85 * hs);
    a.blob.visible = sk < 0.05 && (a.state !== 'dead' || Math.floor(a.st * 12) % 2 === 0);
    // 闪烁：无敌 / 倒地消失
    let vis = true;
    if (a.state === 'dead' && a.side !== 'player') vis = Math.floor(a.st * 12) % 2 === 0;
    else if (a.invul > 0 && a.side === 'player' && a.state !== 'attack' && !G.settings.demo) vis = Math.floor(G.t * 15) % 2 === 0;
    if (a === G.player && G.fpActive) vis = false;
    a.model.root.visible = vis;
    nearFade(a);
    if (a.def && a.def.mace) renderMace(a, sk);
    // 受击闪白
    const m = a.model.mat;
    if (m) { const f = a.flash > 0 ? 0.3 * Math.min(1, a.flash / 0.08) : 0; m.emissive.setRGB(f, f * 0.95, f * 0.85); if (a === G.player && G.settings.demo) m.emissive.setRGB(0.15, 0.12 + Math.sin(G.t * 8) * 0.08, 0.02); }
  }
  // 锁链：维斯的手到岩跳龙脖子
  if (G.chain && G.boss && G.raptor) {
    const h = new THREE.Vector3(); G.boss.model.bones.rHand.getWorldPosition(h);
    const n = new THREE.Vector3(); G.raptor.model.bones.head.getWorldPosition(n);
    const mid = h.clone().add(n).multiplyScalar(0.5); mid.y -= 0.25;
    G.chain.position.copy(mid);
    G.chain.scale.y = h.distanceTo(n);
    G.chain.lookAt(n); G.chain.rotateX(Math.PI / 2);
  }
}
// 拉什·T 的链锤：平时垂在手边，出招时过顶抡圈、甩出、收回；绳子连到手
const ropeGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5);
const ropeMat = new THREE.MeshLambertMaterial({ color: '#7a6448' });
const _hand = new THREE.Vector3();
function renderMace(a, sk) {
  if (!a.ball) { a.ball = meshFrom(maceGeo(), {}); a.rope = new THREE.Mesh(ropeGeo, ropeMat); scene.add(a.ball, a.rope); }
  a.model.root.updateMatrixWorld(true);
  a.model.bones.rHand.getWorldPosition(_hand);
  const f = { x: Math.sin(a.face), z: Math.cos(a.face) }, s = a.state === 'mace' ? a.sub : null;
  let bx, by, bz;
  if (s && s.ext < 0) { const ang = a.st * 15; bx = _hand.x + Math.cos(ang) * 0.75; by = _hand.y + 0.35; bz = _hand.z + Math.sin(ang) * 0.75; }
  else if (s) { const r = 0.6 + s.ext * 2.9; bx = a.x + f.x * r; by = 1.1 - sk; bz = a.z + f.z * r; }
  else { const sw = Math.sin(G.t * 3 + a.id) * 0.12; bx = _hand.x + f.x * (0.12 + sw); by = Math.max(0.18 - sk, _hand.y - 0.55); bz = _hand.z + f.z * (0.12 + sw); }
  a.ball.position.set(bx, by, bz); a.ball.rotation.y = G.t * 3;
  const dx = bx - _hand.x, dy = by - _hand.y, dz = bz - _hand.z, len = Math.max(0.01, Math.hypot(dx, dy, dz));
  a.rope.position.set((bx + _hand.x) / 2, (by + _hand.y) / 2, (bz + _hand.z) / 2);
  a.rope.scale.set(1, len, 1);
  a.rope.quaternion.setFromUnitVectors(_up, _dir.set(dx / len, dy / len, dz / len));
  a.ball.visible = a.rope.visible = a.model.root.visible && a.alive;
}
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
// 第一人称：贴到镜头上的敌人 / 岩跳龙按「镜头到各部件包围球」的最近距离淡化，并隐藏描边与手持武器，
// 避免近裁剪面切进模型（满屏贴图、露出牙齿和模型内部，或描边外壳把整屏盖黑）
const _sph = new THREE.Sphere();
function nearFade(a) {
  let k = 1;
  if (G.fpActive && a !== G.player) {
    const c = camCtl.cam.position;
    if (Math.hypot(a.x - c.x, a.z - c.z) < 3.2) {
      a.model.root.updateMatrixWorld(true);
      let gap = 9;
      a.model.root.traverse(o => {
        if (!o.isMesh || o.userData.outline) return;
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        gap = Math.min(gap, c.distanceTo(_sph.center) - _sph.radius);
      });
      k = clamp((gap - 0.05) / 0.45, 0, 1);
    }
  }
  const was = a.nearK === undefined ? 1 : a.nearK;
  if (k === was || (k > 0 && k < 1 && Math.abs(k - was) < 0.02)) return;
  a.nearK = k;
  const m = a.model.mat, tr = k < 1;
  if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }   // 切换透明要重编着色器（OPAQUE 宏），否则透明度不生效
  m.opacity = 0.15 + 0.85 * k; m.depthWrite = k > 0.6;
  const ol = k > 0.97;
  a.model.root.traverse(o => { if (o.userData.outline) o.visible = ol; });
  if (a.wmesh) a.wmesh.visible = k > 0.5;
}
function targetPose(a, realT) {
  const s = a.state, st = a.st;
  const tP = (name) => HP[name] || HP.guard;
  if ((a.side === 'player' || (a.def && a.def.rifle)) && a.weapon && ['idle', 'walk', 'hover'].indexOf(s) >= 0) {
    const k = a.weapon.kind;
    if (k === 'gun') return s === 'walk' ? walkPose(a.walkPh, 0.8, GUN_POSE) : GUN_POSE;
    if (['shotgun', 'smg', 'bazooka', 'rifle'].includes(k)) return s === 'walk' ? walkPose(a.walkPh, 0.8, SG_POSE) : SG_POSE;
  }
  switch (s) {
    case 'title': return lerpPose(HP.guard, HP.crossArms, 0.5 + 0.5 * Math.sin(realT * 0.8 + a.id), tmpPose);
    case 'idle': case 'hover': return lerpPose(HP.guard, HP.guard2, 0.5 + 0.5 * Math.sin(realT * 4 + a.id), tmpPose);
    case 'walk': case 'cutwalk': return walkPose(a.walkPh, 1, HP.guard);
    case 'enter': {
      if (a.sub.kind === 'wall' && a.y > 0 && !a.sub.jumped) return HP.crouch;
      if (a.y > 0) return HP.jumpUp;
      if (a.sub.kind === 'facade') return HP.tackle;
      return walkPose(a.walkPh, 1, HP.guard);
    }
    case 'run': case 'flee': return runPose(a.walkPh);
    case 'jump': {
      if (a.sub.dive) return a.hero.id === 'mess' ? HP.buttSit : HP.diveKick;
      if (a.sub.atk && st - a.sub.atkT > 0.03) return a.sub.fly || a.hero && a.hero.id === 'mustapha' ? HP.flyKick : HP.jumpKick;
      return HP.jumpUp;
    }
    case 'jumpkick': return HP.jumpKick;
    case 'flykick': return HP.flyKick;
    case 'attack': {
      const m = a.move;
      if (!m) return HP.guard;
      const d = m.def;
      if (m.id === 'mega') {
        a.spin = (m.t / d.dur) * Math.PI * 4;
        return HP.spinA;
      }
      if (d.pose) return HP[d.pose];
      const clip = HC[d.clip];
      if (!clip) return HP.guard;
      // 命中停顿时定格在打到位的那一帧（拳脚完全伸出），不停在半路
      const imp = a.hitstop > 0 && clip.imp ? clip.imp : 0;
      if (d.windup) { if (m.t < d.windup) return tP(d.wind || 'guard2'); return sample(clip, Math.max(imp, m.t - d.windup)); }
      return sample(clip, Math.max(imp, m.t * (clip.dur / Math.max(0.01, d.dur))));
    }
    case 'grab': return a.sub.anim ? sample(HC.knee, Math.max(a.hitstop > 0 ? HC.knee.imp : 0, a.st - a.sub.animT)) : HP.grab;
    case 'throwing': return sample(HC[a.sub.clip] || HC.throw, st);
    case 'grabbed': return HP.held;
    case 'hurt': return sample(HC[a.sub.hv === 'headM' ? 'hurtHeadM' : a.sub.hv === 'body' || (!a.sub.hv && a.sub.low) ? 'hurtBody' : 'hurtHead'], st);
    case 'down': {
      if (a.sub.phase === 'lie') return HP.lie;
      if (a.sub.thrown) return HP.thrown;
      return a.y > 0.3 || a.vy > 0 ? HP.fallBack : HP.lie;
    }
    case 'dead': return HP.lie;
    case 'getup': return sample(HC.getup, st);
    case 'pickup': return sample(HC.pickup, st);
    case 'carry': return Math.hypot(a.vx, a.vz) > 0.2 ? walkPose(a.walkPh, 0.7, HP.throwUp) : HP.throwUp;
    case 'shoot': return a.sub.clip === 'shotgun' ? HP.shotgun : HP.shoot;
    case 'throwK': return st < 0.4 ? HP.throwBack : HP.throwFwd;
    case 'charge': return st < 0.4 ? HP.guard2 : HP.headbutt;
    case 'flurry': return a.sub.alt ? HP.jabL : HP.jabR;
    case 'gun': return HP.shoot;
    case 'summon': return st < 0.5 ? HP.stand : HP.gunUp;
    case 'respawn': return HP.jumpUp;
    case 'victory': return sample(HC.victory, Math.min(st, 1.2));
    case 'door': return st < 0.4 ? sample(HC.kickMid, st) : HP.guard;
    case 'leave': return HP.jumpUp;
    case 'aim': return HP.aim;
    case 'mace': return st < 0.6 ? HP.maceUp : HP.maceOut;
    case 'poke': return sample(HC.hook, Math.min(st * 0.6, HC.hook.dur));
    case 'dash': return st < 0.34 ? HP.guard2 : (a.swords ? HP.slash1 : HP.tackle);
    case 'butt': return a.sub.phase === 'land' ? HP.sit : a.sub.phase === 'down' ? HP.buttSit : HP.jumpUp;
    case 'leap': return HP.jumpUp;
    case 'pickSword': return HP.crouch;
    case 'incar': return HP.sit;
    case 'cut': {
      if (a.sub.chop) return sample(HC.chop, st % HC.chop.dur);
      const ps = a.sub.pose;
      if (ps === 'whip') return sample(HC.whip, Math.min(st, 0.6));
      if (ps && HP[ps]) return HP[ps];
      return lerpPose(HP.guard, HP.guard2, 0.5 + 0.5 * Math.sin(realT * 4 + a.id), tmpPose);
    }
  }
  return HP.guard;
}
function renderHuman(a, dt, realT) {
  const sp = Math.hypot(a.vx, a.vz);
  if (a.state === 'run' || a.state === 'flee') a.walkPh += dt * (8 + sp * 1.2);
  else a.walkPh += dt * (3 + sp * 2.6);
  if (a.type === 'vice') viceGun(a);
  const tp = targetPose(a, realT);
  const sharp = ['attack', 'hurt', 'down', 'flurry', 'grab', 'throwing'].indexOf(a.state) >= 0;
  // 开枪那一帧手臂直接举到位，火花和子弹才会在枪口；命中停顿里攻防双方直接摆到打中 / 受击姿势
  const snap = (a.fxQ && a.fxQ.some(r => r.type === 'shot')) || (a.hitstop > 0 && sharp);
  // 出招片段本身已经连续，平滑只用来衔接进出招；太软会让拳头总是伸不到位
  const k = snap ? 1 : dt <= 0 ? 0 : 1 - Math.exp(-dt * (a.state === 'attack' || a.state === 'grab' ? 60 : sharp ? 40 : 16));
  for (let i = 0; i < POSE_LEN; i++) {
    // body 翻转角沿最近方向衔接，收招时不反转整圈。
    const delta = i === 0 ? Math.atan2(Math.sin(tp[i] - a.pose[i]), Math.cos(tp[i] - a.pose[i])) : tp[i] - a.pose[i];
    a.pose[i] += delta * k;
  }
  applyPose(a.model, a.pose);
  // 必杀旋转
  if (a.state === 'attack' && a.move && a.move.id === 'mega') a.model.bones.body.rotation.y = a.spin || 0;
}
const tmpR = new Float32Array(R_LEN);
function renderRaptor(r, dt) {
  const sp = Math.hypot(r.vx, r.vz), big = r.type === 'shivat';
  r.walkPh += dt * (big ? 2.2 + sp * 1.3 : 4 + sp * 2.4);
  let tp;
  switch (r.state) {
    case 'sleep': case 'knocked': tp = RPOSE.sleep; break;
    case 'waking': tp = lerpR(RPOSE.sleep, RPOSE.roar, Math.min(1, r.st / 0.9), tmpR); break;
    case 'stomp': tp = r.st < 0.55 ? RPOSE.stomp0 : RPOSE.stomp1; break;
    case 'chained': tp = r.angry ? RPOSE.roar : (r.sub.roar > 0 ? RPOSE.roar : RPOSE.crouch); break;
    case 'idle': tp = r.sub.roar > 0 ? RPOSE.roar : RPOSE.idle; break;
    case 'walk': case 'flee': tp = raptorRun(r.walkPh, big ? 0.65 : Math.min(1.2, 0.5 + sp * 0.2)); break;
    case 'bite': tp = r.st < (big ? 0.45 : 0.26) ? RPOSE.bite0 : RPOSE.bite1; break;
    case 'claw': tp = r.st < 0.3 ? RPOSE.claw0 : RPOSE.claw1; break;
    case 'leap': tp = RPOSE.leap; break;
    case 'hurt': tp = RPOSE.hurt; break;
    case 'down': tp = r.sub.phase === 'lie' ? RPOSE.lie : RPOSE.hurt; break;
    case 'getup': tp = lerpR(RPOSE.lie, RPOSE.idle, Math.min(1, r.st / 0.5)); break;
    default: tp = RPOSE.idle;
  }
  if (r.sub.roar > 0) r.sub.roar -= dt;
  const k = dt <= 0 ? 0 : 1 - Math.exp(-dt * 16);
  for (let i = 0; i < R_LEN; i++) r.pose[i] += (tp[i] - r.pose[i]) * k;
  applyRaptor(r.model, r.pose);
  if (big && (r.state === 'sleep' || r.state === 'knocked')) r.model.bones.body.rotation.x += Math.sin(G.t * 1.8) * 0.025;   // 呼吸起伏
  if (r.flash > 0 && r.model.mat) r.model.mat.emissive.setRGB(0.3, 0.28, 0.25); else if (r.model.mat) r.model.mat.emissive.setRGB(0, 0, 0);
}
// 三角龙：四条腿交替摆动，冲锋时低头，倒地侧躺
function renderTrike(t, dt) {
  const B = t.model.bones, sp = Math.hypot(t.vx, t.vz), s = t.state;
  t.walkPh += dt * (2.5 + sp * 2.1);
  const ph = t.walkPh;
  let amp = Math.min(1, sp / 3) * 0.6, head = 0, rz = 0, rx = 0, by = 0, jaw = 0.05, legs = null;
  if (s === 'charge') { amp = 0.95; head = 0.34; rx = 0.06; }
  else if (s === 'paw') { head = 0.3; }
  else if (s === 'gore') { head = t.st < 0.3 ? 0.42 : -0.55; jaw = 0.35; }
  else if (s === 'hurt') { head = -0.35; rz = 0.14; jaw = 0.45; }
  else if (s === 'down') { rz = 1.35; by = -0.36; amp = 0; jaw = 0.45; legs = 0.25; }
  else if (s === 'getup') { const k = Math.max(0, 1 - t.st / 0.6); rz = 1.35 * k; by = -0.36 * k; }
  else if (s === 'flee' && t.dazed) { amp = 0.9; head = -0.2 + Math.sin(G.t * 9) * 0.2; rz = Math.sin(G.t * 7) * 0.1; }
  else if (s === 'skid') { head = 0.18; rx = -0.1; }
  else if (s === 'idle') { head = Math.sin(G.t * 1.5 + t.id) * 0.06; }
  const k = dt <= 0 ? 0 : 1 - Math.exp(-dt * 14);
  B.body.rotation.z += (rz - B.body.rotation.z) * k;
  B.body.rotation.x += (rx - B.body.rotation.x) * k;
  B.body.position.y += (0.98 + by - B.body.position.y) * k;
  B.head.rotation.x += (head - B.head.rotation.x) * k;
  B.jaw.rotation.x += (jaw - B.jaw.rotation.x) * k;
  B.tail1.rotation.y = Math.sin(ph * 0.5) * 0.14; B.tail2.rotation.y = Math.sin(ph * 0.5 - 0.6) * 0.2;
  const sw = Math.sin(ph), cw = Math.cos(ph);
  const set = (n, u, l) => { B[n + 'U'].rotation.x = u; B[n + 'L'].rotation.x = l; };
  if (legs !== null) { for (const n of ['lf', 'rf', 'lb', 'rb']) set(n, legs, 0.2); }
  else {
    set('lf', sw * amp, Math.max(0, -cw) * amp * 0.9); set('rb', sw * amp, Math.max(0, -cw) * amp * 0.9);
    set('rf', -sw * amp, Math.max(0, cw) * amp * 0.9); set('lb', -sw * amp, Math.max(0, cw) * amp * 0.9);
    if (s === 'paw') set('rf', -0.75 + Math.sin(t.st * 16) * 0.45, 0.7);
  }
  const m = t.model.mat;
  if (m) { const f = t.flash > 0 ? 0.3 : 0; m.emissive.setRGB(f, f * 0.95, f * 0.85); }
}

// ---------- HUD 数据 ----------
export function hudState() {
  const p = G.player;
  let enemy = null;
  const lt = G.lastTarget;
  if (lt && !lt.removed && G.t - G.lastTargetT < 3) enemy = lt;
  else if (G.boss && G.boss.alive && G.mode !== 'cut') enemy = G.boss;
  return {
    hp: p ? Math.max(0, p.hp) : 0, maxHp: p ? p.maxHp : 100, lives: G.settings.lives === 'inf' ? '∞' : Math.max(0, G.lives),
    score: G.score, hi: Math.max(G.hi, G.score), hero: G.hero,
    weapon: p && p.weapon ? { kind: p.weapon.kind, ammo: p.weapon.ammo, name: ITEMS[p.weapon.kind].cn } : null,
    enemy: enemy ? { type: enemy.type, name: enemy.def ? enemy.def.name : enemy.type, cn: enemy.def ? enemy.def.cn : '', hp: Math.max(0, enemy.hp), maxHp: enemy.maxHp } : null,
    timer: G.timer, timerUnlimited: G.settings.demo, timerBig: G.timerShow > 0 || G.timer < 30, go: G.go > 0, mode: G.mode
  };
}

// ---------- 测试钩子 ----------
export const _test = {
  G,
  tp(x, z) { const p = G.player; p.x = x; if (z !== undefined) p.z = z; },
  hp(v) { G.player.hp = v; },
  killAll() { for (const e of G.actors) if (e !== G.player && e.alive && e.side === 'enemy' && e.type !== 'raptor' && !(e.type === 'shivat' && (e.state === 'sleep' || e.state === 'knocked'))) { e.hp = 0; knockdown(e, FACE_RIGHT, 1, true); } },
  hurtAll(d) { for (const e of G.actors) if (e !== G.player && e.alive && e.side === 'enemy') { e.hp -= d; if (e.hp <= 0) knockdown(e, FACE_RIGHT, 1, true); } },
  area(i) { loadArea(i); },
  stage(n) { loadArea(STAGES[n - 1].first, true); },
  wake() { if (G.sleeper) wakeShivat(G.sleeper); },
  sinkK,
  give(kind, ammo) { const p = G.player; p.weapon = { kind, ammo: ammo || ITEMS[kind].ammo }; attachWeapon(p); },
  // 叫敌人马上开枪（步枪兵 / 维斯），并读最近一枪的枪口与子弹终点
  shoot(id) { const e = G.actors.find(a => a.id === id); if (!e) return false; if (e.type === 'vice') { setState(e, 'gun'); e.st = 0.94; } else if (e.def && e.def.rifle) { setState(e, 'aim'); e.st = 0.61; e.sub.glint = true; } else return false; return true; },
  lastShot: () => G.lastShot || null,
  item(kind, dx) { const p = G.player; return spawnItem(kind, p.x + (dx || 0.3), p.z); },
  enemy(type, dx, dz) { const p = G.player; const e = spawnEnemy(type, p.x + (dx || 1.5), p.z + (dz || 0)); G.waveEnemies.push(e); return e.id; },
  setTimer(t) { G.timer = t; },
  bossHp(v) { if (G.boss) G.boss.hp = v; },
  skipScript() { while (G.script) stepScript(10); },
  actors: () => G.actors.map(a => ({ id: a.id, type: a.type, side: a.side, state: a.state, x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), hp: +(a.hp || 0).toFixed(1), alive: a.alive, face: +a.face.toFixed(2), token: a.token, nearK: a.nearK === undefined ? 1 : +a.nearK.toFixed(2), radius: a.radius, raptor: !!a.isRaptor, dino: !!a.isDino, waker: !!a.waker, swords: a.swords })),
  props: () => G.props.map(p => ({ kind: p.kind, x: p.x, z: p.z, broken: p.broken, hp: p.hp })),
  items: () => G.items.map(i => ({ kind: i.kind, x: +i.x.toFixed(2), z: +i.z.toFixed(2) }))
};
export function snapshot() {
  const p = G.player;
  return {
    mode: G.mode, t: +G.t.toFixed(2), area: G.area, areaId: AREAS[G.area] ? AREAS[G.area].id : null, stage: AREAS[G.area] ? AREAS[G.area].stage : 0, cleared: G.cleared.slice(), focusX: +G.focusX.toFixed(2), lockX: G.lockX, wave: G.wave, waveOn: G.waveOn, timer: +G.timer.toFixed(1),
    score: G.score, hi: G.hi, lives: G.settings.lives === 'inf' ? 'inf' : G.lives, settings: Object.assign({}, G.settings), demoUsed: G.demoUsed,
    player: p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), state: p.state, hp: +p.hp.toFixed(1), face: +p.face.toFixed(2), invul: +p.invul.toFixed(2), weapon: p.weapon ? Object.assign({}, p.weapon) : null, combo: p.comboN, visible: p.model.root.visible } : null,
    enemies: G.actors.filter(a => a.side === 'enemy' && a !== G.sleeper).length, boss: G.boss ? { type: G.boss.type, hp: G.boss.hp, state: G.boss.state, summons: G.boss.summons, swords: G.boss.swords } : null,
    sleeper: G.sleeper ? { state: G.sleeper.state, wakeN: G.sleeper.wakeN, hp: +G.sleeper.hp.toFixed(1), alive: G.sleeper.alive } : null, car: !!G.car, carMoving: !!G.carAnim, sink: p ? +sinkK(p.x).toFixed(2) : 0, raptor: G.raptor && !G.raptor.removed ? { state: G.raptor.state, angry: !!G.raptor.angry, hp: G.raptor.hp } : null,
    dialog: G.dialog ? G.dialog.text : null, banner: G.banner ? G.banner.text : null, kills: Object.assign({}, G.kills), items: G.items.length, props: G.props.filter(p => !p.broken).length, script: !!G.script, cont: G.cont ? G.cont.count : null, fade: +G.fade.toFixed(2)
  };
}
