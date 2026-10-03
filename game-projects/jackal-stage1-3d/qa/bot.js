// 自动试玩 bot：读取 ?test=1 快照与网格做决策，通过真实键盘事件（page.keyboard）操作吉普车。
// 任务顺序按第一关流程：炸营房 → 接俘虏 → 炸大门 → 过桥 → 打守桥坦克 → 隐藏星 → 丛林 → 直升机坪 → Boss。
// v0.2：护甲不满时顺手捡附近的修理包。
const DIRKEYS = [['KeyW'], ['KeyW', 'KeyD'], ['KeyD'], ['KeyS', 'KeyD'], ['KeyS'], ['KeyS', 'KeyA'], ['KeyA'], ['KeyW', 'KeyA']];
const DIR8 = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; DIR8.push({ x: Math.sin(a), y: Math.cos(a) }); }
const angTo = (ax, ay, bx, by) => Math.atan2(bx - ax, by - ay);
const q8 = (a) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

const MISSION = [
  { type: 'hut', name: 'H0' }, { type: 'pows', near: 'H0' },
  { type: 'hut', name: 'H1' }, { type: 'pows', near: 'H1' },
  { type: 'gate' },
  { type: 'hut', name: 'B1' }, { type: 'pows', near: 'B1' },
  { type: 'hut', name: 'B2' }, { type: 'pows', near: 'B2' },
  { type: 'goto', x: -22, y: 94 }, { type: 'goto', x: -21, y: 104 }, { type: 'goto', x: -21, y: 131 },
  { type: 'tank', x: -6, y: 140 }, { type: 'pows', at: [-6, 140] },
  { type: 'goto', x: -2, y: 147 }, { type: 'goto', x: -4, y: 172 },
  { type: 'hut', name: 'H2' }, { type: 'pows', near: 'H2' },
  { type: 'goto', x: 7, y: 182 }, { type: 'goto', x: 7, y: 200 },
  { type: 'star' },
  { type: 'goto', x: 8, y: 206 }, { type: 'goto', x: 10, y: 214 }, { type: 'goto', x: -14, y: 223 },
  { type: 'hut', name: 'H3' }, { type: 'pows', near: 'H3' },
  { type: 'goto', x: -14, y: 238 }, { type: 'goto', x: 12, y: 246 }, { type: 'goto', x: 12, y: 258 },
  { type: 'hut', name: 'H4' }, { type: 'pows', near: 'H4' },
  { type: 'pad' },
  { type: 'goto', x: 0, y: 300 }, { type: 'boss' }
];
// 第二关：军官屋 → 窄口 → 营地前门 → 3 座营房 → 后门 → 西侧营房 → 长廊闪光星 → 草场军官屋 → 直升机坪 → 废墟 → 石桥 → 绿星 → 石像
const MISSION2 = [
  { type: 'hut', name: 'H1' }, { type: 'pows', near: 'H1' },
  { type: 'goto', x: -9, y: 48 }, { type: 'goto', x: -6, y: 72 },
  { type: 'gate', name: '营地前门' },
  { type: 'hut', name: 'B1' }, { type: 'pows', near: 'B1' },
  { type: 'hut', name: 'B2' }, { type: 'pows', near: 'B2' },
  { type: 'hut', name: 'B3' }, { type: 'pows', near: 'B3' },
  { type: 'gate', name: '营地后门' }, { type: 'goto', x: 15, y: 114 },
  { type: 'hut', name: 'H2' }, { type: 'pows', near: 'H2' },
  { type: 'goto', x: -28, y: 116 }, { type: 'star', item: 'max' },
  { type: 'goto', x: -28, y: 156 }, { type: 'goto', x: -10, y: 166 }, { type: 'goto', x: 0, y: 176 }, { type: 'goto', x: 0, y: 198 },
  { type: 'hut', name: 'H3' }, { type: 'pows', near: 'H3' },
  { type: 'pad' },
  { type: 'goto', x: 2, y: 248 }, { type: 'goto', x: 0, y: 272 }, { type: 'goto', x: 0, y: 296 }, { type: 'goto', x: 0, y: 307 },
  { type: 'goto', x: 10, y: 306.5 }, { type: 'star', item: 'up', from: 'west' },
  { type: 'goto', x: 0, y: 312 }, { type: 'boss' }
];
const MISSIONS = { 1: MISSION, 2: MISSION2 };

