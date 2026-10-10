// 第三关「地狱公路 HELL ROAD」专属玩法：3-1 的开场与接车过场；3-2 开着凯迪拉克一路撞过去、霍格的摩托战、车被炸毁之后的徒步战。
// 流程照原作实机录像：机修工把车开来 →「开这辆车走，会安全些」→ 画面自动向右卷，车在一屏之内自由移动，撞到谁谁飞
// → 霍格骑摩托出场扔手雷（落点有红圈预警），用车撞他 → 车挨够手雷爆炸，下车徒步：霍格来回冲撞、慢速经过时投弹，手下从两边上来。
// 公路只有一屏宽：地面与布景按车速向后卷（G.roadDist），所有贴地的东西（落地的人、掉落物、路障）也跟着向后挪。
import * as THREE from 'three';
import { rand, randRange, clamp, damp, lerp, faceOf, FACE_RIGHT, FACE_LEFT } from './core.js';
import { AREAS, ENEMY, ITEMS, HALF_W, ENTER_DX, ROAD } from './level.js';
import { buildCar, buildBike, bikeWheelGeo, tireGeo, meshFrom, itemMesh, toonMat } from './models.js';
import { HP, mod, runPose } from './anim.js';
import { propMesh } from './world.js';
import A from './audio.js';

let K = null;             // game.js 交过来的内部函数与对象（见 game.js init）
const objs = [];          // 飞出去的零件（轮胎、摩托、车轮）：自带一套简单的抛物运动
const nades = [];         // 霍格扔出的手雷（带落点红圈）
let pool = [];            // 路障池：进公路时按事件顺序一次建好，联机主客两边下标一致
let carMat = null;        // 凯迪拉克单独一份材质：挨炸时整车闪红
const ringGeo = new THREE.RingGeometry(0.62, 0.86, 24);
const SEATS = [[0.1, -0.42], [0.1, 0.42], [-1.0, -0.42], [-1.0, 0.42]];   // 相对车身中心：驾驶座、副驾、后排两座
// 霍格被打下车后上场的手下：[种类, 掉落]。原作这一段有拿冲锋枪的费里斯和端步枪的格特
const GANG = [['ferris', 'smg'], ['driver', null], ['gutter', 'rifle'], ['gneiss', 'hamburger'], ['ferris', 'smg'], ['driver', null]];

// 骑摩托的姿势：坐在座椅上、双手扶把；投弹时右臂后引再甩出；被车撞到时身子一歪
const ride = (H) => mod(HP.sit, { body: [0, 0, 0], spine: [0.32, 0, 0], head: [-0.24, 0, 0], lH: [-1.25, 0, 0.42], lK: [1.3, 0, 0], rH: [-1.25, 0, -0.42], rK: [1.3, 0, 0], lA: [0.3, 0, 0], rA: [0.3, 0, 0], lS: [-1.25, 0, 0.2], lE: [-0.3, 0, 0], rS: [-1.25, 0, -0.2], rE: [-0.3, 0, 0], hy: H > 2 ? -0.08 : 0.05, py: 0, pz: -0.33 });
const RIDE_HOGG = ride(2.08), RIDE_BIKER = ride(1.8);
const RIDE_WIND = mod(RIDE_HOGG, { spine: [0.12, 0.45, 0], head: [-0.1, -0.3, 0], rS: [-2.75, 0, -0.45], rE: [-1.0, 0, 0] });
const RIDE_THROW = mod(RIDE_HOGG, { spine: [0.42, -0.35, 0], rS: [-1.0, 0, 0.1], rE: [-0.1, 0, 0] });
const RIDE_HIT = mod(RIDE_HOGG, { spine: [-0.28, 0, 0.32], head: [-0.45, 0, 0.2], rS: [-0.5, 0, -0.95], lS: [-0.5, 0, 0.95] });

export function initHellRoad(api) { K = api; }
const flight = (vy, h) => (vy + Math.sqrt(vy * vy + 2 * K.GRAV * h)) / K.GRAV;   // 从 h 高处以 vy 起跳到落地的时间
function seat(pl, i, cx, cz) {
  if (pl.state !== 'incar') K.setState(pl, 'incar');
  const s = SEATS[i % SEATS.length];
  pl.x = cx + s[0]; pl.z = cz + s[1]; pl.y = 0.55; pl.vx = pl.vy = pl.vz = 0; pl.face = FACE_RIGHT;
}
function makeCar() {
  const car = buildCar();
  car.rotation.y = Math.PI / 2;   // 车头（模型 +Z）朝前进方向 +X
  if (!carMat) carMat = toonMat();
  carMat.color.setRGB(1, 1, 1); carMat.emissive.setRGB(0, 0, 0);
  car.traverse(o => { if (o.isMesh && !o.userData.outline) o.material = carMat; });
  K.scene.add(car);
  return car;
}
function spinWheels(car, v, dt) { for (const w of car.userData.wheels) w.rotation.x += v * dt / 0.36; }

// ---------- 3-1：开场 ----------
// 原作：黑屏上霍格的头像——「他们看起来正忙着，正是拿下杰克修车厂的好时候」→ 地图 WASTE LAND、EPISODE 3 HELL ROAD → 荒漠里四个手下蹲着等人
export function desertIntro(AR) {
  const G = K.G, p = G.player, ps = K.players();
  G.mode = 'cut'; G.fade = 1; G.banner = null;
  K.triggerWave(0);
  const gang = G.waveEnemies.slice();
  for (const e of gang) { e.sub.pose = 'crouch'; e.face = FACE_LEFT; }
  ps.forEach((pl, i) => { pl.x = AR.x0 + 0.4; pl.z = clamp(AR.start.z + i * 0.7, AR.z0 + 0.3, AR.z1 - 0.3); });
  A.music(null);
  K.runScript([
    { wait: 0.35 },
    { say: 'hogg', text: '嘿，那帮家伙正忙得团团转。趁现在，把杰克的修车厂拿下！', dur: 3.6 },
    { fn: () => {
      A.music(AR.id); K.banner('第三关 · 地狱公路', 'EPISODE 3 · HELL ROAD', 2.8);
      ps.forEach((pl, i) => K.setState(pl, 'cutwalk', { x: AR.start.x - i * 0.5, z: pl.z, face: FACE_RIGHT }));
    } },
    { fade: 0, dur: 0.7 },
    { until: () => p.state !== 'cutwalk', max: 3 },
    { fn: () => { for (const e of gang) if (e.alive) e.sub.pose = null; } },   // 发现来人，站起来
    { wait: 0.5 },
    { fn: () => {
      for (const e of G.waveEnemies) if (e.alive && e.state === 'cut') { K.setState(e, 'idle'); e.cd = 0.2 + rand() * 0.7; }
      G.mode = 'play'; K.ev('desertStart');
    } }
  ]);
}

