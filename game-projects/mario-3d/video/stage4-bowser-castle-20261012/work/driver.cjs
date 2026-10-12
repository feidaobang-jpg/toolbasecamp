// 页面内驱动器（被 capture.cjs 与探针共用）。整个函数会被 Playwright 序列化后在页面里执行，
// 所以这里不能引用 Node 作用域的变量；路线、段长与输入方式都通过 cfg 传入。
// 页面内实时驱动器：同一份已验证路线，既能用键盘事件跑，也能用触屏摇杆/动作键跑（走游戏自己的 pointer 处理）。
module.exports = () => {
  window.__drive = async (cfg) => {
    const q = __MARIO_TEST__; q.manual(true);
    await q.audio.samples.ready;
    const touch = cfg.via === 'touch';
    // —— 键盘通道 ——
    const press = (code, down) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const held = new Set();
    const setKeys = (want) => { for (const k of [...held]) if (!want.includes(k)) { press(k, false); held.delete(k); } for (const k of want) if (!held.has(k)) { press(k, true); held.add(k); } };
    // —— 触屏通道：摇杆推到边缘 = mx ±1，长按冲刺键 = run，点跳键 = jump ——
    const pt = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    const zone = document.getElementById('joy-zone');
    const zr = zone.getBoundingClientRect();
    const jx = zr.left + zr.width * 0.3, jy = zr.top + zr.height * 0.55;
    const btn = (n) => document.querySelector('#touch [data-hold="' + n + '"]');
    const btnCenter = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const jumpEl = btn('jump'), sprintEl = btn('sprint');
    let joyOn = false, sprintOn = false, jumpOn = false;
    const setJoy = async (dx) => { if (!joyOn) { pt(zone, 'pointerdown', jx, jy, 7); joyOn = true; await frame(); } pt(zone, 'pointermove', jx + dx, jy, 7); };
    const setSprint = (on) => { if (on === sprintOn || !sprintEl) return; const [x, y] = btnCenter(sprintEl); pt(sprintEl, on ? 'pointerdown' : 'pointerup', x, y, 8); sprintOn = on; };
    // 跳键按住整个决策段再松开，和世界离线模拟里 jump 持续为真一致（松手会改重力，落点就偏了）
    const setJump = (on) => { if (on === jumpOn || !jumpEl) return; const [x, y] = btnCenter(jumpEl); pt(jumpEl, on ? 'pointerdown' : 'pointerup', x, y, 9); jumpOn = on; };
    const JOY = { RR: 1, RRJ: 1, R: 1, RJ: 1, I: 0, J: 0, L: -1, LJ: -1 };
    const RUN = { RR: 1, RRJ: 1 };
    let guard = 0;
    if (!touch) { while (q.state().camera !== cfg.preset && guard++ < 8) { press('KeyC', true); await frame(); press('KeyC', false); for (let i = 0; i < 8; i++) await runSteps(2); } }
    const front = cfg.preset === 'front' || cfg.preset === 'fp';
    const F = front ? 'KeyW' : 'KeyD', B = front ? 'KeyS' : 'KeyA';
    const ACT = { RR: [F, 'KeyJ'], RRJ: [F, 'KeyJ', 'KeyK'], R: [F], RJ: [F, 'KeyK'], I: [], J: ['KeyK'], L: [B], LJ: [B, 'KeyK'] };
    const t0 = performance.now(), marks = [], events = [], trace = [];
    const mark = (k, extra) => { const t = (performance.now() - t0) / 1000; marks.push([k, +t.toFixed(3)]); events.push({ t: +t.toFixed(3), k, ...(extra || {}) }); };
    clockT = performance.now();
    // 卡片阶段一次只推 1 步：如果一次推 2 步，恰好结束卡片的那一步之后还会多跑 1 步物理，
    // 实机就会比离线世界计划提前约一步，起跳速度分档一变，后面落点全偏（实测就是这样翻车的）。
    while (q.state().phase === 'card') await runSteps(1);
    mark('play');
    window.__syncWall = Date.now();
    const snap = () => q.state();
    let prevCoins = 0, prevSecrets = 0, prevMode = 'play', prevBowser = 'idle';
    const watch = () => {
      const s = snap();
      if (s.session.coins > prevCoins) { prevCoins = s.session.coins; mark('coin', { coins: s.session.coins, x: s.player && +s.player.x.toFixed(2) }); }
      if (s.session.stats.secrets > prevSecrets) { prevSecrets = s.session.stats.secrets; mark('secret', { secrets: s.session.stats.secrets, x: s.player && +s.player.x.toFixed(2) }); }
      if (s.mode !== prevMode) { prevMode = s.mode; mark('mode:' + s.mode, { x: s.player && +s.player.x.toFixed(2) }); }
      const bw = q.world.rt.bowser && q.world.rt.bowser.state;
      if (bw !== prevBowser) { prevBowser = bw; mark('bowser:' + bw); }
    };
    const applyChunk = async (a) => {
      if (touch) {
        setJump(!!(a && a.endsWith('J')));
        await setJoy((JOY[a] || 0) * 70);
        setSprint(!!RUN[a]);
      } else setKeys((ACT[a] || []).concat([...extra]));   // extra = 镜头旋转键，只改相机不改物理
    };
    const release = async () => { if (touch) { if (joyOn) { pt(zone, 'pointerup', jx, jy, 7); joyOn = false; } setSprint(false); setJump(false); } else setKeys([]); };
    // 镜头旋转键（Q/E）可以叠加在路线上，但要注意：移动是按相机轴算的，跑图途中转镜头会把"向前"变成斜着走，
    // 实测在火棒走廊里转 3 秒就掉进岩浆。要演示转视角只能停在安全点单独转，本期母版没有用到，保留能力备用。
    const extra = new Set();
    for (let i = 0; i < cfg.plan.length; i++) {
      const a = cfg.plan[i];
      for (const o of (cfg.orbit || [])) { if (i === o.at) extra.add(o.key); if (i === o.at + o.chunks) extra.delete(o.key); }
      await applyChunk(a);
      await runSteps(cfg.chunk); watch();
      const t = snap();
      trace.push([i, a, t.player && +t.player.x.toFixed(3), t.player && +t.player.y.toFixed(3), t.mode, t.session.stats.hits, t.session.stats.deaths, t.player && +t.player.z.toFixed(3), t.player && +t.player.vy.toFixed(2), t.player && t.player.grounded, t.keys.join('+'), t.touchHold.join('+')]);
      if (t.mode !== 'play') break;
    }
    await release();
    if (cfg.tail === 'result') { for (let i = 0; i < 60 * 26 && q.state().overlay !== 'result'; i++) { await runSteps(2); watch(); } mark('result', { title: document.getElementById('res-title').textContent }); for (let i = 0; i < 90; i++) await frame(); }
    const s = snap();
    return { marks, events, trace, final: { level: s.level, mode: s.mode, overlay: s.overlay, x: s.player && +s.player.x.toFixed(2), coins: s.session.coins, secrets: s.session.stats.secrets, score: s.session.score, hits: s.session.stats.hits, deaths: s.session.stats.deaths, camera: s.camera, time: s.time, touchHidden: s.touchHidden, touchHold: s.touchHold, joy: s.joy }, presetReached: s.camera };
  };
  let clockT = 0, owed = 0;
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const runSteps = async n => { let done = 0; while (done < n) { await frame(); const now = performance.now(); owed += (now - clockT) * 0.12; clockT = now; const k = Math.min(n - done, Math.floor(owed)); if (k > 0) { q_step(k); owed -= k; done += k; } } };
  const q_step = (n) => window.__MARIO_TEST__.step(n);
};
