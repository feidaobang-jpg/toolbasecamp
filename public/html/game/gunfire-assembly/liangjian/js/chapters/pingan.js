// 第三章「平安县城 · 开炮」：扫清城外、拉炮上阵、开炮（城楼上的秀芹与双结局）、打进县城、决战山本一木
import * as THREE from '../../vendor/three.module.js';
import { TAU, DEG, clamp, lerp, damp, angDiff, angStep, fwdX, fwdZ, rightX, rightZ, yawTo, dist, dist2, rand, pick, reseed, segPointD2, segRect, fmtTime } from '../util.js';
import { resolveCircle, groundAt, pointBlocked, losBlocked } from '../world-kit.js';
import { buildWorld, L } from './pingan-world.js';
import { MAT, buildSoldier, poseSoldier, muzzleWorld, setSoldierMat, buildCannon, buildMG, buildRider, buildViewGun, buildBroadsword, buildMedkit, buildCrate } from '../models.js';
import { Geo } from '../geo.js';
import { Game } from '../game.js';
import { DEF, wakeGroup } from '../ai.js';
import { spawnPhase, updateBoss } from './pingan-ai.js';

export const INFO = {
  id: 'pingan', num: 3, name: '平安县城', title: '攻打平安县城',
  blurb: '你是李云龙：带独立团扫清城外，把意大利炮拉上来轰开城门；山本把秀芹押上城楼——按原作开炮，还是冲进去救人；再打进县城会会山本一木。',
  seal: '独立团<br>重做版', loading: '亮剑 · 攻打平安县城', bossName: '山本一木', aide: '和尚', winTitle: '平安县城，拿下了！', loseTitle: '攻城受挫',
  phases: ['', '扫清城外', '拉炮上阵', '开炮！', '打进县城', '决战山本'],
};
const SIEGE_POSTS = [[-9, 24.6], [9, 24.6], [-12.5, 27], [12.5, 27], [-6.5, 29.5], [7, 30.5]];
const ESCORT = [[-3.6, -1.5], [3.6, -1.5], [0, 5]];