// ---------- 3-1 → 3-2：机修工开着凯迪拉克赶到 ----------
export function carArrive() {
  const G = K.G, p = G.player, ps = K.players(), AR = AREAS[G.area], to = AR.exit.to;
  G.mode = 'cut';
  for (const pl of ps) if (pl.grab) K.releaseGrab(pl);
  const cz = -1.15, cx = clamp(p.x - 1.2, G.focusX - HALF_W + 3.4, G.focusX + HALF_W - 3.6), x0 = G.focusX - HALF_W - 6;
  const car = makeCar(); car.position.set(x0, 0, cz); G.car = car;
  const m = K.makeActor('mechanic', 'npc', { x: x0 + 0.1, z: cz - 0.42, y: 0.55, face: FACE_RIGHT, hp: 1, maxHp: 1, noClamp: true });
  K.setState(m, 'incar');
  A.play('engine');
  const T = 0.55, vy = 7.6;   // 翻身跳上车：0.55 秒后正好落到座位的高度
  let v = 0;
  K.runScript([
    { fn: () => {
      // 主角走到车尾前面等着（顺便让开车要停的那条道）
      ps.forEach((pl, i) => { if (pl.alive) K.setState(pl, 'cutwalk', { x: cx - 1.9 + (i >> 1) * 0.7, z: cz + 2.0 + (i % 2) * 0.6 + (i >> 1) * 0.3 }); });
      G.carAnim = { t: 0, dur: 1.7, x0, x1: cx };
    } },
    { dur: 1.8, tick: () => { m.x = car.position.x + 0.1; } },
    { fn: () => {
      G.blockers = [-1.5, 0.1, 1.6].map(d => ({ x: cx + d, z: cz, r: 1.0 }));
      K.setState(m, 'leave'); m.y = 1.0; m.vy = 6.2;
      const ft = flight(6.2, 1.0); m.vx = (cx - 3.25 - m.x) / ft; m.vz = (cz + 2.0 - m.z) / ft; A.play('jump');
    } },
    { until: () => m.y <= 0, max: 2 },
    { fn: () => { m.vx = m.vz = 0; K.setState(m, 'cut'); m.sub.pose = 'stand'; A.play('land', 0.6); } },
    { until: () => ps.every(pl => pl.state !== 'cutwalk'), max: 2.5 },
    { fn: () => {
      for (const pl of ps) if (pl.alive && ['idle', 'walk', 'cutwalk'].indexOf(pl.state) >= 0) { K.setState(pl, 'idle'); pl.vx = pl.vz = 0; pl.face = m.x < pl.x ? FACE_LEFT : FACE_RIGHT; }
    } },
    { say: 'mechanic', text: '开这辆车走，会安全些。上吧！', dur: 2.8 },
    { fn: () => {
      G.blockers = [];
      ps.forEach((pl, i) => {
        if (!pl.alive) return;
        const s = SEATS[i % SEATS.length];
        K.setState(pl, 'jump', { noAtk: true, flip: T }); pl.y = 0.01; pl.vy = vy; pl.vx = (cx + s[0] - pl.x) / T; pl.vz = (cz + s[1] - pl.z) / T; pl.face = FACE_RIGHT;
      });
      A.play('jump'); K.ev('carBoard');
    } },
    { wait: T },
    { fn: () => { ps.forEach((pl, i) => { if (pl.alive) seat(pl, i, cx, cz); }); A.play('engine'); m.sub.pose = 'victory'; } },
    { wait: 0.3 },
    { dur: 1.15, tick: (dt, u) => {
      v = Math.min(15, v + 16 * dt); car.position.x += v * dt; spinWheels(car, v, dt);
      ps.forEach((pl, i) => { if (pl.alive) seat(pl, i, car.position.x, cz); });
      if (Math.random() < 0.4) K.fx.dust(car.position.x - 2.4, 0, cz + (Math.random() < 0.5 ? 0.8 : -0.8), 1, 0.3);
      G.fade = clamp((u - 0.6) / 0.4, 0, 1);
    } },
    { fn: () => { K.loadArea(to); } },
    { fade: 0, dur: 0.5 }
  ]);
  K.ev('carArrive');
}

// ---------- 3-2：公路 ----------
function clearRoad() {
  for (const o of objs) K.scene.remove(o.m);
  objs.length = 0;
  for (const n of nades) { K.scene.remove(n.m, n.ring); n.ring.material.dispose(); }
  nades.length = 0;
  pool = [];
}
// 离开公路（换区域、回标题、重开）时清掉这一关挂在场景里的东西
export function reset() {
  if (!K) return;
  clearRoad();
  const G = K.G;
  G.roadPhase = ''; G.roadV = 0; G.roadDist = 0; G.roadT = 0; G.roadDusk = 0; G.carCalled = false;
}
export function startRoad(AR) {
  const G = K.G, ps = K.players();
  clearRoad();
  G.roadPhase = 'run'; G.roadT = 0; G.roadDist = 0; G.roadV = ROAD.speed; G.roadDusk = 0; G.roadEv = 0; G.roadPool = 0;
  G.carMax = ROAD.carHits[G.settings.dur] || 4; G.carHp = G.carMax; G.carFlash = 0; G.carInv = 0; G.ramCd = 0;
  G.carX = -3.4; G.carZ = AR.start.z; G.carVx = 0; G.carVz = 0;
  G.gangN = 0; G.gangCd = 0; G.smokeT = 0; G.dustT = 0; G.humT = 0; G.endT = 0; G.endJump = false;
  G.car = makeCar(); G.car.position.set(G.carX, 0, G.carZ);
  ps.forEach((pl, i) => seat(pl, i, G.carX, G.carZ));
  for (const e of ROAD.events) {
    if (e.k === 'man' || e.k === 'bike') continue;
    const pr = { kind: e.k, x: 999, z: e.z, item: e.item || null, points: e.k === 'tires' ? 300 : 500, hp: 1, r: e.k === 'tires' ? 0.5 : 0.4, mesh: propMesh(e.k), shake: 0, broken: false, parked: true };
    K.markTree(pr.mesh); pr.mesh.position.set(999, 0, e.z); pr.mesh.visible = false; K.scene.add(pr.mesh);
    G.props.push(pr); pool.push(pr);
  }
  G.mode = 'play';
  A.music(AR.id);
  const W = K.world.area(); if (W.setDusk) W.setDusk(0); if (W.scroll) W.scroll(0);
  K.ev('roadStart');
}
const driving = () => K.G.roadPhase === 'run' || K.G.roadPhase === 'hogg';
const overlapCar = (x, z, r) => Math.abs(x - K.G.carX) < ROAD.carL + r && Math.abs(z - K.G.carZ) < ROAD.carW + r;

