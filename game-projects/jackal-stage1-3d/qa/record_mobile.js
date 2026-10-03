// 手机触控录像（offline-render）：设备模拟 + CDP 触摸事件驱动虚拟摇杆与 J/K 键，手动时钟逐帧渲染并截图（含触屏控件），
// 音轨按事件离线渲染。决策复用 bot（apply:false），再换算成摇杆拖动方向。
// 用法：node record_mobile.js <outDir> <land|port> <gameSeconds>
const fs = require('fs');
const path = require('path');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
(async () => {
  const outDir = process.argv[2] || '/home/claude/jk/rec/mobile-land', mode = process.argv[3] || 'land', secs = +(process.argv[4] || 20), FPS = 30;
  const vp = mode === 'land' ? { width: 844, height: 390 } : { width: 390, height: 844 };
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const browser = await launch();
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&q=high&seed=41');
  await page.waitForTimeout(1500);
  await page.evaluate(() => __JK_TEST__.manual(true));
  const cdp = await context.newCDPSession(page);
  const active = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...active.values()] });
  const down = async (id, x, y) => { active.set(id, { x, y, id, radiusX: 6, radiusY: 6, force: 1 }); await send('touchStart'); };
  const move = async (id, x, y) => { active.set(id, { x, y, id, radiusX: 6, radiusY: 6, force: 1 }); await send('touchMove'); };
  const up = async (id) => { active.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...active.values()] }); };
  const box = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  let frame = 0;
  const timeline = [];
  const grab = async () => { await page.screenshot({ path: path.join(outDir, 'frames', String(frame).padStart(6, '0') + '.jpg'), type: 'jpeg', quality: 90 }); frame++; };
  for (let k = 0; k < 45; k++) { await page.evaluate(() => __JK_TEST__.step(2, true)); await grab(); }
  const st = await box('#menu [data-act=start]');
  timeline.push({ frame, name: 'tapStart', pos: st });
  await page.evaluate(() => __JK_TEST__.audioLogStart());
  const startFrame = frame;
  await down(9, st.x, st.y); await page.evaluate(() => __JK_TEST__.step(2, true)); await grab(); await up(9);
  for (let k = 0; k < 6; k++) { await page.evaluate(() => __JK_TEST__.step(2, true)); await grab(); }
  const joy = await box('#joy-base'), J = await box('#btn-fire'), K = await box('#btn-bomb');
  const rotated = (await snap(page)).ui.display.rotated;
  timeline.push({ frame, name: 'controls', joy, J, K, rotated });
  const bot = makeBot(page, { seed: 41, apply: false });
  let joyOn = false, jOn = false, kOn = false, k = 0, curDir = -2;
  // 逻辑方向 → 物理拖动向量（旋转布局：逻辑上 = 物理右，逻辑右 = 物理下）
  const vec = (d) => { const a = d * Math.PI / 4; const lx = Math.sin(a) * 55, ly = -Math.cos(a) * 55; return rotated ? { x: -ly, y: lx } : { x: lx, y: ly }; };
  while (frame - startFrame < secs * FPS) {
    const r = await page.evaluate(() => __JK_TEST__.step(2, true));
    await grab();
    if (++k % 3 === 0 && r.overlay === null) {
      const s = await snap(page);
      const dcs = await bot.tick(s);
      const d = dcs.dir === undefined ? -1 : dcs.dir;
      if (d >= 0) {
        if (!joyOn) { await down(1, joy.x, joy.y); joyOn = true; }
        if (d !== curDir) { const v = vec(d); await move(1, joy.x + v.x * 0.5, joy.y + v.y * 0.5); await move(1, joy.x + v.x, joy.y + v.y); curDir = d; }
      } else if (joyOn) { await up(1); joyOn = false; curDir = -2; }
      if (s.mode === 'play' && !jOn) { await down(2, J.x, J.y); jOn = true; }
      if (dcs.bomb && !kOn) { await down(3, K.x, K.y); kOn = true; }
      else if (!dcs.bomb && kOn) { await up(3); kOn = false; }
    }
  }
  for (const id of [3, 2, 1]) if (active.has(id)) await up(id);
  const ev = await page.evaluate(() => __JK_TEST__.audioLogStop());
  const dur = frame / FPS;
  const au = await page.evaluate(([e, d]) => __JK_TEST__.audioOffline(e, d), [ev.map(x => ({ t: +(x.t + startFrame / FPS).toFixed(4), n: x.n, a: x.a })), dur]);
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.from(au.wav, 'base64'));
  const evs = await page.evaluate(() => __JK_TEST__.events());
  const final = await snap(page);
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ mode, viewport: vp, dpr: 2, fps: FPS, frames: frame, duration_s: dur, startFrame, rotated, capture: 'offline-render：设备模拟 + CDP 触摸事件，手动时钟逐帧渲染 + page.screenshot；音轨按事件离线渲染', final: { score: final.score, carried: final.carried, weapon: final.weapon, pos: final.player }, events: evs.filter(e => !['bomb'].includes(e.name)).map(e => ({ t: e.t, t_video: +(startFrame / FPS + e.t).toFixed(2), name: e.name, data: e.data })), errors, timeline }, null, 1));
  await browser.close();
  console.log('done', frame);
})();
