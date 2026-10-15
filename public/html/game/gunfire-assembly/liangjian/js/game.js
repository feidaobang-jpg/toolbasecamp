// 亮剑战役共用引擎：主角（枪、拔刀近战、蹲下 / 趴下）、视角、枪弹、手榴弹、阵地机枪、火炮 / 迫击炮、过场与战斗界面。
// 各章（chapters/*.js）继承 Game，实现场景、阶段流程、敌人配置、剧情和结算；章节差异都走下面“章节钩子”一节的方法。
import * as THREE from '../vendor/three.module.js';
import { TAU, DEG, clamp, lerp, damp, angDiff, angStep, fwdX, fwdZ, rightX, rightZ, yawTo, dist, dist2, rand, pick, reseed, segPointD2, segRect, fmtTime } from './util.js';
import { resolveCircle, groundAt, pointBlocked, losBlocked } from './world-kit.js';
import { MAT, buildSoldier, poseSoldier, muzzleWorld, setSoldierMat, buildCannon, buildMG, buildViewGun, buildBroadsword, buildMedkit, buildCrate } from './models.js';
import { Geo } from './geo.js';
import { Fx } from './fx.js';
import { DEF, updateEnemy, updateAlly, wakeGroup, still } from './ai.js';

// 枪战类只留两个视角：越肩第三人称（默认）与第一人称。pitch 为抬头角，向上为正
export const VIEWS = [
  { fov: 62, dist: 4.4, minP: -50 * DEG, maxP: 42 * DEG },
  { fov: 76, minP: -60 * DEG, maxP: 60 * DEG },
];
const SHELL_V = 46, SHELL_G = 18;                     // 意大利炮的默认弹道（章节可在 gunConfig 里换成迫击炮）
const MG_BELT = 100;                                    // 阵地机枪一条弹链的发数
const MAN_DELAY = 3, MAN_RANGE = 15, ALLY_GUN_RANGE = 20;   // 机枪 / 碉堡没人后多久、多远内的鬼子会去补位；战友人少站得散，20 米内的会去操枪
const REINF_DELAY = 8;                                  // 战友阵亡后多久从后面补上来一个
const ARMOR = { std: 5, easy: 8, one: 1 };
const SENS = { low: 0.7, mid: 1, high: 1.4 };
const JUMP_V = 8.2, GRAVITY = 26, AIR_SPEED = 0.85;    // 起跳约 1.3 米；滞空短一点、空中略慢，容易落在箱子上
// 姿势：站 / 蹲 / 趴的身高（子弹打主角时按这个高度算）、移动速度倍数，以及镜头（眼睛）比站着低多少
const STANCE_TOP = [2.05, 1.4, 0.62], STANCE_SPEED = [1, 0.55, 0.25];
const CROUCH_DROP = 0.5, PRONE_DROP = 1.2;
// 近战：轻砍 / 重砍（按住蓄力）的出刀时机、伤害与攻击范围；刚按下格挡 PARRY_WIN 秒内挡住＝弹开
const SWING = { light: { dur: 0.4, hitAt: 0.15, reach: 2.6, cone: 60 * DEG, dmg: 2, boss: 4, max: 2, lunge: 0.6 }, heavy: { dur: 0.62, hitAt: 0.26, reach: 3.0, cone: 72 * DEG, dmg: 5, boss: 12, max: 3, lunge: 2.2 } };
const HEAVY_HOLD = 0.32, HEAVY_AUTO = 0.75, PARRY_WIN = 0.25;
const MAG_SOFT = 4.2 * DEG, MAG_MOUSE = 2.2 * DEG;     // 子弹吸附角：触屏 / 按键转视角略大，鼠标略小
const FRICTION_ANG = 7.5 * DEG, PULL_ANG = 5 * DEG;    // 准星减速与开火牵引的范围（只对触屏 / 按键生效）
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);   // 大刀模型的刀身朝向（刀柄在原点，刀身朝 -y）

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
    this.bullets = []; this.nades = []; this.shells = []; this.mortars = []; this.mgs = []; this.pickups = []; this.timers = []; this.cast = [];
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
    // 手腕：刀挂在手上，能单独立起来（原来是顺着手臂直出去）
    this.swordPivot = new THREE.Group(); this.swordPivot.position.set(0, -0.6, 0);
    this.sword.position.set(0, 0.62, 0); this.swordPivot.add(this.sword);
    // 第一人称拿在手里的大刀（挂在镜头上，和第一人称的枪一样）
    this.viewSword = new THREE.Group();
    // 刀模型的原点在肩膀、刀柄在 -0.6 处：套一层转轴，让刀柄落在转轴原点上，转刀时刀柄不动
    const vs = buildBroadsword(); vs.castShadow = false; vs.scale.setScalar(0.62); vs.position.y = 0.6 * 0.62;
    const vp = new THREE.Group(); vp.add(vs); this.viewSword.add(vp); this.viewSword.blade = vp;
    this.viewSword.visible = false; this.camera.add(this.viewSword);
    this.medGeo = buildMedkit().geometry; this.crateGeo = buildCrate().geometry;
    this.smokeT = 0;
    this.chapterProps();
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q === 'high';
    this.fx.scale = q === 'high' ? 1 : 0.5;
  }
  // 预编译着色器：爆炸火球、冲击波圈、预警条、炮弹、废墟这些平时藏着，第一次露面时才编译。
  // 有的电脑（Windows 上的部分浏览器）编译一次要几十到几百毫秒，开第一炮时画面会顿一下；载入和换画质时先统一编好
  warmShaders() {
    const shown = [], tmp = [new THREE.Mesh(this.shellGeo, MAT.vc), new THREE.Mesh(this.nadeGeo, MAT.vc)];
    for (const m of tmp) this.scene.add(m);
    this.scene.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    try { this.app.renderer.compile(this.scene, this.camera); } catch (e) { /* 编不了就留到第一次显示时再编 */ }
    for (const o of shown) o.visible = false;
    for (const m of tmp) this.scene.remove(m);
  }

  // ---------- 开局 / 重置 ----------
  clearDynamic() {
    for (const u of this.units) this.scene.remove(u.model.root);
    for (const n of this.nades) this.scene.remove(n.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const m of this.mortars) if (m.mesh) this.scene.remove(m.mesh);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.units.length = this.enemies.length = this.allies.length = 0;
    this.bullets.length = this.nades.length = this.shells.length = this.mortars.length = this.pickups.length = this.timers.length = 0;
    this.reinf = []; this._resPhase = -1;
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
    this.stats = { kills: 0, elites: 0, genius: 0, clash: 0, parry: 0, blocks: 0, cuts: 0, crews: 0, reinf: 0, fallen: 0, loot: 0, deaths: 0, hurt: 0, meds: 0, retries: 0, shells: 0, heads: 0, jumps: 0, startPhase, demo: !!a.get('demo') };
    this.score = 0;
    this.lives = a.get('lives') === 'inf' ? Infinity : 3;
    this.flags = {};
    this.resetChapter(startPhase);
    // 主角
    const maxHp = ARMOR[a.get('armor')] || 5;
    const st = this.startPos();
    const model = buildSoldier('hero');
    this.scene.add(model.root);
    model.armR.add(this.swordPivot);
    const h = (this.hero = { kind: 'player', type: 'hero', x: st.x, z: st.z, y: 0, vy: 0, onGround: true, coyote: 0, yaw: 0, hp: maxHp, maxHp, alive: true, inv: 0, model, walk: 0, moving: 0, aim: 0, ads: false, fireCd: 0, weapon: this.startWeapon(startPhase), mag: 20, magMax: 20, reloadT: 0, nades: 3, nadeMax: 3, nadeT: 0, blade: false, bladeK: 0, atk: null, combo: 0, comboT: 0, charge: -1, queued: false, block: false, blockT: 9, stagger: 0, stance: 0, crouchK: 0, proneK: 0, sprint: false, deadT: 0, r: 0.45, flashT: 0, vx: 0, vz: 0, slash: -1, hurtT: 0 });
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
    this.initBunkerCrews();
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
    if (!this.flags.mgHint) { this.flags.mgHint = 1; this.after(2.8, () => this.ui.toast(this.app.isTouch() ? '阵地里的机枪归你了：走进去点“机枪”接管' : '阵地里的机枪归你了：走进去按 F 接管', 4.5)); }
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
    if (!this.flags.skipTip) { this.flags.skipTip = 1; this.after(1.1, () => { if (this.scn) this.ui.toast(this.app.isTouch() ? '点开火键可以跳过这段剧情' : '按左键或空格可以跳过这段剧情', 3.2); }); }
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
    this.updateGuns(dt);
    this.updateCrews(dt);
    this.updateReinforce(dt);
    for (const u of this.allies) updateAlly(this, u, dt);
    for (const u of this.enemies) { if (u.type === 'boss') this.updateBossUnit(u, dt); else updateEnemy(this, u, dt); }
    this.separate();
    if (this.world.hgt) this.groundUnits();
    this.updateBullets(dt);
    this.updateNades(dt);
    this.updateShells(dt);
    this.updateMortars(dt);
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

  // ---------- 转视角：镜头方向就是瞄准方向（鼠标或手指拖动） ----------
  updateLook(dt) {
    const c = this.cam, h = this.hero, inp = this.input, can = this.cannon;
    const [dx, dy] = inp.takeLook();
    if (this.cut > 0 || !h.alive) { c.pendYaw = 0; c.pendPitch = 0; return; }
    const sens = SENS[this.app.get('aimSens')] || 1;
    const ads = h.ads && !can.manned ? 0.62 : 1;
    // 准星靠近目标时减速、开火时轻微牵引：只对触屏生效，鼠标只保留子弹吸附
    const a = this.aim, soft = inp.lookSrc !== 'mouse' && !can.manned;
    let fr = 1;
    if (soft && a.near) fr = 0.5 + 0.5 * Math.min(1, a.nearAng / FRICTION_ANG);
    c.pendYaw = clamp(c.pendYaw - dx * 3.0 * sens * ads * fr, -2.6, 2.6);
    c.pendPitch = clamp(c.pendPitch - dy * 2.4 * sens * ads * fr, -1.4, 1.4);
    const rate = 8 * dt, k = 1 - Math.exp(-(inp.lookSrc === 'mouse' ? 38 : 24) * dt);
    let sy = clamp(c.pendYaw * k, -rate, rate), sp = clamp(c.pendPitch * k, -rate, rate);
    c.pendYaw -= sy; c.pendPitch -= sp;
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
    h.stagger = Math.max(0, h.stagger - dt);
    this.hitT = Math.max(0, this.hitT - dt); this.headT = Math.max(0, this.headT - dt);
    if (h.nades < h.nadeMax) { h.nadeT += dt; if (h.nadeT >= 12) { h.nadeT = 0; h.nades++; } }
    const drain = () => { for (const e of ['fire', 'jump', 'reload', 'nade', 'blade', 'crouch', 'prone', 'stance', 'use']) inp.take(e); };
    if (!h.alive) {
      h.deadT += dt; h.moving = 0; h.ads = false; h.mg = null; h.atk = null; h.block = false;
      if (h.deadT > 1.8 && !this.over) this.respawn();
      drain(); ui.setUse(null);
      return;
    }
    if (this.cut > 0) { h.moving = 0; h.ads = false; h.atk = null; h.charge = -1; h.block = false; h.aim = damp(h.aim, 0, 10, dt); ui.setPrompt(null); ui.setUse(null); drain(); return; }
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
    ui.setPrompt(this.app.isTouch() ? null : nearCannon ? '按 F ' + this.gunCfg.use : gun ? '按 F 接管机枪' : extra ? extra.prompt : null);
    if (nearCannon && use) { this.manCannon(); drain(); return; }
    if (gun && use) { this.manMG(gun); drain(); return; }
    if (extra && use) { extra.act(); drain(); return; }

    // 拔刀（Q）：刀在手时左键砍、按住蓄力重砍，右键格挡；再按 Q 收刀
    if (inp.take('blade')) this.toggleBlade();
    h.bladeK = damp(h.bladeK, h.blade ? 1 : 0, 12, dt);
    // 姿势：C 蹲下 / 站起，Z 趴下 / 站起；触屏“姿势”键站→蹲→趴轮换
    if (inp.take('crouch')) this.setStance(h.stance === 1 ? 0 : 1);
    if (inp.take('prone')) this.setStance(h.stance === 2 ? 0 : 2);
    if (inp.take('stance')) this.setStance((h.stance + 1) % 3);
    const mv = inp.move, yaw = c.yaw, fp = c.view === 1;
    // 蹲着、趴着按 Shift 往前跑：先站起来
    if (h.stance && inp.held.sprint && mv.y > 0.3) this.setStance(0);
    h.crouchK = damp(h.crouchK, h.stance === 1 ? 1 : 0, 12, dt);
    h.proneK = damp(h.proneK, h.stance === 2 ? 1 : 0, 7, dt);
    if (h.blade && inp.adsToggle) { inp.adsToggle = false; inp._sync(); }
    h.ads = !h.blade && inp.held.ads && h.reloadT <= 0;
    // 格挡：刀在手、没在出刀、没被震住；记下按下格挡多久了（刚按下的一瞬间挡住＝弹开）
    const blocking = h.blade && h.bladeK > 0.85 && inp.held.block && !h.atk && h.stagger <= 0;
    if (blocking && !h.block) h.blockT = 0; else h.blockT += dt;
    h.block = blocking;
    // 按住 Shift 跑：只往前（含斜前）跑得动；开火、开镜、换弹、出刀、格挡时跑不起来，开火优先
    h.sprint = inp.held.sprint && mv.y > 0.3 && !h.ads && !inp.held.fire && h.reloadT <= 0 && !h.stance && !h.block && !h.atk;
    const wx = rightX(yaw) * mv.x + fwdX(yaw) * mv.y, wz = rightZ(yaw) * mv.x + fwdZ(yaw) * mv.y;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const ox = h.x, oz = h.z;
    if (mag > 0.01) {
      const k = h.stagger > 0 ? 0.2 : h.sprint ? 1.45 : h.stance ? STANCE_SPEED[h.stance] : h.atk ? 0.35 : h.block ? 0.55 : h.ads ? 0.6 : inp.held.fire && !h.blade ? 0.85 : 1;
      const sp = 6.3 * k * (h.onGround ? 1 : AIR_SPEED);
      h.x += wx * sp * dt; h.z += wz * sp * dt;
    }
    // 出刀时往前带一步（重砍带得多）；贴着敌人了就不再往前，免得冲过头砍到空气
    if (h.atk && h.atk.t < h.atk.hitAt + 0.04 && !this.foeAhead(1.3)) { const s = h.atk.lunge / (h.atk.hitAt + 0.04); h.x += fwdX(h.yaw) * s * dt; h.z += fwdZ(h.yaw) * s * dt; }
    resolveCircle(this.world, h, h.r, h.y, true);
    this.heroBounds(h);
    // 跳跃、下落与落地：只有从上面落下才能站到箱子、沙袋、土台上；蹲着、趴着按跳是站起来
    const prevY = h.y;
    h.coyote = h.onGround ? 0.1 : Math.max(0, h.coyote - dt);
    if (inp.take('jump')) {
      if (h.stance) this.setStance(0);
      else if (h.coyote > 0 && !h.atk && h.stagger <= 0) { h.vy = JUMP_V; h.onGround = false; h.coyote = 0; this.stats.jumps++; this.audio.play('jump', 0.7); }
    }
    h.vy -= GRAVITY * dt;
    h.y += h.vy * dt;
    const gnd = groundAt(this.world, h.x, h.z, prevY);
    if (h.y <= gnd + (this.world.hgt && h.onGround && h.vy <= 0 ? 0.45 : 0) && h.vy <= 0) {
      if (h.vy < -6) { this.fx.dust(h.x, gnd + 0.05, h.z, 5); this.audio.play('thud', 0.3); }
      h.y = gnd; h.vy = 0; h.onGround = true;
    } else h.onGround = false;
    h.vx = (h.x - ox) / Math.max(dt, 1e-4); h.vz = (h.z - oz) / Math.max(dt, 1e-4);
    h.moving = damp(h.moving, h.onGround ? mag : 0.25, 14, dt);
    if (mag > 0.01 && h.onGround) h.walk += dt * (4 + 8 * mag) * (h.sprint ? 1.35 : h.stance === 2 ? 0.6 : 1);
    // 身体跟着瞄准方向（枪战类：平移时不转身）
    h.yaw = fp ? c.yaw : angStep(h.yaw, c.yaw, 16 * dt);

    this.computeAim();
    // 开火只在按住时；打空自动换弹，也可以手动换。刀在手时左键是挥刀
    h.fireCd -= dt;
    const press = inp.take('fire');
    const firing = inp.held.fire && !h.blade;
    const wantReload = inp.take('reload');
    if (!h.blade) {
      if (h.reloadT > 0) { h.reloadT -= dt; if (h.reloadT <= 0) h.mag = h.magMax; }
      else if ((wantReload && h.mag < h.magMax) || h.mag <= 0) this.startReload();
    }
    h.aim = damp(h.aim, !h.blade && (firing || h.ads || h.fireCd > -0.6) ? 1 : 0, 16, dt);
    if (firing && !h.sprint && h.fireCd <= 0 && h.reloadT <= 0 && h.mag > 0) this.heroShoot();
    this.updateMelee(dt, press);
    if (inp.take('nade')) this.throwNade();
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
  // ---------- 拔刀近战 ----------
  toggleBlade() {
    const h = this.hero;
    if (h.atk || h.mg || this.cannon.manned) return;
    h.blade = !h.blade; h.charge = -1; h.block = false; h.queued = false;
    if (!h.blade) { this.audio.play('reload', 0.4); return; }
    if (h.stance) h.stance = 0;     // 拔刀就站起来
    h.reloadT = 0;
    this.audio.play('unsheathe');
    if (!this.flags.bladeVoice) { this.flags.bladeVoice = 1; this.audio.voice('liangjian', 0.9); this.ui.stamp('亮剑！', 0.8); }
    if (!this.flags.bladeTip) {
      this.flags.bladeTip = 1;
      this.ui.toast(this.app.isTouch() ? '拔刀了：点“挥刀”连砍，按住蓄力重砍（能破防）；按住“格挡”挡刀，刀砍到的一瞬间按下＝弹开。再点“收刀”换回枪'
        : '拔刀了：左键连砍，按住左键蓄力重砍（能破防）；右键格挡，刀砍到的一瞬间按下＝弹开。Q 收刀换回枪', 6);
    }
  }
  setStance(s) {
    const h = this.hero;
    if (s === h.stance || h.mg || this.cannon.manned) return;
    if (s === 2 && !h.onGround) return;
    if (s && h.blade) { h.blade = false; h.atk = null; h.charge = -1; h.block = false; }   // 蹲下、趴下就收刀
    if (s === 2 || h.stance === 2) this.audio.play('thud', 0.25);
    h.stance = s;
  }
  // 左键：轻砍，挥刀途中再按接下一刀（三刀一套）；按住超过 HEAVY_HOLD 秒松手（或蓄满）是重砍
  updateMelee(dt, press) {
    const h = this.hero, inp = this.input;
    h.comboT = Math.max(0, h.comboT - dt);
    if (!h.blade || h.bladeK < 0.85) { h.atk = null; h.charge = -1; return; }
    const a = h.atk;
    if (a) {
      a.t += dt;
      if (!a.hitDone && a.t >= a.hitAt) { a.hitDone = true; this.meleeStrike(a); }
      if (press && a.kind === 'light' && a.t > a.hitAt * 0.6) h.queued = true;
      if (a.t >= a.dur) { h.atk = null; h.comboT = 0.45; if (h.queued) { h.queued = false; this.startSwing('light'); } }
      return;
    }
    if (h.block || h.stagger > 0) { h.charge = -1; return; }
    if (press) h.charge = 0;
    if (h.charge < 0) return;
    if (inp.held.fire) { h.charge += dt; if (h.charge >= HEAVY_AUTO) { h.charge = -1; this.startSwing('heavy'); } }
    else { const heavy = h.charge >= HEAVY_HOLD; h.charge = -1; this.startSwing(heavy ? 'heavy' : 'light'); }
  }
  startSwing(kind) {
    const h = this.hero, s = SWING[kind];
    h.combo = kind === 'light' && h.comboT > 0 ? (h.combo + 1) % 3 : 0;
    h.atk = { kind, t: 0, dur: s.dur, hitAt: s.hitAt, hitDone: false, lunge: s.lunge, dir: kind === 'heavy' ? 0 : [1, -1, 0][h.combo] };
    this.audio.play('swing', kind === 'heavy' ? 1 : 0.7);
  }
  // 出刀那一下：身前扇面里最近的几个敌人（隔着墙砍不到）
  meleeStrike(a) {
    const h = this.hero, s = SWING[a.kind], heavy = a.kind === 'heavy';
    const fx = fwdX(h.yaw), fz = fwdZ(h.yaw), cosA = Math.cos(s.cone);
    const hits = [];
    for (const e of this.enemies) {
      if (!e.alive || Math.abs(e.y - h.y) > 1.6) continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d > s.reach + e.r || (d > 0.9 && (dx * fx + dz * fz) / d < cosA)) continue;   // 贴身的不管朝向都砍得到
      if (losBlocked(this.world, h.x, h.z, e.x, e.z, 1.2, h.y + 1.2, e.y + 1.2)) continue;
      hits.push([d, e]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    let landed = false;
    for (const [, e] of hits.slice(0, s.max)) {
      if (this.enemyGuard(e, heavy)) { landed = true; continue; }
      landed = true;
      const was = e.alive;
      this.hurtUnit(e, e.type === 'boss' ? s.boss : s.dmg, fx, fz, 'blade');
      if (was && !e.alive) this.stats.cuts++;
      if (heavy && e.alive && e.type !== 'boss' && e.type !== 'mg') { e.stagT = 0.8; e.x += fx * 0.7; e.z += fz * 0.7; resolveCircle(this.world, e, e.r, e.y); }
      this.fx.sparks(e.x, e.y + 1.2, e.z, heavy ? 12 : 7, 0xffffff);
    }
    if (landed) this.audio.play('slash', heavy ? 1 : 0.8);
  }
  foeAhead(r) {
    const h = this.hero, fx = fwdX(h.yaw), fz = fwdZ(h.yaw);
    for (const e of this.enemies) {
      if (!e.alive || Math.abs(e.y - h.y) > 1.6) continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d < r + e.r && dx * fx + dz * fz > 0.3 * d) return true;
    }
    return false;
  }
  // 拿刀的敌人（军官、Boss）正对着主角、手上没在出刀时会格开轻砍；重砍破防
  enemyGuard(e, heavy) {
    const h = this.hero;
    let p = 0;
    if (e.type === 'officer') p = e.slash < 0 && !(e.stagT > 0) ? 0.35 : 0;
    else if (e.type === 'boss') p = this.bossGuards(e) ? 0.7 : 0;
    if (!p || Math.abs(angDiff(e.yaw, yawTo(h.x - e.x, h.z - e.z))) > 1.1) return false;
    const mx = (e.x + h.x) / 2, mz = (e.z + h.z) / 2, gy = this.groundY(mx, mz);
    if (heavy) {
      this.fx.sparks(mx, gy + 1.4, mz, 14, 0xffe9a8); this.audio.play('clang', 0.8);
      if (e.type === 'boss') { e.state = 'stun'; e.stT = Math.max(e.stT || 0, 1.0); } else e.stagT = 1.0;
      if (!this.flags.breakTip) { this.flags.breakTip = 1; this.ui.stamp('破防！', 0.9); }
      return false;
    }
    if (rand() > p) return false;
    this.fx.sparks(mx, gy + 1.4, mz, 8, 0xffe9a8); this.audio.play('clang', 0.6);
    h.stagger = Math.max(h.stagger, 0.22);
    if (e.type === 'officer') e.stT = Math.min(e.stT, 0.2);   // 格开就马上反砍
    if (!this.flags.guardTip) { this.flags.guardTip = 1; this.ui.toast(this.app.isTouch() ? '被格开了：按住挥刀键蓄力重砍能破防' : '被格开了：按住左键蓄力重砍能破防', 3); }
    return true;
  }
  bossGuards(e) { return e.guard !== undefined ? e.guard : e.state === 'walk' || e.state === 'cover'; }
  // 敌人的刀砍到主角：刀在手、正对着、按着格挡就挡住（不掉血，被震退）；刚按下格挡的一瞬间挡住＝弹开（拼刀），对方硬直
  bladeDefend(u, kind) {
    const h = this.hero;
    if (!h.alive || !h.block) return null;
    if (Math.abs(angDiff(h.yaw, yawTo(u.x - h.x, u.z - h.z))) > 1.3) return null;   // 侧后方挡不住
    const mx = (u.x + h.x) / 2, mz = (u.z + h.z) / 2, gy = this.groundY(mx, mz), boss = u.type === 'boss';
    if (h.blockT < PARRY_WIN) {
      h.inv = Math.max(h.inv, 0.35); this.stats.parry++;
      this.fx.sparks(mx, gy + 1.4, mz, boss ? 26 : 14, 0xffffff); this.fx.ring(mx, gy + 0.1, mz, boss ? 5 : 3, 0.4, 0xffffff, 1);
      this.audio.play('clang');
      if (boss) {
        u.state = 'stun'; u.stT = kind === 'dash' ? 2.8 : 1.6; u.combo = 0;
        this.hurtUnit(u, kind === 'dash' ? 7 : 3, 0, 0, 'blade');
        this.stats.clash++; this.addScore(400); this.fx.clearWarnings();
        this.ui.stamp('狭路相逢勇者胜！', 1.5);
      } else { u.stagT = 1.4; u.slash = -1; this.addScore(120); this.ui.stamp('弹开！', 0.7); }
      return 'parry';
    }
    const kb = kind === 'dash' ? 1.8 : 0.6, l = Math.hypot(h.x - u.x, h.z - u.z) || 1;
    h.x += ((h.x - u.x) / l) * kb; h.z += ((h.z - u.z) / l) * kb; resolveCircle(this.world, h, h.r, h.y, true);
    h.stagger = Math.max(h.stagger, kind === 'dash' ? 0.45 : 0.2);
    this.fx.sparks(mx, gy + 1.4, mz, 8, 0xffe9a8); this.audio.play('clang', 0.55);
    this.stats.blocks++;
    return 'block';
  }
  // 姿势相关：主角身高（子弹判定）、胸口高度（敌人瞄哪儿、看不看得见）
  heroTop() { const h = this.hero; return lerp(lerp(STANCE_TOP[0], STANCE_TOP[1], h.crouchK), STANCE_TOP[2], h.proneK); }
  aimY(t) {
    if (t !== this.hero) return (t.y || 0) + (t === this.cannon ? 0.9 : 1.1);
    const h = this.hero; return h.y + lerp(lerp(1.1, 0.75, h.crouchK), 0.3, h.proneK);
  }

  // ---------- 阵地机枪：打掉机枪手后可以接管，枪身跟着准星转 ----------
  initGuns() {
    for (const m of this.mgs) this.scene.remove(m.model.root);
    this.mgs = this.mgSpots().map(([id, n, face = 1]) => {
      const model = buildMG();
      const gy = this.groundY(n.x, n.z);
      model.root.position.set(n.x, gy + 1.47, n.z + 1.2 * face); model.root.rotation.set(0, face > 0 ? Math.PI : 0, 0);   // 架在正面沙袋上，枪口朝外
      this.scene.add(model.root);
      return { id, x: n.x, z: n.z + 0.15 * face, gy, model, ammo: MG_BELT, cd: 0, reload: 0, face, gx: n.x, gz: n.z + 0.3 * face, vacT: 0, claim: null, ally: null, burst: 0 };
    });
  }
  gunNear() {
    const h = this.hero;
    if (this.elev(h) > 0.5) return null;
    for (const m of this.mgs) {
      if (dist2(h.x, h.z, m.x, m.z) > 2.3 * 2.3) continue;
      if (m.ally || this.enemies.some((e) => e.alive && e.type === 'mg' && e.nest === m.id)) continue;   // 机枪手（或操枪的战友）还在
      return m;
    }
    return null;
  }
  // ---------- 机枪有人开：鬼子补位、战友操枪 ----------
  // 鬼子的机枪手死了约 3 秒，15 米内的鬼子步兵会过去接着打；我方阵地和打下来的阵地，空着约 3 秒、
  // 团长不在跟前时近处的战友会去操枪，团长走到跟前（3 米内）就把枪让出来——团长只能用没人的机枪
  updateGuns(dt) {
    const h = this.hero;
    for (const m of this.mgs) {
      if (m.claim && (!m.claim.alive || m.claim.manGun !== m)) m.claim = null;
      if (m.ally && (!m.ally.alive || m.ally.down > 0 || m.ally.gun !== m)) { if (m.ally.gun === m) m.ally.gun = null; m.ally = null; }
      if (h.mg === m) { m.vacT = 0; continue; }
      if (m.ally) {
        // 团长来了就让，团长走远（追着阶段往前）了也撤下来跟上
        const dh = dist(h.x, h.z, m.x, m.z);
        if ((dh < 3 && h.alive) || dh > 60) {
          const a = m.ally; a.gun = null; m.ally = null; m.vacT = 0;
          if (dh < 3 && !this.flags.gunGive) { this.flags.gunGive = 1; this.ui.toast('战友把机枪让给你了', 2); }
        }
        continue;
      }
      if (this.enemies.some((e) => e.alive && e.type === 'mg' && e.nest === m.id)) { m.vacT = 0; continue; }
      m.vacT += dt;
      if (m.vacT < MAN_DELAY || m.claim || this.cut > 0 || this.flags.won) continue;
      // 鬼子补位（只补鬼子那一侧的阵地）
      if (m.face > 0) {
        let best = null, bd = MAN_RANGE;
        for (const e of this.enemies) {
          if (!e.alive || !e.active || e.downed || e.manGun || (e.type !== 'rifle' && e.type !== 'elite') || Math.abs(e.y - m.gy) > 1.5) continue;
          const d = dist(e.x, e.z, m.gx, m.gz);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) { best.manGun = m; m.claim = best; continue; }
      }
      // 战友操枪：附近没有鬼子、团长不在跟前
      if (!this.allyGuns() || dist(h.x, h.z, m.x, m.z) < 10) continue;
      if (this.enemies.some((e) => e.alive && !e.downed && dist(e.x, e.z, m.x, m.z) < 8)) continue;
      let best = null, bd = ALLY_GUN_RANGE;
      for (const a of this.allies) {
        if (!a.alive || a.down > 0 || a.gun || a.name || a.hold || Math.abs(a.y - m.gy) > 1.5) continue;
        const d = dist(a.x, a.z, m.x, m.z);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) { best.gun = m; m.ally = best; m.vacT = 0; }
    }
  }
  // 鬼子走到机枪后面：变成机枪手
  takeGun(u, m) {
    u.type = 'mg'; u.def = DEF.mg; u.nest = m.id; u.hold = true; u.manGun = null; m.claim = null;
    u.x = m.gx; u.z = m.gz; u.state = 'idle'; u.stT = 0.8; u.yaw = m.face > 0 ? Math.PI : 0;
    this.stats.crews++;
    if (!this.flags.manTip) { this.flags.manTip = 1; this.ui.toast('鬼子又补上了一个机枪手：机枪空着的时候赶紧抢过来', 3); }
  }
  // 战友操机枪：转枪口打最近的鬼子，打几发歇一会儿
  allyShootMG(u, dt) {
    const m = u.gun;
    if (dist(u.x, u.z, m.x, m.z) > 0.5) return false;   // 还没走到
    u.x = m.x; u.z = m.z; still(u, dt);
    u.think -= dt;
    if (u.think <= 0 || (u.target && !u.target.alive)) {
      u.think = 0.5;
      let best = null, bd = 48;
      for (const e of this.enemies) {
        if (!e.alive || !e.active || e.downed || e.noAlly) continue;
        const d = dist(m.x, m.z, e.x, e.z);
        if (d < bd && !losBlocked(this.world, m.x, m.z, e.x, e.z, 1.2, m.gy + 1.4, e.y + 1.1)) { bd = d; best = e; }
      }
      u.target = best;
    }
    const t = u.target;
    if (t) {
      const want = yawTo(t.x - m.x, t.z - m.z);
      u.yaw = angStep(u.yaw, want, 3 * dt);
      u.aim = damp(u.aim, 1, 10, dt);
      m.cd -= dt;
      if (m.cd <= 0 && Math.abs(angDiff(u.yaw, want)) < 0.12) {
        if (m.burst <= 0) m.burst = 8;
        m.burst--; m.cd = m.burst > 0 ? 0.1 : rand(1.4, 2.4);
        const fx = fwdX(u.yaw), fz = fwdZ(u.yaw), d = dist(m.x, m.z, t.x, t.z), sp = 0.045;
        const b = this.fireBullet(0, m.x + fx * 1.9, m.gy + 1.25, m.z + fz * 1.9, t.x + rand(-sp, sp) * d, t.y + 1.0 + rand(-sp, sp) * d * 0.4, t.z + rand(-sp, sp) * d, 1, 70, null);
        b.fromAlly = 1;
        this.sfxAt('mg', m.x, m.z, 0.6);
      }
    } else u.aim = damp(u.aim, 0, 8, dt);
    m.model.root.position.set(m.x + fwdX(u.yaw) * 0.8, m.gy + 1.05, m.z + fwdZ(u.yaw) * 0.8);
    m.model.root.rotation.set(0, u.yaw, 0);
    return true;
  }

  // ---------- 碉堡 / 机枪堡里的机枪手 ----------
  // 射击孔里露出机枪手的头；子弹钻进射击孔就打得到他。打死一个约 3 秒后换下一个上来，人打光了这个碉堡就哑了（碉堡本身还在）
  initBunkerCrews() {
    for (const b of this.world.bunkers || []) {
      const s = this.bunkerSlit(b);
      if (!s) continue;
      b.crewSlit = s; b.crew = this.bunkerCrewSize(b); b.manned = true; b.gunnerHp = 3; b.manT = 0;
      if (!b.crewModel) {
        const m = buildSoldier('mg');
        m.root.position.set(s.x, s.y - 1.62, s.z - 0.12); m.root.rotation.y = s.yaw === undefined ? Math.PI : s.yaw;
        poseSoldier(m, { walk: 0, moving: 0, aim: 1, pitch: 0, carry: 'side', slash: -1 });
        m.root.visible = false; this.scene.add(m.root); b.crewModel = m;
      }
    }
  }
  updateCrews(dt) {
    for (const b of this.world.bunkers || []) {
      if (!b.crewSlit) continue;
      if (b.alive && !b.manned && b.crew > 0 && this.cut <= 0) { b.manT -= dt; if (b.manT <= 0) { b.manned = true; b.crew--; b.gunnerHp = 3; } }
      b.crewModel.root.visible = b.alive && b.manned && this.mode === 'play';
      if (b.crewModel.root.visible) setSoldierMat(b.crewModel, b.hitFlash > 0 ? MAT.flash : MAT.vc);
      b.hitFlash = Math.max(0, (b.hitFlash || 0) - dt);
    }
  }
  // 子弹（我方的）钻进有人的射击孔：打中里面的机枪手
  crewHit(b, x, y, z) {
    for (const k of this.world.bunkers || []) {
      const s = k.crewSlit;
      if (!s || !k.alive || !k.manned) continue;
      if (Math.abs(x - s.x) > s.w / 2 || Math.abs(y - s.y) > s.h / 2 + 0.08 || Math.abs(z - s.z) > 0.5) continue;
      k.gunnerHp -= b.dmg; k.hitFlash = 0.1;
      this.fx.blood(s.x, s.y, s.z);
      if (b.hero) { this.hitT = 0.12; this.hitKind = 1; }
      if (k.gunnerHp <= 0) {
        k.manned = false; k.manT = MAN_DELAY; this.stats.kills++; this.addScore(150); this.sfxAt('kill', s.x, s.z, 0.6);
        if (!this.flags.slitTip) { this.flags.slitTip = 1; this.ui.toast(k.crew > 0 ? '射击孔里的机枪手倒了：里面还有人，几秒后就换上来' : '射击孔里的机枪手倒了', 3); }
        else if (k.crew <= 0) this.ui.toast('这个碉堡的机枪手打光了，哑了', 2.2);
      }
      return true;
    }
    return false;
  }

  // ---------- 战友阵亡与增援 ----------
  // 没名字的战友阵亡就是阵亡了（张大彪、和尚这些还是倒地后被救起）；约 8 秒后从后面补上来一个，每个阶段最多补 reinforceReserve() 个
  updateReinforce(dt) {
    if (this.phase !== this._resPhase) { this._resPhase = this.phase; this.reserve = this.reinforceReserve(); }
    for (let i = this.reinf.length - 1; i >= 0; i--) {
      const r = this.reinf[i];
      if (this.cut > 0) continue;
      r.t -= dt;
      if (r.t > 0) continue;
      this.reinf.splice(i, 1);
      if (this.reserve <= 0 || this.flags.won || this.over) continue;
      this.reserve--;
      this.spawnReinforcement(r.slot);
    }
  }
  spawnReinforcement(slot) {
    const h = this.hero, rp = this.respawnPoint();
    const post = this.allyPost({ slot, x: h.x, z: h.z, kind: 'ally' });
    const sx = post ? post[0] : h.x, sz = post ? post[1] : h.z;
    let x = rp[0] + rand(-2, 2), z = rp[1] + rand(-1, 2);
    const d = dist(x, z, sx, sz);
    if (d > 40) { x = sx + ((x - sx) / d) * 30; z = sz + ((z - sz) / d) * 30; }
    const u = this.addUnit('ally', 'ally', x, z, { slot });
    resolveCircle(this.world, u, u.r, u.y);
    this.stats.reinf++;
    if (!this.flags.reinfTip) { this.flags.reinfTip = 1; this.ui.say(this.info().aide, '后面的弟兄补上来了！'); }
    return u;
  }

  manMG(m) {
    const h = this.hero;
    h.mg = m; h.x = m.x; h.z = m.z; h.y = m.gy || 0; h.vy = 0; h.onGround = true; h.moving = 0; h.ads = false;
    h.blade = false; h.atk = null; h.block = false; h.stance = 0;
    this.ui.setPrompt(null);
    this.audio.play('uiok');
    if (!this.flags.mgTip) { this.flags.mgTip = 1; this.ui.toast(this.app.isTouch() ? '滑屏瞄准，按住开火键扫射；点“离开机枪”下来' : '转动准星瞄准，按住左键扫射；再按 F 下来', 5); }
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
    for (const e of ['jump', 'nade', 'blade', 'crouch', 'prone', 'stance']) inp.take(e);
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
    h.blade = false; h.atk = null; h.block = false; h.stance = 0;
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
    for (const e of ['jump', 'reload', 'nade', 'blade', 'crouch', 'prone', 'stance']) inp.take(e);
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
            if (this.heroHitXZ(b.x, b.z, nx, nz, rr) && my < h.y + this.heroTop() && my > h.y - 0.1) { if (this.heroCover(b)) fx.sparks(nx - b.dx * 0.6, ny, nz - b.dz * 0.6, 3, 0xffe2a0); else this.hurtHero(b.dmg, b.x - b.dx, b.z - b.dz); dead = true; }
          }
          if (!dead) for (const a of this.allies) {
            if (!a.alive || a.down > 0) continue;
            if (segPointD2(b.x, b.z, nx, nz, a.x, a.z) < 0.3 && my < a.y + 2 && my > a.y - 0.1) { if (!this.allyCover(a, b)) this.hurtUnit(a, b.dmg, b.dx, b.dz, 'bullet'); dead = true; break; }
          }
          if (!dead && c.visible && c.alive && this.gunExposed() && segPointD2(b.x, b.z, nx, nz, c.x, c.z + 0.8) < 2.2 && my < 1.9) { this.hurtCannon(b.dmg * 0.5); fx.sparks(nx, ny, nz, 4); dead = true; }
        }
        if (!dead && b.team === 0 && this.crewHit(b, nx, ny, nz)) dead = true;
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

  // 子弹横向是否碰到主角：趴着时身体沿朝向摊开（头前脚后），按三段判定
  heroHitXZ(x0, z0, x1, z1, rr) {
    const h = this.hero;
    if (h.proneK < 0.5) return segPointD2(x0, z0, x1, z1, h.x, h.z) < rr * rr;
    const fx = fwdX(h.yaw), fz = fwdZ(h.yaw), r2 = 0.38 * 0.38;
    for (const k of [-0.75, 0, 0.75]) if (segPointD2(x0, z0, x1, z1, h.x + fx * k, h.z + fz * k) < r2) return true;
    return false;
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
      if (h.alive && dist(h.x, h.z, x, z) < r * (h.proneK > 0.5 ? 0.55 : 1) && h.y - gy < 2.6 && !(this.cannon.manned)) this.hurtHero(2, x, z);   // 趴下躲破片：只有很近才伤到
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
    if (u.kind === 'ally') {
      if (u.name || !this.reinforceReserve()) { u.down = 8; u.hp = 0; u.moving = 0; return; }   // 有名有姓的倒地后被卫生员救起
      // 普通战士阵亡：倒下，约 8 秒后从后面补一个
      u.alive = false; u.deadT = 0; u.fallYaw = Math.atan2(dx, dz); if (u.gun) { u.gun.ally = null; u.gun = null; }
      this.stats.fallen++; this.reinf.push({ t: REINF_DELAY, slot: u.slot });
      return;
    }
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
    h.alive = true; h.hp = h.maxHp; h.inv = 2.6; h.deadT = 0; h.nades = h.nadeMax; h.mag = h.magMax; h.reloadT = 0; h.mg = null;
    h.blade = false; h.bladeK = 0; h.atk = null; h.charge = -1; h.block = false; h.stagger = 0; h.stance = 0; h.crouchK = 0; h.proneK = 0;
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
        const fa = a.hold || a.type === 'mg' || (a === this.hero && (this.cannon.manned || a.mg || b.kind === 'ally')), fb = b.hold || b.type === 'mg' || (b === this.hero && a.kind === 'ally');
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
    const blade = h.bladeK > 0.05;
    this.sword.visible = blade;
    if (m.back) m.back.visible = !blade;   // 刀拔出来了，背上就空了
    const pitch = h.aim > 0.3 && !this.cannon.manned ? this.cam.pitch : 0;
    const a = h.atk;
    poseSoldier(m, { walk: h.walk, moving: h.moving, aim: blade ? 0 : h.aim, pitch, carry: blade ? 'blade' : 'side', slash: !blade && h.slash >= 0 ? h.slash : -1, cheer: this.flags.won ? this.t : 0,
      crouch: h.crouchK * (1 - h.proneK), prone: h.proneK });
    if (m.armGeo) m.armR.geometry = blade ? m.armGeo.bare : m.armGeo.gun;
    if (blade) this.poseBlade(m, h, a);
    // 趴下：整个人向前放倒，身体中段落在主角位置上
    const pk = h.proneK, fx = fwdX(h.yaw), fz = fwdZ(h.yaw);
    m.root.rotation.x = -Math.PI / 2 * pk;
    m.root.position.set(h.x - fx * 1.0 * pk, h.y + 0.17 * pk, h.z - fz * 1.0 * pk);
    m.root.rotation.y = h.yaw;
    m.root.updateMatrixWorld(true);
  }
  poseAll(dt) {
    const h = this.hero, fp = this.cam.view === 1;
    // 主角
    if (h.alive) this.poseHero(dt);
    else { const k = Math.min(1, h.deadT / 0.45); h.model.root.rotation.x = k * 1.45; h.model.root.position.set(h.x, h.y + 0.05, h.z); }
    const blink = h.inv > 0 && h.alive && Math.floor(this.t * 14) % 2 === 0 && h.hurtT <= 0;
    const tooClose = !fp && this.cam.camDist < 1.15 && this.cut <= 0 && !this.cannon.manned;   // 镜头被墙顶到贴脸时先不画主角
    h.model.root.visible = !(fp && this.cut <= 0 && h.alive) && !blink && !tooClose;
    setSoldierMat(h.model, h.flashT > 0 ? (h.hurtT > 0 ? MAT.hurt : MAT.flash) : MAT.vc);
    h.model.flash.visible = h.alive && h.fireCd > (h.weapon === 'lmg' ? 0.06 : 0.13);
    const fpOn = fp && this.cut <= 0 && h.alive && !this.cannon.manned && this.mode === 'play';
    this.viewGun.group.visible = fpOn && h.bladeK < 0.5;
    this.viewSword.visible = fpOn && h.bladeK >= 0.5;
    if (this.viewSword.visible) this.poseViewSword();
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

  // 第三人称拿刀：架刀时右手在身前、刀尖斜朝前上；格挡把刀竖在身前；出刀先举后劈（三刀一套：右上斜劈、左上斜劈、正劈）；蓄力把刀举到脑后
  poseBlade(m, h, a) {
    let rx = 0.8, rz = -0.15, wx = 1.55, tw = 0;
    if (h.block) { rx = 1.2; rz = 0.6; wx = 1.45; }
    else if (a) {
      const k = a.t / a.dur, d = a.dir, s = k < 0.3 ? 0 : Math.min(1, (k - 0.3) / 0.25);
      rx = k < 0.3 ? 2.3 + (k / 0.3) * 0.8 : 3.1 - s * 2.4;
      rz = d ? -0.9 * d + 1.6 * d * s : -0.12;
      wx = a.kind === 'heavy' ? 0.15 : 0.35;
      tw = d ? 0.35 * d * (1 - 2 * s) : 0;
    } else if (h.charge >= 0) { const c = Math.min(1, h.charge / HEAVY_AUTO); rx = 0.8 + c * 2.35; wx = 1.55 - c * 1.35; rz = -0.15 - c * 0.15; }
    m.armR.rotation.set(rx, 0, rz);
    this.swordPivot.rotation.set(wx, 0, 0);
    m.body.rotation.y = tw;
    if (h.block) m.armL.rotation.set(1.15, 0, 0.35);
  }
  // 第一人称的大刀：按“手的位置 + 刀身朝向”摆。架刀时刀尖斜指左前上方；格挡把刀横在胸前；
  // 出刀先抬到起手位，再划到对角下方（三刀一套：右上→左下、左上→右下、头顶→正下），然后收回；蓄力时举过头
  poseViewSword() {
    const h = this.hero, g = this.viewSword, a = h.atk;
    const bob = Math.sin(h.walk) * 0.012 * h.moving;
    const IDLE = [0.3, -0.34 + bob, -0.5, -0.25, 0.75, -0.6];
    const mix = (A, B, k) => A.map((v, i) => v + (B[i] - v) * k), ease = (k) => k * k * (3 - 2 * k);
    let P = IDLE;
    if (h.block) P = [0.2, -0.16, -0.45, -1, 0.12, -0.18];
    else if (a) {
      const [S, E] = a.dir === 0 ? [[0.12, 0.16, -0.38, -0.1, 0.9, 0.35], [0.02, -0.42, -0.55, 0, -0.55, -0.85]]
        : a.dir > 0 ? [[0.36, 0.14, -0.42, 0.5, 0.8, -0.3], [-0.22, -0.38, -0.5, -0.6, -0.6, -0.5]]
          : [[-0.3, 0.14, -0.42, -0.5, 0.8, -0.3], [0.3, -0.38, -0.5, 0.6, -0.6, -0.5]];
      const k = a.t / a.dur;
      P = k < 0.3 ? mix(IDLE, S, ease(k / 0.3)) : k < 0.55 ? mix(S, E, ease((k - 0.3) / 0.25)) : mix(E, IDLE, ease((k - 0.55) / 0.45));
    } else if (h.charge >= 0) P = mix(IDLE, [0.18, 0.12, -0.36, -0.15, 0.85, 0.5], Math.min(1, h.charge / HEAVY_AUTO));
    g.position.set(P[0], P[1], P[2]);
    g.blade.quaternion.setFromUnitVectors(DOWN, _v.set(P[3], P[4], P[5]).normalize());
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
        const drop = CROUCH_DROP * h.crouchK * (1 - h.proneK) + PRONE_DROP * h.proneK, fwd = 0.14 + 0.75 * h.proneK;
        cam.position.set(h.x + fwdX(c.yaw) * fwd, h.y + 1.62 * h.model.scale - drop, h.z + fwdZ(c.yaw) * fwd);
        c.camDist = 9; c.clip = 1;
      } else {
        // 越肩第三人称：以右肩为轴，准星在画面正中；右肩贴墙时把轴收回身体
        const rx = rightX(c.yaw), rz = rightZ(c.yaw);
        const want = pointBlocked(this.world, h.x + rx * 0.8, c.gy + 1.5, h.z + rz * 0.8) ? 0.12 : lerp(0.7, 0.95, adsK);
        c.shoulder = damp(c.shoulder === undefined ? 0.7 : c.shoulder, want, 12, dt);
        // 接管机枪时人在沙袋围子里：镜头抬高、贴近，从沙袋上方看出去，免得被正面沙袋挡住
        const onGun = !!h.mg;
        const drop = onGun ? 0 : CROUCH_DROP * h.crouchK * (1 - h.proneK) + PRONE_DROP * h.proneK;
        const px = h.x + rx * c.shoulder, py = c.gy + (onGun ? 2.35 : 1.95) - drop + (h.y - c.gy) * 0.4, pz = h.z + rz * c.shoulder;
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
    if (c.manned) ui.setAction('fire', this.gunCfg.fireLabel, c.shells > 0 ? (c.reload > 0 ? '装填' : '×' + c.shells) : '等炮弹', c.reload > 0 || c.shells <= 0, '左键');
    else if (h.mg) ui.setAction('fire', touch ? '开火' : '重机枪', h.mg.reload > 0 ? '换弹' : h.mg.ammo + '/' + MG_BELT, h.mg.reload > 0, '左键');
    else if (h.blade) ui.setAction('fire', touch ? '挥刀' : '大刀', h.atk ? (h.atk.kind === 'heavy' ? '重砍' : '连砍') : h.charge >= HEAVY_HOLD ? '蓄力' : h.block ? '格挡' : '按住重砍', false, '左键');
    else ui.setAction('fire', touch ? '开火' : h.weapon === 'lmg' ? '歪把子' : '驳壳枪', h.reloadT > 0 ? '换弹' : h.mag + '/' + h.magMax, h.reloadT > 0, '左键');
    ui.setAction('nade', '手榴弹', '×' + h.nades, h.nades <= 0 || c.manned || !!h.mg, 'G');
    ui.setAction('blade', h.blade ? '收刀' : '拔刀', c.manned ? '操炮中' : h.mg ? '机枪上' : '', c.manned || !!h.mg, 'Q');
    ui.setAction('stance', ['站着', '蹲着', '趴着'][h.stance], touch ? '换姿势' : '', c.manned || !!h.mg, 'C');
    ui.setAction('ads', h.blade ? '格挡' : '开镜', '', false, '右键');
    ui.setKeyHint(c.manned
      ? this.gunCfg.keyHint
      : h.mg ? '鼠标 瞄准　左键 扫射　<kbd>R</kbd> 换弹链　<kbd>F</kbd> 离开机枪　<kbd>V</kbd> 切换人称'
      : h.blade ? '左键 挥刀（按住蓄力重砍）　右键 格挡（刀到时按＝弹开）　<kbd>Q</kbd> 收刀　<kbd>Shift</kbd> 跑　<kbd>空格</kbd> 跳　<kbd>V</kbd> 切换人称　<kbd>Esc</kbd> 暂停'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　<kbd>Shift</kbd> 跑　<kbd>C</kbd> 蹲　<kbd>Z</kbd> 趴　<kbd>空格</kbd> 跳　左键 开火　右键 开镜　<kbd>Q</kbd> 拔刀　<kbd>R</kbd> 换弹　<kbd>F</kbd> 互动　<kbd>V</kbd> 切换人称　<kbd>Esc</kbd> 暂停');
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
      tip: 'A/D 或鼠标左右转炮口，W/S 或鼠标上下调仰角，落点对准目标后按左键开炮；F 离开炮位',
      tipTouch: '摇杆或滑屏转炮口、调仰角，落点对准目标后点开火键开炮',
      keyHint: '<kbd>A</kbd><kbd>D</kbd> 转炮口　<kbd>W</kbd><kbd>S</kbd> 调仰角　左键 开炮　<kbd>F</kbd> 离开炮位　<kbd>V</kbd> 切换人称',
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
  mgSpots() { return []; }
  bunkerSlit() { return null; }          // 碉堡射击孔：{ x, y, z（孔外侧）, w, h, yaw（机枪手朝向）}；返回 null 表示这个碉堡不按人算
  bunkerCrewSize() { return 2; }         // 机枪手之外，碉堡里还能补上来几个人
  reinforceReserve() { return 4; }       // 每个阶段战友最多补几个（0 = 战友只倒地不阵亡）
  allyGuns() { return true; }            // 战友会不会去操空着的机枪
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
