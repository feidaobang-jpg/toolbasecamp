// 浏览器里运行的自动操作脚本（验收用）：走键盘输入层按键，用“鼠标拖动”的输入通道转准星，自己瞄、自己打
// 它不躲子弹、不找掩体，只用来检查流程不软锁、估计压力，不能代替真人试玩。
// 使用：先 window.__W = await import('./js/world.js')，再 window.__bot = window.__installBot()，每帧调用 __bot(dt)
window.__installBot = function () {
  const g = __lj.game, app = __lj.app, inp = app.input, W = window.__W;
  const K = {};
  const set = (code, on) => { if (!!K[code] === !!on) return; K[code] = !!on; inp.key(code, !!on, false); };
  const tap = (code) => { inp.key(code, true, false); inp.key(code, false, false); };
  const S = { stuckT: 0, lx: 0, lz: 0, side: 0, sideT: 0, nadeT: 0, wp: 0, lootDone: false, circ: 1, circT: 0, aim: null, tgt: null, tgtT: 0 };
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
    // 卡住时先跳一下（铁丝网、矮沙袋），还不行就横向绕
    S.stuckT += dt;
    if (S.stuckT > 0.6) {
      if (d > stop && dist(h.x, h.z, S.lx, S.lz) < 0.4) { tap('KeyK'); S.stuckN = (S.stuckN || 0) + 1; if (!S.side || S.stuckN % 3 === 0) S.side = S.side > 0 ? -1 : 1; S.sideT = 1.0; }
      S.lx = h.x; S.lz = h.z; S.stuckT = 0;
    }
    if (S.sideT > 0) { S.sideT -= dt; const px = -dz * S.side, pz = dx * S.side; dx = px + dx * 0.25; dz = pz + dz * 0.25; }
    steer(dx, dz, d > stop);
    return d;
  }
  const alive = (f) => g.enemies.filter((e) => e.alive && f(e));
  const nearest = (list) => { let b = null, bd = 1e9; for (const e of list) { const d = dist(e.x, e.z, g.hero.x, g.hero.z); if (d < bd) { bd = d; b = e; } } return b; };
  const sees = (e) => !W.losBlocked(g.world, g.hero.x, g.hero.z, e.x, e.z, 0, g.hero.y + 1.35, e.y + 1.35);
  // 把准星转向目标：换算成“拖动”增量喂给输入层
  function aimAt(x, y, z) {
    const cam = g.camera.position;
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    let ey = Math.atan2(-dx, -dz) - g.cam.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
    const ep = Math.atan2(dy, Math.hypot(dx, dz)) - g.cam.pitch;
    const w = Math.max(320, app.size()[0]);
    inp._look((-ey * 0.4 / 3.0) * w, (-ep * 0.4 / 2.4) * w, 'mouse');
    return Math.hypot(ey, ep);
  }
  // 选目标并开火；返回当前目标
  function combat(dt, only) {
    const h = g.hero;
    S.nadeT -= dt; S.tgtT -= dt;
    if (S.tgtT <= 0 || !S.tgt || !S.tgt.alive) {
      S.tgtT = 0.3;
      let best = null, bs = 1e9;
      for (const e of g.enemies) {
        if (!e.alive || (only && !only(e))) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z, e.y - h.y);
        if (d > 48) continue;
        const s = d + (sees(e) ? 0 : 200) + (e.y > 2 ? 12 : 0);
        if (s < bs) { bs = s; best = e; }
      }
      S.tgt = best && bs < 150 ? best : null;
    }
    const t = S.tgt;
    if (!t) { set('KeyJ', false); return null; }
    const err = aimAt(t.x, t.y + 1.3 * t.model.scale, t.z);
    set('KeyJ', err < 0.035 || g.aim.target === t);
    const d = dist(h.x, h.z, t.x, t.z);
    if (S.nadeT <= 0 && h.nades > 0 && t.y < 2 && d < 20 && d > 7 && err < 0.2) { tap('KeyL'); S.nadeT = 2.4; }
    if (h.dashCd <= 0 && t.y < 2 && t.type !== 'boss' && d < 5 && err < 0.4) tap('KeyU');
    if (h.cavCd <= 0 && g.phase !== 5 && g.phase !== 3 && err < 0.5 && alive((e) => e.active && e.y < 2 && dist(e.x, e.z, h.x, h.z) < 42).length >= 3) tap('KeyI');
    return t;
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
  // 没有可见目标时朝前进方向看，免得背对着走
  function lookAlong(tx, tz) { const h = g.hero; if (dist(h.x, h.z, tx, tz) > 2) aimAt(tx, 1.4, tz); }

  return function bot(dt) {
    const h = g.hero, c = g.cannon, p = g.phase;
    if (app.state !== 'play' || !h.alive || g.cut > 0) { for (const k of Object.keys(K)) set(k, false); return; }
    if (p === 1) {
      const t = combat(dt);
      const pre = alive((e) => e.group === 'pre');
      if (pre.length) { const e = nearest(pre); goTo(e.x, e.z, t ? 14 : 4, dt); if (!t) lookAlong(e.x, e.z); return; }
      for (const [grp, fx, fz] of [['A', -9, 58.6], ['B', 8.2, 38.4]]) {
        const mg = alive((e) => e.group === grp && e.type === 'mg')[0];
        const rest = alive((e) => e.group === grp);
        if (!rest.length) continue;
        if (mg) { goTo(fx, fz, 1.2, dt); if (!t) lookAlong(mg.x, mg.z); return; }
        const e = nearest(rest); goTo(e.x, e.z, t ? 11 : 3, dt); if (!t) lookAlong(e.x, e.z); return;
      }
      const r = nearest(alive((e) => e.group === 'R'));
      if (r) { goTo(r.x, r.z, t ? 13 : 4, dt); if (!t) lookAlong(r.x, r.z); } else steer(0, 0, false);
    } else if (p === 2) {
      const t = combat(dt);
      const threat = nearest(alive((e) => e.y < 2 && e.active && dist(e.x, e.z, c.x, c.z) < 28));
      if (threat) { goTo(threat.x, threat.z, t ? 11 : 4, dt); if (!t) lookAlong(threat.x, threat.z); } else { goTo(c.x + 3, c.z + 2.5, 1.5, dt); if (!t) lookAlong(c.x, c.z - 30); }
    } else if (p === 3) {
      if (!c.manned) {
        set('KeyJ', false);
        const d = goTo(c.x + 0.4, c.z + 2.2, 0.8, dt);
        lookAlong(c.x, c.z - 20);
        if (d < 2.6) tap('KeyF');
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
      const t = combat(dt);
      const street = alive((e) => e.group.startsWith('S'));
      const s1 = street.filter((e) => e.group === 'S1');
      if (s1.length) { const e = nearest(s1); goTo(e.x, e.z, t ? 14 : 1.5, dt); if (!t) lookAlong(e.x, e.z); return; }
      const mg = street.find((e) => e.type === 'mg');
      if (mg) { goTo(-4.2, -61, 1.2, dt); if (!t) lookAlong(mg.x, mg.z); if (dist(h.x, h.z, -4.2, -61) < 2 && !t) goTo(-4.8, -70.5, 1, dt); return; }
      if (!g.flags.loot && !S.lootDone) {
        const path = [[0, -61], [15, -61], [15, -69], [15.5, -73]];
        const [x, z] = path[Math.min(S.wp, path.length - 1)];
        if (goTo(x, z, 1.0, dt) < 1.3) S.wp++;
        if (!t) lookAlong(x, z);
        if (S.wp >= path.length) S.lootDone = true;
        return;
      }
      if (h.x > 8 && h.z < -65) { goTo(15, -61, 1, dt); if (!t) lookAlong(15, -61); return; }
      if (street.length) { const e = nearest(street); if (Math.abs(h.x) > 7 && h.z > -65) { goTo(-4.4, -60.5, 1, dt); } else goTo(e.x, e.z, t ? 12 : 3, dt); if (!t) lookAlong(e.x, e.z); return; }
      if (h.z > -66 && Math.abs(h.x + 4.6) > 1.5) { goTo(-4.6, Math.min(h.z, -60.5), 1, dt); lookAlong(-4.6, -70); return; }
      if (h.z > -76) { goTo(-4.6, -77, 1, dt); lookAlong(-4.6, -80); return; }
      goTo(0, -87, 0.5, dt); lookAlong(0, -95);
    } else if (p === 5) {
      const b = g.boss;
      if (!b || !b.alive) { steer(0, 0, false); set('KeyJ', false); return; }
      combat(dt);
      const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 1;
      S.circT -= dt; if (S.circT <= 0) { S.circT = 2.5 + Math.random() * 2; S.circ = -S.circ; }
      let mx = (-dz / d) * S.circ, mz = (dx / d) * S.circ;
      if (d > 12) { mx += dx / d; mz += dz / d; } else if (d < 7) { mx -= dx / d; mz -= dz / d; }
      // 红线预警：侧移；临出刀时有时亮剑拼刀、有时起跳
      if (b.state === 'dashTele') {
        const side = (h.x - b.x) * (-b.dz) + (h.z - b.z) * b.dx > 0 ? 1 : -1;
        mx = -b.dz * side; mz = b.dx * side;
        if (b.stT < 0.16 && d < 9) { const r = Math.random(); if (r < 0.4 && h.dashCd <= 0) { mx = dx / d; mz = dz / d; steer(mx, mz, true); tap('KeyU'); return; } else if (r < 0.7) tap('KeyK'); }
      }
      const cx = 0 - h.x, cz = -92 - h.z;
      if (Math.abs(h.x) > 13 || h.z > -84.5 || h.z < -100.5) { mx += cx * 0.2; mz += cz * 0.2; }
      steer(mx, mz, true);
    }
  };
};
