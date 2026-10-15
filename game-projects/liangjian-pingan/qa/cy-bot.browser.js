// 苍云岭自动操作（验收用）：走键盘输入层，用“鼠标拖动”通道转准星，自己瞄、自己打。
// 它不躲子弹、不找掩体，只检查流程不软锁、估计压力，不能代替真人试玩。
// window.__route：'hit'＝第一发就算上风偏打中；'hit2'＝第一发不管风偏（打偏后按报告修正，第二发打中）；'miss'＝两发都故意打偏（走坂田 Boss）
window.__installCyBot = function () {
  const g = __lj.game, app = __lj.app, inp = app.input, W = window.__W, route = window.__route || 'hit';
  const K = {};
  const set = (code, on) => { if (!!K[code] === !!on) return; K[code] = !!on; inp.key(code, !!on, false); };
  const tap = (code) => { inp.key(code, true, false); inp.key(code, false, false); };
  const S = { stuckT: 0, lx: 0, lz: 0, side: 0, sideT: 0, nadeT: 0, tgt: null, tgtT: 0, circ: 1, circT: 0, aim: null };
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
  const nearest = (list, x = g.hero.x, z = g.hero.z) => { let b = null, bd = 1e9; for (const e of list) { const d = dist(e.x, e.z, x, z); if (d < bd) { bd = d; b = e; } } return b; };
  const sees = (e) => !W.losBlocked(g.world, g.hero.x, g.hero.z, e.x, e.z, 0, g.hero.y + 1.35, e.y + 1.35);
  function aimAt(x, y, z) {
    const cam = g.camera.position;
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    let ey = Math.atan2(-dx, -dz) - g.cam.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
    const ep = Math.atan2(dy, Math.hypot(dx, dz)) - g.cam.pitch;
    const w = Math.max(320, app.size()[0]);
    inp._look((-ey * 0.4 / 3.0) * w, (-ep * 0.4 / 2.4) * w, 'mouse');
    return Math.hypot(ey, ep);
  }
  // 选目标开火；noBoom=true 时不扔手榴弹（抓舌头时怕把军曹弄死）
  function combat(dt, only, noBoom) {
    const h = g.hero;
    S.nadeT -= dt; S.tgtT -= dt;
    if (S.tgtT <= 0 || !S.tgt || !S.tgt.alive || S.tgt.downed) {
      S.tgtT = 0.3;
      let best = null, bs = 1e9;
      for (const e of g.enemies) {
        if (!e.alive || e.downed || (only && !only(e))) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z);
        if (d > 46) continue;
        const s = d + (sees(e) ? 0 : 200) + (e.type === 'mortar' ? 25 : 0);
        if (s < bs) { bs = s; best = e; }
      }
      S.tgt = best && bs < 150 ? best : null;
    }
    const t = S.tgt;
    if (!t) { set('KeyJ', false); return null; }
    const err = aimAt(t.x, t.y + 1.3 * t.model.scale, t.z);
    set('KeyJ', err < 0.035 || g.aim.target === t);
    const d = dist(h.x, h.z, t.x, t.z);
    if (!noBoom) {
      if (S.nadeT <= 0 && h.nades > 0 && d < 20 && d > 7 && err < 0.2) { tap('KeyU'); S.nadeT = 2.4; }
    }
    return t;
  }
  function lookAlong(tx, tz) { const h = g.hero; if (dist(h.x, h.z, tx, tz) > 2) aimAt(tx, 1.4, tz); }

  // 迫击炮落点模拟：和游戏里出膛时加的风偏、射程误差一致
  function landing(yaw, el, shot) {
    const c = g.cannon, cfg = g.gunCfg, cy = Math.cos(el);
    let x = c.x - Math.sin(yaw) * cfg.barrel * cy, y = cfg.pivotY + Math.sin(el) * cfg.barrel, z = c.z - Math.cos(yaw) * cfg.barrel * cy;
    let vx = -Math.sin(yaw) * cy * cfg.speed, vy = Math.sin(el) * cfg.speed, vz = -Math.cos(yaw) * cy * cfg.speed;
    const T = 2 * vy / cfg.grav, err = g.rangeErr[Math.min(1, shot)];
    vx += (Math.cos(yaw) * g.wind + -Math.sin(yaw) * err) / T; vz += (-Math.sin(yaw) * g.wind + -Math.cos(yaw) * err) / T;
    let hit = null;
    for (let i = 0; i < 900 && !hit; i++) { vy -= cfg.grav * 0.016; x += vx * 0.016; y += vy * 0.016; z += vz * 0.016; hit = g.shellHit(x, y, z); }
    return { x, z };
  }
  // 找一组炮口方向和仰角，让落点离目标最近；wind=false 时按无风算（模拟没看风向的玩家）
  function solve(tx, tz, shot, wind) {
    const c = g.cannon, base = Math.atan2(-(tx - c.x), -(tz - c.z));
    const sv = g.wind; if (!wind) g.wind = 0;
    let best = null;
    for (let yaw = base - 0.14; yaw <= base + 0.14; yaw += 0.004) {
      for (let el = 0.79; el <= 1.46; el += 0.004) {
        const p = landing(yaw, el, shot), d = Math.hypot(p.x - tx, p.z - tz);
        if (!best || d < best.d) best = { yaw, el, d };
      }
    }
    g.wind = sv;
    return best;
  }

  return function bot(dt) {
    const h = g.hero, c = g.cannon, p = g.phase;
    if (app.state !== 'play' || !h.alive || g.cut > 0) { for (const k of Object.keys(K)) set(k, false); return; }
    if (p === 1) {
      const t = combat(dt);
      // 守在阵地中段；有鬼子钻进阵地就迎上去
      const inside = nearest(alive((e) => e.z > 58));
      if (inside) { goTo(inside.x, inside.z, t ? 6 : 2, dt); if (!t) lookAlong(inside.x, inside.z); }
      else { goTo(0, 63.6, 1.2, dt); if (!t) lookAlong(0, 30); }
    } else if (p === 2) {
      const tg = g.tongue;
      if (tg && tg.alive && tg.downed) {
        // 先把附近的鬼子收拾掉，再过去抓人
        const rest = alive((e) => !e.downed && e.type !== 'mortar' && dist(e.x, e.z, tg.x, tg.z) < 18);
        const t = combat(dt, (e) => e !== tg, true);
        if (rest.length && t) { goTo(t.x, t.z, 12, dt); return; }
        set('KeyJ', false);
        const d = goTo(tg.x, tg.z, 1.2, dt);
        lookAlong(tg.x, tg.z);
        if (d < 2.2) tap('KeyI');
        return;
      }
      const t = combat(dt, null, true);
      const tgt = tg && tg.alive ? tg : nearest(alive((e) => e.type !== 'mortar'));
      if (tgt) { goTo(tgt.x, tgt.z, t ? 13 : 3, dt); if (!t) lookAlong(tgt.x, tgt.z); } else steer(0, 0, false);
    } else if (p === 3) {
      const t = combat(dt);
      if (c.placed) { steer(0, 0, false); return; }
      const threat = nearest(alive((e) => e.type !== 'mortar' && dist(e.x, e.z, c.x, c.z) < 30), c.x, c.z);
      if (threat) { goTo(threat.x, threat.z, t ? 11 : 4, dt); if (!t) lookAlong(threat.x, threat.z); return; }
      const wp = g.pathI < 7 ? [[2, 55], [1, 40], [-3, 22], [-2, 5], [-5, -12], [-6, -32], [-6, -52]][g.pathI] : [c.x, c.z];
      const dx = wp[0] - c.x, dz = wp[1] - c.z, l = Math.hypot(dx, dz) || 1;
      goTo(c.x + dx / l * 7, c.z + dz / l * 7, 1.5, dt);
      if (!t) lookAlong(c.x + dx / l * 30, c.z + dz / l * 30);
    } else if (p === 4) {
      if (!c.manned) {
        const near = nearest(alive((e) => dist(e.x, e.z, c.x, c.z) < 22), c.x, c.z);
        const t = combat(dt);
        if (near && t) { steer(0, 0, false); return; }
        set('KeyJ', false);
        const d = goTo(c.x + 0.4, c.z + 2.2, 0.8, dt);
        lookAlong(c.x, c.z - 20);
        if (d < 2.6) tap('KeyI');
        return;
      }
      steer(0, 0, false);
      const shot = g.shots;
      if (!S.aim || S.aim.shot !== shot) {
        let tx = -22, tz = -125, wind = true;
        if (route === 'miss') { tx = -22 + (shot ? 14 : -12); tz = -125 + (shot ? 16 : 22); }
        if (route === 'hit2' && shot === 0) wind = false;
        S.aim = solve(tx, tz, shot, wind); S.aim.shot = shot;
      }
      const dy = S.aim.yaw - g.cam.yaw, de = S.aim.el - c.elev;
      set('KeyA', dy > 0.004); set('KeyD', dy < -0.004); set('KeyW', de > 0.003); set('KeyS', de < -0.003);
      const ready = Math.abs(dy) < 0.008 && Math.abs(de) < 0.006;
      set('KeyJ', ready && c.reload <= 0 && c.shells > 0);
    } else if (p === 5) {
      const b = g.boss;
      if (g.sub === 'boss' && b && b.alive) {
        combat(dt);
        const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 1;
        S.circT -= dt; if (S.circT <= 0) { S.circT = 2.5 + Math.random() * 2; S.circ = -S.circ; }
        let mx = (-dz / d) * S.circ, mz = (dx / d) * S.circ;
        if (d > 13) { mx += dx / d; mz += dz / d; } else if (d < 7) { mx -= dx / d; mz -= dz / d; }
        if (b.state === 'dashTele') {
          const side = (h.x - b.x) * (-b.dz) + (h.z - b.z) * b.dx > 0 ? 1 : -1;
          mx = -b.dz * side; mz = b.dx * side;
          if (b.stT < 0.16 && d < 9) { const r = Math.random(); if (r < 0.7) tap('KeyK'); }
        }
        // 别贴着帐篷和山坡
        if (h.z < -126) mz += 1; if (h.z > -98) mz -= 1;
        steer(mx, mz, true);
        return;
      }
      const t = combat(dt);
      if (g.sub === 'charge') { goTo(-22, -116, t ? 9 : 2, dt); if (!t) lookAlong(-22, -125); }
      else if (g.sub === 'hold') { goTo(-20, -114, 3, dt); }
      else if (g.sub === 'out') { const d = goTo(10, -154, 1, dt); if (!t || d < 30) lookAlong(10, -160); if (t && d > 30) set('KeyJ', true); }
      else steer(0, 0, false);
    }
  };
};