// 飞出去的零件：m 网格，o = { vx, vy, vz, sx / sz 自转（绕本地 X / Z），r 触地半径 }
function fling(m, x, y, z, o) {
  m.rotation.order = 'YXZ'; m.position.set(x, y, z);
  K.scene.add(m);
  objs.push({ m, x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, sx: o.sx || 0, sz: o.sz || 0, r: o.r || 0.3, t: 0 });
}
function updateObjs(dt) {
  const G = K.G;
  for (const o of objs.slice()) {
    o.t += dt; o.vy -= 22 * dt;
    const ground = o.y <= o.r + 0.02;
    o.x += (o.vx - G.roadV * (ground ? 1 : 0.3)) * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy) > 1.6 ? -o.vy * 0.45 : 0; o.vx *= 0.7; o.vz *= 0.7; o.sx *= 0.7; o.sz *= 0.7; }
    o.m.position.set(o.x, o.y, o.z); o.m.rotation.x += o.sx * dt; o.m.rotation.z += o.sz * dt;
    if (o.x < -6 || o.x > 24 || o.t > 7) { K.scene.remove(o.m); objs.splice(objs.indexOf(o), 1); }
  }
}
// 摩托被撞 / 被打爆：车身翻着飞出去，两只轮子各自滚开
function wreckBike(kind, x, z, face, power) {
  const pw = power || 1, holder = new THREE.Group(), bike = buildBike(kind);
  for (const w of bike.userData.wheels) bike.remove(w);
  bike.rotation.y = face; holder.add(bike);
  fling(holder, x, 0.5, z, { vx: randRange(0.5, 3) * pw, vy: randRange(7, 9.5) * pw, vz: randRange(-1.2, 1.2), sz: -7.5, r: 0.45 });
  for (const s of [1, -1]) {
    const w = meshFrom(bikeWheelGeo(kind), { thin: true }); w.rotation.y = face;
    fling(w, x + Math.sin(face) * s * 1.1, 0.4, z + Math.cos(face) * s * 1.1, { vx: s * randRange(2, 5) + 2, vy: randRange(4, 7), vz: randRange(-2.5, 2.5), sx: 12, r: 0.37 });
  }
  K.fx.debris(x, 0.7, z, kind === 'hogg' ? '#7a3a9a' : '#d85a9c', 8, 0.16, 4);
}

// ---------- 路上的敌人与路障 ----------
function spawnEvents() {
  const G = K.G, x = AREAS[G.area].x1 + 2.4;
  while (G.roadEv < ROAD.events.length && ROAD.events[G.roadEv].t <= G.roadT) {
    const e = ROAD.events[G.roadEv++];
    if (e.k === 'man') {
      const a = K.spawnEnemy(e.type, x, e.z);
      a.road = { pose: e.pose, t: 0 }; a.noClamp = true; a.face = FACE_LEFT; K.setState(a, 'road');
    } else if (e.k === 'bike') {
      const a = K.spawnEnemy('biker', x, e.z);
      a.road = { bike: true, t: 0, ph: rand() * 6 }; a.noClamp = true; a.face = FACE_RIGHT; K.setState(a, 'road');
    } else {
      const pr = pool[G.roadPool++];
      if (pr) { pr.parked = false; pr.x = x; pr.mesh.position.x = x; pr.mesh.visible = true; }
    }
  }
}
// 站在路上的人、迎面跑来扑车的人、骑在前面的飞车党：撞上就飞；车躲开了他们就被甩到后面
export function updateActor(a, dt) {
  const G = K.G, R = a.road, dxCar = a.x - G.carX;
  R.t += dt;
  let own = 0;
  if (R.bike) {
    own = ROAD.speed - 4.6;   // 比凯迪拉克慢，被一点点追上
    a.z = clamp(a.z + Math.sin(R.t * 1.7 + R.ph) * 0.55 * dt, AREAS[G.area].z0, AREAS[G.area].z1);
  } else {
    if (R.pose === 'squat' && dxCar < 7) R.pose = 'stand';   // 车到跟前才站起来
    if (R.pose === 'run' || R.pose === 'leap') own = -3.4;
    if (R.pose === 'leap' && !R.leapt && dxCar < 5.4 && dxCar > 0) { R.leapt = true; a.vy = 6.4; a.y = 0.01; }
    if (R.leapt) own = -5;
    a.walkPh += dt * 13;
  }
  a.vx = a.vz = 0; a.x += (own - G.roadV) * dt;
  if (G.car && driving() && a.y < 1.5 && overlapCar(a.x, a.z, R.bike ? 0.5 : a.radius)) { runOver(a); return; }
  if (a.x < -3.5) { a.alive = false; K.removeActor(a); }
}
function runOver(a) {
  const G = K.G, bike = !!a.road.bike, side = Math.sign(a.z - G.carZ) || (rand() < 0.5 ? 1 : -1);
  if (bike) { wreckBike('biker', a.x, a.z, a.face); a.bike.visible = false; a.rider = false; a.model.root.rotation.z = 0; }
  a.road = null; a.roadBody = true;
  K.fx.hit(a.x - 0.3, 1.0, a.z, 2, FACE_RIGHT); A.play('kickHeavy');
  a.hp = 0; a.lastHitBy = G.player;
  K.knockdown(a, FACE_RIGHT, 1, true);   // 计分、惨叫、掉落都走击倒的老路
  a.vy = randRange(7.5, 10.5) * (bike ? 1.15 : 1); a.vx = randRange(1.5, 5); a.vz = side * randRange(0.6, 2.8);
  G.lastTarget = a; G.lastTargetT = G.t; G.stats.runOver = (G.stats.runOver || 0) + 1;
  K.ev('runOver', { enemy: a.type });
}
function smashProp(pr) {
  if (pr.kind !== 'tires') { K.hitProp(pr, 99); return; }
  pr.broken = true; K.scene.remove(pr.mesh);
  A.play('bodyfall'); K.fx.hit(pr.x, 0.7, pr.z, 1, FACE_RIGHT);
  for (let i = 0; i < 5; i++) fling(meshFrom(tireGeo(), { thin: true }), pr.x, 0.25 + i * 0.2, pr.z, { vx: randRange(1, 7), vy: randRange(4, 9), vz: randRange(-3, 3), sx: randRange(-6, 6), sz: randRange(6, 12), r: 0.3 });
  K.addScore(pr.points, pr.x, 1.9, pr.z);
  K.ev('prop', { kind: 'tires' });
}
// 贴地的东西跟着地面向后挪；车碰到路障就撞碎、碾过掉落物就收下
function scrollThings(dt) {
  const G = K.G, on = !!G.car && driving(), d = G.roadV * dt;
  if (d <= 0) return;
  for (const pr of G.props) {
    if (pr.broken || pr.parked) continue;
    pr.x -= d;
    if (on && overlapCar(pr.x, pr.z, pr.r)) smashProp(pr);
    else if (pr.x < -3) { pr.broken = true; K.scene.remove(pr.mesh); }
  }
  for (const it of G.items.slice()) {
    it.x -= d;
    if (on && it.t > 0.2 && it.y < 1.3 && overlapCar(it.x, it.z, 0.3)) { const def = ITEMS[it.kind]; K.addScore(def.points || 200, it.x, 1.7, it.z); A.play('coin'); K.removeItem(it); }
    else if (it.x < -3) K.removeItem(it);
  }
  for (const a of G.actors) {
    if (!a.roadBody || a.removed) continue;
    a.x -= d * (a.y > 0.05 ? 0.3 : 1);
    if (a.x < -4) K.removeActor(a);
  }
}

