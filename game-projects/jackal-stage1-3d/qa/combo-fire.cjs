// 联合开火回归：真实键盘/CDP 多指触控，精确弹道与冷却检查使用显式手动时钟。
// JK_BASE 支持网站或 Toy 外壳；JK_OUT 独立保存结果和截图。
const fs = require('node:fs');
const path = require('node:path');
const { BASE, results, check, snap, launch } = require('./lib');
const out = process.env.JK_OUT || path.join(__dirname, 'out/combo-fire');
fs.mkdirSync(out, { recursive: true });
let browser;

(async () => {
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let game = page;
  const load = async () => {
    const url = new URL(BASE); url.searchParams.set('test', '1'); url.searchParams.set('seed', '7'); url.searchParams.set('q', 'low');
    await page.goto(url.href);
    if (!await page.evaluate(() => !!window.__JK_TEST__)) {
      await page.waitForSelector('iframe');
      game = page.frames().find(f => f.parentFrame());
      const inner = new URL(game.url()); inner.searchParams.set('test', '1'); inner.searchParams.set('seed', '7'); inner.searchParams.set('q', 'low');
      await game.goto(inner.href);
    } else game = page;
    await game.waitForFunction(() => !!window.__JK_TEST__);
  };
  const step = n => game.evaluate(n => __JK_TEST__.step(n), n);
  const cheat = (name, ...args) => game.evaluate(([name, args]) => __JK_TEST__.cheat[name](...args), [name, args]);
  const bombs = () => game.evaluate(() => __JK_TEST__.events().filter(e => e.name === 'bomb').length);
  const down = k => page.keyboard.down(k);
  const up = k => page.keyboard.up(k);
  const clear = async () => { await game.evaluate(() => __JK_TEST__.clearInput()); await step(65); };
  const start = async () => { await game.locator('#menu [data-act=start]').click(); await game.evaluate(() => __JK_TEST__.manual(true)); await step(110); await cheat('invuln', 999); };
  await load();
  check('全新设置默认原作朝上', /原作朝上/.test(await game.locator('#menu [data-opt=gun]').innerText()));
  await start();
  check('开局实际采用固定向北', (await snap(game)).settings.gun === 'up');
  const tapBefore = await snap(game), tapBombs = await bombs();
  await down('KeyU'); await up('KeyU'); await step(1);
  check('快速点按 U 仍同时触发两种武器', (await snap(game)).mgShots === tapBefore.mgShots + 1 && await bombs() === tapBombs + 1);
  for (const weapon of [1, 2, 3, 4]) {
    await clear(); await cheat('weapon', weapon); await cheat('teleport', -8, 22); await cheat('face', 2);
    const before = await snap(game), n = await bombs();
    await down('KeyU'); await step(1); const first = await snap(game);
    check(`U 同帧发射机枪与 Lv${weapon} 爆炸武器`, first.mgShots > before.mgShots && await bombs() === n + 1 && first.bombs.includes(weapon === 1 ? 'grenade' : weapon === 2 ? 'rocket' : 'rocket3'));
    check(`Lv${weapon} 联合开火机枪保持向北`, first.pbVel && Math.abs(first.pbVel[0]) < .01 && first.pbVel[1] > 20);
    await step(59); const held = await snap(game);
    check(`Lv${weapon} 按住联合键沿用独立冷却`, held.mgShots - before.mgShots >= 8 && held.mgShots - before.mgShots <= 10 && await bombs() - n >= 2 && await bombs() - n <= (weapon === 1 ? 3 : 5), { mg: held.mgShots - before.mgShots, bomb: await bombs() - n });
    await up('KeyU'); await step(1); const released = await snap(game), nr = await bombs(); await step(65); const stopped = await snap(game);
    check(`Lv${weapon} 松开 U 后两种武器停止`, stopped.mgShots === released.mgShots && await bombs() === nr && !stopped.input.keyCombo);
  }
  // 重叠输入：松掉组合键不会释放仍按住的单独键，反向同样成立。
  await clear(); await cheat('weapon', 1); await down('KeyU'); await down('KeyJ'); await step(1); await up('KeyU');
  let before = await snap(game), n = await bombs(); await step(65); let after = await snap(game);
  check('U 松开后仍按住 J：只继续机枪', after.mgShots > before.mgShots && await bombs() === n); await up('KeyJ');
  await clear(); await down('KeyU'); await down('KeyK'); await step(1); await up('KeyU'); before = await snap(game); n = await bombs(); await step(65); after = await snap(game);
  check('U 松开后仍按住 K：只继续手雷', after.mgShots === before.mgShots && await bombs() > n); await up('KeyK');
  await clear(); await down('KeyU'); await down('KeyJ'); await down('KeyK'); await up('KeyJ'); await up('KeyK'); before = await snap(game); n = await bombs(); await step(60); after = await snap(game);
  check('J/K 松开后仍按住 U：两种武器继续', after.mgShots > before.mgShots && await bombs() > n); await up('KeyU');
  await clear(); await down('KeyU'); await page.keyboard.press('Escape'); await step(1); after = await snap(game);
  check('暂停清除联合开火', after.ui.paused && !after.input.keyCombo); await up('KeyU');
  await game.locator('#pause [data-opt=gun]').focus(); await page.keyboard.press('ArrowRight');
  await game.locator('#pause [data-act=resume]').click(); await cheat('face', 2); await clear(); await down('KeyU'); await step(1); after = await snap(game);
  check('暂停内切换跟随车头立即生效且本局保留', after.settings.gun === 'follow' && after.pbVel && after.pbVel[0] > 20 && Math.abs(after.pbVel[1]) < .01); await up('KeyU');
  await clear(); await game.evaluate(() => window.dispatchEvent(new Event('blur'))); await game.locator('#pause [data-act=resume]').click();
  check('失焦后恢复无残留联合输入', !(await snap(game)).input.keyCombo);
  await load();
  check('手动选择跟随车头刷新后保留', /跟随车头/.test(await game.locator('#menu [data-opt=gun]').innerText()));
  await game.locator('#menu [data-opt=gun]').click(); await load();
  check('手动切回原作朝上刷新后保留', /原作朝上/.test(await game.locator('#menu [data-opt=gun]').innerText()));
  await start();
  const cameraIds = ['oblique', 'top', 'low', 'wide', 'front', 'fp'];
  for (const id of cameraIds) {
    while ((await snap(game)).ui.camera !== id) { await page.keyboard.press('KeyC'); await step(1); }
    await cheat('face', 2);
    await down('KeyE'); await step(80); await up('KeyE');
    check(`${id} 转镜头后原作朝上仍固定向北`, Math.abs((await snap(game)).cam.gunAngle) < .0001);
  }
  await page.keyboard.press('KeyC'); await step(1); await clear();
  await page.keyboard.press('Escape'); await step(1); await game.locator('#pause [data-control-mode=show]').click(); await game.locator('#pause [data-act=resume]').click();
  const cdp = await context.newCDPSession(page);
  let points = [];
  const send = async type => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const center = async selector => { const b = await game.locator(selector).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await game.waitForTimeout(100); await clear(); await cheat('teleport', -8, 22); await cheat('face', 0);
    const geometry = await game.evaluate(() => ['btn-fire','btn-bomb','btn-combo'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height, left: e.offsetLeft, top: e.offsetTop, width: e.offsetWidth, height: e.offsetHeight, bg: getComputedStyle(e).backgroundImage }; }));
    const [j,k,u] = geometry;
    check(`${viewport.width}×${viewport.height} U 在 J 正上方且三键等大`, u.left === j.left && u.top < j.top && j.top === k.top && j.width === k.width && k.width === u.width && geometry.every(r => r.w >= 44 && r.h >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.w <= viewport.width + 1 && r.y + r.h <= viewport.height + 1), geometry);
    const uc = await center('#btn-combo'), jc = await center('#joy-base');
    points = [{ id: 1, ...jc }]; await send('touchStart');
    const rotated = (await snap(game)).ui.display.rotated;
    points[0] = { id: 1, x: jc.x + (rotated ? 38 : 0), y: jc.y + (rotated ? 0 : -38) }; await send('touchMove');
    points.push({ id: 2, ...uc }); await send('touchStart');
    before = await snap(game); n = await bombs(); await step(45); after = await snap(game);
    check(`${viewport.width}×${viewport.height} 摇杆移动+U 多指同时开火`, after.player.y > before.player.y + 2 && after.mgShots > before.mgShots && await bombs() > n && after.input.touchCombo && Math.abs(after.cam.yaw - before.cam.yaw) < .001);
    await game.locator('#screen').screenshot({ path: path.join(out, `canvas-${viewport.width}.png`) });
    points = []; await send('touchEnd'); await step(1); before = await snap(game); n = await bombs(); await step(65); after = await snap(game);
    check(`${viewport.width}×${viewport.height} 多指抬起后停止移动和两种开火`, after.player.x === before.player.x && after.player.y === before.player.y && after.mgShots === before.mgShots && await bombs() === n && !after.input.touchCombo);
    await page.screenshot({ path: path.join(out, `layout-${viewport.width}.png`) });
  }
  // 清理触控时也移除按下外观，旋转、模式、失焦路径均使用同一清理函数。
  const uc = await center('#btn-combo'); points = [{ id: 3, ...uc }]; await send('touchStart'); await step(1); points = []; await send('touchCancel'); await step(1);
  check('触控取消清除联合输入及按下外观', !(await snap(game)).input.touchCombo && !await game.locator('#btn-combo').evaluate(e => e.classList.contains('down')));
  points = [{ id: 4, ...uc }]; await send('touchStart'); await step(1);
  await page.keyboard.press('Escape'); await step(1); const paused = await snap(game);
  check('按住触屏 U 后暂停释放输入', paused.ui.paused && !paused.input.touchCombo);
  await game.locator('#pause [data-control-mode=hide]').click(); await game.locator('#pause [data-act=resume]').click();
  const switched = await snap(game);
  check('手机切电脑保留本局且无残留开火', switched.t === paused.t && switched.weapon === paused.weapon && !switched.input.touchCombo && switched.ui.touchHidden);
  points = []; await send('touchEnd');
  check('游戏无脚本异常', errors.length === 0, errors);
  const report = { base: BASE, version: await game.evaluate(() => __JK_TEST__.version), method: 'Edge keyboard + CDP touch emulation; explicit manual clock for combat timing; no physical phone', results };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (results.some(r => !r.ok)) process.exitCode = 1;
})().catch(async e => { console.error(e); if (browser) await browser.close(); process.exitCode = 1; });
