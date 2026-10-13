// 自动通关：用脚本按键（走键盘输入层）从第一阶段打到结算，检查流程不软锁、不报错，并统计各阶段耗时/受击/阵亡
// 这是自动化操作，只用来验证流程和压力大小，不能代替真人试玩手感。
// 用法：node playthrough.cjs [起始阶段] [armor: std|easy|one] ；SHOTS=1 时在关键时刻截图
const { open, shot } = require('./lib.cjs');
const startPhase = +(process.argv[2] || 1);
const armor = process.argv[3] || 'std';
const SHOTS = process.env.SHOTS === '1';

function installBot() {
  const g = __lj.game, app = __lj.app, inp = app.input;
  const K = {};
  const set = (code, on) => { if (!!K[code] === !!on) return; K[code] = !!on; inp.key(code, !!on, false); };
  const tap = (code) => { inp.key(code, true, false); inp.key(code, false, false); };
  const S = { stuckT: 0, lx: 0, lz: 0, side: 0, sideT: 0, nadeT: 0, wp: 0, lootDone: false, circ: 1, circT: 0, aim: null };
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  function steer(dx, dz, go) {
    const yaw = g.cam.yaw, d = Math.hypot(dx, dz) || 1;
    const mx = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, my = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / d;
    set('KeyD', go && mx > 0.38); set('KeyA', go && mx < -0.38); set('KeyW', go && my > 0.38); set('KeyS', go && my < -0.38);
  }
  function goTo(tx, tz, stop, dt) {
    const h = g.hero;
    let dx = tx - h.x, dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    // 卡住时横向绕一下
    S.stuckT += dt;
    if (S.stuckT > 0.8) {
      if (d > stop && dist(h.x, h.z, S.lx, S.lz) < 0.5) { S.side = S.side > 0 ? -1 : 1; S.sideT = 0.7; }
      S.lx = h.x; S.lz = h.z; S.stuckT = 0;
    }
    if (S.sideT > 0) { S.sideT -= dt; const px = -dz * S.side, pz = dx * S.side; dx = px + dx * 0.3; dz = pz + dz * 0.3; }
    steer(dx, dz, d > stop);
    return d;
  }
  const alive = (f) => g.enemies.filter((e) => e.alive && f(e));
  const nearest = (list) => { let b = null, bd = 1e9; for (const e of list) { const d = dist(e.x, e.z, g.hero.x, g.hero.z); if (d < bd) { bd = d; b = e; } } return b; };
  function combat(dt) {
    const h = g.hero;
    set('KeyJ', true);
    S.nadeT -= dt;
    const t = h.lock;
    if (t && S.nadeT <= 0 && h.nades > 0 && t.y < 2 && dist(h.x, h.z, t.x, t.z) < 21) { tap('KeyK'); S.nadeT = 2.2; }
    if (t && h.dashCd <= 0 && t.y < 2 && t.type !== 'boss' && dist(h.x, h.z, t.x, t.z) < 6) tap('KeyU');
    if (h.cavCd <= 0 && g.phase !== 5 && g.phase !== 3 && alive((e) => e.active && e.y < 2 && dist(e.x, e.z, h.x, h.z) < 42).length >= 3) tap('KeyI');
  }
  function solve(type, ref) {
    const c = g.cannon;
    const tx = type === 'bunker' ? ref.x : 0, tz = type === 'bunker' ? ref.z - 1 : -19;
    const yaw = Math.atan2(-(tx - c.x), -(tz - c.z));
    let lo = -1, hi = -1;
    for (let el = 0.03; el <= 0.7; el += 0.004) {
      const hit = g.simShell(yaw, el, false);
      const ok = hit.type === type && (type !== 'bunker' || hit.ref === ref);
      if (ok) { if (lo < 0) lo = el; hi = el; } else if (lo >= 0) break;
    }
    return lo < 0 ? null : { yaw, el: (lo + hi) / 2 };
  }
  return function bot(dt) {
    const h = g.hero, c = g.cannon, p = g.phase;
    if (app.state !== 'play' || !h.alive || g.cut > 0) { for (const k of Object.keys(K)) set(k, false); return; }
    if (p === 1) {
      combat(dt);
      const pre = alive((e) => e.group === 'pre');
      if (pre.length) { const e = nearest(pre); goTo(e.x, e.z, 13, dt); return; }
      for (const [grp, fx, fz] of [['A', -9, 58.6], ['B', 8.2, 38.4]]) {
        const mg = alive((e) => e.group === grp && e.type === 'mg')[0];
        const rest = alive((e) => e.group === grp);
        if (!rest.length) continue;
        if (mg) { goTo(fx, fz, 1.2, dt); return; }
        const e = nearest(rest); goTo(e.x, e.z, 11, dt); return;
      }
      steer(0, 0, false);
    } else if (p === 2) {
      combat(dt);
      const threat = nearest(alive((e) => e.y < 2 && e.active && dist(e.x, e.z, c.x, c.z) < 26));
      if (threat) goTo(threat.x, threat.z, 10, dt); else goTo(c.x + 3, c.z + 2.5, 1.5, dt);
    } else if (p === 3) {
      if (!c.manned) {
        set('KeyJ', false);
        const d = goTo(c.x + 0.4, c.z + 2.2, 0.8, dt);
        if (d < 2.6) tap('KeyJ');
        return;
      }
      steer(0, 0, false);
      const w = g.world;
      let type = null, ref = null;
      const b = w.bunkers.find((k) => k.alive);
      if (b) { type = 'bunker'; ref = b; } else if (w.gate.alive) type = 'gate'; else if (w.tower.alive) type = 'tower';
      if (!type) { set('KeyJ', false); return; }
      const key = type + (ref ? ref.id : '');
      if (!S.aim || S.aim.key !== key) { S.aim = solve(type, ref); if (S.aim) S.aim.key = key; }
      if (!S.aim) return;
      const dy = S.aim.yaw - g.cam.yaw, de = S.aim.el - c.elev;
      set('KeyA', dy > 0.006); set('KeyD', dy < -0.006); set('KeyW', de > 0.003); set('KeyS', de < -0.003);
      const ready = Math.abs(dy) < 0.012 && Math.abs(de) < 0.006;
      set('KeyJ', ready && c.reload <= 0 && c.shells > 0);
    } else if (p === 4) {
      combat(dt);
      const street = alive((e) => e.group.startsWith('S'));
      const s1 = street.filter((e) => e.group === 'S1');
      if (s1.length) { const e = nearest(s1); goTo(e.x, e.z, 13, dt); return; }
      const mg = street.find((e) => e.type === 'mg');
      if (mg) { goTo(-5.2, -62, 1.2, dt); if (dist(h.x, h.z, -5.2, -62) < 2) { const o = nearest(street.filter((e) => e !== mg)); if (!o && h.nades <= 0) goTo(-5.2, -70.5, 1, dt); } return; }
      if (!g.flags.loot && !S.lootDone) {
        const path = [[0, -61], [15, -61], [15, -69], [15.5, -73]];
        const [x, z] = path[Math.min(S.wp, path.length - 1)];
        if (goTo(x, z, 1.0, dt) < 1.3) S.wp++;
        if (S.wp >= path.length) S.lootDone = true;
        return;
      }
      if (street.length) { const e = nearest(street); if (h.x > 8 && h.z < -65) { goTo(15, -61, 1, dt); return; } if (Math.abs(h.x) > 7 && h.z > -65) { goTo(-5, -61, 1, dt); return; } goTo(e.x, e.z, 11, dt); return; }
      if (h.x > 8 && h.z < -65) { goTo(15, -61, 1, dt); return; }
      if (h.z > -66 && Math.abs(h.x + 5) > 1.5 && h.z > -75) { goTo(-5, Math.min(h.z, -61), 1, dt); return; }
      if (h.z > -76) { goTo(-5, -77, 1, dt); return; }
      goTo(0, -87, 0.5, dt);
    } else if (p === 5) {
      const b = g.boss;
      if (!b || !b.alive) { steer(0, 0, false); set('KeyJ', false); return; }
      combat(dt);
      const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 1;
      S.circT -= dt; if (S.circT <= 0) { S.circT = 2.5 + Math.random() * 2; S.circ = -S.circ; }
      let mx = (-dz / d) * S.circ, mz = (dx / d) * S.circ;
      if (d > 12) { mx += dx / d; mz += dz / d; } else if (d < 7) { mx -= dx / d; mz -= dz / d; }
      // 躲红线：沿垂直方向离开突进线
      if (b.state === 'dashTele') {
        const side = (h.x - b.x) * (-b.dz) + (h.z - b.z) * b.dx > 0 ? 1 : -1;
        mx = -b.dz * side; mz = b.dx * side;
        if (b.stT < 0.16 && h.dashCd <= 0 && d < 9 && Math.random() < 0.6) tap('KeyU');
      }
      // 离墙太近就往院子中间靠
      const cx = 0 - h.x, cz = -92 - h.z;
      if (Math.abs(h.x) > 13 || h.z > -84.5 || h.z < -100.5) { mx += cx * 0.2; mz += cz * 0.2; }
      steer(mx, mz, true);
    }
  };
}

