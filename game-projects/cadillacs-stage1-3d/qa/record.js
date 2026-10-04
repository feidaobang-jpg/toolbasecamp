// 逐帧录像（手动时钟 + 页面截图，含 HUD）+ 离线渲染同场音轨，ffmpeg 合成 mp4。
// node qa/record.js <模式 full|cams|mobile|portrait> <输出 mp4> [英雄] [种子]
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
  await page.evaluate((h) => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', String(h)); }, hero);
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
  mark('开局：楼顶开场，维斯与手下');
  if (mode === 'full') {
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