export class PinganGame extends Game {
  info() { return INFO; }
  buildWorld(scene) { return buildWorld(scene); }
  chapterProps() {
    const s = this.scene;
    // 守备队部大门
    const dg = new Geo();
    for (const sx of [-1, 1]) { dg.box(3.4, 3.8, 0.3, sx * 1.75, 1.9, 0, 0x5a2a1e); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) dg.box(0.14, 0.14, 0.1, sx * (0.6 + c * 0.9), 0.8 + r * 1.1, 0.18, 0xc9a646, 0, 0, 0, 0); }
    this.hqDoor = dg.build(MAT.vc); this.hqDoor.position.set(0, 0, L.hqGateZ); s.add(this.hqDoor);
    this.hqDoorCol = { x0: -3.5, x1: 3.5, z0: L.hqGateZ - 0.4, z1: L.hqGateZ + 0.4, h: 4, y0: 0, tag: 'hqdoor', on: true };
    this.world.colliders.push(this.hqDoorCol);
  }
  clearChapter() { this.finaleShot = false; this.xq = null; }
  clearCast() { super.clearCast(); this.xq = null; }
  resetChapter(startPhase) {
    const a = this.app;
    // 从第四、五阶段直接开局时沿用上次打出的结局（没打过按原作：城楼已塌）
    this.flags.ending = startPhase >= 4 ? (a.ending() === 'rescue' ? 'rescue' : 'classic') : '';
    this.setGate(startPhase < 4); this.setTower(startPhase < 4 || this.flags.ending === 'rescue');
    for (const b of this.world.bunkers) this.setBunker(b, startPhase < 4);
    this.world.flagEnemy.visible = true; this.world.flagRed.visible = false;
    this.setHqDoor(true);
  }
  startPos() { return L.start; }
  startWeapon(startPhase) { return startPhase >= 5 ? 'lmg' : 'pistol'; }
  allyRoster() { return [['dabiao', '张大彪'], ['monk', '和尚'], ['ally'], ['ally'], ['ally'], ['ally']]; }
  resetGun(startPhase) {
    const c = this.cannon;
    c.placed = startPhase >= 3; c.visible = startPhase >= 2;
    c.x = c.placed ? L.firePos.x : L.cannonStart.x; c.z = c.placed ? L.firePos.z : L.cannonStart.z;
  }
  ambientChapter() {
    if (!this.world.tower.alive && rand() < 0.5) this.fx.smokePuff(rand(-6, 6), 10.5, -20 + rand(-2, 2), 1.6, 0x2e2a28);
  }
  heroBounds(h) {
    // 城楼没塌之前不放人进门洞，免得提前跑进空城；只有城楼抉择时放行（冲进去救秀芹）
    if (this.phase < 4 && !(this.flags.choice && !this.flags.ending) && h.z < L.wallZ1 + 0.7 && Math.abs(h.x) < L.gateHalf + 0.6) {
      h.z = L.wallZ1 + 0.7;
      if (this.t - (this.flags.gateTip || -9) > 4) { this.flags.gateTip = this.t; this.ui.toast('城楼上的火力封着门洞，先把城楼轰塌再进城', 2.6); }
    }
  }
  gunUsable() { return this.phase === 3; }
  mgSpots() { return [['A', L.nestA], ['B', L.nestB], ['S', L.streetNest]]; }
  // 城墙机枪堡：正面沙袋顶和顶棚之间那道缝
  bunkerSlit(b) { return { x: b.x, y: L.wallH + 2.42, z: b.z + 0.65, w: 3.8, h: 0.34, yaw: Math.PI }; }
  gunAimInfo(pre) {
    const c = this.cannon;
    const choice = this.flags.choice && !this.flags.ending;
    const want = choice ? pre.type === 'tower' : !this.flags.finale && (pre.type === 'bunker' || pre.type === 'gate');
    const col = want ? (choice ? 0xff6a55 : 0x7dff6a) : 0xffd84a;
    const name = { bunker: '机枪堡', gate: '城门', tower: choice ? '城楼（秀芹在上面）' : '城楼', ground: '地面', solid: pre.wall ? '城墙' : pre.z < -23 ? '城内房屋' : '掩体' }[pre.type];
    return [`仰角 <b>${Math.round(c.elev / DEG)}°</b>　落点 <b>${name}</b>　炮弹 <b>${c.shells}</b>${c.reload > 0 ? '　装填中…' : ''}`, want, col];
  }
  gunTargetHit(x, y, z) {
    const w = this.world;
    for (const b of w.bunkers) { if (b.alive) { const q = b.box; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y > q.y0 && y < q.y1) return { type: 'bunker', ref: b }; } }
    if (w.tower.alive) { const q = w.tower.box; if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y > q.y0 && y < q.y1) return { type: 'tower' }; }
    if (w.gate.alive && Math.abs(x) < L.gateHalf && z < L.wallZ1 + 0.1 && z > L.wallZ1 - 1.2 && y < L.gateH) return { type: 'gate' };
    return null;
  }
  gunFireIntercept() {
    const c = this.cannon;
    // 抉择时朝城楼开炮：先进“开炮”过场，过场结尾才真正出膛
    if (this.flags.choice && !this.flags.ending && this.simShell(c.aimYaw, c.elev, false).type === 'tower') { this.openFireScene(); return true; }
    return false;
  }
  onGunFired() {
    const ui = this.ui, finale = !!this.finaleShot;
    if (!finale) this.audio.voice(this.stats.shells % 2 ? 'kaipao' : 'geiwohong');   // 原声两句轮着来：给我开炮 / 给我轰
    ui.stamp(finale ? '开炮！！！' : '开炮！', finale ? 2.0 : 1.0, finale ? 'red' : '');
    if (this.stats.shells === 1) ui.say('李云龙', '给我开炮！', { now: true });
  }
  onShellImpact(hit, x, y, z, kills) {
    const w = this.world, ui = this.ui;
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
      if (this.finaleShot) { this.finaleShot = false; this.collapseTower(); }
      else if (!this.flags.finale) { this.fx.debris(x, y, z, 12, [0x7a2a1e, 0x3c3f46], 8, 0.5); ui.toast('城楼够结实：先敲掉两个机枪堡、轰开城门', 2.6); }
    }
    if ((kills >= 3 || (direct && !this.flags.geniusOnce)) && (this.t - (this.flags.geniusT || -99) > 10)) {
      this.flags.geniusT = this.t; this.flags.geniusOnce = 1; this.stats.genius++; this.addScore(500);
      ui.say('李云龙', '你他娘的还真是个天才！', { now: true });
      this.audio.voice('tiancai');
    }
  }
  gunInvulnerable() { return !!this.flags.towerDown; }
  gunExposed() { return this.phase <= 3; }
  gunTargetable(u) { const c = this.cannon; return c.visible && c.alive && this.phase <= 3 && this.phase >= 2 && (u.wantCannon || u.y > 2); }
  gunBar() { return this.phase === 2 || this.phase === 3 ? this.cannon.hp / this.cannon.maxHp : null; }
  respawnPoint() {
    const p = this.phase, c = this.cannon;
    let x = L.start.x, z = L.start.z;
    if (p === 1) { if (this.flags.nA) { x = L.nestA.x; z = L.nestA.z + 7; } }
    else if (p === 2) { x = c.x + 2; z = c.z + 7; }
    else if (p === 3) { x = 4; z = 31; }
    else if (p === 4) { x = 0; z = this.flags.s2 ? -61 : this.flags.s1 ? -37 : -12; }
    else if (p === 5) { x = 0; z = -85.5; }
    return [x, z];
  }
  advanceFormation() { return this.phase === 1; }
  chapterLabels(lab) {
    const c = this.cannon, ui = this.ui;
    if (c.visible && this.phase <= 3) lab('erying', '二营长', { x: c.x + (c.placed ? -1.5 : -1.25), z: c.z + (c.placed ? 1.3 : 1.2), y: 0, alive: true }, 2.2, false); else ui.label('erying', '二营长', 0, 0, false, false);
  }
  updateBossUnit(u, dt) { updateBoss(this, u, dt); }
  // 城墙上的掷弹筒：拉炮时砸炮组，炮击时砸炮位或主角
  mortarAim(u) {
    const c = this.cannon, h = this.hero;
    let tx, tz;
    if (this.phase === 2) { if (c.z > 54 || c.placed) return null; tx = c.x + rand(-1.5, 1.5); tz = c.z + rand(-1, 2); }
    else if (this.phase === 3) {
      if (!c.manned && h.alive && rand() < 0.55 && h.z < 60) { tx = h.x + h.vx * 0.8; tz = h.z + h.vz * 0.8; }
      else { const a = rand(TAU), r = rand(2.5, 8); tx = c.x + Math.cos(a) * r; tz = c.z + 1 + Math.sin(a) * r; }
    } else return null;
    return [tx, tz];
  }
  allyPost(u) {
    if (this.phase === 3) return [SIEGE_POSTS[u.slot][0], SIEGE_POSTS[u.slot][1], true];
    if (this.phase === 2 && u.slot >= 3 && this.cannon.visible) { const e = ESCORT[u.slot - 3]; return [this.cannon.x + e[0], this.cannon.z + e[1], false]; }
    return null;
  }
  formationYaw() { return this.phase >= 4 ? 0 : (this.advYaw === undefined ? 0 : this.advYaw); }
  allyClamp(u, sx) { return this.phase >= 4 && this.hero.z < -23 ? clamp(sx, -6.2, 6.2) : sx; }
  cheerPoint() { return L.flag; }
  allyEngageWall() { return this.phase === 3; }

  setGate(alive) { const g = this.world.gate; g.alive = alive; g.hp = alive ? 3 : 0; g.mesh.visible = alive; g.col.on = alive; }
  setTower(alive) { const t = this.world.tower; t.alive = alive; t.hp = 3; t.group.visible = alive; t.ruin.visible = !alive; }
  setBunker(b, alive) { b.alive = alive; b.mesh.visible = alive; b.ruin.visible = !alive; b.cd = 3; b.burst = 0; }
  setHqDoor(closed) { this.hqDoor.visible = closed; this.hqDoorCol.on = closed; }

  // ---------- 阶段 ----------
  enterPhase(n, fresh) {
    const h = this.hero, c = this.cannon, ui = this.ui;
    this.phase = n; this.phaseT = 0; this.sub = 0;
    if (h) h.mg = null;
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
      this.after(4.5, () => ui.toast(this.app.isTouch() ? '准星对着敌人开火，靠近会吸附，打头加倍；机枪阵地正面打不穿，绕到侧面、跳进去，或者扔手榴弹、叫骑兵连。打掉机枪手，机枪就归你用' : '准星对着敌人开火，靠近会吸附，打头加倍；机枪阵地正面打不穿——绕到侧面、跳进去，或者用手榴弹（G）。打掉机枪手，机枪就归你用（F）', 7));
    } else if (n === 2) {
      if (fresh) this.place(h, 2, 84);
      c.visible = true; c.placed = false; c.x = L.cannonStart.x; c.z = L.cannonStart.z; c.hp = c.maxHp;
      // 原声一整段：二营长——到——你他娘的意大利炮呢，给我拉来——团长——拉来。字幕时长跟着原声走
      this.audio.voice('yidalipao');
      ui.say('李云龙', '二营长！', { now: true, dur: 1.2 });
      ui.say('二营长', '到！', { dur: 1.1 });
      ui.say('李云龙', '你他娘的意大利炮呢？给我拉来！', { dur: 3.0 });
      ui.say('二营长', '团长……', { dur: 1.9 });
      ui.say('李云龙', '拉来！', { dur: 1.6 });
      this.after(2.3, () => ui.stamp('意大利炮呢？', 1.8));
      this.after(5, () => ui.toast('护着炮往前推：鬼子靠近炮组就会停下，先把他们打掉', 5));
    } else if (n === 3) {
      if (fresh) this.place(h, 3.5, 31);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z; c.hp = Math.min(c.maxHp, c.hp + 12); c.shells = 8;
      for (const e of this.enemies) if (e.type === 'wall' || e.type === 'mortar') e.active = true;
      ui.say('二营长', '团长，炮架好了！', { now: true, dur: 1.9 });
      ui.say('李云龙', '给我打！直接瞄准了，轰他娘的！', { dur: 3.2 });
      this.after(1.9, () => { if (this.phase === 3) this.audio.voice('hong'); });
    } else if (n === 4) {
      if (fresh) this.place(h, 0, -11);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z;
      this.audio.play('bugle');
      this.audio.voice('chong');
      if (this.flags.ending === 'rescue') { ui.say('李云龙', '弟兄们，冲啊！把秀芹抢回来！', { now: true }); ui.say('张大彪', '一营跟我上，别让山本跑了！'); }
      else { ui.say('李云龙', '弟兄们，冲啊！给秀芹报仇！', { now: true }); ui.say('张大彪', '一营跟我上！'); }
      ui.stamp('冲锋号响了！', 1.6);
    } else if (n === 5) {
      if (fresh) this.place(h, 0, -85.5);
      this.setHqDoor(true);
      this.spawnMed(-14.5, -85); this.spawnMed(14.5, -100);
      c.visible = true; c.placed = true; c.x = L.firePos.x; c.z = L.firePos.z;
      // 只带三名战友进院子
      this.allies.forEach((al, i) => { if (i < 3) this.place(al, [-11, 11, -13.5][i], [-85, -85, -89][i]); else { this.place(al, -4 + (i - 3) * 4, -77); al.hold = true; } });
      const rescue = this.flags.ending === 'rescue';
      if (rescue) this.placeXiuqin();
      this.cut = 5.6; this.cutCam = { px: 0, py: 4.2, pz: -90, lx: 0, ly: 2.0, lz: -100 };
      ui.say('山本一木', rescue ? '李云龙，再往前一步，你的女人就没命了。' : '李云龙，你连自己的女人都敢轰。', { now: true, foe: true, dur: 2.2 });
      ui.say('李云龙', '狭路相逢——勇者胜！', { dur: 3.3 });
      this.after(2.2, () => this.audio.voice('yongzhesheng'));
      this.after(3.9, () => { ui.stamp('勇者胜！', 1.5); this.audio.play('drum'); });
      this.after(5.8, () => ui.toast('山本拔刀突进时地上有红线：侧移或跳起来躲开，或者用亮剑和他拼刀！', 6));
    }
    this.syncCannonModel(0);
  }

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
      if (this.flags.ending) return [this.flags.ending === 'rescue' ? '第三阶段 · <b>冲进去，救秀芹！</b>' : '第三阶段 · <b>开炮！</b>', null];
      if (this.flags.choice) return ['第三阶段 · <b>朝城楼开炮</b>，或者<b>冲进城门救秀芹</b>', c.manned ? null : { x: 0, y: 3.2, z: L.wallZ1 + 1.5, text: '冲进去救人' }];
      if (this.flags.finale) return ['第三阶段 · <b>山本把秀芹押上了城楼</b>', null];
      return [`第三阶段 · 操炮轰掉 机枪堡 <b>${bk}/2</b> · 城门 <b>${3 - g.hp}/3</b>`, c.manned ? null : { x: c.x, y: 2.8, z: c.z, text: '操炮' }];
    }
    if (p === 4) {
      const n = this.enemies.filter((e) => e.alive && e.group.startsWith('S')).length;
      if (n > 0) return [`第四阶段 · 肃清街上的鬼子 <b>剩 ${n}</b>`, this.nearestEnemyMarker()];
      return ['第四阶段 · <b>冲进守备队部</b>', { x: 0, y: 3, z: L.hqGateZ - 2, text: '守备队部' }];
    }
    return [this.flags.ending === 'rescue' ? '决战 · <b>击败山本一木，救下秀芹</b>' : '决战 · <b>击败山本一木</b>', null];
  }

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

  // 第三阶段：炮击
  updateSiege(dt) {
    const c = this.cannon, ui = this.ui, w = this.world;
    // 城墙机枪堡开火
    for (const b of w.bunkers) {
      if (!b.alive) continue;
      if (!b.manned) { b.burst = 0; continue; }   // 机枪手倒了，下一个还没补上来
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
    if (!this.scn) this.sortieT = (this.sortieT || 9) - dt;
    if (this.sortieT <= 0 && !this.flags.towerDown && !this.flags.ending) {
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
      this.after(1.6, () => { if (this.phase === 3 && !this.over) this.hostageScene(); });
    }
    if (this.flags.choice && !this.flags.ending) this.updateChoice(dt);
    if (!c.manned && !this.flags.manTip && this.phaseT > 6) { this.flags.manTip = 1; ui.toast(this.app.isTouch() ? '走到意大利炮旁边，点“操炮”' : '走到意大利炮旁边按 F 操炮', 5); }
  }
  // 山本押着秀芹站在城楼前檐下；两侧的卫兵是真敌人，打得着
  spawnCast() {
    this.clearCast();
    const y = L.towerY0, z = L.wallZ1 + 0.6;
    const mk = (look, x, dz) => { const m = buildSoldier(look); m.root.position.set(x, y, z + dz); m.root.rotation.y = Math.PI; this.scene.add(m.root); this.cast.push(m); return m; };
    const xq = mk('xiuqin', -0.3, 0.12), ym = mk('boss', 0.5, -0.42);
    this.poseTied(xq);
    poseSoldier(ym, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 });
    ym.armR.rotation.x = 1.75; ym.armR.rotation.z = -0.55;     // 刀横在她肩前
    for (const sx of [-1, 1]) { const e = this.addUnit('enemy', 'wall', sx * 3.1, z - 0.05, { y, hold: true, group: 'tower' }); e.active = true; e.stT = 2.5; }
  }
  hostageScene() {
    const ui = this.ui, h = this.hero;
    // 贴着门洞站的人先退后两步，剧情一结束放行时不至于一抬脚就误入城门
    if (h.alive && h.z < L.wallZ1 + 2.5 && Math.abs(h.x) < L.gateHalf + 1) this.place(h, h.x, L.wallZ1 + 2.5);
    this.spawnCast();
    this.bullets = this.bullets.filter((b) => b.team === 0);
    this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0; this.fx.clearWarnings();
    const tower = { px: 1.8, py: 11.7, pz: -9.2, lx: 0.1, ly: 11.0, lz: -16.4 };
    const face = () => ({ px: h.x - 1.3, py: 1.9, pz: h.z - 3.4, lx: h.x, ly: 1.55, lz: h.z });
    this.cutCam = tower;
    ui.say('山本一木', '楼下的八路，别打啦！你们往楼上看——这个女人，你们认识吗？', { now: true, foe: true, dur: 9.1 });
    this.audio.voice('shanben_bieda');
    this.playScene(23.4, [
      [9.4, () => { this.cutCam = face(); ui.say('李云龙', '山本！你他娘的算什么军人，拿一个女人做什么文章！', { now: true, dur: 6.0 }); this.audio.voice('suansha'); }],
      [15.8, () => { this.cutCam = { px: 0.6, py: 11.5, pz: -11.8, lx: -0.3, ly: 11.0, lz: -16.3 }; ui.say('秀芹', '李云龙，你开炮啊！', { now: true, dur: 2.4 }); this.audio.voice('xq_kaipao'); ui.stamp('你开炮啊！', 1.6, 'red'); }],
      [18.6, () => { this.cutCam = face(); ui.say('张大彪', '别开炮！团长，别开炮！让我带兄弟们再冲一次吧！', { now: true, dur: 4.4 }); this.audio.voice('bie_kaipao'); }],
    ], () => this.beginChoice());
  }
  beginChoice() {
    this.flags.choice = 1; this.choiceT = 5; this.choiceN = 0;
    this.ui.toast(this.app.isTouch() ? '两条路：操炮朝城楼开炮（原作结局）；或者离开炮位，从城门冲进去救秀芹（改写结局）' : '两条路：操炮朝城楼开炮（原作结局）；或者离开炮位（F），从城门冲进去救秀芹（改写结局）', 9);
  }
  updateChoice(dt) {
    const h = this.hero;
    // 人进了城门洞：改写结局
    if (h.alive && !this.cannon.manned && Math.abs(h.x) < L.gateHalf && h.z < L.wallZ1 - 0.4) { this.rescueBranch(); return; }
    if (this.cut > 0) return;
    // 没拿定主意时，秀芹在城楼上一句句催（原声）
    this.choiceT -= dt;
    if (this.choiceT > 0) return;
    const lines = [['xq_zhi', '我秀芹一个，换这么多小日本鬼子，值！团长，开炮！', 7.6], ['xq_xiabeizi', '我生是你的人，死是你的鬼。你记住，我秀芹下辈子还嫁给你！', 9.6], ['xq_qiaobuqi', '你开炮啊！别让我瞧不起你！', 4.5], ['xq_kaipao', '李云龙，你开炮啊！', 2.2]];
    const l = lines[Math.min(this.choiceN, 3)];
    this.choiceN++;
    this.audio.voice(l[0]); this.ui.say('秀芹', l[1], { now: true, dur: l[2] });
    this.choiceT = l[2] + (this.choiceN < 4 ? 5 : 13);
  }
  // 原作结局：朝城楼开炮
  openFireScene() {
    const ui = this.ui, h = this.hero, c = this.cannon, aim = [c.aimYaw, c.elev];
    this.flags.ending = 'classic'; this.app.saveEnding('classic');
    this.audio.stopVoices();
    this.cutCam = { px: h.x - 1.3, py: 1.9, pz: h.z - 3.4, lx: h.x, ly: 1.55, lz: h.z };
    ui.say('李云龙', '我李云龙不会拿自己士兵的生命，去换自己的老婆！', { now: true, dur: 4.5 });
    this.audio.voice('li_bushi');
    // 原声“开炮！开炮！开炮！”之后约 9.6 秒是原片的炮响，炮弹出膛的时间按它排
    this.playScene(13.2, [
      [4.7, () => { this.cutCam = { px: 0.6, py: 11.5, pz: -11.2, lx: -0.2, ly: 11.0, lz: -16.3 }; this.audio.voice('kaipao3'); ui.say('李云龙', '开炮！', { now: true, dur: 2.6 }); ui.stamp('开炮！', 1.2, 'red'); }],
      [7.7, () => { this.cutCam = { px: c.x + 4.2, py: 2.6, pz: c.z + 5.2, lx: c.x, ly: 1.6, lz: c.z - 6 }; ui.say('李云龙', '开炮！！', { now: true, dur: 2.6 }); ui.stamp('开炮！！', 1.2, 'red'); }],
      [10.6, () => { ui.say('李云龙', '开炮！！！', { now: true, dur: 2.6 }); }],
    ], () => {
      // 过场里镜头被拿走，摇杆 / 鼠标还可能动到炮口：出膛前恢复下令那一刻的瞄准，保证这一炮落在城楼上
      c.aimYaw = this.cam.yaw = aim[0]; c.elev = aim[1];
      this.finaleShot = true; if (c.shells <= 0) c.shells = 1; c.reload = 0; this.fireCannon();
    });
  }
  // 改写结局：不打城楼，冲进去救人
  rescueBranch() {
    const ui = this.ui;
    this.flags.ending = 'rescue'; this.app.saveEnding('rescue');
    this.audio.stopVoices();
    this.addScore(2500);
    this.clearCast();
    // 城墙上的鬼子跟着山本撤进城，不再从背后打冷枪
    for (const e of this.enemies) if (e.alive && (e.y > 2 || e.group === 'W')) { e.alive = false; e.deadT = 9; }
    this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0; this.fx.clearWarnings();
    this.bullets = this.bullets.filter((b) => b.team === 0);
    ui.stamp('冲进去，救秀芹！', 1.8);
    ui.say('山本一木', '八嘎！撤——把那个女人带回守备队部！', { now: true, foe: true });
    this.after(1.5, () => { if (!this.over && this.phase === 3) this.enterPhase(4, false); });
  }
  // 救人那条路的决战：秀芹被绑在院子最里头的木桩上（不是战斗单位，子弹和刀都伤不到她）
  placeXiuqin() {
    this.clearCast();
    const m = buildSoldier('xiuqin');
    m.root.position.set(9, 0, L.arena.z0 + 1.5); m.root.rotation.y = Math.PI;
    this.poseTied(m);
    const pg = new Geo(); pg.cyl(0.09, 2.3, 0, 1.15, 0.27, 0x5a3d26, 6, 1);
    m.root.add(pg.build(MAT.vc));
    this.scene.add(m.root); this.cast.push(m); this.xq = m;
  }
  freeXiuqin() {
    const old = this.xq; if (!old) return;
    const m = buildSoldier('xiuqinFree');
    m.root.position.set(old.root.position.x - 0.9, 0, old.root.position.z + 1.1); m.root.rotation.y = Math.PI * 0.82;
    poseSoldier(m, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 });
    old.torso.visible = old.armR.visible = old.armL.visible = old.legR.visible = old.legL.visible = false;   // 只留木桩
    this.scene.add(m.root); this.cast.push(m);
  }

  victory() {
    const ui = this.ui, w = this.world;
    this.flags.won = 1;
    this.addScore(DEF.boss.score);
    for (const e of this.enemies) if (e.alive) this.killUnit(e, true);
    this.bullets.length = 0; this.fx.clearWarnings(); this.mortars.length = 0;
    const rescue = this.flags.ending === 'rescue', d = rescue ? 3.2 : 0;
    const flagCam = { px: 8, py: 3.6, pz: -86.5, lx: L.flag.x + 2, ly: 5.6, lz: L.flag.z };
    this.cut = 6.2 + d; this.cutCam = flagCam;
    this.setHqDoor(false);
    for (const al of this.allies) { al.hold = false; al.cheer = 0.01; }
    this.after(1.2 + d, () => { w.flagEnemy.visible = false; w.flagRed.visible = true; this.audio.play('win'); ui.stamp('拿下平安县城！', 2.4); });
    if (rescue) {
      // 先给秀芹松绑，再升旗
      this.freeXiuqin();
      this.cutCam = { px: 3.5, py: 2.3, pz: L.arena.z0 + 7.5, lx: 8.4, ly: 1.4, lz: L.arena.z0 + 2 };
      this.after(d, () => { this.cutCam = flagCam; });
      ui.say('李云龙', '秀芹！没事了，山本完了。', { now: true, dur: 2.6 });
      ui.say('秀芹', '云龙！我就知道你会来！', { dur: 2.6 });
      ui.say('李云龙', '平安县城，拿下了！', { dur: 2 });
    } else {
      ui.say('李云龙', '山本完了。秀芹，平安县城拿下了……', { now: true, dur: 3.4 });
    }
    ui.say('旅长', '李云龙！你把晋西北搅成了一锅粥！', { dur: 3 });
    this.after(6.4 + d, () => this.finish(true));
  }

  finish(win) {
    if (this.over) return;
    this.over = true;
    const s = this.stats, h = this.hero;
    if (win) { this.addScore(Math.max(0, 3000 - Math.round(this.t) * 5)); this.addScore(this.cannon.shells * 100); }
    const score = Math.max(0, this.score - s.deaths * 300 - s.retries * 300);
    const rank = score >= 22000 ? '晋西北一霸' : score >= 18500 ? '亮剑团长' : score >= 15000 ? '合格的二营长' : '炊事班长';
    const rescue = this.flags.ending === 'rescue';
    const quote = win
      ? (rescue ? '改写结局：没朝城楼开炮，冲进去把秀芹抢了回来。原作里那一炮是李云龙亲口下的令——想看，下次在城门外操炮瞄准城楼。' : '原作结局：李云龙下令朝城楼开炮，秀芹牺牲。还有另一条路——城门轰开后离开炮位，带人冲进去。')
        + '<br>要是打得过瘾，回 B 站给视频点个三连，就当给独立团发军饷了。'
      : '李云龙：“胜败乃兵家常事，重整队伍，再来！”';
    this.app.onResult({
      win, rank, quote, score, demo: s.demo, ending: this.flags.ending || '', title: rescue ? '平安县城拿下了，秀芹也救回来了！' : '',
      rows: [...(this.flags.ending ? [['结局', rescue ? '救下秀芹（改写）' : '城楼开炮（原作）']] : []), ['用时', fmtTime(this.t)], ['歼敌', s.kills], ['干掉精锐', s.elites], ['开炮', s.shells + ' 发'], ['“天才”炮击', s.genius], ['拼刀成功', s.clash], ['骑兵连出击', s.cav], ['缴获军火库', s.loot ? '是' : '否'], ['阵亡', s.deaths], ['受击', s.hurt], ['爆头', s.heads], ['规则', (this.app.get('lives') === 'inf' ? '无限命' : '经典 3 命') + ' · ' + ({ std: '标准', easy: '宽松', one: '一发' }[this.app.get('armor')])]],
    });
  }
  collapseTower() {
    const w = this.world, ui = this.ui, c = this.cannon;
    this.flags.towerDown = 1;
    this.setTower(false);
    this.clearCast();
    const zc = (L.wallZ0 + L.wallZ1) / 2;
    for (let i = 0; i < 5; i++) this.after(i * 0.16, () => { const px = rand(-7, 7); this.fx.explosion(px, 11 + rand(0, 6), zc + rand(-2, 2), 6, true); this.fx.debris(px, 13, zc, 16, [0x7a2a1e, 0x3c3f46, 0x33363c, 0x8e2f22, 0xa8a59c], 13, 0.9); });
    this.audio.play('collapse');
    this.addScore(1500);
    this.cut = 3.6; this.cutCam = { px: 14, py: 7, pz: 16, lx: 0, ly: 12, lz: -20 };
    for (const e of this.enemies) if (e.alive && (e.y > 2 || e.group === 'W')) this.killUnit(e, true);
    this.mortars.length = 0; this.fx.clearWarnings(); this.bullets = this.bullets.filter((b) => b.team === 0);
    ui.stamp('城楼塌了', 1.8);
    ui.say('二营长', '打中了……城楼塌了。', { now: true });
    ui.say('李云龙', '秀芹……全团都有，进城！一个也别放跑！');
    this.after(4.2, () => { if (c.manned) this.leaveCannon(); this.enterPhase(4, false); });
  }
}
