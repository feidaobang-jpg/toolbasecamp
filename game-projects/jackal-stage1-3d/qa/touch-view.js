// 驾驶舱视线连续性、触屏布局与多指操作回归；浏览器模拟不代表手机真机。
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./lib');
const out = process.env.JK_QA_OUT || path.join(__dirname, 'out/touch-view-v0.5.3');
fs.mkdirSync(out, { recursive: true });
const results = [], errors = [];
let activeBrowser;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail));
}
const diff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
async function state(p) { return p.evaluate(() => __JK_TEST__.snapshot()); }
async function steps(p, n) { return p.evaluate(n => { for (let i = 0; i < n; i++) __JK_TEST__.step(1, false); }, n); }
async function setup(p) {
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'test=1&seed=17&q=low');
  // Toy 地址会跳到平台外壳，实际游戏及测试入口位于跨域 iframe。
  let game = p;
  if (p.url().includes('bilibili.com/toy/')) {
    const hostPage = p;
    game = await (await hostPage.waitForSelector('iframe')).contentFrame();
    game.mouse = hostPage.mouse; game.keyboard = hostPage.keyboard; game.hostPage = hostPage;
    game.screenshot = options => hostPage.screenshot(options);
  }
  p = game;
  await p.waitForFunction(() => window.__JK_TEST__);
  await p.evaluate(() => __JK_TEST__.manual(true));
  await p.locator('[data-act=start]').first().click();
  await steps(p, 150);
  await p.evaluate(() => __JK_TEST__.cheat.invuln(10000));
  return p;
}
async function preset(p, idx) {
  for (let i = 0; i < 6 && await p.evaluate(() => __JK_TEST__._cam.idx) !== idx; i++) {
    await p.locator('#btn-cam').click(); await steps(p, 1);
  }
  await p.evaluate(idx => { const t = __JK_TEST__; t.clearInput(); t.cheat.teleport(-8, 22); t._cam.idx = idx; t._cam.yaw = 0; t._cam.clearLook(); t.cheat.face(0); t.step(1, false); }, idx);
}
async function forward(p) { return p.evaluate(() => { const e = __JK_TEST__._cam.cam.matrixWorld.elements, len = Math.hypot(e[8], e[10]); return { x: -e[8] / len, z: -e[10] / len }; }); }
async function drag(p, start, end) { await p.mouse.move(...start); await p.mouse.down(); await p.mouse.move(...end, { steps: 4 }); await p.mouse.up(); }
(async () => {
  const browser = activeBrowser = await launch();
  let context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let p = await context.newPage(); p = await setup(p); await preset(p, 5);
  // 真实键盘输入 + 固定时钟，逐帧检查横移/倒车/反向时镜头不甩动。
  for (const key of ['a', 's', 'd', 'w']) {
    const before = await state(p); await p.keyboard.down(key);
    const samples = [];
    for (let i = 0; i < 40; i++) { await steps(p, 1); samples.push((await state(p)).cam); }
    await p.keyboard.up(key); await steps(p, 1);
    const viewDrift = Math.max(...samples.map(s => Math.abs(diff(before.cam.heading, s.heading))));
    const bodyStep = Math.max(...samples.map((s, i) => Math.abs(diff(i ? samples[i - 1].bodyHeading : before.cam.bodyHeading, s.bodyHeading))));
    check('第一人称 ' + key + ' 横移/倒车视线稳定且车身缓转', viewDrift < 1e-8 && bodyStep <= 2.1 / 60 + 1e-8, { viewDrift, bodyStep });
  }
  await preset(p, 5);
  const before = await state(p);
  await drag(p, [670, 270], [1150, 270]);
  const immediate = await state(p); await steps(p, 1); const one = await state(p);
  check('快划屏不即时跳变，第一帧转头不超过1度', Math.abs(diff(before.cam.heading, immediate.cam.heading)) < 1e-8 && Math.abs(diff(before.cam.heading, one.cam.heading)) <= Math.PI / 180 + 1e-8, { before: before.cam.heading, immediate: immediate.cam.heading, one: one.cam.heading });
  await steps(p, 100); const settled = await state(p);
  check('拖动积压有界且平滑收敛，默认机枪沿视线瞄准', settled.cam.heading > 0 && settled.cam.heading <= Math.PI / 6 + 1e-6 && settled.cam.lookPending === 0 && Math.abs(diff(settled.cam.heading, settled.cam.gunAngle)) < 1e-8, settled.cam);
  await p.keyboard.down('e'); await steps(p, 390); await p.keyboard.up('e');
  check('第一人称可连续转满360度并跨越角度边界', Math.abs(diff(settled.cam.heading, (await state(p)).cam.heading) - Math.PI / 6) < 0.001, (await state(p)).cam.heading);
  for (let idx = 0; idx < 6; idx++) {
    await preset(p, idx); const f0 = await forward(p);
    await drag(p, [650, 270], [760, 270]); await steps(p, 75); const f1 = await forward(p);
    const projection = f1.x * -f0.z + f1.z * f0.x;
    check('视角 ' + idx + ' 右拖向右看', projection > 0.1, projection);
    await drag(p, [760, 270], [650, 270]); await steps(p, 75); const f2 = await forward(p);
    check('视角 ' + idx + ' 左拖向左看', f2.x * -f1.z + f2.z * f1.x < -0.1, f2);
    await p.keyboard.down('e'); await steps(p, 20); await p.keyboard.up('e'); const f3 = await forward(p);
    check('视角 ' + idx + ' E向右看', f3.x * -f2.z + f3.z * f2.x > 0.1, f3);
    await p.keyboard.down('q'); await steps(p, 20); await p.keyboard.up('q'); const f4 = await forward(p);
    check('视角 ' + idx + ' Q向左看', f4.x * -f3.z + f4.z * f3.x < -0.1, f4);
    await p.keyboard.down('e'); await steps(p, idx === 5 ? 90 : 60); await p.keyboard.up('e');
    const looking = await forward(p), movingBefore = (await state(p)).player;
    await p.keyboard.down('w'); await steps(p, 8); await p.keyboard.up('w');
    const movingAfter = (await state(p)).player;
    const ahead = (movingAfter.x - movingBefore.x) * looking.x - (movingAfter.y - movingBefore.y) * looking.z;
    check('视角 ' + idx + ' 转90度后W沿实际视线前进', ahead > 0.6, { looking, ahead });
  }
  await preset(p, 5); await drag(p, [700, 270], [1000, 270]);
  await p.evaluate(() => document.getElementById('stage').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  check('触控取消清空未消费的转头量', (await state(p)).cam.lookPending === 0, (await state(p)).cam.lookPending);
  await drag(p, [700, 270], [1000, 270]);
  await p.keyboard.press('Escape'); await steps(p, 1); const paused = await state(p);
  await steps(p, 50);
  check('暂停丢弃尚未消费的视角输入', paused.ui.paused && paused.cam.lookPending === 0 && (await state(p)).cam.heading === paused.cam.heading, paused.cam);
  await context.close();
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36', recordVideo: { dir: out, size: viewport } });
    p = await context.newPage(); p = await setup(p); await preset(p, 5);
    const label = viewport.width + 'x' + viewport.height;
    const layout = await p.evaluate(() => {
      const box = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), c = __JK_TEST__.toLocal(r.x + r.width / 2, r.y + r.height / 2); return { x: c.x - e.offsetWidth / 2, y: c.y - e.offsetHeight / 2, w: e.offsetWidth, h: e.offsetHeight }; };
      return { j: box('btn-fire'), k: box('btn-bomb'), cam: box('btn-cam'), pause: box('btn-pause'), oldCamera: !!document.getElementById('btn-cam-t'), display: __JK_TEST__.snapshot().ui.display };
    });
    check(label + ' J左K右、等大对齐、C在暂停旁', layout.j.x < layout.k.x && layout.j.y === layout.k.y && layout.j.w === layout.k.w && layout.j.h === layout.k.h && layout.cam.y === layout.pause.y && !layout.oldCamera, layout);
    const cdp = await context.newCDPSession(p.hostPage || p), touches = new Map();
    const frameBox = p.hostPage ? await p.hostPage.locator('iframe').boundingBox() : { x: 0, y: 0 };
    const physical = (x, y) => layout.display.rotated ? { x: frameBox.x + layout.display.vw - y, y: frameBox.y + x } : { x: frameBox.x + x, y: frameBox.y + y };
    const send = async (type, id, x, y) => {
      if (type === 'touchEnd') touches.delete(id); else touches.set(id, { id, ...physical(x, y), radiusX: 5, radiusY: 5, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const s0 = await state(p), W = layout.display.W;
    await send('touchStart', 1, 100, 260); await send('touchMove', 1, 100, 210);
    const j = layout.j;
    await send('touchStart', 2, j.x + j.w / 2, j.y + j.h / 2);
    await send('touchStart', 3, W * 0.6, 160); await send('touchMove', 3, W * 0.75, 160);
    await steps(p, 40); const moving = await state(p);
    check(label + ' 摇杆+机枪+拖动三指并行有效', moving.player.y !== s0.player.y && moving.mgShots > s0.mgShots && moving.cam.heading > s0.cam.heading, { from: s0.player, to: moving.player, shots: moving.mgShots, heading: moving.cam.heading });
    for (const id of [1, 2, 3]) await send('touchEnd', id);
    await steps(p, 50);
    const bombBefore = await state(p), k = layout.k;
    await send('touchStart', 4, k.x + k.w / 2, k.y + k.h / 2); await steps(p, 1);
    check(label + ' K实际投弹且动作区不转视角', (await state(p)).bombs.length > bombBefore.bombs.length && Math.abs(diff(bombBefore.cam.heading, (await state(p)).cam.heading)) < 1e-8, (await state(p)).bombs.length);
    await send('touchEnd', 4);
    await p.evaluate(() => __JK_TEST__.step(1, true));
    await p.screenshot({ path: path.join(out, label + '-fp.png') });
    const cb = layout.cam;
    await send('touchStart', 5, cb.x + cb.w / 2, cb.y + cb.h / 2);
    check(label + ' 拖动后首次按下C即切视角', (await state(p)).ui.camera === 'oblique', (await state(p)).ui.camera);
    await send('touchEnd', 5); await steps(p, 1);
    await p.evaluate(() => __JK_TEST__.step(1, true));
    await p.screenshot({ path: path.join(out, label + '.png') });
    // 模式切换保留本局进度，清空按住和拖动状态。
    await p.locator('#btn-pause').click(); await steps(p, 1);
    const position = (await state(p)).player;
    await p.locator('#pause [data-control-mode=hide]').click();
    check(label + ' 切电脑模式保留进度并隐藏摇杆', (await state(p)).ui.touchHidden && (await state(p)).player.x === position.x, (await state(p)).ui.display);
    await p.locator('#pause [data-control-mode=show]').click();
    check(label + ' 切手机模式保留进度并恢复按钮', !(await state(p)).ui.touchHidden && (await state(p)).player.y === position.y, (await state(p)).ui.display);
    await p.locator('#pause [data-control-mode=auto]').click();
    check(label + ' 恢复自动识别触屏', !(await state(p)).ui.touchHidden, (await state(p)).ui.display.touchOn);
    await context.close();
  }
  check('无运行脚本错误', errors.length === 0, errors);
  await browser.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ environment: 'Windows Edge; GPU; CDP simulated multi-touch', base: BASE, results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
})().catch(async e => { console.error(e); if (activeBrowser) await activeBrowser.close(); process.exitCode = 1; });