(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(([sp, ar]) => { const a = __lj.app; a.s.startPhase = sp; a.s.armor = ar; a.s.view = 0; a.s.lives = 'inf'; a.s.danmaku = true; }, [startPhase, armor]);
  await page.keyboard.press('Enter');
  await page.evaluate(`window.__bot = (${installBot.toString()})(); __lj.manual(true);`);
  const log = [];
  let last = { phase: startPhase, t: 0, deaths: 0, hurt: 0 };
  let prev = { shells: 0, cav: 0, loot: 0, clash: 0, tower: 0, won: 0, phase: startPhase, genius: 0 };
  const t0 = Date.now();
  let done = null;
  for (let i = 0; i < 4000 && !done; i++) {
    const s = await page.evaluate(() => {
      for (let k = 0; k < 15; k++) { window.__bot(1 / 60); __lj.step(1, false); }
      __lj.step(0, true);
      const g = __lj.game, st = g.stats;
      return { state: __lj.app.state, phase: g.phase, t: g.t, deaths: st.deaths, hurt: st.hurt, shells: st.shells, cav: st.cav, loot: st.loot, clash: st.clash, tower: g.flags.towerDown ? 1 : 0, won: g.flags.won ? 1 : 0, genius: st.genius, kills: st.kills, hp: g.hero.hp, hx: +g.hero.x.toFixed(1), hz: +g.hero.z.toFixed(1), boss: g.boss ? Math.round(g.boss.hp) : null, cannon: Math.round(g.cannon.hp), retries: st.retries, score: g.score, enemies: g.enemies.filter((e) => e.alive).length };
    });
    if (s.phase !== prev.phase) {
      log.push({ phase: last.phase, seconds: +(s.t - last.t).toFixed(1), deaths: s.deaths - last.deaths, hurt: s.hurt - last.hurt });
      last = { phase: s.phase, t: s.t, deaths: s.deaths, hurt: s.hurt };
      if (SHOTS) await shot(page, `play-phase${s.phase}-start.png`);
    }
    if (SHOTS) for (const k of ['shells', 'cav', 'loot', 'clash', 'tower', 'won', 'genius']) if (s[k] > prev[k] && (k !== 'shells' || s[k] <= 2 || s.tower)) await shot(page, `play-${k}-${s[k]}.png`);
    prev = s;
    if (i % 120 === 0) console.log(`t=${s.t.toFixed(0)}s phase=${s.phase} hero=(${s.hx},${s.hz}) hp=${s.hp} deaths=${s.deaths} hurt=${s.hurt} kills=${s.kills} enemies=${s.enemies} cannon=${s.cannon} boss=${s.boss} retries=${s.retries}`);
    if (s.state === 'result') done = s;
    if (s.t > 900) { console.log('超时：15 分钟没打完'); break; }
  }
  if (done) {
    log.push({ phase: last.phase, seconds: +(done.t - last.t).toFixed(1), deaths: done.deaths - last.deaths, hurt: done.hurt - last.hurt });
    await page.waitForTimeout(200);
    if (SHOTS) await shot(page, 'play-result.png');
  }
  const res = await page.evaluate(() => ({ title: document.querySelector('#result .title2').textContent, rank: document.querySelector('#result .rank').textContent, total: document.querySelector('#result .total').textContent, stats: document.querySelector('#result .stats').textContent, hidden: document.getElementById('result').hidden }));
  const out = { at: new Date().toISOString(), startPhase, armor, finished: !!done, gameSeconds: done ? +done.t.toFixed(1) : null, wallSeconds: Math.round((Date.now() - t0) / 1000), phases: log, final: done, result: res, errors };
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, `out-playthrough-p${startPhase}-${armor}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(done && done.won && !errors.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