// ---------- 凯迪拉克 ----------
function driveCar(dt) {
  const G = K.G, AR = AREAS[G.area], car = G.car, ps = K.players();
  let mx = 0, mz = 0;
  if (G.mode === 'play') for (const pl of ps) { if (!pl.alive) continue; const mv = K.moveOf(pl); mx += mv.x; mz += mv.z; }   // 车上谁都能打方向
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const intro = G.roadPhase === 'run' && G.roadT < 0.9;   // 刚开进画面：自己开到起始位置
  let tx = mx * 7.5, tz = mz * 5.2;
  if (intro) { tx = clamp((AR.start.x - G.carX) * 4, 0, 11); tz = 0; }
  G.carVx += (tx - G.carVx) * damp(7, dt); G.carVz += (tz - G.carVz) * damp(8, dt);
  G.carX += G.carVx * dt; G.carZ += G.carVz * dt;
  if (!intro) { const cx = clamp(G.carX, ROAD.x0, ROAD.x1); if (cx !== G.carX) { G.carX = cx; G.carVx = 0; } }
  const czc = clamp(G.carZ, ROAD.z0, ROAD.z1); if (czc !== G.carZ) { G.carZ = czc; G.carVz = 0; }
  car.position.set(G.carX, Math.abs(Math.sin(G.roadDist * 0.9)) * 0.018, G.carZ);
  car.rotation.y = Math.PI / 2 - G.carVz * 0.035;   // 打方向时车头微微偏过去
  spinWheels(car, G.roadV + G.carVx, dt);
  ps.forEach((pl, i) => { if (pl.alive) seat(pl, i, G.carX, G.carZ); });
  // 车尾扬尘；车受损后引擎盖冒烟（越接近爆炸越浓）
  G.dustT -= dt;
  if (G.dustT <= 0) { G.dustT = 0.07; K.fx.trail(G.carX - 2.5, 0.12, G.carZ + (Math.random() < 0.5 ? 0.85 : -0.85), -G.roadV * 0.55, 0.3, 0xd9b08a, 0.5); }
  if (G.carHp < G.carMax) {
    G.smokeT -= dt;
    if (G.smokeT <= 0) { const bad = G.carHp <= 1; G.smokeT = bad ? 0.05 : 0.12; K.fx.trail(G.carX + 1.5 + Math.random() * 0.6, 1.05, G.carZ + (Math.random() - 0.5) * 0.8, -G.roadV * 0.4, bad ? 0.5 : 0.36, bad ? 0x4a4642 : 0xe6e6e6, 0.7, 1.6); }
  }
  G.humT -= dt; if (G.humT <= 0) { G.humT = 1.5; A.play('carHum'); }
  if (G.carFlash > 0) G.carFlash -= dt;
  if (G.carInv > 0) G.carInv -= dt;
  if (G.ramCd > 0) G.ramCd -= dt;
}
function carHit() {
  const G = K.G;
  if (G.carInv > 0 || !driving()) return;
  G.carFlash = 0.6; G.carInv = 1.1;
  K.ev('carHit', { hp: G.carHp - (G.settings.demo ? 0 : 1) });
  if (G.settings.demo) return;   // 演示模式：车也不掉耐久
  G.carHp--;
  // 车上的人跟着挨一下，但不会在车里倒下：车炸了才下车
  for (const pl of K.players()) if (pl.alive) { pl.hp = Math.max(1, pl.hp - 7 * K.DUR_MUL[G.settings.dur]); pl.flash = 0.1; }
  G.hurtFx = 0.7; G.stats.hits++; A.play('hurtP');
  if (G.carHp <= 0) carExplode();
  else if (G.carHp === 1) K.toast('凯迪拉克快撑不住了！');
}
function carExplode() {
  const G = K.G, fx = K.fx, ps = K.players(), car = G.car, h = G.boss;
  G.roadPhase = 'wreck';
  for (let i = 0; i < 4; i++) fx.boom(G.carX + (i - 1.5) * 1.3, 0.3, G.carZ + (i % 2 ? 0.4 : -0.4), 1.3);
  A.play('boom'); fx.text(G.carX, 2.6, G.carZ, 'BOOM!', '#ff9a2a', 2.2);
  fx.debris(G.carX, 0.9, G.carZ, '#9db6c8', 16, 0.3, 6); fx.debris(G.carX, 0.9, G.carZ, '#3a3a3a', 10, 0.22, 5);
  const wp = new THREE.Vector3();
  for (const w of car.userData.wheels.slice()) {   // 四只车轮飞出去
    w.getWorldPosition(wp); car.remove(w); w.rotation.set(0, Math.PI / 2, 0);
    fling(w, wp.x, wp.y, wp.z, { vx: randRange(-3, 6), vy: randRange(5, 9), vz: (wp.z > G.carZ ? 1 : -1) * randRange(1.5, 4), sx: 12, r: 0.36 });
  }
  K.scene.remove(car); G.car = null;
  ps.forEach((pl, i) => {   // 人被掀下车，摔出去再爬起来（这一下不另外扣血）
    if (!pl.alive) return;
    pl.y = 1.0; K.knockdown(pl, FACE_RIGHT + (i % 2 ? 0.7 : -0.7) * (1 + (i >> 1) * 0.4), 1.2, false); pl.invul = 2.8;
  });
  G.lockX = G.focusX;   // 之后是一屏之内的徒步战
  G.gangCd = 2.2;
  if (h && h.alive) { h.ai.mode = 'exit'; h.ai.throwT = -1; h.ai.stag = 0; h.dmgMul = 1.5; }
  K.toast('凯迪拉克被炸毁了！下车接着打！');
  K.ev('carWreck');
}

