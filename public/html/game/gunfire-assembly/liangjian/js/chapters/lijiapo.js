// 第二章「李家坡」：七七二团强攻受挫、夜里挖交通壕、拂晓三千六百颗手榴弹、张大彪的突击队拼刺刀、活劈山崎
import * as THREE from '../../vendor/three.module.js';
import { TAU, clamp, lerp, damp, fwdX, fwdZ, yawTo, angDiff, dist, dist2, rand, pick, fmtTime } from '../util.js';
import { losBlocked } from '../world-kit.js';
import { buildWorld, L, hgt } from './lijiapo-world.js';
import { MAT, buildSoldier, poseSoldier, buildShovel } from '../models.js';
import { Game } from '../game.js';
import { spawnPhase, spawnYamazaki, updateYamazaki } from './lijiapo-ai.js';

export const INFO = {
  id: 'lijiapo', num: 2, name: '李家坡', title: '李家坡攻坚',
  blurb: '你是李云龙：七七二团攻了八次没拿下李家坡，独立团接手。先拔掉山脚的火力点，夜里顶着照明弹把交通壕挖上山坡，拂晓三千六百颗手榴弹砸进环形工事，带突击队拼刺刀，最后亲手和山崎拼刀。',
  seal: '独立团<br>重做版', loading: '亮剑 · 李家坡攻坚', bossName: '山崎', aide: '张大彪', winTitle: '李家坡拿下来了！', loseTitle: '攻击受挫',
  phases: ['', '强攻受挫', '挖交通壕', '手榴弹雨', '突击队', '决战山崎'],
};
// 各阶段的光：黄昏（强攻）、夜里（挖壕）、拂晓（手榴弹雨）、早上（突击、决战）。tint 是天空球的染色
const LIGHT = {
  dusk: { fog: 0xcdbfac, fogNear: 70, fogFar: 270, sky: 0xeadcc8, ground: 0x8a7a62, hemi: 0.95, sun: 0xffcf9a, sunI: 0.85, tint: 0xffe8d0 },
  night: { fog: 0x161c2a, fogNear: 28, fogFar: 150, sky: 0x5a6e98, ground: 0x1e1c24, hemi: 0.66, sun: 0x9fb4e0, sunI: 0.3, tint: 0x232d44 },
  dawn: { fog: 0x9e8c86, fogNear: 50, fogFar: 230, sky: 0xe0cbbd, ground: 0x5a4c48, hemi: 0.84, sun: 0xffc8a0, sunI: 0.62, tint: 0xf2c6b0 },
  day: { fog: 0xd4d0c6, fogNear: 70, fogFar: 290, sky: 0xf0ece4, ground: 0x8a7a62, hemi: 1.0, sun: 0xfff0d8, sunI: 0.95, tint: 0xffffff },
};
const COLOR_KEYS = ['fog', 'sky', 'ground', 'sun', 'tint'];
const GRENADES = 3600, PER_VOLLEY = 360, RAIN_T = 120;
const smooth = (k) => k * k * (3 - 2 * k);
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export class LijiapoGame extends Game {
  info() { return INFO; }
  env() { const l = LIGHT.dusk; return { fog: l.fog, fogNear: l.fogNear, fogFar: l.fogFar, sky: l.sky, ground: l.ground, hemi: l.hemi, sun: l.sun, sunI: l.sunI }; }
  buildWorld(scene) { return buildWorld(scene); }
  chapterProps() {
    // 七七二团冲锋的人（只是演出：冲到半坡被机枪压回来）
    this.actors = [];
    for (let i = 0; i < 10; i++) { const m = buildSoldier('ally'); m.root.visible = false; this.scene.add(m.root); this.actors.push({ m, st: 'idle', x: 0, z: 0, walk: rand(TAU), t: 0 }); }
    // 照明弹：两个点光源一直挂在场景里（亮度 0 时不显示），免得开关灯时材质重新编译
    this.flarePool = [0, 1].map(() => {
      const light = new THREE.PointLight(0xfff0c8, 0, 95, 1.1);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
      ball.visible = false; this.scene.add(light, ball);
      return { light, ball, on: false, t: 0 };
    });
    // 手榴弹雨的落点圈
    const rg = new THREE.RingGeometry(5.4, 6.2, 48); rg.rotateX(-Math.PI / 2);
    const dg = new THREE.CircleGeometry(5.4, 40); dg.rotateX(-Math.PI / 2);
    const mk = (g, op) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.markMesh = mk(rg, 0.9); const disc = mk(dg, 0.16); this.markMesh.add(disc); this.markDisc = disc;
    this.markMesh.renderOrder = 5; disc.renderOrder = 5; this.markMesh.visible = false; this.scene.add(this.markMesh);
    this.mark = { x: 0, z: 0, ok: false };
  }
  clearChapter() {
    this.markMesh.visible = false; this.digging = false;
    for (const f of this.flarePool) { f.on = false; f.ball.visible = false; f.light.intensity = 0; }
    this.lit = false;
  }
  resetChapter(startPhase) {
    const w = this.world;
    this.flags.eliteLine = 0;
    Object.assign(this.stats, { volleys: 0, deflect: 0, heroDug: 0, p2T: 0, p3T: 0, bunkerVolley: 0, bunkerHelp: 0, ports: 0, charges: 0 });
    this.grenades = GRENADES; this.volleyCd = 0; this.rainT = RAIN_T; this.digging = false; this.lit = false; this.flareT = 14; this.chargeT = 3;
    w.setDug(startPhase >= 3 ? w.trench.total : 0);
    for (const b of w.bunkers) { w.setBunker(b, startPhase <= 3); b.hp = 8; b.burst = 0; }
    for (const p of w.cp.ports) { p.alive = true; p.burst = 0; p.cd = rand(1, 2.5); }
    w.flag.visible = true;
    this.resetActors(startPhase === 1);
    this.lightTo(startPhase === 1 ? 'dusk' : startPhase === 2 ? 'night' : startPhase === 3 ? 'dawn' : 'day', 0);
  }
  startPos() { return L.start; }
  startWeapon() { return 'pistol'; }
  allyRoster() { return [['dabiao', '张大彪'], ['monk', '和尚'], ['ally'], ['ally'], ['ally'], ['ally']]; }
  titleCam(t, a) {
    this.camera.position.set(Math.sin(a) * 30 - 6, 10 + Math.sin(t * 0.1) * 2, 72 + Math.cos(a) * 6);
    this.camera.lookAt(0, 9, -12);
    this.moveSun(0, 20);
  }
  ambientChapter() {
    const p = this.camera.position;
    // 夜里飘点小雪，看得出天黑
    if (this.phase === 2) for (let i = 0; i < 3; i++) this.fx.spawn({ x: p.x + rand(-16, 16), y: p.y + rand(3, 9), z: p.z + rand(-16, 16), vx: rand(-0.4, 0.2), vy: -rand(1.0, 1.5), vz: rand(-0.3, 0.3), life: 6, s0: 0.06, s1: 0.04, c0: 0xdfe6f0, spin: rand(-2, 2) });
    for (const b of this.world.bunkers) if (!b.alive && rand() < 0.5) this.fx.smokePuff(b.x + rand(-2, 2), b.y + 1, b.z + rand(-1.5, 1.5), 1.3, 0x2e2a28);
    for (const q of this.world.cp.ports) if (!q.alive && rand() < 0.4) this.fx.smokePuff(q.x, q.y, q.z, 0.6, 0x2e2a28);
  }
  heroBounds(h) {
    const ph = this.phase;
    let lim = null, msg = '';
    if (ph === 1) { lim = 12; msg = '坡顶三个碉堡的机枪封着这面坡，冲上去就是送死！'; }
    else if (ph === 2) { lim = this.world.trench.pointAt(this.world.trench.dug).z - 6; msg = '再往上就是鬼子的机枪口：顺着交通壕一锹一锹挖上去'; }
    else if (ph === 3) { lim = -19; msg = '先把手榴弹扔出去，炸了碉堡再冲！'; }
    if (lim !== null && h.z < lim) {
      h.z = lim;
      if (this.t - (this.flags.boundTip || -9) > 4) { this.flags.boundTip = this.t; this.ui.toast(msg, 2.4); }
    }
  }
  mgSpots() { return [['PL', L.postL, 1], ['PR', L.postR, 1]]; }
  advanceFormation() { return this.phase === 1 || this.phase >= 4; }
  updateBossUnit(u, dt) { updateYamazaki(this, u, dt); }
  respawnPoint() {
    const p = this.phase, tr = this.world.trench;
    const tp = (t) => { const q = tr.pointAt(clamp(t, 0.5, tr.total)); return [q.x, q.z]; };
    if (p === 1) return this.flags.pl ? [6, 46] : [-18, 54];
    if (p === 2) return tp(tr.dug - 6);
    if (p === 3) return tp(tr.total - 4);
    if (p === 4) return this.flags.fClear ? [0, -32] : tp(tr.total - 2);
    return [0, -32];
  }
  allyPost(u) {
    const tr = this.world.trench, ph = this.phase;
    if (ph === 2) {
      // 两个挖壕的守在壕头，其余的沿着交通壕往后排
      const t = u.slot === 0 ? tr.dug - 2.2 : u.slot === 2 ? tr.dug - 3.4 : tr.dug - 5 - 2.4 * (u.slot === 1 ? 0 : u.slot - 2);
      const q = tr.pointAt(clamp(t, 0.3, tr.total)); return [q.x, q.z, true];
    }
    if (ph === 3) { const q = tr.pointAt(clamp(tr.total - 2 - 2.2 * u.slot, 0.3, tr.total)); return [q.x, q.z, true]; }
    return null;
  }
  mortarAim() {
    const h = this.hero, tr = this.world.trench;
    if (this.phase === 2) {
      // 夜里掷弹筒是摸黑打：四成不打（照明弹亮着时都打），免得挖壕时每三四秒就得躲一次
      if (!this.lit && rand() < 0.4) return null;
      const q = tr.pointAt(tr.dug);
      if (h.alive && dist2(h.x, h.z, q.x, q.z) < 12 * 12 && rand() < 0.5) return [h.x + h.vx * 0.6, h.z + h.vz * 0.6];
      return [q.x + rand(-2.5, 2.5), q.z + rand(-2.5, 2.5)];
    }
    if (this.phase === 3) { if (rand() < 0.5 && h.alive) return [h.x + h.vx * 0.6, h.z + h.vz * 0.6]; const q = tr.pointAt(tr.total - rand(1, 12)); return [q.x, q.z]; }
    return h.alive ? [h.x + h.vx * 0.8, h.z + h.vz * 0.8] : null;
  }

  // ---------- 交通壕：在壕里一大半子弹打在土埂上；壕头还没挖深，挡得少 ----------
  trenchState(x, z) {
    const tr = this.world.trench;
    if (tr.dug < 1) return null;
    const r = tr.locate(x, z, tr.dug);
    if (r.d > 1.05) return null;
    return this.phase >= 3 || tr.dug >= tr.total || r.t < tr.dug - 2.6 ? 'deep' : 'head';
  }
  heroCover() { const s = this.trenchState(this.hero.x, this.hero.z); return !!s && rand() < (s === 'deep' ? 0.85 : 0.45); }
  allyCover(a) { const s = this.trenchState(a.x, a.z); return !!s && rand() < (s === 'deep' ? 0.85 : 0.5); }

  // ---------- 光照：按阶段渐变（过场里天黑、天亮） ----------
  lightTo(name, dur) {
    const b = LIGHT[name];
    if (!dur) { this.lb = null; this.lightNow = Object.assign({}, b); this.applyLight(b); return; }
    this.lb = { a: Object.assign({}, this.lightNow || LIGHT.dusk), b, t: 0, d: dur };
  }
  applyLight(o) { this.setLight(o); this.world.sky.material.color.setHex(o.tint); }
  updateLight(dt) {
    const lb = this.lb;
    if (!lb) return;
    lb.t += dt;
    const k = smooth(Math.min(1, lb.t / lb.d)), o = {};
    for (const key in lb.b) o[key] = COLOR_KEYS.includes(key) ? _c1.setHex(lb.a[key]).lerp(_c2.setHex(lb.b[key]), k).getHex() : lerp(lb.a[key], lb.b[key], k);
    this.lightNow = o; this.applyLight(o);
    if (k >= 1) this.lb = null;
  }

  // ---------- 照明弹 ----------
  launchFlare(x0, z0, x1, z1, color = 0xfff0c8) {
    const f = this.flarePool.find((q) => !q.on) || this.flarePool[0];
    Object.assign(f, { on: true, t: 0, x0, z0, x1, z1, x: x0, z: z0, y: L.top + 1, dx: rand(-0.6, 0.6), trail: 0 });
    f.light.color.setHex(color); f.ball.material.color.setHex(color);
    this.sfxAt('flare', x0, z0, 1.2);
  }
  updateFlares(dt) {
    let lit = false;
    for (const f of this.flarePool) {
      if (!f.on) continue;
      f.t += dt;
      const T1 = 1.4, T2 = 11.5;
      if (f.t < T1) {
        const k = f.t / T1;
        f.x = lerp(f.x0, f.x1, k); f.z = lerp(f.z0, f.z1, k); f.y = L.top + 1 + 33 * (1 - (1 - k) * (1 - k));
        f.light.intensity = 0;
      } else {
        const k = (f.t - T1) / (T2 - T1);
        f.y = L.top + 34 - 20 * k; f.x += f.dx * dt;
        f.light.intensity = 2.8 * Math.min(1, (f.t - T1) * 3) * (k > 0.85 ? Math.max(0, 1 - k) / 0.15 : 1) * (0.9 + 0.1 * Math.sin(this.t * 23));
        if (k < 0.9) lit = true;
      }
      f.trail -= dt;
      if (f.trail <= 0) { f.trail = 0.08; this.fx.spawn({ soft: true, x: f.x, y: f.y, z: f.z, vx: rand(-0.2, 0.2), vy: rand(-0.3, 0.2), vz: rand(-0.2, 0.2), life: 1.8, s0: 0.3, s1: 1.2, c0: 0xb8b2a8, c1: 0x5a5650, spin: 0.4 }); }
      f.ball.visible = true; f.ball.position.set(f.x, f.y, f.z); f.light.position.set(f.x, f.y, f.z);
      if (f.t >= T2) { f.on = false; f.ball.visible = false; f.light.intensity = 0; }
    }
    this.lit = lit;
  }

  // ---------- 七七二团的冲锋（第一阶段的演出） ----------
  resetActors(show) {
    this.actors.forEach((a, i) => { a.st = 'idle'; a.x = -12 + i * 2.6 + rand(-0.4, 0.4); a.z = L.line772 - 1.3; a.t = 0; a.m.root.visible = show; a.m.root.rotation.x = 0; });
    this.poseActors(0);
  }
  updateActors(dt) {
    if (this.phase !== 1 || this.mode !== 'play') return;
    if (this.cut <= 0) this.chargeT -= dt;
    if (this.chargeT <= 0 && !this.flags.p1done) {
      this.chargeT = rand(22, 27); this.stats.charges++;
      for (const a of this.actors) if (a.st === 'idle') Object.assign(a, { st: 'run', tz: rand(6, 20), sp: rand(4.4, 5.4), fate: rand() < 0.5 ? 'down' : 'back', t: 0 });
      this.sfxAt('bugle', 0, L.line772, 0.5);
      if (!this.flags.chargeTip) { this.flags.chargeTip = 1; this.after(1.2, () => this.phase === 1 && this.ui.say('七七二团', '冲啊——！', { dur: 1.6 })); }
    }
    for (const a of this.actors) {
      a.t += dt;
      if (a.st === 'run') {
        a.z -= a.sp * dt; a.walk += dt * 10;
        if (a.z <= a.tz) { a.st = a.fate; a.t = 0; if (a.st === 'down') this.fx.dust(a.x, hgt(a.x, a.z) + 0.2, a.z, 3); }
      } else if (a.st === 'back') {
        a.z += a.sp * 0.9 * dt; a.walk += dt * 10;
        if (a.z >= L.line772 - 1.3) { a.z = L.line772 - 1.3; a.st = 'idle'; }
      } else if (a.st === 'down' && a.t > 16) {
        // 倒下的人一会儿被补上：回到出发线
        a.st = 'idle'; a.z = L.line772 - 1.3; a.x = -12 + this.actors.indexOf(a) * 2.6 + rand(-0.4, 0.4);
      }
    }
    this.poseActors(dt);
  }
  poseActors(dt) {
    for (const a of this.actors) {
      const m = a.m, y = hgt(a.x, a.z), run = a.st === 'run' || a.st === 'back';
      poseSoldier(m, { walk: a.walk, moving: run ? 1 : 0, aim: 0, carry: 'rifle', slash: -1 });
      m.root.rotation.y = a.st === 'back' ? Math.PI : 0;
      m.root.rotation.x = a.st === 'down' ? Math.min(1.45, a.t * 4) : 0;
      m.root.position.set(a.x, y - (a.st === 'idle' ? 0.28 : 0) + (a.st === 'down' ? 0.05 : 0), a.z);
    }
  }

  // ---------- 坡顶三个碉堡的机枪（由章节控制：白天点射、夜里瞎扫、照明弹下照着打） ----------
  bunkerTarget(b) {
    const h = this.hero, ph = this.phase, tr = this.world.trench;
    const heroOk = h.alive && dist(h.x, h.z, b.x, b.z) < 74;
    if (ph === 1) {
      if (heroOk && Math.abs(h.x) < 17 && h.z < 36) return { x: h.x + h.vx * 0.4, y: h.y + 1, z: h.z + h.vz * 0.4, warn: 0.55, spread: 1.3, n: 9, cd: rand(2.6, 3.6) };
      const a = this.actors.filter((q) => q.st === 'run' && q.z < 32).sort((p, q) => p.z - q.z)[0];
      if (a) return { x: a.x, y: hgt(a.x, a.z) + 1, z: a.z - 2, spread: 2.4, n: 8, cd: rand(1.6, 2.6) };
      return { x: rand(-14, 14), y: 0, z: rand(10, 30), spread: 3, n: 5, cd: rand(4, 7), ground: true };
    }
    const q = tr.pointAt(ph >= 3 ? tr.total : tr.dug);
    const exposed = heroOk && !this.trenchState(h.x, h.z);
    if (ph === 2 && !this.lit) {
      // 夜里看不见：朝壕头那一片瞎扫
      if (dist(q.x, q.z, b.x, b.z) > 74) return null;
      return { x: q.x + rand(-6, 6), y: hgt(q.x, q.z) + 1, z: q.z + rand(-6, 3), spread: 3.2, n: 6, cd: rand(5, 9) };
    }
    if (exposed) return { x: h.x + h.vx * 0.4, y: h.y + 1, z: h.z + h.vz * 0.4, warn: 0.55, spread: 1.4, n: 9, cd: rand(2.4, 3.4) };
    if (dist(q.x, q.z, b.x, b.z) > 74) return null;
    return { x: q.x + rand(-1.5, 1.5), y: hgt(q.x, q.z) + 1, z: q.z + rand(-1.5, 1.5), warn: ph === 2 ? 0.55 : 0, spread: 1.6, n: 8, cd: rand(2.6, 4) };
  }
  updateBunkers(dt) {
    for (const b of this.world.bunkers) {
      b.flashT -= dt; b.flash.visible = b.alive && b.flashT > 0;
      if (!b.alive || this.cut > 0 || this.flags.won || this.phase > 3 || this.mode !== 'play') continue;
      b.cd -= dt;
      if (b.burst > 0) {
        b.shotT -= dt;
        if (b.shotT <= 0) {
          b.shotT = 0.09; b.burst--;
          const s = b.spread, tx = b.tx + rand(-s, s), tz = b.tz + rand(-s, s);
          const ty = b.ground ? hgt(tx, tz) : b.ty + rand(-0.3, 0.6);
          const bl = this.fireBullet(1, b.slit.x, b.slit.y, b.slit.z + 0.5, tx, ty, tz, 1, 42, null);
          bl.life = 2.2;
          b.flashT = 0.05;
          this.sfxAt('mg', b.x, b.z, 0.9);
        }
      } else if (b.cd <= 0) {
        const tg = this.bunkerTarget(b);
        if (!tg) { b.cd = 1; continue; }
        b.tx = tg.x; b.tz = tg.z; b.ty = tg.y; b.ground = !!tg.ground; b.spread = tg.spread; b.burst = tg.n; b.shotT = tg.warn || 0.05; b.cd = tg.cd + tg.n * 0.09;
        if (tg.warn) this.fx.warn(tg.x, tg.z, 2.2, tg.warn);
      }
    }
  }
  destroyBunker(b, byVolley) {
    if (!b.alive) return;
    this.world.setBunker(b, false);
    for (let i = 0; i < 4; i++) this.after(i * 0.16, () => { this.fx.explosion(b.x + rand(-2.5, 2.5), b.y + rand(0.3, 2), b.z + rand(-1.5, 1.5), 5.5, true); this.fx.debris(b.x, b.y + 2, b.z, 14, [0x8d8a80, 0x3a3631, 0xb3a682], 11, 0.6); });
    this.audio.play('collapse');
    this.addScore(byVolley ? 1200 : 400);
    if (byVolley) this.stats.bunkerVolley++; else this.stats.bunkerHelp++;
    for (const e of this.enemies) if (e.alive && dist2(e.x, e.z, b.x, b.z) < 7 * 7) this.killUnit(e, false, e.x - b.x, e.z - b.z);
    const left = this.world.bunkers.filter((q) => q.alive).length;
    this.ui.stamp(left ? '碉堡炸了！' : '三个碉堡全端了！', 1.3);
  }

  // ---------- 指挥所的射击孔（第五阶段） ----------
  updatePorts(dt) {
    const h = this.hero, cp = this.world.cp;
    for (const p of cp.ports) {
      p.flashT -= dt; p.flash.visible = p.alive && p.flashT > 0;
      if (!p.alive || this.phase !== 5 || this.sub !== 'ports' || this.cut > 0 || this.mode !== 'play') continue;
      p.cd -= dt;
      if (p.burst > 0) {
        p.shotT -= dt;
        if (p.shotT <= 0) {
          p.shotT = 0.1; p.burst--;
          this.fireBullet(1, p.x, p.y, p.z, p.tx + rand(-1, 1), p.ty + rand(-0.3, 0.5), p.tz + rand(-1, 1), 1, 40, null);
          p.flashT = 0.05; this.sfxAt('mg', p.x, p.z, 0.8);
        }
      } else if (p.cd <= 0 && h.alive) {
        const d = dist(p.x, p.z, h.x, h.z);
        const inCone = Math.abs(angDiff(p.face, yawTo(h.x - p.x, h.z - p.z))) < 62 * Math.PI / 180;
        if (inCone && d < 42 && d > 1.2 && !losBlocked(this.world, p.x, p.z, h.x, h.z, 0, p.y, h.y + 1.2)) {
          p.tx = h.x + h.vx * 0.4; p.tz = h.z + h.vz * 0.4; p.ty = h.y + 1; p.burst = 7; p.shotT = 0.6; p.cd = rand(2.2, 3.2);
          this.fx.warn(p.tx, p.tz, 1.9, 0.6);
        } else p.cd = 0.4;
      }
    }
  }
  silencePort(p) {
    if (!p.alive) return;
    p.alive = false; p.flash.visible = false; this.stats.ports++;
    this.fx.explosion(p.x, p.y - 0.4, p.z, 3.5, true); this.fx.debris(p.x, p.y, p.z, 8, [0x8d8a80, 0x3a3631], 7, 0.4);
    this.audio.play('explode'); this.addScore(500);
    const left = this.world.cp.ports.filter((q) => q.alive).length;
    if (left) { this.ui.stamp('射击孔哑了！', 1.1); this.ui.say(this.info().aide, '还剩 ' + left + ' 个射击孔！', { now: true, dur: 1.8 }); }
    else this.after(1.2, () => { if (this.phase === 5 && this.sub === 'ports' && !this.over) this.yamazakiScene(); });
  }

  // ---------- 敌我火力的章节差异 ----------
  // 手榴弹雨的手榴弹炸碉堡；第五阶段手榴弹炸射击孔
  blast(x, z, r, dmg, team) {
    super.blast(x, z, r, dmg, team);
    if (team !== 0) return;
    if (this.phase === 3) for (const b of this.world.bunkers) if (b.alive && dist(x, z, b.x, b.z) < 4.4) { b.hp--; this.fx.sparks(b.x, b.y + 2, b.z, 6); if (b.hp <= 0) this.destroyBunker(b, true); }
    if (this.phase === 5 && this.sub === 'ports') {
      // 一颗手榴弹只炸哑离得最近的那个射击孔
      const p = this.world.cp.ports.filter((q) => q.alive && dist(x, z, q.x, q.z) < 3.2).sort((a, b) => dist(x, z, a.x, a.z) - dist(x, z, b.x, b.z))[0];
      if (p) this.silencePort(p);
    }
  }
  // 山崎架着刀的时候子弹打在刀上；手榴弹只伤一半
  hurtUnit(u, dmg, dx, dz, kind) {
    if (u === this.boss && u.alive) {
      if (kind === 'bullet' && u.guard) {
        this.fx.sparks(u.x - dx * 0.4, u.y + 1.45, u.z - dz * 0.4, 4, 0xffffff);
        if (this.t - (this.deflT || -9) > 0.22) { this.deflT = this.t; this.sfxAt('clang', u.x, u.z, 0.45); }
        this.stats.deflect++;
        if (!this.flags.deflTip && this.stats.deflect >= 5) { this.flags.deflTip = 1; this.ui.toast(this.app.isTouch() ? '山崎的刀把子弹都格开了：等他出刀落空、收刀喘气（血条闪）再打；或者拔刀，他刀到的一瞬间按格挡，弹开就是拼刀' : '山崎的刀把子弹都格开了：等他出刀落空、收刀喘气（血条闪）再打；或者 Q 拔刀，他刀到的一瞬间按右键格挡，弹开就是拼刀', 5); }
        return;
      }
      if (kind === 'blast') dmg *= 0.5;
    }
    super.hurtUnit(u, dmg, dx, dz, kind);
  }
  // 手榴弹雨：U 键喊全营往落点圈里扔一轮
  throwNade() {
    if (this.phase === 3 && !this.flags.p3done) { this.volley(); return; }
    super.throwNade();
  }
  volley() {
    const ui = this.ui, m = this.mark;
    if (!this.flags.signal) { ui.toast('等团长的信号弹', 1.4); return; }
    if (this.grenades <= 0) { ui.toast('三千六百颗都扔出去了', 1.4); return; }
    if (this.volleyCd > 0) { ui.toast('下一轮还在往前传（' + this.volleyCd.toFixed(1) + ' 秒）', 1.0); return; }
    if (!m.ok) { ui.toast('准星往坡顶上抬：对准碉堡、战壕再喊', 1.6); return; }
    this.grenades -= PER_VOLLEY; this.volleyCd = 3.2; this.stats.volleys++;
    ui.say('张大彪', pick(['一营，扔！', '再来一轮，给我扔！', '扔！扔！', '狠狠地砸！']), { now: true, dur: 1.2 });
    this.audio.play('throw'); this.hero.slash = 0.36;
    const tr = this.world.trench, N = 16, mx = m.x, mz = m.z;
    for (let i = 0; i < N; i++) {
      const q = tr.pointAt(tr.total - rand(0.5, 22)), a = rand(TAU), r = Math.sqrt(rand()) * 6.2;
      const tx = mx + Math.cos(a) * r, tz = mz + Math.sin(a) * r;
      this.after(rand(0, 0.7), () => {
        if (this.phase !== 3) return;
        const mesh = new THREE.Mesh(this.nadeGeo, MAT.vc); mesh.castShadow = true; this.scene.add(mesh);
        this.nades.push({ x0: q.x + rand(-0.6, 0.6), z0: q.z + rand(-0.6, 0.6), y0: hgt(q.x, q.z), y1: hgt(tx, tz), x1: tx, z1: tz, t: 0, d: rand(1.1, 1.5), mesh, r: 3.4, dmg: 6, team: 0, high: 1.2 });
      });
    }
  }
  updateMark() {
    const m = this.mark, h = this.hero, a = this.aim;
    const show = this.phase === 3 && !this.flags.p3done && h.alive && this.cut <= 0 && this.mode === 'play';
    if (!show) { this.markMesh.visible = false; m.ok = false; return; }
    let dx = a.x - h.x, dz = a.z - h.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { dx = fwdX(this.cam.yaw); dz = fwdZ(this.cam.yaw); d = 1; }
    const dd = clamp(d, 12, 46);
    m.x = h.x + dx / d * dd; m.z = h.z + dz / d * dd;
    m.ok = m.z < h.z - 6;
    const ready = m.ok && this.flags.signal && this.volleyCd <= 0 && this.grenades > 0;
    this.markMesh.visible = true;
    this.markMesh.position.set(m.x, hgt(m.x, m.z) + 0.14, m.z);
    this.fx.tilt(this.markMesh, m.x, m.z);
    const col = ready ? 0xffd84a : m.ok ? 0xc8c0a8 : 0xff6a4a;
    this.markMesh.material.color.setHex(col); this.markDisc.material.color.setHex(col);
  }

  // ---------- 挖壕 ----------
  useOption(h) {
    if (this.phase !== 2 || this.cut > 0) return null;
    const tr = this.world.trench;
    if (tr.dug >= tr.total) return null;
    if (this.digging) return { label: '停手', prompt: '按 F 停手（走动、开枪也会停）', act: () => this.stopDig() };
    const q = tr.pointAt(tr.dug);
    if (dist(h.x, h.z, q.x, q.z) > 2.8 || this.elev(h) > 0.6) return null;
    return { label: '挖壕', prompt: '按 F 挖交通壕', act: () => this.startDig() };
  }
  startDig() {
    this.digging = true; this.digSwing = 0;
    if (!this.flags.digTip) { this.flags.digTip = 1; this.ui.toast('开挖了：走动、开枪或再按一次 I 就停手。照明弹一亮，先退回壕里', 4); }
  }
  stopDig() { this.digging = false; }
  ensureShovels() {
    const att = (m) => { if (m.shovel) return; const s = buildShovel(); s.visible = false; m.armR.add(s); m.shovel = s; };
    att(this.hero.model);
    for (const a of this.allies) if (a.slot === 0 || a.slot === 2) att(a.model);
  }
  updateDigging(dt) {
    const h = this.hero, inp = this.input, w = this.world, tr = w.trench;
    const q = tr.pointAt(tr.dug);
    if (this.digging && (!h.alive || this.cut > 0 || h.mg || Math.hypot(inp.move.x, inp.move.y) > 0.25 || inp.held.fire || h.blade || h.stance || tr.dug >= tr.total)) this.digging = false;
    let rate = 0;
    if (this.digging) {
      rate += 0.9; this.stats.heroDug += 0.9 * dt;
      // 人跟着壕头往前挪，脸朝挖的方向
      const sp = tr.pointAt(Math.max(0, tr.dug - 0.9));
      h.x = damp(h.x, sp.x, 6, dt); h.z = damp(h.z, sp.z, 6, dt);
      h.yaw = yawTo(q.dx, q.dz);
      this.digSwing -= dt;
      if (this.digSwing <= 0) { this.digSwing = 0.6; h.slash = 0; this.sfxAt('dig', q.x, q.z, 0.8); this.fx.debris(q.x, hgt(q.x, q.z) + 0.3, q.z, 3, [0xa1855a, 0x8a6f4c], 3, 0.16); }
    }
    if (h.model.shovel) h.model.shovel.visible = this.digging;
    // 两个战友在壕头挖：附近有鬼子、照明弹亮着就停下
    for (const a of this.allies) {
      if (!a.model.shovel) continue;
      const dig = this.phase === 2 && this.cut <= 0 && a.alive && !(a.down > 0) && !a.target && !this.lit && tr.dug < tr.total && dist2(a.x, a.z, q.x, q.z) < 4.5 * 4.5;
      a.model.shovel.visible = dig;
      if (!dig) continue;
      rate += 0.22;
      a.yaw = yawTo(q.dx, q.dz);
      a.digT = (a.digT || rand(0.7)) - dt;
      if (a.digT <= 0) { a.digT = 0.75; a.slash = 0; if (rand() < 0.5) this.fx.debris(q.x, hgt(q.x, q.z) + 0.3, q.z, 2, [0xa1855a, 0x8a6f4c], 3, 0.14); }
    }
    if (rate > 0 && this.cut <= 0) w.setDug(tr.dug + rate * dt);
  }

  // 局内喊话：上一句原声没放完就排到它后面；换了阶段就不放了
  vo(id, dur, fn) {
    const ph = this.phase, gen = this.voGen || 0, go = () => { if (this.over || this.phase !== ph || (this.voGen || 0) !== gen || this.scn) return; this.audio.voice(id); this.voBusy = this.t + dur; if (fn) fn(); };
    const wait = (this.voBusy || 0) - this.t;
    if (wait > 0.05) this.after(wait + 0.3, go); else go();
  }
  endScene(skipped) { if (skipped) this.voBusy = 0; super.endScene(skipped); }
  // 过场开始：掐掉局内还没说完和排着队的原声，免得和过场原声叠在一起
  cutVoices() { this.audio.stopVoices(); this.voBusy = 0; this.voGen = (this.voGen || 0) + 1; }

  // ---------- 阶段 ----------
  enterPhase(n, fresh) {
    const h = this.hero, ui = this.ui, w = this.world, tr = w.trench;
    this.phase = n; this.phaseT = 0; this.sub = '';
    this.audio.stopVoices(); this.voBusy = 0;
    if (h) h.mg = null;
    this.app.saveCheckpoint(n);
    for (const e of this.enemies) if (e.alive) { e.alive = false; e.deadT = 9; }
    this.boss = null;
    this.bullets.length = 0;
    this.fx.clearWarnings(); this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0;
    h.hp = h.maxHp; h.nades = h.nadeMax; h.inv = Math.max(h.inv, 1.2);
    this.digging = false; this.ensureShovels();
    for (const f of this.flarePool) { f.on = false; f.ball.visible = false; f.light.intensity = 0; }
    this.lit = false;
    if (n !== 1) for (const a of this.actors) a.m.root.visible = false;
    if (n >= 3) w.setDug(tr.total); else if (fresh) w.setDug(0);
    for (const b of w.bunkers) { if (n >= 4) w.setBunker(b, false); else if (fresh) { w.setBunker(b, true); b.hp = 8; } b.burst = 0; b.cd = rand(1, 3); }
    for (const p of w.cp.ports) { p.alive = true; p.burst = 0; p.cd = rand(1, 2.5); }
    w.flag.visible = true;
    const want = n === 1 ? 'dusk' : n === 2 ? 'night' : n === 3 ? 'dawn' : 'day';
    if (fresh || !this.lb) this.lightTo(want, 0);
    spawnPhase(this, n);
    this.audio.setMusic(n >= 4 ? 2 : 1);
    if (n === 1) {
      this.place(h, L.start.x, L.start.z);
      this.allies.forEach((al, i) => this.place(al, L.start.x + (i % 2 ? 1 : -1) * (2.2 + Math.floor(i / 2) * 2.2), L.start.z + 2.4 + Math.floor(i / 2) * 1.6));
      this.resetActors(true); this.chargeT = 3;
      this.vo('ljp_lengbandeng', 9.0, () => {
        ui.say('孔捷', '李云龙，你怎么当的团长，连个主攻任务都抢不来！', { now: true, dur: 4.6 });
        ui.say('孔捷', '人家在前面打个热闹，咱独立团在后面坐冷板凳。', { dur: 4.4 });
      });
      this.after(9.6, () => this.phase === 1 && ui.toast('七七二团在正面强攻，独立团从左翼上：先拔掉山脚左边的鬼子火力点。机枪阵地正面的沙袋打不穿，绕到侧面（两侧只到腰高）打机枪手', 7));
    } else if (n === 2) {
      this.place(h, L.trench[0][0] - 0.6, L.trench[0][1] + 2.5);
      this.allies.forEach((al, i) => this.place(al, L.trench[0][0] + (i % 2 ? 1.2 : -1.2), L.trench[0][1] + 4 + Math.floor(i / 2) * 1.4));
      this.flareT = 15; this.mT = 0;
      this.vo('ljp_xuezhe', 10.0, () => {
        ui.say('李云龙', '告诉你们程瞎子，当年老子教他怎么打枪，现在就教他怎么打仗，', { now: true, dur: 7.0 });
        ui.say('李云龙', '站在山坡下学着点儿！', { dur: 3.0 });
      });
      this.vo('ljp_podi', 26.05, () => {
        ui.say('李云龙', '部队全部运动到山坡的下边，谁也不许露头，', { now: true, dur: 6.2 });
        ui.say('李云龙', '鬼子的枪法可是不赖，咱可不触那个霉头。', { dur: 5.4 });
        ui.say('李云龙', '部队用土工作业的方式向前平行推进，', { dur: 4.8 });
        ui.say('李云龙', '只要我们掘进了五十米，剩下的三十米，就是个娘们儿都能把手榴弹扔进了环型工事去。', { dur: 9.6 });
      });
      this.after(3.5, () => this.phase === 2 && ui.toast(this.app.isTouch() ? '挖交通壕：走到壕头的铁锹那里点“挖壕”。夜里坡顶的机枪只能瞎扫；照明弹一亮，赶紧退回壕里' : '挖交通壕：走到壕头的铁锹那里按 F 开挖。夜里坡顶的机枪只能瞎扫；照明弹一亮，赶紧退回壕里', 7));
    } else if (n === 3) {
      const q = tr.pointAt(tr.total - 2.5);
      if (fresh || dist2(h.x, h.z, q.x, q.z) > 9) this.place(h, q.x, q.z);
      h.yaw = 0; this.cam.yaw = 0;
      this.allies.forEach((al) => { const p = this.allyPost(al); this.place(al, p[0], p[1]); });
      this.grenades = GRENADES; this.volleyCd = 0; this.rainT = RAIN_T; this.flags.signal = 0; this.flags.p3done = 0;
      this.spawnMed(q.x + 1.6, q.z + 2);
      this.vo('ljp_xinhao', 14.4, () => {
        ui.say('李云龙', '我这里信号弹一响，一营所有的手榴弹在两分钟之内必须全都扔出去。', { now: true, dur: 8.6 });
        ui.say('李云龙', '三千六百颗手榴弹，够山崎那小子喝一壶的了！', { dur: 5.8 });
      });
      this.after(14.8, () => {
        if (this.phase !== 3 || this.over) return;
        this.flags.signal = 1;
        const p = tr.pointAt(tr.total);
        this.launchFlare(p.x, p.z, p.x, p.z - 6, 0xff5a3a);
        ui.stamp('信号弹！扔！', 1.4, 'red'); this.audio.play('drum');
        ui.toast(this.app.isTouch() ? '手榴弹雨：准星抬到坡顶，黄圈罩住碉堡和战壕，点“全营投弹”。每轮三百六十颗，两分钟内扔完三千六百颗' : '手榴弹雨：准星抬到坡顶，黄圈罩住碉堡和战壕，按 G 全营投弹。每轮三百六十颗，两分钟内扔完三千六百颗', 7);
      });
    } else if (n === 4) {
      const q = tr.pointAt(tr.total - 1.5);
      if (fresh) { this.place(h, q.x, q.z); this.allies.forEach((al, i) => { const p = tr.pointAt(tr.total - 3 - i * 1.8); this.place(al, p.x, p.z); }); }
      this.flags.fClear = 0; this.flags.qibing = 0;
      this.spawnLoot(-15, -41);
      ui.stamp('冲啊！', 1.4); this.audio.play('bugle', 0.8);
      this.vo('ljp_yelang', 15.3, () => {
        ui.say('张大彪', '突击队，冲啊！', { now: true, dur: 2.4 });
        ui.say('张大彪', '兄弟们，给我拿出野狼的劲头来，冲上去剁了小鬼子！', { dur: 7.2 });
        ui.say('张大彪', '冲啊！冲啊！', { dur: 5.7 });
      });
      this.after(3, () => this.phase === 4 && ui.toast('突击队：冲进环形工事，肃清南面、东面、西面三段战壕里的鬼子。挥刀的军官冲到跟前时，L 亮剑砍他', 6));
    } else if (n === 5) {
      this.sub = 'ports';
      if (fresh) { this.place(h, 0, -31); this.allies.forEach((al, i) => this.place(al, -6 + i * 2.4, -29)); }
      if (h.weapon !== 'lmg') this.spawnLoot(-15, -41);
      this.spawnMed(-17, -40); this.spawnMed(17, -40);
      this.after(1.0, () => this.vo('ljp_juedou', 39.0, () => {
        ui.say('喊话员', '小日本山崎大队长听着：八路军独立团团长李云龙得知阁下武士世家出身，精通剑道，', { now: true, dur: 9.0 });
        ui.say('喊话员', '李团长认为，你们的剑道不过是中国剑术的皮毛而已。', { dur: 6.1 });
        ui.say('喊话员', '要是阁下珍惜武士的荣誉，就停止射击，走出工事，', { dur: 6.4 });
        ui.say('喊话员', '我们李团长愿意和阁下用刀剑进行正式决斗。', { dur: 5.0 });
        ui.say('喊话员', '李团长用军人的荣誉担保，如果败在阁下的剑下，八路军独立团立即停止攻击，给贵军让开道路。', { dur: 9.5 });
        ui.say('喊话员', '小日本，你们听见了吗？', { dur: 3.0 });
      }));
      this.after(3.5, () => this.phase === 5 && this.sub === 'ports' && ui.toast('指挥所四个射击孔都架着机枪：从侧面（射击孔看不到的角度）贴过去，往孔边扔手榴弹（G）把它炸哑', 6));
    }
  }

  objective() {
    const p = this.phase, h = this.hero, w = this.world, tr = w.trench;
    if (this.flags.won) return ['<b>李家坡拿下来了！</b>', null];
    if (p === 1) {
      if (!this.flags.pl) return ['第一阶段 · 七七二团正面强攻受挫，独立团从左翼上：<b>拔掉山脚左边的火力点</b>', this.groupMarker(['PL'], '火力点') || { x: L.postL.x, y: hgt(L.postL.x, L.postL.z) + 2.6, z: L.postL.z, text: '火力点' }];
      if (!this.flags.pr) return ['第一阶段 · <b>拔掉右边的火力点</b>', this.groupMarker(['PR'], '火力点') || { x: L.postR.x, y: hgt(L.postR.x, L.postR.z) + 2.6, z: L.postR.z, text: '火力点' }];
      return ['第一阶段 · <b>肃清山脚的残敌</b>', this.groupMarker(['P1x'], '残敌')];
    }
    if (p === 2) {
      const q = tr.pointAt(tr.dug);
      const far = dist(h.x, h.z, q.x, q.z) > 6;
      return [`第二阶段 · 挖交通壕 <b>${Math.floor(tr.dug)} / ${Math.round(tr.total)} 米</b>${this.lit ? '　<b>照明弹！</b>' : ''}`, far ? { x: q.x, y: hgt(q.x, q.z) + 2.2, z: q.z, text: '壕头' } : null];
    }
    if (p === 3) {
      if (this.flags.p3done) return ['第三阶段 · <b>碉堡都端了</b>', null];
      if (!this.flags.signal) return ['第三阶段 · <b>等团长的信号弹……</b>', null];
      const left = w.bunkers.filter((b) => b.alive);
      const nb = left.sort((a, b) => dist2(a.x, a.z, h.x, h.z) - dist2(b.x, b.z, h.x, h.z))[0];
      return [`第三阶段 · 手榴弹雨：<b>炸掉碉堡（还剩 ${left.length} 个）</b>　手榴弹 ${this.grenades} 颗　${fmtTime(this.rainT)}`, nb ? { x: nb.x, y: nb.y + 3.4, z: nb.z, text: '碉堡' } : null];
    }
    if (p === 4) {
      const n = ['F', 'W', 'E'].filter((g) => this.groupAlive(g)).length;
      const back = this.groupAlive('B');
      return [n ? `第四阶段 · 突击队：<b>肃清环形工事里的鬼子</b>（还剩 ${n} 段战壕）` : back ? '第四阶段 · <b>打退北面的反扑</b>' : '第四阶段 · <b>环形工事拿下了</b>', this.groupMarker(['F', 'W', 'E', 'B'], '鬼子')];
    }
    if (this.sub === 'ports') {
      const ps = w.cp.ports.filter((q) => q.alive);
      const nq = ps.sort((a, b) => dist2(a.x, a.z, h.x, h.z) - dist2(b.x, b.z, h.x, h.z))[0];
      return [`第五阶段 · 指挥所的射击孔：<b>往孔边扔手榴弹</b>（还剩 ${ps.length} 个）`, nq ? { x: nq.x, y: nq.y + 1.2, z: nq.z, text: '射击孔' } : null];
    }
    if (this.sub === 'boss') return ['第五阶段 · <b>和山崎拼刀！</b>', null];
    return ['', null];
  }
  groupMarker(groups, text) {
    const h = this.hero;
    let best = null, bd = 1e9;
    for (const e of this.enemies) { if (!e.alive || !groups.includes(e.group)) continue; const d = dist2(e.x, e.z, h.x, h.z); if (d < bd) { bd = d; best = e; } }
    return best ? { x: best.x, y: best.y + 2.6, z: best.z, text } : null;
  }
  gunBar() {
    if (this.phase === 2) return this.world.trench.dug / this.world.trench.total;
    if (this.phase === 3 && this.flags.signal && !this.flags.p3done) return this.rainT / RAIN_T;
    return null;
  }
  gunBarLabel() { return this.phase === 2 ? '交通壕' : '两分钟'; }

  updatePhase(dt) {
    const p = this.phase;
    this.phaseT += dt;
    if (this.flags.won || this.over) return;
    if (p === 1) this.updateAssault(dt);
    else if (p === 2) this.updateDig(dt);
    else if (p === 3) this.updateRain(dt);
    else if (p === 4) this.updateStorm(dt);
    else if (p === 5) this.updateFinal(dt);
  }
  updateChapter(dt) {
    this.updateLight(dt);
    this.updateFlares(dt);
    this.updateActors(dt);
    this.updateBunkers(dt);
    this.updatePorts(dt);
    if (this.phase === 2) this.updateDigging(dt);
    this.volleyCd = Math.max(0, this.volleyCd - dt);
    this.updateMark();
  }
  syncHud(dt) {
    super.syncHud(dt);
    if (this.phase === 3 && !this.flags.p3done && !this.cannon.manned && !this.hero.mg) {
      const ui = this.ui, cd = this.volleyCd;
      ui.setAction('nade', '全营投弹', !this.flags.signal ? '等信号' : this.grenades <= 0 ? '扔完了' : cd > 0 ? cd.toFixed(1) + '秒' : this.grenades + '颗', !this.flags.signal || cd > 0 || this.grenades <= 0, 'G');
      ui.setKeyHint('<kbd>G</kbd> 全营投弹（落在黄圈里）　鼠标 瞄准　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　左键 开枪　<kbd>V</kbd> 切换人称　<kbd>Esc</kbd> 暂停');
    }
  }

  // 第一阶段：拔掉山脚的外围火力点（正面七七二团一次次冲上去又退下来）
  updateAssault() {
    const ui = this.ui, h = this.hero;
    if (!this.flags.pl && !this.groupAlive('PL')) {
      this.flags.pl = 1; this.nestCleared(L.postL, '左边');
      this.vo('ljp_dibaci', 9.3, () => {
        ui.say('孔捷', '鬼子的火力太猛，七七二团又撤下来了。', { now: true, dur: 4.5 });
        ui.say('李云龙', '这是第几次攻击了？', { dur: 2.9 });
        ui.say('孔捷', '第八次了。', { dur: 1.9 });
      });
      this.spawnWave(-12, 6, 3, 1, 'P1x', 12);
      this.after(2, () => this.phase === 1 && ui.say('张大彪', '坡上又下来一股，顶住！'));
    }
    if (this.flags.pl && !this.flags.cheng && dist2(h.x, h.z, L.postR.x, L.postR.z) < 42 * 42) {
      this.flags.cheng = 1;
      this.vo('ljp_laoxiancheng', 10.85, () => {
        ui.say('程瞎子（电话）', '我们团整整攻击了八个小时，山崎大队已经伤亡过半了，', { now: true, dur: 6.0 });
        ui.say('程瞎子（电话）', '这时候让独立团上，这不是让他们捞现成的吗？', { dur: 4.85 });
      });
    }
    if (!this.flags.pr && !this.groupAlive('PR')) { this.flags.pr = 1; this.nestCleared(L.postR, '右边'); }
    if (this.flags.pl && this.flags.pr && !this.groupAlive('P1x') && !this.flags.p1done) {
      this.flags.p1done = 1; this.addScore(1000);
      ui.stamp('火力点拔掉了！', 1.5);
      this.after(3.2, () => { if (this.phase === 1 && !this.over) this.digScene(); });
    }
  }
  // 过场：土工掘进的主意；天黑下来
  digScene() {
    this.cutVoices();
    const ui = this.ui, h = this.hero;
    this.clearCast();
    this.place(h, -3, 50.6); h.yaw = 0;
    this.allies.forEach((al, i) => this.place(al, -12 + i * 2.6, 54.5));
    const kj = buildSoldier('kongjie'), cm = buildSoldier('ally');
    kj.root.position.set(-1.4, 0, 49.6); cm.root.position.set(-4.6, 0, 49.2);
    for (const m of [kj, cm]) { m.root.rotation.y = yawTo(h.x - m.root.position.x, h.z - m.root.position.z); poseSoldier(m, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 }); this.scene.add(m.root); this.cast.push(m); }
    const faces = { px: -2.6, py: 2.0, pz: 46.0, lx: -2.9, ly: 1.5, lz: 50.0 };
    this.cutCam = faces;
    this.lightTo('night', 24);
    this.audio.voice('ljp_tugong');
    ui.say('李云龙', '从地形上看，全团一千多号人不可能全部展开，', { now: true, dur: 5.6 });
    ui.say('李云龙', '要是一个连一个连的进行攻击，那成了添油战术，这是兵家大忌，', { dur: 6.0 });
    ui.say('李云龙', '老子不干这个傻事。我要缩短这段攻击的距离。', { dur: 5.7 });
    ui.say('参谋', '团长，你是说用土工的方式进行掘进？', { dur: 4.3 });
    ui.say('李云龙', '你小子脑袋还挺好使。', { dur: 4.1 });
    this.playScene(26.2, [
      [6.5, () => { this.cutCam = { px: -7, py: 3.2, pz: 58, lx: 0, ly: 9, lz: -18 }; }],
      [12.5, () => { this.cutCam = faces; }],
      [17.3, () => { this.cutCam = { px: -4.2, py: 1.9, pz: 46.6, lx: -4.6, ly: 1.6, lz: 49.2 }; }],
      [21.6, () => { this.cutCam = { px: -2.4, py: 1.9, pz: 47.8, lx: -3, ly: 1.65, lz: 50.6 }; ui.stamp('土工掘进！', 1.4); }],
    ], () => { this.clearCast(); this.lightTo('night', 0); this.enterPhase(2, false); });
  }

  // 第二阶段：夜里挖交通壕
  updateDig(dt) {
    const ui = this.ui, tr = this.world.trench;
    if (this.cut <= 0) this.stats.p2T += dt;
    const f = tr.dug / tr.total, q = tr.pointAt(tr.dug);
    // 照明弹
    if (this.cut <= 0) this.flareT -= dt;
    if (this.flareT <= 0 && f < 1) {
      this.flareT = rand(17, 24);
      this.launchFlare(rand(-14, 14), -36, clamp(q.x + rand(-8, 8), -30, 30), Math.max(-28, q.z - rand(8, 16)));
      if (!this.flags.flareTip) { this.flags.flareTip = 1; this.after(1.5, () => ui.toast('照明弹！坡顶的机枪照着亮处打：先停手，退回壕里（离壕头三米以上）', 4.5)); }
    }
    const once = (id, th, fn) => { if (!this.flags[id] && f >= th) { this.flags[id] = 1; fn(); } };
    const side = (x, nR, nO, g, elite) => { this.spawnWave(x, clamp(q.z - 6, -24, 44), nR, nO, g, rand(9, 13)); if (elite) { const e = this.addUnit('enemy', 'elite', x, clamp(q.z - 8, -24, 44), { group: g, wake: 999 }); e.active = true; } };
    once('s1', 0.14, () => { side(-30, 4, 1, 'N1'); ui.say('和尚', '团长，左边有鬼子摸下来了！', { now: true }); });
    once('m1', 0.2, () => this.spawnMedAt(tr.dug - 3));
    once('jt', 0.26, () => this.vo('ljp_juetu', 7.8, () => {
      ui.say('日军军官', '怎么回事？', { now: true, foe: true, dur: 2.2 });
      ui.say('日军参谋', '非常奇怪，新上来的八路在掘土。', { foe: true, dur: 5.6 });
    }));
    once('mt', 0.36, () => {
      for (const e of this.enemies) if (e.group === 'M') e.active = true;
      ui.say('张大彪', '坡顶的掷弹筒开始砸壕头了！', { now: true });
      this.after(1, () => ui.toast('红圈是掷弹筒的落点：落下前躲开。坡顶的掷弹筒手打得着', 4));
    });
    once('s2', 0.45, () => { side(30, 4, 1, 'N2', true); ui.say('张大彪', '右边！右边上来了！', { now: true }); });
    once('k3600', 0.5, () => this.vo('ljp_3600', 12.45, () => {
      ui.say('李云龙', '你们营有三百六十人，我把全团的手榴弹都交给你们营，', { now: true, dur: 6.0 });
      ui.say('李云龙', '每个人十颗，那是多少啊？', { dur: 4.4 });
      ui.say('李云龙', '三千六百颗！', { dur: 2.0 });
    }));
    once('m2', 0.55, () => this.spawnMedAt(tr.dug - 3));
    once('kp', 0.64, () => {
      this.vo('ljp_kaipao_jp', 11.3, () => {
        ui.say('山崎', '攻击！攻击！立刻开炮，立刻开炮！', { now: true, foe: true, dur: 5.6 });
        ui.say('山崎', '集中所有炮火，把炮弹通通给我打光！', { foe: true, dur: 5.7 });
      });
      // 炮火覆盖：沿着交通壕一路落
      for (let i = 0; i < 9; i++) this.after(2 + i * 0.8, () => { if (this.phase !== 2) return; const p = tr.pointAt(clamp(tr.dug - rand(0, 18), 0, tr.total)); this.launchMortar(p.x + rand(-2, 2), p.z + rand(-2, 2), 3.6, 1.7, rand(-16, 16), L.top + 2, -40); });
      this.after(2.2, () => ui.toast('鬼子的炮火覆盖：盯着地上的红圈躲', 3));
    });
    once('s3', 0.76, () => { side(-30, 3, 1, 'N3'); side(30, 3, 1, 'N3'); ui.say('和尚', '两边一起摸上来了！', { now: true }); });
    once('m3', 0.8, () => this.spawnMedAt(tr.dug - 3));
    // 掷弹筒手被打掉，过一会儿补上
    if (this.flags.mt && !this.groupAlive('M')) {
      this.mT = (this.mT || 0) + dt;
      if (this.mT > 26) { this.mT = 0; for (const x of [-20, 20]) { const m = this.addUnit('enemy', 'mortar', x, -30.8, { hold: true, group: 'M' }); m.active = true; m.stT = rand(3, 6); } }
    }
    if (f >= 1 && !this.flags.p2done) {
      this.flags.p2done = 1; this.digging = false; this.addScore(1500 + Math.max(0, Math.round(3000 - this.stats.p2T * 12)));
      ui.stamp('交通壕挖到了！', 1.6);
      ui.say('张大彪', '团长，离环形工事就剩三十来米了！', { now: true });
      this.after(3, () => { if (this.phase === 2 && !this.over) this.dawnScene(); });
    }
  }
  spawnMedAt(t) { const p = this.world.trench.pointAt(clamp(t, 0.5, this.world.trench.total)); this.spawnMed(p.x, p.z); }
  // 过场：天亮，张大彪领突击队
  dawnScene() {
    this.cutVoices();
    const ui = this.ui, h = this.hero, tr = this.world.trench;
    this.clearCast();
    const pL = tr.pointAt(tr.total - 3.2), pD = tr.pointAt(tr.total - 1.3), pK = tr.pointAt(tr.total - 5.2);
    this.place(h, pL.x, pL.z); h.yaw = yawTo(pD.x - pL.x, pD.z - pL.z);
    const db = this.allies.find((a) => a.slot === 0);
    this.allies.forEach((al) => { const p = tr.pointAt(clamp(tr.total - 7 - al.slot * 1.8, 0.5, tr.total)); this.place(al, p.x, p.z); });
    if (db) { this.place(db, pD.x, pD.z); db.yaw = yawTo(pL.x - pD.x, pL.z - pD.z); }
    const kj = buildSoldier('kongjie');
    kj.root.position.set(pK.x, hgt(pK.x, pK.z), pK.z); kj.root.rotation.y = yawTo(pL.x - pK.x, pL.z - pK.z);
    poseSoldier(kj, { walk: 0, moving: 0, aim: 0, carry: 'side', slash: -1 }); this.scene.add(kj.root); this.cast.push(kj);
    // 交通壕的法线方向：镜头放在一侧
    const nx = -pL.dz, nz = pL.dx, gy = hgt(pL.x, pL.z);
    const two = { px: (pL.x + pD.x) / 2 + nx * 3.4, py: gy + 2.0, pz: (pL.z + pD.z) / 2 + nz * 3.4, lx: (pL.x + pD.x) / 2, ly: gy + 1.4, lz: (pL.z + pD.z) / 2 };
    this.cutCam = two;
    this.lightTo('dawn', 22);
    this.audio.voice('ljp_zhangdabiao');
    ui.say('李云龙', '小子，全看你的了。', { now: true, dur: 2.0 });
    ui.say('张大彪', '团长，拿不下李家坡您也甭枪毙我，省颗子弹。', { dur: 5.6 });
    ui.say('张大彪', '我张大彪别的不敢保证，突击队这几十号人，没人会活着退出战斗。', { dur: 5.7 });
    ui.say('李云龙', '好样的，这话听着提气！', { dur: 2.5 });
    this.playScene(26.8, [
      [7.4, () => { this.cutCam = { px: pD.x - pD.dx * 2.2 + nx * 1.2, py: gy + 1.9, pz: pD.z - pD.dz * 2.2 + nz * 1.2, lx: pD.x, ly: hgt(pD.x, pD.z) + 1.6, lz: pD.z }; }],
      [13.2, () => { this.cutCam = { px: pL.x + pL.dx * 2.2 + nx * 1.2, py: gy + 1.9, pz: pL.z + pL.dz * 2.2 + nz * 1.2, lx: pL.x, ly: gy + 1.65, lz: pL.z }; }],
      [16.3, () => {
        this.audio.voice('ljp_shangcidao');
        ui.say('李云龙', '手榴弹一响，全团人人上刺刀，没有刺刀的，给抄起扁担也得全部上去！', { now: true, dur: 6.8 });
        ui.say('孔捷', '老子这几天都快憋疯了，你就交给我吧！', { dur: 3.5 });
        this.cutCam = { px: pL.x - pL.dx * 3 + nx * 0.8, py: gy + 2.6, pz: pL.z - pL.dz * 3 + nz * 0.8, lx: L.cp.x, ly: L.top + 2, lz: L.ringF };
      }],
      [23.1, () => { this.cutCam = { px: pK.x + nx * 2.4 - pK.dx * 1.5, py: hgt(pK.x, pK.z) + 1.9, pz: pK.z + nz * 2.4 - pK.dz * 1.5, lx: pK.x, ly: hgt(pK.x, pK.z) + 1.6, lz: pK.z }; }],
    ], () => { this.clearCast(); this.lightTo('dawn', 0); this.enterPhase(3, false); });
  }

  // 第三阶段：两分钟手榴弹雨
  updateRain(dt) {
    const ui = this.ui, w = this.world;
    if (!this.flags.signal || this.flags.p3done) return;
    if (this.cut <= 0) { this.rainT = Math.max(0, this.rainT - dt); this.stats.p3T += dt; }
    const left = w.bunkers.filter((b) => b.alive);
    if (!left.length) { this.endRain(); return; }
    if ((this.rainT <= 0 || this.grenades <= 0) && this.volleyCd <= 0 && !this.nades.length) {
      // 两分钟到了或者手榴弹扔完了，碉堡还没端完：张大彪抱着集束手榴弹上去补
      this.flags.p3done = 1;
      ui.say('张大彪', '团长，剩下的碉堡交给我！', { now: true });
      left.forEach((b, i) => this.after(2 + i * 1.2, () => this.destroyBunker(b, false)));
      this.after(3.4 + left.length * 1.2, () => this.endRain(true));
    }
  }
  endRain(late) {
    if (this.flags.rainEnd) return;
    this.flags.rainEnd = 1; this.flags.p3done = 1;
    this.addScore(late ? 0 : Math.round(this.grenades / PER_VOLLEY) * 400 + Math.round(this.rainT) * 10);
    this.ui.stamp(late ? '碉堡端了！' : '三千六百颗，砸开了！', 1.6);
    this.after(2.4, () => { if (this.phase === 3 && !this.over) this.huopiScene(); });
  }
  huopiScene() {
    this.cutVoices();
    const ui = this.ui, h = this.hero, tr = this.world.trench;
    const p = tr.pointAt(tr.total - 1.5), gy = hgt(p.x, p.z);
    this.place(h, p.x, p.z); h.yaw = yawTo(-p.dx, -p.dz);
    this.cutCam = { px: p.x - p.dx * 3.4 + 0.8, py: gy + 1.8, pz: p.z - p.dz * 3.4, lx: p.x, ly: gy + 1.7, lz: p.z };
    this.lightTo('day', 11);
    this.audio.voice('ljp_huopi');
    ui.say('李云龙', '独立团全团出动，全部参加攻击，准备白刃战！', { now: true, dur: 5.2 });
    ui.say('李云龙', '记住了，见着山崎那小子，谁也不许开枪，给我留着，老子要活劈了他！', { dur: 6.4 });
    this.playScene(11.9, [[5.2, () => { this.cutCam = { px: p.x + p.dx * 3 + 1.2, py: gy + 2.4, pz: p.z + p.dz * 3, lx: p.x, ly: gy + 1.5, lz: p.z }; }], [9.6, () => ui.stamp('上刺刀！', 1.3, 'red')]],
      () => { this.lightTo('day', 0); this.enterPhase(4, false); });
  }

  // 第四阶段：突击队冲进环形工事
  updateStorm() {
    const ui = this.ui, h = this.hero;
    if (!this.flags.qibing && h.z < -27) {
      this.flags.qibing = 1;
      this.vo('ljp_qibing', 9.8, () => {
        ui.say('孙德胜', '弟兄们，咱们是骑兵，没有马也该比步兵快，', { now: true, dur: 5.0 });
        ui.say('孙德胜', '冲上去超过步兵，冲到最前面，冲啊！', { dur: 4.8 });
      });
    }
    if (!this.flags.fClear && !this.groupAlive('F')) {
      this.flags.fClear = 1; this.addScore(800); this.spawnMed(-4, -36.4);
      // 南面一拿下，北面工事里的鬼子端着刺刀反扑
      this.flags.backPending = 1;
      this.after(4, () => {
        this.flags.backPending = 0;
        if (this.phase !== 4 || this.over) return;
        for (const s of [-1, 1]) { this.spawnWave(s * 11, -56, 3, 1, 'B', 10); }
        ui.say('张大彪', '北边的鬼子反扑过来了，拼刺刀！', { now: true });
      });
      this.vo('ljp_pingfen', 14.0, () => {
        ui.say('战士', '好身手，兄弟！', { now: true, dur: 2.0 });
        ui.say('和尚', '干得漂亮，看我的！小日本，来啊！', { dur: 4.2 });
        ui.say('战士', '又出现两个。', { dur: 3.6 });
        ui.say('和尚', '这两个，俺包圆了。', { dur: 1.4 });
        ui.say('战士', '那不行，咱俩平分。', { dur: 1.3 });
        ui.say('和尚', '不成，俺包了。', { dur: 0.9 });
        ui.say('战士', '平分！', { dur: 0.8 });
      });
    }
    if (!this.flags.wClear && !this.groupAlive('W')) { this.flags.wClear = 1; this.addScore(600); this.spawnMed(-23, -48); }
    if (!this.flags.eClear && !this.groupAlive('E')) { this.flags.eClear = 1; this.addScore(600); this.spawnMed(23, -48); }
    if (this.flags.fClear && this.flags.wClear && this.flags.eClear && this.phaseT > 6 && !this.groupAlive('B') && !this.flags.p4done && !this.flags.backPending) {
      this.flags.p4done = 1;
      ui.stamp('环形工事拿下了！', 1.5);
      ui.say('张大彪', '团长，山崎缩进指挥所了！', { now: true });
      ui.say('李云龙', '给我围起来！', {});
      this.after(3, () => { if (this.phase === 4 && !this.over) this.enterPhase(5, false); });
    }
  }

  // 第五阶段：炸哑射击孔，逼山崎出来拼刀
  yamazakiScene() {
    const ui = this.ui, d = this.world.cp.door, y = L.top;
    this.cutVoices();
    const b = spawnYamazaki(this);
    for (const s of [-1, 1]) { const e = this.addUnit('enemy', 'officer', d.x + s * 2.2, d.z + 0.6, { group: 'guard', yaw: Math.PI }); e.active = true; e.stT = 1.2; }
    this.cutCam = { px: d.x + 3.4, py: y + 2.0, pz: d.z + 6.5, lx: d.x, ly: y + 1.6, lz: d.z };
    this.audio.voice('ljp_qishi');
    ui.say('山崎', '混蛋！什么乱七八糟的，还都以为自己是中世纪的骑士，动不动就决斗。', { now: true, foe: true, dur: 8.2 });
    ui.say('山崎', '混蛋，攻击！', { foe: true, dur: 3.5 });
    this.playScene(11.9, [[8.2, () => { ui.stamp('山崎出来了！', 1.4, 'red'); this.cutCam = { px: d.x + 1.2, py: y + 1.8, pz: d.z + 3.2, lx: b.x, ly: y + 1.7, lz: b.z }; }]], () => {
      this.sub = 'boss';
      this.after(0.8, () => ui.toast(this.app.isTouch() ? '山崎的刀能格开子弹：等他出刀落空、收刀喘气（血条闪）时再打；或者拔刀和他拼：刀到的一瞬间按格挡就能弹开' : '山崎的刀能格开子弹：等他出刀落空、收刀喘气（血条闪）时再打；或者 Q 拔刀和他拼：刀到的一瞬间按右键格挡就能弹开', 6));
    });
  }
  updateFinal() {
    const b = this.boss;
    if (this.sub === 'ports' && !this.flags.portTip && this.phaseT > 30 && this.stats.ports === 0) {
      this.flags.portTip = 1;
      this.ui.toast('射击孔正面打不进去：绕到侧面，离孔六米以外把准星压在孔边上扔手榴弹', 5);
    }
    if (this.sub === 'boss' && b && !b.alive && !this.flags.won) this.victory();
  }
  victory() {
    this.cutVoices();
    const ui = this.ui, h = this.hero;
    this.flags.won = 1;
    this.addScore(3000);
    for (const e of this.enemies) if (e.alive) this.killUnit(e, true);
    this.bullets.length = 0; this.fx.clearWarnings(); this.mortars.forEach((m) => m.mesh && this.scene.remove(m.mesh)); this.mortars.length = 0;
    for (const al of this.allies) { al.hold = false; al.cheer = 0.01; }
    this.world.flag.visible = false;
    this.audio.play('win');
    ui.stamp('李家坡拿下来了！', 2.2);
    this.audio.voice('ljp_candi');
    ui.say('李云龙', '快，尽快解决残敌，能用枪的尽量用枪解决战斗！', { now: true, dur: 5.0 });
    const gy = this.groundY(h.x, h.z);
    this.cutCam = { px: h.x + 3, py: gy + 2.4, pz: h.z + 5, lx: h.x, ly: gy + 1.4, lz: h.z };
    this.playScene(7.5, [[3, () => { this.cutCam = { px: L.cp.x + 10, py: L.top + 6, pz: L.cp.z + 16, lx: L.cp.x, ly: L.top + 2, lz: L.cp.z }; }]], () => this.finish(true));
  }

  finish(win) {
    if (this.over) return;
    this.over = true;
    const s = this.stats;
    if (win) this.addScore(Math.max(0, 3000 - Math.round(this.t) * 3));
    const score = Math.max(0, this.score - s.deaths * 300 - s.retries * 300);
    const rank = score >= 37000 ? '亮剑团长' : score >= 29000 ? '独立团的老兵' : score >= 22000 ? '合格的突击排长' : '炊事班长';
    const quote = win
      ? '原作里，独立团就是这么拿下李家坡的：土工作业把交通壕掘进到离环形工事三十米，一营三千六百颗手榴弹两分钟扔完，突击队上刺刀冲进工事。<br>要是打得过瘾，回 B 站给视频点个三连，就当给独立团发军饷了。'
      : '李云龙：“胜败乃兵家常事，重整队伍，再来！”';
    this.app.onResult({
      win, rank, quote, score, demo: s.demo, ending: '', title: '',
      rows: [
        ['用时', fmtTime(this.t)], ['歼敌', s.kills], ['交通壕', s.p2T ? '挖了 ' + fmtTime(s.p2T) + '（亲手挖 ' + Math.round(s.heroDug) + ' 米）' : '—'],
        ['手榴弹雨', s.volleys ? s.volleys + ' 轮 · ' + s.volleys * PER_VOLLEY + ' 颗' + (s.bunkerHelp ? ' · 张大彪补了 ' + s.bunkerHelp + ' 个碉堡' : ' · 三个碉堡全炸了') : '—'],
        ['射击孔', s.ports + ' / 4'], ['拼刀成功', s.clash], ['弹开', s.parry], ['子弹被山崎格开', s.deflect], ['阵亡', s.deaths], ['受击', s.hurt], ['爆头', s.heads],
        ['规则', (this.app.get('lives') === 'inf' ? '无限命' : '经典 3 命') + ' · ' + ({ std: '标准', easy: '宽松', one: '一发' }[this.app.get('armor')])],
      ],
    });
  }
}
