// 逐帧录像（手动时钟 + 页面截图，含 HUD）+ 离线渲染同场音轨，ffmpeg 合成 mp4。
// node qa/record.js <模式 full|cams|mobile|portrait|stage2|stage3> <输出 mp4> [英雄] [种子]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
(async () => {
  const mode = process.argv[2] || 'full', dest = path.resolve(process.argv[3] || out('rec-' + mode + '.mp4'));
  const hero = +(process.argv[4] || 2), seed = +(process.argv[5] || 7);
  const mobile = mode === 'mobile' || mode === 'portrait';
  const W = mode === 'portrait' ? 390 : mobile ? 844 : 1280, H = mode === 'portrait' ? 844 : mobile ? 390 : 720;
  const fps = 30;
  const dir = out('rec-' + mode + '-frames');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await launch();
  const ctx = await b.newContext(mobile ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = mobile ? await ctx.newCDPSession(page) : null;
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(BASE + '?test=1&clean=1&seed=' + seed, { waitUntil: 'load' });
  await page.evaluate(([h, st]) => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', String(h)); if (st) localStorage.setItem('cd3d-stage1:stage', String(st)); }, [hero, mode === 'stage2' ? 1 : mode === 'stage3' ? 2 : 0]);
  await page.reload({ waitUntil: 'load' }); await sleep(800);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.evaluate(BOT_SRC);
  let frame = 0, startFrame = 0;
  const timeline = [];
  const mark = (desc) => { timeline.push({ t: +(frame / fps).toFixed(2), desc }); console.log('[' + (frame / fps).toFixed(1) + 's] ' + desc); };
  const snapFrame = async () => { await page.screenshot({ path: path.join(dir, String(frame).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 }); frame++; };
  const idle = async (sec) => { for (let i = 0; i < sec * fps; i++) { await page.evaluate(() => window.__CD_TEST__.step(2, true)); await snapFrame(); } };
  const play = async (sec, opts, every) => {
    for (let i = 0; i < sec * fps; i++) {
      await page.evaluate((o) => window.__botTick(o), opts);
      await snapFrame();
      if (every) await every(i);
      if (i % 15 === 0 && await page.evaluate(() => window.__CD_TEST__.events().some(e => e.type === 'end'))) return true;
    }
    return false;
  };
  // 每帧：bot 决策一次 + 推进 2 个逻辑步并渲染
  await page.evaluate(() => { window.__botTick = (o) => { window.__bot.run(1 / 30, o); window.__CD_TEST__.step(0, true); }; });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
  const rectOf = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);

  mark('标题画面（四位主角站在楼顶）');
  await idle(mode === 'full' ? 3 : 1.5);
  if (mobile) { const r = await rectOf('[data-act=select]'); await touch('touchStart', [{ x: r.x, y: r.y, id: 1 }]); await touch('touchEnd', []); }
  else await page.keyboard.press('Enter');
  mark('选人画面');
  await idle(mode === 'full' ? 2 : 1);
  if (mobile) { const r = await rectOf('#sel-go'); await touch('touchStart', [{ x: r.x, y: r.y, id: 1 }]); await touch('touchEnd', []); }
  else await page.keyboard.press('Enter');
  await sleep(100);
  startFrame = frame;
  await page.evaluate(() => window.__CD_TEST__.audioLogStart());
  mark(mode === 'stage2' ? '第二关开场：凯迪拉克开进偷猎者森林' : mode === 'stage3' ? '第三关开场：黑屏上霍格放话' : '开局：楼顶开场，维斯与手下');
  if (mode === 'stage2') {
    const G = (fn, a) => page.evaluate(fn, a);
    const jump = (area, wave, x, focus) => G(([area, wave, x, focus]) => { const C = window.__CD_TEST__.cheat, g = C.G; if (area !== null) { C.area(area); C.skipScript(); } C.killAll(); g.pending = []; g.waveOn = false; g.lockX = null; g.wave = wave; g.focusX = focus; g.player.x = x; g.player.z = 0.4; g.player.state = 'idle'; }, [area, wave, x, focus]);
    await idle(3.2);
    mark('三角龙哈克：刨地后冲撞'); await play(16, { jumps: true, noSkip: true });
    await jump(null, 2, 38.5, 34); mark('胖子去捶熟睡的霸王龙希瓦特'); await play(14, { jumps: true, noSkip: true });
    await G(() => window.__CD_TEST__.cheat.wake()); mark('希瓦特醒了：咬人、跺脚'); await play(10, { jumps: true, noSkip: true });
    await jump(4, 0, 2.6, 6.8); mark('泥沼：齐腰深，格特从水里冒出来'); await play(14, { jumps: true, noSkip: true });
    await jump(null, 2, 41.5, 37); mark('岸上：链锤兵拉什·T'); await play(14, { jumps: true, noSkip: true });
    await jump(5, 0, 2.4, 6.8); mark('黄昏的恐龙尸骸地'); await play(8, { jumps: true, noSkip: true });
    await jump(null, 9, 42, 38); mark('Boss 屠夫：肢解死恐龙后回头'); await idle(5);
    mark('屠夫战：双刀、屁股坐、叫手下'); await play(30, { jumps: true, noSkip: true });
  } else if (mode === 'stage3') {
    // 第三关全程：荒漠三波（中间跳过一段路）→ 机修工送车 → 开车一路撞 → 霍格（车上躲手雷、撞他）→ 车毁后徒步打完 → 过场
    const G = (fn, a) => page.evaluate(fn, a);
    const snap = () => G(() => { const s = window.__CD_TEST__.snapshot(); return { mode: s.mode, area: s.areaId, waveOn: s.waveOn, road: s.road, dialog: s.dialog, ev: window.__CD_TEST__.events().filter(e => e.type === 'bossDown').length }; });
    const frames = async (sec, fn, stop) => { for (let i = 0; i < sec * fps; i++) { await page.evaluate(fn || (() => window.__CD_TEST__.step(2, true))); await snapFrame(); if (stop && i % 6 === 0 && await stop()) return true; } return false; };
    // 开车：一路撞时对准前面最近的人 / 路障那一排；霍格出场后红圈压着车就躲，否则朝他撞
    await G(() => {
      const held = {};
      const set = (c, on) => { if (!!held[c] === on) return; held[c] = on; window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c, key: c, bubbles: true })); };
      window.__drive = () => {
        const T = window.__CD_TEST__, g = T.cheat.G, R = T.cheat.roadState();
        let dx = 0, dz = 0;
        if (R && R.car && R.phase === 'run') {
          let best = null, bd = 99;
          for (const a of g.actors) if (a.road && a.x > g.carX + 2.5 && a.x - g.carX < bd) { bd = a.x - g.carX; best = a.z; }
          for (const p of g.props) if (!p.broken && !p.parked && p.x > g.carX + 2.5 && p.x - g.carX < bd) { bd = p.x - g.carX; best = p.z; }
          if (best !== null && Math.abs(best - g.carZ) > 0.25) dz = Math.sign(best - g.carZ);
          if (g.carX < 6.2) dx = 1;
        } else if (R && R.car && R.phase === 'hogg') {
          const c = R.car, h = R.hogg, n = R.nades.filter(n => Math.max(0, Math.abs(n.x - c.x) - 2.62) < 1.2 && Math.max(0, Math.abs(n.z - c.z) - 0.98) < 1.2)[0];
          if (n) { dz = c.z >= n.z ? 1 : -1; if ((dz > 0 && c.z > 2.8) || (dz < 0 && c.z < -1.05)) dz = -dz; dx = c.x >= n.x ? 1 : -1; }
          else { dx = Math.abs(h.x - c.x) < 0.4 ? 0 : Math.sign(h.x - c.x); dz = Math.abs(h.z - c.z) < 0.2 ? 0 : Math.sign(h.z - c.z); }
        }
        set('KeyD', dx > 0); set('KeyA', dx < 0); set('KeyS', dz > 0); set('KeyW', dz < 0);
        T.step(2, true);
      };
      window.__driveStop = () => { for (const c of Object.keys(held)) set(c, false); };
    });
    await idle(8.2);
    mark('荒漠：蹲着的四个手下围上来'); await play(15, { jumps: true, noSkip: true });
    await G(() => window.__CD_TEST__.cheat.killAll());
    mark('打完第一波：字幕 DESERT OF DEATH'); await frames(3.2);
    await G(() => { const C = window.__CD_TEST__.cheat, g = C.G; C.killAll(); g.pending = []; g.waveOn = false; g.lockX = null; g.wave = 2; g.focusX = 35.5; g.player.x = 39.5; g.player.z = 0.6; g.player.state = 'idle'; });
    mark('仙人掌石堆旁：大块头沃尔瑟'); await play(15, { jumps: true, noSkip: true });
    for (let i = 0; i < 40; i++) { await G(() => window.__CD_TEST__.cheat.killAll()); await frames(0.5); const s = await snap(); if (s.mode === 'cut') break; }
    mark('机修工开着凯迪拉克赶到：「开这辆车走，会安全些」'); await frames(14, null, async () => (await snap()).area === 'road');
    mark('地狱公路：开着凯迪拉克一路撞过去'); await frames(32, () => window.__drive(), async () => { const s = await snap(); return s.road && s.road.phase === 'hogg'; });
    mark('Boss 霍格：骑摩托扔手雷，躲红圈、用车撞他');
    await frames(19, () => window.__drive(), async () => { const s = await snap(); return !s.road || s.road.phase !== 'hogg'; });
    await G(() => { window.__driveStop(); const R = window.__CD_TEST__.cheat.roadState(); if (R && R.phase === 'hogg') window.__CD_TEST__.cheat.road.wreck(); });
    mark('凯迪拉克被炸毁：下车徒步，霍格来回冲撞、停下来投弹'); await play(26, { jumps: true, noSkip: true }, null);
    await G(() => { const g = window.__CD_TEST__.cheat.G; if (g.boss && g.boss.alive) g.boss.hp = Math.min(g.boss.hp, 30); });
    mark('最后一击：摩托炸开'); for (let i = 0; i < 40 * fps; i++) { await page.evaluate((o) => window.__botTick(o), { jumps: true, noSkip: true }); await snapFrame(); if (i % 6 === 0 && (await snap()).ev > 0) break; }
    mark('过关：胜利台词、体力奖励、「你看……我们的修车厂！」'); await frames(15, null, async () => await page.evaluate(() => window.__CD_TEST__.events().some(e => e.type === 'end')));
  } else if (mode === 'full') {
    await idle(9.5);   // 看完开场对话
    mark('战斗开始');
    const seen = new Set();
    await play(400, { jumps: true, noSkip: true }, async () => {
      if (frame % 15) return;
      const s = await page.evaluate(() => { const s = window.__CD_TEST__.snapshot(); return { area: s.area, boss: !!s.boss, mode: s.mode, dialog: s.dialog, waveOn: s.waveOn }; });
      const key = s.area + (s.boss ? 'b' : '') + s.mode;
      if (!seen.has(key)) { seen.add(key); mark('区域 ' + ['楼顶', '大楼内部', '第47街'][s.area] + (s.boss ? ' · Boss 战' : '') + ' · ' + s.mode); }
    });
    mark('过关 · 结算前演出');
    await idle(4);
    await page.evaluate(() => window.__CD_TEST__.manual(false)); await sleep(1500); await page.evaluate(() => window.__CD_TEST__.manual(true));
    mark('结算画面');
    await idle(3);
  } else if (mode === 'cams') {
    await page.evaluate(() => window.__CD_TEST__.cheat.skipScript());
    const cams = [[0, '侧视'], [1, '斜视'], [2, '正视'], [3, '第一人称']];
    for (const [i, name] of cams) { await page.evaluate((i) => window.__CD_TEST__.setCamera(i, 0), i); mark('视角：' + name); await play(5.5, { jumps: true }); }
    await page.evaluate(() => window.__CD_TEST__.setCamera(0, 0)); mark('侧视下 Q/E 慢速环绕');
    for (let i = 0; i < 6 * fps; i++) { await page.evaluate((i) => { const c = window.__CD_TEST__._cam; c.yawOff = Math.sin(i / 30 * 0.55) * 1.6; }, i); await page.evaluate((o) => window.__botTick(o), {}); await snapFrame(); }
    await page.evaluate(() => { window.__CD_TEST__.setCamera(2, 0); window.__CD_TEST__.cheat.area(1); }); mark('大楼内部 · 正视'); await play(5, { jumps: true });
    await page.evaluate(() => window.__CD_TEST__.setCamera(3, 0)); mark('大楼内部 · 第一人称'); await play(5, { jumps: true });
    await page.evaluate(() => window.__CD_TEST__.setCamera(0, 0));
  } else {
    // 手机：真实触屏操作（摇杆 + J）
    await page.evaluate(() => window.__CD_TEST__.cheat.skipScript());
    mark(mode === 'portrait' ? '竖屏自动旋转为横屏布局 · 触屏操作' : '手机横屏 · 触屏摇杆与按键');
    const jz = await rectOf('#joy-zone'), atk = await rectOf('#btn-atk'), jump = await rectOf('#btn-jump');
    const rot = mode === 'portrait';
    const jx = rot ? jz.x : jz.x - jz.w * 0.2, jy = rot ? jz.y - jz.h * 0.1 : jz.y + jz.h * 0.15;
    let atkDown = false, jumpDown = false;
    for (let i = 0; i < (rot ? 10 : 16) * fps; i++) {
      const s = await page.evaluate(() => { const s = window.__CD_TEST__.snapshot(); const e = window.__CD_TEST__.cheat.actors().filter(a => a.side === 'enemy' && a.alive && ['down', 'dead', 'cut', 'enter'].indexOf(a.state) < 0); return { p: s.player, e: e.map(a => [a.x, a.z]) }; });
      let dx = 1, dz = 0;
      if (s.e.length) { const t = s.e.sort((a, b) => Math.abs(a[0] - s.p.x) - Math.abs(b[0] - s.p.x))[0]; dx = t[0] - s.p.x; dz = t[1] - s.p.z; }
      const near = Math.abs(dz) < 0.3 && Math.abs(dx) < 1.2;
      let mx = near ? Math.sign(dx) * 0.2 : Math.max(-1, Math.min(1, dx)), my = Math.abs(dz) > 0.2 ? -Math.sign(dz) : 0;
      if (near) my = 0;
      const ox = rot ? -my * 40 : mx * 40, oy = rot ? mx * 40 : my * -40;   // 旋转布局：横屏的右 = 屏幕下
      const joy = { x: jx + ox, y: jy + oy, id: 1 };
      const wantAtk = near && i % 8 < 3, wantJump = !near && i % 120 >= 60 && i % 120 < 63;
      const pts = [joy]; if (wantAtk) pts.push({ x: atk.x, y: atk.y, id: 2 }); if (wantJump) pts.push({ x: jump.x, y: jump.y, id: 3 });
      if (i === 0) await touch('touchStart', pts);
      else if ((wantAtk && !atkDown) || (wantJump && !jumpDown)) await touch('touchStart', pts);
      else if ((!wantAtk && atkDown) || (!wantJump && jumpDown)) await touch('touchEnd', pts);
      else await touch('touchMove', pts);
      atkDown = wantAtk; jumpDown = wantJump;
      await page.evaluate(() => window.__CD_TEST__.step(2, true));
      await snapFrame();
    }
    await touch('touchEnd', []);
  }
  const events = await page.evaluate(() => window.__CD_TEST__.audioLogStop());
  const total = frame / fps;
  const off = startFrame / fps;
  const shifted = events.map(e => Object.assign({}, e, { t: e.t + off }));
  const b64 = await page.evaluate(([ev, d]) => window.__CD_TEST__.audioOffline(ev, d), [shifted, total]);
  const wav = path.join(dir, 'audio.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  await b.close();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const vf = mode === 'portrait' ? 'scale=780:1688' : mobile ? 'scale=1688:780' : 'scale=1280:720';
  cp.execFileSync(FFMPEG, ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-i', wav, '-vf', vf + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', dest]);
  fs.writeFileSync(dest.replace(/\.mp4$/, '.timeline.json'), JSON.stringify({ mode, hero, seed, fps, frames: frame, duration: +total.toFixed(2), gameStart: +off.toFixed(2), audioEvents: events.length, timeline }, null, 1));
  console.log('wrote', dest, frame, 'frames', total.toFixed(1) + 's', 'audio events', events.length);
})();
