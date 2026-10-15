// 第一章「苍云岭 · 突围」：坚守山头掩护转移、抓舌头、把迫击炮送到五百米外、两发炮弹打坂田的指挥部、从正面突围
import * as THREE from '../../vendor/three.module.js';
import { DEG, clamp, damp, fwdX, fwdZ, rightX, rightZ, yawTo, dist, dist2, rand, fmtTime } from '../util.js';
import { pointBlocked } from '../world-kit.js';
import { buildWorld, L, hgt } from './cangyunling-world.js';
import { buildSoldier, poseSoldier, buildMortar, buildStretcher } from '../models.js';
import { Game } from '../game.js';
import { spawnPhase, updateBoss } from './cangyunling-ai.js';

export const INFO = {
  id: 'cangyunling', num: 1, name: '苍云岭', title: '苍云岭突围',
  blurb: '你是李云龙：新一团在苍云岭掩护师部转移，被坂田联队围在山头。顶住进攻、抓个舌头，再把迫击炮送到五百米外——只有两发炮弹，打掉坂田的指挥部，从正面突出去。',
  seal: '新一团<br>重做版', loading: '亮剑 · 苍云岭突围', bossName: '坂田信哲', aide: '虎子', winTitle: '苍云岭，突出去了！', loseTitle: '突围受挫',
  phases: ['', '坚守山头', '抓舌头', '送炮前出', '两发炮弹', '突围'],
};
const MV = 36, MG = 14;                  // 迫击炮初速与重力：高射角下最远约 92 米
const POSTS1 = [[-24, 63.4], [-5, 63.4], [5, 63.4], [24, 63.4], [-30, 63.4], [30, 63.4]];
const POSTS4 = [[-13, -50], [1, -50], [-15, -56.6], [3, -56.6], [-10, -46], [-2, -46]];
const TONGUE = [[8, 26], [-14, 18], [18, 14], [-4, 10]];
const CN = '零一二三四五六七八九';
const cn = (n) => { n = Math.round(n); if (n < 10) return CN[n]; if (n < 20) return '十' + (n % 10 ? CN[n % 10] : ''); if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : ''); return String(n); };
const _v = new THREE.Vector3();

