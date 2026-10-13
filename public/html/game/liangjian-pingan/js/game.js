// 核心玩法：主角、视角、枪弹、手榴弹、操炮、骑兵连与五个阶段
import * as THREE from '../vendor/three.module.js';
import { TAU, DEG, clamp, lerp, damp, angDiff, angStep, fwdX, fwdZ, rightX, rightZ, yawTo, dist, dist2, rand, pick, reseed, segPointD2, segRect, fmtTime } from './util.js';
import { buildWorld, L, resolveCircle, pointBlocked, losBlocked } from './world.js';
import { MAT, buildSoldier, poseSoldier, muzzleWorld, setSoldierMat, buildCannon, buildRider, buildViewGun, buildBroadsword, buildMedkit, buildCrate } from './models.js';
import { Geo } from './geo.js';
import { Fx } from './fx.js';
import { PHASE_NAMES, VIEW_NAMES } from './ui.js';
import { DEF, spawnPhase, updateEnemy, updateAlly, updateBoss, wakeGroup } from './ai.js';

export const VIEWS = [
  { dist: 27, pitch: 52 * DEG, fov: 48, ahead: 5, minP: 20 * DEG, maxP: 80 * DEG },
  { dist: 37, pitch: 80 * DEG, fov: 46, ahead: 2, minP: 58 * DEG, maxP: 86 * DEG },
  { dist: 7.5, pitch: 14 * DEG, fov: 62, ahead: 2, side: 0.8, h: 1.7, minP: -8 * DEG, maxP: 55 * DEG },
  { fov: 76, minP: -60 * DEG, maxP: 60 * DEG },
];
const CANNON_VIEWS = [
  { dist: 40, pitch: 26 * DEG, ahead: 26, h: 4 },
  { dist: 64, pitch: 80 * DEG, ahead: 22 },
  { dist: 8.5, pitch: 13 * DEG, ahead: 5, h: 2.4 },
  {},
];
const SHELL_V = 46, SHELL_G = 18;
const ARMOR = { std: 5, easy: 8, one: 1 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class Game {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.audio = app.audio; this.input = app.input;
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0xdcb589, 70, 300);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 900);
    scene.add(this.camera);
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x7a6248, 0.85));
    const sun = (this.sun = new THREE.DirectionalLight(0xffdcae, 1.25));
    sun.position.set(-34, 46, 22);
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.world = buildWorld(scene);
    this.fx = new Fx(scene);
    this.units = []; this.enemies = []; this.allies = [];
    this.bullets = []; this.nades = []; this.shells = []; this.mortars = []; this.riders = []; this.pickups = []; this.timers = [];
    this.cam = { yaw: 0, pitch: 0, pendYaw: 0, pendPitch: 0, view: 0, clip: 1, F: new THREE.Vector3(0, 1.5, 90), turning: false, orbitT: 0 };
    this.mode = 'title';
    this.t = 0; this.phase = 1; this.cut = 0; this.cutCam = null;
    this._props();
    this.reset(1, true);
  }

  // ---------- 一次性道具 ----------
  _props() {
    const s = this.scene;
    this.viewGun = buildViewGun();
    this.viewGun.group.position.set(0.25, -0.21, -0.6);
    this.viewGun.group.rotation.y = 0.05;
    this.viewGun.group.visible = false;
    this.camera.add(this.viewGun.group);
    this.cannon = { model: buildCannon(), x: 0, z: 0, yaw: 0, aimYaw: 0, elev: 0.2, hp: 30, maxHp: 30, alive: true, placed: false, manned: false, reload: 0, shells: 8, recoil: 0, moving: false, resupplyT: 0, crew: [], visible: false, flashT: 0, r: 1.7 };
    s.add(this.cannon.model.root);
    for (let i = 0; i < 3; i++) { const m = buildSoldier(i === 0 ? 'dabiao' : 'ally'); m.walk = rand(TAU); s.add(m.root); this.cannon.crew.push(m); }
    // 锁定标记
    const lg = new Geo();
    lg.cyl(0.18, 0.34, 0, 0.17, 0, 0xffd84a, 4, 0, Math.PI, 0, 0, 0);
    this.lockCone = lg.build(new THREE.MeshBasicMaterial({ color: 0xffd84a, depthTest: false, transparent: true }), { cast: false, receive: false });
    this.lockCone.renderOrder = 5; this.lockCone.visible = false; s.add(this.lockCone);
    const rg = new THREE.RingGeometry(0.62, 0.78, 28); rg.rotateX(-Math.PI / 2);
    this.lockRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.lockRing.visible = false; s.add(this.lockRing);
    this.demoRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.demoRing.visible = false; this.demoRing.scale.setScalar(1.5); s.add(this.demoRing);
    // 弹道预览
    const N = 70;
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.arc = new THREE.Line(this.arcGeo, new THREE.LineBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.95, depthTest: false }));
    this.arc.frustumCulled = false; this.arc.renderOrder = 6; this.arc.visible = false; s.add(this.arc);
    this.aimRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd84a, depthTest: false, transparent: true }));
    this.aimRing.renderOrder = 6; this.aimRing.visible = false; s.add(this.aimRing);
    // 炮弹、手榴弹
    const sg = new Geo(); sg.cyl(0.14, 0.5, 0, 0, 0, 0xc9a646, 6, 0.3, Math.PI / 2, 0, 0, 0);
    this.shellGeo = sg.build(MAT.vc).geometry;
    const ng = new Geo(); ng.cyl(0.09, 0.2, 0, 0, 0, 0x3a3a34, 6, 1, 0, 0, 0, 0); ng.box(0.04, 0.3, 0.04, 0, -0.24, 0, 0x8a6a40, 0, 0, 0, 0);
    this.nadeGeo = ng.build(MAT.vc).geometry;
    // 守备队部大门
    const dg = new Geo();
    for (const sx of [-1, 1]) { dg.box(3.4, 3.8, 0.3, sx * 1.75, 1.9, 0, 0x5a2a1e); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) dg.box(0.14, 0.14, 0.1, sx * (0.6 + c * 0.9), 0.8 + r * 1.1, 0.18, 0xc9a646, 0, 0, 0, 0); }
    this.hqDoor = dg.build(MAT.vc); this.hqDoor.position.set(0, 0, L.hqGateZ); s.add(this.hqDoor);
    this.hqDoorCol = { x0: -3.5, x1: 3.5, z0: L.hqGateZ - 0.4, z1: L.hqGateZ + 0.4, h: 4, y0: 0, tag: 'hqdoor', on: true };
    this.world.colliders.push(this.hqDoorCol);
    this.sword = buildBroadsword(); this.sword.visible = false;
    this.medGeo = buildMedkit().geometry; this.crateGeo = buildCrate().geometry;
    this.smokeT = 0;
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q === 'high';
    this.fx.scale = q === 'high' ? 1 : 0.5;
  }

  // ---------- 开局 / 重置 ----------
  clearDynamic() {
    for (const u of this.units) this.scene.remove(u.model.root);
    for (const n of this.nades) this.scene.remove(n.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const m of this.mortars) if (m.mesh) this.scene.remove(m.mesh);
    for (const r of this.riders) this.scene.remove(r.model.root);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.units.length = this.enemies.length = this.allies.length = 0;
    this.bullets.length = this.nades.length = this.shells.length = this.mortars.length = this.riders.length = this.pickups.length = this.timers.length = 0;
    this.fx.clearWarnings();
    this.ui.clearTransient();
    this.boss = null; this.advYaw = 0; this.sortieT = 9;
  }
  setGate(alive) { const g = this.world.gate; g.alive = alive; g.hp = alive ? 3 : 0; g.mesh.visible = alive; g.col.on = alive; }
  setTower(alive) { const t = this.world.tower; t.alive = alive; t.hp = 3; t.group.visible = alive; t.ruin.visible = !alive; }
  setBunker(b, alive) { b.alive = alive; b.mesh.visible = alive; b.ruin.visible = !alive; b.cd = 3; b.burst = 0; }
  setHqDoor(closed) { this.hqDoor.visible = closed; this.hqDoorCol.on = closed; }

  reset(startPhase, title) {
    reseed(20261013 + startPhase * 7);
    this.clearDynamic();
    const a = this.app;
    this.t = 0; this.cut = 0; this.cutCam = null; this.over = false; this.slow = 1;
    this.stats = { kills: 0, elites: 0, genius: 0, clash: 0, loot: 0, deaths: 0, hurt: 0, meds: 0, retries: 0, shells: 0, cav: 0, startPhase, demo: !!a.get('demo') };
    this.score = 0;
    this.lives = a.get('lives') === 'inf' ? Infinity : 3;
    this.flags = {};
    this.setGate(startPhase < 4); this.setTower(startPhase < 4);
    for (const b of this.world.bunkers) this.setBunker(b, startPhase < 4);
    this.world.flagEnemy.visible = true; this.world.flagRed.visible = false;
    this.setHqDoor(true);
    // 主角
    const maxHp = ARMOR[a.get('armor')] || 5;
    const model = buildSoldier('hero');
    this.scene.add(model.root);
    model.armR.add(this.sword);
    const h = (this.hero = { kind: 'player', type: 'hero', x: L.start.x, z: L.start.z, y: 0, yaw: 0, hp: maxHp, maxHp, alive: true, inv: 0, model, walk: 0, moving: 0, aim: 0, fireCd: 0, weapon: startPhase >= 5 ? 'lmg' : 'pistol', mag: 20, magMax: 20, reloadT: 0, nades: 3, nadeMax: 3, nadeT: 0, dashT: 0, dashCd: 0, dashX: 0, dashZ: -1, dashHit: new Set(), swordT: 0, cavCd: 0, lock: null, lockT: 0, deadT: 0, r: 0.45, flashT: 0, vx: 0, vz: 0, slash: -1, hurtT: 0, idleT: 0 });
    if (h.weapon === 'lmg') { h.magMax = h.mag = 40; }
    this.units.push(h);
    // 战友
    const names = [['dabiao', '张大彪'], ['monk', '和尚'], ['ally'], ['ally'], ['ally'], ['ally']];
    names.forEach(([type, name], i) => this.addUnit('ally', type, L.start.x + (i % 2 ? 1 : -1) * (2.2 + Math.floor(i / 2) * 2.2), L.start.z + 2.4 + Math.floor(i / 2) * 1.6, { name, slot: i }));
    // 意大利炮
    const c = this.cannon;
    c.hp = c.maxHp; c.alive = true; c.manned = false; c.reload = 0; c.shells = 8; c.aimYaw = 0; c.elev = 0.2; c.recoil = 0; c.resupplyT = 0; c.yaw = 0;
    c.placed = startPhase >= 3; c.visible = startPhase >= 2;
    c.x = c.placed ? L.firePos.x : L.cannonStart.x; c.z = c.placed ? L.firePos.z : L.cannonStart.z;
    this.cam.yaw = 0; this.cam.pitch = 0; this.cam.pendYaw = 0; this.cam.pendPitch = 0; this.cam.clip = 1;
    this.cam.view = a.get('view');
    this.mode = title ? 'title' : 'play';
    if (!title) this.enterPhase(startPhase, true);
    else { this.phase = 1; this.syncCannonModel(0); this.poseAll(0); }
    this.cam.F.set(h.x, 1.5, h.z);
  }

  addUnit(kind, type, x, z, o = {}) {
    const def = DEF[type];
    const model = buildSoldier(def.look);
    this.scene.add(model.root);
    const u = { kind, type, def, x, z, y: o.y || 0, yaw: o.yaw === undefined ? (kind === 'enemy' ? Math.PI : 0) : o.yaw, hp: def.hp, maxHp: def.hp, alive: true, r: 0.42, model, walk: rand(TAU), moving: 0, aim: 0, state: 'idle', stT: rand(0.4, 1.6), think: rand(0.5), target: null, flashT: 0, deadT: 0, slash: -1, cheer: 0, active: kind === 'ally', group: o.group || '', hold: !!o.hold, name: o.name || '', slot: o.slot || 0, pref: o.pref || rand(13, 22), wantCannon: !!o.cannon, nest: o.nest || null, down: 0, regen: 0, strafe: 0, strafeT: rand(1, 3), burst: 0, vx: 0, vz: 0, wake: o.wake || 40, shotT: 0, px: x, pz: z };
    this.units.push(u);
    (kind === 'enemy' ? this.enemies : this.allies).push(u);
    model.root.position.set(x, u.y, z); model.root.rotation.y = u.yaw;
    return u;
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ---------- 阶段 ----------
  enterPhase(n, fresh) {
    const h = this.hero, c = this.cannon, ui = this.ui;
    this.phase = n; this.phaseT = 0; this.sub = 0;
    this.app.saveCheckpoint(n);
    // 清掉上一阶段残留
    for (const e of this.enemies) if (e.alive && e.type !== 'boss') { e.alive = false; e.deadT = 9; }
    this.bullets.length = 0;
    this.fx.clearWarnings(); this.mortars.length = 0;
    if (c.manned) this.leaveCannon();
    h.hp = h.maxHp; h.nades = h.nadeMax; h.inv = Math.max(h.inv, 1.2);
    spawnPhase(this, n);
    this.audio.setMusic(n >= 5 ? 2 : n === 3 ? 2 : 1);
    if (n === 1) {
      this.place(h, L.start.x, L.start.z);
      ui.say('李云龙', '传我命令：全团集合，打平安县城！');
      ui.say('张大彪', '一营听令，跟团长上！');
      ui.danmaku(['名场面预定', '李云龙：咱不过了！', '独立团，冲！', '前方高能'], '');
      this.after(4.5, () => ui.toast(this.app.isTouch() ? 'J 射击会自动瞄准；机枪阵地正面打不穿，绕到侧面，或者扔手榴弹、叫骑兵连' : 'J 射击会自动瞄准；机枪阵地正面打不穿——绕到侧面，或者用 K 手榴弹、I 骑兵连', 6));
    } else if (n === 2) {
      if (fresh) this.place(h, 2, 84);
      c.visible = true; c.placed = false; c.x = L.cannonStart.x; c.z = L.cannonStart.z; c.hp = c.maxHp;
      ui.say('李云龙', '二营长！你他娘的意大利炮呢？', { now: true });
      ui.say('二营长', '有！');
      ui.say('李云龙', '给我拉上来！');
      this.audio.voice('yidalipao');
      this.after(3.4, () => this.audio.voice('lashanglai'));
      ui.stamp('意大利炮呢？', 1.8);
      ui.danmaku(['二营长：在拉了在拉了', '意大利炮来了！', '全剧最强输出', '这炮其实是山炮', '名场面！！！', '二营长yyds'], 'hot');
      this.after(5, () => ui.toast('护着炮往前推：鬼子靠近炮组就会停下，先把他们打掉', 5));
    } else if (n === 3) {
      if (fresh) this.place(h, 3.5, 31);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z; c.hp = Math.min(c.maxHp, c.hp + 12); c.shells = 8;
      for (const e of this.enemies) if (e.type === 'wall' || e.type === 'mortar') e.active = true;
      ui.say('二营长', '团长，炮架好了！', { now: true });
      ui.say('李云龙', '先敲掉城墙上的机枪堡，再把城门给老子轰开！');
      ui.danmaku(['楚云飞：云龙兄好大的手笔', '丁伟：李云龙这小子不过了？', '孔捷：把天捅了个窟窿', '开炮开炮开炮'], '');
    } else if (n === 4) {
      if (fresh) this.place(h, 0, -11);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z;
      this.audio.play('bugle');
      this.audio.voice('chong');
      ui.say('李云龙', '一营二营，给我往里冲！', { now: true });
      ui.say('张大彪', '弟兄们，冲啊——');
      ui.stamp('冲锋号响了！', 1.6);
      ui.danmaku(['嘀嘀嗒嘀嗒——', '冲啊！！！', '独立团万岁', '进城吃肉'], 'hot');
    } else if (n === 5) {
      if (fresh) this.place(h, 0, -85.5);
      this.setHqDoor(true);
      this.spawnMed(-14.5, -85); this.spawnMed(14.5, -100);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z;
      // 只带三名战友进院子
      this.allies.forEach((al, i) => { if (i < 3) this.place(al, -4 + i * 4, -84); else { this.place(al, -4 + (i - 3) * 4, -77); al.hold = true; } });
      this.cut = 3.4; this.cutCam = { px: 0, py: 4.2, pz: -90, lx: 0, ly: 2.0, lz: -100 };
      ui.say('山本一木', '李云龙，你来得正好。', { now: true, foe: true });
      ui.say('李云龙', '山本！狭路相逢——');
      this.after(2.6, () => { ui.stamp('勇者胜！', 1.5); this.audio.voice('yongzhesheng'); this.audio.play('drum'); });
      this.after(3.6, () => ui.toast(this.app.isTouch() ? '山本拔刀突进时地上有红线：侧移躲开，或者按 U 亮剑和他拼刀！' : '山本拔刀突进时地上有红线：侧移躲开，或者按 U 亮剑和他拼刀！', 6));
      ui.danmaku(['决战！', '山本特工队队长', '亮剑！！！', '拼刀拼刀'], 'red');
    }
    this.syncCannonModel(0);
  }
  place(u, x, z) { u.x = x; u.z = z; u.px = x; u.pz = z; resolveCircle(this.world, u, u.r); u.model.root.position.set(u.x, u.y, u.z); }

  objective() {
    const p = this.phase, c = this.cannon;
    if (this.flags.won) return ['<b>平安县城拿下了！</b>', null];
    if (p === 1) {
      const a = this.groupAlive('A'), b = this.groupAlive('B');
      const done = (a ? 0 : 1) + (b ? 0 : 1);
      const tgt = a && (!b || dist2(this.hero.x, this.hero.z, L.nestA.x, L.nestA.z) < dist2(this.hero.x, this.hero.z, L.nestB.x, L.nestB.z)) ? L.nestA : b ? L.nestB : null;
      if (!tgt) { const n = this.enemies.filter((e) => e.alive && e.group === 'R').length; return [`第一阶段 · 打退鬼子的反扑 <b>剩 ${n}</b>`, this.nearestEnemyMarker('R')]; }
      return [`第一阶段 · 端掉城外两处机枪阵地 <b>${done}/2</b>`, { x: tgt.x, y: 2.4, z: tgt.z, text: '机枪阵地' }];
    }
    if (p === 2) {
      const d = Math.max(0, Math.round(c.z - L.firePos.z));
      return [`第二阶段 · 护送意大利炮到炮位 <b>还剩 ${d} 米</b>`, { x: c.x, y: 2.8, z: c.z, text: '意大利炮' }];
    }
    if (p === 3) {
      const bk = this.world.bunkers.filter((b) => !b.alive).length, g = this.world.gate;
      if (this.flags.finale) return ['第三阶段 · <b>瞄准城楼，开炮！</b>', c.manned ? null : { x: c.x, y: 2.8, z: c.z, text: '操炮' }];
      return [`第三阶段 · 操炮轰掉 机枪堡 <b>${bk}/2</b> · 城门 <b>${3 - g.hp}/3</b>`, c.manned ? null : { x: c.x, y: 2.8, z: c.z, text: '操炮' }];
    }
    if (p === 4) {
      const n = this.enemies.filter((e) => e.alive && e.group.startsWith('S')).length;
      if (n > 0) return [`第四阶段 · 肃清街上的鬼子 <b>剩 ${n}</b>`, this.nearestEnemyMarker()];
      return ['第四阶段 · <b>冲进守备队部</b>', { x: 0, y: 3, z: L.hqGateZ - 2, text: '守备队部' }];
    }
    return ['决战 · <b>击败山本一木</b>', null];
  }
  nearestEnemyMarker(prefix = 'S') {
    let best = null, bd = 1e9;
    for (const e of this.enemies) { if (!e.alive || !e.group.startsWith(prefix)) continue; const d = dist2(e.x, e.z, this.hero.x, this.hero.z); if (d < bd) { bd = d; best = e; } }
    return best ? { x: best.x, y: 2.6, z: best.z, text: '残敌' } : null;
  }
  groupAlive(g) { for (const e of this.enemies) if (e.alive && e.group === g) return true; return false; }

  updatePhase(dt) {
    const p = this.phase, h = this.hero, c = this.cannon, ui = this.ui;
    this.phaseT += dt;
    if (this.flags.won || this.over) return;
    if (p === 1) {
      if (!this.flags.nA && !this.groupAlive('A')) { this.flags.nA = 1; this.nestCleared(L.nestA, '左翼'); }
      if (!this.flags.nB && !this.groupAlive('B')) { this.flags.nB = 1; this.nestCleared(L.nestB, '右翼'); }
      if ((this.flags.nA || this.flags.nB) && !this.flags.counter) {
        this.flags.counter = 1;
        this.after(2.5, () => { if (this.phase !== 1) return; this.spawnWave(-3, 20, 3, 1, 'R', 16); this.spawnWave(4, 22, 3, 0, 'R', 16); ui.say('张大彪', '团长，城门口的鬼子反扑上来了！'); this.flags.counterOut = 1; });
      }
      if (this.flags.nA && this.flags.nB && this.flags.counterOut && !this.groupAlive('R') && !this.flags.p1done) {
        this.flags.p1done = 1;
        ui.say('李云龙', '痛快！城外的钉子拔干净了。');
        this.after(2.2, () => this.enterPhase(2, false));
      }
    } else if (p === 2) {
      this.updateEscort(dt);
    } else if (p === 3) {
      this.updateSiege(dt);
    } else if (p === 4) {
      const left = this.enemies.some((e) => e.alive && e.group.startsWith('S'));
      if (!left && !this.flags.hqOpen) {
        this.flags.hqOpen = 1; this.setHqDoor(false);
        this.fx.debris(0, 2, L.hqGateZ, 14, [0x5a2a1e, 0x3a2418], 6, 0.5); this.audio.play('thud');
        ui.say('张大彪', '团长，街上的鬼子收拾干净了！');
        ui.say('李云龙', '撞开大门，山本就在里头！');
        this.spawnMed(0, -76);
      }
      if (this.flags.hqOpen && h.z < L.hqGateZ - 2.5 && h.alive) this.enterPhase(5, false);
      if (!this.flags.depotTip && h.z < -52 && !this.flags.loot) { this.flags.depotTip = 1; ui.toast('路口东边的院子是鬼子的军火库，进去瞧瞧', 5); }
      if (!this.flags.s1 && !this.groupAlive('S1')) { this.flags.s1 = 1; this.spawnMed(0, -44); this.spawnWave(-30, -60, 3, 1, 'S4', 12); this.spawnWave(30, -60, 3, 0, 'S4', 12); ui.say('和尚', '两边巷子里又钻出来一股！'); }
      if (!this.flags.s2 && !this.groupAlive('S2')) { this.flags.s2 = 1; this.spawnMed(0, -63); }
      if (this.flags.s1 && !this.flags.s4 && !this.groupAlive('S4')) { this.flags.s4 = 1; this.spawnMed(-4, -57); }
    } else if (p === 5) {
      const b = this.boss;
      if (b && !b.alive && !this.flags.won) this.victory();
    }
  }
  nestCleared(pos, side) {
    this.addScore(300);
    this.spawnMed(pos.x, pos.z - 0.4);
    this.ui.say('和尚', side + '机枪哑火了！');
    this.ui.danmaku(['拿下！', '漂亮', '这仗打得痛快'], '');
  }

  // 第二阶段：护送火炮
  updateEscort(dt) {
    const c = this.cannon, ui = this.ui;
    if (c.placed) return;
    let blocked = false;
    for (const e of this.enemies) { if (e.alive && e.active && e.y < 2 && dist2(e.x, e.z, c.x, c.z) < 17 * 17) { blocked = true; break; } }
    const near = dist2(this.hero.x, this.hero.z, c.x, c.z) < 12 * 12 && this.hero.alive;
    c.moving = !blocked && this.cut <= 0;
    if (c.moving) {
      const sp = near ? 2.7 : 1.7;
      c.z -= sp * dt;
      c.x = Math.sin(c.z * 0.06) * 1.6 * clamp((c.z - L.firePos.z) / 12, 0, 1);
      c.wheel = (c.wheel || 0) + sp * dt / 0.62;
      if (rand() < dt * 6) this.fx.dust(c.x + rand(-0.9, 0.9), 0.1, c.z + 0.5, 1);
    } else if (blocked && !this.flags.blockedTip) { this.flags.blockedTip = 1; ui.say('二营长', '团长，鬼子摸上来了，炮推不动！'); }
    const wave = (id, z, fn) => { if (!this.flags[id] && c.z < z) { this.flags[id] = 1; fn(); } };
    wave('w1', 90, () => { this.spawnWave(-42, 72, 5, 0, 'W'); ui.say('和尚', '左边土坡后头有鬼子！'); });
    wave('w2', 74, () => { this.spawnWave(42, 56, 5, 1, 'W'); ui.say('张大彪', '右翼上来一股，冲着炮来的！'); });
    wave('w4', 40, () => { this.spawnWave(-40, 12, 4, 1, 'W'); this.spawnWave(40, 10, 4, 1, 'W'); ui.say('和尚', '城墙根底下又冲出来两股！'); });
    wave('w3', 58, () => { this.spawnWave(-42, 40, 4, 1, 'W'); this.spawnWave(42, 38, 4, 1, 'W'); for (const e of this.enemies) if (e.type === 'mortar' || e.type === 'wall') e.active = true; ui.say('二营长', '城墙上的掷弹筒盯上咱们了，红圈落下来前躲开！'); });
    if (c.z <= L.firePos.z) {
      c.z = L.firePos.z; c.x = L.firePos.x; c.placed = true; c.moving = false;
      this.addScore(600);
      this.enterPhase(3, false);
    }
  }
  spawnWave(x, z, n, officers, group, pref) {
    for (let i = 0; i < n; i++) { const e = this.addUnit('enemy', 'rifle', x + rand(-2, 2), z + rand(-4, 4), { group, cannon: i % 2 === 0, wake: 999, pref: pref || rand(9, 14) }); e.active = true; }
    for (let i = 0; i < officers; i++) { const e = this.addUnit('enemy', 'officer', x + rand(-2, 2), z + rand(-3, 3), { group, wake: 999 }); e.active = true; }
  }

  // 第三阶段：炮击
  updateSiege(dt) {
    const c = this.cannon, ui = this.ui, w = this.world;
    // 城墙机枪堡开火
    for (const b of w.bunkers) {
      if (!b.alive) continue;
      b.cd -= dt;
      if (b.burst > 0) {
        b.shotT -= dt;
        if (b.shotT <= 0) {
          b.shotT = 0.1; b.burst--;
          const tx = b.tx + rand(-2.2, 2.2), tz = b.tz + rand(-2.2, 2.2);
          this.fireBullet(1, b.x, b.y, b.z + 1.2, tx, 1.0, tz, 1, 36, 'citywall');
          this.sfxAt('mg', b.x, b.z, 0.8);
        }
      } else if (b.cd <= 0) {
        const t = rand() < 0.6 && this.hero.alive ? this.hero : c;
        b.tx = t.x; b.tz = t.z; b.burst = 9; b.shotT = 0.5; b.cd = rand(3.6, 5.2);
        this.fx.strip(b.x, b.z + 1.2, yawTo(t.x - b.x, t.z - b.z - 1.2), dist(b.x, b.z, t.x, t.z), 0.5, 0.5);
      }
    }
    // 敌人出城反扑
    this.sortieT = (this.sortieT || 9) - dt;
    if (this.sortieT <= 0 && !this.flags.towerDown) {
      this.sortieT = 17;
      if (this.enemies.filter((e) => e.alive && e.y < 2).length < 5) {
        const sx = this.flags.sortieSide ? 1 : -1; this.flags.sortieSide = !this.flags.sortieSide;
        this.spawnWave(sx * 42, -6, 4, this.phaseT > 40 ? 1 : 0, 'W');
        if (!this.flags.sortieTip) { this.flags.sortieTip = 1; ui.say('张大彪', '鬼子从城墙根绕出来了，一营顶住！'); }
      }
    }
    // 炮弹补给
    if (c.shells <= 0) {
      c.resupplyT += dt;
      if (c.resupplyT > 4.5) { c.resupplyT = 0; c.shells = 6; ui.say('和尚', '团长，炮弹扛来了！'); this.audio.play('pickup'); }
    }
    if (!this.flags.finale && w.bunkers.every((b) => !b.alive) && !w.gate.alive) {
      this.flags.finale = 1;
      ui.say('李云龙', '山本的指挥所就在城楼上！', { now: true });
      ui.say('李云龙', '二营长，瞄准城楼——');
      ui.danmaku(['瞄准城楼', '来了来了', '名场面', '开炮！！！'], 'hot');
    }
    if (!c.manned && !this.flags.manTip && this.phaseT > 6) { this.flags.manTip = 1; ui.toast('走到意大利炮旁边按 J 操炮', 5); }
  }

  victory() {
    const ui = this.ui, w = this.world;
    this.flags.won = 1;
    this.addScore(DEF.boss.score);
    for (const e of this.enemies) if (e.alive) this.killUnit(e, true);
    this.bullets.length = 0; this.fx.clearWarnings(); this.mortars.length = 0;
    this.cut = 6.2; this.cutCam = { px: 8, py: 3.6, pz: -86.5, lx: L.flag.x + 2, ly: 5.6, lz: L.flag.z };
    this.setHqDoor(false);
    for (const al of this.allies) { al.hold = false; al.cheer = 0.01; }
    this.after(1.2, () => { w.flagEnemy.visible = false; w.flagRed.visible = true; this.audio.play('win'); ui.stamp('拿下平安县城！', 2.4); });
    ui.say('李云龙', '山本完了！平安县城，拿下了！', { now: true });
    ui.say('旅长', '李云龙！你把晋西北搅成了一锅粥！', { dur: 3 });
    ui.danmaku(['晋西北乱成了一锅粥', '整个晋西北都打乱套了', '李云龙你个败家子', '赢麻了', '这买卖赚了', '亮剑精神！'], 'hot');
    this.after(6.4, () => this.finish(true));
  }

  finish(win) {
    if (this.over) return;
    this.over = true;
    const s = this.stats, h = this.hero;
    if (win) { this.addScore(Math.max(0, 3000 - Math.round(this.t) * 5)); this.addScore(this.cannon.shells * 100); }
    const score = Math.max(0, this.score - s.deaths * 300 - s.retries * 300);
    const rank = score >= 22000 ? '晋西北一霸' : score >= 18500 ? '亮剑团长' : score >= 15000 ? '合格的二营长' : '炊事班长';
    const quote = win
      ? (s.loot ? '李云龙：“老子这辈子，没打过这么富裕的仗！”' : '李云龙：“什么他娘的精锐，老子打的就是精锐！”') + '<br>补给已到账——要是打得过瘾，回 B 站给视频点个三连，就当给独立团发军饷了。'
      : '李云龙：“胜败乃兵家常事，重整队伍，再来！”';
    this.app.onResult({
      win, rank, quote, score, demo: s.demo,
      rows: [['用时', fmtTime(this.t)], ['歼敌', s.kills], ['干掉精锐', s.elites], ['开炮', s.shells + ' 发'], ['“天才”炮击', s.genius], ['拼刀成功', s.clash], ['骑兵连出击', s.cav], ['缴获军火库', s.loot ? '是' : '否'], ['阵亡', s.deaths], ['受击', s.hurt], ['急救包', s.meds], ['规则', (this.app.get('lives') === 'inf' ? '无限命' : '经典 3 命') + ' · ' + ({ std: '标准', easy: '宽松', one: '一发' }[this.app.get('armor')])]],
    });
  }
  addScore(n) { this.score += n; }

  // ---------- 主循环 ----------
  update(dt) {
    if (this.mode === 'title') { this.updateTitle(dt); return; }
    this.t += dt;
    if (this.cut > 0) this.cut -= dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    this.input.sample();
    this.updateLook(dt);
    this.updateHero(dt);
    this.updateCannon(dt);
    for (const u of this.allies) updateAlly(this, u, dt);
    for (const u of this.enemies) { if (u.type === 'boss') updateBoss(this, u, dt); else updateEnemy(this, u, dt); }
    this.separate();
    this.updateBullets(dt);
    this.updateNades(dt);
    this.updateShells(dt);
    this.updateMortars(dt);
    this.updateRiders(dt);
    this.updatePickups(dt);
    this.updatePhase(dt);
    this.poseAll(dt);
    this.updateCamera(dt);
    this.ambient(dt);
    this.fx.update(dt);
    this.syncHud(dt);
    this.ui.update(dt);
    this.audio.tick();
  }
  updateTitle(dt) {
    const c = this.cam;
    c.orbitT += dt;
    const a = c.orbitT * 0.06 + 0.5;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.camera.position.set(Math.sin(a) * 34, 9 + Math.sin(c.orbitT * 0.1) * 3, 24 + Math.cos(a) * 16);
    this.camera.lookAt(0, 10.5, -20);
    this.updateFades(true);
    this.ambient(dt);
    this.fx.update(dt);
    this.moveSun(0, 20);
    this.audio.tick();
  }
  ambient(dt) {
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.28;
      const s = pick(this.world.smokes);
      this.fx.spawn({ soft: true, x: s[0] + rand(-1, 1), y: 5, z: s[1] + rand(-1, 1), vx: rand(0.6, 1.4), vy: rand(2.2, 3.4), vz: rand(-0.3, 0.3), life: rand(5, 8), s0: 2, s1: 7.5, c0: 0x2e2a28, c1: 0x77726c, spin: rand(-0.3, 0.3) });
      if (!this.world.tower.alive && rand() < 0.5) this.fx.smokePuff(rand(-6, 6), 10.5, -20 + rand(-2, 2), 1.6, 0x2e2a28);
    }
  }

  // ---------- 转视角 ----------
  updateLook(dt) {
    const c = this.cam, fp = c.view === 3;
    const [dx, dy] = this.input.takeLook();
    if (this.cut > 0 || !this.hero.alive) { c.pendYaw = 0; c.pendPitch = 0; c.turning = false; return; }
    c.pendYaw = clamp(c.pendYaw - dx * (fp ? 2.3 : 2.9), -2.6, 2.6);
    c.pendPitch = clamp(c.pendPitch + dy * (fp ? 1.7 : 1.5), -1.2, 1.2);
    const rate = (fp ? 3.4 : 6.2) * dt, k = 1 - Math.exp(-(fp ? 13 : 20) * dt);
    const sy = clamp(c.pendYaw * k, -rate, rate), sp = clamp(c.pendPitch * k, -rate, rate);
    c.pendYaw -= sy; c.pendPitch -= sp;
    const qe = this.input.qe || 0;
    c.yaw += sy - qe * (fp ? 1.25 : 1.6) * dt;
    c.turning = Math.abs(sy) > 1e-4 || qe !== 0;
    const v = VIEWS[c.view], base = v.pitch || 0;
    c.pitch = clamp(c.pitch + sp, v.minP - base, v.maxP - base);
    if (this.cannon.manned) {
      // 操炮：视线就是炮口方向
      c.yaw = clamp(c.yaw, -0.95, 0.95);
      this.cannon.aimYaw = c.yaw;
    }
  }
  nextView() {
    const c = this.cam;
    c.view = (c.view + 1) % 4;
    c.pendYaw = c.pendPitch = 0; c.pitch = 0;
    if (!this.cannon.manned) c.yaw = 0;
    this.input.takeLook();
    return c.view;
  }
  setView(v) { const c = this.cam; if (c.view === v) return; c.view = v; c.pendYaw = c.pendPitch = 0; c.pitch = 0; }

  // ---------- 主角 ----------
  updateHero(dt) {
    const h = this.hero, inp = this.input, c = this.cam, can = this.cannon;
    h.inv = Math.max(0, h.inv - dt); h.hurtT = Math.max(0, h.hurtT - dt); h.flashT = Math.max(0, h.flashT - dt);
    h.dashCd = Math.max(0, h.dashCd - dt); h.cavCd = Math.max(0, h.cavCd - dt); h.swordT = Math.max(0, h.swordT - dt);
    if (h.nades < h.nadeMax) { h.nadeT += dt; if (h.nadeT >= 12) { h.nadeT = 0; h.nades++; } }
    if (!h.alive) {
      h.deadT += dt; h.moving = 0;
      if (h.deadT > 1.8 && !this.over) this.respawn();
      inp.take('J'); inp.take('K'); inp.take('U'); inp.take('I');
      return;
    }
    if (this.cut > 0) { h.moving = 0; h.aim = damp(h.aim, 0, 10, dt); inp.take('J'); inp.take('K'); inp.take('U'); inp.take('I'); return; }
    if (can.manned) { this.controlCannon(dt); return; }

    const mv = inp.move, fp = c.view === 3;
    const yaw = c.yaw;
    let wx = rightX(yaw) * mv.x + fwdX(yaw) * mv.y, wz = rightZ(yaw) * mv.x + fwdZ(yaw) * mv.y;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const ox = h.x, oz = h.z;
    if (h.dashT > 0) {
      h.dashT -= dt;
      const sp = 34;
      h.x += h.dashX * sp * dt; h.z += h.dashZ * sp * dt;
      if (rand() < 0.9) this.fx.spawn({ x: h.x, y: 1.1, z: h.z, life: 0.22, s0: 0.5, s1: 0.05, c0: 0xdfe9ff, c1: 0x6f9fdc, spin: 0 });
      for (const e of this.enemies) {
        if (!e.alive || e.y > 2 || h.dashHit.has(e)) continue;
        if (segPointD2(ox, oz, h.x, h.z, e.x, e.z) < 1.9 * 1.9) {
          h.dashHit.add(e);
          if (e.type === 'boss' && this.tryClash(e)) continue;
          this.hurtUnit(e, e.type === 'boss' ? 8 : 6, h.dashX, h.dashZ, 'blade');
          this.audio.play('slash'); this.fx.sparks(e.x, 1.2, e.z, 8, 0xffffff);
        }
      }
      if (h.dashT <= 0) h.inv = Math.max(h.inv, 0.3);
    } else if (mag > 0.01) {
      const sp = 6.3 * (inp.held.J ? 0.82 : 1);
      h.x += wx * sp * dt; h.z += wz * sp * dt;
    }
    resolveCircle(this.world, h, h.r);
    // 城楼没塌之前不放人进门洞，免得提前跑进空城
    if (this.phase < 4 && h.z < L.wallZ1 + 0.7 && Math.abs(h.x) < L.gateHalf + 0.6) {
      h.z = L.wallZ1 + 0.7;
      if (this.t - (this.flags.gateTip || -9) > 4) { this.flags.gateTip = this.t; this.ui.toast('城楼上的火力封着门洞，先把城楼轰塌再进城', 2.6); }
    }
    h.vx = (h.x - ox) / Math.max(dt, 1e-4); h.vz = (h.z - oz) / Math.max(dt, 1e-4);
    h.moving = damp(h.moving, h.dashT > 0 ? 1 : mag, 14, dt);
    h.walk += dt * (4 + 8 * mag) * (mag > 0.01 ? 1 : 0);

    // 锁定目标
    h.lockT -= dt;
    if (h.lockT <= 0 || (h.lock && !h.lock.alive)) { h.lockT = 0.12; h.lock = this.pickTarget(h.weapon === 'lmg' ? 38 : 34); }
    const firing = inp.held.J;
    // 朝向
    if (fp) h.yaw = c.yaw;
    else if (h.dashT > 0) h.yaw = yawTo(h.dashX, h.dashZ);
    else if (firing && h.lock) h.yaw = angStep(h.yaw, yawTo(h.lock.x - h.x, h.lock.z - h.z), 15 * dt);
    else if (mag > 0.05) h.yaw = angStep(h.yaw, yawTo(wx, wz), 13 * dt);
    else if (c.turning) h.yaw = angStep(h.yaw, c.yaw, 9 * dt);

    // 操炮提示与进入
    const nearCannon = this.phase === 3 && can.placed && can.alive && dist2(h.x, h.z, can.x, can.z + 1.6) < 3.4 * 3.4;
    this.ui.setPrompt(nearCannon ? (this.app.isTouch() ? '点 J 操炮' : '按 J 操炮') : null);
    if (nearCannon && inp.take('J')) { this.manCannon(); return; }
    inp.take('J');

    // 射击
    h.fireCd -= dt;
    if (h.reloadT > 0) { h.reloadT -= dt; if (h.reloadT <= 0) h.mag = h.magMax; }
    h.aim = damp(h.aim, firing || h.fireCd > -0.5 ? 1 : 0, 16, dt);
    if (firing && h.fireCd <= 0 && h.reloadT <= 0 && h.dashT <= 0) {
      if (h.mag <= 0) { h.reloadT = h.weapon === 'lmg' ? 1.5 : 1.0; this.audio.play('reload'); }
      else this.heroShoot();
    }
    if (!firing && h.mag < h.magMax && h.reloadT <= 0) { h.idleT += dt; if (h.idleT > 1.6) { h.reloadT = 0.7; h.idleT = 0; } } else h.idleT = 0;

    if (inp.take('K')) this.throwNade();
    if (inp.take('U')) this.startDash(wx, wz, mag);
    if (inp.take('I')) this.callCavalry();
  }

  pickTarget(range) {
    const h = this.hero, c = this.cam, view = c.view;
    const cone = view === 3 ? 0.3 : view === 2 ? 0.62 : 9;
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (!e.alive || !e.active) continue;
      const dx = e.x - h.x, dz = e.z - h.z;
      const d = Math.sqrt(dx * dx + dz * dz + e.y * e.y);
      if (d > range) continue;
      let s;
      if (cone < 4) {
        const ang = Math.abs(angDiff(c.yaw, yawTo(dx, dz)));
        if (ang > cone) continue;
        s = ang * 34 + d * 0.35;
      } else {
        s = d + (losBlocked(this.world, h.x, h.z, e.x, e.z, 1.5, 1.4, e.y + 1.3) ? 10 : 0);
      }
      if (e === h.lock) s -= 3;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  heroShoot() {
    const h = this.hero, c = this.cam, fp = c.view === 3;
    const lmg = h.weapon === 'lmg';
    h.fireCd = lmg ? 0.105 : 0.18; h.mag--;
    let ox, oy, oz, dx, dy, dz;
    if (fp) {
      const pu = -c.pitch - 0.03;
      dx = fwdX(c.yaw) * Math.cos(pu); dz = fwdZ(c.yaw) * Math.cos(pu); dy = Math.sin(pu);
      ox = h.x + fwdX(c.yaw) * 0.55 + rightX(c.yaw) * 0.2; oz = h.z + fwdZ(c.yaw) * 0.55 + rightZ(c.yaw) * 0.2; oy = 1.62 * h.model.scale - 0.16;
    } else {
      this.poseHero(0);
      muzzleWorld(h.model, _v);
      ox = _v.x; oy = _v.y; oz = _v.z;
      dx = fwdX(h.yaw); dz = fwdZ(h.yaw); dy = 0;
    }
    const t = h.lock;
    if (t) {
      const ty = t.y + 1.15 * t.model.scale;
      // 第一人称只做准星附近的吸附，其余视角直接朝锁定目标打
      const lead = dist(h.x, h.z, t.x, t.z) / 80;
      const ax = t.x + (t.vx || 0) * lead - ox, ay = ty - oy, az = t.z + (t.vz || 0) * lead - oz;
      const l = Math.hypot(ax, ay, az) || 1;
      dx = ax / l; dy = ay / l; dz = az / l;
    }
    const sp = lmg ? 0.022 : 0.012;
    dx += rand(-sp, sp); dy += rand(-sp, sp) * 0.6; dz += rand(-sp, sp);
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    this.bullets.push({ team: 0, x: ox, y: oy, z: oz, dx, dy, dz, sp: 80, life: (lmg ? 40 : 36) / 80, dmg: 1, ign: null, age: 0 });
    this.audio.play(lmg ? 'lmg' : 'shot', 0.8);
  }

  throwNade() {
    const h = this.hero;
    if (h.nades <= 0) { this.ui.toast('手榴弹还在路上', 1.2); return; }
    h.nades--;
    let tx, tz;
    const t = h.lock && dist(h.x, h.z, h.lock.x, h.lock.z) < 24 && h.lock.y < 2 ? h.lock : null;
    const yaw = this.cam.view >= 2 ? this.cam.yaw : h.yaw;
    if (t) { tx = t.x; tz = t.z; } else { tx = h.x + fwdX(yaw) * 12; tz = h.z + fwdZ(yaw) * 12; }
    const mesh = new THREE.Mesh(this.nadeGeo, MAT.vc); mesh.castShadow = true; this.scene.add(mesh);
    this.nades.push({ x0: h.x, z0: h.z, x1: tx, z1: tz, t: 0, d: 0.72, mesh, r: 4.6, dmg: 5, team: 0 });
    this.fx.ring(tx, 0.07, tz, 4.6, 0.72, 0xffe9a8, 2);
    this.audio.play('throw');
    h.slash = 0.36;
  }
  startDash(wx, wz, mag) {
    const h = this.hero, c = this.cam;
    if (h.dashCd > 0 || h.dashT > 0) return;
    let dx, dz;
    if (c.view === 3) { dx = fwdX(c.yaw); dz = fwdZ(c.yaw); }
    else if (h.lock && this.input.held.J) { dx = h.lock.x - h.x; dz = h.lock.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    else if (mag > 0.1) { const l = Math.hypot(wx, wz) || 1; dx = wx / l; dz = wz / l; }
    else { dx = fwdX(h.yaw); dz = fwdZ(h.yaw); }
    h.dashX = dx; h.dashZ = dz; h.dashT = 0.3; h.dashCd = 7; h.dashHit.clear(); h.inv = Math.max(h.inv, 0.5); h.swordT = 0.9; h.slash = 0;
    this.audio.play('unsheathe'); this.audio.voice('liangjian', 0.9);
    this.ui.stamp('亮剑！', 0.8);
    if (!this.flags.dm_lj) { this.flags.dm_lj = 1; this.ui.danmaku(['面对强敌，也要毅然亮剑', '亮剑精神！', '剑锋所指'], ''); }
  }
  tryClash(b) {
    // 山本突进（或起手）时亮剑撞上：拼刀
    if (b.state !== 'dash' && b.state !== 'dashTele') return false;
    b.state = 'stun'; b.stT = 2.8;
    this.hero.dashT = 0; this.hero.inv = Math.max(this.hero.inv, 1.0);
    this.hurtUnit(b, 7, 0, 0, 'blade');
    this.stats.clash++; this.addScore(400);
    const mx = (b.x + this.hero.x) / 2, mz = (b.z + this.hero.z) / 2;
    this.fx.sparks(mx, 1.4, mz, 26, 0xffffff); this.fx.ring(mx, 0.1, mz, 5, 0.4, 0xffffff, 1);
    this.fx.clearWarnings();
    this.audio.play('clang');
    this.ui.stamp('狭路相逢勇者胜！', 1.5);
    this.ui.danmaku(['拼刀赢了！', '勇者胜！！！', '山本：？？？', '帅'], 'hot');
    return true;
  }
  callCavalry() {
    const h = this.hero;
    if (h.cavCd > 0) { this.ui.toast('骑兵连正在整队（' + Math.ceil(h.cavCd) + ' 秒）', 1.2); return; }
    if (this.phase === 5) { this.ui.toast('院子太窄，骑兵连冲不进来', 1.6); return; }
    h.cavCd = 45; this.stats.cav++;
    const inCity = h.z < -23;
    const yaw = inCity ? 0 : (this.cam.view >= 2 ? this.cam.yaw : h.yaw);
    const fx_ = fwdX(yaw), fz_ = fwdZ(yaw), rx = rightX(yaw), rz = rightZ(yaw);
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * (inCity ? 2.5 : 3.4);
      const model = buildRider();
      const x = (inCity ? 0 : h.x) + rx * off - fx_ * (24 + Math.abs(i - 2) * 2.5), z = h.z + rz * off - fz_ * (24 + Math.abs(i - 2) * 2.5);
      model.root.rotation.y = yaw; model.root.position.set(x, 0, z);
      this.scene.add(model.root);
      this.riders.push({ model, x, z, fx: fx_, fz: fz_, d: 0, hit: new Set(), t: rand(TAU), hop: 0 });
    }
    this.audio.voice('qibinglian'); this.audio.play('bugle', 0.7);
    this.ui.say('孙德胜', '骑兵连——进攻！', { now: true });
    this.ui.stamp('骑兵连，进攻！', 1.5);
    this.ui.danmaku(['骑兵连，进攻！', '孙连长！！', '泪目', '进攻！！！', '全体都有'], 'hot');
  }
  updateRiders(dt) {
    this.hoofT = (this.hoofT || 0) - dt;
    if (this.riders.length && this.hoofT <= 0) { this.hoofT = 0.11; this.audio.play('hoof', 0.5); }
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      const sp = 18;
      r.x += r.fx * sp * dt; r.z += r.fz * sp * dt; r.d += sp * dt; r.t += dt * 16;
      // 遇到矮障碍就跃过去
      const blocked = pointBlocked(this.world, r.x + r.fx * 1.5, 0.5, r.z + r.fz * 1.5);
      r.hop = damp(r.hop, blocked && blocked.h < 3 ? 1.5 : 0, 9, dt);
      if (blocked && blocked.h >= 3) r.d = 999;
      r.model.root.position.set(r.x, r.hop + Math.abs(Math.sin(r.t)) * 0.16, r.z);
      r.model.root.rotation.x = Math.sin(r.t) * 0.05;
      r.model.legs.forEach((l, k) => { l.rotation.x = Math.sin(r.t + (k < 2 ? 0 : Math.PI) + (k % 2) * 0.6) * 0.9; });
      r.model.rider.armR.rotation.x = 2.5 + Math.sin(r.t * 0.5) * 0.5;
      if (rand() < dt * 14) this.fx.dust(r.x, 0.1, r.z, 1);
      for (const e of this.enemies) {
        if (!e.alive || e.y > 2 || r.hit.has(e)) continue;
        if (dist2(e.x, e.z, r.x, r.z) < 2.0 * 2.0) { r.hit.add(e); this.hurtUnit(e, e.type === 'boss' ? 3 : 5, r.fx, r.fz, 'blade'); this.audio.play('slash', 0.7); this.fx.sparks(e.x, 1.3, e.z, 6, 0xffffff); }
      }
      if (r.d > 78) { this.scene.remove(r.model.root); this.riders.splice(i, 1); }
    }
  }

  // ---------- 意大利炮 ----------
  manCannon() {
    const c = this.cannon, h = this.hero;
    c.manned = true; c.fireLock = true; this.cam.yaw = c.aimYaw; this.cam.pendYaw = 0; this.cam.pendPitch = 0; this.cam.pitch = 0;
    h.x = c.x + 0.9; h.z = c.z + 1.7; h.yaw = 0; h.moving = 0; h.aim = 0; h.lock = null;
    this.ui.setPrompt(null);
    this.audio.play('uiok');
    if (!this.flags.manned) { this.flags.manned = 1; this.ui.toast(this.app.isTouch() ? '摇杆左右转炮口、上下调仰角，落点对准目标后点 J 开炮' : 'A/D 转炮口，W/S 调仰角，落点对准目标后按 J 开炮；K 离开炮位', 7); }
  }
  leaveCannon() {
    const c = this.cannon, h = this.hero;
    c.manned = false; this.arc.visible = false; this.aimRing.visible = false; this.ui.setAim(null);
    h.x = c.x + 2.2; h.z = c.z + 2.4; resolveCircle(this.world, h, h.r);
    this.cam.yaw = 0; this.cam.pendYaw = 0;
  }
  controlCannon(dt) {
    const c = this.cannon, inp = this.input, mv = inp.move, h = this.hero;
    this.cam.yaw = clamp(this.cam.yaw - mv.x * 0.6 * dt, -0.95, 0.95);
    c.aimYaw = this.cam.yaw;
    c.elev = clamp(c.elev + mv.y * 0.24 * dt, 0.03, 0.7);
    h.x = c.x + 0.9; h.z = c.z + 1.7; h.yaw = c.aimYaw; h.moving = 0;
    // 刚上炮位时要先松开 J，免得同一下按键直接把炮打出去
    if (c.fireLock && !inp.held.J) c.fireLock = false;
    const fire = (inp.take('J') || inp.held.J) && !c.fireLock;
    if (fire && c.reload <= 0 && this.cut <= 0) {
      if (c.shells > 0) this.fireCannon();
      else if (!this.flags.noShell || this.t - this.flags.noShell > 2) { this.flags.noShell = this.t; this.ui.toast('炮弹打光了，和尚正在扛（稍等几秒）', 1.8); }
    }
    if (inp.take('K')) { this.leaveCannon(); return; }
    inp.take('U');
    if (inp.take('I')) this.callCavalry();
    // 弹道预览
    const pre = this.simShell(c.aimYaw, c.elev, true);
    this.arc.visible = true; this.aimRing.visible = true;
    this.aimRing.position.set(pre.x, pre.y + 0.1, pre.z);
    if (pre.type === 'ground' || pre.y < 0.5) this.aimRing.rotation.set(Math.PI / 2, 0, 0); else this.aimRing.rotation.set(0, 0, 0);
    const want = this.flags.finale ? pre.type === 'tower' : pre.type === 'bunker' || pre.type === 'gate';
    const col = want ? 0x7dff6a : 0xffd84a;
    this.arc.material.color.setHex(col); this.aimRing.material.color.setHex(col);
    const name = { bunker: '机枪堡', gate: '城门', tower: '城楼', ground: '地面', solid: pre.wall ? '城墙' : pre.z < -23 ? '城内房屋' : '掩体' }[pre.type];
    this.ui.setAim(`仰角 <b>${Math.round(c.elev / DEG)}°</b>　落点 <b>${name}</b>　炮弹 <b>${c.shells}</b>${c.reload > 0 ? '　装填中…' : ''}`, want);
  }
  muzzlePos(out) {
    const m = this.cannon.model;
    m.slide.updateWorldMatrix(true, false);
    return out.set(0, m.muzzleY, m.muzzleZ).applyMatrix4(m.slide.matrixWorld);
  }
  // 炮弹飞行模拟：preview=true 时只算落点并写入预览线
  simShell(yaw, elev, preview) {
    const c = this.cannon;
    const cy = Math.cos(elev);
    let x = c.x + fwdX(yaw) * 1.9 * cy, y = 1.04 + Math.sin(elev) * 1.9, z = c.z + fwdZ(yaw) * 1.9 * cy;
    let vx = fwdX(yaw) * cy * SHELL_V, vy = Math.sin(elev) * SHELL_V, vz = fwdZ(yaw) * cy * SHELL_V;
    const pos = this.arcGeo.attributes.position, N = pos.count;
    const dt = 0.016;
    let hit = null, n = 0, k = 0;
    for (let i = 0; i < 400 && !hit; i++) {
      if (preview && i % 3 === 0 && n < N) pos.setXYZ(n++, x, y, z);
      vy -= SHELL_G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      hit = this.shellHit(x, y, z);
      k = i;
    }
    if (!hit) hit = { type: 'ground' };
    hit.x = x; hit.y = Math.max(0, y); hit.z = z; hit.time = k * dt;
    if (preview) { for (let i = n; i < N; i++) pos.setXYZ(i, x, hit.y, z); pos.needsUpdate = true; }
    return hit;
  }
  shellHit(x, y, z) {
    const w = this.world;
    for (const b of w.bunkers) { if (b.alive) { const q = b.box; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y > q.y0 && y < q.y1) return { type: 'bunker', ref: b }; } }
    if (w.tower.alive) { const q = w.tower.box; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y > q.y0 && y < q.y1) return { type: 'tower' }; }
    if (w.gate.alive && Math.abs(x) < L.gateHalf && z < L.wallZ1 + 0.1 && z > L.wallZ1 - 1.2 && y < L.gateH) return { type: 'gate' };
    const col = pointBlocked(w, x, y, z);
    if (col) return { type: 'solid', wall: col.tag === 'citywall' };
    if (y <= 0) return { type: 'ground' };
    return null;
  }
  fireCannon() {
    const c = this.cannon, ui = this.ui;
    c.shells--; c.reload = 2.1; c.flashT = 0.09; this.stats.shells++;
    this.syncCannonModel(0);
    this.muzzlePos(_v);
    c.recoil = 1;
    const cy = Math.cos(c.elev);
    const mesh = new THREE.Mesh(this.shellGeo, MAT.vc); this.scene.add(mesh);
    const finale = this.flags.finale && this.simShell(c.aimYaw, c.elev, false).type === 'tower';
    // 实际炮弹与预览用同一套起点和步长，落点才对得上
    this.shells.push({ x: c.x + fwdX(c.aimYaw) * 1.9 * cy, y: 1.04 + Math.sin(c.elev) * 1.9, z: c.z + fwdZ(c.aimYaw) * 1.9 * cy, vx: fwdX(c.aimYaw) * cy * SHELL_V, vy: Math.sin(c.elev) * SHELL_V, vz: fwdZ(c.aimYaw) * cy * SHELL_V, mesh, trail: 0, acc: 0 });
    // 炮口烟火（镜头不震，靠粒子和后坐表现）
    this.fx.burst(14, () => this.fx.spawn({ soft: true, x: _v.x, y: _v.y, z: _v.z, vx: fwdX(c.aimYaw) * rand(4, 16) + rand(-3, 3), vy: rand(-0.5, 4), vz: fwdZ(c.aimYaw) * rand(4, 16) + rand(-3, 3), life: rand(0.6, 1.5), s0: 0.7, s1: 2.8, drag: 2.4, c0: 0xffe2b0, c1: 0x8a847c }));
    this.fx.ring(c.x, 0.08, c.z, 6, 0.4, 0xe9d2a0, 1);
    this.fx.dust(c.x - 0.8, 0.1, c.z + 0.4, 6); this.fx.dust(c.x + 0.8, 0.1, c.z + 0.4, 6);
    this.audio.play('cannon'); this.audio.voice('kaipao', finale ? 1.2 : 1);
    this.hero.slash = 0.3;
    ui.stamp(finale ? '开炮！！！' : '开炮！', finale ? 2.0 : 1.0, finale ? 'red' : '');
    ui.danmaku(finale ? ['开炮！！！', '开炮！', '开炮！！', '名场面！！！', '李云龙：开炮！', '泪目', '开炮！！！！', '二营长：是！'] : pick([['开炮！', '开炮！！'], ['开炮！', '二营长神炮手'], ['开炮！！！', '意大利炮名不虚传'], ['开炮！', '再来一发']]), 'hot');
    if (this.stats.shells === 1) ui.say('李云龙', '开炮！', { now: true });
  }
  updateCannon(dt) {
    const c = this.cannon;
    c.reload = Math.max(0, c.reload - dt); c.recoil = Math.max(0, c.recoil - dt * 2.2); c.flashT = Math.max(0, c.flashT - dt);
    this.syncCannonModel(dt);
  }
  syncCannonModel(dt) {
    const c = this.cannon, m = c.model;
    m.root.visible = c.visible;
    for (const cm of c.crew) cm.root.visible = c.visible;
    if (!c.visible) return;
    m.root.position.set(c.x, 0, c.z);
    m.yawG.rotation.y = c.placed ? c.aimYaw : 0;
    m.pitchG.rotation.x = c.placed ? c.elev : 0.12;
    m.slide.position.z = c.recoil * c.recoil * 0.55;
    m.wheelL.rotation.x = m.wheelR.rotation.x = -(c.wheel || 0);
    m.flash.visible = c.flashT > 0;
    // 炮组：推炮时走在两侧，架好后守在旁边
    const spots = c.placed ? [[-1.5, 1.3, 0.3], [1.9, 2.6, -0.2], [-2.2, 2.8, 0.2]] : [[-1.25, 1.2, 0], [1.25, 1.2, 0], [0, 3.0, 0]];
    c.crew.forEach((cm, i) => {
      const s = spots[i];
      cm.root.position.set(c.x + s[0], 0, c.z + s[1]);
      cm.root.rotation.y = s[2];
      if (c.moving) cm.walk += dt * 9;
      poseSoldier(cm, { walk: cm.walk, moving: c.moving ? 1 : 0, aim: 0, carry: 'side', slash: -1, cheer: this.flags.won ? this.t : 0 });
      if (c.moving) { cm.armR.rotation.x = 1.2; cm.armL.rotation.x = 1.2; }
    });
  }
  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      let hit = null;
      const sdt = 0.016;
      s.acc += dt;
      while (s.acc >= sdt && !hit) {
        s.acc -= sdt;
        s.vy -= SHELL_G * sdt; s.x += s.vx * sdt; s.y += s.vy * sdt; s.z += s.vz * sdt;
        hit = this.shellHit(s.x, s.y, s.z);
      }
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      s.trail -= dt;
      if (s.trail <= 0) { s.trail = 0.02; this.fx.spawn({ soft: true, x: s.x, y: s.y, z: s.z, life: 0.6, s0: 0.3, s1: 1.0, c0: 0xf2e6c8, c1: 0x9a948c, spin: 1 }); }
      if (hit) { this.scene.remove(s.mesh); this.shells.splice(i, 1); this.shellImpact(hit, s.x, Math.max(0, s.y), s.z); }
    }
  }
  shellImpact(hit, x, y, z) {
    const w = this.world, ui = this.ui;
    this.fx.explosion(x, y, z, 6.5, true);
    this.sfxAt('explode', x, z, 1.2);
    let kills = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z, (e.y + 1) - y);
      if (d < 7) { const was = e.alive; this.hurtUnit(e, d < 3 ? 9 : 5, e.x - x, e.z - z, 'shell'); if (was && !e.alive) kills++; }
    }
    const h = this.hero;
    if (h.alive && !this.cannon.manned && Math.hypot(h.x - x, h.z - z) < 4.5 && y < 3) this.hurtHero(2, x, z);
    let direct = false;
    if (hit.type === 'bunker') {
      const b = hit.ref; this.setBunker(b, false); direct = true;
      this.fx.debris(b.x, b.y, b.z, 22, [0xb7a878, 0x4a3220, 0x2b2b2b], 9, 0.5);
      this.addScore(500);
      ui.say('二营长', (b.id === 'L' ? '左边' : '右边') + '机枪堡，报销了！');
    } else if (hit.type === 'gate') {
      const g = w.gate; g.hp--;
      this.fx.debris(x, 3, L.wallZ1 + 0.3, 14, [0x7a2a1e, 0x5a2218, 0xc9a646], 9, 0.5);
      if (g.hp <= 0) {
        this.setGate(false); this.addScore(600);
        this.fx.debris(0, 3, L.wallZ1, 30, [0x7a2a1e, 0x5a2218, 0x4a3220], 12, 0.7);
        this.audio.play('collapse', 0.6);
        ui.stamp('城门开了！', 1.4);
        ui.say('张大彪', '团长，城门轰开了！');
      } else ui.toast('城门晃了！再来 ' + g.hp + ' 发', 1.6);
    } else if (hit.type === 'tower') {
      if (this.flags.finale) this.collapseTower();
      else { this.fx.debris(x, y, z, 12, [0x7a2a1e, 0x3c3f46], 8, 0.5); ui.toast('城楼够结实：先敲掉两个机枪堡、轰开城门', 2.6); }
    }
    if ((kills >= 3 || (direct && !this.flags.geniusOnce)) && (this.t - (this.flags.geniusT || -99) > 10)) {
      this.flags.geniusT = this.t; this.flags.geniusOnce = 1; this.stats.genius++; this.addScore(500);
      ui.say('李云龙', '你他娘的还真是个天才！', { now: true });
      this.audio.voice('tiancai');
      ui.danmaku(['你他娘的还真是个天才！', '柱子同款', '神炮手', '天才！！'], 'hot');
    }
  }
  collapseTower() {
    const w = this.world, ui = this.ui, c = this.cannon;
    this.flags.towerDown = 1;
    this.setTower(false);
    const zc = (L.wallZ0 + L.wallZ1) / 2;
    for (let i = 0; i < 5; i++) this.after(i * 0.16, () => { const px = rand(-7, 7); this.fx.explosion(px, 11 + rand(0, 6), zc + rand(-2, 2), 6, true); this.fx.debris(px, 13, zc, 16, [0x7a2a1e, 0x3c3f46, 0x33363c, 0x8e2f22, 0xa8a59c], 13, 0.9); });
    this.audio.play('collapse');
    this.addScore(1500);
    this.cut = 3.6; this.cutCam = { px: 14, py: 7, pz: 16, lx: 0, ly: 12, lz: -20 };
    for (const e of this.enemies) if (e.alive && (e.y > 2 || e.group === 'W')) this.killUnit(e, true);
    this.mortars.length = 0; this.fx.clearWarnings(); this.bullets = this.bullets.filter((b) => b.team === 0);
    ui.stamp('城楼塌了！', 1.8);
    ui.say('二营长', '打中了！城楼塌了！', { now: true });
    ui.say('李云龙', '山本带着特工队缩进守备队部了——全团都有，进城！');
    this.after(4.2, () => { if (c.manned) this.leaveCannon(); this.enterPhase(4, false); });
  }

  // ---------- 子弹 ----------
  fireBullet(team, ox, oy, oz, tx, ty, tz, dmg, speed, ign) {
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    const b = { team, x: ox, y: oy, z: oz, dx: dx / l, dy: dy / l, dz: dz / l, sp: speed, life: 70 / speed, dmg, ign: ign || null, age: 0 };
    this.bullets.push(b);
    return b;
  }
  updateBullets(dt) {
    const bs = this.bullets, h = this.hero, c = this.cannon, w = this.world;
    const fx = this.fx;
    fx.beginTracers();
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      // 分小段前进，先撞到谁算谁（沙袋在前就打不到后面的机枪手）
      const total = b.sp * dt, n = Math.max(1, Math.ceil(total / 0.45)), step = total / n;
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        const nx = b.x + b.dx * step, ny = b.y + b.dy * step, nz = b.z + b.dz * step, my = (b.y + ny) / 2;
        if (b.team === 0) {
          for (const e of this.enemies) {
            if (!e.alive) continue;
            const rr = e.r + 0.2;
            if (segPointD2(b.x, b.z, nx, nz, e.x, e.z) > rr * rr) continue;
            if (my < e.y - 0.1 || my > e.y + 2.05 * e.model.scale) continue;
            this.hurtUnit(e, b.dmg * (b.fromAlly && e.type === 'boss' ? 0.25 : 1), b.dx, b.dz, 'bullet');
            dead = true; break;
          }
        } else {
          if (h.alive) {
            const rr = h.r + 0.1;
            if (segPointD2(b.x, b.z, nx, nz, h.x, h.z) < rr * rr && my < 2.05 && my > -0.1) { this.hurtHero(b.dmg, b.x - b.dx, b.z - b.dz); dead = true; }
          }
          if (!dead) for (const a of this.allies) {
            if (!a.alive || a.down > 0) continue;
            if (segPointD2(b.x, b.z, nx, nz, a.x, a.z) < 0.3 && my < 2 && my > -0.1) { this.hurtUnit(a, b.dmg, b.dx, b.dz, 'bullet'); dead = true; break; }
          }
          if (!dead && c.visible && c.alive && this.phase <= 3 && segPointD2(b.x, b.z, nx, nz, c.x, c.z + 0.8) < 2.2 && my < 1.9) { this.hurtCannon(b.dmg * 0.5); fx.sparks(nx, ny, nz, 4); dead = true; }
        }
        if (!dead) {
          if (pointBlocked(w, nx, ny, nz, b.ign)) { fx.sparks(nx - b.dx * 0.3, ny, nz - b.dz * 0.3, 3, 0xffe2a0); fx.dust(nx - b.dx * 0.4, ny, nz - b.dz * 0.4, 1); dead = true; }
          else if (ny <= 0.02) { fx.dust(nx, 0.05, nz, 2); dead = true; }
        }
        b.x = nx; b.y = ny; b.z = nz;
      }
      b.life -= dt; b.age += dt;
      if (dead || b.life <= 0) { bs.splice(i, 1); continue; }
      fx.tracer(b.x, b.y, b.z, b.dx, b.dy, b.dz, Math.min(2.2, b.age * b.sp), b.team === 0 ? 0xfff2b0 : 0xff7a4a);
    }
    fx.endTracers();
  }

  updateNades(dt) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const k = Math.min(1, n.t / n.d);
      const x = lerp(n.x0, n.x1, k), z = lerp(n.z0, n.z1, k), y = 1.4 + 5.5 * k * (1 - k) * (1 + (n.high || 0)) - 1.35 * k;
      n.mesh.position.set(x, y, z); n.mesh.rotation.x += dt * 12; n.mesh.rotation.z += dt * 7;
      if (k >= 1) {
        this.scene.remove(n.mesh); this.nades.splice(i, 1);
        this.blast(n.x1, n.z1, n.r, n.dmg, n.team);
      }
    }
  }
  // 地面爆炸：team=0 伤敌，team=1 伤我
  blast(x, z, r, dmg, team) {
    this.fx.explosion(x, 0.1, z, r, false);
    this.sfxAt('explode', x, z, 0.9);
    if (team === 0) {
      for (const e of this.enemies) { if (!e.alive || e.y > 2) continue; const d = dist(e.x, e.z, x, z); if (d < r) this.hurtUnit(e, d < r * 0.5 ? dmg : 2, e.x - x, e.z - z, 'blast'); }
    } else {
      const h = this.hero;
      if (h.alive && dist(h.x, h.z, x, z) < r && !(this.cannon.manned)) this.hurtHero(2, x, z);
      for (const a of this.allies) if (a.alive && a.down <= 0 && dist(a.x, a.z, x, z) < r) this.hurtUnit(a, 3, a.x - x, a.z - z, 'blast');
      const c = this.cannon;
      if (c.visible && c.alive && this.phase <= 3 && dist(c.x, c.z, x, z) < r + 1) this.hurtCannon(4);
    }
  }
  launchMortar(tx, tz, r, time, fromX, fromY, fromZ) {
    this.fx.warn(tx, tz, r, time);
    const mesh = new THREE.Mesh(this.nadeGeo, MAT.vc); mesh.scale.setScalar(1.6); this.scene.add(mesh);
    this.mortars.push({ x: tx, z: tz, r, t: 0, d: time, mesh, fx: fromX, fy: fromY, fz: fromZ });
    this.sfxAt('whistle', tx, tz, 0.7);
  }
  updateMortars(dt) {
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.d);
      m.mesh.position.set(lerp(m.fx, m.x, k), lerp(m.fy, 0, k) + 26 * k * (1 - k), lerp(m.fz, m.z, k));
      if (k >= 1) { this.scene.remove(m.mesh); this.mortars.splice(i, 1); this.blast(m.x, m.z, m.r, 0, 1); }
    }
  }

  // ---------- 受伤 ----------
  hurtUnit(u, dmg, dx, dz, kind) {
    if (!u.alive) return;
    if (u.type === 'boss') { if (u.state === 'stun') dmg *= 2; else if (u.state === 'recover') dmg *= 1.5; if (u.inv > 0) return; }
    u.hp -= dmg; u.flashT = 0.09;
    if (u.kind === 'enemy') { u.active = true; if (u.group) wakeGroup(this, u.group); }
    if (kind === 'bullet') { this.fx.blood(u.x, u.y + 1.2, u.z); this.sfxAt('hit', u.x, u.z, 0.5); }
    if (u.hp <= 0) this.killUnit(u, false, dx, dz);
    else if (u.kind === 'ally') u.regen = 5;
  }
  killUnit(u, silent, dx = 0, dz = 0) {
    if (!u.alive) return;
    if (u.kind === 'ally') { u.down = 8; u.hp = 0; u.moving = 0; return; }   // 战友倒地后会被卫生员救起
    u.alive = false; u.deadT = 0; u.fallYaw = Math.atan2(dx, dz);
    if (u.y > 2) { u.fall = 1; }
    if (silent) return;
    this.stats.kills++; this.addScore(u.def.score || 100);
    this.sfxAt('kill', u.x, u.z, 0.6);
    if (u.type === 'elite') {
      this.stats.elites++;
      if (!this.flags.eliteLine) {
        this.flags.eliteLine = 1;
        this.ui.say('李云龙', '什么他娘的精锐，老子打的就是精锐！', { now: true });
        this.audio.voice('jingrui');
        this.ui.danmaku(['老子打的就是精锐！', '打的就是精锐', '特工队：？', '精锐（指被打）'], 'hot');
      }
    }
    if (u.type === 'mg' && u.nest) this.ui.danmaku(['机枪哑了', '好！'], '');
  }
  hurtHero(dmg, sx, sz) {
    const h = this.hero;
    if (!h.alive || h.inv > 0 || this.app.get('demo') || this.cut > 0 || this.flags.won) return;
    h.hp -= dmg; h.inv = 1.2; h.hurtT = 0.5; h.flashT = 0.12;
    this.stats.hurt++;
    this.audio.play('hurt');
    this.fx.sparks(h.x, 1.3, h.z, 6, 0xff8a70);
    if (h.hp <= 1 && h.hp > 0 && !this.flags.lowTip) { this.flags.lowTip = 1; this.ui.say('和尚', '团长小心！快找急救包！'); }
    if (h.hp <= 0) {
      h.hp = 0; h.alive = false; h.deadT = 0; this.stats.deaths++;
      if (this.cannon.manned) this.leaveCannon();
      if (this.lives !== Infinity) this.lives--;
      this.ui.setPrompt(null);
      if (this.lives !== Infinity && this.lives <= 0) { this.audio.play('lose'); this.after(1.6, () => this.finish(false)); }
    }
  }
  hurtCannon(dmg) {
    const c = this.cannon;
    if (!c.alive || this.app.get('demo') || this.flags.towerDown) return;
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.hp = 0; c.alive = false;
      this.fx.explosion(c.x, 0.5, c.z, 5, true); this.audio.play('explode');
      this.ui.stamp('意大利炮被打坏了', 1.8, 'red');
      this.ui.say('二营长', '团长，炮……炮让鬼子打坏了！', { now: true });
      this.stats.retries++;
      this.after(2.4, () => { if (!this.over) { this.cannon.alive = true; this.cannon.hp = this.cannon.maxHp; this.enterPhase(this.phase, true); this.ui.toast('重整炮组，从本阶段再来', 3); } });
    }
  }
  respawn() {
    const h = this.hero, p = this.phase, c = this.cannon;
    if (this.lives !== Infinity && this.lives <= 0) return;
    let x = L.start.x, z = L.start.z;
    if (p === 1) { if (this.flags.nA) { x = L.nestA.x; z = L.nestA.z + 7; } }
    else if (p === 2) { x = c.x + 2; z = c.z + 7; }
    else if (p === 3) { x = 4; z = 31; }
    else if (p === 4) { x = 0; z = this.flags.s2 ? -61 : this.flags.s1 ? -37 : -12; }
    else if (p === 5) { x = 0; z = -85.5; }
    h.alive = true; h.hp = h.maxHp; h.inv = 2.6; h.deadT = 0; h.nades = h.nadeMax; h.mag = h.magMax; h.reloadT = 0; h.dashT = 0;
    this.place(h, x, z);
    this.bullets = this.bullets.filter((b) => b.team === 0 || dist2(b.x, b.z, x, z) > 30 * 30);
    for (const e of this.enemies) if (e.alive) { e.stT = Math.max(e.stT, 1.6); if (e.type === 'boss') { e.state = 'walk'; e.cd = 2; } }
    this.fx.clearWarnings(); this.mortars.forEach((m) => this.scene.remove(m.mesh)); this.mortars.length = 0;
    this.ui.say('李云龙', '老子还没死呢！接着打！', { now: true });
  }

  spawnMed(x, z) {
    const mesh = new THREE.Mesh(this.medGeo, MAT.vc); mesh.castShadow = true; mesh.position.set(x, 0, z); this.scene.add(mesh);
    this.pickups.push({ type: 'med', x, z, mesh });
  }
  spawnLoot(x, z) {
    const mesh = new THREE.Mesh(this.crateGeo, MAT.vc); mesh.castShadow = true; mesh.position.set(x, 0, z); mesh.scale.setScalar(1.3); this.scene.add(mesh);
    this.pickups.push({ type: 'loot', x, z, mesh });
  }
  updatePickups(dt) {
    const h = this.hero;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.mesh.rotation.y += dt * 1.4; p.mesh.position.y = 0.25 + Math.sin(this.t * 3 + i) * 0.1;
      if (!h.alive || dist2(h.x, h.z, p.x, p.z) > 1.5 * 1.5) continue;
      if (p.type === 'med') {
        if (h.maxHp <= 1) { this.addScore(200); this.audio.play('pickup'); this.ui.toast('一发模式：急救包折成战功 +200', 1.6); this.scene.remove(p.mesh); this.pickups.splice(i, 1); continue; }
        if (h.hp >= h.maxHp) continue;   // 满血时留在原地
        const gain = h.maxHp <= 1 ? 0 : Math.min(3, h.maxHp - h.hp);
        h.hp += gain; this.stats.meds++; this.audio.play('pickup');
        this.ui.toast('急救包：耐久 +' + gain, 1.6);
      } else {
        h.weapon = 'lmg'; h.magMax = 40; h.mag = 40; h.reloadT = 0; h.hp = h.maxHp; h.nades = h.nadeMax; this.flags.loot = 1; this.stats.loot = 1;
        this.addScore(800); this.audio.play('loot'); this.audio.voice('fuyu');
        this.ui.stamp('发财了！', 1.4);
        this.ui.say('李云龙', '发财了！老子这辈子没打过这么富裕的仗！', { now: true });
        this.ui.danmaku(['这辈子没打过这么富裕的仗', '发财了发财了', '缴获歪把子一挺', '李云龙：都给老子搬走', '富裕仗'], 'hot');
        this.ui.toast('缴获歪把子机枪：射速更快，弹匣 40 发', 4);
      }
      this.scene.remove(p.mesh); this.pickups.splice(i, 1);
    }
  }

  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive || a.y > 2 || a.down > 0) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || b.y > 2 || b.down > 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = a.r + b.r;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
        const fa = a.hold || a.type === 'mg' || (a === this.hero && (this.cannon.manned || a.dashT > 0)), fb = b.hold || b.type === 'mg';
        if (!fa) { a.x -= nx * push; a.z -= nz * push; }
        if (!fb) { b.x += nx * push; b.z += nz * push; }
      }
    }
  }

  // ---------- 姿势与模型 ----------
  poseHero(dt) {
    const h = this.hero, m = h.model;
    if (h.slash >= 0 && dt) { h.slash += dt * 2.6; if (h.slash > 1) h.slash = -1; }
    const blade = h.swordT > 0;
    this.sword.visible = blade;
    const pitch = h.lock && h.aim > 0.5 ? Math.atan2(h.lock.y + 1.1 - 1.4, Math.max(2, dist(h.x, h.z, h.lock.x, h.lock.z))) : 0;
    poseSoldier(m, { walk: h.walk, moving: h.moving, aim: blade ? 0 : h.aim, pitch, carry: blade ? 'blade' : 'side', slash: blade || h.slash >= 0 ? (h.slash >= 0 ? h.slash : 0.9) : -1, cheer: this.flags.won ? this.t : 0 });
    m.root.position.set(h.x, 0, h.z);
    m.root.rotation.y = h.yaw;
    m.root.updateMatrixWorld(true);
  }
  poseAll(dt) {
    const h = this.hero;
    // 主角
    if (h.alive) { h.model.root.rotation.x = 0; this.poseHero(dt); }
    else { const k = Math.min(1, h.deadT / 0.45); h.model.root.rotation.x = k * 1.45; h.model.root.position.set(h.x, 0.05, h.z); }
    const blink = h.inv > 0 && h.alive && Math.floor(this.t * 14) % 2 === 0 && h.hurtT <= 0;
    h.model.root.visible = !(this.cam.view === 3 && this.cut <= 0 && h.alive) && !blink;
    setSoldierMat(h.model, h.flashT > 0 ? (h.hurtT > 0 ? MAT.hurt : MAT.flash) : MAT.vc);
    h.model.flash.visible = h.alive && h.fireCd > (h.weapon === 'lmg' ? 0.06 : 0.13);
    this.viewGun.group.visible = this.cam.view === 3 && this.cut <= 0 && h.alive && !this.cannon.manned && this.mode === 'play';
    if (this.viewGun.group.visible) {
      const kick = Math.max(0, h.fireCd) * 0.5;
      this.viewGun.group.position.set(0.25, -0.21 + Math.sin(h.walk) * 0.008 * h.moving, -0.6 + kick * 0.6);
      this.viewGun.group.rotation.x = kick * 1.0;
      this.viewGun.group.scale.setScalar(h.weapon === 'lmg' ? 0.95 : 0.78);
      this.viewGun.flash.visible = h.fireCd > (h.weapon === 'lmg' ? 0.06 : 0.13);
    }
    // 其他单位
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u === h) continue;
      const m = u.model;
      if (!u.alive) {
        u.deadT += dt;
        const k = Math.min(1, u.deadT / 0.4);
        m.root.rotation.x = k * 1.5;
        if (u.fall) { u.y = Math.max(0, u.y - dt * 14 * Math.min(1, u.deadT * 2)); u.z += dt * 2.2 * (u.y > 0 ? 1 : 0); }
        m.root.position.set(u.x, u.y + 0.05 - Math.max(0, u.deadT - 2.4) * 0.5, u.z);
        setSoldierMat(m, MAT.vc); m.flash.visible = false;
        if (u.deadT > 4.4) { this.scene.remove(m.root); this.units.splice(i, 1); const arr = u.kind === 'enemy' ? this.enemies : this.allies; arr.splice(arr.indexOf(u), 1); }
        continue;
      }
      u.flashT = Math.max(0, u.flashT - dt); u.shotT = Math.max(0, u.shotT - dt);
      if (u.down > 0) { m.root.rotation.x = 1.45; m.root.position.set(u.x, 0.05, u.z); setSoldierMat(m, MAT.vc); m.flash.visible = false; continue; }
      m.root.rotation.x = u.state === 'stun' ? 0.35 : 0;
      if (u.slash >= 0) { u.slash += dt * (u.type === 'boss' ? 2.4 : 1.8); if (u.slash > 1) u.slash = -1; }
      if (u.cheer > 0) u.cheer += dt;
      const sd = m.melee;
      const tgt = u.target;
      const pitch = tgt && u.aim > 0.3 ? Math.atan2((tgt.y || 0) + 1.2 - (u.y + 1.3), Math.max(2, dist(u.x, u.z, tgt.x, tgt.z))) : 0;
      poseSoldier(m, { walk: u.walk, moving: u.moving, aim: sd ? 0 : u.aim, aimL: u.type === 'boss' ? u.aim : 0, pitch, carry: sd ? 'blade' : (u.def.look === 'rifle' || u.def.look === 'ally') ? 'rifle' : 'side', slash: u.slash, cheer: u.cheer });
      if (u.type === 'boss' && u.state === 'dash') { m.armR.rotation.x = 1.5; m.body.rotation.x = 0.5; }
      m.root.position.set(u.x, u.y, u.z);
      m.root.rotation.y = u.yaw;
      m.root.visible = !(this.cam.view >= 2 && this.cut <= 0 && u.kind === 'ally' && dist2(u.x, u.z, this.camera.position.x, this.camera.position.z) < 2.3 * 2.3);
      setSoldierMat(m, u.flashT > 0 ? MAT.flash : MAT.vc);
      m.flash.visible = u.shotT > 0 && !sd;
      if (m.flashL) m.flashL.visible = u.shotT > 0;
    }
    // 锁定标记
    const t = h.lock, show = !!t && t.alive && h.alive && !this.cannon.manned && this.cut <= 0;
    this.lockRing.visible = show && t.y < 2; this.lockCone.visible = show;
    if (show) {
      this.lockRing.position.set(t.x, 0.06, t.z);
      this.lockCone.position.set(t.x, t.y + 2.35 * t.model.scale + Math.sin(this.t * 7) * 0.08, t.z);
      this.lockCone.rotation.y = this.t * 3;
    }
    this.demoRing.visible = !!this.app.get('demo') && h.alive;
    if (this.demoRing.visible) this.demoRing.position.set(h.x, 0.08, h.z);
  }

  // ---------- 镜头 ----------
  moveSun(x, z) {
    const sx = Math.round(x / 2) * 2, sz = Math.round(z / 2) * 2;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx - 34, 46, sz + 22);
  }
  updateCamera(dt) {
    const c = this.cam, h = this.hero, can = this.cannon, cam = this.camera;
    const manned = can.manned;
    const bx = manned ? can.x : h.x, bz = manned ? can.z : h.z;
    let view = c.view;
    if (this.cut > 0 && this.cutCam) {
      const q = this.cutCam;
      _v.set(q.px, q.py, q.pz);
      cam.position.lerp(_v, 1 - Math.exp(-3.2 * dt));
      _v2.set(q.lx, q.ly, q.lz);
      c.F.lerp(_v2, 1 - Math.exp(-4 * dt));
      cam.lookAt(c.F);
      if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
      this.moveSun(q.lx, q.lz); this.updateFades(true);
      return;
    }
    if (view === 3 && !h.alive) view = 2;   // 阵亡时退回正视看清主角
    const v = VIEWS[view], cv = manned ? CANNON_VIEWS[view] : null;
    const yaw = manned ? can.aimYaw : c.yaw;
    const fxx = fwdX(yaw), fzz = fwdZ(yaw);
    if (cam.fov !== v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
    if (view === 3) {
      let pu = -c.pitch - 0.03;
      if (manned) {
        cam.position.set(can.x + rightX(yaw) * 0.42 + fxx * 0.75, 1.5, can.z + rightZ(yaw) * 0.42 + fzz * 0.75);
        pu += can.elev * 0.55;
      } else cam.position.set(h.x + fxx * 0.14, 1.62 * h.model.scale, h.z + fzz * 0.14);
      const cp = Math.cos(pu);
      _v.set(cam.position.x + fxx * cp, cam.position.y + Math.sin(pu), cam.position.z + fzz * cp);
      cam.lookAt(_v);
      c.F.set(cam.position.x + fxx * 4, 1.5, cam.position.z + fzz * 4);
      c.clip = 1;
    } else {
      const ahead = cv ? cv.ahead : v.ahead, d0 = cv ? cv.dist : v.dist, hh = (cv && cv.h) || v.h || 1.4;
      const side = cv ? 0 : v.side || 0;
      const p = clamp((cv ? cv.pitch : v.pitch) + c.pitch, v.minP, v.maxP);
      _v.set(bx + fxx * ahead + rightX(yaw) * side, hh, bz + fzz * ahead + rightZ(yaw) * side);
      c.F.lerp(_v, 1 - Math.exp(-(view === 2 ? 16 : 9) * dt));
      let d = d0;
      const cx = c.F.x - fxx * d * Math.cos(p), cy = c.F.y + d * Math.sin(p), cz = c.F.z - fzz * d * Math.cos(p);
      // 正视：墙和房子挡在镜头与主角之间时把镜头拉近
      let clip = 1;
      if (view === 2) {
        for (const col of this.world.colliders) {
          if (!col.on || col.h < 1.9 || col.y0 > 3) continue;
          const t = segRect(c.F.x, c.F.z, cx, cz, col);
          if (t >= 0 && t < clip) { const yAt = c.F.y + (cy - c.F.y) * t; if (yAt < col.h + 0.3) clip = t; }
        }
        clip = Math.max(0.16, clip - 0.06);
      }
      c.clip = clip < c.clip ? clip : Math.min(clip, c.clip + dt * 1.6);
      cam.position.set(c.F.x + (cx - c.F.x) * c.clip, c.F.y + (cy - c.F.y) * c.clip, c.F.z + (cz - c.F.z) * c.clip);
      cam.lookAt(c.F);
    }
    this.moveSun(c.F.x, c.F.z);
    this.updateFades(view === 3);
  }
  // 挡住主角的城楼、门洞、房子做淡化
  updateFades(off) {
    const cam = this.camera.position, h = this.hero, can = this.cannon;
    const tx = can.manned ? can.x : h.x, tz = can.manned ? can.z : h.z, ty = 1.5;
    for (const f of this.world.fadeables) {
      let want = 1;
      if (!off && this.mode === 'play') {
        const t = segRect(tx, tz, cam.x, cam.z, f);
        if (t >= 0) {
          const y = ty + (cam.y - ty) * t;
          const inside = tx > f.x0 && tx < f.x1 && tz > f.z0 && tz < f.z1;
          if ((y < f.h && y > f.y0 - 1) || inside) want = 0.22;
        }
      }
      if (Math.abs(f.a - want) < 0.005) continue;
      f.a = damp(f.a, want, 12, 0.016);
      const tr = f.a < 0.98;
      for (const m of f.meshes) {
        const mt = m.material;
        if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; }
        mt.opacity = f.a; mt.depthWrite = f.a > 0.6;
      }
    }
  }

  sfxAt(name, x, z, vol = 1) {
    const d = dist(x, z, this.cam.F.x, this.cam.F.z);
    this.audio.play(name, vol / (1 + d / 22));
  }

  // ---------- 界面同步 ----------
  project(x, y, z, out) {
    _v3.set(x, y, z).project(this.camera);
    const [w, hgt] = this.app.size();
    out.x = (_v3.x * 0.5 + 0.5) * w; out.y = (-_v3.y * 0.5 + 0.5) * hgt; out.behind = _v3.z > 1;
    return out;
  }
  syncHud(dt) {
    const ui = this.ui, h = this.hero, c = this.cannon, touch = this.app.isTouch();
    ui.setHP(h.hp, h.maxHp, h.hp <= 1 && h.maxHp > 1 && Math.floor(this.t * 5) % 2 === 0);
    ui.setLives(this.lives === Infinity ? '命 ∞' : '命 ×' + Math.max(0, this.lives));
    ui.setScore(this.score);
    const [text, mk] = this.objective();
    ui.setObjective(text);
    // 战友队形朝目标方向展开
    if (mk && this.phase === 1) this.advYaw = angStep(this.advYaw, yawTo(mk.x - h.x, mk.z - h.z), dt * 1.2); else this.advYaw = angStep(this.advYaw, 0, dt * 1.2);
    ui.setCannon(this.phase === 2 || this.phase === 3 ? c.hp / c.maxHp : null);
    const b = this.boss;
    ui.setBoss(this.phase === 5 && b && b.alive && this.cut <= 0 ? b.hp / b.maxHp : null, b && (b.state === 'stun' || b.state === 'recover'));
    ui.setVignette(Math.max(h.hurtT * 1.6, h.alive && h.hp <= 1 && h.maxHp > 1 ? 0.25 + 0.12 * Math.sin(this.t * 6) : 0, h.alive ? 0 : 0.6));
    ui.setCross(this.cam.view === 3 && h.alive && this.cut <= 0 && !c.manned, !!h.lock);
    // 动作键状态
    if (c.manned) {
      ui.setAction('J', '开炮', c.shells > 0 ? (c.reload > 0 ? '装填' : '×' + c.shells) : '等炮弹', c.reload > 0 || c.shells <= 0);
      ui.setAction('K', '离开炮位', '', false);
      ui.setAction('U', '亮剑', '操炮中', true);
    } else {
      ui.setAction('J', h.weapon === 'lmg' ? '歪把子' : '驳壳枪', h.reloadT > 0 ? '装弹' : h.mag + '/' + h.magMax, false);
      ui.setAction('K', '手榴弹', '×' + h.nades, h.nades <= 0);
      ui.setAction('U', '亮剑', h.dashCd > 0 ? Math.ceil(h.dashCd) + '秒' : '', h.dashCd > 0);
    }
    ui.setAction('I', '骑兵连', this.phase === 5 ? '进不来' : h.cavCd > 0 ? Math.ceil(h.cavCd) + '秒' : '', h.cavCd > 0 || this.phase === 5);
    ui.setKeyHint(c.manned
      ? '<kbd>A</kbd><kbd>D</kbd> 转炮口　<kbd>W</kbd><kbd>S</kbd> 调仰角　<kbd>J</kbd> 开炮　<kbd>K</kbd> 离开炮位　<kbd>C</kbd> 切换视角'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　<kbd>Q</kbd><kbd>E</kbd> 转视角　<kbd>C</kbd> 切换视角　<kbd>Esc</kbd> 暂停');
    // 目标指示
    const [w, hgt] = this.app.size();
    const o = this._o || (this._o = {});
    if (mk && this.cut <= 0 && h.alive) {
      this.project(mk.x, mk.y, mk.z, o);
      const d = Math.round(dist(h.x, h.z, mk.x, mk.z));
      let x = o.x, y = o.y, rot = 0;
      const mx = 70, top = 96, bot = touch ? 190 : 110;
      const off = o.behind || x < mx || x > w - mx || y < top || y > hgt - bot;
      if (off) {
        let dx = x - w / 2, dy = y - hgt / 2;
        if (o.behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = hgt; }
        const k = Math.min((w / 2 - mx) / Math.max(1, Math.abs(dx)), (hgt / 2 - Math.max(top, bot)) / Math.max(1, Math.abs(dy)));
        x = w / 2 + dx * k; y = hgt / 2 + dy * k;
        rot = Math.atan2(dy, dx) - Math.PI / 2;
      } else y -= 16;
      ui.marker(d > 4, x, y, mk.text + ' ' + d + '米', rot);
    } else ui.marker(false);
    // 人名
    let li = 0;
    const lab = (id, text, u, yy, foe) => {
      const show = u && (u.alive !== false) && this.cut <= 0 && !(u.down > 0);
      if (show) { this.project(u.x, (u.y || 0) + yy, u.z, o); ui.label(id, text, o.x, o.y, !o.behind && o.x > 0 && o.x < w && o.y > 60 && o.y < hgt, foe); }
      else ui.label(id, text, 0, 0, false, foe);
      li++;
    };
    for (const a of this.allies) if (a.name) lab('a' + a.slot, a.name, a, 2.2, false);
    if (c.visible && this.phase <= 3) lab('erying', '二营长', { x: c.x + (c.placed ? -1.5 : -1.25), z: c.z + (c.placed ? 1.3 : 1.2), y: 0, alive: true }, 2.2, false); else ui.label('erying', '二营长', 0, 0, false, false);
    if (this.boss) lab('boss', '山本一木', this.boss, 2.75, true);
    if (this.app.get('fps')) this.app.fpsText();
  }
}
