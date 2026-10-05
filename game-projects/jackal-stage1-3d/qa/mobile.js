// 手机模拟验收（Chromium 设备模拟 + CDP 多点触控，非真机）：横屏摇杆/J/K/C、多点触控、暂停与全屏按钮、
// 竖屏开始后自动旋转为横屏布局与触控逆变换、横竖切换清空输入、各视角下摇杆方向映射。
const fs = require('fs');
const { BASE, results, check, snap, waitFor, launch } = require('./lib');

async function touchApi(page, context) {
  const cdp = await context.newCDPSession(page);
  const active = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...active.values()] });
  return {
    async down(id, x, y) { active.set(id, { x, y, id, radiusX: 6, radiusY: 6, force: 1 }); await send('touchStart'); },
    // pointermove 按帧对齐派发（Windows Edge 上明显）：等两帧再读，避免拿到上一次的摇杆方向
    async move(id, x, y) { active.set(id, { x, y, id, radiusX: 6, radiusY: 6, force: 1 }); await send('touchMove'); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); },
    async up(id) { active.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...active.values()] }); },
    async cancel() { active.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); },
    async tap(x, y) { await this.down(99, x, y); await page.waitForTimeout(50); await this.up(99); await page.waitForTimeout(100); }
  };
}
const box = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

(async () => {
  const browser = await launch();
  const errors = [];
  // ---------- 横屏 844×390 ----------
  let context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  let page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const steps = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  await page.goto(BASE + '?test=1&seed=21&q=low');
  await page.waitForTimeout(900);
  let T = await touchApi(page, context);
  let s = await snap(page);
  check('[横屏] 打开即显示菜单（不旋转）', s.ui.overlay === 'menu' && !s.ui.display.rotated, s.ui.overlay);
  check('[横屏] 触屏设备显示触控说明', await page.isVisible('#menu .help-touch'));
  const fits = await page.evaluate(() => { const p = document.querySelector('#menu .panel').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, vw: innerWidth, vh: innerHeight }; });
  check('[横屏] 菜单完整落在视口内', fits.top >= 0 && fits.bottom <= fits.vh && fits.left >= 0 && fits.right <= fits.vw, fits);
  const listLink = await box(page, '#menu .list-link');
  check('[横屏] 菜单有「返回游戏列表」且可点（≥40px）', listLink.h >= 40, listLink);
  await page.screenshot({ path: 'out/m_land_menu.png' });
  const armB = await box(page, '#menu [data-opt=armor]');
  await T.tap(armB.x, armB.y); const armT1 = await page.textContent('#menu [data-opt=armor]');
  await T.tap(armB.x, armB.y); const armT2 = await page.textContent('#menu [data-opt=armor]');
  check('[横屏] 点「耐久」在经典一发 / 标准 3 格之间切换（≥40px）', armB.h >= 40 && /经典一发/.test(armT1) && /标准 3 格/.test(armT2), { h: armB.h, armT1, armT2 });
  const start = await box(page, '#menu [data-act=start]');
  await T.tap(start.x, start.y);
  s = await snap(page);
  check('[横屏] 点开始进入游戏且未自动全屏', s.ui.uiMode === 'game' && !s.ui.fs, { mode: s.mode, fs: s.ui.fs });
  await page.evaluate(() => __JK_TEST__.manual(true));
  await steps(130);
  s = await snap(page);
  check('[横屏] 触屏控件显示、键位提示隐藏', !s.ui.touchHidden && !(await page.isVisible('#keyhint')), { touchHidden: s.ui.touchHidden });
  const J = await box(page, '#btn-fire'), K = await box(page, '#btn-bomb'), Cb = await box(page, '#btn-cam-t'), joy = await box(page, '#joy-base');
  const pauseB = await box(page, '#btn-pause');
  check('[横屏] J/K/C 与暂停按钮触控目标 ≥44px', [J, K, Cb, pauseB].every(b => b.w >= 44 && b.h >= 44), { J: J.w, K: K.w, C: Cb.w, pause: pauseB.h });
  const labels = await page.evaluate(() => ['#btn-fire', '#btn-bomb', '#btn-cam-t'].map(q => document.querySelector(q).textContent.replace(/\s+/g, '')));
  check('[横屏] 按键同时显示字母与功能', labels[0] === 'J机枪' && /^K(手雷|火箭|强化火箭)$/.test(labels[1]) && labels[2] === 'C视角', labels);
  const overlap = (a, b) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
  const hudA = await box(page, '#hc-armor');
  const pipsL = await page.$$eval('#h-armor i.on', els => els.length);
  check('[横屏] HUD 显示 3 格护甲，且不压住右上角按钮', pipsL === 3 && !overlap(hudA, pauseB) && hudA.y0 >= 0, { pipsL, hud: [hudA.x0, hudA.y0, hudA.x1, hudA.y1], pause: [pauseB.x0, pauseB.y0] });
  check('[横屏] 视角键不遮挡 J/K 动作键', !overlap(Cb, J) && !overlap(Cb, K) && !overlap(J, K), { C: [Cb.x0, Cb.y0, Cb.x1, Cb.y1], J: [J.x0, J.y0, J.x1, J.y1], K: [K.x0, K.y0, K.x1, K.y1] });
  await page.evaluate(() => { __JK_TEST__.step(1, true); });
  await page.screenshot({ path: 'out/m_land_play.png' });

  // 摇杆：每个视角下拖向屏幕右/上（第一人称下先摆正车头，方向相对车头）
  for (let v = 0; v < 6; v++) {
    s = await snap(page);
    const isFp = s.ui.camera === 'fp';
    await page.evaluate(() => { __JK_TEST__.cheat.teleport(-8, 22); __JK_TEST__.cheat.invuln(60); });
    if (isFp) await page.evaluate(() => { __JK_TEST__.cheat.face(0); });
    let a = await snap(page);
    await T.down(1, joy.x, joy.y); await T.move(1, joy.x + 30, joy.y + 3); await T.move(1, joy.x + 55, joy.y + 4);
    await steps(20);
    let b = await snap(page);
    const right = b.player.x - a.player.x;
    if (isFp) await page.evaluate(() => { __JK_TEST__.cheat.face(0); });
    await T.move(1, joy.x + 3, joy.y - 55);
    a = await snap(page); await steps(20); b = await snap(page);
    const up = b.player.y - a.player.y;
    await T.up(1); await steps(1);
    check('[横屏 · ' + s.ui.camera + '] 摇杆右 → 东、上 → 北', right > 2 && up > 2, { right: +right.toFixed(2), up: +up.toFixed(2) });
    await T.tap(Cb.x, Cb.y); await steps(1);
  }
  s = await snap(page);
  check('[横屏] C 键（触屏）循环视角回到斜俯视', s.ui.camera === 'oblique', s.ui.camera);
  // 多点：摇杆上 + 按住 J
  await page.evaluate(() => { __JK_TEST__.cheat.teleport(-20, 12); __JK_TEST__.cheat.invuln(60); });
  let a = await snap(page);
  await T.down(1, joy.x, joy.y); await T.move(1, joy.x + 2, joy.y - 55);
  await T.down(2, J.x, J.y);
  await steps(30);
  let b = await snap(page);
  check('[横屏] 多点触控：边移动边按住 J 连发', b.input.touchFire && b.input.touchDir === 0 && b.mgShots - a.mgShots >= 3 && b.player.y > a.player.y + 2, { shots: b.mgShots - a.mgShots, dy: +(b.player.y - a.player.y).toFixed(2), input: b.input });
  // 第三指：K 扔手雷
  await T.down(3, K.x, K.y); await steps(3);
  b = await snap(page);
  check('[横屏] 三指同时：K 抛出手雷', b.bombs.includes('grenade'), b.bombs);
  await page.evaluate(() => { __JK_TEST__.step(1, true); });
  await page.screenshot({ path: 'out/m_land_multitouch.png' });
  await T.up(3); await T.up(2); await T.up(1); await steps(2);
  b = await snap(page);
  check('[横屏] 松手后无持续移动/连发', b.input.touchDir === -1 && !b.input.touchFire && !b.input.touchBomb, b.input);
  await T.down(4, joy.x, joy.y); await T.move(4, joy.x - 50, joy.y); await steps(2);
  await T.cancel(); await steps(2);
  b = await snap(page);
  check('[横屏] touchcancel 清空方向', b.input.touchDir === -1, b.input);
  // 暂停按钮
  await T.tap(pauseB.x, pauseB.y); await steps(1);
  s = await snap(page);
  check('[横屏] 右上角暂停按钮', s.ui.overlay === 'pause', s.ui.overlay);
  await page.screenshot({ path: 'out/m_land_pause.png' });
  const resume = await box(page, '#pause [data-act=resume]');
  await T.tap(resume.x, resume.y);
  s = await snap(page);
  check('[横屏] 触屏「继续」', s.ui.overlay === null, s.ui.overlay);
  check('[横屏] 手机全屏入口均隐藏', !(await page.isVisible('#btn-fs')) && await page.locator('.fs-btn:visible').count() === 0);
  await context.close();

  // ---------- 竖屏 390×844：开始后自动旋转 ----------
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const steps2 = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  await page.goto(BASE + '?test=1&seed=22&q=low');
  await page.waitForTimeout(900);
  T = await touchApi(page, context);
  s = await snap(page);
  check('[竖屏] 菜单正常显示（未旋转、无横屏阻断提示）', s.ui.overlay === 'menu' && !s.ui.display.rotated, s.ui.display);
  await page.screenshot({ path: 'out/m_port_menu.png' });
  const st2 = await box(page, '#menu [data-act=start]');
  await T.tap(st2.x, st2.y);
  await page.evaluate(() => __JK_TEST__.manual(true));
  await steps2(130);
  s = await snap(page);
  check('[竖屏] 开始后自动旋转为横屏布局（逻辑 844×390）', s.ui.display.rotated && s.ui.display.W === 844 && s.ui.display.H === 390, s.ui.display);
  await page.evaluate(() => { __JK_TEST__.step(1, true); });
  await page.screenshot({ path: 'out/m_port_play.png' });
  {
    const ov = (a, b) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
    const hA = await box(page, '#hc-armor'), pB = await box(page, '#btn-pause'), sc = await box(page, '#hud .hud-score');
    check('[竖屏] 旋转布局下护甲卡片完整可见、不与按钮重叠', hA.w > 30 && !ov(hA, pB) && !ov(hA, sc), { hud: [hA.x0, hA.y0, hA.x1, hA.y1] });
  }
  const joy2 = await box(page, '#joy-base'), J2 = await box(page, '#btn-fire');
  // 旋转 90°：逻辑上 = 物理右；逻辑右 = 物理下
  await page.evaluate(() => { __JK_TEST__.cheat.teleport(-8, 22); __JK_TEST__.cheat.invuln(60); });
  a = await snap(page);
  await T.down(1, joy2.x, joy2.y); await T.move(1, joy2.x + 30, joy2.y); await T.move(1, joy2.x + 55, joy2.y);
  await steps2(20);
  b = await snap(page);
  const upLocal = b.player.y - a.player.y;
  await T.move(1, joy2.x, joy2.y + 55);
  a = await snap(page); await steps2(20); b = await snap(page);
  const rightLocal = b.player.x - a.player.x;
  await T.up(1);
  check('[竖屏] 触控逆变换：物理向右拖 = 画面上方（北），物理向下拖 = 画面右（东）', upLocal > 2 && rightLocal > 2, { upLocal: +upLocal.toFixed(2), rightLocal: +rightLocal.toFixed(2) });
  a = await snap(page);
  await T.down(2, J2.x, J2.y); await steps2(20); await T.up(2);
  b = await snap(page);
  check('[竖屏] 旋转布局下 J 键开火', b.mgShots - a.mgShots >= 2, b.mgShots - a.mgShots);
  const pz = await box(page, '#btn-pause');
  await T.tap(pz.x, pz.y); await steps2(1);
  s = await snap(page);
  check('[竖屏] 旋转布局下暂停按钮可用', s.ui.overlay === 'pause', s.ui.overlay);
  await page.screenshot({ path: 'out/m_port_pause.png' });
  const rs = await box(page, '#pause [data-act=resume]');
  await T.tap(rs.x, rs.y);
  // 按住方向时转为横屏：布局更新并清空输入
  await T.down(5, joy2.x, joy2.y); await T.move(5, joy2.x + 50, joy2.y); await steps2(2);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await steps2(2);
  s = await snap(page);
  check('[切换] 竖屏 → 横屏：取消旋转并清空按住的方向', !s.ui.display.rotated && s.input.touchDir === -1, { rotated: s.ui.display.rotated, input: s.input });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300); await steps2(2);
  s = await snap(page);
  check('[切换] 横屏 → 竖屏：重新旋转布局', s.ui.display.rotated, s.ui.display);
  check('全程无脚本错误', errors.length === 0, errors.slice(0, 5));
  await context.close();
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  fs.writeFileSync('out/mobile.json', JSON.stringify({ when: new Date().toISOString(), env: 'Chromium 设备模拟（isMobile/hasTouch，DPR3，Pixel 8 UA）+ CDP 触摸事件；SwiftShader；非真机', pass, total: results.length, results }, null, 1));
  await browser.close();
})();
