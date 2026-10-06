// 页面内自动试玩 bot：读快照，派发真实键盘事件（走与玩家相同的输入路径），配合手动时钟快速推进。
// 用法：在页面里 eval(BOT_SRC) 后调用 window.__bot.run(秒数, 选项)
module.exports.BOT_SRC = String.raw`
(function () {
  const T = window.__CD_TEST__;
  const held = new Set();
  function key(code, down) {
    if (down && held.has(code)) return; if (!down && !held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  }
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function tap(code) { key(code, false); key(code, true); pending.push([code, 2]); }
  const pending = [];
  function releaseAll() { for (const c of Array.from(held)) key(c, false); }
  const stats = { taps: 0, megas: 0, picks: 0 };
  let stuckT = 0, lastX = 0, tick = 0, jumpCd = 0;
  function decide(opts) {
    const s = T.snapshot();
    const acts = T.cheat.actors();
    const p = s.player;
    for (let i = pending.length - 1; i >= 0; i--) { pending[i][1]--; if (pending[i][1] <= 0) { key(pending[i][0], false); pending.splice(i, 1); } }
    tick++;
    if (s.mode !== 'play') { releaseAll(); if (s.dialog && !opts.noSkip && tick % 20 === 0) tap('KeyJ'); return s; }
    if (!p || ['down', 'dead', 'respawn', 'getup', 'hurt'].indexOf(p.state) >= 0) { releaseAll(); return s; }
    const enemies = acts.filter(a => a.side === 'enemy' && a.alive && ['down', 'dead', 'enter', 'cut', 'leave', 'flee', 'sleep', 'knocked', 'waking'].indexOf(a.state) < 0);   // 不去打熟睡的霸王龙
    let move = { x: 0, z: 0 }, atk = false, lookAt = null;
    const free = !((s.ui.camera === 'side' || s.ui.camera === 'oblique') && Math.abs(s.ui.yawOff) < 0.7);
    // 回血：血少时去吃食物
    const items = T.cheat.items();
    const food = items.filter(i => ['steak', 'barbecue', 'hamburger', 'donut'].indexOf(i.kind) >= 0);
    const wpn = items.filter(i => ['gun', 'shotgun', 'pipe', 'knife', 'sword', 'rifle'].indexOf(i.kind) >= 0);
    const want = (p.hp < 60 && food.length) ? food[0] : (!p.weapon && wpn.length && opts.weapons !== false ? wpn[0] : (items.find(i => ['gold', 'diamond', 'ring'].indexOf(i.kind) >= 0) || null));
    let target = null, bd = 1e9;
    for (const e of enemies) { const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 1.5; if (d < bd) { bd = d; target = e; } }
    if (want && (!target || Math.hypot(want.x - p.x, want.z - p.z) < 3)) {
      const dx = want.x - p.x, dz = want.z - p.z;
      if (Math.hypot(dx, dz) < 0.5) { atk = true; stats.picks++; }
      else move = { x: dx, z: dz };
    } else if (target && free) {
      // 自由视角（正视 / 第一人称 / 转过的镜头）：直接朝目标走，贴近后面向目标出拳
      const dx = target.x - p.x, dz = target.z - p.z, dist = Math.hypot(dx, dz);
      const near = enemies.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < 1.4).length;
      if (near >= 3 && p.hp > 35 && opts.mega !== false && Math.random() < 0.06) { tap('KeyU'); stats.megas++; return s; }
      const gun = p.weapon && ['gun', 'shotgun', 'rifle'].includes(p.weapon.kind);
      const want = gun ? 2.4 : 0.85;
      const tf = Math.atan2(dx, dz), off = Math.abs(angDiff(p.face, tf));
      if (dist > want + 0.25) move = { x: dx / dist, z: dz / dist };
      else if (dist < want - 0.35) move = { x: -dx / dist * 0.6, z: -dz / dist * 0.6 };
      if (dist < want + 0.5 && (off < 0.75 || s.ui.camera !== 'fp')) { atk = true; if (dist > want - 0.35) move = { x: 0, z: 0 }; }
      lookAt = tf;
      if (opts.jumps && jumpCd <= 0 && dist > 1.4 && dist < 2.1 && off < 0.4 && Math.random() < 0.04) { tap('KeyK'); jumpCd = 40; pending.push(['KeyJ', 1]); }
    } else if (target) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const near = enemies.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < 1.4).length;
      if (near >= 3 && p.hp > 35 && opts.mega !== false && Math.random() < 0.08) { tap('KeyU'); stats.megas++; return s; }
      const gun = p.weapon && ['gun', 'shotgun', 'rifle'].includes(p.weapon.kind);
      const wantDx = gun ? 2.5 : 0.85;
      if (Math.abs(dz) > 0.22) move.z = dz;
      if (Math.abs(Math.abs(dx) - wantDx) > 0.25) move.x = Math.sign(dx) * (Math.abs(dx) > wantDx ? 1 : -1);
      const facing = Math.sign(Math.sin(p.face));
      if (Math.abs(dz) < 0.32 && Math.abs(dx) < wantDx + 0.45) {
        if (facing !== Math.sign(dx) && Math.abs(dx) > 0.15) move.x = Math.sign(dx) * 0.5; else { atk = true; move = { x: 0, z: 0 }; }
      }
      // 偶尔跳踢
      if (opts.jumps && jumpCd <= 0 && Math.abs(dz) < 0.3 && Math.abs(dx) > 1.4 && Math.abs(dx) < 2.2 && Math.random() < 0.05) { tap('KeyK'); jumpCd = 40; pending.push(['KeyJ', 1]); setTimeout(() => {}, 0); }
    } else {
      // 没敌人：往右走（GO），朝出口纵深靠拢
      move.x = 1; move.z = -p.z * 0.6;
    }
    jumpCd--;
    // 卡住检测
    if (Math.abs(p.x - lastX) < 0.01 && (move.x || move.z) && !atk) stuckT++; else stuckT = 0;
    lastX = p.x;
    if (stuckT > 90) { move.z = (Math.random() - 0.5) * 2; stuckT = 0; }
    // 世界方向 → 屏幕按键（按当前镜头的水平轴换算，任何视角都正确）
    const ax = s.cam.axes, sx = move.x * ax.right.x + move.z * ax.right.z, sy = move.x * ax.fwd.x + move.z * ax.fwd.z;
    key('KeyD', sx > 0.2); key('KeyA', sx < -0.2); key('KeyW', sy > 0.2); key('KeyS', sy < -0.2);
    // 自由视角下转头：第一人称把视线转向目标；正视只在目标绕到身后时才转；没目标就看向前进方向
    if (free && opts.turn !== false) {
      const viewFace = Math.atan2(ax.fwd.x, ax.fwd.z);
      const goal = lookAt !== null ? lookAt : Math.PI / 2;
      const d = angDiff(viewFace, goal), th = s.ui.camera === 'fp' ? 0.28 : (lookAt !== null ? 1.7 : 0.25);
      const turning = held.has('KeyE') || held.has('KeyQ');
      const need = Math.abs(d) > (turning ? 0.08 : th);
      key('KeyE', need && d > 0); key('KeyQ', need && d < 0);
    } else { key('KeyE', false); key('KeyQ', false); }
    if (atk && tick % 6 === 0) { tap('KeyJ'); stats.taps++; }
    return s;
  }
  window.__bot = {
    stats,
    // 手动时钟推进 seconds 秒（每 2 个逻辑帧决策一次）
    run(seconds, opts) {
      opts = opts || {};
      const n = Math.round(seconds * 30);
      let s;
      for (let i = 0; i < n; i++) {
        s = decide(opts);
        T.step(2, false);
        if (i % 30 === 0 && T.events().some(e => e.type === 'end')) break;
      }
      return T.snapshot();
    },
    releaseAll,
    // 只做一次决策（由外部推进时钟，录像用）
    tick(opts) { return decide(opts || {}); },
    // 实时模式：按真实时钟每 33ms 决策一次（测帧、实时录屏用）
    live(on, opts) { if (this._iv) { clearInterval(this._iv); this._iv = null; releaseAll(); } if (on) this._iv = setInterval(() => decide(opts || {}), 33); }
  };
})();
`;