// ---------- 霍格 ----------
function hoggEnter() {
  const G = K.G, AR = AREAS[G.area], def = ENEMY.hogg;
  G.roadPhase = 'hogg';
  const h = K.makeActor('hogg', 'enemy', { def, x: AR.x1 + 3, z: clamp(G.carZ + 2.0, AR.z0, AR.z1), hp: def.hp, maxHp: def.hp, face: FACE_RIGHT, noClamp: true });
  K.setState(h, 'ride');
  h.ai = { mode: 'slot', slot: 'ahead', slotT: 2.4, off: 0.5, cd: 1.5, throwT: -1, thrown: false, stag: 0, safe: 0, slowT: 0, vx: 0, vz: 0, n: 0, lean: 0 };
  G.boss = h; G.timer = 180; G.timerShow = 2.5;
  A.music('boss3'); K.banner('BOSS', 'HOGG 霍格', 1.8); A.play('bikeRev');
  K.ev('bossStart', { boss: 'hogg' });
}
function startThrow(h, tx, tz) { const ai = h.ai; ai.throwT = 0; ai.thrown = false; ai.tx = tx; ai.tz = tz; }
function lob(h, tx, tz) {
  const m = itemMesh('grenade'); m.scale.setScalar(1.7); K.scene.add(m);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; K.scene.add(ring);
  nades.push({ m, ring, owner: h, x0: h.x + Math.sin(h.face) * 0.3, y0: 1.95, z0: h.z, x1: tx, z1: tz, t: 0, T: 0.95, h: 2.6 });
  A.play('whoosh'); K.ev('grenade', { x: +tx.toFixed(1), z: +tz.toFixed(1) });
}
function removeNade(n) { K.scene.remove(n.m, n.ring); n.ring.material.dispose(); nades.splice(nades.indexOf(n), 1); }
function updateNades(dt) {
  const G = K.G, fx = K.fx;
  for (const n of nades.slice()) {
    n.t += dt;
    const u = Math.min(1, n.t / n.T);
    n.m.position.set(lerp(n.x0, n.x1, u), n.y0 * (1 - u) + 4 * n.h * u * (1 - u), lerp(n.z0, n.z1, u)); n.m.rotation.x += dt * 11;
    const s = 1.5 - 0.6 * u; n.ring.position.set(n.x1, 0.04, n.z1); n.ring.scale.set(s, s, 1); n.ring.material.opacity = 0.3 + 0.6 * u * (0.6 + 0.4 * Math.sin(n.t * 30));
    if (u < 1) continue;
    const x = n.x1, z = n.z1;
    removeNade(n);
    fx.boom(x, 0, z, 0.85); A.play('boom'); fx.text(x + 0.2, 1.5, z + 0.3, 'BOOM!', '#ff9a2a', 1.5);
    if (G.car && driving()) {
      // 炸点贴着车身才算炸中：把车开离红圈就躲得掉
      const dx = Math.max(0, Math.abs(x - G.carX) - ROAD.carL), dz = Math.max(0, Math.abs(z - G.carZ) - ROAD.carW);
      if (Math.hypot(dx, dz) < 0.8) carHit();
    } else {
      // 徒步：炸到谁算谁，霍格的手下也照炸
      for (const e of G.actors.slice()) {
        if (e === n.owner || !K.hittable(e) || e.y > 1.6) continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < 1.55 + e.radius) K.applyHit(n.owner, e, K.H(0, 0, 0, 0, 0, 3, (e.side === 'player' ? 16 : 30) * (1 - d / 3.6), 'launch', 0, 'punchHeavy', true), faceOf(e.x - x, e.z - z), true);
      }
    }
  }
}
export function updateHogg(h, dt) {
  const G = K.G, ai = h.ai;
  if (!h.alive || !ai) return;
  h.vx = h.vz = 0;
  if (ai.stag > 0) ai.stag -= dt;
  if (G.roadPhase === 'hogg') hoggCar(h, ai, dt); else hoggFoot(h, ai, dt);
  if (ai.throwT >= 0) {
    ai.throwT += dt;
    if (!ai.thrown && ai.throwT >= 0.32) { ai.thrown = true; lob(h, ai.tx, ai.tz); }
    if (ai.throwT > 0.62) ai.throwT = -1;
  }
}
// 开车阶段：霍格在车前、车后、车的里外两侧换位置，隔一两秒朝车扔一颗手雷；被车撞到就掉血、被顶开
function hoggCar(h, ai, dt) {
  const G = K.G, AR = AREAS[G.area], zLo = AR.z0 - 0.15, zHi = AR.z1 + 0.3;
  const ok = { ahead: G.carX + 4.7 <= AR.x1 - 0.8, behind: G.carX - 4.9 >= AR.x0 + 0.8, far: G.carZ - 2.05 >= zLo, near: G.carZ + 2.05 <= zHi };
  ai.slotT -= dt;
  if (ai.slotT <= 0 || !ok[ai.slot]) {
    const opts = Object.keys(ok).filter(s => ok[s] && s !== ai.slot);
    ai.slot = opts[Math.floor(rand() * opts.length)] || ai.slot; ai.slotT = randRange(2.0, 3.2); ai.off = randRange(-1, 1);
  }
  let tx, tz;
  if (ai.slot === 'ahead') { tx = G.carX + 4.7; tz = G.carZ + ai.off * 0.6; }
  else if (ai.slot === 'behind') { tx = G.carX - 4.9; tz = G.carZ + ai.off * 0.6; }
  else { tx = G.carX + ai.off * 1.5; tz = G.carZ + (ai.slot === 'far' ? -2.05 : 2.05); }
  // 要换到车的另一头时不从车身里穿过去：先拐到车的一侧再超过去
  const lane = Math.abs(h.z - G.carZ) < ROAD.carW + 0.95, across = (tx - G.carX) * (h.x - G.carX) < 0 || Math.abs(h.x - G.carX) < ROAD.carL + 0.9;
  if ((ai.slot === 'ahead' || ai.slot === 'behind') && across) { const s = ok.near && (!ok.far || h.z >= G.carZ) ? 1 : -1; tz = G.carZ + s * 2.05; if (lane) tx = h.x; }
  tx = clamp(tx, AR.x0 + 0.8, AR.x1 - 0.8); tz = clamp(tz, zLo, zHi);
  // 平时车要追一阵才贴得上他；抬手投弹的前后他会慢下来，这时最好撞。把他挤到画面边上也跑不掉
  if (ai.slowT > 0) ai.slowT -= dt;
  if (ai.safe > 0) ai.safe -= dt;
  const busy = ai.throwT >= 0 || ai.slowT > 0, vx = busy ? 3.0 : 7.0, vz = busy ? 2.0 : 4.0;
  const k = ai.stag > 0 ? damp(1.5, dt) : damp(5, dt);
  ai.vx += (clamp((tx - h.x) * 3.2, -vx, vx) - ai.vx) * k; ai.vz += (clamp((tz - h.z) * 3.2, -vz, vz) - ai.vz) * k;
  h.x = clamp(h.x + ai.vx * dt, AR.x0 - 1, AR.x1 + 4); h.z = clamp(h.z + ai.vz * dt, zLo, zHi);
  h.face = FACE_RIGHT; ai.lean = ai.vz * 0.07;
  // 投弹：瞄车此刻的位置再加一点提前量
  ai.cd -= dt;
  if (ai.cd <= 0 && ai.stag <= 0 && ai.throwT < 0 && h.x < AR.x1 + 0.5) {
    const hp = h.hp / h.maxHp;
    ai.cd = lerp(1.45, 2.3, hp) + rand() * 0.6; ai.slowT = 1.0;
    startThrow(h, clamp(G.carX + G.carVx * 0.45 + randRange(-0.8, 0.8), 1.2, AR.x1 - 1.2), clamp(G.carZ + G.carVz * 0.45 + randRange(-0.45, 0.45), AR.z0, AR.z1));
  }
  if (G.car && overlapCar(h.x, h.z, 0.7)) ram(h);
}
function ram(h, force) {
  const G = K.G, ai = h.ai;
  const px = ROAD.carL + 0.7 - Math.abs(h.x - G.carX), pz = ROAD.carW + 0.7 - Math.abs(h.z - G.carZ);
  const sx = Math.sign(h.x - G.carX) || 1, sz = Math.sign(h.z - G.carZ) || 1, side = pz < px * 0.6;
  // 车朝他压过去才算撞；他自己蹭上来、或者刚被撞开还没缓过来，只是被顶开，不掉血
  const closing = side ? G.carVz * sz : G.carVx * sx;
  if (side) h.z += sz * pz; else h.x += sx * px;
  if (!force && (closing < 1.0 || G.ramCd > 0 || ai.safe > 0)) { if (side) ai.vz = Math.max(ai.vz * sz, G.carVz * sz, 1.5) * sz; else ai.vx = Math.max(ai.vx * sx, G.carVx * sx, 1.5) * sx; return; }
  G.ramCd = 0.6;
  if (side) { ai.vz = sz * 6.5; K.fx.hit(h.x, 0.9, G.carZ + sz * ROAD.carW, 2, sz > 0 ? 0 : Math.PI); }
  else { ai.vx = sx * 10; K.fx.hit(G.carX + sx * ROAD.carL, 0.9, h.z, 2, sx > 0 ? FACE_RIGHT : FACE_LEFT); }
  ai.stag = 0.7; ai.safe = 1.5; ai.slotT = 0.5; ai.slowT = 0; ai.throwT = -1;   // 正抬手要扔的那一颗也被撞掉
  h.hp -= ROAD.ram; h.flash = 0.12;
  G.lastTarget = h; G.lastTargetT = G.t; G.stats.rams = (G.stats.rams || 0) + 1;
  A.play('metal'); A.play('punchHeavy'); K.addScore(500, h.x, 2.6, h.z);
  K.ev('ram', { hp: Math.max(0, Math.round(h.hp)) });
  if (h.hp <= 0) { h.hp = 0; riderDown(h, sx > 0 ? FACE_RIGHT : FACE_LEFT); }
}
// 徒步阶段：霍格在画面两头进出。一趟猛冲（对着主角那一排撞过来，起跳或换一排躲开）、一趟慢速经过（骑到主角斜前方停下来投弹，这时最好打）交替
function hoggFoot(h, ai, dt) {
  const G = K.G, AR = AREAS[G.area], p = G.player, L = -4.6, R = AR.x1 + 4.6, low = h.hp < h.maxHp * 0.45;
  switch (ai.mode) {
    case 'slot': case 'exit':   // 车刚炸：先冲出画面右边
      ai.vx += (12.5 - ai.vx) * damp(4, dt); h.x += ai.vx * dt; h.face = FACE_RIGHT; ai.lean = 0;
      if (h.x > R) { ai.mode = 'away'; ai.side = 1; ai.wait = 1.3; ai.next = null; ai.warned = false; }
      break;
    case 'away': {
      ai.wait -= dt;
      if (!ai.next) {
        ai.n++;
        const cruise = ai.n % 2 === 0;
        ai.next = { kind: cruise ? 'cruise' : 'charge', z: clamp(cruise ? p.z + (p.z > 0.8 ? -1 : 1) * randRange(1.7, 2.3) : p.z + randRange(-0.25, 0.25), AR.z0, AR.z1) };
      }
      if (ai.wait <= 0.65 && !ai.warned) {   // 进场前在他要冲出来的那一头亮一个「!」
        ai.warned = true;
        const ex = ai.side > 0 ? AR.x1 - 0.9 : 0.9;
        K.fx.text(ex, 1.7, ai.next.z, '!', '#ffd84a', 1.0); K.fx.dust(ex + ai.side * 0.5, 0, ai.next.z, 3, 0.4); A.play('bikeRev', 0.9);
      }
      if (ai.wait <= 0) { ai.mode = ai.next.kind; h.z = ai.next.z; h.x = ai.side > 0 ? R : L; ai.dir = -ai.side; ai.hitIds = new Set(); ai.cd = 0.5; ai.next = null; ai.warned = false; ai.stopT = undefined; }
      break;
    }
    case 'charge': case 'cruise': {
      const cruise = ai.mode === 'cruise';
      let sp = low ? 13.5 : 11.5;
      if (cruise) {
        // 慢速经过：骑到主角斜前方刹住，先朝主角脚下扔一颗（往他身边躲正好凑上去打），停两秒，临走再扔一颗，轰油门走人
        if (ai.stopT === undefined) { ai.stopX = clamp(p.x - ai.dir * 3.0, 2.4, AR.x1 - 2.4); ai.stopT = low ? 2.0 : 2.3; ai.sp = 5.5; ai.left = 2; ai.cd = 9; }
        const before = ai.dir > 0 ? h.x < ai.stopX : h.x > ai.stopX;
        if (before || ai.stopT <= 0) ai.sp += ((ai.stopT <= 0 ? 9.5 : 5.5) - ai.sp) * damp(3, dt);
        else { if (ai.cd > 5) ai.cd = 0.25; ai.sp += (0 - ai.sp) * damp(7, dt); ai.stopT -= dt; }
        sp = ai.sp;
      }
      h.face = ai.dir > 0 ? FACE_RIGHT : FACE_LEFT; h.x += ai.dir * sp * dt; ai.vx = sp; ai.lean = 0;
      const inView = h.x > 0.6 && h.x < AR.x1 - 0.6;
      ai.cd -= dt;
      if (ai.cd <= 0 && ai.throwT < 0 && inView && (cruise ? ai.left > 0 : low)) {
        if (cruise) { ai.left--; ai.cd = Math.max(0.9, ai.stopT - 0.45); } else ai.cd = 9;
        startThrow(h, clamp(p.x + p.vx * 0.5 + randRange(-0.5, 0.5), 0.8, AR.x1 - 0.8), clamp(p.z + p.vz * 0.5 + randRange(-0.3, 0.3), AR.z0, AR.z1));
      }
      if (sp > 3) for (const pl of K.players()) {   // 撞人：同一排、没跳起来的才会被撞
        if (!pl.alive || !K.hittable(pl) || ai.hitIds.has(pl.id)) continue;
        if (Math.abs(pl.x - h.x) < 0.95 && Math.abs(pl.z - h.z) < 0.62 && pl.y < 0.95) { ai.hitIds.add(pl.id); K.applyHit(h, pl, K.H(0, 0, 0, 0, 0, 2, cruise ? 8 : 11, 'launch', 0, 'punchHeavy', true), h.face); }
      }
      if (!cruise && Math.random() < 0.5) K.fx.dust(h.x - ai.dir * 1.0, 0, h.z, 1, 0.3);
      if ((ai.dir > 0 && h.x > R) || (ai.dir < 0 && h.x < L)) { ai.mode = 'away'; ai.side = ai.dir; ai.wait = randRange(0.75, 1.15); }
      break;
    }
  }
}
// 骑手被打到没血（霍格）：摩托炸开，人摔出去；之后按 Boss 被打倒的老流程走
export function riderDown(h, dir) {
  if (h.type !== 'hogg' || !h.rider) return;
  const G = K.G, fx = K.fx, inCar = G.roadPhase === 'hogg';
  h.rider = false; h.bike.visible = false; h.noClamp = false; h.keepBody = true; h.model.root.rotation.z = 0;
  wreckBike('hogg', h.x, h.z, h.face, 1.1);
  fx.boom(h.x, 0.5, h.z, 1.2); A.play('boom'); fx.text(h.x, 2.3, h.z, 'BOOM!', '#ff9a2a', 1.8);
  for (const n of nades.slice()) removeNade(n);
  for (const a of G.actors) if (a.road) { a.road = null; a.roadBody = true; }
  G.roadPhase = inCar ? 'end' : 'done'; G.endT = 0; G.endJump = false;
  K.knockdown(h, dir, 1.4, true);
}
// 霍格在车上就被撞死：主角们翻身跳下车，凯迪拉克自己开走
function updateEnd(dt) {
  const G = K.G, ps = K.players(), car = G.car;
  G.endT += dt;
  if (!G.endJump && G.endT > 0.45) {
    G.endJump = true;
    ps.forEach((pl, i) => {
      if (!pl.alive || pl.state !== 'incar') return;
      K.setState(pl, 'jump', { noAtk: true, flip: 0.6 }); pl.y = 0.9; pl.vy = 6.0; pl.vx = 0.8 - (i >> 1);
      pl.vz = (G.carZ > 1.6 ? -1 : 1) * (1.7 + (i % 2) * 0.6);   // 朝空地多的那一侧跳
    });
    A.play('jump');
  }
  if (!car) return;
  if (!G.endJump) ps.forEach((pl, i) => { if (pl.alive) seat(pl, i, G.carX, G.carZ); });
  G.carVx += 13 * dt; G.carX += G.carVx * dt; car.position.x = G.carX; car.rotation.y = Math.PI / 2; spinWheels(car, G.roadV + G.carVx, dt);
  if (G.carFlash > 0) G.carFlash -= dt;
  if (G.carX > AREAS[G.area].x1 + 8) { K.scene.remove(car); G.car = null; }
}

