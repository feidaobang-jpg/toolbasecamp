// 手机设备模拟 + 多点触控验收（CDP 触摸事件）：node qa/mobile.js
const { pw, launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
(async () => {
  const b = await launch();
  const results = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  const errs = [];
  async function device(w, h) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const cdp = await ctx.newCDPSession(page);
    return { ctx, page, cdp };
  }
  const S = (page) => page.evaluate(() => window.__CD_TEST__.snapshot());
  const rectOf = (page, sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
  const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id !== undefined ? p.id : i, radiusX: 4, radiusY: 4, force: 1 })) });
  async function tapSel(page, cdp, sel) { const r = await rectOf(page, sel); await touch(cdp, 'touchStart', [{ x: r.x, y: r.y, id: 9 }]); await sleep(60); await touch(cdp, 'touchEnd', []); await sleep(120); }

  // ---------- 横屏 844×390 ----------
  let { ctx, page, cdp } = await device(844, 390);
  await page.goto(BASE + '?test=1&seed=3', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await sleep(800);
  let s = await S(page);
  ok('手机横屏：主菜单可见', s.ui.overlay === 'menu');
  ok('触屏说明显示、键盘说明隐藏', await page.evaluate(() => getComputedStyle(document.querySelector('.help-touch')).display !== 'none' && getComputedStyle(document.querySelector('.help-desktop')).display === 'none'));
  ok('手机也提供全屏按钮（2026-10-06 起按浏览器能力检测，不按手机分类隐藏）', await page.evaluate(() => getComputedStyle(document.querySelector('.fs-btn')).display !== 'none'));
  const panelFits = await page.evaluate(() => { const r = document.querySelector('#menu .panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
  ok('主菜单宽度落在视口内', panelFits);
  await page.screenshot({ path: out('mobile-menu.png') });
  await tapSel(page, cdp, '[data-act=select]');
  s = await S(page); ok('点开始游戏 → 选人', s.ui.overlay === 'select');
  await tapSel(page, cdp, '.card[data-hero="3"]');
  s = await S(page); ok('点卡片选梅斯', s.ui.hero === 3, s.ui.hero);
  await page.screenshot({ path: out('mobile-select.png') });
  await tapSel(page, cdp, '#sel-go');
  await sleep(400);
  s = await S(page); ok('点出发开始游戏', s.ui.uiMode === 'game' && !s.ui.overlay, [s.ui.uiMode, s.ui.overlay]);
  ok('触屏按键显示、键位提示隐藏', !s.ui.touchHidden && await page.evaluate(() => document.getElementById('keyhint').hidden));
  ok('未自动请求全屏', !s.ui.fs && s.ui.fsLog.length === 0);
  // 用 J 键跳过开场对话
  for (let i = 0; i < 12; i++) { s = await S(page); if (s.mode === 'play') break; await tapSel(page, cdp, '#btn-atk'); await sleep(250); }
  s = await S(page); ok('点 J 跳过对话进入战斗', s.mode === 'play', s.mode);
  await page.evaluate(() => window.__CD_TEST__.cheat.killAll()); await sleep(1500);
  await page.screenshot({ path: out('mobile-game.png') });
  // 摇杆
  const jz = await rectOf(page, '#joy-zone');
  const jx = jz.x - jz.w * 0.2, jy = jz.y + jz.h * 0.15;
  let x0 = (await S(page)).player.x;
  await touch(cdp, 'touchStart', [{ x: jx, y: jy, id: 1 }]); await sleep(50);
  for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: jx + k * 10, y: jy, id: 1 }]); await sleep(16); }
  await sleep(500);
  s = await S(page); ok('摇杆右推：角色向右走', s.player.x > x0 + 0.6, [x0, s.player.x]);
  // 多点：摇杆按住同时点 J
  const atk = await rectOf(page, '#btn-atk');
  await touch(cdp, 'touchMove', [{ x: jx + 60, y: jy, id: 1 }, { x: atk.x, y: atk.y, id: 2 }]);
  await touch(cdp, 'touchStart', [{ x: jx + 60, y: jy, id: 1 }, { x: atk.x, y: atk.y, id: 2 }]);
  await sleep(60);
  s = await S(page); ok('多点触控：边推摇杆边按 J 出拳', s.player.state === 'attack', s.player.state);
  await touch(cdp, 'touchEnd', [{ x: jx + 60, y: jy, id: 1 }]); await sleep(40);
  await touch(cdp, 'touchEnd', []); await sleep(500);
  s = await S(page); ok('松手后不再移动（无卡键）', Math.abs(s.player.x - (await S(page)).player.x) < 0.01 && s.input.stick.x === 0, s.input.stick);
  // 摇杆上推 = 纵深
  const z0 = (await S(page)).player.z;
  await touch(cdp, 'touchStart', [{ x: jx, y: jy, id: 3 }]); await sleep(30);
  for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: jx, y: jy - k * 10, id: 3 }]); await sleep(16); }
  await sleep(350); await touch(cdp, 'touchEnd', []); await sleep(200);
  s = await S(page); ok('摇杆上推：走向纵深', s.player.z < z0 - 0.3, [z0, s.player.z]);
  // K 跳 / U 必杀 / L 冲刺
  await tapSel(page, cdp, '#btn-jump'); s = await S(page); ok('K 键跳跃', s.player.state === 'jump' || s.player.y > 0, [s.player.state, s.player.y]);
  await sleep(700);
  await tapSel(page, cdp, '#btn-mega'); await sleep(30);
  const mv = await page.evaluate(() => { const p = window.__CD_TEST__.cheat.G.player; return p.move ? p.move.id : p.state; });
  ok('U 键必杀', mv === 'mega' || mv === 'idle', mv);
  await sleep(700);
  const run = await rectOf(page, '#btn-run');
  await touch(cdp, 'touchStart', [{ x: run.x, y: run.y, id: 4 }, { x: jx, y: jy, id: 5 }]); await sleep(30);
  for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: run.x, y: run.y, id: 4 }, { x: jx + k * 10, y: jy, id: 5 }]); await sleep(16); }
  await sleep(250);
  s = await S(page); ok('按住 I + 摇杆 = 冲刺', s.player.state === 'run', s.player.state);
  await touch(cdp, 'touchEnd', []); await sleep(300);
  // C 视角（右上角，和暂停在一起）、拖动转视角（手机不设 Q/E 按钮）
  await tapSel(page, cdp, '#btn-cam'); s = await S(page); ok('C 键切换视角', s.ui.camera === 'oblique', s.ui.camera);
  const lx = 450, ly = 100;
  await touch(cdp, 'touchStart', [{ x: lx, y: ly, id: 6 }]);
  for (let k = 1; k <= 8; k++) { await touch(cdp, 'touchMove', [{ x: lx + k * 15, y: ly, id: 6 }]); await sleep(16); }
  await touch(cdp, 'touchEnd', []);
  s = await S(page); ok('按住画面右拖 = 向右转视角（与 E 同向）', s.ui.yawOff < -0.3, s.ui.yawOff);
  for (let i = 0; i < 3; i++) await tapSel(page, cdp, '#btn-cam');
  s = await S(page); ok('C 循环回侧视', s.ui.camera === 'side' && s.ui.yawOff === 0, [s.ui.camera, s.ui.yawOff]);
  // 暂停
  await tapSel(page, cdp, '#btn-pause'); s = await S(page); ok('暂停按钮', s.ui.overlay === 'pause');
  const pausedFits = await page.evaluate(() => { const r = document.querySelector('#pause .panel').getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; });
  ok('暂停菜单完整落在视口内', pausedFits);
  await page.screenshot({ path: out('mobile-pause.png') });
  await tapSel(page, cdp, '#pause [data-act=resume]'); s = await S(page); ok('点继续', !s.ui.overlay);
  // HUD 不压右上角按钮
  const hudOk = await page.evaluate(() => { const a = document.getElementById('hud').getBoundingClientRect(), b = document.getElementById('hud-top').getBoundingClientRect(); return a.right < b.left; });
  ok('HUD 与右上角按钮不重叠', hudOk);
  // 触屏按键互不重叠
  const overlap = await page.evaluate(() => { const ids = ['btn-atk', 'btn-jump', 'btn-run', 'btn-mega', 'btn-cam', 'btn-pause']; const R = ids.map(i => document.getElementById(i).getBoundingClientRect()); const bad = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(ids[i] + '/' + ids[j]); } return bad; });
  ok('触屏按键互不重叠', overlap.length === 0, overlap);
  const sizes = await page.evaluate(() => ['btn-atk', 'btn-jump', 'btn-run', 'btn-mega', 'btn-cam', 'btn-pause'].map(i => Math.min(document.getElementById(i).getBoundingClientRect().width, document.getElementById(i).getBoundingClientRect().height)));
  ok('触控目标不小于 44px', sizes.every(v => v >= 44), sizes);
  // 触屏模式不显示键盘专用标签：暂停键不写 Esc，菜单按钮不带 Enter / Esc 键帽
  const kbHidden = await page.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    return { pauseEsc: vis(document.querySelector('#btn-pause .kb-only')), pauseIcon: vis(document.querySelector('#btn-pause .touch-only')), menuKbd: Array.from(document.querySelectorAll('.overlay kbd')).filter(k => getComputedStyle(k).display !== 'none').length };
  });
  ok('触屏模式隐藏 Esc / Enter 键盘标签', !kbHidden.pauseEsc && kbHidden.pauseIcon && kbHidden.menuKbd === 0, kbHidden);
  // 失焦清空输入
  await touch(cdp, 'touchStart', [{ x: jx, y: jy, id: 7 }]); for (let k = 1; k <= 5; k++) { await touch(cdp, 'touchMove', [{ x: jx + k * 10, y: jy, id: 7 }]); await sleep(16); }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  s = await S(page); ok('失焦：清空按住并自动暂停', s.input.stick.x === 0 && s.ui.overlay === 'pause', [s.input.stick, s.ui.overlay]);
  await touch(cdp, 'touchEnd', []);
  await ctx.close();

  // ---------- 竖屏 390×844：开局后自动旋转 ----------
  ({ ctx, page, cdp } = await device(390, 844));
  await page.goto(BASE + '?test=1&seed=3', { waitUntil: 'load' }); await sleep(800);
  // 2026-10-07：手机竖着拿时标题菜单也直接旋转成横屏，免得菜单竖屏、开局又变横屏
  s = await S(page);
  const pm = await page.evaluate(() => { const r = document.querySelector('#menu .panel').getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight }; });
  ok('竖屏：菜单打开即旋转为横屏（逻辑 844×390）且完整显示', s.ui.overlay === 'menu' && s.ui.display.rotated && s.ui.display.W === 844 && s.ui.display.H === 390 && pm.l >= 0 && pm.t >= 0 && pm.r <= pm.vw && pm.b <= pm.vh, { display: s.ui.display, pm });
  await page.screenshot({ path: out('mobile-portrait-menu.png') });
  await tapSel(page, cdp, '[data-act=select]');
  s = await S(page); ok('竖屏进入选人画面即旋转为横屏', s.ui.overlay === 'select' && s.ui.display.rotated && s.ui.display.W === 844 && s.ui.display.H === 390, s.ui.display);
  await tapSel(page, cdp, '#sel-go'); await sleep(400);
  s = await S(page); ok('竖屏开局后舞台保持横屏布局', s.ui.display.rotated && s.ui.display.W === 844 && s.ui.display.H === 390, s.ui.display);
  // 小霸王 / 街机式 2×2 方阵（旋转布局下按逻辑坐标判断）：下排 J 左、K 右，上排 U 左、I 右，四键等大、横平竖直
  const pad = await page.evaluate(() => {
    const toL = window.__CD_TEST__.toLocal, c = (id) => { const b = document.getElementById(id).getBoundingClientRect(); const p = toL(b.left + b.width / 2, b.top + b.height / 2); return { x: Math.round(p.x), y: Math.round(p.y), s: Math.round(Math.min(b.width, b.height)) }; };
    return { J: c('btn-atk'), K: c('btn-jump'), U: c('btn-mega'), I: c('btn-run') };
  });
  const near = (a, b) => Math.abs(a - b) <= 2;
  ok('触屏 2×2 方阵：下排 J K、上排 U I，等大对齐', near(pad.J.y, pad.K.y) && near(pad.U.y, pad.I.y) && near(pad.J.x, pad.U.x) && near(pad.K.x, pad.I.x) && pad.J.x < pad.K.x && pad.U.y < pad.J.y && new Set([pad.J.s, pad.K.s, pad.U.s, pad.I.s]).size === 1, pad);
  for (let i = 0; i < 12; i++) { s = await S(page); if (s.mode === 'play') break; await tapSel(page, cdp, '#btn-atk'); await sleep(250); }
  await page.evaluate(() => window.__CD_TEST__.cheat.killAll()); await sleep(1500);
  await page.screenshot({ path: out('mobile-portrait-game.png') });
  // 旋转布局下：在屏幕上向下拖 = 横屏里的向右
  const jz2 = await rectOf(page, '#joy-zone');
  x0 = (await S(page)).player.x;
  const px = jz2.x, py = jz2.y - jz2.h * 0.1;
  await touch(cdp, 'touchStart', [{ x: px, y: py, id: 1 }]); await sleep(30);
  for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: px, y: py + k * 10, id: 1 }]); await sleep(16); }
  await sleep(500); await touch(cdp, 'touchEnd', []); await sleep(100);
  s = await S(page); ok('旋转布局触控逆变换：屏幕向下拖 → 角色向右走', s.player.x > x0 + 0.5, [x0, s.player.x]);
  // 按下后立即读状态：刺拳挥空约 0.2 秒就收招，等松手再读会碰上收招
  { const r = await rectOf(page, '#btn-atk'); await touch(cdp, 'touchStart', [{ x: r.x, y: r.y, id: 9 }]); await sleep(60); s = await S(page); await touch(cdp, 'touchEnd', []); await sleep(120); }
  ok('旋转布局下 J 键可用', s.player.state === 'attack' || s.player.state === 'pickup', s.player.state);
  await ctx.close();

  // ---------- Toy 宿主 0×0 启动后才给尺寸 ----------
  ({ ctx, page, cdp } = await device(844, 390));
  await page.setViewportSize({ width: 1, height: 1 });
  await page.goto(BASE + '?test=1&seed=3', { waitUntil: 'load' }); await sleep(600);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { Object.defineProperty(window, 'onresize', { value: null }); });
  await sleep(1200);
  s = await S(page); ok('先 1×1 启动、之后变大：自动重排到 844×390', s.ui.display.W === 844 && s.ui.display.H === 390, s.ui.display);
  await ctx.close();

  fs.writeFileSync(out('mobile.json'), JSON.stringify({ date: new Date().toISOString(), pass: results.filter(r => r.pass).length, total: results.length, results, errors: errs }, null, 1));
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();