export class CangyunlingGame extends Game {
  info() { return INFO; }
  env() { return { fog: 0xc6cbcf, fogNear: 60, fogFar: 250, sky: 0xe2e6ea, ground: 0x8e8676, hemi: 1.0, sun: 0xe8ecf0, sunI: 0.72 }; }
  buildWorld(scene) { return buildWorld(scene); }
  gunConfig() {
    return {
      build: buildMortar, name: '迫击炮', use: '操炮', fireLabel: '放炮', crew: ['zhuzi', 'ally', 'ally'], crewName: '柱子', sound: 'mortar',
      speed: MV, grav: MG, barrel: 1.1, pivotY: 0.25, reload: 3.0, shells: 2, elev0: 60 * DEG, elevMin: 45 * DEG, elevMax: 84 * DEG, yawMin: -0.7, yawMax: 0.9, yaw0: 0,
      preview: false, cross: true, turnRate: 0.3, elevRate: 0.5, simSteps: 900,
      brokenLine: '团长，炮组让鬼子打散了！', noShell: '两发炮弹都打出去了',
      tip: 'A/D 或鼠标左右转炮口，W/S 或鼠标上下调仰角（仰角越低打得越远）。准星对准指挥部、表尺对上距离再放炮——只有两发！F 离开炮位',
      tipTouch: '摇杆或滑屏左右转炮口、上下调仰角（仰角越低打得越远）。准星对准指挥部、表尺对上距离再点开火键——只有两发！',
      keyHint: '<kbd>A</kbd><kbd>D</kbd> 转炮口　<kbd>W</kbd><kbd>S</kbd> 调仰角（越低越远）　左键 放炮　<kbd>F</kbd> 离开炮位　<kbd>V</kbd> 切换人称',
      crewSpots: (placed) => (placed ? [[1.2, 0.9, -0.3], [-1.3, 0.6, 0.4], [-0.6, 2.4, 0.1]] : [[0.35, 0.15, 0], [-1.2, 1.6, 0], [1.2, 1.9, 0]]),
    };
  }
  // 山后小路上转移的师部与野战医院：担架队和伤员，按转移进度往东走
  chapterProps() {
    this.column = [];
    for (let i = 0; i < 8; i++) {
      const g = { off: i * 6.5, models: [], stretcher: null, walk: i };
      if (i % 2 === 0) {
        for (let k = 0; k < 2; k++) g.models.push(buildSoldier('bearer'));
        g.stretcher = buildStretcher(); g.stretcher.rotation.y = Math.PI / 2; this.scene.add(g.stretcher);
      } else g.models.push(buildSoldier(i % 4 === 1 ? 'bearer' : 'ally'), buildSoldier('ally'));
      for (const m of g.models) this.scene.add(m.root);
      this.column.push(g);
    }
  }
  clearChapter() { this.shellCam = null; this.tongue = null; this.ui.setBinoc(false); }
  resetChapter(startPhase) {
    const a = this.app;
    this.flags.eliteLine = 1;   // “老子打的就是精锐”放在抓舌头的过场里，打死特工队时不再喊
    this.stats.tongueFail = 0; this.stats.hitShot = 0;
    this.prog = startPhase > 1 ? 100 : 0;
    this.flags.line = startPhase >= 5 ? (a.ending() === 'miss' ? 'miss' : 'hit') : '';
    this.setHQ(!(startPhase >= 5 && this.flags.line === 'hit'));
    // 风把炮弹往右吹，每局略有不同（按局内种子，同一局可复现）
    this.shots = 0; this.wind = 4.6 + rand(0, 1.4); this.rangeErr = [rand(-1.5, 1.5), rand(-1.2, 1.2)];
    this.updateColumn(0);
  }
  startPos() { return L.start; }
  startWeapon(startPhase) { return startPhase >= 5 ? 'lmg' : 'pistol'; }
  allyRoster() { return [['dabiao', '张大彪'], ['huzi', '虎子'], ['ally'], ['ally'], ['ally'], ['ally']]; }
  resetGun(startPhase) {
    const c = this.cannon;
    c.visible = startPhase >= 3; c.placed = startPhase >= 4;
    c.x = c.placed ? L.firePos.x : L.mortarStart.x; c.z = c.placed ? L.firePos.z : L.mortarStart.z;
  }
  titleCam(t, a) {
    this.camera.position.set(Math.sin(a) * 26, 8 + Math.sin(t * 0.1) * 2, 82 + Math.cos(a) * 8);
    this.camera.lookAt(0, 3, 24);
    this.moveSun(0, 50);
  }
  ambientChapter() {
    // 小雪
    const p = this.camera.position;
    for (let i = 0; i < 5; i++) this.fx.spawn({ x: p.x + rand(-18, 18), y: p.y + rand(3, 10), z: p.z + rand(-18, 18), vx: rand(-0.5, 0.2), vy: -rand(1.0, 1.6), vz: rand(-0.3, 0.3), life: 6, s0: 0.07, s1: 0.05, c0: 0xf4f6f8, spin: rand(-2, 2) });
    if (!this.world.hqTents.alive && rand() < 0.7) this.fx.smokePuff(L.hq.x + rand(-3, 3), 1.2, L.hq.z + rand(-2, 2), 1.5, 0x2e2a28);
  }
  heroBounds(h) {
    if (this.phase === 1 && h.z < 36) {
      h.z = 36;
      if (this.t - (this.flags.boundTip || -9) > 4) { this.flags.boundTip = this.t; this.ui.toast('守住山头！别离阵地太远', 2); }
    }
  }
  gunUsable() { return this.phase === 4 && !this.shellCam; }
  mgSpots() { return [['L', L.nestL, -1], ['R', L.nestR, -1], ['E', L.enemyNest, 1], ['H', L.hqNest, 1]]; }
  // 平地上的射程（表尺）：不含风，不含山坡高低
  flatRange(e) {
    const g = this.gunCfg, vx = Math.cos(e) * MV, vy = Math.sin(e) * MV, h0 = g.pivotY + Math.sin(e) * g.barrel;
    return g.barrel * Math.cos(e) + vx * (vy + Math.sqrt(vy * vy + 2 * MG * h0)) / MG;
  }
  gunAimInfo() {
    const c = this.cannon;
    return [`仰角 <b>${(c.elev / DEG).toFixed(1)}°</b>　表尺 <b>约 ${Math.round(this.flatRange(c.elev))} 米</b>　炮弹 <b>${c.shells}</b>${c.reload > 0 && c.shells > 0 ? '　装填中…' : ''}`, false];
  }
  gunTargetHit(x, y, z) {
    const t = this.world.hqTents;
    if (t.alive) { const q = t.box; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y < q.y1) return { type: 'hq' }; }
    return null;
  }
  // 炮弹落点：不撞场地边界的“空气墙”，落在真实的山坡上
  shellHit(x, y, z) {
    const t = this.gunTargetHit(x, y, z);
    if (t) return t;
    const col = pointBlocked(this.world, x, y, z, 'bound');
    if (col) return { type: 'solid', col };
    if (y <= hgt(x, z)) return { type: 'ground' };
    return null;
  }
  onGunFired() {
    const c = this.cannon, s = this.shells[this.shells.length - 1];
    this.shots++;
    // 风偏与射程误差：按飞行时间折成速度，落点偏右约五米
    const T = 2 * s.vy / s.g, err = this.rangeErr[Math.min(1, this.shots - 1)];
    s.vx += (rightX(c.aimYaw) * this.wind + fwdX(c.aimYaw) * err) / T;
    s.vz += (rightZ(c.aimYaw) * this.wind + fwdZ(c.aimYaw) * err) / T;
    this.ui.stamp(this.shots === 1 ? '第一发！' : '最后一发！', 1.0);
    this.ui.setAim(null);
    // 先算好会不会打中：打中的话，落地前一秒放“联队长，危险”
    let x = s.x, y = s.y, z = s.z, vx = s.vx, vy = s.vy, vz = s.vz, hit = null, k = 0;
    for (; k < 900 && !hit; k++) { vy -= s.g * 0.016; x += vx * 0.016; y += vy * 0.016; z += vz * 0.016; hit = this.shellHit(x, y, z); }
    const will = !!hit && (hit.type === 'hq' || Math.hypot(x - L.hq.x, z - L.hq.z) < 5.5);
    this.shellCam = { shell: s, t: 0, land: k * 0.016, will, warned: false, whistle: false, impact: null, hold: 0, lx: s.x, ly: s.y, lz: s.z, px: c.x + fwdX(c.aimYaw) * 36 - rightX(c.aimYaw) * 42, py: 10, pz: c.z + fwdZ(c.aimYaw) * 36 - rightZ(c.aimYaw) * 42, k: 2.2, look: this.camera.position.clone().add(_v.set(fwdX(c.aimYaw) * 10, 0, fwdZ(c.aimYaw) * 10)) };
  }
  onShellImpact(hit, x, y, z) {
    const sc = this.shellCam;
    if (this.phase !== 4 || !sc) return;
    const isHit = hit.type === 'hq' || Math.hypot(x - L.hq.x, z - L.hq.z) < 5.5;
    this.lastShot = { x, z, hit: isHit };
    sc.impact = { x, y, z }; sc.hold = isHit ? 4.6 : 2.8;
    const c = this.cannon, fx = fwdX(c.aimYaw), fz = fwdZ(c.aimYaw), rx = rightX(c.aimYaw), rz = rightZ(c.aimYaw);
    sc.px = x - fx * 17 - rx * 9; sc.py = y + 8; sc.pz = z - fz * 17 - rz * 9; sc.lx = x; sc.ly = y + 1.2; sc.lz = z; sc.k = 1.6;
    if (isHit) {
      this.setHQ(false);
      for (let i = 0; i < 5; i++) this.after(i * 0.18, () => { this.fx.explosion(L.hq.x + rand(-4, 4), rand(0.5, 2.5), L.hq.z + rand(-3, 3), 6, true); this.fx.debris(L.hq.x, 2, L.hq.z, 16, [0xb7ad8a, 0x5a4632, 0x2e2b26, 0xe8dfc0], 12, 0.7); });
      this.audio.play('collapse');
      for (const e of this.enemies) if (e.alive && dist2(e.x, e.z, L.hq.x, L.hq.z) < 18 * 18) this.killUnit(e, false, e.x - L.hq.x, e.z - L.hq.z);
    }
  }
  gunInvulnerable() { return this.phase !== 3; }
  gunExposed() { return this.phase === 3; }
  gunTargetable(u) { const c = this.cannon; return this.phase === 3 && c.visible && c.alive && !c.placed && u.wantCannon; }
  gunBar() { return this.phase === 1 ? this.prog / 100 : this.phase === 3 && !this.cannon.placed ? this.cannon.hp / this.cannon.maxHp : null; }
  gunBarLabel() { return this.phase === 1 ? '转移进度' : '炮组'; }
  // 抓舌头：军曹挨枪子只会倒地，手榴弹、炮弹、刀和骑兵会把他弄死
  spareUnit(u, dmg, kind) {
    if (u !== this.tongue || this.phase !== 2) return false;
    if (u.downed) { u.hp = 1; return true; }
    if (kind !== 'bullet') return false;
    u.downed = true; u.hp = 1; u.active = false; u.aim = 0; u.moving = 0; u.state = 'idle';
    this.addScore(300);
    this.ui.say('虎子', '团长，军曹倒了，还有口气！', { now: true });
    this.ui.toast(this.app.isTouch() ? '走到军曹跟前，点“抓俘虏”' : '走到军曹跟前按 F 抓活的', 4);
    return true;
  }
  useOption(h) {
    const t = this.tongue;
    if (this.phase !== 2 || !t || !t.alive || !t.downed || this.flags.captured || h.y > 0.5 || dist2(h.x, h.z, t.x, t.z) > 2.4 * 2.4) return null;
    return { label: '抓俘虏', prompt: '按 F 抓活的', act: () => this.captureScene() };
  }
  respawnPoint() {
    const p = this.phase, c = this.cannon;
    if (p === 1 || p === 2) return [0, p === 1 ? 66 : 60];
    if (p === 3) return [clamp(c.x + 2, -40, 40), c.z + 6];
    if (p === 4) return [L.firePos.x + 3, L.firePos.z + 5];
    return this.sub === 'out' ? [8, -128] : [-14, -96];
  }
  advanceFormation() { return this.phase === 2 || this.phase === 3 || this.phase === 5; }
  chapterLabels(lab) {
    const c = this.cannon, ui = this.ui;
    if (c.visible && (this.phase === 3 || this.phase === 4) && c.crew[0]) { const p = c.crew[0].root.position; lab('zhuzi', '柱子', { x: p.x, z: p.z, y: 0, alive: true }, 2.2, false); } else ui.label('zhuzi', '柱子', 0, 0, false, false);
    const t = this.tongue;
    if (this.phase === 2 && t && t.alive) lab('tongue', t.downed ? '军曹（还有气）' : '军曹（抓活的）', t, t.downed ? 1.3 : 2.4, true); else ui.label('tongue', '', 0, 0, false, true);
  }
  updateBossUnit(u, dt) { updateBoss(this, u, dt); }
  mortarAim() {
    const c = this.cannon, h = this.hero;
    if (this.phase === 1) {
      if (h.alive && h.z > 50 && rand() < 0.4) return [h.x + h.vx * 0.8, h.z + h.vz * 0.8];
      const p = POSTS1[Math.floor(rand(6))]; return [p[0] + rand(-2, 2), p[1] + rand(-1.5, 1.5)];
    }
    if (this.phase === 3 && c.visible && !c.placed && rand() < 0.6) return [c.x + rand(-1.5, 1.5), c.z + rand(-1, 2)];
    if (this.phase === 2 || this.phase === 3) return h.alive ? [h.x + h.vx * 0.8, h.z + h.vz * 0.8] : null;
    return null;
  }
  allyPost(u) {
    if (this.phase === 1) return [POSTS1[u.slot][0], POSTS1[u.slot][1], true];
    if (this.phase === 4) return [POSTS4[u.slot][0], POSTS4[u.slot][1], true];
    const c = this.cannon;
    if (this.phase === 3 && !c.placed && (u.slot === 2 || u.slot === 3)) return [c.x + (u.slot === 2 ? -3 : 3), c.z - 2.5, false];
    return null;
  }

  // 局内喊话（不在过场里）：上一句原声没放完就排到它后面，免得两句叠在一起；换了阶段就不放了
  vo(id, dur, fn) {
    const ph = this.phase, go = () => { if (this.over || this.phase !== ph) return; this.audio.voice(id); this.voBusy = this.t + dur; if (fn) fn(); };
    const wait = (this.voBusy || 0) - this.t;
    if (wait > 0.05) this.after(wait + 0.3, go); else go();
  }
  endScene(skipped) { if (skipped) this.voBusy = 0; super.endScene(skipped); }
  setHQ(alive) {
    const t = this.world.hqTents;
    t.alive = alive; t.mesh.visible = alive; t.ruin.visible = !alive;
    for (const c of t.cols) c.on = alive;
    this.world.flag.visible = alive;
  }
  updateColumn(dt) {
    const show = this.phase === 1 && this.mode === 'play';
    const head = -52 + this.prog * 1.54, moving = show && this.progMoving;
    for (const g of this.column) {
      const x = head - g.off, vis = show && x > -50 && x < 50;
      if (moving) g.walk += dt * 7;
      const ms = g.models;
      for (let k = 0; k < ms.length; k++) {
        const m = ms[k];
        m.root.visible = vis;
        if (!vis) continue;
        m.root.position.set(x + (k ? -1.5 : 1.0), 0, L.colZ + (g.stretcher ? 0 : (k ? 1.1 : -0.4)));
        m.root.rotation.y = -Math.PI / 2;
        poseSoldier(m, { walk: g.walk + k * 1.3, moving: moving ? 1 : 0, aim: 0, carry: 'side', slash: -1 });
        if (g.stretcher) { m.armR.rotation.x = 1.25; m.armL.rotation.x = 1.25; }
      }
      if (g.stretcher) { g.stretcher.visible = vis; g.stretcher.position.set(x - 0.25, 0.95, L.colZ); }
    }
  }

  // ---------- 阶段 ----------
  enterPhase(n, fresh) {
    const h = this.hero, c = this.cannon, ui = this.ui;
    this.phase = n; this.phaseT = 0; this.sub = '';
    // 换阶段：上一阶段还没说完的局内喊话掐掉，新阶段的喊话马上能放
    this.audio.stopVoices(); this.voBusy = 0;
    if (h) h.mg = null;
    this.app.saveCheckpoint(n);
    for (const e of this.enemies) if (e.alive && e.type !== 'boss') { e.alive = false; e.deadT = 9; }
    this.bullets.length = 0;
    this.fx.clearWarnings(); this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0;
    if (c.manned) this.leaveCannon();
    h.hp = h.maxHp; h.nades = h.nadeMax; h.inv = Math.max(h.inv, 1.2);
    this.tongue = null; this.shellCam = null;
    const line = n === 5 ? (this.flags.line || (this.app.ending() === 'miss' ? 'miss' : 'hit')) : '';
    spawnPhase(this, n, line);
    this.audio.setMusic(n >= 4 ? 2 : 1);
    if (n === 1) {
      this.prog = 0; this.progMoving = false;
      this.place(h, L.start.x, L.start.z);
      this.allies.forEach((al) => this.place(al, POSTS1[al.slot][0], POSTS1[al.slot][1]));
      ui.say('李云龙', '张大彪！师部和野战医院正在转移，新一团给我钉死在山头上！');
      ui.say('张大彪', '是！一营、二营，都给我顶住！');
      this.after(4.5, () => ui.toast(this.app.isTouch() ? '守住山头：左上角的转移进度走满就完成。鬼子压到阵地跟前，转移会停下。阵地两边的机枪可以接管' : '守住山头：左上角的转移进度走满就完成。鬼子压到阵地跟前，转移会停下。阵地两边的机枪可以接管（F）', 7));
    } else if (n === 2) {
      if (fresh) this.place(h, 0, 60);
      this.tongueIdx = 0; this.spawnTongue(0);
      this.vo('cy_zhuohuode', 4.5, () => ui.say('李云龙', '去，抓个活的问问，对面的鬼子是哪个部队的。', { now: true, dur: 4.6 }));
      this.spawnMed(0, 50);
      this.after(4.8, () => ui.toast('抓舌头：用枪把带臂章的军曹打倒（手榴弹、骑兵会把他弄死），再过去按 F 抓活的', 6));
    } else if (n === 3) {
      c.visible = true; c.placed = false; c.moving = false; c.x = L.mortarStart.x; c.z = L.mortarStart.z; c.hp = c.maxHp; c.alive = true;
      this.pathI = 0;
      this.place(h, 3.5, 60.6);
      this.allies.forEach((al, i) => this.place(al, -13 + (i % 3) * 2.6, 59.4 - Math.floor(i / 3) * 2));
      if (!this.flags.intro3) this.intro3(); else this.startEscort();
    } else if (n === 4) {
      c.visible = true; c.placed = true; c.moving = false; c.x = L.firePos.x; c.z = L.firePos.z; c.aimYaw = 0; c.elev = this.gunCfg.elev0; c.shells = 2; c.reload = 0;
      this.shots = 0; this.flags.shotDone = 0;
      if (fresh) { this.place(h, L.firePos.x + 2.5, L.firePos.z + 4); this.allies.forEach((al) => this.place(al, POSTS4[al.slot][0], POSTS4[al.slot][1])); }
      this.p4T = 14;
      this.spawnMed(L.firePos.x - 4, L.firePos.z + 3);
      this.vo('cy_kuaifang', 1.7, () => ui.say('李云龙', '快，就放这！', { now: true, dur: 1.8 }));
      this.vo('cy_diguashao', 11.1, () => {
        ui.say('李云龙', '等仗打完了，我赏给你半斤地瓜烧。', { now: true, dur: 3.6 });
        ui.say('李云龙', '我丑话说在前面：你要是打不中，别说地瓜烧免了，我还得枪毙你！听见没有？', { dur: 6.4 });
        ui.say('柱子', '是！保证完成任务！', { dur: 1.4 });
      });
      this.after(13.6, () => { if (this.phase === 4 && !this.shots) ui.say('柱子', '团长，指挥部离这儿七十五米上下。今儿刮西风，炮弹往右飘，瞄的时候往左带一点。', { dur: 6 }); });
      this.after(3, () => { if (this.phase === 4 && !c.manned) ui.toast(this.app.isTouch() ? '走到迫击炮旁边点“操炮”' : '走到迫击炮旁边按 F 操炮', 4); });
    } else if (n === 5) {
      h.weapon = 'lmg'; h.magMax = 40; h.mag = 40; h.reloadT = 0;
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z;
      this.flags.line = line; this.setHQ(line === 'miss');
      if (fresh) { this.place(h, -8, -80); this.allies.forEach((al, i) => this.place(al, -14 + i * 2.5, -76)); }
      this.spawnMed(-6, -92); this.spawnMed(-32, -100);
      ui.toast('张大彪把刚缴的歪把子塞给你：射速更快，弹匣 40 发', 3.5);
      if (line === 'miss') {
        this.sub = 'boss';
        this.vo('cy_yongzhesheng', 14.7, () => {
          ui.say('李云龙', '弟兄们！都说小鬼子拼刺刀有两下子，老子就不信这个邪！', { now: true, dur: 6.8 });
          ui.say('李云龙', '我跟你们说过：狭路相逢，勇者胜！弟兄们，冲啊！', { dur: 7.9 });
        });
        this.after(9.6, () => { ui.stamp('狭路相逢勇者胜！', 1.6); this.audio.play('drum'); });
        this.after(15, () => this.sub === 'boss' && this.boss && this.boss.alive && ui.toast('坂田躲在指挥部门口的沙袋后面指挥：红圈是掷弹筒，躲开；先收拾冲上来的卫兵，再绕过去打他', 6));
      } else {
        this.sub = 'charge';
        this.vo('cy_chongle', 4.1, () => ui.say('李云龙', '柱子！弟兄们，冲啊！冲啊！', { now: true, dur: 4.1 }));
        ui.stamp('冲啊！', 1.4); this.audio.play('bugle', 0.7);
      }
    }
    this.syncCannonModel(0);
  }

  objective() {
    const p = this.phase, c = this.cannon, h = this.hero;
    if (this.flags.won) return ['<b>苍云岭，突出去了！</b>', null];
    if (p === 1) {
      const pct = Math.floor(this.prog);
      if (this.prog >= 100) return ['第一阶段 · <b>师部和野战医院转移完了</b>', null];
      return [`第一阶段 · 坚守山头，掩护师部转移 <b>${pct}%</b>${this.stalled ? '　<b>鬼子压上来了！</b>' : ''}`, this.stalled ? this.nearestEnemyMarker('P1') : null];
    }
    if (p === 2) {
      const t = this.tongue;
      if (!t || !t.alive) return ['第二阶段 · <b>再找一个军曹</b>', null];
      return [t.downed ? '第二阶段 · <b>过去把军曹抓回来</b>' : '第二阶段 · 抓舌头：<b>用枪打倒带臂章的军曹</b>', { x: t.x, y: 2.6, z: t.z, text: '军曹' }];
    }
    if (p === 3) {
      if (c.placed) return ['第三阶段 · <b>炮位到了</b>', null];
      return [`第三阶段 · 护送炮组前出五百米 <b>还剩 ${Math.max(0, Math.round(this.pathLeft() / this.pathTotal() * 500))} 米</b>`, { x: c.x, y: 2.8, z: c.z, text: '炮组' }];
    }
    if (p === 4) {
      if (this.shellCam) return ['第四阶段 · <b>炮弹出膛……</b>', null];
      if (!c.manned) return [`第四阶段 · 回到迫击炮旁<b>操炮</b>（还剩 ${c.shells} 发）`, { x: c.x, y: 2.4, z: c.z, text: '迫击炮' }];
      return [`第四阶段 · 两发炮弹：<b>打掉坂田的指挥部</b>（还剩 ${c.shells} 发）`, { x: L.hq.x, y: 3, z: L.hq.z, text: '坂田指挥部' }];
    }
    if (this.sub === 'boss') return ['突围 · <b>干掉坂田信哲</b>', null];
    if (this.sub === 'charge') return ['突围 · <b>冲进坂田的指挥部</b>', { x: L.hq.x, y: 3, z: L.hq.z, text: '指挥部' }];
    if (this.sub === 'hold') return ['突围 · 指挥部端了，<b>顶住两边压上来的鬼子</b>', null];
    if (this.sub === 'out') return ['突围 · <b>从山口打出去！</b>', { x: L.out.x, y: 3, z: L.out.z, text: '突围' }];
    return ['', null];
  }
  pathTotal() { let s = Math.hypot(L.path[0][0] - L.mortarStart.x, L.path[0][1] - L.mortarStart.z); for (let i = 1; i < L.path.length; i++) s += Math.hypot(L.path[i][0] - L.path[i - 1][0], L.path[i][1] - L.path[i - 1][1]); return s; }
  pathLeft() {
    const c = this.cannon;
    if (this.pathI >= L.path.length) return 0;
    let s = Math.hypot(L.path[this.pathI][0] - c.x, L.path[this.pathI][1] - c.z);
    for (let i = this.pathI + 1; i < L.path.length; i++) s += Math.hypot(L.path[i][0] - L.path[i - 1][0], L.path[i][1] - L.path[i - 1][1]);
    return s;
  }

  updatePhase(dt) {
    const p = this.phase;
    this.phaseT += dt;
    if (this.flags.won || this.over) return;
    if (p === 1) this.updateHold(dt);
    else if (p === 2) this.updateTongue(dt);
    else if (p === 3) this.updateEscort(dt);
    else if (p === 4) this.updateFire(dt);
    else if (p === 5) this.updateBreakout(dt);
  }
  updateChapter(dt) {
    this.updateColumn(dt);
    const c = this.cannon;
    // 炮组扛着迫击炮走：炮身架在柱子肩上
    if (c.visible && !c.placed && c.crew[0]) { const q = c.crew[0].root.position; c.model.root.position.set(q.x + 0.32, 1.12, q.z + 0.1); }
    const sc = this.shellCam;
    if (!sc) return;
    this.cut = Math.max(this.cut, 0.2);
    sc.t += dt;
    if (!sc.impact) {
      const s = sc.shell;
      sc.lx = s.x; sc.ly = s.y; sc.lz = s.z;
      if (!sc.whistle && s.vy < 0) { sc.whistle = true; this.audio.play('whistle', 1.2); }
      if (sc.will && !sc.warned && sc.t > sc.land - 1.1) {
        sc.warned = true;
        this.audio.voice('cy_dazhong');
        this.ui.say('日军参谋', '联队长，危险！', { now: true, foe: true, dur: 1.6 });
        this.ui.say('李云龙', '柱子，打得好！打中了，打中了！', { dur: 3.5 });
      }
    } else {
      sc.hold -= dt;
      if (sc.hold <= 0) { this.shellCam = null; this.cut = 0; this.resolveShot(); }
    }
  }
  // 操炮镜头：第一人称是贴着炮身的瞄准镜（拉近），第三人称在炮后上方；准星都对着炮口方位
  gunCamera(view) {
    const c = this.cannon, cam = this.camera, yaw = c.aimYaw, fx = fwdX(yaw), fz = fwdZ(yaw), rx = rightX(yaw), rz = rightZ(yaw);
    if (view === 1) {
      cam.position.set(c.x - fx * 0.5 + rx * 0.3, 1.35, c.z - fz * 0.5 + rz * 0.3);
      _v.set(c.x + fx * 80, 1.0, c.z + fz * 80);
      if (cam.fov !== 34) { cam.fov = 34; cam.updateProjectionMatrix(); }
    } else {
      cam.position.set(c.x - fx * 3.6 + rx * 0.8, 3.0, c.z - fz * 3.6 + rz * 0.8);
      _v.set(c.x + fx * 70, 0.6, c.z + fz * 70);
    }
    cam.lookAt(_v);
  }
  // 炮弹跟拍：从侧面看弹道，落地后凑近看落点
  updateCamera(dt) {
    const sc = this.shellCam;
    if (!sc || this.scn) { super.updateCamera(dt); return; }
    const cam = this.camera;
    if (cam.fov !== 52) { cam.fov = 52; cam.updateProjectionMatrix(); }
    cam.position.lerp(_v.set(sc.px, sc.py, sc.pz), 1 - Math.exp(-sc.k * dt));
    sc.look.lerp(_v.set(sc.lx, sc.ly, sc.lz), 1 - Math.exp(-7 * dt));
    cam.lookAt(sc.look);
    this.moveSun(sc.lx, sc.lz); this.updateFades(true);
  }

  // 第一阶段：坚守山头
  updateHold(dt) {
    const ui = this.ui;
    let near = 0;
    for (const e of this.enemies) if (e.alive && e.active && e.type !== 'mortar' && e.z > 46) near++;
    this.stalled = near >= 3;
    this.progMoving = this.cut <= 0 && !this.stalled && this.prog < 100;
    if (this.progMoving) this.prog = Math.min(100, this.prog + dt * 100 / 140);
    if (this.stalled && !this.flags.stallTip) { this.flags.stallTip = 1; ui.say('张大彪', '团长，鬼子压到跟前了！转移队伍得停一停！', { now: true }); }
    const W = [[0, 'w0'], [10, 'w1'], [24, 'w2'], [40, 'w3'], [56, 'w4'], [72, 'w5'], [86, 'w6']];
    for (const [th, id] of W) if (this.prog >= th && !this.flags[id]) { this.flags[id] = 1; this.wave(id); }
    if (this.prog >= 33 && !this.flags.m1) { this.flags.m1 = 1; this.spawnMed(-8, 66); }
    if (this.prog >= 66 && !this.flags.m2) { this.flags.m2 = 1; this.spawnMed(9, 66); }
    if (this.prog >= 100 && !this.flags.p1done) {
      this.flags.p1done = 1; this.addScore(1000);
      this.vo('cy_zhuanyi', 10.5, () => {
        ui.say('李云龙', '张大彪，师部和野战医院转移了没有？', { now: true, dur: 3.5 });
        ui.say('张大彪', '报告团长，已经全部撤离。', { dur: 3.4 });
        ui.say('李云龙', '这回咱们可以放开手脚，和鬼子干一场了！', { dur: 3.7 });
      });
      ui.stamp('转移完成！', 1.6);
      this.after(11, () => { if (this.phase === 1 && !this.over) this.enterPhase(2, false); });
    }
  }
  wave(id) {
    const ui = this.ui, P = 'P1';
    const elite = (x, z) => { const e = this.addUnit('enemy', 'elite', x, z, { group: P, wake: 999 }); e.active = true; };
    if (id === 'w0') { this.spawnWave(-2, 18, 4, 1, P, 18); this.spawnWave(-24, 20, 3, 0, P, 20); ui.say('虎子', '团长，鬼子上来了！'); }
    else if (id === 'w1') { this.spawnWave(24, 16, 5, 1, P, 16); ui.say('张大彪', '右边，右边又上来一股！'); }
    else if (id === 'w2') { this.spawnWave(-26, 14, 4, 0, P, 16); elite(-24, 10); this.spawnWave(0, 16, 0, 2, P); ui.say('虎子', '鬼子军官举着刀冲过来了！'); }
    else if (id === 'w3') { this.spawnWave(-40, 32, 3, 1, P, 12); this.spawnWave(40, 30, 3, 1, P, 12); ui.say('张大彪', '鬼子从两边山脚绕上来了！'); }
    else if (id === 'w4') { for (const x of [-5, 0, 5]) elite(x, 10); this.spawnWave(0, 14, 2, 0, P, 16); ui.say('张大彪', '团长，这股鬼子不一样，端着冲锋枪！'); }
    else if (id === 'w5') { this.spawnWave(-20, 16, 4, 1, P, 15); this.spawnWave(20, 16, 4, 1, P, 15); ui.say('虎子', '两边一起压上来了！'); }
    else if (id === 'w6') { this.spawnWave(0, 14, 5, 2, P, 14); elite(-8, 10); elite(8, 10); ui.say('张大彪', '鬼子最后一口气了，顶住！'); }
  }

  // 第二阶段：抓舌头
  spawnTongue(i) {
    const [x, z] = TONGUE[i % TONGUE.length], g = 'T' + i;
    const t = this.addUnit('enemy', 'sergeant', x, z, { group: g, hold: true, wake: 30 });
    this.addUnit('enemy', 'rifle', x - 3, z + 1, { group: g, wake: 30 });
    this.addUnit('enemy', 'rifle', x + 3, z - 1, { group: g, hold: true, wake: 30 });
    this.addUnit('enemy', 'rifle', x + 1, z - 4, { group: g, wake: 30 });
    if (i === 0) this.addUnit('enemy', 'officer', x - 1, z - 3, { group: g, wake: 20 });
    this.tongue = t;
  }
  updateTongue() {
    const t = this.tongue, ui = this.ui;
    if (t && !t.alive && !this.flags.captured) {
      this.stats.tongueFail++; this.tongue = null;
      ui.say('虎子', '团长，下手太重了，这个没气了！', { now: true });
      ui.toast('要活的：用枪把军曹打倒，别用手榴弹、亮剑和骑兵连', 4);
      this.after(2.5, () => { if (this.phase === 2 && !this.flags.captured && !this.over) { this.tongueIdx++; this.spawnTongue(this.tongueIdx); ui.say('张大彪', '那边还有一个戴臂章的！'); } });
    }
  }
  captureScene() {
    const t = this.tongue, h = this.hero, ui = this.ui;
    this.flags.captured = 1; this.addScore(800);
    t.alive = false; t.deadT = 9; t.model.root.visible = false; this.tongue = null;
    this.clearCast();
    h.yaw = 0;
    const m = buildSoldier('sergeant');
    m.root.position.set(h.x + 0.3, -0.32, h.z - 1.5); m.root.rotation.y = Math.PI;
    this.poseTied(m);
    this.scene.add(m.root); this.cast.push(m);
    const side = { px: h.x + 4.2, py: 2.1, pz: h.z - 0.2, lx: h.x + 0.1, ly: 1.0, lz: h.z - 0.9 };
    const face = { px: h.x - 1.4, py: 1.9, pz: h.z - 3.6, lx: h.x, ly: 1.5, lz: h.z };
    this.cutCam = side;
    this.audio.voice('cy_bantian');
    ui.say('张大彪', '团长，问出来了：日军第四旅团的坂田联队。', { now: true, dur: 4.6 });
    ui.say('李云龙', '坂田联队？怎么听着这么耳熟啊……', { dur: 3.8 });
    this.playScene(23.6, [
      [8.8, () => {
        this.cutCam = face;
        this.audio.voice('cy_jingrui');
        ui.say('张大彪', '团长，他们可是号称鬼子的精锐，这次咱就——', { now: true, dur: 4.4 });
        ui.say('李云龙', '什么他娘的精锐！我就不信这个邪，老子打的就是精锐！', { dur: 5.9 });
        ui.say('李云龙', '传我的命令：全体上刺刀，准备进攻！', { dur: 3.5 });
        ui.say('李云龙', '进攻！', { dur: 1.3 });
      }],
      [17.5, () => ui.stamp('老子打的就是精锐！', 1.6)],
      [19.9, () => { ui.stamp('全体上刺刀！', 1.4, 'red'); this.audio.play('drum'); }],
    ], () => { this.clearCast(); this.enterPhase(3, false); });
  }

  // 第三阶段：望远镜里看见指挥部，送炮前出五百米
  intro3() {
    const ui = this.ui, h = this.hero, c = this.cannon;
    this.flags.intro3 = 1;
    // 望远镜里：坂田站在帐篷前
    this.clearCast();
    const sk = buildSoldier('sakata');
    sk.root.position.set(L.hq.x + 0.6, 0, L.hq.z + 4.4); sk.root.rotation.y = 0.15;
    poseSoldier(sk, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 });
    sk.armR.rotation.x = 2.5; sk.armL.rotation.x = 2.5; sk.armR.rotation.z = 0.35; sk.armL.rotation.z = -0.35;
    this.scene.add(sk.root); this.cast.push(sk);
    this.cutCam = { px: -17, py: 3.4, pz: -103, lx: L.hq.x + 0.5, ly: 1.8, lz: L.hq.z };
    ui.setBinoc(true);
    this.audio.voice('cy_paobudiao');
    ui.say('李云龙', '老天爷帮忙啊，这个兔崽子跑不掉了！', { now: true, dur: 5.0 });
    const talk = { px: h.x + 3.6, py: 2.0, pz: h.z + 1.2, lx: (h.x + c.x) / 2 - 0.6, ly: 1.4, lz: (h.z + c.z) / 2 };
    this.playScene(34.0, [
      [5.2, () => {
        this.audio.voice('cy_zhangpeng');
        ui.say('李云龙', '看到山坡上的帐篷了吗？你的炮够得着吗？', { now: true, dur: 6.6 });
        ui.say('柱子', '团长，距离太远，已经超出射程了。', { dur: 3.7 });
      }],
      [8.8, () => { ui.setBinoc(false); this.clearCast(); this.cutCam = talk; }],
      [15.7, () => {
        this.audio.voice('cy_wubaimi');
        ui.say('柱子', '团长，向前推进五百米，准行！', { now: true, dur: 3.8 });
        ui.say('李云龙', '好，我把你送到五百米的位置。有把握吗？', { dur: 3.2 });
        ui.say('柱子', '有！不过团长……咱们只有两发炮弹了。', { dur: 5.5 });
      }],
      [28.4, () => {
        this.audio.voice('cy_baijiazi');
        ui.say('李云龙', '你说什么？娘的，你个败家子儿，你怎么不省着点儿用！', { now: true, dur: 5.4 });
        ui.stamp('只有两发炮弹！', 1.6);
      }],
    ], () => { ui.setBinoc(false); this.clearCast(); this.startEscort(); });
  }
  startEscort() {
    const ui = this.ui;
    this.vo('cy_qianfang', 18.5, () => {
      ui.say('李云龙', '看，前方五百米。部队向前攻击五百米，守住它，为炮兵赢得时间！', { now: true, dur: 9.9 });
      ui.say('李云龙', '只要一炮干掉坂田的指挥部，旅长就不会拿我怎么样的，闹不好还得请我喝酒！', { dur: 8.6 });
    });
    this.after(2.5, () => { if (this.phase === 3) ui.toast('炮组跟在你后面走：前头有鬼子就停下，先替他们把路打通；炮组被打散要从头送', 6); });
  }
  updateEscort(dt) {
    const c = this.cannon, ui = this.ui, h = this.hero;
    if (c.placed) return;
    let blocked = false;
    for (const e of this.enemies) { if (e.alive && !e.downed && e.y < 2 && e.type !== 'mortar' && dist2(e.x, e.z, c.x, c.z) < 16 * 16) { blocked = true; break; } }
    const near = h.alive && dist2(h.x, h.z, c.x, c.z) < 14 * 14;
    c.moving = !blocked && this.cut <= 0 && this.pathI < L.path.length;
    if (c.moving) {
      const [tx, tz] = L.path[this.pathI];
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz), sp = (near ? 2.8 : 1.8) * dt;
      if (d <= sp) { c.x = tx; c.z = tz; this.pathI++; }
      else { c.x += dx / d * sp; c.z += dz / d * sp; }
    } else if (blocked && !this.flags.blockTip) { this.flags.blockTip = 1; ui.say('柱子', '团长，前头有鬼子，炮组过不去！'); }
    const wave = (id, z, fn) => { if (!this.flags[id] && c.z < z) { this.flags[id] = 1; fn(); } };
    wave('w31', 44, () => { this.spawnWave(-44, 30, 4, 1, 'W', 14); ui.say('虎子', '左边山脚有鬼子摸过来了，冲着炮组去的！'); });
    wave('m31', 30, () => this.spawnMed(c.x + 3, c.z - 2));
    wave('tuwei', 20, () => {
      this.vo('cy_tuwei', 14.9, () => {
        ui.say('通讯员', '报告团长，刚刚接到旅部的命令：旅长命令新一团交替掩护后撤，从俞家岭方向突围！', { now: true, dur: 7.3 });
        ui.say('李云龙', '坂田联队的刺刀都顶到老子鼻子上了，这会儿后撤，亏他们想得出来！反正是突围，从哪儿出去不一样？', { dur: 7.6 });
      });
    });
    wave('w32', 12, () => { this.spawnWave(44, 4, 4, 1, 'W', 14); ui.say('张大彪', '右翼上来一股，护住炮组！'); });
    wave('w33', -22, () => { this.spawnWave(-44, -44, 3, 1, 'W', 14); this.spawnWave(44, -48, 3, 0, 'W', 14); ui.say('虎子', '两边又冲出来了！'); });
    wave('m32', -24, () => this.spawnMed(c.x + 3, c.z - 2));
    if (this.pathI >= L.path.length) {
      c.placed = true; c.moving = false; c.x = L.firePos.x; c.z = L.firePos.z;
      this.addScore(800);
      this.chuScene();
    }
  }
  spawnChu() {
    this.clearCast();
    const p = L.chu, y = this.world.chuY;
    const chu = buildSoldier('chu'), staff = buildSoldier('guojun');
    chu.root.position.set(p.x, y, p.z); staff.root.position.set(p.x + 0.6, y, p.z + 1.4);
    for (const m of [chu, staff]) { m.root.rotation.y = Math.PI / 2; poseSoldier(m, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 }); this.scene.add(m.root); this.cast.push(m); }
    chu.armR.rotation.x = 2.5; chu.armL.rotation.x = 2.5; chu.armR.rotation.z = 0.35; chu.armL.rotation.z = -0.35;   // 举着望远镜
  }
  // 358 团的观察所：楚云飞看着新一团被围
  chuCam() { const p = L.chu, y = this.world.chuY; return { px: p.x - 4.2, py: Math.max(y + 1.0, hgt(p.x - 4.2, p.z + 2.6) + 1.2), pz: p.z + 2.6, lx: p.x, ly: y + 1.8, lz: p.z }; }
  chuScene() {
    const ui = this.ui, p = L.chu, y = this.world.chuY;
    this.spawnChu();
    this.cutCam = this.chuCam();
    this.audio.voice('cy_chu');
    ui.say('358团参谋', '他们是无论如何也坚持不了多长时间了。', { now: true, dur: 2.9 });
    ui.say('楚云飞', '我们得想办法支援他们一下，哪怕给他们点儿炮火支援也好。', { dur: 6.1 });
    ui.say('358团参谋', '团座，此事恐怕我们无能为力。', { dur: 3.6 });
    this.playScene(13.0, [[6.4, () => { this.cutCam = { px: p.x + 2.4, py: y + 3, pz: p.z + 1.4, lx: -8, ly: 2, lz: -60 }; }]], () => { this.clearCast(); this.enterPhase(4, false); });
  }

  // 第四阶段：两发炮弹
  updateFire(dt) {
    if (this.shellCam || this.cut > 0) return;
    this.p4T -= dt;
    if (this.p4T <= 0) {
      this.p4T = 16;
      if (this.enemies.filter((e) => e.alive && e.group.startsWith('W')).length < 6) {
        const sx = this.flags.p4side ? 1 : -1; this.flags.p4side = !this.flags.p4side;
        this.spawnWave(sx * 40, -82, 3, this.phaseT > 40 ? 1 : 0, 'W4', 12);
        if (!this.flags.p4tip) { this.flags.p4tip = 1; this.ui.say('张大彪', '团长，鬼子往炮位这边摸了，我们顶着，你只管打！'); }
      }
    }
  }
  resolveShot() {
    const s = this.lastShot, ui = this.ui, c = this.cannon;
    if (!s) return;
    if (s.hit) { this.canonHit(); return; }
    if (c.shells <= 0) { this.missBranch(); return; }
    // 柱子报偏差：沿炮口方向是远 / 近，横着是左 / 右
    const fx = L.hq.x - c.x, fz = L.hq.z - c.z, l = Math.hypot(fx, fz), ux = fx / l, uz = fz / l;
    const ex = s.x - L.hq.x, ez = s.z - L.hq.z, df = ex * ux + ez * uz, dr = ex * -uz + ez * ux;
    const parts = [];
    if (Math.abs(df) >= 1.5) parts.push((df > 0 ? '远了' : '近了') + cn(Math.abs(df)) + '米');
    if (Math.abs(dr) >= 1.5) parts.push((dr > 0 ? '偏右' : '偏左') + cn(Math.abs(dr)) + '米');
    if (!parts.length) parts.push('就差一点点');
    this.stats.miss1 = parts.join('，');
    if (df > 3) this.vo('cy_dawai', 3.3, () => ui.say('李云龙', '柱子，你他娘的打歪了！指挥部在下边！', { now: true, dur: 3.3 }));
    else ui.say('李云龙', '他娘的，打偏了！', { now: true, dur: 1.8 });
    ui.say('柱子', `团长，${parts.join('，')}！就剩最后一发了……`, { dur: 4.2 });
    const tip = [];
    if (Math.abs(dr) >= 1.5) tip.push(dr > 0 ? '炮口往左转一点' : '炮口往右转一点');
    if (Math.abs(df) >= 1.5) tip.push(df > 0 ? '仰角调高一点（打近些）' : '仰角调低一点（打远些）');
    if (tip.length) this.after(1.5, () => ui.toast('修正：' + tip.join('，'), 5));
  }
  canonHit() {
    const ui = this.ui;
    this.flags.line = 'hit'; this.app.saveEnding('hit');
    this.stats.hitShot = this.shots; this.stats.genius++;
    this.addScore(this.shots === 1 ? 3000 : 2000);
    this.cutCam = { px: L.hq.x + 9, py: 6, pz: L.hq.z + 16, lx: L.hq.x, ly: 1.2, lz: L.hq.z };
    this.audio.voice('tiancai');
    ui.say('李云龙', '柱子，你他娘的还真是个天才！', { now: true, dur: 2.6 });
    ui.stamp('打中了！', 1.6);
    this.playScene(3.0, [], () => this.enterPhase(5, false));
  }
  missBranch() {
    const ui = this.ui;
    this.flags.line = 'miss'; this.app.saveEnding('miss');
    this.clearCast();
    const sk = buildSoldier('sakata');
    sk.root.position.set(L.hq.x + 0.6, 0, L.hq.z + 4.4); sk.root.rotation.y = 0.15;
    poseSoldier(sk, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 });
    sk.armR.rotation.x = 2.5; sk.armL.rotation.x = 2.5; sk.armR.rotation.z = 0.35; sk.armL.rotation.z = -0.35;
    this.scene.add(sk.root); this.cast.push(sk);
    this.cutCam = { px: L.hq.x + 2.5, py: 2.3, pz: L.hq.z + 8.5, lx: L.hq.x + 0.6, ly: 1.7, lz: L.hq.z + 4.4 };
    ui.stamp('两发都打偏了！', 1.6, 'red');
    this.audio.voice('bt_youyisi');
    ui.say('坂田信哲', '我倒要拭目以待，看看他到底干什么。很有意思。', { now: true, foe: true, dur: 5.8 });
    const h = this.hero;
    this.playScene(13.0, [
      [6.2, () => {
        this.cutCam = { px: h.x - 1.4, py: 1.9, pz: h.z - 3.6, lx: h.x, ly: 1.5, lz: h.z };
        this.audio.voice('cy_daomei');
        ui.say('李云龙', '娘的，今天是撞上了，算它倒霉！', { now: true, dur: 3.5 });
        ui.say('李云龙', '坂田这个兔崽子，我非砸碎了它不可！', { dur: 3.1 });
      }],
    ], () => { this.clearCast(); this.enterPhase(5, false); });
  }

  // 第五阶段：打进指挥部（或干掉坂田）以后从山口突围
  updateBreakout(dt) {
    const h = this.hero, ui = this.ui, b = this.boss;
    if (this.sub === 'charge' && h.alive && dist2(h.x, h.z, L.hq.x, L.hq.z) < 11 * 11) {
      this.sub = 'hold'; this.addScore(800);
      this.vo('cy_dayu', 16.1, () => {
        ui.say('李云龙', '大彪，看看这一网捞了多少大鱼！', { now: true, dur: 5.0 });
        ui.say('张大彪', '团长，还真捞着大鱼了：一个大佐，两个中佐，一个少佐——这肯定是坂田的指挥部！', { dur: 6.5 });
        ui.say('李云龙', '太好了！一炮就干掉了一个联队的指挥部！', { dur: 4.6 });
      });
      this.spawnWave(-46, -104, 4, 1, 'B', 12); this.spawnWave(32, -100, 4, 1, 'B', 12);
      this.after(16.6, () => { if (this.phase === 5 && !this.over) this.beginBreakout(); });
    } else if (this.sub === 'boss') {
      if (b && b.alive && !this.flags.taunt && h.alive && dist2(h.x, h.z, b.x, b.z) < 36 * 36) {
        this.flags.taunt = 1;
        this.vo('bt_fantuji', 9.4, () => ui.say('坂田信哲', '我们的对手到底要干什么？凭他那点兵力，就敢实施反突击……', { foe: true, now: true, dur: 9.4 }));
      }
      if (b && !b.alive && !this.flags.bossDown) {
        this.flags.bossDown = 1; this.addScore(3000);
        for (const e of this.enemies) if (e.alive && e.group === 'guard') this.killUnit(e, true);
        ui.stamp('坂田完了！', 1.8);
        ui.say('李云龙', '坂田这个兔崽子，总算砸碎了！', { now: true, dur: 2.6 });
        this.after(2.8, () => { if (this.phase === 5 && !this.over) this.beginBreakout(); });
      }
    } else if (this.sub === 'out') {
      this.outT -= dt;
      if (this.outT <= 0) {
        this.outT = 9;
        if (this.enemies.filter((e) => e.alive).length < 7) {
          const sx = this.flags.outSide ? 1 : -1; this.flags.outSide = !this.flags.outSide;
          this.spawnWave(sx > 0 ? 44 : -44, clamp(h.z + 8, -134, -96), 3, 1, 'O', 10);
        }
      }
      if (h.alive && dist2(h.x, h.z, L.out.x, L.out.z) < 6 * 6) this.victory();
    }
  }
  beginBreakout() {
    const ui = this.ui;
    this.sub = 'out'; this.outT = 3;
    this.vo('cy_tuweiba', 5.0, () => {
      ui.say('张大彪', '团长，突围吧！', { now: true, dur: 1.4 });
      ui.say('李云龙', '继续攻击，打出去！冲啊！', { dur: 3.6 });
    });
    ui.stamp('打出去！', 1.4);
    this.spawnMed(8, -130);
  }
  victory() {
    const ui = this.ui, p = L.chu, y = this.world.chuY;
    this.flags.won = 1;
    this.addScore(2500);
    for (const e of this.enemies) if (e.alive) this.killUnit(e, true);
    this.bullets.length = 0; this.fx.clearWarnings(); this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0;
    if (this.cannon.manned) this.leaveCannon();
    for (const al of this.allies) { al.hold = false; al.cheer = 0.01; }
    this.audio.play('win');
    ui.stamp('突出去了！', 2.2);
    this.spawnChu();
    this.cutCam = { px: L.out.x + 3, py: 3.2, pz: L.out.z - 7, lx: L.out.x, ly: 1.5, lz: L.out.z + 4 };
    this.playScene(14.6, [
      [2.4, () => {
        this.cutCam = this.chuCam();
        this.audio.voice('cy_piaoliang');
        ui.say('楚云飞', '干得漂亮！这是八路军哪支部队？指挥官是谁？', { now: true, dur: 6.3 });
        ui.say('358团参谋', '是八路军三八六旅新一团，团长叫李云龙。', { dur: 4.6 });
        ui.say('楚云飞', '李云龙……', { dur: 1.4 });
      }],
    ], () => this.finish(true));
  }

  finish(win) {
    if (this.over) return;
    this.over = true;
    const s = this.stats, hit = this.flags.line === 'hit';
    if (win) this.addScore(Math.max(0, 3000 - Math.round(this.t) * 4));
    const score = Math.max(0, this.score - s.deaths * 300 - s.retries * 300);
    const rank = score >= 26000 ? '亮剑团长' : score >= 21000 ? '新一团的老兵' : score >= 16000 ? '合格的突击排长' : '炊事班长';
    const quote = win
      ? (hit ? '原作结局：柱子的炮弹端掉了坂田联队的指挥部，新一团从正面突出重围。两发都打偏的话，就得冲上去亲手对付坂田。' : '改写结局：两发炮弹都没打中，新一团硬冲上去干掉了坂田。原作里柱子的炮弹端了指挥部——下次瞄准记得风往右刮。')
        + '<br>要是打得过瘾，回 B 站给视频点个三连，就当给新一团发军饷了。'
      : '李云龙：“胜败乃兵家常事，重整队伍，再来！”';
    this.app.onResult({
      win, rank, quote, score, demo: s.demo, ending: this.flags.line || '', title: win && !hit ? '坂田完了，苍云岭突出去了！' : '',
      rows: [
        ...(this.flags.line ? [['结局', hit ? (s.hitShot ? '第' + cn(s.hitShot) + '发炮弹打掉指挥部（原作）' : '炮弹打掉指挥部（原作）') : '炮弹打偏，手刃坂田（改写）']] : []),
        ['用时', fmtTime(this.t)], ['歼敌', s.kills], ['干掉精锐', s.elites], ['抓舌头', s.tongueFail ? '打死 ' + s.tongueFail + ' 个才抓到活的' : '一次抓活'],
        ['炮组重整', s.retries], ['拼刀成功', s.clash], ['骑兵连出击', s.cav], ['阵亡', s.deaths], ['受击', s.hurt], ['爆头', s.heads],
        ['规则', (this.app.get('lives') === 'inf' ? '无限命' : '经典 3 命') + ' · ' + ({ std: '标准', easy: '宽松', one: '一发' }[this.app.get('armor')])],
      ],
    });
  }
}