// ---------- 每帧 ----------
export function update(dt) {
  const G = K.G, ph = G.roadPhase;
  if (!ph || G.coopGuest) return;
  const W = K.world.area();
  if (driving()) { G.roadV += (ROAD.speed - G.roadV) * damp(4, dt); G.roadT += dt; }
  else G.roadV = Math.max(0, G.roadV - 11 * dt);   // 下车以后地面慢慢停住
  G.roadDist += G.roadV * dt;
  if (ph === 'wreck' && G.roadV <= 0) G.roadPhase = 'foot';
  // 天色：一路开到霍格出场时转成黄昏
  const duskTo = ph === 'run' ? clamp((G.roadT - 12) / (ROAD.hoggAt - 12), 0, 1) * 0.45 : 1;
  G.roadDusk += clamp(duskTo - G.roadDusk, -dt / 6, dt / 6);
  if (G.car && driving()) driveCar(dt);
  if (ph === 'end') updateEnd(dt);
  scrollThings(dt);
  if (ph === 'run') { spawnEvents(); if (G.roadT >= ROAD.hoggAt) hoggEnter(); }
  // 时间快到了还没分出胜负：车撑不住了，下车打
  if (ph === 'hogg' && G.timer < 1.5 && !G.settings.demo) carExplode();
  updateNades(dt);
  updateObjs(dt);
  // 徒步阶段：霍格的手下从两边上来（场上最多两个）
  if ((G.roadPhase === 'wreck' || G.roadPhase === 'foot') && G.boss && G.boss.alive && G.mode === 'play') {
    G.gangCd -= dt;
    const alive = G.actors.filter(e => e.side === 'enemy' && e.alive && e !== G.boss).length;
    if (G.gangCd <= 0 && alive < 2 && G.gangN < GANG.length) {
      const g = GANG[G.gangN++], side = G.gangN % 2 ? -1 : 1;
      const e = K.spawnEnemy(g[0], G.focusX + side * ENTER_DX, randRange(-1.4, 3.0), { drop: g[1] });
      K.setState(e, 'enter', { kind: 'walk', tx: G.focusX + side * (HALF_W - 1.5), tz: e.z });
      G.gangCd = alive ? 9 : 6;
    }
  }
  if (W.scroll) W.scroll(G.roadDist);
}
export function render(dt) {
  const G = K.G;
  if (!G.roadPhase) return;
  const W = K.world.area();
  if (W.scroll) W.scroll(G.roadDist);
  if (W.setDusk) W.setDusk(G.roadDusk || 0);
  if (G.car && carMat) { const f = G.carFlash > 0 ? Math.min(1, G.carFlash / 0.25) : 0; carMat.color.setRGB(1, 1 - 0.72 * f, 1 - 0.78 * f); carMat.emissive.setRGB(0.5 * f, 0, 0); }
}
// 骑手：车轮转动、过弯侧倾
export function renderRider(a, dt) {
  const G = K.G, ai = a.ai;
  const v = a.type === 'hogg' ? (G.roadPhase === 'hogg' ? G.roadV + (ai ? ai.vx : 0) : ai ? ai.vx : 0) : G.roadV;
  for (const w of a.bike.userData.wheels) w.rotation.x += v * dt / 0.375;
  const lean = ai ? ai.lean || 0 : 0;
  a.model.root.rotation.z += (lean - a.model.root.rotation.z) * Math.min(1, dt * 8);
}
export function riderPose(a) {
  if (a.type !== 'hogg') return RIDE_BIKER;
  const ai = a.ai;
  if (ai && ai.stag > 0) return RIDE_HIT;
  if (ai && ai.throwT >= 0) return ai.throwT < 0.3 ? RIDE_WIND : RIDE_THROW;
  return RIDE_HOGG;
}
export function roadPose(a) {
  const R = a.road;
  if (!R) return HP.guard;
  if (a.y > 0.05) return HP.jumpKick;
  switch (R.pose) {
    case 'squat': return HP.crouch;
    case 'run': case 'leap': return runPose(a.walkPh);
    case 'aim': return HP.aim;
    default: return HP.guard;
  }
}
// 测试钩子与快照用
export function state() {
  const G = K.G;
  if (!G.roadPhase) return null;
  const h = G.boss && G.boss.type === 'hogg' ? G.boss : null;
  return {
    phase: G.roadPhase, t: +G.roadT.toFixed(2), dist: +G.roadDist.toFixed(1), v: +G.roadV.toFixed(2), dusk: +(G.roadDusk || 0).toFixed(2), ev: G.roadEv,
    car: G.car ? { x: +G.carX.toFixed(2), z: +G.carZ.toFixed(2), hp: G.carHp, max: G.carMax, flash: +Math.max(0, G.carFlash).toFixed(2) } : null,
    hogg: h ? { x: +h.x.toFixed(2), z: +h.z.toFixed(2), hp: +h.hp.toFixed(1), alive: h.alive, mode: h.ai ? h.ai.mode : null, slot: h.ai ? h.ai.slot : null, rider: !!h.rider } : null,
    nades: nades.map(n => ({ x: +n.x1.toFixed(2), z: +n.z1.toFixed(2), t: +(n.T - n.t).toFixed(2) })), objs: objs.length, gang: G.gangN
  };
}
export const test = {
  skipTo(t) { K.G.roadT = t; while (K.G.roadEv < ROAD.events.length && ROAD.events[K.G.roadEv].t < t) { const e = ROAD.events[K.G.roadEv++]; if (e.k !== 'man' && e.k !== 'bike') K.G.roadPool++; } },
  carHit() { K.G.carInv = 0; carHit(); },
  wreck() { if (K.G.car && driving()) carExplode(); },
  lob(x, z) { const h = K.G.boss; if (h && h.alive) lob(h, x, z); },
  ram() { const h = K.G.boss; if (h && h.alive && K.G.car) { h.x = K.G.carX + ROAD.carL + 0.3; h.z = K.G.carZ; ram(h, true); } }
};
