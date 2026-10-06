// 手机模拟验收（Chromium 设备模拟 + CDP 多点触控，非真机）：横屏摇杆/J/K/C、多点触控、暂停与全屏按钮、
// 竖屏开始后自动旋转为横屏布局与触控逆变换、横竖切换清空输入、各视角下摇杆方向映射、
// 568×320 窄横屏菜单整层滚动首尾可达、全屏入口按浏览器能力显示（不支持时隐藏且键盘导航跳过）。
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
    async tap(x, y) { await this.down(99, x, y); await page.waitForTimeout(50); await this.up(99); await page.waitForTimeout(100); },
    // 手指拖动滚动（Input.synthesizeScrollGesture 的 touch 模式在设备模拟下不滚动，用逐帧 touchMove）
    async swipe(x, y, dx, dy) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 98 }] });
      for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / 12, y: y + dy * k / 12, id: 98 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(450);
    }
  };
}
const box = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; };
// 覆盖层可达性：首/末个可操作项是否完整在视口内且未被遮挡、面板是否横向溢出、选项文字是否被裁
const reach = (page, sel) => page.evaluate((sel) => {
  const ov = document.querySelector(sel), p = ov.querySelector('.panel').getBoundingClientRect();
  const els = [...ov.querySelectorAll('.items > button, .items > a, .control-modes > button')].filter(e => e.getClientRects().length);
  const ok = (e) => {
    const b = e.getBoundingClientRect();
    if (b.top < 0 || b.left < 0 || b.bottom > innerHeight || b.right > innerWidth) return false;
    const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!t && e.contains(t);
  };
  return { scrollTop: Math.round(ov.scrollTop), max: ov.scrollHeight - ov.clientHeight, panel: [Math.round(p.left), Math.round(p.right)], vw: innerWidth,
    first: ok(els[0]), last: ok(els[els.length - 1]), lastName: els[els.length - 1].dataset.controlMode || els[els.length - 1].textContent.trim(),
    clipped: els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()), minH: Math.min(...els.map(e => e.getBoundingClientRect().height)) };
}, sel);
const panelFits = (page, sel) => page.evaluate((sel) => { const p = document.querySelector(sel + ' .panel').getBoundingClientRect(); return { top: Math.round(p.top), bottom: Math.round(p.bottom), left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth, vh: innerHeight }; }, sel);
const inside = (f) => f.top >= 0 && f.bottom <= f.vh && f.left >= 0 && f.right <= f.vw;
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
  const J = await box(page, '#btn-fire'), K = await box(page, '#btn-bomb'), Cb = await box(page, '#btn-cam'), joy = await box(page, '#joy-base');
  const pauseB = await box(page, '#btn-pause');
  check('[横屏] J/K/C 与暂停按钮触控目标 ≥44px', [J, K, Cb, pauseB].every(b => b.w >= 44 && b.h >= 44), { J: J.w, K: K.w, C: Cb.w, pause: pauseB.h });
  const labels = await page.evaluate(() => ['#btn-fire', '#btn-bomb', '#btn-cam'].map(q => document.querySelector(q).textContent.replace(/\s+/g, '')));
  check('[横屏] 按键同时显示字母与功能', labels[0] === 'J机枪' && /^K(手雷|火箭|强化火箭)$/.test(labels[1]) && labels[2].startsWith('C'), labels);
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
  // 拖动转视角：look-zone 拖动旋转镜头，旋转后摇杆方向跟着镜头走
  await page.evaluate(() => { __JK_TEST__.cheat.teleport(-8, 22); __JK_TEST__.cheat.invuln(60); });
  s = await snap(page);
  const yaw0 = s.cam.yaw;
  const lz = { x: 540, y0: 110 };
  await T.down(1, lz.x, lz.y0 + 30); await T.move(1, lz.x + 120, lz.y0 + 30); await T.up(1); await steps(90);
  s = await snap(page);
  check('[横屏] look-zone 右拖 → 镜头 yaw 减小', s.cam.yaw < yaw0 - 0.3, { yaw0, yaw1: s.cam.yaw });
  // 独立校验移动映射；拖动限速及多圈已由 touch-view.js 的实际输入覆盖。
  await page.evaluate(() => { __JK_TEST__._cam.rotate(Math.PI / 2 - __JK_TEST__._cam.yaw); }); await steps(1);
  s = await snap(page);
  await page.evaluate(() => { __JK_TEST__.cheat.teleport(-8, 22); __JK_TEST__.cheat.invuln(60); });
  let la = await snap(page);
  await T.down(1, joy.x, joy.y); await T.move(1, joy.x + 2, joy.y - 55); await steps(20);
  let lb = await snap(page);
  await T.up(1); await steps(1);
  check('[横屏] 镜头左转 90° 后摇杆上 → 视线前方（世界西）', Math.abs(s.cam.yaw - Math.PI / 2) < 0.2 && lb.player.x - la.player.x < -2, { yaw: s.cam.yaw, dx: +(lb.player.x - la.player.x).toFixed(2) });
  for (let i = 0; i < 6; i++) { await T.tap(Cb.x, Cb.y); await steps(1); }   // 循环回斜俯视并复位 yaw
  s = await snap(page);
  check('[横屏] 循环后回到斜俯视且 yaw 复位', s.ui.camera === 'oblique' && Math.abs(s.cam.yaw) < 0.01, { camera: s.ui.camera, yaw: s.cam.yaw });
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
  const pfit = await panelFits(page, '#pause');
  check('[横屏] 暂停菜单完整落在视口内', inside(pfit), pfit);
  // 2026-10-06 规则：全屏按浏览器实际能力显示，不因手机分类隐藏（本环境支持 Fullscreen API 时应显示）
  const fsCap = s.ui.fsCapable;
  check('[横屏] 暂停菜单「全屏」按浏览器能力显示', (await page.isVisible('#pause .fs-btn')) === fsCap, { fsCapable: fsCap });
  const resume = await box(page, '#pause [data-act=resume]');
  await T.tap(resume.x, resume.y);
  s = await snap(page);
  check('[横屏] 触屏「继续」', s.ui.overlay === null, s.ui.overlay);
  const topRow = await page.evaluate(() => ['btn-cam', 'btn-pause', 'btn-fs'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { id, vis: r.width > 0 && getComputedStyle(e).display !== 'none', x0: Math.round(r.left), x1: Math.round(r.right), y0: Math.round(r.top), h: Math.round(r.height), wrap: e.scrollHeight > e.clientHeight + 2 }; }));
  const [camT, pauseT, fsT] = topRow;
  const rowOk = topRow.every(b => Math.abs(b.y0 - camT.y0) <= 2 && b.h >= 44 && !b.wrap) && camT.x1 <= pauseT.x0 && pauseT.x1 <= fsT.x0 && 844 - fsT.x1 <= 14 && fsT.y0 <= 14;
  check('[横屏] 右上全屏按钮按能力显示，与视角/暂停同排贴右上角', fsT.vis === fsCap && (!fsCap || rowOk), topRow);
  if (fsCap) {
    const fsB = await box(page, '#btn-fs');
    await T.tap(fsB.x, fsB.y); await page.waitForTimeout(600);
    s = await snap(page);
    check('[横屏] 点全屏按钮请求全屏（成功或被拒都有记录，本局继续）', s.ui.fsLog.length >= 1 && s.ui.uiMode === 'game' && (s.ui.fs || !!s.ui.toast), { fs: s.ui.fs, fsLog: s.ui.fsLog, toast: s.ui.toast });
    if (s.ui.fs) {
      await page.evaluate(() => document.exitFullscreen());
      s = await waitFor(page, x => x.ui.overlay === 'pause' && !x.ui.fs, 5000, 150) || await snap(page);
      check('[横屏] 退出全屏自动暂停', s.ui.overlay === 'pause' && !s.ui.fs, { overlay: s.ui.overlay, fs: s.ui.fs });
      const rs0 = await box(page, '#pause [data-act=resume]');
      await T.tap(rs0.x, rs0.y);
      s = await snap(page);
      check('[横屏] 退出全屏后点「继续」回到本局', s.ui.overlay === null && s.ui.uiMode === 'game', s.ui.overlay);
    }
  }
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
    // 得分已移入暂停菜单（v0.6 精简战斗面板），旁边的 HUD 卡片是武器卡
    const ov = (a, b) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
    const hA = await box(page, '#hc-armor'), pB = await box(page, '#btn-pause'), wp = await box(page, '#hud .hud-wpn');
    const inView = hA.x0 >= 0 && hA.y0 >= 0 && hA.x1 <= 390 && hA.y1 <= 844;
    // 旋转 90° 后物理宽 = 逻辑高（薄行约 24px），用长边判断卡片确实渲染出来
    check('[竖屏] 旋转布局下护甲卡片完整可见、不与按钮和武器卡重叠', Math.max(hA.w, hA.h) > 30 && inView && !ov(hA, pB) && !ov(hA, wp), { hud: [hA.x0, hA.y0, hA.x1, hA.y1], wpn: [wp.x0, wp.y0, wp.x1, wp.y1] });
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
  const pfit2 = await panelFits(page, '#pause');
  check('[竖屏] 旋转布局（逻辑 844×390）暂停菜单完整落在屏幕内', inside(pfit2), pfit2);
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
  await context.close();

  // ---------- 窄横屏 568×320：主菜单、暂停整层滚动，首尾都能用手指与键盘到达 ----------
  context = await browser.newContext({ viewport: { width: 568, height: 320 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const steps3 = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  await page.goto(BASE + '?test=1&seed=23&q=low');
  await page.waitForTimeout(900);
  T = await touchApi(page, context);
  let r = await reach(page, '#menu');
  check('[窄横屏] 主菜单不横向溢出、选项文字不被裁、触控高度 ≥40px', r.panel[0] >= 0 && r.panel[1] <= r.vw && r.clipped.length === 0 && r.minH >= 40, r);
  check('[窄横屏] 主菜单打开时「开始游戏」完整可见', r.scrollTop === 0 && r.first, r);
  await page.screenshot({ path: 'out/m_narrow_menu.png' });
  await T.swipe(150, 260, 0, -240); await T.swipe(150, 260, 0, -240);
  r = await reach(page, '#menu');
  check('[窄横屏] 手指上滑到底：最后一项（操作模式「手机触屏」）完整可见可点', r.max > 0 && r.scrollTop >= r.max - 1 && r.last && r.lastName === 'show', r);
  const lastMode = await box(page, '#menu [data-control-mode=show]');
  await T.tap(lastMode.x, lastMode.y);
  const pressed = await page.getAttribute('#menu [data-control-mode=show]', 'aria-pressed');
  const autoMode = await box(page, '#menu [data-control-mode=auto]');
  await T.tap(autoMode.x, autoMode.y);
  check('[窄横屏] 滚到底后点「手机触屏」生效，再点回「自动识别」', pressed === 'true' && (await page.getAttribute('#menu [data-control-mode=auto]', 'aria-pressed')) === 'true', { pressed });
  await T.swipe(150, 60, 0, 240); await T.swipe(150, 60, 0, 240);
  r = await reach(page, '#menu');
  check('[窄横屏] 手指下滑回顶：「开始游戏」重新完整可见', r.scrollTop === 0 && r.first, r);
  const st3 = await box(page, '#menu [data-act=start]');
  await T.tap(st3.x, st3.y);
  await page.evaluate(() => __JK_TEST__.manual(true));
  await steps3(130);
  s = await snap(page);
  check('[窄横屏] 点开始进入游戏', s.ui.uiMode === 'game' && s.ui.overlay === null, s.ui.overlay);
  const pz3 = await box(page, '#btn-pause');
  await T.tap(pz3.x, pz3.y); await steps3(1);
  r = await reach(page, '#pause');
  check('[窄横屏] 暂停菜单「继续」完整可见，选项不被裁', r.first && r.scrollTop === 0 && r.clipped.length === 0 && r.panel[1] <= r.vw, r);
  await T.swipe(150, 260, 0, -240); await T.swipe(150, 260, 0, -240);
  r = await reach(page, '#pause');
  check('[窄横屏] 暂停菜单上滑到底：最后一项完整可见', r.max > 0 && r.scrollTop >= r.max - 1 && r.last, r);
  await page.screenshot({ path: 'out/m_narrow_pause_end.png' });
  // 键盘：↑ 从首项绕到末项、↓ 绕回首项，焦点项都会自动滚进视口
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');   // 焦点回到「继续」
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(250);
  const kb1 = await reach(page, '#pause');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250);
  const kb2 = await reach(page, '#pause');
  s = await snap(page);
  check('[窄横屏] 键盘 ↑/↓ 绕到首尾时焦点项滚入视口', kb1.last && kb2.first && s.ui.focus === 'resume', { last: kb1.last, first: kb2.first, focus: s.ui.focus });
  await page.keyboard.press('Escape'); await steps3(1);
  s = await snap(page);
  check('[窄横屏] Esc 继续本局', s.ui.overlay === null && s.ui.uiMode === 'game', s.ui.overlay);
  await context.close();

  // ---------- 浏览器不支持全屏（如 iPhone Safari、未授权全屏的 iframe）：入口隐藏，键盘导航跳过，F 键提示后继续 ----------
  context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  await context.addInitScript(() => {
    delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
  });
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&seed=24&q=low');
  await page.waitForTimeout(900);
  T = await touchApi(page, context);
  s = await snap(page);
  const seen = [];
  const nItems = await page.evaluate(() => [...document.querySelectorAll('#menu .items > button, #menu .items > a, #menu .control-modes > button')].filter(e => e.getClientRects().length).length);
  // 操作模式三键没有 data-act/opt/id，按 data-control-mode 区分
  for (let k = 0; k < nItems; k++) { await page.keyboard.press('ArrowDown'); seen.push(await page.evaluate(() => { const e = document.activeElement; return e.dataset.act || e.dataset.opt || (e.dataset.controlMode ? 'mode:' + e.dataset.controlMode : e.id); })); }
  check('[不支持全屏] 主菜单隐藏「全屏」，键盘 ↓ 逐项走完不卡住、不落到隐藏项', !s.ui.fsCapable && !(await page.isVisible('#menu .fs-btn')) && !seen.includes('fullscreen') && new Set(seen).size === nItems, { fsCapable: s.ui.fsCapable, nItems, seen });
  const ff = await panelFits(page, '#menu');
  check('[不支持全屏] 主菜单仍完整落在视口内', inside(ff), ff);
  const st4 = await box(page, '#menu [data-act=start]');
  await T.tap(st4.x, st4.y);
  await page.evaluate(() => __JK_TEST__.manual(true));
  await page.evaluate(() => { for (let i = 0; i < 130; i++) __JK_TEST__.step(1, false); });
  const pz4 = await box(page, '#btn-pause'), cm4 = await box(page, '#btn-cam');
  check('[不支持全屏] 右上隐藏全屏，暂停按钮贴右上角、与视角键同排', !(await page.isVisible('#btn-fs')) && 844 - pz4.x1 <= 14 && Math.abs(pz4.y0 - cm4.y0) <= 2 && cm4.x1 <= pz4.x0, { pause: [pz4.x0, pz4.y0, pz4.x1], cam: [cm4.x0, cm4.y0, cm4.x1] });
  await page.keyboard.press('KeyF'); await page.waitForTimeout(150);
  s = await snap(page);
  check('[不支持全屏] F 键提示不支持并继续本局', s.ui.fsLog.includes('unsupported') && /不支持全屏/.test(s.ui.toast || '') && s.ui.uiMode === 'game' && s.ui.overlay === null, { fsLog: s.ui.fsLog, toast: s.ui.toast });
  await context.close();

  check('全程无脚本错误', errors.length === 0, errors.slice(0, 5));
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  if (pass !== results.length) process.exitCode = 1;
  fs.writeFileSync('out/mobile.json', JSON.stringify({ when: new Date().toISOString(), env: 'Chromium 设备模拟（isMobile/hasTouch，DPR3，Pixel 8 UA）+ CDP 触摸事件；SwiftShader；非真机', pass, total: results.length, results }, null, 1));
  await browser.close();
})();