function makeBot(page, opts) {
  const o = opts || {};
  let rs = (o.seed || 12345) >>> 0;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };   // 确定性随机，便于复现录制
  const held = new Set();
  let grid = null, level = null, gridT = -99;
  let path = null, pathGoal = null, pathT = -99;
  let mi = 0, phase = null, phaseT = 0, tphase = null;
  const MISSION = MISSIONS[o.stage || 1];
  let stuck = { x: 0, y: 0, t: 0, wiggle: 0, dir: 0 };
  const log = [];

  async function setKeys(keys) {
    const want = new Set(keys);
    for (const k of Array.from(held)) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  }
  async function tap(code) { if (held.has(code)) { await page.keyboard.up(code); held.delete(code); } await page.keyboard.down(code); await page.keyboard.up(code); }
  async function releaseAll() { await setKeys([]); }

  function blocked(i, j) { if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return true; return grid.cells.charCodeAt(j * grid.cols + i) === 49; }
  function clearAt(i, j) { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (blocked(i + di, j + dj)) return false; return true; }
  function nearestClear(i, j) {
    if (clearAt(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && clearAt(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }
  function astar(sx, sy, tx, ty) {
    const C = grid.cols, R = grid.rows;
    let [si, sj] = nearestClear(Math.floor(sx - grid.x0), Math.floor(sy));
    let [ti, tj] = nearestClear(Math.floor(tx - grid.x0), Math.floor(ty));
    const N = C * R, g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, si, sj]]; g[sj * C + si] = 0;
    const h = (i, j) => Math.hypot(i - ti, j - tj);
    let iter = 0;
    while (open.length && iter++ < 60000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i, j] = open.splice(bi, 1)[0];
      const c = j * C + i;
      if (closed[c]) continue; closed[c] = 1;
      if (i === ti && j === tj) break;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= C || nj >= R) continue;
        if (!clearAt(ni, nj)) continue;
        if (di && dj && (!clearAt(i + di, j) || !clearAt(i, j + dj))) continue;
        const nc = nj * C + ni, ng = g[c] + (di && dj ? 1.414 : 1);
        if (ng < g[nc]) { g[nc] = ng; came[nc] = c; open.push([ng + h(ni, nj), ni, nj]); }
      }
    }
    const end = tj * C + ti;
    if (came[end] < 0 && end !== sj * C + si) return null;
    const pts = []; let c = end;
    while (c >= 0) { pts.push([grid.x0 + (c % C) + 0.5, Math.floor(c / C) + 0.5]); if (c === sj * C + si) break; c = came[c]; }
    return pts.reverse();
  }
  async function refreshGrid(t) { grid = await page.evaluate(() => __JK_TEST__.grid()); gridT = t; path = null; }

  function steerTo(s, tx, ty) {
    const P = s.player;
    if (!path || !pathGoal || d2(pathGoal[0], pathGoal[1], tx, ty) > 1 || s.t - pathT > 2.5) {
      path = astar(P.x, P.y, tx, ty); pathGoal = [tx, ty]; pathT = s.t;
      if (!path) { log.push({ t: s.t, msg: 'no path', to: [tx, ty] }); return q8(angTo(P.x, P.y, tx, ty)); }
    }
    // 取路径上前方约 2.5 格的点
    let best = 0, bd = 1e9;
    for (let k = 0; k < path.length; k++) { const dd = d2(path[k][0], path[k][1], P.x, P.y); if (dd < bd) { bd = dd; best = k; } }
    let k = best; while (k < path.length - 1 && d2(path[k][0], path[k][1], P.x, P.y) < 2.5 * 2.5) k++;
    const p = path[k] || [tx, ty];
    return q8(angTo(P.x, P.y, p[0], p[1]));
  }

  // 返回从某方向攻击目标的站位（在可通行格上）
  function standoff(s, tx, ty, dist, prefer) {
    const P = s.player; let best = null;
    for (let d = 0; d < 8; d++) {
      const x = tx - DIR8[d].x * dist, y = ty - DIR8[d].y * dist;
      const i = Math.floor(x - grid.x0), j = Math.floor(y);
      if (!clearAt(i, j)) continue;
      // 起步点（再后退 2 格）也要可通行，便于朝目标方向开过去
      if (!clearAt(Math.floor(x - DIR8[d].x * 2 - grid.x0), Math.floor(y - DIR8[d].y * 2))) continue;
      const cost = Math.hypot(P.x - x, P.y - y) + (prefer !== undefined && d === prefer ? -6 : 0);
      if (!best || cost < best.cost) best = { x, y, d, cost };
    }
    return best;
  }

  async function tick(s) {
    if (!grid) await refreshGrid(s.t);
    if (!level) level = await page.evaluate(() => __JK_TEST__.level());
    const P = s.player;
    if (s.mode !== 'play' || !P || !P.alive) { if (o.apply !== false) await setKeys([]); return { idle: true, dir: -1, bomb: false }; }
    if (s.t - gridT > 3) await refreshGrid(s.t);
    let dir = -1, fire = true, bomb = false;
    const goal = MISSION[mi];
    // 顺手接附近的俘虏
    const nearPow = s.pows.filter(p => d2(p.x, p.y, P.x, P.y) < 9 * 9).sort((a, b) => d2(a.x, a.y, P.x, P.y) - d2(b.x, b.y, P.x, P.y))[0];
    // v0.2：护甲不满时顺手捡 10 米内的修理包
    const nearKit = P.armor < P.armorMax ? (s.kits || []).filter(k => d2(k.x, k.y, P.x, P.y) < 10 * 10).sort((a, b) => d2(a.x, a.y, P.x, P.y) - d2(b.x, b.y, P.x, P.y))[0] : null;
    const next = () => { mi++; phase = null; path = null; log.push({ t: s.t, goal: MISSION[mi] && MISSION[mi].type, mi }); };
    if (!goal) { await setKeys(['KeyJ']); return { done: true }; }

    // 战斗：前方 8 方向上 6~10 米内有敌人就扔手雷 / 发火箭
    const facing = P.dir;
    for (const e of s.enemies) {
      if (e.type === 'boat' && s.weapon === 1) continue;
      const dd = Math.sqrt(d2(e.x, e.y, P.x, P.y));
      if (dd < 2.5 || dd > (s.weapon === 1 ? 10.5 : 13)) continue;
      const a = angTo(P.x, P.y, e.x, e.y), da = Math.abs(((a - facing * Math.PI / 4 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < (s.weapon === 1 ? 0.22 : 0.18) && (s.weapon > 1 || Math.abs(dd - 9) < 2.2)) { bomb = true; break; }
    }

    // 附近有坦克就先处理（避免沿路被坦克反复击毁）
    const tankNear = s.enemies.filter(e => (e.type === 'tank' || e.type === 'bulltank' || e.type === 'ejeep') && d2(e.x, e.y, P.x, P.y) < 12 * 12 && (goal.type !== 'boss' || s.stage === 2))[0];
    if (tankNear) {
      const t = tankNear, dd = Math.sqrt(d2(t.x, t.y, P.x, P.y));
      const a = angTo(P.x, P.y, t.x, t.y), bear = q8(a);
      let err = Math.abs(a - bear * Math.PI / 4); if (err > Math.PI) err = Math.PI * 2 - err;
      if (err > 0.2 && dd > 4 && goal.type === 'boss') {
        // 不在 8 个方向的射线上：先挪到能对准的位置（火箭只能 8 向发射）
        if (!tphase || s.t - tphase.t > 2.5) tphase = { t: s.t, e: t.x + ',' + t.y, so: standoff(s, t.x, t.y, s.weapon === 1 ? 9 : 8) };
        dir = tphase.so ? steerTo(s, tphase.so.x, tphase.so.y) : bear;
      } else {
        dir = bear;
        if (P.dir === dir && (s.weapon > 1 || Math.abs(dd - 9) < 2)) bomb = true;
        if (dd < 7.5) dir = (dir + 4) % 8;
        else if (P.dir === dir && bomb) dir = -1;
      }
    } else if (nearKit && goal.type !== 'boss') {
      dir = steerTo(s, nearKit.x, nearKit.y);
    } else if (nearPow && goal.type !== 'boss' && !(goal.type === 'pad' && P && d2(P.x, P.y, level.pad.x, level.pad.y) < 25)) {
      dir = steerTo(s, nearPow.x, nearPow.y);
    } else if (goal.type === 'goto') {
      if (d2(P.x, P.y, goal.x, goal.y) < 2.2 * 2.2) next(); else dir = steerTo(s, goal.x, goal.y);
    } else if (goal.type === 'hut' || goal.type === 'gate') {
      const tgt = goal.type === 'gate' ? (goal.name ? s.gates.find(g => g.name === goal.name) : { alive: s.gate.alive, x: level.gate.x, y: level.gate.y }) : s.huts.find(h => h.name === goal.name);
      if (!tgt || !tgt.alive) next();
      else {
        if (!phase || phase.kind !== 'attack' || s.t - phase.t > 14) phase = { kind: 'attack', t: s.t, so: standoff(s, tgt.x, tgt.y, s.weapon === 1 ? 8.8 : 8, goal.type === 'gate' ? 0 : undefined) };
        const so = phase.so;
        if (!so) { log.push({ t: s.t, msg: 'no standoff', goal }); next(); }
        else {
          const back = { x: so.x - DIR8[so.d].x * 1.6, y: so.y - DIR8[so.d].y * 1.6 };
          const dd = Math.sqrt(d2(P.x, P.y, so.x, so.y));
          if (dd > 2.4 && !phase.lined) dir = steerTo(s, back.x, back.y);
          else { phase.lined = true; if (P.dir !== so.d || dd > 0.6) dir = so.d; if (P.dir === so.d) bomb = true; if (dd > 3.5) phase.lined = false; }
        }
      }
    } else if (goal.type === 'pows') {
      let c = goal.at;
      if (!c) { const h = level.huts.find(q => q.name === goal.near); c = [h.x, h.y]; }
      const left = s.pows.filter(p => d2(p.x, p.y, c[0], c[1]) < 16 * 16);
      if (!phase) phase = { kind: 'pows', t: s.t };
      if ((!left.length && s.t - phase.t > 1.2) || s.t - phase.t > 25) next();
      else if (left.length) dir = steerTo(s, left[0].x, left[0].y);
    } else if (goal.type === 'tank') {
      const t = s.enemies.filter(e => e.type === 'tank' && d2(e.x, e.y, goal.x, goal.y) < 15 * 15)[0];
      if (!t) next();
      else {
        const dd = Math.sqrt(d2(t.x, t.y, P.x, P.y));
        if (!phase || s.t - phase.t > 3) phase = { kind: 'tank', t: s.t, so: standoff(s, t.x, t.y, s.weapon === 1 ? 9 : 8) };
        const so = phase.so;
        if (so && Math.sqrt(d2(P.x, P.y, so.x, so.y)) > 1.5) dir = steerTo(s, so.x, so.y);
        else { dir = q8(angTo(P.x, P.y, t.x, t.y)); if (P.dir === dir) bomb = true; if (dd < 7) dir = (dir + 4) % 8; }
      }
    } else if (goal.type === 'star') {
      if (!phase || phase.kind !== 'star') phase = { kind: 'star', t: s.t, lined: false };
      const st = goal.item ? (s.stars || []).find(q => q.item === goal.item) : (s.star && !s.star.picked ? s.star : null);
      if (!st || s.t - phase.t > 30) next();
      else if (!st.hidden) dir = steerTo(s, st.x, st.y);
      else if (goal.item) {
        // 第二关：从南面（goal.from = 'west' 时从西面）对准星所在位置开炮（火箭能直接擦出来）
        const west = goal.from === 'west', fd = west ? 2 : 0, off = s.weapon === 1 ? 8.8 : 6;
        const so = west ? { x: st.x - off, y: st.y } : { x: st.x, y: st.y - off };
        const dd = Math.sqrt(d2(P.x, P.y, so.x, so.y));
        if (dd > 2.5 && !phase.lined) dir = steerTo(s, west ? so.x - 1.6 : so.x, west ? so.y : so.y - 1.6);
        else { phase.lined = true; dir = (P.dir !== fd || dd > 0.8) ? fd : -1; if (P.dir === fd) bomb = true; if (dd > 4) phase.lined = false; }
      } else {
        const so = { x: st.x - 8.6, y: st.y - 1 };
        const dd = Math.sqrt(d2(P.x, P.y, so.x, so.y));
        if (dd > 3 && !phase.lined) dir = steerTo(s, so.x - 1.6, so.y);
        else { phase.lined = true; dir = (P.dir !== 2 || dd > 0.8) ? 2 : -1; if (P.dir === 2) bomb = true; if (dd > 4.5) phase.lined = false; }
      }
    } else if (goal.type === 'pad') {
      const pad = level.pad;
      const stray = s.pows.filter(p => p.y < level.boss.y0 - 6).sort((a, b) => d2(a.x, a.y, P.x, P.y) - d2(b.x, b.y, P.x, P.y))[0];
      if (!phase || phase.kind !== 'pad') phase = { kind: 'pad', t: s.t };
      if ((s.carried === 0 && !stray) || s.t - phase.t > 90) next();
      else if (stray) dir = steerTo(s, stray.x, stray.y);
      else dir = d2(P.x, P.y, pad.x, pad.y) < 12 ? -1 : steerTo(s, pad.x - 2.5, pad.y - 2);
    } else if (goal.type === 'boss') {
      const tanks = s.enemies.filter(e => e.type === 'boss');
      if (s.boss && s.boss.state === 'done') { await setKeys([]); return { done: true }; }
      if (s.boss.state === 'idle') dir = steerTo(s, level.boss.respawn.x, level.boss.trigger + 1.5);
      else if (s.boss.type === 'statues' && !tankNear) {
        // 石像：站到目标正南方约 8.5 米处朝北开炮，机枪一直开着打掉追踪导弹
        const busts = s.enemies.filter(e => e.type === 'bust').sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x));
        const t = busts[0];
        if (t) {
          const so = { x: t.x, y: t.y - (s.weapon === 1 ? 8.8 : 8) };
          const dd = Math.sqrt(d2(P.x, P.y, so.x, so.y));
          if (dd > 1.2) dir = steerTo(s, so.x, so.y); else { dir = P.dir !== 0 ? 0 : -1; if (P.dir === 0) bomb = true; }
        }
      }
      else if (s.boss.type === 'statues') {
        const t = tankNear, dd = Math.sqrt(d2(t.x, t.y, P.x, P.y));
        dir = q8(angTo(P.x, P.y, t.x, t.y)); if (P.dir === dir) bomb = true; if (dd < 6) dir = (dir + 4) % 8;
      }
      else if (!tanks.length) dir = steerTo(s, 0, 314);
      else {
        const t = tanks.sort((a, b) => d2(a.x, a.y, P.x, P.y) - d2(b.x, b.y, P.x, P.y))[0];
        const dd = Math.sqrt(d2(t.x, t.y, P.x, P.y)), bear = q8(angTo(P.x, P.y, t.x, t.y));
        if (dd < 5.5) { dir = (bear + 4 + (Math.floor(s.t / 1.5) % 2 ? 1 : -1) + 8) % 8; }
        else if (dd > 11) dir = steerTo(s, t.x, t.y);
        else { dir = bear; if (P.dir === bear) bomb = true; if (dd < 8 && P.dir === bear) dir = -1; }
      }
    }
    // 躲子弹：预计 0.7 秒内擦身而过的敌弹，向垂直方向闪避
    let threat = null;
    for (const b of s.eb || []) {
      const rx = P.x - b[0], ry = P.y - b[1], vv = b[2] * b[2] + b[3] * b[3];
      const tt = (rx * b[2] + ry * b[3]) / vv;
      if (tt < 0 || tt > 0.7) continue;
      const cx = b[0] + b[2] * tt - P.x, cy = b[1] + b[3] * tt - P.y;
      if (cx * cx + cy * cy < 1.5 * 1.5 && (!threat || tt < threat.tt)) threat = { tt, b, cx, cy };
    }
    if (threat && o.dodge !== false) {
      const v = Math.hypot(threat.b[2], threat.b[3]);
      let px = -threat.b[3] / v, py = threat.b[2] / v;
      if (px * -threat.cx + py * -threat.cy < 0) { px = -px; py = -py; }
      dir = q8(Math.atan2(px, py));
    }
    // 卡住检测
    if (dir >= 0) {
      if (d2(P.x, P.y, stuck.x, stuck.y) > 0.6) { stuck.x = P.x; stuck.y = P.y; stuck.t = s.t; }
      else if (s.t - stuck.t > 1.8 && stuck.wiggle <= s.t) { stuck.wiggle = s.t + 0.7; stuck.dir = (dir + (rnd() < 0.5 ? 2 : 6)) % 8; path = null; log.push({ t: s.t, msg: 'stuck', x: P.x, y: P.y }); }
      if (stuck.wiggle > s.t) dir = stuck.dir;
    }
    const keys = [];
    if (dir >= 0) keys.push(...DIRKEYS[dir]);
    if (fire) keys.push('KeyJ');
    if (bomb) keys.push('KeyK');
    if (o.apply !== false) await setKeys(keys);
    return { keys, dir, bomb, goal: goal.type + (goal.name ? ':' + goal.name : ''), mi };
  }
  return { tick, releaseAll, setKeys, tap, log, get mi() { return mi; }, MISSION };
}
module.exports = { makeBot, DIRKEYS };
