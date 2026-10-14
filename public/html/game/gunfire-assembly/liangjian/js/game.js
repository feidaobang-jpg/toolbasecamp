// 亮剑战役共用引擎：主角、视角、枪弹、手榴弹、亮剑、骑兵连、阵地机枪、火炮 / 迫击炮、过场与战斗界面。
// 各章（chapters/*.js）继承 Game，实现场景、阶段流程、敌人配置、剧情和结算；章节差异都走下面“章节钩子”一节的方法。
import * as THREE from '../vendor/three.module.js';
import { TAU, DEG, clamp, lerp, damp, angDiff, angStep, fwdX, fwdZ, rightX, rightZ, yawTo, dist, dist2, rand, pick, reseed, segPointD2, segRect, fmtTime } from './util.js';
import { resolveCircle, groundAt, pointBlocked, losBlocked } from './world-kit.js';
import { MAT, buildSoldier, poseSoldier, muzzleWorld, setSoldierMat, buildCannon, buildMG, buildRider, buildViewGun, buildBroadsword, buildMedkit, buildCrate } from './models.js';
import { Geo } from './geo.js';
import { Fx } from './fx.js';
import { DEF, updateEnemy, updateAlly, wakeGroup } from './ai.js';

// 枪战类只留两个视角：越肩第三人称（默认）与第一人称。pitch 为抬头角，向上为正
export const VIEWS = [
  { fov: 62, dist: 4.4, minP: -50 * DEG, maxP: 42 * DEG },
  { fov: 76, minP: -60 * DEG, maxP: 60 * DEG },
];
const SHELL_V = 46, SHELL_G = 18;                     // 意大利炮的默认弹道（章节可在 gunConfig 里换成迫击炮）
const MG_BELT = 100;                                    // 阵地机枪一条弹链的发数
const ARMOR = { std: 5, easy: 8, one: 1 };
const SENS = { low: 0.7, mid: 1, high: 1.4 };
const JUMP_V = 8.2, GRAVITY = 26, AIR_SPEED = 0.85;    // 起跳约 1.3 米；滞空短一点、空中略慢，容易落在箱子上
const MAG_SOFT = 4.2 * DEG, MAG_MOUSE = 2.2 * DEG;     // 子弹吸附角：触屏 / 按键转视角略大，鼠标略小
const FRICTION_ANG = 7.5 * DEG, PULL_ANG = 5 * DEG;    // 准星减速与开火牵引的范围（只对触屏 / 按键生效）
const KEY_YAW = 1.9, KEY_PITCH = 1.1;                  // Q/E、Y/H 的角速度（弧度 / 秒）
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class Game {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.audio = app.audio; this.input = app.input;
    this.gunCfg = this.gunConfig();
    const env = this.env();
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(env.fog, env.fogNear, env.fogFar);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 900);
    scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(env.sky, env.ground, env.hemi);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(env.sun, env.sunI));
    sun.position.set(-34, 46, 22);
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.world = this.buildWorld(scene);
    this.fx = new Fx(scene);
    this.fx.hgt = this.world.hgt || null;
    this.units = []; this.enemies = []; this.allies = [];
    this.bullets = []; this.nades = []; this.shells = []; this.mortars = []; this.riders = []; this.mgs = []; this.pickups = []; this.timers = []; this.cast = [];
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
    this.cannon = { model: this.gunCfg.build(), x: 0, z: 0, yaw: 0, aimYaw: 0, elev: 0.2, hp: 30, maxHp: 30, alive: true, placed: false, manned: false, reload: 0, shells: 8, recoil: 0, moving: false, resupplyT: 0, crew: [], visible: false, flashT: 0, r: 1.7 };
    s.add(this.cannon.model.root);
    for (let i = 0; i < this.gunCfg.crew.length; i++) { const m = buildSoldier(this.gunCfg.crew[i]); m.walk = rand(TAU); s.add(m.root); this.cannon.crew.push(m); }
    const rg = new THREE.RingGeometry(0.62, 0.78, 28); rg.rotateX(-Math.PI / 2);
    // 落点影子：跳起来或关掉阴影时帮助判断脚下
    const bg = new THREE.CircleGeometry(0.5, 20); bg.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    this.blob.visible = false; s.add(this.blob);
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
    this.sword = buildBroadsword(); this.sword.visible = false;
    this.medGeo = buildMedkit().geometry; this.crateGeo = buildCrate().geometry;
    this.smokeT = 0;
    this.chapterProps();
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
    this.clearCast(); this.scn = null; this.clearChapter();
    this.audio.stopVoices();
  }

  reset(startPhase, title) {
    reseed(20261013 + startPhase * 7);
    this.clearDynamic();
    const a = this.app;
    this.t = 0; this.cut = 0; this.cutCam = null; this.over = false; this.slow = 1;
    this.stats = { kills: 0, elites: 0, genius: 0, clash: 0, loot: 0, deaths: 0, hurt: 0, meds: 0, retries: 0, shells: 0, cav: 0, heads: 0, jumps: 0, startPhase, demo: !!a.get('demo') };
    this.score = 0;
    this.lives = a.get('lives') === 'inf' ? Infinity : 3;
    this.flags = {};
    this.resetChapter(startPhase);
    // 主角
    const maxHp = ARMOR[a.get('armor')] || 5;
    const st = this.startPos();
    const model = buildSoldier('hero');
    this.scene.add(model.root);
    model.armR.add(this.sword);
    const h = (this.hero = { kind: 'player', type: 'hero', x: st.x, z: st.z, y: 0, vy: 0, onGround: true, coyote: 0, yaw: 0, hp: maxHp, maxHp, alive: true, inv: 0, model, walk: 0, moving: 0, aim: 0, ads: false, fireCd: 0, weapon: this.startWeapon(startPhase), mag: 20, magMax: 20, reloadT: 0, nades: 3, nadeMax: 3, nadeT: 0, dashT: 0, dashCd: 0, dashX: 0, dashZ: -1, dashHit: new Set(), swordT: 0, cavCd: 0, deadT: 0, r: 0.45, flashT: 0, vx: 0, vz: 0, slash: -1, hurtT: 0 });
    this.aim = { x: 0, y: 1, z: 0, fx: 0, fy: 0, fz: -1, dist: 30, target: null, near: null, nearAng: 9, nearDYaw: 0, nearDPitch: 0 };
    this.hitT = 0; this.hitKind = 0; this.headT = 0;
    if (h.weapon === 'lmg') { h.magMax = h.mag = 40; }
    this.units.push(h);
    // 战友
    this.allyRoster().forEach(([type, name], i) => this.addUnit('ally', type, st.x + (i % 2 ? 1 : -1) * (2.2 + Math.floor(i / 2) * 2.2), st.z + 2.4 + Math.floor(i / 2) * 1.6, { name, slot: i }));
    // 火炮（意大利炮 / 迫击炮）
    const c = this.cannon;
    c.hp = c.maxHp; c.alive = true; c.manned = false; c.reload = 0; c.shells = this.gunCfg.shells; c.aimYaw = this.gunCfg.yaw0 || 0; c.elev = this.gunCfg.elev0; c.recoil = 0; c.resupplyT = 0; c.yaw = 0;
    this.resetGun(startPhase);
    this.initGuns();
    this.cam.yaw = 0; this.cam.pitch = 0; this.cam.pendYaw = 0; this.cam.pendPitch = 0; this.cam.clip = 1; this.cam.gy = 0; this.cam.adsK = 0; this.cam.camDist = 4;
    this.cam.view = clamp(a.get('view') | 0, 0, VIEWS.length - 1);
    this.mode = title ? 'title' : 'play';
    if (!title) this.enterPhase(startPhase, true);
    else { this.phase = 1; this.syncCannonModel(0); this.poseAll(0); }
    this.cam.F.set(h.x, 1.5, h.z);
  }

  addUnit(kind, type, x, z, o = {}) {
    const def = DEF[type];
    const model = buildSoldier(o.look || def.look);
    this.scene.add(model.root);
    const u = { kind, type, def, x, z, y: o.y !== undefined ? o.y : this.groundY(x, z), fixedY: o.y !== undefined, yaw: o.yaw === undefined ? (kind === 'enemy' ? Math.PI : 0) : o.yaw, hp: o.hp || def.hp, maxHp: o.hp || def.hp, alive: true, r: 0.42, model, walk: rand(TAU), moving: 0, aim: 0, state: 'idle', stT: rand(0.4, 1.6), think: rand(0.5), target: null, flashT: 0, deadT: 0, slash: -1, cheer: 0, active: kind === 'ally', group: o.group || '', hold: !!o.hold, name: o.name || '', slot: o.slot || 0, pref: o.pref || rand(13, 22), wantCannon: !!o.cannon, nest: o.nest || null, down: 0, regen: 0, strafe: 0, strafeT: rand(1, 3), burst: 0, vx: 0, vz: 0, wake: o.wake || 40, shotT: 0, px: x, pz: z };
    this.units.push(u);
    (kind === 'enemy' ? this.enemies : this.allies).push(u);
    model.root.position.set(x, u.y, z); model.root.rotation.y = u.yaw;
    return u;
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  // 地形高度与离地高度（平地章节恒为 0 / u.y）
  groundY(x, z) { return this.world.hgt ? this.world.hgt(x, z) : 0; }
  elev(u) { return u.y - (this.world.hgt ? this.world.hgt(u.x, u.z) : 0); }
  place(u, x, z) {
    u.x = x; u.z = z; u.px = x; u.pz = z;
    if (u === this.hero) { u.y = this.groundY(x, z); u.vy = 0; u.onGround = true; }
    else if (this.world.hgt && !u.fixedY) u.y = this.groundY(x, z);
    resolveCircle(this.world, u, u.r, u.y, u === this.hero);
    u.model.root.position.set(u.x, u.y, u.z);
  }
  nearestEnemyMarker(prefix = 'S') {
    let best = null, bd = 1e9;
    for (const e of this.enemies) { if (!e.alive || !e.group.startsWith(prefix)) continue; const d = dist2(e.x, e.z, this.hero.x, this.hero.z); if (d < bd) { bd = d; best = e; } }
    return best ? { x: best.x, y: 2.6, z: best.z, text: '残敌' } : null;
  }
  groupAlive(g) { for (const e of this.enemies) if (e.alive && e.group === g) return true; return false; }
  nestCleared(pos, side) {
    this.addScore(300);
    this.spawnMed(pos.x, pos.z - 0.4);
    this.ui.say(this.info().aide, side + '机枪哑火了！');
    if (!this.flags.mgHint) { this.flags.mgHint = 1; this.after(2.8, () => this.ui.toast(this.app.isTouch() ? '阵地里的机枪归你了：走进去点“机枪”接管' : '阵地里的机枪归你了：走进去按 I 接管', 4.5)); }
  }
  spawnWave(x, z, n, officers, group, pref) {
    for (let i = 0; i < n; i++) { const e = this.addUnit('enemy', 'rifle', x + rand(-2, 2), z + rand(-4, 4), { group, cannon: i % 2 === 0, wake: 999, pref: pref || rand(9, 14) }); e.active = true; }
    for (let i = 0; i < officers; i++) { const e = this.addUnit('enemy', 'officer', x + rand(-2, 2), z + rand(-3, 3), { group, wake: 999 }); e.active = true; }
  }

  // ---------- 剧情过场 ----------
  // 过场用带标记的定时器排；随时能跳过，跳过等于直接走到过场结尾
  playScene(dur, steps, end) {
    this.scn = { t: 0, end };
    this.cut = dur + 0.05;
    for (const [t, fn] of steps) this.timers.push({ t, fn, scn: true });
    this.timers.push({ t: dur, fn: () => this.endScene(false), scn: true });
    if (!this.flags.skipTip) { this.flags.skipTip = 1; this.after(1.1, () => { if (this.scn) this.ui.toast(this.app.isTouch() ? '点开火键可以跳过这段剧情' : '按开火键（J / 左键）或空格可以跳过这段剧情', 3.2); }); }
  }
  endScene(skipped) {
    const sc = this.scn; if (!sc) return;
    this.scn = null;
    for (const tm of this.timers) if (tm.scn) tm.dead = true;
    this.cut = 0; this.cutCam = null;
    if (skipped) { this.audio.stopVoices(); this.ui.clearDialog(); }
    sc.end(!!skipped);
  }
  poseTied(m) {
    poseSoldier(m, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 });
    m.armR.rotation.x = -0.6; m.armL.rotation.x = -0.6; m.armR.rotation.z = 0.3; m.armL.rotation.z = -0.3;   // 双手反绑
  }
  clearCast() { for (const m of this.cast) this.scene.remove(m.root); this.cast.length = 0; }
  addScore(n) { this.score += n; }

  // ---------- 主循环 ----------
  update(dt) {
    if (this.mode === 'title') { this.updateTitle(dt); return; }
    this.t += dt;
    if (this.cut > 0) this.cut -= dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; if (!tm) continue; if (tm.dead) { this.timers.splice(i, 1); continue; } tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    this.input.sample();
    if (this.scn) { this.scn.t += dt; if (this.scn.t > 0.9 && (this.input.take('fire') || this.input.take('jump'))) this.endScene(true); }
    this.updateLook(dt);
    this.updateHero(dt);
    this.updateCannon(dt);
    for (const u of this.allies) updateAlly(this, u, dt);
    for (const u of this.enemies) { if (u.type === 'boss') this.updateBossUnit(u, dt); else updateEnemy(this, u, dt); }
    this.separate();
    if (this.world.hgt) this.groundUnits();
    this.updateBullets(dt);
    this.updateNades(dt);
    this.updateShells(dt);
    this.updateMortars(dt);
    this.updateRiders(dt);
    this.updatePickups(dt);
    this.updatePhase(dt);
    this.updateChapter(dt);
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
    this.titleCam(c.orbitT, a);
    this.updateFades(true);
    this.ambient(dt);
    this.fx.update(dt);
    this.audio.tick();
  }
  ambient(dt) {
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.28;
      const s = pick(this.world.smokes);
      this.fx.spawn({ soft: true, x: s[0] + rand(-1, 1), y: this.groundY(s[0], s[1]) + 5, z: s[1] + rand(-1, 1), vx: rand(0.6, 1.4), vy: rand(2.2, 3.4), vz: rand(-0.3, 0.3), life: rand(5, 8), s0: 2, s1: 7.5, c0: 0x2e2a28, c1: 0x77726c, spin: rand(-0.3, 0.3) });
      this.ambientChapter();
    }
  }

  // ---------- 转视角：镜头方向就是瞄准方向（左右 Q/E、上下 Y/H、鼠标或手指拖动） ----------
  updateLook(dt) {
    const c = this.cam, h = this.hero, inp = this.input, can = this.cannon;
    const [dx, dy] = inp.takeLook();
    if (this.cut > 0 || !h.alive) { c.pendYaw = 0; c.pendPitch = 0; return; }
    const sens = SENS[this.app.get('aimSens')] || 1;
    const ads = h.ads && !can.manned ? 0.62 : 1;
    // 准星靠近目标时减速、开火时轻微牵引：只对触屏和按键转视角生效，鼠标只保留子弹吸附
    const a = this.aim, soft = inp.lookSrc !== 'mouse' && !can.manned;
    let fr = 1;
    if (soft && a.near) fr = 0.5 + 0.5 * Math.min(1, a.nearAng / FRICTION_ANG);
    c.pendYaw = clamp(c.pendYaw - dx * 3.0 * sens * ads * fr, -2.6, 2.6);
    c.pendPitch = clamp(c.pendPitch - dy * 2.4 * sens * ads * fr, -1.4, 1.4);
    const rate = 8 * dt, k = 1 - Math.exp(-(inp.lookSrc === 'mouse' ? 38 : 24) * dt);
    let sy = clamp(c.pendYaw * k, -rate, rate), sp = clamp(c.pendPitch * k, -rate, rate);
    c.pendYaw -= sy; c.pendPitch -= sp;
    sy -= inp.lookKX * KEY_YAW * ads * fr * dt;      // E 向右：yaw 减小
    sp += inp.lookKY * KEY_PITCH * ads * fr * dt;    // Y 抬头
    if (soft && a.near && inp.held.fire && a.nearAng < PULL_ANG) {
      const w = (1 - a.nearAng / PULL_ANG) * 0.9 * dt;
      sy += clamp(a.nearDYaw, -w, w); sp += clamp(a.nearDPitch, -w, w);
    }
    if (can.manned) {
      // 操炮：左右转炮口，上下调仰角
      const g = this.gunCfg;
      c.yaw = clamp(c.yaw + sy, g.yawMin, g.yawMax);
      can.aimYaw = c.yaw;
      can.elev = clamp(can.elev + sp * 0.5 * (g.elevRate || 1), g.elevMin, g.elevMax);
      return;
    }
    c.yaw += sy;
    const v = VIEWS[c.view];
    c.pitch = clamp(c.pitch + sp, v.minP, v.maxP);
  }
  // 切换人称时保持当前瞄准方向（枪战类不回正，免得准星跑掉）
  nextView() {
    const c = this.cam;
    c.view = (c.view + 1) % VIEWS.length;
    c.pendYaw = c.pendPitch = 0;
    c.pitch = clamp(c.pitch, VIEWS[c.view].minP, VIEWS[c.view].maxP);
    this.input.takeLook();
    return c.view;
  }
  setView(v) {
    const c = this.cam;
    v = clamp(v | 0, 0, VIEWS.length - 1);
    if (c.view === v) return;
    c.view = v; c.pendYaw = c.pendPitch = 0;
    c.pitch = clamp(c.pitch, VIEWS[v].minP, VIEWS[v].maxP);
  }

  // ---------- 主角 ----------
  updateHero(dt) {
    const h = this.hero, inp = this.input, c = this.cam, can = this.cannon, ui = this.ui;
    h.inv = Math.max(0, h.inv - dt); h.hurtT = Math.max(0, h.hurtT - dt); h.flashT = Math.max(0, h.flashT - dt);
    h.dashCd = Math.max(0, h.dashCd - dt); h.cavCd = Math.max(0, h.cavCd - dt); h.swordT = Math.max(0, h.swordT - dt);
    this.hitT = Math.max(0, this.hitT - dt); this.headT = Math.max(0, this.headT - dt);
    if (h.nades < h.nadeMax) { h.nadeT += dt; if (h.nadeT >= 12) { h.nadeT = 0; h.nades++; } }
    const drain = () => { for (const e of ['fire', 'jump', 'reload', 'nade', 'dash', 'cav', 'use']) inp.take(e); };
    if (!h.alive) {
      h.deadT += dt; h.moving = 0; h.ads = false; h.mg = null;
      if (h.deadT > 1.8 && !this.over) this.respawn();
      drain(); ui.setUse(null);
      return;
    }
    if (this.cut > 0) { h.moving = 0; h.ads = false; h.aim = damp(h.aim, 0, 10, dt); ui.setPrompt(null); ui.setUse(null); drain(); return; }
    // 互动键（I / F）：炮位旁上炮、阵地里接管机枪，再按一次离开
    let use = inp.take('use');
    if (can.manned) {
      ui.setUse('离开炮位'); ui.setPrompt(null);
      if (use) { this.leaveCannon(); use = false; }   // 同一下按键只离开，不会马上又坐回去
      else { this.controlCannon(dt); return; }
    }
    if (h.mg) {
      ui.setUse('离开机枪'); ui.setPrompt(null);
      if (use) { this.leaveMG(); use = false; }
      else { this.controlMG(dt); return; }
    }
    const nearCannon = this.gunUsable() && can.placed && can.alive && this.elev(h) < 0.5 && dist2(h.x, h.z, can.x, can.z + 1.6) < 3.4 * 3.4;
    const gun = nearCannon ? null : this.gunNear();
    const extra = nearCannon || gun ? null : this.useOption(h);   // 本章特有的互动（例如抓舌头）
    ui.setUse(nearCannon ? this.gunCfg.use : gun ? '机枪' : extra ? extra.label : null);
    ui.setPrompt(this.app.isTouch() ? null : nearCannon ? '按 I ' + this.gunCfg.use : gun ? '按 I 接管机枪' : extra ? extra.prompt : null);
    if (nearCannon && use) { this.manCannon(); drain(); return; }
    if (gun && use) { this.manMG(gun); drain(); return; }
    if (extra && use) { extra.act(); drain(); return; }

    h.ads = inp.held.ads && h.dashT <= 0 && h.reloadT <= 0;
    const mv = inp.move, yaw = c.yaw, fp = c.view === 1;
    const wx = rightX(yaw) * mv.x + fwdX(yaw) * mv.y, wz = rightZ(yaw) * mv.x + fwdZ(yaw) * mv.y;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const ox = h.x, oz = h.z;
    if (h.dashT > 0) {
      h.dashT -= dt;
      const sp = 34;
      h.x += h.dashX * sp * dt; h.z += h.dashZ * sp * dt;
      if (rand() < 0.9) this.fx.spawn({ x: h.x, y: h.y + 1.0, z: h.z, life: 0.2, s0: 0.26, s1: 0.04, c0: 0xdfe9ff, c1: 0x6f9fdc, spin: 0 });
      for (const e of this.enemies) {
        if (!e.alive || Math.abs(e.y - h.y) > 1.8 || h.dashHit.has(e)) continue;
        if (segPointD2(ox, oz, h.x, h.z, e.x, e.z) < 1.9 * 1.9) {
          h.dashHit.add(e);
          if (e.type === 'boss' && this.tryClash(e)) continue;
          this.hurtUnit(e, e.type === 'boss' ? 8 : 6, h.dashX, h.dashZ, 'blade');
          this.audio.play('slash'); this.fx.sparks(e.x, e.y + 1.2, e.z, 8, 0xffffff);
        }
      }
      if (h.dashT <= 0) h.inv = Math.max(h.inv, 0.3);
    } else if (mag > 0.01) {
      const sp = 6.3 * (h.ads ? 0.6 : inp.held.fire ? 0.85 : 1) * (h.onGround ? 1 : AIR_SPEED);
      h.x += wx * sp * dt; h.z += wz * sp * dt;
    }
    resolveCircle(this.world, h, h.r, h.y, true);
    this.heroBounds(h);
    // 跳跃、下落与落地：只有从上面落下才能站到箱子、沙袋、土台上
    const prevY = h.y;
    h.coyote = h.onGround ? 0.1 : Math.max(0, h.coyote - dt);
    if (inp.take('jump') && h.coyote > 0 && h.dashT <= 0) { h.vy = JUMP_V; h.onGround = false; h.coyote = 0; this.stats.jumps++; this.audio.play('jump', 0.7); }
    h.vy -= GRAVITY * dt;
    h.y += h.vy * dt;
    const gnd = groundAt(this.world, h.x, h.z, prevY);
    if (h.y <= gnd + (this.world.hgt && h.onGround && h.vy <= 0 ? 0.45 : 0) && h.vy <= 0) {
      if (h.vy < -6) { this.fx.dust(h.x, gnd + 0.05, h.z, 5); this.audio.play('thud', 0.3); }
      h.y = gnd; h.vy = 0; h.onGround = true;
    } else h.onGround = false;
    h.vx = (h.x - ox) / Math.max(dt, 1e-4); h.vz = (h.z - oz) / Math.max(dt, 1e-4);
    h.moving = damp(h.moving, h.dashT > 0 ? 1 : h.onGround ? mag : 0.25, 14, dt);
    if (mag > 0.01 && h.onGround) h.walk += dt * (4 + 8 * mag);
    // 身体跟着瞄准方向（枪战类：平移时不转身）
    const faceYaw = h.dashT > 0 ? yawTo(h.dashX, h.dashZ) : c.yaw;
    h.yaw = fp ? faceYaw : angStep(h.yaw, faceYaw, 16 * dt);

    this.computeAim();
    // 开火只在按住时；打空自动换弹，也可以手动换
    h.fireCd -= dt;
    const firing = inp.held.fire; inp.take('fire');
    const wantReload = inp.take('reload');
    if (h.reloadT > 0) { h.reloadT -= dt; if (h.reloadT <= 0) h.mag = h.magMax; }
    else if ((wantReload && h.mag < h.magMax) || h.mag <= 0) this.startReload();
    h.aim = damp(h.aim, firing || h.ads || h.fireCd > -0.6 ? 1 : 0, 16, dt);
    if (firing && h.fireCd <= 0 && h.reloadT <= 0 && h.dashT <= 0 && h.mag > 0) this.heroShoot();
    if (inp.take('nade')) this.throwNade();
    if (inp.take('dash')) this.startDash(wx, wz, mag);
    if (inp.take('cav')) this.callCavalry();
  }
  startReload() { const h = this.hero; h.reloadT = h.weapon === 'lmg' ? 1.6 : 1.1; this.audio.play('reload'); }

  // 准星射线：a.target 是被子弹吸附的敌人，a.near 用于准星减速与牵引，a.x/y/z 是子弹要去的点
  computeAim() {
    const h = this.hero, c = this.cam, a = this.aim, cam = this.camera.position;
    const cp = Math.cos(c.pitch), fx = fwdX(c.yaw) * cp, fy = Math.sin(c.pitch), fz = fwdZ(c.yaw) * cp;
    a.fx = fx; a.fy = fy; a.fz = fz;
    const ox = cam.x, oy = cam.y, oz = cam.z;
    // 第三人称跳过镜头到主角之间那一段，免得吸到身后的东西
    const skip = c.view === 0 ? Math.max(0.4, (h.x - ox) * fx + (h.y + 1.4 - oy) * fy + (h.z - oz) * fz + 0.5) : 0.3;
    const range = h.weapon === 'lmg' ? 60 : 55;
    let near = null, nAng = 9, nT = 0, nd = 0, npx = 0, npy = 0, npz = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.downed) continue;
      const s = e.model.scale, top = e.y + 1.9 * s;
      const t = (e.x - ox) * fx + (e.y + 1.05 * s - oy) * fy + (e.z - oz) * fz;
      if (t < skip || t > range) continue;
      const px = ox + fx * t, py = oy + fy * t, pz = oz + fz * t;
      const dh = Math.hypot(px - e.x, pz - e.z);
      const dv = py < e.y + 0.1 ? e.y + 0.1 - py : py > top ? py - top : 0;
      const d = Math.hypot(Math.max(0, dh - e.r), dv);
      const ang = Math.atan2(d, t);
      if (ang < nAng) { nAng = ang; near = e; nT = t; nd = d; npx = px; npy = py; npz = pz; }
    }
    a.target = null; a.near = null; a.nearAng = 9;
    if (near && nAng < FRICTION_ANG && !losBlocked(this.world, h.x, h.z, near.x, near.z, 1.5, h.y + 1.4, near.y + 1.2)) {
      const s = near.model.scale;
      a.near = near; a.nearAng = nAng;
      const rx = near.x - ox, ry = near.y + 1.1 * s - oy, rz = near.z - oz;
      a.nearDYaw = angDiff(c.yaw, yawTo(rx, rz));
      a.nearDPitch = Math.atan2(ry, Math.hypot(rx, rz)) - c.pitch;
      const magAng = (this.input.lookSrc === 'mouse' ? MAG_MOUSE : MAG_SOFT) * (h.ads ? 0.8 : 1);
      if (nAng < magAng) {
        a.target = near; a.dist = nT;
        if (nd <= 0.001) { a.x = npx; a.y = npy; a.z = npz; }      // 准星本来就压在身上：打哪是哪，抬高一点就是爆头
        else { a.x = near.x; a.y = clamp(npy, near.y + 0.35, near.y + 1.8 * s); a.z = near.z; }
        return;
      }
    }
    // 没吸到人：沿视线找第一个挡住的东西或地面
    let t = skip;
    for (; t < range; t += 0.8) {
      const py = oy + fy * t, px = ox + fx * t, pz = oz + fz * t;
      if (py <= this.groundY(px, pz) + 0.02 || pointBlocked(this.world, px, py, pz)) break;
    }
    a.x = ox + fx * t; a.z = oz + fz * t; a.y = Math.max(this.groundY(a.x, a.z) + 0.02, oy + fy * t); a.dist = t;
  }

  heroShoot() {
    const h = this.hero, c = this.cam, a = this.aim, fp = c.view === 1;
    const lmg = h.weapon === 'lmg';
    h.fireCd = lmg ? 0.105 : 0.18; h.mag--;
    let mx, my, mz;
    if (fp) {
      const p = this.camera.position;
      mx = p.x + a.fx * 0.5 + rightX(c.yaw) * 0.2; my = p.y - 0.14 + a.fy * 0.5; mz = p.z + a.fz * 0.5 + rightZ(c.yaw) * 0.2;
    } else {
      this.poseHero(0);
      muzzleWorld(h.model, _v);
      mx = _v.x; my = _v.y; mz = _v.z;
    }
    let dx = a.x - mx, dy = a.y - my, dz = a.z - mz;
    let l = Math.hypot(dx, dy, dz);
    if (l < 2.2 || dx * a.fx + dy * a.fy + dz * a.fz < 0) { dx = a.fx; dy = a.fy; dz = a.fz; l = 1; }   // 目标贴脸或落点在枪口后面：按视线方向打
    dx /= l; dy /= l; dz /= l;
    const sp = (lmg ? 0.02 : 0.01) * (h.ads ? 0.4 : 1) * (h.onGround ? 1 : 2.2) * (1 + h.moving * 0.6);
    dx += rand(-sp, sp); dy += rand(-sp, sp) * 0.7; dz += rand(-sp, sp);
    l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    this.bullets.push({ team: 0, x: mx, y: my, z: mz, dx, dy, dz, sp: 90, life: (lmg ? 62 : 57) / 90, dmg: 1, ign: null, age: 0, hero: true });
    this.audio.play(lmg ? 'lmg' : 'shot', 0.8);
  }

  throwNade() {
    const h = this.hero, a = this.aim, c = this.cam;
    if (h.nades <= 0) { this.ui.toast('手榴弹还在路上', 1.2); return; }
    h.nades--;
    // 朝准星落点抛，距离限制在 6～20 米
    let dx = (a.target ? a.target.x : a.x) - h.x, dz = (a.target ? a.target.z : a.z) - h.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { dx = fwdX(c.yaw); dz = fwdZ(c.yaw); d = 1; }
    const dd = clamp(d, 6, 20);
    const tx = h.x + (dx / d) * dd, tz = h.z + (dz / d) * dd;
    const mesh = new THREE.Mesh(this.nadeGeo, MAT.vc); mesh.castShadow = true; this.scene.add(mesh);
    const ty = this.groundY(tx, tz);
    this.nades.push({ x0: h.x, z0: h.z, y0: h.y, y1: ty, x1: tx, z1: tz, t: 0, d: 0.72, mesh, r: 4.6, dmg: 5, team: 0 });
    this.fx.ring(tx, ty + 0.07, tz, 4.6, 0.72, 0xffe9a8, 2);
    this.audio.play('throw');
    h.slash = 0.36;
  }
  startDash(wx, wz, mag) {
    const h = this.hero, c = this.cam;
    if (h.dashCd > 0 || h.dashT > 0) return;
    // 有方向输入就朝那边突进，否则朝准星方向
    let dx = fwdX(c.yaw), dz = fwdZ(c.yaw);
    if (mag > 0.1) { const l = Math.hypot(wx, wz) || 1; dx = wx / l; dz = wz / l; }
    h.dashX = dx; h.dashZ = dz; h.dashT = 0.3; h.dashCd = 7; h.dashHit.clear(); h.inv = Math.max(h.inv, 0.5); h.swordT = 0.9; h.slash = 0;
    this.audio.play('unsheathe'); this.audio.voice('liangjian', 0.9);
    this.ui.stamp('亮剑！', 0.8);
  }
  tryClash(b) {
    // 山本突进（或起手）时亮剑撞上：拼刀
    if (b.state !== 'dash' && b.state !== 'dashTele') return false;
    b.state = 'stun'; b.stT = 2.8;
    this.hero.dashT = 0; this.hero.inv = Math.max(this.hero.inv, 1.0);
    this.hurtUnit(b, 7, 0, 0, 'blade');
    this.stats.clash++; this.addScore(400);
    const mx = (b.x + this.hero.x) / 2, mz = (b.z + this.hero.z) / 2;
    const gy = this.groundY(mx, mz);
    this.fx.sparks(mx, gy + 1.4, mz, 26, 0xffffff); this.fx.ring(mx, gy + 0.1, mz, 5, 0.4, 0xffffff, 1);
    this.fx.clearWarnings();
    this.audio.play('clang');
    this.ui.stamp('狭路相逢勇者胜！', 1.5);
    return true;
  }
  callCavalry() {
    const h = this.hero;
    if (h.cavCd > 0) { this.ui.toast('骑兵连正在整队（' + Math.ceil(h.cavCd) + ' 秒）', 1.2); return; }
    const why = this.cavalryBlocked();
    if (why) { this.ui.toast(why, 1.6); return; }
    h.cavCd = 45; this.stats.cav++;
    const inCity = this.cavalryStraight(h);
    const yaw = inCity ? 0 : this.cam.yaw;
    const fx_ = fwdX(yaw), fz_ = fwdZ(yaw), rx = rightX(yaw), rz = rightZ(yaw);
    // 五骑分列两侧冲过去，中间留出主角和镜头的位置
    const lanes = inCity ? [-5.6, -3.6, -1.9, 2.3, 4.6] : [-8.2, -5.2, -2.4, 2.8, 5.8];
    for (let i = 0; i < 5; i++) {
      const off = lanes[i];
      const model = buildRider();
      const x = (inCity ? 0 : h.x) + rx * off - fx_ * (24 + Math.abs(i - 2) * 2.5), z = h.z + rz * off - fz_ * (24 + Math.abs(i - 2) * 2.5);
      model.root.rotation.y = yaw; model.root.position.set(x, this.groundY(x, z), z);
      this.scene.add(model.root);
      this.riders.push({ model, x, z, fx: fx_, fz: fz_, d: 0, hit: new Set(), t: rand(TAU), hop: 0 });
    }
    this.audio.voice('qibinglian'); this.audio.play('bugle', 0.7);
    this.ui.say('孙德胜', '骑兵连——进攻！', { now: true });
    this.ui.stamp('骑兵连，进攻！', 1.5);
  }
  updateRiders(dt) {
    this.hoofT = (this.hoofT || 0) - dt;
    if (this.riders.length && this.hoofT <= 0) { this.hoofT = 0.11; this.audio.play('hoof', 0.5); }
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      const sp = 18;
      r.x += r.fx * sp * dt; r.z += r.fz * sp * dt; r.d += sp * dt; r.t += dt * 16;
      // 遇到矮障碍就跃过去
      const rg = this.groundY(r.x, r.z);
      const blocked = pointBlocked(this.world, r.x + r.fx * 1.5, rg + 0.5, r.z + r.fz * 1.5);
      const bh = blocked ? blocked.h - (blocked.base || 0) : 0;
      r.hop = damp(r.hop, blocked && bh < 3 ? 1.5 : 0, 9, dt);
      if (blocked && bh >= 3) r.d = 999;
      r.model.root.position.set(r.x, rg + r.hop + Math.abs(Math.sin(r.t)) * 0.16, r.z);
      r.model.root.rotation.x = Math.sin(r.t) * 0.05;
      r.model.legs.forEach((l, k) => { l.rotation.x = Math.sin(r.t + (k < 2 ? 0 : Math.PI) + (k % 2) * 0.6) * 0.9; });
      r.model.rider.armR.rotation.x = 2.5 + Math.sin(r.t * 0.5) * 0.5;
      if (rand() < dt * 14) this.fx.dust(r.x, rg + 0.1, r.z, 1);
      for (const e of this.enemies) {
        if (!e.alive || e.y - rg > 2 || r.hit.has(e)) continue;
        if (dist2(e.x, e.z, r.x, r.z) < 2.0 * 2.0) { r.hit.add(e); this.hurtUnit(e, e.type === 'boss' ? 3 : 5, r.fx, r.fz, 'blade'); this.audio.play('slash', 0.7); this.fx.sparks(e.x, 1.3, e.z, 6, 0xffffff); }
      }
      if (r.d > 78) { this.scene.remove(r.model.root); this.riders.splice(i, 1); }
    }
  }

  // ---------- 阵地机枪：打掉机枪手后可以接管，枪身跟着准星转 ----------
  initGuns() {
    for (const m of this.mgs) this.scene.remove(m.model.root);
    this.mgs = this.mgSpots().map(([id, n, face = 1]) => {
      const model = buildMG();
      const gy = this.groundY(n.x, n.z);
      model.root.position.set(n.x, gy + 1.47, n.z + 1.2 * face); model.root.rotation.set(0, face > 0 ? Math.PI : 0, 0);   // 架在正面沙袋上，枪口朝外
      this.scene.add(model.root);
      return { id, x: n.x, z: n.z + 0.15 * face, gy, model, ammo: MG_BELT, cd: 0, reload: 0 };
    });
  }
  gunNear() {
    const h = this.hero;
    if (this.elev(h) > 0.5) return null;
    for (const m of this.mgs) {
      if (dist2(h.x, h.z, m.x, m.z) > 2.3 * 2.3) continue;
      if (this.enemies.some((e) => e.alive && e.type === 'mg' && e.nest === m.id)) continue;   // 机枪手还在
      return m;
    }
    return null;
  }
  manMG(m) {
    const h = this.hero;
    h.mg = m; h.x = m.x; h.z = m.z; h.y = m.gy || 0; h.vy = 0; h.onGround = true; h.moving = 0; h.ads = false;
    this.ui.setPrompt(null);
    this.audio.play('uiok');
    if (!this.flags.mgTip) { this.flags.mgTip = 1; this.ui.toast(this.app.isTouch() ? '滑屏瞄准，按住开火键扫射；点“离开机枪”下来' : '转动准星瞄准，按住开火键扫射；再按 I 下来', 5); }
  }
  leaveMG() { this.hero.mg = null; }
  controlMG(dt) {
    const h = this.hero, m = h.mg, inp = this.input, c = this.cam;
    h.x = m.x; h.z = m.z; h.y = m.gy || 0; h.vy = 0; h.onGround = true; h.moving = 0; h.yaw = c.yaw; h.ads = false;
    this.computeAim();
    m.cd -= dt;
    const firing = inp.held.fire; inp.take('fire');
    const wantReload = inp.take('reload');
    if (m.reload > 0) { m.reload -= dt; if (m.reload <= 0) m.ammo = MG_BELT; }
    else if ((wantReload && m.ammo < MG_BELT) || m.ammo <= 0) { m.reload = 2.2; this.audio.play('reload'); }
    h.aim = damp(h.aim, 1, 16, dt);
    if (firing && m.cd <= 0 && m.reload <= 0 && m.ammo > 0) this.shootMG(m);
    for (const e of ['jump', 'nade', 'dash']) inp.take(e);
    if (inp.take('cav')) this.callCavalry();
    const fx = fwdX(c.yaw), fz = fwdZ(c.yaw);
    m.model.root.position.set(m.x + fx * 0.8, (m.gy || 0) + 1.05, m.z + fz * 0.8);
    m.model.root.rotation.set(c.pitch, c.yaw, 0);
  }
  shootMG(m) {
    const c = this.cam, a = this.aim;
    m.cd = 0.075; m.ammo--;
    const fx = fwdX(c.yaw), fz = fwdZ(c.yaw);
    const mx = m.x + fx * 1.9, my = (m.gy || 0) + Math.max(1.0, 1.25 + Math.sin(c.pitch) * 1.1), mz = m.z + fz * 1.9;
    let dx = a.x - mx, dy = a.y - my, dz = a.z - mz;
    let l = Math.hypot(dx, dy, dz);
    if (l < 2.2 || dx * a.fx + dy * a.fy + dz * a.fz < 0) { dx = a.fx; dy = a.fy; dz = a.fz; l = 1; }
    dx /= l; dy /= l; dz /= l;
    const sp = 0.016;
    dx += rand(-sp, sp); dy += rand(-sp, sp) * 0.7; dz += rand(-sp, sp);
    l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    // 自己阵地的沙袋不挡自己的子弹
    this.bullets.push({ team: 0, x: mx, y: my, z: mz, dx, dy, dz, sp: 95, life: 0.75, dmg: 1, ign: 'nest', age: 0, hero: true });
    this.fx.sparks(mx, my, mz, 1, 0xffe08a);
    this.audio.play('mg', 0.8);
  }

  // ---------- 意大利炮 ----------
  manCannon() {
    const c = this.cannon, h = this.hero;
    c.manned = true; c.fireLock = true; this.cam.yaw = c.aimYaw; this.cam.pendYaw = 0; this.cam.pendPitch = 0; this.cam.pitch = 0;
    h.x = c.x + 0.9; h.z = c.z + 1.7; h.y = this.groundY(h.x, h.z); h.vy = 0; h.onGround = true; h.yaw = 0; h.moving = 0; h.aim = 0; h.ads = false;
    this.ui.setPrompt(null);
    this.audio.play('uiok');
    if (!this.flags.manned) { this.flags.manned = 1; this.ui.toast(this.app.isTouch() ? this.gunCfg.tipTouch : this.gunCfg.tip, 7); }
  }
  leaveCannon() {
    const c = this.cannon, h = this.hero;
    c.manned = false; this.arc.visible = false; this.aimRing.visible = false; this.ui.setAim(null);
    h.x = c.x + 2.2; h.z = c.z + 2.4; h.y = this.groundY(h.x, h.z); h.vy = 0; resolveCircle(this.world, h, h.r, h.y, true);
    this.cam.pendYaw = 0; this.cam.pendPitch = 0; this.cam.pitch = 0;
  }
  controlCannon(dt) {
    const c = this.cannon, inp = this.input, mv = inp.move, h = this.hero;
    const g = this.gunCfg;
    this.cam.yaw = clamp(this.cam.yaw - mv.x * 0.6 * (g.turnRate || 1) * dt, g.yawMin, g.yawMax);
    c.aimYaw = this.cam.yaw;
    c.elev = clamp(c.elev + mv.y * 0.24 * (g.elevRate || 1) * dt, g.elevMin, g.elevMax);
    h.x = c.x + 0.9; h.z = c.z + 1.7; h.yaw = c.aimYaw; h.moving = 0; h.ads = false;
    // 刚上炮位时要先松开开火键，免得同一下按键直接把炮打出去
    if (c.fireLock && !inp.held.fire) c.fireLock = false;
    const fire = (inp.take('fire') || inp.held.fire) && !c.fireLock;
    if (fire && c.reload <= 0 && this.cut <= 0) {
      if (c.shells > 0) this.fireCannon();
      else if (!this.flags.noShell || this.t - this.flags.noShell > 2) { this.flags.noShell = this.t; this.ui.toast(g.noShell, 1.8); }
    }
    for (const e of ['jump', 'reload', 'nade', 'dash']) inp.take(e);
    if (inp.take('cav')) this.callCavalry();
    // 弹道预览（迫击炮这类不给预览的，只按柱子报的数自己调）
    const pre = this.simShell(c.aimYaw, c.elev, !!g.preview);
    this.arc.visible = !!g.preview; this.aimRing.visible = !!g.preview;
    if (g.preview) {
      this.aimRing.position.set(pre.x, pre.y + 0.1, pre.z);
      if (pre.type === 'ground' || pre.y < 0.5) this.aimRing.rotation.set(Math.PI / 2, 0, 0); else this.aimRing.rotation.set(0, 0, 0);
    }
    const [html, ok, col] = this.gunAimInfo(pre);
    if (col !== undefined) { this.arc.material.color.setHex(col); this.aimRing.material.color.setHex(col); }
    this.ui.setAim(html, ok);
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
    const g = this.gunCfg, B = g.barrel, V = g.speed, G = g.grav;
    let x = c.x + fwdX(yaw) * B * cy, y = g.pivotY + Math.sin(elev) * B, z = c.z + fwdZ(yaw) * B * cy;
    let vx = fwdX(yaw) * cy * V, vy = Math.sin(elev) * V, vz = fwdZ(yaw) * cy * V;
    const pos = this.arcGeo.attributes.position, N = pos.count;
    const dt = 0.016;
    let hit = null, n = 0, k = 0;
    for (let i = 0; i < (g.simSteps || 400) && !hit; i++) {
      if (preview && i % 3 === 0 && n < N) pos.setXYZ(n++, x, y, z);
      vy -= G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
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
    const t = this.gunTargetHit(x, y, z);
    if (t) return t;
    const col = pointBlocked(w, x, y, z);
    if (col) return { type: 'solid', wall: col.tag === 'citywall', col };
    if (y <= 0) return { type: 'ground' };
    return null;
  }
  fireCannon() {
    const c = this.cannon, g = this.gunCfg;
    if (this.gunFireIntercept()) return;
    c.shells--; c.reload = g.reload; c.flashT = 0.09; this.stats.shells++;
    this.syncCannonModel(0);
    this.muzzlePos(_v);
    c.recoil = 1;
    const cy = Math.cos(c.elev);
    const mesh = new THREE.Mesh(this.shellGeo, MAT.vc); this.scene.add(mesh);
    // 实际炮弹与预览用同一套起点和步长，落点才对得上
    this.shells.push({ x: c.x + fwdX(c.aimYaw) * g.barrel * cy, y: g.pivotY + Math.sin(c.elev) * g.barrel, z: c.z + fwdZ(c.aimYaw) * g.barrel * cy, vx: fwdX(c.aimYaw) * cy * g.speed, vy: Math.sin(c.elev) * g.speed, vz: fwdZ(c.aimYaw) * cy * g.speed, g: g.grav, mesh, trail: 0, acc: 0 });
    // 炮口烟火（镜头不震，靠粒子和后坐表现）
    this.fx.burst(14, () => this.fx.spawn({ soft: true, x: _v.x, y: _v.y, z: _v.z, vx: fwdX(c.aimYaw) * rand(4, 16) + rand(-3, 3), vy: rand(-0.5, 4), vz: fwdZ(c.aimYaw) * rand(4, 16) + rand(-3, 3), life: rand(0.6, 1.5), s0: 0.7, s1: 2.8, drag: 2.4, c0: 0xffe2b0, c1: 0x8a847c }));
    this.fx.ring(c.x, 0.08, c.z, 6, 0.4, 0xe9d2a0, 1);
    this.fx.dust(c.x - 0.8, 0.1, c.z + 0.4, 6); this.fx.dust(c.x + 0.8, 0.1, c.z + 0.4, 6);
    this.audio.play(g.sound || 'cannon');
    this.hero.slash = 0.3;
    this.onGunFired();
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
    if (m.wheelL) m.wheelL.rotation.x = m.wheelR.rotation.x = -(c.wheel || 0);
    m.flash.visible = c.flashT > 0;
    // 炮组：推炮时走在两侧，架好后守在旁边
    const spots = this.gunCfg.crewSpots(c.placed);
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
        s.vy -= (s.g || SHELL_G) * sdt; s.x += s.vx * sdt; s.y += s.vy * sdt; s.z += s.vz * sdt;
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
    this.onShellImpact(hit, x, y, z, kills);
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
            const head = !!b.hero && my > e.y + 1.38 * e.model.scale;
            this.hurtUnit(e, b.dmg * (head ? 2 : 1) * (b.fromAlly && e.type === 'boss' ? 0.25 : 1), b.dx, b.dz, 'bullet');
            if (b.hero) { this.hitT = 0.12; this.hitKind = head ? 2 : 1; if (head) { this.stats.heads++; this.headT = 0.5; } }
            dead = true; break;
          }
        } else {
          if (h.alive) {
            const rr = h.r + 0.1;
            if (segPointD2(b.x, b.z, nx, nz, h.x, h.z) < rr * rr && my < h.y + 2.05 && my > h.y - 0.1) { if (this.heroCover(b)) fx.sparks(nx - b.dx * 0.6, ny, nz - b.dz * 0.6, 3, 0xffe2a0); else this.hurtHero(b.dmg, b.x - b.dx, b.z - b.dz); dead = true; }
          }
          if (!dead) for (const a of this.allies) {
            if (!a.alive || a.down > 0) continue;
            if (segPointD2(b.x, b.z, nx, nz, a.x, a.z) < 0.3 && my < a.y + 2 && my > a.y - 0.1) { if (!this.allyCover(a, b)) this.hurtUnit(a, b.dmg, b.dx, b.dz, 'bullet'); dead = true; break; }
          }
          if (!dead && c.visible && c.alive && this.gunExposed() && segPointD2(b.x, b.z, nx, nz, c.x, c.z + 0.8) < 2.2 && my < 1.9) { this.hurtCannon(b.dmg * 0.5); fx.sparks(nx, ny, nz, 4); dead = true; }
        }
        if (!dead) {
          if (pointBlocked(w, nx, ny, nz, b.ign)) { fx.sparks(nx - b.dx * 0.3, ny, nz - b.dz * 0.3, 3, 0xffe2a0); fx.dust(nx - b.dx * 0.4, ny, nz - b.dz * 0.4, 1); dead = true; }
          else { const gy = this.world.hgt ? this.world.hgt(nx, nz) : 0; if (ny <= gy + 0.02) { fx.dust(nx, gy + 0.05, nz, 2); dead = true; } }
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
      const x = lerp(n.x0, n.x1, k), z = lerp(n.z0, n.z1, k), y = 1.4 + 5.5 * k * (1 - k) * (1 + (n.high || 0)) - 1.35 * k + (n.y0 || 0) * (1 - k) + (n.y1 || 0) * k;
      n.mesh.position.set(x, y, z); n.mesh.rotation.x += dt * 12; n.mesh.rotation.z += dt * 7;
      if (k >= 1) {
        this.scene.remove(n.mesh); this.nades.splice(i, 1);
        this.blast(n.x1, n.z1, n.r, n.dmg, n.team);
      }
    }
  }
  // 地面爆炸：team=0 伤敌，team=1 伤我
  blast(x, z, r, dmg, team) {
    const gy = this.groundY(x, z);
    this.fx.explosion(x, gy + 0.1, z, r, false);
    this.sfxAt('explode', x, z, 0.9);
    if (team === 0) {
      for (const e of this.enemies) { if (!e.alive || e.y - gy > 2) continue; const d = dist(e.x, e.z, x, z); if (d < r) this.hurtUnit(e, d < r * 0.5 ? dmg : 2, e.x - x, e.z - z, 'blast'); }
    } else {
      const h = this.hero;
      if (h.alive && dist(h.x, h.z, x, z) < r && h.y - gy < 2.6 && !(this.cannon.manned)) this.hurtHero(2, x, z);
      for (const a of this.allies) if (a.alive && a.down <= 0 && dist(a.x, a.z, x, z) < r) this.hurtUnit(a, 3, a.x - x, a.z - z, 'blast');
      const c = this.cannon;
      if (c.visible && c.alive && this.gunExposed() && dist(c.x, c.z, x, z) < r + 1) this.hurtCannon(4);
    }
  }
  launchMortar(tx, tz, r, time, fromX, fromY, fromZ) {
    const gy = this.groundY(tx, tz);
    this.fx.warn(tx, tz, r, time, undefined, gy);
    const mesh = new THREE.Mesh(this.nadeGeo, MAT.vc); mesh.scale.setScalar(1.6); this.scene.add(mesh);
    this.mortars.push({ x: tx, z: tz, gy, r, t: 0, d: time, mesh, fx: fromX, fy: fromY, fz: fromZ });
    this.sfxAt('whistle', tx, tz, 0.7);
  }
  updateMortars(dt) {
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.d);
      m.mesh.position.set(lerp(m.fx, m.x, k), lerp(m.fy, m.gy || 0, k) + 26 * k * (1 - k), lerp(m.fz, m.z, k));
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
    if (u.hp <= 0) { if (!this.spareUnit(u, dmg, kind)) this.killUnit(u, false, dx, dz); }
    else if (u.kind === 'ally') u.regen = 5;
  }
  killUnit(u, silent, dx = 0, dz = 0) {
    if (!u.alive) return;
    if (u.kind === 'ally') { u.down = 8; u.hp = 0; u.moving = 0; return; }   // 战友倒地后会被卫生员救起
    u.alive = false; u.deadT = 0; u.fallYaw = Math.atan2(dx, dz);
    if (this.elev(u) > 2) { u.fall = 1; }
    if (silent) return;
    this.stats.kills++; this.addScore(u.def.score || 100);
    this.sfxAt('kill', u.x, u.z, 0.6);
    if (u.type === 'elite') {
      this.stats.elites++;
      if (!this.flags.eliteLine) {
        this.flags.eliteLine = 1;
        this.ui.say('李云龙', '什么他娘的精锐啊，我就不信那个邪，老子打的就是精锐！', { now: true });
        this.audio.voice('jingrui');
      }
    }
  }
  hurtHero(dmg, sx, sz) {
    const h = this.hero;
    if (!h.alive || h.inv > 0 || this.app.get('demo') || this.cut > 0 || this.flags.won) return;
    h.hp -= dmg; h.inv = 1.2; h.hurtT = 0.5; h.flashT = 0.12;
    this.stats.hurt++;
    this.audio.play('hurt');
    this.fx.sparks(h.x, 1.3, h.z, 6, 0xff8a70);
    if (h.hp <= 1 && h.hp > 0 && !this.flags.lowTip) { this.flags.lowTip = 1; this.ui.say(this.info().aide, '团长小心！快找急救包！'); }
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
    if (!c.alive || this.app.get('demo') || this.gunInvulnerable()) return;
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.hp = 0; c.alive = false;
      this.fx.explosion(c.x, 0.5, c.z, 5, true); this.audio.play('explode');
      this.ui.stamp(this.gunCfg.name + '被打坏了', 1.8, 'red');
      this.ui.say(this.gunCfg.crewName, this.gunCfg.brokenLine, { now: true });
      this.stats.retries++;
      this.after(2.4, () => { if (!this.over) { this.cannon.alive = true; this.cannon.hp = this.cannon.maxHp; this.enterPhase(this.phase, true); this.ui.toast('重整炮组，从本阶段再来', 3); } });
    }
  }
  respawn() {
    const h = this.hero;
    if (this.lives !== Infinity && this.lives <= 0) return;
    const [x, z] = this.respawnPoint();
    h.alive = true; h.hp = h.maxHp; h.inv = 2.6; h.deadT = 0; h.nades = h.nadeMax; h.mag = h.magMax; h.reloadT = 0; h.dashT = 0; h.mg = null;
    this.place(h, x, z);
    this.bullets = this.bullets.filter((b) => b.team === 0 || dist2(b.x, b.z, x, z) > 30 * 30);
    for (const e of this.enemies) if (e.alive) { e.stT = Math.max(e.stT, 1.6); if (e.type === 'boss') { e.state = 'walk'; e.cd = 2; } }
    this.fx.clearWarnings(); this.mortars.forEach((m) => this.scene.remove(m.mesh)); this.mortars.length = 0;
    this.ui.say('李云龙', '老子还没死呢！接着打！', { now: true });
  }

  spawnMed(x, z) {
    const gy = this.groundY(x, z);
    const mesh = new THREE.Mesh(this.medGeo, MAT.vc); mesh.castShadow = true; mesh.position.set(x, gy, z); this.scene.add(mesh);
    this.pickups.push({ type: 'med', x, z, gy, mesh });
  }
  spawnLoot(x, z) {
    const gy = this.groundY(x, z);
    const mesh = new THREE.Mesh(this.crateGeo, MAT.vc); mesh.castShadow = true; mesh.position.set(x, gy, z); mesh.scale.setScalar(1.3); this.scene.add(mesh);
    this.pickups.push({ type: 'loot', x, z, gy, mesh });
  }
  updatePickups(dt) {
    const h = this.hero;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.mesh.rotation.y += dt * 1.4; p.mesh.position.y = (p.gy || 0) + 0.25 + Math.sin(this.t * 3 + i) * 0.1;
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
        this.ui.toast('缴获歪把子机枪：射速更快，弹匣 40 发', 4);
      }
      this.scene.remove(p.mesh); this.pickups.splice(i, 1);
    }
  }

  // 有地形时，地面单位每帧贴着坡面走（站在城墙等固定高度上的不动）
  groundUnits() {
    const hg = this.world.hgt;
    for (const u of this.units) if (u !== this.hero && u.alive && !u.fixedY) u.y = hg(u.x, u.z);
  }
  separate() {
    const us = this.units;
    const hg = this.world.hgt;
    for (const u of us) u._up = hg ? u.y - hg(u.x, u.z) > 2 : u.y > 2;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive || a._up || a.down > 0) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || b._up || b.down > 0) continue;
        if (Math.abs(a.y - b.y) > 1.2) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = a.r + b.r;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
        // 战友给主角让路：主角不会被自己人挤开
        const fa = a.hold || a.type === 'mg' || (a === this.hero && (this.cannon.manned || a.mg || a.dashT > 0 || b.kind === 'ally')), fb = b.hold || b.type === 'mg' || (b === this.hero && a.kind === 'ally');
        const pa = fb ? push * 2 : push, pb = fa ? push * 2 : push;
        if (!fa) { a.x -= nx * pa; a.z -= nz * pa; }
        if (!fb) { b.x += nx * pb; b.z += nz * pb; }
      }
    }
  }

  // ---------- 姿势与模型 ----------
  poseHero(dt) {
    const h = this.hero, m = h.model;
    if (h.slash >= 0 && dt) { h.slash += dt * 2.6; if (h.slash > 1) h.slash = -1; }
    const blade = h.swordT > 0;
    this.sword.visible = blade;
    const pitch = h.aim > 0.3 && !this.cannon.manned ? this.cam.pitch : 0;
    poseSoldier(m, { walk: h.walk, moving: h.moving, aim: blade ? 0 : h.aim, pitch, carry: blade ? 'blade' : 'side', slash: blade || h.slash >= 0 ? (h.slash >= 0 ? h.slash : 0.9) : -1, cheer: this.flags.won ? this.t : 0 });
    m.root.position.set(h.x, h.y, h.z);
    m.root.rotation.y = h.yaw;
    m.root.updateMatrixWorld(true);
  }
  poseAll(dt) {
    const h = this.hero, fp = this.cam.view === 1;
    // 主角
    if (h.alive) { h.model.root.rotation.x = 0; this.poseHero(dt); }
    else { const k = Math.min(1, h.deadT / 0.45); h.model.root.rotation.x = k * 1.45; h.model.root.position.set(h.x, h.y + 0.05, h.z); }
    const blink = h.inv > 0 && h.alive && Math.floor(this.t * 14) % 2 === 0 && h.hurtT <= 0;
    const tooClose = !fp && this.cam.camDist < 1.15 && this.cut <= 0 && !this.cannon.manned;   // 镜头被墙顶到贴脸时先不画主角
    h.model.root.visible = !(fp && this.cut <= 0 && h.alive) && !blink && !tooClose;
    setSoldierMat(h.model, h.flashT > 0 ? (h.hurtT > 0 ? MAT.hurt : MAT.flash) : MAT.vc);
    h.model.flash.visible = h.alive && h.fireCd > (h.weapon === 'lmg' ? 0.06 : 0.13);
    this.viewGun.group.visible = fp && this.cut <= 0 && h.alive && !this.cannon.manned && this.mode === 'play';
    if (this.viewGun.group.visible) {
      const kick = Math.max(0, h.fireCd) * 0.5, ak = this.cam.adsK || 0;
      this.viewGun.group.position.set(0.25 - 0.2 * ak, -0.21 + 0.06 * ak + Math.sin(h.walk) * 0.008 * h.moving, -0.6 + kick * 0.6);
      this.viewGun.group.rotation.x = kick * 1.0;
      this.viewGun.group.scale.setScalar(h.weapon === 'lmg' ? 0.95 : 0.78);
      this.viewGun.flash.visible = h.fireCd > (h.weapon === 'lmg' ? 0.06 : 0.13);
    }
    // 落点影子
    this.blob.visible = h.alive && this.mode === 'play' && this.cut <= 0 && (!h.onGround || this.quality !== 'high');
    if (this.blob.visible) this.blob.position.set(h.x, groundAt(this.world, h.x, h.z, h.y) + 0.04, h.z);
    // 其他单位
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u === h) continue;
      const m = u.model;
      if (!u.alive) {
        u.deadT += dt;
        const k = Math.min(1, u.deadT / 0.4);
        m.root.rotation.x = k * 1.5;
        if (u.fall) { const gy = this.groundY(u.x, u.z); u.y = Math.max(gy, u.y - dt * 14 * Math.min(1, u.deadT * 2)); u.z += dt * 2.2 * (u.y > gy ? 1 : 0); }
        m.root.position.set(u.x, u.y + 0.05 - Math.max(0, u.deadT - 2.4) * 0.5, u.z);
        setSoldierMat(m, MAT.vc); m.flash.visible = false;
        if (u.deadT > 4.4) { this.scene.remove(m.root); this.units.splice(i, 1); const arr = u.kind === 'enemy' ? this.enemies : this.allies; arr.splice(arr.indexOf(u), 1); }
        continue;
      }
      u.flashT = Math.max(0, u.flashT - dt); u.shotT = Math.max(0, u.shotT - dt);
      if (u.down > 0) { m.root.rotation.x = 1.45; m.root.position.set(u.x, u.y + 0.05, u.z); setSoldierMat(m, MAT.vc); m.flash.visible = false; continue; }
      if (u.downed) { m.root.rotation.x = 1.25; m.root.rotation.y = u.yaw; m.root.position.set(u.x, u.y + 0.05, u.z); setSoldierMat(m, u.flashT > 0 ? MAT.flash : MAT.vc); m.flash.visible = false; continue; }
      m.root.rotation.x = u.state === 'stun' ? 0.35 : 0;
      if (u.slash >= 0) { u.slash += dt * (u.type === 'boss' ? 2.4 : 1.8); if (u.slash > 1) u.slash = -1; }
      if (u.cheer > 0) u.cheer += dt;
      const sd = m.melee;
      const tgt = u.target;
      const pitch = tgt && u.aim > 0.3 ? Math.atan2((tgt.y || 0) + 1.2 - (u.y + 1.3), Math.max(2, dist(u.x, u.z, tgt.x, tgt.z))) : 0;
      poseSoldier(m, { walk: u.walk, moving: u.moving, aim: sd ? 0 : u.aim, aimL: u.type === 'boss' ? u.aim : 0, pitch, carry: sd ? 'blade' : (u.def.look === 'rifle' || u.def.look === 'ally' || u.def.look === 'sergeant') ? 'rifle' : 'side', slash: u.slash, cheer: u.cheer });
      if (u.type === 'boss' && u.state === 'dash') { m.armR.rotation.x = 1.5; m.body.rotation.x = 0.5; }
      m.root.position.set(u.x, u.y, u.z);
      m.root.rotation.y = u.yaw;
      m.root.visible = !(this.cut <= 0 && u.kind === 'ally' && dist2(u.x, u.z, this.camera.position.x, this.camera.position.z) < 2.3 * 2.3);
      setSoldierMat(m, u.flashT > 0 ? MAT.flash : MAT.vc);
      m.flash.visible = u.shotT > 0 && !sd;
      if (m.flashL) m.flashL.visible = u.shotT > 0;
    }
    this.demoRing.visible = !!this.app.get('demo') && h.alive;
    if (this.demoRing.visible) this.demoRing.position.set(h.x, groundAt(this.world, h.x, h.z, h.y) + 0.08, h.z);
  }

  // ---------- 镜头 ----------
  moveSun(x, z) {
    const sx = Math.round(x / 2) * 2, sz = Math.round(z / 2) * 2;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx - 34, 46, sz + 22);
  }
  updateCamera(dt) {
    const c = this.cam, h = this.hero, can = this.cannon, cam = this.camera;
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
    const manned = can.manned;
    let view = c.view;
    if (view === 1 && !h.alive) view = 0;   // 阵亡时退回第三人称看清主角
    const v = VIEWS[view];
    const adsK = (c.adsK = damp(c.adsK || 0, h.ads && !manned && h.alive ? 1 : 0, 14, dt));
    const fov = v.fov * (1 - 0.3 * adsK);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // 镜头高度跟脚下地面走，不跟跳跃弧线（掉下去时跟着降）
    c.gy = damp(c.gy, h.onGround ? h.y : Math.min(h.y, c.gy), 10, dt);
    if (manned) {
      this.gunCamera(view, dt);
      c.F.set(can.x, 1.5, can.z); c.camDist = 9; c.clip = 1;
    } else {
      const cp = Math.cos(c.pitch), fx = fwdX(c.yaw) * cp, fy = Math.sin(c.pitch), fz = fwdZ(c.yaw) * cp;
      if (view === 1) {
        cam.position.set(h.x + fwdX(c.yaw) * 0.14, h.y + 1.62 * h.model.scale, h.z + fwdZ(c.yaw) * 0.14);
        c.camDist = 9; c.clip = 1;
      } else {
        // 越肩第三人称：以右肩为轴，准星在画面正中；右肩贴墙时把轴收回身体
        const rx = rightX(c.yaw), rz = rightZ(c.yaw);
        const want = pointBlocked(this.world, h.x + rx * 0.8, c.gy + 1.5, h.z + rz * 0.8) ? 0.12 : lerp(0.7, 0.95, adsK);
        c.shoulder = damp(c.shoulder === undefined ? 0.7 : c.shoulder, want, 12, dt);
        // 接管机枪时人在沙袋围子里：镜头抬高、贴近，从沙袋上方看出去，免得被正面沙袋挡住
        const onGun = !!h.mg;
        const px = h.x + rx * c.shoulder, py = c.gy + (onGun ? 2.35 : 1.95) + (h.y - c.gy) * 0.4, pz = h.z + rz * c.shoulder;
        const d = onGun ? 1.5 : lerp(v.dist, 3.1, adsK);
        const cx = px - fx * d, cy = py - fy * d, cz = pz - fz * d;
        let clip = 1;
        const gc = this.groundY(cx, cz) + 0.3;
        if (cy < gc) clip = Math.min(clip, (py - gc) / Math.max(0.01, py - cy));
        // 墙、房子、土坎挡在镜头与主角之间时把镜头拉近
        for (const col of this.world.colliders) {
          const cb = col.base || 0;
          if (!col.on || col.h - cb < 1.2 || col.y0 - cb > 3) continue;
          const t = segRect(px, pz, cx, cz, col);
          if (t >= 0 && t < clip) { const yAt = py + (cy - py) * t; if (yAt < col.h + 0.25) clip = t; }
        }
        clip = Math.max(0.1, clip - 0.05);
        c.clip = clip < c.clip ? clip : Math.min(clip, c.clip + dt * 2.2);
        cam.position.set(px + (cx - px) * c.clip, py + (cy - py) * c.clip, pz + (cz - pz) * c.clip);
        c.camDist = d * c.clip;
      }
      _v.set(cam.position.x + fx, cam.position.y + fy, cam.position.z + fz);
      cam.lookAt(_v);
      c.F.set(h.x, 1.5, h.z);
    }
    this.moveSun(c.F.x, c.F.z);
    this.updateFades(view === 1 || manned);
  }
  // 操炮时的镜头：默认是意大利炮（第一人称＝炮手视角，第三人称＝炮后视角）；迫击炮这类曲射火炮由章节覆盖
  gunCamera(view) {
    const can = this.cannon, cam = this.camera;
    const yaw = can.aimYaw, fxx = fwdX(yaw), fzz = fwdZ(yaw);
    if (view === 1) {
      // 炮手视角：炮盾前沿、炮管右侧
      cam.position.set(can.x + rightX(yaw) * 0.42 + fxx * 0.75, 1.5, can.z + rightZ(yaw) * 0.42 + fzz * 0.75);
      const pu = can.elev * 0.55 - 0.03, cp = Math.cos(pu);
      _v.set(cam.position.x + fxx * cp, cam.position.y + Math.sin(pu), cam.position.z + fzz * cp);
    } else {
      const p = 13 * DEG, d = 8.5;
      _v.set(can.x + fxx * 5, 2.4, can.z + fzz * 5);
      cam.position.set(_v.x - fxx * d * Math.cos(p), _v.y + d * Math.sin(p), _v.z - fzz * d * Math.cos(p));
    }
    cam.lookAt(_v);
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
    if (mk && this.advanceFormation()) this.advYaw = angStep(this.advYaw, yawTo(mk.x - h.x, mk.z - h.z), dt * 1.2); else this.advYaw = angStep(this.advYaw, 0, dt * 1.2);
    ui.setCannon(this.gunBar(), this.gunBarLabel());
    const b = this.boss;
    ui.setBoss(b && b.alive && this.cut <= 0 ? b.hp / b.maxHp : null, b && (b.state === 'stun' || b.state === 'recover'));
    ui.setVignette(Math.max(h.hurtT * 1.6, h.alive && h.hp <= 1 && h.maxHp > 1 ? 0.25 + 0.12 * Math.sin(this.t * 6) : 0, h.alive ? 0 : 0.6));
    ui.setCross(this.mode === 'play' && h.alive && this.cut <= 0 && (!c.manned || !!this.gunCfg.cross) && !this.flags.won, !!this.aim.target && !c.manned, h.ads, this.hitT > 0 ? this.hitKind : 0);
    ui.setCrossTip(c.manned || !h.alive || this.cut > 0 ? null : this.headT > 0 ? '爆头！' : h.reloadT > 0 ? '换弹中…' : h.mag > 0 && h.mag <= 3 ? '子弹不多了' : null, this.headT > 0);
    // 动作键状态（触屏按钮与电脑右下角的状态条共用）
    if (c.manned) ui.setAction('fire', this.gunCfg.fireLabel, c.shells > 0 ? (c.reload > 0 ? '装填' : '×' + c.shells) : '等炮弹', c.reload > 0 || c.shells <= 0, 'J');
    else if (h.mg) ui.setAction('fire', touch ? '开火' : '重机枪', h.mg.reload > 0 ? '换弹' : h.mg.ammo + '/' + MG_BELT, h.mg.reload > 0, 'J');
    else ui.setAction('fire', touch ? '开火' : h.weapon === 'lmg' ? '歪把子' : '驳壳枪', h.reloadT > 0 ? '换弹' : h.mag + '/' + h.magMax, h.reloadT > 0, 'J');
    ui.setAction('nade', '手榴弹', '×' + h.nades, h.nades <= 0 || c.manned || !!h.mg, 'U');
    ui.setAction('dash', '亮剑', c.manned ? '操炮中' : h.mg ? '机枪上' : h.dashCd > 0 ? Math.ceil(h.dashCd) + '秒' : '', h.dashCd > 0 || c.manned || !!h.mg, 'L');
    const cavNo = !!this.cavalryBlocked();
    ui.setAction('cav', '骑兵连', cavNo ? '进不来' : h.cavCd > 0 ? Math.ceil(h.cavCd) + '秒' : '', h.cavCd > 0 || cavNo, 'N');
    ui.setKeyHint(c.manned
      ? this.gunCfg.keyHint
      : h.mg ? '鼠标或 <kbd>Q</kbd><kbd>E</kbd><kbd>Y</kbd><kbd>H</kbd> 瞄准　<kbd>J</kbd>/左键 扫射　<kbd>R</kbd> 换弹链　<kbd>I</kbd> 离开机枪　<kbd>C</kbd> 切换人称'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　鼠标或 <kbd>Q</kbd><kbd>E</kbd><kbd>Y</kbd><kbd>H</kbd> 瞄准　<kbd>空格</kbd>/<kbd>K</kbd> 跳　<kbd>I</kbd> 互动　<kbd>R</kbd> 换弹　<kbd>O</kbd>/右键 开镜　<kbd>C</kbd> 切换人称　<kbd>Esc</kbd> 暂停');
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
    this.chapterLabels(lab);
    if (this.boss) lab('boss', this.info().bossName, this.boss, 2.75, true);
    if (this.app.get('fps')) this.app.fpsText();
  }

  // ---------- 章节钩子（默认实现；各章在 chapters/*.js 里覆盖） ----------
  info() { return { id: '', name: '', bossName: '敌军指挥官', aide: '张大彪', phases: [''] }; }
  env() { return { fog: 0xdcb589, fogNear: 70, fogFar: 300, sky: 0xfff0d8, ground: 0x7a6248, hemi: 0.85, sun: 0xffdcae, sunI: 1.25 }; }
  buildWorld() { throw new Error('章节必须实现 buildWorld'); }
  // 火炮：默认是平安县城的意大利炮（直瞄、有弹道预览）
  gunConfig() {
    return {
      build: buildCannon, name: '意大利炮', use: '操炮', fireLabel: '开炮', crew: ['dabiao', 'ally', 'ally'], crewName: '二营长',
      speed: SHELL_V, grav: SHELL_G, barrel: 1.9, pivotY: 1.04, reload: 2.1, shells: 8, elev0: 0.2, elevMin: 0.03, elevMax: 0.7, yawMin: -0.95, yawMax: 0.95, preview: true,
      brokenLine: '团长，炮……炮让鬼子打坏了！', noShell: '炮弹打光了，和尚正在扛（稍等几秒）',
      tip: 'A/D 或鼠标转炮口，W/S 或 Y/H 调仰角，落点对准目标后按开火键（左键 / J）开炮；I 离开炮位',
      tipTouch: '摇杆或滑屏转炮口、调仰角，落点对准目标后点开火键开炮',
      keyHint: '<kbd>A</kbd><kbd>D</kbd> 转炮口　<kbd>W</kbd><kbd>S</kbd> 调仰角　<kbd>J</kbd>/左键 开炮　<kbd>I</kbd> 离开炮位　<kbd>C</kbd> 切换人称',
      crewSpots: (placed) => (placed ? [[-1.5, 1.3, 0.3], [1.9, 2.6, -0.2], [-2.2, 2.8, 0.2]] : [[-1.25, 1.2, 0], [1.25, 1.2, 0], [0, 3.0, 0]]),
    };
  }
  chapterProps() {}
  clearChapter() {}
  resetChapter() {}
  startPos() { return { x: 0, z: 0 }; }
  startWeapon() { return 'pistol'; }
  allyRoster() { return [['dabiao', '张大彪'], ['ally'], ['ally'], ['ally']]; }
  resetGun() { this.cannon.visible = false; }
  titleCam(t, a) {
    this.camera.position.set(Math.sin(a) * 34, 9 + Math.sin(t * 0.1) * 3, 24 + Math.cos(a) * 16);
    this.camera.lookAt(0, 10.5, -20);
    this.moveSun(0, 20);
  }
  ambientChapter() {}
  heroBounds() {}
  gunUsable() { return false; }
  useOption() { return null; }
  cavalryBlocked() { return null; }
  cavalryStraight() { return false; }
  mgSpots() { return []; }
  gunAimInfo(pre) { return [`仰角 <b>${Math.round(this.cannon.elev / DEG)}°</b>　炮弹 <b>${this.cannon.shells}</b>`, false]; }
  gunTargetHit() { return null; }
  gunFireIntercept() { return false; }
  onGunFired() {}
  onShellImpact() {}
  gunInvulnerable() { return false; }
  gunExposed() { return false; }
  gunTargetable() { return false; }
  gunBar() { return null; }
  gunBarLabel() { return '炮组'; }
  spareUnit() { return false; }
  // 主角 / 战友在掩体（例如交通壕）里时，章节可以让一部分子弹打在掩体上
  heroCover() { return false; }
  allyCover() { return false; }
  // 按阶段换光照（白天、夜里、拂晓）：只改给出的项
  setLight(o) {
    const f = this.scene.fog;
    if (o.fog !== undefined) f.color.setHex(o.fog);
    if (o.fogNear !== undefined) { f.near = o.fogNear; f.far = o.fogFar; }
    if (o.sky !== undefined) this.hemi.color.setHex(o.sky);
    if (o.ground !== undefined) this.hemi.groundColor.setHex(o.ground);
    if (o.hemi !== undefined) this.hemi.intensity = o.hemi;
    if (o.sun !== undefined) this.sun.color.setHex(o.sun);
    if (o.sunI !== undefined) this.sun.intensity = o.sunI;
  }
  updateChapter() {}
  respawnPoint() { const s = this.startPos(); return [s.x, s.z]; }
  advanceFormation() { return false; }
  chapterLabels() {}
  updateBossUnit() {}
  objective() { return ['', null]; }
  updatePhase() { this.phaseT += 0; }
  // 敌方掷弹筒的落点：默认朝主角脚下（带一点提前量）
  mortarAim() { const h = this.hero; return h.alive ? [h.x + h.vx * 0.8, h.z + h.vz * 0.8] : null; }
  // 战友：返回 [x, z, 固定岗位] 时守在那里，否则按散兵线跟着主角
  allyPost() { return null; }
  formationYaw() { return this.advYaw || 0; }
  allyClamp(u, sx) { return sx; }
  cheerPoint() { return this.hero; }
  allyEngageWall() { return false; }
  // 结算：章节给出标题、评语和战报行
  finish(win) {
    if (this.over) return;
    this.over = true;
    const s = this.stats;
    if (win) this.addScore(Math.max(0, 3000 - Math.round(this.t) * 5));
    const score = Math.max(0, this.score - s.deaths * 300 - s.retries * 300);
    this.app.onResult({ win, rank: '', quote: '', score, demo: s.demo, rows: [['用时', fmtTime(this.t)], ['歼敌', s.kills], ['阵亡', s.deaths]] });
  }
}
