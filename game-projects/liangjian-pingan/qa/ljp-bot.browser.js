// 李家坡自动操作（验收用）：走键盘输入层，用“鼠标拖动”通道转准星，自己瞄、自己打、自己挖壕和喊投弹。
// 它不躲子弹、不找掩体，只检查流程不软锁、估计压力，不能代替真人试玩。
window.__installLjpBot = function () {
  const g = __lj.game, app = __lj.app, inp = app.input, W = window.__W;
  const K = {};
  const set = (code, on) => { if (!!K[code] === !!on) return; K[code] = !!on; inp.key(code, !!on, false); };
  const tap = (code) => { inp.key(code, true, false); inp.key(code, false, false); };
  const S = { stuckT: 0, lx: 0, lz: 0, side: 0, sideT: 0, nadeT: 0, tgt: null, tgtT: 0, circ: 1, circT: 0, useT: 0, wp: 0 };
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const stop = () => { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) set(k, false); };
  function steer(dx, dz, go) {
    const yaw = g.cam.yaw, d = Math.hypot(dx, dz) || 1;
    const mx = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, my = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / d;
    set('KeyD', go && mx > 0.38); set('KeyA', go && mx < -0.38); set('KeyW', go && my > 0.38); set('KeyS', go && my < -0.38);
  }
  function goTo(tx, tz, stopD, dt) {
    const h = g.hero;
    let dx = tx - h.x, dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    S.stuckT += dt;
    if (S.stuckT > 0.6) {
      if (d > stopD && dist(h.x, h.z, S.lx, S.lz) < 0.4) { tap('KeyK'); S.stuckN = (S.stuckN || 0) + 1; if (!S.side || S.stuckN % 3 === 0) S.side = S.side > 0 ? -1 : 1; S.sideT = 1.0; }
      S.lx = h.x; S.lz = h.z; S.stuckT = 0;
    }
    if (S.sideT > 0) { S.sideT -= dt; const px = -dz * S.side, pz = dx * S.side; dx = px + dx * 0.25; dz = pz + dz * 0.25; }
    steer(dx, dz, d > stopD);
    return d;
  }
  // 依次走过路点（绕开坡中间的机枪封锁区）
  function route(pts, dt, stopD = 1.5) {
    const h = g.hero;
    while (S.wp < pts.length - 1 && dist(h.x, h.z, pts[S.wp][0], pts[S.wp][1]) < 3) S.wp++;
    const p = pts[Math.min(S.wp, pts.length - 1)];
    return goTo(p[0], p[1], S.wp >= pts.length - 1 ? stopD : 0.5, dt);
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
  function combat(dt, only, noBoom, range = 46) {
    const h = g.hero;
    S.nadeT -= dt; S.tgtT -= dt;
    if (S.tgtT <= 0 || !S.tgt || !S.tgt.alive) {
      S.tgtT = 0.3;
      let best = null, bs = 1e9;
      for (const e of g.enemies) {
        if (!e.alive || (only && !only(e))) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z);
        if (d > range) continue;
        const s = d + (sees(e) ? 0 : 200);
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
      if (h.dashCd <= 0 && t.type !== 'boss' && d < 5 && err < 0.4) tap('KeyL');
      if (h.cavCd <= 0 && err < 0.5 && !g.cavalryBlocked() && alive((e) => e.active && dist(e.x, e.z, h.x, h.z) < 40).length >= 4) tap('KeyN');
    }
    return t;
  }
  function lookAlong(tx, tz, ty) { const h = g.hero; if (dist(h.x, h.z, tx, tz) > 2) aimAt(tx, ty === undefined ? h.y + 1.4 : ty, tz); }
  const tr = g.world.trench;
  const tp = (t) => tr.pointAt(Math.max(0.3, Math.min(tr.total, t)));

  return function bot(dt) {
    const h = g.hero, p = g.phase;
    if (app.state !== 'play' || !h.alive || g.cut > 0) { for (const k of Object.keys(K)) set(k, false); S.wp = 0; return; }
    S.useT -= dt;
    if (p === 1) {
      const t = combat(dt);
      const L = window.__L;
      if (!g.flags.pl) {
        const e = nearest(alive((x) => x.group === 'PL'));
        if (e && t && dist(h.x, h.z, e.x, e.z) < 16) { stop(); return; }
        // 从火力点东侧绕上去（正面有铁丝网，沙袋打不穿）
        route([[-19, 44], [-19, 30], [L.postL.x + 8, L.postL.z + 1]], dt, t ? 4 : 1.5);
        if (!t) lookAlong(L.postL.x, L.postL.z);
      } else {
        // 绕开坡中间：先退到坡脚再往东
        const e = nearest(alive((x) => x.group === 'PR' || x.group === 'P1x'));
        if (!S.p1b) { S.p1b = 1; S.wp = 0; }
        route([[-24, 40], [0, 42], [18, 40], [18, 30], [L.postR.x - 8, L.postR.z + 1]], dt, t ? 4 : 1.5);
        if (!t) lookAlong(L.postR.x, L.postR.z);
      }
    } else if (p === 2) {
      const head = tp(tr.dug), stand = tp(tr.dug - 0.9), back = tp(tr.dug - 4.5);
      const threat = alive((e) => e.active && e.type !== 'mortar' && dist(e.x, e.z, head.x, head.z) < 24);
      if (threat.length) {
        if (g.digging) tap('KeyI');
        const t = combat(dt, (e) => e.type !== 'mortar', false, 30);
        goTo(back.x, back.z, 1.0, dt);
        if (!t) lookAlong(threat[0].x, threat[0].z);
        return;
      }
      set('KeyJ', false);
      if (g.lit) { if (g.digging) tap('KeyI'); goTo(back.x, back.z, 0.8, dt); lookAlong(head.x, head.z - 10); return; }
      const d = dist(h.x, h.z, stand.x, stand.z);
      if (g.digging) { stop(); return; }
      goTo(stand.x, stand.z, 0.5, dt);
      lookAlong(head.x + head.dx * 6, head.z + head.dz * 6);
      if (d < 1.6 && S.useT <= 0) { stop(); tap('KeyI'); S.useT = 0.6; }
    } else if (p === 3) {
      const end = tp(tr.total - 2.5);
      goTo(end.x, end.z, 1.0, dt);
      const b = g.world.bunkers.filter((q) => q.alive).sort((a, c) => dist(a.x, a.z, h.x, h.z) - dist(c.x, c.z, h.x, h.z))[0];
      set('KeyJ', false);
      if (!b) return;
      const err = aimAt(b.x, b.y + 0.4, b.z + 1.2);
      if (g.flags.signal && g.volleyCd <= 0 && g.mark.ok && err < 0.03 && S.useT <= 0) { tap('KeyU'); S.useT = 0.5; }
    } else if (p === 4) {
      const t = combat(dt, (e) => ['F', 'W', 'E', 'B'].includes(e.group));
      const e = nearest(alive((x) => ['F', 'W', 'E', 'B'].includes(x.group)));
      if (!e) { stop(); return; }
      goTo(e.x, e.z, t ? (e.type === 'officer' ? 3 : 9) : 2, dt);
      if (!t) lookAlong(e.x, e.z);
    } else if (p === 5) {
      const b = g.boss;
      if (g.sub === 'boss' && b && b.alive) {
        const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 1;
        const open = b.state === 'recover' || b.state === 'stun';
        const t = combat(dt, (e) => e === b || e.group === 'guard' || e.group === 'G', true);
        if (t === b) set('KeyJ', open && g.aim.target === b);
        S.circT -= dt; if (S.circT <= 0) { S.circT = 2 + Math.random() * 2; S.circ = -S.circ; }
        let mx = (-dz / d) * S.circ, mz = (dx / d) * S.circ;
        if (open) { if (d > 6) { mx += dx / d; mz += dz / d; } }
        else if (d < 6) { mx -= dx / d * 1.5; mz -= dz / d * 1.5; } else if (d > 11) { mx += dx / d; mz += dz / d; }
        if (b.state === 'dashTele') {
          const side = (h.x - b.x) * (-b.dz) + (h.z - b.z) * b.dx > 0 ? 1 : -1;
          mx = -b.dz * side; mz = b.dx * side;
          if (b.stT < 0.18 && d < 10) { const r = Math.random(); if (r < 0.5 && h.dashCd <= 0) { steer(dx / d, dz / d, true); tap('KeyL'); return; } else if (r < 0.75) tap('KeyK'); }
        }
        if (b.state === 'stun' && d < 5 && h.dashCd <= 0) { steer(dx / d, dz / d, true); tap('KeyL'); return; }
        steer(mx, mz, true);
        return;
      }
      if (g.sub === 'ports') {
        const ports = g.world.cp.ports.filter((q) => q.alive);
        const guards = alive((e) => e.group === 'G' && dist(e.x, e.z, h.x, h.z) < 16 && sees(e));
        if (guards.length) { const t = combat(dt, (e) => e.group === 'G', true); goTo(h.x, h.z, 9, dt); if (!t) stop(); return; }
        const q = ports.sort((a, c) => dist(a.x, a.z, h.x, h.z) - dist(c.x, c.z, h.x, h.z))[0];
        if (!q) { stop(); return; }
        // 站到射击孔扇面外侧、离孔约 8 米的地方扔
        const side = q.k === 0 ? -1 : 1, ang = q.face + side * 1.5;
        const sx = q.x - Math.sin(ang) * 8, sz = q.z - Math.cos(ang) * 8;
        const d = goTo(sx, sz, 1.0, dt);
        // 准星压在射击孔正前方的地面上（手榴弹落在孔下）
        const ax = q.x - Math.sin(q.face) * 0.5, az = q.z - Math.cos(q.face) * 0.5;
        const err = aimAt(ax, g.groundY(ax, az) + 0.05, az);
        set('KeyJ', false);
        if (d < 2 && h.nades > 0 && err < 0.04 && S.useT <= 0) { tap('KeyU'); S.useT = 1.0; }
        return;
      }
      stop();
    }
  };
};
